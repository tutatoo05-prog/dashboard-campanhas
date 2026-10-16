import { query } from './db.js'
import { readRequestBody } from './readBody.js'
import { TIPOS_ESCOLHIVEIS } from '../src/lib/campaignType.js'
import { isAdmin } from './roles.js'
import { limparCache } from './cacheCurto.js'

/**
 * Ficha da campanha: o que o usuário confirmou (ou corrigiu) sobre ela. O que não estiver aqui o dash
 * descobre sozinho (src/lib/campaignType.js). Tabela campaign_profiles (db/schema.sql).
 */

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

/** Mapa campaign_id -> { tipo, metaCusto } da conta. Se a tabela ainda não existe, devolve vazio. */
export async function listarFichas(env, accountId) {
  if (!env?.DATABASE_URL) return new Map()
  try {
    const { rows } = await query(env, 'select campaign_id, tipo, meta_custo from campaign_profiles where account_id = $1', [accountId])
    return new Map(rows.map((row) => [String(row.campaign_id), { tipo: row.tipo, metaCusto: row.meta_custo == null ? null : Number(row.meta_custo) }]))
  } catch (error) {
    if (error?.code !== '42P01') console.error('[fichas] falha ao ler as fichas:', error.message || error)
    return new Map()
  }
}

/** Aplica o tipo escolhido pelo usuário por cima do que o dash descobriu sozinho. */
export function aplicarFichas(rows, fichas) {
  if (!fichas.size) return rows
  return rows.map((row) => {
    const ficha = fichas.get(String(row.campaignId ?? row.id))
    if (!ficha) return row
    return {
      ...row,
      ...(ficha.tipo ? { tipo: ficha.tipo, tipoOrigem: 'manual', tipoConfianca: 'alta', tipoMotivo: 'Confirmado por você.' } : {}),
      metaCusto: ficha.metaCusto,
    }
  })
}

/**
 * GET /api/fichas?accountId=act_...   → fichas salvas da conta
 * PUT /api/fichas {accountId, campaignId, tipo, metaCusto}   (só admin) → tipo null volta para o automático
 */
export async function handleFichasRequest(req, res, env, user) {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.replace(/\/+$/, '') !== '/api/fichas') return sendJson(res, 404, { error: 'Rota não encontrada.' })

  try {
    if (req.method === 'GET') {
      const accountId = url.searchParams.get('accountId')
      if (!accountId) return sendJson(res, 400, { error: 'Informe accountId.' })
      const fichas = await listarFichas(env, accountId)
      return sendJson(res, 200, { fichas: [...fichas].map(([campaignId, ficha]) => ({ campaignId, ...ficha })) })
    }

    if (req.method === 'PUT') {
      if (!isAdmin(user)) return sendJson(res, 403, { error: 'Só admin.' })
      const corpo = JSON.parse((await readRequestBody(req)) || '{}')
      const accountId = String(corpo.accountId ?? '').trim()
      const campaignId = String(corpo.campaignId ?? '').trim()
      const tipo = corpo.tipo == null || corpo.tipo === '' ? null : String(corpo.tipo)
      const metaCusto = corpo.metaCusto == null || corpo.metaCusto === '' ? null : Number(corpo.metaCusto)
      if (!accountId || !campaignId) return sendJson(res, 400, { error: 'Informe accountId e campaignId.' })
      if (tipo && !TIPOS_ESCOLHIVEIS.includes(tipo)) return sendJson(res, 400, { error: 'Tipo de campanha inválido.' })
      if (metaCusto != null && (!Number.isFinite(metaCusto) || metaCusto <= 0 || metaCusto > 1_000_000)) return sendJson(res, 400, { error: 'Meta de custo inválida.' })

      if (!tipo && metaCusto == null) {
        await query(env, 'delete from campaign_profiles where account_id = $1 and campaign_id = $2', [accountId, campaignId])
      } else {
        await query(
          env,
          `insert into campaign_profiles (account_id, campaign_id, tipo, meta_custo, atualizado_por, atualizado_em)
           values ($1, $2, $3, $4, $5, now())
           on conflict (account_id, campaign_id) do update set tipo = $3, meta_custo = $4, atualizado_por = $5, atualizado_em = now()`,
          [accountId, campaignId, tipo, metaCusto, user?.email ?? null],
        )
      }
      limparCache('painel|') // o tipo aparece em todas as telas: refaz a leitura
      return sendJson(res, 200, { ok: true })
    }

    return sendJson(res, 405, { error: 'Método não permitido.' })
  } catch (error) {
    if (error?.code === '42P01') return sendJson(res, 503, { error: 'Migração pendente: rode o bloco "Ficha da campanha" de db/schema.sql.' })
    console.error('[fichas]', error)
    return sendJson(res, 500, { error: error.message || 'Erro nas fichas de campanha.' })
  }
}
