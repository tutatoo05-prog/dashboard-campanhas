import { test } from 'node:test'
import { existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import { normalizarEvento } from './hotmart.js'
import {
  decidir,
  diasDeAcesso,
  normalizarCurso,
  ehPixParcelado,
  momentoDoBloqueio,
  novoFimDoAcesso,
  rotaDaCompra,
  telefoneWhatsapp,
  validarCpf,
  whatsappBrasileiroValido,
  whatsappValido,
} from './regras.js'
import { bloquearAtrasados, criarMotor, processarEvento, processarFila } from './motor.js'
import { escaparHtml, renderizar, carregarTemplate } from './integracoes.js'

// ── payloads ──────────────────────────────────────────────────────────────────

function payload({ id = 'ev-1', event = 'PURCHASE_APPROVED', produto = 'Essentials', item = 'Essentials', plano = '', pagamento = 'CREDIT_CARD', recorrencia, assinante, documento = '52998224725', email = 'ana@exemplo.com', fone = '11987654321', pais = 'BR', transacao = 'HP1', valor = 1497 } = {}) {
  return {
    id,
    event,
    creation_date: Date.parse('2026-10-16T15:00:00Z'),
    data: {
      product: { name: produto, content: { products: [{ name: item }] } },
      buyer: { name: 'Ana Souza', first_name: 'Ana', email, checkout_phone: fone, document: documento, address: { country_iso: pais } },
      purchase: {
        transaction: transacao,
        status: 'APPROVED',
        approved_date: Date.parse('2026-10-16T14:00:00Z'),
        recurrence_number: recorrencia,
        payment: { type: pagamento },
        price: { value: valor, currency_value: 'BRL' },
        origin: { src: 'live', sck: 's', xcod: 'ad_1234567890|var_a', utm_campaign: 'camp' },
      },
      ...(plano || assinante ? { subscription: { plan: { name: plano }, subscriber: { code: assinante } } } : {}),
    },
  }
}

const venda = (opcoes) => normalizarEvento(payload(opcoes))

// ── regras puras ──────────────────────────────────────────────────────────────

test('CPF: aceita válido, recusa inválido e repetido', () => {
  assert.equal(validarCpf('529.982.247-25'), true)
  assert.equal(validarCpf('52998224726'), false)
  assert.equal(validarCpf('11111111111'), false)
  assert.equal(validarCpf(''), false)
})

test('telefone: 55 só para o Brasil, estrangeiro fica como veio', () => {
  const casos = [
    ['21994364502', 'BR', '5521994364502'],
    ['5521994364502', 'BR', '5521994364502'],
    ['55999999999', 'BR', '5555999999999'],
    ['5555999999999', 'BR', '5555999999999'],
    ['817024347702', 'JP', '817024347702'],
    ['351961593443', 'PT', '351961593443'],
    ['11987654321', '', '5511987654321'],
    ['351961593443', '', '351961593443'],
    ['912345678', 'PT', '351912345678'],
    ['0912345678', 'PT', '351912345678'],
    ['2025550123', 'US', '12025550123'],
    ['', 'BR', ''],
  ]
  for (const [bruto, pais, esperado] of casos) assert.equal(telefoneWhatsapp(bruto, pais), esperado, `${bruto}/${pais}`)
  assert.equal(whatsappBrasileiroValido('5511987654321'), true)
  assert.equal(whatsappBrasileiroValido('351961593443'), false)
  assert.equal(whatsappValido('351961593443'), true)
  assert.equal(whatsappValido('5511987654321'), true)
  assert.equal(whatsappValido('5511'), false)
})

test('prazo: a plataforma recebe sempre 365 dias; o Pix parcelado só é marcado à parte', () => {
  for (const opcoes of [
    { plano: 'REC_Essentials', pagamento: 'PIX' },
    { plano: 'REC_Essentials', pagamento: 'PIX_AUTOMATIC' },
    { plano: 'REC_Essentials', pagamento: 'PIX', recorrencia: 3 },
    { plano: 'REC_Essentials', pagamento: 'CREDIT_CARD' },
    { plano: 'Essentials total', pagamento: 'PIX' },
    { produto: 'Mentoria Essentials', plano: '', pagamento: 'BILLET' },
  ]) {
    assert.equal(diasDeAcesso(venda(opcoes)), 365)
  }
  assert.equal(ehPixParcelado(venda({ plano: 'REC_Essentials', pagamento: 'PIX' })), true)
  assert.equal(ehPixParcelado(venda({ plano: 'REC_Essentials', pagamento: 'PIX_AUTOMATIC' })), true)
  assert.equal(ehPixParcelado(venda({ plano: 'REC_Essentials', pagamento: 'PIX', recorrencia: 3 })), true)
  assert.equal(ehPixParcelado(venda({ plano: 'REC_Essentials', pagamento: 'CREDIT_CARD' })), false)
  assert.equal(ehPixParcelado(venda({ plano: 'Essentials total', pagamento: 'PIX' })), false)
  assert.equal(ehPixParcelado(venda({ plano: 'REC_Essentials total', pagamento: 'PIX' })), false)
  assert.equal(ehPixParcelado(venda({ plano: 'Essentials', pagamento: 'PIX' })), false)
})

test('curso: plano recorrente e "total" viram o mesmo curso', () => {
  assert.equal(normalizarCurso('REC_Essentials'), 'Essentials')
  assert.equal(normalizarCurso('REC_Essentials total'), 'Essentials')
  assert.equal(normalizarCurso('Essentials total'), 'Essentials')
  assert.equal(normalizarCurso('Essentials'), 'Essentials')
})

test('rota: Particular e Presencial não liberam; Essentials libera; desconhecido vira atenção', () => {
  assert.equal(rotaDaCompra(venda({ produto: 'Mentoria Particular com Tuzinho Tattoo', item: 'Mentoria Particular com Tuzinho Tattoo' })), 'particular')
  assert.equal(rotaDaCompra(venda({ produto: 'Workshop Presencial', item: 'Workshop Presencial' })), 'presencial')
  assert.equal(rotaDaCompra(venda({ produto: 'Mentoria Essentials', item: '' })), 'liberar')
  assert.equal(rotaDaCompra(venda({ produto: 'Essentials', plano: 'REC_Essentials' })), 'liberar')
  assert.equal(rotaDaCompra(venda({ produto: 'Essentials', plano: 'Essentials' })), 'liberar')
  assert.equal(rotaDaCompra(venda({ produto: 'Outra coisa', item: '', plano: '' })), 'sem_regra')
})

test('decisão: compra nova libera e avisa; parcela seguinte só renova', () => {
  const nova = decidir(venda({ plano: 'REC_Essentials', pagamento: 'PIX', assinante: 'SUB1' }), { acesso: null })
  assert.equal(nova.tipo, 'liberar')
  assert.equal(nova.dias, 365)
  assert.equal(nova.parcelado, true)
  assert.deepEqual(nova.passos, ['liberar', 'registrar_acesso', 'email_boas_vindas', 'registrar_venda', 'whatsapp_aluno', 'aviso_tuzinho'])

  const porRecorrencia = decidir(venda({ plano: 'REC_Essentials', pagamento: 'PIX', recorrencia: 2, assinante: 'SUB1', transacao: 'HP2' }), { acesso: null })
  assert.equal(porRecorrencia.tipo, 'renovar')
  assert.deepEqual(porRecorrencia.passos, ['liberar', 'registrar_acesso'])

  // cruza com o acesso guardado: mesmo assinante, outra transação
  const acesso = { subscriber_code: 'SUB1', ultima_transacao: 'HP1' }
  const cruzada = decidir(venda({ plano: 'REC_Essentials', pagamento: 'PIX', assinante: 'SUB1', transacao: 'HP9' }), { acesso })
  assert.equal(cruzada.tipo, 'renovar')

  // reenvio do mesmo pagamento não vira renovação
  // quem tinha sido inativado na mão e pagou de novo: a equipe é avisada para reativar
  const reativar = decidir(venda({ plano: 'REC_Essentials', pagamento: 'PIX', assinante: 'SUB1', transacao: 'HP7' }), { acesso: { ...acesso, status: 'bloqueado' } })
  assert.equal(reativar.reativar, true)
  assert.deepEqual(reativar.passos, ['liberar', 'registrar_acesso', 'reativar_acesso'])

  const mesma = decidir(venda({ plano: 'REC_Essentials', pagamento: 'PIX', assinante: 'SUB1', transacao: 'HP1' }), { acesso })
  assert.equal(mesma.tipo, 'liberar')
})

test('decisão: sem documento não libera; particular só avisa; outros eventos', () => {
  const semDoc = decidir(venda({ documento: '' }), {})
  assert.equal(semDoc.tipo, 'atencao')
  assert.deepEqual(semDoc.passos, ['whatsapp_correcao'])

  const particular = decidir(venda({ produto: 'Mentoria Particular com Tuzinho Tattoo', item: 'Mentoria Particular com Tuzinho Tattoo' }), {})
  assert.equal(particular.tipo, 'sem_liberacao')
  assert.deepEqual(particular.passos, ['email_boas_vindas', 'aviso_tuzinho'])

  assert.equal(decidir(venda({ event: 'PURCHASE_OUT_OF_SHOPPING_CART' }), {}).tipo, 'abandono')
  assert.equal(decidir(venda({ event: 'PURCHASE_DELAYED' }), {}).tipo, 'atraso')
  assert.equal(decidir(venda({ event: 'PURCHASE_CANCELED' }), {}).tipo, 'ignorar')
})

test('bloqueio: 2º dia de atraso à meia-noite de São Paulo', () => {
  // atraso avisado em 16/10 12:00 (SP) → bloqueia em 17/10 00:00 (SP) = 03:00 UTC
  assert.equal(momentoDoBloqueio(new Date('2026-10-16T15:00:00Z')).toISOString(), '2026-10-17T03:00:00.000Z')
  // avisado 16/10 23:30 (SP) ainda é dia 16
  assert.equal(momentoDoBloqueio(new Date('2026-10-17T02:30:00Z')).toISOString(), '2026-10-17T03:00:00.000Z')
  assert.equal(momentoDoBloqueio(new Date('2026-10-16T15:00:00Z'), 3).toISOString(), '2026-10-18T03:00:00.000Z')
})

test('fim do acesso soma a partir do que for maior', () => {
  const agora = new Date('2026-10-16T12:00:00Z')
  assert.equal(novoFimDoAcesso(null, agora, 30).toISOString(), '2026-11-15T12:00:00.000Z')
  assert.equal(novoFimDoAcesso(new Date('2026-10-20T12:00:00Z'), agora, 30).toISOString(), '2026-11-19T12:00:00.000Z')
  assert.equal(novoFimDoAcesso(new Date('2026-10-01T12:00:00Z'), agora, 30).toISOString(), '2026-11-15T12:00:00.000Z')
})

// ── e-mails ───────────────────────────────────────────────────────────────────

test('modelos de e-mail: preenchem e escapam os campos', async () => {
  assert.equal(escaparHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;')
  const boas = renderizar(await carregarTemplate('boas-vindas'), { nome: 'Ana <script>', email: 'ana@exemplo.com', documento: '52998224725' })
  assert.ok(boas.includes('Bem-vindo, Ana &lt;script&gt;'))
  assert.ok(boas.includes('52998224725'))
  assert.ok(!/\{\{\w+\}\}/.test(boas), 'sobrou campo sem preencher')
  // imagens do e-mail: cada uma precisa existir em public/email (o e-mail aponta para o endereço público do dash)
  const imagens = [...boas.matchAll(/https:\/\/dash\.tuzinho\.academy\/email\/([\w-]+\.png)/g)].map((m) => m[1])
  assert.ok(imagens.length >= 5, 'o e-mail deveria ter a logo, a textura e as tatuagens')
  for (const arquivo of new Set(imagens)) {
    assert.ok(existsSync(new URL(`../../public/email/${arquivo}`, import.meta.url)), `falta public/email/${arquivo}`)
  }
  assert.ok(boas.includes('dark only'), 'o e-mail deve forçar o tema escuro')
  const aband = renderizar(await carregarTemplate('abandono'), { nome: 'Ana', curso: 'Essentials' })
  assert.ok(aband.includes('Essentials'))
  assert.ok(!/\{\{\w+\}\}/.test(aband), 'sobrou campo sem preencher')
})

// ── motor com repositório e integrações de mentira ───────────────────────────

function criarFalsos({ falhar = {} } = {}) {
  const chamadas = []
  const eventos = new Map()
  const acessos = []
  const repo = {
    chamadas,
    async buscarAcesso() {
      return acessos[0] ?? null
    },
    async salvarProgresso(id, campos) {
      const atual = eventos.get(id)
      if (campos.passos !== undefined) atual.passos = JSON.parse(JSON.stringify(campos.passos))
      for (const [chave, valor] of Object.entries(campos)) if (chave !== 'passos' && valor !== undefined) atual[chave] = valor
    },
    async reivindicar() {
      const pronto = [...eventos.values()].find((e) => ['novo', 'erro'].includes(e.estado) && new Date(e.proxima ?? 0) <= relogio.agora)
      if (!pronto) return null
      pronto.estado = 'processando'
      return JSON.parse(JSON.stringify(pronto))
    },
    async registrarPagamento(dados) {
      chamadas.push(['registrarPagamento', dados])
      acessos.push({ subscriber_code: dados.assinante, ultima_transacao: dados.transacao })
      return { acessoId: 1 }
    },
    async registrarCompra(linha) {
      chamadas.push(['registrarCompra', linha])
      return { inseridas: 1 }
    },
    async registrarAtraso(dados) {
      chamadas.push(['registrarAtraso', dados])
      return { acessoId: 1 }
    },
    async registrarAbandono(dados) {
      chamadas.push(['registrarAbandono', dados])
      return {}
    },
    async marcarAbandonoEnviado(dados) {
      chamadas.push(['marcarAbandonoEnviado', dados])
    },
    async acessosParaBloquear() {
      return []
    },
  }
  const falha = (nome) => {
    if (falhar[nome] > 0) {
      falhar[nome] -= 1
      throw new Error(`${nome} fora do ar`)
    }
  }
  const integ = {
    chamadas,
    carregarTemplate,
    renderizar,
    async liberarCurso(env, dados) {
      chamadas.push(['liberarCurso', dados])
      falha('liberar')
      return { status: 200 }
    },
    async enviarEmail(env, dados) {
      chamadas.push(['enviarEmail', dados])
      falha('email')
      return { messageId: 'm1' }
    },
    async enviarWhatsapp(env, dados) {
      chamadas.push(['enviarWhatsapp', dados])
      falha('whatsapp')
      return { status: 201 }
    },
    async avisarEquipe(env, texto) {
      chamadas.push(['avisarEquipe', texto])
      return { status: 201 }
    },
    async bloquearCurso(env, dados) {
      chamadas.push(['bloquearCurso', dados])
      falha('bloqueio')
      return {}
    },
  }
  return { repo, integ, eventos, acessos }
}

const relogio = { agora: new Date('2026-10-16T15:00:00Z') }
const agora = () => new Date(relogio.agora)
const ENV = { ACESSO_MODO: 'ativo' }

function novoEvento(eventos, corpo, extra = {}) {
  const id = eventos.size + 1
  eventos.set(id, { id, payload: corpo, passos: {}, tentativas: 0, estado: 'novo', ...extra })
  return id
}

const nomesChamados = (chamadas) => chamadas.map(([nome]) => nome)

test('motor: compra aprovada faz tudo uma vez e na ordem', async () => {
  const { repo, integ, eventos } = criarFalsos()
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload({ plano: 'REC_Essentials', pagamento: 'PIX', assinante: 'SUB1', valor: 124.75 }))

  assert.equal(await processarFila(motor), 1)
  assert.equal(eventos.get(1).estado, 'ok')
  assert.deepEqual(nomesChamados(repo.chamadas), ['liberarCurso', 'registrarPagamento', 'enviarEmail', 'registrarCompra', 'enviarWhatsapp', 'avisarEquipe'])

  const liberar = repo.chamadas.find(([nome]) => nome === 'liberarCurso')[1]
  assert.equal(liberar.dias, 365)
  const pagamento = repo.chamadas.find(([nome]) => nome === 'registrarPagamento')[1]
  assert.equal(pagamento.parcelado, true)
  assert.equal(pagamento.diasPagos, 30)
  assert.equal(liberar.campanha, 'mentoria-essentials-boleto-parcelado')
  assert.equal(liberar.idVenda, 'ev-1')
  assert.equal(liberar.documento, '52998224725')

  const whats = repo.chamadas.find(([nome]) => nome === 'enviarWhatsapp')[1]
  assert.equal(whats.numero, '5511987654321')
  assert.ok(whats.texto.includes('Tudo certo, Ana!'))

  // nada a fazer na segunda rodada
  assert.equal(await processarFila(motor), 0)
})

test('motor: se liberar falha, não avisa ninguém e tenta de novo depois', async () => {
  const { repo, integ, eventos } = criarFalsos({ falhar: { liberar: 1 } })
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload())

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'erro')
  assert.equal(eventos.get(1).tentativas, 1)
  assert.deepEqual(nomesChamados(repo.chamadas), ['liberarCurso'])

  // ainda não passou o tempo de espera: a fila não pega
  assert.equal(await processarFila(motor), 0)

  relogio.agora = new Date(relogio.agora.getTime() + 2 * 60_000)
  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'ok')
  assert.equal(nomesChamados(repo.chamadas).filter((n) => n === 'liberarCurso').length, 2)
  assert.equal(nomesChamados(repo.chamadas).filter((n) => n === 'enviarEmail').length, 1)
})

