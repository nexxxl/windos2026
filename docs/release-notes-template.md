# NexlOS <version>

NexlOS is a self-contained AI-native desktop: its own window shell, the desktop
layer you can read in the plugin edition, and an updater that verifies a signed
manifest. This release is the **universal edition** — no Node.js, no DSH, no
Octop. Download, unzip, run.

Not sure which form you want? The 7.94 MiB **plugin edition** runs inside DSH or
Octop and is Apache-2.0 throughout; it installs from the repository, not from
here. This page is the standalone build.

## Downloads

| Platform | Asset | Notes |
| --- | --- | --- |
| macOS, Apple Silicon | `NexlOS-<version>-darwin-arm64-candidate.zip` | macOS 12 or newer |
| macOS, Intel | `NexlOS-<version>-darwin-amd64-candidate.zip` | macOS 12 or newer |
| Windows x64 | `NexlOS-<version>-windows-amd64-candidate.zip` | Windows 10/11, WebView2 runtime |

Also attached: `SHA256SUMS`, `LICENSE`, `NOTICE`, `LICENSE-BINARY.md`,
`THIRD_PARTY_NOTICES.md`, `BUILD-MANIFEST.txt`.

## Install from a terminal (recommended)

This build carries no Developer ID and no Authenticode certificate. A terminal
download does not get the browser's quarantine / Mark-of-the-Web attribute, so
the app starts without a security prompt.

**macOS** — swap `arm64` for `amd64` on an Intel Mac:

```sh
TAG=<tag>                        # e.g. v0.6.15
gh release download "$TAG" -R nexxxl/windos2026 -p '*darwin-arm64*.zip'
unzip -q NexlOS-*-darwin-arm64-candidate.zip -d /tmp/nexlos
mv /tmp/nexlos/NexlOS-*/NexlOS.app /Applications/
```

Without `gh`:

```sh
TAG=<tag>
curl -fL -o /tmp/nexlos.zip \
  "https://github.com/nexxxl/windos2026/releases/download/$TAG/NexlOS-${TAG#v}-darwin-arm64-candidate.zip"
unzip -q /tmp/nexlos.zip -d /tmp/nexlos
mv /tmp/nexlos/NexlOS-*/NexlOS.app /Applications/
```

**Windows (PowerShell, x64):**

```powershell
$tag = '<tag>'
gh release download $tag -R nexxxl/windos2026 -p '*windows-amd64*.zip'
Expand-Archive .\NexlOS-*-windows-amd64-candidate.zip -DestinationPath "$env:LOCALAPPDATA\NexlOS" -Force
& "$env:LOCALAPPDATA\NexlOS\NexlOS-*\nexlos.exe"
```

## If you downloaded the ZIP in a browser

macOS 15 removed the right-click override, so clear the attribute once:

```sh
xattr -dr com.apple.quarantine /Applications/NexlOS.app
```

Windows — unblock before running:

```powershell
Unblock-File -Path .\nexlos.exe
```

**Why the warning appears.** No Apple Developer ID and no Windows Authenticode
certificate are in place; both are paid annual programs and both are on the
roadmap. The binary is built from this repository's tagged source by
`scripts/release/build.py`. On Apple Silicon it is signed ad-hoc because the
kernel requires a signature to execute the process at all; ad-hoc signing is not
a trust statement.

Verify what you downloaded:

```sh
shasum -a 256 -c SHA256SUMS          # macOS
certutil -hashfile nexlos.exe SHA256 # Windows
```

The published digests are in `SHA256SUMS` and in `BUILD-MANIFEST.txt`.

## Updates

The app checks a manifest signed with an Ed25519 release key that is compiled
into the binary, published on the fixed `update-feed` pre-release. A manifest
that does not verify is discarded. Nothing replaces the running binary on its
own: you close NexlOS and move the new build into place. Details:
`docs/UPDATES.md` in the repository.

## Licenses

This is a mixed-license product, and neither half describes the whole:

- The embedded desktop layer keeps **Apache-2.0**.
- The kernel, window shell and updater are under the **NexlOS Binary License
  1.0** (`LICENSE-BINARY.md`).
- Third-party components and assets keep their own terms
  (`THIRD_PARTY_NOTICES.md`).

Reading `LICENSE` alone gives you the Apache-2.0 half only.

## Known limitations

- **Windows is alpha.** The shell is a pinned prebuilt input, not rebuilt on the
  macOS build host, and the install path has not been validated on a clean
  Windows machine.
- **No code signing.** Covered above; it is the reason for the extra steps.
- **Your model, your keys.** NexlOS ships no key and sets no default provider. It
  reads the model configuration already on the machine and says so when it
  cannot see one.
- **Apple Silicon device QA** beyond the build host is still outstanding.

Found something broken? Open an issue with the version, platform and what you
did. If it is a security issue, use the private reporting route in
`SECURITY.md` instead of a public issue.
