import { buildAndSendDigest, buildDigest, resolveDigestPeriod, resolveDigestSlot } from './digest.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function readQuery(req) {
  const url = new URL(req.url, 'http://localhost')
  return Object.fromEntries(url.searchParams.entries())
}

function getProvidedSecret(req, query) {
  const header = req.headers['x-digest-secret']
  if (typeof header === 'string' && header.trim()) return header.trim()
  if (typeof query.secret === 'string' && query.secret.trim()) return query.secret.trim()
  return ''
}

function assertDigestSecret(req, res, env, query) {
  const expected = String(env.DIGEST_CRON_SECRET || '').trim()
  if (!expected) {
    sendJson(res, 503, {
      error: 'DIGEST_CRON_SECRET não configurado no servidor.',
    })
    return false
  }

  const provided = getProvidedSecret(req, query)
  if (!provided || provided !== expected) {
    sendJson(res, 401, { error: 'Secret inválido.' })
    return false
  }

  return true
}

/**
 * GET  /api/digest          → só monta o JSON (para inspecionar / n8n puxar)
 * POST /api/digest/run      → monta e envia ao webhook n8n
 *
 * Auth: header X-Digest-Secret ou ?secret=...
 */
export async function handleDigestRequest(req, res, env) {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname
  const query = readQuery(req)

  if (!assertDigestSecret(req, res, env, query)) return

  const hour = query.hour != null ? Number(query.hour) : null
  const slot =
    query.slot ||
    (Number.isFinite(hour) ? resolveDigestSlot(hour) : undefined)
  const period = query.period || resolveDigestPeriod(slot)
  const accountId = query.accountId || undefined

  try {
    if (pathname === '/api/digest' && (req.method === 'GET' || req.method === 'POST')) {
      const digest = await buildDigest(env, { period, slot, accountId })
      return sendJson(res, 200, digest)
    }

    if (pathname === '/api/digest/run' && (req.method === 'GET' || req.method === 'POST')) {
      const result = await buildAndSendDigest(env, { period, slot, accountId })
      return sendJson(res, 200, {
        success: true,
        sent: true,
        slot: result.digest.slot,
        period: result.digest.period,
        account: result.digest.account,
        accounts: (result.digest.accounts ?? []).map((row) => row.account),
        tips: result.digest.tips?.length ?? 0,
        delivery: {
          status: result.delivery.status,
          webhookUrl: result.delivery.webhookUrl,
        },
        message: result.digest.message,
      })
    }

    return sendJson(res, 404, { error: 'Rota de digest não encontrada.' })
  } catch (error) {
    console.error('[digest]', error)
    return sendJson(res, 500, {
      error: error.message || 'Erro ao gerar digest.',
    })
  }
}
