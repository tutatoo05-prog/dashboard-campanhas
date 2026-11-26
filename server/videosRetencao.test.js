import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { calcularCurva, handleVideoTrackRequest, maioresPicos, maioresQuedas, montarDiff, sanitizarTrack, TrackInvalido, zerarLimites } from './videosRetencao.js'

const ok = { video: 'vsl', versao: 'v1.1', sessao: 'abc12345-xyz', segundos: [10, 11, 11, 12] }

test('sanitizarTrack conta segundos repetidos como replay', () => {
  const r = sanitizarTrack(ok)
  assert.deepEqual(r.segundos, [10, 11, 12])
  assert.deepEqual(r.vezes, [1, 2, 1])
  assert.equal(r.versao, 'v1.1')
})

test('sanitizarTrack usa v1 quando a versão não vem', () => {
  assert.equal(sanitizarTrack({ ...ok, versao: undefined }).versao, 'v1')
})

test('sanitizarTrack rejeita vídeo desconhecido, sessão curta, segundo fora da faixa e lote enorme', () => {
  assert.throws(() => sanitizarTrack({ ...ok, video: 'outro' }), TrackInvalido)
  assert.throws(() => sanitizarTrack({ ...ok, sessao: 'x' }), TrackInvalido)
  assert.throws(() => sanitizarTrack({ ...ok, segundos: [-1] }), TrackInvalido)
  assert.throws(() => sanitizarTrack({ ...ok, segundos: [1.5] }), TrackInvalido)
  assert.throws(() => sanitizarTrack({ ...ok, segundos: [99999] }), TrackInvalido)
  assert.throws(() => sanitizarTrack({ ...ok, segundos: Array.from({ length: 500 }, (_, i) => i) }), TrackInvalido)
  assert.throws(() => sanitizarTrack({ ...ok, versao: 'a b' }), TrackInvalido)
  assert.throws(() => sanitizarTrack(null), TrackInvalido)
})

// 10 pessoas começam; 8 ficam até o segundo 5; uma delas volta e revê o segundo 4 (replay)
const linhas = [
  { segundo: 0, espectadores: 10, vezes: 10 },
  { segundo: 1, espectadores: 10, vezes: 10 },
  { segundo: 2, espectadores: 10, vezes: 10 },
  { segundo: 3, espectadores: 9, vezes: 9 },
  { segundo: 4, espectadores: 8, vezes: 9 },
  { segundo: 5, espectadores: 8, vezes: 8 },
]

test('calcularCurva: base é o início; abandono cai; replay passa da curva única', () => {
  const c = calcularCurva(linhas)
  assert.equal(c.base, 10)
  assert.equal(c.duracao, 5)
  assert.equal(c.pontos[3].unica, 90)
  assert.equal(c.pontos[4].unica, 80)
  assert.equal(c.pontos[4].retencao, 90)
})

test('calcularCurva: sem dados não inventa nada', () => {
  assert.deepEqual(calcularCurva([]), { base: 0, duracao: 0, pontos: [] })
})

test('calcularCurva: segundo sem ninguém vira 0 em vez de buraco', () => {
  const c = calcularCurva([{ segundo: 0, espectadores: 2, vezes: 2 }, { segundo: 3, espectadores: 1, vezes: 1 }])
  assert.equal(c.pontos.length, 4)
  assert.equal(c.pontos[2].unica, 0)
})

test('maioresQuedas e maioresPicos', () => {
  const c = calcularCurva(linhas)
  assert.deepEqual(maioresPicos(c), [{ s: 4, extra: 10 }])
  const q = maioresQuedas(c, { janela: 2, quantas: 1 })
  assert.equal(q[0].de, 2)
  assert.equal(q[0].queda, 20)
})

test('montarDiff traz notas, quedas e a pergunta para a IA', () => {
  const a = { versao: 'v1', notas: '', curva: calcularCurva(linhas) }
  const b = { versao: 'v1.1', notas: 'Cortei 12s no começo', curva: calcularCurva(linhas) }
  const md = montarDiff({ video: 'vsl', a, b })
  assert.match(md, /v1 → v1\.1/)
  assert.match(md, /Cortei 12s no começo/)
  assert.match(md, /\(sem anotação\)/)
  assert.match(md, /melhorou ou piorou/)
})

test('sanitizarTrack só aceita segundos que são números inteiros de verdade', () => {
  for (const ruim of [null, '', true, [], '7', 1.5, NaN, {}]) {
    assert.throws(() => sanitizarTrack({ ...ok, segundos: [ruim] }), TrackInvalido, `deveria recusar ${JSON.stringify(ruim)}`)
  }
  assert.throws(() => sanitizarTrack({ ...ok, segundos: Array.from({ length: 31 }, (_, i) => i) }), TrackInvalido)
})

