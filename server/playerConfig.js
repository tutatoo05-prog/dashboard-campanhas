import { query } from './db.js'
import { comCache, limparCache } from './cacheCurto.js'

// Configuração do player da VSL (pages/player do projeto "produtos"). O player pergunta aqui, ao carregar, como se
// comportar; se o dash não responder em ~1,5 s ele usa o padrão embutido, então a venda nunca depende do dash.
// Tabela: video_config (db/schema.sql). Sem a tabela, tudo segue com o PADRAO e o painel avisa para rodar o SQL.

/**
 * Padrão da `vsl` (VSL antiga, horizontal). Mantenha igual ao VSL_PADRAO de shared/data/vsl.js do projeto produtos.
 * Os arquivos de cada vídeo vêm de `VSLS` no mesmo shared/data/vsl.js: ao criar um id novo lá, acrescente-o em
 * PADROES_POR_VIDEO abaixo com os mesmos arquivos.
 */
export const PADRAO = {
  arquivos: { hd: 'vsl-v1-720.mp4', leve: 'vsl-v1-480.mp4' },
  permitirAvancar: true,
  textoToque: 'Toque para assistir',
  aparencia: { corDestaque: '#ff8a1f', corBotao: '#ff8a1f', corTextoBotao: '#15110d', formaBotao: 'suave' },
  controles: { tempo: true, volume: true },
  protegerVideo: true,
  lembrarPosicao: true,
  barraFalsa: { ativo: false, inicioSegundos: 3, inicioVelocidade: 4, trechoSegundos: 20, rapido: 1.6, lento: 0.6 },
  cta: { ativo: false, segundo: 0, duracao: 0, repetir: 0, texto: 'Quero começar agora', posicao: 'centro', vertical: 'baixo', tamanho: 'm', animacao: 'nenhuma' },
  fim: { ativo: false, titulo: '', texto: 'Quero começar agora' },
}

/** O que muda por vídeo em relação ao PADRAO. Ids sem entrada (inclusive `vsl`) usam o PADRAO como está. */
const PADROES_POR_VIDEO = {
  'vsl-vertical': { arquivos: { hd: 'vsl-v2-720.mp4', leve: 'vsl-v2-480.mp4' } },
}

/** Configuração padrão do vídeo: o PADRAO com os arquivos dele, quando forem diferentes. */
export function padraoDe(video) {
  return { ...PADRAO, ...(PADROES_POR_VIDEO[video] ?? {}) }
}

const FORMAS =['suave', 'reto', 'pilula']
const POSICOES = ['centro', 'esquerda', 'direita']
const VERTICAIS = ['baixo', 'topo']
const TAMANHOS = ['p', 'm', 'g']
const ANIMACOES = ['nenhuma', 'pulsar', 'brilho']

const VIDEO_VALIDO = /^[\w-]{1,40}$/
const CACHE_MS = 30_000
const MAX_SEGUNDO = 7200
const VELOCIDADE_MIN = 0.1
const VELOCIDADE_MAX = 30

export class ConfigInvalida extends Error {}

function textoCurto(valor, campo, max, { obrigatorio = false } = {}) {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  if (obrigatorio && !texto) throw new ConfigInvalida(`Preencha: ${campo}.`)
  if (texto.length > max) throw new ConfigInvalida(`${campo}: no máximo ${max} caracteres.`)
  return texto
}

