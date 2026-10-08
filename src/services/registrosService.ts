import type { RegistrosResponse } from '@/types'

export async function fetchRegistros(refresh = false): Promise<RegistrosResponse> {
  const response = await fetch(`/api/registros${refresh ? '?refresh=1' : ''}`, {
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
    throw new Error(data.error ?? 'Não foi possível carregar os registros.')
  }

  return {
    fetchedAt: data.fetchedAt ?? '',
    tabs: Array.isArray(data.tabs) ? data.tabs : [],
    records: Array.isArray(data.records) ? data.records : [],
  }
}
