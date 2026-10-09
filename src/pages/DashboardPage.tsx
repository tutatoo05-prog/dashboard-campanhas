import { useEffect, useMemo, useState } from 'react'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { useQuery } from '@tanstack/react-query'
import { fetchAdAccounts, fetchMetaInsights } from '@/services/dataService.ts'
import { fetchPurchases } from '@/services/purchaseService.ts'
import { computeSummary, buildInsights, TONE_CLASSES } from '@/lib/analysis.js'
import { pushRecentAccount, sortAccountsByRecent } from '@/lib/recentAccounts.ts'
import { formatCurrency, formatNumber, formatPercent, formatDecimal } from '@/lib/format.ts'
import { defaultCustomRange } from '@/lib/period.ts'
import { aggregateDailySeries } from '@/lib/dailySeries.ts'
import { TrendCharts } from '@/components/charts/TrendCharts.tsx'
import { GoalCard } from '@/components/goals/GoalCard.tsx'
import { KpiCard, KpiSkeletons } from '@/components/dashboard/KpiCard.tsx'
import { Reveal } from '@/components/mascot/Reveal.tsx'
import { CampaignDetail } from '@/components/campaign/CampaignDrawer.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { exportCsv } from '@/lib/csv.ts'
import { getDisplayName, getGreeting } from '@/lib/userDisplay.ts'
import { getAccountTheme } from '@/lib/accountTheme.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useAccountThemeStore } from '@/store/accountThemeStore.ts'
import { usePlatformStore } from '@/store/platformStore.ts'
import { PlatformSelect } from '@/components/layout/PlatformSelect.tsx'
import { PlatformComingSoon } from '@/components/layout/PlatformComingSoon.tsx'
import type { CampaignItem, EnrichedCampaignItem, InsightCard, Level, Period, Purchase } from '@/types'

interface CampaignSalesRow {
  campaignId: string
  name: string
  spend: number
  sales: number
  revenue: number
  revenueCount: number
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Melhor campanha para uma venda: match exato primeiro, senão o nome mais próximo em tamanho. */
function bestMatchCampaign(campaigns: CampaignItem[], purchaseCampanha: string): CampaignItem | null {
  const target = normalizeName(purchaseCampanha)
  if (!target) return null

  let best: CampaignItem | null = null
  let bestScore = -Infinity

  for (const campaign of campaigns) {
    const name = normalizeName(campaign.name)
    if (!name) continue
    if (name === target) return campaign

    if (name.includes(target) || target.includes(name)) {
      const score = -Math.abs(name.length - target.length)
      if (score > bestScore) {
        bestScore = score
        best = campaign
      }
    }
  }

  return best
}

function matchSalesToCampaigns(campaigns: CampaignItem[], purchases: Purchase[]): CampaignSalesRow[] {
  const rows = new Map<string, CampaignSalesRow>(
    campaigns.map((campaign) => [
      campaign.id,
      { campaignId: campaign.id, name: campaign.name, spend: campaign.spend, sales: 0, revenue: 0, revenueCount: 0 },
    ]),
  )

  for (const purchase of purchases) {
    const match = bestMatchCampaign(campaigns, String(purchase.campanha ?? ''))
    if (!match) continue

    const row = rows.get(match.id)
    if (!row) continue

    row.sales += 1
    if (typeof purchase.valor === 'number') {
      row.revenue += purchase.valor
      row.revenueCount += 1
    }
  }

  return [...rows.values()].filter((row) => row.sales > 0 || row.spend > 0).sort((a, b) => b.sales - a.sales)
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last7', label: 'Últimos 7 dias' },
  { value: 'last30', label: 'Últimos 30 dias' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'prev7', label: '7 dias anteriores' },
  { value: 'prev30', label: '30 dias anteriores' },
  { value: 'custom', label: 'Personalizado' },
]

/** Período usado como base de comparação nos KPIs. */
const PREVIOUS_PERIOD: Partial<Record<Period, Period>> = {
  today: 'yesterday',
  last7: 'prev7',
  last30: 'prev30',
  this_month: 'last_month',
}

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'campaigns', label: 'Campanhas' },
  { value: 'adSets', label: 'Conjuntos' },
  { value: 'ads', label: 'Anúncios' },
]

const INSIGHT_TONE_CLASSES: Record<InsightCard['tone'], string> = {
  success: 'border-amber-500/25 bg-amber-500/[0.06]',
  danger: 'border-red-500/25 bg-red-500/[0.06]',
  info: 'border-zinc-700/60 bg-zinc-900/60',
  neutral: 'border-zinc-800/60 bg-zinc-900/40',
}

