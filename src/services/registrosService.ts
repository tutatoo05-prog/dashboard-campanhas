import type { RegistrosResponse } from '@/types'

export interface SituacaoImportacao {
  feita: boolean
  semCopia: boolean
  pendentes: number
  detalhe?: { slug: string; grupo: string; nome: string; total: number }[]
  marcador?: { em: string; inseridos: number } | null
}

export async function fetchImportacao(): Promise<SituacaoImportacao> {
  const response = await fetch('/api/registros/importacao', { credentials: 'include', headers: { Accept: 'application/json' } })
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível checar a importação.')
  return data
}

export async function executarImportacao(): Promise<{ inseridos: number }> {
  const response = await fetch('/api/registros/importacao', { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } })
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível importar.')
  return data
}

/** Apaga uma pessoa dos registros (todas as abas). Só admin. `contatos` = todos os e-mails/telefones dela. */
export async function apagarRegistro(contatos: { email: string; telefone: string }[]): Promise<{ chaves: number; leadsApagados: number }> {
  const response = await fetch('/api/registros', {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ contatos }),
  })
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível apagar o registro.')
  return data
}

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
