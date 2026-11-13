#!/usr/bin/env bash
# Copy a flat, plugin-only public-source candidate. Never publish or overwrite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE=stage
if [[ "${1:-}" == --check ]]; then MODE=check; shift; fi
if [[ $# != 1 ]]; then
  echo 'Usage: scripts/stage-public-repo.sh [--check] /absolute/path/to/public-candidate' >&2
  exit 2
fi
OUT="$(python3 -c 'from pathlib import Path; import sys; print(Path(sys.argv[1]).expanduser().resolve())' "$1")"

check_tree() {
  python3 - "$1" <<'PY'
from pathlib import Path
import re,sys
root=Path(sys.argv[1])
errors=[]
if not root.is_dir():
    print('Missing candidate directory',file=sys.stderr)
    sys.exit(1)
for name in ('universal','plugin','applications','tools','docs/project-history','docs/import-manifest.json','docs/baseline-manifest.json'):
    if (root/name).exists(): errors.append('Excluded source boundary: '+name)
for name in ('LICENSE','NOTICE','TRADEMARK.md','EULA.md','DISCLAIMER.md','SECURITY.md','CONTRIBUTING.md','package.json','package-lock.json','index.js','client.js','cordis.patch.yml','webos/index.html','webos/a/os.js','vendor/readability.js','vendor/nexl-l1.js'):
    if not (root/name).is_file(): errors.append('Missing runtime or notice: '+name)
for p in root.rglob('*'):
    rel=p.relative_to(root).as_posix()
    if p.is_symlink(): errors.append('Unreviewed symlink: '+rel)
    if p.is_dir() and p.name in {'node_modules','dist','coverage','test-results','__pycache__','.cache'}:
        errors.append('Generated/dependency directory: '+rel)
    if not p.is_file(): continue
    if p.name in {'.DS_Store','.env'} or p.suffix in {'.pem','.key','.log','.pid','.tgz','.pyc'}:
        errors.append('Private or generated file: '+rel)
    if p.name=='classic-bliss-source.json': errors.append('Historical asset: '+rel)
    raw=p.read_bytes()
    if b'\x00' in raw: continue
    try: value=raw.decode('utf-8')
    except UnicodeDecodeError: continue
    if re.search('/'+'Users/'+r'[A-Za-z0-9._-]+/',value): errors.append('Developer-specific path: '+rel)
    if re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',value): errors.append('Private key: '+rel)
if errors:
    print('\n'.join(errors),file=sys.stderr)
    sys.exit(1)
print('Plugin-only public source boundary passed')
PY
}
if [[ "$MODE" == check ]]; then check_tree "$OUT"; exit; fi
case "$OUT/" in "$ROOT/"*) echo 'Output must be outside this source directory' >&2; exit 1 ;; esac
[[ ! -e "$OUT" && ! -L "$OUT" ]] || { echo "Output already exists; refusing to overwrite: $OUT" >&2; exit 1; }

python3 - "$ROOT" "$OUT" <<'PY'
from pathlib import Path
import shutil,sys
src=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=False)
files={'package.json','package-lock.json','cordis.patch.yml','icon.svg','README.md','README.en.md','THIRD_PARTY_NOTICES.md','LICENSE','NOTICE','TRADEMARK.md','EULA.md','DISCLAIMER.md','SECURITY.md','CONTRIBUTING.md','CODE_OF_CONDUCT.md','DCO','.gitignore','.editorconfig','.gitattributes','.prettierrc.json','.prettierignore','pyproject.toml','Makefile'}
files.update(p.name for p in src.glob('*.js'))
files.update(p.name for p in src.glob('*.css'))
for name in sorted(files):
    if not (src/name).is_file(): raise RuntimeError('Missing staging input: '+name)
    shutil.copy2(src/name,out/name)
ignore=shutil.ignore_patterns('node_modules','dist','.cache','coverage','test-results','__pycache__','.DS_Store','*.pyc','*.log','*.pid','*.tgz')
for name in ('webos','vendor','extension','locale','test','scripts','.github'):
    shutil.copytree(src/name,out/name,ignore=ignore)
(out/'docs').mkdir()
for p in (src/'docs').iterdir():
    if p.name in {'project-history','baseline-manifest.json','import-manifest.json'}: continue
    # 隐藏文件不经过 ignore_patterns，必须在这里挡住（.DS_Store 会让 --check 直接失败）。
    if p.name.startswith('.'): continue
    if p.is_dir(): shutil.copytree(p,out/'docs'/p.name,ignore=ignore)
    else: shutil.copy2(p,out/'docs'/p.name)
(out/'README.md').write_text('''# NexlOS 插件版公开源码候选

独立的 DSH 插件源码：Node Host、Client、WebOS、办公界面、浏览器桥和测试均位于本目录。生成这个候选目录不等于执行公开发布。

```sh
npm ci
npm run check
npm test
npm pack --pack-destination /absolute/path/to/artifacts
python3 scripts/check-source.py
bash scripts/stage-public-repo.sh --check .
```

使用 DSH 插件管理器将本目录作为 bundle 安装；包名 `@nexlos/os`，配置 `cordis.patch.yml`。宿主服务、模型、PTY 和 Chromium 由部署环境提供。

本候选目录不包含通用版源码、配套应用、制作工具或内部历史审计。插件源代码与既有公开文档按 [Apache-2.0](LICENSE) 提供；第三方素材按自身许可，商标权不包含在 Apache-2.0 中。见 [NOTICE](NOTICE)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [TRADEMARK.md](TRADEMARK.md)。

功能与平台边界见 [验证记录](docs/validation.md)、[Windows 验证](docs/windows-validation.md)、[拆分验证](docs/split-validation.md) 和 [命名迁移](docs/naming-migration.md)。插件的部分伴侣和高级办公能力仍未实现，不能从源码打包成功推导为功能可用。
''')
(out/'README.en.md').write_text('''# NexlOS Plugin Public-Source Candidate

A flat standalone DSH plugin tree. Run `npm ci`, `npm run check` and `npm test` here. Install this directory as a DSH bundle; package `@nexlos/os`, configuration `cordis.patch.yml`.

The candidate excludes universal source, companion applications/tools and internal history. Candidate generation does not publish anything. Plugin source and existing public documentation retain Apache-2.0; third-party assets retain their own licenses and trademark rights are not granted. See LICENSE, NOTICE, THIRD_PARTY_NOTICES.md and TRADEMARK.md.

See README.md and docs/validation.md for scope and known limitations.
''')
PY
check_tree "$OUT"
echo "Created local plugin-only candidate: $OUT"
echo 'No remote repository, upload, host installation or publication was performed.'
