import { existsSync, statSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'

const required = (env, name) => {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} must be set in the service XML`)
  return value
}

const positiveInteger = (value, name, maximum) => {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`)
  }
  return parsed
}

export function readConfiguration(env = process.env) {
  const host = required(env, 'FRONTEND_HOST')
  if (/[\s/\\]/.test(host)) throw new Error('FRONTEND_HOST must be a bind hostname or IP address')
  const port = positiveInteger(required(env, 'FRONTEND_PORT'), 'FRONTEND_PORT', 65535)
  const upstream = new URL(required(env, 'BACKEND_URL'))
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password
    || upstream.pathname !== '/' || upstream.search || upstream.hash) {
    throw new Error('BACKEND_URL must be an HTTP(S) origin without credentials, path, query or fragment')
  }
  const upstreamPort = Number(upstream.port || (upstream.protocol === 'https:' ? 443 : 80))
  const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (port === upstreamPort && (host === upstream.hostname
    || (loopback.has(upstream.hostname) && (loopback.has(host) || ['0.0.0.0', '::'].includes(host))))) {
    throw new Error('Frontend and backend must use different local ports')
  }
  const siteDir = resolve(required(env, 'SITE_DIR'))
  const index = resolve(siteDir, 'index.html')
  if (!existsSync(index) || !statSync(index).isFile()) throw new Error('SITE_DIR must contain index.html')
  const timeout = positiveInteger(required(env, 'API_PROXY_TIMEOUT_MS'), 'API_PROXY_TIMEOUT_MS', 2147483647)
  return { host, port, backendUrl: upstream.origin, siteDir, timeout }
}

export function createServer(configuration) {
  const app = express()
  app.disable('x-powered-by')
  app.use(createProxyMiddleware({
    pathFilter: pathname => pathname === '/api' || pathname.startsWith('/api/'),
    target: configuration.backendUrl,
    changeOrigin: true,
    proxyTimeout: configuration.timeout,
    timeout: configuration.timeout,
    on: {
      proxyReq: (upstreamRequest, request, response) => {
        request.once('aborted', () => upstreamRequest.destroy())
        response.once('close', () => {
          if (!response.writableFinished) upstreamRequest.destroy()
        })
      },
      proxyRes: (upstreamResponse, request, response) => {
        response.once('close', () => {
          if (!response.writableFinished) upstreamResponse.destroy()
        })
      },
      error: (error, request, response) => {
        if (response.headersSent) response.destroy()
        else if (!response.destroyed) {
          response.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          response.end(JSON.stringify({ message: 'Backend unavailable' }))
        }
      },
    },
  }))
  app.use(express.static(configuration.siteDir, {
    index: false,
    redirect: false,
    dotfiles: 'deny',
    setHeaders: response => response.setHeader('Cache-Control', 'no-cache'),
  }))
  app.use((request, response) => {
    const frontendRoute = request.path === '/' || /^\/algorithms\/[^/.]+\/?$/.test(request.path)
    if (['GET', 'HEAD'].includes(request.method) && frontendRoute && request.accepts('html')) {
      response.setHeader('Cache-Control', 'no-store')
      response.sendFile(resolve(configuration.siteDir, 'index.html'))
    } else response.status(404).end()
  })
  const server = createHttpServer(app)
  server.requestTimeout = configuration.timeout
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const configuration = readConfiguration()
    const server = createServer(configuration)
    server.on('error', error => {
      console.error(`Frontend server failed: ${error.message}`)
      process.exitCode = 1
    })
    server.listen(configuration.port, configuration.host, () => {
      console.log(`Frontend listening on ${configuration.host}:${configuration.port}`)
    })
    const shutdown = () => {
      server.close(() => process.exit(0))
      setTimeout(() => {
        server.closeAllConnections()
        process.exit(0)
      }, 10000).unref()
    }
    process.once('SIGTERM', shutdown)
    process.once('SIGINT', shutdown)
  } catch (error) {
    console.error(`Invalid frontend configuration: ${error.message}`)
    process.exitCode = 1
  }
}