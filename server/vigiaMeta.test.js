import assert from 'node:assert/strict'
import { test } from 'node:test'
import { avisoDaConferencia, conferirTokenMeta, descreverResultado, erroDeToken, estadoDoTokenMeta } from './vigiaMeta.js'
import { aoTokenRejeitado, graphGet } from './metaApi.js'

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status })
const ENV = { META_ACCESS_TOKEN: 'EAAteste' }

test('erroDeToken reconhece só os códigos de token (190 e 102)', () => {
  assert.equal(erroDeToken({ metaCode: 190 }), true)
  assert.equal(erroDeToken({ code: 102 }), true)
  assert.equal(erroDeToken({ code: 100 }), false)
  assert.equal(erroDeToken({ metaCode: 200 }), false)
  assert.equal(erroDeToken(null), false)
})

test('token de usuário do sistema (sem vencimento) está ok e não gera aviso', async () => {
  const r = await conferirTokenMeta(ENV, { fetchImpl: async () => json({ data: { is_valid: true, expires_at: 0 } }) })
  assert.equal(r.estado, 'ok')
  assert.equal(avisoDaConferencia(r), null)
})

test('token recusado pela Meta (190) vira aviso de rejeitado, sem vazar o token', async () => {
  const r = await conferirTokenMeta(ENV, {
    fetchImpl: async () => json({ error: { code: 190, error_subcode: 463, message: 'Session has expired' } }, 400),
  })
  assert.equal(r.estado, 'rejeitado')
  const aviso = avisoDaConferencia(r)
  assert.equal(aviso.chave, 'meta-token-rejeitado')
  assert.match(aviso.texto, /expirou/)
  assert.ok(!aviso.texto.includes('EAAteste'))
})

test('is_valid false também conta como rejeitado', async () => {
  const r = await conferirTokenMeta(ENV, { fetchImpl: async () => json({ data: { is_valid: false } }) })
  assert.equal(r.estado, 'rejeitado')
})

test('token com data de vencimento perto avisa com antecedência', async () => {
  const agora = Date.UTC(2026, 10, 14)
  const expires_at = Math.floor((agora + 3 * 86_400_000) / 1000)
  const r = await conferirTokenMeta(ENV, { agora: () => agora, fetchImpl: async () => json({ data: { is_valid: true, expires_at } }) })
  assert.deepEqual([r.estado, r.dias], ['vencendo', 3])
  assert.match(avisoDaConferencia(r).texto, /vence em 3 dia/)
})

test('rede fora ou erro que não é do token fica indeterminado (sem aviso)', async () => {
  const caiu = await conferirTokenMeta(ENV, { fetchImpl: async () => { throw new Error('ECONNRESET') } })
  assert.equal(caiu.estado, 'indeterminado')
  const limite = await conferirTokenMeta(ENV, { fetchImpl: async () => json({ error: { code: 4, message: 'rate limit' } }, 400) })
  assert.equal(limite.estado, 'indeterminado')
  assert.equal(avisoDaConferencia(limite), null)
})

test('graphGet avisa o ouvinte quando a Meta devolve 190, e só nesse caso', async () => {
  const original = globalThis.fetch
  const recebidos = []
  aoTokenRejeitado((erro) => recebidos.push(erro.metaCode))
  try {
    globalThis.fetch = async () => json({ error: { code: 190, message: 'Invalid OAuth access token.' } }, 401)
    await assert.rejects(graphGet('/me', {}, 'x'), /Invalid OAuth/)
    globalThis.fetch = async () => json({ error: { code: 100, message: 'Param inválido' } }, 400)
    await assert.rejects(graphGet('/me', {}, 'x'), /Param inválido/)
  } finally {
    globalThis.fetch = original
    aoTokenRejeitado(null)
  }
  assert.deepEqual(recebidos, [190])
})

test('descreverResultado diz o tipo e o vencimento, sem mostrar o token', async () => {
  const semVenc = await conferirTokenMeta(ENV, { fetchImpl: async () => json({ data: { is_valid: true, expires_at: 0, type: 'SYSTEM_USER' } }) })
  assert.equal(descreverResultado(semVenc), 'token ok · tipo SYSTEM_USER · sem vencimento')
  const agora = Date.UTC(2026, 10, 14)
  const usuario = await conferirTokenMeta(ENV, { agora: () => agora, fetchImpl: async () => json({ data: { is_valid: true, type: 'USER', expires_at: Math.floor((agora + 3 * 86_400_000) / 1000) } }) })
  assert.equal(descreverResultado(usuario), 'token ok, mas vence em 3 dia(s) · tipo USER')
  assert.ok(!descreverResultado(semVenc).includes('EAAteste'))
})

test('estadoDoTokenMeta guarda o resultado por 10 minutos e depois confere de novo', async () => {
  let chamadas = 0
  let agora = 1_000_000
  const conferir = async () => ({ estado: 'ok', tipo: 'SYSTEM_USER', dias: null, n: ++chamadas })
  const a = await estadoDoTokenMeta(ENV, { conferir, agora: () => agora })
  agora += 9 * 60_000
  await estadoDoTokenMeta(ENV, { conferir, agora: () => agora })
  assert.equal(chamadas, 1)
  assert.equal(a.descricao, 'token ok · tipo SYSTEM_USER · sem vencimento')
  agora += 2 * 60_000
  await estadoDoTokenMeta(ENV, { conferir, agora: () => agora })
  assert.equal(chamadas, 2)
})
