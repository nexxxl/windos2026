# Releasing

This repository publishes two kinds of artifact. They have different licenses and
different review requirements, so they ship on different tracks.

| Track | Artifact | License | Where |
| --- | --- | --- | --- |
| Plugin | `@nexlos/os` tarball + source tree | Apache-2.0 | npm, plus the tagged commit |
| Universal | per-platform static binaries | NexlOS Binary License 1.0 (Apache-2.0 parts keep their grant) | GitHub Releases |

The authoritative license map is [LICENSING.md](../LICENSING.md).

## Plugin release

1. `npm run check`, `npm test`, `./scripts/verify-lite.sh` all green.
2. `bash scripts/stage-public-repo.sh /tmp/candidate` then
   `bash scripts/stage-public-repo.sh --check /tmp/candidate`.
3. `bash scripts/stage-public-repo.sh --check-repo .` on the pushed tree.
4. `npm pack --dry-run --json`: record size, file count, unpacked size. Update
   the numbers in `README.public*.md` and `README-LITE.md` in the same commit.
5. Confirm the tarball does **not** contain `LICENSE-BINARY.md` or `EULA.md`
   (`node --test test/license-scope.test.mjs` enforces this).
6. Tag the commit (`v<version>`), push the tag, publish to npm.

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
   - `THIRD_PARTY_NOTICES.md`;
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
  inventory lives in `THIRD_PARTY_NOTICES.md`; update it in the same commit as
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
