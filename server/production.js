// O cache de DNS precisa ser o primeiro a carregar, antes de qualquer conexão.
import './dnsCache.js'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiMiddleware } from './middleware.js'
import { applySecurityHeaders } from './security.js'
import { startDigestScheduler } from './digestScheduler.js'
import { startLiveScheduler } from './liveScheduler.js'
import { startAlertsScheduler } from './alertsScheduler.js'
import { startLeadsSyncScheduler } from './leadsSyncScheduler.js'
import { startAcessoScheduler } from './acesso/scheduler.js'
import { startPlanilhasScheduler } from './planilhasSync.js'

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

// Falha passageira (ex.: o DNS do banco some por um instante) vira log, não derruba o processo.
process.on('unhandledRejection', (motivo) => console.error('[erro não tratado]', motivo))
process.on('uncaughtException', (erro) => console.error('[exceção não tratada]', erro))

// Mais threads para resolver nomes (DNS) e IPv4 primeiro: com o padrão (4 threads), várias conexões ao mesmo tempo esperam na fila.
process.env.UV_THREADPOOL_SIZE ||= '16'

const env = loadRuntimeEnv()
const apiMiddleware = createApiMiddleware(env, { isProduction })
const port = Number(process.env.PORT || process.env.APP_PORT || 4173)

const server = createServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) {
    const inicio = Date.now()
    try {
      await apiMiddleware(req, res, () => {
        res.statusCode = 404
        res.end(JSON.stringify({ error: 'Rota não encontrada.' }))
      })
      const duracao = Date.now() - inicio
      if (duracao > 3000) console.warn(`[lento] ${req.method} ${String(req.url).split('?')[0]} levou ${duracao} ms`)
    } catch (erro) {
      console.error('[api]', req.method, req.url, erro?.message || erro)
      if (!res.headersSent) {
        res.statusCode = 503
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Serviço indisponível por um instante. Tente de novo.' }))
      } else {
        res.end()
      }
    }
    return
  }

  await serveStatic(req, res)
})

/** Abre as primeiras conexões (banco e serviços de fora) logo ao subir, para o DNS e o TLS já estarem prontos. */
async function aquecerConexoes(ambiente) {
  const inicio = Date.now()
  const tarefas = []
  if (ambiente.DATABASE_URL) tarefas.push(import('./db.js').then(({ query }) => query(ambiente, 'select 1')))
  for (const url of ['https://graph.facebook.com/', 'https://docs.google.com/', 'https://api.brevo.com/']) {
    tarefas.push(fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20_000) }))
  }
  const resultados = await Promise.allSettled(tarefas)
  const falhas = resultados.filter((r) => r.status === 'rejected').length
  console.log(`[aquecimento] conexões prontas em ${Date.now() - inicio} ms${falhas ? ` (${falhas} não responderam)` : ''}`)
}

// Aviso no log quando o servidor fica "travado" (algo ocupou o processo por mais de 1 s).
let ultimoBatimento = Date.now()
setInterval(() => {
  const agora = Date.now()
  const atraso = agora - ultimoBatimento - 1000
  if (atraso > 1000) console.warn(`[travada] o servidor ficou ${Math.round(atraso)} ms sem responder`)
  ultimoBatimento = agora
}, 1000).unref()

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
  startAlertsScheduler(env)
  startLeadsSyncScheduler(env)
  startAcessoScheduler(env)
  startPlanilhasScheduler(env)
  void aquecerConexoes(env)
})