test('motor: se só o e-mail falha, a nova tentativa não libera de novo', async () => {
  relogio.agora = new Date('2026-10-16T15:00:00Z')
  const { repo, integ, eventos } = criarFalsos({ falhar: { email: 1 } })
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload())

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'erro')
  // as etapas independentes seguem mesmo com o e-mail falhando
  assert.ok(nomesChamados(repo.chamadas).includes('enviarWhatsapp'))
  assert.ok(nomesChamados(repo.chamadas).includes('avisarEquipe'))

  relogio.agora = new Date(relogio.agora.getTime() + 2 * 60_000)
  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'ok')
  const nomes = nomesChamados(repo.chamadas)
  assert.equal(nomes.filter((n) => n === 'liberarCurso').length, 1)
  assert.equal(nomes.filter((n) => n === 'enviarEmail').length, 2)
  assert.equal(nomes.filter((n) => n === 'enviarWhatsapp').length, 1)
  assert.equal(nomes.filter((n) => n === 'avisarEquipe').length, 1)
})

test('motor: falhas seguidas avisam a equipe na 3ª tentativa e desistem na última', async () => {
  relogio.agora = new Date('2026-10-16T15:00:00Z')
  const { repo, integ, eventos } = criarFalsos({ falhar: { liberar: 99 } })
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload())

  for (let i = 0; i < 10; i += 1) {
    relogio.agora = new Date(relogio.agora.getTime() + 61 * 60_000)
    await processarFila(motor)
  }
  assert.equal(eventos.get(1).estado, 'falhou')
  assert.equal(eventos.get(1).tentativas, 7)
  const avisos = repo.chamadas.filter(([nome]) => nome === 'avisarEquipe')
  assert.equal(avisos.length, 2) // 3ª tentativa e desistência
  assert.ok(avisos[1][1].includes('Desisti'))
})

