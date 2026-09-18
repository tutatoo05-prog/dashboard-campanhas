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

export interface User {
  nome?: string | null
  nome_completo?: string | null
  email?: string | null
  usuario?: string | null
  [key: string]: unknown
}

export interface AdAccount {
  id: string
  name: string
  currency: string
  [key: string]: unknown
}

export type CampaignStatus = 'Ativa' | 'Pausada'

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
  leads: number
  cpl: number
  conversions: number
  cpa: number
  frequency: number
  dateStart?: string | null
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
  [key: string]: unknown
}