/** Cor no formato #rrggbb (nada de nomes nem funções CSS: o valor vai direto para o estilo do player). */
function corHex(valor, campo, padrao) {
  if (valor === undefined || valor === null || valor === '') return padrao
  const cor = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  if (!/^#[0-9a-f]{6}$/.test(cor)) throw new ConfigInvalida(`${campo}: use uma cor no formato #rrggbb.`)
  return cor
}

function opcao(valor, validas, padrao) {
  return validas.includes(valor) ? valor : padrao
}

function arquivoMp4(valor, campo) {
  const nome = typeof valor === 'string' ? valor.trim() : ''
  // Só nome de arquivo da nossa pasta de vídeos (sem pasta nem endereço): o player monta o caminho sozinho.
  if (!/^[\w.-]+\.mp4$/i.test(nome)) throw new ConfigInvalida(`${campo}: use só o nome de um arquivo .mp4 (ex.: vsl-v2-720.mp4).`)
  return nome
}

/** Número dentro de [min, max]; vazio cai no padrão, fora da faixa avisa a tela. */
function numeroEntre(valor, campo, min, max, padrao) {
  if (valor === undefined || valor === null || valor === '') return padrao
  const n = Number(valor)
  if (!Number.isFinite(n) || n < min || n > max) throw new ConfigInvalida(`${campo}: use um número entre ${min} e ${max}.`)
  return Math.round(n * 100) / 100
}

/** Barra de progresso "ritmada": anda mais rápido ou mais devagar que o vídeo (só o desenho da barra, o vídeo não muda). */
function sanitizarBarraFalsa(entrada) {
  const b = entrada && typeof entrada === 'object' ? entrada : {}
  const p = PADRAO.barraFalsa
  return {
    ativo: b.ativo === true,
    inicioSegundos: numeroEntre(b.inicioSegundos, 'Segundos iniciais da barra', 0, 120, p.inicioSegundos),
    inicioVelocidade: numeroEntre(b.inicioVelocidade, 'Velocidade do início', VELOCIDADE_MIN, VELOCIDADE_MAX, p.inicioVelocidade),
    trechoSegundos: numeroEntre(b.trechoSegundos, 'Duração de cada trecho', 0, 600, p.trechoSegundos),
    rapido: numeroEntre(b.rapido, 'Velocidade dos trechos rápidos', VELOCIDADE_MIN, VELOCIDADE_MAX, p.rapido),
    lento: numeroEntre(b.lento, 'Velocidade dos trechos lentos', VELOCIDADE_MIN, VELOCIDADE_MAX, p.lento),
  }
}

/** Valida o que veio do painel e devolve a configuração limpa. Lança ConfigInvalida com mensagem para a tela. */
export function sanitizarConfig(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {}
  const segundo = Number(e.cta?.segundo ?? 0)
  if (!Number.isFinite(segundo) || segundo < 0 || segundo > MAX_SEGUNDO) {
    throw new ConfigInvalida(`Segundo do botão: use um número entre 0 e ${MAX_SEGUNDO}.`)
  }
  const a = PADRAO.aparencia
  return {
    arquivos: { hd: arquivoMp4(e.arquivos?.hd, 'Arquivo HD'), leve: arquivoMp4(e.arquivos?.leve, 'Arquivo leve') },
    permitirAvancar: e.permitirAvancar !== false,
    textoToque: textoCurto(e.textoToque, 'Texto de "toque para assistir"', 40) || PADRAO.textoToque,
    aparencia: {
      corDestaque: corHex(e.aparencia?.corDestaque, 'Cor de destaque', a.corDestaque),
      corBotao: corHex(e.aparencia?.corBotao, 'Cor do botão', a.corBotao),
      corTextoBotao: corHex(e.aparencia?.corTextoBotao, 'Cor do texto do botão', a.corTextoBotao),
      formaBotao: opcao(e.aparencia?.formaBotao, FORMAS, a.formaBotao),
    },
    controles: { tempo: e.controles?.tempo !== false, volume: e.controles?.volume !== false },
    protegerVideo: e.protegerVideo !== false,
    lembrarPosicao: e.lembrarPosicao !== false,
    barraFalsa: sanitizarBarraFalsa(e.barraFalsa),
    cta: {
      ativo: e.cta?.ativo === true,
      segundo: Math.round(segundo),
      duracao: Math.round(numeroEntre(e.cta?.duracao, 'Tempo na tela do botão', 0, MAX_SEGUNDO, 0)),
      repetir: Math.round(numeroEntre(e.cta?.repetir, 'Repetir o botão a cada', 0, MAX_SEGUNDO, 0)),
      texto: textoCurto(e.cta?.texto, 'Texto do botão', 60, { obrigatorio: true }),
      posicao: opcao(e.cta?.posicao, POSICOES, PADRAO.cta.posicao),
      vertical: opcao(e.cta?.vertical, VERTICAIS, PADRAO.cta.vertical),
      tamanho: opcao(e.cta?.tamanho, TAMANHOS, PADRAO.cta.tamanho),
      animacao: opcao(e.cta?.animacao, ANIMACOES, PADRAO.cta.animacao),
    },
    fim: {
      ativo: e.fim?.ativo === true,
      titulo: textoCurto(e.fim?.titulo, 'Mensagem do fim', 120),
      texto: textoCurto(e.fim?.texto, 'Texto do botão do fim', 60, { obrigatorio: true }),
    },
  }
}

export function videoValido(video) {
  return VIDEO_VALIDO.test(video ?? '')
}

/** Lê a configuração salva. Sem linha ou sem tabela: o padrão (e `precisaMigracao` quando falta a tabela). */
export async function lerConfig(env, video) {
  try {
    const { rows } = await query(env, 'select config, atualizado_em, atualizado_por from video_config where video = $1', [video])
    if (!rows[0]) return { config: padraoDe(video), salvo: false, precisaMigracao: false }
    // passa de novo pelo validador: um registro antigo ou mexido à mão nunca chega torto ao player
    let config = padraoDe(video)
    try {
      config = sanitizarConfig(rows[0].config)
    } catch (erro) {
      console.error('[player] configuração salva é inválida, usando o padrão:', erro.message)
    }
    return { config, salvo: true, precisaMigracao: false, atualizadoEm: new Date(rows[0].atualizado_em).toISOString(), atualizadoPor: rows[0].atualizado_por ?? null }
  } catch (erro) {
    if (erro?.code === '42P01') return { config: padraoDe(video), salvo: false, precisaMigracao: true }
    throw erro
  }
}

export async function gravarConfig(env, video, config, usuario) {
  await query(
    env,
    `insert into video_config (video, config, atualizado_em, atualizado_por)
     values ($1, $2::jsonb, now(), $3)
     on conflict (video) do update set config = excluded.config, atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
    [video, JSON.stringify(config), usuario ?? null],
  )
  limparCache('player|')
}

function sendJson(res, status, payload, extras = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  for (const [nome, valor] of Object.entries(extras)) res.setHeader(nome, valor)
  res.end(JSON.stringify(payload))
}

/**
 * GET /api/player-config?v=vsl — PÚBLICO (o player roda em tuzinho.academy/tuzinho.app, sem login).
 * Só devolve as opções de exibição, nada sensível. Cache de 30 s no servidor protege o banco em pico de visitas.
 */
export async function handlePlayerConfigRequest(req, res, env) {
  // O player está em outro endereço: libera a leitura de qualquer origem (a resposta é pública de propósito).
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    for (const [nome, valor] of Object.entries(cors)) res.setHeader(nome, valor)
    return res.end()
  }
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname !== '/api/player-config') return sendJson(res, 404, { error: 'Rota não encontrada.' }, cors)
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido.' }, cors)

  const video = url.searchParams.get('v') ?? 'vsl'
  if (!videoValido(video)) return sendJson(res, 400, { error: 'Vídeo inválido.' }, cors)

  try {
    const { config } = await comCache(`player|${video}`, CACHE_MS, () => lerConfig(env, video))
    // Sem cache no navegador: quem salva no painel precisa ver a mudança no próximo carregamento (com max-age o
    // navegador reaproveitava o padrão antigo e a prévia "não obedecia"). O banco já é protegido pelo cache de 30 s acima.
    return sendJson(res, 200, config, { ...cors, 'Cache-Control': 'no-cache' })
  } catch (erro) {
    console.error('[player] falha ao ler a configuração:', erro.message || erro)
    // o player tem padrão embutido: um erro aqui só faz ele seguir com o padrão
    return sendJson(res, 502, { error: 'Configuração indisponível.' }, cors)
  }
}
