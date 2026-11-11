import { query } from '../db.js'
import { readRequestBody } from '../readBody.js'
import { getSaoPauloClock } from '../clock.js'
import { garantirEsquemaFinancas } from './esquema.js'
import { linhaValida, mesValido } from './linhas.js'
import { montarResumo } from './resumo.js'
import { cotacoesAoVivo } from './cambio.js'
import { estadoDasFontes, sincronizar, ultimaSync } from './sync.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

async function lerCorpo(req) {
  try {
    return JSON.parse(await readRequestBody(req))
  } catch {
    return null
  }
}

async function lerCaixa(env) {
  const { rows } = await query(env, "select valor from fin_config where chave = 'caixa'")
  const numero = rows[0] ? Number(rows[0].valor) : NaN
  return Number.isFinite(numero) ? numero : null
}

async function resposta(env, ano) {
  const { rows } = await query(env, 'select mes, tipo, linha, valor, origem from fin_lancamentos where mes >= $1 and mes <= $2', [`${ano}-01`, `${ano}-12`])
  return {
    success: true,
    ...montarResumo(rows, ano, await lerCaixa(env)),
    fontes: estadoDasFontes(env),
    sincronizacao: ultimaSync(),
  }
}

/**
 * GET  /api/financas?ano=2026          — tabela do ano (receitas, custos, lucro, indicadores)
 * GET  /api/financas/cambio          — dólar e euro ao vivo em reais
 * PUT  /api/financas/lancamento        — { mes, tipo, linha, valor } grava; valor null apaga (volta ao automático)
 * PUT  /api/financas/caixa             — { valor } caixa acumulado
 * POST /api/financas/sincronizar       — { desde?: 'AAAA-MM' } busca Hotmart, Meta e YouTube agora
 * Só administrador (cargo "usuario" não tem acesso, ver roles.js).
 */
export async function handleFinancasRequest(req, res, env) {
  const url = new URL(req.url, 'http://localhost')
  try {
    await garantirEsquemaFinancas(env)

    if (url.pathname === '/api/financas' && req.method === 'GET') {
      const ano = Number(url.searchParams.get('ano') ?? getSaoPauloClock().dateKey.slice(0, 4))
      if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) return sendJson(res, 400, { error: 'Ano inválido.' })
      return sendJson(res, 200, await resposta(env, ano))
    }

    if (url.pathname === '/api/financas/cambio' && req.method === 'GET') {
      try {
        return sendJson(res, 200, { success: true, cotacoes: await cotacoesAoVivo(['USD', 'EUR']) })
      } catch {
        return sendJson(res, 502, { error: 'Cotação indisponível agora.' })
      }
    }

    if (url.pathname === '/api/financas/lancamento' && req.method === 'PUT') {
      const corpo = await lerCorpo(req)
      if (!corpo || !mesValido(corpo.mes) || !linhaValida(corpo.tipo, corpo.linha)) return sendJson(res, 400, { error: 'Mês ou linha inválidos.' })
      if (corpo.valor === null) {
        await query(env, 'delete from fin_lancamentos where mes = $1 and tipo = $2 and linha = $3', [corpo.mes, corpo.tipo, corpo.linha])
      } else {
        const valor = Number(corpo.valor)
        if (!Number.isFinite(valor) || Math.abs(valor) > 1e9) return sendJson(res, 400, { error: 'Valor inválido.' })
        await query(
          env,
          `insert into fin_lancamentos (mes, tipo, linha, valor, origem) values ($1, $2, $3, $4, 'manual')
           on conflict (mes, tipo, linha) do update set valor = excluded.valor, origem = 'manual', atualizado_em = now()`,
          [corpo.mes, corpo.tipo, corpo.linha, Math.round(valor * 100) / 100],
        )
      }
      return sendJson(res, 200, await resposta(env, Number(corpo.mes.slice(0, 4))))
    }

    if (url.pathname === '/api/financas/caixa' && req.method === 'PUT') {
      const corpo = await lerCorpo(req)
      const valor = Number(corpo?.valor)
      if (!corpo || corpo.valor === null || !Number.isFinite(valor)) return sendJson(res, 400, { error: 'Valor inválido.' })
      await query(
        env,
        "insert into fin_config (chave, valor) values ('caixa', $1) on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()",
        [String(Math.round(valor * 100) / 100)],
      )
      return sendJson(res, 200, await resposta(env, Number(url.searchParams.get('ano')) || Number(getSaoPauloClock().dateKey.slice(0, 4))))
    }

    if (url.pathname === '/api/financas/sincronizar' && req.method === 'POST') {
      const corpo = (await lerCorpo(req)) ?? {}
      if (corpo.desde !== undefined && !mesValido(corpo.desde)) return sendJson(res, 400, { error: 'Mês inicial inválido (use AAAA-MM).' })
      await sincronizar(env, corpo.desde ? { desde: corpo.desde } : {})
      return sendJson(res, 200, await resposta(env, Number(getSaoPauloClock().dateKey.slice(0, 4))))
    }

    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  } catch (erro) {
    console.error('[financas]', erro.message || erro)
    return sendJson(res, 502, { error: 'Não consegui acessar as finanças agora. Tente de novo em instantes.' })
  }
}
