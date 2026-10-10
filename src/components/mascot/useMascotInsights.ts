import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAdAccounts, fetchMetaInsights } from '@/services/dataService.ts'
import { fetchGoal } from '@/services/goalService.ts'
import { computeSummary } from '@/lib/analysis.js'
import { loadSnoozedIds } from '@/lib/actionsProgress.ts'
import { buildActions, buildBriefing, type ActionItem, type GoalPace, type Totals } from '@/lib/actions.ts'
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/format.ts'
import { sortAccountsByRecent } from '@/lib/recentAccounts.ts'
import type { CampaignItem, EnrichedCampaignItem } from '@/types'

/** Mesma chave que a Central de Ações usa pra marcar "feito" (zera todo dia). */
export function readDoneActions(accountId: string | null): Set<string> {
  const day = new Date().toISOString().slice(0, 10)
  try {
    const raw = JSON.parse(localStorage.getItem(`dash-actions-done:${accountId ?? 'none'}:${day}`) || '[]')
    const done = new Set<string>(Array.isArray(raw) ? raw.map(String) : [])
    for (const id of loadSnoozedIds(accountId ?? "none")) done.add(id)
    return done
  } catch {
    return new Set()
  }
}

export function monthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export interface MascotInsights {
  loading: boolean
  ready: boolean
  /** Mensagem de erro ao ler a Meta (sessão expirada não conta). */
  error: string | null
  accountId: string | null
  actions: ActionItem[]
  briefing: string[]
  /** Resumo falado: ontem, comparação com a semana e o que fazer hoje. */
  summary: string[]
  /** Leads do mês corrente, pra marcos. */
  monthLeads: number | null
}

/**
 * Dá ao Tatu a mesma leitura dos números que a Central de Ações faz (7 dias contra os 7 anteriores,
 * mais ontem e a meta do mês). Usa as mesmas chaves de cache das páginas, então não duplica chamadas.
 */
export function useMascotInsights(active: boolean): MascotInsights {
  const accountsQuery = useQuery({ queryKey: ['ad-accounts'], queryFn: fetchAdAccounts, retry: false, enabled: active })
  const accounts = useMemo(() => sortAccountsByRecent(accountsQuery.data?.accounts ?? []), [accountsQuery.data])
  const accountId = accountsQuery.data?.defaultAccountId ?? accounts[0]?.id ?? null
  const enabled = active && Boolean(accountId)

  const insightsQuery = useQuery({
    queryKey: ['meta-insights', accountId, 'last7', undefined, undefined],
    queryFn: () => fetchMetaInsights('last7', accountId, {}),
    enabled,
    retry: false,
  })

  const previousQuery = useQuery({
    queryKey: ['meta-insights', accountId, 'prev7'],
    queryFn: () => fetchMetaInsights('prev7', accountId, {}),
    enabled,
    retry: false,
  })

  const yesterdayQuery = useQuery({
    queryKey: ['meta-insights', accountId, 'yesterday'],
    queryFn: () => fetchMetaInsights('yesterday', accountId, {}),
    enabled,
    retry: false,
  })

  const monthQuery = useQuery({
    queryKey: ['meta-insights', accountId, 'this_month', 'goal-card'],
    queryFn: () => fetchMetaInsights('this_month', accountId),
    enabled,
    retry: false,
  })

  const goalQuery = useQuery({
    queryKey: ['goal', accountId, monthKey()],
    queryFn: () => fetchGoal(accountId as string, monthKey()),
    enabled,
    retry: false,
  })

  const data = insightsQuery.data
  const rawError = (accountsQuery.error ?? insightsQuery.error) as Error | null
  const error = rawError && rawError.message !== 'SESSION_EXPIRED' ? rawError.message : null

  return useMemo<MascotInsights>(() => {
    const monthItems = (monthQuery.data?.campaigns ?? []) as CampaignItem[]
    const monthTotals = monthQuery.data && monthItems.length ? (computeSummary(monthItems).totals as Totals) : null
    const monthLeads = monthTotals ? monthTotals.leads : null

    const campaigns = (data?.campaigns ?? []) as CampaignItem[]
    if (!data || !campaigns.length) {
      return {
        loading: insightsQuery.isLoading,
        ready: false,
        error,
        accountId,
        actions: [],
        briefing: [],
        summary: [],
        monthLeads,
      }
    }

    const summary = computeSummary(campaigns, { dailyByCampaign: data.dailyByCampaign })
    const enriched = (summary.enriched ?? []) as EnrichedCampaignItem[]
    const totals = summary.totals as Totals

    const previousItems = (previousQuery.data?.campaigns ?? []) as CampaignItem[]
    const previousTotals =
      previousQuery.data && previousItems.length
        ? (computeSummary(previousItems, { dailyByCampaign: previousQuery.data.dailyByCampaign }).totals as Totals)
        : null

    const goalTarget = goalQuery.data
    const goal: GoalPace | null =
      goalTarget && monthTotals
        ? {
            spendTarget: goalTarget.spendTarget,
            cplTarget: goalTarget.cplTarget,
            monthSpend: monthTotals.spend,
            monthLeads: monthTotals.leads,
          }
        : null

    const actions = buildActions(enriched, { totals, previousTotals, ads: (data.ads ?? []) as CampaignItem[], goal })
    const briefing = buildBriefing(totals, previousTotals, enriched, actions, 'Nos últimos 7 dias')

    // resumo falado: ontem (comparado à média da semana) + o "para hoje" do briefing
    const yesterdayItems = (yesterdayQuery.data?.campaigns ?? []) as CampaignItem[]
    const yesterday = yesterdayItems.length ? (computeSummary(yesterdayItems).totals as Totals) : null
    const spoken: string[] = []
    if (yesterday && yesterday.spend > 0) {
      let line = `Ontem: ${formatCurrency(yesterday.spend)} investidos e ${formatNumber(yesterday.leads)} leads`
      if (yesterday.leads > 0) line += `, a ${formatCurrency(yesterday.cpl)} cada`
      spoken.push(`${line}.`)
      if (yesterday.leads >= 3 && totals.cpl > 0 && yesterday.cpl > 0) {
        const diff = ((yesterday.cpl - totals.cpl) / totals.cpl) * 100
        if (Math.abs(diff) >= 8) {
          spoken.push(
            `O CPL ficou ${formatDecimal(Math.abs(diff), 0)}% ${diff > 0 ? 'acima' : 'abaixo'} da média da semana.`,
          )
        }
      }
    } else if (briefing[0]) {
      spoken.push(briefing[0])
    }
    const last = briefing[briefing.length - 1]
    if (last && !spoken.includes(last)) spoken.push(last)

    return { loading: false, ready: true, error, accountId, actions, briefing, summary: spoken, monthLeads }
  }, [
    data,
    previousQuery.data,
    yesterdayQuery.data,
    monthQuery.data,
    goalQuery.data,
    insightsQuery.isLoading,
    accountId,
    error,
  ])
}
