// Lê ao vivo as planilhas do Google Sheets (compartilhadas por link) e devolve
// todos os registros normalizados + contagem por planilha/aba.
// A aba "Login" da planilha "Dashboard campanhas" NÃO é lida de propósito
// (guarda credenciais).

import { get as httpsGet } from 'node:https'

const SHEETS = [
  {
    id: '1_jslOnikNucr40S0TlQxcLRu-dEBISAj7VFvZHn-Y00',
    name: 'Dados Academy',
    tabs: [
      { gid: '0', name: 'Essentials', kind: 'lead' },
      { gid: '610716526', name: 'interessados - lp', kind: 'lead' },
      { gid: '1338273265', name: 'compradores', kind: 'comprador' },
      { gid: '1382358557', name: 'Prompt', kind: 'lead' },
      { gid: '1898672040', name: 'particular', kind: 'lead' },
    ],
  },
  {
    id: '1r9VZmX16krg2z7LVL_Iy8hiCMCFAcpUaHT3HHKg4gLI',
    name: 'Workshop Irezumi - 1ª edição',
    tabs: [{ gid: '0', name: 'leads', kind: 'lead' }],
  },
  {
    id: '1bsZu82te7PtZmAOswst6Aa-3hXeaa4GRZzz1NhGfPkI',
    name: 'Work gratuito Leão - 2ª edição',
    tabs: [{ gid: '0', name: 'Dados', kind: 'lead' }],
  },
  {
    id: '1JySke-PQl8HCXfyCv7YbAPBCw4XvXgbZYuZLNfU8hOo',
    name: 'Dashboard campanhas',
    tabs: [
      { gid: '0', name: 'Geral', kind: 'lead' },
      { gid: '1587765805', name: 'Work Cobertura', kind: 'lead' },
    ],
  },
]

const CACHE_TTL_MS = 60_000
const FETCH_TIMEOUT_MS = 20_000
let cache = null

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function pick(record, aliases) {
  for (const alias of aliases) {
    const value = record[alias]
    if (value && value.trim()) return value.trim()
  }
  return ''
}

