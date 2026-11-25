import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classificarResposta,
  criarVerificacao,
  extrairMensagem,
  handleWhatsappRespostaRequest,
  modoVerificacao,
  rodarVerificacoes,
  tratarResposta,
} from './verificacaoAcesso.js'

const ENV = {
  VERIFICACAO_ACESSO_MODO: 'ativo',
  TELWAY_V2_TOKEN: 'token-de-teste',
  APP_URL: 'https://dash.tuzinho.academy',
  EVOLUTION_WEBHOOK_SEGREDO: 'segredo-123',
  EVOLUTION_ALUNO_INSTANCIA: 'iphone-branco',
}
const T0 = new Date('2026-11-25T12:00:00Z')
const apos = (min) => new Date(T0.getTime() + min * 60_000)

/** Repositório em memória com o mesmo contrato do de produção. */
function repoFalso() {
  const linhas = []
  let id = 0
  return {
    linhas,
    async agendar(i) {
      if (linhas.some((l) => l.chave === i.chave)) return 0
      linhas.push({
        id: ++id, chave: i.chave, email: i.email, nome: i.nome, telefone: i.telefone, curso: i.curso, acesso_id: i.acessoId ?? null,
        estado: 'aguardando', whatsapp_em: i.whatsappEm, whatsapp_enviado_em: null, whatsapp_erro: null,
        email_em: i.emailEm, email_enviado_em: null, email_tentativas: 0, email_erro: null, resposta: null,
      })
      return 1
    },
    async whatsappVencidos(agora) {
      return linhas.filter((l) => l.estado === 'aguardando' && !l.whatsapp_enviado_em && !l.whatsapp_erro && l.whatsapp_em <= agora)
    },
    async emailsVencidos(agora) {
      return linhas.filter((l) => ['aguardando', 'respondeu'].includes(l.estado) && !l.email_enviado_em && l.email_tentativas < 3 && l.email_em <= agora)
    },
    async abertaPorTelefone(numero) {
      const final = String(numero).slice(-8)
      return linhas.filter((l) => l.whatsapp_enviado_em && ['aguardando', 'sem_acesso', 'respondeu'].includes(l.estado) && String(l.telefone).slice(-8) === final).at(-1) ?? null
    },
    async marcar(idLinha, campos) {
      Object.assign(linhas.find((l) => l.id === idLinha), campos)
    },
  }
}

function integFalso({ falharEmail = false } = {}) {
  const chamadas = { whatsapp: [], emails: [], avisos: [] }
  return {
    chamadas,
    v2Configurado: () => true,
    gerarLinkSenha: async () => ({ url: 'https://gestao.tuzinho.academy/primeiro-acesso?token=SEGREDO', expiraEm: apos(30).toISOString() }),
    carregarTemplate: async () => '<a href="{{linkSenha}}">{{nome}}</a>',
    renderizar: (modelo, v) => modelo.replace('{{linkSenha}}', v.linkSenha).replace('{{nome}}', v.nome),
    enviarEmail: async (_env, dados) => {
      if (falharEmail) throw new Error('Brevo respondeu 500')
      chamadas.emails.push(dados)
      return { ok: true }
    },
    enviarWhatsapp: async (_env, dados) => {
      chamadas.whatsapp.push(dados)
      return { status: 201 }
    },
    avisarProblema: async (_env, texto) => {
      chamadas.avisos.push(texto)
    },
  }
}

const venda = { evento: 'PURCHASE_APPROVED', email: 'Ana@X.com', nome: 'Ana Souza', primeiroNome: 'Ana', transacao: 'HP1', eventId: 'e1', telefoneBruto: '27 99500-6807', pais: 'BR' }

async function comAgendamento(env = ENV) {
  const repo = repoFalso()
  await criarVerificacao(env, repo).aoProcessar(venda, { tipo: 'liberar', curso: 'Essentials' }, T0)
  return repo
}

