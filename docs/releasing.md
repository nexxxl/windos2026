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
7. Tag the commit (`v<version>`) and push the tag. The `release` workflow
   re-runs the gates on the tag, packs the tarball, runs the contract test on
   that tarball, and creates the GitHub Release with the tarball attached. It
   fails if the tag and `package.json` disagree.
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

- Branch protection on `main`: require the `plugin-ci` checks, require a pull
  request, disallow force pushes, and require linear history.
- Secret scanning and push protection enabled; Dependabot alerts enabled.
- Private vulnerability reporting enabled, so `SECURITY.md` has a working path.
- Discussions enabled, because the issue templates point there for questions.
- About box and topics filled in, so the repository is discoverable after the
  first public push.
- `npm publish --provenance` available: the workflow needs `id-token: write` in
  the publishing job, which is why publishing stays a manual, reviewed step.

## Post-release verification

1. Install the published tarball into an empty project and import both entry
   points:
   `node --input-type=module -e "await import('@nexlos/os')"` and
   `import.meta.resolve('@nexlos/os/client')`.
2. Confirm `npm view @nexlos/os@<version> dist.integrity` matches the tarball
   attached to the GitHub Release, and that the provenance attestation lists
   this repository and the tagged commit.
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
