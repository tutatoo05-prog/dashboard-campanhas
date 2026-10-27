import type { Lead, LeadNota, Purchase } from '@/types'
import { acharPessoa, categoriaDe, type RegistroAgrupado } from '@/lib/mergeRegistros.ts'
import { originLabel } from '@/lib/leadOrigins.ts'

/**
 * Contas da tela Leads: cruza cada lead com as compras e com os eventos da Hotmart (Pix gerado, carrinho abandonado)
 * pelo e-mail OU telefone, e calcula interesse, situação e os números dos painéis. Tudo no navegador, sobre o que a
 * API já entrega (até 5.000 leads), então os filtros respondem na hora.
 */

export type SituacaoLead = 'aluno' | 'quente' | 'novo' | 'lead' | 'frio'
export type Periodo = 'hoje' | '7d' | '30d' | '90d' | 'tudo'

export const PERIODOS: { id: Periodo; rotulo: string; dias: number | null }[] = [
  { id: 'hoje', rotulo: 'Hoje', dias: 1 },
  { id: '7d', rotulo: '7 dias', dias: 7 },
  { id: '30d', rotulo: '30 dias', dias: 30 },
  { id: '90d', rotulo: '90 dias', dias: 90 },
  { id: 'tudo', rotulo: 'Tudo', dias: null },
]

export const SITUACAO_ROTULO: Record<SituacaoLead, string> = {
  aluno: 'Aluno',
  quente: 'Quente',
  novo: 'Novo',
  lead: 'Lead',
  frio: 'Frio',
}

const DIA = 86_400_000

export interface LeadRico {
  lead: Lead
  /** Posição na lista original (desempate estável e chave do React). */
  indice: number
  ts: number
  projeto: string
  nome: string
  email: string
  telefone: string
  comprou: boolean
  valor: number
  produto: string
  /** Dias entre o cadastro e a primeira compra (null se não comprou ou comprou antes de se cadastrar). */
  diasAteCompra: number | null
  /** Pix/boleto gerado, carrinho abandonado ou compra: chegou à página de pagamento. */
  checkout: boolean
  score: number
  estrelas: number
  situacao: SituacaoLead
  /** Em quantos projetos diferentes esta mesma pessoa se cadastrou. */
  inscritoEm: number
  uf: string
}

export function normalizarEmail(valor: unknown): string {
  return String(valor ?? '').trim().toLowerCase()
}

export function telefone10(valor: unknown): string {
  const digitos = String(valor ?? '').replace(/\D/g, '')
  return digitos.length >= 10 ? digitos.slice(-10) : ''
}

function momentoDe(lead: Lead): number {
  if (lead.created_at) {
    const t = new Date(lead.created_at).getTime()
    if (Number.isFinite(t)) return t
  }
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(lead.data ?? '')
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime() : 0
}

const DDD_UF: Record<string, string> = {}
for (const [uf, ddds] of Object.entries({
  SP: '11 12 13 14 15 16 17 18 19',
  RJ: '21 22 24',
  ES: '27 28',
  MG: '31 32 33 34 35 37 38',
  PR: '41 42 43 44 45 46',
  SC: '47 48 49',
  RS: '51 53 54 55',
  DF: '61',
  GO: '62 64',
  TO: '63',
  MT: '65 66',
  MS: '67',
  AC: '68',
  RO: '69',
  BA: '71 73 74 75 77',
  SE: '79',
  PE: '81 87',
  AL: '82',
  PB: '83',
  RN: '84',
  CE: '85 88',
  PI: '86 89',
  MA: '98 99',
  PA: '91 93 94',
  AM: '92 97',
  AP: '96',
  RR: '95',
})) {
  for (const ddd of ddds.split(' ')) DDD_UF[ddd] = uf
}

