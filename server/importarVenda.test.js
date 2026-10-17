import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepararPayloadImportado } from './segurancaHandler.js'

const venda = { id: 'abc-123', event: 'PURCHASE_APPROVED', hottok: 'segredo-da-hotmart', data: { buyer: { email: 'a@x.com' }, purchase: { transaction: 'HP1' } } }

test('importar venda: aceita o JSON da Hotmart em texto ou objeto e tira o hottok', () => {
  for (const entrada of [JSON.stringify(venda, null, 2), venda]) {
    const { payload, erro } = prepararPayloadImportado(entrada)
    assert.equal(erro, undefined)
    assert.equal(payload.event, 'PURCHASE_APPROVED')
    assert.equal(payload.data.buyer.email, 'a@x.com')
    assert.ok(!('hottok' in payload), 'o segredo não pode ser guardado')
    assert.ok(!JSON.stringify(payload).includes('segredo-da-hotmart'))
  }
})

test('importar venda: recusa o que não é uma venda da Hotmart, com mensagem clara', () => {
  const erroDe = (entrada) => prepararPayloadImportado(entrada).erro
  assert.match(erroDe('isso não é json'), /JSON válido/)
  assert.match(erroDe('[1,2]'), /objeto/)
  assert.match(erroDe('null'), /objeto/)
  assert.match(erroDe(JSON.stringify({ data: {} })), /"event"/)
  assert.match(erroDe(JSON.stringify({ event: 'PURCHASE_APPROVED' })), /"data"/)
})
