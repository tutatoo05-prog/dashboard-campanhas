// Leitura de planilhas do Google Sheets compartilhadas por link (exportação CSV).
// Usado pela tela Registros e pelos eventos da Hotmart.

import { get as httpsGet } from 'node:https'
import { criarLimitador } from './limitador.js'

// As 16 abas não podem ser baixadas todas de uma vez: junto com a Meta, enchem a fila de DNS do Node.
const limitarGoogle = criarLimitador(3)

const FETCH_TIMEOUT_MS = 20_000

export function parseCsv(text) {
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

export function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

// https nativo com IPv4 forçado: o fetch (undici) falha sem detalhe em redes
// onde o IPv6 do Google não responde.
export function getText(url, redirects = 5) {
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

/** Baixa uma aba (gid) como texto CSV, com uma nova tentativa se falhar. */
export function fetchSheetCsv(sheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
  return limitarGoogle(async () => {
    try {
      return await getText(url)
    } catch {
      return getText(url)
    }
  })
}

/**
 * Converte o CSV em objetos com as colunas normalizadas (sem acento, minúsculas, com _).
 * Abas "de filtro" têm uma linha de aviso antes do cabeçalho; `headerRow` indica qual linha usar.
 */
export function csvToObjects(csvText, { headerRow = 0 } = {}) {
  const rows = parseCsv(csvText)
  if (rows.length <= headerRow) return []
  const headers = rows[headerRow].map(normalizeKey)
  const objects = []
  for (const cells of rows.slice(headerRow + 1)) {
    if (!cells.some((cell) => cell.trim())) continue
    const object = {}
    headers.forEach((header, index) => {
      if (header) object[header] = cells[index] ?? ''
    })
    objects.push(object)
  }
  return objects
}
