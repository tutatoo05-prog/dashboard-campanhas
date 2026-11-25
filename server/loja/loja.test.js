import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { chamarLoja, emailEnvio, escapeHtml, handleLojaRequest, lojaConfigurada } from './handler.js'

const ENV = { LOJA_API_URL: 'https://loja.exemplo.com', LOJA_ADMIN_KEY: 'k'.repeat(40), BREVO_API_KEY: 'brevo', BREVO_REMETENTE_EMAIL: 'nao-responda@exemplo.com' }

function pedido(method, url, corpo) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  setImmediate(() => {
    if (corpo !== undefined) req.emit('data', Buffer.from(JSON.stringify(corpo)))
    req.emit('end')
  })
  return req
}
function resposta() {
  const r = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v }, end(t) { this.body = t } }
  return r
}
const json = (r) => JSON.parse(r.body)
const fake = (status, dados, chamadas = []) => async (url, opts) => {
  chamadas.push({ url: String(url), opts })
  return { status, ok: status < 400, json: async () => dados, text: async () => JSON.stringify(dados) }
}

test('sem LOJA_API_URL e chave, responde 503 e não chama a loja', async () => {
  assert.equal(lojaConfigurada({}), false)
  const res = resposta()
  await handleLojaRequest(pedido('GET', '/api/loja?a=overview'), res, {}, { email: 'a@b.com' }, fake(200, {}))
  assert.equal(res.statusCode, 503)
  assert.equal(json(res).code, 'LOJA_NAO_CONFIGURADA')
})

test('GET: só repassa ações e campos permitidos, com a chave e o autor', async () => {
  const chamadas = []
  const res = resposta()
  await handleLojaRequest(pedido('GET', '/api/loja?a=orders&status=paid&q=ana&evil=1'), res, ENV, { email: 'ygor@x.com' }, fake(200, { orders: [] }, chamadas))
  assert.equal(res.statusCode, 200)
  const u = new URL(chamadas[0].url)
  assert.equal(u.pathname, '/api/admin')
  assert.equal(u.searchParams.get('status'), 'paid')
  assert.equal(u.searchParams.has('evil'), false)
  assert.equal(chamadas[0].opts.headers['x-admin-key'], ENV.LOJA_ADMIN_KEY)
  assert.equal(chamadas[0].opts.headers['x-admin-actor'], 'ygor@x.com')

  const res2 = resposta()
  await handleLojaRequest(pedido('GET', '/api/loja?a=drop_tables'), res2, ENV, {}, fake(200, {}, chamadas))
  assert.equal(res2.statusCode, 400)
  assert.equal(chamadas.length, 1)
})

test('401 e 503 da loja viram 502 (não derrubam a sessão do dash)', async () => {
  const r1 = await chamarLoja(ENV, { metodo: 'GET', query: { a: 'overview' } }, fake(401, {}))
  assert.equal(r1.status, 502)
  const r2 = await chamarLoja(ENV, { metodo: 'GET', query: { a: 'overview' } }, fake(503, {}))
  assert.equal(r2.status, 502)
  const r3 = await chamarLoja(ENV, { metodo: 'GET', query: { a: 'overview' } }, async () => { throw new Error('rede') })
  assert.equal(r3.status, 502)
  const r4 = await chamarLoja(ENV, { metodo: 'GET', query: { a: 'order', n: 'TS-1' } }, fake(404, { error: 'Pedido não encontrado.' }))
  assert.equal(r4.status, 404)
})

test('ship: manda o e-mail pela Brevo e não devolve e-mail nem link do cliente ao navegador', async () => {
  const chamadas = []
  const loja = { ok: true, number: 'TS-1010', name: 'Ana Silva', email: 'ana@exemplo.com', tracking: 'AA123456789BR', tracking_url: 'https://www.melhorrastreio.com.br/rastreio/AA123456789BR', order_url: 'https://loja.exemplo.com/pedido?n=TS-1010&t=abc' }
  const fetchImpl = async (url, opts) => {
    chamadas.push({ url: String(url), opts })
    if (String(url).includes('api.brevo.com')) return { status: 201, ok: true, text: async () => '{"messageId":"m1"}', json: async () => ({ messageId: 'm1' }) }
    return { status: 200, ok: true, json: async () => loja }
  }
  const res = resposta()
  await handleLojaRequest(pedido('POST', '/api/loja', { a: 'ship', n: 'TS-1010', tracking: 'aa123456789br', extra: 'x' }), res, ENV, { email: 'ygor@x.com' }, fetchImpl)
  const saida = json(res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(saida, { ok: true, number: 'TS-1010', tracking: 'AA123456789BR', email: 'enviado' })
  assert.equal(JSON.parse(chamadas[0].opts.body).extra, undefined)
  const brevo = chamadas.find((c) => c.url.includes('brevo'))
  const enviado = JSON.parse(brevo.opts.body)
  assert.equal(enviado.to[0].email, 'ana@exemplo.com')
  assert.match(enviado.subject, /TS-1010/)
  assert.match(enviado.htmlContent, /AA123456789BR/)
  assert.ok(!res.body.includes('ana@exemplo.com') && !res.body.includes('t=abc'))
})

test('ship: se o e-mail falhar, o envio continua registrado e o aviso diz "falhou"', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('api.brevo.com')) return { status: 500, ok: false, text: async () => 'erro', json: async () => ({}) }
    return { status: 200, ok: true, json: async () => ({ ok: true, number: 'TS-1', name: 'Ana', email: 'a@b.com', tracking: 'AA123456789BR', tracking_url: 'https://x.com', order_url: 'https://x.com' }) }
  }
  const res = resposta()
  await handleLojaRequest(pedido('POST', '/api/loja', { a: 'ship', n: 'TS-1', tracking: 'AA123456789BR' }), res, ENV, {}, fetchImpl)
  assert.equal(json(res).ok, true)
  assert.equal(json(res).email, 'falhou')
})

test('e-mail de envio: escapa HTML e só aceita links https', () => {
  const { html, assunto } = emailEnvio({ nome: '<b>Ana</b> Silva', numero: 'TS-9', codigo: 'AA123456789BR', urlRastreio: 'javascript:alert(1)', urlPedido: 'https://loja.exemplo.com/p?a=1&b=2' })
  assert.equal(assunto, 'Seu pedido TS-9 foi enviado')
  assert.ok(!html.includes('<b>Ana</b>'))
  assert.ok(!html.includes('javascript:'))
  assert.ok(html.includes('a=1&amp;b=2'))
  assert.equal(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
})
