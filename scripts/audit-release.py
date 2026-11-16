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

# 门禁的检查清单。run_all 会核对「实际执行」与「登记」两端：
# 新加一项检查却忘了登记，或登记了却从未执行，都会直接变红。
# scripts/test-audit-release.py 另外保证每一项都有反例测试。
CHECK_NAMES = (
    "check-registry",
    "license-copies",
    "no-eula-reference",
    "binary-license-entry",
    "workflow-contract",
    "workflow-hardening",
    "security-surface",
    "build-gogarble-scope",
    "update-channel",
    "package-layout",
    "manifest-obfuscation",
    "binary-buildinfo",
    "binary-command-set",
    "binary-symbols",
    "binary-self-report",
)


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

    def skipped(self) -> list[dict]:
        return [row for row in self.rows if row["status"] == "SKIP"]

    def names(self) -> list[str]:
        """已执行过的检查名（二进制类检查可重复出现）。"""
        return [row["check"] for row in self.rows]

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

def check_license_copies(root: Path, public: Path | None, report: Report) -> None:
    """每份二进制许可必须逐字节相同：任何一处手改都会让下载者读到不同条款。"""
    candidates = [
        root / "docs" / "LICENSE-BINARY.md",
        root / "public-repo" / "docs" / "LICENSE-BINARY.md",
        root / "GitHub公开目录" / "docs" / "LICENSE-BINARY.md",
    ]
    if public and public != root:
        candidates.append(public / "docs" / "LICENSE-BINARY.md")
    present = [p for p in candidates if p.is_file()]
    if len(present) < 2:
        # 源码树本来就该有源码副本与公开副本；只剩一份说明有人删了东西。
        if (root / "go.mod").is_file():
            report.add("license-copies", "FAIL", "源码树只找到一份 LICENSE-BINARY.md，副本被删了")
        else:
            report.add("license-copies", "SKIP", "这棵树只有一份二进制许可（插件版）")
        return
    digests = {p: sha256(p) for p in present}
    unique = set(digests.values())
    if len(unique) == 1:
        report.add("license-copies", "PASS", f"{len(present)} 份，sha256 {next(iter(unique))[:12]}")
    else:
        report.add("license-copies", "FAIL", "; ".join(f"{p.relative_to(root)}={d[:12]}" for p, d in digests.items()))


def shipped_docs(root: Path):
    """只扫会随仓库或安装包发布的文档。
    构建脚本与它们的 README 是维护者说明，里面提到 EULA 是在描述这条检查本身，
    不能因为解释“不要再引用 EULA”而让门禁变红。"""
    for name in ("README.md", "README.en.md", "NOTICE", "DISCLAIMER.md", "TRADEMARK.md",
                 "THIRD_PARTY_NOTICES.md", "SECURITY.md"):
        path = root / name
        if path.is_file():
            yield path
    for dirname in ("docs", "public-repo", "GitHub公开目录", ".github"):
        base = root / dirname
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix.lower() in (".md", ".txt", ".yml", ".yaml"):
                if "node_modules" in path.parts or "baseline-manifest.json" == path.name:
                    continue
                yield path


def check_no_eula(root: Path, report: Report) -> None:
    """EULA 已并入二进制许可；发布物里残留的引用会让条款出现第二个版本。"""
    problems = []
    for path in shipped_docs(root):
        raw = path.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"\bEULA(?:\.md)?\b", raw):
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
        # 分发包（build.py 导出的 public-repo）按设计不带 .github；这时该由 CI 对着仓库根跑。
        report.add("workflow-contract", "SKIP", "这棵树没有 .github/workflows/release.yml")
        return
    raw = path.read_text(encoding="utf-8")
    problems = []
    if (re.search(r"\bgh\s+release\s+create\b", raw) or "softprops/action-gh-release" in raw
            or re.search(r"gh\s+api\b[^\n]*/releases(?![\w/])[^\n]*\bPOST\b", raw, re.IGNORECASE)):
        problems.append("仍然会创建 GitHub Release")
    if "contents: write" in raw:
        problems.append("permissions 仍是 contents: write")
    if not re.search(r"""tags:\s*\[?\s*['"]plugin-v\*['"]""", raw):
        problems.append("tag 触发不是 plugin-v*")
    if "contents: read" not in raw:
        problems.append("缺少显式的 contents: read")
    if problems:
        report.add("workflow-contract", "FAIL", "; ".join(problems))
    else:
        report.add("workflow-contract", "PASS")


