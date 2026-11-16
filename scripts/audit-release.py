#!/usr/bin/env python3
"""发行审计的回归门禁：把三轮 L9 审计里查出来的不变量写成可重跑的命令。

用法：
    python3 scripts/release/audit-release.py
    python3 scripts/release/audit-release.py --package /tmp/rel-obf2 --binary /tmp/rel-obf2/NexlOS-*/NexlOS.app/Contents/MacOS/NexlOS
    python3 scripts/release/audit-release.py --json

设计约束：
- 只用标准库，能在构建机与 CI 里直接跑。
- 检查项按证据来源分组；缺输入（没给 --package/--binary）记 SKIP，不冒充通过。
- 每一项都对应一次真实事故或审计结论，注释里写清楚防的是什么。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

STATUSES = ("PASS", "FAIL", "SKIP")


# ---------- 基础设施 ----------

def find_root(start: Path) -> Path:
    """向上找到同时能解释源码与公开仓的根：有 go.mod 或 package.json。"""
    for parent in [start, *start.parents]:
        if (parent / "go.mod").is_file() or (parent / "package.json").is_file():
            return parent
    return start


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], cwd: Path | None = None) -> tuple[int, str]:
    try:
        proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=120)
        return proc.returncode, (proc.stdout + proc.stderr).strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 127, str(exc)


def text_files(root: Path, suffixes: tuple[str, ...], limit: int = 4000):
    """扫描受版本控制的文字材料；跳过历史记录与构建产物。"""
    skip_dirs = {".git", "node_modules", "dist", "__pycache__", ".cache", "venv"}
    count = 0
    for path in root.rglob("*"):
        if count >= limit:
            return
        if not path.is_file() or path.suffix.lower() not in suffixes:
            continue
        if any(part in skip_dirs for part in path.parts):
            continue
        if path.name.upper().startswith("CHANGELOG"):
            continue
        count += 1
        yield path


class Report:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def add(self, name: str, status: str, detail: str = "") -> None:
        assert status in STATUSES
        self.rows.append({"check": name, "status": status, "detail": detail})

    def failed(self) -> bool:
        return any(row["status"] == "FAIL" for row in self.rows)

    def print(self, as_json: bool) -> None:
        if as_json:
            print(json.dumps({"ok": not self.failed(), "checks": self.rows}, ensure_ascii=False, indent=2))
            return
        for row in self.rows:
            line = f"{row['status']:4} {row['check']}"
            print(line + (f"  —  {row['detail']}" if row["detail"] else ""))
        passed = sum(1 for r in self.rows if r["status"] == "PASS")
        failed = sum(1 for r in self.rows if r["status"] == "FAIL")
        skipped = sum(1 for r in self.rows if r["status"] == "SKIP")
        print(f"\n{passed} passed, {failed} failed, {skipped} skipped")


# ---------- 检查 ----------

def check_license_copies(root: Path, report: Report) -> None:
    """四处二进制许可必须逐字节相同：任何一处手改都会让下载者读到不同条款。"""
    candidates = [
        root / "docs" / "LICENSE-BINARY.md",
        root / "public-repo" / "docs" / "LICENSE-BINARY.md",
        root / "GitHub公开目录" / "docs" / "LICENSE-BINARY.md",
    ]
    present = [p for p in candidates if p.is_file()]
    if len(present) < 2:
        report.add("license-copies", "SKIP", "只找到一份 LICENSE-BINARY.md，无法比较")
        return
    digests = {p: sha256(p) for p in present}
    unique = set(digests.values())
    if len(unique) == 1:
        report.add("license-copies", "PASS", f"{len(present)} 份，sha256 {next(iter(unique))[:12]}")
    else:
        report.add("license-copies", "FAIL", "; ".join(f"{p.relative_to(root)}={d[:12]}" for p, d in digests.items()))


def check_no_eula(root: Path, report: Report) -> None:
    """EULA 已并入二进制许可；残留的引用会让条款出现第二个版本。"""
    problems = []
    for path in text_files(root, (".md", ".txt", ".yml", ".yaml", ".json", ".js", ".go")):
        raw = path.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"\bEULA(?:\.md)?\b", raw):
            # 两个豁免：审计脚本自己会提到 EULA；baseline-manifest.json 是
            # 逐文件哈希快照，冻结时才重生成，它不随包发布。
            if path.name == "audit-release.py":
                continue
            if path.name == "baseline-manifest.json":
                continue
            problems.append(str(path.relative_to(root)))
    if problems:
        report.add("no-eula-reference", "FAIL", ", ".join(sorted(set(problems))[:6]))
    else:
        report.add("no-eula-reference", "PASS")


def check_license_link(repo: Path, report: Report) -> None:
    """条款入口只有一条：NOTICE 必须把读者指向二进制许可，而不是口头描述。"""
    license_file = repo / "docs" / "LICENSE-BINARY.md"
    notice = repo / "NOTICE"
    if not notice.is_file():
        notice = repo / "docs" / "legal" / "NOTICE"
    if not license_file.is_file():
        report.add("binary-license-entry", "SKIP", "这棵树没有 docs/LICENSE-BINARY.md（插件版以 Apache-2.0 发布）")
        return
    if not notice.is_file():
        report.add("binary-license-entry", "FAIL", "有二进制许可却没有 NOTICE")
        return
    raw = notice.read_text(encoding="utf-8", errors="ignore")
    if "LICENSE-BINARY.md" in raw:
        report.add("binary-license-entry", "PASS")
    else:
        report.add("binary-license-entry", "FAIL", "NOTICE 没有指向 docs/LICENSE-BINARY.md")


def check_workflow_contract(repo: Path, report: Report) -> None:
    """插件工作流只做校验与留档：建 Release、写 contents 都会抢走通用版的发布位。"""
    path = repo / ".github" / "workflows" / "release.yml"
    if not path.is_file():
        report.add("workflow-contract", "SKIP", f"{repo.name} 没有 .github/workflows/release.yml")
        return
    raw = path.read_text(encoding="utf-8")
    problems = []
    if re.search(r"\bgh\s+release\s+create\b", raw) or "softprops/action-gh-release" in raw:
        problems.append("仍然会创建 GitHub Release")
    if "contents: write" in raw:
        problems.append("permissions 仍是 contents: write")
    if not re.search(r"tags:\s*\[?\s*'plugin-v\*'", raw):
        problems.append("tag 触发不是 plugin-v*")
    if "contents: read" not in raw:
        problems.append("缺少显式的 contents: read")
    if problems:
        report.add("workflow-contract", "FAIL", "; ".join(problems))
    else:
        report.add("workflow-contract", "PASS")


def check_build_scope(root: Path, report: Report) -> None:
    """GOGARBLE 漏掉 replace 目标时，第三方模块里的原始名字会整片留下。"""
    path = root / "scripts" / "release" / "build.py"
    if not path.is_file():
        report.add("build-gogarble-scope", "SKIP", "没有 scripts/release/build.py")
        return
    raw = path.read_text(encoding="utf-8")
    problems = []
    if '"nexlos,nexloffice"' not in raw:
        problems.append("GOGARBLE 前缀没有同时覆盖 nexlos 与 nexloffice")
    if 'probe.endswith(": unknown")' not in raw:
        problems.append("混淆后缺少 buildinfo 必须为 unknown 的硬断言")
    if problems:
        report.add("build-gogarble-scope", "FAIL", "; ".join(problems))
    else:
        report.add("build-gogarble-scope", "PASS")


def check_update_channel(root: Path, report: Report) -> None:
    """公钥为空时更新通道整体关闭；这里只报告状态，避免发布说明超前承诺。"""
    path = root / "update.go"
    if not path.is_file():
        report.add("update-channel", "SKIP", "没有 update.go")
        return
    raw = path.read_text(encoding="utf-8")
    mt = re.search(r'var updatePublicKey = "([^"]*)"', raw)
    if not mt:
        report.add("update-channel", "FAIL", "updatePublicKey 变量不存在或不是字符串字面量")
    elif mt.group(1).strip():
        report.add("update-channel", "PASS", "发行公钥已配置")
    else:
        report.add("update-channel", "SKIP", "公钥为空：发布说明不能承诺应用内自动更新")


def find_package_dir(package: Path) -> Path | None:
    """--package 既可以给包目录，也可以给 build.py 的输出目录。"""
    if (package / "LICENSE").is_file():
        return package
    dirs = [p for p in package.iterdir() if p.is_dir() and p.name.startswith("NexlOS-")]
    return dirs[0] if len(dirs) == 1 else None


def check_package(root: Path, package: Path, report: Report) -> None:
    pkg = find_package_dir(package)
    if pkg is None:
        report.add("package-layout", "FAIL", f"{package} 里找不到唯一的 NexlOS-* 包目录")
        return

    license_binary = root / "public-repo" / "docs" / "LICENSE-BINARY.md"
    if not license_binary.is_file():
        license_binary = root / "docs" / "LICENSE-BINARY.md"

    problems = []
    root_license = pkg / "LICENSE"
    if not root_license.is_file():
        problems.append("包根缺少 LICENSE")
    elif license_binary.is_file() and sha256(root_license) != sha256(license_binary):
        problems.append("包根 LICENSE 不是二进制许可")
    apache = pkg / "licenses" / "APACHE-2.0.txt"
    if not apache.is_file():
        problems.append("缺少 licenses/APACHE-2.0.txt（桌面层仍是 Apache-2.0）")
    elif "Apache License" not in apache.read_text(encoding="utf-8", errors="ignore"):
        problems.append("licenses/APACHE-2.0.txt 不是 Apache 文本")
    eula = [p.name for p in pkg.rglob("*") if p.is_file() and "EULA" in p.name.upper()]
    if eula:
        problems.append("包里仍有 EULA 文件: " + ", ".join(eula[:3]))
    if problems:
        report.add("package-layout", "FAIL", "; ".join(problems))
    else:
        report.add("package-layout", "PASS", str(pkg.name))


def check_manifest(package: Path, report: Report) -> None:
    """混淆声明必须与产物一致：静默失效的 garble 不能以“已混淆”名义发出。"""
    candidates = list(package.glob("release-manifest.json")) + list(package.glob("*/release-manifest.json"))
    if not candidates:
        report.add("manifest-obfuscation", "SKIP", "没有 release-manifest.json")
        return
    data = json.loads(candidates[0].read_text(encoding="utf-8"))
    obf = data.get("obfuscation") or {}
    problems = []
    if obf.get("tool") != "garble":
        problems.append("manifest 未记录 garble")
    if "nexloffice" not in str(obf.get("scope", "")):
        problems.append("混淆范围没有覆盖 nexloffice")
    if not obf.get("note"):
        problems.append("缺少“混淆不是加密”的说明")
    for pkg in data.get("packages", []):
        info = pkg.get("buildInfo") or {}
        if obf.get("tool") == "garble" and info.get("mode") != "NOT_AVAILABLE_UNDER_OBFUSCATION":
            problems.append(f"{pkg.get('platform')} 的 buildInfo 仍是可读状态")
    if problems:
        report.add("manifest-obfuscation", "FAIL", "; ".join(problems))
    else:
        report.add("manifest-obfuscation", "PASS")


def check_binary(binary: Path, report: Report) -> None:
    code, out = run(["go", "version", "-m", str(binary)])
    first = out.splitlines()[0] if out else "(no output)"
    if code == 0 and first.endswith(": unknown"):
        report.add("binary-buildinfo", "PASS", "go version -m → unknown")
    else:
        report.add("binary-buildinfo", "FAIL", first[:160])

    # 抽样符号：这几类名字最容易被依赖图带回来；出现一个就说明范围漏了。
    data = binary.read_bytes()
    leaked = [name for name in ("registerStarCommands", "newUpdateManager", "nexloffice.") if name.encode() in data]
    path_hits = data.count(b"nexlos/")
    if leaked:
        report.add("binary-symbols", "FAIL", "残留: " + ", ".join(leaked))
    elif path_hits > 16:
        report.add("binary-symbols", "FAIL", f"nexlos/ 路径残留 {path_hits} 处")
    else:
        report.add("binary-symbols", "PASS", f"nexlos/ 残留 {path_hits} 处")

    code, out = run([str(binary), "-version"])
    stripped = out.strip()
    mt = re.match(r"^NexlOS (\S+) (\S+)/(\S+) (release|dev)$", stripped)
    if code != 0:
        report.add("binary-self-report", "SKIP", "交叉编译产物无法在本机执行")
    elif not mt:
        report.add("binary-self-report", "FAIL", f"自报格式不对: {stripped[:120]}")
    elif mt.group(4) == "dev":
        report.add("binary-self-report", "SKIP", "开发构建自报为 dev，不属于发布产物")
    else:
        report.add("binary-self-report", "PASS", stripped)


# ---------- 入口 ----------

def main() -> int:
    parser = argparse.ArgumentParser(description="NexlOS 发行审计回归门禁")
    parser.add_argument("--root", type=Path, help="源码根；默认从脚本位置向上找")
    parser.add_argument("--public-repo", type=Path, help="公开仓根（含 .github）；默认用 --root")
    parser.add_argument("--package", type=Path, help="包目录或 build.py 输出目录")
    parser.add_argument("--binary", type=Path, action="append", default=[], help="待检二进制，可重复")
    parser.add_argument("--json", action="store_true", help="机器可读输出")
    args = parser.parse_args()

    root = (args.root or find_root(Path(__file__).resolve().parent)).resolve()
    public = (args.public_repo or root).resolve()
    report = Report()

    check_license_copies(root, report)
    check_no_eula(root, report)
    check_license_link(public, report)
    check_workflow_contract(public, report)
    check_build_scope(root, report)
    check_update_channel(root, report)

    if args.package:
        check_package(root, args.package.resolve(), report)
        check_manifest(args.package.resolve(), report)
    else:
        report.add("package-layout", "SKIP", "未提供 --package")
        report.add("manifest-obfuscation", "SKIP", "未提供 --package")

    if args.binary:
        for binary in args.binary:
            check_binary(binary.resolve(), report)
    else:
        report.add("binary-buildinfo", "SKIP", "未提供 --binary")
        report.add("binary-symbols", "SKIP", "未提供 --binary")
        report.add("binary-self-report", "SKIP", "未提供 --binary")

    report.print(args.json)
    return 1 if report.failed() else 0


if __name__ == "__main__":
    sys.exit(main())
