import { useId, useState, type ReactNode } from 'react'

interface FilterToggleProps {
  /** Os selects (e campos de filtro) que ficam escondidos no celular. */
  children: ReactNode
  label?: string
  /** Resumo do que está filtrado hoje (ex.: "academy 01 · 7 dias"), mostrado no botão. */
  summary?: string
  /** Quantos filtros estão fora do padrão: aparece como um contador no botão. */
  activeCount?: number
  /** Botão só com o ícone (para caber ao lado de uma busca). */
  compact?: boolean
}

/**
 * Celular (abaixo de 768px): os filtros ficam atrás de um botão com ícone de filtro e abrem ao tocar.
 * Computador: o botão some e os filtros aparecem como sempre (o CSS usa `display: contents`, então os selects
 * continuam sendo filhos diretos da barra e o layout de lá não muda). Ver `.ftoggle-*` em mobile.css.
 * O botão e o painel são irmãos (sem elemento em volta) para encaixar em grade ou em linha flex.
 */
export function FilterToggle({ children, label = 'Filtros', summary, activeCount = 0, compact = false }: FilterToggleProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <>
      <button
        type="button"
        className={`ftoggle-btn${compact ? ' ftoggle-btn-compact' : ''}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <i className="fa-solid fa-filter" aria-hidden="true" />
        {!compact && <span className="ftoggle-label">{label}</span>}
        {!compact && summary && <span className="ftoggle-summary">{summary}</span>}
        {activeCount > 0 && <span className="ftoggle-badge">{activeCount}</span>}
        {!compact && <i className="fa-solid fa-chevron-down ftoggle-chev" aria-hidden="true" />}
      </button>
      <div id={panelId} className={`ftoggle-panel${open ? ' is-open' : ''}`}>
        {children}
      </div>
    </>
  )
}
