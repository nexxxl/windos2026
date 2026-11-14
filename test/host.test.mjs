import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Set this to an unpacked npm package to run exactly the same HTTP contract
// tests against its published file set, outside this checkout.
const packageRoot = process.env.NEXLOS_TEST_PACKAGE
  ? path.resolve(process.env.NEXLOS_TEST_PACKAGE)
  : fileURLToPath(new URL('../', import.meta.url))
const { apply } = await import(pathToFileURL(path.join(packageRoot, 'index.js')).href)

test('standalone plugin Host HTTP contract', { timeout: 20000 }, async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nexlos-plugin-test-'))
  const home = path.join(temporary, 'workspace')
  const routes = []
  const effects = []
  let requireCredential = false
  const services = {
    webServer: {
      register(route) {
        routes.push(route)
        return () => routes.splice(routes.indexOf(route), 1)
      },
    },
    connection: {
      requestRejection({ headers }) {
        return requireCredential && headers['x-test-auth'] !== 'allowed' ? 401 : undefined
      },
    },
  }
  const context = {
    get: key => services[key],
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') effects.push(dispose)
    },
    // Agent tools are provided by the real DSH host; this fixture deliberately
    // exercises only the HTTP boundary without opening any user session.
    inject() {},
    logger: { warn(message) { throw new Error(message) } },
  }
  apply(context, { home })
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const route = routes.find(item => item.kind === 'exact' && pathname === item.path)
      || routes.find(item => item.kind === 'prefix' && (pathname === item.path || pathname.startsWith(item.path + '/')))
    if (route) return route.handler(req, res)
    res.writeHead(404)
    res.end('route not found')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(route, { fields, method, headers = {} } = {}) {
    const response = await fetch(base + route, {
      method: method || (fields ? 'POST' : 'GET'),
      headers: { ...(fields ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(fields ? { body: JSON.stringify(fields) } : {}),
      signal: AbortSignal.timeout(5000),
    })
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }
    return { status: response.status, body, headers: response.headers }
  }
  try {
    await t.test('registers routes and isolates its workspace', async () => {
      assert.ok(routes.length >= 8)
      const health = await request('/nexlos/health')
      assert.equal(health.status, 200)
      assert.equal(health.body.name, 'nexlos-os')
      assert.equal(health.body.engine, 'dsh')
      assert.equal(health.body.home, home)
    })

    await t.test('serves bundled desktop, application and Office assets', async () => {
      for (const route of ['/nexlos/', '/a/app.js', '/a/os.js', '/a/office/', '/a/office/editors.js', '/nexlos/perf.js']) {
        const response = await request(route)
        assert.equal(response.status, 200, route)
        assert.equal(typeof response.body, 'string', route)
        assert.ok(response.body.length > 100, route)
      }
    })

    await t.test('rewrites system-app mounts for the plugin host', async () => {
      // The transform drops the eager mount imports; if the mounts table is left
      // behind every system app throws "mountPC is not defined" at route time.
      const response = await request('/a/app.js')
      assert.equal(response.status, 200)
      assert.ok(response.body.includes('await mountSystemApp(parts[0], wrap)'))
      assert.ok(!response.body.includes('mounts[parts[0]](wrap)'))
      assert.ok(!response.body.includes('pc: mountPC'))
    })

    await t.test('serves optional packs from /extras', async () => {
      // ArtCraft and the overlay language packs live outside webos/; without this
      // route the drawing app only renders its "failed to fetch kernel.js" page.
      const kernel = await request('/extras/artcraftport/kernel.js')
      assert.equal(kernel.status, 200)
      assert.ok(kernel.body.length > 1000)
      const css = await request('/extras/artcraftport.css')
      assert.equal(css.status, 200)
      assert.ok(css.body.includes('.ac-') || css.body.length > 500)
      const lang = await request('/extras/langs/lang-ar.js')
      assert.equal(lang.status, 200)
      assert.ok(lang.body.includes('rows'))
    })

    await t.test('persists settings through the command envelope', async () => {
      const saved = await request('/c/settings.set', { fields: { appearance: 'win98', language: 'en' } })
      assert.equal(saved.status, 200)
      assert.equal(saved.body.ok, true)
      assert.equal(saved.body.detail.appearance, 'win98')
      const read = await request('/c/settings.get')
      assert.equal(read.body.detail.language, 'en')
      const disk = JSON.parse(await fs.readFile(path.join(home, 'settings.json'), 'utf8'))
      assert.equal(disk.appearance, 'win98')
    })

    await t.test('creates, saves and reads a book chapter on disk', async () => {
      const created = await request('/c/novel.create', { fields: { name: 'fixture-book', title: 'Fixture' } })
      assert.equal(created.status, 200)
      const space = created.body.detail.created
      const prefix = '/s/' + encodeURIComponent(space) + '/c/'
      const chapter = await request(prefix + 'chapter.create', { fields: { title: 'One' } })
      const file = chapter.body.append[0].file
      const saved = await request(prefix + 'chapter.save', { fields: { chapter: file, text: '# One\n\nNexlOS fixture.\n' } })
      assert.equal(saved.body.ok, true)
      const read = await request(prefix + 'chapter.read?chapter=' + encodeURIComponent(file))
      assert.equal(read.body.fields.chapter.text, '# One\n\nNexlOS fixture.\n')
      assert.equal(await fs.readFile(path.join(home, space, 'chapters', file), 'utf8'), read.body.fields.chapter.text)
    })

    await t.test('rejects workspace traversal and cross-origin mutation', async () => {
      await fs.writeFile(path.join(temporary, 'outside.txt'), 'outside fixture')
      const escape = await request('/c/fs.read?path=' + encodeURIComponent('../outside.txt'))
      assert.equal(escape.status, 400)
      assert.equal(escape.body.ok, false)
      const mutation = await request('/c/settings.set', { fields: { appearance: 'current' }, headers: { origin: 'https://outside.invalid' } })
      assert.equal(mutation.status, 403)
      assert.equal(await fs.readFile(path.join(temporary, 'outside.txt'), 'utf8'), 'outside fixture')
      assert.equal((await request('/c/settings.get')).body.detail.appearance, 'win98')
    })

    await t.test('Office saves are revisioned and replay tokens are idempotent', async () => {
      const created = await request('/a/office/api/files', { fields: { kind: 'markdown', title: 'Fixture' } })
      assert.equal(created.status, 201)
      const doc = created.body
      const endpoint = '/a/office/api/files/' + doc.id + '/autosave'
      const fields = { doc: { ...doc, markdown: '# Saved' }, rev: doc.rev, token: 'fixture-save-1' }
      const saved = await request(endpoint, { fields })
      assert.equal(saved.status, 200)
      assert.equal(saved.body.rev, doc.rev + 1)
      const repeated = await request(endpoint, { fields })
      assert.equal(repeated.status, 200)
      assert.equal(repeated.body.idempotent, true)
      assert.equal(repeated.body.rev, saved.body.rev)
      const conflict = await request(endpoint, { fields: { ...fields, token: 'different-save' } })
      assert.equal(conflict.status, 409)
      assert.equal(conflict.body.conflict, true)
      const read = await request('/a/office/api/files/' + doc.id)
      assert.equal(read.body.markdown, '# Saved')
      assert.equal(read.body.rev, saved.body.rev)
    })

    await t.test('applies the DSH authentication boundary', async () => {
      requireCredential = true
      assert.equal((await request('/nexlos/health')).status, 401)
      assert.equal((await request('/c/settings.get')).status, 401)
      assert.equal((await request('/a/office/')).status, 401)
      assert.equal((await request('/nexlos/health', { headers: { 'x-test-auth': 'allowed' } })).status, 200)
    })
  } finally {
    for (const dispose of effects.reverse()) dispose()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})

test('NEXLOS_HOME selects a new directory before it contains settings', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nexlos-plugin-env-'))
  const expected = path.join(temporary, 'fresh-home')
  const previous = process.env.NEXLOS_HOME
  const routes = []
  const effects = []
  process.env.NEXLOS_HOME = expected
  try {
    apply({
      get(key) {
        if (key === 'webServer') return { register(route) { routes.push(route); return () => {} } }
        return undefined
      },
      effect(callback) {
        const dispose = callback()
        if (typeof dispose === 'function') effects.push(dispose)
      },
      inject() {},
    })
    let body
    const healthRoute = routes.find(route => route.kind === 'prefix' && route.path === '/nexlos')
    healthRoute.handler({ url: '/nexlos/health', headers: {} }, {
      writeHead(status) { assert.equal(status, 200) },
      end(text) { body = JSON.parse(text) },
    })
    assert.equal(body.home, expected)
    assert.equal((await fs.stat(expected)).isDirectory(), true)
  } finally {
    if (previous === undefined) delete process.env.NEXLOS_HOME
    else process.env.NEXLOS_HOME = previous
    for (const dispose of effects.reverse()) dispose()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
