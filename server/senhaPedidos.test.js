import test from 'node:test'
import assert from 'node:assert/strict'
import { decidirPedido, estadoDoPedido, pedirTrocaDeSenha } from './senhaPedidos.js'

const ENV = { TELEGRAM_BOT_TOKEN: '123:ABC', TELEGRAM_CHAT_ID: '99' }
const PEDIDO = 'b584a405-a628-4d88-894e-4df8bee78838'
const USUARIO = { id: 'u1', nome: 'Gabi', email: 'gabi@x.com', ativo: true }

function telegramFalso({ falha = false } = {}) {
  const feitas = []
  const fetchImpl = async (url, opcoes) => {
    feitas.push({ metodo: String(url).split('/').pop(), corpo: JSON.parse(opcoes.body) })
    return falha ? { ok: false, status: 500, text: async () => 'erro' } : { ok: true, text: async () => '{}' }
  }
  return { feitas, fetchImpl }
}

function bancoFalso({ usuario = USUARIO, recente = null } = {}) {
  const sqls = []
  const consultar = async (sql, params) => {
    sqls.push({ sql, params })
    if (/from users where email/.test(sql)) return { rows: usuario ? [usuario] : [] }
    if (/criado_em > now\(\)/.test(sql)) return { rows: recente ? [{ pedido: recente }] : [] }
    if (/insert into password_resets/.test(sql)) return { rows: [{ pedido: PEDIDO }] }
    return { rows: [] }
  }
  return { sqls, consultar }
}

test('o pedido devolve só o número e manda os botões Liberar/Negar ao chat da equipe', async () => {
  const { feitas, fetchImpl } = telegramFalso()
  const { consultar } = bancoFalso()
  const r = await pedirTrocaDeSenha(ENV, 'gabi@x.com', { ip: '1.2.3.4', consultar, fetchImpl })
  assert.deepEqual(Object.keys(r), ['pedido'])
  assert.equal(r.pedido, PEDIDO)
  assert.equal(feitas[0].corpo.chat_id, '99')
  assert.match(feitas[0].corpo.text, /Gabi/)
  assert.match(feitas[0].corpo.text, /1\.2\.3\.4/)
  assert.deepEqual(feitas[0].corpo.reply_markup.inline_keyboard[0].map((b) => b.callback_data), [`lb:${PEDIDO}`, `ng:${PEDIDO}`])
})

test('e-mail desconhecido ou cadastro não aprovado: pedido falso, sem aviso e sem gravar nada', async () => {
  for (const usuario of [null, { ...USUARIO, ativo: false }]) {
    const { feitas, fetchImpl } = telegramFalso()
    const { sqls, consultar } = bancoFalso({ usuario })
    const r = await pedirTrocaDeSenha(ENV, 'x@x.com', { consultar, fetchImpl })
    assert.match(r.pedido, /^[0-9a-f-]{36}$/)
    assert.equal(feitas.length, 0)
    assert.ok(!sqls.some((s) => /insert/.test(s.sql)))
  }
})

test('pedido repetido logo em seguida reaproveita o anterior e não avisa de novo', async () => {
  const { feitas, fetchImpl } = telegramFalso()
  const { consultar } = bancoFalso({ recente: PEDIDO })
  const r = await pedirTrocaDeSenha(ENV, 'gabi@x.com', { consultar, fetchImpl })
  assert.equal(r.pedido, PEDIDO)
  assert.equal(feitas.length, 0)
})

test('sem Telegram, ou se o aviso falhar, o pedido é recusado e desfeito', async () => {
  await assert.rejects(pedirTrocaDeSenha({}, 'gabi@x.com', { consultar: bancoFalso().consultar }), /SEM_TELEGRAM/)
  const { fetchImpl } = telegramFalso({ falha: true })
  const { sqls, consultar } = bancoFalso()
  await assert.rejects(pedirTrocaDeSenha(ENV, 'gabi@x.com', { consultar, fetchImpl }), /SEM_TELEGRAM/)
  assert.ok(sqls.some((s) => /delete from password_resets/.test(s.sql)))
})

test('o token só aparece quando o pedido está liberado', async () => {
  const base = { token: 'segredo', used_at: null, liberado_em: null, negado_em: null, vencido: false }
  const estado = async (linha) => estadoDoPedido(ENV, PEDIDO, async () => ({ rows: linha ? [linha] : [] }))
  assert.deepEqual(await estado(base), { estado: 'aguardando' })
  assert.deepEqual(await estado(null), { estado: 'aguardando' })
  assert.deepEqual(await estado({ ...base, negado_em: new Date() }), { estado: 'negado' })
  assert.deepEqual(await estado({ ...base, vencido: true }), { estado: 'expirado' })
  assert.deepEqual(await estado({ ...base, used_at: new Date() }), { estado: 'usado' })
  assert.deepEqual(await estado({ ...base, liberado_em: new Date() }), { estado: 'liberado', token: 'segredo' })
})

test('liberar só vale para pedido pendente e renova o prazo; negar não mexe no prazo', async () => {
  const chamadas = []
  const texto = await decidirPedido(ENV, 'lb', PEDIDO, async (sql, params) => {
    chamadas.push({ sql, params })
    return { rows: [{ nome: 'Gabi', email: 'gabi@x.com' }] }
  })
  assert.match(texto, /liberada: Gabi/)
  assert.match(chamadas[0].sql, /liberado_em = now\(\)/)
  assert.match(chamadas[0].sql, /liberado_em is null/)
  assert.equal(chamadas[0].params[0], PEDIDO)

  const negou = await decidirPedido(ENV, 'ng', PEDIDO, async (sql) => {
    assert.match(sql, /negado_em = now\(\)/)
    return { rows: [{ nome: 'Gabi', email: 'gabi@x.com' }] }
  })
  assert.match(negou, /negada: Gabi/)
})

test('clique repetido ou pedido vencido não libera de novo', async () => {
  const sem = async (linha) => decidirPedido(ENV, 'lb', PEDIDO, async (sql) => (/^\s*update/.test(sql) ? { rows: [] } : { rows: linha ? [linha] : [] }))
  const base = { nome: 'Gabi', email: 'gabi@x.com', used_at: null, liberado_em: null, negado_em: null }
  assert.match(await sem({ ...base, liberado_em: new Date() }), /já estava liberado/)
  assert.match(await sem({ ...base, negado_em: new Date() }), /já estava negado/)
  assert.match(await sem({ ...base, used_at: new Date() }), /já foi usado/)
  assert.match(await sem(base), /venceu/)
  assert.match(await sem(null), /não existe/)
})
