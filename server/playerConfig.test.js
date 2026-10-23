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

test('configuração antiga (sem aparência, controles ou posição) ganha os padrões novos', () => {
  const antiga = { arquivos: PADRAO.arquivos, permitirAvancar: false, cta: { ativo: true, segundo: 30, texto: 'Comprar' }, fim: PADRAO.fim }
  const config = sanitizarConfig(antiga)
  assert.deepEqual(config.aparencia, PADRAO.aparencia)
  assert.deepEqual(config.controles, PADRAO.controles)
  assert.equal(config.cta.posicao, 'centro')
  assert.equal(config.cta.tamanho, 'm')
  assert.equal(config.cta.animacao, 'nenhuma')
  assert.equal(config.textoToque, 'Toque para assistir')
})

test('cores só no formato #rrggbb (minúsculas) e opções fora da lista caem no padrão', () => {
  const config = sanitizarConfig({
    ...PADRAO,
    aparencia: { corDestaque: '#00AAFF', corBotao: '#112233', corTextoBotao: '#ffffff', formaBotao: 'inventada' },
    cta: { ...PADRAO.cta, posicao: 'topo', tamanho: 'gg', animacao: 'giro' },
  })
  assert.equal(config.aparencia.corDestaque, '#00aaff')
  assert.equal(config.aparencia.formaBotao, 'suave')
  assert.equal(config.cta.posicao, 'centro')
  assert.equal(config.cta.tamanho, 'm')
  assert.equal(config.cta.animacao, 'nenhuma')
  for (const cor of ['red', 'url(x)', '#fff', '#12345g', 'rgb(0,0,0)', '#ff8a1f;color:red']) {
    assert.throws(() => sanitizarConfig({ ...PADRAO, aparencia: { ...PADRAO.aparencia, corBotao: cor } }), ConfigInvalida, cor)
  }
})

test('desligar tempo e volume da barra é respeitado', () => {
  const config = sanitizarConfig({ ...PADRAO, controles: { tempo: false, volume: false } })
  assert.deepEqual(config.controles, { tempo: false, volume: false })
})

test('barra com ritmo: valida a faixa de cada número e mantém o que vale', () => {
  const config = sanitizarConfig({ ...PADRAO, barraFalsa: { ativo: true, inicioSegundos: 5, inicioVelocidade: 3, trechoSegundos: 15, rapido: 2, lento: 0.5 } })
  assert.deepEqual(config.barraFalsa, { ativo: true, inicioSegundos: 5, inicioVelocidade: 3, trechoSegundos: 15, rapido: 2, lento: 0.5 })
  assert.throws(() => sanitizarConfig({ ...PADRAO, barraFalsa: { ...PADRAO.barraFalsa, inicioVelocidade: 99 } }), ConfigInvalida)
  assert.throws(() => sanitizarConfig({ ...PADRAO, barraFalsa: { ...PADRAO.barraFalsa, lento: 0 } }), ConfigInvalida)
  // registro antigo, sem os campos novos: barra desligada e proteção ligada
  const antiga = sanitizarConfig({ arquivos: PADRAO.arquivos, cta: { ativo: false, texto: 'Comprar' }, fim: PADRAO.fim })
  assert.equal(antiga.barraFalsa.ativo, false)
  assert.equal(antiga.protegerVideo, true)
  assert.equal(sanitizarConfig({ ...PADRAO, protegerVideo: false }).protegerVideo, false)
})

test('lembrar posição: ligada por padrão, em registro antigo e quando desligada no painel', () => {
  assert.equal(PADRAO.lembrarPosicao, true)
  assert.equal(sanitizarConfig({ arquivos: PADRAO.arquivos, cta: { ativo: false, texto: 'Comprar' }, fim: PADRAO.fim }).lembrarPosicao, true)
  assert.equal(sanitizarConfig({ ...PADRAO, lembrarPosicao: false }).lembrarPosicao, false)
})

test('botão de compra: tempo na tela e repetição validados, registros antigos ficam como antes (fixo até o fim)', () => {
  const config = sanitizarConfig({ ...PADRAO, cta: { ...PADRAO.cta, ativo: true, segundo: 60, duracao: 20, repetir: 180 } })
  assert.equal(config.cta.duracao, 20)
  assert.equal(config.cta.repetir, 180)
  const antiga = sanitizarConfig({ arquivos: PADRAO.arquivos, cta: { ativo: true, segundo: 30, texto: 'Comprar' }, fim: PADRAO.fim })
  assert.equal(antiga.cta.duracao, 0)
  assert.equal(antiga.cta.repetir, 0)
  assert.throws(() => sanitizarConfig({ ...PADRAO, cta: { ...PADRAO.cta, repetir: -5 } }), ConfigInvalida)
  assert.throws(() => sanitizarConfig({ ...PADRAO, cta: { ...PADRAO.cta, duracao: 99999 } }), ConfigInvalida)
})
