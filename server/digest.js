import {
  getAdAccounts,
  getDashboardData,
  normalizeAccountId,
  parseAllowedAccountIds,
} from './metaApi.js'
import { enrichItems } from '../src/lib/analysis.js'
import { buildRecommendations } from '../src/lib/metrics.js'
import { formatCurrency, formatNumber, formatPercent } from '../src/lib/format.js'

const DEFAULT_WEBHOOK_URL =
  'https://n8n.tuzinho.app/webhook/relatorio-campanhas'

/** Contas do boletim: academy 01 + 1855 + CON3CT - 03 + Original SP. */
const DEFAULT_DIGEST_ACCOUNT_IDS = [
  'act_328274720105539',
  'act_115097955921855',
  'act_630972797908360',
  'act_1197249103808364',
]

const PERIOD_LABELS = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  this_month: 'Este mês',
  last_month: 'Mês anterior',
}

export function resolveDigestPeriod(slot) {
  if (slot === 'morning' || slot === '10') return 'yesterday'
  if (slot === 'afternoon' || slot === '17') return 'today'
  return 'last7'
}

export function resolveDigestSlot(hour) {
  if (Number(hour) === 10) return 'morning'
  if (Number(hour) === 17) return 'afternoon'
  return 'custom'
}

/**
 * Contas do digest:
 * - ?accountId= força uma só
 * - DIGEST_ACCOUNT_IDS=act_a,act_b (padrão: academy + 1855 + CON3CT - 03 + Original SP)
 */
export function resolveDigestAccountIds(env, { accountId } = {}) {
  if (accountId) {
    const single = normalizeAccountId(accountId)
    return single ? [single] : []
  }

  const raw = env.DIGEST_ACCOUNT_IDS
  if (typeof raw === 'string' && raw.trim()) {
    const ids = raw
      .split(',')
      .map((part) => normalizeAccountId(part.trim()))
      .filter(Boolean)
    if (ids.length) return [...new Set(ids)]
  }

  const fallback = normalizeAccountId(env.META_AD_ACCOUNT_ID)
  const defaults = DEFAULT_DIGEST_ACCOUNT_IDS.map(normalizeAccountId).filter(Boolean)
  if (fallback && !defaults.includes(fallback)) {
    return [fallback, ...defaults.filter((id) => id !== fallback)]
  }
  return defaults
}

async function buildAccountSection(token, accountsCatalog, accountId, resolvedPeriod) {
  const meta =
    accountsCatalog.find((item) => item.id === accountId) ?? {
      id: accountId,
      name: accountId,
      currency: 'BRL',
    }

  const data = await getDashboardData(token, accountId, resolvedPeriod)
  const campaigns = data.campaigns ?? []
  const analysisOptions = { dailyByCampaign: data.dailyByCampaign ?? {} }
  const enrichedAll = enrichItems(campaigns, analysisOptions)
  const tips = buildRecommendations(campaigns, analysisOptions)
  const active = enrichedAll.filter((item) => item.status === 'Ativa')
  const best = active[0] ?? null
  const worst = active.length >= 2 ? active[active.length - 1] : null

  const totals = campaigns.reduce(
    (acc, item) => ({
      spend: acc.spend + (item.spend || 0),
      leads: acc.leads + (item.leads || 0),
      clicks: acc.clicks + (item.clicks || 0),
      impressions: acc.impressions + (item.impressions || 0),
    }),
    { spend: 0, leads: 0, clicks: 0, impressions: 0 },
  )

  const cpl = totals.leads > 0 ? totals.spend / totals.leads : 0
  const ctr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0

  return {
    account: {
      id: meta.id,
      name: meta.name,
      currency: meta.currency ?? 'BRL',
    },
    totals: {
      spend: totals.spend,
      leads: totals.leads,
      clicks: totals.clicks,
      impressions: totals.impressions,
      cpl,
      ctr,
      spendLabel: formatCurrency(totals.spend),
      leadsLabel: formatNumber(totals.leads),
      cplLabel: totals.leads ? formatCurrency(cpl) : '—',
      ctrLabel: formatPercent(ctr),
    },
    best: best
      ? {
          id: best.id,
          name: best.name,
          score: best.analysis?.score ?? null,
          verdict: best.analysis?.verdict ?? null,
          action: best.analysis?.primary?.label ?? null,
          spend: best.spend,
          leads: best.leads,
          cpl: best.cpl,
          note: best.analysis?.notes?.[0] ?? null,
        }
      : null,
    worst: worst
      ? {
          id: worst.id,
          name: worst.name,
          score: worst.analysis?.score ?? null,
          verdict: worst.analysis?.verdict ?? null,
          action: worst.analysis?.primary?.label ?? null,
          spend: worst.spend,
          leads: worst.leads,
          cpl: worst.cpl,
          note: worst.analysis?.notes?.[0] ?? null,
        }
      : null,
    tips: tips.map((tip) => ({
      campaign: tip.campaign,
      action: tip.action,
      verdict: tip.verdict,
      detail: tip.detail,
      tone: tip.tone,
    })),
  }
}

/**
 * Monta o boletim (1+ contas) usando a mesma lógica de recomendações do dash.
 */
