import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventoDoPayload, juntarEventos, normalizeEvent, summarize, withSituations } from './hotmartEvents.js'

const AGORA = new Date('2026-10-17T12:00:00Z').getTime()

function evento(parcial) {
  return {
    id: Math.random().toString(36).slice(2),
    data: '2026-10-16T10:00:00.000Z',
    evento: '',
    categoria: 'venda',
    nome: '',
    email: '',
    telefone: '',
    produto: 'Mentoria Essentials',
    valor: 100,
    transacao: '',
    ...parcial,
  }
}

const situacoes = (eventos, compras = []) => withSituations(eventos, AGORA, compras).map((e) => e.situacao)

test('Pix pendente some quando a mesma pessoa comprou depois (mesmo por outro e-mail, ligado pelo telefone)', () => {
  const resultado = withSituations(
    [
      evento({ categoria: 'pix_boleto', email: 'a@x.com', telefone: '5563992125838', transacao: 'HP1', data: '2026-10-16T10:00:00.000Z' }),
      evento({ categoria: 'venda', email: 'outro@x.com', telefone: '(63) 99212-5838', transacao: 'HP2', data: '2026-10-16T12:00:00.000Z' }),
    ],
    AGORA,
    [],
  )
  assert.equal(resultado[0].situacao, 'recuperado')
})

test('Pix pendente continua pendente quando a compra foi de outro produto', () => {
  const resultado = withSituations(
    [
      evento({ categoria: 'pix_boleto', email: 'a@x.com', transacao: 'HP1', produto: 'Mentoria Essentials' }),
      evento({ categoria: 'venda', email: 'a@x.com', transacao: 'HP2', produto: 'Curso de Pintura', data: '2026-10-16T12:00:00.000Z' }),
    ],
    AGORA,
    [],
  )
  assert.equal(resultado[0].situacao, 'pendente')
})

test('compra registrada só no banco do dash também resolve o Pix', () => {
  const resultado = withSituations(
    [evento({ categoria: 'pix_boleto', email: 'a@x.com', transacao: 'HP1' })],
    AGORA,
    [{ email: 'a@x.com', telefone: '', produto: 'Essentials', data: '2026-10-16T18:00:00.000Z' }],
  )
  assert.equal(resultado[0].situacao, 'recuperado')
})

test('atraso seguido de nova compra do mesmo produto vira "regularizada" e sai da conta', () => {
  const eventos = [
    evento({ categoria: 'cancelamento', evento: 'compra_atrasada', email: 'a@x.com', data: '2026-10-11T10:00:00.000Z' }),
    evento({ categoria: 'venda', email: 'a@x.com', transacao: 'HP9', data: '2026-10-12T10:00:00.000Z' }),
  ]
  const resultado = withSituations(eventos, AGORA, [])
  assert.equal(resultado[0].situacao, 'regularizada')
  assert.equal(summarize(resultado).cancelamentos.total, 0)
})

test('avisos repetidos da mesma pessoa contam uma vez só (fica o mais recente)', () => {
  const eventos = [
    evento({ categoria: 'cancelamento', evento: 'compra_cancelada', nome: 'Bruno', email: 'b@x.com', data: '2026-10-14T10:00:00.000Z' }),
    evento({ categoria: 'cancelamento', evento: 'compra_cancelada', nome: 'Bruno', email: 'b@x.com', data: '2026-10-14T10:05:00.000Z' }),
    evento({ categoria: 'cancelamento', evento: 'compra_atrasada', nome: 'Edvaldo', email: 'e@x.com', data: '2026-10-11T10:00:00.000Z' }),
    evento({ categoria: 'cancelamento', evento: 'compra_atrasada', nome: 'Edvaldo', email: 'e@x.com', data: '2026-10-14T10:00:00.000Z' }),
  ]
  const resultado = withSituations(eventos, AGORA, [])
  assert.deepEqual(resultado.map((e) => e.situacao), ['repetido', 'cancelada', 'repetido', 'atrasada'])
  assert.equal(summarize(resultado).cancelamentos.total, 2)
})

test('carrinho abandonado: quem comprou por outro caminho sai da lista', () => {
  assert.deepEqual(
    situacoes([evento({ categoria: 'abandono', telefone: '11988887777', data: '2026-10-15T10:00:00.000Z' })], [
      { email: 'novo@x.com', telefone: '5511988887777', produto: '', data: '2026-10-16T10:00:00.000Z' },
    ]),
    ['recuperado'],
  )
})

