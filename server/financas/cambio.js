// Cotação de moedas em reais (AwesomeAPI, gratuita e sem chave): ao vivo para a tela e diária para converter vendas da Hotmart.
const BASE = 'https://economia.awesomeapi.com.br/json'
const VIDA_DO_CACHE = 60_000

let cache = { chave: '', em: 0, dados: null }

/** Cotação atual de cada moeda em reais, com a variação do dia. Ex.: { USD: { valor: 5.43, variacao: 0.21, em: '...' } } */
export async function cotacoesAoVivo(moedas = ['USD', 'EUR'], buscar = fetch) {
  const lista = [...new Set(moedas.map((m) => String(m).toUpperCase()).filter((m) => m && m !== 'BRL'))]
  if (!lista.length) return {}
  const chave = lista.join(',')
  if (cache.chave === chave && Date.now() - cache.em < VIDA_DO_CACHE) return cache.dados
  const resposta = await buscar(`${BASE}/last/${lista.map((m) => `${m}-BRL`).join(',')}`, { signal: AbortSignal.timeout(10_000) })
  if (!resposta.ok) throw new Error(`Cotação indisponível (${resposta.status}).`)
  const corpo = await resposta.json()
  const dados = {}
  for (const moeda of lista) {
    const linha = corpo?.[`${moeda}BRL`]
    const valor = Number(linha?.bid)
    if (Number.isFinite(valor) && valor > 0) dados[moeda] = { valor, variacao: Number(linha.pctChange) || 0, em: linha.create_date ?? null }
  }
  cache = { chave, em: Date.now(), dados }
  return dados
}

const dataSP = (segundos) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(segundos * 1000))

/** Cotação de fechamento de cada dia desde `desde` (Date): Map 'AAAA-MM-DD' -> valor em reais. */
export async function cotacoesDiarias(moeda, desde, buscar = fetch) {
  const inicio = desde.toISOString().slice(0, 10).replaceAll('-', '')
  const fim = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const resposta = await buscar(`${BASE}/daily/${moeda}-BRL/400?start_date=${inicio}&end_date=${fim}`, { signal: AbortSignal.timeout(15_000) })
  if (!resposta.ok) throw new Error(`Cotação histórica indisponível (${resposta.status}).`)
  const corpo = await resposta.json()
  const mapa = new Map()
  for (const linha of Array.isArray(corpo) ? corpo : []) {
    const valor = Number(linha.bid)
    if (Number.isFinite(valor) && valor > 0) mapa.set(dataSP(Number(linha.timestamp)), valor)
  }
  return mapa
}

/** Cotação do dia; se o dia não tiver (fim de semana), usa o dia anterior mais próximo. */
export function cotacaoDoDia(mapa, dia) {
  if (!mapa?.size) return null
  if (mapa.has(dia)) return mapa.get(dia)
  const dias = [...mapa.keys()].sort()
  const anteriores = dias.filter((d) => d <= dia)
  return mapa.get(anteriores.length ? anteriores[anteriores.length - 1] : dias[0])
}
