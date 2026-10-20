import test from 'node:test'
import assert from 'node:assert/strict'
import { handleUsersRequest } from './usersHandler.js'

const ID = 'b584a405-a628-4d88-894e-4df8bee78838'

function patch(id, corpo) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end: (texto) => resolve({ status: res.statusCode, corpo: JSON.parse(texto) }),
    }
    const req = {
      method: 'PATCH',
      url: `/api/users/${id}`,
      on(evento, fn) {
        if (evento === 'data') queueMicrotask(() => fn(JSON.stringify(corpo)))
        if (evento === 'end') queueMicrotask(() => queueMicrotask(() => fn()))
      },
    }
    handleUsersRequest(req, res, {}, { email: 'admin@teste.com' })
  })
}

test('id que não é UUID é recusado antes de qualquer consulta', async () => {
  const r = await patch('nao-e-uuid', { aprovar: true })
  assert.equal(r.status, 400)
})

test('sem cargo nem aprovar continua dando "cargo inválido"', async () => {
  const r = await patch(ID, {})
  assert.equal(r.status, 400)
  assert.match(r.corpo.error, /Cargo inválido/)
})

test('aprovar: true segue o caminho de aprovação (sem banco aqui, falha na consulta com 502, não com "cargo inválido")', async () => {
  const r = await patch(ID, { aprovar: true })
  assert.equal(r.status, 502)
  assert.match(r.corpo.error, /aprovar/i)
})

test('aprovar só vale com true (qualquer outra coisa cai na validação de cargo)', async () => {
  const r = await patch(ID, { aprovar: 'sim' })
  assert.equal(r.status, 400)
  assert.match(r.corpo.error, /Cargo inválido/)
})
