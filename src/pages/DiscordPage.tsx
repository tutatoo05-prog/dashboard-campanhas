import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AuthBackdrop } from '@/components/auth/AuthBackdrop.tsx'
import { Tatu } from '@/components/mascot/Tatu.tsx'
import { pedirLinkDiscord } from '@/services/clubeService.ts'

/**
 * Página PÚBLICA de resgate do Discord do clube. Quem é membro entra no servidor e ganha o cargo sem mexer nas
 * "Conexões" do Discord. A página lê só `?t=` (link do e-mail ou volta do Google), `?ok=` e `?erro=` (códigos curtos
 * devolvidos pelo servidor, nunca o motivo técnico). O `t` é apagado do endereço assim que é lido.
 */

const ERROS: Record<string, string> = {
  indisponivel: 'Esta função ainda não está disponível. Tente de novo mais tarde.',
  'link-expirado': 'Este link venceu ou não é mais válido. Comece de novo abaixo.',
  cancelado: 'Você cancelou no meio do caminho. Quando quiser, é só tentar de novo.',
  'nao-membro': 'Não encontramos uma assinatura ativa ligada a essa conta. Se você acabou de assinar, aguarde algumas horas (a lista de membros atualiza a cada poucas horas) e tente de novo.',
  'sem-canal': 'Essa conta do Google não tem um canal do YouTube. Entre com a conta que você usa para ser membro do canal.',
  'google-falhou': 'Não conseguimos concluir com o Google agora. Tente de novo em instantes. Se continuar, fale com o suporte.',
  'discord-falhou': 'Não conseguimos concluir com o Discord agora. Tente de novo em instantes. Se continuar, fale com o suporte.',
}

export default function DiscordPage() {
  const [params] = useSearchParams()
  const sucesso = params.get('ok') === '1'
  const codigoErro = params.get('erro') ?? ''
  const [token] = useState(() => params.get('t') ?? '')
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    document.title = 'Discord — Tuzinho Academy'
    // o link vem do e-mail: tira o código do endereço para não ficar no histórico nem ser copiado sem querer
    if (params.get('t')) window.history.replaceState({}, '', '/discord')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pedir(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setAviso('')
    setEnviando(true)
    try {
      setAviso(await pedirLinkDiscord(email.trim()))
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não conseguimos agora. Tente de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  const mensagemErro = codigoErro ? (ERROS[codigoErro] ?? 'Não conseguimos concluir agora. Tente de novo em instantes.') : ''

  return (
    <div className="auth-screen flex min-h-dvh w-full items-center justify-center p-4">
      <AuthBackdrop />

      <div className="auth-content w-full max-w-md">
        <div className="mb-8 text-center">
          <Tatu size={88} mood="idle" className="tatu-brand tatu-auth mx-auto mb-3" />
          <h1 className="font-display text-3xl text-zinc-50">Tuzinho Academy</h1>
          <p className="mt-1 text-sm text-zinc-500">Entrar no Discord do clube</p>
        </div>

        <div className="auth-enter surface-card space-y-5 p-6 sm:p-8">
          {sucesso ? (
            <div className="rounded-lg border border-green-500/25 bg-green-500/8 px-4 py-3 text-sm text-green-300" role="status">
              Pronto! Você já está no Discord da Tuzinho Academy com o seu cargo de membro. Abra o Discord para ver os canais.
            </div>
          ) : token ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-300">Confirmado! Agora é só entrar com a sua conta do Discord. Vamos colocar você no servidor e liberar o seu cargo.</p>
              <a href={`/api/clube/resgate/discord?t=${encodeURIComponent(token)}`} className="btn-gold block w-full text-center">
                <i className="fa-brands fa-discord" /> Entrar no Discord
              </a>
              <p className="text-xs text-zinc-500">Pedimos só o seu nome de usuário e a permissão de entrar no servidor. Nada de mensagens nem de amigos.</p>
            </div>
          ) : (
            <>
              {mensagemErro && (
                <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300" role="alert">
                  {mensagemErro}
                </div>
              )}

              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-zinc-100">Sou aluno da Essentials</h2>
                <form onSubmit={(e) => void pedir(e)} className="space-y-3">
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="O e-mail da sua compra"
                    className="filter-select w-full"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label="E-mail da compra"
                  />
                  <button type="submit" disabled={enviando || !email.trim()} className="btn-gold w-full disabled:opacity-60">
                    {enviando ? 'Enviando...' : 'Receber o link no e-mail'}
                  </button>
                </form>
                {aviso && <p className="rounded-lg border border-green-500/25 bg-green-500/8 px-4 py-3 text-sm text-green-300" role="status">{aviso}</p>}
                {erro && <p className="rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300" role="alert">{erro}</p>}
                <p className="text-xs text-zinc-500">Por segurança, mandamos um link para o seu e-mail: só quem tem acesso a ele consegue continuar.</p>
              </section>

              <div className="border-t border-zinc-700/40" />

              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-zinc-100">Sou membro do canal no YouTube</h2>
                <a href="/api/clube/resgate/google" className="btn-gold block w-full text-center">
                  <i className="fa-brands fa-youtube" /> Entrar com o Google
                </a>
                <p className="text-xs text-zinc-500">Usamos a sua conta do Google só para confirmar qual é o seu canal. Não guardamos a sua senha nem acessamos o seu e-mail.</p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
