import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarTokenNovoLink, lerTokenNovoLink, urlNovoLink } from './tokenNovoLink.js'
import { FOLGA_MS, criarTokenCriarSenha, lerTokenCriarSenha, urlCriarSenha } from './tokenCriarSenha.js'
import { ASSUNTO_NOVO_LINK, criarLimite, criarServicoCriarSenha, criarServicoNovoLink, mascararEmail } from './novoLink.js'
import { carregarTemplate, renderizar } from './integracoes.js'

const ENV = { ACESSO_MODO: 'ativo', TELWAY_V2_TOKEN: 'token-de-teste', APP_URL: 'https://dash.tuzinho.academy/' }

// ── código do botão ───────────────────────────────────────────────────────────

test('código do botão: vai e volta, rejeita adulteração e não leva dado pessoal', () => {
  const token = criarTokenNovoLink(ENV, 42)
  assert.match(token, /^42\.[\w-]{22}$/)
  assert.equal(lerTokenNovoLink(ENV, token), 42)

  const [id, assinatura] = token.split('.')
  assert.equal(lerTokenNovoLink(ENV, `43.${assinatura}`), null, 'trocar o id invalida')
  assert.equal(lerTokenNovoLink(ENV, `${id}.${assinatura.slice(0, -1)}x`), null, 'assinatura alterada')
  assert.equal(lerTokenNovoLink(ENV, ''), null)
  assert.equal(lerTokenNovoLink(ENV, '42'), null)
  assert.equal(lerTokenNovoLink(ENV, '42.a.b'), null)
  assert.equal(lerTokenNovoLink({ ...ENV, TELWAY_V2_TOKEN: 'outro-token' }, token), null, 'outra chave não aceita')
})

test('código do botão: sem segredo ou com id inválido não gera nada; NOVO_LINK_SEGREDO tem prioridade', () => {
  assert.equal(criarTokenNovoLink({}, 1), null)
  assert.equal(urlNovoLink({}, 1), null)
  assert.equal(criarTokenNovoLink(ENV, 0), null)
  assert.equal(criarTokenNovoLink(ENV, 'abc'), null)
  assert.equal(criarTokenNovoLink(ENV, undefined), null)
  const comSegredo = { ...ENV, NOVO_LINK_SEGREDO: 'segredo-proprio' }
  assert.notEqual(criarTokenNovoLink(comSegredo, 7), criarTokenNovoLink(ENV, 7))
  assert.equal(lerTokenNovoLink(comSegredo, criarTokenNovoLink(comSegredo, 7)), 7)
})

test('endereço do botão usa o endereço do dash e não tem e-mail nem nome', () => {
  const url = urlNovoLink(ENV, 42)
  assert.match(url, /^https:\/\/dash\.tuzinho\.academy\/novo-link\?t=42\.[\w-]{22}$/)
  assert.ok(!url.includes('@'))
})

test('e-mail de boas-vindas: o botão "Criar minha senha" aponta para a página do dash e não sobra botão extra', async () => {
  const url = urlCriarSenha(ENV, { url: 'https://tuzinho.academy/primeiro-acesso?token=A', expiraEm: '2026-10-16T15:30:00Z', acessoId: 42 })
  const html = renderizar(await carregarTemplate('boas-vindas-link'), { nome: 'Ana', email: 'ana@exemplo.com', linkSenha: url, validade: '30 minutos' })
  assert.ok(html.includes(`href="${url}"`))
  assert.ok(html.includes('Criar minha senha'))
  assert.ok(!html.includes('Receber outro link'), 'o pedido de novo envio agora fica na página, não no e-mail')
  assert.ok(!/\{\{\w+\}\}/.test(html))
})

// ── limite de pedidos ─────────────────────────────────────────────────────────

test('limite de pedidos: barra depois do máximo e libera quando a janela passa', () => {
  let agora = 1_000
  const limite = criarLimite({ max: 2, janelaMs: 60_000 }, () => agora)
  assert.equal(limite('a').ok, true)
  assert.equal(limite('a').ok, true)
  const barrado = limite('a')
  assert.equal(barrado.ok, false)
  assert.equal(barrado.espera, 60)
  assert.equal(limite('b').ok, true, 'cada chave tem a sua conta')
  agora += 61_000
  assert.equal(limite('a').ok, true)
})

