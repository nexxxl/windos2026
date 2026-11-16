#!/bin/sh
# 把可选包安装到运行时能取到的位置。
# 用法：./scripts/install-extras.sh          安装画板（artcraftport）、CJK 字体与全部语言包
#       ./scripts/install-extras.sh artcraftport
#       ./scripts/install-extras.sh fonts
#       ./scripts/install-extras.sh all
set -eu
cd "$(dirname "$0")/.."

what="${1:-all}"
mkdir -p src/webos/extras

case "$what" in
  all|artcraftport)
    cp -R src/extras/artcraftport src/webos/extras/
    cp src/extras/artcraftport.css src/webos/extras/
    echo "artcraftport: $(find src/webos/extras/artcraftport -type f | wc -l | tr -d ' ') 文件"
    ;;
esac

case "$what" in
  all|fonts)
    # 公开仓不含 CJK 字体包（许可与体积原因），缺目录时给一句明确的处置，而不是 cp 报错。
    if [ ! -d src/extras/fonts-cjk ]; then
      echo "src/extras/fonts-cjk 不在这个副本里：公开仓不携带 CJK 字体包。拿到字体包后解压到 src/extras/fonts-cjk，再重跑本命令。" >&2
      exit 1
    fi
    # 办公应用的 @font-face 指向 src/webos/a/office/fonts/，字体包要落到同一个目录。
    cp src/extras/fonts-cjk/*.woff src/webos/a/office/fonts/
    cp src/extras/fonts-cjk/*.woff2 src/webos/a/office/fonts/
    cp src/extras/fonts-cjk/OFL.txt src/webos/a/office/fonts/OFL-cjk.txt
    # 霞鹜新致宋是 IPA 1.0，不是 OFL；两份许可文本都要跟着字体走。
    cp src/extras/fonts-cjk/IPA-Font-License-1.0.md src/webos/a/office/fonts/
    echo "fonts-cjk: $(ls src/extras/fonts-cjk/*.woff src/extras/fonts-cjk/*.woff2 | wc -l | tr -d ' ') 字体"
    ;;
esac

case "$what" in
  all|langs)
    for file in src/extras/langs/lang-*.js; do
      code=$(basename "$file" .js); code=${code#lang-}
      cp "$file" src/webos/a/locales/
      echo "lang: $code"
    done
    # 重写清单：只登记确实存在的语言包。
    {
      echo "// 已安装的扩展语言包清单（8 种内置语言不在此列）。"
      echo "// 由 scripts/install-extras.sh 生成；删包后重跑即可收敛。"
      printf 'export const INSTALLED_PACKS = ['
      first=1
      for file in src/webos/a/locales/lang-*.js; do
        [ -e "$file" ] || continue
        code=$(basename "$file" .js); code=${code#lang-}
        [ $first -eq 1 ] || printf ', '
        printf "'%s'" "$code"
        first=0
      done
      echo "];"
    } > src/webos/a/locales/installed-packs.js
    ;;
esac

echo "完成。重启宿主或刷新页面后生效。"
