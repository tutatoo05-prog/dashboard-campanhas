import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chaveDoLead, limparNota, NotaInvalida } from './leadsHandler.js'

test('chave do lead: e-mail em minúsculas ou os 11 últimos dígitos do telefone', () => {
  assert.equal(chaveDoLead({ email: ' Ana@X.com ', telefone: '11988887777' }), 'e:ana@x.com')
  assert.equal(chaveDoLead({ email: '', telefone: '+55 (11) 98888-7777' }), 't:11988887777')
  assert.equal(chaveDoLead({ email: '', telefone: '' }), '')
})

test('limparNota aceita nota válida e normaliza as etiquetas', () => {
  const ok = limparNota({ chave: 'e:ana@x.com', nota: 'ligar amanhã', situacao: 'chamado', tags: [' VIP ', 'vip', '', 'Quente'] })
  assert.deepEqual(ok, { chave: 'e:ana@x.com', nota: 'ligar amanhã', situacao: 'chamado', tags: ['vip', 'quente'] })
})

test('limparNota recusa chave vazia e situação desconhecida', () => {
  assert.throws(() => limparNota({ chave: '', situacao: 'novo' }), NotaInvalida)
  assert.throws(() => limparNota({ chave: 'e:ana@x.com', situacao: 'comprou' }), NotaInvalida)
})

test('limparNota corta nota e etiquetas grandes demais', () => {
  const r = limparNota({ chave: 't:11988887777', nota: 'x'.repeat(5000), situacao: 'novo', tags: Array.from({ length: 30 }, (_, i) => `t${i}`) })
  assert.equal(r.nota.length, 2000)
  assert.equal(r.tags.length, 12)
})
