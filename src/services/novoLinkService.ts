/** Pede um link novo para criar a senha (botão "Receber outro link" do e-mail de boas-vindas). Rota pública, sem login. */
export async function pedirNovoLink(token: string): Promise<{ email: string }> {
  const response = await fetch('/api/novo-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: token }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não conseguimos enviar agora. Tente de novo em alguns minutos.')
  return { email: String(data.email ?? '') }
}
