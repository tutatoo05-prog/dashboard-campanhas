import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conciliar, textoDoAviso, vendasDaHistoria, vendasFaltando } from './conciliacaoHotmart.js'

const AGORA = Date.parse('2026-10-21T15:00:00Z')
const DIA = 86_400_000

function item({ tx, email, produto = 'Essentials ', status = 'APPROVED', rec = 1, base = 1497, preco = 1857.84, moeda = 'BRL', quando = AGORA - 2 * DIA }) {
  return {
    purchase: {
      transaction: tx,
      status,
      recurrency_number: rec,
      approved_date: quando,
      order_date: quando,
      price: { value: preco, currency_code: moeda },
      hotmart_fee: { base },
      payment: { type: 'CREDIT_CARD' },
      tracking: { source: 'live', external_code: 'ad_direto|var_live|l_x' },
    },
    buyer: { email, name: 'Fulano de Tal ' },
    product: { name: produto },
  }
}

test('só entra venda aprovada, primeira cobrança e já com alguns minutos', () => {
  const vendas = vendasDaHistoria(
    [
      item({ tx: 'A', email: 'a@x.com' }),
      item({ tx: 'B', email: 'b@x.com', rec: 4 }),
      item({ tx: 'C', email: 'c@x.com', status: 'CANCELLED' }),
      item({ tx: 'D', email: 'd@x.com', quando: AGORA - 5 * 60_000 }),
      item({ tx: 'E', email: 'e@x.com', status: 'COMPLETE' }),
    ],
    AGORA,
  )
  assert.deepEqual(vendas.map((v) => v.transacao), ['A', 'E'])
})

test('valor é o base do produto em reais, e vazio em outra moeda', () => {
  const [real, euro] = vendasDaHistoria([item({ tx: 'A', email: 'a@x.com' }), item({ tx: 'B', email: 'b@x.com', moeda: 'EUR', preco: 282 })], AGORA)
  assert.equal(real.valor, 1497)
  assert.equal(real.curso, 'Essentials')
  assert.equal(euro.valor, null)
})

test('faltando: casa por transação, ou por e-mail + curso em até 3 dias', () => {
  const vendas = vendasDaHistoria(
    [item({ tx: 'A', email: 'a@x.com' }), item({ tx: 'B', email: 'b@x.com' }), item({ tx: 'C', email: 'c@x.com' }), item({ tx: 'D', email: 'd@x.com' })],
    AGORA,
  )
  const quando = new Date(AGORA - 2 * DIA).toISOString()
  const compras = [
    { transacao: 'A', email: 'outro@x.com', curso: 'Essentials', created_at: quando },
    { transacao: null, email: 'b@x.com', curso: 'Essentials', created_at: quando },
    { transacao: null, email: 'c@x.com', curso: 'Essentials', created_at: new Date(AGORA - 30 * DIA).toISOString() },
  ]
  assert.deepEqual(vendasFaltando(vendas, compras).map((v) => v.transacao), ['C', 'D'])
})

test('conciliar: lança só o que falta, não libera nada e avisa quem está sem acesso', async () => {
  const gravadas = []
  const avisos = []
  const consultar = async (texto) => {
    if (texto.includes('from purchases')) return { rows: [{ transacao: 'A', email: 'a@x.com', curso: 'Essentials', created_at: new Date(AGORA - 2 * DIA) }] }
    if (texto.includes('from acessos')) return { rows: [{ email: 'b@x.com' }] }
    throw new Error('consulta inesperada: ' + texto)
  }
  const resultado = await conciliar({}, {
    agora: AGORA,
    buscar: async () => [item({ tx: 'A', email: 'a@x.com' }), item({ tx: 'B', email: 'b@x.com' }), item({ tx: 'C', email: 'c@x.com', produto: 'Mentoria Essentials', base: 136.01 })],
    consultar,
    inserir: async (linhas) => { gravadas.push(...linhas); return linhas.length },
    avisar: async (texto) => { avisos.push(texto) },
  })
  assert.deepEqual(resultado, { vendas: 3, faltando: 2, lancadas: 2 })
  assert.deepEqual(gravadas.map((g) => g.transacao), ['B', 'C'])
  assert.equal(gravadas[1].valor, 136.01)
  assert.equal(gravadas[0].liberacao, '')
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /c@x\.com/) // só o C está sem acesso
  assert.ok(!/Sem acesso liberado[\s\S]*b@x\.com/.test(avisos[0]))
})

test('conciliar: nada faltando = nenhum aviso', async () => {
  let avisou = false
  const resultado = await conciliar({}, {
    agora: AGORA,
    buscar: async () => [item({ tx: 'A', email: 'a@x.com' })],
    consultar: async () => ({ rows: [{ transacao: 'A', email: 'a@x.com', curso: 'Essentials', created_at: new Date(AGORA - 2 * DIA) }] }),
    inserir: async () => { throw new Error('não era para gravar') },
    avisar: async () => { avisou = true },
  })
  assert.equal(resultado.lancadas, 0)
  assert.equal(avisou, false)
})

test('texto do aviso diz que não liberou acesso', () => {
  const venda = { nome: 'Ana', email: 'ana@x.com', curso: 'Essentials', valor: 1497, moeda: 'BRL', aprovadaEm: new Date(AGORA) }
  const texto = textoDoAviso([venda], [venda])
  assert.match(texto, /sem liberar acesso/)
  assert.match(texto, /R\$ 1497,00/)
  assert.match(texto, /ana@x\.com/)
})
