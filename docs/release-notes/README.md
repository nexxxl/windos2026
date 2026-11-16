# Release notes

One file per released version, kept in the repository so the notes survive the
Release page and can be diffed against the code.

## Convention

- File name: `v<version>.md` for the English body, `v<version>-zh.md` when a
  Chinese translation is published. Other languages follow the same pattern.
- Source: start from [../release-notes-template.md](../release-notes-template.md).
  The GitHub Release body is this file, copied verbatim; the page and the
  repository must not disagree.
- Write the notes when the artifacts are frozen. Every version number, asset
  name and size in the file must come from the build that is being published.
- State what is not verified. An unsigned build, an untested platform and a
  missing feature belong in the notes, and a later release corrects them in
  public.

## What belongs in a file

1. One paragraph on what changed, written for someone who has not followed the
   commit log.
2. The download table with exact asset names, platform requirements and sizes.
3. Install steps for macOS and Windows, terminal first.
4. Verification: `SHA256SUMS`, the Ed25519 update manifest, and where the
   public key is documented.
5. Known limitations, including signing status and platform coverage.
6. License map: Apache-2.0 for the plugin and the embedded desktop layer,
   NexlOS Binary License 1.0 for the closed kernel, shell and updater.

## Files

- [../release-notes-template.md](../release-notes-template.md) — the template
  every version file starts from.
- [../releasing.md](../releasing.md) — the build and audit sequence that
  produces the artifacts these notes describe.
