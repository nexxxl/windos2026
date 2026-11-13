#!/bin/sh
# 把可选包安装到 webos/extras/，让运行时按 /extras/ 路径直接取到。
# 用法：./scripts/install-extras.sh          安装画板（artcraft）与全部语言包
#       ./scripts/install-extras.sh artcraft
#       ./scripts/install-extras.sh all
set -eu
cd "$(dirname "$0")/.."

what="${1:-all}"
mkdir -p webos/extras

case "$what" in
  all|artcraft)
    cp -R extras/artcraft webos/extras/
    cp extras/artcraft.css webos/extras/
    echo "artcraft: $(find webos/extras/artcraft -type f | wc -l | tr -d ' ') 文件"
    ;;
esac

case "$what" in
  all|langs)
    for file in extras/langs/lang-*.js; do
      code=$(basename "$file" .js); code=${code#lang-}
      cp "$file" webos/a/locales/
      echo "lang: $code"
    done
    # 重写清单：只登记确实存在的语言包。
    {
      echo "// 已安装的扩展语言包清单（8 种内置语言不在此列）。"
      echo "// 由 scripts/install-extras.sh 生成；删包后重跑即可收敛。"
      printf 'export const INSTALLED_PACKS = ['
      first=1
      for file in webos/a/locales/lang-*.js; do
        [ -e "$file" ] || continue
        code=$(basename "$file" .js); code=${code#lang-}
        [ $first -eq 1 ] || printf ', '
        printf "'%s'" "$code"
        first=0
      done
      echo "];"
    } > webos/a/locales/installed-packs.js
    ;;
esac

echo "完成。重启宿主或刷新页面后生效。"
