#!/usr/bin/env python3
"""Check the source-only handoff; optionally record current file hashes."""
from pathlib import Path
import argparse
from datetime import date
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
OLD = re.compile(''.join(('nn', 'os')), re.IGNORECASE)
EXEMPT_TEXT = {'docs/import-manifest.json', 'docs/naming-migration.md'}
IGNORED = {'.git'}
FORBIDDEN_DIRS = {'node_modules', '__pycache__', '.cache', 'dist'}
# npm 装的依赖树不属于可审源码，也不该让「装了依赖」和「门禁通过」互斥。
# 只放行能证明由 npm 管的树：树外有 package-lock.json、树内有 npm 自己写的 .package-lock.json。
_lock_cache: dict = {}
_unmanaged_reported: set = set()


def managed_tree(root: Path) -> bool:
    key = str(root)
    if key not in _lock_cache:
        _lock_cache[key] = (root.parent / 'package-lock.json').is_file() and (root / '.package-lock.json').is_file()
    return _lock_cache[key]


def dependency_root(rel) -> Path:
    """取最外层 node_modules：嵌套依赖由外层这棵统一管理。"""
    depth = rel.parts.index('node_modules')
    return ROOT.joinpath(*rel.parts[: depth + 1])


def read_bytes(name: str, path: Path):
    """扫描期间被删/不可读时返回 None，由调用方记成错误（不要抛 traceback）。"""
    try:
        return path.read_bytes()
    except OSError:
        return None
SOURCE_EXT = {'.go', '.js', '.mjs', '.c', '.h', '.m', '.css', '.html', '.json', '.yml', '.yaml', '.sh', '.ps1', '.bat', '.command', '.plist', '.py'}

def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--write-manifest', action='store_true')
    mode.add_argument('--verify-manifest', action='store_true')
    args = parser.parse_args()
    errors, records = [], []
    for p in sorted(ROOT.rglob('*')):
        rel = p.relative_to(ROOT)
        if any(x in IGNORED for x in rel.parts):
            continue
        if 'node_modules' in rel.parts:
            root = dependency_root(rel)
            if managed_tree(root):
                continue
            if str(root) not in _unmanaged_reported:
                _unmanaged_reported.add(str(root))
                errors.append(f'{root.relative_to(ROOT).as_posix()}: 旁没有 package-lock.json 或树内缺 .package-lock.json（非 npm 管理的依赖树）')
            continue
        name = rel.as_posix()
        if p.is_symlink():
            errors.append(f'{name}: unreviewed symlink')
            continue
        if p.is_dir():
            if p.name in FORBIDDEN_DIRS:
                errors.append(f'{name}: generated/dependency directory in source handoff')
            continue
        if p.name == '.DS_Store' or p.suffix in {'.pyc', '.log', '.pid', '.tgz', '.bak'} or p.name.startswith('.env') and p.name != '.env.example':
            errors.append(f'{name}: runtime/cache/private configuration file')
        if OLD.search(name):
            errors.append(f'{name}: legacy file name')
        raw = read_bytes(name, p)
        if raw is None:
            errors.append(f'{name}: 扫描期间消失或不可读（树在被人写；等静止后重跑）')
            continue
        if name not in EXEMPT_TEXT and b'\x00' not in raw:
            try:
                value = raw.decode('utf-8')
            except UnicodeDecodeError:
                value = ''
            if OLD.search(value) and not name.startswith('docs/project-history/'):
                errors.append(f'{name}: legacy naming remains')
            if p.suffix in SOURCE_EXT and ('/' + 'Users/' + Path.home().name + '/') in value:
                errors.append(f'{name}: developer-specific absolute path')
            if re.search(r'-----BEGIN (?:[A-Z0-9.]+ )*PRIVATE KEY(?: BLOCK)?-----', value):
                errors.append(f'{name}: private key material')
        if name != 'docs/baseline-manifest.json':
            records.append({'path':name, 'bytes':len(raw), 'sha256':hashlib.sha256(raw).hexdigest()})
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    if args.write_manifest:
        payload = {'schema':'nexlos.baseline/1', 'date':date.today().isoformat(), 'files':records}
        (ROOT/'docs/baseline-manifest.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2)+'\n')
    if args.verify_manifest:
        manifest = ROOT/'docs/baseline-manifest.json'
        if not manifest.is_file():
            print('Baseline manifest is missing', file=sys.stderr)
            return 1
        expected = {f['path']:f for f in json.loads(manifest.read_text())['files']}
        actual = {f['path']:f for f in records}
        changed = sorted(name for name in expected.keys() | actual.keys() if expected.get(name) != actual.get(name))
        if changed:
            print('Baseline differs: ' + ', '.join(changed), file=sys.stderr)
            return 1
    print(f'Source checks passed: {len(records)} files, {sum(x["bytes"] for x in records):,} bytes')
    return 0

if __name__ == '__main__':
    sys.exit(main())
