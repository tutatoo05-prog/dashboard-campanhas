import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasEnded, mapObjective, mapStatus } from './metaApi.js'
import { evaluateRules } from './rulesEval.js'
import { analyzeCampaign, computeAverages } from '../src/lib/analysis.js'

test('objetivo: live/vídeo e alcance não são campanha de leads', () => {
  assert.equal(mapObjective('OUTCOME_ENGAGEMENT'), 'engagement')
  assert.equal(mapObjective('VIDEO_VIEWS'), 'engagement')
  assert.equal(mapObjective('OUTCOME_AWARENESS'), 'awareness')
  assert.equal(mapObjective('OUTCOME_LEADS'), 'leads')
  assert.equal(mapObjective('OUTCOME_TRAFFIC'), 'traffic')
  assert.equal(mapObjective('OUTCOME_SALES'), 'conversion')
})

test('status: data final vencida vira "Concluída"', () => {
  assert.equal(hasEnded('2020-01-01T00:00:00-0300'), true)
  assert.equal(hasEnded(new Date(Date.now() + 86_400_000).toISOString()), false)
  assert.equal(hasEnded(null), false)
  assert.equal(hasEnded('1969-12-31T21:00:00-0300'), false) // "sem data" da Meta
  assert.equal(mapStatus('ACTIVE', '2020-01-01T00:00:00-0300'), 'Concluída')
  assert.equal(mapStatus('ACTIVE', null), 'Ativa')
  assert.equal(mapStatus('PAUSED', '2020-01-01T00:00:00-0300'), 'Pausada')
})

const camp = (id, objective, spend, leads) => ({ id, name: id, status: 'Ativa', objective, spend, leads, clicks: 400, impressions: 20000, ctr: 2, cpc: 0.3, conversions: leads, frequency: 1.5 })

test('regras: campanha de engajamento sem leads não gera alerta nem entra na média', () => {
  const campaigns = [camp('live', 'engagement', 80, 0), camp('lp', 'traffic', 100, 20), camp('lp-sem-lead', 'traffic', 70, 0)]
  const regras = [{ id: 'r1', type: 'spend_no_leads', params: { amount: 50 } }]
  const alertas = evaluateRules(regras, { campaigns, today: '2026-10-16' })
  assert.deepEqual(alertas.map((a) => a.campaignId), ['lp-sem-lead'])
})

test('análise: campanha de engajamento não vira "pausar" por não ter lead', () => {
  const itens = [camp('live', 'engagement', 80, 0), camp('lp', 'traffic', 100, 20), camp('lp2', 'traffic', 90, 18)]
  const analise = analyzeCampaign(itens[0], computeAverages(itens), itens)
  assert.equal(analise.verdict, 'monitor')
  assert.equal(analise.primary.label, 'Engajamento')
})

import { inferirTipo } from '../src/lib/campaignType.js'

test('tipo: descobre sozinho a partir do que a Meta informa', () => {
  const casos = [
    [{ objetivoBruto: 'OUTCOME_ENGAGEMENT', otimizacoes: ['THRUPLAY'], destinos: ['INSTAGRAM_LIVE'] }, 'live', 'alta'],
    [{ objetivoBruto: 'OUTCOME_LEADS', otimizacoes: ['LEAD_GENERATION'] }, 'captacao', 'alta'],
    [{ objetivoBruto: 'OUTCOME_SALES', eventos: ['PURCHASE'] }, 'venda', 'alta'],
    [{ objetivoBruto: 'OUTCOME_ENGAGEMENT', destinos: ['WHATSAPP'] }, 'conversas', 'alta'],
    [{ objetivoBruto: 'OUTCOME_AWARENESS', otimizacoes: ['REACH'] }, 'reconhecimento', 'alta'],
    [{ objetivoBruto: 'OUTCOME_ENGAGEMENT', otimizacoes: ['POST_ENGAGEMENT'] }, 'engajamento', 'alta'],
    // tráfego: depende do destino do anúncio
    [{ objetivoBruto: 'OUTCOME_TRAFFIC', otimizacoes: ['LANDING_PAGE_VIEWS'], links: ['https://tuzinho.academy/produtos/essentials/'] }, 'captacao', 'media'],
    [{ objetivoBruto: 'OUTCOME_TRAFFIC', otimizacoes: ['LINK_CLICKS'], links: ['http://instagram.com/tuzinhoacademy/live'] }, 'engajamento', 'media'],
    [{ objetivoBruto: 'OUTCOME_TRAFFIC', otimizacoes: ['LINK_CLICKS'], links: ['https://outrosite.com/x'], leadsSite: 12 }, 'captacao', 'media'],
    [{ objetivoBruto: 'OUTCOME_TRAFFIC', otimizacoes: ['LINK_CLICKS'], links: ['https://outrosite.com/x'] }, 'indefinido', 'baixa'],
    [{}, 'indefinido', 'baixa'],
  ]
  for (const [info, tipo, confianca] of casos) {
    const r = inferirTipo(info)
    assert.equal(r.tipo, tipo, JSON.stringify(info))
    assert.equal(r.confianca, confianca, JSON.stringify(info))
    assert.ok(r.motivo.length > 10)
  }
})

test('tipo: o escolhido pelo usuário manda sobre o automático', async () => {
  const { aplicarFichas } = await import('./fichas.js')
  const linhas = [{ id: '1', campaignId: '1', tipo: 'indefinido', tipoOrigem: 'automatico' }, { id: '2', campaignId: '2', tipo: 'captacao', tipoOrigem: 'automatico' }]
  const saida = aplicarFichas(linhas, new Map([['1', { tipo: 'live', metaCusto: 0.05 }]]))
  assert.equal(saida[0].tipo, 'live')
  assert.equal(saida[0].tipoOrigem, 'manual')
  assert.equal(saida[0].metaCusto, 0.05)
  assert.equal(saida[1].tipo, 'captacao')
})

test('análise: live fica fora da média e do custo por lead da conta', async () => {
  const { computeSummary } = await import('../src/lib/analysis.js')
  const base = { status: 'Ativa', impressions: 20000, reach: 15000, clicks: 400, ctr: 2, cpc: 0.4, conversions: 0, cpa: 0, frequency: 1.4 }
  const itens = [
    { ...base, id: 'a', name: 'Captação', objective: 'traffic', tipo: 'captacao', spend: 200, leads: 20, cpl: 10 },
    { ...base, id: 'b', name: 'Live', objective: 'engagement', tipo: 'live', spend: 100, leads: 0, cpl: 0 },
  ]
  const resumo = computeSummary(itens, {})
  assert.equal(resumo.totals.spend, 300)
  assert.equal(resumo.totals.cpl, 10) // 200 / 20, sem o gasto da live
  const live = resumo.enriched.find((item) => item.id === 'b')
  assert.equal(live.analysis.verdict, 'monitor')
  assert.equal(live.analysis.primary.label, 'Live / vídeo')
})
