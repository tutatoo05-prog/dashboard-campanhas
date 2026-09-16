import { computeSummary } from './analysis.js'
import { formatCurrency, formatNumber, formatPercent, formatDecimal } from './format.js'

export const COMPARE_PRESETS = {
  today_yesterday: {
    label: 'Hoje vs ontem',
    current: 'today',
    previous: 'yesterday',
    currentLabel: 'Hoje',
    previousLabel: 'Ontem',
  },
  last7_prev7: {
    label: 'Últimos 7 dias vs 7 anteriores',
    current: 'last7',
    previous: 'prev7',
    currentLabel: 'Últimos 7 dias',
    previousLabel: '7 dias anteriores',
  },
  last30_prev30: {
    label: 'Últimos 30 dias vs 30 anteriores',
    current: 'last30',
    previous: 'prev30',
    currentLabel: 'Últimos 30 dias',
    previousLabel: '30 dias anteriores',
  },
  this_month_last_month: {
    label: 'Este mês vs mês anterior',
    current: 'this_month',
    previous: 'last_month',
    currentLabel: 'Este mês',
    previousLabel: 'Mês anterior',
  },
}

export function getComparePreset(key) {
  return COMPARE_PRESETS[key] ?? COMPARE_PRESETS.last7_prev7
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round((Number(value) || 0) * factor) / factor
}

export function calcDelta(current, previous) {
  const cur = Number(current) || 0
  const prev = Number(previous) || 0
  const absolute = round(cur - prev)
  const percent = prev === 0 ? (cur === 0 ? 0 : 100) : round((absolute / Math.abs(prev)) * 100)

  return { absolute, percent, current: cur, previous: prev }
}

/** Para métricas onde subir é pior (gasto, CPC, CPL, frequência). */
export function deltaTone(delta, { invert = false } = {}) {
  if (Math.abs(delta.percent) < 0.05) return 'neutral'
  const improved = invert ? delta.absolute < 0 : delta.absolute > 0
  return improved ? 'up' : 'down'
}

export function formatDeltaPercent(delta, { invert = false } = {}) {
  const tone = deltaTone(delta, { invert })
  const sign = delta.percent > 0 ? '+' : ''
  return {
    tone,
    label: `${sign}${formatDecimal(delta.percent, 1)}%`,
  }
}

function summarizeCampaigns(campaigns) {
  return computeSummary(campaigns ?? []).totals
}

export function buildCompareSummary(currentCampaigns, previousCampaigns) {
  const current = summarizeCampaigns(currentCampaigns)
  const previous = summarizeCampaigns(previousCampaigns)

  const metrics = [
    {
      key: 'spend',
      label: 'Investimento',
      icon: 'fa-wallet',
      invert: true,
      format: formatCurrency,
      current: current.spend,
      previous: previous.spend,
    },
    {
      key: 'leads',
      label: 'Leads',
      icon: 'fa-user-plus',
      invert: false,
      format: formatNumber,
      current: current.leads,
      previous: previous.leads,
    },
    {
      key: 'cpl',
      label: 'CPL',
      icon: 'fa-bullseye',
      invert: true,
      format: formatCurrency,
      current: current.cpl,
      previous: previous.cpl,
    },
    {
      key: 'ctr',
      label: 'CTR',
      icon: 'fa-mouse-pointer',
      invert: false,
      format: formatPercent,
      current: current.ctr,
      previous: previous.ctr,
    },
    {
      key: 'cpc',
      label: 'CPC',
      icon: 'fa-hand-pointer',
      invert: true,
      format: formatCurrency,
      current: current.cpc,
      previous: previous.cpc,
    },
    {
      key: 'clicks',
      label: 'Cliques',
      icon: 'fa-computer-mouse',
      invert: false,
      format: formatNumber,
      current: current.clicks,
      previous: previous.clicks,
    },
  ]

  return metrics.map((metric) => {
    const delta = calcDelta(metric.current, metric.previous)
    const formatted = formatDeltaPercent(delta, { invert: metric.invert })

    return {
      ...metric,
      delta,
      tone: formatted.tone,
      deltaLabel: formatted.label,
      currentLabel: metric.format(metric.current),
      previousLabel: metric.format(metric.previous),
    }
  })
}

export function buildCampaignCompareRows(currentCampaigns, previousCampaigns) {
  const previousMap = new Map((previousCampaigns ?? []).map((item) => [String(item.id), item]))
  const currentIds = new Set((currentCampaigns ?? []).map((item) => String(item.id)))

  const rows = (currentCampaigns ?? []).map((item) => {
    const previous = previousMap.get(String(item.id))
    const spendDelta = calcDelta(item.spend, previous?.spend ?? 0)
    const leadsDelta = calcDelta(item.leads, previous?.leads ?? 0)
    const cplDelta = calcDelta(item.cpl, previous?.cpl ?? 0)
    const ctrDelta = calcDelta(item.ctr, previous?.ctr ?? 0)

    return {
      id: item.id,
      name: item.name,
      status: item.status,
      current: item,
      previous: previous ?? null,
      spendDelta,
      leadsDelta,
      cplDelta,
      ctrDelta,
      spendTone: deltaTone(spendDelta, { invert: true }),
      leadsTone: deltaTone(leadsDelta),
      cplTone: deltaTone(cplDelta, { invert: true }),
      ctrTone: deltaTone(ctrDelta),
    }
  })

  const disappeared = (previousCampaigns ?? [])
    .filter((item) => !currentIds.has(String(item.id)))
    .map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      current: null,
      previous: item,
      spendDelta: calcDelta(0, item.spend),
      leadsDelta: calcDelta(0, item.leads),
      cplDelta: calcDelta(0, item.cpl),
      ctrDelta: calcDelta(0, item.ctr),
      spendTone: 'neutral',
      leadsTone: 'neutral',
      cplTone: 'neutral',
      ctrTone: 'neutral',
      missingInCurrent: true,
    }))

  return [...rows, ...disappeared].sort(
    (a, b) => Math.abs(b.spendDelta.absolute) - Math.abs(a.spendDelta.absolute),
  )
}