test('e-mail mascarado: mostra onde foi sem entregar o endereço inteiro', () => {
  assert.equal(mascararEmail('ana@exemplo.com'), 'a**@exemplo.com')
  assert.equal(mascararEmail('joaosilva@gmail.com'), 'j******@gmail.com')
})

// ── pedido do aluno ───────────────────────────────────────────────────────────

function criarServicoDeTeste({ falhar = null, acesso = { id: 42, email: 'ana@exemplo.com', nome: 'Ana' } } = {}) {
  const chamadas = []
  const integ = {
    v2Configurado: (env) => Boolean(env.TELWAY_V2_TOKEN),
    carregarTemplate,
    renderizar,
    async gerarLinkSenha(env, dados) {
      chamadas.push(['gerarLinkSenha', dados])
      if (falhar === 'plataforma') throw new Error('alunos/link-senha respondeu 500: erro')
      if (falhar === 'inativo') throw new Error('alunos/link-senha respondeu 409: conta inativa')
      return { url: 'https://tuzinho.academy/primeiro-acesso?token=NOVO', expiraEm: new Date(Date.now() + 30 * 60_000).toISOString() }
    },
    async enviarEmail(env, dados) {
      chamadas.push(['enviarEmail', dados])
      return { messageId: 'm1' }
    },
  }
  const deps = { integ, buscarAcesso: async (id) => (id === acesso?.id ? acesso : null) }
  return { chamadas, deps, processar: criarServicoNovoLink() }
}

test('novo link: manda o link novo SÓ por e-mail ao dono do acesso e não devolve o link na resposta', async () => {
  const { chamadas, deps, processar } = criarServicoDeTeste()
  const resposta = await processar(ENV, { token: criarTokenNovoLink(ENV, 42), ip: '1.1.1.1' }, deps)

  assert.equal(resposta.status, 200)
  assert.deepEqual(resposta.corpo, { ok: true, email: 'a**@exemplo.com' })
  assert.ok(!JSON.stringify(resposta).includes('NOVO'), 'o link nunca volta na resposta')

  const envio = chamadas.find(([nome]) => nome === 'enviarEmail')[1]
  assert.equal(envio.para, 'ana@exemplo.com')
  assert.equal(envio.assunto, ASSUNTO_NOVO_LINK)
  const codigo = /criar-senha\?c=([\w-]+)/.exec(envio.html)[1]
  assert.equal(lerTokenCriarSenha(ENV, codigo).url, 'https://tuzinho.academy/primeiro-acesso?token=NOVO', 'o botão leva, cifrado, o link novo')
  assert.ok(envio.html.includes('/criar-senha?c='), 'o e-mail novo também passa pela página do dash')
  assert.deepEqual(chamadas.find(([nome]) => nome === 'gerarLinkSenha')[1], { email: 'ana@exemplo.com' })
})

test('novo link: código falso ou de acesso que não existe é recusado sem enviar nada', async () => {
  const { chamadas, deps, processar } = criarServicoDeTeste()
  const falso = await processar(ENV, { token: '42.aaaaaaaaaaaaaaaaaaaaaa', ip: '1.1.1.1' }, deps)
  assert.equal(falso.status, 400)
  const inexistente = await processar(ENV, { token: criarTokenNovoLink(ENV, 99), ip: '1.1.1.2' }, deps)
  assert.equal(inexistente.status, 400)
  assert.equal(chamadas.length, 0)
})

test('novo link: o mesmo acesso só pede outro depois de 1 minuto (e no máximo 5 por hora)', async () => {
  let agora = 1_000_000
  const processar = criarServicoNovoLink({ relogio: () => agora })
  const { deps } = criarServicoDeTeste()
  const token = criarTokenNovoLink(ENV, 42)

  assert.equal((await processar(ENV, { token, ip: '1.1.1.1' }, deps)).status, 200)
  const logo = await processar(ENV, { token, ip: '1.1.1.1' }, deps)
  assert.equal(logo.status, 429)
  assert.match(logo.corpo.error, /Já enviamos um link/)

  for (let i = 0; i < 4; i += 1) {
    agora += 61_000
    assert.equal((await processar(ENV, { token, ip: `2.2.2.${i}` }, deps)).status, 200)
  }
  agora += 61_000
  assert.equal((await processar(ENV, { token, ip: '3.3.3.3' }, deps)).status, 429, 'passou de 5 na mesma hora')
})

