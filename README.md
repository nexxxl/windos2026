# windos2026

**English** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

7.94 MiB. A 2026 AI-native, ultra-light operating system: alien technology in the millennium, your private software factory today. Bring anything. Leave with an HTML app.

If a 2026 AI-native operating system had opened on your computer back in the millennium, what would you have used it for?

windos2026 is the DSH plugin edition of NexlOS. It puts a full desktop inside DSH: 17 apps, 25 commands, 8 built-in interface languages, a 7.94 MiB tarball, and one runtime dependency. Generated apps are plain files under `apps/<id>/`; the 17 built-in apps ship as code under `webos/`.

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

Requires Node.js 22+ and a DSH build that can load local bundles. There is no npm release; install from this repository or the local script above.

## Use

- **Open the desktop**: after install, enter the Web desktop. The first launch walks through the hello screen and asks for an interface language.
- **One sentence, one app**: describe what you want in DSH; it generates an embedded app and puts it on the desktop.
- **Bring a repository**: give it a GitHub URL; it clones the repo, finds the entry point, and installs it as a desktop app.
- **Leave with it**: a generated app is just files. Copy `apps/<id>/` and it still runs on another machine.

## What is inside

| Item | Number |
| --- | --- |
| Tarball | 7.94 MiB (measured with `npm pack --dry-run --json`) |
| Unpacked | 12.6 MiB / 293 files |
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
- No CJK office font pack, universal-edition binaries or internal project history in the published tarball or the public source candidate. The tarball's only CJK face is the OFL pixel font declared in THIRD_PARTY_NOTICES.
- No claim that Windows is fully validated; treat the Windows path as alpha and report what breaks.

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

Plugin source and documentation are [Apache-2.0](LICENSE). Trademarks are not granted by Apache-2.0; third-party assets keep their own licenses. Provenance, license texts and porting notes are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); trademark rules in [TRADEMARK.md](TRADEMARK.md); warranty and liability terms in [DISCLAIMER.md](DISCLAIMER.md).

ArtCraft for NexlOS (ArtCraft 移植版) is the worked example shipped with the built-in app generator, and the one place where algorithms come from an upstream project. It installs upstream ArtCraft's editor structure and portable algorithms into NexlOS, then rebuilds them against this project's own contract: commands, a single serializable document state, and a mount/destroy panel. The porting approach and the file-by-file mapping are in [docs/artcraftport/ATTRIBUTION.md](docs/artcraftport/ATTRIBUTION.md): the upstream is storytold's ArtCraft (`github.com/storytold/artcraft`, MIT / Apache-2.0), rewritten here as zero-dependency ES modules under the MIT terms. The Rust renderer, Tauri host and AI calls are not included. This port is **unofficial** and has no affiliation with or endorsement from the upstream team; the name ArtCraft in the app title names the upstream project and is always qualified with "for NexlOS". The app id, route and directory are `artcraftport`.
