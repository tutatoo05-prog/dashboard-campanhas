import type { Lead } from '@/types'

export async function fetchLeads(): Promise<Lead[]> {
  const response = await fetch('/api/leads', {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  })

  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED')
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Não foi possível carregar os leads.')
  }

  return Array.isArray(data.leads) ? data.leads : []
}
