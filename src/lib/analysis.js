/**
 * Sistema de análise automática de campanhas.
 * Regras vs médias da conta + volume mínimo + significância estatística (z-test).
 * Um veredito por campanha — sem recomendações conflitantes.
 */

import {
  EVIDENCE,
  hasCtrVolume,
  hasRateVolume,
  hasScaleVolume,
  hasWasteVolume,
  restTotals,
  twoProportionZTest,
} from './stats.js'
import { buildCampaignTrend, resolveDailySeries } from './trends.js'
import { TIPOS, tipoSemLead } from './campaignType.js'

export const ANALYSIS_TAGS = {
  scale: {
    emoji: '🟢',
    label: 'Investir mais',
    tone: 'success',
  },
  monitor: {
    emoji: '🟡',
    label: 'Acompanhar',
    tone: 'warning',
  },
  pause: {
    emoji: '🔴',
    label: 'Pausar',
    tone: 'danger',
  },
  fixCreative: {
    emoji: '⚠️',
    label: 'Anúncio fraco',
    tone: 'danger',
  },
  highSpendLowConv: {
    emoji: '💸',
    label: 'Gastando demais',
    tone: 'danger',
  },
  reviewAudience: {
    emoji: '🎯',
    label: 'Revisar quem vê',
    tone: 'warning',
  },
  reviewLanding: {
    emoji: '🔗',
    label: 'Problema na página',
    tone: 'warning',
  },
  creativeFatigue: {
    emoji: '🔄',
    label: 'Anúncio cansado',
    tone: 'warning',
  },
  engagement: {
    emoji: '🎥',
    label: 'Engajamento',
    tone: 'success',
  },
}

/** Objetivos em que o resultado não é lead (visualização de live/vídeo, alcance). */
export const NON_LEAD_OBJECTIVES = ['engagement', 'awareness']

/** A campanha se julga por lead? Vale o tipo (descoberto ou confirmado); sem tipo, o objetivo. */
export function ehCampanhaDeLead(item) {
  if (item?.tipo) return !tipoSemLead(item.tipo)
  return !NON_LEAD_OBJECTIVES.includes(item?.objective)
}

export const TONE_CLASSES = {
  success: 'border-amber-500/25 bg-amber-500/8 text-amber-200',
  warning: 'border-yellow-500/20 bg-yellow-500/8 text-yellow-200/90',
  danger: 'border-red-500/20 bg-red-500/8 text-red-300/90',
}

export function computeAverages(items) {
  if (!items.length) {
    return {
      spend: 0,
      ctr: 0,
      cpc: 0,
      cpl: 0,
      cpa: 0,
      leads: 0,
      conversions: 0,
      clicks: 0,
      frequency: 0,
    }
  }

  const sum = items.reduce(
    (acc, item) => ({
      spend: acc.spend + item.spend,
      ctr: acc.ctr + item.ctr,
      cpc: acc.cpc + item.cpc,
      cpl: acc.cpl + (item.cpl || 0),
      cpa: acc.cpa + (item.cpa || 0),
      leads: acc.leads + item.leads,
      conversions: acc.conversions + item.conversions,
      clicks: acc.clicks + item.clicks,
      frequency: acc.frequency + item.frequency,
    }),
    {
      spend: 0,
      ctr: 0,
      cpc: 0,
      cpl: 0,
      cpa: 0,
      leads: 0,
      conversions: 0,
      clicks: 0,
      frequency: 0,
    },
  )

  const count = items.length
  const itemsWithLeads = items.filter((i) => i.leads > 0)
  const itemsWithConv = items.filter((i) => i.conversions > 0)

  return {
    spend: sum.spend / count,
    ctr: sum.ctr / count,
    cpc: sum.cpc / count,
    cpl: itemsWithLeads.length
      ? itemsWithLeads.reduce((a, i) => a + i.cpl, 0) / itemsWithLeads.length
      : 0,
    cpa: itemsWithConv.length
      ? itemsWithConv.reduce((a, i) => a + i.cpa, 0) / itemsWithConv.length
      : 0,
    leads: sum.leads / count,
    conversions: sum.conversions / count,
    clicks: sum.clicks / count,
    frequency: sum.frequency / count,
  }
}

