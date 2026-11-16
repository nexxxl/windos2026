#!/usr/bin/env bash
# 仓库加固：把审计里反复出现的 GitHub 设置固化成一条可重跑的命令。
#
#   bash scripts/harden-repo.sh            # 只打印计划，不发任何请求
#   bash scripts/harden-repo.sh --apply    # 真正写入（需要 gh auth login）
#   bash scripts/harden-repo.sh --verify   # 只读核对现状，逐项 PASS/FAIL，不改任何设置
#
# 默认 dry-run：这些是共享设置，改动前先让维护者看一眼。
set -euo pipefail

REPO="${NEXLOS_REPO:-nexxxl/windos2026}"
APPLY=0
VERIFY=0
FORCE_PROTECTION=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --verify) VERIFY=1 ;;
    --force-protection) FORCE_PROTECTION=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done
if [[ $APPLY -eq 1 && $VERIFY -eq 1 ]]; then
  echo "--apply 与 --verify 不能同时使用：一个改设置，一个只读取证。" >&2
  exit 2
fi

say() { printf '%s\n' "$*"; }

step() {
  local desc="$1"; shift
  if [[ $APPLY -eq 0 ]]; then
    say "plan  $desc"
    return 0
  fi
  if "$@" >/tmp/harden-repo.out 2>&1; then
    say "ok    $desc"
  else
    say "fail  $desc :: $(head -3 /tmp/harden-repo.out | tr '\n' ' ')"
  fi
}

say "repo: $REPO  mode: $([[ $APPLY -eq 1 ]] && echo apply || { [[ $VERIFY -eq 1 ]] && echo verify || echo dry-run; })"
say ""

# 0. 只读核对：把上面每一项设置读回来，逐项给结论。
#    加固是一次性动作，回归是长期问题：设置被人手改回去时，这里必须能看出来。
if [[ $VERIFY -eq 1 ]]; then
  # 未登录时每项都会读空，读空不等于不合格；直接说清楚，避免误判成 FAIL。
  if ! gh auth status >/dev/null 2>&1; then
    say "verify 需要先 gh auth login（否则所有设置都读不到，结论无意义）。"
    exit 2
  fi
  FAILS=0
  check() {
    local label="$1" want="$2" got="$3"
    if [[ "$got" == "$want" ]]; then
      say "ok    $label"
    else
      say "FAIL  $label :: got=${got:-<empty>} want=$want"
      FAILS=$((FAILS + 1))
    fi
  }
  api() { gh api "$@" 2>/dev/null || true; }

  check "secret scanning" enabled \
    "$(api "repos/$REPO" --jq '.security_and_analysis.secret_scanning.status // "missing"' | tr -d '\n')"
  check "secret scanning push protection" enabled \
    "$(api "repos/$REPO" --jq '.security_and_analysis.secret_scanning_push_protection.status // "missing"' | tr -d '\n')"
  # vulnerability-alerts 是 204/404 语义，没有 JSON 可读。
  if gh api "repos/$REPO/vulnerability-alerts" >/dev/null 2>&1; then
    check "Dependabot alerts" enabled enabled
  else
    check "Dependabot alerts" enabled disabled
  fi
  check "Dependabot security updates" true \
    "$(api "repos/$REPO/automated-security-fixes" --jq '.enabled // false' | tr -d '\n')"
  check "private vulnerability reporting" true \
    "$(api "repos/$REPO/private-vulnerability-reporting" --jq '.enabled // false' | tr -d '\n')"
  check "Actions default token" read \
    "$(api "repos/$REPO/actions/permissions/workflow" --jq '.default_workflow_permissions // "missing"' | tr -d '\n')"
  check "Actions PR approval" false \
    "$(api "repos/$REPO/actions/permissions/workflow" --jq '.can_approve_pull_request_reviews // "missing"' | tr -d '\n')"
  check "web commits require sign-off" true \
    "$(api "repos/$REPO" --jq '.web_commit_signoff_required // false' | tr -d '\n')"

  # 新旧 API 对这两个字段返回布尔或对象，两种形态都要认。
  FORCE_PUSH="$(api "repos/$REPO/branches/main/protection" \
    --jq 'if (.allow_force_pushes|type)=="object" then .allow_force_pushes.enabled else .allow_force_pushes end' | tr -d '\n')"
  DELETE_BRANCH="$(api "repos/$REPO/branches/main/protection" \
    --jq 'if (.allow_deletions|type)=="object" then .allow_deletions.enabled else .allow_deletions end' | tr -d '\n')"
  check "main: force-push rejected" false "${FORCE_PUSH:-missing}"
  check "main: deletion rejected" false "${DELETE_BRANCH:-missing}"

  if api "repos/$REPO/rulesets" --jq '.[].name' | grep -qx "protect release tags"; then
    RUNNER_TAGS="$(api "repos/$REPO/rulesets" \
      --jq '[.[] | select(.name=="protect release tags") | .conditions.ref_name.include[]] | sort | join(",")' | tr -d '\n')"
    check "tag ruleset covers release tags" "refs/tags/plugin-v*,refs/tags/update-feed,refs/tags/v*" "$RUNNER_TAGS"
  else
    check "tag ruleset exists" present missing
  fi

  say ""
  if [[ $FAILS -eq 0 ]]; then
    say "全部通过。"
    exit 0
  fi
  say "$FAILS 项未达标。修正：bash scripts/harden-repo.sh --apply"
  exit 1
