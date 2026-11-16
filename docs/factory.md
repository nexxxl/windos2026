# The software factory

This project is described as a software factory. This page says what that means
in practice: what the production line does, what it records, and where each
edition stops.

## Why a factory and not a generator

Generating code is cheap in 2026. The expensive part is knowing whether the
result works. The factory is built around that second part:

1. **Intent.** One sentence describes the app.
2. **Build.** A template is used when it matches; otherwise the model writes a
   single-file app, capped at 250 lines, 2 MiB and 180 seconds.
3. **Verify.** A temporary Chromium loads the page from a one-shot local origin.
   The verifier checks console errors and the interactions the spec declares,
   then tears the browser and server down.
4. **Repair once.** A failure carries the error text and the DOM facts back into
   one repair pass. The repaired page is verified again.
5. **Install.** Only a page that passes becomes `apps/<id>/index.html` plus
   `app.json`; the icon appears on the desktop.
6. **Leave.** Copy the directory to any static server and it still runs.

The important artifact is not the HTML. It is the record that the HTML was
checked. In the native editions the same pipeline also writes a per-round check
file and, for packaged apps, a signed manifest.

## Two production lines

The universal edition runs two lines that share one spine:

| Line | Input | Output |
| --- | --- | --- |
| HTML apps and games | a sentence, a template, or an imported repository | a single-origin app directory, checked in a browser |
| Three.js interactive content | a scene brief, assets, and a beat sheet | a scene package with contracts, reference frames and checks |

The shared contracts are plain JSON: `craft.json` for the build request,
`nexlos.spec.json` for behavior, `capture.json` for recorded evidence,
`check.json` for the verdict. A generated app can also carry `nexlosSelfTest()`,
which the harness calls as an extra gate. Contracts are versioned; adding an
optional field does not bump the version, breaking changes do.

## Three-tier acceptance

The native shell and the factory split responsibility on purpose:

- **The shell** answers "does it run, how fast, and what does it say when it
  fails". It owns capability probes, the manifest gate, window modes, pointer
  lock, the performance ledger, the bridge whitelist and package signatures.
- **The factory** answers "does the picture match, and does the task complete".
  It owns templates, the asset pipeline, behavior cases, reference frames,
  difference maps and the regression ledger.

Acceptance runs in three tiers: static audit, runtime and performance budget,
then visual and behavioral comparison. Each tier is recorded; a failure names
the tier.

## The 3D author layer

Where 3D exists, Three.js is the only authoring layer. Assets are glTF/GLB with
KTX2, Draco or meshopt compression. Rendering stays in our own WebGL2/WebGPU
surface; the factory does not adopt a third-party scene runtime or a Rust VM.
The decoder work (for example meshopt buffer rewriting) is covered by tests in
the release edition.

Headless rendering is a verification tool, not a shipping path: it produces
reference frames, contact sheets and silhouette differences under software
rendering. Frame rates measured there do not represent real hardware, and the
factory does not pretend they do.

## Where the line stops

The factory works at the browser surface. It captures behavior, writes a spec,
rebuilds the app, and compares the result against targets you have the right to
run locally.

It does **not**:

- decompile, disassemble or patch binaries;
- ship a Rust reverse-engineering engine;
- copy third-party code or assets;
- treat a screenshot as proof that a task completed.

That boundary is deliberate. It keeps the verification honest and the legal
surface small.

## Edition map

| Capability | Plugin (this tarball) | Universal (in progress) | Pad |
| --- | --- | --- | --- |
| Sentence-to-app generation | Yes | Yes | Consumes output |
| Headless browser verification and one repair | Yes | Yes, three tiers | Partial |
| Import a repository and mount it | Yes | Yes | No |
| Signed app packages and trust | No | Yes | Consumes output |
| Three.js author layer and 3D checks | No | Yes | No |
| WebGPU host | No | Yes | No |
| Surface API (agent reads the UI as an action list) | No | No | Yes |
| Binary reverse engineering | No | No | No |

The plugin edition is the published one. The universal edition is still in
asset-rights review, so its rows describe work in progress, not a download.
