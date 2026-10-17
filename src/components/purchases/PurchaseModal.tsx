import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Lead, Purchase } from '@/types'
import { formatCurrency } from '@/lib/format.ts'
import { originLabel } from '@/lib/leadOrigins.ts'
import { daysBetween, findBuyerLeads, findOtherPurchases, whatsappLink } from '@/lib/buyerLeads.ts'
import { PessoaModal } from '@/components/registros/PessoaModal.tsx'

interface PurchaseModalProps {
  purchase: Purchase
  /** Todas as vendas carregadas (para achar as outras compras da mesma pessoa). */
  purchases: Purchase[]
  /** Leads do site; `undefined` enquanto carrega. */
  leads: Lead[] | undefined
  leadsError: boolean
  onClose: () => void
  onSelect: (purchase: Purchase) => void
  /** Texto do botão de baixo (ex.: "Voltar à lista" quando a venda foi aberta de dentro de uma lista). */
  closeLabel?: string
}

const UNIDENTIFIED = 'Sem identificação'

const PAYMENT_LABELS: Record<string, string> = {
  PIX: 'Pix',
  PIX_AUTOMATIC: 'Pix automático',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  BILLET: 'Boleto',
  PAYPAL: 'PayPal',
  HOTPAY: 'Hotpay',
}

function paymentLabel(value?: string | null): string {
  if (!value) return '—'
  return PAYMENT_LABELS[value.toUpperCase()] ?? value
}

function formatMoment(iso?: string, fallback = '—'): string {
  if (!iso) return fallback
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sale-field">
      <span className="sale-field-label">{label}</span>
      <span className="sale-field-value">{children}</span>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Sem permissão para a área de transferência: o texto continua selecionável na tela.
    }
  }

  return (
    <button type="button" className="sale-chip-btn" onClick={copy} aria-label={`Copiar ${label}`}>
      <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} aria-hidden="true" />
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