fi

# 1. 密钥与依赖漏洞：GitHub 侧的扫描在推送前就能挡住泄漏。
step "secret scanning + push protection" \
  gh api -X PATCH "repos/$REPO" \
    -f 'security_and_analysis[secret_scanning][status]=enabled' \
    -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
step "Dependabot alerts" \
  gh api -X PUT "repos/$REPO/vulnerability-alerts"
step "Dependabot security updates" \
  gh api -X PUT "repos/$REPO/automated-security-fixes"
step "private vulnerability reporting" \
  gh api -X PUT "repos/$REPO/private-vulnerability-reporting"

# 2. 工作流默认令牌只读：写权限必须由具体 job 显式申请。
step "Actions default token read-only" \
  gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
    -f default_workflow_permissions=read \
    -F can_approve_pull_request_reviews=false

# 2b. 网页端提交也要求 sign-off：仓库用 DCO，绕过网页提交等于留一个不用签的口子。
step "require sign-off on web commits" \
  gh api -X PATCH "repos/$REPO" -F web_commit_signoff_required=true

# 3. main 只禁止破坏性操作，不强制审批：单人维护的仓库不该被自己锁住。
#    PUT 是整体替换，所以已有保护先读出来给人看，确认后才覆盖。
if [[ $APPLY -eq 1 ]] && gh api "repos/$REPO/branches/main/protection" >/tmp/harden-protection.json 2>/dev/null; then
  if [[ $FORCE_PROTECTION -eq 0 ]]; then
    say "skip  main protection already exists; current required checks/reviews:"
    python3 -c 'import json,sys; d=json.load(open("/tmp/harden-protection.json")); print("      checks:", (d.get("required_status_checks") or {}).get("contexts")); print("      reviews:", d.get("required_pull_request_reviews"))' 2>/dev/null || say "      (unreadable)"
    say "      re-run with --force-protection to replace it with the minimal rule below"
  else
    step "main: replace protection with minimal force-push/deletion rule" \
      gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
  fi
else
  step "main: reject force-push and deletion" \
    gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
fi

# 4. 发布标签不允许移动或删除：update-feed 被改写等于换掉签名入口。
TAG_RULESET='{
  "name": "protect release tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/tags/v*", "refs/tags/plugin-v*", "refs/tags/update-feed"],
      "exclude": []
    }
  },
  "rules": [{ "type": "deletion" }, { "type": "non_fast_forward" }]
}'

if [[ $APPLY -eq 1 ]] && gh api "repos/$REPO/rulesets" --jq '.[].name' 2>/dev/null | grep -qx "protect release tags"; then
  say "skip  tag ruleset already exists"
else
  step "protect v*, plugin-v*, update-feed tags" \
    gh api -X POST "repos/$REPO/rulesets" --input - <<<"$TAG_RULESET"
fi

say ""
if [[ $APPLY -eq 0 ]]; then
  say "没有发送任何请求。确认无误后运行：bash scripts/harden-repo.sh --apply"
fi
say ""
say "重复运行是安全的：已有的标签规则集与 branch protection 会被跳过。"
say "无法脚本化的部分："
say "  - 账号与组织的 2FA 要求"
say "  - 私有仓上的 ruleset 需要 Pro；公开后重跑本脚本即可补上标签保护"
say "  - Security 页的「Report a vulnerability」入口需要 private vulnerability reporting 已开启"