test('Pix gerado duas vezes pela mesma pessoa conta como uma pendência', () => {
  const resultado = withSituations(
    [
      evento({ categoria: 'pix_boleto', email: 'a@x.com', transacao: 'HP1', data: '2026-10-16T09:00:00.000Z' }),
      evento({ categoria: 'pix_boleto', email: 'a@x.com', transacao: 'HP2', data: '2026-10-16T11:00:00.000Z' }),
    ],
    AGORA,
    [],
  )
  assert.deepEqual(resultado.map((e) => e.situacao), ['repetido', 'pendente'])
  assert.equal(summarize(resultado).pixBoleto.pendentes, 1)
})

// ── Eventos que chegam direto do webhook (tabela hotmart_eventos) ──────────────────────────────

function linhaBanco({ event = 'PURCHASE_APPROVED', id = 'ev1', data = {}, creation = Date.parse('2026-10-16T13:00:00Z'), ...resto } = {}) {
  return {
    event_id: id,
    evento: event,
    recebido_em: '2026-10-16T13:00:05Z',
    payload: {
      id,
      event,
      creation_date: creation,
      data: {
        product: { name: 'Mentoria Essentials' },
        buyer: { name: 'Ana Souza', email: 'Ana@X.com', checkout_phone: '63992125838', address: { city: 'Palmas', state: 'TO', country_iso: 'BR' } },
        purchase: {
          transaction: 'HP100',
          price: { value: 1497, currency_value: 'BRL' },
          payment: { type: 'PIX', installments_number: 1 },
          offer: { code: 'abc123' },
          origin: { src: 'live', xcod: 'x|ad_120212345678901234|y' },
        },
        ...data,
      },
      ...resto,
    },
  }
}

test('webhook vira o mesmo formato da planilha: categoria, origem, valor e pagamento', () => {
  const evento = eventoDoPayload(linhaBanco())
  assert.equal(evento.categoria, 'venda')
  assert.equal(evento.id, 'ev1')
  assert.equal(evento.data, '2026-10-16T13:00:00.000Z')
  assert.equal(evento.email, 'ana@x.com')
  assert.equal(evento.valor, 1497)
  assert.equal(evento.pagamento, 'PIX')
  assert.equal(evento.transacao, 'HP100')
  assert.equal(evento.campaignId, '120212345678901234')
  assert.equal(evento.canal, 'Meta Ads (pago)')
  assert.equal(evento.estado, 'TO')
})

test('webhook: categorias dos demais eventos', () => {
  const cat = (event) => eventoDoPayload(linhaBanco({ event }))?.categoria
  assert.equal(cat('PURCHASE_BILLET_PRINTED'), 'pix_boleto')
  assert.equal(cat('PURCHASE_OUT_OF_SHOPPING_CART'), 'abandono')
  assert.equal(cat('PURCHASE_CANCELED'), 'cancelamento')
  assert.equal(cat('PURCHASE_DELAYED'), 'cancelamento')
  assert.equal(cat('PURCHASE_REFUNDED'), 'reembolso')
  assert.equal(cat('PURCHASE_CHARGEBACK'), 'reembolso')
  assert.equal(cat('SUBSCRIPTION_CANCELLATION'), 'cancelamento')
  assert.equal(cat('PURCHASE_APPROVED'), 'venda')
  assert.equal(cat('SWITCH_PLAN'), undefined)
})

test('webhook: carrinho abandonado usa os campos buyer_* e e-mail de teste é ignorado', () => {
  const abandono = eventoDoPayload(
    linhaBanco({ event: 'PURCHASE_OUT_OF_SHOPPING_CART', data: { buyer: undefined, buyer_name: 'Bia', buyer_email: 'BIA@x.com', buyer_phone: '11999990000', purchase: undefined } }),
  )
  assert.equal(abandono.nome, 'Bia')
  assert.equal(abandono.email, 'bia@x.com')
  assert.equal(abandono.telefone, '11999990000')
  assert.equal(eventoDoPayload(linhaBanco({ data: { buyer: { email: 'x@teste.com' } } })), null)
})

