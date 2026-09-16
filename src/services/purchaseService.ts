import type { Purchase } from '@/types'

export async function fetchPurchases(): Promise<Purchase[]> {
  const response = await fetch('/api/purchases', {
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
    throw new Error(data.error ?? 'Não foi possível carregar as compras.')
  }

  return Array.isArray(data.purchases) ? data.purchases : []
}
