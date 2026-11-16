# Releasing

This repository publishes two kinds of artifact. They have different licenses and
different review requirements, so they ship on different tracks.

| Track | Artifact | License | Where |
| --- | --- | --- | --- |
| Plugin | `@nexlos/os` tarball + source tree | Apache-2.0 | npm, plus the tagged commit |
| Universal | per-platform static binaries | NexlOS Binary License 1.0 (Apache-2.0 parts keep their grant) | GitHub Releases |

The authoritative license map is [LICENSING.md](legal/LICENSING.md).

## Plugin release

1. `npm run check`, `npm test`, `./scripts/verify-lite.sh` all green.
2. `bash scripts/stage-public-repo.sh /tmp/candidate` then
   `bash scripts/stage-public-repo.sh --check /tmp/candidate`.
3. `bash scripts/stage-public-repo.sh --check-repo .` on the pushed tree.
4. `npm pack --dry-run --json`: record size, file count, unpacked size. Update
   the numbers in `README.md` and the seven `docs/i18n/README.*.md` in the same commit.
5. Confirm the tarball does **not** contain `LICENSE-BINARY.md`
   (`node --test test/license-scope.test.mjs` enforces this).
6. Update `CHANGELOG.md`: move the shipped entries out of `Unreleased` into a
   heading named for the version and date. The changelog is the release note.
7. Tag the commit (`plugin-v<version>`) and push the tag. The `release`
   workflow re-runs the gates on the tag, packs the tarball, runs the contract
   test on it, and keeps the verified tarball as a workflow artifact. It does
   **not** create a GitHub Release: the Releases page belongs to the universal
   edition, and the plugin is obtained through `install_bundle` or npm. The
   workflow fails if the tag and `package.json` disagree.
8. Publish to npm with provenance from the tagged commit:

   ```sh
   npm publish --provenance --access public
   ```

   `publishConfig.access` is already `public`; `--provenance` attaches the
   Sigstore attestation that ties the tarball to this workflow run and commit.

## Versioning

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

| Change | Bump |
| --- | --- |
| Breaking change to the plugin contract, app format, or export map | major |
| New capability, app, command, language or host | minor |
| Fix that keeps every contract | patch |

`-lite.N` marks the plugin-only edition. The universal edition has its own
version line; do not reuse these numbers for it, and do not publish a universal
binary under `@nexlos/os`.

## Repository settings before the first public release

These are repository settings, not files. Apply them once, before the repository
is made public, and re-check them at each major release:

`scripts/harden-repo.sh` applies the automatable half (dry-run by default,
`--apply` to write). `--verify` reads every control back and prints PASS/FAIL
without changing anything, so a setting that drifts back is visible instead of
assumed. What it sets:

- `main`: force pushes and deletion rejected, admins allowed. Approval rules are
  left off so a single maintainer is not locked out of their own release.
- Tag ruleset: `v*`, `plugin-v*` and `update-feed` cannot be moved or deleted.
  A rewritten `update-feed` would replace the signed update entry point.
- Secret scanning with push protection, Dependabot alerts and security updates,
  private vulnerability reporting.
- Actions default token `contents: read`; a job that needs more asks explicitly.

Still manual:

- The About box and topics, so the repository is discoverable once public.
- Discussions, if the issue templates should point there for questions.
- `npm publish --provenance`: the publishing job needs `id-token: write`, which
  is why publishing stays a manual, reviewed step.

## Post-release verification

1. Install the published tarball into an empty project and import both entry
   points:
   `node --input-type=module -e "await import('@nexlos/os')"` and
   `import.meta.resolve('@nexlos/os/client')`.
2. Confirm `npm view @nexlos/os@<version> dist.integrity` matches the tarball
   kept as the `nexlos-os-plugin-v<version>` workflow artifact for that tag, and
   that the provenance attestation lists this repository and the tagged commit.
3. Confirm the release page states the plugin edition's license (Apache-2.0)
   and does not attach binary-license files to the plugin tarball.
4. Open the repository page once: the README renders, the language links
   resolve, and the hero demo loads.

## Universal binary release

The universal edition is built from its own source tree, not from this
repository's plugin tree. Its source is not published. Before any asset is
attached to a release:

1. Resolve outstanding asset-rights questions in that tree; do not attach a
   binary while a redistribution question is open.
2. Build with a pinned toolchain and record the build manifest: Go version,
   commit hash, build tags, `CGO_ENABLED=0`, target triple.
3. Produce the platform matrix and keep the names stable:
   `nexlos-<os>-<arch>` and `nexlos-<os>-<arch>.exe` for Windows.
4. Attach, for every release:

   - the binaries;
   - `LICENSE` (Apache-2.0, for the embedded open components);
   - `NOTICE`;
   - `LICENSE-BINARY.md` (the closed kernel and window shell, copied from `docs/LICENSE-BINARY.md`);
   - `docs/legal/THIRD_PARTY_NOTICES.md`;
   - `SHA256SUMS`;
   - `BUILD-MANIFEST.txt`.

5. State on the release page: which components are open, which are closed, and
   which license text governs each. Never describe a release binary as
   "Apache-2.0" on its own, and never describe the whole binary as proprietary
   without the Apache carve-out.
6. Publish the release as a prerelease until the install path has been verified
   on every advertised platform.
7. Publish or refresh the signed update manifest on the fixed `update-feed`
   pre-release: `latest.json` and `latest.json.sig`. Its `sha256` and `size`
   values must describe the assets attached in step 4 **after** signing and
   notarization, because those change the bytes. The plugin track never writes
   this tag.

## What not to do

- Do not put `LICENSE-BINARY.md` in the npm package. Plugin users receive
  Apache-2.0 terms only.
- Do not attach a universal binary that is a plain build of this repository's
  source and call it "the universal edition". If it is a build of the open tree,
  it is Apache-2.0 and must be described that way.
- Do not delete or replace a published release asset to "fix" a licensing
  mistake. Publish a new version, mark the old one superseded, and explain the
  correction in the release notes.
- Do not ship a binary whose third-party notices are incomplete. The asset
  inventory lives in `docs/legal/THIRD_PARTY_NOTICES.md`; update it in the same commit as
  the asset.

## Verification commands

```sh
bash scripts/stage-public-repo.sh --check-repo .
node --test test/license-scope.test.mjs
npm pack --dry-run --json
tar -tzf nexlos-os-*.tgz | grep -E 'LICENSE|NOTICE|LICENSING'
```

The last command is the one that catches the mistake this repository already
made once: a binary license travelling inside a source package.
