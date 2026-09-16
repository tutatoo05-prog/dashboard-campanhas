import { resolveDailyWindow } from '../lib/period.ts'

/**
 * Dados simulados — estrutura compatível com futura integração Meta Marketing API.
 * Campos espelham insights comuns: spend, impressions, reach, clicks, actions, etc.
 */

const PERIOD_MULTIPLIERS = {
  today: 0.08,
  yesterday: 0.09,
  last7: 0.45,
  last30: 1,
  this_month: 0.55,
  last_month: 0.95,
  prev7: 0.38,
  prev30: 0.85,
  custom: 1,
}

function scaleMetrics(item, multiplier) {
  const scaled = {
    ...item,
    spend: round(item.spend * multiplier, 2),
    impressions: Math.round(item.impressions * multiplier),
    reach: Math.round(item.reach * multiplier),
    clicks: Math.round(item.clicks * multiplier),
    leads: Math.round(item.leads * multiplier),
    conversions: Math.round(item.conversions * multiplier),
  }

  scaled.cpl = scaled.leads > 0 ? round(scaled.spend / scaled.leads, 2) : 0
  scaled.cpa = scaled.conversions > 0 ? round(scaled.spend / scaled.conversions, 2) : 0
  scaled.ctr = scaled.impressions > 0 ? round((scaled.clicks / scaled.impressions) * 100, 2) : 0
  scaled.cpc = scaled.clicks > 0 ? round(scaled.spend / scaled.clicks, 2) : 0

  return scaled
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const BASE_CAMPAIGNS = [
  {
    id: 'camp-001',
    name: 'Campanha Curso Tattoo',
    status: 'Ativa',
    objective: 'leads',
    spend: 250,
    impressions: 12000,
    reach: 8500,
    clicks: 420,
    ctr: 3.5,
    cpc: 0.59,
    leads: 38,
    cpl: 6.57,
    conversions: 12,
    cpa: 20.83,
    frequency: 1.8,
  },
  {
    id: 'camp-002',
    name: 'Remarketing Compradores',
    status: 'Ativa',
    objective: 'conversion',
    spend: 180,
    impressions: 6200,
    reach: 4100,
    clicks: 310,
    ctr: 5.0,
    cpc: 0.58,
    leads: 22,
    cpl: 8.18,
    conversions: 19,
    cpa: 9.47,
    frequency: 2.1,
  },
  {
    id: 'camp-003',
    name: 'Tráfego Blog — Lookalike',
    status: 'Ativa',
    objective: 'traffic',
    spend: 320,
    impressions: 28000,
    reach: 19500,
    clicks: 890,
    ctr: 3.18,
    cpc: 0.36,
    leads: 8,
    cpl: 40.0,
    conversions: 3,
    cpa: 106.67,
    frequency: 1.4,
  },
  {
    id: 'camp-004',
    name: 'Leads — Formulário Instantâneo',
    status: 'Ativa',
    objective: 'leads',
    spend: 410,
    impressions: 15000,
    reach: 9200,
    clicks: 180,
    ctr: 1.2,
    cpc: 2.28,
    leads: 14,
    cpl: 29.29,
    conversions: 5,
    cpa: 82.0,
    frequency: 3.2,
  },
  {
    id: 'camp-005',
    name: 'Conversão — Carrinho Abandonado',
    status: 'Ativa',
    objective: 'conversion',
    spend: 95,
    impressions: 4800,
    reach: 3200,
    clicks: 240,
    ctr: 5.0,
    cpc: 0.4,
    leads: 18,
    cpl: 5.28,
    conversions: 11,
    cpa: 8.64,
    frequency: 1.6,
  },
  {
    id: 'camp-006',
    name: 'Awareness — Vídeo Institucional',
    status: 'Pausada',
    objective: 'traffic',
    spend: 540,
    impressions: 45000,
    reach: 38000,
    clicks: 320,
    ctr: 0.71,
    cpc: 1.69,
    leads: 4,
    cpl: 135.0,
    conversions: 1,
    cpa: 540.0,
    frequency: 2.8,
  },
  {
    id: 'camp-007',
    name: 'Leads — Webinar Gratuito',
    status: 'Ativa',
    objective: 'leads',
    spend: 165,
    impressions: 9800,
    reach: 7100,
    clicks: 392,
    ctr: 4.0,
    cpc: 0.42,
    leads: 45,
    cpl: 3.67,
    conversions: 15,
    cpa: 11.0,
    frequency: 1.5,
  },
  {
    id: 'camp-008',
    name: 'Teste Criativo — UGC Stories',
    status: 'Ativa',
    objective: 'leads',
    spend: 210,
    impressions: 11000,
    reach: 6800,
    clicks: 275,
    ctr: 2.5,
    cpc: 0.76,
    leads: 12,
    cpl: 17.5,
    conversions: 4,
    cpa: 52.5,
    frequency: 2.9,
  },
]

const BASE_ADSETS = [
  {
    id: 'adset-001',
    campaignId: 'camp-001',
    name: 'Curso Tattoo — Interesses',
    status: 'Ativa',
    objective: 'leads',
    spend: 140,
    impressions: 6800,
    reach: 4900,
    clicks: 238,
    ctr: 3.5,
    cpc: 0.59,
    leads: 22,
    cpl: 6.36,
    conversions: 7,
    cpa: 20.0,
    frequency: 1.7,
  },
  {
    id: 'adset-002',
    campaignId: 'camp-001',
    name: 'Curso Tattoo — Lookalike 1%',
    status: 'Ativa',
    objective: 'leads',
    spend: 110,
    impressions: 5200,
    reach: 3600,
    clicks: 182,
    ctr: 3.5,
    cpc: 0.6,
    leads: 16,
    cpl: 6.88,
    conversions: 5,
    cpa: 22.0,
    frequency: 1.9,
  },
  {
    id: 'adset-003',
    campaignId: 'camp-004',
    name: 'Formulário — Público Frio 25-45',
    status: 'Ativa',
    objective: 'leads',
    spend: 280,
    impressions: 10200,
    reach: 6100,
    clicks: 98,
    ctr: 0.96,
    cpc: 2.86,
    leads: 6,
    cpl: 46.67,
    conversions: 2,
    cpa: 140.0,
    frequency: 3.5,
  },
  {
    id: 'adset-004',
    campaignId: 'camp-007',
    name: 'Webinar — Empresários',
    status: 'Ativa',
    objective: 'leads',
    spend: 165,
    impressions: 9800,
    reach: 7100,
    clicks: 392,
    ctr: 4.0,
    cpc: 0.42,
    leads: 45,
    cpl: 3.67,
    conversions: 15,
    cpa: 11.0,
    frequency: 1.5,
  },
  {
    id: 'adset-005',
    campaignId: 'camp-006',
    name: 'Vídeo — Broad Audience',
    status: 'Pausada',
    objective: 'traffic',
    spend: 540,
    impressions: 45000,
    reach: 38000,
    clicks: 320,
    ctr: 0.71,
    cpc: 1.69,
    leads: 4,
    cpl: 135.0,
    conversions: 1,
    cpa: 540.0,
    frequency: 2.8,
  },
]

const BASE_ADS = [
  {
    id: 'ad-001',
    adsetId: 'adset-004',
    campaignId: 'camp-007',
    name: 'Webinar — Carrossel Depoimentos',
    status: 'Ativa',
    objective: 'leads',
    spend: 95,
    impressions: 5400,
    reach: 4200,
    clicks: 230,
    ctr: 4.26,
    cpc: 0.41,
    leads: 28,
    cpl: 3.39,
    conversions: 10,
    cpa: 9.5,
    frequency: 1.3,
  },
  {
    id: 'ad-002',
    adsetId: 'adset-004',
    campaignId: 'camp-007',
    name: 'Webinar — Vídeo UGC',
    status: 'Ativa',
    objective: 'leads',
    spend: 70,
    impressions: 4400,
    reach: 3500,
    clicks: 162,
    ctr: 3.68,
    cpc: 0.43,
    leads: 17,
    cpl: 4.12,
    conversions: 5,
    cpa: 14.0,
    frequency: 1.6,
  },
  {
    id: 'ad-003',
    adsetId: 'adset-003',
    campaignId: 'camp-004',
    name: 'Formulário — Imagem Estática Genérica',
    status: 'Ativa',
    objective: 'leads',
    spend: 180,
    impressions: 7200,
    reach: 4500,
    clicks: 52,
    ctr: 0.72,
    cpc: 3.46,
    leads: 3,
    cpl: 60.0,
    conversions: 1,
    cpa: 180.0,
    frequency: 3.8,
  },
  {
    id: 'ad-004',
    adsetId: 'adset-001',
    campaignId: 'camp-001',
    name: 'Tattoo — Antes/Depois Reels',
    status: 'Ativa',
    objective: 'leads',
    spend: 85,
    impressions: 3200,
    reach: 2400,
    clicks: 128,
    ctr: 4.0,
    cpc: 0.66,
    leads: 14,
    cpl: 6.07,
    conversions: 4,
    cpa: 21.25,
    frequency: 1.5,
  },
  {
    id: 'ad-005',
    adsetId: 'adset-005',
    campaignId: 'camp-006',
    name: 'Institucional — Vídeo 30s',
    status: 'Pausada',
    objective: 'traffic',
    spend: 540,
    impressions: 45000,
    reach: 38000,
    clicks: 320,
    ctr: 0.71,
    cpc: 1.69,
    leads: 4,
    cpl: 135.0,
    conversions: 1,
    cpa: 540.0,
    frequency: 2.8,
  },
  {
    id: 'ad-006',
    adsetId: 'adset-002',
    campaignId: 'camp-001',
    name: 'Tattoo — Oferta Limitada',
    status: 'Ativa',
    objective: 'leads',
    spend: 55,
    impressions: 2000,
    reach: 1500,
    clicks: 54,
    ctr: 2.7,
    cpc: 1.02,
    leads: 2,
    cpl: 27.5,
    conversions: 1,
    cpa: 55.0,
    frequency: 2.2,
  },
]

export function getDataForPeriod(period = 'last7', { since, until } = {}) {
  let multiplier = PERIOD_MULTIPLIERS[period] ?? 1

  if (period === 'custom' && since && until) {
    const start = new Date(`${since}T12:00:00`)
    const end = new Date(`${until}T12:00:00`)
    const days = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
      ? Math.max(1, Math.round((end - start) / 86_400_000) + 1)
      : 7
    multiplier = days / 30
  }

  const campaigns = BASE_CAMPAIGNS.map((item) => scaleMetrics(item, multiplier))
  const dailyWindow = resolveDailyWindow(period, { since, until })

  return {
    campaigns,
    adSets: BASE_ADSETS.map((item) => scaleMetrics(item, multiplier)),
    ads: BASE_ADS.map((item) => scaleMetrics(item, multiplier)),
    dailyByCampaign: buildMockDailyByCampaign(campaigns, dailyWindow.days),
  }
}

function padDate(value) {
  return String(value).padStart(2, '0')
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}`
}

/** Série diária sintética para recomendações com tendência no modo mock. */
function buildMockDailyByCampaign(campaigns, days = 14) {
  const map = {}

  for (const campaign of campaigns) {
    const series = []
    const baseSpend = (campaign.spend || 0) / days
    const baseClicks = (campaign.clicks || 0) / days
    const baseLeads = (campaign.leads || 0) / days
    const baseImpressions = (campaign.impressions || 0) / days

    // Campanhas caras / fracas: gasto sobe e leads caem no fim.
    const wasting = (campaign.cpl || 0) > 25 || (campaign.ctr || 0) < 1.5
    const improving = !wasting && (campaign.cpl || 0) > 0 && (campaign.cpl || 0) < 10

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date()
      date.setHours(12, 0, 0, 0)
      date.setDate(date.getDate() - offset)
      const progress = (days - 1 - offset) / Math.max(days - 1, 1)

      let spendFactor = 1
      let leadsFactor = 1
      let clicksFactor = 1

      if (wasting) {
        spendFactor = 0.75 + progress * 0.7
        leadsFactor = 1.15 - progress * 0.55
        clicksFactor = 1.05 - progress * 0.25
      } else if (improving) {
        spendFactor = 0.9 + progress * 0.2
        leadsFactor = 0.8 + progress * 0.45
        clicksFactor = 0.85 + progress * 0.3
      } else {
        spendFactor = 0.95 + Math.sin(progress * Math.PI) * 0.08
        leadsFactor = 0.95 + Math.cos(progress * Math.PI) * 0.08
        clicksFactor = 1
      }

      const spend = round(baseSpend * spendFactor, 2)
      const clicks = Math.max(0, Math.round(baseClicks * clicksFactor))
      const leads = Math.max(0, Math.round(baseLeads * leadsFactor))
      const impressions = Math.max(clicks, Math.round(baseImpressions * clicksFactor))
      const conversions = Math.max(0, Math.round(leads * 0.4))

      series.push({
        date: formatLocalDate(date),
        spend,
        impressions,
        clicks,
        leads,
        conversions,
        ctr: impressions > 0 ? round((clicks / impressions) * 100, 2) : 0,
        cpc: clicks > 0 ? round(spend / clicks, 2) : 0,
        cpl: leads > 0 ? round(spend / leads, 2) : null,
      })
    }

    map[String(campaign.id)] = series
  }

  return map
}

export const OBJECTIVES = {
  leads: 'Leads',
  traffic: 'Tráfego',
  conversion: 'Conversão',
}

export const PERIODS = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last7: 'Últimos 7 dias',
  custom: 'Personalizado',
}

export const LEVELS = {
  campaigns: 'Campanhas',
  adSets: 'Conjuntos',
  ads: 'Anúncios',
}
