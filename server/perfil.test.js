import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { atualizarPerfil, senhaForte, trocarSenha, validarAvatar, validarNome } from './perfil.js'
import { hashPassword } from './passwords.js'

function pedido(corpo, extras = {}) {
  const req = Readable.from([JSON.stringify(corpo)])
  req.headers = { cookie: 'dash_session=meu-token', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}`, ...extras }
  req.socket = { remoteAddress: '127.0.0.1' }
  return req
}
function resposta() {
  return { statusCode: 0, corpo: null, setHeader() {}, end(texto) { this.corpo = JSON.parse(texto) } }
}

test('nome: tira espaços sobrando e recusa vazio ou enorme', () => {
  assert.deepEqual(validarNome('  Ana   Souza '), { valor: 'Ana Souza' })
  assert.ok(validarNome('A').erro)
  assert.ok(validarNome('   ').erro)
  assert.ok(validarNome('x'.repeat(81)).erro)
})

test('avatar: aceita adesivo da lista, foto pequena e vazio; recusa o resto', () => {
  assert.deepEqual(validarAvatar(''), { valor: null })
  assert.deepEqual(validarAvatar('sticker:rose'), { valor: 'sticker:rose' })
  assert.ok(validarAvatar('sticker:inventado').erro)
  const foto = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  assert.deepEqual(validarAvatar(foto), { valor: foto })
  assert.ok(validarAvatar('data:image/svg+xml;base64,PHN2Zz4=').erro, 'SVG pode carregar script: não entra')
  assert.ok(validarAvatar('data:text/html;base64,PGgxPg==').erro)
  assert.ok(validarAvatar('https://exemplo.com/foto.png').erro, 'link externo não entra')
  assert.ok(validarAvatar(`data:image/png;base64,${'A'.repeat(100_000)}`).erro, 'foto grande demais')
})

test('senha forte: 8+ com maiúscula, minúscula, número e símbolo', () => {
  assert.equal(senhaForte('Abcdef1!'), true)
  for (const fraca of ['abcdef1!', 'ABCDEF1!', 'Abcdefg!', 'Abcdefg1', 'Ab1!', '491583']) assert.equal(senhaForte(fraca), false, fraca)
})

test('atualizarPerfil: grava só o que veio, devolve a pessoa e não deixa mexer em cargo', async () => {
  const chamadas = []
  const consultar = async (texto, params) => {
    chamadas.push({ texto, params })
    return { rows: [{ id: 7, nome: params[1] ?? 'Antigo', email: 'a@x.com', usuario: 'a@x.com', cargo: 'usuario', avatar: 'sticker:skull' }] }
  }
  const res = resposta()
  await atualizarPerfil(pedido({ nome: ' Nova  Pessoa ', avatar: 'sticker:skull', cargo: 'admin' }), res, {}, { id: 7 }, consultar)
  assert.equal(res.statusCode, 200)
  assert.equal(res.corpo.user.nome, 'Nova Pessoa')
  assert.ok(!chamadas[0].texto.includes('cargo ='), 'o cargo não pode ser alterado por aqui')
  assert.deepEqual(chamadas[0].params, [7, 'Nova Pessoa', 'sticker:skull'])

  const vazio = resposta()
  await atualizarPerfil(pedido({ cargo: 'admin' }), vazio, {}, { id: 7 }, consultar)
  assert.equal(vazio.statusCode, 400)

  const ruim = resposta()
  await atualizarPerfil(pedido({ nome: 'A' }), ruim, {}, { id: 7 }, consultar)
  assert.equal(ruim.statusCode, 400)
  assert.equal(chamadas.length, 1, 'pedido inválido não chega ao banco')
})

test('trocarSenha: confere a atual, exige senha nova forte e derruba os outros logins', async () => {
  const hash = await hashPassword('Atual#123')
  const chamadas = []
  const consultar = async (texto, params) => {
    chamadas.push({ texto, params })
    return { rows: texto.startsWith('select senha_hash') ? [{ senha_hash: hash }] : [] }
  }
  const fraca = resposta()
  await trocarSenha(pedido({ atual: 'Atual#123', nova: 'fraca' }), fraca, {}, { id: 7 }, consultar)
  assert.equal(fraca.statusCode, 400)

  const errada = resposta()
  await trocarSenha(pedido({ atual: 'Errada#123', nova: 'Nova#12345' }), errada, {}, { id: 7 }, consultar)
  assert.equal(errada.statusCode, 400)
  assert.match(errada.corpo.error, /atual/)
  assert.ok(!chamadas.some((c) => c.texto.startsWith('update users')), 'senha errada não altera nada')

  const ok = resposta()
  await trocarSenha(pedido({ atual: 'Atual#123', nova: 'Nova#12345' }), ok, {}, { id: 7 }, consultar)
  assert.equal(ok.statusCode, 200)
  const atualiza = chamadas.find((c) => c.texto.startsWith('update users'))
  assert.ok(atualiza.params[1].startsWith('scrypt:'), 'a senha é guardada com hash, nunca em texto')
  const derruba = chamadas.find((c) => c.texto.startsWith('delete from sessions'))
  assert.deepEqual(derruba.params, [7, 'meu-token'], 'mantém só a sessão de quem trocou')
})