test('novo link: limite por endereço de rede barra quem tenta muitos códigos', async () => {
  const processar = criarServicoNovoLink()
  const { deps } = criarServicoDeTeste()
  for (let i = 0; i < 10; i += 1) assert.equal((await processar(ENV, { token: `${i + 1}.x`, ip: '9.9.9.9' }, deps)).status, 400)
  assert.equal((await processar(ENV, { token: '1.x', ip: '9.9.9.9' }, deps)).status, 429)
})

test('novo link: sem a API V2 ou sem segredo não funciona; erro da plataforma vira mensagem amigável', async () => {
  const { deps, processar } = criarServicoDeTeste()
  const token = criarTokenNovoLink(ENV, 42)
  assert.equal((await processar({ ACESSO_MODO: 'ativo' }, { token, ip: '1.1.1.1' }, deps)).status, 503)

  const queda = criarServicoDeTeste({ falhar: 'plataforma' })
  const r502 = await queda.processar(ENV, { token, ip: '1.1.1.1' }, queda.deps)
  assert.equal(r502.status, 502)
  assert.ok(!r502.corpo.error.includes('500'), 'não mostra detalhe técnico')

  const inativo = criarServicoDeTeste({ falhar: 'inativo' })
  assert.equal((await inativo.processar(ENV, { token, ip: '1.1.1.1' }, inativo.deps)).status, 409)
  assert.ok(!inativo.chamadas.some(([nome]) => nome === 'enviarEmail'))
})

// ── botão "Criar minha senha": código cifrado e decisão por horário ───────────

const LINK_PLATAFORMA = 'https://tuzinho.academy/primeiro-acesso?token=SEGREDO_DA_PLATAFORMA'
const AGORA = Date.parse('2026-10-16T15:00:00Z')

test('código do "Criar minha senha": vai e volta, não deixa ler o link e rejeita adulteração', () => {
  const expiraEm = '2026-10-16T15:30:00Z'
  const token = criarTokenCriarSenha(ENV, { url: LINK_PLATAFORMA, expiraEm, acessoId: 42 })
  assert.ok(token && !token.includes('SEGREDO') && !token.includes('tuzinho'), 'o link da plataforma não fica legível no endereço')
  assert.deepEqual(lerTokenCriarSenha(ENV, token), { url: LINK_PLATAFORMA, expiraEmMs: Date.parse(expiraEm), acessoId: 42 })

  const trocado = `${token.slice(0, 40)}${token[40] === 'A' ? 'B' : 'A'}${token.slice(41)}`
  assert.equal(lerTokenCriarSenha(ENV, trocado), null, 'qualquer alteração invalida')
  assert.equal(lerTokenCriarSenha({ ...ENV, TELWAY_V2_TOKEN: 'outra-chave' }, token), null)
  assert.equal(lerTokenCriarSenha(ENV, ''), null)
  assert.equal(lerTokenCriarSenha(ENV, 'abc'), null)
  assert.equal(lerTokenCriarSenha(ENV, 'x'.repeat(3000)), null)
  assert.equal(lerTokenCriarSenha(ENV, 'não é base64!'), null)
  assert.notEqual(token, criarTokenCriarSenha(ENV, { url: LINK_PLATAFORMA, expiraEm, acessoId: 42 }), 'cada código usa um sorteio novo')
})

test('código do "Criar minha senha": sem segredo, link fora do padrão ou data inválida não geram nada', () => {
  assert.equal(criarTokenCriarSenha({}, { url: LINK_PLATAFORMA, expiraEm: '2026-10-16T15:30:00Z' }), null)
  assert.equal(urlCriarSenha({}, { url: LINK_PLATAFORMA, expiraEm: '2026-10-16T15:30:00Z' }), null)
  assert.equal(criarTokenCriarSenha(ENV, { url: 'http://inseguro/x', expiraEm: '2026-10-16T15:30:00Z' }), null)
  assert.equal(criarTokenCriarSenha(ENV, { url: 'javascript:alert(1)', expiraEm: '2026-10-16T15:30:00Z' }), null)
  assert.equal(criarTokenCriarSenha(ENV, { url: LINK_PLATAFORMA, expiraEm: 'amanhã' }), null)
  const semId = lerTokenCriarSenha(ENV, criarTokenCriarSenha(ENV, { url: LINK_PLATAFORMA, expiraEm: '2026-10-16T15:30:00Z' }))
  assert.equal(semId.acessoId, null)
  assert.match(urlCriarSenha(ENV, { url: LINK_PLATAFORMA, expiraEm: '2026-10-16T15:30:00Z', acessoId: 1 }), /^https:\/\/dash\.tuzinho\.academy\/criar-senha\?c=[\w-]+$/)
})

