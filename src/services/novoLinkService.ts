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

export type EstadoCriarSenha = { estado: 'ativo'; url: string } | { estado: 'vencido'; t?: string } | { estado: 'invalido' }

/** O que fazer com o botão "Criar minha senha" do e-mail: ir para a criação da senha (link ainda vale) ou avisar que venceu. */
export async function consultarCriarSenha(codigo: string): Promise<EstadoCriarSenha> {
  const response = await fetch(`/api/criar-senha?c=${encodeURIComponent(codigo)}`, { headers: { Accept: 'application/json' } })
  const data = await response.json().catch(() => ({}))
  if (response.status === 400 && data.estado === 'invalido') return { estado: 'invalido' }
  if (!response.ok) throw new Error(data.error ?? 'Não conseguimos abrir agora. Tente de novo em alguns minutos.')
  if (data.estado === 'ativo' && typeof data.url === 'string') return { estado: 'ativo', url: data.url }
  if (data.estado === 'vencido') return { estado: 'vencido', t: typeof data.t === 'string' ? data.t : undefined }
  return { estado: 'invalido' }
}
