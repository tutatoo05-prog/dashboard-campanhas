import * as repoPadrao from './repo.js'
import { sincronizarClube } from './sync.js'
import { appUrl, statusDaConfiguracao } from './config.js'
import { redirectGoogle } from './youtube.js'
import { redirectDiscord } from './discord.js'

// Painel do clube (só admin; a trava de cargo está no middleware):
//   GET  /api/clube              → o que falta configurar, números, evolução e a lista de membros
//   POST /api/clube/sincronizar  → lê as fontes agora (Essentials, YouTube) e acerta os cargos do Discord

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export async function handleClubeRequest(req, res, env, deps = {}) {
  const repo = deps.repo ?? repoPadrao
  const sincronizar = deps.sincronizar ?? sincronizarClube
  const { pathname } = new URL(req.url, 'http://localhost')

  const config = statusDaConfiguracao(env)
  // Endereços que a pessoa que configura precisa cadastrar nos painéis do Google e do Discord.
  const enderecos = { retornoGoogle: redirectGoogle(env), retornoDiscord: redirectDiscord(env), paginaDeResgate: `${appUrl(env)}/discord` }

  try {
    if (pathname === '/api/clube' && req.method === 'GET') {
      const [resumo, membros] = await Promise.all([repo.resumo(env), repo.listar(env)])
      return sendJson(res, 200, { success: true, config, enderecos, precisaMigracao: false, ...resumo, membros })
    }

    if (pathname === '/api/clube/sincronizar' && req.method === 'POST') {
      const resultado = await sincronizar(env)
      return sendJson(res, 200, { success: true, resultado })
    }

    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  } catch (erro) {
    if (repo.ehFaltaDeTabela?.(erro)) {
      return sendJson(res, 200, { success: true, config, enderecos, precisaMigracao: true, plataformas: null, evolucao: [], estado: {}, membros: [] })
    }
    console.error('[clube] erro no painel:', String(erro?.message ?? erro).slice(0, 200))
    return sendJson(res, 502, { error: 'Não consegui ler o clube agora.' })
  }
}
