import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agruparRegistros } from './mergeRegistros.ts'

function linha(parcial) {
  return {
    planilha: 'Tracking Essentials',
    tipo: 'lead',
    nome: '',
    email: '',
    telefone: '',
    data: '',
    canal: '',
    campanha: '',
    criativo: '',
    ...parcial,
  }
}

test('lead repetido + Pix gerado + venda aprovada viram uma pessoa só, com linha do tempo', () => {
  const pessoas = agruparRegistros([
    linha({ aba: 'Leads repetidos', nome: 'Divino', email: 'Divino@Gmail.com', data: '2026-10-15T10:00:00Z', canal: 'Orgânico', campanha: 'Orgânico' }),
    linha({ aba: 'Boleto e Pix gerados', tipo: 'evento', nome: 'Divino Werdson', telefone: '+55 63 99212-5838', email: 'divino@gmail.com', data: '2026-10-16T20:00:00Z', canal: 'Sem rastreamento', valor: 136, evento: 'Pix gerado' }),
    linha({ aba: 'Vendas aprovadas', tipo: 'evento', nome: 'Divino Werdson reis', telefone: '5563992125838', data: '2026-10-16T21:03:00Z', canal: 'Sem rastreamento', valor: 136.01, evento: 'Compra aprovada', produto: 'Mentoria Essentials' }),
  ])
  assert.equal(pessoas.length, 1)
  const [divino] = pessoas
  assert.equal(divino.historico.length, 3)
  assert.equal(divino.historico[0].aba, 'Vendas aprovadas') // mais recente primeiro
  assert.equal(divino.status, 'comprou')
  assert.equal(divino.nome, 'Divino Werdson reis')
  assert.equal(divino.canal, 'Orgânico') // origem = primeiro contato rastreado, não o evento "Sem rastreamento"
  assert.equal(divino.campanha, 'Orgânico')
  assert.equal(divino.valor, 136.01)
  assert.equal(divino.aparece.length, 3)
  assert.equal(divino.primeiraEm, '2026-10-15T10:00:00.000Z')
  assert.equal(divino.ultimaEm, '2026-10-16T21:03:00.000Z')
})

test('pessoas diferentes continuam separadas', () => {
  const pessoas = agruparRegistros([
    linha({ aba: 'Leads novos', nome: 'Ana', email: 'ana@x.com' }),
    linha({ aba: 'Leads novos', nome: 'Bia', email: 'bia@x.com', telefone: '11988887777' }),
    linha({ aba: 'Leads novos', nome: 'Carla', telefone: '11977776666' }),
  ])
  assert.equal(pessoas.length, 3)
  assert.ok(pessoas.every((pessoa) => pessoa.status === 'lead'))
})

test('o mesmo lead em duas planilhas vira um registro com as duas abas', () => {
  const pessoas = agruparRegistros([
    linha({ planilha: 'Dados Academy', aba: 'Essentials', email: 'a@a.com', nome: 'A', data: '2026-10-01T10:00:00Z' }),
    linha({ planilha: 'Dashboard campanhas', aba: 'Geral', email: 'a@a.com', nome: 'A', data: '2026-10-02T10:00:00Z' }),
  ])
  assert.equal(pessoas.length, 1)
  assert.equal(pessoas[0].aparece.length, 2)
})

test('e-mail e telefone em linhas diferentes ligam a mesma pessoa', () => {
  const pessoas = agruparRegistros([
    linha({ aba: 'Leads novos', email: 'z@z.com', telefone: '(11) 98888-7777' }),
    linha({ aba: 'Carrinho abandonado', tipo: 'evento', telefone: '5511988887777' }),
    linha({ aba: 'Leads repetidos', email: 'z@z.com' }),
  ])
  assert.equal(pessoas.length, 1)
  assert.equal(pessoas[0].historico.length, 3)
  assert.equal(pessoas[0].status, 'abandonou')
})
