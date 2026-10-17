import type { Registro } from '@/types'

export type CategoriaEvento = 'venda' | 'pix_boleto' | 'abandono' | 'cancelamento' | 'reembolso'

/** Um passo da história da pessoa (cada linha de cada aba em que ela aparece). */
export interface Passagem extends Registro {
  categoria: CategoriaEvento | null
}

/** Uma PESSOA, juntando tudo o que as planilhas têm sobre ela (leads e eventos da Hotmart). */
export interface RegistroAgrupado extends Registro {
  /** Em quais abas esta pessoa aparece (cada aba só uma vez), da mais recente para a mais antiga. */
  aparece: { planilha: string; aba: string }[]
  /** Linha do tempo: todas as passagens, da mais recente para a mais antiga. */
  historico: Passagem[]
  /** Momento da primeira e da última passagem (ISO) — vazio se nenhuma tem data válida. */
  primeiraEm: string
  ultimaEm: string
  /** Melhor situação comercial já vista: comprou > gerou Pix/boleto > abandonou o carrinho > nada disso. */
  status: 'comprou' | 'pagamento_gerado' | 'abandonou' | 'cancelou' | 'reembolsou' | 'lead'
}

const NO_CAMPAIGN = 'Sem campanha'

/** As abas de eventos têm nomes fixos; este mapa evita depender de um campo que cópias antigas não trazem. */
const CATEGORIA_POR_ABA: Record<string, CategoriaEvento> = {
  'Vendas aprovadas': 'venda',
  'Boleto e Pix gerados': 'pix_boleto',
  'Carrinho abandonado': 'abandono',
  'Cancelamentos e atrasos': 'cancelamento',
  'Reembolsos e chargebacks': 'reembolso',
}

export function categoriaDe(record: Pick<Registro, 'aba' | 'tipo'>): CategoriaEvento | null {
  return record.tipo === 'evento' ? (CATEGORIA_POR_ABA[record.aba] ?? null) : null
}

function time(record: Registro): number {
  const value = record.data ? new Date(record.data).getTime() : NaN
  return Number.isFinite(value) ? value : 0
}

function chavesDe(record: Registro): string[] {
  const chaves: string[] = []
  const email = record.email.trim().toLowerCase()
  if (email) chaves.push(`e:${email}`)
  const digitos = record.telefone.replace(/\D/g, '')
  // Últimos 10 dígitos: iguala "5563992125838", "63992125838" e "(63) 99212-5838".
  if (digitos.length >= 10) chaves.push(`p:${digitos.slice(-10)}`)
  if (!chaves.length) {
    const nome = record.nome.trim().toLowerCase()
    if (nome) chaves.push(`n:${nome}`)
  }
  return chaves
}

/** Junta linhas que dividem e-mail OU telefone (União-Busca): quem aparece com e-mail numa aba e só com telefone em outra vira uma pessoa. */
function juntarPessoas(records: Registro[]): Registro[][] {
  const pai = new Map<string, string>()
  const achar = (x: string): string => {
    let raiz = x
    while (pai.get(raiz) !== raiz) raiz = pai.get(raiz) as string
    let atual = x
    while (pai.get(atual) !== raiz) {
      const proximo = pai.get(atual) as string
      pai.set(atual, raiz)
      atual = proximo
    }
    return raiz
  }
  const unir = (a: string, b: string) => {
    const ra = achar(a)
    const rb = achar(b)
    if (ra !== rb) pai.set(ra, rb)
  }

  const chavesPorLinha = records.map(chavesDe)
  for (const chaves of chavesPorLinha) {
    for (const chave of chaves) if (!pai.has(chave)) pai.set(chave, chave)
    for (let i = 1; i < chaves.length; i += 1) unir(chaves[0], chaves[i])
  }

  const grupos = new Map<string, Registro[]>()
  const semChave: Registro[][] = []
  records.forEach((record, indice) => {
    const chaves = chavesPorLinha[indice]
    if (!chaves.length) {
      semChave.push([record])
      return
    }
    const raiz = achar(chaves[0])
    grupos.set(raiz, [...(grupos.get(raiz) ?? []), record])
  })
  return [...grupos.values(), ...semChave]
}

const SEM_RASTREIO = /sem rastre/i

