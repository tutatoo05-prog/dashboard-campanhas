import { createHash } from 'node:crypto'

/**
 * Lê o payload do webhook da Hotmart (versão 2.0.0) e devolve um objeto "venda" com só o que o
 * processamento de acesso precisa. Função pura: não acessa rede nem banco.
 */

const texto = (value) => String(value ?? '').trim()

/** A Hotmart manda datas em milissegundos (número) ou texto; devolve Date válida ou null. */
export function parseData(value) {
  if (value === undefined || value === null || value === '') return null
  const date = typeof value === 'number' || /^\d+$/.test(String(value)) ? new Date(Number(value)) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function primeiroNome(nome) {
  return texto(nome).split(/\s+/)[0] || ''
}

export function soDigitos(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * Identificador do evento: o "id" do webhook. Se a Hotmart não mandar, gera um estável a partir
 * do evento e da transação (o mesmo evento reenviado continua com o mesmo identificador).
 */
export function idDoEvento(payload) {
  const id = texto(payload?.id)
  if (id) return id
  const base = [payload?.event, payload?.data?.purchase?.transaction, payload?.data?.subscription?.subscriber?.code, payload?.creation_date]
    .map(texto)
    .join('|')
  return `sem-id-${createHash('sha1').update(base).digest('hex').slice(0, 24)}`
}

export function normalizarEvento(payload) {
  const data = payload?.data ?? {}
  const compra = data.purchase ?? {}
  const comprador = data.buyer ?? {}
  const produto = data.product ?? {}
  const assinatura = data.subscription ?? {}
  const origem = compra.origin ?? {}
  const recorrencia = Number(compra.recurrence_number)

  return {
    eventId: idDoEvento(payload),
    evento: texto(payload?.event),
    criadoEm: parseData(payload?.creation_date),
    transacao: texto(compra.transaction),
    status: texto(compra.status),
    nome: texto(comprador.name),
    primeiroNome: primeiroNome(comprador.first_name || comprador.name),
    email: texto(comprador.email).toLowerCase(),
    // Igual ao n8n: o telefone vem do checkout (checkout_phone), com o telefone do cadastro como reserva.
    telefoneBruto: texto(comprador.checkout_phone ?? comprador.phone),
    pais: texto(comprador.address?.country_iso).toUpperCase(),
    documento: texto(comprador.document),
    produto: texto(produto.name),
    produtoItem: texto(produto.content?.products?.[0]?.name),
    plano: texto(assinatura.plan?.name),
    pagamentoTipo: texto(compra.payment?.type).toUpperCase(),
    recorrencia: Number.isFinite(recorrencia) ? recorrencia : null,
    assinante: texto(assinatura.subscriber?.code),
    aprovadaEm: parseData(compra.approved_date),
    pedidoEm: parseData(compra.order_date),
    valor: Number(compra.price?.value),
    moeda: texto(compra.price?.currency_value).toUpperCase(),
    origem: {
      src: texto(origem.src),
      sck: texto(origem.sck),
      xcod: texto(origem.xcod),
      utmCampaign: texto(origem.utm_campaign),
    },
  }
}