test('motor: parcela seguinte só renova (sem e-mail, sem venda nova)', async () => {
  relogio.agora = new Date('2026-10-16T15:00:00Z')
  const { repo, integ, eventos, acessos } = criarFalsos()
  acessos.push({ subscriber_code: 'SUB1', ultima_transacao: 'HP1' })
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload({ id: 'ev-2', plano: 'REC_Essentials', pagamento: 'PIX', assinante: 'SUB1', transacao: 'HP2', recorrencia: 2 }))

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'ok')
  assert.equal(eventos.get(1).decisao, 'renovar')
  assert.deepEqual(nomesChamados(repo.chamadas), ['liberarCurso', 'registrarPagamento'])
  assert.equal(repo.chamadas[0][1].dias, 365)
})

test('motor: aluno inativado que pagou de novo avisa a equipe para reativar', async () => {
  relogio.agora = new Date('2026-10-16T15:00:00Z')
  const { repo, integ, eventos, acessos } = criarFalsos()
  acessos.push({ subscriber_code: 'SUB1', ultima_transacao: 'HP1', status: 'bloqueado' })
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload({ id: 'ev-9', plano: 'REC_Essentials', pagamento: 'PIX', assinante: 'SUB1', transacao: 'HP9', recorrencia: 3 }))

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'ok')
  assert.deepEqual(nomesChamados(repo.chamadas), ['liberarCurso', 'registrarPagamento', 'avisarEquipe'])
  assert.ok(repo.chamadas[2][1].includes('Reativar acesso'))
})