def check_workflow_hardening(repo: Path, report: Report) -> None:
    """工作流本身就是攻击面：默认权限、不可信触发器、漂移的动作版本都是入口。"""
    base = repo / ".github" / "workflows"
    if not base.is_dir():
        report.add("workflow-hardening", "SKIP", "这棵树没有 .github/workflows")
        return
    problems = []
    for path in sorted([*base.glob("*.yml"), *base.glob("*.yaml")]):
        raw = path.read_text(encoding="utf-8", errors="ignore")
        if "permissions:" not in raw:
            problems.append(f"{path.name} 没有声明 permissions")
        # pull_request_target 在基分支上下文里跑，并可能拿到写令牌与密钥。
        if re.search(r"^on:.*\bpull_request_target\b", raw, re.MULTILINE) or \
                re.search(r"^\s{2}pull_request_target\s*:", raw, re.MULTILINE):
            problems.append(f"{path.name} 使用 pull_request_target")
        for mt in re.finditer(r"uses:\s*(\S+)", raw):
            ref = mt.group(1).strip("'\"")
            if "@" not in ref:
                problems.append(f"{path.name} 的 {ref} 没有固定版本")
                continue
            tag = ref.rsplit("@", 1)[1]
            if tag in ("main", "master", "HEAD") or tag.startswith("refs/"):
                problems.append(f"{path.name} 的 {ref} 跟着分支走")
    if problems:
        report.add("workflow-hardening", "FAIL", "; ".join(problems[:6]))
    else:
        report.add("workflow-hardening", "PASS")


def check_security_surface(repo: Path, report: Report) -> None:
    """公开仓的安全入口必须是文件而非承诺：报告渠道、依赖更新、归属人、换行归一。"""
    # 私有构建树不带 .github，它的仓库级设置由公开仓那份检查。发布仓一旦有 .github
    # （工作流总在这里），这些文件就一个都不能少。
    if not (repo / ".github").is_dir():
        report.add("security-surface", "SKIP", "这棵树没有 .github，不是发布仓")
        return
    problems = []
    security = repo / ".github" / "SECURITY.md"
    if not security.is_file():
        security = repo / "SECURITY.md"
    if not security.is_file():
        problems.append("缺少 SECURITY.md")
    else:
        raw = security.read_text(encoding="utf-8", errors="ignore")
        if not re.search(r"Report a vulnerability|Security Advisor", raw, re.IGNORECASE):
            problems.append("SECURITY.md 没有指明私密报告渠道")
        if not re.search(r"^#{1,3}\s*Scope\b", raw, re.MULTILINE | re.IGNORECASE):
            problems.append("SECURITY.md 没有 Scope 段")
    dependabot = repo / ".github" / "dependabot.yml"
    if not dependabot.is_file():
        problems.append("缺少 .github/dependabot.yml")
    else:
        raw = dependabot.read_text(encoding="utf-8", errors="ignore")
        if not re.search(r"^version:\s*[\"']?2", raw, re.MULTILINE):
            problems.append("dependabot.yml 不是 version 2")
        for eco in ("npm", "github-actions"):
            if f"package-ecosystem: {eco}" not in raw:
                problems.append(f"dependabot 没有覆盖 {eco}")
    if not (repo / ".github" / "CODEOWNERS").is_file():
        problems.append("缺少 CODEOWNERS")
    if not (repo / ".gitattributes").is_file():
        problems.append("缺少 .gitattributes")
    if problems:
        report.add("security-surface", "FAIL", "; ".join(problems))
    else:
        report.add("security-surface", "PASS")


def check_registry(report: Report) -> None:
    """登记表与实现必须一致：否则「全绿」可能只是少跑了几项。"""
    # 本项自己还没输出，比较时先排除，否则它永远把自己算成「未执行」。
    expected = [name for name in CHECK_NAMES if name != "check-registry"]
    emitted = [name for name in report.names() if name != "check-registry"]
    missing = [name for name in expected if name not in emitted]
    unknown = sorted(set(emitted) - set(expected))
    problems = []
    if missing:
        problems.append("未执行: " + ", ".join(missing))
    if unknown:
        problems.append("未登记: " + ", ".join(unknown))
    if problems:
        report.add("check-registry", "FAIL", "; ".join(problems))
    else:
        report.add("check-registry", "PASS", f"{len(CHECK_NAMES)} 项")


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


