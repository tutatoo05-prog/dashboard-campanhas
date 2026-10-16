export interface SalvarFichaInput {
  accountId: string
  campaignId: string
  /** null = voltar ao tipo descoberto automaticamente. */
  tipo: string | null
  metaCusto?: number | null
}

/** Salva o que o usuário confirmou sobre a campanha (tipo e, se quiser, a meta de custo por resultado). */
export async function salvarFicha(input: SalvarFichaInput): Promise<void> {
  const response = await fetch('/api/fichas', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  })
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível salvar o tipo da campanha.')
}
