import { query } from './db.js'
import { getSaoPauloClock } from './clock.js'

/**
 * Leads reais do site (tabela leads do dash), contados por campanha.
 *
 * Por que existe: o pixel da Meta só vê parte dos cadastros (o evento de Lead nem
 * sempre dispara no formulário). O site grava o utm_campaign de cada cadastro, então
 * dá para contar os leads de verdade e cruzar pelo nome da campanha.
 */

const DAY_MS = 86_400_000

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

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase()
}

function bounds(window) {
  // O Brasil não tem horário de verão desde 2019: São Paulo é sempre UTC-03.
  return [`${window.since}T00:00:00-03:00`, `${addDays(window.until, 1)}T00:00:00-03:00`]
}

/** Map(nome da campanha em minúsculas -> leads) no intervalo. Falha vira mapa vazio. */
export async function getSiteLeadsByCampaign(env, window) {
  const totals = new Map()
  if (!window || !env.DATABASE_URL) return totals
  try {
    const result = await query(
      env,
      `select lower(btrim(campanha)) as campanha, count(*)::int as leads
         from leads
        where created_at >= $1::timestamptz and created_at < $2::timestamptz
          and btrim(campanha) <> ''
        group by 1`,
      bounds(window),
    )
    for (const row of result.rows) totals.set(row.campanha, row.leads)
  } catch (error) {
    console.warn('[leads-site] não consegui contar os leads do site:', error.message || error)
  }
  return totals
}

/** Leads do site por campanha e por dia: { has(nome), get(nome, AAAA-MM-DD) }. */
export async function getSiteLeadsDaily(env, window) {
  const byDay = new Map()
  const campaigns = new Set()
  const daily = {
    has: (name) => campaigns.has(normalizeName(name)),
    get: (name, day) => byDay.get(normalizeName(name))?.get(day) ?? 0,
  }
  if (!window || !env.DATABASE_URL) return daily
  try {
    const result = await query(
      env,
      `select lower(btrim(campanha)) as campanha,
              (created_at at time zone 'America/Sao_Paulo')::date::text as dia,
              count(*)::int as leads
         from leads
        where created_at >= $1::timestamptz and created_at < $2::timestamptz
          and btrim(campanha) <> ''
        group by 1, 2`,
      bounds(window),
    )
    for (const row of result.rows) {
      campaigns.add(row.campanha)
      if (!byDay.has(row.campanha)) byDay.set(row.campanha, new Map())
      byDay.get(row.campanha).set(row.dia, row.leads)
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

export function enrichCampaignsWithSiteLeads(campaigns, siteTotals) {
  if (!siteTotals || siteTotals.size === 0) {
    return campaigns.map((item) => applySiteLeads(item, 0))
  }
  return campaigns.map((item) => applySiteLeads(item, siteTotals.get(normalizeName(item.name)) ?? 0))
}

export { normalizeName }