test('webhook: compra em outra moeda fica sem valor em reais', () => {
  const evento = eventoDoPayload(linhaBanco({ data: { purchase: { transaction: 'HP9', price: { value: 50, currency_value: 'EUR' } } } }))
  assert.equal(evento.valor, null)
  assert.equal(evento.valorOriginal, 50)
})

test('juntar: evento da planilha repetido no banco (mesmo id ou mesma transação) não duplica', () => {
  const planilha = [
    normalizeEvent({ id_evento: 'ev1', data_hora: '2026-10-16 10:00:00', evento: 'compra_aprovada', email: 'a@x.com', transacao: 'HP100' }),
    normalizeEvent({ id_evento: 'outro-id', data_hora: '2026-10-16 10:00:05', evento: 'boleto_pix_gerado', email: 'a@x.com', transacao: 'HP200' }),
    normalizeEvent({ id_evento: 'velho', data_hora: '2026-09-01 10:00:00', evento: 'compra_aprovada', email: 'b@x.com', transacao: 'HP001' }),
  ]
  const banco = [
    eventoDoPayload(linhaBanco({ id: 'ev1' })),
    eventoDoPayload(linhaBanco({ id: 'ev2', event: 'PURCHASE_BILLET_PRINTED', data: { purchase: { transaction: 'HP200' } } })),
  ]
  const juntos = juntarEventos(planilha, banco)
  assert.equal(juntos.length, 3)
  assert.deepEqual(juntos.map((e) => e.id).sort(), ['ev1', 'ev2', 'velho'])
})

test('juntar: carrinho abandonado sem transação só repete se for a mesma pessoa em até 10 minutos', () => {
  const abandono = (id, hora) => normalizeEvent({ id_evento: id, data_hora: hora, evento: 'abandono_carrinho', email: 'ana@x.com' })
  const banco = [eventoDoPayload(linhaBanco({ id: 'ab1', event: 'PURCHASE_OUT_OF_SHOPPING_CART', data: { purchase: undefined } }))]
  // banco: 13:00Z = 10:00 em Brasília
  const juntos = juntarEventos([abandono('p1', '2026-10-16 10:00:30'), abandono('p2', '2026-10-16 15:00:00')], banco)
  assert.deepEqual(juntos.map((e) => e.id).sort(), ['ab1', 'p2'])
})

test('juntar: sem eventos no banco devolve a planilha como está', () => {
  const planilha = [normalizeEvent({ id_evento: 'a', data_hora: '2026-10-16 10:00:00', evento: 'compra_aprovada', email: 'a@x.com' })]
  assert.equal(juntarEventos(planilha, []), planilha)
})

test('evento novo do webhook entra nas situações: Pix do banco pago por venda do banco vira "pago"', () => {
  const eventos = [
    eventoDoPayload(linhaBanco({ id: 'p', event: 'PURCHASE_BILLET_PRINTED', creation: Date.parse('2026-10-17T10:00:00Z') })),
    eventoDoPayload(linhaBanco({ id: 'v', creation: Date.parse('2026-10-17T10:05:00Z') })),
  ]
  assert.equal(withSituations(eventos, AGORA, [])[0].situacao, 'pago')
})

test('compra_completa da mesma transação não vira segunda compra; sozinha continua valendo', async () => {
  const { semCompletaRepetida } = await import('./hotmartEvents.js')
  const base = { categoria: 'venda', email: 'a@x.com', data: '2026-10-20T10:00:00.000Z' }
  const lista = semCompletaRepetida([
    { ...base, id: '1', evento: 'compra_aprovada', transacao: 'HP1' },
    { ...base, id: '2', evento: 'compra_completa', transacao: 'HP1' },
    { ...base, id: '3', evento: 'compra_completa', transacao: 'HP2' },
  ])
  assert.deepEqual(lista.map((e) => e.id), ['1', '3'])
})

test('rotuloDoEvento: compra completa vira "garantia encerrada"; o resto segue o rótulo da categoria', async () => {
  const { rotuloDoEvento } = await import('./hotmartEvents.js')
  assert.match(rotuloDoEvento({ categoria: 'venda', evento: 'compra_completa' }), /Garantia encerrada/)
  assert.equal(rotuloDoEvento({ categoria: 'venda', evento: 'compra_aprovada' }), 'Compra aprovada')
  assert.equal(rotuloDoEvento({ categoria: 'abandono', evento: 'abandono_carrinho' }), 'Carrinho abandonado')
})
