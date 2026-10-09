import { EVIDENCE } from '@/lib/stats.js'
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/format.ts'
import type { CampaignItem, EnrichedCampaignItem } from '@/types'

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
  /** Passo a passo para executar no Gerenciador de Anúncios. */
  steps: string[]
  /** Frase curta sobre o dinheiro/resultado em jogo. */
  impact?: string
  campaign?: EnrichedCampaignItem
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
}

function change(current: number, previous?: number | null): number | null {
  if (previous == null || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

/** Passo a passo específico para cada tipo de problema. */
export function stepsFor(item: EnrichedCampaignItem): string[] {
  const labels = item.analysis.tags.map((tag) => tag.label)
  const verdict = item.analysis.verdict

  if (verdict === 'pause') {
    return [
      'Abra o Gerenciador de Anúncios e localize esta campanha.',
      'Se ela ainda tem histórico bom, reduza o orçamento diário pela metade. Se não, pause.',
      'Antes de reativar, troque o criativo ou o público — repetir o mesmo anúncio repete o resultado.',
      'Redirecione a verba para a campanha com menor custo por lead.',
    ]
  }

  if (verdict === 'scale') {
    return [
      'Aumente o orçamento diário em no máximo 20%. Mudanças maiores reiniciam o aprendizado da Meta.',
      'Não mexa em mais nada (público, criativo) no mesmo dia.',
      'Espere 48h e confira se o custo por lead se manteve antes de subir de novo.',
      'Se quiser ir mais rápido, duplique o conjunto vencedor em vez de inflar o orçamento.',
    ]
  }

  if (verdict === 'fix') {
    const steps: string[] = []
    if (labels.includes('Anúncio fraco')) {
      steps.push(
        'Crie 2 variações do anúncio: mude os 3 primeiros segundos do vídeo (ou a imagem) e a primeira frase do texto.',
        'Rode as variações no mesmo conjunto e compare o CTR depois de 48h.',
      )
    }
    if (labels.includes('Problema na página')) {
      steps.push(
        'Abra a página do link no celular: ela carrega em menos de 3 segundos?',
        'Confira se a promessa do anúncio é a mesma da primeira tela da página.',
        'Reduza o formulário ao mínimo (nome e WhatsApp ou e-mail).',
      )
    }
    if (labels.includes('Anúncio cansado')) {
      steps.push(
        `A frequência está em ${formatDecimal(item.frequency, 1)} — o público já viu demais.`,
        'Troque o criativo ou amplie o público para novas pessoas.',
      )
    }
    if (labels.includes('Revisar quem vê')) {
      steps.push(
        'Cada clique está caro: teste um público mais aberto (deixe a Meta escolher) contra o atual.',
        'Remova interesses muito específicos e exclua quem já virou lead.',
      )
    }
    if (!steps.length) {
      steps.push('Revise criativo, público e página — algum deles está puxando o resultado para baixo.')
    }
    return steps
  }

  return [
    'Não faça mudanças agora — mexer cedo demais atrapalha a otimização.',
    'Volte a olhar esta campanha em 48h, quando houver mais dados.',
  ]
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

function campaignAction(item: EnrichedCampaignItem, averageCpl: number): ActionItem | null {
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
      steps: stepsFor(item),
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
      steps: stepsFor(item),
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
      steps: stepsFor(item),
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
      steps: stepsFor(item),
      campaign: item,
    }
  }

  return null
}

/** Gera as ações da conta, já ordenadas por prioridade e dinheiro em jogo. */
export function buildActions(enriched: EnrichedCampaignItem[], options: BuildOptions): ActionItem[] {
  const { totals, previousTotals, ads = [], goal } = options
  const active = enriched.filter((item) => item.status === 'Ativa')
  const actions: ActionItem[] = []

  for (const item of active) {
    const action = campaignAction(item, totals.cpl)
    if (action) actions.push(action)
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
        steps: [
          'Abra a página do link e faça um cadastro de teste.',
          'Confirme que o lead aparece em Leads/Registros aqui no painel.',
          'Se o cadastro funciona, a campanha é fraca: pause ou troque criativo e público.',
        ],
        campaign: item,
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
        steps: [
          `Pause "${worst.name}" ou reduza a verba dele.`,
          `Crie uma variação inspirada em "${best.name}" — mesmo gancho, nova imagem ou vídeo.`,
          'Deixe a variação rodar 48h antes de julgar.',
        ],
        campaign,
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
      steps: [
        'Veja abaixo qual campanha mais encareceu — normalmente é uma só.',
        'Pause ou reduza a campanha mais cara e mande a verba para a mais barata.',
        'Se for geral, pode ser cansaço de público: renove os criativos.',
      ],
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
      steps: [
        'Confira se alguma campanha boa foi pausada ou ficou sem orçamento.',
        'Verifique se a página de captura está no ar e o pixel disparando.',
        'Se o investimento caiu junto, a queda é esperada — compare o custo por lead.',
      ],
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
      steps: stepsFor({
        ...item,
        analysis: { ...item.analysis, verdict: 'fix', tags: [{ emoji: '🔄', label: 'Anúncio cansado', tone: 'warning' }] },
      }),
      campaign: item,
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
        steps: ['Reduza os orçamentos diários ou aumente a meta do mês em Meta do mês (Dashboard).'],
      })
    } else if (goal.monthSpend > expected * 1.2 && goal.monthSpend > 0) {
      actions.push({
        id: 'goal:ahead',
        priority: 'today',
        kind: 'alert',
        icon: 'fa-gauge-high',
        title: 'Gastando mais rápido que o planejado',
        why: `Até hoje o esperado era ${formatCurrency(expected)} e já foram ${formatCurrency(goal.monthSpend)}. No ritmo atual a verba acaba antes do fim do mês.`,
        steps: ['Reduza os orçamentos das campanhas com pior custo por lead.', 'Evite subir orçamentos até voltar ao ritmo.'],
      })
    }
  }

  // Campanha sem nenhum lead já tem um alerta próprio: tira cartões repetidos dela.
  const zeroIds = new Set(actions.filter((a) => a.id.startsWith('zero:')).map((a) => a.campaign?.id))
  const deduped = actions.filter((a) => a.id.startsWith('zero:') || !a.campaign || !zeroIds.has(a.campaign.id))

  const rank: Record<ActionPriority, number> = { urgent: 0, today: 1, later: 2, good: 3 }
  return deduped.sort((a, b) => {
    if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority]
    return (b.campaign?.spend ?? 0) - (a.campaign?.spend ?? 0)
  })
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
