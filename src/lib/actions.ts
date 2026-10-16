import { EVIDENCE } from '@/lib/stats.js'
import { ehCampanhaDeLead } from '@/lib/analysis.js'
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/format.ts'
import type { CampaignItem, EnrichedCampaignItem } from '@/types'
import {
  budgetAheadSteps,
  budgetOverSteps,
  campaignLinks,
  cheapestCampaign,
  costliestCampaign,
  creativeSteps,
  cplUpSteps,
  leadsDownSteps,
  stepsFor,
  zeroLeadsSteps,
  type ActionLink,
  type ActionStep,
  type StepContext,
} from '@/lib/actionGuides.ts'

export { stepsFor }
export type { ActionLink, ActionStep }

/**
 * Transforma a análise das campanhas numa lista de coisas a fazer.
 * Cada ação diz o que está acontecendo, por que importa e o passo a passo para resolver.
 */

export type ActionPriority = 'urgent' | 'today' | 'later' | 'good'
export type ActionKind = 'pause' | 'fix' | 'scale' | 'wait' | 'alert' | 'creative'

export interface ActionItem {
  id: string
  priority: ActionPriority
  kind: ActionKind
  icon: string
  title: string
  why: string
  /** Passo a passo para executar no Gerenciador de Anúncios, com nomes, números e links. */
  steps: ActionStep[]
  /** Atalhos no cartão (ex.: abrir a campanha na Meta). */
  links?: ActionLink[]
  /** Cartão de pergunta: o dash não entendeu para que a campanha serve e pede o tipo ao usuário. */
  pergunta?: { campaignId: string }
  /** Frase curta sobre o dinheiro/resultado em jogo. */
  impact?: string
  campaign?: EnrichedCampaignItem
  /** Estimativa de dinheiro perdido por semana se nada for feito (R$). Só quando dá pra calcular com segurança. */
  moneyAtStake?: number
  /** Por que o painel sugeriu isso, com os números da própria campanha. */
  reasoning?: string
}

/** Dias de cada período, pra normalizar o dinheiro em jogo para "por semana". */
export function periodDays(period: string, now = new Date()): number {
  if (period === 'today' || period === 'yesterday') return 1
  if (period === 'last30' || period === 'prev30') return 30
  if (period === 'this_month') return Math.max(1, now.getDate())
  if (period === 'last_month') return 30
  return 7
}

export const PRIORITY_META: Record<ActionPriority, { label: string; hint: string; tone: string }> = {
  urgent: { label: 'Urgente', hint: 'Está custando dinheiro agora', tone: 'urgent' },
  today: { label: 'Fazer hoje', hint: 'Resolve em poucos minutos', tone: 'today' },
  later: { label: 'Pode esperar', hint: 'Só acompanhar', tone: 'later' },
  good: { label: 'Está indo bem', hint: 'Aproveite o momento', tone: 'good' },
}

export interface Totals {
  spend: number
  leads: number
  cpl: number
  clicks: number
  ctr: number
  cpc: number
}

export interface GoalPace {
  spendTarget: number | null
  cplTarget: number | null
  monthSpend: number
  monthLeads: number
}

interface BuildOptions {
  totals: Totals
  previousTotals?: Totals | null
  ads?: CampaignItem[]
  goal?: GoalPace | null
  /** Dias do período analisado (padrão 7), usado pra estimar o dinheiro em jogo por semana. */
  periodDays?: number
  /** Conta de anúncios (act_...), para os links do Gerenciador abrirem na conta certa. */
  accountId?: string
}