function decisor(agora = AGORA) {
  return criarServicoCriarSenha({ relogio: () => agora })
}
const tokenCom = (expiraEm, acessoId = 42) => criarTokenCriarSenha(ENV, { url: LINK_PLATAFORMA, expiraEm, acessoId })

test('"Criar minha senha": dentro dos 30 minutos manda para o link da plataforma', () => {
  const r = decisor()(ENV, { token: tokenCom('2026-10-16T15:30:00Z'), ip: '1.1.1.1' })
  assert.equal(r.status, 200)
  assert.deepEqual(r.corpo, { estado: 'ativo', url: LINK_PLATAFORMA })
})

test('"Criar minha senha": depois do vencimento avisa e oferece novo envio (com a folga de segurança)', () => {
  const vencido = decisor(Date.parse('2026-10-16T15:31:00Z'))(ENV, { token: tokenCom('2026-10-16T15:30:00Z'), ip: '1.1.1.1' })
  assert.equal(vencido.status, 200)
  assert.equal(vencido.corpo.estado, 'vencido')
  assert.ok(!JSON.stringify(vencido.corpo).includes('SEGREDO'), 'o link vencido não é devolvido')
  assert.equal(lerTokenNovoLink(ENV, vencido.corpo.t), 42, 'o código de novo envio é o do mesmo acesso')

  const expira = Date.parse('2026-10-16T15:30:00Z')
  assert.equal(decisor(expira - FOLGA_MS - 1)(ENV, { token: tokenCom('2026-10-16T15:30:00Z'), ip: '2.2.2.2' }).corpo.estado, 'ativo')
  assert.equal(decisor(expira - FOLGA_MS)(ENV, { token: tokenCom('2026-10-16T15:30:00Z'), ip: '3.3.3.3' }).corpo.estado, 'vencido', 'nos últimos segundos já conta como vencido')
})

test('"Criar minha senha": vencido sem acesso conhecido ou sem API V2 não oferece novo envio', () => {
  const agoraTarde = Date.parse('2026-10-16T16:00:00Z')
  const semId = decisor(agoraTarde)(ENV, { token: tokenCom('2026-10-16T15:30:00Z', null), ip: '1.1.1.1' })
  assert.deepEqual(semId.corpo, { estado: 'vencido' })
  const envSemV2 = { ...ENV, TELWAY_V2_TOKEN: '', NOVO_LINK_SEGREDO: 'so-o-segredo' }
  const tokenSemV2 = criarTokenCriarSenha(envSemV2, { url: LINK_PLATAFORMA, expiraEm: '2026-10-16T15:30:00Z', acessoId: 42 })
  assert.deepEqual(decisor(agoraTarde)(envSemV2, { token: tokenSemV2, ip: '2.2.2.2' }).corpo, { estado: 'vencido' })
})

test('"Criar minha senha": código falso é inválido e o excesso de pedidos por rede é barrado', () => {
  const decidir = decisor()
  assert.deepEqual(decidir(ENV, { token: 'lixo', ip: '1.1.1.1' }), { status: 400, corpo: { estado: 'invalido' } })
  assert.equal(decidir(ENV, { token: '', ip: '1.1.1.1' }).status, 400)
  for (let i = 0; i < 28; i += 1) decidir(ENV, { token: 'lixo', ip: '1.1.1.1' })
  assert.equal(decidir(ENV, { token: tokenCom('2026-10-16T15:30:00Z'), ip: '1.1.1.1' }).status, 429)
  assert.equal(decidir(ENV, { token: tokenCom('2026-10-16T15:30:00Z'), ip: '9.9.9.9' }).status, 200, 'outra rede segue normal')
})
