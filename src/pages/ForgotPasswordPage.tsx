import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { consultarPedidoDeSenha, forgotPassword } from '@/services/authService.ts'
import { AuthBackdrop } from '@/components/auth/AuthBackdrop.tsx'
import { Tatu } from '@/components/mascot/Tatu.tsx'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [pedido, setPedido] = useState('')
  const navigate = useNavigate()

  // Com o pedido enviado, pergunta a cada 3 s se a equipe já liberou (ou negou) pelo Telegram.
  useEffect(() => {
    if (!pedido) return
    let ativo = true
    let falhas = 0
    const verificar = async () => {
      try {
        const r = await consultarPedidoDeSenha(pedido)
        if (!ativo) return
        falhas = 0
        if (r.estado === 'liberado') {
          navigate(`/reset-password?token=${r.token}`, { replace: true })
          return
        }
        if (r.estado !== 'aguardando') {
          setPedido('')
          setMessage('')
          setError(
            r.estado === 'negado'
              ? 'A equipe negou o pedido. Fale com um administrador.'
              : 'O pedido venceu sem ser liberado. Peça de novo e avise a equipe.',
          )
          return
        }
      } catch {
        falhas += 1
        if (falhas >= 5 && ativo) {
          setPedido('')
          setMessage('')
          setError('Perdi a conexão com o servidor. Tente pedir de novo.')
          return
        }
      }
      if (ativo) timer = window.setTimeout(verificar, 3000)
    }
    let timer = window.setTimeout(verificar, 3000)
    return () => {
      ativo = false
      window.clearTimeout(timer)
    }
  }, [pedido, navigate])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const result = await forgotPassword(email.trim())
      setMessage(result.message ?? '')
      setPedido(result.pedido ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen flex min-h-dvh w-full items-center justify-center p-4">
      <AuthBackdrop />

      <div className="auth-content w-full max-w-md">
        <div className="mb-8 text-center">
          <Tatu size={88} mood="idle" className="tatu-brand tatu-auth mx-auto mb-3" />
          <h1 className="font-display text-3xl text-zinc-50">Academy Labs</h1>
          <p className="mt-1 text-sm text-zinc-500">Esqueci minha senha</p>
        </div>

        <div className="auth-enter surface-card p-6 sm:p-8">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-lg border border-green-500/25 bg-green-500/8 px-4 py-3 text-sm text-green-300">
              {message}
              {pedido && (
                <p className="mt-2 text-xs text-green-300/80">
                  <i className="fa-solid fa-spinner fa-spin mr-1" /> Aguardando um administrador liberar. Avise a equipe e deixe esta tela aberta.
                </p>
              )}
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
                    <i className="fa-solid fa-key" /> Pedir troca de senha
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