function toIsoDate(raw) {
  if (!raw) return ''
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (br) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = br
    // Planilhas gravam horário de Brasília (UTC-3).
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

function cleanEmail(value) {
  return value.trim().toLowerCase()
}

function extractUtm(url, key) {
  if (!url) return ''
  try {
    return new URL(url).searchParams.get(key) ?? ''
  } catch {
    return ''
  }
}

// "De onde veio o lead": junta as colunas de origem (veio de / utm_source) e
// mídia (midia / utm_medium) num rótulo único e legível.
function resolveChannel(source, medium, campaign) {
  const s = normalizeKey(source)
  const m = normalizeKey(medium)
  const c = normalizeKey(campaign)

  if (!s && !m) return 'Sem rastreamento'
  if (s === 'organico' || m === 'organico' || c === 'organico') return 'Orgânico'
  if (s === 'meta' || s === 'fb' || s === 'facebook' || m === 'paid_social' || m === 'paid') {
    return 'Meta Ads (pago)'
  }
  if (s === 'ig' || s === 'instagram' || (!s && (m === 'dm' || m === 'feed'))) {
    if (m === 'dm') return 'Instagram · DM'
    if (m === 'feed') return 'Instagram · Feed'
    if (m === 'link_in_bio') return 'Instagram · Bio'
    return 'Instagram (orgânico)'
  }
  return source || medium
}

function resolveCampaign(raw) {
  const value = (raw ?? '').trim()
  if (!value) return ''
  if (normalizeKey(value) === 'organico') return 'Orgânico'
  if (/^\d{10,}$/.test(value)) return `ID ${value}`
  return value
}

function toRecords(sheet, tab, csvText) {
  const rows = parseCsv(csvText)
  if (!rows.length) return []
  const headers = rows[0].map(normalizeKey)

  const records = []
  for (const cells of rows.slice(1)) {
    if (!cells.some((cell) => cell.trim())) continue

    const raw = {}
    headers.forEach((header, index) => {
      if (header) raw[header] = cells[index] ?? ''
    })

    const landingUrl = pick(raw, ['landing_url', 'link_de_origem', 'source_url'])
    const source = pick(raw, ['veio_de', 'utm_source']) || extractUtm(landingUrl, 'utm_source')
    const medium = pick(raw, ['midia', 'utm_medium']) || extractUtm(landingUrl, 'utm_medium')
    const campaign = resolveCampaign(
      pick(raw, ['campanha', 'utm_campaign']) || extractUtm(landingUrl, 'utm_campaign'),
    )

    records.push({
      planilha: sheet.name,
      aba: tab.name,
      tipo: tab.kind,
      nome: pick(raw, ['nome']),
      email: cleanEmail(pick(raw, ['email'])),
      telefone: pick(raw, ['telefone_formatado', 'telefone', 'whatsapp']),
      data: toIsoDate(
        pick(raw, ['data', 'data_hora', 'recebido_em', 'created_at']),
      ),
      canal: resolveChannel(source, medium, campaign),
      campanha: campaign,
      criativo: pick(raw, ['criativo', 'utm_content']),
    })
  }
  return records
}

// https nativo com IPv4 forçado: o fetch (undici) falha sem detalhe em redes
// onde o IPv6 do Google não responde.
function getText(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const request = httpsGet(
      url,
      { family: 4, headers: { 'User-Agent': 'dash-campanhas' }, timeout: FETCH_TIMEOUT_MS },
      (response) => {
        const { statusCode = 0, headers } = response
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          response.resume()
          if (redirects <= 0) return reject(new Error('Redirecionamentos demais'))
          return resolve(getText(new URL(headers.location, url).toString(), redirects - 1))
        }
        if (statusCode !== 200) {
          response.resume()
          return reject(new Error(`HTTP ${statusCode}`))
        }
        if (!String(headers['content-type'] ?? '').includes('csv')) {
          response.resume()
          return reject(new Error('Planilha sem acesso público'))
        }
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        response.on('error', reject)
      },
    )
    request.on('timeout', () => request.destroy(new Error('Tempo esgotado')))
    request.on('error', (error) => reject(new Error(error.code ? `${error.code}: ${error.message}` : error.message)))
  })
}

async function fetchTab(sheet, tab) {
  const url = `https://docs.google.com/spreadsheets/d/${sheet.id}/export?format=csv&gid=${tab.gid}`
  let text
  try {
    text = await getText(url)
  } catch {
    text = await getText(url)
  }
  return toRecords(sheet, tab, text)
}

async function loadAll() {
  const jobs = SHEETS.flatMap((sheet) =>
    sheet.tabs.map(async (tab) => {
      const base = { planilha: sheet.name, aba: tab.name, tipo: tab.kind, url: `https://docs.google.com/spreadsheets/d/${sheet.id}/edit?gid=${tab.gid}` }
      try {
        const records = await fetchTab(sheet, tab)
        return { summary: { ...base, count: records.length, error: null }, records }
      } catch (error) {
        console.error(`Erro ao ler ${sheet.name} / ${tab.name}:`, error)
        return { summary: { ...base, count: null, error: error.message || 'Falha ao ler a aba' }, records: [] }
      }
    }),
  )

  const results = await Promise.all(jobs)
  return {
    tabs: results.map((item) => item.summary),
    records: results.flatMap((item) => item.records),
  }
}

export async function handleRegistrosRequest(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost')

  if (pathname !== '/api/registros') {
    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Método não permitido.' })
  }

  const force = new URL(req.url, 'http://localhost').searchParams.get('refresh') === '1'

  try {
    if (force || !cache || Date.now() - cache.at > CACHE_TTL_MS) {
      cache = { at: Date.now(), data: await loadAll() }
    }
    return sendJson(res, 200, {
      success: true,
      fetchedAt: new Date(cache.at).toISOString(),
      ...cache.data,
    })
  } catch (error) {
    console.error('Erro ao buscar registros:', error)
    return sendJson(res, 502, { error: 'Erro ao ler as planilhas.' })
  }
}
