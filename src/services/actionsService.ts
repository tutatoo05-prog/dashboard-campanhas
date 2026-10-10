/** Cliente da API da Central de Ações v2 (adiar, atribuir, histórico, regras, avisos e ações na Meta). */

export interface ActionSnooze {
  accountId: string
  actionId: string
  until: string
}

export interface ActionAssignment {
  accountId: string
  actionId: string
  userId: string | null
  userName: string
  userEmail: string
}

export interface ActionSnapshot {
  spend?: number
  leads?: number
  cpl?: number
  ctr?: number
  periodDays?: number
  moneyAtStake?: number
}

export interface ActionHistoryEntry {
  accountId: string
  actionId: string
  campaignId: string | null
  title: string
  kind: string
  doneBy: string | null
  day: string
  doneAt: string
  snapshot: ActionSnapshot
}

export type RuleType = 'cpl_above_avg' | 'spend_no_leads' | 'budget_used'

export interface AutomationRule {
  id: string
  type: RuleType
  params: { pct?: number; days?: number; amount?: number }
  enabled: boolean
}

export interface RuleAlert {
  id: string
  accountId: string
  campaignId: string | null
  campaignName: string | null
  title: string
  detail: string
  money: number | null
  ruleType: RuleType
}

export interface NotificationSettings {
  emailDaily: boolean
  emailHour: number
  whatsappUrgent: boolean
}

export interface AssignableUser {
  id: string
  nome: string
  email: string
}

export interface ActionsState {
  snoozes: ActionSnooze[]
  assignments: ActionAssignment[]
  history: ActionHistoryEntry[]
  rules: AutomationRule[]
  alerts: RuleAlert[]
  settings: NotificationSettings
  delivery: { webhookConfigured: boolean }
  users: AssignableUser[]
}

export class ActionsApiError extends Error {
  code?: string
  status: number

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })

  if (response.status === 401) throw new ActionsApiError('SESSION_EXPIRED', 401)

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ActionsApiError(data.error ?? 'Não foi possível concluir a ação.', response.status, data.code)
  }
  return data as T
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export function fetchActionsState(accountId?: string | null): Promise<ActionsState> {
  const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
  return request<ActionsState>(`/api/actions/state${query}`)
}

export const snoozeAction = (accountId: string, actionId: string, until: string | null) =>
  post<{ success: boolean }>('/api/actions/snooze', { accountId, actionId, until })

export const assignAction = (accountId: string, actionId: string, userId: string | null) =>
  post<{ success: boolean }>('/api/actions/assign', { accountId, actionId, userId })

export const recordActionDone = (payload: {
  accountId: string
  actionId: string
  done: boolean
  campaignId?: string | null
  title?: string
  kind?: string
  snapshot?: ActionSnapshot
}) => post<{ success: boolean }>('/api/actions/done', payload)

export const createRule = (type: RuleType, params: AutomationRule['params']) =>
  post<{ rule: AutomationRule }>('/api/actions/rules', { type, params })

export const updateRule = (id: string, patch: { enabled?: boolean; params?: AutomationRule['params'] }) =>
  request<{ rule: AutomationRule }>(`/api/actions/rules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const deleteRule = (id: string) => request<{ success: boolean }>(`/api/actions/rules/${id}`, { method: 'DELETE' })

export const runRules = () =>
  post<{ accounts: number; triggered: number; newAlerts: number; errors: { accountId: string; error: string }[] }>(
    '/api/actions/rules/run',
    {},
  )

export const saveNotificationSettings = (patch: Partial<NotificationSettings>) =>
  request<{ settings: NotificationSettings }>('/api/actions/settings', { method: 'PATCH', body: JSON.stringify(patch) })

// ── Alterações na Meta (só admin; exige permissão ads_management no token) ──

export interface BudgetChange {
  id: string
  name: string | null
  from: number | null
  to: number
  fromCents: number | null
  toCents: number
}

export interface MetaChangeResult {
  action: string
  campaign: { id: string; name: string; status?: string }
  mode?: 'campaign' | 'adsets' | 'restore'
  changes?: BudgetChange[]
}

export const setCampaignStatus = (campaignId: string, status: 'PAUSED' | 'ACTIVE') =>
  post<MetaChangeResult>(`/api/meta/campaigns/${campaignId}/status`, { status })

export const scaleCampaignBudget = (campaignId: string, factor: number) =>
  post<MetaChangeResult>(`/api/meta/campaigns/${campaignId}/budget`, { factor })

export const restoreCampaignBudget = (campaignId: string, restore: { id: string; dailyBudget: number }[]) =>
  post<MetaChangeResult>(`/api/meta/campaigns/${campaignId}/budget`, { restore })
