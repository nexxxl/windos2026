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
# 八份 README 必须互链，防止某一语言漏掉语言栏。
readme_langs=['README.md','README.zh-CN.md','README.zh-TW.md','README.ja.md','README.ko.md','README.es.md','README.fr.md','README.de.md']
for r in sorted(root.glob('README*.md')):
    if r.name not in readme_langs: continue
    text=r.read_text(encoding='utf-8')
    missing=[name for name in readme_langs if name!=r.name and ('('+name+')') not in text]
    if missing: errors.append('README language link missing in '+r.name+': '+','.join(missing))
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
for name in ('webos','vendor','extension','locale','test','scripts','extras','.github'):
    shutil.copytree(src/name,out/name,ignore=ignore)
(out/'docs').mkdir()
for p in (src/'docs').iterdir():
    if p.name in {'project-history','baseline-manifest.json','import-manifest.json'}: continue
    # 隐藏文件不经过 ignore_patterns，必须在这里挡住（.DS_Store 会让 --check 直接失败）。
    if p.name.startswith('.'): continue
    if p.is_dir(): shutil.copytree(p,out/'docs'/p.name,ignore=ignore)
    else: shutil.copy2(p,out/'docs'/p.name)
# 公开 README 以源目录的 README.public*.md 为唯一来源：
# README.public.md -> README.md；README.public.zh-CN.md -> README.zh-CN.md。
for p in sorted(src.glob('README.public*.md')):
    suffix = p.name[len('README.public'):]
    shutil.copy2(p, out/('README' + suffix))
# 内部的英文工程说明不进入公开候选。
if (out/'README.en.md').exists():
    (out/'README.en.md').unlink()
PY
check_tree "$OUT"
echo "Created local plugin-only candidate: $OUT"
echo 'No remote repository, upload, host installation or publication was performed.'
