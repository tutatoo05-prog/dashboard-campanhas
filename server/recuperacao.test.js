import test from 'node:test'
import assert from 'node:assert/strict'
import { montarRecuperacao, paginaDe } from './recuperacao.js'
import { canAccessApi, canWriteAsUser } from './roles.js'

const AGORA = new Date('2026-11-24T15:00:00Z').getTime()
const ev = (extra) => ({ nome: '', email: '', telefone: '', produto: 'Essentials', valor: 97, categoria: 'venda', evento: 'compra_aprovada', situacao: null, ...extra })

test('carrinho em aberto vira caso aberto com a chave das anotações', () => {
  const { casos, resumo } = montarRecuperacao(
    [ev({ categoria: 'abandono', evento: 'abandono_carrinho', situacao: 'em aberto', email: 'Ana@x.com'.toLowerCase(), nome: 'Ana', data: '2026-11-22T10:00:00Z' })],
    [],
    AGORA,
  )
  assert.equal(casos.length, 1)
  assert.equal(casos[0].estadoCaso, 'aberto')
  assert.equal(casos[0].rotulo, 'Abandonou o carrinho')
  assert.equal(casos[0].chave, 'e:ana@x.com')
  assert.equal(casos[0].diasParado, 2)
  assert.equal(resumo.abertos, 1)
  assert.equal(resumo.porMotivo.abandono.abertos, 1)
})

test('mesma pessoa por e-mail ou telefone: uma linha, com o caso mais grave em destaque', () => {
  const { casos } = montarRecuperacao(
    [
      ev({ categoria: 'abandono', evento: 'abandono_carrinho', situacao: 'em aberto', email: 'b@x.com', telefone: '11999990000', data: '2026-11-23T10:00:00Z' }),
      ev({ categoria: 'venda', email: 'b@x.com', data: '2026-10-01T10:00:00Z', produto: 'Mentoria' }),
      ev({ categoria: 'reembolso', evento: 'compra_reembolsada', situacao: 'reembolsada', telefone: '5511999990000', data: '2026-10-05T10:00:00Z', produto: 'Mentoria' }),
    ],
    [],
    AGORA,
  )
  assert.equal(casos.length, 1)
  assert.equal(casos[0].motivo, 'reembolso')
  assert.equal(casos[0].outrosAbertos.length, 1)
  assert.deepEqual(casos[0].jaComprou, ['Mentoria'])
})

test('reembolso seguido de nova compra do mesmo produto conta como recuperado', () => {
  const { casos, resumo } = montarRecuperacao(
    [
      ev({ categoria: 'reembolso', evento: 'compra_reembolsada', situacao: 'reembolsada', email: 'c@x.com', data: '2026-11-01T10:00:00Z' }),
      ev({ categoria: 'venda', email: 'c@x.com', data: '2026-11-10T10:00:00Z' }),
    ],
    [],
    AGORA,
  )
  assert.equal(casos[0].estadoCaso, 'recuperado')
  assert.equal(resumo.recuperados, 1)
})

test('quem só comprou ou tem aviso repetido fica de fora; o lead do banco entra como contexto', () => {
  const { casos } = montarRecuperacao(
    [
      ev({ categoria: 'venda', email: 'd@x.com', data: '2026-11-01T10:00:00Z' }),
      ev({ categoria: 'pix_boleto', evento: 'boleto_pix_gerado', situacao: 'repetido', email: 'e@x.com', data: '2026-11-01T10:00:00Z' }),
      ev({ categoria: 'pix_boleto', evento: 'boleto_pix_gerado', situacao: 'vencido', email: 'f@x.com', data: '2026-11-01T10:00:00Z' }),
    ],
    [{ email: 'f@x.com', telefone: '', nome: 'Fabi', projeto: 'essentials', campanha: 'Camp 1', data: '2026-10-30T10:00:00Z', respostas: { idade: '30' } }],
    AGORA,
  )
  assert.equal(casos.length, 1)
  assert.equal(casos[0].email, 'f@x.com')
  assert.equal(casos[0].nome, 'Fabi')
  assert.equal(casos[0].lead.campanha, 'Camp 1')
})

test('cargo usuario: lê a recuperação e só escreve a anotação', () => {
  const usuario = { cargo: 'usuario' }
  assert.equal(canAccessApi(usuario, 'GET', '/api/recuperacao'), true)
  assert.equal(canAccessApi(usuario, 'POST', '/api/recuperacao'), false)
  assert.equal(canWriteAsUser('PUT', '/api/leads/notas'), true)
  assert.equal(canWriteAsUser('DELETE', '/api/leads/notas'), false)
  assert.equal(canWriteAsUser('PUT', '/api/leads'), false)
})

test('paginaDe separa Essentials, Live, Membros e Mentoria mesmo com o mesmo produto na Hotmart', () => {
  assert.equal(paginaDe({ produto: 'Essentials', src: 'essentials_hero-v1_b' }).id, 'essentials')
  assert.equal(paginaDe({ produto: 'Essentials', src: 'live' }).id, 'live')
  assert.equal(paginaDe({ produto: 'Essentials', src: 'membros' }).id, 'membros')
  assert.equal(paginaDe({ produto: 'Essentials', src: 'mentoria-particular' }).id, 'particular')
  assert.equal(paginaDe({ produto: 'Essentials', oferta: '0gapxraj' }).id, 'live')
  assert.equal(paginaDe({ produto: 'Essentials', oferta: 'scq7pq9v' }).id, 'essentials')
  assert.equal(paginaDe({ produto: 'Mentoria Essentials' }).rotulo, 'Mentoria Essentials')
})

test('resumo.produtos agrupa os casos abertos por página', () => {
  const { resumo } = montarRecuperacao([
    ev({ email: 'a@x.com', categoria: 'abandono', evento: 'abandono', situacao: 'em aberto', src: 'essentials_v1', data: '2026-11-20T10:00:00Z' }),
    ev({ email: 'b@x.com', categoria: 'abandono', evento: 'abandono', situacao: 'em aberto', src: 'live', data: '2026-11-20T10:00:00Z' }),
    ev({ email: 'c@x.com', categoria: 'abandono', evento: 'abandono', situacao: 'em aberto', src: 'live', data: '2026-11-20T10:00:00Z' }),
  ])
  assert.deepEqual(resumo.produtos.map((p) => [p.pagina, p.abertos]), [['live', 2], ['essentials', 1]])
})
