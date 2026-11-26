import { query } from './db.js'
import { comCache, limparCache } from './cacheCurto.js'
import { VIDEOS_CONHECIDOS } from './playerConfig.js'
import { readRequestBody } from './readBody.js'
import { getClientIp } from './security.js'
import { origensPermitidas } from './capturaHandler.js'

// Retenção segundo a segundo da VSL. O player (projeto produtos) manda em lote os segundos assistidos; aqui guardamos
// UMA linha por sessão e segundo (tabela video_retencao, db/schema.sql) com `vezes` = quantas vezes aquele segundo foi
// visto. Assim a tabela cresce com "pessoas × duração", não com "eventos".

const MAX_SEGUNDO = 7200
const MAX_SEGUNDOS_POR_ENVIO = 30
// Começa por letra ou número: barra '__proto__' e afins.
const VERSAO_VALIDA = /^[A-Za-z0-9][\w.-]{0,19}$/
const SESSAO_VALIDA = /^[\w-]{8,64}$/
const CACHE_MS = 60_000
// Proteção do endpoint público (grava no banco sem login). Dois freios, porque só o da sessão é fácil de driblar
// (basta trocar o id a cada envio): um por IP e um por sessão.
//  - por sessão: um envio a cada 5 s por 23 min são ~280 por hora; 600 dá folga para quem volta e reassiste.
//  - por IP: 600 por minuto aguenta ~50 pessoas vendo ao mesmo tempo atrás do mesmo IP (operadora, escritório).
const MAX_ENVIOS_POR_SESSAO_HORA = 600
const MAX_ENVIOS_POR_IP_MINUTO = 600

export class TrackInvalido extends Error {}

/** Valida o corpo do envio do player. Lança TrackInvalido; devolve o lote já contado por segundo. */
export function sanitizarTrack(corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {}
  const video = typeof c.video === 'string' ? c.video.trim() : ''
  if (!VIDEOS_CONHECIDOS.includes(video)) throw new TrackInvalido('Vídeo desconhecido.')
  const versao = typeof c.versao === 'string' && c.versao.trim() ? c.versao.trim() : 'v1'
  if (!VERSAO_VALIDA.test(versao)) throw new TrackInvalido('Versão inválida.')
  const sessao = typeof c.sessao === 'string' ? c.sessao.trim() : ''
  if (!SESSAO_VALIDA.test(sessao)) throw new TrackInvalido('Sessão inválida.')
  if (!Array.isArray(c.segundos) || !c.segundos.length) throw new TrackInvalido('Sem segundos.')
  if (c.segundos.length > MAX_SEGUNDOS_POR_ENVIO) throw new TrackInvalido('Segundos demais num envio só.')

  const contagem = new Map()
  for (const bruto of c.segundos) {
    // só número inteiro de verdade: nada de null, "", true ou "7" (o Number() os transformaria em segundos válidos)
    if (typeof bruto !== 'number' || !Number.isInteger(bruto) || bruto < 0 || bruto > MAX_SEGUNDO) throw new TrackInvalido('Segundo inválido.')
    const s = bruto
    contagem.set(s, (contagem.get(s) ?? 0) + 1)
  }
  return { video, versao, sessao, segundos: [...contagem.keys()], vezes: [...contagem.values()] }
}

export async function gravarSegundos(env, { video, versao, sessao, segundos, vezes }) {
  await query(
    env,
    `insert into video_retencao (video, versao, sessao, segundo, vezes)
     select $1, $2, $3, t.s, t.v from unnest($4::int[], $5::int[]) as t(s, v)
     on conflict (video, versao, sessao, segundo)
     do update set vezes = video_retencao.vezes + excluded.vezes, atualizado_em = now()`,
    [video, versao, sessao, segundos, vezes],
  )
  limparCache('retencao|')
}

const janelas = { sessao: new Map(), ip: new Map() } // chave -> { n, desde }
function dentroDoLimite(tipo, chave, maximo, duracaoMs, agora = Date.now()) {
  const mapa = janelas[tipo]
  const atual = mapa.get(chave)
  if (!atual || agora - atual.desde > duracaoMs) {
    mapa.set(chave, { n: 1, desde: agora })
    if (mapa.size > 5000) for (const [k, v] of mapa) if (agora - v.desde > duracaoMs) mapa.delete(k)
    return true
  }
  atual.n += 1
  return atual.n <= maximo
}

