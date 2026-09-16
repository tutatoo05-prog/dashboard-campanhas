import { computeAverages, enrichItems } from './analysis.js'
import { PERIODS, OBJECTIVES } from '../data/mockData.js'
import { getPeriodLabel } from './period.js'

function pickMetrics(item) {
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    objective: item.objective,
    objectiveLabel: OBJECTIVES[item.objective] ?? item.objective,
    spend: item.spend,
    impressions: item.impressions,
    reach: item.reach,
    clicks: item.clicks,
    ctr: item.ctr,
    cpc: item.cpc,
    leads: item.leads,
    cpl: item.cpl,
    conversions: item.conversions,
    cpa: item.cpa,
    frequency: item.frequency,
  }
}

function pickAnalysis(item) {
  if (!item.analysis) return null

  return {
    score: item.analysis.score,
    recommendation: item.analysis.primary?.label ?? null,
    tags: item.analysis.tags.map((tag) => tag.label),
    notes: item.analysis.notes ?? [],
  }
}

function getRelatedItems(data, item, level) {
  const campaignId = item.campaignId ?? item.id

  if (level === 'campaigns') {
    const adSets = enrichItems(
      (data.adSets ?? []).filter((row) => row.campaignId === campaignId),
    )
    const ads = enrichItems(
      (data.ads ?? []).filter((row) => row.campaignId === campaignId),
    )

    return { adSets, ads }
  }

  if (level === 'adSets') {
    const ads = enrichItems(
      (data.ads ?? []).filter((row) => row.adsetId === item.id),
    )

    return { adSets: [], ads }
  }

  return { adSets: [], ads: [] }
}

export function buildReportPayload({
  item,
  level,
  period,
  since = null,
  until = null,
  account,
  currency,
  source,
  allItems,
  data,
}) {
  const averages = computeAverages(allItems)
  const related = getRelatedItems(data, item, level)

  const sortedAds = [...related.ads].sort(
    (a, b) => b.analysis.score - a.analysis.score,
  )
  const sortedAdSets = [...related.adSets].sort(
    (a, b) => b.analysis.score - a.analysis.score,
  )

  const mapRelated = (row) => ({
    ...pickMetrics(row),
    analysis: pickAnalysis(row),
  })

  return {
    type: 'dash',
    reportType: level === 'campaigns' ? 'campaign' : level === 'adSets' ? 'adset' : 'ad',
    generatedAt: new Date().toISOString(),
    source,
    period: {
      key: period,
      label: getPeriodLabel(period, { since, until }, PERIODS),
      ...(period === 'custom' ? { since, until } : {}),
    },
    account: {
      id: account?.id ?? null,
      name: account?.name ?? null,
      currency: currency ?? account?.currency ?? 'BRL',
    },
    item: {
      ...pickMetrics(item),
      level,
      analysis: pickAnalysis(item),
    },
    benchmarks: {
      accountAverage: averages,
    },
    accountSummary: {
      totalItems: allItems.length,
      totalSpend: allItems.reduce((sum, row) => sum + row.spend, 0),
      totalLeads: allItems.reduce((sum, row) => sum + row.leads, 0),
      totalConversions: allItems.reduce((sum, row) => sum + row.conversions, 0),
    },
    related: {
      adSets: sortedAdSets.map(mapRelated),
      ads: sortedAds.map(mapRelated),
      topAds: sortedAds.slice(0, 3).map(mapRelated),
      worstAds: [...sortedAds].reverse().slice(0, 3).map(mapRelated),
      topAdSets: sortedAdSets.slice(0, 3).map(mapRelated),
      worstAdSets: [...sortedAdSets].reverse().slice(0, 3).map(mapRelated),
    },
  }
}
