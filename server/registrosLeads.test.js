import test from 'node:test'
import assert from 'node:assert/strict'
import { comLeadsDoBanco } from './registrosHandler.js'

const IRE = 'Workshop Irezumi - 1ª edição'

const dadosBase = () => ({
  tabs: [{ planilha: IRE, aba: 'leads', tipo: 'lead', url: 'https://docs.google.com/x', count: 1, error: null }],
  records: [{ planilha: IRE, aba: 'leads', tipo: 'lead', nome: 'Ana', email: 'ana@x.com', telefone: '55 11 91111-1111', data: '2026-10-20T10:00:00.000Z', canal: 'Meta Ads (pago)', campanha: '', criativo: '' }],
})

const lead = (extras = {}) => ({
  nome: 'Paulo',
  email: 'paulo@x.com',
  telefone: '5562999842239',
  origem: 'workshop_irezumi_1',
  campanha: '120252783384070136',
  midia: 'paid',
  veio_de: 'ig',
  criativo: '',
  created_at: new Date('2026-10-24T02:00:00Z'),
  ...extras,
})

const consultarCom = (...linhas) => async () => ({ rows: linhas })

test('lead do banco entra na aba da planilha certa e soma na contagem', async () => {
  const r = await comLeadsDoBanco(dadosBase(), {}, consultarCom(lead()))
  assert.equal(r.records.length, 2)
  const novo = r.records[1]
  assert.deepEqual([novo.planilha, novo.aba, novo.tipo, novo.nome], [IRE, 'leads', 'lead', 'Paulo'])
  assert.equal(novo.campanha, 'ID 120252783384070136')
  assert.equal(novo.data, '2026-10-24T02:00:00.000Z')
  assert.equal(r.tabs[0].count, 2)
})

test('quem já está na aba (mesmo e-mail ou telefone, em outro formato) não entra de novo', async () => {
  const porEmail = await comLeadsDoBanco(dadosBase(), {}, consultarCom(lead({ email: 'ANA@x.com', telefone: '5500000000000' })))
  assert.equal(porEmail.records.length, 1)
  const porTelefone = await comLeadsDoBanco(dadosBase(), {}, consultarCom(lead({ email: 'outro@x.com', telefone: '5511911111111' })))
  assert.equal(porTelefone.records.length, 1)
})

test('o mesmo lead repetido no banco entra uma vez só', async () => {
  const r = await comLeadsDoBanco(dadosBase(), {}, consultarCom(lead(), lead()))
  assert.equal(r.records.length, 2)
  assert.equal(r.tabs[0].count, 2)
})

test('formulário sem planilha vai para "Formulários do dash" com aba própria e sem link', async () => {
  const r = await comLeadsDoBanco(dadosBase(), {}, consultarCom(lead({ origem: 'workshop_novo_2' })))
  const novo = r.records.at(-1)
  assert.deepEqual([novo.planilha, novo.aba], ['Formulários do dash', 'Workshop novo 2'])
  const aba = r.tabs.find((t) => t.planilha === 'Formulários do dash')
  assert.deepEqual([aba.url, aba.count, aba.error], ['', 1, null])
})

test('interessados e cobertura caem nas abas que já existem', async () => {
  const dados = {
    tabs: [
      { planilha: 'Dados Academy', aba: 'interessados - lp', tipo: 'lead', url: 'u', count: 0, error: null },
      { planilha: 'Dashboard campanhas', aba: 'Work Cobertura', tipo: 'lead', url: 'u', count: 0, error: null },
    ],
    records: [],
  }
  const r = await comLeadsDoBanco(dados, {}, consultarCom(lead({ origem: 'lancamento_interessados' }), lead({ origem: 'cobertura_cicatrizacao_09_09', email: 'b@x.com', telefone: '5511922222222' })))
  assert.deepEqual(r.tabs.map((t) => t.count), [1, 1])
  assert.equal(r.tabs.length, 2)
})

test('sem leads diretos, falha na consulta ou sem env: devolve os dados como estavam', async () => {
  const dados = dadosBase()
  assert.equal(await comLeadsDoBanco(dados, {}, consultarCom()), dados)
  assert.equal(await comLeadsDoBanco(dados, {}, async () => { throw new Error('db caiu') }), dados)
  assert.equal(await comLeadsDoBanco(dados, null), dados)
})