function change(current: number, previous?: number | null): number | null {
  if (previous == null || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

/** Arredonda pra cima de 5 em 5 reais; abaixo de R$ 10 não vale mostrar. */
function roundMoney(value: number): number | undefined {
  if (!Number.isFinite(value) || value < 10) return undefined
  return Math.round(value / 5) * 5
}

interface ActionContext {
  averageCpl: number
  totalSpend: number
  /** Multiplica o valor do período para chegar em "por semana". */
  weekly: number
}

/** Quanto do gasto de uma campanha não se pagou, comparando com o custo por lead médio da conta. */
function wasteOf(item: CampaignItem, averageCpl: number): number {
  if (item.leads > 0 && averageCpl > 0) return Math.max(0, item.spend - item.leads * averageCpl)
  return item.leads === 0 ? item.spend : 0
}

/** Explicação em linguagem simples, com os números da campanha. */
function reasoningFor(item: EnrichedCampaignItem, ctx: ActionContext): string {
  const parts: string[] = []
  if (item.leads > 0 && ctx.averageCpl > 0) {
    const ratio = item.cpl / ctx.averageCpl
    if (ratio >= 1.15) {
      parts.push(
        `O custo por lead (${formatCurrency(item.cpl)}) está ${formatDecimal(ratio, 1)}× acima da média da conta (${formatCurrency(ctx.averageCpl)}).`,
      )
    } else if (ratio <= 0.85) {
      parts.push(
        `O custo por lead (${formatCurrency(item.cpl)}) está bem abaixo da média da conta (${formatCurrency(ctx.averageCpl)}).`,
      )
    }
  } else if (item.leads === 0 && item.spend > 0) {
    parts.push(`Gastou ${formatCurrency(item.spend)} e não trouxe nenhum lead.`)
  }
  if (ctx.totalSpend > 0) {
    const share = (item.spend / ctx.totalSpend) * 100
    if (share >= 10) parts.push(`Ela consome ${formatDecimal(share, 0)}% da verba do período.`)
  }
  if (item.frequency >= 3) parts.push(`Cada pessoa viu o anúncio ${formatDecimal(item.frequency, 1)} vezes.`)
  if (item.leads > 0 && item.ctr > 0) parts.push(`O CTR é ${formatDecimal(item.ctr)}% e o volume é de ${formatNumber(item.leads)} leads.`)
  return parts.join(' ') || item.analysis.notes[0] || 'Os números da campanha pedem atenção.'
}

/** Quanto falta de dados para a análise poder decidir. */
export function evidenceGap(item: CampaignItem): string | null {
  const missingClicks = Math.max(0, EVIDENCE.minClicksForRate - (item.clicks || 0))
  const missingLeads = Math.max(0, EVIDENCE.minLeadsForCpl - (item.leads || 0))
  const parts: string[] = []
  if (missingClicks > 0) parts.push(`${formatNumber(missingClicks)} cliques`)
  if (missingLeads > 0) parts.push(`${formatNumber(missingLeads)} leads`)
  return parts.length ? `Faltam cerca de ${parts.join(' e ')} para uma decisão segura.` : null
}

function campaignAction(item: EnrichedCampaignItem, averageCpl: number, stepCtx: StepContext): ActionItem | null {
  const verdict = item.analysis.verdict
  const note = item.analysis.notes[0] ?? ''
  const spend = formatCurrency(item.spend)
  const resultText = item.leads > 0 ? `${formatNumber(item.leads)} leads (${formatCurrency(item.cpl)} cada)` : 'nenhum lead'

  if (verdict === 'pause') {
    return {
      id: `pause:${item.id}`,
      priority: 'urgent',
      kind: 'pause',
      icon: 'fa-circle-pause',
      title: `Pausar ou reduzir: ${item.name}`,
      why: note,
      impact: `${spend} investidos para ${resultText}.`,
      steps: stepsFor(item, stepCtx),
      links: campaignLinks(item, stepCtx),
      campaign: item,
    }
  }

  if (verdict === 'fix') {
    const costly = averageCpl > 0 && item.leads > 0 && item.cpl >= averageCpl * 1.35
    return {
      id: `fix:${item.id}`,
      priority: costly ? 'urgent' : 'today',
      kind: 'fix',
      icon: 'fa-screwdriver-wrench',
      title: `${item.analysis.primary.label}: ${item.name}`,
      why: note,
      impact: `${spend} investidos · CTR ${formatDecimal(item.ctr)}% · ${resultText}.`,
      steps: stepsFor(item, stepCtx),
      links: campaignLinks(item, stepCtx),
      campaign: item,
    }
  }

  if (verdict === 'scale') {
    return {
      id: `scale:${item.id}`,
      priority: 'good',
      kind: 'scale',
      icon: 'fa-rocket',
      title: `Investir mais: ${item.name}`,
      why: note,
      impact: `${resultText} com CTR ${formatDecimal(item.ctr)}%.`,
      steps: stepsFor(item, stepCtx),
      links: campaignLinks(item, stepCtx),
      campaign: item,
    }
  }

  if (verdict === 'wait' && item.spend > 0) {
    return {
      id: `wait:${item.id}`,
      priority: 'later',
      kind: 'wait',
      icon: 'fa-hourglass-half',
      title: `Aguardar dados: ${item.name}`,
      why: note,
      impact: evidenceGap(item) ?? undefined,
      steps: stepsFor(item, stepCtx),
      links: campaignLinks(item, stepCtx),
      campaign: item,
    }
  }

  return null
}

/** Gera as ações da conta, já ordenadas por prioridade e dinheiro em jogo. */
export function buildActions(enriched: EnrichedCampaignItem[], options: BuildOptions): ActionItem[] {
  const { totals, previousTotals, ads = [], goal, periodDays: days = 7, accountId } = options
  // Só campanhas de leads entram nas ações de leads (engajamento/alcance não geram lead).
  const active = enriched.filter((item) => item.status === 'Ativa' && ehCampanhaDeLead(item))
  const actions: ActionItem[] = []
  const ctx: ActionContext = { averageCpl: totals.cpl, totalSpend: totals.spend, weekly: 7 / Math.max(1, days) }
  // Contexto dos passo a passo: conta, dias do período e as campanhas mais barata/cara para citar pelo nome.
  const stepCtxFor = (excludeId?: string): StepContext => ({
    accountId,
    days,
    averageCpl: totals.cpl,
    cheapest: cheapestCampaign(active, excludeId),
    costliest: costliestCampaign(active),
  })

  for (const item of active) {
    const base = campaignAction(item, totals.cpl, stepCtxFor(item.id))
    if (!base) continue
    const waste = base.kind === 'pause' || base.kind === 'fix' ? wasteOf(item, ctx.averageCpl) : 0
    actions.push({
      ...base,
      reasoning: reasoningFor(item, ctx),
      moneyAtStake: waste ? roundMoney(waste * ctx.weekly) : undefined,
    })
  }

  // Campanha que o dash não conseguiu entender: pergunta o tipo em vez de adivinhar.
  for (const item of enriched) {
    if (item.status !== 'Ativa' || item.spend <= 0 || item.tipo !== 'indefinido') continue
    actions.push({
      id: `tipo:${item.id}`,
      priority: 'today',
      kind: 'alert',
      icon: 'fa-circle-question',
      title: `Para que serve a campanha ${item.name}?`,
      why: String(item.tipoMotivo ?? 'Não consegui entender o objetivo desta campanha.'),
      impact: `${formatCurrency(item.spend)} investidos. Sem saber o objetivo, o painel pode cobrar o resultado errado dela.`,
      steps: [
        {
          text: 'Escolha abaixo o que esta campanha faz.',
          detail: 'Captação de leads: leva para cadastro. Live / vídeo: divulga uma transmissão. Venda direta: leva para o checkout. A sua escolha vale daqui para frente; dá para mudar quando quiser.',
        },
      ],
      links: campaignLinks(item, { accountId }),
      campaign: item,
      pergunta: { campaignId: item.id },
    })
  }

  // Campanha ativa gastando sem nenhum lead (mesmo sem veredito de "pausar").
  for (const item of active) {
    const covered = actions.some((a) => a.campaign?.id === item.id && a.priority === 'urgent')
    if (!covered && item.leads === 0 && item.spend >= Math.max(totals.spend * 0.15, 30) && item.clicks >= 30) {
      actions.push({
        id: `zero:${item.id}`,
        priority: 'urgent',
        kind: 'alert',
        icon: 'fa-triangle-exclamation',
        title: `Gastando sem trazer leads: ${item.name}`,
        why: 'Já houve cliques suficientes e nenhum lead apareceu. Confira se o formulário/pixel está funcionando antes de culpar o anúncio.',
        impact: `${formatCurrency(item.spend)} investidos e ${formatNumber(item.clicks)} cliques sem nenhum lead.`,
        steps: zeroLeadsSteps(item, stepCtxFor(item.id)),
        links: campaignLinks(item, { accountId }),
        campaign: item,
        moneyAtStake: roundMoney(item.spend * ctx.weekly),
        reasoning: `${formatNumber(item.clicks)} cliques e ${formatCurrency(item.spend)} gastos sem nenhum lead. Com esse volume de cliques, o mais provável é um problema no formulário, no pixel ou na oferta.`,
      })
    }
  }

  // Criativos: pior anúncio de uma campanha muito pior que o melhor da mesma campanha.
  const byCampaign = new Map<string, CampaignItem[]>()
  for (const ad of ads) {
    const key = String(ad.campaignId ?? '')
    if (!key || ad.status !== 'Ativa') continue
    byCampaign.set(key, [...(byCampaign.get(key) ?? []), ad])
  }
  for (const [campaignId, list] of byCampaign) {
    const withLeads = list.filter((ad) => ad.leads >= 3 && ad.cpl > 0)
    if (withLeads.length < 2) continue
    const sorted = [...withLeads].sort((a, b) => a.cpl - b.cpl)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    if (worst.cpl >= best.cpl * 2 && worst.spend >= totals.spend * 0.05) {
      const campaign = enriched.find((item) => item.id === campaignId)
      actions.push({
        id: `creative:${worst.id}`,
        priority: 'today',
        kind: 'creative',
        icon: 'fa-image',
        title: `Trocar um anúncio: ${worst.name}`,
        why: `Dentro da mesma campanha, este anúncio custa ${formatCurrency(worst.cpl)} por lead e o melhor custa ${formatCurrency(best.cpl)} (${best.name}).`,
        impact: `${formatCurrency(worst.spend)} investidos neste anúncio.`,
        steps: creativeSteps(worst, best, stepCtxFor(campaignId)),
        links: [{ label: 'Abrir este anúncio na Meta', href: `https://adsmanager.facebook.com/adsmanager/manage/ads?${new URLSearchParams({ ...(accountId ? { act: accountId.replace(/^act_/, '') } : {}), selected_campaign_ids: campaignId, selected_ad_ids: worst.id })}`, external: true }],
        campaign,
        moneyAtStake: roundMoney(Math.max(0, worst.spend - worst.leads * best.cpl) * ctx.weekly),
        reasoning: `Na mesma campanha, "${worst.name}" custa ${formatDecimal(worst.cpl / best.cpl, 1)}× mais por lead que "${best.name}", e já consumiu ${formatCurrency(worst.spend)}.`,
      })
    }
  }

  // Alertas da conta inteira.
  const cplChange = change(totals.cpl, previousTotals?.cpl)
  if (cplChange != null && cplChange >= 20 && totals.leads >= 10) {
    actions.push({
      id: 'account:cpl-up',
      priority: 'urgent',
      kind: 'alert',
      icon: 'fa-arrow-trend-up',
      title: `Custo por lead subiu ${formatDecimal(cplChange, 0)}%`,
      why: `Cada lead custava ${formatCurrency(previousTotals?.cpl)} no período anterior e agora custa ${formatCurrency(totals.cpl)}.`,
      steps: cplUpSteps(stepCtxFor(), totals.cpl, previousTotals?.cpl ?? totals.cpl),
      moneyAtStake: roundMoney(((totals.cpl - (previousTotals?.cpl ?? totals.cpl)) * totals.leads) * ctx.weekly),
      reasoning: `Com ${formatNumber(totals.leads)} leads no período, a alta de ${formatCurrency(previousTotals?.cpl)} para ${formatCurrency(totals.cpl)} por lead é dinheiro a mais saindo pelo mesmo resultado.`,
    })
  }

  const leadsChange = change(totals.leads, previousTotals?.leads)
  if (leadsChange != null && leadsChange <= -25 && (previousTotals?.leads ?? 0) >= 10) {
    actions.push({
      id: 'account:leads-down',
      priority: 'today',
      kind: 'alert',
      icon: 'fa-arrow-trend-down',
      title: `Leads caíram ${formatDecimal(Math.abs(leadsChange), 0)}%`,
      why: `Foram ${formatNumber(totals.leads)} leads, contra ${formatNumber(previousTotals?.leads)} no período anterior.`,
      steps: leadsDownSteps(stepCtxFor()),
    })
  }

  const highFrequency = active.filter((item) => item.frequency >= 3 && item.spend > 0)
  for (const item of highFrequency) {
    if (actions.some((a) => a.campaign?.id === item.id && a.kind !== 'wait')) continue
    actions.push({
      id: `freq:${item.id}`,
      priority: 'today',
      kind: 'alert',
      icon: 'fa-repeat',
      title: `Público saturado: ${item.name}`,
      why: `Cada pessoa viu o anúncio ${formatDecimal(item.frequency, 1)} vezes. Acima de 3, o resultado costuma cair.`,
      steps: stepsFor(
        {
          ...item,
          analysis: { ...item.analysis, verdict: 'fix', tags: [{ emoji: '🔄', label: 'Anúncio cansado', tone: 'warning' }] },
        },
        stepCtxFor(item.id),
      ),
      links: campaignLinks(item, { accountId }),
      campaign: item,
      reasoning: `Frequência de ${formatDecimal(item.frequency, 1)}: acima de 3 o público já viu demais, o clique cai e o custo por lead tende a subir.`,
    })
  }

  if (goal?.spendTarget && goal.spendTarget > 0) {
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const expected = goal.spendTarget * (now.getDate() / daysInMonth)
    if (goal.monthSpend > goal.spendTarget) {
      actions.push({
        id: 'goal:over',
        priority: 'urgent',
        kind: 'alert',
        icon: 'fa-wallet',
        title: 'Orçamento do mês estourado',
        why: `Já foram ${formatCurrency(goal.monthSpend)} de ${formatCurrency(goal.spendTarget)} previstos.`,
        steps: budgetOverSteps(stepCtxFor()),
      })
    } else if (goal.monthSpend > expected * 1.2 && goal.monthSpend > 0) {
      actions.push({
        id: 'goal:ahead',
        priority: 'today',
        kind: 'alert',
        icon: 'fa-gauge-high',
        title: 'Gastando mais rápido que o planejado',
        why: `Até hoje o esperado era ${formatCurrency(expected)} e já foram ${formatCurrency(goal.monthSpend)}. No ritmo atual a verba acaba antes do fim do mês.`,
        steps: budgetAheadSteps(stepCtxFor()),
      })
    }
  }

  // Campanha sem nenhum lead já tem um alerta próprio: tira cartões repetidos dela.
  const zeroIds = new Set(actions.filter((a) => a.id.startsWith('zero:')).map((a) => a.campaign?.id))
  const deduped = actions.filter((a) => a.id.startsWith('zero:') || !a.campaign || !zeroIds.has(a.campaign.id))

  const rank: Record<ActionPriority, number> = { urgent: 0, today: 1, later: 2, good: 3 }
  return deduped.sort((a, b) => {
    if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority]
    const money = (b.moneyAtStake ?? 0) - (a.moneyAtStake ?? 0)
    if (money !== 0) return money
    return (b.campaign?.spend ?? 0) - (a.campaign?.spend ?? 0)
  })
}

/** Soma do dinheiro em jogo por semana (só das ações que têm estimativa). */
export function totalMoneyAtStake(actions: ActionItem[]): number {
  return actions.reduce((sum, action) => sum + (action.moneyAtStake ?? 0), 0)
}

export interface BudgetForecast {
  target: number
  spent: number
  /** Quanto já era esperado ter gastado até hoje, se o ritmo fosse parelho. */
  expected: number
  /** Gasto previsto no fim do mês, no ritmo atual. */
  projected: number
  /** Dia do mês em que a verba acaba no ritmo atual (null se dura até o fim do mês). */
  exhaustDay: number | null
  daysInMonth: number
  today: number
  state: 'over' | 'ahead' | 'ok'
}

/** Previsão de verba do mês a partir da meta de investimento e do gasto até hoje. */
export function budgetForecast(goal: GoalPace | null | undefined, now = new Date()): BudgetForecast | null {
  if (!goal?.spendTarget || goal.spendTarget <= 0) return null
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const today = now.getDate()
  const rate = goal.monthSpend / today
  const projected = rate * daysInMonth
  const expected = goal.spendTarget * (today / daysInMonth)
  let exhaustDay: number | null = null
  if (rate > 0 && goal.monthSpend < goal.spendTarget) {
    const day = Math.ceil(goal.spendTarget / rate)
    if (day <= daysInMonth) exhaustDay = Math.max(today, day)
  }
  const state = goal.monthSpend > goal.spendTarget ? 'over' : goal.monthSpend > expected * 1.2 ? 'ahead' : 'ok'
  return { target: goal.spendTarget, spent: goal.monthSpend, expected, projected, exhaustDay, daysInMonth, today, state }
}

export interface Health {
  score: number
  label: string
  tone: 'good' | 'warn' | 'bad'
  summary: string
}

/** Nota 0–100 da conta: média das notas das campanhas ativas, ponderada pelo gasto. */
export function accountHealth(enriched: EnrichedCampaignItem[], actions: ActionItem[]): Health {
  const active = enriched.filter((item) => item.status === 'Ativa' && item.spend > 0)
  if (!active.length) {
    return { score: 0, label: 'Sem dados', tone: 'warn', summary: 'Nenhuma campanha ativa gastou no período.' }
  }

  const totalSpend = active.reduce((sum, item) => sum + item.spend, 0)
  const weighted = active.reduce((sum, item) => sum + item.analysis.score * item.spend, 0) / totalSpend
  const urgent = actions.filter((action) => action.priority === 'urgent').length
  const score = Math.max(0, Math.min(100, Math.round(weighted - urgent * 6)))

  if (score >= 65) return { score, label: 'Saudável', tone: 'good', summary: 'A maior parte do dinheiro está em campanhas que funcionam.' }
  if (score >= 45) return { score, label: 'Atenção', tone: 'warn', summary: 'Há pontos para ajustar — veja a lista abaixo.' }
  return { score, label: 'Crítico', tone: 'bad', summary: 'Boa parte da verba está em campanhas com resultado ruim.' }
}

const TIPS: { match: (actions: ActionItem[]) => boolean; text: string }[] = [
  {
    match: (a) => a.some((x) => x.kind === 'scale'),
    text: 'Ao escalar, suba o orçamento de 20% em 20% a cada 48h. Saltos maiores reiniciam a fase de aprendizado e o custo por lead costuma disparar.',
  },
  {
    match: (a) => a.some((x) => x.kind === 'pause'),
    text: 'Pausar uma campanha ruim é tão importante quanto escalar uma boa. Verba parada em campanha fraca é a forma mais comum de perder dinheiro.',
  },
  {
    match: (a) => a.some((x) => x.title.startsWith('Público saturado')),
    text: 'Frequência acima de 3 quer dizer que a mesma pessoa viu seu anúncio 3 vezes ou mais. Renove o criativo antes que o custo suba.',
  },
  {
    match: (a) => a.some((x) => x.kind === 'creative' || x.kind === 'fix'),
    text: 'O criativo responde por mais de metade do resultado. Teste sempre 2–3 variações dos 3 primeiros segundos antes de mexer em público.',
  },
  {
    match: (a) => a.some((x) => x.kind === 'wait'),
    text: 'Campanha com pouco volume não deve ser julgada. Espere ao menos 100 cliques e 20 leads antes de pausar ou escalar.',
  },
]

const GENERIC_TIPS = [
  'Olhe o painel todo dia no mesmo horário. Decisões rápidas e pequenas valem mais que grandes revisões semanais.',
  'Mexa em uma coisa por vez (criativo, público ou orçamento). Se mudar tudo junto, você não saberá o que funcionou.',
  'Confira se os leads estão chegando em Leads/Registros. Um pixel quebrado faz boas campanhas parecerem ruins.',
  'Compare sempre períodos do mesmo tamanho (7 dias contra 7 dias) para a variação fazer sentido.',
]

export function dailyTip(actions: ActionItem[]): string {
  const match = TIPS.find((tip) => tip.match(actions))
  if (match) return match.text
  const day = Math.floor(Date.now() / 86_400_000)
  return GENERIC_TIPS[day % GENERIC_TIPS.length]
}

/** Texto corrido que resume o período, em linguagem simples. */
export function buildBriefing(
  totals: Totals,
  previousTotals: Totals | null | undefined,
  enriched: EnrichedCampaignItem[],
  actions: ActionItem[],
  periodLabel: string,
): string[] {
  const lines: string[] = []
  const cplChange = change(totals.cpl, previousTotals?.cpl)
  const leadsChange = change(totals.leads, previousTotals?.leads)

  let main = `${periodLabel}: ${formatCurrency(totals.spend)} investidos e ${formatNumber(totals.leads)} leads`
  if (totals.leads > 0) main += `, a ${formatCurrency(totals.cpl)} cada`
  lines.push(`${main}.`)

  if (cplChange != null && Math.abs(cplChange) >= 5) {
    lines.push(
      cplChange > 0
        ? `O custo por lead ficou ${formatDecimal(Math.abs(cplChange), 0)}% mais caro que no período anterior.`
        : `O custo por lead ficou ${formatDecimal(Math.abs(cplChange), 0)}% mais barato que no período anterior.`,
    )
  } else if (leadsChange != null && Math.abs(leadsChange) >= 5) {
    lines.push(`Os leads ${leadsChange > 0 ? 'cresceram' : 'caíram'} ${formatDecimal(Math.abs(leadsChange), 0)}% em relação ao período anterior.`)
  }

  const active = enriched.filter((item) => item.status === 'Ativa')
  const best = active[0]
  const worst = active.length >= 2 ? active[active.length - 1] : null
  if (best) lines.push(`Melhor campanha: ${best.name}.`)
  if (worst && worst.analysis.score < 50) lines.push(`Pior campanha: ${worst.name}.`)

  const urgent = actions.filter((a) => a.priority === 'urgent').length
  const today = actions.filter((a) => a.priority === 'today').length
  if (urgent + today === 0) lines.push('Nada exige ação agora — pode acompanhar com tranquilidade.')
  else lines.push(`Para hoje: ${urgent} urgente${urgent === 1 ? '' : 's'} e ${today} para fazer no dia.`)

  return lines
}