/** Estado pelo DDD do telefone ('' quando não dá para saber). */
export function ufDoTelefone(telefone: unknown): string {
  const digitos = String(telefone ?? '').replace(/\D/g, '')
  const semPais = digitos.length >= 12 && digitos.startsWith('55') ? digitos.slice(2) : digitos
  return semPais.length >= 10 ? (DDD_UF[semPais.slice(0, 2)] ?? '') : ''
}

const COMPRA_INVALIDA = /cancel|reembols|chargeback|refund|estorn/i

function compraValida(compra: Purchase): boolean {
  return !COMPRA_INVALIDA.test(compra.status ?? '') && !compra.canceledAt
}

function momentoDaCompra(compra: Purchase): number {
  const t = new Date(compra.createdAt ?? compra.data ?? '').getTime()
  return Number.isFinite(t) ? t : NaN
}

function temRespostas(respostas: Lead['respostas']): boolean {
  return !!respostas && Object.values(respostas).some((v) => String(v ?? '').trim() !== '')
}

/** Interesse de 0 a 100: sinal de compra pesa mais; depois cadastro recente, contato completo e formulário respondido. */
export function calcularScore(entrada: {
  idadeHoras: number
  checkout: boolean
  temTelefone: boolean
  temEmail: boolean
  respondeu: boolean
  veioDeAnuncio: boolean
  inscritoEm: number
}): number {
  let pontos = 0
  const h = entrada.idadeHoras
  if (h < 24) pontos += 30
  else if (h < 72) pontos += 22
  else if (h < 168) pontos += 12
  else if (h < 720) pontos += 5
  if (entrada.checkout) pontos += 30
  if (entrada.temTelefone) pontos += 10
  if (entrada.temEmail) pontos += 5
  if (entrada.respondeu) pontos += 10
  if (entrada.veioDeAnuncio) pontos += 5
  if (entrada.inscritoEm > 1) pontos += 10
  return Math.min(100, pontos)
}

export function enriquecerLeads(leads: Lead[], purchases: Purchase[], pessoas: RegistroAgrupado[] | null, agora = Date.now()): LeadRico[] {
  // Compras válidas por e-mail e por telefone.
  const comprasPorChave = new Map<string, Purchase[]>()
  for (const compra of purchases) {
    if (!compraValida(compra)) continue
    for (const chave of [normalizarEmail(compra.email) && `e:${normalizarEmail(compra.email)}`, telefone10(compra.telefone) && `p:${telefone10(compra.telefone)}`]) {
      if (!chave) continue
      const lista = comprasPorChave.get(chave) ?? []
      lista.push(compra)
      comprasPorChave.set(chave, lista)
    }
  }

  // Projetos em que cada pessoa se cadastrou.
  const projetosPorChave = new Map<string, Set<string>>()
  for (const lead of leads) {
    const projeto = originLabel(lead.origem)
    for (const chave of [normalizarEmail(lead.email) && `e:${normalizarEmail(lead.email)}`, telefone10(lead.telefone) && `p:${telefone10(lead.telefone)}`]) {
      if (!chave) continue
      const conjunto = projetosPorChave.get(chave) ?? new Set<string>()
      conjunto.add(projeto)
      projetosPorChave.set(chave, conjunto)
    }
  }

  return leads.map((lead, indice) => {
    const email = normalizarEmail(lead.email)
    const tel = telefone10(lead.telefone)
    const chaves = [email && `e:${email}`, tel && `p:${tel}`].filter(Boolean) as string[]
    const ts = momentoDe(lead)

    const compras = new Map<string, Purchase>()
    for (const chave of chaves) for (const c of comprasPorChave.get(chave) ?? []) compras.set(c.id, c)
    const lista = [...compras.values()]
    const pessoa = pessoas ? acharPessoa(pessoas, { email: lead.email, telefone: lead.telefone }) : null
    const comprou = lista.length > 0 || pessoa?.status === 'comprou'
    const checkout =
      comprou ||
      !!pessoa?.historico.some((p) => {
        const cat = categoriaDe(p)
        return cat === 'abandono' || cat === 'pix_boleto' || cat === 'venda'
      })

    const primeira = lista.map(momentoDaCompra).filter((t) => Number.isFinite(t) && t >= ts - DIA / 2).sort((a, b) => a - b)[0]
    const inscritoEm = Math.max(1, ...chaves.map((c) => projetosPorChave.get(c)?.size ?? 1))
    const idadeHoras = ts ? (agora - ts) / 3_600_000 : Infinity

    const score = calcularScore({
      idadeHoras,
      checkout,
      temTelefone: !!tel,
      temEmail: !!email,
      respondeu: temRespostas(lead.respostas),
      veioDeAnuncio: !!(lead.criativo || lead.ad_id || lead.campanha),
      inscritoEm,
    })

    let situacao: SituacaoLead
    if (comprou) situacao = 'aluno'
    else if (checkout || score >= 60) situacao = 'quente'
    else if (idadeHoras < 24) situacao = 'novo'
    else if (idadeHoras > 24 * 7) situacao = 'frio'
    else situacao = 'lead'

    return {
      lead,
      indice,
      ts,
      projeto: originLabel(lead.origem),
      nome: lead.nome ?? '',
      email: lead.email ?? '',
      telefone: lead.telefone ?? '',
      comprou,
      valor: lista.reduce((soma, c) => soma + (c.valor ?? 0), 0),
      produto: lista[0]?.curso ?? '',
      diasAteCompra: primeira !== undefined && ts ? Math.max(0, (primeira - ts) / DIA) : null,
      checkout,
      score,
      estrelas: Math.min(5, Math.max(1, Math.ceil(score / 20))),
      situacao,
      inscritoEm,
      uf: ufDoTelefone(lead.telefone),
    }
  })
}

