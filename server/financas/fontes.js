import { fetchHotmartSalesHistory, getHotmartAccessToken } from '../hotmartApi.js'
import { graphGet, parseAllowedAccountIds } from '../metaApi.js'
import { getSaoPauloClock, TIMEZONE } from '../clock.js'

const STATUS_COM_RECEITA = new Set(['APPROVED', 'COMPLETE'])

function mesDeData(data) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit' }).formatToParts(data)
  const mapa = Object.fromEntries(partes.map((p) => [p.type, p.value]))
  return `${mapa.year}-${mapa.month}`
}

function ultimoDia(mes) {
  const [ano, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(ano, m, 0)).getUTCDate()
}

/** Primeiro dia do mês 'AAAA-MM' como Date (meia-noite de São Paulo, UTC-3). */
export function inicioDoMes(mes) {
  return new Date(`${mes}-01T00:00:00-03:00`)
}

/**
 * Soma a Hotmart por mês de aprovação: valor base da venda menos a taxa da Hotmart (o que sobra para o produtor,
 * sem repartir com coprodutor). Só vendas aprovadas/completas em reais; moeda estrangeira vai para `ignoradas`.
 * Pura: recebe os itens do /sales/history.
 */
export function somarHotmartPorMes(itens) {
  const porMes = {}
  let ignoradas = 0
  for (const item of itens ?? []) {
    const compra = item?.purchase ?? {}
    if (!STATUS_COM_RECEITA.has(String(compra.status ?? '').toUpperCase())) continue
    const quando = new Date(Number(compra.approved_date ?? compra.order_date))
    if (Number.isNaN(quando.getTime())) continue
    const moeda = String(compra.price?.currency_code ?? 'BRL').toUpperCase()
    if (moeda !== 'BRL') {
      ignoradas += 1
      continue
    }
    const taxa = compra.hotmart_fee ?? {}
    const base = Number(taxa.base)
    const bruto = Number.isFinite(base) && base > 0 ? base : Number(compra.price?.value)
    if (!Number.isFinite(bruto)) continue
    const liquido = bruto - (Number(taxa.total) || 0)
    const mes = mesDeData(quando)
    porMes[mes] = Math.round(((porMes[mes] ?? 0) + liquido) * 100) / 100
  }
  return { porMes, ignoradas }
}

export function hotmartConfigurada(env) {
  return Boolean(env.HOTMART_CLIENT_ID && env.HOTMART_CLIENT_SECRET && env.HOTMART_BASIC)
}

export async function buscarHotmart(env, desde) {
  const token = await getHotmartAccessToken(env)
  const itens = await fetchHotmartSalesHistory(token, { startDate: inicioDoMes(desde), endDate: new Date() })
  return somarHotmartPorMes(itens)
}

export function metaConfigurada(env) {
  return Boolean(env.META_ACCESS_TOKEN && (parseAllowedAccountIds(env) || env.META_AD_ACCOUNT_ID))
}

/** Gasto com anúncios por mês, somando as contas liberadas (META_ALLOWED_ACCOUNT_IDS). Contas fora de BRL são ignoradas. */
export async function buscarMeta(env, desde) {
  const contas = parseAllowedAccountIds(env) ?? [env.META_AD_ACCOUNT_ID]
  const hoje = getSaoPauloClock().dateKey
  const timeRange = JSON.stringify({ since: `${desde}-01`, until: hoje })
  const porMes = {}
  const ignoradas = []
  for (const conta of contas) {
    const resposta = await graphGet(
      `/${conta}/insights`,
      { fields: 'spend,account_currency', time_increment: 'monthly', time_range: timeRange, limit: '100' },
      env.META_ACCESS_TOKEN,
    )
    for (const linha of resposta.data ?? []) {
      if (String(linha.account_currency ?? 'BRL').toUpperCase() !== 'BRL') {
        ignoradas.push(conta)
        continue
      }
      const mes = String(linha.date_start).slice(0, 7)
      porMes[mes] = Math.round(((porMes[mes] ?? 0) + Number(linha.spend || 0)) * 100) / 100
    }
  }
  return { porMes, ignoradas: [...new Set(ignoradas)] }
}

export function youtubeConfigurado(env) {
  return Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REFRESH_TOKEN)
}

/**
 * Receita estimada do YouTube por mês (YouTube Analytics API, já em reais). Precisa de um refresh token do dono do canal
 * com o escopo https://www.googleapis.com/auth/yt-analytics-monetary.readonly (ver DEPLOY.md, seção Finanças).
 */
export async function buscarYoutube(env, desde) {
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: env.YOUTUBE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const token = await tokenResp.json().catch(() => ({}))
  if (!tokenResp.ok || !token.access_token) throw new Error(`Google recusou o token do YouTube (${token.error_description || token.error || tokenResp.status}).`)

  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  url.searchParams.set('ids', 'channel==MINE')
  url.searchParams.set('startDate', `${desde}-01`)
  url.searchParams.set('endDate', getSaoPauloClock().dateKey)
  url.searchParams.set('metrics', 'estimatedRevenue')
  url.searchParams.set('dimensions', 'month')
  url.searchParams.set('currency', 'BRL')
  url.searchParams.set('sort', 'month')
  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(30_000) })
  const corpo = await resposta.json().catch(() => ({}))
  if (!resposta.ok) throw new Error(`YouTube Analytics recusou (${corpo?.error?.message || resposta.status}).`)

  const porMes = {}
  for (const [mes, receita] of corpo.rows ?? []) porMes[String(mes)] = Math.round(Number(receita || 0) * 100) / 100
  return { porMes, ignoradas: 0 }
}

export { ultimoDia }
