import type { Lead, LeadNota } from '@/types'

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

/** Anotações internas da equipe sobre os leads (situação do contato, etiquetas, nota). */
export async function fetchLeadNotas(): Promise<LeadNota[]> {
  const response = await fetch('/api/leads/notas', { credentials: 'include', headers: { Accept: 'application/json' } })
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar as anotações.')
  return Array.isArray(data.notas) ? data.notas : []
}

/** Salva a anotação, a situação de contato e as etiquetas de uma pessoa (só admin). */
export async function saveLeadNota(nota: Pick<LeadNota, 'chave' | 'nota' | 'situacao' | 'tags'>): Promise<LeadNota> {
  const response = await fetch('/api/leads/notas', {
    method: 'PUT',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(nota),
  })

  if (response.status === 401) throw new Error('SESSION_EXPIRED')

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível salvar a anotação.')
  return data.nota
}
