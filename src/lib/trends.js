/**
 * Tendência recente vs janela anterior (série diária da Meta).
 * Usado nas recomendações — não na UI de Comparar/Dashboard.
 */

const STABLE_PCT = 10

function avg(numbers) {
  const list = numbers.filter((value) => Number.isFinite(value))
  if (!list.length) return null
  return list.reduce((sum, value) => sum + value, 0) / list.length
}

function pctChange(late, early) {
  if (early === null || late === null) return null
  if (early === 0) return late === 0 ? 0 : 100
  return ((late - early) / Math.abs(early)) * 100
}

function directionFromPct(pct) {
  if (pct === null || !Number.isFinite(pct)) return 'stable'
  if (Math.abs(pct) < STABLE_PCT) return 'stable'
  return pct > 0 ? 'up' : 'down'
}

/** Para métricas onde subir é pior (gasto, CPL). */
function toneFromDirection(direction, { invert = false } = {}) {
  if (direction === 'stable') return 'neutral'
  const improved = invert ? direction === 'down' : direction === 'up'
  return improved ? 'up' : 'down'
}

function arrow(direction) {
  if (direction === 'up') return '↑'
  if (direction === 'down') return '↓'
  return '→'
}

function formatPctLabel(pct) {
  if (pct === null || !Number.isFinite(pct)) return 'n/d'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(0).replace('.', ',')}%`
}

function splitWindows(series) {
  const points = (series ?? []).filter((point) => point?.date)
  if (points.length < 4) return null

  const windowSize = Math.min(3, Math.floor(points.length / 2))
  if (windowSize < 2) return null

  return {
    previous: points.slice(-windowSize * 2, -windowSize),
    recent: points.slice(-windowSize),
    days: points.length,
  }
}

function metricTrend(previous, recent, field, { invert = false, nullable = false } = {}) {
  const earlyValues = previous.map((point) => {
    const value = point[field]
    return nullable && (value === null || value === undefined) ? NaN : Number(value)
  })
  const lateValues = recent.map((point) => {
    const value = point[field]
    return nullable && (value === null || value === undefined) ? NaN : Number(value)
  })

  const early = avg(earlyValues)
  const late = avg(lateValues)
  const percent = pctChange(late, early)
  const direction = directionFromPct(percent)

  return {
    early,
    late,
    percent: percent === null ? null : Math.round(percent * 10) / 10,
    direction,
    tone: toneFromDirection(direction, { invert }),
    label: `${arrow(direction)} ${formatPctLabel(percent)}`,
  }
}

export function buildCampaignTrend(series) {
  const windows = splitWindows(series)

  if (!windows) {
    return {
      available: false,
      summary: null,
      label: 'Sem série diária suficiente',
      deteriorating: false,
      improving: false,
      spendRising: false,
      metrics: {},
      days: series?.length ?? 0,
    }
  }

  const { previous, recent, days } = windows
  const metrics = {
    spend: metricTrend(previous, recent, 'spend', { invert: true }),
    leads: metricTrend(previous, recent, 'leads'),
    cpl: metricTrend(previous, recent, 'cpl', { invert: true, nullable: true }),
    ctr: metricTrend(previous, recent, 'ctr'),
  }

  const spendRising = metrics.spend.direction === 'up'
  const cplRising = metrics.cpl.direction === 'up'
  const leadsFalling = metrics.leads.direction === 'down'
  const ctrFalling = metrics.ctr.direction === 'down'
  const leadsRising = metrics.leads.direction === 'up'
  const cplFalling = metrics.cpl.direction === 'down'
  const ctrRising = metrics.ctr.direction === 'up'

  const deteriorating =
    (spendRising && (cplRising || leadsFalling)) ||
    (cplRising && leadsFalling) ||
    (ctrFalling && cplRising)

  const improving =
    (cplFalling || leadsRising) &&
    !cplRising &&
    (ctrRising || leadsRising || metrics.ctr.direction === 'stable')

  let verdict = 'estável'
  if (deteriorating) verdict = 'piorando'
  else if (improving) verdict = 'melhorando'

  const parts = [
    `gasto ${metrics.spend.label}`,
    `leads ${metrics.leads.label}`,
    `CPL ${metrics.cpl.label}`,
    `CTR ${metrics.ctr.label}`,
  ]

  const summary = `Tendência recente (${days}d): ${parts.join(' · ')} — ${verdict}.`

  return {
    available: true,
    summary,
    label: verdict,
    deteriorating,
    improving,
    spendRising,
    metrics,
    days,
  }
}

export function resolveDailySeries(item, dailyByCampaign) {
  if (!dailyByCampaign || !item) return null

  const keys = [item.id, item.campaignId].filter(Boolean).map(String)
  for (const key of keys) {
    const series = dailyByCampaign[key]
    if (Array.isArray(series) && series.length) return series
  }

  return null
}