export function analyzeCampaign(item, averages, allItems = [], trend = null) {
  const rest = restTotals(item, allItems)
  const resolvedTrend =
    trend && typeof trend === 'object' && 'available' in trend
      ? trend
      : buildCampaignTrend(Array.isArray(trend) ? trend : [])

  // Campanha de visualização/engajamento (ex.: a live no Instagram): o resultado é ThruPlay, não lead.
  // Cobrar lead dela geraria alerta falso de "gastando sem leads".
  if (!ehCampanhaDeLead(item)) {
    const info = TIPOS[item.tipo] ?? null
    const tag = info ? { emoji: info.emoji, label: info.label, tone: 'success' } : ANALYSIS_TAGS.engagement
    return {
      tags: [tag],
      primary: tag,
      score: 60,
      notes: [`Campanha de ${(info?.label ?? 'engajamento').toLowerCase()}: o resultado dela é ${info?.resultado ?? 'visualização ou alcance'}, não lead, por isso não entra nas contas de custo por lead.`],
      trend: resolvedTrend,
      verdict: 'monitor',
      evidence: { volume: {}, significance: {}, tests: {} },
    }
  }

  const clicks = Number(item.clicks) || 0
  const leads = Number(item.leads) || 0
  const conversions = Number(item.conversions) || 0
  const impressions = Number(item.impressions) || 0

  const ctrBetter = twoProportionZTest(
    clicks,
    impressions,
    rest.clicks,
    rest.impressions,
    'greater',
  )
  const ctrWorse = twoProportionZTest(
    clicks,
    impressions,
    rest.clicks,
    rest.impressions,
    'less',
  )
  const ctrVsRest = twoProportionZTest(
    clicks,
    impressions,
    rest.clicks,
    rest.impressions,
    'two-sided',
  )
  const leadRateBetter = twoProportionZTest(
    leads,
    clicks,
    rest.leads,
    rest.clicks,
    'greater',
  )
  const leadRateWorse = twoProportionZTest(
    leads,
    clicks,
    rest.leads,
    rest.clicks,
    'less',
  )
  const convRateWorse = twoProportionZTest(
    conversions,
    clicks,
    rest.conversions,
    rest.clicks,
    'less',
  )

  const ctrHigh = item.ctr >= averages.ctr * 1.15
  const ctrLowAbsolute = item.ctr < 1.2
  const ctrLowRelative = item.ctr < averages.ctr * 0.65
  const cplLow =
    leads > 0 && averages.cpl > 0 && item.cpl <= averages.cpl * 0.85
  const cplHigh =
    leads > 0 && averages.cpl > 0 && item.cpl >= averages.cpl * 1.35
  const spendHigh = item.spend >= averages.spend * 1.25
  const fewLeads = leads < Math.max(averages.leads * 0.45, 5)
  const fewConversions =
    conversions < Math.max(averages.conversions * 0.4, 2)
  const cpcHigh = item.cpc >= averages.cpc * 1.35
  const clicksOk = clicks >= averages.clicks * 0.7
  const frequencyHigh = item.frequency >= 2.5
  const resultsWeak = cplHigh || fewLeads || fewConversions

  const ctrEvidence = hasCtrVolume(item) && rest.impressions >= EVIDENCE.minImpressionsForCtr
  const scaleEvidence = hasScaleVolume(item) && rest.clicks >= EVIDENCE.minClicksForRate
  const rateEvidence = hasRateVolume(item) && rest.clicks >= EVIDENCE.minClicksForRate
  const wasteEvidence = hasWasteVolume(item)

  const ctrSignificantlyHigh = ctrEvidence && ctrBetter.significant
  const ctrSignificantlyLow =
    ctrEvidence && (ctrWorse.significant || (ctrLowAbsolute && ctrVsRest.significant))
  const leadRateSignificantlyHigh = scaleEvidence && leadRateBetter.significant
  const leadRateSignificantlyLow = rateEvidence && leadRateWorse.significant
  const convRateSignificantlyLow =
    rateEvidence && conversions + rest.conversions > 0 && convRateWorse.significant

  const conversionRate = clicks > 0 ? conversions / clicks : 0
  const restConversionRate = rest.clicks > 0 ? rest.conversions / rest.clicks : 0

  const spendWeakLooks = spendHigh && (fewLeads || fewConversions)
  const wasteConfirmed =
    spendWeakLooks &&
    wasteEvidence &&
    (leadRateSignificantlyLow ||
      convRateSignificantlyLow ||
      (leads < EVIDENCE.minLeadsForCpl && clicks >= EVIDENCE.minClicksForWaste))

  const waitOnSpendVolume = spendWeakLooks && !wasteConfirmed

  const trendSpendProblem =
    resolvedTrend.available &&
    resolvedTrend.spendRising &&
    (resolvedTrend.metrics.cpl?.direction === 'up' ||
      resolvedTrend.metrics.leads?.direction === 'down')

  const trendBlocksScale = resolvedTrend.available && resolvedTrend.deteriorating
  const looksScalable = ctrHigh && cplLow

  const canScaleSafely =
    looksScalable &&
    scaleEvidence &&
    ctrSignificantlyHigh &&
    (leadRateSignificantlyHigh || cplLow) &&
    !wasteConfirmed &&
    !waitOnSpendVolume &&
    !trendBlocksScale &&
    !(trendSpendProblem && (wasteEvidence || spendHigh))

  const weakCreative = (ctrLowRelative || ctrLowAbsolute) && ctrSignificantlyLow
  const weakCreativeUnconfirmed =
    (ctrLowRelative || ctrLowAbsolute) && !ctrEvidence && !ctrSignificantlyLow
  const expensiveAudience = cpcHigh && !ctrSignificantlyHigh && rateEvidence
  const weakLanding =
    clicksOk &&
    restConversionRate > 0 &&
    conversionRate < restConversionRate * 0.5 &&
    convRateSignificantlyLow
  const creativeFatigue = frequencyHigh && resultsWeak && (wasteEvidence || rateEvidence)

  // Um veredito só: pausar > esperar > corrigir > escalar > acompanhar
  const tags = []
  const notes = []
  let verdict = 'monitor'

  if (wasteConfirmed || (trendSpendProblem && wasteEvidence && !looksScalable)) {
    verdict = 'pause'
  } else if (
    waitOnSpendVolume ||
    (trendSpendProblem && !canScaleSafely) ||
    (looksScalable && trendBlocksScale) ||
    (looksScalable && !scaleEvidence)
  ) {
    verdict = 'wait'
  } else if (weakCreative || weakLanding || creativeFatigue) {
    verdict = 'fix'
  } else if (canScaleSafely) {
    verdict = 'scale'
  } else if (expensiveAudience) {
    verdict = 'fix'
  }

  if (verdict === 'pause') {
    tags.push(ANALYSIS_TAGS.highSpendLowConv)
    tags.push(ANALYSIS_TAGS.pause)
    notes.push(
      wasteConfirmed
        ? 'Com volume suficiente, o gasto está acima da média e o resultado é fraco. Revise ou pause.'
        : 'Nos últimos dias o gasto subiu e o resultado não acompanhou. Revise ou pause.',
    )
  } else if (verdict === 'wait') {
    tags.push(ANALYSIS_TAGS.monitor)
    if (waitOnSpendVolume) {
      notes.push(
        'O gasto está alto e os resultados ainda são poucos, mas o volume é baixo para decidir. Espere mais dados — não pause nem aumente o investimento ainda.',
      )
    } else if (looksScalable && trendBlocksScale) {
      notes.push(
        'No período os números são bons, mas a tendência diária recente está piorando. Não aumente o investimento ainda.',
      )
    } else if (trendSpendProblem) {
      notes.push(
        'O gasto recente subiu e o resultado ainda não acompanhou. Espere estabilizar antes de escalar.',
      )
    } else if (looksScalable) {
      notes.push(
        'CTR e CPL estão bons, mas ainda falta volume ou confirmação estatística. Espere mais dados antes de investir mais.',
      )
    } else {
      notes.push('Continue acompanhando — ainda não há evidência suficiente para uma ação forte.')
    }
  } else if (verdict === 'fix') {
    if (weakCreative) {
      tags.push(ANALYSIS_TAGS.fixCreative)
      notes.push('CTR significativamente abaixo da conta — vale testar outra imagem ou texto no anúncio.')
    }
    if (weakLanding) {
      tags.push(ANALYSIS_TAGS.reviewLanding)
      notes.push('Muitos clicam e poucos convertem — o problema pode estar na página do link.')
    }
    if (creativeFatigue) {
      tags.push(ANALYSIS_TAGS.creativeFatigue)
      notes.push('O anúncio já é visto demais e o resultado caiu — hora de mudar criativo.')
    }
    if (expensiveAudience && !tags.length) {
      tags.push(ANALYSIS_TAGS.reviewAudience)
      notes.push('Cada clique está caro — confira se o anúncio está chegando no público certo.')
    }
    if (!notes.length) {
      notes.push('Há um ponto fraco claro — ajuste criativo, público ou página antes de escalar.')
    }
  } else if (verdict === 'scale') {
    tags.push(ANALYSIS_TAGS.scale)
    notes.push(
      resolvedTrend.available && resolvedTrend.improving
        ? 'CTR e CPL estão melhores que a conta, com volume e significância. A tendência recente também melhora — dá para investir mais.'
        : 'CTR e CPL estão melhores que a conta, com volume e diferença estatística. Dá para investir mais com mais segurança.',
    )
  } else {
    tags.push(ANALYSIS_TAGS.monitor)
    if (weakCreativeUnconfirmed) {
      notes.push('CTR parece baixo, mas ainda há poucas impressões para confirmar. Continue acompanhando.')
    } else {
      notes.push('Está na média ou sem evidência estatística forte — continue acompanhando de perto.')
    }
  }

  const uniqueTags = [...new Map(tags.map((t) => [t.label, t])).values()]
  const primary = pickPrimaryTag(uniqueTags, verdict)

  return {
    tags: uniqueTags,
    primary,
    score: scoreCampaign(item, averages, uniqueTags, resolvedTrend),
    notes: [...new Set(notes)],
    trend: resolvedTrend,
    verdict,
    evidence: {
      volume: {
        ctr: ctrEvidence,
        scale: scaleEvidence,
        rate: rateEvidence,
        waste: wasteEvidence,
      },
      significance: {
        ctrBetter: ctrSignificantlyHigh,
        ctrWorse: ctrSignificantlyLow,
        leadRateBetter: leadRateSignificantlyHigh,
        leadRateWorse: leadRateSignificantlyLow,
        convRateWorse: convRateSignificantlyLow,
      },
      tests: {
        ctrBetter,
        leadRateBetter,
        leadRateWorse,
        convRateWorse,
      },
    },
  }
}

