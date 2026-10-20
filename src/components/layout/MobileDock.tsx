import { useCallback, useEffect, useRef, useState } from 'react'
import { TopActions } from '@/components/layout/TopActions.tsx'

type Fase = 'fechado' | 'aberto' | 'fechando'

/** Tempo da animação de descida: o menu só sai da tela depois dela. */
const FECHAR_EM_MS = 300

/** Botão flutuante (+ vira X) do celular com a busca, o tema, a privacidade, a Live e o tour. Some no computador (CSS). */
export function MobileDock() {
  const [fase, setFase] = useState<Fase>('fechado')
  const timer = useRef(0)

  const fechar = useCallback(() => {
    window.clearTimeout(timer.current)
    setFase('fechando')
    timer.current = window.setTimeout(() => setFase('fechado'), FECHAR_EM_MS)
  }, [])

  function alternar() {
    if (fase === 'aberto') {
      fechar()
      return
    }
    window.clearTimeout(timer.current)
    setFase('aberto')
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (fase !== 'aberto') return
    function esc(evento: KeyboardEvent) {
      if (evento.key === 'Escape') fechar()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [fase, fechar])

  const aberto = fase === 'aberto'

  return (
    <>
      {fase !== 'fechado' && <div className={`mdock-scrim mdock-scrim-${fase}`} onClick={fechar} aria-hidden="true" />}
      <div className={`mdock ${aberto ? 'mdock-open' : ''}`}>
        {fase !== 'fechado' && (
          <div className={`mdock-items mdock-items-${fase}`}>
            <TopActions onPick={fechar} />
          </div>
        )}
        <button
          type="button"
          className="mdock-fab"
          onClick={alternar}
          aria-expanded={aberto}
          aria-label={aberto ? 'Fechar atalhos' : 'Abrir atalhos (buscar, tema, privacidade, Live, ajuda)'}
        >
          <span className="mdock-ico" aria-hidden="true" />
        </button>
      </div>
    </>
  )
}
