#!/usr/bin/env python3
"""审计门禁的反例测试：证明每一项检查在缺陷输入下真的会红。

门禁最大的风险是「静默失效」——某次重构把检查改空，它仍然打印 PASS，
于是发布流程以为自己被保护着。这里的每一条用例都构造一份有缺陷的树，
断言对应检查报 FAIL（或在该缺输入时报 SKIP），并用 tearDownClass 保证
CHECK_NAMES 里没有任何一项漏掉反例。

只用标准库；不联网、不执行项目二进制。
"""
from __future__ import annotations

import importlib.util
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True


def load_gate():
    """audit-release.py 带连字符，按路径加载。"""
    path = Path(__file__).with_name("audit-release.py")
    spec = importlib.util.spec_from_file_location("audit_release", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


g = load_gate()


class GateCounterexampleTests(unittest.TestCase):
    covered: set[str] = set()

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="nexlos-gate-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.root = self.tmp / "private"
        self.public = self.tmp / "public"
        self.root.mkdir()
        self.public.mkdir()

    @classmethod
    def tearDownClass(cls):
        missing = [name for name in g.CHECK_NAMES if name not in cls.covered]
        if missing:
            raise AssertionError(f"这些检查没有反例测试: {', '.join(missing)}")

    # ---------- 夹具 ----------

    def write(self, path: Path, text: str) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def call(self, fn, *args):
        """按 report 在末尾的统一约定调用一项检查，并记录覆盖。"""
        report = g.Report()
        fn(*args, report)
        names = report.names()
        self.assertTrue(names, f"{fn.__name__} 一行都没输出")
        GateCounterexampleTests.covered.update(names)
        return {row["check"]: row for row in report.rows}

    def status(self, rows, name="") -> str:
        name = name or next(iter(rows))
        return rows[name]["status"]

    def fake_binary(self, payload: bytes = b"") -> Path:
        """字面量可寻、但不是可执行的 Go 产物。"""
        path = self.tmp / "fake-NexlOS"
        path.write_bytes(b"\xca\xfe\xba\xbe" + payload)
        path.chmod(0o755)
        return path

    def fake_runner(self, stdout: str) -> Path:
        path = self.tmp / "fake-runner"
        path.write_text(f"#!/bin/sh\necho '{stdout}'\n", encoding="utf-8")
        path.chmod(0o755)
        return path

    # ---------- 许可 ----------

    def test_license_copies(self):
        (self.root / "go.mod").write_text("module x\n", encoding="utf-8")
        self.write(self.root / "docs/LICENSE-BINARY.md", "terms\n")
        second = self.write(self.root / "public-repo/docs/LICENSE-BINARY.md", "terms\n")
        name = "license-copies"

        self.assertEqual(self.status(self.call(g.check_license_copies, self.root, None), name), "PASS")

        second.write_text("edited\n", encoding="utf-8")
        self.assertEqual(self.status(self.call(g.check_license_copies, self.root, None), name), "FAIL")

        second.unlink()
        self.assertEqual(self.status(self.call(g.check_license_copies, self.root, None), name), "FAIL")

    def test_eula_only_scans_shipped_docs(self):
        name = "no-eula-reference"
        self.write(self.root / "docs/legal/NOTICE", "terms\n")
        self.assertEqual(self.status(self.call(g.check_no_eula, self.root), name), "PASS")

        # 维护者说明里解释「不要引用 EULA」不该让门禁变红。
        self.write(self.root / "scripts/release/README.md", "不要把 EULA 写进发布物\n")
        self.assertEqual(self.status(self.call(g.check_no_eula, self.root), name), "PASS")

        self.write(self.root / "docs/legal/OLD.md", "EULA\n")
        self.assertEqual(self.status(self.call(g.check_no_eula, self.root), name), "FAIL")

    def test_binary_license_entry(self):
        name = "binary-license-entry"
        self.assertEqual(self.status(self.call(g.check_license_link, self.public), name), "SKIP")

        self.write(self.public / "docs/LICENSE-BINARY.md", "terms\n")
        self.assertEqual(self.status(self.call(g.check_license_link, self.public), name), "FAIL")

        self.write(self.public / "NOTICE", "see docs/LICENSE-BINARY.md\n")
        self.assertEqual(self.status(self.call(g.check_license_link, self.public), name), "PASS")

        self.write(self.public / "NOTICE", "terms without a path\n")
        self.assertEqual(self.status(self.call(g.check_license_link, self.public), name), "FAIL")

    # ---------- 工作流 ----------

    GOOD_WORKFLOW = """name: release
on:
  push:
    tags: ['plugin-v*']
permissions:
  contents: read
jobs:
  pack:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
"""

    def workflow(self, text: str) -> Path:
        self.write(self.public / ".github/workflows/release.yml", text)
        return self.public

    def test_workflow_contract(self):
        name = "workflow-contract"
        self.assertEqual(self.status(self.call(g.check_workflow_contract, self.public), name), "SKIP")

        self.workflow(self.GOOD_WORKFLOW)
        self.assertEqual(self.status(self.call(g.check_workflow_contract, self.public), name), "PASS")

        for defect in (
            "gh release create v1.0.0 ./dist/*.tgz",
            "softprops/action-gh-release@v2",
            "  contents: write",
        ):
            with self.subTest(defect=defect):
                self.workflow(self.GOOD_WORKFLOW + f"\n{defect}\n")
                self.assertEqual(self.status(self.call(g.check_workflow_contract, self.public), name), "FAIL")

        with self.subTest(defect="wrong tag"):
            self.workflow(self.GOOD_WORKFLOW.replace("plugin-v*", "v*"))
            self.assertEqual(self.status(self.call(g.check_workflow_contract, self.public), name), "FAIL")

        self.workflow(self.GOOD_WORKFLOW.replace("permissions:\n  contents: read\n", ""))
        self.assertEqual(self.status(self.call(g.check_workflow_contract, self.public), name), "FAIL")

    def test_workflow_hardening(self):
        name = "workflow-hardening"
        self.assertEqual(self.status(self.call(g.check_workflow_hardening, self.public), name), "SKIP")

        self.workflow(self.GOOD_WORKFLOW)
        self.assertEqual(self.status(self.call(g.check_workflow_hardening, self.public), name), "PASS")

        cases = {
            "缺 permissions": self.GOOD_WORKFLOW.replace("permissions:\n  contents: read\n", ""),
            "作业级 permissions 冒充顶层": self.GOOD_WORKFLOW.replace(
                "permissions:\n  contents: read\n", "jobs:\n  build:\n    permissions:\n      contents: read\n"),
            "写权限（双空格）": self.GOOD_WORKFLOW.replace("contents: read", "contents:  write"),
            "write-all": self.GOOD_WORKFLOW.replace("contents: read", "write-all"),
            "pull_request_target": "on:\n  pull_request_target:\npermissions:\n  contents: read\n",
            "分支漂移": self.GOOD_WORKFLOW.replace("actions/checkout@v4", "actions/checkout@main"),
            "未固定版本": self.GOOD_WORKFLOW.replace("actions/checkout@v4", "actions/checkout"),
        }
        for label, text in cases.items():
            with self.subTest(case=label):
                self.workflow(text)
                self.assertEqual(self.status(self.call(g.check_workflow_hardening, self.public), name), "FAIL")

    def test_security_surface(self):
        name = "security-surface"
        # 没有 .github 的树不是发布仓，不在这里判分。
        self.assertEqual(self.status(self.call(g.check_security_surface, self.public), name), "SKIP")

        (self.public / ".github").mkdir()
        self.assertEqual(self.status(self.call(g.check_security_surface, self.public), name), "FAIL")

        self.write(self.public / ".github/SECURITY.md",
                   "# Security Policy\n\n## Scope\n\ncode\n\n"
                   "Use Security Advisories: Report a vulnerability.\n")
        self.write(self.public / ".github/dependabot.yml",
                   "version: 2\nupdates:\n"
                   "  - package-ecosystem: npm\n  - package-ecosystem: github-actions\n")
        self.write(self.public / ".github/CODEOWNERS", "* @owner\n")
        self.write(self.public / ".gitattributes", "* text=auto eol=lf\n")
        self.assertEqual(self.status(self.call(g.check_security_surface, self.public), name), "PASS")

        self.write(self.public / ".github/dependabot.yml",
                   "version: 2\nupdates:\n  - package-ecosystem: npm\n")
        self.assertEqual(self.status(self.call(g.check_security_surface, self.public), name), "FAIL")

    # ---------- 构建与更新 ----------

    def test_build_scope(self):
        name = "build-gogarble-scope"
        self.assertEqual(self.status(self.call(g.check_build_scope, self.root), name), "SKIP")

        script = self.root / "scripts/release/build.py"
        self.write(script, 'GOGARBLE="nexlos,nexloffice"\nprobe.endswith(": unknown")\n')
        self.assertEqual(self.status(self.call(g.check_build_scope, self.root), name), "PASS")

        self.write(script, 'GOGARBLE="nexlos"\nprobe.endswith(": unknown")\n')
        self.assertEqual(self.status(self.call(g.check_build_scope, self.root), name), "FAIL")

        self.write(script, 'GOGARBLE="nexlos,nexloffice"\n')
        self.assertEqual(self.status(self.call(g.check_build_scope, self.root), name), "FAIL")

    def test_update_channel(self):
        name = "update-channel"

        def manifest(channel: dict) -> Path:
            path = self.tmp / "release-manifest.json"
            path.write_text(__import__("json").dumps({"updateChannel": channel}), encoding="utf-8")
            return self.tmp

        # 没有产物时退回读源码里的默认值。
        self.assertEqual(self.status(self.call(g.check_update_channel, self.root, None, []), name), "SKIP")
        self.write(self.root / "update.go", 'var updatePublicKey = "AAAA"\n')
        self.assertEqual(self.status(self.call(g.check_update_channel, self.root, None, []), name), "PASS")
        self.write(self.root / "update.go", 'var updatePublicKey = ""\n')
        self.assertEqual(self.status(self.call(g.check_update_channel, self.root, None, []), name), "SKIP")
        self.write(self.root / "update.go", 'const updatePublicKey = 1\n')
        self.assertEqual(self.status(self.call(g.check_update_channel, self.root, None, []), name), "FAIL")

        # 有产物时以清单为准：公钥走 ldflags，源码默认值永远是空的。
        key = "S9SJ0tLuxrBKVkKoYgBJxxE08N9s5T07Eb2wlQrRUIE="
        closed = manifest({"configured": False, "publicKey": "", "fingerprint": ""})
        # 清单在、公钥空 —— 这是「本次构建没有自动更新」，必须红，不能靠 SKIP 过关。
        self.assertEqual(self.status(self.call(g.check_update_channel, self.root, closed, []), name), "FAIL")

        opened = manifest({"configured": True, "publicKey": key, "fingerprint": "ed25519:x"})
        with_key = self.fake_binary(f"prefix\0{key}\0".encode())
        self.assertEqual(
            self.status(self.call(g.check_update_channel, self.root, opened, [with_key]), name), "PASS")

        without_key = self.fake_binary(b"nothing here")
        self.assertEqual(
            self.status(self.call(g.check_update_channel, self.root, opened, [without_key]), name), "FAIL")

        # 没给 --binary 时不能假装核对过。
        row = self.call(g.check_update_channel, self.root, opened, [])[name]
        self.assertEqual(row["status"], "PASS")
        self.assertIn("未核对二进制", row["detail"])

    # ---------- 包与清单 ----------

    def package(self, license_text="terms\n", apache=True) -> Path:
        self.write(self.root / "docs/LICENSE-BINARY.md", "terms\n")
        pkg = self.root / "NexlOS-1.0.0-darwin-amd64"
        self.write(pkg / "LICENSE", license_text)
        # 夹具会被多次调用，缺省文件必须先清掉，否则上一次的产物会让这次误判。
        apache_file = pkg / "licenses/APACHE-2.0.txt"
        if apache:
            self.write(apache_file, "Apache License\nVersion 2.0\n")
        elif apache_file.exists():
            apache_file.unlink()
        return self.root

    def test_package_layout(self):
        name = "package-layout"
        self.assertEqual(self.status(self.call(g.check_package, self.root, self.tmp), name), "FAIL")

        self.assertEqual(self.status(self.call(g.check_package, self.root, self.package()), name), "PASS")

        self.assertEqual(
            self.status(self.call(g.check_package, self.root, self.package(license_text="other\n")), name), "FAIL")
        self.assertEqual(
            self.status(self.call(g.check_package, self.root, self.package(apache=False)), name), "FAIL")

        tree = self.package()
        self.write(tree / "NexlOS-1.0.0-darwin-amd64/LEGAL/EULA.txt", "old\n")
        self.assertEqual(self.status(self.call(g.check_package, self.root, tree), name), "FAIL")

    def test_manifest_obfuscation(self):
        name = "manifest-obfuscation"
        self.assertEqual(self.status(self.call(g.check_manifest, self.tmp), name), "SKIP")

        def manifest(**overrides):
            data = {
                "obfuscation": {"tool": "garble", "scope": "nexlos,nexloffice",
                                "note": "stripping is not encryption"},
                "packages": [{"platform": "darwin/amd64",
                              "buildInfo": {"mode": "NOT_AVAILABLE_UNDER_OBFUSCATION"}}],
            }
            data.update(overrides)
            path = self.tmp / "release-manifest.json"
            path.write_text(__import__("json").dumps(data), encoding="utf-8")
            return self.tmp

        self.assertEqual(self.status(self.call(g.check_manifest, manifest()), name), "PASS")
        self.assertEqual(
            self.status(self.call(g.check_manifest, manifest(
                obfuscation={"tool": "none", "scope": "nexlos,nexloffice", "note": "x"})), name), "FAIL")
        self.assertEqual(
            self.status(self.call(g.check_manifest, manifest(
                obfuscation={"tool": "garble", "scope": "nexlos", "note": "x"})), name), "FAIL")
        self.assertEqual(
            self.status(self.call(g.check_manifest, manifest(
                packages=[{"platform": "darwin/amd64", "buildInfo": {"mode": "READABLE"}}])), name), "FAIL")

    # ---------- 二进制 ----------

    def test_binary_command_set_and_symbols(self):
        literals = b"update.status\0update.check\0update.download\0"
        rows = self.call(g.check_binary, self.fake_binary(literals))
        self.assertEqual(self.status(rows, "binary-buildinfo"), "FAIL")  # 不是 Go 产物
        self.assertEqual(self.status(rows, "binary-command-set"), "PASS")
        self.assertEqual(self.status(rows, "binary-symbols"), "PASS")
        self.assertEqual(self.status(rows, "binary-self-report"), "SKIP")

        # 旧候选包：缺一条命令字面量就红，防止拿上一版冒充当前代码。
        rows = self.call(g.check_binary, self.fake_binary(b"update.status\0update.check\0"))
        self.assertEqual(self.status(rows, "binary-command-set"), "FAIL")

        # 符号残留：真实函数名或过多路径出现即红。
        rows = self.call(g.check_binary, self.fake_binary(b"newUpdateManager\0"))
        self.assertEqual(self.status(rows, "binary-symbols"), "FAIL")
        rows = self.call(g.check_binary, self.fake_binary(b"nexlos/" * 17))
        self.assertEqual(self.status(rows, "binary-symbols"), "FAIL")

    def test_binary_self_report(self):
        name = "binary-self-report"
        self.assertEqual(
            self.status(self.call(g.check_binary, self.fake_runner("NexlOS 0.6.14 darwin/amd64 release")), name),
            "PASS")
        self.assertEqual(
            self.status(self.call(g.check_binary, self.fake_runner("NexlOS 0.6.14 darwin/amd64 dev")), name),
            "SKIP")
        self.assertEqual(
            self.status(self.call(g.check_binary, self.fake_runner("hello world")), name), "FAIL")

    # ---------- 登记表 ----------

    def test_registry_flags_drift(self):
        report = g.Report()
        report.add("license-copies", "PASS")
        g.check_registry(report)
        GateCounterexampleTests.covered.add("check-registry")
        row = {r["check"]: r for r in report.rows}["check-registry"]
        self.assertEqual(row["status"], "FAIL")
        self.assertIn("未执行", row["detail"])

    def test_strict_turns_skip_into_failure(self):
        report = g.Report()
        report.add("license-copies", "PASS")
        report.add("package-layout", "SKIP", "未提供 --package")
        self.assertEqual(g.exit_code(report, strict=False), 0)  # 默认容忍 SKIP
        self.assertEqual(g.exit_code(report, strict=True), 1)   # 发布前不允许跳过
        # 已声明原因的 SKIP 可以放过，未声明的仍然失败。
        self.assertEqual(g.exit_code(report, strict=True, allowed=["package-layout"]), 0)

        report.add("binary-symbols", "SKIP", "本批次未混淆")
        self.assertEqual(g.exit_code(report, strict=True, allowed=["package-layout"]), 1)

        report.add("manifest-obfuscation", "FAIL")
        self.assertEqual(g.exit_code(report, strict=False), 1)

    def test_run_all_declares_every_check(self):
        report = g.run_all(self.root, self.public, None, [])
        GateCounterexampleTests.covered.update(report.names())
        self.assertEqual(sorted(set(report.names())), sorted(g.CHECK_NAMES))
        row = {r["check"]: r for r in report.rows}["check-registry"]
        self.assertEqual(row["status"], "PASS")


if __name__ == "__main__":
    unittest.main(verbosity=2)
