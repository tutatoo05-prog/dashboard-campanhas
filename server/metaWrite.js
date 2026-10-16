import { getAdAccounts, graphGet, normalizeAccountId, parseAllowedAccountIds } from './metaApi.js'
import { limparCache } from './cacheCurto.js'
import { readRequestBody } from './readBody.js'
import { query } from './db.js'

/**
 * Alterações na Meta feitas pelo painel (só admin; o middleware já barra POST de quem não é).
 *
 *  POST /api/meta/campaigns/:id/status  { status: 'PAUSED' | 'ACTIVE' }
 *  POST /api/meta/campaigns/:id/budget  { factor: 0.1–1.2 }  ou  { restore: [{ id, dailyBudget }] }
 *
 * Exige o token com permissão "ads_management". Tudo que muda fica em meta_action_log.
 */

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'
const CAMPAIGN_ID_RE = /^\d{5,25}$/

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

class MetaWriteError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

async function graphPost(path, params, token) {
  const body = new URLSearchParams({ access_token: token })
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) body.set(key, String(value))
  }

  const response = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await response.json().catch(() => ({}))
  // Qualquer alteração na Meta (com sucesso ou não) invalida o que o painel guardou: status, orçamento...
  limparCache()

  if (!response.ok || data?.error) {
    const code = data?.error?.code
    const message = data?.error?.message ?? `Erro na API Meta (${response.status})`
    if (code === 200 || code === 10 || code === 3 || /permission/i.test(message)) {
      throw new MetaWriteError(
        'O token da Meta não tem permissão para alterar campanhas (precisa de "ads_management"). Gere um novo token com essa permissão ou altere direto no Gerenciador de Anúncios.',
        403,
      )
    }
    if (code === 190) throw new MetaWriteError('O token da Meta expirou. Gere um novo e atualize o META_ACCESS_TOKEN.', 401)
    throw new MetaWriteError(message, 502)
  }

  return data
}

async function loadCampaign(token, env, campaignId) {
  const info = await graphGet(
    `/${campaignId}`,
    { fields: 'id,name,account_id,status,effective_status,daily_budget,lifetime_budget' },
    token,
  )
  const accountId = normalizeAccountId(String(info.account_id ?? ''))
  const accounts = await getAdAccounts(token, { allowedIds: parseAllowedAccountIds(env) })
  if (!accountId || !accounts.some((account) => account.id === accountId)) {
    throw new MetaWriteError('Esta campanha não pertence a uma conta liberada no painel.', 403)
  }
  return { ...info, accountId }
}

async function loadAdsets(token, campaignId) {
  const data = await graphGet(
    `/${campaignId}/adsets`,
    { fields: 'id,name,daily_budget,effective_status', limit: '100' },
    token,
  )
  return data.data ?? []
}

const toUnits = (cents) => Math.round(Number(cents)) / 100

/** Multiplica o orçamento diário (da campanha, ou de cada conjunto ativo se o orçamento for por conjunto). */
async function scaleBudget(token, campaign, factor) {
  if (campaign.lifetime_budget && Number(campaign.lifetime_budget) > 0 && !campaign.daily_budget) {
    throw new MetaWriteError(
      'Esta campanha usa orçamento vitalício. Ajuste direto no Gerenciador de Anúncios.',
      400,
    )
  }

  if (campaign.daily_budget && Number(campaign.daily_budget) > 0) {
    const from = Number(campaign.daily_budget)
    const to = Math.max(1, Math.round(from * factor))
    await graphPost(`/${campaign.id}`, { daily_budget: to }, token)
    return { mode: 'campaign', changes: [{ id: campaign.id, name: campaign.name, fromCents: from, toCents: to }] }
  }

  const adsets = (await loadAdsets(token, campaign.id)).filter(
    (adset) => Number(adset.daily_budget) > 0 && (adset.effective_status ?? 'ACTIVE') === 'ACTIVE',
  )
  if (!adsets.length) {
    throw new MetaWriteError('Não encontrei orçamento diário para alterar nesta campanha.', 400)
  }

  const changes = []
  for (const adset of adsets) {
    const from = Number(adset.daily_budget)
    const to = Math.max(1, Math.round(from * factor))
    await graphPost(`/${adset.id}`, { daily_budget: to }, token)
    changes.push({ id: adset.id, name: adset.name, fromCents: from, toCents: to })
  }
  return { mode: 'adsets', changes }
}

/** Devolve os orçamentos antigos (desfazer). Só mexe em ids que são da própria campanha. */
async function restoreBudgets(token, campaign, restore) {
  const allowed = new Set([campaign.id])
  if (!campaign.daily_budget) {
    for (const adset of await loadAdsets(token, campaign.id)) allowed.add(String(adset.id))
  }

  const changes = []
  for (const entry of restore) {
    const id = String(entry?.id ?? '')
    const cents = Math.round(Number(entry?.dailyBudget))
    if (!allowed.has(id) || !Number.isFinite(cents) || cents < 1) {
      throw new MetaWriteError('Pedido de restauração inválido.', 400)
    }
    await graphPost(`/${id}`, { daily_budget: cents }, token)
    changes.push({ id, toCents: cents })
  }
  return { mode: 'restore', changes }
}

