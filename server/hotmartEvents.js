// Eventos da Hotmart registrados pelo n8n na planilha "tracking essentials" (aba "Hotmart (todos)").
// O n8n grava uma linha por evento do webhook da Hotmart: compra aprovada/completa, boleto/Pix gerado,
// carrinho abandonado, cancelamento, atraso, reembolso...
// Aqui a aba é lida, normalizada e cruzada para responder: quem gerou Pix/boleto e ainda não pagou?
// quem abandonou o carrinho e não comprou?

import { csvToObjects, fetchSheetCsv } from './sheetsCsv.js'
import { query } from './db.js'
import { comCache } from './cacheCurto.js'
import { CHAVE_EVENTOS_HOTMART, gravarCopia, lerCopia } from './planilhasCopia.js'
import { criarIdentidades, produtoParecido } from './pessoas.js'

export const TRACKING_SHEET_ID = '1PKUyzv3isiEW-HbHH4sY2zaSJcK1yi3ejG0ETKGCFeg'
export const HOTMART_ALL_GID = '1467558126' // aba "Hotmart (todos)"

const CACHE_TTL_MS = 60_000
// Pix/boleto gerado há mais de 3 dias sem pagamento provavelmente venceu: sai de "pendente".
const PENDING_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
const TEST_EMAIL = /@(teste|exemplo|example|test).(com|com.br)$/i
let cache = null

let extraBuyers = []
let extraBuyersAt = 0

/**
 * Quem já comprou segundo o próprio dash (tabela purchases, que também recebe as vendas novas do webhook).
 * Serve para o carrinho abandonado não continuar "em aberto" de quem comprou por outro caminho ou com outro e-mail.
 * Guarda o resultado por 1 minuto; se o banco falhar, segue só com as vendas da planilha.
 */
export async function loadExtraBuyers(env, { force = false } = {}) {
  if (!force && Date.now() - extraBuyersAt < CACHE_TTL_MS) return extraBuyers
  try {
    if (!env?.DATABASE_URL) return extraBuyers
    const { rows } = await query(env, `select email, telefone, created_at, curso from purchases where coalesce(status, 'ativo') <> 'cancelado'`)
    extraBuyers = rows.map((row) => ({ email: String(row.email ?? '').trim().toLowerCase(), telefone: row.telefone, produto: String(row.curso ?? ''), data: new Date(row.created_at).toISOString() }))
    extraBuyersAt = Date.now()
  } catch (error) {
    console.error('Erro ao ler as compras para cruzar com os eventos da Hotmart:', error.message || error)
  }
  return extraBuyers
}

/** Categoria de cada evento, na linguagem da tela. */
export function categoryOf(evento) {
  const key = String(evento ?? '').toLowerCase()
  if (key === 'compra_aprovada' || key === 'compra_completa') return 'venda'
  if (key === 'boleto_pix_gerado') return 'pix_boleto'
  if (key === 'abandono_carrinho') return 'abandono'
  if (/reembols|chargeback|refund|protest|reclama/.test(key)) return 'reembolso'
  if (/cancel|atras|expir/.test(key)) return 'cancelamento'
  return 'outro'
}

export const CATEGORY_LABELS = {
  venda: 'Compra aprovada',
  pix_boleto: 'Boleto/Pix gerado',
  abandono: 'Carrinho abandonado',
  cancelamento: 'Cancelamento ou atraso',
  reembolso: 'Reembolso ou chargeback',
  outro: 'Outro evento',
}