// ───── Período ─────

export function inicioDoPeriodo(periodo: Periodo, agora = Date.now()): number {
  const dias = PERIODOS.find((p) => p.id === periodo)?.dias
  if (!dias) return 0
  const hoje = new Date(agora)
  hoje.setHours(0, 0, 0, 0)
  return hoje.getTime() - (dias - 1) * DIA
}

export function noPeriodo(ricos: LeadRico[], periodo: Periodo, agora = Date.now()): LeadRico[] {
  const inicio = inicioDoPeriodo(periodo, agora)
  return inicio ? ricos.filter((l) => l.ts >= inicio) : ricos
}

/** Mesma duração do período, imediatamente antes dele (null em "Tudo"). */
export function periodoAnterior(ricos: LeadRico[], periodo: Periodo, agora = Date.now()): LeadRico[] | null {
  const dias = PERIODOS.find((p) => p.id === periodo)?.dias
  if (!dias) return null
  const inicio = inicioDoPeriodo(periodo, agora)
  const anterior = inicio - dias * DIA
  return ricos.filter((l) => l.ts >= anterior && l.ts < inicio)
}

// ───── Números dos painéis ─────

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null
  const ordenado = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenado.length / 2)
  return ordenado.length % 2 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2
}

export interface Resumo {
  total: number
  comprou: number
  valor: number
  taxa: number
  quentes: number
  medianaDias: number | null
  mesmoDia: number
}

export function resumir(ricos: LeadRico[]): Resumo {
  const compradores = ricos.filter((l) => l.comprou)
  const dias = compradores.map((l) => l.diasAteCompra).filter((d): d is number => d !== null)
  return {
    total: ricos.length,
    comprou: compradores.length,
    valor: compradores.reduce((soma, l) => soma + l.valor, 0),
    taxa: ricos.length ? (compradores.length / ricos.length) * 100 : 0,
    quentes: ricos.filter((l) => l.situacao === 'quente').length,
    medianaDias: mediana(dias),
    mesmoDia: dias.length ? Math.round((dias.filter((d) => d < 1).length / dias.length) * 100) : 0,
  }
}

/** Variação percentual (null sem base de comparação). */
export function variacao(atual: number, anterior: number | undefined): number | null {
  if (anterior === undefined || anterior === 0) return null
  return ((atual - anterior) / anterior) * 100
}

