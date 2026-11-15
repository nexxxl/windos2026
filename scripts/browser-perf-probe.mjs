#!/usr/bin/env node
/**
 * Browser pipeline probe. Measures the capture leg of NexlOS' isolated
 * browser (the part that fundamentally caps frame rate).
 *
 *   node scripts/browser-perf-probe.mjs
 */
import { createBrowserBridge } from '../browser-bridge.js'

const bridge = createBrowserBridge({ home: () => '/tmp/nx-browser-perf-probe' })
const avg = (list) => list.reduce((a, b) => a + b, 0) / list.length
const p95 = (list) => [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * 0.95))]
const result = { captures: {}, bytes: {} }
try {
  await bridge.navigate('https://example.com/')
  for (const dpr of [1, 2]) {
    await bridge.setViewport(782, 488, dpr)
    const times = []
    const sizes = []
    for (let i = 0; i < 12; i += 1) {
      const t = performance.now()
      const data = await bridge.capture()
      times.push(performance.now() - t)
      sizes.push(data ? Buffer.byteLength(data, 'base64') : 0)
    }
    result.captures['dpr' + dpr] = {
      avgMs: +avg(times).toFixed(1),
      p95Ms: p95(times),
      maxMs: +Math.max(...times).toFixed(1)
    }
    result.bytes['dpr' + dpr] = { avgBytes: Math.round(avg(sizes)), maxBytes: Math.max(...sizes) }
  }
  const status = await bridge.status()
  result.fpsCeiling = {
    dpr1: +(1000 / result.captures.dpr1.avgMs).toFixed(1),
    dpr2: +(1000 / result.captures.dpr2.avgMs).toFixed(1)
  }
  result.status = { provider: status.provider, stream: status.stream, dpr: status.dpr }
} catch (error) {
  result.ok = false
  result.error = error.message || String(error)
} finally {
  await bridge.shutdown().catch(() => {})
}
console.log(JSON.stringify(result, null, 2))
