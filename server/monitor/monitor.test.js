import test from 'node:test'
import assert from 'node:assert/strict'
import { avaliarTransicoes, checarAlvo, montarResumo, rodarChecagens, startMonitor } from './monitor.js'
import { PROJETOS } from './projetos.js'

const resposta = (status, corpo = '') => ({
  status,
  text: async () => corpo,
  body: { cancel: async () => {} },
})

test('2xx e 3xx contam como no ar; 4xx e 5xx não', async () => {
  assert.equal((await checarAlvo({ url: 'x' }, async () => resposta(200))).ok, true)
  assert.equal((await checarAlvo({ url: 'x' }, async () => resposta(301))).ok, true)
  const r404 = await checarAlvo({ url: 'x' }, async () => resposta(404))
  assert.deepEqual([r404.ok, r404.status, r404.erro], [false, 404, 'HTTP 404'])
  assert.equal((await checarAlvo({ url: 'x' }, async () => resposta(502))).ok, false)
})

test('esperaStatus troca a regra (preflight do cadastro responde 204)', async () => {
  const alvo = { url: 'x', metodo: 'OPTIONS', esperaStatus: 204 }
  assert.equal((await checarAlvo(alvo, async () => resposta(204))).ok, true)
  assert.equal((await checarAlvo(alvo, async () => resposta(200))).ok, false)
})

test('contem: página que abre sem o trecho esperado falha', async () => {
  const alvo = { url: 'x', contem: 'data-lead-form' }
  assert.equal((await checarAlvo(alvo, async () => resposta(200, '<form data-lead-form>'))).ok, true)
  const sem = await checarAlvo(alvo, async () => resposta(200, '<html>manutenção</html>'))
  assert.equal(sem.ok, false)
  assert.match(sem.erro, /data-lead-form/)
})

test('erro de rede e tempo esgotado viram falha com motivo, sem lançar', async () => {
  const rede = await checarAlvo({ url: 'x' }, async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
  })
  assert.equal(rede.ok, false)
  assert.match(rede.erro, /ENOTFOUND/)
  const tempo = await checarAlvo({ url: 'x' }, async () => {
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
  })
  assert.match(tempo.erro, /sem resposta/)
})

const falha = (alvo = 'Home') => ({ projeto: 'p', projetoNome: 'Projeto', alvo, url: 'https://x', ok: false, erro: 'HTTP 500', ms: 50 })
const acerto = (alvo = 'Home') => ({ projeto: 'p', projetoNome: 'Projeto', alvo, url: 'https://x', ok: true, erro: null, ms: 80 })

test('avisa a queda só na segunda falha seguida, uma vez, e avisa quando volta', () => {
  const estado = new Map()
  assert.equal(avaliarTransicoes([falha()], estado).length, 0) // uma falha só pode ser soluço
  const queda = avaliarTransicoes([falha()], estado)
  assert.equal(queda.length, 1)
  assert.match(queda[0], /Fora do ar: Projeto — Home/)
  assert.equal(avaliarTransicoes([falha()], estado).length, 0) // não repete o aviso
  const volta = avaliarTransicoes([acerto()], estado)
  assert.equal(volta.length, 1)
  assert.match(volta[0], /Voltou/)
  assert.equal(avaliarTransicoes([acerto()], estado).length, 0)
})

test('uma falha isolada seguida de acerto não avisa nada', () => {
  const estado = new Map()
  assert.equal(avaliarTransicoes([falha()], estado).length, 0)
  assert.equal(avaliarTransicoes([acerto()], estado).length, 0)
  assert.equal(avaliarTransicoes([falha()], estado).length, 0)
})

test('cada endereço tem o próprio estado', () => {
  const estado = new Map()
  avaliarTransicoes([falha('A'), acerto('B')], estado)
  const avisos = avaliarTransicoes([falha('A'), acerto('B')], estado)
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /— A/)
})

test('rodarChecagens confere todos os alvos e grava uma linha por alvo', async () => {
  const total = PROJETOS.reduce((soma, p) => soma + p.alvos.length, 0)
  const chamadas = []
  const resultados = await rodarChecagens(
    {},
    {
      fetchImpl: async (url) => resposta(url.includes('originaltattoo') ? 500 : url.includes('/api/captura') ? 204 : 200, 'data-lead-form'),
      consultar: async (texto, params) => (chamadas.push({ texto, params }), { rows: [] }),
    },
  )
  assert.equal(resultados.length, total)
  const insercao = chamadas.find((c) => /insert into monitor_checagens/.test(c.texto))
  assert.equal(insercao.params[0].length, total)
  assert.ok(chamadas.some((c) => /delete from monitor_checagens/.test(c.texto)))
  assert.equal(resultados.filter((r) => !r.ok).length, PROJETOS.find((p) => p.id === 'original-sp-tattoo').alvos.length)
})

test('montarResumo calcula situação, disponibilidade e cadastros', async () => {
  const projeto = { id: 'p', nome: 'P', descricao: '', pasta: '', slugsDeLeads: ['x'], alvos: [{ nome: 'Home', url: 'u' }, { nome: 'Lenta', url: 'u2' }] }
  const hora = (n) => new Date(Date.UTC(2026, 9, 24, n)).toISOString()
  const consultar = async (texto) => {
    if (/from monitor_checagens/.test(texto)) {
      return {
        rows: [
          { projeto: 'p', alvo: 'Home', ok: true, status: 200, ms: 100, erro: null, checado_em: hora(1) },
          { projeto: 'p', alvo: 'Home', ok: false, status: 500, ms: 90, erro: 'HTTP 500', checado_em: hora(2) },
          { projeto: 'p', alvo: 'Lenta', ok: true, status: 200, ms: 9000, erro: null, checado_em: hora(2) },
        ],
      }
    }
    return { rows: [{ h24: 3, d7: 10, total: 50, ultimo: hora(2) }] }
  }
  const resumo = await montarResumo({}, { projetos: [projeto], consultar })
  const p = resumo.projetos[0]
  assert.equal(p.situacao, 'fora')
  assert.equal(p.alvos[0].situacao, 'fora')
  assert.equal(p.alvos[0].disponibilidade24h, 50)
  assert.equal(p.alvos[1].situacao, 'lento')
  assert.deepEqual(p.leads, { ultimas24h: 3, ultimos7dias: 10, total: 50, ultimoEm: hora(2) })
  assert.equal(p.captura, null)
})

test('sem histórico ainda, o projeto aparece como sem-dados', async () => {
  const consultar = async (texto) => (/from monitor_checagens/.test(texto) ? { rows: [] } : { rows: [{ h24: 0, d7: 0, total: 0, ultimo: null }] })
  const resumo = await montarResumo({}, { consultar })
  assert.ok(resumo.projetos.every((p) => p.situacao === 'sem-dados'))
  assert.deepEqual(resumo.projetos.map((p) => p.id), ['work-gratuito', 'produtos', 'original-sp-tattoo'])
  assert.ok(resumo.projetos[0].captura)
})

test('sem banco configurado o monitor não liga', () => {
  const m = startMonitor({})
  assert.equal(typeof m.stop, 'function')
  m.stop()
})
