import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createServer, readConfiguration } from './server.mjs'

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

async function close(server) {
  const closed = new Promise(resolve => server.close(resolve))
  server.closeAllConnections()
  await closed
}

async function fixture(context, handler) {
  const siteDir = await mkdtemp(join(tmpdir(), 'toolbox-server-'))
  await mkdir(join(siteDir, 'assets'))
  await writeFile(join(siteDir, 'index.html'), '<html>Test Atlas</html>')
  await writeFile(join(siteDir, 'assets', 'app.js'), 'console.log("toolbox")')
  const upstream = createHttpServer(handler)
  const backendUrl = await listen(upstream)
  const server = createServer({ siteDir, backendUrl, timeout: 10000 })
  const origin = await listen(server)
  context.after(async () => {
    await close(server)
    await close(upstream)
    await rm(siteDir, { recursive: true, force: true })
  })
  return { siteDir, backendUrl, origin, upstream }
}

test('configuration requires runtime parameters and rejects invalid destinations', async context => {
  const { siteDir } = await fixture(context, (request, response) => response.end())
  const env = {
    FRONTEND_HOST: '127.0.0.1', FRONTEND_PORT: '28000', BACKEND_URL: 'http://127.0.0.1:27000',
    SITE_DIR: siteDir, API_PROXY_TIMEOUT_MS: '1800000',
  }
  assert.equal(readConfiguration(env).port, 28000)
  for (const name of Object.keys(env)) assert.throws(() => readConfiguration({ ...env, [name]: '' }))
  for (const port of ['0', '65536', '18000junk', '-1']) {
    assert.throws(() => readConfiguration({ ...env, FRONTEND_PORT: port }))
  }
  for (const url of ['ftp://backend', 'http://user:secret@backend', 'http://backend/api', 'http://backend/?a=b', 'http://backend/#x']) {
    assert.throws(() => readConfiguration({ ...env, BACKEND_URL: url }))
  }
  assert.throws(() => readConfiguration({ ...env, FRONTEND_PORT: '27000' }))
  assert.throws(() => readConfiguration({ ...env, SITE_DIR: join(siteDir, 'missing') }))
})

test('serves assets and deep links but never masks missing assets or API errors', async context => {
  const { origin } = await fixture(context, (request, response) => {
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end('{"message":"not found"}')
  })
  for (const path of ['/', '/algorithms/test_atlas/']) {
    const response = await fetch(`${origin}${path}`, { headers: { Accept: 'text/html' } })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match(await response.text(), /Test Atlas/)
  }
  assert.equal((await fetch(`${origin}/assets/app.js`)).status, 200)
  for (const path of ['/assets/missing.js', '/missing.ico']) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404)
  }
  assert.equal((await fetch(`${origin}/algorithms/example/`, { method: 'POST' })).status, 404)
  for (const path of ['/api', '/api/missing']) {
    const response = await fetch(`${origin}${path}`)
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'not found' })
  }
})

test('preserves API prefix, query, JSON request body, origin independence and response status', async context => {
  const { origin } = await fixture(context, async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    assert.equal(request.url, '/api/scripts/EXAMPLE?mode=test')
    assert.equal(request.method, 'POST')
    assert.equal(request.headers.origin, 'http://a-different-host:38000')
    assert.deepEqual(JSON.parse(body), { input: 'example' })
    response.writeHead(422, { 'Content-Type': 'application/json', 'X-Upstream': 'preserved' })
    response.end('{"message":"invalid input"}')
  })
  const response = await fetch(`${origin}/api/scripts/EXAMPLE?mode=test`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://a-different-host:38000' },
    body: JSON.stringify({ input: 'example' }),
  })
  assert.equal(response.status, 422)
  assert.equal(response.headers.get('x-upstream'), 'preserved')
  assert.deepEqual(await response.json(), { message: 'invalid input' })
})

test('returns 502 when upstream is unavailable while static frontend remains usable', async context => {
  const { origin, upstream } = await fixture(context, (request, response) => response.end())
  await close(upstream)
  const response = await fetch(`${origin}/api/scripts`)
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { message: 'Backend unavailable' })
  assert.equal((await fetch(origin)).status, 200)
})

test('forwards multiple progress chunks before the final result without buffering', async context => {
  let next
  let finish
  const nextChunk = new Promise(resolve => { next = resolve })
  const completion = new Promise(resolve => { finish = resolve })
  const { origin } = await fixture(context, async (request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    response.write('{"type":"progress","current":1,"total":2}\n')
    await nextChunk
    response.write('{"type":"progress","current":2,"total":2}\n')
    await completion
    response.end('{"type":"result","data":{}}\n')
  })
  context.after(() => { next(); finish() })
  const response = await fetch(`${origin}/api/scripts/EXAMPLE`, { signal: AbortSignal.timeout(5000) })
  const reader = response.body.getReader()
  assert.match(new TextDecoder().decode((await reader.read()).value), /"current":1/)
  next()
  assert.match(new TextDecoder().decode((await reader.read()).value), /"current":2/)
  finish()
  assert.match(new TextDecoder().decode((await reader.read()).value), /"type":"result"/)
  assert.equal((await reader.read()).done, true)
})

test('runtime destination changes reuse identical assets on different listeners', async context => {
  const { siteDir, origin } = await fixture(context, (request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end('["first-backend"]')
  })
  const secondBackend = createHttpServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end('["second-backend"]')
  })
  const secondDestination = await listen(secondBackend)
  const configuration = readConfiguration({
    FRONTEND_HOST: '127.0.0.1', FRONTEND_PORT: '28000', BACKEND_URL: secondDestination,
    SITE_DIR: siteDir, API_PROXY_TIMEOUT_MS: '10000',
  })
  const secondFrontend = createServer(configuration)
  const secondOrigin = await listen(secondFrontend)
  context.after(async () => { await close(secondFrontend); await close(secondBackend) })
  assert.notEqual(origin, secondOrigin)
  assert.deepEqual(await (await fetch(`${origin}/api/scripts`)).json(), ['first-backend'])
  assert.deepEqual(await (await fetch(`${secondOrigin}/api/scripts`)).json(), ['second-backend'])
  assert.equal(await (await fetch(`${origin}/assets/app.js`)).text(), await (await fetch(`${secondOrigin}/assets/app.js`)).text())
})

test('forwards progress before upstream finishes and closes upstream on client disconnect', async context => {
  let finish
  const completion = new Promise(resolve => { finish = resolve })
  let upstreamClosed
  const disconnected = new Promise(resolve => { upstreamClosed = resolve })
  const { origin } = await fixture(context, async (request, response) => {
    response.once('close', upstreamClosed)
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    response.write('{"type":"progress","current":1,"total":2}\n')
    await completion
    if (!response.destroyed) response.end('{"type":"result","data":{}}\n')
  })
  context.after(() => finish())
  const response = await fetch(`${origin}/api/scripts/EXAMPLE`, { signal: AbortSignal.timeout(5000) })
  assert.match(response.headers.get('content-type'), /application\/x-ndjson/)
  const reader = response.body.getReader()
  const first = await reader.read()
  assert.match(new TextDecoder().decode(first.value), /"type":"progress"/)
  await reader.cancel()
  await disconnected
})