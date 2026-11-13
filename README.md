# windos2026

English · [简体中文](README.zh-CN.md)

7 MB. A 2026 AI-native, ultra-light operating system: alien technology in the millennium, your private software factory today. Bring anything. Leave with an HTML app.

If a 2026 AI-native operating system had opened on your computer back in the millennium, what would you have used it for?

windos2026 is the DSH plugin edition of NexlOS. It puts a full desktop inside DSH: 17 apps, 25 commands, 8 built-in interface languages, a 7.31 MiB tarball, and one runtime dependency. Every app on the desktop is an `apps/<id>/index.html` plus an `app.json` — readable, editable, and portable.

## Install

Send the repository URL to DSH, then say:

```text
https://github.com/nexxxl/windos2026
install windos2026
```

DSH clones the repository and installs it into the current profile with `plugin_manager install_bundle`. You can also point it at a local directory:

```text
plugin_manager install_bundle target=/absolute/path/to/windos2026
```

Or install into the local profile without a conversation:

```sh
./scripts/install-posix.sh
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

Requires Node.js 22+ and a DSH build that can load local bundles. The npm package is not published yet; `npm install @nexlos/os` currently returns 404.

## Use

- **Open the desktop**: after install, enter the Web desktop. The first launch walks through the hello screen and asks for an interface language.
- **One sentence, one app**: describe what you want in DSH; it generates an embedded app and puts it on the desktop.
- **Bring a repository**: give it a GitHub URL; it clones the repo, finds the entry point, and installs it as a desktop app.
- **Leave with it**: an app is just files. Copy `apps/<id>/` and it still runs on another machine.

## What is inside

| Item | Number |
| --- | --- |
| Tarball | 7.31 MiB |
| Unpacked | 11.2 MB / 260 files |
| Apps | 17 |
| Commands | 25 |
| Interface languages | 8 built in, 7 optional packs |
| Themes | 2 (NEXL modern / Windos2026) |
| Runtime dependencies | 1 (`jpeg-js`) |
| License | Apache-2.0 (trademarks and third-party assets excepted) |

## What it refuses to do

- No third-party account and no hosted app store; apps, code and data stay on your machine.
- No telemetry.
- No system changes; the installer only writes DSH profile dependencies and links, and uninstalling removes exactly those.
- No bundled CJK fonts, universal-edition binaries or internal history; none of that is in this repository.
- No claim that Windows is fully validated; the known boundaries are in [Windows validation](docs/windows-validation.md).

## Develop

```sh
npm ci
npm run check
npm test
npm pack --pack-destination /absolute/path/to/artifacts
```

Size gate:

```sh
./scripts/verify-lite.sh
```

## License

Plugin source and documentation are [Apache-2.0](LICENSE). Trademarks are not granted by Apache-2.0; third-party assets keep their own licenses. See [NOTICE](NOTICE), [TRADEMARK.md](TRADEMARK.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
