# windos2026

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch**

7 MB. Ein AI-natives, ultraleichtes Betriebssystem aus 2026: im Millennium außerirdische Technologie, heute deine private Softwarefabrik. Bring anything. Leave with an HTML app.

Wenn sich im Millennium plötzlich ein AI-natives Betriebssystem aus 2026 auf deinem Computer geöffnet hätte – wofür hättest du es benutzt?

windos2026 ist die DSH-Plugin-Edition von NexlOS. Es bringt einen vollständigen Desktop in DSH: 17 Apps, 25 Befehle, 8 integrierte Oberflächensprachen, ein 7,31-MiB-Tarball und genau eine Laufzeitabhängigkeit. Jede App auf dem Desktop besteht aus `apps/<id>/index.html` und einer `app.json` – lesbar, änderbar, mitnehmbar.

*Übersetzung. Maßgeblich ist das englische README.*

## Installation

Sende die Repository-URL an DSH und sage:

```text
https://github.com/nexxxl/windos2026
installiere windos2026
```

DSH klont das Repository und installiert es mit `plugin_manager install_bundle` in das aktuelle Profil. Du kannst auch direkt auf ein lokales Verzeichnis zeigen:

```text
plugin_manager install_bundle target=/absolute/path/to/windos2026
```

Oder ohne Konversation in das lokale Profil installieren:

```sh
./scripts/install-posix.sh
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

Erfordert Node.js 22+ und einen DSH-Build, der lokale Bundles laden kann. Das npm-Paket ist noch nicht veröffentlicht; `npm install @nexlos/os` liefert derzeit 404.

## Verwendung

- **Desktop öffnen**: nach der Installation den Web-Desktop betreten. Beim ersten Start erscheint der hello-Bildschirm und fragt nach der Oberflächensprache.
- **Ein Satz, eine App**: beschreibe in DSH, was du willst; es erzeugt eine eingebettete App und legt sie auf den Desktop.
- **Ein Repository mitbringen**: gib eine GitHub-URL an; es klont das Repo, findet den Einstiegspunkt und installiert es als Desktop-App.
- **Mitnehmen**: eine App besteht nur aus Dateien. Kopiere `apps/<id>/` und sie läuft auf einer anderen Maschine weiter.

## Was enthalten ist

| Element | Zahl |
| --- | --- |
| Tarball | 7,31 MiB |
| Entpackt | 11,2 MB / 260 Dateien |
| Apps | 17 |
| Befehle | 25 |
| Oberflächensprachen | 8 integriert, 7 optionale Pakete |
| Themes | 2 (NEXL modern / Windos2026) |
| Laufzeitabhängigkeiten | 1 (`jpeg-js`) |
| Lizenz | Apache-2.0 (Marken und Fremdmaterial ausgenommen) |

## Was es nicht tut

- Kein Drittanbieter-Konto und kein gehosteter App-Store; Apps, Code und Daten bleiben auf deiner Maschine.
- Keine Telemetrie.
- Keine Systemänderungen; der Installer schreibt nur Abhängigkeiten und Links des DSH-Profils, und Deinstallieren entfernt genau diese.
- Keine gebündelten CJK-Schriften, Universal-Edition-Binaries oder interne Historie; nichts davon ist in diesem Repository.
- Keine Behauptung, Windows sei vollständig validiert; die bekannten Grenzen stehen in der [Windows-Validierung](docs/windows-validation.md).

## Entwicklung

```sh
npm ci
npm run check
npm test
npm pack --pack-destination /absolute/path/to/artifacts
```

Größen-Gate:

```sh
./scripts/verify-lite.sh
```

## Lizenz

Plugin-Quellcode und Dokumentation stehen unter [Apache-2.0](LICENSE). Marken werden durch Apache-2.0 nicht gewährt; Fremdmaterial behält seine eigenen Lizenzen. Siehe [NOTICE](NOTICE), [TRADEMARK.md](TRADEMARK.md) und [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
