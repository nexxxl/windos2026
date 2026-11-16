# Running NexlOS on Octop

NexlOS needs a host. DSH is the default one; Octop is the other. Both run the same
`src/webos/` tree and the same `index.js`, so a release is aligned by construction rather
than by copying a snapshot.

Octop cannot load a DSH bundle: it has no Cordis runtime, and its plugin API
(`tool`, `skill`, `hook`, `channel` plus tool-result renderers) has no navigation slot.
This host therefore runs the desktop as a standalone Node server and adds one entry to
the Octop dashboard.

## Requirements

- Node.js 22 or newer on the same machine as Octop.
- An Octop install under `~/.octop` (macOS or Linux). Windows is untested.
- Node dependencies: `npm ci` in the repository, or let the installer run `npm install`.

## Install

```bash
git clone https://github.com/nexxxl/windos2026.git
cd windos2026
./scripts/octop-install install
```

`install` does four things:

1. copies `src/host/octop/entry.js` to `<octop>/dashboard/nexlos-entry.js`;
2. adds one `<script>` tag to `<octop>/dashboard/index.html`, after saving
   `index.html.nexlos-backup`;
3. writes and starts a per-user service (`com.nexlos.octop-desktop` on macOS,
   `nexlos-octop.service` on Linux) that runs `src/host/octop/server.mjs`;
4. opens Octop.

The sidebar then shows a persistent **NexlOS desktop** item. Clicking it opens the
desktop in the main workspace; the command bar answers with your Octop agent and the
model indicator shows `octop · <model>`.

## Commands

| Command | Effect |
| --- | --- |
| `./scripts/octop-install install` | inject the entry, register and start the service |
| `./scripts/octop-install status` | service health, launchd state, Octop, injection, backup |
| `./scripts/octop-install up` | make sure the service runs, then open Octop |
| `./scripts/octop-install down` | stop the desktop service, keep the entry |
| `./scripts/octop-install uninstall` | restore `index.html`, remove the entry and the service |
| `./scripts/octop-install doctor` | Node version, dependencies, `src/webos/`, Octop venv, port |

Environment: `NEXLOS_PORT` (default `8090`), `NEXLOS_HOME` (default
`~/Library/Application Support/NexlOS`, shared with the DSH edition), `OCTOP_URL`
(default `http://127.0.0.1:8088`), `NEXLOS_BIND` (default `127.0.0.1`), `NEXLOS_STATE_DIR`
(default `~/.nexlos-octop`).

## What the two hosts share

The desktop shell, the 17 built-in apps, `apps/<id>/` generation, the file commands,
the appearance and language packs. Generated apps live under the same NexlOS home, so an
app made in DSH is on the Octop desktop and the other way round.

## What differs

| Area | DSH | Octop |
| --- | --- | --- |
| Start | plugin bundle inside the harness | standalone Node server behind a dashboard entry |
| Entry | desktop is the main panel | sidebar item, desktop fills the main workspace |
| Model | the model in your DSH profile | your Octop agent (`octop · <model>`) |
| Terminal | works (host PTY service) | unavailable: the standalone host has no PTY; `term.info` returns `enabled:false` with a reason |
| Session tools, subagents, browser bridge | provided by DSH | not present; those commands answer `501` with a reason |
| Files, apps, commands, themes, languages | same | same |

The `501` answers are deliberate: a command that cannot run says so instead of returning
an empty success.

## What the installer touches

- `<octop>/dashboard/index.html`: one appended `<script>` tag; the original is kept as
  `index.html.nexlos-backup`.
- `<octop>/dashboard/nexlos-entry.js`: the entry script; removed on uninstall.
- `~/Library/LaunchAgents/com.nexlos.octop-desktop.plist` (macOS) or
  `~/.config/systemd/user/nexlos-octop.service` (Linux).
- `~/.nexlos-octop/config.json` and `desktop.log`.
- Desktop data stays in the NexlOS home; uninstall does not delete it.

Octop's Python packages, database and configuration are not modified. The distribution
is not redistributed either: the installer acts on the copy the user already has.
Octop and octop-harness are MIT-licensed, so local modification is permitted; this route
is chosen because it keeps upgrade and support responsibility with the host.

## Known limits

- **The entry is a DOM injection, not an official navigation slot.** If an Octop upgrade
  changes the sidebar markup, the anchor in `entry.js` may stop matching. Re-running the
  installer does not fix that; the anchor has to be re-checked.
- **Octop upgrades reset `index.html`.** Re-run `./scripts/octop-install install`.
- **One account.** The bridge reads `~/.octop/credential.txt` (the admin account) and uses
  it for every desktop session. Multi-user deployments need per-user tokens first; do not
  treat this as multi-tenant.
- **The iframe uses `localhost` while Octop serves `127.0.0.1`.** They must stay different
  origins: same-origin iframes share the host's renderer process, and Octop's long tasks
  then stall the desktop's frame loop.
- **Loopback only.** `NEXLOS_BIND` defaults to `127.0.0.1`; the file commands have no second
  authentication layer, so do not expose the port.

## Verify

```bash
./scripts/octop-install status
curl -s http://127.0.0.1:8090/agent/status
```

The second command should report `"provider":"octop"` with your agent and model. In Octop,
open the sidebar entry: the desktop boots, the language wizard runs on a fresh home, and
the taskbar model chip shows the Octop agent.

## Rollback

```bash
./scripts/octop-install uninstall
```

This restores `index.html`, removes `nexlos-entry.js` and the service. The desktop data in
the NexlOS home is untouched.
