# windos2026

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch**

7,94 MiB. Ein AI-natives, ultraleichtes Betriebssystem aus 2026: im Millennium außerirdische Technologie, heute deine private Softwarefabrik. Bring anything. Leave with an HTML app.

Wenn sich im Millennium plötzlich ein AI-natives Betriebssystem aus 2026 auf deinem Computer geöffnet hätte – wofür hättest du es benutzt?

windos2026 ist die DSH-Plugin-Edition von NexlOS. Es bringt einen vollständigen Desktop in DSH: 17 Apps, 25 Befehle, 8 integrierte Oberflächensprachen, ein 7,94-MiB-Tarball und genau eine Laufzeitabhängigkeit. Generierte Apps sind reine Dateien unter `apps/<id>/`; die 17 eingebauten Apps liegen als Code unter `webos/`.

*Übersetzung. Maßgeblich ist das englische README.*

Erinnerst du dich, wie der Desktop deines ersten Computers aussah? Dieser hier kann deiner sein: du baust ihn selbst zusammen, Satz für Satz, und jede App geht als Datei mit dir. Linux gab jedem Programm eine Maschine; NexlOS gibt jedem Agenten einen Computer.

## Drei Dinge bleiben deine

**Dein Modell.** Das Plugin bringt keinen Key mit und setzt keinen Standard-Provider. Es liest, was dein aktuelles DSH-Profil bereits hat, und wenn es kein Modell sieht, sagt es das: die Capability-Schicht antwortet mit `501` samt Grund, und die Modellanzeige meldet `unavailable`, statt Bereitschaft vorzutäuschen.

**Deine Apps.** Sag einen Satz in DSH: der Generator schreibt `apps/<id>/index.html` plus `app.json`, öffnet die Seite im Browser zur Prüfung, repariert sie einmal, wenn diese Prüfung fehlschlägt, und legt das Icon auf deinen Desktop. Kopiere dieses Verzeichnis auf einen beliebigen statischen Server, es läuft weiter; gib ihm eine GitHub-URL, und `importGithubApp` klont das Repository, findet den gebauten Einstiegspunkt und mountet ihn als App.

**Deine Maschine.** 7,94 MiB bringen 17 Apps, 25 Befehle und 8 Oberflächensprachen in den Harness, den du bereits betreibst: keine zweite Control Plane zum Ausrollen, kein Konto, keine Telemetrie. Installiere dasselbe Bundle in einem anderen DSH-Profil, und es nutzt das Modell dieses Profils, nicht unseres.

## Zwei Editionen, zwei Lizenzen

| Edition | Was du bekommst | Lizenz |
| --- | --- | --- |
| **Plugin** (Quellcode dieses Repositorys) | das unten beschriebene 7,94-MiB-Paket | [Apache-2.0](../../LICENSE) |
| **Universal** (Releases) | eine eigenständige Binärdatei mit eigener nativer Fensterhülle | geschlossener Kernel und Hülle unter [NexlOS Binary License 1.0](../LICENSE-BINARY.md); die eingebettete Desktop-Schicht bleibt Apache-2.0 |

Die verbindliche Zuordnung Datei für Datei steht in [LICENSING.md](../legal/LICENSING.md).

Die Universal-Edition ist noch nicht veröffentlicht: Releases bleibt leer, bis die Rechteprüfung ihrer Bestandteile abgeschlossen ist.

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

Erfordert Node.js 22+ und einen DSH-Build, der lokale Bundles laden kann. Es gibt keine npm-Veröffentlichung; installieren Sie aus diesem Repository oder mit dem lokalen Skript oben.

![NexlOS in DSH](../images/host-dsh.jpg)

### Octop (Werkbank)

Der Desktop braucht DSH nicht. Dieselben `webos/` und `index.js` laufen als eigenständiger Host, und ein Befehl fügt Octop einen dauerhaften Eintrag hinzu:

```bash
git clone https://github.com/nexxxl/windos2026.git
cd windos2026
./bin/octop-install install
```

In der Octop-Seitenleiste steht dann **NexlOS desktop**; der Desktop öffnet sich im Hauptarbeitsbereich, und die Befehlsleiste antwortet mit deinem eigenen Octop-Agent. `./bin/octop-install status|up|down|uninstall` verwaltet das. Erfordert Node.js 22+ und ein Octop unter `~/.octop`. Unterschiede je Host, Grenzen und Rückabwicklung: [docs/octop.md](../octop.md).

![NexlOS in Octop](../images/host-octop.jpg)

## Verwendung

- **Desktop öffnen**: nach der Installation den Web-Desktop betreten. Beim ersten Start erscheint der hello-Bildschirm und fragt nach der Oberflächensprache.
- **Ein Satz, eine App**: beschreibe in DSH, was du willst; es erzeugt eine eingebettete App und legt sie auf den Desktop.
- **Ein Repository mitbringen**: gib eine GitHub-URL an; es klont das Repo, findet den Einstiegspunkt und installiert es als Desktop-App.
- **Mitnehmen**: eine generierte App besteht nur aus Dateien. Kopiere `apps/<id>/` und sie läuft auf einer anderen Maschine weiter.

## Was enthalten ist

| Element | Zahl |
| --- | --- |
| Tarball | 7,94 MiB |
| Entpackt | 12,6 MiB / 286 Dateien |
| Apps | 17 |
| Befehle | 25 |
| Oberflächensprachen | 8 integriert, 7 optionale Pakete |
| Themes | 2 (NEXL modern / Windos2026) |
| Laufzeitabhängigkeiten | 1 (`jpeg-js`) |
| Lizenz | Apache-2.0 (Marken und Fremdmaterial ausgenommen) |

Einordnung für 2026, Zuordnung der Suchbegriffe und was dieses Projekt ausdrücklich nicht behauptet: [docs/highlights.md](../highlights.md). Wertseite und häufige Suchen: [docs/faq.md](../faq.md). Nutzungs- und Weitergabegrenzen: [docs/research-use.md](../research-use.md). Zusammenfassung für KI-Crawler: [llms.txt](../../llms.txt).

## Was es nicht tut

- Kein Drittanbieter-Konto und kein gehosteter App-Store; Apps, Code und Daten bleiben auf deiner Maschine.
- Keine Telemetrie.
- Keine Systemänderungen; der Installer schreibt nur Abhängigkeiten und Links des DSH-Profils, und Deinstallieren entfernt genau diese.
- Im veröffentlichten Tarball und im öffentlichen Quellkandidaten stecken kein CJK-Office-Schriftpaket, keine Universal-Edition-Binaries und keine interne Projekt-Historie. Die einzige CJK-Schrift im Tarball ist die OFL-Pixelfont aus THIRD_PARTY_NOTICES.
- Keine Behauptung, Windows sei vollständig validiert; der Windows-Pfad gilt als Alpha.

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

Der Plugin-Quellcode in diesem Repository steht unter Apache-2.0. Die Release-Binärdateien der Universal-Edition folgen einer eigenen Lizenz; die Zuordnung steht in [LICENSING.md](../legal/LICENSING.md), die Bedingungen in [LICENSE-BINARY.md](../LICENSE-BINARY.md).

Plugin-Quellcode und Dokumentation stehen unter [Apache-2.0](../../LICENSE). Marken werden durch Apache-2.0 nicht gewährt; Fremdmaterial behält seine eigenen Lizenzen. Siehe [NOTICE](../legal/NOTICE), [TRADEMARK.md](../legal/TRADEMARK.md) und [THIRD_PARTY_NOTICES.md](../legal/THIRD_PARTY_NOTICES.md).
