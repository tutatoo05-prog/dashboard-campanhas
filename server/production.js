import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiMiddleware } from './middleware.js'
import { applySecurityHeaders } from './security.js'
import { startDigestScheduler } from './digestScheduler.js'
import { startLiveScheduler } from './liveScheduler.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const distDir = join(__dirname, '../dist')
const isProduction = process.env.NODE_ENV !== 'development'
process.env.NODE_ENV = isProduction ? 'production' : 'development'

function loadRuntimeEnv() {
  return { ...process.env }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

function resolvePath(urlPath) {
  const safePath = decodeURIComponent(urlPath.split('?')[0])
  const relative = safePath === '/' ? '/index.html' : safePath
  const filePath = join(distDir, relative)

  if (!filePath.startsWith(distDir)) {
    return null
  }

  return filePath
}

async function serveStatic(req, res) {
  const filePath = resolvePath(new URL(req.url, 'http://localhost').pathname)
  if (!filePath) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  try {
    const body = await readFile(filePath)
    const type = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream'
    applySecurityHeaders(res, { isProduction })
    res.statusCode = 200
    res.setHeader('Content-Type', type)
    res.setHeader('Cache-Control', type.includes('html') ? 'no-cache' : 'public, max-age=31536000, immutable')
    res.end(body)
  } catch {
    try {
      const fallback = await readFile(join(distDir, 'index.html'))
      applySecurityHeaders(res, { isProduction })
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.end(fallback)
    } catch {
      res.statusCode = 404
      res.end('Not found')
    }
  }
}

const env = loadRuntimeEnv()
const apiMiddleware = createApiMiddleware(env, { isProduction })
const port = Number(process.env.PORT || process.env.APP_PORT || 4173)

const server = createServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) {
    await apiMiddleware(req, res, () => {
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'Rota não encontrada.' }))
    })
    return
  }

  await serveStatic(req, res)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Academy Labs em http://localhost:${port}`)
  if (!env.META_ACCESS_TOKEN) {
    console.warn('AVISO: META_ACCESS_TOKEN não configurado.')
  }
  if (!env.DATABASE_URL) {
    console.warn('AVISO: DATABASE_URL não configurada (login, registro e compras não vão funcionar).')
  }
  startDigestScheduler(env)
  startLiveScheduler(env)
})
