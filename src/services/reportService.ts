export async function requestReport(payload: unknown): Promise<{ content: string; format: string }> {
  const response = await fetch('/api/report', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Não foi possível gerar o relatório.')
  }

  return data
}