/** Qual linha diz "de onde esta pessoa veio": o primeiro lead com campanha > lead com origem conhecida > qualquer lead > eventos. */
function pontuacaoDeOrigem(record: Registro): number {
  const lead = record.tipo !== 'evento'
  const campanha = Boolean(record.campanha)
  const origem = Boolean(record.canal) && !SEM_RASTREIO.test(record.canal)
  return (lead ? 8 : 0) + (campanha ? 4 : 0) + (origem ? 2 : 0)
}

const PESO_STATUS: Record<RegistroAgrupado['status'], number> = { comprou: 5, pagamento_gerado: 4, abandonou: 3, cancelou: 2, reembolsou: 1, lead: 0 }
const STATUS_POR_CATEGORIA: Record<CategoriaEvento, RegistroAgrupado['status']> = {
  venda: 'comprou',
  pix_boleto: 'pagamento_gerado',
  abandono: 'abandonou',
  cancelamento: 'cancelou',
  reembolso: 'reembolsou',
}

/**
 * Uma linha por PESSOA, não por linha de planilha: quem está em "Leads repetidos", "Boleto e Pix gerados" e
 * "Vendas aprovadas" vira um registro só, com a linha do tempo de tudo o que aconteceu. Evita inflar os números.
 */
export function agruparRegistros(records: Registro[]): RegistroAgrupado[] {
  return juntarPessoas(records).map((linhas) => {
    const historico: Passagem[] = [...linhas]
      .sort((a, b) => time(b) - time(a))
      .map((linha) => ({ ...linha, categoria: categoriaDe(linha) }))

    const origem = [...historico].sort((a, b) => pontuacaoDeOrigem(b) - pontuacaoDeOrigem(a) || time(a) - time(b))[0]
    const recente = historico[0]
    const pick = (campo: 'nome' | 'email' | 'telefone' | 'criativo') => recente[campo] || historico.find((item) => item[campo])?.[campo] || ''
    // O nome mais completo (a Hotmart traz o nome inteiro; o formulário às vezes só o primeiro).
    const nomeCompleto = historico.reduce((melhor, item) => (item.nome.trim().length > melhor.length ? item.nome.trim() : melhor), '')

    let status: RegistroAgrupado['status'] = 'lead'
    let melhorEvento: Passagem | undefined
    for (const passagem of historico) {
      if (!passagem.categoria) continue
      const candidato = STATUS_POR_CATEGORIA[passagem.categoria]
      if (PESO_STATUS[candidato] > PESO_STATUS[status]) {
        status = candidato
        melhorEvento = passagem
      } else if (candidato === status && !melhorEvento) {
        melhorEvento = passagem
      }
    }

    const vistas = new Set<string>()
    const aparece: RegistroAgrupado['aparece'] = []
    for (const passagem of historico) {
      const chave = `${passagem.planilha}||${passagem.aba}`
      if (vistas.has(chave)) continue
      vistas.add(chave)
      aparece.push({ planilha: passagem.planilha, aba: passagem.aba })
    }

    const datas = historico.map(time).filter(Boolean)
    const iso = (ms: number) => (ms ? new Date(ms).toISOString() : '')

    return {
      ...origem,
      nome: nomeCompleto || pick('nome'),
      email: pick('email'),
      telefone: pick('telefone'),
      criativo: pick('criativo') || origem.criativo,
      // Onde e quando apareceu por último; a origem (canal/campanha) continua a do primeiro contato.
      planilha: recente.planilha,
      aba: recente.aba,
      data: recente.data,
      tipo: melhorEvento ? 'evento' : origem.tipo,
      evento: melhorEvento?.evento,
      situacao: melhorEvento?.situacao,
      produto: melhorEvento?.produto,
      valor: melhorEvento?.valor,
      pagamento: melhorEvento?.pagamento,
      aparece,
      historico,
      primeiraEm: iso(datas.length ? Math.min(...datas) : 0),
      ultimaEm: iso(datas.length ? Math.max(...datas) : 0),
      status,
    }
  })
}

export function campanhaDe(record: Pick<Registro, 'campanha'>): string {
  return record.campanha || NO_CAMPAIGN
}

export function apareceTexto(record: RegistroAgrupado): string {
  return record.aparece.map((item) => `${item.aba} (${item.planilha})`).join(' · ')
}

export const STATUS_ROTULO: Record<RegistroAgrupado['status'], string> = {
  comprou: 'Comprou',
  pagamento_gerado: 'Gerou Pix/boleto',
  abandonou: 'Abandonou o carrinho',
  cancelou: 'Cancelou/atrasou',
  reembolsou: 'Reembolsou',
  lead: 'Só lead',
}
