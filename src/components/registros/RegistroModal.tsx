import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Purchase } from '@/types'
import type { RegistroAgrupado } from '@/lib/mergeRegistros.ts'
import { formatCurrency } from '@/lib/format.ts'
import { whatsappLink } from '@/lib/buyerLeads.ts'

interface RegistroModalProps {
  record: RegistroAgrupado
  /** Compras carregadas (para mostrar se esta pessoa já comprou); `undefined` enquanto carrega. */
  purchases: Purchase[] | undefined
  onClose: () => void
  /** Texto do botão de baixo (ex.: "Voltar à lista" quando o registro foi aberto de dentro de uma lista). */
  closeLabel?: string
}

function digitsKey(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : ''
}

function formatMoment(iso?: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
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

/** Janela com tudo de um registro das planilhas (abre ao clicar numa pessoa da lista). */
export function RegistroModal({ record, purchases, onClose, closeLabel = 'Fechar' }: RegistroModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const whatsapp = whatsappLink(record.telefone)
  const isEvent = record.tipo === 'evento'

  const email = record.email.trim().toLowerCase()
  const phone = digitsKey(record.telefone)
  const bought = purchases
    ? purchases.filter(
        (purchase) =>
          (email && String(purchase.email ?? '').trim().toLowerCase() === email) ||
          (phone && digitsKey(purchase.telefone) === phone),
      )
    : []

  useEffect(() => {
    closeRef.current?.focus()
  }, [record])

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
      <div className="dialog sale-dialog" role="dialog" aria-modal="true" aria-labelledby="registro-title">
        <div className="sale-head">
          <div className="min-w-0">
            <p className="section-label">{isEvent ? record.evento || 'Evento da Hotmart' : 'Registro'}</p>
            <h3 id="registro-title" className="dialog-title">
              {record.nome || 'Sem nome'}
            </h3>
            <p className="sale-sub">
              {record.aba} · {record.planilha}
            </p>
          </div>
          <div className="sale-head-side">
            {purchases && (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                  bought.length
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-zinc-700 text-zinc-400'
                }`}
              >
                {bought.length ? 'Já comprou' : 'Ainda não comprou'}
              </span>
            )}
            <button ref={closeRef} type="button" className="sale-close" onClick={onClose} aria-label="Fechar">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </div>

        <section className="sale-section">
          <p className="sale-section-title">Contato</p>
          <div className="sale-grid">
            <Field label="E-mail">
              {record.email || '—'}
              {record.email && (
                <span className="sale-actions">
                  <CopyButton value={record.email} label="e-mail" />
                  <a className="sale-chip-btn" href={`mailto:${record.email}`}>
                    <i className="fa-solid fa-envelope" aria-hidden="true" />
                    Escrever
                  </a>
                </span>
              )}
            </Field>
            <Field label="Telefone">
              {record.telefone || '—'}
              {record.telefone && (
                <span className="sale-actions">
                  <CopyButton value={record.telefone} label="telefone" />
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

        {record.aparece.length > 1 && (
          <section className="sale-section">
            <p className="sale-section-title">Aparece em {record.aparece.length} planilhas</p>
            <ul className="sale-list">
              {record.aparece.map((item) => (
                <li key={`${item.planilha}-${item.aba}`}>
                  <span className="sale-list-main">
                    {item.aba}
                    <small>{item.planilha}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="sale-section">
          <p className="sale-section-title">De onde veio</p>
          <div className="sale-grid">
            <Field label="Origem">{record.canal || '—'}</Field>
            <Field label="Campanha">{record.campanha || 'Sem campanha'}</Field>
            <Field label="Criativo">{record.criativo || '—'}</Field>
            <Field label="Data">{formatMoment(record.data)}</Field>
          </div>
        </section>

        {isEvent && (
          <section className="sale-section">
            <p className="sale-section-title">O evento</p>
            <div className="sale-grid">
              <Field label="Evento">{record.evento || '—'}</Field>
              <Field label="Situação">{record.situacao || '—'}</Field>
              <Field label="Produto">{record.produto || '—'}</Field>
              <Field label="Valor">{typeof record.valor === 'number' ? formatCurrency(record.valor) : '—'}</Field>
              <Field label="Pagamento">{record.pagamento || '—'}</Field>
            </div>
          </section>
        )}

        <section className="sale-section">
          <p className="sale-section-title">Compras desta pessoa</p>
          {!purchases && <p className="sale-note">Procurando as compras...</p>}
          {purchases && bought.length === 0 && (
            <p className="sale-note">Não achei compra com este e-mail ou telefone.</p>
          )}
          {bought.length > 0 && (
            <ul className="sale-list">
              {bought.map((purchase, index) => (
                <li key={`${purchase.id}-${index}`}>
                  <span className="sale-list-main">
                    {purchase.curso || 'Curso não informado'}
                    <small>{purchase.data || '—'}</small>
                  </span>
                  <span className="sale-list-side">
                    {typeof purchase.valor === 'number' ? formatCurrency(purchase.valor) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="dialog-actions">
          <button type="button" className="btn-gold" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
