import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { pedirNovoLink } from '@/services/novoLinkService.ts'
import { AuthBackdrop } from '@/components/auth/AuthBackdrop.tsx'
import { Tatu } from '@/components/mascot/Tatu.tsx'

/**
 * Página pública do botão "Receber outro link" do e-mail de boas-vindas. O pedido só é feito no CLIQUE (nunca ao abrir a
 * página), para programas de leitura de e-mail que "visitam" os links não dispararem o envio sozinhos.
 */
export default function NovoLinkPage() {
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviadoPara, setEnviadoPara] = useState('')

  useEffect(() => {
    document.title = 'Novo link — Tuzinho Academy'
  }, [])

  async function enviar() {
    setErro('')
    setCarregando(true)
    try {
      const resposta = await pedirNovoLink(token)
      setEnviadoPara(resposta.email)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não conseguimos enviar agora. Tente de novo em alguns minutos.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="auth-screen flex min-h-dvh w-full items-center justify-center p-4">
      <AuthBackdrop />

      <div className="auth-content w-full max-w-md">
        <div className="mb-8 text-center">
          <Tatu size={88} mood="idle" className="tatu-brand tatu-auth mx-auto mb-3" />
          <h1 className="font-display text-3xl text-zinc-50">Tuzinho Academy</h1>
          <p className="mt-1 text-sm text-zinc-500">Criar a sua senha</p>
        </div>

        <div className="auth-enter surface-card p-6 sm:p-8">
          {!token ? (
            <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">
              Este link está incompleto. Abra o botão direto pelo e-mail de boas-vindas ou use “Esqueci minha senha” na tela de entrada da plataforma.
            </div>
          ) : enviadoPara ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-500/25 bg-green-500/8 px-4 py-3 text-sm text-green-300" role="status">
                Pronto! Enviamos um novo link para <b>{enviadoPara}</b>. Abra o e-mail e use o botão “Criar minha senha” (olhe também o spam).
              </div>
              <p className="text-xs text-zinc-500">O link novo vale por pouco tempo e só abre uma vez. Se o e-mail não chegar em alguns minutos, você pode pedir de novo.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-zinc-300">O link para criar a sua senha expirou? Sem problema: clique abaixo e enviamos um novo para o e-mail da sua compra.</p>
              {erro && (
                <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300" role="alert">
                  {erro}
                </div>
              )}
              <button type="button" disabled={carregando} className="btn-gold w-full disabled:opacity-60" onClick={() => void enviar()}>
                {carregando ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" /> Aguarde...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-paper-plane" /> Enviar um novo link
                  </>
                )}
              </button>
            </div>
          )}

          <p className="mt-6 text-center text-sm">
            <a href="https://tuzinho.academy/login" className="text-zinc-500 hover:text-zinc-300">
              <i className="fa-solid fa-arrow-left mr-1" /> Ir para a plataforma
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
