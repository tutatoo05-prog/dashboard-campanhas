import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aplicarNomesAntigos } from './nomesAntigosDeVariaveis.js'

test('variável com nome antigo (TEKWAY_) vira o nome novo (TELWAY_)', () => {
  const env = aplicarNomesAntigos({ TEKWAY_TOKEN: 'a', TEKWAY_LIBERAR_URL: 'https://x', OUTRA: 'b' })
  assert.equal(env.TELWAY_TOKEN, 'a')
  assert.equal(env.TELWAY_LIBERAR_URL, 'https://x')
  assert.equal(env.OUTRA, 'b')
})

test('o nome novo vence quando os dois existem', () => {
  const env = aplicarNomesAntigos({ TEKWAY_TOKEN: 'velho', TELWAY_TOKEN: 'novo' })
  assert.equal(env.TELWAY_TOKEN, 'novo')
})