/** "2026-10-16 11:56:23" (horário de Brasília, como o n8n grava) -> ISO UTC. */
export function toIso(raw) {
  const match = String(raw ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (match) {
    const [, y, m, d, hh, mm, ss = '00'] = match
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}-03:00`).toISOString()
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

/** "136,01" | "1.497,00" | "1497" -> número. */
export function parseMoney(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function campaignIdOf(xcod, anuncioId) {
  const fromXcod = /(?:^|\|)ad_(\d{8,})(?=\||$)/.exec(String(xcod ?? ''))
  if (fromXcod) return fromXcod[1]
  return /^\d{8,}$/.test(String(anuncioId ?? '').trim()) ? String(anuncioId).trim() : null
}

/** Origem legível: anúncio da Meta (ID), orgânico, direto ou o rótulo da página (src). */
export function originOf({ anuncioId, src, campaignId }) {
  if (campaignId) return { canal: 'Meta Ads (pago)', campanha: `ID ${campaignId}` }
  const ad = String(anuncioId ?? '').trim().toLowerCase()
  if (ad === 'organico') return { canal: 'Orgânico', campanha: src || '' }
  if (ad === 'direto') return { canal: 'Direto', campanha: src || '' }
  return { canal: src ? 'Página de vendas' : 'Sem rastreamento', campanha: src || '' }
}

/** Linhas cruas -> eventos normalizados, sem os e-mails de teste (teste.com, exemplo.com...). */
export function toEvents(rawRows) {
  return rawRows
    .filter((raw) => raw.evento && !TEST_EMAIL.test(String(raw.email ?? '').trim()))
    .map(normalizeEvent)
}

export function normalizeEvent(raw) {
  const moeda = String(raw.moeda ?? '').trim().toUpperCase()
  const isBrl = !moeda || moeda === 'BRL'
  const valorOriginal = parseMoney(raw.valor)
  const campaignId = campaignIdOf(raw.xcod, raw.anuncio_id)
  const src = String(raw.src || raw.sck || '').trim()
  const origem = originOf({ anuncioId: raw.anuncio_id, src, campaignId })
  return {
    id: raw.id_evento || `${raw.transacao || raw.email}-${raw.data_hora}`,
    data: toIso(raw.data_hora),
    evento: raw.evento ?? '',
    categoria: categoryOf(raw.evento),
    nome: String(raw.nome ?? '').trim(),
    email: String(raw.email ?? '').trim().toLowerCase(),
    telefone: String(raw.telefone ?? '').trim(),
    cidade: String(raw.cidade ?? '').trim(),
    estado: String(raw.estado ?? '').trim(),
    pais: String(raw.pais ?? '').trim(),
    produto: String(raw.produto ?? '').trim(),
    oferta: String(raw.oferta ?? '').trim(),
    // Compra em outra moeda (EUR, JPY, PYG...) fica sem valor em reais, com o original à parte.
    valor: isBrl ? valorOriginal : null,
    valorOriginal,
    moeda: moeda || 'BRL',
    pagamento: String(raw.pagamento ?? '').trim(),
    parcelas: Number(raw.parcelas) || null,
    transacao: String(raw.transacao ?? '').trim(),
    src,
    xcod: String(raw.xcod ?? '').trim(),
    variante: String(raw.variante ?? '').trim(),
    leadId: String(raw.lead_id ?? '').trim(),
    campaignId,
    canal: origem.canal,
    campanha: origem.campanha,
  }
}

/**
 * Marca a situação de cada evento cruzando os outros eventos:
 *  - boleto/Pix gerado: "pago" (a mesma transação foi aprovada), "cancelado", "pendente" (até 3 dias)
 *    ou "vencido" (mais de 3 dias sem pagar);
 *  - carrinho abandonado: "recuperado" (a pessoa comprou depois) ou "em aberto".
 */
/** O que de fato aconteceu num evento de "cancelamento ou atraso": cancelada, atrasada ou expirada. */
function cancelSituation(evento) {
  const key = String(evento ?? '').toLowerCase()
  if (/atras/.test(key)) return 'atrasada'
  if (/expir/.test(key)) return 'expirada'
  return 'cancelada'
}

export function withSituations(events, now = Date.now(), otherBuyers = extraBuyers) {
  const byTransaction = new Map()
  for (const event of events) {
    if (!event.transacao) continue
    if (!byTransaction.has(event.transacao)) byTransaction.set(event.transacao, [])
    byTransaction.get(event.transacao).push(event)
  }

  // Quem é a mesma pessoa em todo o sistema (e-mail OU telefone, ligados entre si) e o que ela já comprou.
  const sales = [...events.filter((event) => event.categoria === 'venda'), ...otherBuyers]
  const idDe = criarIdentidades([...events, ...otherBuyers])
  const purchasesByPerson = new Map()
  for (const sale of sales) {
    const id = idDe(sale)
    if (!id || !sale.data) continue
    purchasesByPerson.set(id, [...(purchasesByPerson.get(id) ?? []), { data: sale.data, produto: sale.produto ?? '' }])
  }
  const purchasesOf = (event) => {
    const id = idDe(event)
    return id ? (purchasesByPerson.get(id) ?? []) : []
  }
  const firstPurchase = (event) => {
    const times = purchasesOf(event).map((purchase) => purchase.data).sort()
    return times[0] ?? null
  }
  /** A pessoa comprou esse produto (ou um parecido) depois do evento: a pendência já foi resolvida por outro caminho. */
  const boughtAfter = (event) => purchasesOf(event).some((purchase) => purchase.data >= event.data && produtoParecido(purchase.produto, event.produto))

  const marked = events.map((event) => {
    if (event.categoria === 'pix_boleto') {
      const same = byTransaction.get(event.transacao) ?? []
      if (same.some((other) => other.categoria === 'venda')) return { ...event, situacao: 'pago' }
      if (same.some((other) => other.categoria === 'cancelamento')) return { ...event, situacao: 'cancelado' }
      if (boughtAfter(event)) return { ...event, situacao: 'recuperado' }
      const ageMs = now - new Date(event.data).getTime()
      return { ...event, situacao: ageMs > PENDING_MAX_AGE_MS ? 'vencido' : 'pendente' }
    }
    if (event.categoria === 'abandono') {
      // Mesma pessoa (e-mail OU telefone) em qualquer compra: não é carrinho a recuperar.
      //  - comprou depois do carrinho: "recuperado"; comprou antes (já era aluno): "ja comprou".
      const boughtAt = firstPurchase(event)
      if (!boughtAt) return { ...event, situacao: 'em aberto' }
      return { ...event, situacao: boughtAt >= event.data ? 'recuperado' : 'ja comprou' }
    }
    if (event.categoria === 'cancelamento') {
      // Atraso/cancelamento seguido de uma nova compra do mesmo produto: a pessoa regularizou.
      return { ...event, situacao: boughtAfter(event) ? 'regularizada' : cancelSituation(event.evento) }
    }
    if (event.categoria === 'reembolso') return { ...event, situacao: /charge/i.test(event.evento) ? 'chargeback' : 'reembolsada' }
    return { ...event, situacao: null }
  })

  // A mesma pendência avisada várias vezes (Pix gerado duas vezes, atraso repetido...) conta uma vez só: fica a mais recente.
  const pending = new Set(['pendente', 'vencido', 'cancelada', 'atrasada', 'expirada'])
  const newest = new Map()
  const keyOf = (event) => {
    const id = idDe(event)
    return id ? `${id}|${event.categoria}|${event.categoria === 'pix_boleto' ? '' : event.situacao}|${String(event.produto ?? '').trim().toLowerCase()}` : null
  }
  for (const event of marked) {
    if (!pending.has(event.situacao)) continue
    const key = keyOf(event)
    if (!key) continue
    const current = newest.get(key)
    if (!current || event.data > current.data) newest.set(key, event)
  }
  return marked.map((event) => {
    if (!pending.has(event.situacao)) return event
    const key = keyOf(event)
    return key && newest.get(key) !== event ? { ...event, situacao: 'repetido' } : event
  })
}

const sum = (items) => items.reduce((total, item) => total + (item.valor ?? 0), 0)
const uniqueBy = (items, key) => [...new Map(items.map((item) => [key(item), item])).values()]

export function summarize(events) {
  const pix = events.filter((event) => event.categoria === 'pix_boleto')
  const pixPending = pix.filter((event) => event.situacao === 'pendente')
  const carts = events.filter((event) => event.categoria === 'abandono')
  const cartPeople = uniqueBy(carts, (event) => event.email || event.id)
  const cartOpen = uniqueBy(
    carts.filter((event) => event.situacao === 'em aberto'),
    (event) => event.email || event.id,
  )
  const canceled = events.filter((event) => event.categoria === 'cancelamento')
  const refunds = events.filter((event) => event.categoria === 'reembolso')
  const sales = events.filter((event) => event.categoria === 'venda')

  return {
    total: events.length,
    vendas: { total: uniqueBy(sales, (event) => event.transacao || event.id).length },
    pixBoleto: {
      gerados: pix.length,
      pagos: pix.filter((event) => event.situacao === 'pago').length,
      pendentes: pixPending.length,
      vencidos: pix.filter((event) => event.situacao === 'vencido').length,
      valorPendente: sum(pixPending),
    },
    abandono: {
      eventos: carts.length,
      pessoas: cartPeople.length,
      emAberto: cartOpen.length,
      recuperadas: cartPeople.length - cartOpen.length,
    },
    cancelamentos: {
      // Só o que ainda está em aberto: quem já regularizou (comprou de novo) e avisos repetidos saem da conta.
      total: canceled.filter((event) => ['cancelada', 'atrasada', 'expirada'].includes(event.situacao)).length,
      canceladas: canceled.filter((event) => event.situacao === 'cancelada').length,
      regularizadas: canceled.filter((event) => event.situacao === 'regularizada').length,
      atrasadas: canceled.filter((event) => event.situacao === 'atrasada').length,
      expiradas: canceled.filter((event) => event.situacao === 'expirada').length,
    },
    reembolsos: { total: refunds.length },
  }
}

/** Lê a aba "Hotmart (todos)" do Google e devolve os eventos já normalizados (sem as situações). Leva ~1,5 s. */
export async function lerEventosAoVivo() {
  const csv = await fetchSheetCsv(TRACKING_SHEET_ID, HOTMART_ALL_GID)
  return toEvents(csvToObjects(csv))
}

/** Situações e resumo na hora de ler: dependem de quem já comprou e do dia de hoje, então não vão para a cópia. */
function montarResposta(eventosPuros, buyers, fetchedAt) {
  const events = withSituations(eventosPuros, Date.now(), buyers).sort((a, b) => b.data.localeCompare(a.data))
  return { fetchedAt, events, resumo: summarize(events) }
}

/**
 * Eventos da Hotmart para as telas. Lê da cópia no banco (milésimos); só vai ao Google se ainda não houver
 * cópia ou se pedirem atualização na hora (force), e então atualiza a cópia.
 */
export async function loadHotmartEvents({ force = false, env = null } = {}) {
  if (env && !force) {
    const copia = await comCache('planilhas|eventos', 300_000, () => lerCopia(env, CHAVE_EVENTOS_HOTMART))
    if (copia?.dados?.events) {
      const buyers = await loadExtraBuyers(env)
      return montarResposta(copia.dados.events, buyers, copia.atualizadoEm)
    }
  }

  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data

  const eventos = await lerEventosAoVivo()
  if (env) {
    await gravarCopia(env, CHAVE_EVENTOS_HOTMART, { events: eventos }).catch((erro) => {
      if (erro?.code !== '42P01') console.error('[planilhas] não consegui guardar a cópia:', erro.message || erro)
    })
  }
  const buyers = env ? await loadExtraBuyers(env, { force }) : extraBuyers
  const data = montarResposta(eventos, buyers, new Date().toISOString())
  cache = { at: Date.now(), data }
  return data
}

/** Para o Registros: evento já lido, sem repetir o download se a mesma aba for pedida de novo. */
export function eventsFromCsv(csvText) {
  return withSituations(toEvents(csvToObjects(csvText)))
}

export async function handleHotmartEventsRequest(req, res, env = null) {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost')
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (pathname !== '/api/eventos-hotmart') {
    res.statusCode = 404
    return res.end(JSON.stringify({ error: 'Rota não encontrada.' }))
  }
  if (req.method !== 'GET') {
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'Método não permitido.' }))
  }

  try {
    const data = await loadHotmartEvents({ force: searchParams.get('refresh') === '1', env })
    res.statusCode = 200
    return res.end(JSON.stringify({ success: true, ...data }))
  } catch (error) {
    console.error('Erro ao ler os eventos da Hotmart:', error)
    res.statusCode = 502
    return res.end(JSON.stringify({ error: 'Não consegui ler a planilha de eventos da Hotmart.' }))
  }
}
