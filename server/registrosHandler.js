// Lê ao vivo as planilhas do Google Sheets (compartilhadas por link) e devolve
// todos os registros normalizados + contagem por planilha/aba.
// A aba "Login" da planilha "Dashboard campanhas" NÃO é lida de propósito
// (guarda credenciais).

import { csvToObjects, fetchSheetCsv, normalizeKey } from './sheetsCsv.js'
import { CATEGORY_LABELS, TRACKING_SHEET_ID, eventsFromCsv, loadExtraBuyers, loadHotmartEvents } from './hotmartEvents.js'
import { comCache } from './cacheCurto.js'
import { CHAVE_REGISTROS, gravarCopia, lerCopia } from './planilhasCopia.js'
import { query } from './db.js'

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

const CACHE_TTL_MS = 60_000
let cache = null

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
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
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (iso) {
    const [, yyyy, mm, dd, hh, mi, ss = '00'] = iso
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`).toISOString()
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

function registroDeEvento(sheet, tab, event) {
  return {
    planilha: sheet.name,
    aba: tab.name,
    tipo: tab.kind,
    nome: event.nome,
    email: event.email,
    telefone: event.telefone,
    data: event.data,
    canal: event.canal,
    campanha: event.campanha,
    criativo: '',
    evento: CATEGORY_LABELS[event.categoria] ?? event.evento,
    situacao: event.situacao ?? '',
    produto: event.produto,
    valor: event.valor,
    pagamento: event.pagamento,
    parcelas: event.parcelas ?? null,
    recorrencia: event.recorrencia ?? null,
    transacao: event.transacao ?? '',
  }
}

/**
 * Troca os registros de eventos da Hotmart (abas "virtuais" da planilha de tracking) pelos eventos juntados
 * do banco (webhook direto, em segundos) + histórico da planilha. Os leads e as demais planilhas ficam como estão.
 * Se não der para ler os eventos, devolve os dados da cópia sem mexer.
 */
export async function comEventosHotmart(dados, env) {
  if (!env || !dados?.records) return dados
  let eventos
  try {
    eventos = (await loadHotmartEvents({ env })).events
  } catch (erro) {
    console.error('Erro ao juntar os eventos da Hotmart nos registros:', erro.message || erro)
    return dados
  }
  const sheet = SHEETS.find((item) => item.id === TRACKING_SHEET_ID)
  const abas = sheet.tabs.filter((tab) => tab.source === 'hotmart')
  const nomesAbas = new Set(abas.map((tab) => tab.name))
  const novos = abas.flatMap((tab) => eventos.filter((event) => event.categoria === tab.categoria).map((event) => registroDeEvento(sheet, tab, event)))
  const contagem = new Map(abas.map((tab) => [tab.name, novos.filter((registro) => registro.aba === tab.name).length]))
  return {
    ...dados,
    tabs: dados.tabs.map((aba) => (aba.planilha === sheet.name && nomesAbas.has(aba.aba) ? { ...aba, count: contagem.get(aba.aba), error: null } : aba)),
    records: [...dados.records.filter((registro) => !(registro.planilha === sheet.name && nomesAbas.has(registro.aba))), ...novos],
  }
}

/**
 * Em que planilha/aba cada formulário aparece na tela. Formulário que não está aqui cai em "Formulários do dash",
 * numa aba com o nome da origem (assim um site novo já aparece sem precisar mexer neste arquivo).
 */
const ABA_DO_FORMULARIO = {
  workshop_irezumi_1: { planilha: 'Workshop Irezumi - 1ª edição', aba: 'leads' },
  lancamento_interessados: { planilha: 'Dados Academy', aba: 'interessados - lp' },
  cobertura_cicatrizacao_09_09: { planilha: 'Dashboard campanhas', aba: 'Work Cobertura' },
}
const PLANILHA_DO_DASH = 'Formulários do dash'

const digitosDoContato = (telefone) => String(telefone ?? '').replace(/\D/g, '').slice(-11)

function rotuloDaOrigem(origem) {
  const texto = String(origem || 'site').replace(/_/g, ' ').trim()
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Junta nos registros os leads que entraram direto no banco do dash (endpoint /api/captura, ou recuperados do n8n):
 * a planilha do Google não recebe mais esses cadastros, então sem isto eles sumiriam desta tela.
 * Quem já está na aba (mesmo e-mail ou telefone) não entra de novo. `consultar` é injetável para os testes.
 */
export async function comLeadsDoBanco(dados, env, consultar = (texto, params) => query(env, texto, params)) {
  if (!env || !dados?.records) return dados
  let linhas
  try {
    linhas = (
      await consultar(
        `select nome, email, telefone, origem, campanha, midia, veio_de, criativo, created_at
           from leads
          where fonte_id like 'captura:%' or fonte_id like 'recuperado:%'
          order by created_at`,
      )
    ).rows
  } catch (erro) {
    console.error('Erro ao juntar os leads do banco nos registros:', erro.message || erro)
    return dados
  }
  if (!linhas.length) return dados

  const conhecidos = new Map()
  const chaveDaAba = (planilha, aba) => `${planilha}||${aba}`
  for (const registro of dados.records) {
    const chave = chaveDaAba(registro.planilha, registro.aba)
    if (!conhecidos.has(chave)) conhecidos.set(chave, new Set())
    const aba = conhecidos.get(chave)
    const email = cleanEmail(registro.email ?? '')
    if (email) aba.add(`e:${email}`)
    const tel = digitosDoContato(registro.telefone)
    if (tel.length >= 8) aba.add(`t:${tel}`)
  }

  const novos = []
  const adicionadosPorAba = new Map()
  for (const lead of linhas) {
    const destino = ABA_DO_FORMULARIO[lead.origem] ?? { planilha: PLANILHA_DO_DASH, aba: rotuloDaOrigem(lead.origem) }
    const chave = chaveDaAba(destino.planilha, destino.aba)
    if (!conhecidos.has(chave)) conhecidos.set(chave, new Set())
    const aba = conhecidos.get(chave)
    const email = cleanEmail(lead.email ?? '')
    const tel = digitosDoContato(lead.telefone)
    if ((email && aba.has(`e:${email}`)) || (tel.length >= 8 && aba.has(`t:${tel}`))) continue
    if (email) aba.add(`e:${email}`)
    if (tel.length >= 8) aba.add(`t:${tel}`)

    const campanha = resolveCampaign(lead.campanha)
    novos.push({
      planilha: destino.planilha,
      aba: destino.aba,
      tipo: 'lead',
      nome: lead.nome ?? '',
      email,
      telefone: lead.telefone ?? '',
      data: new Date(lead.created_at).toISOString(),
      canal: resolveChannel(lead.veio_de ?? '', lead.midia ?? '', campanha),
      campanha,
      criativo: lead.criativo ?? '',
    })
    adicionadosPorAba.set(chave, (adicionadosPorAba.get(chave) ?? 0) + 1)
  }
  if (!novos.length) return dados

  const tabs = dados.tabs.map((aba) => {
    const extra = adicionadosPorAba.get(chaveDaAba(aba.planilha, aba.aba))
    return extra ? { ...aba, count: (aba.count ?? 0) + extra, error: null } : aba
  })
  for (const [chave, quantidade] of adicionadosPorAba) {
    const [planilha, aba] = chave.split('||')
    if (!tabs.some((item) => item.planilha === planilha && item.aba === aba)) {
      tabs.push({ planilha, aba, tipo: 'lead', url: '', count: quantidade, error: null })
    }
  }
  return { ...dados, tabs, records: [...dados.records, ...novos] }
}

/** Eventos da Hotmart e leads do banco, na ordem em que entram na resposta. */
async function comDadosDoBanco(dados, env) {
  return comLeadsDoBanco(await comEventosHotmart(dados, env), env)
}

function toRecords(sheet, tab, csvText) {
  // Eventos da Hotmart: já vêm normalizados (origem, valor em reais, situação do Pix/boleto e do carrinho).
  if (tab.source === 'hotmart') {
    return eventsFromCsv(csvText)
      .filter((event) => event.categoria === tab.categoria)
      .map((event) => registroDeEvento(sheet, tab, event))
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

export async function handleRegistrosRequest(req, res, env = null) {
  const { pathname } = new URL(req.url, 'http://localhost')

  if (pathname !== '/api/registros') {
    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Método não permitido.' })
  }

  const force = new URL(req.url, 'http://localhost').searchParams.get('refresh') === '1'

  try {
    // "Atualizar": copia as planilhas agora (leva uns segundos) e já mostra o resultado.
    if (force && env) {
      const { sincronizarRegistros } = await import('./planilhasSync.js')
      await sincronizarRegistros(env).catch((erro) => {
        if (erro?.code !== '42P01') console.error('Erro ao atualizar a cópia dos registros:', erro.message || erro)
      })
    }

    // Caminho normal: lê a cópia no banco, em milésimos.
    const copia = env ? await comCache('planilhas|registros', 300_000, () => lerCopia(env, CHAVE_REGISTROS)) : null
    if (copia?.dados?.records) {
      return sendJson(res, 200, { success: true, fetchedAt: copia.atualizadoEm, ...(await comDadosDoBanco(copia.dados, env)) })
    }

    // Sem cópia ainda (primeira vez, ou migração pendente): lê o Google ao vivo e guarda para a próxima.
    if (force || !cache || Date.now() - cache.at > CACHE_TTL_MS) {
      cache = { at: Date.now(), data: await carregarRegistrosAoVivo(env) }
      if (env) await gravarCopia(env, CHAVE_REGISTROS, cache.data).catch(() => {})
    }
    return sendJson(res, 200, {
      success: true,
      fetchedAt: new Date(cache.at).toISOString(),
      ...(await comDadosDoBanco(cache.data, env)),
    })
  } catch (error) {
    console.error('Erro ao buscar registros:', error)
    return sendJson(res, 502, { error: 'Erro ao ler as planilhas.' })
  }
}
