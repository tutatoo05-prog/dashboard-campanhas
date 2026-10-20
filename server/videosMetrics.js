// Métricas dos vídeos (VSL) a partir dos eventos do site, gravados pelo n8n na planilha "tracking essentials".
//
// Medimos por VISITANTE (visitor_id; sem ele, a sessão), nunca por evento: um mesmo vídeo dispara vários "play"
// (pausa e retoma), e isso inflaria a taxa de play. Em 20/10/2026 uma única sessão gerou 814 plays do mesmo depoimento.
// Só entra quem aceitou os cookies, então os números mostram a tendência, não o total de visitantes do site.

export const ETAPAS = [
  { chave: 'play', rotulo: 'Deram play', pct: 0 },
  { chave: 'p25', rotulo: 'Chegaram a 25%', pct: 25 },
  { chave: 'p50', rotulo: 'Chegaram a 50%', pct: 50 },
  { chave: 'p75', rotulo: 'Chegaram a 75%', pct: 75 },
  { chave: 'p95', rotulo: 'Chegaram a 95%', pct: 95 },
  { chave: 'fim', rotulo: 'Viram até o fim', pct: 100 },
]

const DIA_MS = 86_400_000

const texto = (valor) => String(valor ?? '').trim()

function numero(valor) {
  const n = Number(String(valor ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** "2026-10-20 13:05:08" (Brasília) -> "2026-10-20". Vazio se a data não vier no formato esperado. */
export function chaveDia(dataHora) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(texto(dataHora))
  return m ? m[1] : ''
}

export function somarDias(dia, quantidade) {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + quantidade * DIA_MS).toISOString().slice(0, 10)
}

/** Dia de hoje em Brasília, como "AAAA-MM-DD". */
export function hojeEmBrasilia(agora = new Date()) {
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Qual página de venda gerou o evento (a Live e a Membros são variantes da mesma página). */
export function rotuloPagina(linha) {
  const variante = texto(linha.variante).toLowerCase()
  const pagina = texto(linha.pagina).toLowerCase()
  if (variante.includes('live') || pagina.includes('/live')) return 'Live'
  if (variante.includes('membros') || pagina.includes('/membros')) return 'Membros'
  return 'Essentials'
}

function rotuloAparelho(linha) {
  const valor = texto(linha.dispositivo).toLowerCase()
  if (valor === 'mobile' || valor === 'desktop' || valor === 'tablet') return valor
  return 'outro'
}

function chaveVisitante(linha) {
  return texto(linha.visitor_id) || texto(linha.sessao_id)
}

const percentual = (parte, total) => (total > 0 ? (parte / total) * 100 : 0)

/**
 * @param {Array<Record<string, string>>} linhas eventos já com as colunas normalizadas (evento, data_hora, video...)
 * @param {{ video?: string, dias?: number, hoje?: string, compradores?: Set<string> }} opcoes
 *   dias = 0 significa "todo o período".
 */
export function calcularMetricasVideo(linhas, { video = 'vsl', dias = 30, hoje = hojeEmBrasilia(), compradores = new Set() } = {}) {
  const corte = dias > 0 ? somarDias(hoje, -(dias - 1)) : ''
  const noPeriodo = (linha) => {
    const dia = chaveDia(linha.data_hora)
    return Boolean(dia) && dia <= hoje && (!corte || dia >= corte)
  }

  const visitasPorPagina = new Map() // rotulo -> Set de visitantes
  const eventosVideo = []
  for (const linha of linhas) {
    if (!noPeriodo(linha)) continue
    const evento = texto(linha.evento)
    if (evento === 'visita') {
      const chave = chaveVisitante(linha)
      if (!chave) continue
      const rotulo = rotuloPagina(linha)
      if (!visitasPorPagina.has(rotulo)) visitasPorPagina.set(rotulo, new Set())
      visitasPorPagina.get(rotulo).add(chave)
    } else if (evento.startsWith('video_')) {
      eventosVideo.push(linha)
    }
  }

  // Quais vídeos têm dados no período (a tela deixa escolher; hoje só a VSL é medida de verdade).
  const espectadoresPorVideo = new Map()
  for (const linha of eventosVideo) {
    const nome = texto(linha.video) || 'video'
    const chave = chaveVisitante(linha)
    if (!chave) continue
    if (!espectadoresPorVideo.has(nome)) espectadoresPorVideo.set(nome, new Set())
    espectadoresPorVideo.get(nome).add(chave)
  }
  const videosDisponiveis = [...espectadoresPorVideo.entries()]
    .map(([nome, set]) => ({ nome, espectadores: set.size }))
    .sort((a, b) => b.espectadores - a.espectadores)

  // Um registro por visitante que mexeu neste vídeo.
  const espectadores = new Map()
  let eventosDePlay = 0
  for (const linha of eventosVideo) {
    if ((texto(linha.video) || 'video') !== video) continue
    const chave = chaveVisitante(linha)
    if (!chave) continue
    let pessoa = espectadores.get(chave)
    if (!pessoa) {
      pessoa = { rotulo: rotuloPagina(linha), aparelho: rotuloAparelho(linha), primeiroDia: chaveDia(linha.data_hora), maxPct: 0, fim: false, maxSegundos: 0, email: '' }
      espectadores.set(chave, pessoa)
    }
    const dia = chaveDia(linha.data_hora)
    if (dia && dia < pessoa.primeiroDia) pessoa.primeiroDia = dia
    const email = texto(linha.email).toLowerCase()
    if (email && !pessoa.email) pessoa.email = email

    const evento = texto(linha.evento)
    if (evento === 'video_play') eventosDePlay += 1
    if (evento === 'video_fim') pessoa.fim = true
    const pct = numero(linha.video_pct)
    if (pct !== null && pct > pessoa.maxPct) pessoa.maxPct = pct
    const segundos = numero(linha.video_segundos)
    if (segundos !== null && segundos > pessoa.maxSegundos) pessoa.maxSegundos = segundos
  }

  const lista = [...espectadores.values()]
  const total = lista.length
  const chegouA = (pessoa, etapa) => (etapa.chave === 'play' ? true : etapa.chave === 'fim' ? pessoa.fim : pessoa.maxPct >= etapa.pct || pessoa.fim)
  const assistiu75 = (pessoa) => pessoa.fim || pessoa.maxPct >= 75

  const funil = ETAPAS.map((etapa) => {
    const pessoas = lista.filter((pessoa) => chegouA(pessoa, etapa)).length
    return { chave: etapa.chave, rotulo: etapa.rotulo, pessoas, pct: percentual(pessoas, total) }
  })

  // Taxa de play: quem deu play ÷ quem abriu a página (só visitantes que aceitaram os cookies).
  const visitantesTotal = new Set()
  for (const set of visitasPorPagina.values()) for (const chave of set) visitantesTotal.add(chave)

  const porPagina = ['Essentials', 'Membros', 'Live'].map((rotulo) => {
    const daPagina = lista.filter((pessoa) => pessoa.rotulo === rotulo)
    const visitantes = visitasPorPagina.get(rotulo)?.size ?? 0
    return {
      rotulo,
      visitantes,
      espectadores: daPagina.length,
      taxaPlay: percentual(daPagina.length, visitantes),
      assistiram75: daPagina.filter(assistiu75).length,
    }
  }).filter((linha) => linha.visitantes > 0 || linha.espectadores > 0)

  const aparelhos = new Map()
  for (const pessoa of lista) {
    const atual = aparelhos.get(pessoa.aparelho) ?? { aparelho: pessoa.aparelho, espectadores: 0, assistiram75: 0 }
    atual.espectadores += 1
    if (assistiu75(pessoa)) atual.assistiram75 += 1
    aparelhos.set(pessoa.aparelho, atual)
  }
  const porAparelho = [...aparelhos.values()].sort((a, b) => b.espectadores - a.espectadores)

  // Série por dia, sem buracos entre o primeiro dia com dados (ou o corte) e hoje.
  const porDiaMapa = new Map()
  for (const pessoa of lista) {
    if (!pessoa.primeiroDia) continue
    const atual = porDiaMapa.get(pessoa.primeiroDia) ?? { dia: pessoa.primeiroDia, espectadores: 0, assistiram75: 0 }
    atual.espectadores += 1
    if (assistiu75(pessoa)) atual.assistiram75 += 1
    porDiaMapa.set(pessoa.primeiroDia, atual)
  }
  const primeiro = corte || [...porDiaMapa.keys()].sort()[0]
  const porDia = []
  if (primeiro) {
    for (let dia = primeiro; dia <= hoje; dia = somarDias(dia, 1)) {
      porDia.push(porDiaMapa.get(dia) ?? { dia, espectadores: 0, assistiram75: 0 })
    }
  }

  const comTempo = lista.filter((pessoa) => pessoa.maxSegundos > 0)
  const mediaSegundos = comTempo.length ? comTempo.reduce((soma, pessoa) => soma + pessoa.maxSegundos, 0) / comTempo.length : null

  // Quem assistiu mais comprou mais? Só dá para saber de quem já se identificou (preencheu o formulário).
  const identificados = lista.filter((pessoa) => pessoa.email)
  const grupo = (filtro) => {
    const pessoas = identificados.filter(filtro)
    return { pessoas: pessoas.length, compraram: pessoas.filter((pessoa) => compradores.has(pessoa.email)).length }
  }

  return {
    video,
    dias,
    de: corte || porDia[0]?.dia || '',
    ate: hoje,
    videosDisponiveis,
    resumo: {
      espectadores: total,
      eventosDePlay,
      visitantes: visitantesTotal.size,
      taxaPlay: percentual(total, visitantesTotal.size),
      assistiram75: lista.filter(assistiu75).length,
      viramAteOFim: lista.filter((pessoa) => pessoa.fim).length,
      mediaSegundos,
      pessoasComTempo: comTempo.length,
    },
    funil,
    porDia,
    porPagina,
    porAparelho,
    conversao: {
      identificados: identificados.length,
      assistiram75: grupo(assistiu75),
      outros: grupo((pessoa) => !assistiu75(pessoa)),
    },
  }
}
