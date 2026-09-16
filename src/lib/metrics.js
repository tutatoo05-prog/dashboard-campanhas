import { enrichItems, computeAverages } from './analysis.js'
import { computeCampaignIndices } from './campaignIndices.js'
import { pickNameFromUser, resolvePersonName } from './userName.js'

export const CPL_IDEAL = 30

const STATUS = {
  success: { emoji: '🟢', label: 'Excelente', tone: 'success' },
  warning: { emoji: '🟡', label: 'Observar', tone: 'warning' },
  danger: { emoji: '🔴', label: 'Atenção', tone: 'danger' },
  neutral: { emoji: '⚪', label: 'Normal', tone: 'neutral' },
}

export function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function getDisplayName(user) {
  const fromUser = pickNameFromUser(user)
  if (fromUser) return fromUser

  try {
    const stored = localStorage.getItem('dash-user-name')
    const resolved = resolvePersonName(stored)
    if (resolved) return resolved
  } catch {
    /* ignore */
  }

  return 'Gestor'
}

export function readUserName(user) {
  return getDisplayName(user)
}

export function computeAvgFrequency(items) {
  if (!items.length) return 0
  const total = items.reduce((sum, item) => sum + (item.frequency || 0), 0)
  return Math.round((total / items.length) * 10) / 10
}

export function rateMetric(metric, value, context = {}) {
  const { totals, avgFrequency } = context

  switch (metric) {
    case 'ctr':
      if (value >= 3) return STATUS.success
      if (value >= 1.5) return STATUS.warning
      return { ...STATUS.danger, label: 'Baixo' }

    case 'cpl':
      if (!totals?.leads) return { ...STATUS.neutral, label: 'Sem leads' }
      if (value <= CPL_IDEAL) return STATUS.success
      if (value <= CPL_IDEAL * 1.5) return STATUS.warning
      return { ...STATUS.danger, label: 'Caro' }

    case 'cpc':
      if (value <= 1) return STATUS.success
      if (value <= 2.5) return STATUS.warning
      return { ...STATUS.danger, label: 'Alto' }

    case 'frequency':
      if (value < 2) return STATUS.success
      if (value <= 3) return { ...STATUS.warning, label: 'Comece a observar' }
      return { ...STATUS.danger, label: 'Muito alta' }

    case 'leads':
      if (value >= 50) return STATUS.success
      if (value >= 10) return STATUS.warning
      if (value > 0) return { ...STATUS.warning, label: 'Poucos' }
      return { ...STATUS.danger, label: 'Nenhum' }

    case 'spend':
      return STATUS.neutral

    default:
      return STATUS.neutral
  }
}

export function getActiveItems(items = []) {
  return items.filter((item) => item.status === 'Ativa')
}

export function buildRecommendations(items, options = {}) {
  const activeItems = getActiveItems(items)
  if (!activeItems.length) return []

  // Compara e recomenda só entre ativas (pausadas ficam de fora)
  const enriched = enrichItems(activeItems, options)
  const recs = []
  const seen = new Set()

  const actionByVerdict = {
    pause: 'Parar ou dar uma olhada',
    wait: 'Esperar mais dados',
    fix: null,
    scale: 'Investir mais',
    monitor: 'Acompanhar',
  }

  const toneByVerdict = {
    pause: 'danger',
    wait: 'warning',
    fix: 'danger',
    scale: 'success',
    monitor: 'warning',
  }

  const add = (item, tone, action) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    recs.push({
      tone,
      action,
      campaign: item.name,
      campaignId: item.id,
      detail: item.analysis.notes[0] ?? item.analysis.primary.label,
      tag: item.analysis.primary,
      trend: item.analysis.trend ?? null,
      verdict: item.analysis.verdict ?? 'monitor',
    })
  }

  const byVerdict = (verdict) =>
    enriched.filter((item) => item.analysis.verdict === verdict)

  for (const item of byVerdict('pause')) {
    add(item, 'danger', actionByVerdict.pause)
  }

  for (const item of byVerdict('wait')) {
    add(item, 'warning', actionByVerdict.wait)
  }

  for (const item of byVerdict('fix')) {
    const label = item.analysis.primary?.label
    const action =
      label === 'Problema na página'
        ? 'Revisar a página do link'
        : label === 'Anúncio cansado'
          ? 'Fazer anúncio novo'
          : label === 'Revisar quem vê'
            ? 'Revisar público'
            : 'Mudar o anúncio'
    add(item, toneByVerdict.fix, action)
  }

  for (const item of byVerdict('scale')) {
    add(item, 'success', actionByVerdict.scale)
  }

  return recs.slice(0, 5)
}

