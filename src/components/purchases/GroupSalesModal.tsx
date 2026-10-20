import { useEffect, useRef } from 'react'
import type { Purchase } from '@/types'
import { formatCurrency, formatNumber } from '@/lib/format.ts'
import { exportCsv } from '@/lib/csv.ts'

export type GroupKind = 'campanha' | 'curso' | 'evento'

interface GroupSalesModalProps {
  kind: GroupKind
  /** Nome da campanha ou do curso (já com "Sem identificação" quando vazio). */
  label: string
  /** Só as vendas deste grupo. */
  purchases: Purchase[]
  /** Texto pequeno acima do título (padrão: "Vendas por campanha/curso"). */
  eyebrow?: string
  onClose: () => void
  onOpenSale: (purchase: Purchase) => void
}

const UNIDENTIFIED = 'Sem identificação'

function timeOf(purchase: Purchase): number {
  const time = purchase.createdAt ? new Date(purchase.createdAt).getTime() : NaN
  return Number.isFinite(time) ? time : 0
}

/** Lista, em janela, das vendas de uma campanha ou de um curso (abre ao clicar nas listas "Vendas por ..."). */
export function GroupSalesModal({ kind, label, purchases, eyebrow, onClose, onOpenSale }: GroupSalesModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const sorted = [...purchases].sort((a, b) => timeOf(b) - timeOf(a))
  const revenue = sorted.reduce((sum, item) => sum + (typeof item.valor === 'number' ? item.valor : 0), 0)
  const canceled = sorted.filter((item) => item.status === 'cancelado').length
  const kindLabel = kind === 'campanha' ? 'Campanha' : 'Curso'
  const isEvent = kind === 'evento'

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog sale-dialog" role="dialog" aria-modal="true" aria-labelledby="group-title">
        <div className="sale-head">
          <div className="min-w-0">
            <p className="section-label">{eyebrow ?? `Vendas por ${kindLabel.toLowerCase()}`}</p>
            <h3 id="group-title" className="dialog-title">
              {label}
            </h3>
            <p className="sale-sub">
              {formatNumber(sorted.length)} {isEvent ? (sorted.length === 1 ? 'pessoa' : 'pessoas') : sorted.length === 1 ? 'venda' : 'vendas'}
              {revenue > 0 && <> · {formatCurrency(revenue)}</>}
              {canceled > 0 && <> · {formatNumber(canceled)} {canceled === 1 ? 'cancelada' : 'canceladas'}</>}
            </p>
          </div>
          <div className="sale-head-side">
            <button
              type="button"
              className="sale-chip-btn"
              onClick={() =>
                exportCsv(
                  `vendas-${kind}.csv`,
                  ['Nome', 'Email', 'Telefone', 'Curso', 'Campanha', 'Data', 'Valor', 'Status'],
                  sorted.map((item) => [
                    item.nome,
                    item.email,
                    item.telefone,
                    item.curso,
                    item.campanha,
                    item.data,
                    item.valor ?? '',
                    item.status === 'cancelado' ? 'Cancelado' : 'Ativo',
                  ]),
                )
              }
            >
              <i className="fa-solid fa-download" aria-hidden="true" />
              CSV
            </button>
            <button ref={closeRef} type="button" className="sale-close" onClick={onClose} aria-label="Fechar">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </div>

        <section className="sale-section">
          <p className="sale-note">
            {isEvent ? 'Clique numa pessoa para ver os dados e chamar no WhatsApp.' : 'Clique numa venda para ver os dados de quem comprou.'}
          </p>
          {sorted.length === 0 ? (
            <p className="sale-note">Nenhuma venda neste grupo.</p>
          ) : (
            <ul className="sale-list sale-scroll">
              {sorted.map((item, index) => {
                const other = isEvent
                  ? item.curso || 'Produto não informado'
                  : kind === 'campanha'
                    ? item.curso || 'Curso não informado'
                    : String(item.campanha ?? '').trim() || UNIDENTIFIED
                return (
                  <li key={item.id || `${item.email}-${index}`}>
                    <button type="button" className="sale-list-btn" onClick={() => onOpenSale(item)}>
                      <span className="sale-list-main">
                        <span data-sensivel>{item.nome || 'Comprador sem nome'}</span>
                        <small>
                          {other} · {item.data || '—'}
                        </small>
                      </span>
                      <span className="sale-list-side">
                        {item.badge ? (
                          <em className="sale-tag-bad">{item.badge}</em>
                        ) : (
                          item.status === 'cancelado' && <em className="sale-tag-bad">Cancelado</em>
                        )}
                        {typeof item.valor === 'number' ? formatCurrency(item.valor) : '—'}
                        <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="dialog-actions">
          <button type="button" className="btn-gold" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