test('motor: compra sem CPF não libera, pede correção e avisa a equipe', async () => {
  relogio.agora = new Date('2026-10-16T15:00:00Z')
  const { repo, integ, eventos } = criarFalsos()
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload({ documento: '' }))

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'atencao')
  assert.deepEqual(nomesChamados(repo.chamadas), ['enviarWhatsapp', 'avisarEquipe'])
  assert.ok(repo.chamadas[0][1].texto.includes('problema com seus dados'))
})

test('motor: e-mail do comprador inválido vira atenção, sem insistir', async () => {
  relogio.agora = new Date('2026-10-16T15:00:00Z')
  const { repo, integ, eventos } = criarFalsos()
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload({ email: 'sem-arroba' }))

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'atencao')
  assert.equal(nomesChamados(repo.chamadas).filter((n) => n === 'enviarEmail').length, 0)
  assert.equal(nomesChamados(repo.chamadas).filter((n) => n === 'liberarCurso').length, 1)
})

test('motor: telefone estrangeiro libera e manda WhatsApp ao aluno', async () => {
  relogio.agora = new Date('2026-10-16T15:00:00Z')
  const { repo, integ, eventos } = criarFalsos()
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload({ fone: '351961593443', pais: 'PT' }))

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'ok')
  assert.equal(nomesChamados(repo.chamadas).filter((n) => n === 'enviarWhatsapp').length, 1)
  const liberar = repo.chamadas.find(([nome]) => nome === 'liberarCurso')[1]
  assert.equal(liberar.telefone, '351961593443')
})

