#!/bin/sh
# 发布前体积与内容门禁：任何一项超限或缺失都会以非零退出。
set -eu
cd "$(dirname "$0")/.."

fail=0
check() {
  label="$1"; shift
  if "$@"; then printf 'PASS  %s\n' "$label"; else printf 'FAIL  %s\n' "$label"; fail=1; fi
}

tarball=$(mktemp -d)
trap 'rm -rf "$tarball"' EXIT

if ! npm pack --pack-destination "$tarball" --ignore-scripts >/dev/null 2>&1; then
  echo "FAIL  npm pack 失败"
  exit 1
fi
tgz=$(find "$tarball" -name '*.tgz' -print -quit)
if [ -z "$tgz" ]; then
  echo "FAIL  未生成 tarball"
  exit 1
fi

size=$(wc -c < "$tgz" | tr -d ' ')
limit=$((10 * 1024 * 1024))
printf '包体积 %.2f MB（上限 10 MB）\n' "$(echo "$size" | awk '{print $1/1048576}')"
check "tarball ≤ 10 MB" test "$size" -le "$limit"
check "包内不含语言覆盖层" test -z "$(find webos/a/locales -name 'lang-*.js' -print -quit)"
check "包内不含 CJK 办公字体" test -z "$(find webos/a/office/fonts \( -name 'NotoSansSC*' -o -name 'NotoSerifSC*' -o -name 'LXGW*' -o -name 'SmileySans*' \) -print -quit)"
check "画板资源在 extras" test -f extras/artcraftport/kernel.js
check "画板样式在 extras" test -f extras/artcraftport.css
check "媒体为 AAC" test -f webos/a/media/master-mix.m4a
check "壁纸存在" test -f webos/a/wallpapers/meadow.webp
check "语言清单存在" test -f webos/a/locales/installed-packs.js

[ "$fail" -eq 0 ] || exit 1
echo "全部门禁通过。"
