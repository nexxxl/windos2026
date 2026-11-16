# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`-lite.N` marks the plugin-only edition. The universal edition ships on its own
release line with its own version numbers and its own license; its changes are
not listed here.

## 1.1.0-lite.0 — 2026-11-13

### Added

- NexlOS desktop as a DSH plugin: 17 built-in apps, 25 commands, 8 interface
  languages, one runtime dependency (`jpeg-js`).
- App generation from one sentence: the generator writes
  `apps/<id>/index.html` plus `app.json`, verifies the page in headless
  Chromium, repairs it once on failure, then adds the desktop icon.
- Repository import (`importGithubApp`): clone a repository, detect its build
  entry, and mount the result as an app.
- Capability layer that answers `501` with a reason when a host service or model
  is unavailable, instead of reporting ready.
- WebGL graph view and WebGL2 companion renderer, both with Canvas2D fallbacks.
- Octop standalone host that serves the same `index.js` and desktop tree,
  installed with `./scripts/octop-install`.
- Public-source staging (`scripts/stage-public-repo.sh`) and its boundary tests
  for licenses, credentials and excluded directories.

### Security

- No bundled credentials. The package ships no key and sets no default model
  provider; it reads the model configured in the current DSH profile.

## Unreleased

### Added

- `docs/highlights.md`: search phrase → capability → verification table,
  together with the claims this project does not make.
- `docs/factory.md`: the software factory contract, the three-tier acceptance
  model, and the edition map.
- `docs/faq.md`: the value page, organized as Today / Next / Boundary.
- `docs/research-use.md`: intended use, prohibited use, user responsibilities.
- `llms.txt`: a machine-readable summary for AI crawlers.
- `docs/positioning.md`: the 2026 comparison, the six-month read, and the
  discovery plan.
- `CHANGELOG.md`, a tag-triggered release workflow, Dependabot, CODEOWNERS, and
  a Node toolchain pin for contributors.

### Changed

- Repository layout: translations moved to `docs/i18n/`, legal documents to
  `docs/legal/`, and the runtime tree to `src/`. The root now reads as an index:
  18 entries instead of 64.
- The npm package follows the same layout. Entry points (`index.js`,
  `client.js`) and the export map are unchanged; `./locale/*` now resolves into
  `src/locale/`.
- `bin/octop-install` moved to `scripts/octop-install`. Re-run it once if a
  previously installed Octop service points at the old path.
- README gained a `## Where it fits in 2026` section, a `## What it refuses to
  do` section, and a project-links section in every language.
