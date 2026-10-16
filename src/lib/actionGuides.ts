import { formatCurrency, formatDecimal, formatNumber } from '@/lib/format.ts'
import type { CampaignItem, EnrichedCampaignItem } from '@/types'

/**
 * Passo a passo das ações da Central: cada passo diz o que fazer, em que lugar clicar, com o nome
 * da campanha, os números dela e o link direto. O texto aceita **negrito** (nomes de campanha).
 */

export interface ActionLink {
  label: string
  href: string
  /** true = abre em outra aba (Meta, páginas públicas); false = tela do próprio painel. */
  external?: boolean
}

export interface ActionStep {
  /** A instrução principal, curta. */
  text: string
  /** Como fazer, onde clicar, o que esperar. */
  detail?: string
  links?: ActionLink[]
}

export interface StepContext {
  /** Conta de anúncios (act_123...), para os links do Gerenciador abrirem na conta certa. */
  accountId?: string
  /** Dias do período analisado (para a média por dia). */
  days: number
  averageCpl: number
  /** Campanha mais barata da conta, para mandar a verba para ela. */
  cheapest?: EnrichedCampaignItem | null
  /** Campanha mais cara da conta (para os alertas da conta inteira). */
  costliest?: EnrichedCampaignItem | null
}

const step = (text: string, detail?: string, links?: ActionLink[]): ActionStep => ({ text, detail, links })

// ── Links ────────────────────────────────────────────────────────────────────

const MANAGER = 'https://adsmanager.facebook.com/adsmanager/manage'

function managerUrl(level: 'campaigns' | 'adsets' | 'ads', accountId?: string, params: Record<string, string | null | undefined> = {}): string {
  const query = new URLSearchParams()
  const act = String(accountId ?? '').replace(/^act_/, '')
  if (act) query.set('act', act)
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  const text = query.toString()
  return `${MANAGER}/${level}${text ? `?${text}` : ''}`
}

export const metaLinks = {
  todas: (accountId?: string, label = 'Abrir o Gerenciador de Anúncios'): ActionLink => ({ label, href: managerUrl('campaigns', accountId), external: true }),
  campanha: (accountId?: string, campaignId?: string | null, label = 'Abrir a campanha na Meta'): ActionLink => ({
    label,
    href: managerUrl('campaigns', accountId, { selected_campaign_ids: campaignId }),
    external: true,
  }),
  conjuntos: (accountId?: string, campaignId?: string | null, label = 'Ver os conjuntos de anúncios'): ActionLink => ({
    label,
    href: managerUrl('adsets', accountId, { selected_campaign_ids: campaignId }),
    external: true,
  }),
  anuncios: (accountId?: string, campaignId?: string | null, adId?: string | null, label = 'Ver os anúncios'): ActionLink => ({
    label,
    href: managerUrl('ads', accountId, { selected_campaign_ids: campaignId, selected_ad_ids: adId }),
    external: true,
  }),
  eventos: (): ActionLink => ({ label: 'Abrir o Gerenciador de Eventos (pixel)', href: 'https://business.facebook.com/events_manager2/overview', external: true }),
}

export const painelLinks = {
  leads: (): ActionLink => ({ label: 'Abrir Leads no painel', href: '/leads' }),
  registros: (): ActionLink => ({ label: 'Abrir Registros no painel', href: '/registros' }),
  dashboard: (): ActionLink => ({ label: 'Abrir o Dashboard (Meta do mês)', href: '/' }),
  comparar: (): ActionLink => ({ label: 'Comparar períodos', href: '/compare' }),
}

/** Páginas de captura/venda para o cadastro de teste. */
export const paginasDeTeste = (): ActionLink[] => [
  { label: 'Abrir a página do Essentials', href: 'https://tuzinho.academy/produtos/essentials/', external: true },
  { label: 'Abrir a página da Live', href: 'https://tuzinho.academy/live', external: true },
]

const pageSpeed = (): ActionLink => ({ label: 'Testar a velocidade (PageSpeed)', href: 'https://pagespeed.web.dev/', external: true })

// ── Textos ───────────────────────────────────────────────────────────────────

const nome = (item: { name: string }) => `**${item.name}**`
const perDay = (item: CampaignItem, ctx: StepContext) => item.spend / Math.max(1, ctx.days)
const resultado = (item: CampaignItem) => (item.leads > 0 ? `${formatNumber(item.leads)} leads (${formatCurrency(item.cpl)} cada)` : 'nenhum lead')
const periodo = (ctx: StepContext) => (ctx.days === 1 ? 'no período' : `nos últimos ${ctx.days} dias`)
const roundBudget = (value: number) => (value >= 20 ? Math.round(value / 5) * 5 : Math.round(value * 100) / 100)

