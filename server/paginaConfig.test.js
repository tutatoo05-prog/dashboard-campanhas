import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import pg from 'pg'
import { limparCache } from './cacheCurto.js'
import { ConfigInvalida, PAGINAS, handlePaginaConfigRequest, paginaValida, sanitizarPagina } from './playerConfig.js'
import { handleVideosRequest } from './videosHandler.js'

const ENV = { DATABASE_URL: 'postgres://localhost/teste' }

/** Troca a consulta do banco por uma função de teste e devolve o que foi consultado. */
async function comBanco(resposta, executar) {
  const original = pg.Pool.prototype.query
  const consultas = []
  pg.Pool.prototype.query = async (texto, valores) => {
    consultas.push({ texto: String(texto), valores })
    return resposta(String(texto), valores)
  }
  limparCache()
  try {
    return await executar(consultas)
  } finally {
    pg.Pool.prototype.query = original
    limparCache()
  }
}

function publica(method, url) {
  return new Promise((resolve) => {
    const headers = {}
    const res = {
      statusCode: 200,
      setHeader: (k, v) => (headers[k] = v),
      end: (corpo) => resolve({ status: res.statusCode, headers, corpo: corpo ? JSON.parse(corpo) : null }),
    }
    handlePaginaConfigRequest({ method, url }, res, ENV)
  })
}

function admin(method, url, corpo) {
  return new Promise((resolve) => {
    const req = Readable.from(corpo === undefined ? [] : [Buffer.from(JSON.stringify(corpo))])
    req.method = method
    req.url = url
    const res = {
      statusCode: 200,
      setHeader() {},
      end: (texto) => resolve({ status: res.statusCode, corpo: texto ? JSON.parse(texto) : null }),
    }
    handleVideosRequest(req, res, ENV, { email: 'admin@teste.com' })
  })
}

test('páginas: padrões iguais aos do projeto produtos (Essentials 30, Membros 30, Live 0)', () => {
  assert.deepEqual(PAGINAS, { essentials: { travaSegundos: 30 }, membros: { travaSegundos: 30 }, live: { travaSegundos: 0 } })
  assert.equal(paginaValida('essentials'), true)
  assert.equal(paginaValida('live'), true)
  assert.equal(paginaValida('toString'), false, 'nada herdado do objeto')
  assert.equal(paginaValida(''), false)
  assert.equal(paginaValida(null), false)
})

test('trava: aceita 0 a 300 s e arredonda; vazio volta ao padrão da página; fora da faixa avisa', () => {
  assert.deepEqual(sanitizarPagina({ travaSegundos: 45.4 }, 'essentials'), { travaSegundos: 45 })
  assert.deepEqual(sanitizarPagina({ travaSegundos: 0 }, 'essentials'), { travaSegundos: 0 })
  assert.deepEqual(sanitizarPagina({ travaSegundos: 300 }, 'live'), { travaSegundos: 300 })
  assert.deepEqual(sanitizarPagina({}, 'essentials'), { travaSegundos: 30 })
  assert.deepEqual(sanitizarPagina(undefined, 'live'), { travaSegundos: 0 })
  assert.deepEqual(sanitizarPagina({ travaSegundos: '' }, 'membros'), { travaSegundos: 30 })
  assert.throws(() => sanitizarPagina({ travaSegundos: 301 }, 'essentials'), ConfigInvalida)
  assert.throws(() => sanitizarPagina({ travaSegundos: -1 }, 'essentials'), ConfigInvalida)
  assert.throws(() => sanitizarPagina({ travaSegundos: 'abc' }, 'essentials'), ConfigInvalida)
})

test('rota pública da trava: OPTIONS, página inválida, método e rota erradas', async () => {
  const opcoes = await publica('OPTIONS', '/api/pagina-config')
  assert.equal(opcoes.status, 204)
  assert.equal(opcoes.headers['Access-Control-Allow-Origin'], '*')
  assert.equal((await publica('GET', '/api/pagina-config?p=outra')).status, 400)
  assert.equal((await publica('GET', '/api/pagina-config')).status, 400)
  assert.equal((await publica('POST', '/api/pagina-config?p=live')).status, 405)
  assert.equal((await publica('GET', '/api/pagina-configx?p=live')).status, 404)
})

test('rota pública da trava: sem linha salva devolve o padrão de cada página', async () => {
  await comBanco(() => ({ rows: [] }), async () => {
    const essentials = await publica('GET', '/api/pagina-config?p=essentials')
    assert.equal(essentials.status, 200)
    assert.deepEqual(essentials.corpo, { travaSegundos: 30 })
    assert.equal(essentials.headers['Access-Control-Allow-Origin'], '*')
    assert.equal(essentials.headers['Cache-Control'], 'no-cache')
    assert.deepEqual((await publica('GET', '/api/pagina-config?p=live')).corpo, { travaSegundos: 0 })
  })
})

