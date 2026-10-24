// LEGADO: lê ao vivo as planilhas do Google Sheets (compartilhadas por link). A tela Registros NÃO usa mais isto: ela lê
// do banco. Este arquivo só alimenta a cópia (planilhas_copia) de onde o histórico é importado para a tabela leads.
// A aba "Login" da planilha "Dashboard campanhas" NÃO é lida de propósito
// (guarda credenciais).

import { csvToObjects, fetchSheetCsv, normalizeKey } from './sheetsCsv.js'
import { TRACKING_SHEET_ID, eventsFromCsv, loadExtraBuyers } from './hotmartEvents.js'
import { cleanEmail, registroDeEvento, resolveCampaign, resolveChannel } from './registrosUtil.js'

const SHEETS = [
  {
    id: '1_jslOnikNucr40S0TlQxcLRu-dEBISAj7VFvZHn-Y00',
    name: 'Dados Academy',
    tabs: [
      { gid: '0', name: 'Essentials', kind: 'lead' },
      { gid: '610716526', name: 'interessados - lp', kind: 'lead' },
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
  {
    // Planilha gravada pelo n8n (fluxos "Essentials Webhook Unico 2026" e Hotmart). Cada aba aqui é um
    // filtro de uma aba-base: leads (situacao) e eventos da Hotmart (categoria do evento).
    id: TRACKING_SHEET_ID,
    name: 'Tracking Essentials',
    tabs: [
      { gid: '2105086586', linkGid: '462706006', name: 'Leads novos', kind: 'lead', where: (raw) => raw.situacao === 'novo' },
      { gid: '2105086586', linkGid: '1077549871', name: 'Leads repetidos', kind: 'lead', where: (raw) => raw.situacao === 'repetido' },
      { gid: '2105086586', linkGid: '1722788244', name: 'Leads reprovados', kind: 'lead', where: (raw) => raw.situacao === 'reprovado' },
      { gid: '1467558126', linkGid: '1758951319', name: 'Vendas aprovadas', kind: 'evento', source: 'hotmart', categoria: 'venda' },
      { gid: '1467558126', linkGid: '1983515411', name: 'Boleto e Pix gerados', kind: 'evento', source: 'hotmart', categoria: 'pix_boleto' },
      { gid: '1467558126', linkGid: '241349732', name: 'Carrinho abandonado', kind: 'evento', source: 'hotmart', categoria: 'abandono' },
      { gid: '1467558126', linkGid: '1160205360', name: 'Cancelamentos e atrasos', kind: 'evento', source: 'hotmart', categoria: 'cancelamento' },
      { gid: '1467558126', linkGid: '1078595179', name: 'Reembolsos e chargebacks', kind: 'evento', source: 'hotmart', categoria: 'reembolso' },
    ],
  },
]

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
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (iso) {
    const [, yyyy, mm, dd, hh, mi, ss = '00'] = iso
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`).toISOString()
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

function extractUtm(url, key) {
  if (!url) return ''
  try {
    return new URL(url).searchParams.get(key) ?? ''
  } catch {
    return ''
  }
}

function toRecords(sheet, tab, csvText) {
  // Eventos da Hotmart: já vêm normalizados (origem, valor em reais, situação do Pix/boleto e do carrinho).
  if (tab.source === 'hotmart') {
    return eventsFromCsv(csvText)
      .filter((event) => event.categoria === tab.categoria)
      .map((event) => registroDeEvento(sheet.name, tab.name, tab.kind, event))
  }

  const records = []
  for (const raw of csvToObjects(csvText)) {
    if (tab.where && !tab.where(raw)) continue

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

async function loadAll() {
  // Abas "virtuais" leem a mesma aba-base: baixa uma vez só.
  const downloads = new Map()
  const download = (sheet, gid) => {
    const key = `${sheet.id}:${gid}`
    if (!downloads.has(key)) downloads.set(key, fetchSheetCsv(sheet.id, gid))
    return downloads.get(key)
  }

  const jobs = SHEETS.flatMap((sheet) =>
    sheet.tabs.map(async (tab) => {
      const base = {
        planilha: sheet.name,
        aba: tab.name,
        tipo: tab.kind,
        url: `https://docs.google.com/spreadsheets/d/${sheet.id}/edit?gid=${tab.linkGid ?? tab.gid}`,
      }
      try {
        const records = toRecords(sheet, tab, await download(sheet, tab.gid))
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

/** Lê as planilhas do Google ao vivo (≈14 s, 16 abas). Usado só pelo agendador da cópia e como reserva. */
export async function carregarRegistrosAoVivo(env = null) {
  // Quem já comprou (compras do dash) para o carrinho abandonado sair de "em aberto"
  if (env) await loadExtraBuyers(env, { force: true })
  return loadAll()
}