const COMO_REDUZIR =
  'Clique no lápis (Editar) ao lado da campanha, procure "Orçamento", digite o novo valor diário e clique em "Publicar". Para pausar de vez: na coluna da esquerda, mude a chavinha da campanha de "Ativado" para "Desativado".'

/** Campanha ativa mais barata (com leads suficientes) para receber a verba. */
export function cheapestCampaign(enriched: EnrichedCampaignItem[], excludeId?: string): EnrichedCampaignItem | null {
  const candidates = enriched.filter((item) => item.status === 'Ativa' && item.id !== excludeId && item.leads >= 5 && item.cpl > 0)
  return candidates.sort((a, b) => a.cpl - b.cpl)[0] ?? null
}

/** Campanha ativa mais cara por lead. */
export function costliestCampaign(enriched: EnrichedCampaignItem[]): EnrichedCampaignItem | null {
  const candidates = enriched.filter((item) => item.status === 'Ativa' && item.leads >= 3 && item.cpl > 0)
  return candidates.sort((a, b) => b.cpl - a.cpl)[0] ?? null
}

function moveBudgetStep(ctx: StepContext, excludeId: string): ActionStep {
  const target = ctx.cheapest && ctx.cheapest.id !== excludeId ? ctx.cheapest : null
  if (!target) return step('Passe a verba para a campanha com menor custo por lead.', 'Aumente o orçamento dela em até 20% por vez.', [metaLinks.todas(ctx.accountId)])
  const day = perDay(target, ctx)
  return step(
    `Mande a verba para a campanha mais barata: ${nome(target)}.`,
    `Ela custa ${formatCurrency(target.cpl)} por lead${ctx.averageCpl > 0 ? ` (a média da conta é ${formatCurrency(ctx.averageCpl)})` : ''}. Hoje gasta cerca de ${formatCurrency(day)} por dia: suba para no máximo ${formatCurrency(roundBudget(day * 1.2))} por dia (+20%). Mais que isso de uma vez reinicia o aprendizado da Meta.`,
    [metaLinks.campanha(ctx.accountId, target.id, 'Abrir essa campanha na Meta')],
  )
}

// ── Passos por campanha ──────────────────────────────────────────────────────

