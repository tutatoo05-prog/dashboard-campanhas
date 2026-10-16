export type Period =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'prev7'
  | 'prev30'
  | 'this_month'
  | 'last_month'
  | 'custom'

export type Level = 'campaigns' | 'adSets' | 'ads'

export type Objective = string

export type Cargo = 'admin' | 'usuario'

export interface User {
  nome?: string | null
  nome_completo?: string | null
  email?: string | null
  usuario?: string | null
  cargo?: Cargo | null
  [key: string]: unknown
}

export interface AdAccount {
  id: string
  name: string
  currency: string
  [key: string]: unknown
}

export type CampaignStatus = 'Ativa' | 'Pausada' | 'Concluída'

export interface CampaignItem {
  id: string
  campaignId?: string | null
  adsetId?: string | null
  name: string
  status: CampaignStatus
  objective: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpc: number
  /** Leads usados no dash: o maior entre os cadastros do site e o pixel da Meta. */
  leads: number
  cpl: number
  /** Eventos de Lead contados pelo pixel da Meta (só nas campanhas). */
  leadsMeta?: number
  /** Cadastros do site cruzados pelo nome da campanha (só nas campanhas). */
  leadsSite?: number
  conversions: number
  cpa: number
  frequency: number
  dateStart?: string | null
  /** Conta de anúncios da campanha (act_...). */
  accountId?: string
  /** Para que a campanha serve: descoberto pelo dash ou confirmado pelo usuário (ver src/lib/campaignType.js). */
  tipo?: string
  tipoOrigem?: 'automatico' | 'manual'
  tipoConfianca?: 'alta' | 'media' | 'baixa'
  tipoMotivo?: string
  [key: string]: unknown
}

export interface AnalysisTag {
  emoji: string
  label: string
  tone: 'success' | 'warning' | 'danger'
}

export interface CampaignAnalysis {
  tags: AnalysisTag[]
  primary: AnalysisTag
  score: number
  notes: string[]
  verdict: 'pause' | 'wait' | 'fix' | 'scale' | 'monitor'
  trend: { available: boolean; [key: string]: unknown }
  evidence: Record<string, unknown>
}

export interface EnrichedCampaignItem extends CampaignItem {
  analysis: CampaignAnalysis
}

export interface InsightCard {
  title: string
  value: string
  tone: 'success' | 'danger' | 'info' | 'neutral'
  detail: string
  fullWidth?: boolean
}

export interface InsightsData {
  campaigns: CampaignItem[]
  adSets: CampaignItem[]
  ads: CampaignItem[]
  account?: AdAccount | null
  source?: 'meta' | 'mock'
  period?: Period
  since?: string | null
  until?: string | null
  dailyByCampaign?: Record<string, unknown>
  [key: string]: unknown
}

export interface PermissionWarning {
  error: string
  [key: string]: unknown
}

export interface AdAccountsResponse {
  accounts: AdAccount[]
  defaultAccountId: string | null
  hasAccessToDefault: boolean
  permissionWarning: PermissionWarning | null
}

export interface Goal {
  accountId: string
  month: string
  spendTarget: number | null
  cplTarget: number | null
}

export interface Lead {
  nome?: string
  email?: string
  telefone?: string
  origem?: string
  campanha?: string
  midia?: string
  veio_de?: string
  criativo?: string
  ad_id?: string
  landing_url?: string
  data?: string
  created_at?: string
  [key: string]: unknown
}

export interface RegistroTab {
  planilha: string
  aba: string
  tipo: 'lead' | 'comprador' | 'evento'
  url: string
  count: number | null
  error: string | null
}

export interface Registro {
  planilha: string
  aba: string
  tipo: 'lead' | 'comprador' | 'evento'
  nome: string
  email: string
  telefone: string
  data: string
  canal: string
  campanha: string
  criativo: string
  /** Só nos eventos da Hotmart: tipo do evento, situação (pago, pendente, em aberto...), produto, valor e pagamento. */
  evento?: string
  situacao?: string
  produto?: string
  valor?: number | null
  pagamento?: string
}

