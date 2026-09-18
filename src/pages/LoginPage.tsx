import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { login, register } from '@/services/authService.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { PasswordField, isPasswordValid } from '@/components/auth/PasswordField.tsx'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const setUser = useAuthStore((state) => state.setUser)
  const location = useLocation() as { state?: { message?: string } }

  const [mode, setMode] = useState<Mode>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senhaConfirm, setSenhaConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState(location.state?.message ?? '')
  const [loading, setLoading] = useState(false)

  const isRegister = mode === 'register'

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (isRegister) {
        if (!isPasswordValid(senha)) {
          throw new Error('A senha não atende aos critérios exigidos.')
        }
        if (senha !== senhaConfirm) {
          throw new Error('As senhas não coincidem.')
        }
        const result = await register({ nome, email, usuario: email, senha })
        setMode('login')
        setMessage(result.message ?? 'Conta criada. Faça login.')
        setNome('')
        setSenha('')
        setSenhaConfirm('')
      } else {
        const result = await login({ usuario: email, email, senha, nome: '' })
        setUser(result.user)
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.')
      setSenha('')
      setSenhaConfirm('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen flex min-h-dvh w-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="brand-logo brand-logo-lg mx-auto mb-4">
            <i className="fa-solid fa-fire" />
          </div>
          <h1 className="font-display text-3xl text-zinc-50">Tuzinho Ads</h1>
          <p className="mt-1 text-sm text-zinc-500">Tuzinho Academy · Meta Ads</p>
        </div>

        <div className="surface-card p-6 sm:p-8">
          <div className="mb-6 flex rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-1">
            <button
              type="button"
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                !isRegister ? 'accent-gradient text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              onClick={() => switchMode('login')}
            >
              <i className="fa-solid fa-right-to-bracket text-xs" /> Entrar
            </button>
            <button
              type="button"
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isRegister ? 'accent-gradient text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              onClick={() => switchMode('register')}
            >
              <i className="fa-solid fa-user-plus text-xs" /> Criar conta
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-lg border border-green-500/25 bg-green-500/8 px-4 py-3 text-sm text-green-300">
              {message}
            </div>
          )}

          <form className="space-y-4" autoComplete="off" noValidate onSubmit={handleSubmit}>
            {isRegister && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-500">Nome</span>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  required
                  className="auth-input filter-input"
                  placeholder="Seu nome"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                />
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-500">E-mail</span>
              <input
                type="text"
                inputMode="email"
                autoComplete="off"
                data-lpignore="true"
                required
                className="auth-input filter-input"
                placeholder="usuario@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <PasswordField
              id="auth-senha"
              label="Senha"
              value={senha}
              onChange={setSenha}
              showChecklist={isRegister}
            />
            {isRegister && (
              <PasswordField
                id="auth-senha-confirm"
                label="Confirmar senha"
                value={senhaConfirm}
                onChange={setSenhaConfirm}
              />
            )}

            {!isRegister && (
              <div className="text-right">
                <Link to="/forgot-password" className="text-xs text-zinc-500 hover:text-gold">
                  Esqueci minha senha
                </Link>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-gold w-full disabled:opacity-60">
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" /> Aguarde...
                </>
              ) : isRegister ? (
                <>
                  <i className="fa-solid fa-user-plus" /> Criar conta
                </>
              ) : (
                <>
                  <i className="fa-solid fa-right-to-bracket" /> Entrar
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          <i className="fa-solid fa-shield-halved mr-1 text-gold/50" />
          Acesso restrito · credenciais validadas via banco de dados
        </p>
      </div>
    </div>
  )
}