/** Passo a passo específico para cada tipo de problema de uma campanha. */
export function stepsFor(item: EnrichedCampaignItem, ctx: StepContext = { days: 7, averageCpl: 0 }): ActionStep[] {
  const labels = item.analysis.tags.map((tag) => tag.label)
  const verdict = item.analysis.verdict
  const day = perDay(item, ctx)
  const abrir = metaLinks.campanha(ctx.accountId, item.id)

  if (verdict === 'pause') {
    return [
      step(
        `Abra a campanha ${nome(item)} no Gerenciador de Anúncios.`,
        `${periodo(ctx)[0].toUpperCase()}${periodo(ctx).slice(1)} ela gastou ${formatCurrency(item.spend)} (cerca de ${formatCurrency(day)} por dia) e trouxe ${resultado(item)}. É esse o dinheiro em jogo.`,
        [abrir],
      ),
      step(
        'Decida: reduzir ou pausar.',
        `Se ela já teve resultado bom antes, reduza o orçamento diário de ${formatCurrency(day)} para cerca de ${formatCurrency(roundBudget(day / 2))} (metade). Se nunca funcionou, pause.`,
      ),
      step('Faça a mudança.', COMO_REDUZIR, [abrir]),
      step(
        'Antes de reativar, troque o criativo ou o público.',
        'Repetir o mesmo anúncio repete o resultado. Use o botão "Duplicar" no conjunto de anúncios e mude uma coisa só: o vídeo/imagem OU o público.',
        [metaLinks.conjuntos(ctx.accountId, item.id)],
      ),
      moveBudgetStep(ctx, item.id),
    ]
  }

  if (verdict === 'scale') {
    return [
      step(
        `Abra a campanha ${nome(item)}.`,
        `Ela está indo bem: ${resultado(item)}${ctx.averageCpl > 0 ? `, contra a média da conta de ${formatCurrency(ctx.averageCpl)}` : ''}.`,
        [abrir],
      ),
      step(
        `Aumente o orçamento diário em no máximo 20%: de ${formatCurrency(day)} para ${formatCurrency(roundBudget(day * 1.2))}.`,
        'Clique no lápis (Editar) → "Orçamento" → novo valor → "Publicar". Mudanças maiores reiniciam o aprendizado da Meta e o custo por lead costuma subir.',
      ),
      step('Não mexa em mais nada (público, criativo) no mesmo dia.', 'Se mudar várias coisas juntas, você não saberá o que funcionou.'),
      step(
        'Espere 48 horas e confira se o custo por lead se manteve.',
        `Volte aqui: se continuar perto de ${formatCurrency(item.cpl)}, pode subir mais 20%.`,
        [painelLinks.dashboard()],
      ),
      step(
        'Para ir mais rápido, duplique o conjunto vencedor em vez de inflar o orçamento.',
        'Botão "Duplicar" no conjunto de anúncios que mais trouxe leads. A cópia roda em paralelo e não atrapalha a original.',
        [metaLinks.conjuntos(ctx.accountId, item.id)],
      ),
    ]
  }

  if (verdict === 'fix') {
    const steps: ActionStep[] = [
      step(`Abra a campanha ${nome(item)}.`, `Gasto de ${formatCurrency(item.spend)} ${periodo(ctx)}, CTR de ${formatDecimal(item.ctr)}% e ${resultado(item)}.`, [abrir]),
    ]
    if (labels.includes('Anúncio fraco')) {
      steps.push(
        step(
          'Abra a aba "Anúncios" e ache o pior (menor CTR).',
          `O CTR da campanha é ${formatDecimal(item.ctr)}%. Abaixo de 1% costuma ser sinal de anúncio que não prende a atenção.`,
          [metaLinks.anuncios(ctx.accountId, item.id)],
        ),
        step(
          'Duplique o anúncio e crie 2 variações.',
          'Botão "Duplicar". Em cada cópia mude só os 3 primeiros segundos do vídeo (ou a imagem) e a primeira frase do texto — assim você sabe o que fez diferença.',
        ),
        step('Deixe as variações rodando por 48 horas e compare o CTR.', 'Quando uma variação tiver CTR maior, pause o anúncio original.'),
      )
    }
    if (labels.includes('Problema na página')) {
      steps.push(
        step(
          'Abra a página do anúncio no celular.',
          'No Gerenciador, passe o mouse no anúncio → "Visualizar anúncio" → "Link do site". Ela deve abrir em menos de 3 segundos. Dê uma olhada também nas páginas de venda:',
          paginasDeTeste(),
        ),
        step('Confira a velocidade.', 'Cole o endereço da página no PageSpeed e olhe a nota "Mobile": abaixo de 50 precisa de ajuste.', [pageSpeed()]),
        step('Veja se a promessa do anúncio é a mesma da primeira tela da página.', 'Se o anúncio fala de uma coisa e a página de outra, a pessoa vai embora sem se cadastrar.'),
        step('Deixe o formulário só com nome e WhatsApp (ou e-mail).', 'Cada campo a mais derruba o número de cadastros.'),
        step('Faça um cadastro de teste e confira que ele chega em Leads.', undefined, [painelLinks.leads()]),
      )
    }
    if (labels.includes('Anúncio cansado')) {
      steps.push(
        step(
          `A frequência está em ${formatDecimal(item.frequency, 1)}: cada pessoa já viu o anúncio ${formatDecimal(item.frequency, 1)} vezes.`,
          'Acima de 3 o público enjoa, o clique cai e o custo por lead sobe.',
          [metaLinks.conjuntos(ctx.accountId, item.id)],
        ),
        step(
          'Troque o criativo ou amplie o público.',
          'Crie um anúncio novo (outro vídeo ou outra imagem) no mesmo conjunto, ou abra o público: em "Público", aumente a faixa de idade/localização e tire interesses muito específicos.',
        ),
      )
    }
    if (labels.includes('Revisar quem vê')) {
      steps.push(
        step(
          'Cada clique está caro: teste um público mais aberto.',
          'Duplique o conjunto, deixe a Meta escolher o público (Advantage+) e compare com o atual por 48 horas.',
          [metaLinks.conjuntos(ctx.accountId, item.id)],
        ),
        step('Tire interesses muito específicos e exclua quem já virou lead.', 'Em "Público" → "Excluir": escolha a lista de leads, para não pagar por quem já se cadastrou.'),
      )
    }
    if (steps.length === 1) {
      steps.push(step('Revise criativo, público e página — algum deles está puxando o resultado para baixo.', 'Comece pelo criativo: é o que mais pesa no resultado.', [metaLinks.anuncios(ctx.accountId, item.id)]))
    }
    return steps
  }

  return [
    step('Não faça mudanças agora.', 'Mexer cedo demais atrapalha a otimização da Meta. Esta campanha ainda não tem dados suficientes.'),
    step(`Volte a olhar ${nome(item)} em 48 horas.`, 'Com mais cliques e leads o painel consegue dizer o que fazer.', [abrir]),
  ]
}

