import { useEffect, useMemo, useRef, useState } from 'react'
import type { RegistroAgrupado } from '@/lib/mergeRegistros.ts'
import { formatCurrency, formatNumber } from '@/lib/format.ts'
import { exportCsv } from '@/lib/csv.ts'

export type RegistroGroupKind = 'origem' | 'campanha'

interface RegistrosGroupModalProps {
  kind: RegistroGroupKind
  /** Nome da origem ou da campanha. */
  label: string
  /** Texto pequeno que diz o escopo (ex.: "Aba Essentials" ou "Todas as abas"). */
  scope: string
  /** Só os registros deste grupo, com quem aparece em várias planilhas já junto. */
  records: RegistroAgrupado[]
  /** Linhas nas planilhas antes de juntar (o número que a barra clicada mostra). */
  totalRegistros: number
  onClose: () => void
  onOpenRecord: (record: RegistroAgrupado) => void
}

const PAGE = 150

function timeOf(record: RegistroAgrupado): number {
  const time = record.data ? new Date(record.data).getTime() : NaN
  return Number.isFinite(time) ? time : 0
}

function shortDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Lista, em janela, dos registros de uma origem ou de uma campanha (abre ao clicar nas listas de "Registros"). */
export function RegistrosGroupModal({ kind, label, scope, records, totalRegistros, onClose, onOpenRecord }: RegistrosGroupModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState(PAGE)

  const sorted = useMemo(() => [...records].sort((a, b) => timeOf(b) - timeOf(a)), [records])
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sorted
    return sorted.filter((record) =>
      [record.nome, record.email, record.telefone, record.campanha, record.criativo]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term)),
    )
  }, [sorted, search])

  const people = useMemo(
    () => new Set(records.map((record) => record.email || record.telefone.replace(/\D/g, '') || record.nome.toLowerCase()).filter(Boolean)).size,
    [records],
  )

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
      <div className="dialog sale-dialog" role="dialog" aria-modal="true" aria-labelledby="registros-group-title">
        <div className="sale-head">
          <div className="min-w-0">
            <p className="section-label">{kind === 'origem' ? 'Origem do lead' : 'Campanha'}</p>
            <h3 id="registros-group-title" className="dialog-title">
              {label}
            </h3>
            <p className="sale-sub">
              {formatNumber(totalRegistros)} {totalRegistros === 1 ? 'registro' : 'registros'}
              {' · '}
              {formatNumber(people)} {people === 1 ? 'pessoa' : 'pessoas'}
              {' · '}
              {scope}
            </p>
          </div>
          <div className="sale-head-side">
            <button
              type="button"
              className="sale-chip-btn"
              onClick={() =>
                exportCsv(
                  `registros-${kind}.csv`,
                  ['Planilha', 'Aba', 'Aparece em', 'Nome', 'Email', 'Telefone', 'Data', 'Origem', 'Campanha', 'Criativo', 'Evento', 'Situação', 'Produto', 'Valor', 'Pagamento'],
                  filtered.map((record) => [
                    record.planilha,
                    record.aba,
                    record.aparece.map((item) => `${item.aba} (${item.planilha})`).join(' · '),
                    record.nome,
                    record.email,
                    record.telefone,
                    shortDate(record.data),
                    record.canal,
                    record.campanha,
                    record.criativo,
                    record.evento ?? '',
                    record.situacao ?? '',
                    record.produto ?? '',
                    record.valor ?? '',
                    record.pagamento ?? '',
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
          <p className="sale-note">Clique numa pessoa para ver os dados e chamar no WhatsApp.</p>
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setVisible(PAGE)
            }}
            placeholder="Buscar nesta lista..."
            className="mb-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
          />
          {filtered.length === 0 ? (
            <p className="sale-note">Nenhum registro encontrado.</p>
          ) : (
            <ul className="sale-list sale-scroll">
              {filtered.slice(0, visible).map((record, index) => (
                <li key={`${record.planilha}-${record.aba}-${index}`}>
                  <button type="button" className="sale-list-btn" onClick={() => onOpenRecord(record)}>
                    <span className="sale-list-main">
                      {record.nome || record.email || record.telefone || 'Sem nome'}
                      <small>
                        {[kind === 'origem' ? record.campanha || 'Sem campanha' : record.canal, record.aba].filter(Boolean).join(' · ')} · {shortDate(record.data)}
                        {record.aparece.length > 1 && <> · em {record.aparece.length} planilhas</>}
                      </small>
                    </span>
                    <span className="sale-list-side">
                      {typeof record.valor === 'number' ? formatCurrency(record.valor) : record.email || record.telefone || '—'}
                      <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {filtered.length > visible && (
            <button type="button" className="sale-chip-btn mt-2" onClick={() => setVisible((current) => current + PAGE)}>
              Mostrar mais ({formatNumber(filtered.length - visible)} restantes)
            </button>
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
