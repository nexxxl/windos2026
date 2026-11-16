/* 公开候选边界的负例闸门。
 * 只测「不该进候选的东西会不会被拦住」和「干净的树能不能过」，
 * 不关心业务代码；这样边界规则一退化，CI 立刻红。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SCRIPT = join(ROOT, 'scripts', 'stage-public-repo.sh')
// npm 包里不带 scripts/；从打包产物跑测试时这些用例没有对象可测，明确跳过而不是假装通过。
const SKIP = existsSync(SCRIPT) ? false : 'scripts/stage-public-repo.sh 不在当前树里（打包产物）'

// 候选校验要求存在的最小文件集；内容为空即可，检查的是路径与边界。
const REQUIRED = [
  'LICENSE',
  'docs/legal/NOTICE',
  'docs/legal/TRADEMARK.md',
  'docs/legal/LICENSING.md',
  'docs/LICENSE-BINARY.md',
  'docs/legal/DISCLAIMER.md',
  'docs/legal/THIRD_PARTY_NOTICES.md',
  'docs/assets/icon.svg',
  '.github/SECURITY.md',
  '.github/CONTRIBUTING.md',
  'package.json',
  'package-lock.json',
  'index.js',
  'client.js',
  'src/cordis.patch.yml',
  'src/webos/index.html',
  'src/webos/a/os.js',
  'src/vendor/readability.js',
  'src/vendor/nexl-l1.js',
  'src/capabilities.js'
]
const LANGS = [
  'README.md',
  'docs/i18n/README.zh-CN.md',
  'docs/i18n/README.zh-TW.md',
  'docs/i18n/README.ja.md',
  'docs/i18n/README.ko.md',
  'docs/i18n/README.es.md',
  'docs/i18n/README.fr.md',
  'docs/i18n/README.de.md'
]

function makeTree(extra = (root) => {}) {
  const root = mkdtempSync(join(tmpdir(), 'nexlos-boundary-'))
  for (const name of REQUIRED) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), '')
  }
  for (const name of LANGS) {
    // 八份 README 必须互相带语言栏链接，否则边界检查会先报链接缺失。
    const links = LANGS.filter((other) => other !== name)
      .map((other) => `[${other}](${other})`)
      .join(' ')
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), `# test\n\n${links}\n`)
  }
  extra(root)
  return root
}

function check(root) {
  const result = spawnSync('bash', [SCRIPT, '--check', root], { encoding: 'utf8' })
  return { status: result.status, out: `${result.stdout}${result.stderr}` }
}

function expectRejected(name, build, marker) {
  test(name, { skip: SKIP }, () => {
    const root = makeTree(build)
    try {
      const { status, out } = check(root)
      assert.notEqual(status, 0, `本应被拒绝却通过了：${out}`)
      assert.match(out, marker)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}

test('干净的候选树通过边界检查', { skip: SKIP }, () => {
  const root = makeTree()
  try {
    const { status, out } = check(root)
    assert.equal(status, 0, out)
    assert.match(out, /Plugin-only public source boundary passed/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

expectRejected(
  'applications/ 不许进候选',
  (root) => {
    mkdirSync(join(root, 'applications'))
  },
  /Excluded source boundary: applications/
)

expectRejected(
  'tools/ 不许进候选',
  (root) => {
    mkdirSync(join(root, 'tools'))
  },
  /Excluded source boundary: tools/
)

expectRejected(
  'src/extras/fonts-cjk 不许进候选',
  (root) => {
    mkdirSync(join(root, 'src', 'extras', 'fonts-cjk'), { recursive: true })
  },
  /Excluded source boundary: src\/extras\/fonts-cjk/
)

// 负例样本在运行时拼出来：源码里留明文私钥头会被 check-source 自己拦下。
const KEY_HEAD = '-----BEGIN ' + 'RSA PRIVATE KEY-----'
const KEY_TAIL = '-----END ' + 'RSA PRIVATE KEY-----'
const DEV_PATH = ['', 'Users', 'someone', 'work'].join('/')

expectRejected(
  '私钥样本不许进候选',
  (root) => {
    writeFileSync(join(root, 'id_rsa.txt'), `${KEY_HEAD}\nMIIB\n${KEY_TAIL}\n`)
  },
  /Private key: id_rsa\.txt/
)

expectRejected(
  '开发者绝对路径不许进候选',
  (root) => {
    writeFileSync(join(root, 'note.md'), `path: ${DEV_PATH}\n`)
  },
  /Developer-specific path: note\.md/
)

/* --check-repo 校验的是「仓库本身」：白名单影子树永远干净，
 * 只有对着 git 索引再查一遍，才能发现有人把 tools/ 直接提交进公开仓。
 */
function repoCheck(root) {
  const result = spawnSync('bash', [SCRIPT, '--check-repo', root], { encoding: 'utf8' })
  return { status: result.status, out: `${result.stdout}${result.stderr}` }
}

function makeRepo(extra) {
  const root = mkdtempSync(join(tmpdir(), 'nexlos-repo-'))
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0)
  writeFileSync(join(root, 'README.md'), '# test\n')
  if (extra) extra(root)
  // -f：.env 这类文件可能被全局 gitignore 命中，测试要可重复。
  assert.equal(spawnSync('git', ['-C', root, 'add', '-A', '-f']).status, 0)
  return root
}

test('仓库自身的边界检查通过一棵干净树', { skip: SKIP }, () => {
  const root = makeRepo()
  try {
    const { status, out } = repoCheck(root)
    assert.equal(status, 0, out)
    assert.match(out, /Repository boundary passed/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

for (const [name, build, marker] of [
  [
    '仓库里提交了 tools/',
    (root) => {
      mkdirSync(join(root, 'tools', 'x'), { recursive: true })
      writeFileSync(join(root, 'tools', 'x', 'a.py'), 'x\n')
    },
    /Repository contains excluded path: tools\/x\/a\.py/
  ],
  [
    '仓库里提交了 applications/',
    (root) => {
      mkdirSync(join(root, 'applications', 'reader'), { recursive: true })
      writeFileSync(join(root, 'applications', 'reader', 'main.go'), 'x\n')
    },
    /Repository contains excluded path: applications\/reader\/main\.go/
  ],
  [
    '仓库里提交了 src/extras/fonts-cjk/',
    (root) => {
      mkdirSync(join(root, 'src', 'extras', 'fonts-cjk'), { recursive: true })
      writeFileSync(join(root, 'src', 'extras', 'fonts-cjk', 'a.woff2'), 'x\n')
    },
    /Repository contains excluded path: src\/extras\/fonts-cjk\/a\.woff2/
  ],
  [
    '仓库里提交了 .env',
    (root) => {
      writeFileSync(join(root, '.env'), 'TOKEN=1\n')
    },
    /Repository tracks a private or generated file: \.env/
  ]
]) {
  test(name, { skip: SKIP }, () => {
    const root = makeRepo(build)
    try {
      const { status, out } = repoCheck(root)
      assert.notEqual(status, 0, `本应被拒绝却通过了：${out}`)
      assert.match(out, marker)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}