test('modo: desligado por padrão e sem hook', () => {
  assert.equal(modoVerificacao({}), 'desligado')
  assert.equal(modoVerificacao({ VERIFICACAO_ACESSO_MODO: 'ATIVO' }), 'ativo')
  assert.equal(criarVerificacao({}), null)
})

test('agenda WhatsApp em 10 min e e-mail em 31 min, só para compra aprovada liberada pela V2', async () => {
  const repo = await comAgendamento()
  assert.equal(repo.linhas.length, 1)
  const [l] = repo.linhas
  assert.equal(l.email, 'ana@x.com')
  assert.equal(l.telefone, '5527995006807')
  assert.equal(l.whatsapp_em.getTime(), apos(10).getTime())
  assert.equal(l.email_em.getTime(), apos(31).getTime())

  const outros = repoFalso()
  const hook = criarVerificacao(ENV, outros)
  await hook.aoProcessar({ ...venda, evento: 'PURCHASE_BILLET_PRINTED' }, { tipo: 'sequencia' }, T0)
  await hook.aoProcessar(venda, { tipo: 'liberar' }, T0) // sem curso: ainda agenda
  await hook.aoProcessar(venda, { tipo: 'liberar' }, T0) // repetido: não duplica
  assert.equal(outros.linhas.length, 1)
  await criarVerificacao({ ...ENV, TELWAY_V2_TOKEN: '' }, outros).aoProcessar({ ...venda, transacao: 'HP2' }, { tipo: 'liberar' }, T0)
  assert.equal(outros.linhas.length, 1, 'sem API V2 não há link de senha para verificar')
})

test('WhatsApp só sai depois dos 10 min e traz a pergunta com 1 e 2', async () => {
  const repo = await comAgendamento()
  const integ = integFalso()
  await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(5) })
  assert.equal(integ.chamadas.whatsapp.length, 0)
  const r = await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(11) })
  assert.equal(r.whatsapp, 1)
  assert.equal(integ.chamadas.whatsapp[0].numero, '5527995006807')
  assert.match(integ.chamadas.whatsapp[0].texto, /1️⃣ Sim, consegui[\s\S]*2️⃣ Não consegui/)
  await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(12) })
  assert.equal(integ.chamadas.whatsapp.length, 1, 'não repete a pergunta')
})

test('e-mail de link novo sai depois de o link vencer, só para quem não confirmou', async () => {
  const repo = await comAgendamento()
  const integ = integFalso()
  await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(11) })
  assert.equal(integ.chamadas.emails.length, 0, 'ainda dentro dos 30 min do link')
  const r = await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(32) })
  assert.equal(r.emails, 1)
  const email = integ.chamadas.emails[0]
  assert.equal(email.para, 'ana@x.com')
  assert.match(email.html, /\/criar-senha\?c=/, 'o botão passa pela página do dash')
  assert.ok(!email.html.includes('SEGREDO'), 'o link da plataforma não aparece em claro')
  await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(60) })
  assert.equal(integ.chamadas.emails.length, 1, 'não repete')

  const confirmada = await comAgendamento()
  confirmada.linhas[0].estado = 'confirmado'
  const integ2 = integFalso()
  await rodarVerificacoes(ENV, { repo: confirmada, integ: integ2, agora: () => apos(40) })
  assert.equal(integ2.chamadas.emails.length, 0, 'quem confirmou não recebe link novo')
})

test('falha no e-mail: tenta de novo mais tarde e desiste depois de 3', async () => {
  const repo = await comAgendamento()
  const integ = integFalso({ falharEmail: true })
  let t = 32
  for (let i = 0; i < 5; i += 1) {
    await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(t) })
    t += 11
  }
  assert.equal(repo.linhas[0].email_tentativas, 3)
  assert.equal(repo.linhas[0].email_enviado_em, null)
})

