## What changed

<!-- One paragraph. Link the issue if there is one. -->

## Why

<!-- The problem this solves, not the implementation detail. -->

## How it was verified

<!--
List the commands you ran and the result. For UI changes, name the browser,
viewport, and flow you exercised. For platform claims, name the platform and
version. Write "not verified" where applicable instead of guessing.
-->

- [ ] `npm run check && npm test`
- [ ] `python3 scripts/check-source.py`
- [ ] UI change verified in a real browser (desktop and mobile if layout changed)
- [ ] Not applicable / explain:

## Risk and limits

<!-- Failure modes, migration impact, platform gaps, rollback plan. -->

## Checklist

- [ ] The change is limited to the stated scope.
- [ ] New user-facing strings go through i18n and include an English fallback.
- [ ] New third-party code or assets include source, version, and license text.
- [ ] No secrets, private paths, customer data, or build artifacts are included.
- [ ] Commits are signed off under the DCO (`git commit -s`).
- [ ] Documentation under `docs/` is updated when behavior changes.
