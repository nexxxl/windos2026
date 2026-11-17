# Positioning and discovery notes

Snapshot taken 2026-11-16 from the public GitHub weekly trending page and the
GitHub search API. Star counts move daily; treat them as a reading of the week,
not a permanent ranking.

This page records what the 2026 vocabulary looks like, which parts of it this
project can honestly claim, and what to watch over the next six months. It is a
maintainer note, not marketing copy.

## What the week looked like

Weekly trending, 2026-11-09 to 2026-11-16:

| Project | Stars this week | Description as written |
| --- | --- | --- |
| `meta/astryx` | +13,501 | "An open source design system that's fully customizable and agent ready" |
| `anthropics/skills` | +6,077 | "Public repository for Agent Skills" |
| `milind-soni/OpenMausBot` | +5,463 | "Open-source Grok Bot alternative with a virtual machine that bots can use" |
| `google/elephant-goldfish-model` | +5,060 | "Open-source plugin for designing and reviewing software with agents" |
| `vercel-labs/agent-browser` | +4,217 | "Browser automation CLI for AI agents" |
| `addyosmani/agent-skills` | +3,889 | "Production-grade engineering skills for AI coding agents" |
| `backnotprop/plannotator` | +1,719 | "The workspace to stay in the loop and on top of agents" |

Search results for the same period, grouped by phrase:

| Phrase | Representative project | Description as written |
| --- | --- | --- |
| craft anything / REA | `storytold/craft-anything` (★34k) | "Craft Anything: understand how any software works, and craft your own." |
| rea | `Zfinix/eleven` (★1k, topic `rea`) | "Agent-first reverse engineering for macOS, Windows and Linux" |
| tiny / deployable | `sipeed/picoclaw` (★30k) | "Tiny, Fast, and Deployable anywhere — automate the mundane, unleash your creativity" |
| agent OS | `agentverse-os/AgentVerse-OS` (★942) | "Personal cloud OS for a developer and their AI agents on a single server... a windowed desktop" |
| software factory | `thruwire/foreman` (★827) | "An agent supervisor and software factory foreman" |
| 3D in the browser | `billpwchan/neon-zenith` (★72) | "three.js WebGPU + TSL... a browser game" |
| local-first | `eduwxyz/tucano` (★414) | "Your team of AI agents, on your Mac, Windows or Linux" |

## The vocabulary clusters

1. **Agent-native / agent-ready / agent-first.** The adjective moved from the model
   to the surface: UI, design systems, browsers, desktops.
2. **An operating system for agents.** "Personal OS for agents", "windowed desktop",
   "one-command install", "your own VM". The unit is a workspace, not a chat.
3. **Tiny and deployable.** `picoclaw` made size a category. Small is now a design
   goal, not a concession.
4. **Software factory.** Generation is assumed; verification, review gates and cost
   per merged change are the differentiators.
5. **Local-first / BYOK / self-hosted.** "Your model, your data, no telemetry" is a
   purchase criterion.
6. **Reverse-engineer anything.** REA and Craft Anything turned clean-room
   reconstruction into a genre, with awesome lists and topic tags following.
7. **Single-file browser 3A.** New models make three.js + WebGPU demos cheap enough
   to ship as one `index.html`; the browser is the distribution channel.
8. **Agent skills as packages.** Skills ship as repositories with versions and
   audits, not as prompt snippets.
9. **Supply-chain security for agents.** Policy gateways, signed skills, secret
   scanning, audit trails.

## Where this project matches

| Cluster | Match | Evidence |
| --- | --- | --- |
| Agent-native surface | Strong | A shell, apps and a workspace that a host hands to an agent |
| OS for agents | Strong | "Linux gave every program a machine; NexlOS gives every agent a computer" |
| Tiny and deployable | Strong | 7.94 MiB, 287 files, one dependency |
| Software factory | Strong | One sentence → app, browser check, one repair, icon |
| Local-first / BYOK | Strong | No key, no default provider, no telemetry, no account |
| Single-file artifacts | Strong | `apps/<id>/index.html` plus `app.json` |
| Agent skills/packages | Medium | Ships as a DSH bundle; no skills registry yet |
| Browser 3D | Medium in the universal edition | Three.js author layer, glTF/GLB with KTX2/Draco/meshopt, WebGL2/WebGPU host; not in the plugin tarball |
| Browser-surface reconstruction | Medium | Capture behavior, write a spec, rebuild, compare in a browser; no binaries |
| Binary reverse engineering | None | Out of scope by design |
| Supply-chain security | Weak | Boundary and licence tests exist; no signing or audit trail |

The weak rows are the ones to leave alone in public copy. Claiming them would win
a click and lose the reader.

One phrase needs care. The factory is sometimes described internally as "AI
reverse-engineers every app". Its own acceptance rules say the opposite: no
decompilation, no Rust reverse-engineering engine, no copying third-party code,
and differential comparison only against targets you have the right to run. The
defensible phrase is **browser-surface reconstruction**: capture behavior, write a
spec, rebuild, verify. It keeps the REA-adjacent search intent and filters out the
reader who wanted a decompiler.

## Six-month forecast

Each prediction carries the signal that would falsify it.

1. **Skills become the distribution unit.** More repositories will ship capabilities
   as versioned skill packs rather than frameworks.
   *Falsified if:* weekly trending keeps rewarding monolithic agent frameworks
   without skill packaging.
2. **Every agent gets its own computer.** Expect VM/workspace lifecycle, snapshots,
   rollback and audit to become standard features of agent products.
   *Falsified if:* browser-only agents keep winning without a persistent workspace.
