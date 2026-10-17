import assert from 'node:assert/strict'
import { test } from 'node:test'
import { estatisticasDoWebhook, handleHotmartWebhookRequest, zerarEstatisticasDoWebhook } from './hotmartWebhookHandler.js'
import { criarLimitePersistente, verificar } from './vigia.js'
import { resumoDoWebhook } from './segurancaHandler.js'

function respostaFalsa() {
  return { statusCode: 0, corpo: '', setHeader() {}, end(texto) { this.corpo = texto } }
}

test('o webhook conta as entregas recusadas por hottok errado', async () => {
  zerarEstatisticasDoWebhook()
  const env = { HOTMART_HOTTOK: 'certo' }
  for (const hottok of [undefined, 'errado']) {
    const res = respostaFalsa()
    await handleHotmartWebhookRequest({ url: '/api/hotmart/webhook', method: 'POST', headers: hottok ? { 'x-hotmart-hottok': hottok } : {} }, res, env)
    assert.equal(res.statusCode, 401)
  }
  const estatisticas = estatisticasDoWebhook()
  assert.equal(estatisticas.recusadas, 2)
  assert.equal(estatisticas.aceitas, 0)
  assert.ok(estatisticas.ultimaRecusaEm)
})

test('o vigia avisa quando a Hotmart só é recusada (hottok diferente)', async () => {
  const consulta = async () => ({ rows: [{ n: 0, total: 5, semana: 5, ultimo: new Date().toISOString() }] })
  const chaves = async (estatisticas) => (await verificar({}, { consultar: consulta, estatisticas: () => estatisticas })).map((aviso) => aviso.chave)
  assert.deepEqual(await chaves({ recusadas: 3, aceitas: 0 }), ['hottok'])
  assert.deepEqual(await chaves({ recusadas: 3, aceitas: 2 }), []) // chegando e sendo aceito: ok
  assert.deepEqual(await chaves({ recusadas: 1, aceitas: 0 }), []) // uma recusa isolada não alarma
})

test('o vigia lembra no banco: depois de um reinício o mesmo aviso não repete', async () => {
  const guardado = new Map() // faz de conta que é a tabela vigia_avisos
  let agora = 1_000_000
  const consultar = async (texto, params) => {
    if (texto.startsWith('create table')) return { rows: [] }
    if (texto.startsWith('select')) return { rows: guardado.has(params[0]) ? [{ avisado_em: new Date(guardado.get(params[0])) }] : [] }
    guardado.set(params[0], agora) // insert
    return { rows: [] }
  }
  const antesDoReinicio = criarLimitePersistente(consultar, () => agora)
  assert.equal(await antesDoReinicio('nunca', 24 * 60), true)
  assert.equal(await antesDoReinicio('nunca', 24 * 60), false)
  const depoisDoReinicio = criarLimitePersistente(consultar, () => agora + 60 * 60_000) // app novo, memória vazia, 1 h depois
  assert.equal(await depoisDoReinicio('nunca', 24 * 60), false)
  const dia = criarLimitePersistente(consultar, () => agora + 25 * 3600_000)
  assert.equal(await dia('nunca', 24 * 60), true) // passou de 24 h
})

test('o vigia cai para a memória se o banco falhar', async () => {
  const quebrado = async () => {
    throw new Error('banco fora')
  }
  const pode = criarLimitePersistente(quebrado)
  assert.equal(await pode('x', 60), true)
  assert.equal(await pode('x', 60), false)
})

test('resumoDoWebhook junta o que há no banco com os contadores', async () => {
  const resumo = await resumoDoWebhook(
    { HOTMART_HOTTOK: 'x' },
    { consultar: async () => ({ rows: [{ total: 7, ultimo: '2026-10-17T10:00:00Z' }] }), estatisticas: () => ({ recusadas: 2, ultimaRecusaEm: 'r', aceitas: 5, ultimaAceitaEm: 'a' }) },
  )
  assert.deepEqual([resumo.total, resumo.recusadas, resumo.aceitas, resumo.hottokConfigurado], [7, 2, 5, true])
})
