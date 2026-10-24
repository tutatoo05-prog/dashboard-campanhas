import test from 'node:test'
import assert from 'node:assert/strict'
import { PROJETOS, TIPOS, classificar, normalizar } from './catalogo.js'

test('slugs do catálogo se reconhecem e dão o tipo certo', () => {
  assert.deepEqual(
    ['workirezumi', 'workleao2', 'workcobertura', 'workprompt'].map((s) => classificar(s).tipo),
    ['workshop', 'workshop', 'workshop', 'workshop'],
  )
  assert.equal(classificar('mentoria-particular').tipo, 'mentoria')
  const live = classificar('essentials-live')
  assert.deepEqual([live.tipo, live.vertente], ['essentials', 'live'])
  assert.equal(classificar('essentials-membros').vertente, 'membros')
  assert.equal(classificar('essentials').vertente, '')
})

test('nomes antigos (origem, evento, produto do site) caem no mesmo projeto', () => {
  for (const antigo of ['workshop_irezumi_1', 'workshop-irezumi-1', 'irezumi-oriental', 'lancamento_interessados', 'lancamento-interessados']) {
    assert.equal(classificar(antigo).slug, 'workirezumi', antigo)
  }
  assert.equal(classificar('workshop_leao_2').slug, 'workleao2')
  assert.equal(classificar('prompt').slug, 'workprompt')
  assert.equal(classificar('mentoria_particular').slug, 'mentoria-particular')
  assert.equal(classificar('cobertura-cicatrizacao-09-09').slug, 'workcobertura')
})

test('a origem gravada continua a de sempre (a tela Leads depende dela)', () => {
  assert.equal(classificar('workirezumi').origem, 'workshop_irezumi_1')
  assert.equal(classificar('mentoria-particular').origem, 'mentoria_particular')
  assert.equal(classificar('essentials').origem, 'essentials')
})

test('slug novo que não está no catálogo vira o tipo certo pelo prefixo', () => {
  const novo = classificar('workgrafismo3')
  assert.deepEqual([novo.slug, novo.tipo, novo.conhecido, novo.nome], ['workgrafismo3', 'workshop', false, 'Workgrafismo3'])
  assert.equal(classificar('essentials-vip').tipo, 'essentials')
  assert.equal(classificar('essentials-live-2').vertente, 'live')
  assert.equal(classificar('mentoria-grupo').tipo, 'mentoria')
  assert.equal(classificar('qualquer-coisa').tipo, 'outros')
})

test('vazio não é misturado com nenhum projeto', () => {
  assert.deepEqual([classificar('').slug, classificar('').tipo], ['site', 'outros'])
  assert.equal(classificar(undefined).tipo, 'outros')
})

test('normalizar tira acento, maiúscula e símbolos', () => {
  assert.equal(normalizar(' Workshop Irezumi - 1ª Edição '), 'workshop_irezumi_1_edicao')
})

test('cada projeto tem tipo válido e slug único', () => {
  const slugs = PROJETOS.map((p) => p.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  for (const p of PROJETOS) assert.ok(TIPOS[p.tipo], p.slug)
})
