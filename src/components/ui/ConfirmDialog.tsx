import { useEffect, useRef, useState } from 'react'

export interface ConfirmOptions {
  titulo: string
  texto?: string
  /** Rótulo do botão que confirma. */
  confirmar?: string
  cancelar?: string
  /** Ação destrutiva: botão vermelho e o foco começa em "Cancelar". */
  perigo?: boolean
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

let show: ((pending: Pending) => void) | null = null

/** Substitui o window.confirm: abre o diálogo do tema e resolve com true (confirmou) ou false. */
export function confirmar(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) {
      resolve(window.confirm([options.titulo, options.texto].filter(Boolean).join('\n\n')))
      return
    }
    show({ ...options, resolve })
  })
}

/** Montado uma vez, na raiz do app. */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    show = (next) => setPending((current) => {
      current?.resolve(false)
      return next
    })
    return () => {
      show = null
    }
  }, [])

  function close(ok: boolean) {
    pending?.resolve(ok)
    setPending(null)
  }

  useEffect(() => {
    if (!pending) return
    ;(pending.perigo ? cancelRef : okRef).current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        pending?.resolve(false)
        setPending(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  if (!pending) return null

  return (
    <div className="dialog-backdrop" style={{ zIndex: 90 }} onClick={() => close(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(event) => event.stopPropagation()}>
        <h3 className="dialog-title" id="confirm-title">
          {pending.titulo}
        </h3>
        {pending.texto && <p className="dialog-text" style={{ whiteSpace: 'pre-line' }}>{pending.texto}</p>}
        <div className="dialog-actions">
          <button type="button" className="chip-btn" ref={cancelRef} onClick={() => close(false)}>
            {pending.cancelar ?? 'Cancelar'}
          </button>
          <button type="button" className={pending.perigo ? 'btn-danger' : 'btn-gold'} ref={okRef} onClick={() => close(true)}>
            {pending.confirmar ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
