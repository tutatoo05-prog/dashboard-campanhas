import { useEffect } from 'react'
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/format.ts'

export interface CampaignSalesRow {
  campaignId: string
  name: string
  spend: number
  sales: number
  revenue: number
  revenueCount: number
}

interface CampaignSalesModalProps {
  row: CampaignSalesRow
  onClose: () => void
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="sale-field">
      <span className="sale-field-label">{label}</span>
      <span className="sale-field-value">{value}</span>
      {hint && <span className="sale-note">{hint}</span>}
    </div>
  )
}

/** Cartão de detalhes de uma campanha em "Vendas & ROI": o retorno em destaque e todos os números. */
export function CampaignSalesModal({ row, onClose }: CampaignSalesModalProps) {
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

  const costPerSale = row.sales > 0 ? row.spend / row.sales : null
  const roi = row.revenueCount > 0 && row.spend > 0 ? row.revenue / row.spend : null
  const ticket = row.revenueCount > 0 ? row.revenue / row.revenueCount : null
  const profit = row.revenueCount > 0 ? row.revenue - row.spend : null
  const tone = roi == null ? 'neutral' : roi >= 1 ? 'good' : 'bad'

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog sale-dialog" role="dialog" aria-modal="true" aria-labelledby="sales-title">
        <div className="sale-head">
          <div className="min-w-0">
            <p className="section-label">Vendas &amp; ROI</p>
            <h3 id="sales-title" className="dialog-title">
              {row.name}
            </h3>
          </div>
          <div className="sale-head-side">
            <button type="button" className="sale-close" onClick={onClose} aria-label="Fechar">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={`roi-hero roi-hero-${tone}`}>
          <span className="roi-hero-label">Retorno sobre o investimento</span>
          <strong className="roi-hero-value">{roi != null ? `${formatDecimal(roi)}x` : '—'}</strong>
          <span className="roi-hero-text">
            {roi != null
              ? `Para cada R$ 1 investido, voltaram ${formatCurrency(roi)}.`
              : row.sales > 0
                ? 'As vendas não têm valor registrado, então o retorno não pode ser calculado.'
                : 'Esta campanha ainda não tem vendas registradas.'}
          </span>
        </div>

        <section className="sale-section">
          <p className="sale-section-title">Números</p>
          <div className="sale-grid">
            <Stat label="Gasto no período" value={formatCurrency(row.spend)} />
            <Stat label="Vendas (histórico)" value={formatNumber(row.sales)} />
            <Stat label="Receita" value={row.revenueCount > 0 ? formatCurrency(row.revenue) : '—'} />
            <Stat label="Custo por venda" value={costPerSale != null ? formatCurrency(costPerSale) : '—'} />
            <Stat label="Ticket médio" value={ticket != null ? formatCurrency(ticket) : '—'} />
            <Stat
              label="Resultado"
              value={profit != null ? formatCurrency(profit) : '—'}
              hint={profit != null ? (profit >= 0 ? 'Receita acima do gasto do período.' : 'Receita abaixo do gasto do período.') : undefined}
            />
          </div>
        </section>

        <p className="sale-note" style={{ marginTop: '1rem' }}>
          As vendas vêm de Compras, ligadas pelo nome da campanha, e contam todo o histórico. O gasto é só o do período
          selecionado, então o retorno é uma leitura aproximada.
        </p>

        <div className="dialog-actions">
          <button type="button" className="ac-btn ac-prim" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
