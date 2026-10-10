import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { fetchAdAccounts, fetchMetaInsights } from '@/services/dataService.ts'
import { fetchGoal } from '@/services/goalService.ts'
import { computeSummary } from '@/lib/analysis.js'
import {
  PRIORITY_META,
  accountHealth,
  budgetForecast,
  buildActions,
  buildBriefing,
  dailyTip,
  periodDays,
  totalMoneyAtStake,
  type ActionItem,
  type ActionKind,
  type ActionPriority,
  type GoalPace,
  type Health,
  type Totals,
} from '@/lib/actions.ts'
import { aggregateDailySeries } from '@/lib/dailySeries.ts'
import {
  currentStreak,
  loadDone,
  loadSteps,
  recordUrgentOpen,
  saveDone,
  saveSteps,
} from '@/lib/actionsProgress.ts'
import { pushRecentAccount, sortAccountsByRecent } from '@/lib/recentAccounts.ts'
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/format.ts'
import { getDisplayName, getGreeting } from '@/lib/userDisplay.ts'
import { getAccountTheme } from '@/lib/accountTheme.ts'
import { KpiCard, KpiSkeletons } from '@/components/dashboard/KpiCard.tsx'
import { CampaignDetail } from '@/components/campaign/CampaignDrawer.tsx'
import { Reveal } from '@/components/mascot/Reveal.tsx'
import { useAuthStore } from '@/store/authStore.ts'
import { useAccountThemeStore } from '@/store/accountThemeStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import {
  ActionsApiError,
  assignAction,
  fetchActionsState,
  recordActionDone,
  snoozeAction,
  type ActionsState,
  type RuleAlert,
} from '@/services/actionsService.ts'
import { AssigneePicker } from '@/components/actions/AssigneePicker.tsx'
import { AutomationPanel } from '@/components/actions/AutomationPanel.tsx'
import { MetaActionDialog, type MetaActionKind } from '@/components/actions/MetaActionDialog.tsx'
import { ResultsSection } from '@/components/actions/ResultsSection.tsx'
import { SnoozeMenu, formatSnoozeDate } from '@/components/actions/SnoozeMenu.tsx'
import { computeResults } from '@/lib/actionResults.ts'
import { saveSnoozed } from '@/lib/actionsProgress.ts'
import type { CampaignItem, EnrichedCampaignItem, InsightsData, Period } from '@/types'

const PERIODS: { value: Period; label: string; previous: Period }[] = [
  { value: 'today', label: 'Hoje', previous: 'yesterday' },
  { value: 'last7', label: '7 dias', previous: 'prev7' },
  { value: 'last30', label: '30 dias', previous: 'prev30' },
  { value: 'this_month', label: 'Este mês', previous: 'last_month' },
]

const ORDER: ActionPriority[] = ['urgent', 'today', 'later', 'good']
const ALL_ACCOUNTS = 'all'

const KIND_LABEL: Record<ActionKind, string> = {
  pause: 'Pausar',
  fix: 'Corrigir',
  scale: 'Escalar',
  wait: 'Aguardar',
  alert: 'Alerta',
  creative: 'Criativo',
}

type GroupMode = 'priority' | 'campaign' | 'impact'

interface PlanItem extends ActionItem {
  /** Id da ação + conta: único mesmo no modo "todas as contas". */
  key: string
  accountId: string
  accountName: string
}

interface Bundle {
  id: string
  name: string
  enriched: EnrichedCampaignItem[]
  totals: Totals
  previousTotals: Totals | null
  actions: ActionItem[]
  health: Health
  summary: ReturnType<typeof computeSummary>
}

const RANK: Record<ActionPriority, number> = { urgent: 0, today: 1, later: 2, good: 3 }

function comparePlan(a: PlanItem, b: PlanItem): number {
  if (RANK[a.priority] !== RANK[b.priority]) return RANK[a.priority] - RANK[b.priority]
  const money = (b.moneyAtStake ?? 0) - (a.moneyAtStake ?? 0)
  if (money !== 0) return money
  return (b.campaign?.spend ?? 0) - (a.campaign?.spend ?? 0)
}

const ALERT_STEPS: Record<RuleAlert['ruleType'], string[]> = {
  cpl_above_avg: [
    'Abra o Gerenciador de Anúncios e localize a campanha.',
    'Compare os anúncios dela: o mais caro costuma puxar o custo para cima.',
    'Pause ou reduza o anúncio mais caro e crie uma variação do melhor.',
    'Confira de novo em 48h.',
  ],
  spend_no_leads: [
    'Abra a página do link e faça um cadastro de teste.',
    'Confirme que o lead aparece em Leads/Registros aqui no painel.',
    'Se o cadastro funciona, a campanha é fraca: pause ou troque criativo e público.',
  ],
  budget_used: [
    'Veja quais campanhas têm o pior custo por lead.',
    'Reduza os orçamentos diários delas ou aumente a meta do mês no Dashboard.',
  ],
}

/** Transforma um alerta de regra automática numa ação da lista. */
function alertToAction(alert: RuleAlert, enriched: EnrichedCampaignItem[]): ActionItem {
  return {
    id: `rule:${alert.id}`,
    priority: alert.ruleType === 'budget_used' ? 'today' : 'urgent',
    kind: 'alert',
    icon: 'fa-bell',
    title: alert.title,
    why: alert.detail,
    steps: ALERT_STEPS[alert.ruleType],
    moneyAtStake: alert.money ?? undefined,
    reasoning: `Regra automática disparada: ${alert.detail}`,
    campaign: alert.campaignId ? enriched.find((item) => item.id === alert.campaignId) : undefined,
  }
}

function monthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Feito e passos marcados de cada ação, por conta, guardados no navegador (zeram todo dia). */
function useActionProgress(accountIds: string[], onDoneChange?: (accountId: string, id: string, value: boolean) => void) {
  const idsKey = accountIds.join(',')
  const [done, setDone] = useState<Record<string, Set<string>>>({})
  const [steps, setSteps] = useState<Record<string, Record<string, number[]>>>({})
  const doneRef = useRef(done)
  doneRef.current = done
  const onChangeRef = useRef(onDoneChange)
  onChangeRef.current = onDoneChange

  useEffect(() => {
    const nextDone: Record<string, Set<string>> = {}
    const nextSteps: Record<string, Record<string, number[]>> = {}
    for (const id of accountIds) {
      nextDone[id] = loadDone(id)
      nextSteps[id] = loadSteps(id)
    }
    setDone(nextDone)
    setSteps(nextSteps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  const isDone = useCallback((item: { accountId: string; id: string }) => done[item.accountId]?.has(item.id) ?? false, [done])

  const setDoneFlag = useCallback((accountId: string, id: string, value?: boolean) => {
    const next = value ?? !(doneRef.current[accountId]?.has(id) ?? false)
    setDone((current) => {
      const set = new Set(current[accountId] ?? [])
      if (next) set.add(id)
      else set.delete(id)
      saveDone(accountId, set)
      return { ...current, [accountId]: set }
    })
    onChangeRef.current?.(accountId, id, next)
  }, [])

  const stepsDone = useCallback(
    (item: { accountId: string; id: string }) => new Set(steps[item.accountId]?.[item.id] ?? []),
    [steps],
  )

  const toggleStep = useCallback(
    (item: { accountId: string; id: string }, index: number, total: number) => {
      const before = new Set(steps[item.accountId]?.[item.id] ?? [])
      const completes = !before.has(index) && before.size + 1 === total
      setSteps((current) => {
        const account = { ...(current[item.accountId] ?? {}) }
        const list = new Set(account[item.id] ?? [])
        if (list.has(index)) list.delete(index)
        else list.add(index)
        account[item.id] = [...list]
        saveSteps(item.accountId, account)
        return { ...current, [item.accountId]: account }
      })
      // terminou o último passo: a ação conta como feita
      if (completes) setDoneFlag(item.accountId, item.id, true)
    },
    [steps, setDoneFlag],
  )

  return { isDone, setDoneFlag, stepsDone, toggleStep }
}

function MoneyChip({ value }: { value?: number }) {
  if (!value) return null
  return (
    <span className="money-chip" title="Estimativa do que se perde por semana se nada for feito">
      <i className="fa-solid fa-money-bill-trend-up" /> ~{formatCurrency(value).replace(',00', '')}/semana em jogo
    </span>
  )
}

function StepList({
  steps,
  doneSet,
  onToggle,
}: {
  steps: string[]
  doneSet: Set<number>
  onToggle: (index: number) => void
}) {
  return (
    <ol className="step-list">
      {steps.map((step, index) => {
        const checked = doneSet.has(index)
        return (
          <li key={step} className={checked ? 'step-done' : ''}>
            <button
              type="button"
              className="step-check"
              aria-pressed={checked}
              aria-label={checked ? `Desmarcar passo ${index + 1}` : `Marcar passo ${index + 1}`}
              onClick={() => onToggle(index)}
            >
              <i className="fa-solid fa-check" />
            </button>
            <span>{step}</span>
          </li>
        )
      })}
    </ol>
  )
}

function StepProgress({ done, total }: { done: number; total: number }) {
  if (!total) return null
  return (
    <span className="step-progress" title="Passos concluídos">
      <i className="fa-solid fa-list-check" /> {done} de {total} passos
      <span className="step-progress-bar">
        <i style={{ width: `${(done / total) * 100}%` }} />
      </span>
    </span>
  )
}

function ActionCard({
  action,
  done,
  stepsDone,
  showAccount,
  onToggle,
  onToggleStep,
  onOpen,
  tools,
  assignee,
}: {
  action: PlanItem
  done: boolean
  stepsDone: Set<number>
  showAccount: boolean
  onToggle: () => void
  onToggleStep: (index: number) => void
  onOpen?: () => void
  /** Adiar e ações na Meta (botões extras). */
  tools?: ReactNode
  /** Seletor de responsável. */
  assignee?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState(false)
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

          <div className="action-chips">
            <MoneyChip value={action.moneyAtStake} />
            <StepProgress done={stepsDone.size} total={action.steps.length} />
            {showAccount && (
              <span className="account-chip">
                <i className="fa-solid fa-building" /> {action.accountName}
              </span>
            )}
          </div>

          {open && <StepList steps={action.steps} doneSet={stepsDone} onToggle={onToggleStep} />}
          {why && action.reasoning && (
            <p className="why-box">
              <b>Por que o TaTuzinho sugeriu isso?</b> {action.reasoning}
            </p>
          )}

          <div className="action-buttons">
            <button type="button" className="action-link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-list-check'}`} />
              {open ? 'Esconder passos' : 'Como resolver'}
            </button>
            {action.reasoning && (
              <button type="button" className="action-link" onClick={() => setWhy((v) => !v)} aria-expanded={why}>
                <i className="fa-solid fa-circle-question" />
                Por quê?
              </button>
            )}
            {onOpen && (
              <button type="button" className="action-link" onClick={onOpen}>
                <i className="fa-solid fa-magnifying-glass-chart" />
                Ver detalhes
              </button>
            )}
            {tools}
          </div>
        </div>
        {assignee && <div className="action-owner">{assignee}</div>}
      </div>
    </article>
  )
}

/** Modo foco: a próxima ação pendente, uma de cada vez, com passos, dinheiro em jogo e o porquê. */
function FocusCard({
  action,
  position,
  total,
  stepsDone,
  showAccount,
  onToggleStep,
  onDone,
  onNext,
  onOpen,
  onExplain,
  tools,
  assignee,
}: {
  action: PlanItem
  position: number
  total: number
  stepsDone: Set<number>
  showAccount: boolean
  onToggleStep: (index: number) => void
  onDone: () => void
  onNext: () => void
  onOpen?: () => void
  onExplain: () => void
  tools?: ReactNode
  assignee?: ReactNode
}) {
  const meta = PRIORITY_META[action.priority]
  return (
    <section className={`focus-card action-${meta.tone}`} aria-label="Próxima ação">
      <div className="focus-head">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`action-badge action-badge-${meta.tone}`}>{meta.label} · próxima ação</span>
            {showAccount && (
              <span className="account-chip">
                <i className="fa-solid fa-building" /> {action.accountName}
              </span>
            )}
          </div>
          <h3 className="focus-title">{action.title}</h3>
          {action.why && <p className="action-why">{action.why}</p>}
        </div>
        <div className="focus-side">
          <MoneyChip value={action.moneyAtStake} />
          {action.impact && <p className="action-impact">{action.impact}</p>}
        </div>
      </div>

      <StepList steps={action.steps} doneSet={stepsDone} onToggle={onToggleStep} />

      {action.reasoning && (
        <p className="why-box">
          <b>Por que o TaTuzinho sugeriu isso?</b> {action.reasoning}
        </p>
      )}

      <div className="focus-actions">
        <button type="button" className="btn-gold" onClick={onDone}>
          <i className="fa-solid fa-check" /> Marcar como feito
        </button>
        {onOpen && (
          <button type="button" className="chip-btn" onClick={onOpen}>
            <i className="fa-solid fa-magnifying-glass-chart" /> Ver detalhes
          </button>
        )}
        {action.reasoning && (
          <button type="button" className="chip-btn" onClick={onExplain}>
            <i className="fa-solid fa-paw" /> TaTuzinho explica
          </button>
        )}
        {tools}
        {assignee}
        <span className="focus-count">
          {position} de {total} pendentes
        </span>
        {total > 1 && (
          <button type="button" className="chip-btn" onClick={onNext}>
            Próxima <i className="fa-solid fa-arrow-right" />
          </button>
        )}
      </div>
    </section>
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

/** Linha simples da evolução (sem eixos), na cor de destaque. */
function MiniTrend({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((value, index) => `${((index / (values.length - 1)) * 100).toFixed(1)},${(34 - ((value - min) / range) * 28).toFixed(1)}`)
  const [lastX, lastY] = points[points.length - 1].split(',')
  return (
    <svg className="mini-trend" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--o)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r="2.8" fill="var(--o)" />
    </svg>
  )
}

export default function ActionsPage() {
  const user = useAuthStore((state) => state.user)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('last7')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(false)
  const [priorityFilter, setPriorityFilter] = useState<'all' | ActionPriority>('all')
  const [kindFilter, setKindFilter] = useState<'all' | ActionKind>('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('priority')
  const [search, setSearch] = useState('')
  const [focusIndex, setFocusIndex] = useState(0)
  const [streak, setStreak] = useState(0)

  const accountsQuery = useQuery({ queryKey: ['ad-accounts'], queryFn: fetchAdAccounts, retry: false })
  const accounts = useMemo(() => sortAccountsByRecent(accountsQuery.data?.accounts ?? []), [accountsQuery.data])
  const allMode = accountId === ALL_ACCOUNTS && accounts.length > 1
  const singleId = accountId && accountId !== ALL_ACCOUNTS ? accountId : null
  const resolvedAccountId = singleId ?? accountsQuery.data?.defaultAccountId ?? accounts[0]?.id ?? null
  const accountName = accounts.find((account) => account.id === resolvedAccountId)?.name
  const accountTheme = getAccountTheme(allMode ? null : accountName)

  const setActiveAccountTheme = useAccountThemeStore((state) => state.setAccountName)
  useEffect(() => {
    if (accountName && !allMode) setActiveAccountTheme(accountName)
  }, [accountName, allMode, setActiveAccountTheme])

  const previousPeriod = PERIODS.find((option) => option.value === period)?.previous as Period
  const targetIds = useMemo(
    () => (allMode ? accounts.map((account) => String(account.id)) : resolvedAccountId ? [String(resolvedAccountId)] : []),
    [allMode, accounts, resolvedAccountId],
  )

  const insightQueries = useQueries({
    queries: targetIds.map((id) => ({
      queryKey: ['meta-insights', id, period, undefined, undefined],
      queryFn: () => fetchMetaInsights(period, id, {}),
      retry: false,
    })),
  })
  const previousQueries = useQueries({
    queries: targetIds.map((id) => ({
      queryKey: ['meta-insights', id, previousPeriod],
      queryFn: () => fetchMetaInsights(previousPeriod, id, {}),
      retry: false,
    })),
  })

  // meta do mês e tendência de 30 dias só fazem sentido numa conta
  const monthQuery = useQuery({
    queryKey: ['meta-insights', resolvedAccountId, 'this_month', 'goal-card'],
    queryFn: () => fetchMetaInsights('this_month', resolvedAccountId),
    enabled: Boolean(resolvedAccountId) && !allMode,
    retry: false,
  })
  const goalQuery = useQuery({
    queryKey: ['goal', resolvedAccountId, monthKey()],
    queryFn: () => fetchGoal(resolvedAccountId as string, monthKey()),
    enabled: Boolean(resolvedAccountId) && !allMode,
    retry: false,
  })
  const trendQuery = useQuery({
    queryKey: ['meta-insights', resolvedAccountId, 'last30', undefined, undefined],
    queryFn: () => fetchMetaInsights('last30', resolvedAccountId, {}),
    enabled: Boolean(resolvedAccountId) && !allMode,
    retry: false,
  })

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

  // estado do servidor: adiadas, responsáveis, histórico, regras e alertas (precisa da migração do banco)
  const queryClient = useQueryClient()
  const stateQuery = useQuery({
    queryKey: ['actions-state', allMode ? 'all' : resolvedAccountId],
    queryFn: () => fetchActionsState(allMode ? null : resolvedAccountId),
    enabled: allMode || Boolean(resolvedAccountId),
    retry: false,
    refetchInterval: 5 * 60_000,
  })
  const actionsState: ActionsState | undefined = stateQuery.data
  const needsMigration = stateQuery.error instanceof ActionsApiError && stateQuery.error.code === 'MIGRATION_NEEDED'
  const refreshState = useCallback(() => void queryClient.invalidateQueries({ queryKey: ['actions-state'] }), [queryClient])

  // para comparar o antes e o depois, sempre com os últimos 7 dias da conta
  const last7Query = useQuery({
    queryKey: ['meta-insights', resolvedAccountId, 'last7', undefined, undefined],
    queryFn: () => fetchMetaInsights('last7', resolvedAccountId, {}),
    enabled: Boolean(resolvedAccountId) && !allMode,
    retry: false,
  })

  const [metaDialog, setMetaDialog] = useState<{ item: PlanItem; kind: MetaActionKind } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const days = periodDays(period)
  const insightStamp = insightQueries.map((query) => query.dataUpdatedAt).join(',')
  const previousStamp = previousQueries.map((query) => query.dataUpdatedAt).join(',')

  const bundles = useMemo<Bundle[]>(() => {
    const result: Bundle[] = []
    targetIds.forEach((id, index) => {
      const data = insightQueries[index]?.data as InsightsData | undefined
      if (!data) return
      const campaigns = (data.campaigns ?? []) as CampaignItem[]
      const summary = computeSummary(campaigns, { dailyByCampaign: data.dailyByCampaign })
      const enriched = (summary.enriched ?? []) as EnrichedCampaignItem[]
      const totals = summary.totals as Totals
      const previousData = previousQueries[index]?.data as InsightsData | undefined
      const previousItems = (previousData?.campaigns ?? []) as CampaignItem[]
      const previousTotals =
        previousData && previousItems.length
          ? (computeSummary(previousItems, { dailyByCampaign: previousData.dailyByCampaign }).totals as Totals)
          : null
      const actions = buildActions(enriched, {
        totals,
        previousTotals,
        ads: (data.ads ?? []) as CampaignItem[],
        goal: !allMode ? goal : null,
        periodDays: days,
      })
      result.push({
        id,
        name: accounts.find((account) => String(account.id) === id)?.name ?? id,
        enriched,
        totals,
        previousTotals,
        actions,
        health: accountHealth(enriched, actions),
        summary,
      })
    })
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIds.join(','), insightStamp, previousStamp, goal, days, allMode, accounts])

  const bundle = !allMode ? bundles[0] : undefined
  const data = !allMode ? (insightQueries[0]?.data as InsightsData | undefined) : undefined
  const enriched = bundle?.enriched ?? []
  const totals = bundle?.totals
  const previousTotals = bundle?.previousTotals ?? null
  const health = bundle?.health

  const briefing = useMemo(
    () =>
      bundle
        ? buildBriefing(bundle.totals, bundle.previousTotals, bundle.enriched, bundle.actions, PERIOD_PHRASE[period] ?? 'No período')
        : [],
    [bundle, period],
  )
  const tip = useMemo(() => dailyTip(bundle?.actions ?? []), [bundle])

  const allItems = useMemo<PlanItem[]>(
    () =>
      bundles
        .flatMap((b) => {
          // alerta de regra só entra se a campanha ainda não tem uma ação urgente (evita cartão repetido)
          const urgentCampaigns = new Set(b.actions.filter((a) => a.priority === 'urgent').map((a) => a.campaign?.id))
          const fromRules = (actionsState?.alerts ?? [])
            .filter((alert) => alert.accountId === b.id && !(alert.campaignId && urgentCampaigns.has(alert.campaignId)))
            .map((alert) => alertToAction(alert, b.enriched))
          return [...b.actions, ...fromRules].map((action) => ({
            ...action,
            key: `${b.id}::${action.id}`,
            accountId: b.id,
            accountName: b.name,
          }))
        })
        .sort(comparePlan),
    [bundles, actionsState?.alerts],
  )

  const itemIndex = useMemo(() => new Map(allItems.map((item) => [item.key, item])), [allItems])

  // marcar/desmarcar "feito" também grava o histórico (foto dos números) no servidor
  const handleDoneChange = useCallback(
    (accountId: string, actionId: string, value: boolean) => {
      const item = itemIndex.get(`${accountId}::${actionId}`)
      void recordActionDone({
        accountId,
        actionId,
        done: value,
        campaignId: item?.campaign?.id ?? null,
        title: item?.title,
        kind: item?.kind,
        snapshot: item?.campaign
          ? {
              spend: item.campaign.spend,
              leads: item.campaign.leads,
              cpl: item.campaign.cpl,
              ctr: item.campaign.ctr,
              periodDays: days,
              moneyAtStake: item.moneyAtStake,
            }
          : undefined,
      })
        .then(refreshState)
        .catch(() => undefined)
    },
    [itemIndex, days, refreshState],
  )

  const { isDone, setDoneFlag, stepsDone, toggleStep } = useActionProgress(targetIds, handleDoneChange)

  // adiadas e responsáveis (vêm do servidor)
  const snoozeMap = useMemo(
    () => new Map((actionsState?.snoozes ?? []).map((snooze) => [`${snooze.accountId}::${snooze.actionId}`, snooze.until])),
    [actionsState?.snoozes],
  )
  const assignMap = useMemo(
    () => new Map((actionsState?.assignments ?? []).map((a) => [`${a.accountId}::${a.actionId}`, a])),
    [actionsState?.assignments],
  )
  const items = useMemo(() => allItems.filter((item) => !snoozeMap.has(item.key)), [allItems, snoozeMap])
  const snoozedItems = useMemo(() => allItems.filter((item) => snoozeMap.has(item.key)), [allItems, snoozeMap])

  // o TaTuzinho lê isto pra não contar ação adiada como pendente
  useEffect(() => {
    if (!actionsState) return
    for (const id of targetIds) {
      saveSnoozed(id, actionsState.snoozes.filter((snooze) => snooze.accountId === id))
    }
  }, [actionsState, targetIds])

  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine' | 'none'>('all')
  const myEmail = String(user?.email ?? '').toLowerCase()

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      const owner = assignMap.get(item.key)
      if (ownerFilter === 'mine' && owner?.userEmail?.toLowerCase() !== myEmail) return false
      if (ownerFilter === 'none' && owner) return false
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false
      if (hideDone && isDone(item)) return false
      if (term && !`${item.title} ${item.campaign?.name ?? ''} ${item.accountName}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [items, priorityFilter, kindFilter, hideDone, search, isDone, assignMap, ownerFilter, myEmail])

  const groups = useMemo(() => {
    if (groupMode === 'impact') {
      const sorted = [...visible].sort((a, b) => (b.moneyAtStake ?? 0) - (a.moneyAtStake ?? 0) || comparePlan(a, b))
      return sorted.length
        ? [{ key: 'impact', label: 'Maior impacto', hint: 'Do que mais custa para o que menos custa', tone: 'today', items: sorted }]
        : []
    }
    if (groupMode === 'campaign') {
      const byCampaign = new Map<string, PlanItem[]>()
      for (const item of visible) {
        const name = item.campaign?.name ?? 'Conta inteira'
        byCampaign.set(name, [...(byCampaign.get(name) ?? []), item])
      }
      return [...byCampaign.entries()]
        .sort(([, a], [, b]) => totalMoneyAtStake(b) - totalMoneyAtStake(a) || b.length - a.length)
        .map(([name, list]) => ({ key: name, label: name, hint: `${list.length} ${list.length === 1 ? 'ação' : 'ações'}`, tone: 'later', items: list }))
    }
    return ORDER.map((priority) => ({
      key: priority,
      label: PRIORITY_META[priority].label,
      hint: PRIORITY_META[priority].hint,
      tone: PRIORITY_META[priority].tone,
      items: visible.filter((item) => item.priority === priority),
    })).filter((group) => group.items.length)
  }, [visible, groupMode])

  // modo foco: a próxima ação pendente (urgentes e "fazer hoje")
  const pendingFocus = useMemo(
    () => visible.filter((item) => (item.priority === 'urgent' || item.priority === 'today') && !isDone(item)),
    [visible, isDone],
  )
  const focus = pendingFocus.length ? pendingFocus[focusIndex % pendingFocus.length] : null
  const focusPosition = pendingFocus.length ? (focusIndex % pendingFocus.length) + 1 : 0

  // progresso do dia
  const actionable = items.filter((item) => item.priority === 'urgent' || item.priority === 'today')
  const actionableDone = actionable.filter((item) => isDone(item)).length
  const urgentOpen = items.filter((item) => item.priority === 'urgent' && !isDone(item)).length
  const moneyOpen = totalMoneyAtStake(items.filter((item) => item.priority !== 'good' && !isDone(item)))
  const pendingCount = items.filter((a) => a.priority !== 'good' && a.priority !== 'later' && !isDone(a)).length

  const ready = bundles.length > 0 && bundles.length === targetIds.length
  const viewKey = `${targetIds.join(',')}|${period}`

  // registra as urgentes abertas hoje (alimenta a sequência) e relê a sequência
  useEffect(() => {
    if (!ready) return
    let min = Infinity
    for (const b of bundles) {
      const open = items.filter((item) => item.accountId === b.id && item.priority === 'urgent' && !isDone(item)).length
      recordUrgentOpen(b.id, open)
      min = Math.min(min, currentStreak(b.id))
    }
    setStreak(Number.isFinite(min) ? min : 0)
  }, [ready, bundles, items, isDone])

  // zerou as urgentes nesta sessão: o TaTuzinho comemora
  const prevUrgent = useRef<number | null>(null)
  useEffect(() => {
    prevUrgent.current = null
  }, [viewKey])
  useEffect(() => {
    if (!ready) return
    if (prevUrgent.current != null && prevUrgent.current > 0 && urgentOpen === 0) {
      const mascot = useMascotStore.getState()
      mascot.celebrate()
      mascot.say('Zerou as urgentes! Dia ganho. Que tal olhar o que fazer hoje?', { pose: 'cheer', afterPose: 'idle' })
    }
    prevUrgent.current = urgentOpen
  }, [ready, urgentOpen])

  // tendência do custo por lead (30 dias) e previsão de verba
  const cplSeries = useMemo(
    () =>
      aggregateDailySeries(trendQuery.data?.dailyByCampaign)
        .map((point) => point.cpl)
        .filter((value): value is number => value != null),
    [trendQuery.data],
  )
  const cplTrend = useMemo(() => {
    if (cplSeries.length < 10) return null
    const avg = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length
    const recent = avg(cplSeries.slice(-7))
    const before = avg(cplSeries.slice(-14, -7).length ? cplSeries.slice(-14, -7) : cplSeries.slice(0, -7))
    return before > 0 ? ((recent - before) / before) * 100 : null
  }, [cplSeries])
  const forecast = useMemo(() => budgetForecast(goal), [goal])

  const selected = selectedId ? enriched.find((item) => item.id === selectedId) ?? null : null

  const isLoading = accountsQuery.isLoading || insightQueries.some((query) => query.isLoading)
  const loadError = (accountsQuery.error ?? insightQueries.find((query) => query.error)?.error) as Error | null
  const filtersActive = priorityFilter !== 'all' || kindFilter !== 'all' || search.trim() !== ''

  function explain(item: PlanItem) {
    useMascotStore.getState().say(item.reasoning ?? item.why, {
      pose: 'write',
      afterPose: 'point',
      important: true,
      closable: true,
      hold: 18_000,
    })
  }

  async function guarded(task: () => Promise<unknown>) {
    setNotice(null)
    try {
      await task()
      refreshState()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível concluir.')
    }
  }

  const results = useMemo(
    () => computeResults(actionsState?.history ?? [], (last7Query.data?.campaigns ?? []) as CampaignItem[]),
    [actionsState?.history, last7Query.data],
  )

  /** Ações na Meta: só onde há campanha ativa de verdade (anúncio solto e alerta da conta ficam de fora). */
  function metaKindsFor(item: PlanItem): { kind: MetaActionKind; label: string; icon: string }[] {
    if (!item.campaign || item.campaign.status !== 'Ativa' || item.kind === 'creative' || item.kind === 'wait') return []
    if (item.kind === 'scale') return [{ kind: 'plus20', label: 'Aumentar 20%', icon: 'fa-arrow-up-right-dots' }]
    return [
      { kind: 'pause', label: 'Pausar na Meta', icon: 'fa-circle-pause' },
      { kind: 'half', label: 'Reduzir 50%', icon: 'fa-scale-unbalanced-flip' },
    ]
  }

  function renderTools(item: PlanItem): ReactNode {
    const metaButtons = metaKindsFor(item)
    return (
      <>
        {actionsState && (
          <SnoozeMenu
            onSnooze={(until) => void guarded(() => snoozeAction(item.accountId, item.id, until.toISOString()))}
          />
        )}
        {metaButtons.map((button) => (
          <button key={button.kind} type="button" className="action-link action-link-meta" onClick={() => setMetaDialog({ item, kind: button.kind })}>
            <i className={`fa-solid ${button.icon}`} /> {button.label}
          </button>
        ))}
      </>
    )
  }

  function renderAssignee(item: PlanItem): ReactNode {
    if (!actionsState) return null
    const owner = assignMap.get(item.key)
    return (
      <AssigneePicker
        users={actionsState.users}
        assignee={owner ? { userId: owner.userId, userName: owner.userName } : null}
        onAssign={(userId) => void guarded(() => assignAction(item.accountId, item.id, userId))}
      />
    )
  }

  function renderCard(action: PlanItem) {
    return (
      <ActionCard
        key={action.key}
        action={action}
        done={isDone(action)}
        stepsDone={stepsDone(action)}
        showAccount={allMode}
        onToggle={() => setDoneFlag(action.accountId, action.id)}
        onToggleStep={(index) => toggleStep(action, index, action.steps.length)}
        onOpen={
          action.campaign && !allMode ? () => setSelectedId(action.campaign!.id) : undefined
        }
        tools={renderTools(action)}
        assignee={renderAssignee(action)}
      />
    )
  }

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
            value={allMode ? ALL_ACCOUNTS : resolvedAccountId ?? ''}
            onChange={(event) => {
              setAccountId(event.target.value)
              setFocusIndex(0)
              if (event.target.value !== ALL_ACCOUNTS) pushRecentAccount(event.target.value)
            }}
            disabled={!accounts.length}
            aria-label="Conta de anúncios"
          >
            {!accounts.length && <option value="">Nenhuma conta disponível</option>}
            {accounts.length > 1 && <option value={ALL_ACCOUNTS}>Todas as contas</option>}
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

      {needsMigration && (
        <section className="surface-card migration-note" role="status">
          <i className="fa-solid fa-database" />
          <div>
            <b>Faltam os recursos novos do banco.</b> Para usar adiar, responsável, histórico e regras, rode o bloco
            "Central de Ações v2" de <code>db/schema.sql</code> no SQL Editor do Supabase. O resto da tela já funciona.
          </div>
        </section>
      )}

      {notice && (
        <section className="surface-card migration-note" role="alert">
          <i className="fa-solid fa-triangle-exclamation" />
          <div>{notice}</div>
          <button type="button" className="chip-btn" onClick={() => setNotice(null)}>
            Fechar
          </button>
        </section>
      )}

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

      {ready && !loadError && (
        <>
          {!allMode && bundle && health && totals && (
            <Reveal index={0}>
              <section className="plan-top">
                <div className="briefing surface-card">
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
                    {cplSeries.length >= 2 && (
                      <div className="trend-box">
                        <div className="trend-head">
                          <span className="section-label">Custo por lead · 30 dias</span>
                          {cplTrend != null && Math.abs(cplTrend) >= 3 && (
                            <span className={cplTrend > 0 ? 'trend-bad' : 'trend-good'}>
                              <i className={`fa-solid ${cplTrend > 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} />{' '}
                              {formatDecimal(Math.abs(cplTrend), 0)}% {cplTrend > 0 ? 'mais caro' : 'mais barato'} na última semana
                            </span>
                          )}
                        </div>
                        <MiniTrend values={cplSeries} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="forecast surface-card">
                  <p className="section-label">Verba do mês</p>
                  {forecast ? (
                    <>
                      <h3 className="forecast-title">
                        {forecast.state === 'over'
                          ? 'Verba do mês estourada'
                          : forecast.exhaustDay
                            ? `A verba acaba dia ${forecast.exhaustDay}, não dia ${forecast.daysInMonth}`
                            : 'A verba dura até o fim do mês'}
                      </h3>
                      <div className="forecast-meter" aria-hidden="true">
                        <i
                          className={`forecast-fill forecast-${forecast.state}`}
                          style={{ width: `${Math.min(100, (forecast.spent / forecast.target) * 100)}%` }}
                        />
                        <u style={{ left: `${Math.min(100, (forecast.expected / forecast.target) * 100)}%` }} />
                      </div>
                      <p className="small-note">
                        {formatCurrency(forecast.spent)} de {formatCurrency(forecast.target)} · esperado até hoje:{' '}
                        {formatCurrency(forecast.expected)} (marca vermelha)
                      </p>
                      <p className="small-note">
                        Projeção no ritmo atual: <b>{formatCurrency(forecast.projected)}</b> no fim do mês.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="forecast-title">Sem meta de investimento</h3>
                      <p className="small-note">
                        Defina a meta do mês no Dashboard (cartão "Meta do mês") para ver quando a verba acaba.
                      </p>
                    </>
                  )}
                </div>
              </section>
            </Reveal>
          )}

          {allMode && (
            <Reveal index={0}>
              <section className="account-health-grid">
                {bundles.map((b) => {
                  const open = items.filter((item) => item.accountId === b.id && item.priority === 'urgent' && !isDone(item)).length
                  const money = totalMoneyAtStake(items.filter((item) => item.accountId === b.id && item.priority !== 'good' && !isDone(item)))
                  const theme = getAccountTheme(b.name)
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className="surface-card account-health-card"
                      onClick={() => {
                        setAccountId(b.id)
                        pushRecentAccount(b.id)
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
                        <b>{b.name}</b>
                      </span>
                      <span className={`briefing-status health-text-${b.health.tone}`}>
                        {b.health.score} · {b.health.label}
                      </span>
                      <span className="small-note">
                        {open} {open === 1 ? 'urgente' : 'urgentes'}
                        {money > 0 ? ` · ~${formatCurrency(money).replace(',00', '')}/semana em jogo` : ''}
                      </span>
                    </button>
                  )
                })}
              </section>
            </Reveal>
          )}

          {!allMode && totals && (
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
          )}

          {!allMode && (
            <Reveal index={2}>
              <section className="tip-card">
                <i className="fa-solid fa-lightbulb" />
                <div>
                  <p className="section-label">Dica do dia</p>
                  <p className="mt-1 text-sm text-zinc-300">{tip}</p>
                </div>
              </section>
            </Reveal>
          )}

          <section className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="section-label">Seu plano</p>
                <h3 className="section-title mt-1">O que fazer agora</h3>
                {moneyOpen > 0 && (
                  <p className="plan-money">
                    <i className="fa-solid fa-money-bill-trend-up" /> ~{formatCurrency(moneyOpen).replace(',00', '')} por semana em jogo nas ações abertas
                  </p>
                )}
              </div>

              {ready && (
                <div className="daily-card" aria-label="Progresso do dia">
                  <p className="section-label">Seu dia</p>
                  {actionable.length > 0 ? (
                    <>
                      <p className="daily-count">
                        {actionableDone} de {actionable.length}
                        <span> resolvidas</span>
                      </p>
                      <div className="daily-bar" role="progressbar" aria-valuemin={0} aria-valuemax={actionable.length} aria-valuenow={actionableDone}>
                        <i style={{ width: `${(actionableDone / actionable.length) * 100}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="daily-count">
                      Tudo em dia<span> · nada pendente</span>
                    </p>
                  )}
                  <p className="daily-streak">
                    {streak > 0 ? (
                      <>
                        <i className="fa-solid fa-fire" /> {streak} {streak === 1 ? 'dia' : 'dias'} sem urgência parada
                      </>
                    ) : (
                      'Zere as urgentes para começar sua sequência'
                    )}
                  </p>
                </div>
              )}
            </div>

            {focus && (
              <FocusCard
                action={focus}
                position={focusPosition}
                total={pendingFocus.length}
                stepsDone={stepsDone(focus)}
                showAccount={allMode}
                onToggleStep={(index) => toggleStep(focus, index, focus.steps.length)}
                onDone={() => setDoneFlag(focus.accountId, focus.id, true)}
                onNext={() => setFocusIndex((index) => index + 1)}
                onOpen={focus.campaign && !allMode ? () => setSelectedId(focus.campaign!.id) : undefined}
                onExplain={() => explain(focus)}
                tools={renderTools(focus)}
                assignee={renderAssignee(focus)}
              />
            )}

            {items.length > 0 && (
              <div className="plan-toolbar surface-card">
                <div className="seg" role="group" aria-label="Prioridade">
                  {(['all', ...ORDER] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`seg-btn ${priorityFilter === value ? 'seg-btn-active' : ''}`}
                      onClick={() => setPriorityFilter(value)}
                      aria-pressed={priorityFilter === value}
                    >
                      {value === 'all' ? 'Todas' : PRIORITY_META[value].label}
                    </button>
                  ))}
                </div>
                <select
                  className="plan-select"
                  value={kindFilter}
                  onChange={(event) => setKindFilter(event.target.value as 'all' | ActionKind)}
                  aria-label="Tipo de ação"
                >
                  <option value="all">Tipo: todos</option>
                  {(Object.keys(KIND_LABEL) as ActionKind[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABEL[kind]}
                    </option>
                  ))}
                </select>
                <select
                  className="plan-select"
                  value={groupMode}
                  onChange={(event) => setGroupMode(event.target.value as GroupMode)}
                  aria-label="Agrupar por"
                >
                  <option value="priority">Agrupar: prioridade</option>
                  <option value="campaign">Agrupar: campanha</option>
                  <option value="impact">Ordenar: maior impacto</option>
                </select>
                {actionsState && (
                  <select
                    className="plan-select"
                    value={ownerFilter}
                    onChange={(event) => setOwnerFilter(event.target.value as 'all' | 'mine' | 'none')}
                    aria-label="Responsável"
                  >
                    <option value="all">Responsável: todos</option>
                    <option value="mine">Só as minhas</option>
                    <option value="none">Sem dono</option>
                  </select>
                )}
                <input
                  className="plan-search"
                  type="search"
                  placeholder="Buscar campanha ou ação…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Buscar ações"
                />
                <button type="button" className="chip-btn" onClick={() => setHideDone((v) => !v)} aria-pressed={hideDone}>
                  <i className={`fa-solid ${hideDone ? 'fa-eye' : 'fa-eye-slash'}`} />
                  {hideDone ? 'Mostrar feitas' : 'Esconder feitas'}
                </button>
              </div>
            )}

            {!items.length && (
              <div className="surface-card p-8 text-center">
                <i className="fa-solid fa-circle-check text-3xl text-emerald-400" />
                <p className="mt-3 font-medium text-zinc-200">Nada para fazer por enquanto</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Nenhuma campanha precisa de ação neste período. Volte amanhã ou escolha um período maior.
                </p>
              </div>
            )}

            {items.length > 0 && !visible.length && (
              <div className="surface-card p-8 text-center">
                <i className="fa-solid fa-filter-circle-xmark text-3xl text-zinc-500" />
                <p className="mt-3 font-medium text-zinc-200">Nenhuma ação com esses filtros</p>
                {filtersActive && (
                  <button
                    type="button"
                    className="chip-btn mt-3"
                    onClick={() => {
                      setPriorityFilter('all')
                      setKindFilter('all')
                      setSearch('')
                    }}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            )}

            {groups.map((group, groupIndex) => (
              <Reveal key={group.key} index={3 + groupIndex}>
                <div className="action-group">
                  <div className="action-group-head">
                    {groupMode === 'priority' ? (
                      <span className={`action-badge action-badge-${group.tone}`}>{group.label}</span>
                    ) : (
                      <span className="group-label">{group.label}</span>
                    )}
                    <span className="text-xs text-zinc-600">{group.hint}</span>
                    <span className="ml-auto text-xs text-zinc-600">{group.items.length}</span>
                  </div>
                  <div className="space-y-3">{group.items.map(renderCard)}</div>
                </div>
              </Reveal>
            ))}

            {snoozedItems.length > 0 && (
              <details className="snoozed-box">
                <summary>
                  <i className="fa-solid fa-clock" /> Adiadas ({snoozedItems.length})
                </summary>
                <ul>
                  {snoozedItems.map((item) => (
                    <li key={item.key}>
                      <span className="snoozed-title">{item.title}</span>
                      <small>volta {formatSnoozeDate(snoozeMap.get(item.key) ?? '')}</small>
                      <button
                        type="button"
                        className="chip-btn"
                        onClick={() => void guarded(() => snoozeAction(item.accountId, item.id, null))}
                      >
                        Voltar agora
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {!allMode && <ResultsSection results={results} />}

          {!allMode && (
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
          )}

          {actionsState && <AutomationPanel state={actionsState} onChanged={refreshState} />}
        </>
      )}

      {metaDialog && (
        <MetaActionDialog
          kind={metaDialog.kind}
          campaign={{ id: metaDialog.item.campaign!.id, name: metaDialog.item.campaign!.name }}
          accountName={metaDialog.item.accountName}
          onClose={() => setMetaDialog(null)}
          onApplied={() => {
            // a alteração foi feita: conta como ação feita e os números são relidos
            setDoneFlag(metaDialog.item.accountId, metaDialog.item.id, true)
            void queryClient.invalidateQueries({ queryKey: ['meta-insights'] })
          }}
          onUndone={() => {
            setDoneFlag(metaDialog.item.accountId, metaDialog.item.id, false)
            void queryClient.invalidateQueries({ queryKey: ['meta-insights'] })
          }}
        />
      )}

      {selected && data && bundle && (
        <CampaignDetail
          item={selected}
          level="campaigns"
          data={data}
          averages={bundle.summary.averages}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

const PERIOD_PHRASE: Record<string, string> = {
  today: 'Hoje',
  last7: 'Nos últimos 7 dias',
  last30: 'Nos últimos 30 dias',
  this_month: 'Neste mês',
}
