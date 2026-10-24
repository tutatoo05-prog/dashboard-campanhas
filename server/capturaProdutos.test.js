import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { handleCapturaRequest, limparLimite, montarLead, slugDoCorpo } from './capturaHandler.js'

// Corpo como o lead-modal do Essentials manda (shared/components/lead-modal.js).
const essentials = (extras = {}) => ({
  product: 'essentials',
  variante: 'live',
  nome: 'Maria da Silva',
  email: 'Maria@x.com',
  telefone: '+5511988887777',
  pais: 'br',
  data_nascimento: '1990-05-17',
  tipo: 'lead',
  lead_id: 'abc',
  atribuicao: { utm_source: 'ig', utm_medium: 'paid', utm_campaign: '120252783384070136', utm_content: '120252783384080136', utm_id: '120252783384070136' },
  utm: { utm_source: 'fb' },
  submitted_at: '2026-10-24T10:00:00Z',
  source_url: 'https://tuzinho.academy/produtos/live/?x=1',
  ...extras,
})

// Corpo como a aplicação da mentoria manda (pages/particular/src/form.js).
const mentoria = (extras = {}) => ({
  product: 'mentoria-particular',
  nome: 'João',
  email: 'joao@x.com',
  whatsapp: '5511977776666',
  instagram: '@joao',
  experiencia: '2 anos',
  faturamento: 'ate-3k',
  qualificado: true,
  desqualificado_por: [],
  utm: { utm_source: 'ig', utm_campaign: 'camp' },
  source_url: 'https://tuzinho.academy/produtos/particular/',
  ...extras,
})

test('produto + variante viram o slug certo (Live e Membros são vertentes do Essentials)', () => {
  assert.equal(slugDoCorpo(essentials({ variante: 'live' })), 'essentials-live')
  assert.equal(slugDoCorpo(essentials({ variante: 'membros' })), 'essentials-membros')
  assert.equal(slugDoCorpo(essentials({ variante: 'hero-v1_b' })), 'essentials')
  assert.equal(slugDoCorpo(mentoria()), 'mentoria-particular')
  assert.equal(slugDoCorpo({ slug: 'workirezumi', product: 'essentials' }), 'workirezumi')
})

test('lead do Essentials: contato, UTMs aninhadas, nascimento e vertente', () => {
  const lead = montarLead(essentials(), new Date('2026-10-24T13:00:00Z'))
  assert.deepEqual([lead.slug, lead.tipo, lead.vertente, lead.origem], ['essentials-live', 'essentials', 'live', 'essentials_live'])
  assert.equal(lead.telefone, '5511988887777')
  assert.equal(lead.email, 'maria@x.com')
  assert.equal(lead.data_nascimento, '1990-05-17')
  assert.deepEqual([lead.veio_de, lead.midia, lead.campaign_id, lead.ad_id], ['ig', 'paid', '120252783384070136', '120252783384080136'])
  assert.equal(lead.landing_url, 'https://tuzinho.academy/produtos/live/?x=1')
})

test('lead da mentoria: WhatsApp, respostas guardadas e tipo mentoria', () => {
  const lead = montarLead(mentoria())
  assert.deepEqual([lead.slug, lead.tipo, lead.telefone], ['mentoria-particular', 'mentoria', '5511977776666'])
  assert.equal(lead.respostas.instagram, '@joao')
  assert.equal(lead.respostas.qualificado, true)
  assert.deepEqual(lead.respostas.desqualificado_por, [])
  assert.equal('email' in lead.respostas, false)
  assert.equal('utm' in lead.respostas, false)
})

function chamar(env, caminho, corpo, consultar) {
  limparLimite()
  const req = new EventEmitter()
  req.method = 'POST'
  req.url = caminho
  req.headers = { origin: 'https://tuzinho.academy', 'x-forwarded-for': '10.9.8.7' }
  req.socket = { remoteAddress: '127.0.0.1' }
  req.destroy = () => {}
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(n, v) {
      this.headers[n] = v
    },
    end(t = '') {
      this.body = t
      this.fim?.()
    },
  }
  const pronto = new Promise((resolver) => {
    res.fim = resolver
  })
  handleCapturaRequest(req, res, env, { consultar, esquema: async () => {} })
  setImmediate(() => {
    req.emit('data', JSON.stringify(corpo))
    req.emit('end')
  })
  return pronto.then(() => ({ status: res.statusCode, json: JSON.parse(res.body) }))
}

test('resposta compatível com os formulários dos produtos: duplicate true/false', async () => {
  const novo = await chamar({}, '/api/captura', essentials(), async () => ({ rowCount: 0, rows: [] }))
  assert.deepEqual([novo.status, novo.json.status, novo.json.duplicate, novo.json.ok], [200, 'ok', false, true])
  const repetido = await chamar({}, '/api/captura', essentials(), async () => ({ rowCount: 1, rows: [{}] }))
  assert.deepEqual([repetido.json.status, repetido.json.duplicate], ['duplicado', true])
})

test('evento de navegação (tipo diferente de lead) é ignorado, não vira cadastro', async () => {
  let gravou = false
  const r = await chamar({}, '/api/captura', { ...essentials(), tipo: 'exposicao' }, async () => ((gravou = true), { rowCount: 0 }))
  assert.equal(r.json.status, 'ignorado')
  assert.equal(gravou, false)
})

test('/api/captura/existe responde se já há cadastro no projeto', async () => {
  let consulta
  const sim = await chamar({}, '/api/captura/existe', { product: 'mentoria-particular', email: 'Joao@x.com', whatsapp: '5511977776666' }, async (_env, sql, params) => {
    consulta = { sql, params }
    return { rowCount: 1, rows: [{}] }
  })
  assert.equal(sim.json.exists, true)
  assert.deepEqual(consulta.params, ['mentoria-particular', 'joao@x.com', '5511977776666'])
  assert.match(consulta.sql, /slug = \$1/)
  const nao = await chamar({}, '/api/captura/existe', { product: 'mentoria-particular', email: 'z@x.com' }, async () => ({ rowCount: 0, rows: [] }))
  assert.equal(nao.json.exists, false)
})
