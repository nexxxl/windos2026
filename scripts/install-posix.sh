#!/bin/sh
# 一键安装 NexlOS 插件到本机 DSH（macOS / Linux）。
# 复制插件 → 写 profile 的 link 依赖 → 建符号链接；不跑 npm install，不碰用户数据目录。
#
#   ./install-posix.sh                      # 自动检测正在运行的 dsh 档案
#   ./install-posix.sh --profile nexl       # 指定档案
#   ./install-posix.sh --uninstall          # 只摘掉依赖与链接，保留文件
set -eu

PKG='@nexlos/os'
PROFILE=''
TARGET="$HOME/nexl/plugin"
SOURCE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE=${2:?缺少档案名}; shift 2 ;;
    --target) TARGET=${2:?缺少目录}; shift 2 ;;
    --source) SOURCE=${2:?缺少目录}; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

PROFILES_ROOT="$HOME/.dsh/profiles"

if [ -z "$PROFILE" ]; then
  # 从运行中的 dsh 进程读 --profile，避免装到别的档案。
  PROFILE=$(ps -Ao args 2>/dev/null | sed -n 's/.*dsh.*--profile[= ]\([^ ]*\).*/\1/p' | sort -u | head -n 2 | tr '\n' ' ')
  PROFILE=${PROFILE% }
  case "$PROFILE" in
    '') echo "没有检测到运行中的 dsh；请用 --profile <名称> 指定。现有档案：" >&2
        ls -1 "$PROFILES_ROOT" 2>/dev/null >&2 || true; exit 1 ;;
    *' '*) echo "同时有多个 dsh 档案在运行（${PROFILE}），请用 --profile 指定。" >&2; exit 1 ;;
  esac
fi

PROFILE_DIR="$PROFILES_ROOT/$PROFILE"
PROFILE_JSON="$PROFILE_DIR/package.json"
[ -f "$PROFILE_JSON" ] || { echo "档案不存在：${PROFILE_JSON}" >&2; exit 1; }

if [ "$UNINSTALL" = 1 ]; then
  node -e '
    const fs = require("fs");
    const [file, pkg] = process.argv.slice(1);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (data.dependencies) delete data.dependencies[pkg];
    const bundles = data.dsh && data.dsh.profile && data.dsh.profile.bundles;
    if (Array.isArray(bundles)) data.dsh.profile.bundles = bundles.filter((x) => x !== pkg);
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  ' "$PROFILE_JSON" "$PKG"
  [ -L "$PROFILE_DIR/node_modules/@nexlos/os" ] && rm -f "$PROFILE_DIR/node_modules/@nexlos/os"
  echo "==> 已从 profile 移除（插件文件保留在 ${TARGET}）"
  exit 0
fi

[ -f "$SOURCE/package.json" ] || { echo "来源目录缺少 package.json：$SOURCE" >&2; exit 1; }
node -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[2],"utf8")).name === process.argv[1] ? 0 : 1)' "$PKG" "$SOURCE/package.json" \
  || { echo "来源不是 ${PKG}：${SOURCE}" >&2; exit 1; }

if [ "$(cd "$SOURCE" && pwd -P)" != "$(cd "$TARGET" 2>/dev/null && pwd -P)" ]; then
  echo "==> 复制插件文件到 ${TARGET}"
  mkdir -p "$TARGET"
  # 用 tar 管道复制，排除依赖与版本库；保持文件权限。
  (cd "$SOURCE" && tar -cf - \
      --exclude node_modules --exclude .git --exclude .github .) | (cd "$TARGET" && tar -xf -)
fi

# 写 link 依赖并补 bundles；缺任一项宿主都不会加载插件。
node -e '
  const fs = require("fs");
  const [file, pkg, target] = process.argv.slice(1);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.dependencies = data.dependencies || {};
  data.dependencies[pkg] = "link:" + target;
  if (!data.dsh || !data.dsh.profile || !Array.isArray(data.dsh.profile.bundles)) {
    console.error("profile 缺少 dsh.profile.bundles：" + file); process.exit(1);
  }
  if (!data.dsh.profile.bundles.includes(pkg)) data.dsh.profile.bundles.push(pkg);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
' "$PROFILE_JSON" "$PKG" "$TARGET"

LINK="$PROFILE_DIR/node_modules/@nexlos/os"
mkdir -p "$PROFILE_DIR/node_modules/@nexlos"
rm -rf "$LINK"
ln -s "$TARGET" "$LINK"

echo "==> 完成：${LINK} -> ${TARGET}"
echo ""
echo "下一步：重启 DSH，再打开 /nexlos/ 确认。"
echo "验证命令： curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8891/nexlos/health"