test('motor: Particular recebe e-mail e aviso, sem liberar curso', async () => {
  relogio.agora = new Date('2026-10-16T15:00:00Z')
  const { repo, integ, eventos } = criarFalsos()
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload({ produto: 'Mentoria Particular com Tuzinho Tattoo', item: 'Mentoria Particular com Tuzinho Tattoo' }))

  await processarFila(motor)
  assert.deepEqual(nomesChamados(repo.chamadas), ['enviarEmail', 'avisarEquipe'])
})

test('motor: abandono de carrinho e atraso mandam o e-mail de apoio', async () => {
  relogio.agora = new Date('2026-10-16T15:00:00Z')
  const { repo, integ, eventos } = criarFalsos()
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload({ id: 'a1', event: 'PURCHASE_OUT_OF_SHOPPING_CART', produto: 'Essentials' }))
  novoEvento(eventos, payload({ id: 'a2', event: 'PURCHASE_DELAYED', produto: 'Mentoria Essentials', item: '' }))

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'ok')
  assert.equal(eventos.get(2).estado, 'ok')
  const emails = repo.chamadas.filter(([nome]) => nome === 'enviarEmail')
  assert.equal(emails.length, 2)
  assert.equal(emails[0][1].assunto, 'Essentials está te esperando 🚀')
  assert.equal(emails[1][1].assunto, 'Mentoria Essentials está te esperando 🚀')
  assert.ok(nomesChamados(repo.chamadas).includes('registrarAtraso'))
  const atraso = repo.chamadas.find(([nome]) => nome === 'registrarAtraso')[1]
  assert.equal(atraso.parcelado, false)
})

