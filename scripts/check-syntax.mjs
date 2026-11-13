import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const files = []
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue
    const name = path.join(directory, entry.name)
    if (entry.isDirectory()) await visit(name)
    else if (/\.(?:js|mjs)$/u.test(entry.name)) files.push(name)
  }
}
await visit(root)
let failures = 0
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    failures += 1
    process.stderr.write(path.relative(root, file) + '\n' + (result.stderr || String(result.error)))
  }
}
console.log(`Checked ${files.length} JavaScript files; failures: ${failures}`)
if (failures) process.exitCode = 1
