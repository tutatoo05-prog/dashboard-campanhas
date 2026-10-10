import { useEffect, useRef, useState, type ReactNode } from 'react'

interface MenuProps {
  /** Conteúdo do botão que abre o menu. */
  trigger: ReactNode
  title?: string
  ariaLabel: string
  align?: 'left' | 'right'
  className?: string
  /** Recebe `close` para fechar depois de escolher. */
  children: (close: () => void) => ReactNode
}

/** Menu suspenso simples: abre no clique, fecha com Esc, clique fora ou ao escolher. */
export function Menu({ trigger, title, ariaLabel, align = 'left', className = '', children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`menu ${className}`} ref={ref}>
      <button
        type="button"
        className="menu-trigger"
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu-panel menu-${align}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