function resolveActionTone(item) {
  const verdict = item.analysis?.verdict ?? 'monitor'
  const label = item.analysis?.primary?.label

  const actionByVerdict = {
    pause: 'Parar ou dar uma olhada',
    wait: 'Esperar mais dados',
    scale: 'Investir mais',
    monitor: 'Acompanhar',
  }

  const toneByVerdict = {
    pause: 'danger',
    wait: 'warning',
    fix: 'danger',
    scale: 'success',
    monitor: 'warning',
  }

  if (verdict === 'fix') {
    const action =
      label === 'Problema na página'
        ? 'Revisar a página do link'
        : label === 'Anúncio cansado'
          ? 'Fazer anúncio novo'
          : label === 'Revisar quem vê'
            ? 'Revisar público'
            : 'Mudar o anúncio'
    return { action, tone: toneByVerdict.fix }
  }

  return {
    action: actionByVerdict[verdict] ?? actionByVerdict.monitor,
    tone: toneByVerdict[verdict] ?? toneByVerdict.monitor,
  }
}

export function buildRecommendationsPanelData(items, options = {}) {
  const activeItems = getActiveItems(items)
  if (!activeItems.length) return []

  const averages = computeAverages(activeItems)
  const enriched = enrichItems(activeItems, options)
  const byId = new Map(enriched.map((item) => [String(item.id), item]))
  const recommendations = buildRecommendations(activeItems, options)

  return recommendations.map((rec) => {
    const item = byId.get(String(rec.campaignId))
    const trend = item?.analysis?.trend ?? rec.trend ?? null
    return {
      ...rec,
      indices: item ? computeCampaignIndices(item, averages) : [],
      notes: item?.analysis?.notes?.length ? item.analysis.notes : [rec.detail],
      overallScore: item?.analysis?.score ?? 0,
      tags: item?.analysis?.tags ?? [],
      trend,
    }
  })
}

/** Detalhe de uma campanha no mesmo formato do card de recomendações. */
export function buildCampaignDetailData(campaignId, items, options = {}) {
  if (!campaignId || !items?.length) return null

  const activeItems = getActiveItems(items)
  const averagesPool = activeItems.length ? activeItems : items
  const averages = computeAverages(averagesPool)
  const enriched = enrichItems(items, options)
  const item = enriched.find((row) => String(row.id) === String(campaignId))
  if (!item) return null

  const { action, tone } = resolveActionTone(item)
  const detail = item.analysis.notes?.[0] ?? item.analysis.primary?.label ?? ''

  return {
    tone,
    action,
    campaign: item.name,
    campaignId: item.id,
    detail,
    tag: item.analysis.primary,
    trend: item.analysis.trend ?? null,
    verdict: item.analysis.verdict ?? 'monitor',
    indices: computeCampaignIndices(item, averages),
    notes: item.analysis.notes?.length ? item.analysis.notes : [detail],
    overallScore: item.analysis.score ?? 0,
    tags: item.analysis.tags ?? [],
    status: item.status,
    spend: item.spend,
    leads: item.leads,
    ctr: item.ctr,
    cpl: item.cpl,
  }
}

export function renderSemaphoreBadge(status) {
  const classes = {
    success: 'text-green-400',
    warning: 'text-yellow-400',
    danger: 'text-red-400',
    neutral: 'text-zinc-500',
  }
  const cls = classes[status.tone] ?? classes.neutral
  return `<span class="inline-flex items-center gap-1 text-xs font-medium ${cls}">${status.emoji} ${status.label}</span>`
}
