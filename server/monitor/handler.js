import { montarResumo, rodarChecagens, garantirTabela } from './monitor.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** GET /api/monitor (resumo) · POST /api/monitor/verificar (confere agora). Só admin: a regra está no middleware. */
export async function handleMonitorRequest(req, res, env) {
  const { pathname } = new URL(req.url, 'http://localhost')
  try {
    if (pathname === '/api/monitor' && req.method === 'GET') {
      await garantirTabela(env)
      return sendJson(res, 200, await montarResumo(env))
    }
    if (pathname === '/api/monitor/verificar' && req.method === 'POST') {
      await garantirTabela(env)
      await rodarChecagens(env)
      return sendJson(res, 200, await montarResumo(env))
    }
    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  } catch (erro) {
    console.error('[monitor] erro na API:', erro.message || erro)
    return sendJson(res, 502, { error: 'Não consegui ler o monitoramento agora.' })
  }
}
