import { query } from './db.js'
import { getSaoPauloClock } from './clock.js'

/**
 * Leads reais do site (tabela leads do dash), contados por campanha.
 *
 * Por que existe: o pixel da Meta só vê parte dos cadastros (o evento de Lead nem
 * sempre dispara no formulário). O site grava o utm_campaign (nome) e, quando a
 * campanha manda, o utm_id (ID) de cada cadastro, então dá para contar os leads de verdade.
 *
 * Cruzamento: por ID da campanha (leads.campaign_id). Cadastro novo traz o utm_id; os que
 * não trazem ficam com o ID "congelado" a partir do nome (resolveCampaignIds). Depois disso,
 * renomear a campanha na Meta não perde os leads antigos. Enquanto um lead ainda não tem ID,
 * ele é cruzado pelo nome, como antes.
 */

const DAY_MS = 86_400_000
const RESOLVE_EVERY_MS = 60_000

function toUtcMs(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function fromUtcMs(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

function addDays(dateKey, delta) {
  return fromUtcMs(toUtcMs(dateKey) + delta * DAY_MS)
}

/**
 * Janela de datas (AAAA-MM-DD, fuso de São Paulo) igual à que a Meta usa em cada período,
 * para o número do site e o número da Meta cobrirem exatamente os mesmos dias.
 * (last_7d / last_30d da Meta terminam ontem; today e this_month incluem hoje.)
 */
export function resolveMetaWindow(period, { since, until } = {}, now = new Date()) {
  const today = getSaoPauloClock(now).dateKey

  switch (period) {
    case 'today':
      return { since: today, until: today }
    case 'yesterday': {
      const day = addDays(today, -1)
      return { since: day, until: day }
    }
    case 'last7':
      return { since: addDays(today, -7), until: addDays(today, -1) }
    case 'last30':
      return { since: addDays(today, -30), until: addDays(today, -1) }
    case 'prev7':
      return { since: addDays(today, -13), until: addDays(today, -7) }
    case 'prev30':
      return { since: addDays(today, -59), until: addDays(today, -30) }
    case 'this_month':
      return { since: `${today.slice(0, 8)}01`, until: today }
    case 'last_month': {
      const firstOfThisMonth = `${today.slice(0, 8)}01`
      const lastDay = addDays(firstOfThisMonth, -1)
      return { since: `${lastDay.slice(0, 8)}01`, until: lastDay }
    }
    case 'custom':
      return since && until ? { since, until } : null
    default:
      return null
  }
}

export function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase()
}

function bounds(window) {
  // O Brasil não tem horário de verão desde 2019: São Paulo é sempre UTC-03.
  return [`${window.since}T00:00:00-03:00`, `${addDays(window.until, 1)}T00:00:00-03:00`]
}

let lastResolveAt = 0

/**
 * "Congela" o ID da campanha nos leads que ainda não têm: casa o nome gravado no cadastro
 * (utm_campaign) com o nome atual das campanhas e grava o campaign_id. Nome repetido em duas
 * campanhas é ignorado (ambíguo). Roda no máximo 1x por minuto por processo.
 *
 * `campaigns`: Map(id -> { name }) como o de getCampaignMetaMap.
 */
export async function resolveCampaignIds(env, campaigns, { force = false } = {}) {
  if (!env.DATABASE_URL || !campaigns || campaigns.size === 0) return 0
  const now = Date.now()
  if (!force && now - lastResolveAt < RESOLVE_EVERY_MS) return 0
  lastResolveAt = now

  const idsByName = new Map()
  for (const [id, meta] of campaigns) {
    const name = normalizeName(meta?.name)
    if (!name) continue
    idsByName.set(name, idsByName.has(name) ? null : String(id))
  }
  const entries = [...idsByName].filter(([, id]) => id)
  if (entries.length === 0) return 0

  try {
    const result = await query(
      env,
      `update leads l
          set campaign_id = m.id
         from unnest($1::text[], $2::text[]) as m(name, id)
        where l.campaign_id is null
          and lower(btrim(l.campanha)) = m.name`,
      [entries.map(([name]) => name), entries.map(([, id]) => id)],
    )
    return result.rowCount ?? 0
  } catch (error) {
    // 42703 = coluna campaign_id ainda não existe (migração pendente): segue só pelo nome.
    if (error?.code !== '42703') console.warn('[leads-site] não consegui gravar o ID das campanhas:', error.message || error)
    return 0
  }
}

/** Totais de leads no intervalo: { byId: Map(id -> n), byName: Map(nome -> n) } (byName = leads sem ID). */
export async function getSiteLeadsByCampaign(env, window) {
  const totals = { byId: new Map(), byName: new Map() }
  if (!window || !env.DATABASE_URL) return totals
  try {
    const result = await query(
      env,
      `select campaign_id,
              case when campaign_id is null then lower(btrim(campanha)) end as nome,
              count(*)::int as leads
         from leads
        where created_at >= $1::timestamptz and created_at < $2::timestamptz
          and (campaign_id is not null or btrim(campanha) <> '')
        group by 1, 2`,
      bounds(window),
    )
    for (const row of result.rows) {
      if (row.campaign_id) totals.byId.set(row.campaign_id, row.leads)
      else totals.byName.set(row.nome, row.leads)
    }
  } catch (error) {
    console.warn('[leads-site] não consegui contar os leads do site:', error.message || error)
  }
  return totals
}

/** Leads do site por campanha e por dia: { has(campanha), get(campanha, AAAA-MM-DD) } (campanha = { campaignId, name }). */
export async function getSiteLeadsDaily(env, window) {
  const byId = new Map()
  const byName = new Map()
  const bump = (map, key, day, leads) => {
    if (!map.has(key)) map.set(key, new Map())
    map.get(key).set(day, (map.get(key).get(day) ?? 0) + leads)
  }
  const daily = {
    has: (campaign) => byId.has(String(campaign.campaignId)) || byName.has(normalizeName(campaign.name)),
    get: (campaign, day) =>
      (byId.get(String(campaign.campaignId))?.get(day) ?? 0) + (byName.get(normalizeName(campaign.name))?.get(day) ?? 0),
  }
  if (!window || !env.DATABASE_URL) return daily
  try {
    const result = await query(
      env,
      `select campaign_id,
              case when campaign_id is null then lower(btrim(campanha)) end as nome,
              (created_at at time zone 'America/Sao_Paulo')::date::text as dia,
              count(*)::int as leads
         from leads
        where created_at >= $1::timestamptz and created_at < $2::timestamptz
          and (campaign_id is not null or btrim(campanha) <> '')
        group by 1, 2, 3`,
      bounds(window),
    )
    for (const row of result.rows) {
      if (row.campaign_id) bump(byId, row.campaign_id, row.dia, row.leads)
      else bump(byName, row.nome, row.dia, row.leads)
    }
  } catch (error) {
    console.warn('[leads-site] não consegui contar os leads diários do site:', error.message || error)
  }
  return daily
}

function round(value) {
  return Math.round(value * 100) / 100
}

/**
 * Aplica os leads do site a uma linha de campanha. "Leads" passa a ser o maior entre o
 * que o site recebeu e o que o pixel da Meta contou (nunca soma, para não contar em dobro).
 * Guarda os dois números separados para a tela poder explicar a diferença.
 */
export function applySiteLeads(item, siteLeads) {
  const leadsMeta = item.leads ?? 0
  const leadsSite = siteLeads ?? 0
  const leads = Math.max(leadsMeta, leadsSite)
  return {
    ...item,
    leads,
    cpl: leads > 0 ? round(item.spend / leads) : 0,
    leadsMeta,
    leadsSite,
  }
}

export function enrichCampaignsWithSiteLeads(campaigns, totals) {
  return campaigns.map((item) => {
    const byId = item.campaignId ? (totals?.byId.get(String(item.campaignId)) ?? 0) : 0
    const byName = totals?.byName.get(normalizeName(item.name)) ?? 0
    return applySiteLeads(item, byId + byName)
  })
}