async function logChange(env, entry) {
  try {
    await query(
      env,
      `insert into meta_action_log (user_email, account_id, campaign_id, campaign_name, action, detail, ok, error)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        entry.userEmail ?? null,
        entry.accountId ?? null,
        entry.campaignId ?? null,
        entry.campaignName ?? null,
        entry.action,
        JSON.stringify(entry.detail ?? {}),
        entry.ok,
        entry.error ?? null,
      ],
    )
  } catch (error) {
    // Registro é auditoria: se a tabela ainda não existe, a ação não deve falhar por isso.
    console.warn('[meta-write] não consegui gravar meta_action_log:', error.message)
  }
}

export async function handleMetaWriteRequest(req, res, env, user) {
  const token = env.META_ACCESS_TOKEN
  if (!token) return sendJson(res, 503, { error: 'META_ACCESS_TOKEN não configurado.' })

  const { pathname } = new URL(req.url, 'http://localhost')
  const match = pathname.match(/^\/api\/meta\/campaigns\/([^/]+)\/(status|budget)$/)
  if (!match) return sendJson(res, 404, { error: 'Rota não encontrada.' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido.' })

  const [, campaignId, kind] = match
  if (!CAMPAIGN_ID_RE.test(campaignId)) return sendJson(res, 400, { error: 'Campanha inválida.' })

  let body
  try {
    const raw = await readRequestBody(req, 8 * 1024)
    body = raw ? JSON.parse(raw) : {}
  } catch (error) {
    if (error.message === 'Payload too large') return sendJson(res, 413, { error: 'Requisição muito grande.' })
    return sendJson(res, 400, { error: 'Requisição inválida.' })
  }

  let campaign = null
  let action = kind
  try {
    campaign = await loadCampaign(token, env, campaignId)

    if (kind === 'status') {
      const status = String(body.status ?? '')
      if (status !== 'PAUSED' && status !== 'ACTIVE') {
        return sendJson(res, 400, { error: 'Status inválido (use PAUSED ou ACTIVE).' })
      }
      action = status === 'PAUSED' ? 'pause' : 'resume'
      await graphPost(`/${campaignId}`, { status }, token)
      const detail = { from: campaign.effective_status ?? campaign.status, to: status }
      await logChange(env, { userEmail: user?.email, accountId: campaign.accountId, campaignId, campaignName: campaign.name, action, detail, ok: true })
      console.log(`[meta-write] ${user?.email} ${action} ${campaignId} (${campaign.name})`)
      return sendJson(res, 200, { success: true, campaign: { id: campaignId, name: campaign.name, status }, action })
    }

    let result
    if (Array.isArray(body.restore)) {
      action = 'budget_restore'
      if (!body.restore.length || body.restore.length > 100) throw new MetaWriteError('Pedido de restauração inválido.', 400)
      result = await restoreBudgets(token, campaign, body.restore)
    } else {
      const factor = Number(body.factor)
      if (!Number.isFinite(factor) || factor < 0.1 || factor > 1.2) {
        return sendJson(res, 400, { error: 'Fator de orçamento inválido (use entre 0,1 e 1,2).' })
      }
      action = factor < 1 ? 'budget_down' : 'budget_up'
      result = await scaleBudget(token, campaign, factor)
      result.factor = factor
    }

    const changes = result.changes.map((change) => ({
      id: change.id,
      name: change.name ?? null,
      from: change.fromCents != null ? toUnits(change.fromCents) : null,
      to: toUnits(change.toCents),
      fromCents: change.fromCents ?? null,
      toCents: change.toCents,
    }))
    await logChange(env, { userEmail: user?.email, accountId: campaign.accountId, campaignId, campaignName: campaign.name, action, detail: { mode: result.mode, factor: result.factor, changes }, ok: true })
    console.log(`[meta-write] ${user?.email} ${action} ${campaignId} (${campaign.name})`)
    return sendJson(res, 200, { success: true, action, mode: result.mode, campaign: { id: campaignId, name: campaign.name }, changes })
  } catch (error) {
    const status = error instanceof MetaWriteError ? error.status : 502
    const message = error instanceof MetaWriteError ? error.message : error.message || 'Erro ao alterar a campanha na Meta.'
    await logChange(env, { userEmail: user?.email, accountId: campaign?.accountId, campaignId, campaignName: campaign?.name, action, detail: {}, ok: false, error: message })
    console.error(`[meta-write] falha (${action} ${campaignId}):`, message)
    return sendJson(res, status, { error: message })
  }
}
