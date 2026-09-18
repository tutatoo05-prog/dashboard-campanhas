const AUTH_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
const SALES_HISTORY_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'

function normalizeBasicToken(basic) {
  const value = String(basic || '').trim()
  return value.toLowerCase().startsWith('basic ') ? value : `Basic ${value}`
}

export async function getHotmartAccessToken(env) {
  const clientId = env.HOTMART_CLIENT_ID
  const clientSecret = env.HOTMART_CLIENT_SECRET
  const basic = env.HOTMART_BASIC

  if (!clientId || !clientSecret || !basic) {
    throw new Error(
      'HOTMART_CLIENT_ID / HOTMART_CLIENT_SECRET / HOTMART_BASIC não configurados no .env.',
    )
  }

  const url = new URL(AUTH_URL)
  url.searchParams.set('grant_type', 'client_credentials')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('client_secret', clientSecret)

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: normalizeBasicToken(basic) },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Falha ao autenticar na API Hotmart (${response.status}): ${body}`)
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Busca o histórico de vendas (paginado) num intervalo de datas.
 * startDate/endDate: instâncias de Date.
 */
export async function fetchHotmartSalesHistory(accessToken, { startDate, endDate } = {}) {
  const items = []
  let pageToken = null
  let first = true

  while (first || pageToken) {
    first = false
    const url = new URL(SALES_HISTORY_URL)
    if (startDate) url.searchParams.set('start_date', String(startDate.getTime()))
    if (endDate) url.searchParams.set('end_date', String(endDate.getTime()))
    url.searchParams.set('max_results', '500')
    if (pageToken) url.searchParams.set('page_token', pageToken)

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Erro na API Hotmart de vendas (${response.status}): ${body}`)
    }

    const data = await response.json()
    items.push(...(data.items ?? []))
    pageToken = data.page_info?.next_page_token || null
  }

  return items
}
