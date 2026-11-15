# Licensing

NexlOS ships in two forms, and they carry two different licenses. This page is
the map. It is the authoritative statement of which license covers which file,
directory and release artifact in this repository.

| Artifact | License | Text |
| --- | --- | --- |
| Source code in this repository (the plugin edition) | Apache License 2.0 | [LICENSE](LICENSE) |
| Compiled release binaries of the universal edition | NexlOS Binary License 1.0 | [LICENSE-BINARY.md](LICENSE-BINARY.md) |
| Third-party libraries, fonts, images, audio | Their upstream licenses | [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the license files shipped beside each asset |
| Names, logos, icons, theme names | Trademark policy, not a copyright license | [TRADEMARK.md](TRADEMARK.md) |
| Warranty and liability | Both editions | [DISCLAIMER.md](DISCLAIMER.md) |

## 1. Source code: Apache-2.0

Everything committed to this repository is Apache-2.0 unless a file or directory
says otherwise. That includes `webos/`, `vendor/`, `extension/`, `locale/`,
`extras/`, `lib/`, `test/`, `scripts/`, `.github/` and `docs/`.

Apache-2.0 lets you use, modify, redistribute and sell this source, including in
proprietary products, as long as you keep the copyright and notice requirements.
It is not a non-commercial license.

Path-level exceptions, each with its own terms:

- `webos/a/vendor/` and `vendor/` — upstream code and fonts, retained under their
  own licenses; the Apache-2.0 grant above does not relicense them.
- `webos/a/office/fonts/` — CJK fonts are not distributed in this repository;
  their license texts ship with the optional font pack.
- `webos/a/wallpapers/`, `webos/a/media/` — see the `NOTICE.md` beside each asset.
- `docs/artcraftport/` — port notes for the ArtCraft port; the ported code is
  Apache-2.0 here, the upstream project keeps its own MIT / Apache-2.0 terms.

## 2. Release binaries: NexlOS Binary License 1.0

The universal edition is published as compiled binaries from this repository's
Releases page. Those binaries are **not** a build of the source tree alone: they
add a closed Go kernel and a native window shell, and they embed the desktop
layer that is published here under Apache-2.0.

The split matters:

- **Apache-2.0 survives inside the binary.** For every component that also
  exists in this repository, the Apache-2.0 grant in [LICENSE](LICENSE) applies
  to the copy you receive in the binary. The binary license adds no restriction
  on those components and cannot revoke rights you already have.
- **The additional terms cover only the closed components** — the kernel and the
  native window shell — plus the official build, branding and update channel.
- **A build of this repository's source is not the universal edition.** You may
  build, modify, redistribute and even sell what you build from this source. You
  may not present it as the official universal binary or as a NexlOS release.

Read [LICENSE-BINARY.md](LICENSE-BINARY.md) before installing a release binary.

## 3. Third-party components

Third-party libraries, fonts, images and audio keep their upstream licenses. The
full inventory, including per-file provenance, is in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Where a third-party license
conflicts with either license above, the third-party license governs that
component.

Notable cases:

- The retro pixel font under `webos/a/vendor/retro-font/` is CC BY-SA 3.0; the
  attribution and ShareAlike terms are in that directory's `README.md`.
- Wallpaper photographs are Pexels-licensed and are excluded from the Apache-2.0
  grant; see `webos/a/wallpapers/NOTICE.md`.
- Example audio in `webos/a/media/` is original work by NexlOS Authors; see that
  directory's `NOTICE.md`.

## 4. Trademarks

Apache-2.0 and the binary license grant no trademark rights. NexlOS, Windos2026,
their logos and icons are marks claimed by NexlOS Authors; [TRADEMARK.md](TRADEMARK.md)
states what you may and may not do with them.

## 5. Contributions

Contributions are accepted under the Apache-2.0 terms of this repository, with a
Developer Certificate of Origin sign-off in each commit; see
[CONTRIBUTING.md](CONTRIBUTING.md) and [DCO](DCO). Submitting a contribution
means you have the right to license it under those terms.

## 6. What this repository does not license

- The source of the universal edition's closed components. It is not in this
  repository and is not licensed by any file here.
- The contents of your workspace, the apps you generate, and the documents you
  create. They belong to you.
- Output of third-party models or services you connect through DSH. Their terms
  apply, not ours.
- Any translation of this page. Only the English text is authoritative.

## 7. How to verify

```sh
git ls-files | grep -E '^(LICENSE|NOTICE|LICENSING|LICENSE-BINARY|TRADEMARK|DISCLAIMER)'
npm pack --dry-run --json          # the plugin package must not carry LICENSE-BINARY.md
node --test test/license-scope.test.mjs
```

`test/license-scope.test.mjs` fails if the plugin package starts shipping the
binary license, if the map loses an edition, or if any required license file
disappears.
