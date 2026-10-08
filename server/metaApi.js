import {
  daysAgoLocal,
  formatLocalDate,
  resolveDailyWindow,
  validateCustomRange,
} from '../src/lib/period.js'

const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

const PERIOD_PRESETS = {
  today: 'today',
  yesterday: 'yesterday',
  last7: 'last_7d',
  last30: 'last_30d',
  this_month: 'this_month',
  last_month: 'last_month',
}

/** Presets Meta + time_range para prev* e personalizado. */
function resolveDateParams(period, { since, until } = {}) {
  if (period === 'custom') {
    const validated = validateCustomRange(since, until)
    if (!validated.ok) {
      throw new Error(validated.error)
    }
    return {
      time_range: JSON.stringify({
        since: validated.since,
        until: validated.until,
      }),
    }
  }

  if (period === 'prev7') {
    return {
      time_range: JSON.stringify({
        since: formatLocalDate(daysAgoLocal(13)),
        until: formatLocalDate(daysAgoLocal(7)),
      }),
    }
  }

  if (period === 'prev30') {
    return {
      time_range: JSON.stringify({
        since: formatLocalDate(daysAgoLocal(59)),
        until: formatLocalDate(daysAgoLocal(30)),
      }),
    }
  }

  const preset = PERIOD_PRESETS[period]
  if (!preset) {
    throw new Error(`Período inválido: ${period}`)
  }

  return { date_preset: preset }
}

const INSIGHT_FIELDS = [
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'spend',
  'impressions',
  'reach',
  'clicks',
  'ctr',
  'cpc',
  'frequency',
  'actions',
  'cost_per_action_type',
].join(',')

const LEVEL_MAP = {
  campaigns: 'campaign',
  adSets: 'adset',
  ads: 'ad',
}

export async function graphGet(path, params, token) {
  const url = new URL(`${GRAPH_BASE}${path}`)
  url.searchParams.set('access_token', token)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const response = await fetch(url)

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message =
      errorBody?.error?.message ?? `Erro na API Meta (${response.status})`
    throw new Error(message)
  }

  return response.json()
}

export async function fetchAllPages(path, params, token) {
  let nextUrl = null
  let first = true
  const items = []

  while (first || nextUrl) {
    const data = first
      ? await graphGet(path, params, token)
      : await fetch(nextUrl).then((r) => r.json())

    first = false
    items.push(...(data.data ?? []))
    nextUrl = data.paging?.next ?? null
  }

  return items
}

// Mantenha em sincronia com os padrões de cor em src/lib/accountTheme.ts —
// só as contas principais (com tema próprio) aparecem no seletor.
const MAIN_ACCOUNT_PATTERNS = [/original/i, /con[e3]ct/i, /academy/i]

function isMainAccount(name) {
  return MAIN_ACCOUNT_PATTERNS.some((pattern) => pattern.test(name ?? ''))
}

export async function getAdAccounts(token, { allowedIds } = {}) {
  const accounts = await fetchAllPages(
    '/me/adaccounts',
    { fields: 'id,name,account_status,currency', limit: '100' },
    token,
  )

  const filtered = allowedIds?.length
    ? accounts.filter((account) => allowedIds.includes(account.id))
    : accounts.filter((account) => account.account_status === 1 && isMainAccount(account.name))

  return filtered.map((account) => ({
    id: account.id,
    name: account.name,
    currency: account.currency ?? 'BRL',
  }))
}

export async function getCampaignMetaMap(token, accountId) {
  const campaigns = await fetchAllPages(
    `/${accountId}/campaigns`,
    { fields: 'id,name,status,effective_status,objective', limit: '500' },
    token,
  )

  return new Map(
    campaigns.map((campaign) => [
      campaign.id,
      {
        status: campaign.effective_status ?? campaign.status,
        objective: campaign.objective,
        name: campaign.name,
      },
    ]),
  )
}

export async function getInsights(token, accountId, period, level, options = {}) {
  const apiLevel = LEVEL_MAP[level] ?? 'campaign'
  const dateParams = resolveDateParams(period, options)

  const [insights, campaignMeta] = await Promise.all([
    fetchAllPages(
      `/${accountId}/insights`,
      {
        level: apiLevel,
        fields: INSIGHT_FIELDS,
        ...dateParams,
        limit: '500',
      },
      token,
    ),
    getCampaignMetaMap(token, accountId),
  ])

  return insights.map((row) => normalizeInsightRow(row, campaignMeta))
}

function normalizeInsightRow(row, campaignMeta) {
  const spend = toNumber(row.spend)
  const impressions = toInt(row.impressions)
  const reach = toInt(row.reach)
  const linkClicks = getActionValue(row.actions, 'link_click') || toInt(row.clicks)
  const leads = extractLeads(row.actions)
  const conversions = extractConversions(row.actions)

  const name = row.ad_name ?? row.adset_name ?? row.campaign_name ?? 'Sem nome'
  const id = row.ad_id ?? row.adset_id ?? row.campaign_id ?? name
  const meta = campaignMeta.get(row.campaign_id) ?? {}

  return {
    id: String(id),
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    adsetId: row.adset_id ? String(row.adset_id) : null,
    name,
    status: mapStatus(meta.status),
    objective: mapObjective(meta.objective),
    spend,
    impressions,
    reach,
    clicks: linkClicks,
    ctr: toNumber(row.ctr),
    cpc: toNumber(row.cpc),
    leads,
    cpl: leads > 0 ? round(spend / leads) : 0,
    conversions,
    cpa: conversions > 0 ? round(spend / conversions) : 0,
    frequency: toNumber(row.frequency),
    dateStart: row.date_start ?? null,
  }
}

