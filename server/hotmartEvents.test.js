import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarize, withSituations } from './hotmartEvents.js'

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
