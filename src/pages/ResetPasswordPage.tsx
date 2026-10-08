import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resetPassword } from '@/services/authService.ts'
import { AuthBackdrop } from '@/components/auth/AuthBackdrop.tsx'
import { Tatu } from '@/components/mascot/Tatu.tsx'
import { PasswordField, isPasswordValid } from '@/components/auth/PasswordField.tsx'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [senha, setSenha] = useState('')
  const [senhaConfirm, setSenhaConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!isPasswordValid(senha)) {
      setError('A senha não atende aos critérios exigidos.')
      return
    }
    if (senha !== senhaConfirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      await resetPassword(token, senha)
      navigate('/login', { state: { message: 'Senha redefinida. Faça login com a nova senha.' } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.')
      setSenha('')
      setSenhaConfirm('')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="auth-screen flex min-h-dvh w-full items-center justify-center p-4">
        <AuthBackdrop />

        <div className="auth-content w-full max-w-md">
          <div className="auth-enter surface-card p-6 text-center sm:p-8">
            <p className="text-sm text-red-300">Link inválido ou incompleto.</p>
            <Link to="/forgot-password" className="mt-4 inline-block text-sm text-zinc-500 hover:text-zinc-300">
              Solicitar novo link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen flex min-h-dvh w-full items-center justify-center p-4">
      <AuthBackdrop />

      <div className="auth-content w-full max-w-md">
        <div className="mb-8 text-center">
          <Tatu size={88} mood="idle" className="tatu-brand tatu-auth mx-auto mb-3" />
          <h1 className="font-display text-3xl text-zinc-50">Academy Labs</h1>
          <p className="mt-1 text-sm text-zinc-500">Definir nova senha</p>
        </div>

        <div className="auth-enter surface-card p-6 sm:p-8">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form className="space-y-4" autoComplete="off" noValidate onSubmit={handleSubmit}>
            <PasswordField id="reset-senha" label="Nova senha" value={senha} onChange={setSenha} showChecklist />
            <PasswordField
              id="reset-senha-confirm"
              label="Confirmar nova senha"
              value={senhaConfirm}
              onChange={setSenhaConfirm}
            />

            <button type="submit" disabled={loading} className="btn-gold w-full disabled:opacity-60">
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" /> Aguarde...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-key" /> Redefinir senha
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
