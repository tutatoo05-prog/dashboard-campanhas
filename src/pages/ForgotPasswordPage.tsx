import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '@/services/authService.ts'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const result = await forgotPassword(email)
      setMessage(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.')
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
          <p className="mt-1 text-sm text-zinc-500">Esqueci minha senha</p>
        </div>

        <div className="surface-card p-6 sm:p-8">
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

          {!message && (
            <form className="space-y-4" autoComplete="off" noValidate onSubmit={handleSubmit}>
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

              <button type="submit" disabled={loading} className="btn-gold w-full disabled:opacity-60">
                {loading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" /> Aguarde...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-paper-plane" /> Enviar link de redefinição
                  </>
                )}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm">
            <Link to="/login" className="text-zinc-500 hover:text-zinc-300">
              <i className="fa-solid fa-arrow-left mr-1" /> Voltar para o login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
