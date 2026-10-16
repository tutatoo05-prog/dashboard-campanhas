import type { User } from '@/types'

export interface SessionResponse {
  authenticated: boolean
  user: User | null
}

export async function fetchSession(): Promise<SessionResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include',
      signal: controller.signal,
    })

    if (response.status === 401) {
      return { authenticated: false, user: null }
    }

    if (!response.ok) {
      throw new Error('Não foi possível verificar a sessão.')
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export interface LoginPayload {
  usuario?: string
  email?: string
  senha: string
  nome?: string
}

export interface AuthResult {
  user: User
  message?: string
}

export async function login({ usuario, email, senha, nome }: LoginPayload): Promise<AuthResult> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, email, senha, nome, action: 'login' }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Usuário ou senha incorretos.')
  }

  return data
}

export interface RegisterPayload {
  nome: string
  email: string
  usuario?: string
  senha: string
}

export async function register({ nome, email, usuario, senha }: RegisterPayload): Promise<AuthResult> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, email, usuario, senha, action: 'register' }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Não foi possível criar a conta.')
  }

  return data
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })
}

export interface SimpleResult {
  success: boolean
  message: string
}

export async function forgotPassword(email: string): Promise<SimpleResult> {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Não foi possível processar a solicitação.')
  }

  return data
}

export async function resetPassword(token: string, senha: string): Promise<SimpleResult> {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, senha }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Não foi possível redefinir a senha.')
  }

  return data
}