test('motor: modo teste decide e registra, mas não toca em nada fora do dash', async () => {
  relogio.agora = new Date('2026-10-16T15:00:00Z')
  const { repo, integ, eventos } = criarFalsos()
  const motor = criarMotor({ ACESSO_MODO: 'teste' }, { repo, integ, agora })
  novoEvento(eventos, payload())

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'ok')
  assert.equal(eventos.get(1).simulado, true)
  assert.equal(eventos.get(1).decisao, 'liberar')
  assert.equal(repo.chamadas.length, 0)
})

test('motor: modo desligado não processa nada', async () => {
  const { repo, integ, eventos } = criarFalsos()
  const motor = criarMotor({}, { repo, integ, agora })
  novoEvento(eventos, payload())
  assert.equal(await processarFila(motor), 0)
  assert.equal(eventos.get(1).estado, 'novo')
})

test('bloqueio: sem endpoint da plataforma, avisa a equipe e marca como manual', async () => {
  const chamadas = []
  const repo = {
    async acessosParaBloquear() {
      return [{ id: 7, email: 'ana@exemplo.com', nome: 'Ana', curso: 'Essentials', atraso_desde: new Date('2026-10-15T15:00:00Z') }]
    },
    async marcarBloqueioManual(id) {
      chamadas.push(['manual', id])
    },
  }
  const integ = {
    async avisarEquipe(env, texto) {
      chamadas.push(['aviso', texto])
    },
  }
  await bloquearAtrasados(criarMotor({ ACESSO_MODO: 'ativo' }, { repo, integ, agora }))
  assert.deepEqual(chamadas.map(([nome]) => nome), ['aviso', 'manual'])
})