export async function buildDigest(env, { period, slot, accountId } = {}) {
  const token = env.META_ACCESS_TOKEN
  if (!token) {
    throw new Error('META_ACCESS_TOKEN não configurado.')
  }

  const resolvedPeriod = period || resolveDigestPeriod(slot)
  const accountsCatalog = await getAdAccounts(token, { allowedIds: parseAllowedAccountIds(env) })
  const wantedIds = resolveDigestAccountIds(env, { accountId })

  if (!wantedIds.length) {
    throw new Error('Nenhuma conta configurada para o digest.')
  }

  const accessible = wantedIds.filter((id) =>
    accountsCatalog.some((account) => account.id === id),
  )

  if (!accessible.length) {
    throw new Error(
      `Sem permissão para as contas do digest: ${wantedIds.join(', ')}.`,
    )
  }

  const sections = []
  const errors = []

  for (const id of accessible) {
    try {
      sections.push(await buildAccountSection(token, accountsCatalog, id, resolvedPeriod))
    } catch (error) {
      errors.push({ accountId: id, error: error.message || String(error) })
      console.error(`[digest] falha na conta ${id}:`, error.message || error)
    }
  }

  if (!sections.length) {
    throw new Error(
      errors[0]?.error || 'Não foi possível montar o digest de nenhuma conta.',
    )
  }

  const first = sections[0]
  const payload = {
    type: 'digest',
    slot: slot ?? 'custom',
    period: resolvedPeriod,
    periodLabel: PERIOD_LABELS[resolvedPeriod] ?? resolvedPeriod,
    generatedAt: new Date().toISOString(),
    timezone: 'America/Sao_Paulo',
    // Compat: campos “raiz” = primeira conta
    account: first.account,
    totals: first.totals,
    best: first.best,
    worst: first.worst,
    tips: first.tips,
    accounts: sections,
    errors: errors.length ? errors : undefined,
  }

  payload.message = formatDigestMessage(payload)
  return payload
}

/** Texto curto das ações para WhatsApp. */
function whatsActionLabel(action) {
  const map = {
    'Parar ou dar uma olhada': 'revisar ou pausar',
    'Esperar mais dados': 'esperar mais dados',
    'Investir mais': 'pode investir mais',
    'Mudar o anúncio': 'trocar o anúncio',
    'Revisar a página do link': 'revisar a página',
    'Fazer anúncio novo': 'criar anúncio novo',
    'Revisar público': 'revisar o público',
    Acompanhar: 'só acompanhar',
    'Gastando demais': 'revisar ou pausar',
    Pausar: 'revisar ou pausar',
    'Anúncio fraco': 'trocar o anúncio',
    'Problema na página': 'revisar a página',
    'Anúncio cansado': 'criar anúncio novo',
    'Revisar quem vê': 'revisar o público',
  }
  return map[action] || String(action || 'acompanhar').toLowerCase()
}

function formatAccountBlock(section) {
  const lines = [
    `*${section.account?.name ?? 'Conta'}*`,
    `💰 Gasto: *${section.totals.spendLabel}*`,
    `👥 Leads: *${section.totals.leadsLabel}*`,
    `🎯 CPL: *${section.totals.cplLabel}*`,
  ]

  if (section.best) {
    lines.push('')
    lines.push('*Melhor* ✅')
    lines.push(`*${section.best.name}*`)
    if (section.best.score != null) {
      lines.push(`Nota ${section.best.score}/100`)
    }
  }

  const tips = Array.isArray(section.tips) ? section.tips : []
  const actionTips = tips
    .filter((tip) => tip.verdict && tip.verdict !== 'monitor')
    .slice(0, 2)
  const toShow = actionTips.length ? actionTips : tips.slice(0, 1)

  if (toShow.length) {
    lines.push('')
    lines.push('*O que fazer*')
    for (const tip of toShow) {
      lines.push(`• *${tip.campaign}* → ${whatsActionLabel(tip.action)}`)
    }
  } else if (section.worst && section.worst.id !== section.best?.id) {
    lines.push('')
    lines.push('*Atenção* ⚠️')
    lines.push(
      `*${section.worst.name}* → ${whatsActionLabel(section.worst.action)}`,
    )
  }

  return lines
}

/**
 * Mensagem curta e legível no WhatsApp (*negrito* + quebras reais).
 * Suporta 1+ contas no mesmo texto.
 */
export function formatDigestMessage(digest) {
  const greet =
    digest.slot === 'morning' ? 'Bom dia' : digest.slot === 'afternoon' ? 'Boa tarde' : 'Olá'
  const period = digest.periodLabel ?? ''
  const sections =
    Array.isArray(digest.accounts) && digest.accounts.length
      ? digest.accounts
      : [
          {
            account: digest.account,
            totals: digest.totals,
            best: digest.best,
            worst: digest.worst,
            tips: digest.tips,
          },
        ]

  const lines = [`*${greet}* 👋`, `Resumo · *${period}*`, '']

  sections.forEach((section, index) => {
    if (index > 0) {
      lines.push('')
      lines.push('—————')
      lines.push('')
    }
    lines.push(...formatAccountBlock(section))
  })

  lines.push('')
  lines.push('_tuzinho Ads_')

  return lines.join('\n')
}

export async function sendDigestToWebhook(env, digest) {
  const webhookUrl =
    env.N8N_DIGEST_WEBHOOK_URL || env.N8N_WEBHOOK_URL || DEFAULT_WEBHOOK_URL

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain',
    },
    body: JSON.stringify(digest),
  })

  const responseText = await response.text()

  if (!response.ok) {
    throw new Error(
      `Webhook n8n retornou ${response.status}: ${responseText.slice(0, 300)}`,
    )
  }

  return {
    ok: true,
    status: response.status,
    body: responseText.slice(0, 500),
    webhookUrl,
  }
}

export async function buildAndSendDigest(env, options = {}) {
  const digest = await buildDigest(env, options)
  const delivery = await sendDigestToWebhook(env, digest)
  return { digest, delivery }
}