export interface DiaSerie {
  inicio: number
  total: number
  comprou: number
  fimDeSemana: boolean
}

/** Cadastros por dia dos últimos `dias` dias (até hoje). */
export function serieDiaria(ricos: LeadRico[], dias: number, agora = Date.now()): DiaSerie[] {
  const hoje = new Date(agora)
  hoje.setHours(0, 0, 0, 0)
  const primeiro = hoje.getTime() - (dias - 1) * DIA
  const serie: DiaSerie[] = Array.from({ length: dias }, (_, i) => {
    const inicio = primeiro + i * DIA
    const dow = new Date(inicio).getDay()
    return { inicio, total: 0, comprou: 0, fimDeSemana: dow === 0 || dow === 6 }
  })
  for (const l of ricos) {
    const i = Math.floor((l.ts - primeiro) / DIA)
    if (i < 0 || i >= dias) continue
    serie[i].total += 1
    if (l.comprou) serie[i].comprou += 1
  }
  return serie
}

export interface PassoFunil {
  rotulo: string
  total: number
  /** % em relação ao primeiro passo. */
  pct: number
}

/** Cadastro → chegou ao pagamento (Pix, boleto, carrinho) → comprou. */
export function funil(ricos: LeadRico[]): { passos: PassoFunil[]; maiorPerda: string } {
  const total = ricos.length
  const checkout = ricos.filter((l) => l.checkout).length
  const comprou = ricos.filter((l) => l.comprou).length
  const pct = (n: number) => (total ? (n / total) * 100 : 0)
  const passos = [
    { rotulo: 'Cadastrou', total, pct: total ? 100 : 0 },
    { rotulo: 'Chegou ao pagamento', total: checkout, pct: pct(checkout) },
    { rotulo: 'Comprou', total: comprou, pct: pct(comprou) },
  ]
  const perdaCheckout = total ? 1 - checkout / total : 0
  const perdaCompra = checkout ? 1 - comprou / checkout : 0
  const maiorPerda = !total
    ? ''
    : perdaCheckout >= perdaCompra
      ? `maior perda: cadastro → pagamento (−${Math.round(perdaCheckout * 100)}%)`
      : `maior perda: pagamento → compra (−${Math.round(perdaCompra * 100)}%)`
  return { passos, maiorPerda }
}

export interface LinhaRanking {
  chave: string
  rotulo: string
  detalhe: string
  total: number
  comprou: number
  taxa: number
}

function ranking(ricos: LeadRico[], chaveDe: (l: LeadRico) => string, rotuloDe: (l: LeadRico) => string, detalheDe: (l: LeadRico) => string): LinhaRanking[] {
  const mapa = new Map<string, LinhaRanking>()
  for (const l of ricos) {
    const chave = chaveDe(l)
    if (!chave) continue
    const linha = mapa.get(chave) ?? { chave, rotulo: rotuloDe(l), detalhe: detalheDe(l), total: 0, comprou: 0, taxa: 0 }
    linha.total += 1
    if (l.comprou) linha.comprou += 1
    mapa.set(chave, linha)
  }
  for (const linha of mapa.values()) linha.taxa = linha.total ? (linha.comprou / linha.total) * 100 : 0
  return [...mapa.values()].sort((a, b) => b.taxa - a.taxa || b.comprou - a.comprou || b.total - a.total)
}

export function rankingOrigens(ricos: LeadRico[]): LinhaRanking[] {
  return ranking(
    ricos,
    (l) => l.lead.origem || 'sem_origem',
    (l) => l.projeto,
    () => '',
  ).sort((a, b) => b.total - a.total)
}

/** Criativos com pelo menos `minimo` leads (poucos leads viram taxa enganosa). */
export function rankingCriativos(ricos: LeadRico[], minimo = 3): LinhaRanking[] {
  return ranking(
    ricos,
    (l) => (l.lead.criativo ?? '').trim(),
    (l) => (l.lead.criativo ?? '').trim(),
    (l) => (l.lead.campanha ?? '').trim(),
  ).filter((linha) => linha.total >= minimo)
}

