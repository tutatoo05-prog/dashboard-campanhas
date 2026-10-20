import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { login, register } from '@/services/authService.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { PasswordField, isPasswordValid } from '@/components/auth/PasswordField.tsx'
import { AuthBackdrop } from '@/components/auth/AuthBackdrop.tsx'
import { Tatu } from '@/components/mascot/Tatu.tsx'

type Mode = 'login' | 'register'

const ROTATING_WORDS = ['campanhas', 'vendas', 'leads', 'lives', 'metas']

function RotatingWord({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setIndex((prev) => (prev + 1) % words.length), 2400)
    return () => window.clearInterval(id)
  }, [words.length])

  return (
    <span className="auth-rotator">
      <span key={index}>{words[index]}</span>
    </span>
  )
}

export default function LoginPage() {
  const setUser = useAuthStore((state) => state.setUser)
  const location = useLocation() as { state?: { message?: string } }
  const cardRef = useRef<HTMLDivElement>(null)

  const [mode, setMode] = useState<Mode>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senhaConfirm, setSenhaConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState(location.state?.message ?? '')
  const [loading, setLoading] = useState(false)
  const [mood, setMood] = useState<'idle' | 'curl' | 'shake' | 'happy'>('idle')

  const isRegister = mode === 'register'

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setMessage('')
  }

  function shakeCard() {
    const card = cardRef.current
    if (!card) return
    card.classList.remove('auth-shake')
    void card.offsetWidth
    card.classList.add('auth-shake')
    setMood('shake')
    window.setTimeout(() => setMood('idle'), 600)
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
      shakeCard()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen flex min-h-dvh w-full items-center justify-center p-4">
      <AuthBackdrop />

      <div className="auth-content w-full max-w-md">
        <div className="mb-8 text-center">
          <Tatu size={88} mood={mood} className="tatu-brand tatu-auth mx-auto mb-3" />
          <h1 className="auth-enter auth-title font-display text-3xl" style={{ '--d': '0.15s' } as CSSProperties}>
            Academy Labs
          </h1>
          <p className="auth-enter mt-1 text-sm text-zinc-500" style={{ '--d': '0.25s' } as CSSProperties}>
            Painel de campanhas
          </p>
          <p className="auth-enter mt-3 text-sm text-zinc-400" style={{ '--d': '0.35s' } as CSSProperties}>
            Acompanhe <RotatingWord words={ROTATING_WORDS} /> em um só painel
          </p>
        </div>

        <div className="auth-enter auth-card-tilt" style={{ '--d': '0.45s' } as CSSProperties}>
          <div ref={cardRef} className="auth-card rounded-2xl p-6 sm:p-8">
            <div
              className="auth-tabs mb-6 rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-1"
              data-mode={mode}
            >
              <span className="auth-tabs-indicator" />
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-300 ${
                  !isRegister ? 'text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                onClick={() => switchMode('login')}
              >
                <i className="fa-solid fa-right-to-bracket text-xs" /> Entrar
              </button>
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-300 ${
                  isRegister ? 'text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                onClick={() => switchMode('register')}
              >
                <i className="fa-solid fa-user-plus text-xs" /> Criar conta
              </button>
            </div>

            {error && (
              <div className="auth-field mb-4 rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
            {message && (
              <div className="auth-field mb-4 rounded-lg border border-green-500/25 bg-green-500/8 px-4 py-3 text-sm text-green-300">
                {message}
              </div>
            )}

            <form
              className="space-y-4"
              autoComplete="off"
              noValidate
              onSubmit={handleSubmit}
              onFocusCapture={(event) => {
                if ((event.target as HTMLElement).id?.startsWith('auth-senha')) setMood('curl')
              }}
              onBlurCapture={(event) => {
                if ((event.target as HTMLElement).id?.startsWith('auth-senha')) setMood('idle')
              }}
            >
              {isRegister && (
                <label className="auth-field block">
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
                <div className="auth-field" style={{ '--d': '0.06s' } as CSSProperties}>
                  <PasswordField
                    id="auth-senha-confirm"
                    label="Confirmar senha"
                    value={senhaConfirm}
                    onChange={setSenhaConfirm}
                  />
                </div>
              )}

              {!isRegister && (
                <div className="auth-field text-right">
                  <Link to="/forgot-password" className="text-xs text-zinc-500 transition-colors hover:text-gold">
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
        </div>

        <p className="auth-enter mt-6 text-center text-xs text-zinc-600" style={{ '--d': '0.6s' } as CSSProperties}>
          <i className="fa-solid fa-shield-halved mr-1 text-gold/50" />
          Acesso restrito · credenciais validadas via banco de dados
        </p>
      </div>
    </div>
  )
}
