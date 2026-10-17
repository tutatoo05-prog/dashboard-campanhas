import dns from 'node:dns'
import { estatisticas as dnsEstatisticas } from './dnsCache.js'
import { getPool } from './db.js'

/**
 * GET /api/saude — diagnóstico rápido para achar o que está lento (sem dados de ninguém, sem segredos).
 * Mede, na hora: o banco, o DNS "de verdade" (sem o cache) dos serviços de que o painel depende, a fila de
 * conexões do banco, o atraso do próprio servidor e a memória.
 */

const HOSTS_EXTRAS = ['graph.facebook.com', 'docs.google.com', 'api.brevo.com']
const LIMITE_MS = 8000

async function medir(rotulo, tarefa) {
  const inicio = Date.now()
  try {
    await Promise.race([tarefa(), new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error(`sem resposta em ${LIMITE_MS / 1000}s`)), LIMITE_MS))])
    return { rotulo, ms: Date.now() - inicio, ok: true }
  } catch (erro) {
    return { rotulo, ms: Date.now() - inicio, ok: false, erro: String(erro.message || erro).slice(0, 120) }
  }
}

function atrasoDoServidor() {
  return new Promise((resolver) => {
    const inicio = Date.now()
    setImmediate(() => resolver(Date.now() - inicio))
  })
}

export async function handleSaudeRequest(req, res, env) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  let hostBanco = null
  try {
    hostBanco = env.DATABASE_URL ? new URL(env.DATABASE_URL).hostname : null
  } catch {
    hostBanco = null
  }

  const hosts = [...new Set([hostBanco, ...HOSTS_EXTRAS].filter(Boolean))]
  const inicio = Date.now()

  const [banco, ...nomes] = await Promise.all([
    medir('banco (select 1)', async () => {
      if (!env.DATABASE_URL) throw new Error('DATABASE_URL não configurada')
      await getPool(env).query('select 1')
    }),
    // dns.promises.lookup não passa pelo cache: mostra a velocidade real do DNS do servidor.
    ...hosts.map((host) => medir(`DNS ${host}`, () => dns.promises.lookup(host))),
  ])

  let pool = null
  try {
    if (env.DATABASE_URL) {
      const p = getPool(env)
      pool = { total: p.totalCount, ociosas: p.idleCount, esperando: p.waitingCount, maximo: p.options.max }
    }
  } catch {
    pool = null
  }

  const memoria = process.memoryUsage()
  const corpo = {
    ok: banco.ok && nomes.every((n) => n.ok),
    medidoEm: new Date().toISOString(),
    totalMs: Date.now() - inicio,
    servidor: {
      atrasoDoServidorMs: await atrasoDoServidor(),
      ligadoHaMinutos: Math.round(process.uptime() / 60),
      memoriaMB: Math.round(memoria.rss / 1024 / 1024),
      node: process.version,
      threadsDeDns: process.env.UV_THREADPOOL_SIZE ?? 'padrão (4)',
    },
    banco,
    filaDoBanco: pool,
    dns: nomes,
    cacheDeDns: dnsEstatisticas,
  }
  res.statusCode = 200
  res.end(JSON.stringify(corpo))
}
