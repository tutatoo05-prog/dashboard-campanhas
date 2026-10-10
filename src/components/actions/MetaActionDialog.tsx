import { useEffect, useRef, useState } from 'react'
import {
  restoreCampaignBudget,
  scaleCampaignBudget,
  setCampaignStatus,
  type BudgetChange,
  type MetaChangeResult,
} from '@/services/actionsService.ts'
import { formatCurrency } from '@/lib/format.ts'

export type MetaActionKind = 'pause' | 'half' | 'plus20'

interface MetaActionDialogProps {
  kind: MetaActionKind
  campaign: { id: string; name: string }
  accountName: string
  onClose: () => void
  /** A alteração foi feita na Meta. */
  onApplied: () => void
  /** O usuário desfez a alteração. */
  onUndone: () => void
}

const COPY: Record<MetaActionKind, { title: string; body: (name: string) => string; confirm: string; danger: boolean }> = {
  pause: {
    title: 'Pausar a campanha na Meta?',
    body: (name) => `"${name}" será pausada agora e deixa de gastar. Dá para reativar pelo botão "Desfazer" logo depois.`,
    confirm: 'Pausar campanha',
    danger: true,
  },
  half: {
    title: 'Reduzir o orçamento diário em 50%?',
    body: (name) =>
      `O orçamento diário de "${name}" cai pela metade. Se o orçamento for por conjunto de anúncios, todos os conjuntos ativos são reduzidos.`,
    confirm: 'Reduzir 50%',
    danger: true,
  },
  plus20: {
    title: 'Aumentar o orçamento diário em 20%?',
    body: (name) =>
      `O orçamento diário de "${name}" sobe 20%. Aumentos maiores que isso reiniciam o aprendizado da Meta, por isso o limite.`,
    confirm: 'Aumentar 20%',
    danger: false,
  },
}

type Phase = 'confirm' | 'working' | 'success' | 'undone' | 'error'

/** Confirmação antes de mexer na Meta de verdade, com resultado e botão de desfazer. */
export function MetaActionDialog({ kind, campaign, accountName, onClose, onApplied, onUndone }: MetaActionDialogProps) {
  const [phase, setPhase] = useState<Phase>('confirm')
  const [result, setResult] = useState<MetaChangeResult | null>(null)
  const [error, setError] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  const copy = COPY[kind]

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && phase !== 'working') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  async function apply() {
    setPhase('working')
    setError('')
    try {
      const response =
        kind === 'pause'
          ? await setCampaignStatus(campaign.id, 'PAUSED')
          : await scaleCampaignBudget(campaign.id, kind === 'half' ? 0.5 : 1.2)
      setResult(response)
      setPhase('success')
      onApplied()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível alterar a campanha.')
      setPhase('error')
    }
  }

  async function undo() {
    setPhase('working')
    setError('')
    try {
      if (kind === 'pause') {
        await setCampaignStatus(campaign.id, 'ACTIVE')
      } else {
        const restore = (result?.changes ?? [])
          .filter((change): change is BudgetChange & { fromCents: number } => change.fromCents != null)
          .map((change) => ({ id: change.id, dailyBudget: change.fromCents }))
        await restoreCampaignBudget(campaign.id, restore)
      }
      setPhase('undone')
      onUndone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível desfazer.')
      setPhase('error')
    }
  }

  const busy = phase === 'working'

  return (
    <div className="dialog-backdrop" onClick={() => !busy && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="meta-dialog-title" onClick={(event) => event.stopPropagation()}>
        {(phase === 'confirm' || phase === 'working') && (
          <>
            <p className="section-label">Altera a Meta de verdade</p>
            <h3 className="dialog-title" id="meta-dialog-title">
              {copy.title}
            </h3>
            <p className="dialog-text">{copy.body(campaign.name)}</p>
            <p className="dialog-meta">
              <i className="fa-solid fa-building" /> Conta: {accountName}
            </p>
            <div className="dialog-actions">
              <button type="button" className="chip-btn" ref={cancelRef} onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className={copy.danger ? 'btn-danger' : 'btn-gold'} onClick={apply} disabled={busy}>
                {busy ? 'Enviando à Meta…' : copy.confirm}
              </button>
            </div>
          </>
        )}

        {phase === 'success' && result && (
          <>
            <p className="section-label">Feito</p>
            <h3 className="dialog-title" id="meta-dialog-title">
              {kind === 'pause' ? 'Campanha pausada' : 'Orçamento atualizado'}
            </h3>
            {kind === 'pause' ? (
              <p className="dialog-text">"{campaign.name}" está pausada na Meta.</p>
            ) : (
              <ul className="dialog-changes">
                {(result.changes ?? []).map((change) => (
                  <li key={change.id}>
                    <b>{change.name ?? campaign.name}</b>
                    <span>
                      {change.from != null ? formatCurrency(change.from) : '—'} → {formatCurrency(change.to)} por dia
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="dialog-meta">A ação foi marcada como feita e fica registrada no histórico.</p>
            <div className="dialog-actions">
              <button type="button" className="chip-btn" onClick={undo}>
                <i className="fa-solid fa-rotate-left" /> Desfazer
              </button>
              <button type="button" className="btn-gold" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        )}

        {phase === 'undone' && (
          <>
            <p className="section-label">Desfeito</p>
            <h3 className="dialog-title" id="meta-dialog-title">
              Tudo como estava
            </h3>
            <p className="dialog-text">
              {kind === 'pause' ? `"${campaign.name}" voltou a rodar.` : 'Os orçamentos voltaram aos valores anteriores.'}
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn-gold" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <p className="section-label">Não deu certo</p>
            <h3 className="dialog-title" id="meta-dialog-title">
              A Meta não aceitou a alteração
            </h3>
            <p className="dialog-error" role="alert">
              {error}
            </p>
            <div className="dialog-actions">
              <button type="button" className="chip-btn" onClick={onClose}>
                Fechar
              </button>
              <button type="button" className="btn-gold" onClick={() => setPhase('confirm')}>
                Tentar de novo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