/** Evento da Hotmart lido da planilha de tracking (compra, Pix/boleto gerado, carrinho abandonado...). */
export interface HotmartEvent {
  id: string
  data: string
  evento: string
  categoria: 'venda' | 'pix_boleto' | 'abandono' | 'cancelamento' | 'reembolso' | 'outro'
  nome: string
  email: string
  telefone: string
  cidade: string
  estado: string
  pais: string
  produto: string
  oferta: string
  valor: number | null
  valorOriginal: number | null
  moeda: string
  pagamento: string
  parcelas: number | null
  transacao: string
  src: string
  xcod: string
  variante: string
  campaignId: string | null
  canal: string
  campanha: string
  situacao:
    | 'pago'
    | 'cancelado'
    | 'pendente'
    | 'vencido'
    | 'recuperado'
    | 'ja comprou'
    | 'em aberto'
    | 'cancelada'
    | 'atrasada'
    | 'expirada'
    | 'reembolsada'
    | 'chargeback'
    | null
}

export interface HotmartEventsSummary {
  total: number
  vendas: { total: number }
  pixBoleto: { gerados: number; pagos: number; pendentes: number; vencidos: number; valorPendente: number }
  abandono: { eventos: number; pessoas: number; emAberto: number; recuperadas: number }
  cancelamentos: { total: number; canceladas: number; atrasadas: number; expiradas: number }
  reembolsos: { total: number }
}

export interface HotmartEventsResponse {
  fetchedAt: string
  events: HotmartEvent[]
  resumo: HotmartEventsSummary
}

export interface RegistrosResponse {
  fetchedAt: string
  tabs: RegistroTab[]
  records: Registro[]
}

export interface Purchase {
  id: string
  nome?: string
  email?: string
  telefone?: string
  campanha?: string
  curso?: string
  liberacao?: string
  data?: string
  valor?: number | null
  status?: string
  canceledAt?: string | null
  /** Código do assinante na Hotmart (agrupa as parcelas de uma assinatura). */
  subscriberCode?: string | null
  /** Momento em que a venda entrou no sistema (ISO). */
  createdAt?: string
  /** Origem do checkout na Hotmart (src), ex.: live, essentials_live. */
  src?: string | null
  /** Rastreio do checkout: ad_<ID da campanha>|var_<variante>|l_<lead>. */
  xcod?: string | null
  /** ID da campanha da Meta que trouxe a venda (quando o anúncio mandou o utm_id). */
  campaignId?: string | null
  /** Forma de pagamento da Hotmart (PIX, CREDIT_CARD, BILLET...). */
  pagamentoTipo?: string | null
  /** Só quando o item é um evento da Hotmart (ex.: "Carrinho abandonado"), não uma venda. */
  evento?: string
  /** Etiqueta curta do evento (Pendente, Em aberto, Comprou depois...). */
  badge?: string | null
  [key: string]: unknown
}

export interface LiveWindow {
  day: number
  start: string
  end: string
}

export interface LiveLogEntry {
  id: string
  action: string
  source: string
  userEmail: string | null
  detail: string
  ok: boolean
  createdAt: string
}

export interface LiveStatus {
  now: string
  timezone: string
  canEdit: boolean
  configured: boolean
  configError: string | null
  maxHours: number
  real: { on: boolean; since: string | null } | null
  realError: string | null
  writeError: string | null
  desired: { on: boolean; sources: string[]; until: string | null } | null
  inSync: boolean
  manual: { active: boolean; since: string | null; until: string | null; by: string | null } | null
  pausedUntil: string | null
  schedule: LiveWindow[]
  lastError: { message: string; at: string } | null
  dbError: string | null
  log: LiveLogEntry[]
}

export interface ManagedUser {
  id: string
  nome: string
  email: string
  usuario: string
  ativo: boolean
  cargo: Cargo
  createdAt: string | null
}