def check_update_channel(root: Path, package: Path | None, binaries: list[Path], report: Report) -> None:
    """公钥为空时更新通道整体关闭；配置了就必须真的编进二进制。

    公钥走 ldflags（`-X main.updatePublicKey`），源码里的默认值永远是空串，
    所以只看 update.go 会把「已配置」误报成「关闭」——这正是第一次带公钥
    构建时暴露的问题。有产物时以清单声明为准，并回到二进制里核对字面量。
    """
    manifest = None
    if package:
        candidates = list(package.glob("release-manifest.json")) + \
            list(package.glob("*/release-manifest.json"))
        if candidates:
            manifest = json.loads(candidates[0].read_text(encoding="utf-8"))

    if manifest is not None:
        channel = manifest.get("updateChannel") or {}
        key = (channel.get("publicKey") or "").strip()
        note = channel.get("fingerprint") or "无指纹"
        if not key:
            # 有清单说明这是一次正式构建；没有公钥就只能手动下载更新。
            # 这属于发布决策，必须显式记录，不能靠 SKIP 悄悄过关。
            report.add("update-channel", "FAIL", "清单存在但 updateChannel 没有公钥：本次构建没有应用内更新通道")
            return
        if not binaries:
            report.add("update-channel", "PASS", f"清单已配置公钥 · {note}（未提供 --binary，未核对二进制）")
            return
        absent = [b.name for b in binaries if key.encode() not in b.read_bytes()]
        if absent:
            report.add("update-channel", "FAIL", "清单声明了公钥，二进制里却找不到: " + ", ".join(absent))
        else:
            report.add("update-channel", "PASS", f"公钥已编入二进制 · {note}")
        return

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


def find_package_dirs(package: Path) -> list[Path]:
    """--package 可以给单个包目录，也可以给 build.py 的多平台输出目录。"""
    if (package / "LICENSE").is_file():
        return [package]
    return sorted(p for p in package.iterdir() if p.is_dir() and p.name.startswith("NexlOS-"))


def check_package(root: Path, package: Path, report: Report) -> None:
    pkgs = find_package_dirs(package)
    if not pkgs:
        report.add("package-layout", "FAIL", f"{package} 里找不到 NexlOS-* 包目录")
        return

    license_binary = root / "public-repo" / "docs" / "LICENSE-BINARY.md"
    if not license_binary.is_file():
        license_binary = root / "docs" / "LICENSE-BINARY.md"

    problems = []
    for pkg in pkgs:
        root_license = pkg / "LICENSE"
        if not root_license.is_file():
            problems.append(f"{pkg.name}: 包根缺少 LICENSE")
        elif license_binary.is_file() and sha256(root_license) != sha256(license_binary):
            problems.append(f"{pkg.name}: 包根 LICENSE 不是二进制许可")
        apache = pkg / "licenses" / "APACHE-2.0.txt"
        if not apache.is_file():
            problems.append(f"{pkg.name}: 缺少 licenses/APACHE-2.0.txt（桌面层仍是 Apache-2.0）")
        elif "Apache License" not in apache.read_text(encoding="utf-8", errors="ignore"):
            problems.append(f"{pkg.name}: licenses/APACHE-2.0.txt 不是 Apache 文本")
        eula = [p.name for p in pkg.rglob("*") if p.is_file() and "EULA" in p.name.upper()]
        if eula:
            problems.append(f"{pkg.name}: 包里仍有 EULA 文件: " + ", ".join(eula[:3]))
    if problems:
        report.add("package-layout", "FAIL", "; ".join(problems[:6]))
    else:
        report.add("package-layout", "PASS", f"{len(pkgs)} 个包目录 · " + ", ".join(p.name for p in pkgs))


def load_manifest(package: Path) -> dict | None:
    candidates = list(package.glob("release-manifest.json")) + list(package.glob("*/release-manifest.json"))
    if not candidates:
        return None
    return json.loads(candidates[0].read_text(encoding="utf-8"))


def manifest_is_obfuscated(package: Path | None) -> bool:
    """只有 manifest 明确声明 garble 时，才要求产物呈现混淆后的形态。"""
    if package is None:
        return False
    data = load_manifest(package)
    return bool(data) and (data.get("obfuscation") or {}).get("tool") == "garble"


def check_manifest(package: Path, report: Report) -> None:
    """混淆声明必须与产物一致：静默失效的 garble 不能以“已混淆”名义发出。"""
    data = load_manifest(package)
    if data is None:
        report.add("manifest-obfuscation", "SKIP", "没有 release-manifest.json")
        return
    obf = data.get("obfuscation") or {}
    tool = obf.get("tool")
    if tool is None:
        report.add("manifest-obfuscation", "SKIP", "manifest 声明未混淆：" + (obf.get("note") or "无说明"))
        return
    if tool != "garble":
        report.add("manifest-obfuscation", "FAIL", f"未知的混淆工具: {tool}")
        return
    problems = []
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


