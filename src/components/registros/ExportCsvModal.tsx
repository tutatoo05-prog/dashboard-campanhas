import { useEffect, useState } from 'react'
import { apareceTexto, STATUS_ROTULO, type RegistroAgrupado } from '@/lib/mergeRegistros.ts'
import { formatNumber } from '@/lib/format.ts'
import { exportCsv } from '@/lib/csv.ts'

interface Coluna {
  id: string
  titulo: string
  valor: (record: RegistroAgrupado) => string | number | null | undefined
}

function formatDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

const COLUNAS: Coluna[] = [
  { id: 'planilha', titulo: 'Planilha', valor: (r) => r.planilha },
  { id: 'aba', titulo: 'Aba', valor: (r) => r.aba },
  { id: 'aparece', titulo: 'Aparece em', valor: (r) => apareceTexto(r) },
  { id: 'status', titulo: 'Situação comercial', valor: (r) => STATUS_ROTULO[r.status] },
  { id: 'nome', titulo: 'Nome', valor: (r) => r.nome },
  { id: 'email', titulo: 'Email', valor: (r) => r.email },
  { id: 'telefone', titulo: 'Telefone', valor: (r) => r.telefone },
  { id: 'data', titulo: 'Data', valor: (r) => formatDate(r.data) },
  { id: 'canal', titulo: 'Origem', valor: (r) => r.canal },
  { id: 'campanha', titulo: 'Campanha', valor: (r) => r.campanha },
  { id: 'criativo', titulo: 'Criativo', valor: (r) => r.criativo },
  { id: 'evento', titulo: 'Evento', valor: (r) => r.evento ?? '' },
  { id: 'situacao', titulo: 'Situação', valor: (r) => r.situacao ?? '' },
  { id: 'produto', titulo: 'Produto', valor: (r) => r.produto ?? '' },
  { id: 'valor', titulo: 'Valor', valor: (r) => r.valor ?? '' },
  { id: 'pagamento', titulo: 'Pagamento', valor: (r) => r.pagamento ?? '' },
]

const STORAGE_KEY = 'registros-csv-colunas'

function lerSalvas(): string[] {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY)
    const lista = bruto ? (JSON.parse(bruto) as unknown) : null
    if (Array.isArray(lista)) {
      const validas = COLUNAS.map((c) => c.id).filter((id) => lista.includes(id))
      if (validas.length) return validas
    }
  } catch {
    /* sem armazenamento: usa o padrão */
  }
  return COLUNAS.map((c) => c.id)
}

interface ExportCsvModalProps {
  filename: string
  records: RegistroAgrupado[]
  onClose: () => void
}

/** Janela para escolher quais colunas vão no CSV (a escolha fica lembrada neste navegador). */
export function ExportCsvModal({ filename, records, onClose }: ExportCsvModalProps) {
  const [marcadas, setMarcadas] = useState<string[]>(lerSalvas)

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

  function alternar(id: string) {
    setMarcadas((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]))
  }

  function baixar() {
    const escolhidas = COLUNAS.filter((c) => marcadas.includes(c.id))
    if (!escolhidas.length) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(escolhidas.map((c) => c.id)))
    } catch {
      /* ignora */
    }
    exportCsv(
      filename,
      escolhidas.map((c) => c.titulo),
      records.map((record) => escolhidas.map((c) => c.valor(record))),
    )
    onClose()
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog sale-dialog" role="dialog" aria-modal="true" aria-labelledby="export-csv-title">
        <div className="sale-head">
          <div className="min-w-0">
            <p className="section-label">Exportar</p>
            <h3 id="export-csv-title" className="dialog-title">
              Colunas do CSV
            </h3>
            <p className="sale-sub">
              {formatNumber(records.length)} {records.length === 1 ? 'pessoa' : 'pessoas'} · {marcadas.length} de{' '}
              {COLUNAS.length} colunas
            </p>
          </div>
          <div className="sale-head-side">
            <button type="button" className="sale-close" onClick={onClose} aria-label="Fechar">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </div>

        <section className="sale-section">
          <div className="mb-3 flex gap-2">
            <button type="button" className="sale-chip-btn" onClick={() => setMarcadas(COLUNAS.map((c) => c.id))}>
              Marcar todas
            </button>
            <button type="button" className="sale-chip-btn" onClick={() => setMarcadas([])}>
              Limpar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COLUNAS.map((coluna) => (
              <label
                key={coluna.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200 hover:border-amber-500/50"
              >
                <input
                  type="checkbox"
                  checked={marcadas.includes(coluna.id)}
                  onChange={() => alternar(coluna.id)}
                  className="accent-amber-500"
                />
                {coluna.titulo}
              </label>
            ))}
          </div>
        </section>

        <div className="dialog-actions">
          <button type="button" className="sale-chip-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-gold" disabled={!marcadas.length} onClick={baixar}>
            <i className="fa-solid fa-download mr-1.5" aria-hidden="true" />
            Baixar CSV
          </button>
        </div>
      </div>
    </div>
  )
}
