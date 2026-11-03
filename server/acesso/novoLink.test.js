import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarTokenNovoLink, lerTokenNovoLink, urlNovoLink } from './tokenNovoLink.js'
import { ASSUNTO_NOVO_LINK, criarLimite, criarServicoNovoLink, mascararEmail } from './novoLink.js'
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

test('e-mail de boas-vindas: o botão "Receber outro link" aponta para o endereço assinado', async () => {
  const url = urlNovoLink(ENV, 42)
  const html = renderizar(await carregarTemplate('boas-vindas-link'), { nome: 'Ana', email: 'ana@exemplo.com', linkSenha: 'https://x/primeiro-acesso?token=A', linkNovo: url, validade: '30 minutos' })
  assert.ok(html.includes(`href="${url}"`))
  assert.ok(html.includes('Receber outro link'))
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
  assert.ok(envio.html.includes('primeiro-acesso?token=NOVO'))
  assert.ok(envio.html.includes('/novo-link?t=42.'), 'o e-mail novo também traz o botão para pedir outro')
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
