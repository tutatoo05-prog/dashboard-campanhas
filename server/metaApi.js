import { inferirTipo } from '../src/lib/campaignType.js'
import { comCache, limparCache } from './cacheCurto.js'
import { comNovaTentativa, criarLimitador } from './limitador.js'
import { aplicarFichas, listarFichas } from './fichas.js'
import {
  daysAgoLocal,
  formatLocalDate,
  resolveDailyWindow,
  validateCustomRange,
} from '../src/lib/period.js'
import {
  enrichCampaignsWithSiteLeads,
  getSiteLeadsByCampaign,
  getSiteLeadsDaily,
  resolveCampaignIds,
  resolveMetaWindow,
} from './siteLeads.js'

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

// Sem limite, abrir uma tela dispara dezenas de conexões de uma vez e todas falham por tempo esgotado.
const limitarMeta = criarLimitador(5)
const TEMPO_MAXIMO_META_MS = 30_000

/** GET na Meta: fila de no máximo 5 ao mesmo tempo, 30 s de limite e uma nova tentativa se a rede falhar. */
function buscarNaMeta(url) {
  return limitarMeta(() => comNovaTentativa(() => fetch(url, { signal: AbortSignal.timeout(TEMPO_MAXIMO_META_MS) })))
}

export async function graphGet(path, params, token) {
  const url = new URL(`${GRAPH_BASE}${path}`)
  url.searchParams.set('access_token', token)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const response = await buscarNaMeta(url)

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
      : await buscarNaMeta(nextUrl).then((r) => r.json())

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

/** Contas de anúncios liberadas (guardadas por 5 minutos: raramente mudam e quase toda tela pede). */
export function getAdAccounts(token, { allowedIds } = {}) {
  return comCache(`contas|${[...(allowedIds ?? [])].sort().join(',')}`, 5 * 60_000, () => lerAdAccounts(token, { allowedIds }))
}

async function lerAdAccounts(token, { allowedIds } = {}) {
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

const EXTRAS_TTL_MS = 10 * 60 * 1000
/** @type {Map<string, { at: number, promise: Promise<Map<string, object>> }>} */
const extrasCache = new Map()

/** Links que aparecem dentro do criativo de um anúncio (qualquer formato). */
function coletarLinks(valor, achados = new Set(), chave = '') {
  if (typeof valor === 'string') {
    if (/^https?:\/\//i.test(valor) && /(link|url)/i.test(chave)) achados.add(valor)
    return achados
  }
  if (Array.isArray(valor)) {
    for (const item of valor) coletarLinks(item, achados, chave)
    return achados
  }
  if (valor && typeof valor === 'object') {
    for (const [nome, filho] of Object.entries(valor)) coletarLinks(filho, achados, nome)
  }
  return achados
}

/**
 * O que a Meta diz sobre "para que serve" cada campanha: meta de otimização e destino dos conjuntos,
 * evento do pixel e links dos anúncios. Guarda por 10 minutos; se a Meta falhar, devolve o que conseguiu.
 */
export function getCampaignExtras(token, accountId) {
  const cached = extrasCache.get(accountId)
  if (cached && Date.now() - cached.at < EXTRAS_TTL_MS) return cached.promise

  const promise = (async () => {
    const porCampanha = new Map()
    const entrada = (id) => {
      if (!porCampanha.has(id)) porCampanha.set(id, { otimizacoes: new Set(), destinos: new Set(), eventos: new Set(), links: new Set() })
      return porCampanha.get(id)
    }
    try {
      const conjuntos = await fetchAllPages(
        `/${accountId}/adsets`,
        { fields: 'campaign_id,optimization_goal,destination_type,promoted_object{custom_event_type}', limit: '500' },
        token,
      )
      for (const conjunto of conjuntos) {
        if (!conjunto.campaign_id) continue
        const dados = entrada(String(conjunto.campaign_id))
        if (conjunto.optimization_goal) dados.otimizacoes.add(conjunto.optimization_goal)
        if (conjunto.destination_type) dados.destinos.add(conjunto.destination_type)
        if (conjunto.promoted_object?.custom_event_type) dados.eventos.add(conjunto.promoted_object.custom_event_type)
      }
    } catch (error) {
      console.error('[meta] não consegui ler os conjuntos para descobrir o tipo das campanhas:', error.message || error)
    }
    try {
      const anuncios = await fetchAllPages(
        `/${accountId}/ads`,
        { fields: 'campaign_id,creative{object_story_spec,asset_feed_spec}', limit: '100' },
        token,
      )
      for (const anuncio of anuncios) {
        if (!anuncio.campaign_id) continue
        const dados = entrada(String(anuncio.campaign_id))
        for (const link of coletarLinks(anuncio.creative)) dados.links.add(link)
      }
    } catch (error) {
      console.error('[meta] não consegui ler os links dos anúncios:', error.message || error)
    }
    return new Map(
      [...porCampanha].map(([id, dados]) => [
        id,
        { otimizacoes: [...dados.otimizacoes], destinos: [...dados.destinos], eventos: [...dados.eventos], links: [...dados.links] },
      ]),
    )
  })()

  extrasCache.set(accountId, { at: Date.now(), promise })
  // Falha total: não guarda o erro por 10 minutos.
  promise.catch(() => extrasCache.delete(accountId))
  return promise
}

/** Descobre o tipo da campanha (e quanto de certeza) a partir do objetivo e dos extras da Meta. */
function anotarTipo(row, campaignMeta, extras, accountId) {
  const campaignId = String(row.campaignId ?? row.id)
  const meta = campaignMeta.get(campaignId) ?? {}
  const dados = extras.get(campaignId) ?? {}
  const resultado = inferirTipo({
    objetivoBruto: meta.objective,
    otimizacoes: dados.otimizacoes,
    destinos: dados.destinos,
    eventos: dados.eventos,
    links: dados.links,
    leadsSite: row.leadsSite,
  })
  return {
    ...row,
    accountId,
    tipo: resultado.tipo,
    tipoOrigem: 'automatico',
    tipoConfianca: resultado.confianca,
    tipoMotivo: resultado.motivo,
    otimizacoes: dados.otimizacoes ?? [],
    destinos: dados.destinos ?? [],
  }
}

/** Campanhas da conta com objetivo, status e data final (guardada por 1 minuto: cada tela pedia 3 a 4 vezes). */
export function getCampaignMetaMap(token, accountId) {
  return comCache(`campanhas|${accountId}`, 60_000, () => lerCampaignMetaMap(token, accountId))
}

async function lerCampaignMetaMap(token, accountId) {
  const campaigns = await fetchAllPages(
    `/${accountId}/campaigns`,
    { fields: 'id,name,status,effective_status,objective,stop_time', limit: '500' },
    token,
  )

  return new Map(
    campaigns.map((campaign) => [
      campaign.id,
      {
        status: campaign.effective_status ?? campaign.status,
        objective: campaign.objective,
        stopTime: campaign.stop_time ?? null,
        name: campaign.name,
      },
    ]),
  )
}

export async function getInsights(token, accountId, period, level, options = {}) {
  const apiLevel = LEVEL_MAP[level] ?? 'campaign'
  const dateParams = resolveDateParams(period, options)

  const [insights, campaignMeta, extras] = await Promise.all([
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
    getCampaignExtras(token, accountId).catch(() => new Map()),
  ])

  const rows = insights.map((row) => normalizeInsightRow(row, campaignMeta))
  const finalizar = async (lista) => aplicarFichas(lista.map((row) => anotarTipo(row, campaignMeta, extras, accountId)), options.env ? await listarFichas(options.env, accountId) : new Map())

  // Só no nível de campanha: o site grava o utm_campaign, mas não o conjunto nem o anúncio.
  // Passe `env` nas opções para trocar os leads do pixel pelos leads reais do site.
  if (apiLevel === 'campaign' && options.env) {
    // Antes de contar, grava o ID da campanha nos leads que só têm o nome (renomear depois não perde nada).
    await resolveCampaignIds(options.env, campaignMeta)
    const siteTotals = await getSiteLeadsByCampaign(options.env, resolveMetaWindow(period, options))
    return finalizar(enrichCampaignsWithSiteLeads(rows, siteTotals))
  }

  return finalizar(rows)
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
    status: mapStatus(meta.status, meta.stopTime),
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

/** Campanha com data final já vencida (ex.: a live de ontem) não está mais rodando, mesmo que a Meta ainda a chame de ativa. */
export function hasEnded(stopTime) {
  if (!stopTime) return false
  const when = new Date(stopTime)
  return Number.isFinite(when.getTime()) && when.getFullYear() >= 2000 && when.getTime() < Date.now()
}

export function mapStatus(status, stopTime) {
  if (status === 'ACTIVE' && hasEnded(stopTime)) return 'Concluída'
  if (status === 'ACTIVE') return 'Ativa'
  if (status === 'PAUSED') return 'Pausada'
  if (!status) return 'Ativa'
  return status
}

export function mapObjective(objective) {
  if (!objective) return 'traffic'

  const value = objective.toUpperCase()

  if (value.includes('LEAD')) return 'leads'
  // Visualização de live/vídeo, curtidas, alcance: o resultado NÃO é lead, então não se cobra lead dela.
  if (value.includes('ENGAGEMENT') || value.includes('VIDEO') || value.includes('POST')) return 'engagement'
  if (value.includes('AWARENESS') || value.includes('REACH') || value.includes('BRAND')) return 'awareness'
  if (value.includes('TRAFFIC')) return 'traffic'
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

/**
 * Tudo que as telas pedem para um período: campanhas, conjuntos, anúncios e a série diária.
 * O resultado fica guardado por 3 minutos (e quem pede junto espera o mesmo); `options.fresh` ignora o cache.
 */
export function getDashboardData(token, accountId, period, options = {}) {
  const chave = `painel|${accountId}|${period}|${options.since ?? ''}|${options.until ?? ''}`
  if (options.fresh) limparCache(chave)
  return comCache(chave, 3 * 60_000, () => lerComReserva(chave, () => lerDashboardData(token, accountId, period, options)))
}

/** Última leitura boa de cada período: se a Meta falhar na próxima, a tela continua com ela em vez de ficar carregando. */
const ultimasLeituras = new Map()
const VALIDADE_RESERVA_MS = 30 * 60_000

async function lerComReserva(chave, carregar) {
  try {
    const dados = await carregar()
    ultimasLeituras.set(chave, { at: Date.now(), dados })
    return dados
  } catch (erro) {
    const reserva = ultimasLeituras.get(chave)
    if (reserva && Date.now() - reserva.at < VALIDADE_RESERVA_MS) {
      console.error('[meta] a Meta falhou; usando a última leitura boa:', erro.message || erro)
      return { ...reserva.dados, desatualizado: true }
    }
    throw erro
  }
}

async function lerDashboardData(token, accountId, period, options = {}) {
  // A série diária (tendência) é complementar: não derruba o painel se falhar, e roda junto com o resto.
  const diaria = (async () => {
    try {
      const window = resolveDailyWindow(period, options)
      return await getDailyCampaignInsights(token, accountId, { ...window, env: options.env })
    } catch {
      return {}
    }
  })()

  const [campaigns, adSets, ads, dailyByCampaign] = await Promise.all([
    getInsights(token, accountId, period, 'campaigns', options),
    getInsights(token, accountId, period, 'adSets', options),
    getInsights(token, accountId, period, 'ads', options),
    diaria,
  ])

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

  let rows = insights.map((row) => normalizeInsightRow(row, campaignMeta))

  // Campanha com leads no site: a série diária usa só o site, para os dias somarem o mesmo
  // total da tela. Campanha sem leads no site (ex.: formulário da própria Meta) fica com o pixel.
  const env = typeof options === 'object' && options ? options.env : null
  if (env) {
    const siteDaily = await getSiteLeadsDaily(env, { since, until })
    rows = rows.map((row) =>
      siteDaily.has(row) ? { ...row, leads: siteDaily.get(row, row.dateStart) } : row,
    )
  }

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