3. **Verification economics replace generation demos.** The interesting numbers
   become merge rate, review cost and regression rate per agent.
   *Falsified if:* demo repos keep trending on generation volume alone.
4. **Local-first and BYOK become purchase criteria.** "Self-hosted alternative to X"
   keeps appearing in descriptions because buyers ask for it.
   *Falsified if:* hosted-only products regain pricing power without a local option.
5. **Single-file browser 3A stays the model-eval format.** three.js + WebGPU in one
   HTML file is cheap to produce and easy to judge.
   *Falsified if:* 3D demos shift to native or cloud-rendered delivery.
6. **Clean-room reconstruction gets legal scaffolding.** Expect licence hygiene,
   provenance and disclaimers to become part of the genre's tooling.
   *Falsified if:* the genre stalls on takedowns rather than maturing.
7. **Agent supply-chain security becomes a feature, not a warning.** Signing,
   provenance and policy gates for skills and plugins.
   *Falsified if:* incidents stay rare enough that buyers ignore the category.

The through-line: the market is moving from *agents that talk* to *agents that have
a computer, a skill library and an audited runtime*. This project sits on the first
and third of those; the middle one is the gap.

## Query forecast

The table pairs the phrases people type with the page that should answer them.
One canonical page per intent; duplicating the same answer across pages splits
the signal.

### Category searches this project can win

| Query | 中文 | Landing page |
| --- | --- | --- |
| AI native operating system github | AI 原生操作系统 开源 | README, [highlights.md](highlights.md) |
| operating system for ai agents | 给 agent 一台电脑 | README, [faq.md](faq.md) |
| agent os open source | 智能体操作系统 | [highlights.md](highlights.md) |
| local first ai desktop | 本地优先 AI 桌面 | [highlights.md](highlights.md) |
| bring your own model desktop | BYOK 桌面 | [faq.md](faq.md) |
| software factory ai agents | AI 软件工厂 | [factory.md](factory.md) |
| single file html app generator | 一句话生成应用 | [factory.md](factory.md) |
| deepseek harness plugin | DSH 插件 | README |
| tiny ai runtime | 轻量 AI 运行时 | [highlights.md](highlights.md) |

### Adjacent searches answered honestly

| Query | 中文 | Landing page | What it says |
| --- | --- | --- | --- |
| craft anything alternative | 逆向一切 平替 | [highlights.md](highlights.md) | We mount what you built; the factory reconstructs at the browser surface |
| reverse engineer anything github | 逆向一切 开源 | [faq.md](faq.md) | No decompiler or patcher; here is what exists instead |
| clean room reimplementation agent | 清洁室 重建 | [factory.md](factory.md) | Capture, spec, rebuild, compare, with rights |
| agent computer use open source | agent 用电脑 | [faq.md](faq.md) | A workspace per session; isolation stays with the host |
| three.js webgpu template | three.js WebGPU 模板 | [factory.md](factory.md) | Universal edition author layer; not in the plugin tarball |
| webgpu webview macos | WebGPU 壳 | [factory.md](factory.md) | WebGPU host work, with the edition boundary stated |

### Queries likely to grow over the next 12 months

- "agent skills registry" and "skill supply chain security" — packaging and signing.
- "agent vm snapshot rollback" — per-agent computers with lifecycle control.
- "software factory cost per pr" — verification economics.
- "agent audit trail" — provenance of actions and approvals.
- "agent readable ui" — interfaces designed for agents rather than screenshots.
- "webgpu os shell" — GPU-native window shells.
- "local llm desktop" — small models on the user's machine.

When one of these starts appearing in weekly trending descriptions, add a section
to the page that already owns the intent. Do not open a new page for a synonym.

## Discovery plan

A private repository is not indexed by GitHub search, Google or any awesome list.
This repository went public on 2026-11-16, so visibility is no longer the limit;
the steps below were applied in order at that point and are re-checked per release:

1. **About description** (one line, under 160 characters):
   `Tiny, local-first, agent-native OS for DSH: 7.94 MiB, 17 apps, your own model. One sentence makes an HTML app; every app leaves as a file.`
2. **Topics** (20 maximum):
   `ai-native`, `agent-native`, `agent-os`, `web-os`, `operating-system`,
   `local-first`, `byok`, `no-telemetry`, `deepseek-harness`, `dsh`, `plugin`,
   `software-factory`, `app-generator`, `html-apps`, `single-file`, `webgl`,
   `javascript`, `nodejs`, `ai-agents`, `apache-2.0`
3. **README layer.** One section that names the clusters and links to
   [highlights.md](highlights.md), [factory.md](factory.md), [faq.md](faq.md) and
   [research-use.md](research-use.md). The root `llms.txt` gives AI crawlers the
   same facts in one fetch.
4. **Release notes.** Publish a tagged release whose notes repeat the same
   vocabulary once, with the measured size and file count.
5. **Lists and directories.** Submit to agent-OS, software-factory and local-first
   awesome lists. Each submission is an outward action and needs the owner's
   approval.
6. **Measure.** GitHub traffic → referring sites, plus searches for the target
   phrases. Ask an answer engine the ten queries above and record whether the
   project appears and which page it cites. Re-run this snapshot monthly and keep
   the rows that actually convert.

Do not buy stars, do not stuff unrelated topics, and do not claim reverse
engineering. GitHub's acceptable-use policy treats misleading metadata as a
violation, and the bounce rate punishes it anyway.
