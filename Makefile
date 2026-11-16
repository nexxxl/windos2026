.PHONY: check test pack-check public-check audit audit-test

# check 是本地的总闸：源码边界、发行契约、契约的反例测试、插件自检。
check:
	python3 scripts/check-source.py
	python3 scripts/audit-release.py
	python3 scripts/test-audit-release.py
	npm run check

test:
	npm test

pack-check:
	npm run pack:check

public-check:
	@test -n "$(OUT)" || (echo 'Use make public-check OUT=/absolute/path/to/public-candidate' >&2; exit 2)
	bash scripts/stage-public-repo.sh --check "$(OUT)"

audit:
	python3 scripts/audit-release.py

# 门禁自己的回归测试：每一项检查都必须能在缺陷输入下变红。
audit-test:
	python3 scripts/test-audit-release.py
