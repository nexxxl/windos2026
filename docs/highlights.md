# Highlights and search terms

This page maps the phrases people search for in 2026 to what this repository
actually contains. Each row points at the file or command that proves the claim,
so you can check it before installing anything.

If a row says "not here", it means the capability does not exist in this tree and
the project will not pretend otherwise.

## What you get, by search phrase

| You searched for | What this repository gives you | Where to verify |
| --- | --- | --- |
| AI-native operating system, agent OS, web OS | An operating-system layer for agents: a shell, 17 built-in apps, 25 commands, settings, storage and a window manager. It runs inside a host (DSH or Octop) instead of replacing your kernel. | `webos/`, `index.js`, [octop.md](octop.md) |
| Agent computer, computer use | Each agent session can own a live workspace. The desktop is the surface; generated apps are the artifacts that outlive the session. | `importGithubApp` and `apps/<id>/` handling in `index.js` |
| Software factory | One sentence becomes `apps/<id>/index.html` plus `app.json`; a temporary Chromium loads the page, checks console errors and declared interactions, repairs once if the check fails, then puts the icon on the desktop. | `src/appgen.js`, `src/app-verifier.js`, [factory.md](factory.md) |
| App reconstruction, behavior capture | The factory works at the browser surface: capture behavior, write a spec, rebuild, compare against a target you have the right to run. It does not touch binaries. | [factory.md](factory.md) |
| Tiny, deployable anywhere | 7.95 MiB tarball, 12.6 MiB unpacked, 293 files, one runtime dependency (`jpeg-js`), no account and no telemetry. | `npm pack --dry-run --json`, `scripts/verify-lite.sh` |
| BYOK, bring your own model, local-first | The bundle ships no key and sets no default provider. It reads the model already configured in your DSH profile, and reports `501` with a reason when it cannot see one. | `lib/capabilities.js` |
| Single-file HTML app, portable app format | Generated apps are plain files. Copy `apps/<id>/` to any static server and it still runs; hand the desktop a GitHub URL and it clones the repository, finds the built entry point, and mounts it as an app. | `apps/<id>/index.html`, `app.json` |
| Agent plugin, skill packaging, DSH bundle | One bundle installed with `plugin_manager install_bundle`; the same `webos/` tree also runs as a standalone host under Octop. | `cordis.patch.yml`, `bin/octop-install`, [octop.md](octop.md) |
| WebGL, GPU interface | The relationship graph batches its points through WebGL, and the desktop companion renders through a WebGL2 shader with a Canvas2D fallback. | `webos/a/graph.js`, `webos/a/companion-render.js` |
| Multilingual interface | 8 interface languages built in, 7 optional language packs. | `locale/`, `extras/` |
| Clean-room friendly, bring any repository | Repositories you already have the rights to can be imported and mounted. The import path reads project structure and build output; it does not disassemble binaries. | `importGithubApp` in `index.js` |
| Three.js, WebGPU, three-live | The universal edition adopts Three.js as its only 3D author layer, with glTF/GLB plus KTX2, Draco and meshopt assets, on our own WebGL2/WebGPU surface. This tarball ships the app layer only. | [factory.md](factory.md) |

## Where this project sits in 2026

- **Agents need a place to work.** The 2026 wave is about giving agents a computer,
  a browser and a filesystem, not another chat box. This repository is the surface
  layer of that idea: a shell, apps, and a workspace that a host can hand to an agent.
- **Small is a feature.** "Tiny, fast, deployable anywhere" is now a category, not a
  compromise. 7.95 MiB with one dependency is the same instinct applied to a desktop.
- **The artifact outlives the session.** Generated apps are files, not rows in a
  hosted database. That is what makes them portable between hosts and machines.
- **Local-first is a buying criterion.** No account, no telemetry, no default
  provider: the model stays the user's, and the desktop stays on the machine.
- **Verification is the product.** Generating code is cheap in 2026; checking it is
  not. The generator's browser check and single repair pass are the part that makes
  the factory usable.

## What this project does not claim

- **No 3D engine in this tarball.** The graph view batches through WebGL and the
  desktop companion renders through a WebGL2 shader, but there is no scene graph,
  no glTF pipeline and no browser game runtime here. The universal edition adds a
  Three.js author layer and a WebGPU host; see [factory.md](factory.md).
- **No binary reverse engineering.** It does not decompile, disassemble, decrypt or
  patch compiled artifacts, and it does not circumvent DRM or access controls.
- **No hosted app store.** Apps are local files; there is no marketplace, account
  system or sync service.
- **Not a Linux distribution and not a kernel.** The universal edition ships its own
  native window shell; the plugin edition runs inside an existing host.
- **Windows is alpha.** Treat the Windows install path as untested and report what
  breaks.

## If you arrived from REA or Craft Anything

Those projects answer a different question: *how does this software work, and how do
I rebuild it?* This repository answers the question after that: *where do I run the
result?* The import path takes a repository you have the rights to, finds its built
entry point, and mounts it as a desktop app. The factory also covers the web half of
that loop: capture behavior in a browser, write a spec, rebuild, and verify the
result. It stops at the browser surface; binaries are out of scope. If you need to
understand a closed artifact, use a reverse-engineering tool. If you need a portable
place to run what you built, use this.

Use and redistribution boundaries are in [research-use.md](research-use.md).
