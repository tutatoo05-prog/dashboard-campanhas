import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { useQuery } from '@tanstack/react-query'
import { fetchAdAccounts, fetchMetaInsights } from '@/services/dataService.ts'
import { fetchGoal } from '@/services/goalService.ts'
import { computeSummary } from '@/lib/analysis.js'
import {
  PRIORITY_META,
  accountHealth,
  buildActions,
  buildBriefing,
  dailyTip,
  type ActionItem,
  type ActionPriority,
  type GoalPace,
  type Totals,
} from '@/lib/actions.ts'
import { pushRecentAccount, sortAccountsByRecent } from '@/lib/recentAccounts.ts'
import { formatCurrency, formatNumber } from '@/lib/format.ts'
import { getDisplayName, getGreeting } from '@/lib/userDisplay.ts'
import { getAccountTheme } from '@/lib/accountTheme.ts'
import { KpiCard, KpiSkeletons } from '@/components/dashboard/KpiCard.tsx'
import { CampaignDetail } from '@/components/campaign/CampaignDrawer.tsx'
import { Reveal } from '@/components/mascot/Reveal.tsx'
import { useAuthStore } from '@/store/authStore.ts'
import { useAccountThemeStore } from '@/store/accountThemeStore.ts'
import type { CampaignItem, EnrichedCampaignItem, Period } from '@/types'

const PERIODS: { value: Period; label: string; previous: Period }[] = [
  { value: 'today', label: 'Hoje', previous: 'yesterday' },
  { value: 'last7', label: '7 dias', previous: 'prev7' },
  { value: 'last30', label: '30 dias', previous: 'prev30' },
  { value: 'this_month', label: 'Este mês', previous: 'last_month' },
]

const PERIOD_PHRASE: Record<string, string> = {
  today: 'Hoje',
  last7: 'Nos últimos 7 dias',
  last30: 'Nos últimos 30 dias',
  this_month: 'Neste mês',
}

const ORDER: ActionPriority[] = ['urgent', 'today', 'later', 'good']

function monthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function useDoneActions(accountId: string | null) {
  const storageKey = `dash-actions-done:${accountId ?? 'none'}:${todayKey()}`
  const [done, setDone] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || '[]')
      setDone(new Set(Array.isArray(raw) ? raw.map(String) : []))
    } catch {
      setDone(new Set())
    }
  }, [storageKey])

  const toggle = useCallback(
    (id: string) => {
      setDone((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [storageKey],
  )

  return { done, toggle }
}

function ActionCard({
  action,
  done,
  onToggle,
  onOpen,
}: {
  action: ActionItem
  done: boolean
  onToggle: () => void
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const meta = PRIORITY_META[action.priority]

  return (
    <article className={`action-card action-${meta.tone} ${done ? 'action-done' : ''}`}>
      <div className="action-main">
        <button
          type="button"
          className="action-check"
          onClick={onToggle}
          aria-pressed={done}
          aria-label={done ? 'Marcar como não feito' : 'Marcar como feito'}
          title={done ? 'Desfazer' : 'Marcar como feito'}
        >
          <i className="fa-solid fa-check" />
        </button>

        <div className="action-icon">
          <i className={`fa-solid ${action.icon}`} />
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="action-title">{action.title}</h4>
          {action.why && <p className="action-why">{action.why}</p>}
          {action.impact && (
            <p className="action-impact">
              <i className="fa-solid fa-coins" /> {action.impact}
            </p>
          )}

          {open && (
            <ol className="action-steps">
              {action.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}

          <div className="action-buttons">
            <button type="button" className="action-link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-list-check'}`} />
              {open ? 'Esconder passos' : 'Como resolver'}
            </button>
            {onOpen && (
              <button type="button" className="action-link" onClick={onOpen}>
                <i className="fa-solid fa-magnifying-glass-chart" />
                Ver detalhes
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function HealthRing({ score, tone }: { score: number; tone: 'good' | 'warn' | 'bad' }) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  return (
    <div className={`health-ring health-${tone}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} className="health-track" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="health-value"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <span className="health-score">{score}</span>
    </div>
  )
}

export default function ActionsPage() {
  const user = useAuthStore((state) => state.user)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('last7')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(false)

  const accountsQuery = useQuery({ queryKey: ['ad-accounts'], queryFn: fetchAdAccounts, retry: false })
  const accounts = useMemo(() => sortAccountsByRecent(accountsQuery.data?.accounts ?? []), [accountsQuery.data])
  const resolvedAccountId = accountId ?? accountsQuery.data?.defaultAccountId ?? accounts[0]?.id ?? null
  const accountName = accounts.find((account) => account.id === resolvedAccountId)?.name
  const accountTheme = getAccountTheme(accountName)

  const setActiveAccountTheme = useAccountThemeStore((state) => state.setAccountName)
  useEffect(() => {
    if (accountName) setActiveAccountTheme(accountName)
  }, [accountName, setActiveAccountTheme])

  const previousPeriod = PERIODS.find((option) => option.value === period)?.previous as Period

  const insightsQuery = useQuery({
    queryKey: ['meta-insights', resolvedAccountId, period, undefined, undefined],
    queryFn: () => fetchMetaInsights(period, resolvedAccountId, {}),
    enabled: Boolean(resolvedAccountId),
    retry: false,
  })

  const previousQuery = useQuery({
    queryKey: ['meta-insights', resolvedAccountId, previousPeriod],
    queryFn: () => fetchMetaInsights(previousPeriod, resolvedAccountId, {}),
    enabled: Boolean(resolvedAccountId),
    retry: false,
  })

  const monthQuery = useQuery({
    queryKey: ['meta-insights', resolvedAccountId, 'this_month', 'goal-card'],
    queryFn: () => fetchMetaInsights('this_month', resolvedAccountId),
    enabled: Boolean(resolvedAccountId),
    retry: false,
  })

  const goalQuery = useQuery({
    queryKey: ['goal', resolvedAccountId, monthKey()],
    queryFn: () => fetchGoal(resolvedAccountId as string, monthKey()),
    enabled: Boolean(resolvedAccountId),
    retry: false,
  })

  const data = insightsQuery.data
  const campaigns = useMemo(() => (data?.campaigns ?? []) as CampaignItem[], [data])

  const summary = useMemo(
    () => computeSummary(campaigns, { dailyByCampaign: data?.dailyByCampaign }),
    [campaigns, data],
  )
  const enriched = (summary.enriched ?? []) as EnrichedCampaignItem[]

  const previousTotals = useMemo<Totals | null>(() => {
    const items = (previousQuery.data?.campaigns ?? []) as CampaignItem[]
    if (!previousQuery.data || !items.length) return null
    return computeSummary(items, { dailyByCampaign: previousQuery.data.dailyByCampaign }).totals as Totals
  }, [previousQuery.data])

  const goal = useMemo<GoalPace | null>(() => {
    const target = goalQuery.data
    if (!target || !monthQuery.data) return null
    const month = computeSummary((monthQuery.data.campaigns ?? []) as CampaignItem[]).totals
    return {
      spendTarget: target.spendTarget,
      cplTarget: target.cplTarget,
      monthSpend: month.spend,
      monthLeads: month.leads,
    }
  }, [goalQuery.data, monthQuery.data])

  const totals = summary.totals as Totals

  const actions = useMemo(
    () =>
      buildActions(enriched, {
        totals,
        previousTotals,
        ads: (data?.ads ?? []) as CampaignItem[],
        goal,
      }),
    [enriched, totals, previousTotals, data, goal],
  )

  const health = useMemo(() => accountHealth(enriched, actions), [enriched, actions])
  const briefing = useMemo(
    () => buildBriefing(totals, previousTotals, enriched, actions, PERIOD_PHRASE[period] ?? 'No período'),
    [totals, previousTotals, enriched, actions, period],
  )
  const tip = useMemo(() => dailyTip(actions), [actions])

  const { done, toggle } = useDoneActions(resolvedAccountId)

  const grouped = useMemo(
    () =>
      ORDER.map((priority) => ({
        priority,
        items: actions.filter((action) => action.priority === priority && !(hideDone && done.has(action.id))),
      })).filter((group) => group.items.length),
    [actions, done, hideDone],
  )

  const pendingCount = actions.filter((a) => a.priority !== 'good' && a.priority !== 'later' && !done.has(a.id)).length
  const selected = selectedId ? enriched.find((item) => item.id === selectedId) ?? null : null

  const isLoading = accountsQuery.isLoading || insightsQuery.isLoading
  const loadError = (accountsQuery.error ?? insightsQuery.error) as Error | null

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">
          {getGreeting()}, {getDisplayName(user)}
        </p>
        <h2 className="section-title mt-1">Central de Ações</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          O painel lê os números por você e diz o que fazer, em ordem de importância. Resolva de cima para baixo e
          marque como feito.
        </p>
      </PageHero>

      <section className="surface-card filter-bar flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accountTheme.dot}`} title={accountName ?? ''} />
          <select
            className={`rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:ring-2 focus:outline-none ${accountTheme.ring}`}
            value={resolvedAccountId ?? ''}
            onChange={(event) => {
              setAccountId(event.target.value)
              pushRecentAccount(event.target.value)
            }}
            disabled={!accounts.length}
            aria-label="Conta de anúncios"
          >
            {!accounts.length && <option value="">Nenhuma conta disponível</option>}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className="seg" role="group" aria-label="Período">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`seg-btn ${period === option.value ? 'seg-btn-active' : ''}`}
              onClick={() => setPeriod(option.value)}
              aria-pressed={period === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {loadError && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {loadError.message === 'SESSION_EXPIRED'
            ? 'Sua sessão expirou. Faça login novamente.'
            : loadError.message || 'Não foi possível carregar os dados da Meta.'}
        </section>
      )}

      {isLoading && !loadError && (
        <div className="space-y-6" aria-busy="true" aria-label="Analisando a conta">
          <KpiSkeletons />
        </div>
      )}

      {data && !loadError && (
        <>
          <Reveal index={0}>
            <section className="briefing surface-card">
              <HealthRing score={health.score} tone={health.tone} />
              <div className="min-w-0 flex-1">
                <p className="section-label">Saúde da conta</p>
                <h3 className={`briefing-status health-text-${health.tone}`}>{health.label}</h3>
                <p className="text-sm text-zinc-500">{health.summary}</p>
                <div className="briefing-lines">
                  {briefing.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
            </section>
          </Reveal>

          <Reveal index={1}>
            <section className="kpi-grid kpi-grid-4">
              <KpiCard
                accent
                label="Investimento"
                icon="fa-coins"
                value={totals.spend}
                format={formatCurrency}
                previous={previousTotals?.spend}
                higherIsBetter={null}
              />
              <KpiCard
                label="Leads"
                icon="fa-users"
                value={totals.leads}
                format={formatNumber}
                previous={previousTotals?.leads}
              />
              <KpiCard
                label="Custo por lead"
                icon="fa-tag"
                value={totals.cpl}
                format={formatCurrency}
                previous={previousTotals?.cpl}
                higherIsBetter={false}
              />
              <div className="kpi2 kpi2-todo">
                <div className="kpi2-head">
                  <span className="kpi2-label">Pendentes hoje</span>
                  <span className="kpi2-icon">
                    <i className="fa-solid fa-list-check" />
                  </span>
                </div>
                <p className="kpi2-value">{pendingCount}</p>
                <span className="delta-note">
                  {pendingCount === 0 ? 'tudo em dia' : pendingCount === 1 ? 'ação para resolver' : 'ações para resolver'}
                </span>
              </div>
            </section>
          </Reveal>

          <Reveal index={2}>
            <section className="tip-card">
              <i className="fa-solid fa-lightbulb" />
              <div>
                <p className="section-label">Dica do dia</p>
                <p className="mt-1 text-sm text-zinc-300">{tip}</p>
              </div>
            </section>
          </Reveal>

          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="section-label">Seu plano</p>
                <h3 className="section-title mt-1">O que fazer agora</h3>
              </div>
              {actions.length > 0 && (
                <button type="button" className="chip-btn" onClick={() => setHideDone((v) => !v)} aria-pressed={hideDone}>
                  <i className={`fa-solid ${hideDone ? 'fa-eye' : 'fa-eye-slash'}`} />
                  {hideDone ? 'Mostrar feitas' : 'Esconder feitas'}
                </button>
              )}
            </div>

            {!actions.length && (
              <div className="surface-card p-8 text-center">
                <i className="fa-solid fa-circle-check text-3xl text-emerald-400" />
                <p className="mt-3 font-medium text-zinc-200">Nada para fazer por enquanto</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Nenhuma campanha precisa de ação neste período. Volte amanhã ou escolha um período maior.
                </p>
              </div>
            )}

            {grouped.map((group, groupIndex) => {
              const meta = PRIORITY_META[group.priority]
              return (
                <Reveal key={group.priority} index={3 + groupIndex}>
                  <div className="action-group">
                    <div className="action-group-head">
                      <span className={`action-badge action-badge-${meta.tone}`}>{meta.label}</span>
                      <span className="text-xs text-zinc-600">{meta.hint}</span>
                      <span className="ml-auto text-xs text-zinc-600">{group.items.length}</span>
                    </div>
                    <div className="space-y-3">
                      {group.items.map((action) => (
                        <ActionCard
                          key={action.id}
                          action={action}
                          done={done.has(action.id)}
                          onToggle={() => toggle(action.id)}
                          onOpen={action.campaign ? () => setSelectedId(action.campaign!.id) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </section>

          <Reveal index={7}>
            <section className="surface-card overflow-hidden">
              <div className="p-4">
                <p className="section-label">Visão rápida</p>
                <h3 className="section-title mt-1">Campanhas ativas</h3>
                <p className="mt-1 text-xs text-zinc-600">Clique numa campanha para ver tudo sobre ela.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                      <th className="px-4 py-2 font-medium">Campanha</th>
                      <th className="px-4 py-2 font-medium">O que fazer</th>
                      <th className="px-4 py-2 text-right font-medium">Gasto</th>
                      <th className="px-4 py-2 text-right font-medium">Leads</th>
                      <th className="px-4 py-2 text-right font-medium">CPL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enriched
                      .filter((item) => item.status === 'Ativa')
                      .map((item) => (
                        <tr
                          key={item.id}
                          className="row-click border-b border-zinc-900/80 last:border-0"
                          onClick={() => setSelectedId(item.id)}
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') setSelectedId(item.id)
                          }}
                        >
                          <td className="max-w-[260px] truncate px-4 py-2.5 text-zinc-200" title={item.name}>
                            {item.name}
                          </td>
                          <td className="px-4 py-2.5 text-zinc-400">
                            {item.analysis.primary.emoji} {item.analysis.primary.label}
                          </td>
                          <td className="px-4 py-2.5 text-right text-zinc-300">{formatCurrency(item.spend)}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-300">{formatNumber(item.leads)}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-300">
                            {item.leads > 0 ? formatCurrency(item.cpl) : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </Reveal>
        </>
      )}

      {selected && data && (
        <CampaignDetail
          item={selected}
          level="campaigns"
          data={data}
          averages={summary.averages}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
