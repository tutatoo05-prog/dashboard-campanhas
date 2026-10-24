import test from 'node:test'
import assert from 'node:assert/strict'
import { comprasComoLeads, comprasComoVendas, montarRegistros, registrosDosLeads } from './registrosHandler.js'

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
        if (/from purchases/.test(sql)) return { rows: [] }
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

const compra = (extras = {}) => ({ nome: 'Rafa', email: 'rafa@x.com', telefone: '5511911112222', campanha: 'essentials_live', src: '', created_at: new Date('2026-10-02T10:00:00Z'), ...extras })

test('compra com identificação live vai para Essentials · Live; membros para Membros; o resto fica de fora', () => {
  const linhas = comprasComoLeads([
    compra(),
    compra({ email: 'b@x.com', campanha: 'live' }),
    compra({ email: 'c@x.com', campanha: '', src: 'essentials_membros' }),
    compra({ email: 'd@x.com', campanha: 'essentials_a' }),
    compra({ email: 'e@x.com', campanha: '' }),
  ])
  assert.deepEqual(linhas.map((l) => l.slug), ['essentials-live', 'essentials-live', 'essentials-membros'])
  assert.equal(linhas[0].origem, 'essentials_live')
})

test('montarRegistros põe as compras live em Essentials · Live sem repetir quem já é lead de lá', async () => {
  const r = await montarRegistros(
    {},
    {
      esquema: async () => {},
      consultar: async (sql) => {
        if (/from purchases/.test(sql) && /curso/.test(sql)) return { rows: [] }
        if (/from purchases/.test(sql)) {
          return { rows: [compra(), compra({ nome: 'Ana Live', email: 'ana@x.com', telefone: '5511900000001', created_at: new Date('2026-10-05T10:00:00Z') })] }
        }
        return { rows: [lead({ slug: 'essentials-live', origem: 'essentials_live', nome: 'Ana Live', email: 'ana@x.com', telefone: '5511900000001', created_at: new Date('2026-10-01T10:00:00Z') })] }
      },
      hotmart: async () => ({ tabs: [], records: [] }),
      apagados: async (d) => d,
    },
  )
  const live = r.tabs.find((t) => t.planilha === 'Essentials' && t.aba === 'Live')
  assert.equal(live.count, 2) // Ana (lead, uma vez só) + Rafa (compra)
  const rafa = r.records.find((x) => x.nome === 'Rafa')
  assert.deepEqual([rafa.planilha, rafa.aba, rafa.canal], ['Essentials', 'Live', 'Compra (Hotmart)'])
})

test('se a leitura das compras falhar, os leads continuam aparecendo', async () => {
  const r = await montarRegistros(
    {},
    {
      esquema: async () => {},
      consultar: async (sql) => {
        if (/from purchases/.test(sql)) throw new Error('sem a coluna src')
        return { rows: [lead()] }
      },
      hotmart: async () => ({ tabs: [], records: [] }),
      apagados: async (d) => d,
    },
  )
  assert.equal(r.records.length, 1)
})

const venda = (extras = {}) => ({ nome: 'Leandro', email: 'leandro@x.com', telefone: '5511933334444', curso: 'Essentials', valor: '1497.00', campanha: 'essentials_live', created_at: new Date('2026-09-24T14:00:00Z'), ...extras })
const vendaHotmart = (extras = {}) => ({ aba: 'Vendas aprovadas', email: 'outro@x.com', telefone: '', data: '2026-10-09T10:00:00Z', ...extras })

test('compra antiga (sem evento da Hotmart) vira Venda aprovada, com produto e valor', () => {
  const [registro] = comprasComoVendas([venda()], [])
  assert.deepEqual([registro.planilha, registro.aba, registro.tipo], ['Hotmart', 'Vendas aprovadas', 'evento'])
  assert.deepEqual([registro.produto, registro.valor, registro.canal, registro.campanha], ['Essentials', 1497, 'Compra (dash)', 'essentials_live'])
  assert.equal(registro.data, '2026-09-24T14:00:00.000Z')
})

test('compra que já tem a venda da Hotmart (mesma pessoa, até 2 dias) não entra de novo', () => {
  const hotmart = [vendaHotmart({ email: 'leandro@x.com', data: '2026-09-25T10:00:00Z' })]
  assert.equal(comprasComoVendas([venda()], hotmart).length, 0)
  const porTelefone = [vendaHotmart({ email: 'outro@x.com', telefone: '+55 11 93333-4444', data: '2026-09-24T20:00:00Z' })]
  assert.equal(comprasComoVendas([venda()], porTelefone).length, 0)
})

test('mesma pessoa com uma compra muito depois da venda registrada conta como outra compra', () => {
  const hotmart = [vendaHotmart({ email: 'leandro@x.com', data: '2026-10-20T10:00:00Z' })]
  assert.equal(comprasComoVendas([venda()], hotmart).length, 1)
})

test('montarRegistros inclui as compras antigas em Hotmart · Vendas aprovadas e soma na contagem da aba', async () => {
  const r = await montarRegistros(
    {},
    {
      esquema: async () => {},
      consultar: async (sql) => {
        if (/from purchases/.test(sql) && /curso/.test(sql)) return { rows: [venda(), venda({ nome: 'Messias', email: 'm@x.com', telefone: '5511955556666' })] }
        if (/from purchases/.test(sql)) return { rows: [] }
        return { rows: [] }
      },
      hotmart: async () => ({
        tabs: [{ planilha: 'Hotmart', aba: 'Vendas aprovadas', tipo: 'evento', url: '', count: 1, error: null }],
        records: [{ planilha: 'Hotmart', aba: 'Vendas aprovadas', tipo: 'evento', nome: 'Ana', email: 'ana@x.com', telefone: '', data: '2026-10-09T10:00:00Z', canal: '', campanha: '', criativo: '' }],
      }),
      apagados: async (d) => d,
    },
  )
  assert.equal(r.tabs.find((t) => t.aba === 'Vendas aprovadas').count, 3)
  assert.equal(r.records.filter((x) => x.aba === 'Vendas aprovadas').length, 3)
})

test('se a leitura das compras como vendas falhar, o resto continua', async () => {
  const r = await montarRegistros(
    {},
    {
      esquema: async () => {},
      consultar: async (sql) => {
        if (/from purchases/.test(sql)) throw new Error('sem tabela')
        return { rows: [lead()] }
      },
      hotmart: async () => ({ tabs: [], records: [] }),
      apagados: async (d) => d,
    },
  )
  assert.equal(r.records.length, 1)
})
