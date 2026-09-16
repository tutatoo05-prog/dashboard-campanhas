import { getDataForPeriod, PERIODS, LEVELS, OBJECTIVES } from '@/data/mockData.js'
import type { AdAccountsResponse, InsightsData, Period } from '@/types'

export { PERIODS, LEVELS, OBJECTIVES }

const fetchOpts: RequestInit = { credentials: 'include' }

export async function fetchConfig(): Promise<{ defaultAccountId: string | null }> {
  const response = await fetch('/api/meta/config', fetchOpts)

  if (!response.ok) {
    return { defaultAccountId: null }
  }

  return response.json()
}

export async function fetchAdAccounts(): Promise<AdAccountsResponse> {
  const response = await fetch('/api/meta/adaccounts', fetchOpts)

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? 'Não foi possível carregar contas de anúncios.')
  }

  const data = await response.json()
  return {
    accounts: data.accounts ?? [],
    defaultAccountId: data.defaultAccountId ?? null,
    hasAccessToDefault: data.hasAccessToDefault ?? true,
    permissionWarning: data.permissionWarning ?? null,
  }
}

export async function fetchPermissions(): Promise<unknown> {
  const response = await fetch('/api/meta/permissions', fetchOpts)

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? 'Não foi possível verificar permissões.')
  }

  return response.json()
}

export async function fetchMetaInsights(
  period: Period,
  accountId?: string | null,
  { since, until }: { since?: string | null; until?: string | null } = {},
): Promise<InsightsData> {
  const params = new URLSearchParams({ period })

  if (accountId) {
    params.set('accountId', accountId)
  }

  if (period === 'custom') {
    if (since) params.set('since', since)
    if (until) params.set('until', until)
  }

  const response = await fetch(`/api/meta/insights?${params}`, fetchOpts)

  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? 'Não foi possível carregar insights da Meta.')
  }

  return response.json()
}

export function getMockData(
  period: Period,
  { since, until }: { since?: string | null; until?: string | null } = {},
): InsightsData {
  return {
    ...getDataForPeriod(period, { since, until }),
    source: 'mock',
    account: null,
    period,
    ...(period === 'custom' ? { since, until } : {}),
  }
}
