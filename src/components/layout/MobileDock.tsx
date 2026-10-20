import { useEffect, useState } from 'react'
import { TopActions } from '@/components/layout/TopActions.tsx'

/** Botão flutuante (+ vira X) do celular com a busca, o tema, a Live e o tour. Some no computador (CSS). */
export function MobileDock() {
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!aberto) return
    function esc(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAberto(false)
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [aberto])

  return (
    <div className={`mdock ${aberto ? 'mdock-open' : ''}`}>
      {aberto && <div className="mdock-items">{<TopActions onPick={() => setAberto(false)} />}</div>}
      <button
        type="button"
        className="mdock-fab"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={aberto ? 'Fechar atalhos' : 'Abrir atalhos (buscar, tema, Live, ajuda)'}
      >
        <i className={`fa-solid ${aberto ? 'fa-xmark' : 'fa-plus'}`} />
      </button>
    </div>
  )
}