export function campaignLinks(item: { id: string }, ctx: { accountId?: string }): ActionLink[] {
  return [metaLinks.campanha(ctx.accountId, item.id, 'Abrir na Meta')]
}

// ── Ações específicas ────────────────────────────────────────────────────────

export function zeroLeadsSteps(item: EnrichedCampaignItem, ctx: StepContext): ActionStep[] {
  return [
    step(
      'Faça um cadastro de teste na página do anúncio.',
      `A campanha ${nome(item)} teve ${formatNumber(item.clicks)} cliques e nenhum lead: antes de culpar o anúncio, confira se o formulário funciona. Abra a página e preencha com seus dados:`,
      paginasDeTeste(),
    ),
    step('Confira se o lead chegou aqui no painel.', 'Ele deve aparecer em Leads em até alguns minutos (a cópia roda a cada 10 minutos).', [painelLinks.leads(), painelLinks.registros()]),
    step(
      'Se o cadastro NÃO chegou, o problema é técnico (formulário, pixel ou página fora do ar).',
      'Veja se o pixel está disparando o evento "Lead" no Gerenciador de Eventos e avise quem cuida do site.',
      [metaLinks.eventos()],
    ),
    step(
      'Se o cadastro chegou, a campanha é que está fraca: pause ou troque criativo e público.',
      COMO_REDUZIR,
      [metaLinks.campanha(ctx.accountId, item.id)],
    ),
  ]
}

export function creativeSteps(worst: CampaignItem, best: CampaignItem, ctx: StepContext): ActionStep[] {
  const campaignId = String(worst.campaignId ?? '')
  return [
    step(
      `Abra o anúncio ${nome(worst)}.`,
      `Ele custa ${formatCurrency(worst.cpl)} por lead e já gastou ${formatCurrency(worst.spend)}. O melhor da mesma campanha, ${nome(best)}, custa ${formatCurrency(best.cpl)}.`,
      [metaLinks.anuncios(ctx.accountId, campaignId, worst.id, 'Abrir este anúncio na Meta')],
    ),
    step('Pause este anúncio ou reduza a verba dele.', 'Na aba "Anúncios", mude a chavinha dele de "Ativado" para "Desativado". Os outros anúncios da campanha continuam rodando.'),
    step(
      `Crie uma variação inspirada em ${nome(best)}.`,
      'Abra o anúncio melhor, clique em "Duplicar" e troque a imagem ou o vídeo mantendo o mesmo gancho (a primeira frase do texto).',
      [metaLinks.anuncios(ctx.accountId, campaignId, best.id, 'Abrir o melhor anúncio na Meta')],
    ),
    step('Deixe a variação rodar 48 horas antes de julgar.', 'Menos que isso a Meta ainda está aprendendo e o número engana.'),
  ]
}

export function cplUpSteps(ctx: StepContext, cpl: number, previousCpl: number): ActionStep[] {
  const worst = ctx.costliest
  const steps: ActionStep[] = [
    step(
      worst ? `A campanha que mais pesa é ${nome(worst)}.` : 'Veja qual campanha mais encareceu — normalmente é uma só.',
      worst
        ? `Ela custa ${formatCurrency(worst.cpl)} por lead (a média da conta agora é ${formatCurrency(cpl)}, antes era ${formatCurrency(previousCpl)}) e gastou ${formatCurrency(worst.spend)}.`
        : `A média da conta foi de ${formatCurrency(previousCpl)} para ${formatCurrency(cpl)} por lead. Ordene as campanhas por custo por lead no Dashboard.`,
      [worst ? metaLinks.campanha(ctx.accountId, worst.id, 'Abrir essa campanha na Meta') : painelLinks.dashboard()],
    ),
    step(worst ? `Pause ou reduza ${nome(worst)}.` : 'Pause ou reduza essa campanha.', COMO_REDUZIR, [worst ? metaLinks.campanha(ctx.accountId, worst.id) : metaLinks.todas(ctx.accountId)]),
    moveBudgetStep(ctx, worst?.id ?? ''),
    step(
      'Se o aumento for geral (todas subiram), pode ser cansaço de público.',
      'Olhe a "Frequência" no Gerenciador (acima de 3 é sinal): renove os criativos e teste um público mais aberto.',
      [painelLinks.comparar()],
    ),
  ]
  return steps
}

