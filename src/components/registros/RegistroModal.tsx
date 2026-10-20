import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Purchase } from '@/types'
import { STATUS_ROTULO, type CategoriaEvento, type Passagem, type RegistroAgrupado } from '@/lib/mergeRegistros.ts'
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

const ICONE_PASSAGEM: Record<CategoriaEvento | 'lead', { icone: string; classe: string }> = {
  lead: { icone: 'fa-user-plus', classe: 'tl-lead' },
  venda: { icone: 'fa-circle-check', classe: 'tl-venda' },
  pix_boleto: { icone: 'fa-barcode', classe: 'tl-pix' },
  abandono: { icone: 'fa-cart-shopping', classe: 'tl-abandono' },
  cancelamento: { icone: 'fa-ban', classe: 'tl-cancela' },
  reembolso: { icone: 'fa-rotate-left', classe: 'tl-cancela' },
}

/**
 * Compra parcelada: cada parcela paga chega como uma "Compra aprovada" da mesma transação.
 * Sem este aviso, a 2ª, 3ª... parcela parece uma compra nova. Devolve passagem -> "parcela 2 de 4" (ou "parcelado em 4x").
 */
function rotulosDeParcela(passagens: Passagem[]): Map<Passagem, string> {
  const rotulos = new Map<Passagem, string>()
  const porTransacao = new Map<string, Passagem[]>()
  for (const passagem of passagens) {
    if (passagem.categoria !== 'venda' || !passagem.transacao) continue
    porTransacao.set(passagem.transacao, [...(porTransacao.get(passagem.transacao) ?? []), passagem])
  }
  for (const passagem of passagens) {
    const total = passagem.parcelas ?? 0
    if (total < 2 || (passagem.categoria !== 'venda' && passagem.categoria !== 'pix_boleto')) continue
    const pagas = passagem.categoria === 'venda' ? porTransacao.get(passagem.transacao ?? '') : undefined
    if (pagas && pagas.length > 1) {
      // A lista vem da mais recente para a mais antiga: a última da lista é a 1ª parcela.
      rotulos.set(passagem, `parcela ${pagas.length - pagas.indexOf(passagem)} de ${total}`)
    } else {
      rotulos.set(passagem, `parcelado em ${total}x`)
    }
  }
  return rotulos
}

function detalhesDaPassagem(passagem: Passagem, parcela?: string): string {
  const partes = [
    passagem.produto,
    typeof passagem.valor === 'number' ? formatCurrency(passagem.valor) : '',
    parcela,
    passagem.pagamento,
    passagem.situacao ? `situação: ${passagem.situacao}` : '',
  ]
  if (!passagem.categoria) partes.push(passagem.campanha || '', passagem.canal || '')
  return [...new Set(partes.filter(Boolean))].join(' · ')
}

function LinhaDoTempo({ passagens }: { passagens: Passagem[] }) {
  const parcelas = rotulosDeParcela(passagens)
  return (
    <ol className="tl">
      {passagens.map((passagem, indice) => {
        const estilo = ICONE_PASSAGEM[passagem.categoria ?? 'lead']
        const detalhe = detalhesDaPassagem(passagem, parcelas.get(passagem))
        return (
          <li key={`${passagem.planilha}-${passagem.aba}-${passagem.data}-${indice}`} className={`tl-item ${estilo.classe}`} style={{ animationDelay: `${Math.min(indice, 12) * 40}ms` }}>
            <span className="tl-ponto" aria-hidden="true">
              <i className={`fa-solid ${estilo.icone}`} />
            </span>
            <div className="tl-corpo">
              <p className="tl-titulo">
                {passagem.categoria ? passagem.evento || passagem.aba : `Entrou em ${passagem.aba}`}
                <small>{formatMoment(passagem.data)}</small>
              </p>
              <p className="tl-sub">{passagem.planilha}{detalhe ? ` · ${detalhe}` : ''}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
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
            <p className="section-label">Pessoa · {record.historico.length} {record.historico.length === 1 ? 'passagem' : 'passagens'}</p>
            <h3 id="registro-title" className="dialog-title">
              {record.nome || 'Sem nome'}
            </h3>
            <p className="sale-sub">
              {record.aparece.length} {record.aparece.length === 1 ? 'aba' : 'abas'} · {STATUS_ROTULO[record.status]}
            </p>
          </div>
          <div className="sale-head-side">
            <span className={`tl-status tl-status-${record.status === 'comprou' || bought.length ? 'comprou' : record.status}`}>
              {record.status === 'comprou' || bought.length ? 'Já comprou' : record.status === 'lead' ? 'Ainda não comprou' : STATUS_ROTULO[record.status]}
            </span>
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

        <section className="sale-section">
          <p className="sale-section-title">De onde veio</p>
          <div className="sale-grid">
            <Field label="Origem">{record.canal || '—'}</Field>
            <Field label="Campanha">{record.campanha || 'Sem campanha'}</Field>
            <Field label="Criativo">{record.criativo || '—'}</Field>
            <Field label="Primeiro contato">{formatMoment(record.primeiraEm)}</Field>
          </div>
        </section>

        <section className="sale-section">
          <p className="sale-section-title">Linha do tempo · tudo o que as planilhas têm desta pessoa</p>
          <div className="tl-resumo">
            <span><b>{record.historico.length}</b> {record.historico.length === 1 ? 'passagem' : 'passagens'}</span>
            <span><b>{record.aparece.length}</b> {record.aparece.length === 1 ? 'aba' : 'abas'}</span>
            {record.primeiraEm && <span>1º contato <b>{formatMoment(record.primeiraEm)}</b></span>}
            {record.ultimaEm && <span>último <b>{formatMoment(record.ultimaEm)}</b></span>}
          </div>
          {record.historico.length === 0 ? (
            <p className="sale-note">Ainda não achei esta pessoa nas planilhas nem nos eventos da Hotmart.</p>
          ) : (
            <LinhaDoTempo passagens={record.historico} />
          )}
        </section>

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
