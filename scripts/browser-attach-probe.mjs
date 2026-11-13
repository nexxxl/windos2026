#!/usr/bin/env node
/**
 * Repeatable attach-mode probe. Start a throwaway Chrome first:
 *
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --headless=new --remote-debugging-port=9333 \
 *     --user-data-dir=/tmp/nx-host-chrome about:blank
 *
 *   NEXLOS_ATTACH_URL=http://127.0.0.1:9333 node scripts/browser-attach-probe.mjs
 */
import { createBrowserBridge } from '../browser-bridge.js'

const attachUrl = process.env.NEXLOS_ATTACH_URL || 'http://127.0.0.1:9333'
const bridge = createBrowserBridge({
  home: () => process.env.NEXLOS_PROBE_HOME || '/tmp/nx-bridge-probe-home',
  getConfig: async () => ({ browserProvider: 'attach', browserAttachUrl: attachUrl }),
})
const average = values => values.reduce((a, b) => a + b, 0) / values.length
const result = { attachUrl }

try {
  const listBefore = await fetch(attachUrl + '/json/list').then(r => r.json())
  const started = performance.now()
  await bridge.ensure()
  result.attachMs = Math.round(performance.now() - started)
  result.status = await bridge.status()
  await bridge.navigate('https://example.com/')

  const captures = []
  for (let i = 0; i < 20; i += 1) {
    const t = performance.now()
    const data = await bridge.capture()
    captures.push({ ms: performance.now() - t, bytes: data.length })
  }
  result.capture = {
    count: captures.length,
    avgMs: +average(captures.map(x => x.ms)).toFixed(1),
    maxMs: +Math.max(...captures.map(x => x.ms)).toFixed(1),
    avgBytes: Math.round(average(captures.map(x => x.bytes))),
  }

  const viewports = []
  for (let i = 0; i < 30; i += 1) {
    const t = performance.now()
    await bridge.setViewport(640 + (i * 37) % 800, 360 + (i * 29) % 500, i % 2 ? 2 : 1)
    viewports.push(performance.now() - t)
  }
  result.viewport = { count: viewports.length, avgMs: +average(viewports).toFixed(1), maxMs: +Math.max(...viewports).toFixed(1) }

  const evalStart = performance.now()
  const evals = await Promise.all(Array.from({ length: 10 }, (_, i) => bridge.agent({ action: 'eval', expression: `${i + 1}+${i + 2}` })))
  result.evals = { count: evals.length, totalMs: +(performance.now() - evalStart).toFixed(1), values: evals.map(x => x.value) }

  await bridge.shutdown()
  const listAfter = await fetch(attachUrl + '/json/list').then(r => r.json())
  result.tabs = { before: listBefore.length, after: listAfter.length }
  result.ok = result.evals.values.every((value, index) => value === index * 2 + 3)
} catch (error) {
  result.ok = false
  result.error = error.message || String(error)
} finally {
  await bridge.shutdown().catch(() => {})
}
console.log(JSON.stringify(result, null, 2))
process.exit(result.ok ? 0 : 1)
