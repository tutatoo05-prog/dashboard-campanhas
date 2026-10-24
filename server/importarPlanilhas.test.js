import test from 'node:test'
import assert from 'node:assert/strict'
import { canalParaOrigem, planejar } from './importarPlanilhas.js'
import { resolveChannel } from './registrosUtil.js'

const reg = (planilha, aba, nome, email, telefone, data, extras = {}) => ({ planilha, aba, tipo: 'lead', nome, email, telefone, data, canal: 'Sem rastreamento', campanha: '', criativo: '', ...extras })

test('cada aba vai para o projeto certo; interessados e Irezumi viram o mesmo', () => {
  const registros = [
    reg('Dados Academy', 'Prompt', 'P', 'p@x.com', '5511911111111', '2026-08-01T10:00:00Z'),
    reg('Dados Academy', 'interessados - lp', 'I', 'i@x.com', '5511922222222', '2026-10-01T10:00:00Z'),
    reg('Workshop Irezumi - 1ª edição', 'leads', 'I', 'i@x.com', '5511922222222', '2026-10-01T10:00:01Z'),
    reg('Work gratuito Leão - 2ª edição', 'Dados', 'L', 'l@x.com', '5511933333333', '2026-08-20T10:00:00Z'),
    reg('Dashboard campanhas', 'Work Cobertura', 'C', 'c@x.com', '5511944444444', '2026-07-10T10:00:00Z'),
    reg('Dados Academy', 'particular', 'M', 'm@x.com', '5511955555555', '2026-10-08T10:00:00Z'),
    reg('Tracking Essentials', 'Leads reprovados', 'R', 'r@x.com', '5511966666666', '2026-10-09T10:00:00Z'),
  ]
  const { linhas, porProjeto, repetidos } = planejar(registros, [])
  assert.deepEqual(porProjeto, { workcobertura: 1, workprompt: 1, workleao2: 1, workirezumi: 1, 'mentoria-particular': 1 })
  assert.equal(repetidos, 1)
  assert.equal(linhas.length, 5)
  assert.ok(linhas.every((l) => l.fonte_id.startsWith('planilha:')))
  const irezumi = linhas.find((l) => l.slug === 'workirezumi')
  assert.deepEqual([irezumi.tipo, irezumi.origem], ['workshop', 'workshop_irezumi_1'])
})

test('não repete quem já está no banco no mesmo projeto, por e-mail ou por telefone', () => {
  const existentes = [{ slug: 'essentials', email: 'a@x.com', telefone: '5511911111111' }]
  const registros = [
    reg('Dados Academy', 'Essentials', 'A', 'A@x.com', '000', '2026-08-01T10:00:00Z'),
    reg('Dashboard campanhas', 'Geral', 'A2', 'outro@x.com', '+55 11 91111-1111', '2026-08-02T10:00:00Z'),
    reg('Dashboard campanhas', 'Geral', 'B', 'b@x.com', '5511922222222', '2026-08-03T10:00:00Z'),
  ]
  const { linhas } = planejar(registros, existentes)
  assert.deepEqual(linhas.map((l) => l.nome), ['B'])
})

test('a mesma pessoa em projetos diferentes entra nos dois', () => {
  const registros = [
    reg('Dados Academy', 'Essentials', 'A', 'a@x.com', '5511911111111', '2026-08-01T10:00:00Z'),
    reg('Dados Academy', 'Prompt', 'A', 'a@x.com', '5511911111111', '2026-08-02T10:00:00Z'),
  ]
  assert.deepEqual(planejar(registros, []).linhas.map((l) => l.slug).sort(), ['essentials', 'workprompt'])
})

test('sem e-mail nem telefone não entra; campanha numérica vira campaign_id; data e fonte_id são estáveis', () => {
  const registros = [
    reg('Dados Academy', 'Essentials', 'Sem contato', '', '', '2026-08-01T10:00:00Z'),
    reg('Dados Academy', 'Essentials', 'Ana', 'ana@x.com', '55 11 91111-1111', '2026-08-01T15:00:00Z', { campanha: 'ID 120252783384070136', canal: 'Meta Ads (pago)' }),
  ]
  const a = planejar(registros, [])
  const b = planejar(registros, [])
  assert.equal(a.semContato, 1)
  assert.equal(a.linhas.length, 1)
  const l = a.linhas[0]
  assert.deepEqual(
    [l.campaign_id, l.campanha, l.veio_de, l.midia, l.telefone, l.data],
    ['120252783384070136', '120252783384070136', 'meta', 'paid', '5511911111111', '01/08/2026'],
  )
  assert.equal(l.fonte_id, b.linhas[0].fonte_id)
  assert.equal(Object.keys(l).length, 15)
})

test('o rótulo do canal volta igual depois de ir e voltar pelo banco', () => {
  for (const canal of ['Meta Ads (pago)', 'Orgânico', 'Instagram · DM', 'Instagram · Feed', 'Instagram · Bio', 'Instagram (orgânico)', 'Sem rastreamento']) {
    const { veio_de, midia } = canalParaOrigem(canal)
    assert.equal(resolveChannel(veio_de, midia, ''), canal, canal)
  }
})