test('bloqueio: com endpoint, bloqueia e marca; falha vai para nova tentativa', async () => {
  const chamadas = []
  let falha = true
  const repo = {
    async acessosParaBloquear() {
      return [{ id: 7, email: 'ana@exemplo.com', nome: 'Ana', curso: 'Essentials', documento: '1', atraso_desde: new Date('2026-10-15T15:00:00Z'), bloqueio_tentativas: 0 }]
    },
    async marcarBloqueado(id) {
      chamadas.push(['bloqueado', id])
    },
    async marcarBloqueioFalha(id, dados) {
      chamadas.push(['falha', id, dados.tentativas])
    },
  }
  const integ = {
    async bloquearCurso() {
      if (falha) throw new Error('fora do ar')
    },
    async avisarEquipe() {},
  }
  const env = { ACESSO_MODO: 'ativo', TELWAY_BLOQUEAR_URL: 'https://exemplo/bloquear' }
  const motor = criarMotor(env, { repo, integ, agora })
  assert.equal(await bloquearAtrasados(motor), 0)
  falha = false
  assert.equal(await bloquearAtrasados(motor), 1)
  assert.deepEqual(chamadas, [['falha', 7, 1], ['bloqueado', 7]])
})

test('processarEvento: erro inesperado não perde o evento', async () => {
  const salvos = []
  const repo = {
    async buscarAcesso() {
      throw new Error('banco caiu')
    },
    async salvarProgresso(id, campos) {
      salvos.push(campos)
    },
  }
  const motor = criarMotor(ENV, { repo, integ: {}, agora })
  const resultado = await processarEvento(motor, { id: 1, payload: payload(), passos: {}, tentativas: 0 })
  assert.equal(resultado.estado, 'erro')
  assert.equal(salvos.at(-1).estado, 'erro')
  assert.ok(salvos.at(-1).proxima instanceof Date)
})

// ── API V2 da plataforma: bloqueio, reativação e reembolso ────────────────────

const ENV_V2 = { ACESSO_MODO: 'ativo', TELWAY_V2_TOKEN: 'token-de-teste' }

test('decisão: reembolso de produto que libera curso revoga; particular é ignorado', () => {
  const reembolso = decidir(venda({ event: 'PURCHASE_REFUNDED' }))
  assert.equal(reembolso.tipo, 'reembolso')
  assert.deepEqual(reembolso.passos, ['revogar_acesso', 'marcar_reembolso', 'aviso_reembolso'])
  assert.equal(decidir(venda({ event: 'PURCHASE_REFUNDED', produto: 'Mentoria Particular com Tuzinho Tattoo' })).tipo, 'ignorar')
  assert.equal(decidir(venda({ event: 'PURCHASE_REFUNDED', email: '' })).tipo, 'atencao')
})

test('motor: reembolso com API V2 revoga o acesso, cancela a compra e avisa', async () => {
  const { repo, integ, eventos } = criarFalsos()
  integ.revogarAcesso = async (env, dados) => {
    repo.chamadas.push(['revogarAcesso', dados])
    return { status: 200 }
  }
  repo.marcarReembolso = async (dados) => {
    repo.chamadas.push(['marcarReembolso', dados])
    return {}
  }
  const motor = criarMotor(ENV_V2, { repo, integ, agora })
  novoEvento(eventos, payload({ event: 'PURCHASE_REFUNDED', transacao: 'HP55' }))

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'ok')
  assert.deepEqual(nomesChamados(repo.chamadas), ['revogarAcesso', 'marcarReembolso', 'avisarEquipe'])
  assert.equal(repo.chamadas[0][1].motivo, 'reembolso')
  assert.equal(repo.chamadas[1][1].transacao, 'HP55')
})

test('motor: reembolso sem API V2 vira atenção (revogar na mão), sem tocar em nada', async () => {
  const { repo, integ, eventos } = criarFalsos()
  const motor = criarMotor(ENV, { repo, integ, agora })
  novoEvento(eventos, payload({ event: 'PURCHASE_REFUNDED' }))

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'atencao')
  assert.ok(!nomesChamados(repo.chamadas).includes('marcarReembolso'))
})

