import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizarEvento } from '../acesso/hotmart.js'
import { decidir } from '../acesso/regras.js'
import { EMAILS, montarEmail } from './conteudo.js'
import { agendamentosDoEvento, criarSequencias, enviarDaFila, modoSequencias, naJanelaDeEnvio } from './fila.js'

const AGORA = new Date('2026-10-21T15:00:00Z') // 12h em São Paulo

function venda({ event = 'PURCHASE_OUT_OF_SHOPPING_CART', pagamento = 'PIX', produto = 'Essentials', transacao = 'HP1', email = 'ana@exemplo.com', pix = '00020126...', billet = 'https://boleto' } = {}) {
  return normalizarEvento({
    id: 'e1',
    event,
    data: {
      product: { name: produto },
      buyer: { name: 'Ana Souza', email },
      purchase: { transaction: transacao, payment: { type: pagamento, pix_code: pix, billet_url: billet } },
    },
  })
}

test('carrinho abandonado agenda 24h e 72h, só para Essentials/Mentoria Essentials', () => {
  const { agendar, cancelar } = agendamentosDoEvento(venda(), { tipo: 'abandono' }, AGORA)
  assert.equal(cancelar, null)
  assert.deepEqual(agendar.map((i) => i.passo), ['carrinho_24h', 'carrinho_72h'])
  assert.equal(agendar[0].enviarEm.getTime(), AGORA.getTime() + 24 * 3_600_000)
  assert.equal(agendarVazio(venda({ produto: 'Workshop Presencial' })), true)
})

const agendarVazio = (v) => agendamentosDoEvento(v, {}, AGORA).agendar.length === 0

test('Pix gerado e boleto gerado têm sequências diferentes e guardam o código/link', () => {
  const pix = agendamentosDoEvento(venda({ event: 'PURCHASE_BILLET_PRINTED', pagamento: 'PIX' }), {}, AGORA).agendar
  assert.deepEqual(pix.map((i) => i.passo), ['pix_90min', 'pix_18h'])
  assert.equal(pix[0].prioridade, 1)
  assert.equal(pix[0].dados.pixCodigo, '00020126...')
  const boleto = agendamentosDoEvento(venda({ event: 'PURCHASE_BILLET_PRINTED', pagamento: 'BILLET' }), {}, AGORA).agendar
  assert.deepEqual(boleto.map((i) => i.passo), ['boleto_24h', 'boleto_72h'])
  assert.equal(boleto[0].dados.linkPagamento, 'https://boleto')
})

test('compra aprovada cancela as sequências de venda e, se liberou, agenda o onboarding', () => {
  const nova = agendamentosDoEvento(venda({ event: 'PURCHASE_APPROVED' }), { tipo: 'liberar' }, AGORA)
  assert.equal(nova.cancelar, 'ana@exemplo.com')
  assert.deepEqual(nova.agendar.map((i) => i.passo), ['onboarding_d1', 'onboarding_d3', 'onboarding_d7'])
  const renovacao = agendamentosDoEvento(venda({ event: 'PURCHASE_APPROVED' }), { tipo: 'renovar' }, AGORA)
  assert.equal(renovacao.cancelar, 'ana@exemplo.com')
  assert.equal(renovacao.agendar.length, 0)
})

test('a chave é estável: o mesmo evento reenviado não duplica e-mail', () => {
  const a = agendamentosDoEvento(venda({ event: 'PURCHASE_BILLET_PRINTED' }), {}, AGORA).agendar
  const b = agendamentosDoEvento(venda({ event: 'PURCHASE_BILLET_PRINTED' }), {}, new Date(AGORA.getTime() + 5 * 60_000)).agendar
  assert.deepEqual(a.map((i) => i.chave), b.map((i) => i.chave))
})

test('boleto/Pix gerado e expirada viram evento de sequência, sem mexer na plataforma', () => {
  assert.deepEqual(decidir(venda({ event: 'PURCHASE_BILLET_PRINTED' })), { tipo: 'sequencia', passos: [] })
  assert.deepEqual(decidir(venda({ event: 'PURCHASE_EXPIRED' })), { tipo: 'sequencia', passos: [] })
})

test('todos os e-mails montam, escapam HTML e usam o link certo', () => {
  for (const chave of Object.keys(EMAILS)) {
    const { assunto, html } = montarEmail(chave, { nome: 'Ana <script>', curso: 'Essentials', pixCodigo: '0002<x>', linkPagamento: 'https://boleto?a=1&b=2' })
    assert.ok(assunto.length > 5 && assunto.length < 90, `assunto de ${chave}`)
    assert.ok(!html.includes('<script>'), `html de ${chave} deixou passar tag`)
    assert.ok(html.includes('Ana'), chave)
  }
  assert.ok(montarEmail('boleto_24h', { nome: 'Ana', linkPagamento: 'https://boleto?a=1&b=2' }).html.includes('https://boleto?a=1&amp;b=2'))
  assert.ok(montarEmail('pix_90min', { nome: 'Ana', pixCodigo: 'PIXCODE123' }).html.includes('PIXCODE123'))
  assert.ok(!montarEmail('pix_90min', { nome: 'Ana' }).html.includes('Pix copia e cola'))
})

test('janela de envio: 8h às 21h de São Paulo', () => {
  assert.equal(naJanelaDeEnvio(new Date('2026-10-21T15:00:00Z')), true) // 12h
  assert.equal(naJanelaDeEnvio(new Date('2026-10-21T10:00:00Z')), false) // 7h
  assert.equal(naJanelaDeEnvio(new Date('2026-10-22T00:30:00Z')), false) // 21h30
})

