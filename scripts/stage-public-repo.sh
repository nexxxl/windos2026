#!/usr/bin/env bash
# Copy a flat, plugin-only public-source candidate. Never publish or overwrite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE=stage
if [[ "${1:-}" == --check ]]; then MODE=check; shift; fi
if [[ "${1:-}" == --check-repo ]]; then MODE=check-repo; shift; fi
if [[ $# != 1 ]]; then
  echo 'Usage: scripts/stage-public-repo.sh [--check|--check-repo] /absolute/path/to/public-candidate' >&2
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
for name in ('universal','plugin','applications','tools','docs/project-history','docs/import-manifest.json','docs/baseline-manifest.json','extras/fonts-cjk'):
    if (root/name).exists(): errors.append('Excluded source boundary: '+name)
for name in ('LICENSE','docs/legal/NOTICE','docs/legal/TRADEMARK.md','docs/legal/LICENSING.md','docs/LICENSE-BINARY.md','docs/legal/DISCLAIMER.md','docs/legal/THIRD_PARTY_NOTICES.md','docs/assets/icon.svg','docs/i18n/README.zh-CN.md','.github/SECURITY.md','.github/CONTRIBUTING.md','package.json','package-lock.json','index.js','client.js','src/cordis.patch.yml','webos/index.html','webos/a/os.js','vendor/readability.js','vendor/nexl-l1.js','lib/capabilities.js'):
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
    if re.search(r'-----BEGIN (?:[A-Z0-9.]+ )*PRIVATE KEY(?: BLOCK)?-----',value): errors.append('Private key: '+rel)
# 八份 README 必须互链，防止某一语言漏掉语言栏。
# 根 README 留在根目录，七份译本下沉到 docs/i18n/；路径不同，按文件名检查。
readmes=[root/'README.md']+sorted((root/'docs'/'i18n').glob('README*.md'))
for r in readmes:
    text=r.read_text(encoding='utf-8')
    missing=[p.name for p in readmes if p.name!=r.name and p.name not in text]
    if missing: errors.append('README language link missing in '+r.name+': '+','.join(missing))
if errors:
    print('\n'.join(errors),file=sys.stderr)
    sys.exit(1)
print('Plugin-only public source boundary passed')
PY
}
if [[ "$MODE" == check-repo ]]; then
  # 校验「仓库本身」，不是白名单生成的影子树：只有这里能发现
  # applications/ 或 tools/ 被直接提交进公开仓。
  python3 - "$OUT" <<'PY'
from pathlib import Path
import re,subprocess,sys
root=Path(sys.argv[1]).resolve()
excluded=['applications','tools','universal','plugin','extras/fonts-cjk',
          'docs/project-history','docs/baseline-manifest.json','docs/import-manifest.json',
          'docs/validation.md','docs/windows-validation.md','docs/split-validation.md',
          'docs/directory-split.md','docs/edition-layout.json','docs/naming-migration.md']
try:
    raw=subprocess.run(['git','-C',str(root),'ls-files','-z'],capture_output=True,check=True).stdout
    tracked=[p for p in raw.decode('utf-8').split('\0') if p]
    source='git ls-files'
except (subprocess.CalledProcessError,FileNotFoundError):
    tracked=[p.relative_to(root).as_posix() for p in root.rglob('*')
             if p.is_file() and '.git' not in p.parts]
    source='filesystem walk (not a git checkout)'
errors=[]
for rel in tracked:
    for name in excluded:
        if rel==name or rel.startswith(name+'/'):
            errors.append('Repository contains excluded path: '+rel)
    base=rel.rsplit('/',1)[-1]
    if base in {'.env','.DS_Store'} or rel.endswith(('.pem','.key','.tgz','.log','.pid','.pyc')):
        errors.append('Repository tracks a private or generated file: '+rel)
for rel in tracked:
    p=root/rel
    if not p.is_file(): continue
    raw=p.read_bytes()
    if b'\x00' in raw: continue
    try: text=raw.decode('utf-8')
    except UnicodeDecodeError: continue
    if re.search(r'-----BEGIN (?:[A-Z0-9.]+ )*PRIVATE KEY(?: BLOCK)?-----',text):
        errors.append('Private key material: '+rel)
if errors:
    print('\n'.join(errors),file=sys.stderr)
    sys.exit(1)
print('Repository boundary passed: %d tracked files via %s' % (len(tracked),source))
PY
  exit
fi
if [[ "$MODE" == check ]]; then check_tree "$OUT"; exit; fi
case "$OUT/" in "$ROOT/"*) echo 'Output must be outside this source directory' >&2; exit 1 ;; esac
[[ ! -e "$OUT" && ! -L "$OUT" ]] || { echo "Output already exists; refusing to overwrite: $OUT" >&2; exit 1; }

python3 - "$ROOT" "$OUT" <<'PY'
from pathlib import Path
import shutil,sys
src=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=False)

def stage():
  files={'package.json','package-lock.json','README.md','LICENSE','.gitignore','.editorconfig','.gitattributes','.prettierignore','pyproject.toml','Makefile'}
  files.update(p.name for p in src.glob('*.js'))
  files.update(p.name for p in src.glob('*.css'))
  for name in sorted(files):
    if not (src/name).is_file(): raise RuntimeError('Missing staging input: '+name)
    shutil.copy2(src/name,out/name)
  # fonts-cjk 不进公开候选：其中 LXGW 是 IPA 衍生字体（name 表要求接受 IPA 许可），
  # 目录里的许可文本也曾把它写成 OFL。字体本身仍在工作树里，只是不进包。
  ignore=shutil.ignore_patterns('node_modules','dist','.cache','coverage','test-results','__pycache__','.DS_Store','*.pyc','*.log','*.pid','*.tgz','fonts-cjk')
  for name in ('webos','vendor','extension','locale','test','scripts','extras','lib','host','bin','src','.github'):
    shutil.copytree(src/name,out/name,ignore=ignore)
  (out/'docs').mkdir()
  for p in (src/'docs').iterdir():
    # 内部验证日志、目录拆分与改名记录都属于「内部历史」，不进公开候选。
    if p.name in {'project-history','baseline-manifest.json','import-manifest.json',
                  'validation.md','windows-validation.md','split-validation.md',
                  'directory-split.md','edition-layout.json','naming-migration.md'}: continue
    # 隐藏文件不经过 ignore_patterns，必须在这里挡住（.DS_Store 会让 --check 直接失败）。
    if p.name.startswith('.'): continue
    if p.is_dir(): shutil.copytree(p,out/'docs'/p.name,ignore=ignore)
    else: shutil.copy2(p,out/'docs'/p.name)
  # 公开 README 以源目录的 README.public*.md 为唯一来源：
  # README.public.md -> README.md；README.public.zh-CN.md -> README.zh-CN.md。
  for p in sorted(src.glob('README.public*.md')):
    suffix = p.name[len('README.public'):]
    shutil.copy2(p, out/('README' + suffix))

try:
  stage()
except BaseException:
  # 半成品目录会让下一次 --check 误判；失败就整棵删掉。
  shutil.rmtree(out,ignore_errors=True)
  raise
PY
check_tree "$OUT"
echo "Created local plugin-only candidate: $OUT"
echo 'No remote repository, upload, host installation or publication was performed.'
