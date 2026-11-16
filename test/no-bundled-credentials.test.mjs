/* 发布前的硬约束：插件包里不能有凭据，也不能替用户钉死模型。
 * 模型、provider、key 都属于用户自己的 DSH 档案；插件只通过宿主服务读取。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// 会被宿主加载、或浏览器可直接拉取的全部运行时文件。
// 只扫入口几个文件是不够的：webos/a/byok.js 就是用户最容易粘贴真实 key 的地方。
const RUNTIME_DIRS = ['src', 'webos', 'vendor', 'extension', 'locale', 'extras', 'lib']
const TEXT_EXT = new Set(['.js', '.mjs', '.css', '.json', '.yml', '.yaml', '.md', '.html', '.txt'])

function runtimeFiles() {
  const files = ['cordis.patch.yml']
  for (const name of readdirSync(ROOT)) {
    if (name.endsWith('.js') || name.endsWith('.css')) files.push(name)
  }
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}/${entry.name}`
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), rel)
        continue
      }
      if (TEXT_EXT.has(extname(entry.name))) files.push(rel)
    }
  }
  for (const dir of RUNTIME_DIRS) {
    if (existsSync(join(ROOT, dir))) walk(join(ROOT, dir), dir)
  }
  return files
}

test('运行时文件里没有 API key 一类的凭据字面量', () => {
  // 覆盖面本身也是断言：哪天扫描范围缩回 5 个文件，这条会先红。
  assert.ok(runtimeFiles().length > 200, `凭据扫描只覆盖 ${runtimeFiles().length} 个文件，范围退化了`)
  const patterns = [
    /sk-[A-Za-z0-9_-]{20,}/gu,
    /(?:api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{12,}['"]/giu,
    /DEEPSEEK_API_KEY\s*=\s*\S+/gu
  ]
  for (const name of runtimeFiles()) {
    const text = readFileSync(join(ROOT, name), 'utf8')
    for (const pattern of patterns) {
      const hit = text.match(pattern)
      assert.equal(hit, null, `${name} 里出现疑似凭据：${hit && hit[0]}`)
    }
  }
})

test('插件的 patch 不设置默认模型或 provider', () => {
  const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
  // 只允许插入自己的行；一旦写 agent-default-model 或 provider，就等于覆盖用户的账号选择。
  assert.doesNotMatch(patch, /agent-default-model/u)
  assert.doesNotMatch(patch, /^\s*provider\s*:/mu)
  assert.doesNotMatch(patch, /^\s*model\s*:/mu)
})
