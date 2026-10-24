import test from 'node:test'
import assert from 'node:assert/strict'
import { garantirEsquemaDeLeads, reiniciarEsquema } from './esquema.js'

test('prepara todas as colunas que o cadastro grava, inclusive data_nascimento, e classifica as linhas antigas', async () => {
  reiniciarEsquema()
  const sqls = []
  const consultar = async (texto, params) => {
    sqls.push({ texto, params })
    if (/select distinct origem/.test(texto)) return { rows: [{ origem: 'workshop_irezumi_1' }, { origem: 'mentoria_particular' }] }
    return { rows: [] }
  }
  await garantirEsquemaDeLeads({}, consultar)
  const alters = sqls.filter((s) => /^alter table leads add column/.test(s.texto)).map((s) => s.texto)
  for (const coluna of ['data_nascimento', 'tipo', 'vertente', 'slug', 'respostas']) {
    assert.ok(alters.some((texto) => texto.includes(coluna)), coluna)
  }
  const updates = sqls.filter((s) => /^update leads/.test(s.texto))
  assert.deepEqual(updates.map((u) => u.params[2]), ['workirezumi', 'mentoria-particular'])
  reiniciarEsquema()
})

test('roda uma vez só por processo, mesmo chamado várias vezes ao mesmo tempo', async () => {
  reiniciarEsquema()
  let chamadas = 0
  const consultar = async (texto) => {
    if (/^alter table leads add column if not exists data_nascimento/.test(texto)) chamadas += 1
    return { rows: [] }
  }
  await Promise.all([garantirEsquemaDeLeads({}, consultar), garantirEsquemaDeLeads({}, consultar), garantirEsquemaDeLeads({}, consultar)])
  assert.equal(chamadas, 1)
  reiniciarEsquema()
})