/** Zera os contadores (só os testes usam). */
export function zerarLimites() {
  janelas.sessao.clear()
  janelas.ip.clear()
}

/** Versões que o painel cadastrou para o vídeo (+ 'v1', o padrão). O player só grava em versão cadastrada. */
async function lerVersoesRegistradas(env, video) {
  return comCache(`retencao|versoes|${video}`, 30_000, async () => {
    const { rows } = await query(env, 'select versao from video_versoes where video = $1', [video])
    return new Set(['v1', ...rows.map((r) => r.versao)])
  })
}

function enviar(res, status, payload, extras = {}) {
  res.statusCode = status
  for (const [nome, valor] of Object.entries(extras)) res.setHeader(nome, valor)
  if (payload === null) return res.end()
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

let avisouSemTabela = false

/**
 * POST /api/video-track — PÚBLICO (o player roda em tuzinho.academy/tuzinho.app, sem login), mas só aceita as origens
 * dos nossos sites, limita por IP e por sessão e só grava em versão cadastrada no painel. Corpo JSON
 * { video, versao, sessao, segundos: [12, 13, 14] }. Pode vir como text/plain (navigator.sendBeacon): lemos o texto
 * e fazemos JSON.parse de qualquer jeito, então não há pré-voo de CORS. Nunca derruba a página: erro de banco = 204.
 */
export async function handleVideoTrackRequest(req, res, env, { gravar = gravarSegundos, versoes = lerVersoesRegistradas } = {}) {
  // Mesma regra do /api/captura: só os sites da Tuzinho. O navegador sempre manda o Origin num POST entre sites,
  // então quem não vem de um deles (curl, robô) é recusado. Sem Origin (alguns navegadores em beacon do mesmo site) passa
  // pelos limites e pela validação como qualquer outro.
  const origem = req.headers?.origin
  const permitidas = origensPermitidas(env)
  const cors = {
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
  if (origem && permitidas.has(origem)) cors['Access-Control-Allow-Origin'] = origem

  if (req.method === 'OPTIONS') return enviar(res, 204, null, cors)
  if (req.method !== 'POST') return enviar(res, 405, { error: 'Método não permitido.' }, cors)
  if (origem && !permitidas.has(origem)) return enviar(res, 403, { error: 'Origem não permitida.' }, cors)
  if (!dentroDoLimite('ip', getClientIp(req), MAX_ENVIOS_POR_IP_MINUTO, 60_000)) return enviar(res, 429, { error: 'Muitos envios.' }, cors)

  let envio
  try {
    envio = sanitizarTrack(JSON.parse(await readRequestBody(req, 16 * 1024)))
  } catch (erro) {
    return enviar(res, 400, { error: erro instanceof TrackInvalido ? erro.message : 'Corpo inválido.' }, cors)
  }
  if (!dentroDoLimite('sessao', envio.sessao, MAX_ENVIOS_POR_SESSAO_HORA, 3_600_000)) return enviar(res, 429, { error: 'Muitos envios.' }, cors)

  try {
    // Versão que o painel não cadastrou é ignorada em silêncio (204): não ensinamos o robô o que funciona.
    if (!(await versoes(env, envio.video)).has(envio.versao)) return enviar(res, 204, null, cors)
    await gravar(env, envio)
  } catch (erro) {
    if (erro?.code === '42P01') {
      if (!avisouSemTabela) console.error('[video-track] falta criar as tabelas video_retencao/video_versoes (db/schema.sql).')
      avisouSemTabela = true
    } else {
      console.error('[video-track] falha ao gravar:', erro.message || erro)
    }
  }
  return enviar(res, 204, null, cors)
}

// ───────────────────────────────────────────────────────────────────────────────
// Leitura (admin)

/**
 * Linhas { segundo, espectadores, vezes } de uma versão -> curva.
 * Base 100% = pessoas que passaram pelos 3 primeiros segundos (o maior valor entre 0 e 2).
 * `unica` = pessoas naquele segundo ÷ base (cai quando alguém abandona); `retencao` = visualizações ÷ base
 * (passa de `unica` quando alguém volta o vídeo: é onde aparecem os picos de replay).
 */
export function calcularCurva(linhas) {
  const porSegundo = new Map(linhas.map((l) => [Number(l.segundo), { espectadores: Number(l.espectadores), vezes: Number(l.vezes) }]))
  let base = 0
  for (const s of [0, 1, 2]) base = Math.max(base, porSegundo.get(s)?.espectadores ?? 0)
  const duracao = porSegundo.size ? Math.max(...porSegundo.keys()) : 0
  const pontos = []
  if (base > 0) {
    for (let s = 0; s <= duracao; s += 1) {
      const p = porSegundo.get(s) ?? { espectadores: 0, vezes: 0 }
      pontos.push({ s, unica: round((p.espectadores / base) * 100), retencao: round((p.vezes / base) * 100) })
    }
  }
  return { base, duracao, pontos }
}

const round = (n) => Math.round(n * 100) / 100

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`

/** As janelas de `janela` segundos em que a curva única mais cai (onde perde mais gente), da pior para a menos pior. */
export function maioresQuedas(curva, { janela = 10, quantas = 3 } = {}) {
  const { pontos } = curva
  const quedas = []
  for (let i = 0; i + janela < pontos.length; i += janela) {
    quedas.push({ de: pontos[i].s, ate: pontos[i + janela].s, queda: round(pontos[i].unica - pontos[i + janela].unica) })
  }
  return quedas.filter((q) => q.queda > 0).sort((a, b) => b.queda - a.queda).slice(0, quantas)
}

/** Os segundos em que mais gente voltou o vídeo (visualizações acima das pessoas), do maior para o menor. */
export function maioresPicos(curva, quantos = 3) {
  return curva.pontos
    .map((p) => ({ s: p.s, extra: round(p.retencao - p.unica) }))
    .filter((p) => p.extra > 0)
    .sort((a, b) => b.extra - a.extra)
    .slice(0, quantos)
}

function retencaoEm(curva, fracao) {
  if (!curva.pontos.length) return null
  const s = Math.min(curva.duracao, Math.round(curva.duracao * fracao))
  return curva.pontos[s]?.unica ?? null
}

/** Texto em Markdown comparando duas versões, para colar numa IA e pedir o diagnóstico do remendo. */
export function montarDiff({ video, a, b }) {
  const parte = (v) => {
    const pct = (f) => (retencaoEm(v.curva, f) === null ? '—' : `${retencaoEm(v.curva, f).toFixed(1)}%`)
    const quedas = maioresQuedas(v.curva).map((q) => `${mmss(q.de)}–${mmss(q.ate)} (−${q.queda.toFixed(1)} p.p.)`).join('; ') || 'sem dados'
    const picos = maioresPicos(v.curva).map((p) => `${mmss(p.s)} (+${p.extra.toFixed(1)} p.p.)`).join('; ') || 'nenhum'
    return { pct, quedas, picos }
  }
  const pa = parte(a)
  const pb = parte(b)
  const linhas = [`# Comparação de retenção da VSL "${video}": ${a.versao} → ${b.versao}`, '']
  for (const [v, p] of [[a, pa], [b, pb]]) {
    linhas.push(`## ${v.versao}`, `- O que mudou: ${v.notas || '(sem anotação)'}`, `- Pessoas na base: ${v.curva.base} · duração medida: ${mmss(v.curva.duracao)}`, `- Maiores quedas (janelas de 10 s): ${p.quedas}`, `- Picos de replay: ${p.picos}`, '')
  }
  linhas.push('## Retenção (% da base ainda assistindo)', '', `| Trecho | ${a.versao} | ${b.versao} |`, '|---|---|---|')
  for (const f of [0.1, 0.25, 0.5, 0.75, 0.9, 1]) linhas.push(`| ${Math.round(f * 100)}% do vídeo | ${pa.pct(f)} | ${pb.pct(f)} |`)
  linhas.push('', 'Pergunta: considerando o que mudou, a alteração melhorou ou piorou a retenção? Em quais trechos, e o que ajustar a seguir?')
  return linhas.join('\n')
}

async function lerCurvas(env, video) {
  return comCache(`retencao|${video}`, CACHE_MS, async () => {
    const [{ rows: linhas }, { rows: notas }] = await Promise.all([
      query(env, 'select versao, segundo, count(*)::int as espectadores, sum(vezes)::int as vezes from video_retencao where video = $1 group by versao, segundo', [video]),
      query(env, 'select versao, notas, criado_em from video_versoes where video = $1', [video]),
    ])
    const porVersao = new Map()
    for (const l of linhas) {
      if (!porVersao.has(l.versao)) porVersao.set(l.versao, [])
      porVersao.get(l.versao).push(l)
    }
    const notasPorVersao = new Map(notas.map((n) => [n.versao, n]))
    const nomes = new Set([...porVersao.keys(), ...notasPorVersao.keys()])
    const versoes = [...nomes].map((versao) => ({
      versao,
      notas: notasPorVersao.get(versao)?.notas ?? '',
      criadoEm: notasPorVersao.get(versao)?.criado_em ? new Date(notasPorVersao.get(versao).criado_em).toISOString() : null,
      curva: calcularCurva(porVersao.get(versao) ?? []),
    }))
    versoes.sort((x, y) => x.versao.localeCompare(y.versao, 'pt-BR', { numeric: true }))
    return versoes
  })
}

/**
 * GET /api/videos/retencao?video=vsl — curvas de todas as versões do vídeo.
 * GET /api/videos/retencao/diff?video=vsl&a=v1&b=v1.1 — Markdown comparando duas versões.
 * PUT /api/videos/versoes { video, versao, notas } — anota o que mudou numa versão (só admin: trava no middleware).
 * Devolve `precisaMigracao: true` se as tabelas ainda não existem.
 */
export async function handleRetencaoRequest(req, res, env, user, url, { lerCorpo = readRequestBody } = {}) {
  const video = url.searchParams.get('video') ?? 'vsl'
  if (!VIDEOS_CONHECIDOS.includes(video)) return enviar(res, 400, { error: 'Vídeo inválido.' })

  try {
    if (url.pathname === '/api/videos/versoes' && req.method === 'PUT') {
      let corpo
      try {
        corpo = JSON.parse(await lerCorpo(req))
      } catch {
        return enviar(res, 400, { error: 'Corpo inválido.' })
      }
      const videoCorpo = corpo?.video ?? video
      const versao = typeof corpo?.versao === 'string' ? corpo.versao.trim() : ''
      const notas = typeof corpo?.notas === 'string' ? corpo.notas.trim() : ''
      if (!VIDEOS_CONHECIDOS.includes(videoCorpo)) return enviar(res, 400, { error: 'Vídeo inválido.' })
      if (!VERSAO_VALIDA.test(versao)) return enviar(res, 400, { error: 'Versão inválida (use letras, números, ponto e hífen).' })
      if (notas.length > 2000) return enviar(res, 400, { error: 'Anotação: no máximo 2000 caracteres.' })
      await query(
        env,
        `insert into video_versoes (video, versao, notas, atualizado_por) values ($1, $2, $3, $4)
         on conflict (video, versao) do update set notas = excluded.notas, atualizado_por = excluded.atualizado_por`,
        [videoCorpo, versao, notas, user?.email ?? null],
      )
      limparCache('retencao|')
      return enviar(res, 200, { success: true, versoes: await lerCurvas(env, videoCorpo), precisaMigracao: false })
    }

    if (req.method !== 'GET') return enviar(res, 405, { error: 'Método não permitido.' })
    const versoes = await lerCurvas(env, video)

    if (url.pathname === '/api/videos/retencao/diff') {
      const a = versoes.find((v) => v.versao === url.searchParams.get('a'))
      const b = versoes.find((v) => v.versao === url.searchParams.get('b'))
      if (!a || !b) return enviar(res, 404, { error: 'Escolha duas versões que tenham dados.' })
      return enviar(res, 200, { success: true, markdown: montarDiff({ video, a, b }) })
    }
    return enviar(res, 200, { success: true, video, versoes, precisaMigracao: false })
  } catch (erro) {
    if (erro?.code === '42P01') return enviar(res, 200, { success: true, video, versoes: [], precisaMigracao: true })
    console.error('Erro na retenção por segundo:', erro.message || erro)
    return enviar(res, 502, { error: 'Não consegui ler a retenção agora.' })
  }
}
