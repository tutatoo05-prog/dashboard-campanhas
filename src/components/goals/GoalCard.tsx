import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMetaInsights } from '@/services/dataService.ts'
import { fetchGoal, saveGoal } from '@/services/goalService.ts'
import { computeSummary } from '@/lib/analysis.js'
import { formatCurrency, formatDecimal } from '@/lib/format.ts'
import { isAdmin } from '@/lib/roles.ts'
import { useAuthStore } from '@/store/authStore.ts'
import type { CampaignItem } from '@/types'

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthProgress(): number {
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return now.getDate() / daysInMonth
}

const PACE_STYLES = {
  over: { label: 'Orçamento do mês estourado', className: 'text-red-300', bar: 'bg-red-500' },
  ahead: { label: 'Gastando mais rápido que o esperado', className: 'text-amber-200', bar: 'bg-amber-400' },
  behind: { label: 'Gastando mais devagar que o esperado', className: 'text-zinc-400', bar: 'bg-zinc-500' },
  on_track: { label: 'No ritmo esperado do mês', className: 'text-emerald-400', bar: 'bg-emerald-500' },
} as const

export function GoalCard({ accountId }: { accountId: string | null }) {
  const month = currentMonthKey()
  const queryClient = useQueryClient()
  const canEdit = useAuthStore((state) => isAdmin(state.user))
  const [editing, setEditing] = useState(false)
  const [spendInput, setSpendInput] = useState('')
  const [cplInput, setCplInput] = useState('')

  const goalQuery = useQuery({
    queryKey: ['goal', accountId, month],
    queryFn: () => fetchGoal(accountId as string, month),
    enabled: Boolean(accountId),
    retry: false,
  })

  const monthInsightsQuery = useQuery({
    queryKey: ['meta-insights', accountId, 'this_month', 'goal-card'],
    queryFn: () => fetchMetaInsights('this_month', accountId),
    enabled: Boolean(accountId),
    retry: false,
  })

  const saveMutation = useMutation({
    mutationFn: saveGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goal', accountId, month] })
      setEditing(false)
    },
  })

  useEffect(() => {
    setSpendInput(goalQuery.data?.spendTarget != null ? String(goalQuery.data.spendTarget) : '')
    setCplInput(goalQuery.data?.cplTarget != null ? String(goalQuery.data.cplTarget) : '')
  }, [goalQuery.data])

  if (!accountId) return null

  const campaigns = (monthInsightsQuery.data?.campaigns ?? []) as CampaignItem[]
  const totals = computeSummary(campaigns).totals
  const goal = goalQuery.data

  function handleSave() {
    if (!accountId) return
    saveMutation.mutate({
      accountId,
      month,
      spendTarget: spendInput.trim() ? Number(spendInput) : null,
      cplTarget: cplInput.trim() ? Number(cplInput) : null,
    })
  }

  if (!canEdit && !goal?.spendTarget && !goalQuery.isLoading) {
    return (
      <section className="surface-card p-4">
        <p className="section-label">Meta do mês</p>
        <p className="mt-2 text-sm text-zinc-500">Nenhuma meta definida para {month}.</p>
      </section>
    )
  }

  if (canEdit && (editing || (!goal?.spendTarget && !goalQuery.isLoading))) {
    return (
      <section className="surface-card p-4">
        <p className="section-label">Meta do mês</p>
        <h3 className="section-title mt-1 mb-3">Definir meta de {month}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-zinc-500">
            Meta de investimento (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 block w-40 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              value={spendInput}
              onChange={(event) => setSpendInput(event.target.value)}
              placeholder="ex: 5000"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Meta de CPL (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 block w-32 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              value={cplInput}
              onChange={(event) => setCplInput(event.target.value)}
              placeholder="opcional"
            />
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="rounded-lg bg-gold-dim px-4 py-2 text-sm font-medium text-gold hover:bg-gold-dim/80"
          >
            Salvar meta
          </button>
          {goal?.spendTarget != null && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              Cancelar
            </button>
          )}
        </div>
      </section>
    )
  }

  const spendTarget = goal?.spendTarget ?? 0
  const actualSpend = totals.spend
  const pct = spendTarget > 0 ? (actualSpend / spendTarget) * 100 : 0
  const expectedPct = monthProgress() * 100
  const diff = pct - expectedPct

  let paceKey: keyof typeof PACE_STYLES = 'on_track'
  if (pct >= 100) paceKey = 'over'
  else if (diff > 15) paceKey = 'ahead'
  else if (diff < -15) paceKey = 'behind'

  const pace = PACE_STYLES[paceKey]

  return (
    <section className="surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-label">Meta do mês</p>
          <h3 className="section-title mt-1">Ritmo de investimento — {month}</h3>
        </div>
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 hover:text-zinc-300">
            Editar
          </button>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-zinc-300">
            {formatCurrency(actualSpend)} <span className="text-zinc-600">de</span> {formatCurrency(spendTarget)}
          </span>
          <span className={pace.className}>{formatDecimal(pct, 0)}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-zinc-900">
          <div
            className={`h-full rounded-full ${pace.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
        <p className={`mt-2 text-xs ${pace.className}`}>{pace.label}</p>
        {goal?.cplTarget != null && (
          <p className="mt-1 text-xs text-zinc-500">
            CPL do mês: {totals.cpl > 0 ? formatCurrency(totals.cpl) : '—'} · meta {formatCurrency(goal.cplTarget)}
          </p>
        )}
      </div>
    </section>
  )
}
