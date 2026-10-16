/**
 * Regras automáticas: lógica pura (sem banco nem rede), pra poder testar à parte.
 * Cada regra olha os números da conta e devolve "candidatos a alerta".
 *
 *  - cpl_above_avg  {pct, days}  CPL de uma campanha acima da média da conta por N dias seguidos
 *  - spend_no_leads {amount}     campanha ativa gastou X sem nenhum lead
 *  - budget_used    {pct}        verba do mês passou de X% da meta de investimento
 */

export const RULE_TYPES = ['cpl_above_avg', 'spend_no_leads', 'budget_used']

const LIMITS = {
  cpl_above_avg: { pct: [5, 300], days: [1, 7] },
  spend_no_leads: { amount: [5, 100000] },
  budget_used: { pct: [10, 200] },
}

const DEFAULTS = {
  cpl_above_avg: { pct: 30, days: 2 },
  spend_no_leads: { amount: 50 },
  budget_used: { pct: 90 },
}

/** Campanhas cujo resultado não é lead (visualização de live, alcance...): ficam fora das regras de lead. */
export const OBJETIVOS_SEM_LEAD = new Set(['engagement', 'awareness'])

export function brl(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)
}

function roundMoney(value) {
  if (!Number.isFinite(value) || value < 10) return null
  return Math.round(value / 5) * 5
}

/** Valida e completa os parâmetros de uma regra. Lança Error com mensagem amigável. */
export function normalizeParams(type, params = {}) {
  if (!RULE_TYPES.includes(type)) throw new Error('Tipo de regra inválido.')
  const out = {}
  for (const [key, [min, max]] of Object.entries(LIMITS[type])) {
    const raw = params?.[key] ?? DEFAULTS[type][key]
    const value = Number(raw)
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`Valor inválido para "${key}" (use entre ${min} e ${max}).`)
    }
    out[key] = key === 'days' ? Math.round(value) : value
  }
  return out
}

export function describeRule(rule) {
  const p = rule.params ?? {}
  if (rule.type === 'cpl_above_avg') {
    return `Se o CPL de uma campanha ficar ${p.pct}% acima da média da conta por ${p.days} ${p.days === 1 ? 'dia' : 'dias'} seguidos, criar uma ação urgente`
  }
  if (rule.type === 'spend_no_leads') return `Se uma campanha gastar ${brl(p.amount)} sem nenhum lead, avisar na hora`
  if (rule.type === 'budget_used') return `Se a verba do mês passar de ${p.pct}% da meta, sugerir reduzir os orçamentos`
  return rule.type
}

/**
 * @param {Array<{id:string,type:string,params:object}>} rules  regras ligadas
 * @param {{accountId:string, campaigns:Array, dailyByCampaign:object, monthSpend:number|null, spendTarget:number|null, today:string}} ctx
 */
export function evaluateRules(rules, ctx) {
  const { campaigns = [], dailyByCampaign = {}, monthSpend = null, spendTarget = null, today } = ctx
  const out = []

  const leadCampaigns = campaigns.filter((item) => !OBJETIVOS_SEM_LEAD.has(item.objective))
  const totals = leadCampaigns.reduce(
    (acc, item) => ({ spend: acc.spend + (item.spend || 0), leads: acc.leads + (item.leads || 0) }),
    { spend: 0, leads: 0 },
  )
  const averageCpl = totals.leads > 0 ? totals.spend / totals.leads : 0
  const active = leadCampaigns.filter((item) => item.status === 'Ativa')

  for (const rule of rules) {
    const p = rule.params ?? {}

    if (rule.type === 'cpl_above_avg' && averageCpl > 0) {
      const days = Number(p.days) || 2
      const factor = 1 + (Number(p.pct) || 30) / 100
      const threshold = averageCpl * factor

      for (const item of active) {
        const series = (dailyByCampaign[item.id] ?? [])
          .filter((point) => point?.date && String(point.date) < today)
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .slice(-days)
        if (series.length < days) continue
        if (!series.every((point) => point.leads > 0 && point.spend / point.leads > threshold)) continue

        const spend = series.reduce((sum, point) => sum + point.spend, 0)
        const leads = series.reduce((sum, point) => sum + point.leads, 0)
        const cpl = spend / leads
        const excess = series.reduce((sum, point) => sum + (point.spend / point.leads - averageCpl) * point.leads, 0)
        out.push({
          ruleId: rule.id,
          campaignKey: item.id,
          campaignId: item.id,
          campaignName: item.name,
          title: `CPL acima da média há ${days} ${days === 1 ? 'dia' : 'dias'}: ${item.name}`,
          detail: `Nos últimos ${days} ${days === 1 ? 'dia' : 'dias'} o CPL ficou em ${brl(cpl)}, ${Math.round(((cpl - averageCpl) / averageCpl) * 100)}% acima da média da conta (${brl(averageCpl)}).`,
          money: roundMoney((excess / days) * 7),
        })
      }
    }

    if (rule.type === 'spend_no_leads') {
      const amount = Number(p.amount) || 50
      for (const item of active) {
        if (item.leads === 0 && item.spend >= amount) {
          out.push({
            ruleId: rule.id,
            campaignKey: item.id,
            campaignId: item.id,
            campaignName: item.name,
            title: `Gastou ${brl(item.spend)} sem nenhum lead: ${item.name}`,
            detail: `Nos últimos 7 dias esta campanha investiu ${brl(item.spend)} sem trazer leads. Confira se o formulário e o pixel estão funcionando antes de culpar o anúncio.`,
            money: roundMoney(item.spend),
          })
        }
      }
    }

    if (rule.type === 'budget_used' && spendTarget > 0 && monthSpend != null) {
      const pct = Number(p.pct) || 90
      const used = (monthSpend / spendTarget) * 100
      if (used >= pct) {
        out.push({
          ruleId: rule.id,
          campaignKey: '',
          campaignId: null,
          campaignName: null,
          title: `Verba do mês em ${Math.round(used)}% da meta`,
          detail: `Já foram ${brl(monthSpend)} de ${brl(spendTarget)} previstos. Reduza os orçamentos diários ou aumente a meta do mês.`,
          money: null,
        })
      }
    }
  }

  return out
}