export const FAIXAS_HORA = ['0h', '3h', '6h', '9h', '12h', '15h', '18h', '21h']
export const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export interface PerfilLeads {
  /** [dia da semana (Seg..Dom)][faixa de 3 h] já em escala 0..1. */
  calor: number[][]
  /** Mesma grade do `calor`, mas com a quantidade bruta de cadastros. */
  contagem: number[][]
  /** Total de cadastros com data (base do % de cada faixa). */
  totalComData: number
  melhorMomento: string
  estados: { uf: string; pct: number }[]
  semEstado: number
  idadeMedia: number | null
  comTelefone: number
}

const fusoBrasil = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
const INDICE_DIA: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

export function perfil(ricos: LeadRico[], agora = Date.now()): PerfilLeads {
  const contagem = Array.from({ length: 7 }, () => Array<number>(8).fill(0))
  const estados = new Map<string, number>()
  let semEstado = 0
  const idades: number[] = []
  let comTelefone = 0

  for (const l of ricos) {
    if (l.ts) {
      const partes = fusoBrasil.formatToParts(new Date(l.ts))
      const dia = INDICE_DIA[partes.find((p) => p.type === 'weekday')?.value ?? '']
      const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '0')
      if (dia !== undefined) contagem[dia][Math.floor(hora / 3)] += 1
    }
    if (l.telefone) comTelefone += 1
    if (l.uf) estados.set(l.uf, (estados.get(l.uf) ?? 0) + 1)
    else if (l.telefone) semEstado += 1
    const nasc = l.lead.data_nascimento ? new Date(l.lead.data_nascimento).getTime() : NaN
    if (Number.isFinite(nasc)) {
      const idade = (agora - nasc) / (365.25 * DIA)
      if (idade >= 10 && idade <= 90) idades.push(idade)
    }
  }

  const maximo = Math.max(1, ...contagem.flat())
  let melhor = { dia: 0, faixa: 0, n: 0 }
  contagem.forEach((linha, dia) => linha.forEach((n, faixa) => n > melhor.n && (melhor = { dia, faixa, n })))
  const totalUf = [...estados.values()].reduce((a, b) => a + b, 0)

  return {
    calor: contagem.map((linha) => linha.map((n) => n / maximo)),
    contagem,
    totalComData: contagem.flat().reduce((a, b) => a + b, 0),
    melhorMomento: melhor.n ? `${DIAS_SEMANA[melhor.dia]}, ${FAIXAS_HORA[melhor.faixa]}–${(melhor.faixa + 1) * 3}h` : '',
    estados: [...estados.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([uf, n]) => ({ uf, pct: totalUf ? (n / totalUf) * 100 : 0 })),
    semEstado,
    idadeMedia: idades.length ? Math.round(idades.reduce((a, b) => a + b, 0) / idades.length) : null,
    comTelefone,
  }
}

// ───── Texto ─────

/** "há 2 h", "ontem", "há 5 d", ou a data quando passa de um mês. */
export function dataRelativa(ts: number, agora = Date.now()): string {
  if (!ts) return '—'
  const min = Math.floor((agora - ts) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 60 * 24) return `há ${Math.floor(min / 60)} h`
  const dias = Math.floor(min / (60 * 24))
  if (dias === 1) return 'ontem'
  if (dias < 31) return `há ${dias} d`
  return new Date(ts).toLocaleDateString('pt-BR')
}

export function notasPorChave(notas: LeadNota[]): Map<string, LeadNota> {
  return new Map(notas.map((n) => [n.chave, n]))
}

/** Número com DDI para o link do WhatsApp ('' quando não há telefone utilizável). */
export function whatsappDe(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < 10) return ''
  return digitos.length <= 11 ? `55${digitos}` : digitos
}
