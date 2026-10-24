import test from 'node:test'
import assert from 'node:assert/strict'
import { ApagarInvalido, apagarPessoa, chavesDoContato, ocultarApagados } from './registrosApagados.js'

const registro = (extras = {}) => ({ planilha: 'P', aba: 'leads', tipo: 'lead', nome: 'Ana', email: 'ana@x.com', telefone: '5511911111111', data: '2026-10-20T10:00:00.000Z', canal: '', campanha: '', criativo: '', ...extras })
const dados = (...records) => ({ tabs: [{ planilha: 'P', aba: 'leads', tipo: 'lead', url: 'u', count: records.length, error: null }], records })

test('chaves: e-mail em minúsculas e telefone pelos últimos 11 dígitos', () => {
  assert.deepEqual(chavesDoContato({ email: ' ANA@x.com ', telefone: '+55 11 91111-1111' }), ['e:ana@x.com', 't:11911111111'])
  assert.deepEqual(chavesDoContato({ email: '', telefone: '123' }), [])
})

test('apagarPessoa guarda as chaves e apaga só os leads que entraram pelo dash', async () => {
  const chamadas = []
  const consultar = async (texto, params) => {
    chamadas.push({ texto, params })
    return { rows: [], rowCount: /delete from leads/.test(texto) ? 2 : 0 }
  }
  const r = await apagarPessoa({}, [{ email: 'Ana@x.com', telefone: '5511911111111' }, { email: 'ana@x.com', telefone: '11988887777' }], { usuario: 'ygor', consultar })
  assert.equal(r.chaves, 3) // 1 e-mail (sem repetir) + 2 telefones
  assert.equal(r.leadsApagados, 2)
  const insercao = chamadas.find((c) => /insert into registros_apagados/.test(c.texto))
  assert.deepEqual(insercao.params[0].sort(), ['e:ana@x.com', 't:11911111111', 't:11988887777'].sort())
  assert.equal(insercao.params[1], 'ygor')
  const exclusao = chamadas.find((c) => /delete from leads/.test(c.texto))
  assert.match(exclusao.texto, /captura:%/)
  assert.match(exclusao.texto, /recuperado:%/)
  assert.deepEqual(exclusao.params[0], ['ana@x.com'])
})

test('apagarPessoa recusa pedido vazio ou sem contato utilizável', async () => {
  const consultar = async () => ({ rows: [], rowCount: 0 })
  await assert.rejects(() => apagarPessoa({}, [], { consultar }), ApagarInvalido)
  await assert.rejects(() => apagarPessoa({}, [{ email: '', telefone: '' }], { consultar }), ApagarInvalido)
  await assert.rejects(() => apagarPessoa({}, 'x', { consultar }), ApagarInvalido)
})

const apagadosEm = (chave, quando) => async () => ({ rows: [{ chave, apagado_em: quando }] })

test('esconde o que é anterior ao apagamento, por e-mail ou por telefone', async () => {
  const antes = registro()
  const outroEmailMesmoTel = registro({ email: 'outro@x.com' })
  const outraPessoa = registro({ email: 'bia@x.com', telefone: '5511900000000' })
  const r = await ocultarApagados(dados(antes, outroEmailMesmoTel, outraPessoa), {}, apagadosEm('t:11911111111', '2026-10-24T00:00:00Z'))
  assert.deepEqual(r.records.map((x) => x.email), ['bia@x.com'])
  assert.equal(r.tabs[0].count, 1)
})

test('cadastro NOVO da mesma pessoa, depois do apagamento, aparece', async () => {
  const velho = registro({ data: '2026-10-20T10:00:00.000Z' })
  const novo = registro({ data: '2026-10-25T10:00:00.000Z' })
  const r = await ocultarApagados(dados(velho, novo), {}, apagadosEm('e:ana@x.com', '2026-10-24T00:00:00Z'))
  assert.deepEqual(r.records.map((x) => x.data), ['2026-10-25T10:00:00.000Z'])
})

test('registro sem data também é escondido', async () => {
  const r = await ocultarApagados(dados(registro({ data: '' })), {}, apagadosEm('e:ana@x.com', '2026-10-24T00:00:00Z'))
  assert.equal(r.records.length, 0)
})

test('sem tabela, sem apagados ou falha de leitura: devolve tudo como estava', async () => {
  const d = dados(registro())
  assert.equal(await ocultarApagados(d, {}, async () => ({ rows: [] })), d)
  assert.equal(await ocultarApagados(d, {}, async () => { throw Object.assign(new Error('x'), { code: '42P01' }) }), d)
  assert.equal(await ocultarApagados(d, {}, async () => { throw new Error('db caiu') }), d)
  assert.equal(await ocultarApagados(d, null), d)
})