function getActionValue(actions, type) {
  if (!Array.isArray(actions)) return 0
  const match = actions.find((action) => action.action_type === type)
  return match ? toInt(match.value) : 0
}

function extractLeads(actions) {
  if (!Array.isArray(actions)) return 0

  const canonicalTypes = [
    'onsite_conversion.lead_grouped',
    'lead',
    'onsite_conversion.lead',
    'onsite_web_lead',
    'offsite_conversion.fb_pixel_lead',
  ]

  for (const type of canonicalTypes) {
    const value = getActionValue(actions, type)
    if (value > 0) return value
  }

  return getActionValue(actions, 'onsite_conversion.messaging_conversation_started_7d')
}

function extractConversions(actions) {
  if (!Array.isArray(actions)) return 0

  const canonicalTypes = [
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
    'onsite_conversion.purchase',
    'complete_registration',
    'offsite_conversion.fb_pixel_complete_registration',
  ]

  for (const type of canonicalTypes) {
    const value = getActionValue(actions, type)
    if (value > 0) return value
  }

  return 0
}

function mapStatus(status) {
  if (status === 'ACTIVE') return 'Ativa'
  if (status === 'PAUSED') return 'Pausada'
  if (!status) return 'Ativa'
  return status
}

function mapObjective(objective) {
  if (!objective) return 'traffic'

  const value = objective.toUpperCase()

  if (value.includes('LEAD')) return 'leads'
  if (value.includes('TRAFFIC') || value.includes('AWARENESS')) return 'traffic'
  if (
    value.includes('SALES') ||
    value.includes('CONVERSION') ||
    value.includes('PURCHASE')
  ) {
    return 'conversion'
  }

  return 'traffic'
}

function toNumber(value) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toInt(value) {
  return Math.round(toNumber(value))
}

function round(value) {
  return Math.round(value * 100) / 100
}

export async function getDashboardData(token, accountId, period, options = {}) {
  const [campaigns, adSets, ads] = await Promise.all([
    getInsights(token, accountId, period, 'campaigns', options),
    getInsights(token, accountId, period, 'adSets', options),
    getInsights(token, accountId, period, 'ads', options),
  ])

  let dailyByCampaign = {}
  try {
    const window = resolveDailyWindow(period, options)
    dailyByCampaign = await getDailyCampaignInsights(token, accountId, window)
  } catch {
    // Tendência é complementar — não derruba o dashboard se a série diária falhar.
    dailyByCampaign = {}
  }

  return { campaigns, adSets, ads, dailyByCampaign }
}

/**
 * Série diária por campanha para análise de tendência.
 * Aceita `{ since, until }` ou número de dias (compatível com chamadas antigas).
 */
export async function getDailyCampaignInsights(token, accountId, options = 14) {
  let since
  let until

  if (typeof options === 'number' || options == null) {
    const safeDays = Math.max(4, Math.min(30, Number(options) || 14))
    since = formatLocalDate(daysAgoLocal(safeDays - 1))
    until = formatLocalDate(daysAgoLocal(0))
  } else if (options.since && options.until) {
    since = options.since
    until = options.until
  } else {
    const safeDays = Math.max(4, Math.min(30, Number(options.days) || 14))
    since = formatLocalDate(daysAgoLocal(safeDays - 1))
    until = formatLocalDate(daysAgoLocal(0))
  }

  const [insights, campaignMeta] = await Promise.all([
    fetchAllPages(
      `/${accountId}/insights`,
      {
        level: 'campaign',
        fields: INSIGHT_FIELDS,
        time_increment: '1',
        time_range: JSON.stringify({ since, until }),
        limit: '500',
      },
      token,
    ),
    getCampaignMetaMap(token, accountId),
  ])

  const rows = insights.map((row) => normalizeInsightRow(row, campaignMeta))
  return groupDailyByCampaign(rows)
}

function groupDailyByCampaign(rows) {
  const map = {}

  for (const row of rows) {
    const key = String(row.campaignId ?? row.id)
    if (!key || key === 'null') continue

    if (!map[key]) map[key] = []
    map[key].push({
      date: row.dateStart,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      leads: row.leads,
      conversions: row.conversions,
      ctr: row.ctr,
      cpc: row.cpc,
      cpl: row.leads > 0 ? round(row.spend / row.leads) : null,
    })
  }

  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
  }

  return map
}

export function normalizeAccountId(accountId) {
  if (!accountId) return null
  return accountId.startsWith('act_') ? accountId : `act_${accountId}`
}

/** META_ALLOWED_ACCOUNT_IDS=act_a,act_b — contas que devem aparecer mesmo com account_status inativo. */
export function parseAllowedAccountIds(env) {
  const raw = env.META_ALLOWED_ACCOUNT_IDS
  if (typeof raw !== 'string' || !raw.trim()) return null
  const ids = raw.split(',').map((id) => normalizeAccountId(id.trim())).filter(Boolean)
  return ids.length ? ids : null
}

export function resolveAccountId(accounts, preferredId) {
  const normalized = normalizeAccountId(preferredId)

  if (normalized && accounts.some((account) => account.id === normalized)) {
    return normalized
  }

  return accounts[0]?.id ?? null
}
