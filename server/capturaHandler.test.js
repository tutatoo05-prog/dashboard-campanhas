import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { CapturaInvalida, handleCapturaRequest, limparLimite, montarLead, origemDoEvento, registrarLead } from './capturaHandler.js'

const URL_ANUNCIO =
  'https://tuzinho.academy/lancamento/?fbclid=abc&utm_medium=paid&utm_source=ig&utm_id=120252783384070136&utm_content=120252783384080136&utm_term=120252783384090136&utm_campaign=120252783384070136'

const corpoValido = (extras = {}) => ({
  nome: ' Paulo Henrique ',
  email: 'Paulo@Gmail.com',
  telefone: '5562999842239',
  evento: 'irezumi-oriental',
  landing_url: URL_ANUNCIO,
  ...extras,
})

function chamar(env, { metodo = 'POST', origem = 'https://tuzinho.academy', corpo, consultar, ip } = {}) {
  const req = new EventEmitter()
  req.method = metodo
  req.url = '/api/captura'
  req.headers = { ...(origem ? { origin: origem } : {}), 'x-forwarded-for': ip ?? `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }
  req.socket = { remoteAddress: '127.0.0.1' }
  req.destroy = () => {}
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(nome, valor) {
      this.headers[nome] = valor
    },
    end(texto = '') {
      this.body = texto
      this.terminou?.()
    },
  }
  const pronto = new Promise((resolver) => {
    res.terminou = resolver
  })
  handleCapturaRequest(req, res, env, { consultar })
  setImmediate(() => {
    if (corpo !== undefined) req.emit('data', typeof corpo === 'string' ? corpo : JSON.stringify(corpo))
    req.emit('end')
  })
  return pronto.then(() => ({ status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : null }))
}

test('o evento da página vira a origem da tela Leads', () => {
  assert.equal(origemDoEvento('irezumi-oriental'), 'workshop_irezumi_1')
  assert.equal(origemDoEvento('Cobertura Cicatrização 09-09'), 'cobertura_cicatriza_o_09_09')
  assert.equal(origemDoEvento(''), 'site')
})

test('montarLead normaliza e lê as UTMs que vêm só no link da página', () => {
  const lead = montarLead(corpoValido(), new Date('2026-10-24T02:06:00Z'))
  assert.equal(lead.nome, 'Paulo Henrique')
  assert.equal(lead.email, 'paulo@gmail.com')
  assert.equal(lead.origem, 'workshop_irezumi_1')
  assert.equal(lead.campanha, '120252783384070136')
  assert.equal(lead.campaign_id, '120252783384070136')
  assert.equal(lead.ad_id, '120252783384080136')
  assert.equal(lead.criativo, '')
  assert.equal(lead.midia, 'paid')
  assert.equal(lead.veio_de, 'ig')
  assert.equal(lead.data, '23/10/2026') // 23:06 em São Paulo
  assert.match(lead.fonte_id, /^captura:/)
})

test('utm_content com nome (não ID) vira o criativo', () => {
  const lead = montarLead(corpoValido({ landing_url: '', utm_content: 'video-01' }))
  assert.equal(lead.criativo, 'video-01')
  assert.equal(lead.ad_id, '')
})

test('rejeita nome curto, telefone inválido e e-mail quebrado', () => {
  assert.throws(() => montarLead(corpoValido({ nome: 'A' })), CapturaInvalida)
  assert.throws(() => montarLead(corpoValido({ telefone: '123' })), CapturaInvalida)
  assert.throws(() => montarLead(corpoValido({ email: 'sem-arroba' })), CapturaInvalida)
  assert.doesNotThrow(() => montarLead(corpoValido({ email: '' })))
})

test('registrarLead: duplicado não insere, novo insere', async () => {
  const chamadas = []
  const lead = montarLead(corpoValido())
  const jaExiste = async (_env, sql) => (chamadas.push(sql), { rowCount: 1, rows: [{}] })
  assert.deepEqual(await registrarLead({}, lead, jaExiste), { status: 'duplicado' })
  assert.equal(chamadas.length, 1)

  const novo = []
  const naoExiste = async (_env, sql, params) => (novo.push({ sql, params }), { rowCount: 0, rows: [] })
  assert.deepEqual(await registrarLead({}, lead, naoExiste), { status: 'ok' })
  assert.equal(novo.length, 2)
  assert.match(novo[1].sql, /insert into leads/)
  assert.equal(novo[1].params[3], '5562999842239')
})

test('POST válido responde 200 e libera só a origem do site', async () => {
  const r = await chamar({}, { corpo: corpoValido(), consultar: async () => ({ rowCount: 0, rows: [] }) })
  assert.equal(r.status, 200)
  assert.equal(r.json.status, 'ok')
  assert.equal(r.headers['Access-Control-Allow-Origin'], 'https://tuzinho.academy')
})

test('preflight OPTIONS responde 204', async () => {
  const r = await chamar({}, { metodo: 'OPTIONS' })
  assert.equal(r.status, 204)
  assert.equal(r.headers['Access-Control-Allow-Origin'], 'https://tuzinho.academy')
})

test('origem de fora é recusada', async () => {
  const r = await chamar({}, { origem: 'https://site-malandro.com', corpo: corpoValido(), consultar: async () => ({ rowCount: 0 }) })
  assert.equal(r.status, 403)
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined)
})

test('CAPTURA_ORIGENS libera mais um site', async () => {
  const r = await chamar({ CAPTURA_ORIGENS: 'https://novo.exemplo.com' }, { origem: 'https://novo.exemplo.com', corpo: corpoValido(), consultar: async () => ({ rowCount: 0 }) })
  assert.equal(r.status, 200)
})

test('campo-isca preenchido finge sucesso e não grava', async () => {
  let gravou = false
  const r = await chamar({}, { corpo: corpoValido({ website: 'http://spam' }), consultar: async () => ((gravou = true), { rowCount: 0 }) })
  assert.equal(r.status, 200)
  assert.equal(gravou, false)
})

test('dados inválidos devolvem 400 com a mensagem', async () => {
  const r = await chamar({}, { corpo: corpoValido({ telefone: '1' }), consultar: async () => ({ rowCount: 0 }) })
  assert.equal(r.status, 400)
  assert.match(r.json.message, /WhatsApp/)
})

test('banco fora do ar: tenta duas vezes e devolve 503 (o site mostra o erro e mantém os dados)', async () => {
  let tentativas = 0
  const r = await chamar({}, { corpo: corpoValido(), consultar: async () => { tentativas += 1; throw new Error('db caiu') } })
  assert.equal(r.status, 503)
  assert.equal(tentativas, 2)
})

test('limite por IP: o 41º cadastro da mesma conexão em 10 min é barrado', async () => {
  limparLimite()
  const consultar = async () => ({ rowCount: 1, rows: [{}] })
  let ultimo
  for (let i = 0; i < 41; i += 1) ultimo = await chamar({}, { corpo: corpoValido(), consultar, ip: '203.0.113.9' })
  assert.equal(ultimo.status, 429)
})
