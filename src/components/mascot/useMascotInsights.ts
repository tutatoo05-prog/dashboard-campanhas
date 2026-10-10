import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAdAccounts, fetchMetaInsights } from '@/services/dataService.ts'
import { computeSummary } from '@/lib/analysis.js'
import { buildActions, buildBriefing, type ActionItem, type Totals } from '@/lib/actions.ts'
import { sortAccountsByRecent } from '@/lib/recentAccounts.ts'
import type { CampaignItem, EnrichedCampaignItem } from '@/types'

/** Mesma chave que a Central de Ações usa pra marcar "feito" (zera todo dia). */
export function readDoneActions(accountId: string | null): Set<string> {
  const day = new Date().toISOString().slice(0, 10)
  try {
    const raw = JSON.parse(localStorage.getItem(`dash-actions-done:${accountId ?? 'none'}:${day}`) || '[]')
    return new Set(Array.isArray(raw) ? raw.map(String) : [])
  } catch {
    return new Set()
  }
}

export interface MascotInsights {
  loading: boolean
  ready: boolean
  accountId: string | null
  actions: ActionItem[]
  briefing: string[]
}

/**
 * Dá ao Tatu a mesma leitura dos números que a Central de Ações faz (7 dias contra os 7 anteriores).
 * Usa as mesmas chaves de cache da página, então não duplica as chamadas à Meta.
 */
export function useMascotInsights(active: boolean): MascotInsights {
  const accountsQuery = useQuery({ queryKey: ['ad-accounts'], queryFn: fetchAdAccounts, retry: false, enabled: active })
  const accounts = useMemo(() => sortAccountsByRecent(accountsQuery.data?.accounts ?? []), [accountsQuery.data])
  const accountId = accountsQuery.data?.defaultAccountId ?? accounts[0]?.id ?? null

  const insightsQuery = useQuery({
    queryKey: ['meta-insights', accountId, 'last7', undefined, undefined],
    queryFn: () => fetchMetaInsights('last7', accountId, {}),
    enabled: active && Boolean(accountId),
    retry: false,
  })

  const previousQuery = useQuery({
    queryKey: ['meta-insights', accountId, 'prev7'],
    queryFn: () => fetchMetaInsights('prev7', accountId, {}),
    enabled: active && Boolean(accountId),
    retry: false,
  })

  const data = insightsQuery.data

  return useMemo<MascotInsights>(() => {
    const campaigns = (data?.campaigns ?? []) as CampaignItem[]
    if (!data || !campaigns.length) {
      return { loading: insightsQuery.isLoading, ready: false, accountId, actions: [], briefing: [] }
    }
    const summary = computeSummary(campaigns, { dailyByCampaign: data.dailyByCampaign })
    const enriched = (summary.enriched ?? []) as EnrichedCampaignItem[]
    const totals = summary.totals as Totals
    const previousItems = (previousQuery.data?.campaigns ?? []) as CampaignItem[]
    const previousTotals =
      previousQuery.data && previousItems.length
        ? (computeSummary(previousItems, { dailyByCampaign: previousQuery.data.dailyByCampaign }).totals as Totals)
        : null
    const actions = buildActions(enriched, { totals, previousTotals, ads: (data.ads ?? []) as CampaignItem[] })
    const briefing = buildBriefing(totals, previousTotals, enriched, actions, 'Nos últimos 7 dias')
    return { loading: false, ready: true, accountId, actions, briefing }
  }, [data, previousQuery.data, insightsQuery.isLoading, accountId])
}
