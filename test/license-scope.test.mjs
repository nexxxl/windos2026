/* 许可边界闸门：一个仓库、两种发行，许可必须跟着产物走。
 *
 * 这里守四件事：
 * 1. 根目录的许可文件一个都不能少；
 * 2. LICENSE 顶部的地图必须同时指向开源许可与二进制许可；
 * 3. npm 包不得携带二进制许可（插件用户不该收到一份与自己无关的协议）；
 * 4. 二进制许可必须保留 Apache-2.0 的让步条款，不能被改写成「整体专有」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
// 打包产物测试时，npm 载荷的根是 NEXLOS_TEST_PACKAGE，仓库根仍是当前 checkout。
const PKG = process.env.NEXLOS_TEST_PACKAGE ? process.env.NEXLOS_TEST_PACKAGE : REPO

function read(name) {
  return readFileSync(join(REPO, name), 'utf8')
}

const REQUIRED = [
  'LICENSE',
  'NOTICE',
  'LICENSING.md',
  'LICENSE-BINARY.md',
  'THIRD_PARTY_NOTICES.md',
  'TRADEMARK.md',
  'DISCLAIMER.md',
  'CONTRIBUTING.md',
  'DCO'
]

test('仓库根目录的许可与声明文件齐全', () => {
  for (const name of REQUIRED) {
    assert.ok(existsSync(join(REPO, name)), `缺少 ${name}`)
  }
})

test('LICENSE 顶部是许可地图，并保留完整的 Apache 文本', () => {
  const text = read('LICENSE')
  assert.match(text, /NexlOS — license map/)
  assert.match(text, /LICENSE-BINARY\.md/)
  assert.match(text, /LICENSING\.md/)
  // Apache 全文仍在同一个文件里，GitHub 的许可识别才不会退化成 unknown。
  assert.match(text, /Apache License\s+Version 2\.0/)
  assert.match(text, /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/)
})

test('LICENSING.md 同时覆盖两种发行并链接两份许可', () => {
  const text = read('LICENSING.md')
  assert.match(text, /Apache-2\.0/)
  assert.match(text, /NexlOS Binary License 1\.0/)
  assert.match(text, /\(LICENSE\)/)
  assert.match(text, /\(LICENSE-BINARY\.md\)/)
  assert.match(text, /plugin edition/i)
  assert.match(text, /universal edition/i)
})

test('二进制许可保留 Apache-2.0 的让步条款', () => {
  const text = read('LICENSE-BINARY.md')
  // 关键约束：二进制里的开源部分仍受 Apache 保护，这份许可不能宣称整体专有。
  assert.match(text, /Apache License 2\.0/)
  assert.match(text, /Apache-2\.0 governs/i)
  assert.match(text, /adds no restriction/i)
  assert.doesNotMatch(text, /all rights reserved/iu)
})

test('插件包声明里不含二进制许可', () => {
  const manifest = JSON.parse(read('package.json'))
  assert.ok(!manifest.files.includes('LICENSE-BINARY.md'), 'package.json.files 不得包含 LICENSE-BINARY.md')
  assert.ok(!manifest.files.includes('EULA.md'), 'package.json.files 不得包含 EULA.md')
  assert.ok(manifest.files.includes('LICENSING.md'), 'package.json.files 应包含 LICENSING.md')
})

test('npm 载荷里没有二进制许可', { skip: PKG === REPO ? '只在打包产物测试时检查' : false }, () => {
  assert.ok(!existsSync(join(PKG, 'LICENSE-BINARY.md')), 'npm 包里出现了 LICENSE-BINARY.md')
  assert.ok(!existsSync(join(PKG, 'EULA.md')), 'npm 包里出现了 EULA.md')
  assert.ok(existsSync(join(PKG, 'LICENSING.md')), 'npm 包里缺少 LICENSING.md')
})

test('NOTICE 指向二进制许可而不是旧文件名', () => {
  const text = read('NOTICE')
  assert.match(text, /LICENSE-BINARY\.md/)
  assert.doesNotMatch(text, /EULA\.md/)
})
