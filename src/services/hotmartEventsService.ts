import type { HotmartEventsResponse } from '@/types'

/** Eventos da Hotmart (carrinho abandonado, Pix/boleto gerado...) lidos da planilha de tracking. */
export async function fetchHotmartEvents(refresh = false): Promise<HotmartEventsResponse> {
  const response = await fetch(`/api/eventos-hotmart${refresh ? '?refresh=1' : ''}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  if (response.status === 401) throw new Error('SESSION_EXPIRED')

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar os eventos da Hotmart.')

  return {
    fetchedAt: data.fetchedAt ?? '',
    events: Array.isArray(data.events) ? data.events : [],
    resumo: data.resumo,
  }
}
