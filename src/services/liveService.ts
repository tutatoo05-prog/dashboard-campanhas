import type { LiveStatus, LiveWindow } from '@/types'

/** Erro que carrega o estado atualizado devolvido junto com a falha. */
export class LiveError extends Error {
  status: LiveStatus | null

  constructor(message: string, status: LiveStatus | null) {
    super(message)
    this.status = status
  }
}

async function request(path: string, init?: RequestInit): Promise<LiveStatus> {
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
    throw new LiveError(data.error ?? 'Não foi possível falar com o servidor.', data.real !== undefined ? data : null)
  }

  return data as LiveStatus
}

export function fetchLiveStatus(): Promise<LiveStatus> {
  return request('/api/live')
}

export function turnLiveOn(offAt: string): Promise<LiveStatus> {
  return request('/api/live', {
    method: 'POST',
    body: JSON.stringify({ action: 'on', offAt: offAt || undefined }),
  })
}

export function turnLiveOff(): Promise<LiveStatus> {
  return request('/api/live', {
    method: 'POST',
    body: JSON.stringify({ action: 'off' }),
  })
}

export function saveLiveSchedule(schedule: LiveWindow[]): Promise<LiveStatus> {
  return request('/api/live/schedule', {
    method: 'PUT',
    body: JSON.stringify({ schedule }),
  })
}
