#!/usr/bin/env bash
# 仓库加固：把审计里反复出现的 GitHub 设置固化成一条可重跑的命令。
#
#   bash scripts/harden-repo.sh          # 只打印计划，不发任何请求
#   bash scripts/harden-repo.sh --apply  # 真正写入（需要 gh auth login）
#
# 默认 dry-run：这些是共享设置，改动前先让维护者看一眼。
set -euo pipefail

REPO="${NEXLOS_REPO:-nexxxl/windos2026}"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

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

say "repo: $REPO  mode: $([[ $APPLY -eq 1 ]] && echo apply || echo dry-run)"
say ""

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

# 3. main 只禁止破坏性操作，不强制审批：单人维护的仓库不该被自己锁住。
step "main: reject force-push and deletion" \
  gh api -X PUT "repos/$REPO/branches/main/protection" \
    --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

# 4. 发布标签不允许移动或删除：update-feed 被改写等于换掉签名入口。
step "protect v*, plugin-v*, update-feed tags" \
  gh api -X POST "repos/$REPO/rulesets" --input - <<'JSON'
{
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
}
JSON

say ""
if [[ $APPLY -eq 0 ]]; then
  say "没有发送任何请求。确认无误后运行：bash scripts/harden-repo.sh --apply"
fi
say ""
say "无法脚本化的部分："
say "  - 账号与组织的 2FA 要求"
say "  - 私有仓上的 ruleset 需要 Pro；公开后重跑本脚本即可补上标签保护"
say "  - Security 页的「Report a vulnerability」入口需要 private vulnerability reporting 已开启"
