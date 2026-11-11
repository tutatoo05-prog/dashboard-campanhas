import test from 'node:test'
import assert from 'node:assert/strict'
import { somarHotmartPorMes } from './fontes.js'
import { montarResumo } from './resumo.js'
import { lancamentosDaPlanilha } from './historico.js'
import { mesesEntre } from './linhas.js'

test('mesesEntre atravessa a virada de ano', () => {
  assert.deepEqual(mesesEntre('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02'])
})

test('somarHotmartPorMes: líquido = base - taxa, só aprovadas em BRL, por mês de São Paulo', () => {
  const venda = (status, quando, base, taxa, moeda = 'BRL') => ({
    purchase: { status, approved_date: Date.parse(quando), price: { value: base, currency_code: moeda }, hotmart_fee: { base, total: taxa } },
  })
  const { porMes, ignoradas } = somarHotmartPorMes([
    venda('APPROVED', '2026-11-05T15:00:00Z', 100, 10),
    venda('COMPLETE', '2026-11-20T15:00:00Z', 200, 20),
    venda('REFUNDED', '2026-11-06T15:00:00Z', 999, 99),
    venda('APPROVED', '2026-11-07T15:00:00Z', 50, 5, 'USD'),
    venda('APPROVED', '2026-12-01T01:00:00Z', 300, 30), // 30/11 22h em São Paulo
  ])
  assert.equal(porMes['2026-11'], 270 + 270)
  assert.equal(porMes['2026-12'], undefined)
  assert.equal(ignoradas, 1)
})

test('a carga da planilha reproduz os totais, lucro e indicadores da planilha', () => {
  const resumo = montarResumo(lancamentosDaPlanilha(2026, { comHotmart: true }).map((l) => ({ ...l, origem: 'planilha' })), 2026, 41635.32)
  assert.equal(resumo.totalReceita[0], 10489.39) // janeiro
  assert.equal(resumo.totalReceita[9], 22917.2) // outubro (a planilha mostra 22.917,19: diferença de 1 centavo de arredondamento dela)
  assert.equal(resumo.lucro[0], 3838.32)
  assert.equal(resumo.lucro[9], 15329.7)
  assert.equal(resumo.mesesSobrevivencia, 5)
  assert.equal(resumo.faltamPara12Meses, 49414.68)
  assert.deepEqual(resumo.recordes.mes, { mes: "2026-10", valor: 22917.2 })
})
