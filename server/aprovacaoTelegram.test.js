import test from 'node:test'
import assert from 'node:assert/strict'
import { avisarCadastroPendente, decidirCadastro, handleTelegramWebhook } from './aprovacaoTelegram.js'

const ID = 'b584a405-a628-4d88-894e-4df8bee78838'
const ENV = { TELEGRAM_BOT_TOKEN: '123:ABC', TELEGRAM_CHAT_ID: '99', TELEGRAM_WEBHOOK_SECRET: 'segredo-do-webhook' }

function chamadasFalsas() {
  const feitas = []
  const fetchImpl = async (url, opcoes) => {
    feitas.push({ metodo: String(url).split('/').pop(), corpo: JSON.parse(opcoes.body) })
    return { ok: true, text: async () => '{}' }
  }
  return { feitas, fetchImpl }
}

function webhook({ env = ENV, metodo = 'POST', segredo = ENV.TELEGRAM_WEBHOOK_SECRET, corpo = {}, fetchImpl }) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end: (texto) => resolve({ status: res.statusCode, corpo: JSON.parse(texto) }),
    }
    const req = {
      method: metodo,
      url: '/api/telegram',
      headers: segredo === null ? {} : { 'x-telegram-bot-api-secret-token': segredo },
      on(evento, fn) {
        if (evento === 'data') queueMicrotask(() => fn(JSON.stringify(corpo)))
        if (evento === 'end') queueMicrotask(() => queueMicrotask(() => fn()))
      },
    }
    handleTelegramWebhook(req, res, env, fetchImpl)
  })
}

test('o aviso leva os botões Aprovar e Recusar com o id do cadastro', async () => {
  const { feitas, fetchImpl } = chamadasFalsas()
  const ok = await avisarCadastroPendente(ENV, { id: ID, nome: 'Maria', email: 'maria@x.com' }, fetchImpl)
  assert.equal(ok, true)
  assert.equal(feitas[0].metodo, 'sendMessage')
  assert.equal(feitas[0].corpo.chat_id, '99')
  const botoes = feitas[0].corpo.reply_markup.inline_keyboard[0]
  assert.deepEqual(botoes.map((b) => b.callback_data), [`ap:${ID}`, `rc:${ID}`])
})

test('sem Telegram configurado o aviso não falha, só devolve false', async () => {
  assert.equal(await avisarCadastroPendente({}, { id: ID, nome: 'Maria', email: 'maria@x.com' }), false)
})

test('falha do Telegram no aviso não vira erro para quem se cadastrou', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'erro' })
  assert.equal(await avisarCadastroPendente(ENV, { id: ID, nome: 'Maria', email: 'maria@x.com' }, fetchImpl), false)
})

test('decidirCadastro aprova quem está pendente', async () => {
  const consultas = []
  const texto = await decidirCadastro(ENV, 'ap', ID, async (sql, params) => {
    consultas.push({ sql, params })
    return { rows: [{ nome: 'Maria', email: 'maria@x.com' }] }
  })
  assert.match(texto, /aprovado: Maria/)
  assert.match(consultas[0].sql, /ativo = true/)
  assert.deepEqual(consultas[0].params, [ID])
})

test('decidirCadastro recusa só quem ainda está pendente', async () => {
  const consultas = []
  await decidirCadastro(ENV, 'rc', ID, async (sql) => {
    consultas.push(sql)
    return { rows: [{ nome: 'Maria', email: 'maria@x.com' }] }
  })
  assert.match(consultas[0], /recusado_em = now\(\)/)
  assert.match(consultas[0], /recusado_em is null/)
})

test('decidirCadastro avisa quando já estava aprovado, recusado ou não existe', async () => {
  const por = (linha) => async (sql) => (sql.startsWith('update') ? { rows: [] } : { rows: linha ? [linha] : [] })
  assert.match(await decidirCadastro(ENV, 'rc', ID, por({ nome: 'A', email: 'a@x', ativo: true, recusado_em: null })), /já estava aprovado/)
  assert.match(await decidirCadastro(ENV, 'ap', ID, por({ nome: 'A', email: 'a@x', ativo: false, recusado_em: 'x' })), /já estava recusado/)
  assert.match(await decidirCadastro(ENV, 'ap', ID, por(null)), /não existe/)
})

test('webhook sem segredo configurado some (404) e com segredo errado é negado', async () => {
  assert.equal((await webhook({ env: { ...ENV, TELEGRAM_WEBHOOK_SECRET: '' } })).status, 404)
  assert.equal((await webhook({ segredo: 'errado' })).status, 403)
  assert.equal((await webhook({ segredo: null })).status, 403)
  assert.equal((await webhook({ metodo: 'GET' })).status, 404)
})

test('clique vindo de outro chat é recusado sem mexer no cadastro', async () => {
  const { feitas, fetchImpl } = chamadasFalsas()
  const r = await webhook({
    fetchImpl,
    corpo: { callback_query: { id: 'c1', data: `ap:${ID}`, from: { id: 5 }, message: { chat: { id: 123 }, message_id: 7 } } },
  })
  assert.equal(r.status, 200)
  assert.equal(feitas.length, 1)
  assert.equal(feitas[0].metodo, 'answerCallbackQuery')
  assert.match(feitas[0].corpo.text, /Sem permissão/)
})

test('atualizações que não são o nosso botão são ignoradas com 200', async () => {
  const { feitas, fetchImpl } = chamadasFalsas()
  assert.equal((await webhook({ fetchImpl, corpo: { message: { text: 'oi' } } })).status, 200)
  assert.equal(
    (await webhook({ fetchImpl, corpo: { callback_query: { id: 'c', data: 'ap:nao-uuid', message: { chat: { id: 99 } } } } })).status,
    200,
  )
  assert.equal(feitas.length, 0)
})