test('rota pública da trava: devolve o tempo salvo e ignora registro estragado', async () => {
  const linhas = [
    { video: 'pagina-essentials', config: { travaSegundos: 12 }, atualizado_em: '2026-11-03T12:00:00Z', atualizado_por: 'a@b.com' },
    { video: 'pagina-live', config: { travaSegundos: 9999 }, atualizado_em: '2026-11-03T12:00:00Z', atualizado_por: null },
    { video: 'pagina-inexistente', config: { travaSegundos: 5 }, atualizado_em: '2026-11-03T12:00:00Z', atualizado_por: null },
  ]
  await comBanco(() => ({ rows: linhas }), async () => {
    assert.deepEqual((await publica('GET', '/api/pagina-config?p=essentials')).corpo, { travaSegundos: 12 })
    assert.deepEqual((await publica('GET', '/api/pagina-config?p=live')).corpo, { travaSegundos: 0 }, 'valor inválido salvo cai no padrão')
    assert.deepEqual((await publica('GET', '/api/pagina-config?p=membros')).corpo, { travaSegundos: 30 })
  })
})

test('rota pública da trava: sem a tabela devolve o padrão; banco fora devolve 502 com CORS', async () => {
  await comBanco(() => Promise.reject(Object.assign(new Error('x'), { code: '42P01' })), async () => {
    assert.deepEqual((await publica('GET', '/api/pagina-config?p=essentials')).corpo, { travaSegundos: 30 })
  })
  await comBanco(() => Promise.reject(new Error('banco caiu')), async () => {
    const r = await publica('GET', '/api/pagina-config?p=essentials')
    assert.equal(r.status, 502)
    assert.equal(r.headers['Access-Control-Allow-Origin'], '*')
  })
})

test('painel: lê os três tempos e grava só o que veio, validado, com o e-mail de quem salvou', async () => {
  await comBanco(
    (texto) => (/insert into/i.test(texto) ? { rows: [] } : { rows: [{ video: 'pagina-membros', config: { travaSegundos: 20 }, atualizado_em: '2026-11-03T12:00:00Z', atualizado_por: 'x@y.com' }] }),
    async (consultas) => {
      const lido = await admin('GET', '/api/videos/paginas')
      assert.equal(lido.status, 200)
      assert.equal(lido.corpo.paginas.membros.config.travaSegundos, 20)
      assert.equal(lido.corpo.paginas.membros.salvo, true)
      assert.equal(lido.corpo.paginas.essentials.salvo, false)
      assert.equal(lido.corpo.maximo, 300)
      assert.deepEqual(lido.corpo.padroes.live, { travaSegundos: 0 })

      const gravado = await admin('PUT', '/api/videos/paginas', { paginas: { essentials: { travaSegundos: 45 }, live: { travaSegundos: 0 } } })
      assert.equal(gravado.status, 200)
      const inserts = consultas.filter((c) => /insert into video_config/i.test(c.texto))
      assert.equal(inserts.length, 2)
      assert.deepEqual(inserts.map((c) => c.valores[0]).sort(), ['pagina-essentials', 'pagina-live'])
      assert.equal(JSON.parse(inserts.find((c) => c.valores[0] === 'pagina-essentials').valores[1]).travaSegundos, 45)
      assert.equal(inserts[0].valores[2], 'admin@teste.com')
    },
  )
})

test('painel: tempo fora da faixa, página desconhecida e corpo vazio são recusados sem gravar nada', async () => {
  await comBanco(() => ({ rows: [] }), async (consultas) => {
    assert.equal((await admin('PUT', '/api/videos/paginas', { paginas: { essentials: { travaSegundos: 1000 } } })).status, 400)
    assert.equal((await admin('PUT', '/api/videos/paginas', { paginas: { outra: { travaSegundos: 10 } } })).status, 400)
    assert.equal((await admin('PUT', '/api/videos/paginas', { paginas: {} })).status, 400)
    assert.equal((await admin('PUT', '/api/videos/paginas', {})).status, 400)
    assert.equal((await admin('DELETE', '/api/videos/paginas')).status, 405)
    assert.equal(consultas.filter((c) => /insert into/i.test(c.texto)).length, 0)
  })
})

test('painel: sem a tabela no banco avisa que falta migrar em vez de gravar', async () => {
  await comBanco(() => Promise.reject(Object.assign(new Error('x'), { code: '42P01' })), async () => {
    const r = await admin('PUT', '/api/videos/paginas', { paginas: { essentials: { travaSegundos: 10 } } })
    assert.equal(r.status, 409)
    assert.equal(r.corpo.code, 'MIGRACAO')
  })
})
