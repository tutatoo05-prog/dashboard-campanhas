import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarLookupComCache } from './dnsCache.js'

function falso() {
  const estado = { chamadas: 0, falhar: false }
  const original = (host, opcoes, callback) => {
    estado.chamadas += 1
    setTimeout(() => {
      if (estado.falhar) return callback(Object.assign(new Error('getaddrinfo ENOTFOUND ' + host), { code: 'ENOTFOUND' }))
      if (opcoes.all) return callback(null, [{ address: '10.0.0.1', family: 4 }])
      callback(null, '10.0.0.1', 4)
    }, 10)
  }
  return { estado, original }
}

const consultar = (lookup, host, opcoes = {}) => new Promise((resolve) => lookup(host, opcoes, (erro, a, b) => resolve({ erro, a, b })))

test('DNS: pedidos iguais ao mesmo tempo viram um, e os seguintes saem do cache', async () => {
  const { estado, original } = falso()
  const { lookup, estatisticas } = criarLookupComCache(original)
  const juntos = await Promise.all(Array.from({ length: 6 }, () => consultar(lookup, 'graph.facebook.com')))
  assert.ok(juntos.every((r) => r.a === '10.0.0.1' && r.b === 4))
  assert.equal(estado.chamadas, 1)
  await consultar(lookup, 'graph.facebook.com')
  await consultar(lookup, 'graph.facebook.com', { family: 4 }) // outra forma de pedir: consulta nova
  assert.equal(estado.chamadas, 2)
  assert.equal(estatisticas.acertos, 1)
})

test('DNS: se o DNS falhar, vale o último endereço conhecido; sem histórico, o erro aparece', async () => {
  const { estado, original } = falso()
  let hora = 0
  const { lookup, estatisticas } = criarLookupComCache(original, { validadeMs: 1000, validadeMaximaMs: 2000, agora: () => hora })
  assert.equal((await consultar(lookup, 'aws-1-ca-central-1.pooler.supabase.com')).a, '10.0.0.1')

  hora = 5000 // cache vencido e já passou do prazo máximo
  estado.falhar = true
  const durante = await consultar(lookup, 'aws-1-ca-central-1.pooler.supabase.com')
  assert.equal(durante.erro, null)
  assert.equal(durante.a, '10.0.0.1')
  assert.equal(estatisticas.reservas, 1)

  const semHistorico = await consultar(lookup, 'nome-novo.exemplo.com')
  assert.equal(semHistorico.erro.code, 'ENOTFOUND')
  assert.equal(estatisticas.falhas, 1)
})

test('DNS: com all:true devolve a lista; IP e localhost não passam pelo cache', async () => {
  const { estado, original } = falso()
  const { lookup } = criarLookupComCache(original)
  const lista = await new Promise((resolve) => lookup('docs.google.com', { all: true }, (erro, enderecos) => resolve(enderecos)))
  assert.deepEqual(lista, [{ address: '10.0.0.1', family: 4 }])
  await consultar(lookup, '127.0.0.1')
  assert.equal(estado.chamadas, 2) // o IP foi direto ao original, sem cache
})

test('DNS: depois dos 5 minutos usa o endereço velho na hora e atualiza em segundo plano', async () => {
  const { estado, original } = falso()
  let hora = 0
  const { lookup } = criarLookupComCache(original, { validadeMs: 1000, validadeMaximaMs: 100_000, agora: () => hora })
  await consultar(lookup, 'graph.facebook.com')
  assert.equal(estado.chamadas, 1)

  hora = 5000 // vencido, mas ainda dentro do prazo máximo
  const inicio = Date.now()
  const r = await consultar(lookup, 'graph.facebook.com')
  assert.equal(r.a, '10.0.0.1')
  assert.ok(Date.now() - inicio < 8, 'respondeu na hora, sem esperar o DNS')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(estado.chamadas, 2) // a atualização aconteceu em segundo plano

  hora = 500_000 // passou do prazo máximo: consulta de novo e espera
  await consultar(lookup, 'graph.facebook.com')
  assert.equal(estado.chamadas, 3)
})
