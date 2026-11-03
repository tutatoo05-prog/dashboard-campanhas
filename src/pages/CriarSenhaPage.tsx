import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { consultarCriarSenha, pedirNovoLink } from '@/services/novoLinkService.ts'
import { AuthBackdrop } from '@/components/auth/AuthBackdrop.tsx'
import { Tatu } from '@/components/mascot/Tatu.tsx'

type Tela =
  | { tipo: 'carregando' }
  | { tipo: 'ativo'; url: string }
  | { tipo: 'vencido'; t?: string }
  | { tipo: 'invalido' }
  | { tipo: 'erro'; mensagem: string }

/**
 * Destino do botão "Criar minha senha" do e-mail de boas-vindas. Enquanto o link da plataforma vale (30 min), manda a pessoa
 * direto para a criação da senha; depois disso mostra que o link não está mais ativo e oferece receber outro por e-mail.
 * O novo envio só acontece no CLIQUE (nunca ao abrir), para programas que "visitam" links de e-mail não dispararem nada.
 */
export default function CriarSenhaPage() {
  const [params] = useSearchParams()
  const codigo = params.get('c') ?? ''
  const [tela, setTela] = useState<Tela>(codigo ? { tipo: 'carregando' } : { tipo: 'invalido' })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviadoPara, setEnviadoPara] = useState('')

  // quem chega aqui é aluno, não usuário do dash: a aba não pode dizer "Academy Labs"
  useEffect(() => {
    document.title = 'Criar senha — Tuzinho Academy'
  }, [])

  useEffect(() => {
    if (!codigo) return
    let cancelado = false
    consultarCriarSenha(codigo)
      .then((resultado) => {
        if (cancelado) return
        if (resultado.estado === 'ativo') {
          setTela({ tipo: 'ativo', url: resultado.url })
          window.location.replace(resultado.url)
        } else if (resultado.estado === 'vencido') setTela({ tipo: 'vencido', t: resultado.t })
        else setTela({ tipo: 'invalido' })
      })
      .catch((e) => {
        if (!cancelado) setTela({ tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Não conseguimos abrir agora. Tente de novo em alguns minutos.' })
      })
    return () => {
      cancelado = true
    }
  }, [codigo])

  async function novoEnvio(t: string) {
    setErro('')
    setEnviando(true)
    try {
      const resposta = await pedirNovoLink(t)
      setEnviadoPara(resposta.email)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não conseguimos enviar agora. Tente de novo em alguns minutos.')
    } finally {
      setEnviando(false)
    }
  }

  const aviso = 'rounded-lg border px-4 py-3 text-sm'

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
          {tela.tipo === 'carregando' && (
            <p className="text-center text-sm text-zinc-300" role="status">
              <i className="fa-solid fa-spinner fa-spin mr-2" /> Abrindo a criação da sua senha...
            </p>
          )}

          {tela.tipo === 'ativo' && (
            <p className="text-center text-sm text-zinc-300" role="status">
              Abrindo a criação da sua senha. Se não abrir sozinho,{' '}
              <a href={tela.url} className="font-semibold text-gold underline">
                clique aqui
              </a>
              .
            </p>
          )}

          {tela.tipo === 'vencido' && !enviadoPara && (
            <div className="space-y-4">
              <div className={`${aviso} border-amber-500/25 bg-amber-500/8 text-amber-200`}>
                <b className="block">Este link não está mais ativo</b>
                Por segurança, o link para criar a senha só é válido por 30 minutos e funciona uma única vez.
              </div>
              {erro && (
                <div className={`${aviso} border-red-500/25 bg-red-500/8 text-red-300`} role="alert">
                  {erro}
                </div>
              )}
              {tela.t ? (
                <>
                  <p className="text-sm text-zinc-300">Sem problema: clique abaixo e enviamos um novo link para o e-mail da sua compra.</p>
                  <button type="button" disabled={enviando} className="btn-gold w-full disabled:opacity-60" onClick={() => void novoEnvio(tela.t as string)}>
                    {enviando ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin" /> Aguarde...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-paper-plane" /> Receber um novo link
                      </>
                    )}
                  </button>
                </>
              ) : (
                <p className="text-sm text-zinc-300">Na tela de entrada da plataforma, use “Esqueci minha senha” para receber um novo link.</p>
              )}
            </div>
          )}

          {tela.tipo === 'vencido' && enviadoPara && (
            <div className="space-y-4">
              <div className={`${aviso} border-green-500/25 bg-green-500/8 text-green-300`} role="status">
                Pronto! Enviamos um novo link para <b>{enviadoPara}</b>. Abra o e-mail e use o botão “Criar minha senha” (olhe também o spam).
              </div>
              <p className="text-xs text-zinc-500">O link novo também é válido por 30 minutos e funciona uma única vez. Se o e-mail não chegar em alguns minutos, você pode pedir de novo.</p>
            </div>
          )}

          {tela.tipo === 'invalido' && (
            <div className={`${aviso} border-red-500/25 bg-red-500/8 text-red-300`}>
              Este link está incompleto ou não é válido. Abra o botão direto pelo e-mail de boas-vindas ou, na tela de entrada da plataforma, use “Esqueci minha senha”.
            </div>
          )}

          {tela.tipo === 'erro' && (
            <div className={`${aviso} border-red-500/25 bg-red-500/8 text-red-300`} role="alert">
              {tela.mensagem}
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