test('modo teste: não envia nada', async () => {
  const env = { ...ENV, VERIFICACAO_ACESSO_MODO: 'teste' }
  const repo = await comAgendamento(env)
  const integ = integFalso()
  const r = await rodarVerificacoes(env, { repo, integ, agora: () => apos(40) })
  assert.equal(integ.chamadas.whatsapp.length + integ.chamadas.emails.length, 0)
  assert.ok(r.simulados >= 1)
})

test('classifica as respostas', () => {
  for (const t of ['1', 'Sim', 'sim!', 'Consegui', 'consegui sim', '1️⃣', '👍', 'Ok', 'deu certo']) assert.equal(classificarResposta(t), 'sim', t)
  for (const t of ['2', 'Não', 'nao', 'não consegui', 'Não consegui entrar', '2️⃣', 'ainda não', 'nao recebi o email']) assert.equal(classificarResposta(t), 'nao', t)
  for (const t of ['', 'quem é você?', 'me ajuda', 'qual o preço', '3', 'talvez depois']) assert.equal(classificarResposta(t), 'outra', t)
})

test('extrai só mensagem recebida de conversa direta', () => {
  const base = { event: 'messages.upsert', instance: 'iphone-branco', data: { key: { remoteJid: '5527995006807@s.whatsapp.net', fromMe: false }, message: { conversation: '1' } } }
  assert.deepEqual(extrairMensagem(base), { numero: '5527995006807', texto: '1' })
  assert.deepEqual(extrairMensagem({ ...base, event: 'MESSAGES_UPSERT' }), { numero: '5527995006807', texto: '1' })
  assert.equal(extrairMensagem({ ...base, data: { ...base.data, key: { ...base.data.key, fromMe: true } } }), null)
  assert.equal(extrairMensagem({ ...base, data: { ...base.data, key: { remoteJid: '1203@g.us', fromMe: false } } }), null, 'grupo')
  assert.equal(extrairMensagem({ ...base, event: 'connection.update' }), null)
  const estendida = { ...base, data: { ...base.data, message: { extendedTextMessage: { text: 'não consegui' } } } }
  assert.equal(extrairMensagem(estendida).texto, 'não consegui')
  const lid = { ...base, data: { key: { remoteJid: '99@lid', remoteJidAlt: '5527995006807@s.whatsapp.net', fromMe: false }, message: { conversation: '2' } } }
  assert.equal(extrairMensagem(lid).numero, '5527995006807')
})

async function conversa(texto, preparar = () => {}) {
  const repo = await comAgendamento()
  const integ = integFalso()
  await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(11) })
  preparar(repo)
  const resultado = await tratarResposta(ENV, { numero: '5527995006807', texto }, { repo, integ, agora: () => apos(15) })
  return { repo, integ, resultado }
}

test('resposta "1": confirma, agradece e cancela o e-mail de link novo', async () => {
  const { repo, integ, resultado } = await conversa('1')
  assert.equal(resultado, 'confirmado')
  assert.equal(repo.linhas[0].estado, 'confirmado')
  assert.match(integ.chamadas.whatsapp.at(-1).texto, /Bons estudos/)
  await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(40) })
  assert.equal(integ.chamadas.emails.length, 0)
})

test('resposta "2": manda link novo na hora, responde e avisa a equipe, sem repetir o e-mail agendado', async () => {
  const { repo, integ, resultado } = await conversa('2')
  assert.equal(resultado, 'novo_link')
  assert.equal(repo.linhas[0].estado, 'sem_acesso')
  assert.equal(integ.chamadas.emails.length, 1)
  assert.match(integ.chamadas.whatsapp.at(-1).texto, /a\*\*\*@x\.com|a\*+@x\.com/)
  assert.match(integ.chamadas.avisos[0], /não conseguiu acessar/)
  await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(40) })
  assert.equal(integ.chamadas.emails.length, 1, 'o e-mail agendado não duplica')
})