def check_binary(binary: Path, report: Report, obfuscated: bool = True) -> None:
    code, out = run(["go", "version", "-m", str(binary)])
    first = out.splitlines()[0] if out else "(no output)"
    if not obfuscated:
        # 未混淆批次：buildinfo 与符号可读是预期结果，不能按失败处理，也不能按通过处理。
        report.add("binary-buildinfo", "SKIP", "本批次未混淆：buildinfo 可读是预期结果")
    elif code == 0 and first.endswith(": unknown"):
        report.add("binary-buildinfo", "PASS", "go version -m → unknown")
    else:
        report.add("binary-buildinfo", "FAIL", first[:160])

    # 命令名是字符串字面量，garble 默认不动它们；用它证明这批产物确实包含当前代码。
    # 否则一个旧的候选包也能在“符号检查”上全绿。
    data = binary.read_bytes()
    missing = [cmd for cmd in ("update.status", "update.check", "update.download") if cmd.encode() not in data]
    if missing:
        report.add("binary-command-set", "FAIL", "缺少命令字面量: " + ", ".join(missing))
    else:
        report.add("binary-command-set", "PASS", "update.* 三条命令都在")

    leaked = [name for name in ("registerStarCommands", "newUpdateManager", "nexloffice.") if name.encode() in data]
    path_hits = data.count(b"nexlos/")
    if not obfuscated:
        report.add("binary-symbols", "SKIP", "本批次未混淆：函数名可读是预期结果")
    elif leaked:
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

def run_all(root: Path, public: Path, package: Path | None, binaries: list[Path]) -> Report:
    """唯一执行路径。自测也走它，保证测的就是门禁本身。"""
    report = Report()
    check_license_copies(root, public, report)
    check_no_eula(root, report)
    check_license_link(public, report)
    check_workflow_contract(public, report)
    check_workflow_hardening(public, report)
    check_security_surface(public, report)
    check_build_scope(root, report)
    check_update_channel(root, package, binaries, report)

    if package:
        check_package(root, package, report)
        check_manifest(package, report)
    else:
        report.add("package-layout", "SKIP", "未提供 --package")
        report.add("manifest-obfuscation", "SKIP", "未提供 --package")

    if binaries:
        obfuscated = manifest_is_obfuscated(package)
        for binary in binaries:
            check_binary(binary, report, obfuscated)
    else:
        for name in ("binary-buildinfo", "binary-command-set", "binary-symbols", "binary-self-report"):
            report.add(name, "SKIP", "未提供 --binary")

    check_registry(report)
    return report


def exit_code(report: Report, strict: bool) -> int:
    """FAIL 一律非零；strict 模式下 SKIP 也算失败（发布前用，防止检查被跳过）。"""
    if report.failed():
        return 1
    if strict and report.skipped():
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="NexlOS 发行审计回归门禁")
    parser.add_argument("--root", type=Path, help="源码根；默认从脚本位置向上找")
    parser.add_argument("--public-repo", type=Path, help="公开仓根（含 .github）；默认用 --root")
    parser.add_argument("--package", type=Path, help="包目录或 build.py 输出目录")
    parser.add_argument("--binary", type=Path, action="append", default=[], help="待检二进制，可重复")
    parser.add_argument("--json", action="store_true", help="机器可读输出")
    parser.add_argument("--strict", action="store_true",
                        help="任何 SKIP 也算失败：发布前用它，确保没有检查被跳过")
    args = parser.parse_args()

    root = (args.root or find_root(Path(__file__).resolve().parent)).resolve()
    public = (args.public_repo or root).resolve()
    package = args.package.resolve() if args.package else None
    binaries = [b.resolve() for b in args.binary]

    # 路径写错时要给出明确错误，不能让门禁自己抛 traceback。
    missing = [str(b) for b in binaries if not b.is_file()]
    if missing:
        print("--binary 路径不存在: " + ", ".join(missing), file=sys.stderr)
        return 2

    report = run_all(root, public, package, binaries)
    report.print(args.json)

    if args.strict and report.skipped():
        names = ", ".join(row["check"] for row in report.skipped())
        print(f"\n--strict: {len(report.skipped())} 项检查被跳过: {names}", file=sys.stderr)
    return exit_code(report, args.strict)


if __name__ == "__main__":
    sys.exit(main())
