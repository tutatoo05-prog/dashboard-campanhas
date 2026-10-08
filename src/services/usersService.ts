import type { Cargo, ManagedUser } from '@/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })

  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED')
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Não foi possível falar com o servidor.')
  }

  return data as T
}

export async function fetchUsers(): Promise<ManagedUser[]> {
  const data = await request<{ users?: ManagedUser[] }>('/api/users')
  return Array.isArray(data.users) ? data.users : []
}

export async function updateUserRole(id: string, cargo: Cargo): Promise<ManagedUser> {
  const data = await request<{ user: ManagedUser }>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ cargo }),
  })
  return data.user
}
