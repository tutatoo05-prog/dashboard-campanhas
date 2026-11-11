// Pedaços comuns do Registros: como o dash descreve a origem de um lead e como um evento da Hotmart vira registro.
import { normalizeKey } from './sheetsCsv.js'
import { rotuloDoEvento } from './hotmartEvents.js'

export function cleanEmail(value) {
  return value.trim().toLowerCase()
}

// "De onde veio o lead": junta as colunas de origem (veio de / utm_source) e
// mídia (midia / utm_medium) num rótulo único e legível.
export function resolveChannel(source, medium, campaign) {
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

export function resolveCampaign(raw) {
  const value = (raw ?? '').trim()
  if (!value) return ''
  if (normalizeKey(value) === 'organico') return 'Orgânico'
  if (/^\d{10,}$/.test(value)) return `ID ${value}`
  return value
}

/** Um evento da Hotmart no formato de registro da tela. `grupo`/`aba` são os nomes mostrados (antes: planilha/aba). */
export function registroDeEvento(grupo, aba, tipo, event) {
  return {
    planilha: grupo,
    aba,
    tipo,
    nome: event.nome,
    email: event.email,
    telefone: event.telefone,
    data: event.data,
    canal: event.canal,
    campanha: event.campanha,
    criativo: '',
    evento: rotuloDoEvento(event),
    situacao: event.situacao ?? '',
    produto: event.produto,
    valor: event.valor,
    pagamento: event.pagamento,
    parcelas: event.parcelas ?? null,
    recorrencia: event.recorrencia ?? null,
    transacao: event.transacao ?? '',
  }
}