const INSIGHT_VALUE_CLASSES: Record<InsightCard['tone'], string> = {
  success: 'text-amber-200',
  danger: 'text-red-300',
  info: 'text-zinc-200',
  neutral: 'text-zinc-400',
}

function VerdictBadge({ item }: { item: EnrichedCampaignItem }) {
  const tag = item.analysis.primary
  const classes = TONE_CLASSES[tag.tone as keyof typeof TONE_CLASSES] ?? TONE_CLASSES.warning
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {tag.emoji} {tag.label}
    </span>
  )
}

type SortKey = 'score' | 'name' | 'spend' | 'ctr' | 'leads' | 'cpl'
type RankFilter = 'all' | 'active' | 'attention'

const RANK_FILTERS: { value: RankFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Ativas' },
  { value: 'attention', label: 'Precisam de ação' },
]

function SortHeader({
  label,
  field,
  sort,
  onSort,
  align = 'right',
}: {
  label: string
  field: SortKey
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sort.key === field
  return (
    <th
      className={`px-4 py-2 font-medium ${align === 'right' ? 'text-right' : ''}`}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className={`th-sort ${active ? 'th-sort-active' : ''}`} onClick={() => onSort(field)}>
        {label}
        <i className={`fa-solid ${active ? (sort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`} />
      </button>
    </th>
  )
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const [period, setPeriod] = useState<Period>('last7')
  const [level, setLevel] = useState<Level>('campaigns')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [customRange, setCustomRange] = useState(defaultCustomRange())
  const platform = usePlatformStore((state) => state.platform)
  const isMeta = platform === 'meta'

  const accountsQuery = useQuery({
    queryKey: ['ad-accounts'],
    queryFn: fetchAdAccounts,
    retry: false,
    enabled: isMeta,
  })

  const accounts = useMemo(
    () => sortAccountsByRecent(accountsQuery.data?.accounts ?? []),
    [accountsQuery.data],
  )

  const resolvedAccountId =
    accountId ?? accountsQuery.data?.defaultAccountId ?? accounts[0]?.id ?? null

  const selectedAccountName = accounts.find((account) => account.id === resolvedAccountId)?.name
  const accountTheme = getAccountTheme(selectedAccountName)

  const setActiveAccountTheme = useAccountThemeStore((state) => state.setAccountName)
  useEffect(() => {
    if (selectedAccountName) setActiveAccountTheme(selectedAccountName)
  }, [selectedAccountName, setActiveAccountTheme])

  const rangeReady = period !== 'custom' || Boolean(customRange.since && customRange.until)

  const insightsQuery = useQuery({
    queryKey: ['meta-insights', resolvedAccountId, period, customRange.since, customRange.until],
    queryFn: () =>
      fetchMetaInsights(period, resolvedAccountId, period === 'custom' ? customRange : {}),
    enabled: isMeta && Boolean(resolvedAccountId) && rangeReady,
    retry: false,
  })

  const items = useMemo(
    () => (insightsQuery.data?.[level] ?? []) as CampaignItem[],
    [insightsQuery.data, level],
  )

  const summary = useMemo(
    () => computeSummary(items, { dailyByCampaign: insightsQuery.data?.dailyByCampaign }),
    [items, insightsQuery.data],
  )

  const insightCards = useMemo(
    () => buildInsights(items, { dailyByCampaign: insightsQuery.data?.dailyByCampaign }) as InsightCard[],
    [items, insightsQuery.data],
  )

  const allRanked = (summary.enriched ?? []) as EnrichedCampaignItem[]

  const [search, setSearch] = useState('')
  const [rankFilter, setRankFilter] = useState<RankFilter>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function handleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' || key === 'cpl' ? 'asc' : 'desc' },
    )
  }

  const ranked = useMemo(() => {
    const term = normalizeName(search)
    const list = allRanked.filter((item) => {
      if (term && !normalizeName(item.name).includes(term)) return false
      if (rankFilter === 'active') return item.status === 'Ativa'
      if (rankFilter === 'attention') return ['pause', 'fix'].includes(item.analysis.verdict)
      return true
    })

    const value = (item: EnrichedCampaignItem): number | string => {
      if (sort.key === 'score') return item.analysis.score
      if (sort.key === 'name') return item.name.toLowerCase()
      // CPL sem leads vai para o fim, qualquer que seja a direção.
      if (sort.key === 'cpl') return item.leads > 0 ? item.cpl : sort.dir === 'asc' ? Infinity : -Infinity
      return item[sort.key] as number
    }

    return [...list].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      if (va === vb) return 0
      const result = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) < (vb as number) ? -1 : 1
      return sort.dir === 'asc' ? result : -result
    })
  }, [allRanked, search, rankFilter, sort])

  const selectedItem = selectedId ? (allRanked.find((item) => item.id === selectedId) ?? null) : null

  const dailySeries = useMemo(
    () => aggregateDailySeries(insightsQuery.data?.dailyByCampaign),
    [insightsQuery.data],
  )

  const previousPeriod = PREVIOUS_PERIOD[period]
  const previousQuery = useQuery({
    queryKey: ['meta-insights', resolvedAccountId, previousPeriod],
    queryFn: () => fetchMetaInsights(previousPeriod as Period, resolvedAccountId, {}),
    enabled: isMeta && Boolean(resolvedAccountId) && Boolean(previousPeriod),
    retry: false,
  })

  const previousTotals = useMemo(() => {
    const prevItems = (previousQuery.data?.[level] ?? []) as CampaignItem[]
    if (!previousQuery.data || !prevItems.length) return null
    return computeSummary(prevItems, { dailyByCampaign: previousQuery.data.dailyByCampaign }).totals
  }, [previousQuery.data, level])

  const purchasesQuery = useQuery({
    queryKey: ['purchases'],
    queryFn: fetchPurchases,
    retry: false,
  })

  const salesByCampaign = useMemo(() => {
    const campaigns = (insightsQuery.data?.campaigns ?? []) as CampaignItem[]
    return matchSalesToCampaigns(campaigns, purchasesQuery.data ?? [])
  }, [insightsQuery.data, purchasesQuery.data])

  function handleAccountChange(id: string) {
    setAccountId(id)
    pushRecentAccount(id)
  }

  const isLoading = accountsQuery.isLoading || (insightsQuery.isLoading && rangeReady)
  const loadError = accountsQuery.error ?? insightsQuery.error

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">{getGreeting()}, {getDisplayName(user)}</p>
        <Typewriter as="h2" className="section-title mt-1" text="Visão geral das campanhas" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Acompanhe performance, identifique a campanha que mais traz resultado e receba
          recomendações automáticas sobre onde investir mais, corrigir ou pausar.
        </p>
      </PageHero>

      <section
        className="surface-card filter-bar flex flex-wrap items-center gap-3 p-4"
        data-tour="Filtros"
        data-tour-text="Escolha a plataforma, a conta de anúncios, o período e o nível (campanhas, conjuntos ou anúncios). Tudo abaixo se ajusta na hora."
      >
        <PlatformSelect />

        {isMeta && (
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${accountTheme.dot}`}
              title={selectedAccountName ?? ''}
            />
            <select
              className={`rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:ring-2 focus:outline-none ${accountTheme.ring}`}
              value={resolvedAccountId ?? ''}
              onChange={(event) => handleAccountChange(event.target.value)}
              disabled={!accounts.length}
            >
              {!accounts.length && <option value="">Nenhuma conta disponível</option>}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {isMeta && (
          <select
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
            value={period}
            onChange={(event) => setPeriod(event.target.value as Period)}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {isMeta && period === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              value={customRange.since}
              max={customRange.until}
              onChange={(event) =>
                setCustomRange((prev) => ({ ...prev, since: event.target.value }))
              }
            />
            <span className="text-zinc-600">—</span>
            <input
              type="date"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              value={customRange.until}
              min={customRange.since}
              onChange={(event) =>
                setCustomRange((prev) => ({ ...prev, until: event.target.value }))
              }
            />
          </div>
        )}

        {isMeta && (
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
            {LEVEL_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setLevel(option.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  level === option.value
                    ? 'bg-gold-dim text-gold'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {!isMeta && <PlatformComingSoon />}

      {isMeta && loadError && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {(loadError as Error).message === 'SESSION_EXPIRED'
            ? 'Sua sessão expirou. Faça login novamente.'
            : (loadError as Error).message || 'Não foi possível carregar os dados da Meta.'}
        </section>
      )}

      {isMeta && isLoading && !loadError && (
        <div className="space-y-6" aria-busy="true" aria-label="Carregando dados da conta">
          <KpiSkeletons />
          <div className="surface-card p-5">
            <div className="skeleton mb-4 h-3 w-32" />
            <div className="skeleton h-40 w-full" />
          </div>
        </div>
      )}

      {isMeta && !isLoading && !loadError && insightsQuery.data && (
        <>
          <Reveal index={0}>
            <section
              className="kpi-grid"
              data-tour="Números do período"
              data-tour-text="Investimento, cliques, CTR, CPC, leads e custo por lead. A setinha compara com o período anterior (verde melhorou, vermelho piorou) e a linha mostra a evolução dia a dia."
            >
              <KpiCard
                accent
                label="Investimento"
                icon="fa-coins"
                value={summary.totals.spend}
                format={formatCurrency}
                previous={previousTotals?.spend}
                higherIsBetter={null}
                spark={dailySeries.map((d) => d.spend)}
              />
              <KpiCard
                label="Leads"
                icon="fa-users"
                value={summary.totals.leads}
                format={formatNumber}
                previous={previousTotals?.leads}
                spark={dailySeries.map((d) => d.leads)}
              />
              <KpiCard
                label="Custo por lead"
                icon="fa-tag"
                value={summary.totals.cpl}
                format={formatCurrency}
                previous={previousTotals?.cpl}
                higherIsBetter={false}
                spark={dailySeries.filter((d) => d.cpl != null).map((d) => d.cpl as number)}
              />
              <KpiCard
                label="Cliques"
                icon="fa-arrow-pointer"
                value={summary.totals.clicks}
                format={formatNumber}
                previous={previousTotals?.clicks}
              />
              <KpiCard
                label="CTR"
                icon="fa-bullseye"
                value={summary.totals.ctr}
                format={formatPercent}
                previous={previousTotals?.ctr}
              />
              <KpiCard
                label="CPC médio"
                icon="fa-hand-pointer"
                value={summary.totals.cpc}
                format={formatCurrency}
                previous={previousTotals?.cpc}
                higherIsBetter={false}
              />
            </section>
          </Reveal>

          <Reveal
            index={1}
            tour="Meta do mês"
            tourText="Acompanhe quanto do orçamento e dos leads da meta já foi usado neste mês. Admins podem ajustar a meta."
          >
            <GoalCard accountId={resolvedAccountId} />
          </Reveal>

          <Reveal
            index={2}
            tour="Tendência diária"
            tourText="Investimento, leads e custo por lead dia a dia. Passe o mouse nos gráficos pra ver o valor de cada dia."
          >
            <TrendCharts data={dailySeries} />
          </Reveal>

          <Reveal
            as="section"
            index={3}
            tour="Recomendações"
            tourText="Leituras automáticas das campanhas: o que está funcionando, o que está caro e onde vale agir."
          >
            <p className="section-label">Análise automática</p>
            <h3 className="section-title mt-1 mb-3">Recomendações da IA</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {insightCards.map((card) => (
                <div
                  key={card.title}
                  className={`surface-card rounded-2xl border p-4 ${INSIGHT_TONE_CLASSES[card.tone]} ${
                    card.fullWidth ? 'sm:col-span-2 xl:col-span-3' : ''
                  }`}
                >
                  <p className="section-label">{card.title}</p>
                  <p className={`mt-1 text-sm font-semibold ${INSIGHT_VALUE_CLASSES[card.tone]}`}>
                    {card.value}
                  </p>
                  {card.detail && <p className="mt-1 text-xs text-zinc-500">{card.detail}</p>}
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal
            as="section"
            index={4}
            className="surface-card overflow-hidden"
            tour="Ranking"
            tourText="Cada campanha com nota, veredito e custo por lead. Clique nos cabeçalhos pra ordenar e exporte em CSV."
          >
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="section-label">Ranking</p>
                <h3 className="section-title mt-1">
                  {LEVEL_OPTIONS.find((option) => option.value === level)?.label} por performance
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-600">
                  {ranked.length === allRanked.length ? `${ranked.length} itens` : `${ranked.length} de ${allRanked.length}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    exportCsv(
                      `ranking-${level}-${period}.csv`,
                      ['Nome', 'Status', 'Veredito', 'Gasto', 'CTR', 'Leads', 'CPL', 'Nota'],
                      ranked.map((item) => [
                        item.name,
                        item.status,
                        item.analysis.primary.label,
                        item.spend,
                        item.ctr,
                        item.leads,
                        item.leads > 0 ? item.cpl : '',
                        item.analysis.score,
                      ]),
                    )
                  }
                  className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                >
                  <i className="fa-solid fa-download mr-1.5" />
                  Exportar CSV
                </button>
              </div>
            </div>

            <div className="rank-toolbar">
              <div className="rank-search">
                <i className="fa-solid fa-magnifying-glass" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar pelo nome…"
                  aria-label="Buscar pelo nome"
                />
              </div>
              <div className="seg" role="group" aria-label="Filtrar">
                {RANK_FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`seg-btn ${rankFilter === option.value ? 'seg-btn-active' : ''}`}
                    onClick={() => setRankFilter(option.value)}
                    aria-pressed={rankFilter === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <span className="hidden text-xs text-zinc-600 md:inline">Clique numa linha para ver os detalhes</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="px-4 py-2 font-medium">#</th>
                    <SortHeader label="Nome" field="name" sort={sort} onSort={handleSort} align="left" />
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Veredito</th>
                    <SortHeader label="Gasto" field="spend" sort={sort} onSort={handleSort} />
                    <SortHeader label="CTR" field="ctr" sort={sort} onSort={handleSort} />
                    <SortHeader label="Leads" field="leads" sort={sort} onSort={handleSort} />
                    <SortHeader label="CPL" field="cpl" sort={sort} onSort={handleSort} />
                    <SortHeader label="Nota" field="score" sort={sort} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((item, index) => (
                    <tr
                      key={item.id}
                      className="row-click border-b border-zinc-900/80 last:border-0"
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') setSelectedId(item.id)
                      }}
                      tabIndex={0}
                    >
                      <td className="px-4 py-2.5 text-zinc-600">{index + 1}</td>
                      <td className="max-w-[240px] truncate px-4 py-2.5 text-zinc-200" title={item.name}>
                        {item.name}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-xs ${
                            item.status === 'Ativa' ? 'text-emerald-400' : 'text-zinc-600'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <VerdictBadge item={item} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-300">
                        {formatCurrency(item.spend)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-300">
                        {formatDecimal(item.ctr)}%
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-300">
                        {formatNumber(item.leads)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-300">
                        {item.leads > 0 ? formatCurrency(item.cpl) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-zinc-200">
                        {item.analysis.score}
                      </td>
                    </tr>
                  ))}
                  {!ranked.length && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-zinc-600">
                        {allRanked.length ? 'Nenhum resultado para esse filtro.' : 'Nenhum dado para o período selecionado.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal
            as="section"
            index={5}
            className="surface-card overflow-hidden"
            tour="Vendas e ROI"
            tourText="Vendas da Hotmart cruzadas com o investimento de cada campanha, pra você ver o retorno de verdade."
          >
            <div className="p-4">
              <p className="section-label">Vendas &amp; ROI</p>
              <h3 className="section-title mt-1">Vendas por campanha</h3>
              <p className="mt-1 text-xs text-zinc-600">
                Cruza as vendas registradas em Compras com o nome da campanha. Vendas não têm
                data confiável para filtrar pelo período — os números de venda são de todo o
                histórico; gasto e CPC/CTR acima são só do período selecionado.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="px-4 py-2 font-medium">Campanha</th>
                    <th className="px-4 py-2 text-right font-medium">Gasto (período)</th>
                    <th className="px-4 py-2 text-right font-medium">Vendas (total)</th>
                    <th className="px-4 py-2 text-right font-medium">Custo por venda</th>
                    <th className="px-4 py-2 text-right font-medium">Receita</th>
                    <th className="px-4 py-2 text-right font-medium">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByCampaign.map((row) => {
                    const costPerSale = row.sales > 0 ? row.spend / row.sales : null
                    const roi = row.revenueCount > 0 && row.spend > 0 ? row.revenue / row.spend : null
                    return (
                      <tr key={row.campaignId} className="border-b border-zinc-900/80 last:border-0">
                        <td className="max-w-[240px] truncate px-4 py-2.5 text-zinc-200" title={row.name}>
                          {row.name}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">
                          {formatCurrency(row.spend)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">
                          {formatNumber(row.sales)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">
                          {costPerSale != null ? formatCurrency(costPerSale) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">
                          {row.revenueCount > 0 ? formatCurrency(row.revenue) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-zinc-200">
                          {roi != null ? `${formatDecimal(roi)}x` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {!salesByCampaign.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
                        Nenhuma venda encontrada para as campanhas deste período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Reveal>
        </>
      )}

      {selectedItem && insightsQuery.data && (
        <CampaignDetail
          item={selectedItem}
          level={level}
          data={insightsQuery.data}
          averages={summary.averages}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
