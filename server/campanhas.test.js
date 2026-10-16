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