test('sanitizarTrack barra versões que começam com símbolo (__proto__)', () => {
  assert.throws(() => sanitizarTrack({ ...ok, versao: '__proto__' }), TrackInvalido)
  assert.throws(() => sanitizarTrack({ ...ok, versao: '.v1' }), TrackInvalido)
  assert.equal(sanitizarTrack({ ...ok, versao: 'v1.2-gancho' }).versao, 'v1.2-gancho')
})

// ── endpoint público: origem, limites e versão cadastrada ──
function pedido({ origem = 'https://tuzinho.academy', ip = '10.0.0.1', corpo = { ...ok, versao: 'v1' }, metodo = 'POST' } = {}) {
  const req = Readable.from([typeof corpo === 'string' ? corpo : JSON.stringify(corpo)])
  req.method = metodo
  req.headers = { ...(origem ? { origin: origem } : {}), 'x-forwarded-for': ip }
  req.socket = { remoteAddress: '127.0.0.1' }
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end() {} }
  return { req, res }
}
async function chamar(opcoes, extras = {}) {
  const gravados = []
  const { req, res } = pedido(opcoes)
  await handleVideoTrackRequest(req, res, {}, {
    gravar: async (_env, envio) => { gravados.push(envio) },
    versoes: async () => new Set(['v1', 'v1.1']),
    ...extras,
  })
  return { status: res.statusCode, headers: res.headers, gravados }
}

test('track: origem do site grava e devolve o CORS só para ela', async () => {
  zerarLimites()
  const r = await chamar()
  assert.equal(r.status, 204)
  assert.equal(r.gravados.length, 1)
  assert.equal(r.headers['Access-Control-Allow-Origin'], 'https://tuzinho.academy')
})

test('track: origem estranha leva 403, sem CORS e sem gravar', async () => {
  zerarLimites()
  const r = await chamar({ origem: 'https://site-do-mal.com' })
  assert.equal(r.status, 403)
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined)
  assert.equal(r.gravados.length, 0)
})

test('track: versão não cadastrada é ignorada em silêncio (204, nada gravado)', async () => {
  zerarLimites()
  const r = await chamar({ corpo: { ...ok, versao: 'HACKEADO' } })
  assert.equal(r.status, 204)
  assert.equal(r.gravados.length, 0)
})

test('track: trocar de sessão a cada envio não escapa do limite por IP', async () => {
  zerarLimites()
  let aceitos = 0
  let bloqueados = 0
  for (let i = 0; i < 700; i += 1) {
    const r = await chamar({ ip: '9.9.9.9', corpo: { ...ok, versao: 'v1', sessao: `sessao-${i}-abcdefgh` } })
    if (r.status === 204) aceitos += 1
    if (r.status === 429) bloqueados += 1
  }
  assert.equal(aceitos, 600)
  assert.equal(bloqueados, 100)
  // outro IP não é afetado
  assert.equal((await chamar({ ip: '8.8.8.8' })).status, 204)
})

test('track: a mesma sessão tem limite por hora', async () => {
  zerarLimites()
  let ultimo = 0
  for (let i = 0; i < 601; i += 1) ultimo = (await chamar({ ip: `7.7.${i % 250}.${Math.floor(i / 250)}` })).status
  assert.equal(ultimo, 429)
})

test('track: erro do banco nunca vira erro para a página (204)', async () => {
  zerarLimites()
  const r = await chamar({}, { gravar: async () => { throw new Error('banco caiu') } })
  assert.equal(r.status, 204)
})

test('track: corpo grande e JSON inválido levam 400; GET leva 405', async () => {
  zerarLimites()
  assert.equal((await chamar({ corpo: '{"x":"' + 'a'.repeat(20000) + '"}' })).status, 400)
  assert.equal((await chamar({ corpo: 'nao-json' })).status, 400)
  assert.equal((await chamar({ metodo: 'GET' })).status, 405)
})

test('montarDiff entre vídeos diferentes rotula cada versão com o vídeo (v1 × v3 não dizem de qual VSL são)', () => {
  const a = { video: 'vsl', versao: 'v1', notas: '', curva: calcularCurva(linhas) }
  const b = { video: 'vsl-mentoria', versao: 'v3', notas: 'VSL nova da mentoria', curva: calcularCurva(linhas) }
  const md = montarDiff({ a, b })
  assert.match(md, /Comparação de retenção entre VSLs: vsl v1 → vsl-mentoria v3/)
  assert.match(md, /## vsl v1/)
  assert.match(md, /## vsl-mentoria v3/)
  assert.match(md, /\| Trecho \| vsl v1 \| vsl-mentoria v3 \|/)
})

test('montarDiff no mesmo vídeo continua só com as versões no título', () => {
  const a = { video: 'vsl', versao: 'v1', notas: '', curva: calcularCurva(linhas) }
  const b = { video: 'vsl', versao: 'v1.1', notas: '', curva: calcularCurva(linhas) }
  assert.match(montarDiff({ a, b }), /Comparação de retenção da VSL "vsl": v1 → v1\.1/)
})