function pickPrimaryTag(tags, verdict) {
  const byVerdict = {
    pause: ['Gastando demais', 'Pausar'],
    wait: ['Acompanhar'],
    fix: ['Anúncio fraco', 'Problema na página', 'Anúncio cansado', 'Revisar quem vê'],
    scale: ['Investir mais'],
    monitor: ['Acompanhar'],
  }

  for (const label of byVerdict[verdict] ?? []) {
    const match = tags.find((tag) => tag.label === label)
    if (match) return match
  }

  return tags[0] ?? ANALYSIS_TAGS.monitor
}

function scoreCampaign(item, averages, tags, trend = null) {
  let score = 50

  if (item.leads > 0 && averages.cpl > 0) {
    score += ((averages.cpl - item.cpl) / averages.cpl) * 30
  }

  score += ((item.ctr - averages.ctr) / Math.max(averages.ctr, 0.1)) * 15

  if (tags.some((t) => t.label === 'Pausar' || t.label === 'Gastando demais')) {
    score -= 35
  }
  if (tags.some((t) => t.label === 'Investir mais')) {
    score += 20
  }
  if (trend?.available && trend.deteriorating) {
    score -= 10
  }
  if (trend?.available && trend.improving) {
    score += 8
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

export function enrichItems(items, options = {}) {
  // Médias e comparações só entre campanhas de lead: live e alcance não têm lead para comparar.
  const leadItems = items.filter(ehCampanhaDeLead)
  const averages = computeAverages(leadItems)
  const dailyByCampaign = options.dailyByCampaign ?? null

  return items
    .map((item) => {
      const series = resolveDailySeries(item, dailyByCampaign)
      const trend = buildCampaignTrend(series)
      return {
        ...item,
        analysis: analyzeCampaign(item, averages, leadItems, trend),
      }
    })
    .sort((a, b) => b.analysis.score - a.analysis.score)
}

export function computeSummary(items, options = {}) {
  const totals = items.reduce(
    (acc, item) => ({
      spend: acc.spend + item.spend,
      clicks: acc.clicks + item.clicks,
      leads: acc.leads + item.leads,
      conversions: acc.conversions + item.conversions,
      impressions: acc.impressions + item.impressions,
    }),
    { spend: 0, clicks: 0, leads: 0, conversions: 0, impressions: 0 },
  )

  const ctr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
  // Custo por lead: só o gasto das campanhas de lead (live e alcance não geram lead).
  const leadSpend = items.filter(ehCampanhaDeLead).reduce((sum, item) => sum + item.spend, 0)
  const cpl = totals.leads > 0 ? leadSpend / totals.leads : 0
  const cpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0

  const enriched = enrichItems(items, options)
  // Destaques / melhor-pior: só campanhas ativas
  const activeRanked = enriched.filter((item) => item.status === 'Ativa')
  const best = activeRanked[0] ?? null
  const worst = activeRanked.length >= 2 ? activeRanked[activeRanked.length - 1] : null

  return {
    totals: { ...totals, ctr, cpc, cpl, cpa },
    best,
    worst,
    enriched,
    activeRanked,
    averages: computeAverages(items.filter(ehCampanhaDeLead)),
  }
}

export function buildInsights(items, options = {}) {
  if (!items.length) return []

  const enriched = enrichItems(items, options)
  const active = enriched.filter((i) => i.status === 'Ativa')

  const bestCampaign = active[0] ?? null
  const worstCampaign = active.length >= 2 ? active[active.length - 1] : null
  const lowestCpc = [...active].sort((a, b) => a.cpc - b.cpc)[0]
  const highestCtr = [...active].sort((a, b) => b.ctr - a.ctr)[0]
  const withLeads = active.filter((i) => i.leads > 0)
  const bestCpl = withLeads.length
    ? [...withLeads].sort((a, b) => a.cpl - b.cpl)[0]
    : null

  const wasteful = [...active]
    .filter((i) =>
      i.analysis.tags.some(
        (t) =>
          t.label === 'Pausar' ||
          t.label === 'Gastando demais',
      ),
    )
    .sort((a, b) => b.spend - a.spend)[0]

  const scaleCandidate = active.find((i) =>
    i.analysis.tags.some((t) => t.label === 'Investir mais'),
  )

  const dailyTip = scaleCandidate
    ? `${scaleCandidate.name} está trazendo clientes por um custo baixo e muita gente clica no anúncio. Vale aumentar o investimento aos poucos.`
    : wasteful
      ? `${wasteful.name} está gastando mais que deveria e trazendo pouco resultado. Recomendamos pausar ou mudar o anúncio e o público.`
      : 'Nenhuma campanha se destaca hoje. Continue acompanhando e teste anúncios novos.'

  return [
    {
      title: 'Melhor campanha',
      value: bestCampaign?.name ?? '—',
      tone: 'success',
      detail: bestCampaign
        ? `Nota ${bestCampaign.analysis.score}/100 · ${bestCampaign.leads} interessados`
        : '',
    },
    {
      title: 'Pior campanha',
      value: worstCampaign?.name ?? '—',
      tone: 'danger',
      detail: worstCampaign?.analysis.primary.label ?? '',
    },
    {
      title: 'Menor custo por clique',
      value: lowestCpc?.name ?? '—',
      tone: 'success',
      detail: lowestCpc ? `R$ ${lowestCpc.cpc.toFixed(2).replace('.', ',')} por clique` : '',
    },
    {
      title: 'Mais cliques',
      value: highestCtr?.name ?? '—',
      tone: 'success',
      detail: highestCtr ? `${highestCtr.ctr.toFixed(2).replace('.', ',')}% das pessoas clicaram` : '',
    },
    {
      title: 'Menor custo por interessado',
      value: bestCpl?.name ?? '—',
      tone: 'success',
      detail: bestCpl ? `R$ ${bestCpl.cpl.toFixed(2).replace('.', ',')} por pessoa interessada` : '',
    },
    {
      title: 'Maior gasto sem resultado',
      value: wasteful?.name ?? 'Nenhuma crítica',
      tone: wasteful ? 'danger' : 'neutral',
      detail: wasteful
        ? `${formatSpend(wasteful.spend)} gastos · ${wasteful.leads} interessados`
        : 'Conta equilibrada no período',
    },
    {
      title: 'Sugestão do dia',
      value: dailyTip,
      tone: 'info',
      detail: '',
      fullWidth: true,
    },
  ]
}

function formatSpend(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function renderAnalysisBadge(tag) {
  const classes = TONE_CLASSES[tag.tone] ?? TONE_CLASSES.warning
  return `<span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${classes}">${tag.emoji} ${tag.label}</span>`
}
