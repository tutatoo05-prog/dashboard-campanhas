import { confirmar } from '@/components/ui/ConfirmDialog.tsx'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LiveError, fetchLiveStatus, turnLiveOff, turnLiveOn } from '@/services/liveService.ts'
import type { LiveStatus } from '@/types'

const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : ''

/** Botão da Live no topo: liga/desliga e define o encerramento sem entrar na tela de Live. */
export function LiveQuick() {
  const queryClient = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const [offAt, setOffAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const raiz = useRef<HTMLDivElement>(null)

  const live = useQuery({ queryKey: ['live'], queryFn: fetchLiveStatus, refetchInterval: 20_000, retry: false })
  const status = live.data
  const ligada = status?.real?.on ?? null
  const podeEditar = Boolean(status?.canEdit && status.configured)

  useEffect(() => {
    if (!aberto) return
    function fora(evento: MouseEvent) {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) setAberto(false)
    }
    function esc(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  async function executar(tarefa: () => Promise<LiveStatus>) {
    setBusy(true)
    setErro('')
    try {
      queryClient.setQueryData(['live'], await tarefa())
      setOffAt('')
    } catch (e) {
      if (e instanceof LiveError && e.status) queryClient.setQueryData(['live'], e.status)
      const mensagem = (e as Error).message
      setErro(mensagem === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Entre de novo.' : mensagem)
    } finally {
      setBusy(false)
    }
  }

  async function alternar() {
    if (!status) return
    if (ligada) {
      if (!(await confirmar({ titulo: 'Desabilitar a página de Live agora?', confirmar: 'Desabilitar', perigo: true }))) return
      void executar(turnLiveOff)
      return
    }
    const limite = offAt ? `até ${offAt}` : `por até ${status.maxHours} h (depois desabilita sozinha)`
    const ok = await confirmar({
      titulo: 'Habilitar a página de Live?',
      texto: `tuzinho.academy/produtos/essentials/ vai mostrar a Live ${limite}.`,
      confirmar: 'Habilitar',
    })
    if (!ok) return
    void executar(() => turnLiveOn(offAt))
  }

  async function salvarHorario() {
    if (!offAt || !(await confirmar({ titulo: `Mudar o horário de desabilitar para ${offAt}?`, confirmar: 'Mudar horário' }))) return
    void executar(() => turnLiveOn(offAt))
  }

  return (
    <div className="lq" ref={raiz}>
      <button
        type="button"
        className={`topbar-icon-btn lq-btn ${ligada ? 'lq-on' : ''}`}
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={ligada ? 'Live habilitada. Abrir controles da Live' : 'Live desabilitada. Abrir controles da Live'}
        title="Live"
      >
        <i className="fa-solid fa-tower-broadcast" />
        {ligada !== null && <span className="lq-dot" aria-hidden="true" />}
      </button>

      {aberto && (
        <div className="dd lq-pop" role="dialog" aria-label="Controles da Live">
          <div className="lq-head">
            <b>Página de Live</b>
            <span className={`ac-chip ${ligada ? 'ac-ok' : ''}`}>{ligada === null ? 'Sem leitura' : ligada ? 'Habilitada' : 'Desabilitada'}</span>
          </div>

          {live.isLoading && <p className="ac-help">Verificando...</p>}
          {live.isError && <p className="dd-err">{(live.error as Error).message || 'Não consegui ler a Live.'}</p>}
          {status && !status.configured && <p className="dd-err">Live não configurada no servidor.</p>}

          {status && (
            <>
              <div className="dd-row dd-pref">
                <i className="fa-solid fa-power-off" />
                {ligada ? 'Desabilitar' : 'Habilitar'}
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(ligada)}
                  aria-label={ligada ? 'Desabilitar página de Live' : 'Habilitar página de Live'}
                  className="ac-sw dd-sw"
                  disabled={!podeEditar || ligada === null || busy}
                  onClick={alternar}
                />
              </div>

              {ligada && status.desired?.until && <p className="lq-info">Desabilita sozinha às {hora(status.desired.until)}.</p>}

              {status.canEdit && (
                <label className="lq-field">
                  <span>{ligada ? 'Mudar horário de desabilitar' : 'Desabilitar sozinha às (opcional)'}</span>
                  <span className="lq-time">
                    <input type="time" className="ac-in" value={offAt} onChange={(evento) => setOffAt(evento.target.value)} disabled={!podeEditar || busy} />
                    {ligada && (
                      <button type="button" className="ac-btn ac-prim" disabled={!podeEditar || !offAt || busy} onClick={salvarHorario}>
                        Salvar
                      </button>
                    )}
                  </span>
                  <small>{ligada ? `Máximo de ${status.maxHours} h a partir de agora.` : `Em branco: desabilita sozinha em ${status.maxHours} h.`}</small>
                </label>
              )}

              {!status.canEdit && <p className="lq-info">Modo leitura: só administradores alteram a Live.</p>}
              {erro && <p className="dd-err">{erro}</p>}
              <Link className="dd-row lq-link" to="/live" onClick={() => setAberto(false)}>
                <i className="fa-solid fa-arrow-up-right-from-square" />
                Abrir a tela de Live
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