test('modo desligado é o padrão e não cria nada', () => {
  assert.equal(modoSequencias({}), 'desligado')
  assert.equal(criarSequencias({}), null)
})

function filaFalsa(itens, { enviadosHoje = 0, comprouDepois = false } = {}) {
  const marcados = []
  return {
    marcados,
    async enviadosHoje() {
      return enviadosHoje
    },
    async vencidos(limite) {
      return itens.slice(0, limite)
    },
    async compraDepois() {
      return comprouDepois
    },
    async marcar(id, campos) {
      marcados.push([id, campos])
    },
  }
}
const item = (id, extra = {}) => ({ id, email: 'ana@exemplo.com', nome: 'Ana', cenario: 'pagamento', passo: 'pix_90min', dados: { curso: 'Essentials' }, tentativas: 0, ...extra })

test('enviar: modo ativo envia e marca; modo teste só simula', async () => {
  const enviados = []
  const enviar = async (env, dados) => enviados.push(dados)
  const fila = filaFalsa([item(1), item(2, { email: 'b@exemplo.com' })])
  const r = await enviarDaFila({ EMAIL_SEQUENCIAS_MODO: 'ativo' }, { fila, enviar, agora: () => AGORA })
  assert.equal(r.enviados, 2)
  assert.equal(enviados[0].para, 'ana@exemplo.com')
  assert.deepEqual(fila.marcados.map(([, c]) => c.estado), ['enviado', 'enviado'])

  const fila2 = filaFalsa([item(3)])
  const r2 = await enviarDaFila({ EMAIL_SEQUENCIAS_MODO: 'teste' }, { fila: fila2, enviar, agora: () => AGORA })
  assert.deepEqual([r2.simulados, r2.enviados], [1, 0])
  assert.equal(enviados.length, 2)
})

test('enviar: respeita o teto do dia, a janela e o modo desligado', async () => {
  const enviar = async () => assert.fail('não era para enviar')
  const ativo = { EMAIL_SEQUENCIAS_MODO: 'ativo', EMAIL_FILA_LIMITE_DIA: '10' }
  await enviarDaFila(ativo, { fila: filaFalsa([item(1)], { enviadosHoje: 10 }), enviar, agora: () => AGORA })
  await enviarDaFila(ativo, { fila: filaFalsa([item(1)]), enviar, agora: () => new Date('2026-10-21T10:00:00Z') })
  await enviarDaFila({}, { fila: filaFalsa([item(1)]), enviar, agora: () => AGORA })
})

test('enviar: o teto limita quantos saem na rodada', async () => {
  let saiu = 0
  const fila = filaFalsa([item(1), item(2), item(3)], { enviadosHoje: 8 })
  await enviarDaFila({ EMAIL_SEQUENCIAS_MODO: 'ativo', EMAIL_FILA_LIMITE_DIA: '10' }, { fila, enviar: async () => { saiu += 1 }, agora: () => AGORA })
  assert.equal(saiu, 2)
})

test('enviar: quem comprou depois não recebe e-mail de venda; e-mail inválido é descartado; falha tenta de novo', async () => {
  const enviar = async () => assert.fail('não era para enviar')
  const comprou = filaFalsa([item(1)], { comprouDepois: true })
  await enviarDaFila({ EMAIL_SEQUENCIAS_MODO: 'ativo' }, { fila: comprou, enviar, agora: () => AGORA })
  assert.equal(comprou.marcados[0][1].erro, 'comprou')

  const invalido = filaFalsa([item(2, { email: 'sem-arroba' })])
  await enviarDaFila({ EMAIL_SEQUENCIAS_MODO: 'ativo' }, { fila: invalido, enviar, agora: () => AGORA })
  assert.equal(invalido.marcados[0][1].estado, 'cancelado')

  const avisos = []
  const falha = filaFalsa([item(3, { tentativas: 2 }), item(4)])
  const r = await enviarDaFila({ EMAIL_SEQUENCIAS_MODO: 'ativo' }, {
    fila: falha,
    enviar: async () => { throw new Error('Brevo fora') },
    avisar: async (env, texto) => avisos.push(texto),
    agora: () => AGORA,
  })
  assert.equal(r.falhas, 2)
  assert.equal(falha.marcados[0][1].estado, 'falhou') // 3ª tentativa: desiste
  assert.equal(falha.marcados[1][1].estado, 'pendente') // 1ª: volta para a fila
  assert.equal(avisos.length, 1)
})

test('sequências: o motor agenda e cancela pela fila, e um erro da fila não escapa', async () => {
  const chamadas = []
  const fila = {
    async agendar(itens) { chamadas.push(['agendar', itens.length]) },
    async cancelarVendaPendente(email) { chamadas.push(['cancelar', email]) },
  }
  const seq = criarSequencias({ EMAIL_SEQUENCIAS_MODO: 'ativo' }, fila)
  await seq.aoProcessar(venda({ event: 'PURCHASE_APPROVED' }), { tipo: 'liberar' }, AGORA)
  assert.deepEqual(chamadas, [['cancelar', 'ana@exemplo.com'], ['agendar', 3]])

  const quebrada = criarSequencias({ EMAIL_SEQUENCIAS_MODO: 'ativo' }, { async agendar() { throw new Error('banco caiu') }, async cancelarVendaPendente() {} })
  await quebrada.aoProcessar(venda(), { tipo: 'abandono' }, AGORA) // não pode lançar
})
