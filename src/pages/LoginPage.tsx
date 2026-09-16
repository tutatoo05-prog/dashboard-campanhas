import { useState, type FormEvent } from 'react'
import { login, register } from '@/services/authService.ts'
import { useAuthStore } from '@/store/authStore.ts'

type Mode = 'login' | 'register'

function PasswordField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-500">{label}</span>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          data-lpignore="true"
          required
          minLength={6}
          className="auth-input filter-input pr-10"
          placeholder="••••••••"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-500 transition hover:text-zinc-300"
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          tabIndex={-1}
          onClick={() => setVisible((prev) => !prev)}
        >
          <i className={`fa-regular ${visible ? 'fa-eye-slash' : 'fa-eye'} text-sm`} />
        </button>
      </div>
    </label>
  )
}

export default function LoginPage() {
  const setUser = useAuthStore((state) => state.setUser)

  const [mode, setMode] = useState<Mode>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senhaConfirm, setSenhaConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
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

            <PasswordField id="auth-senha" label="Senha" value={senha} onChange={setSenha} />
            {isRegister && (
              <PasswordField
                id="auth-senha-confirm"
                label="Confirmar senha"
                value={senhaConfirm}
                onChange={setSenhaConfirm}
              />
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
