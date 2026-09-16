import type { Goal } from '@/types'

export async function fetchGoal(accountId: string, month: string): Promise<Goal | null> {
  const params = new URLSearchParams({ accountId, month })
  const response = await fetch(`/api/goals?${params}`, { credentials: 'include' })

  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED')
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Não foi possível carregar a meta.')
  }

  return data.goal ?? null
}

export async function saveGoal(goal: {
  accountId: string
  month: string
  spendTarget: number | null
  cplTarget: number | null
}): Promise<Goal | null> {
  const response = await fetch('/api/goals', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goal),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Não foi possível salvar a meta.')
  }

  return data.goal ?? null
}