test('"não" de novo depois do link novo: chama a equipe', async () => {
  const { repo, integ } = await conversa('2')
  const r = await tratarResposta(ENV, { numero: '5527995006807', texto: 'não consegui' }, { repo, integ, agora: () => apos(30) })
  assert.equal(r, 'sem_acesso')
  assert.match(integ.chamadas.avisos.at(-1), /continua sem acesso/)
  assert.equal(integ.chamadas.emails.length, 1)
})

test('resposta livre: avisa a equipe com o texto limpo e não responde sozinho', async () => {
  const { repo, integ, resultado } = await conversa('me ajuda *por favor* [link]')
  assert.equal(resultado, 'respondeu')
  assert.equal(repo.linhas[0].estado, 'respondeu')
  assert.match(integ.chamadas.avisos[0], /me ajuda por favor link/)
  assert.equal(integ.chamadas.whatsapp.length, 1, 'só a pergunta original saiu')
})

test('mensagem de número sem verificação aberta é ignorada', async () => {
  const repo = await comAgendamento() // pergunta ainda não enviada
  const integ = integFalso()
  assert.equal(await tratarResposta(ENV, { numero: '5527995006807', texto: '1' }, { repo, integ, agora: () => apos(5) }), 'ignorada')
  assert.equal(await tratarResposta(ENV, { numero: '5511911112222', texto: '1' }, { repo, integ, agora: () => apos(15) }), 'ignorada')
  assert.equal(integ.chamadas.whatsapp.length + integ.chamadas.avisos.length, 0)
})

// ── webhook HTTP ───────────────────────────────────────────────────────────────────────────────────────

function chamarWebhook({ url = '/api/whatsapp-resposta?s=segredo-123', method = 'POST', headers = {}, corpo = {}, env = ENV, deps = {} }) {
  return new Promise((resolve) => {
    const req = { url, method, headers, on(evento, cb) { if (evento === 'data') cb(Buffer.from(JSON.stringify(corpo))); if (evento === 'end') cb() } }
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(txt) { resolve({ status: this.statusCode, json: JSON.parse(txt) }) } }
    void handleWhatsappRespostaRequest(req, res, env, deps)
  })
}

test('webhook: exige o segredo e responde 404/403 sem revelar nada', async () => {
  assert.equal((await chamarWebhook({ env: { ...ENV, EVOLUTION_WEBHOOK_SEGREDO: '' } })).status, 404)
  assert.equal((await chamarWebhook({ env: { ...ENV, VERIFICACAO_ACESSO_MODO: 'desligado' } })).status, 404)
  assert.equal((await chamarWebhook({ method: 'GET' })).status, 404)
  assert.equal((await chamarWebhook({ url: '/api/whatsapp-resposta?s=errado' })).status, 403)
  assert.equal((await chamarWebhook({ url: '/api/whatsapp-resposta' })).status, 403)
  assert.equal((await chamarWebhook({ url: '/api/whatsapp-resposta', headers: { 'x-webhook-secret': 'segredo-123' } })).status, 200)
})

test('webhook: trata mensagem de verdade e ignora outra instância', async () => {
  const repo = await comAgendamento()
  const integ = integFalso()
  await rodarVerificacoes(ENV, { repo, integ, agora: () => apos(11) })
  const corpo = { event: 'messages.upsert', instance: 'iphone-branco', data: { key: { remoteJid: '5527995006807@s.whatsapp.net', fromMe: false }, message: { conversation: '1' } } }
  const outraInstancia = await chamarWebhook({ corpo: { ...corpo, instance: 'tuzinho' }, deps: { repo, integ, agora: () => apos(15) } })
  assert.equal(outraInstancia.json.ignorada, true)
  assert.equal(repo.linhas[0].estado, 'aguardando')
  const ok = await chamarWebhook({ corpo, deps: { repo, integ, agora: () => apos(15) } })
  assert.equal(ok.json.resultado, 'confirmado')
})