/** Janela com tudo da venda e de quem comprou (abre ao clicar numa linha de "Todas as vendas"). */
export function PurchaseModal({
  purchase,
  purchases,
  leads,
  leadsError,
  onClose,
  onSelect,
  closeLabel = 'Fechar',
}: PurchaseModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [verPessoa, setVerPessoa] = useState(false)
  const canceled = purchase.status === 'cancelado'
  const whatsapp = whatsappLink(purchase.telefone)
  const buyerLeads = leads ? findBuyerLeads(purchase, leads) : []
  const others = findOtherPurchases(purchase, purchases)
  const firstLead = buyerLeads[0]
  const daysFromFirstLead = daysBetween(firstLead?.created_at, purchase.createdAt)
  const campaign = String(purchase.campanha ?? '').trim() || UNIDENTIFIED

  useEffect(() => {
    closeRef.current?.focus()
  }, [purchase])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !verPessoa) onClose()
    }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, verPessoa])

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog sale-dialog" role="dialog" aria-modal="true" aria-labelledby="sale-title">
        <div className="sale-head">
          <div className="min-w-0">
            <p className="section-label">{purchase.evento ?? 'Venda'}</p>
            <h3 id="sale-title" className="dialog-title">
              {purchase.nome || 'Comprador sem nome'}
            </h3>
            <p className="sale-sub">
              {purchase.curso || 'Curso não informado'}
              {typeof purchase.valor === 'number' && <> · {formatCurrency(purchase.valor)}</>}
            </p>
          </div>
          <div className="sale-head-side">
            {purchase.evento ? (
              purchase.badge && (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-200">
                  {purchase.badge}
                </span>
              )
            ) : canceled ? (
              <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300">
                Cancelado
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                Ativo
              </span>
            )}
            <button ref={closeRef} type="button" className="sale-close" onClick={onClose} aria-label="Fechar">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </div>

        <section className="sale-section">
          <p className="sale-section-title">Quem comprou</p>
          <div className="sale-grid">
            <Field label="E-mail">
              {purchase.email || '—'}
              {purchase.email && (
                <span className="sale-actions">
                  <CopyButton value={purchase.email} label="e-mail" />
                  <a className="sale-chip-btn" href={`mailto:${purchase.email}`}>
                    <i className="fa-solid fa-envelope" aria-hidden="true" />
                    Escrever
                  </a>
                </span>
              )}
            </Field>
            <Field label="Telefone">
              {purchase.telefone || '—'}
              {purchase.telefone && (
                <span className="sale-actions">
                  <CopyButton value={purchase.telefone} label="telefone" />
                  {whatsapp && (
                    <a className="sale-chip-btn" href={whatsapp} target="_blank" rel="noreferrer">
                      <i className="fa-brands fa-whatsapp" aria-hidden="true" />
                      WhatsApp
                    </a>
                  )}
                </span>
              )}
            </Field>
          </div>
        </section>

        <section className="sale-section">
          <p className="sale-section-title">A venda</p>
          <div className="sale-grid">
            <Field label="Curso">{purchase.curso || '—'}</Field>
            <Field label="Valor">
              {typeof purchase.valor === 'number' ? formatCurrency(purchase.valor) : 'Sem valor registrado'}
            </Field>
            <Field label="Data da venda">{formatMoment(purchase.createdAt, purchase.data || '—')}</Field>
            <Field label="Origem da venda">{campaign}</Field>
            <Field label="Forma de pagamento">{paymentLabel(purchase.pagamentoTipo)}</Field>
            {!purchase.evento && (
              <>
                <Field label="Acesso">
                  {String(purchase.liberacao ?? '').trim().toLowerCase() === 'sim' ? 'Liberado' : purchase.liberacao || '—'}
                </Field>
                <Field label="Código do assinante">{purchase.subscriberCode || '—'}</Field>
              </>
            )}
            {(purchase.src || purchase.xcod) && (
              <Field label="Rastreio do checkout (Hotmart)">
                {[purchase.src, purchase.xcod].filter(Boolean).join(' · ')}
              </Field>
            )}
            {canceled && <Field label="Cancelada em">{formatMoment(purchase.canceledAt ?? undefined)}</Field>}
          </div>
        </section>

        <section className="sale-section">
          <p className="sale-section-title">Antes de comprar (cadastros no site)</p>
          {leadsError && <p className="sale-note">Não consegui carregar os cadastros do site agora.</p>}
          {!leadsError && !leads && <p className="sale-note">Procurando os cadastros desta pessoa...</p>}
          {!leadsError && leads && buyerLeads.length === 0 && (
            <p className="sale-note">
              Não achei cadastro com este e-mail ou telefone nos formulários do site. Pode ter comprado
              direto, sem passar por um formulário, ou com outro e-mail.
            </p>
          )}
          {buyerLeads.length > 0 && (
            <>
              {daysFromFirstLead != null && (
                <p className="sale-note">
                  Primeiro cadastro em {formatMoment(firstLead.created_at)}
                  {daysFromFirstLead === 0
                    ? ' — comprou no mesmo dia.'
                    : ` — comprou ${daysFromFirstLead} ${daysFromFirstLead === 1 ? 'dia' : 'dias'} depois.`}
                </p>
              )}
              <ul className="sale-list">
                {buyerLeads.map((lead, index) => (
                  <li key={`${lead.created_at}-${index}`}>
                    <span className="sale-list-main">
                      {originLabel(lead.origem)}
                      <small>{lead.campanha ? `Campanha: ${lead.campanha}` : 'Sem campanha'}</small>
                    </span>
                    <span className="sale-list-side">
                      {[lead.veio_de, lead.midia].filter(Boolean).join(' · ') || 'sem fonte'}
                      <small>{formatMoment(lead.created_at, lead.data || '—')}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {others.length > 0 && (
          <section className="sale-section">
            <p className="sale-section-title">Outras compras desta pessoa</p>
            <ul className="sale-list">
              {others.map((other, index) => (
                <li key={`${other.id}-${index}`}>
                  <button type="button" className="sale-list-btn" onClick={() => onSelect(other)}>
                    <span className="sale-list-main">
                      {other.curso || 'Curso não informado'}
                      <small>{other.data || '—'}</small>
                    </span>
                    <span className="sale-list-side">
                      {typeof other.valor === 'number' ? formatCurrency(other.valor) : '—'}
                      <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(purchase.email || purchase.telefone) && (
          <section className="sale-section">
            <button type="button" className="sale-chip-btn" onClick={() => setVerPessoa(true)}>
              <i className="fa-solid fa-timeline" aria-hidden="true" />
              Ver a linha do tempo desta pessoa
            </button>
          </section>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn-gold" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>

      {verPessoa && (
        <PessoaModal nome={purchase.nome} email={purchase.email} telefone={purchase.telefone} closeLabel="Voltar à venda" onClose={() => setVerPessoa(false)} />
      )}
    </div>
  )
}
