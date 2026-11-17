# Updates

NexlOS release builds can tell you when a newer build exists. The check reads a signed manifest from this repository and makes no other network request.

The request is anonymous. While this repository is private, the check returns 404
and **Settings → Update and security** reports the failure; the channel starts
working when the repository is public.

## How it works

- The manifest lives on a fixed pre-release tag, `update-feed`, at
  `https://github.com/nexxxl/windos2026/releases/download/update-feed/latest.json`.
  Normal version releases never take that address, so it does not move between releases.
- `latest.json` is signed with Ed25519. The public key is compiled into the binary. A manifest that does not verify is discarded, and the failure is reported in **Settings → Update and security**.
- The manifest lists one package per platform (`GOOS/GOARCH`). The app picks the exact match for the machine it runs on; a near miss is not substituted.
- A package download is checked against the `size` and `sha256` recorded in the signed manifest while it streams to disk. A mismatch deletes the partial file.
- Downloads are written under `$NEXLOS_HOME/updates/<version>/`. Nothing replaces the running binary on its own: you close NexlOS and move the new build into place.

## Schedule

The first check runs 30 seconds after the desktop paints. After that, at most one check per 24 hours, plus a small per-machine offset so a fleet does not check at the same second. Failures back off exponentially from 48 hours up to 7 days. Manual checks in Settings ignore the schedule and show the real error.

The local state is a single file, `$NEXLOS_HOME/update.json`. Delete it to make the next automatic check run immediately. It stores only when the app last checked, how many failures it saw, and where a download was saved.

## When the channel is closed

The channel is closed unless the build compiled in a release key. A build without one makes no request at all: **Settings → Update and security** says the channel is not configured and names the reason. This is the state of builds produced before the release key exists.

## Verifying a manifest yourself

The release key is:

```
public key  rnY8HGD4b5haQboK1WsXRx7wi3Y5B2ZvtHVFYgNulIM=
fingerprint ed25519:a8dcfdce0dafbc50
```

The public key is the raw 32-byte Ed25519 key, base64 encoded; the fingerprint
is the first 16 hex characters of its SHA-256. To check that a `latest.json`
matches its `.sig` without running NexlOS:

```sh
printf '%s' 'rnY8HGD4b5haQboK1WsXRx7wi3Y5B2ZvtHVFYgNulIM=' | base64 -d > key.bin
base64 -d < latest.json.sig > latest.sig.bin
python3 - <<'PY'
import pathlib
open("spki.der","wb").write(bytes.fromhex("302a300506032b6570032100") + pathlib.Path("key.bin").read_bytes())
PY
openssl pkeyutl -verify -pubin -keyform DER -inkey spki.der -rawin \
  -in latest.json -sigfile latest.sig.bin
```

`Signature Verified Successfully` means the manifest was signed by the holder of
the release key. It says nothing about whether that holder was careful, which is
why the key stays offline.

## What this is not

The check is a convenience. It is not a licence check, not telemetry, and not a remote control. The app sends no identifier, no version and no usage data: it fetches two public files. The signature stops a modified manifest from being accepted; it does not stop someone with the private key from publishing a manifest, which is the point of a release key.

For the operator steps that build and sign the manifest, see [`docs/releasing.md`](releasing.md) in the source distribution and the release scripts' README.
