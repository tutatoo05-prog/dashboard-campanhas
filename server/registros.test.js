import test from 'node:test'
import assert from 'node:assert/strict'
import { montarRegistros, registrosDosLeads } from './registrosHandler.js'

const lead = (extras = {}) => ({
  nome: 'Ana',
  email: 'ana@x.com',
  telefone: '5511911111111',
  origem: 'workshop_irezumi_1',
  slug: 'workirezumi',
  campanha: '',
  midia: '',
  veio_de: '',
  criativo: '',
  created_at: new Date('2026-10-20T10:00:00Z'),
  ...extras,
})

test('agrupa por tipo e projeto, na ordem do catálogo', () => {
  const { tabs, records } = registrosDosLeads([
    lead({ slug: 'workirezumi', email: 'a@x.com', telefone: '5511900000001' }),
    lead({ slug: 'mentoria-particular', origem: 'mentoria_particular', email: 'b@x.com', telefone: '5511900000002' }),
    lead({ slug: 'essentials-live', origem: 'essentials_live', email: 'c@x.com', telefone: '5511900000003' }),
    lead({ slug: 'essentials', origem: 'essentials', email: 'd@x.com', telefone: '5511900000004' }),
  ])
  assert.deepEqual(
    tabs.map((t) => `${t.planilha} / ${t.aba}`),
    ['Essentials / Geral', 'Essentials / Live', 'Workshops / Irezumi', 'Mentoria particular / Particular'],
  )
  assert.deepEqual(tabs.map((t) => t.count), [1, 1, 1, 1])
  assert.equal(records.length, 4)
  assert.ok(tabs.every((t) => t.url === '' && t.tipo === 'lead'))
})

test('quem aparece duas vezes no mesmo projeto conta uma vez; em projetos diferentes, conta em cada', () => {
  const { tabs, records } = registrosDosLeads([
    lead({ created_at: new Date('2026-10-01T10:00:00Z') }),
    lead({ email: 'outro@x.com', created_at: new Date('2026-10-02T10:00:00Z') }),
    lead({ telefone: '5511999999999', created_at: new Date('2026-10-03T10:00:00Z') }),
    lead({ slug: 'workprompt', origem: 'prompt' }),
  ])
  assert.equal(records.length, 2)
  assert.deepEqual(tabs.map((t) => [t.aba, t.count]), [['Irezumi', 1], ['Prompt', 1]])
})

test('linha sem slug (antes da migração) é classificada pela origem; slug novo vira grupo próprio', () => {
  const { tabs } = registrosDosLeads([
    lead({ slug: null, origem: 'mentoria_particular', email: 'm@x.com', telefone: '5511900000010' }),
    lead({ slug: 'workgrafismo3', origem: 'workgrafismo3', email: 'g@x.com', telefone: '5511900000011' }),
    lead({ slug: 'campanha-x', origem: 'campanha_x', email: 'x@x.com', telefone: '5511900000012' }),
  ])
  assert.deepEqual(
    tabs.map((t) => `${t.planilha} / ${t.aba}`),
    ['Mentoria particular / Particular', 'Workshops / Workgrafismo3', 'Outros / Campanha x'],
  )
})

test('o registro traz canal, campanha e data como a tela já espera', () => {
  const { records } = registrosDosLeads([lead({ veio_de: 'meta', midia: 'paid', campanha: '120252783384070136' })])
  assert.deepEqual([records[0].canal, records[0].campanha, records[0].data], ['Meta Ads (pago)', 'ID 120252783384070136', '2026-10-20T10:00:00.000Z'])
})

test('montarRegistros junta leads e Hotmart e aplica o que foi apagado', async () => {
  let pedidoSql = ''
  const r = await montarRegistros(
    {},
    {
      esquema: async () => {},
      consultar: async (sql) => {
        pedidoSql = sql
        return { rows: [lead()] }
      },
      hotmart: async () => ({
        tabs: [{ planilha: 'Hotmart', aba: 'Vendas aprovadas', tipo: 'evento', url: '', count: 1, error: null }],
        records: [{ planilha: 'Hotmart', aba: 'Vendas aprovadas', tipo: 'evento', nome: 'Ana', email: 'ana@x.com', telefone: '', data: '2026-10-21T00:00:00Z', canal: '', campanha: '', criativo: '' }],
      }),
      apagados: async (dados) => ({ ...dados, apagadosAplicado: true }),
    },
  )
  assert.match(pedidoSql, /from leads/)
  assert.equal(r.records.length, 2)
  assert.deepEqual(r.tabs.map((t) => t.planilha), ['Workshops', 'Hotmart'])
  assert.equal(r.apagadosAplicado, true)
})