test('motor: quem estava bloqueado e pagou de novo é reativado pela API V2 e volta a "ativo"', async () => {
  const { repo, integ, eventos, acessos } = criarFalsos()
  acessos.push({ subscriber_code: 'SUB1', ultima_transacao: 'HP1', status: 'bloqueado' })
  integ.reativarAcesso = async (env, dados) => {
    repo.chamadas.push(['reativarAcesso', dados])
    return { status: 200 }
  }
  repo.marcarReativado = async (id) => {
    repo.chamadas.push(['marcarReativado', id])
  }
  const motor = criarMotor(ENV_V2, { repo, integ, agora })
  novoEvento(eventos, payload({ id: 'ev-9', plano: 'REC_Essentials', pagamento: 'PIX', assinante: 'SUB1', transacao: 'HP9', recorrencia: 3 }))

  await processarFila(motor)
  assert.equal(eventos.get(1).estado, 'ok')
  assert.deepEqual(nomesChamados(repo.chamadas), ['liberarCurso', 'registrarPagamento', 'reativarAcesso', 'marcarReativado'])
  assert.equal(repo.chamadas[2][1].email, 'ana@exemplo.com')
  assert.equal(repo.chamadas[3][1], 1)
})

test('bloqueio: com API V2 revoga o acesso sozinho (sem TELWAY_BLOQUEAR_URL) e marca como bloqueado', async () => {
  const chamadas = []
  const repo = {
    async acessosParaBloquear() {
      return [{ id: 7, email: 'ana@exemplo.com', nome: 'Ana', curso: 'Essentials', atraso_desde: new Date('2026-10-15T15:00:00Z'), bloqueio_tentativas: 0 }]
    },
    async marcarBloqueado(id) {
      chamadas.push(['bloqueado', id])
    },
  }
  const integ = {
    async revogarAcesso(env, dados) {
      chamadas.push(['revogar', dados.email, dados.motivo])
    },
    async avisarEquipe() {},
  }
  assert.equal(await bloquearAtrasados(criarMotor(ENV_V2, { repo, integ, agora })), 1)
  assert.deepEqual(chamadas, [['revogar', 'ana@exemplo.com', 'parcela atrasada'], ['bloqueado', 7]])
})

test('API V2: consultar, revogar e reativar falam com os endpoints certos e escondem o token', async () => {
  const pedidos = []
  const respostas = {
    'POST /acessos/consultar': { status: 200, corpo: { data: { acesso_liberado: false, bloqueio_manual: true, matriculas: [{ id: 10 }, { id: 12 }, { id: 11 }] } } },
    'POST /acessos/revogar': { status: 200, corpo: { data: {} } },
    'POST /matriculas/12/reativar': { status: 200, corpo: { data: {} } },
  }
  const fetchFalso = async (url, opcoes) => {
    const caminho = new URL(url).pathname.replace('/api/v2', '')
    pedidos.push({ chave: `${opcoes.method} ${caminho}`, corpo: opcoes.body ? JSON.parse(opcoes.body) : null, auth: opcoes.headers.Authorization })
    const r = respostas[`${opcoes.method} ${caminho}`]
    return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.corpo) }
  }
  const { consultarAcesso, revogarAcesso, reativarAcesso } = await import('./telwayV2.js')

  const situacao = await consultarAcesso(ENV_V2, { email: 'a@x.com' }, fetchFalso)
  assert.equal(situacao.acessoLiberado, false)
  assert.equal(situacao.bloqueioManual, true)

  await revogarAcesso(ENV_V2, { email: 'a@x.com', motivo: 'm'.repeat(100) }, fetchFalso)
  assert.equal(pedidos.at(-1).corpo.motivo.length, 64)
  assert.equal(pedidos.at(-1).corpo.curso_id, 21)

  const reativado = await reativarAcesso(ENV_V2, { email: 'a@x.com' }, fetchFalso)
  assert.equal(reativado.matricula, 12) // a mais recente
  assert.ok(pedidos.every((p) => p.auth === 'Bearer token-de-teste'))
})

test('API V2: aluno que não existe não quebra a revogação; sem token nem tenta', async () => {
  const fetch404 = async () => ({ ok: false, status: 404, text: async () => '{}' })
  const { revogarAcesso, consultarAcesso } = await import('./telwayV2.js')
  assert.equal((await revogarAcesso(ENV_V2, { email: 'a@x.com', motivo: 'reembolso' }, fetch404)).nada_a_revogar, true)
  assert.equal((await consultarAcesso(ENV_V2, { email: 'a@x.com' }, fetch404)).existe, false)
  await assert.rejects(() => consultarAcesso({}, { email: 'a@x.com' }, fetch404), /não configurada/)
})