export function leadsDownSteps(ctx: StepContext): ActionStep[] {
  return [
    step('Confira se alguma campanha boa foi pausada ou ficou sem orçamento.', 'No Gerenciador, ordene por "Resultados" e veja se alguma que trazia muitos leads está "Desativada" ou com orçamento zerado.', [metaLinks.todas(ctx.accountId)]),
    step('Verifique se a página de captura está no ar e o pixel disparando.', 'Faça um cadastro de teste e veja se o lead aparece no painel.', [...paginasDeTeste(), painelLinks.leads(), metaLinks.eventos()]),
    step('Se o investimento caiu junto, a queda é esperada.', 'Compare o custo por lead, não só a quantidade: se o custo ficou igual, está tudo certo.', [painelLinks.comparar()]),
  ]
}

export function budgetOverSteps(ctx: StepContext): ActionStep[] {
  return [
    step('Reduza os orçamentos diários, começando pelas campanhas de pior custo por lead.', COMO_REDUZIR, [metaLinks.todas(ctx.accountId)]),
    step('Ou, se o gasto maior foi planejado, aumente a meta do mês.', 'No Dashboard, o cartão "Meta do mês" tem o botão de editar a verba prevista.', [painelLinks.dashboard()]),
  ]
}

export function budgetAheadSteps(ctx: StepContext): ActionStep[] {
  return [
    step('Reduza os orçamentos das campanhas com pior custo por lead.', COMO_REDUZIR, [metaLinks.todas(ctx.accountId)]),
    step('Evite subir orçamentos até voltar ao ritmo.', 'O Dashboard mostra o ritmo de gasto do mês e o dia em que a verba acabaria.', [painelLinks.dashboard()]),
  ]
}

/** Passos dos alertas das regras automáticas (custo acima da média, gastando sem leads, verba do mês). */
export function ruleAlertSteps(
  ruleType: 'cpl_above_avg' | 'spend_no_leads' | 'budget_used',
  campaign: EnrichedCampaignItem | undefined,
  ctx: StepContext,
): ActionStep[] {
  if (ruleType === 'spend_no_leads') {
    if (campaign) return zeroLeadsSteps(campaign, ctx)
    return [
      step('Faça um cadastro de teste nas páginas de captura.', 'Veja se o formulário funciona antes de culpar o anúncio.', paginasDeTeste()),
      step('Confira se o lead chegou ao painel.', undefined, [painelLinks.leads()]),
      step('Se o cadastro funciona, a campanha é fraca: pause ou troque criativo e público.', COMO_REDUZIR, [metaLinks.todas(ctx.accountId)]),
    ]
  }
  if (ruleType === 'budget_used') return budgetAheadSteps(ctx)
  const worst = campaign ?? ctx.costliest ?? undefined
  return [
    step(
      worst ? `Abra a campanha ${nome(worst)}.` : 'Abra o Gerenciador de Anúncios e localize a campanha.',
      worst ? `Ela custa ${formatCurrency(worst.cpl)} por lead, acima da média da conta (${formatCurrency(ctx.averageCpl)}).` : undefined,
      [worst ? metaLinks.campanha(ctx.accountId, worst.id) : metaLinks.todas(ctx.accountId)],
    ),
    step('Compare os anúncios dela: o mais caro costuma puxar o custo para cima.', 'Abra a aba "Anúncios" e ordene por "Custo por resultado".', [metaLinks.anuncios(ctx.accountId, worst?.id)]),
    step('Pause ou reduza o anúncio mais caro e crie uma variação do melhor.', 'Botão "Duplicar" no anúncio vencedor; mude a imagem/vídeo mantendo o gancho.'),
    step('Confira de novo em 48 horas.', 'O painel atualiza sozinho; volte aqui e veja se o custo por lead caiu.', [painelLinks.dashboard()]),
  ]
}
