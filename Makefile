.PHONY: check test pack-check public-check

check:
	python3 scripts/check-source.py
	npm run check

test:
	npm test

pack-check:
	npm run pack:check

public-check:
	@test -n "$(OUT)" || (echo 'Use make public-check OUT=/absolute/path/to/public-candidate' >&2; exit 2)
	bash scripts/stage-public-repo.sh --check "$(OUT)"
