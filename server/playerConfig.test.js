import test from 'node:test'
import assert from 'node:assert/strict'
import { ConfigInvalida, PADRAO, handlePlayerConfigRequest, sanitizarConfig, videoValido } from './playerConfig.js'

test('o padrão passa pela própria validação sem mudar', () => {
  assert.deepEqual(sanitizarConfig(PADRAO), PADRAO)
})

test('aceita uma configuração completa e arredonda o segundo', () => {
  const config = sanitizarConfig({
    arquivos: { hd: 'vsl-v2-720.mp4', leve: 'vsl-v2-480.mp4' },
    permitirAvancar: false,
    cta: { ativo: true, segundo: 90.6, texto: '  Entrar agora  ' },
    fim: { ativo: true, titulo: 'Última chance', texto: 'Comprar' },
  })
  assert.equal(config.permitirAvancar, false)
  assert.equal(config.cta.segundo, 91)
  assert.equal(config.cta.texto, 'Entrar agora')
  assert.equal(config.fim.titulo, 'Última chance')
})

test('só aceita nome de arquivo .mp4 simples (nada de endereço ou pasta)', () => {
  for (const nome of ['https://x.com/v.mp4', '../v.mp4', 'pasta/v.mp4', 'v.avi', '', 'v.mp4?x=1']) {
    assert.throws(() => sanitizarConfig({ ...PADRAO, arquivos: { hd: nome, leve: 'ok.mp4' } }), ConfigInvalida, nome)
  }
})

test('rejeita segundo fora da faixa e textos longos ou vazios', () => {
  assert.throws(() => sanitizarConfig({ ...PADRAO, cta: { ...PADRAO.cta, segundo: -1 } }), ConfigInvalida)
  assert.throws(() => sanitizarConfig({ ...PADRAO, cta: { ...PADRAO.cta, segundo: 99999 } }), ConfigInvalida)
  assert.throws(() => sanitizarConfig({ ...PADRAO, cta: { ...PADRAO.cta, texto: 'x'.repeat(61) } }), ConfigInvalida)
  assert.throws(() => sanitizarConfig({ ...PADRAO, cta: { ...PADRAO.cta, texto: '   ' } }), ConfigInvalida)
  assert.throws(() => sanitizarConfig({ ...PADRAO, fim: { ...PADRAO.fim, titulo: 'x'.repeat(121) } }), ConfigInvalida)
})

test('entrada vazia ou lixo não vira configuração (o arquivo é obrigatório)', () => {
  assert.throws(() => sanitizarConfig(null), ConfigInvalida)
  assert.throws(() => sanitizarConfig('texto'), ConfigInvalida)
})

test('videoValido', () => {
  assert.equal(videoValido('vsl'), true)
  assert.equal(videoValido('depo-karem'), true)
  assert.equal(videoValido('a/b'), false)
  assert.equal(videoValido(''), false)
  assert.equal(videoValido('x'.repeat(41)), false)
})

function chamar(method, url, env = {}) {
  return new Promise((resolve) => {
    const headers = {}
    const res = {
      statusCode: 200,
      setHeader: (k, v) => (headers[k] = v),
      end: (corpo) => resolve({ status: res.statusCode, headers, corpo: corpo ? JSON.parse(corpo) : null }),
    }
    handlePlayerConfigRequest({ method, url }, res, env)
  })
}

test('rota pública: OPTIONS responde 204 com CORS aberto', async () => {
  const r = await chamar('OPTIONS', '/api/player-config')
  assert.equal(r.status, 204)
  assert.equal(r.headers['Access-Control-Allow-Origin'], '*')
})

test('rota pública: vídeo inválido, método errado e rota errada', async () => {
  assert.equal((await chamar('GET', '/api/player-config?v=a/b')).status, 400)
  assert.equal((await chamar('POST', '/api/player-config')).status, 405)
  assert.equal((await chamar('GET', '/api/player-configx')).status, 404)
})

test('rota pública: sem banco devolve 502 com CORS (o player cai no padrão dele)', async () => {
  const r = await chamar('GET', '/api/player-config?v=vsl-sem-banco', {})
  assert.equal(r.status, 502)
  assert.equal(r.headers['Access-Control-Allow-Origin'], '*')
})
