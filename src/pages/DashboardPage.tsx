import { useEffect, useMemo, useState } from 'react'
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

function StatBadge({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="kpi-card">
      <div className="flex items-center gap-2.5">
        <span className="kpi-icon">
          <i className={`fa-solid ${icon}`} />
        </span>
        <div className="min-w-0">
          <p className="section-label">{label}</p>
          <p className="mt-0.5 truncate text-lg font-semibold text-zinc-50">{value}</p>
        </div>
      </div>
    </div>
  )
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

  const ranked = (summary.enriched ?? []) as EnrichedCampaignItem[]

  const dailySeries = useMemo(
    () => aggregateDailySeries(insightsQuery.data?.dailyByCampaign),
    [insightsQuery.data],
  )

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
      <section className="hero-panel p-6 sm:p-8">
        <p className="section-label">{getGreeting()}, {getDisplayName(user)}</p>
        <h2 className="section-title mt-1">Visão geral das campanhas</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Acompanhe performance, identifique a campanha que mais traz resultado e receba
          recomendações automáticas sobre onde investir mais, corrigir ou pausar.
        </p>
      </section>

      <section className="surface-card flex flex-wrap items-center gap-3 p-4">
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
        <section className="surface-card p-8 text-center text-sm text-zinc-500">
          Carregando dados da conta...
        </section>
      )}

      {isMeta && !isLoading && !loadError && insightsQuery.data && (
        <>
          <section className="kpi-scroll">
            <StatBadge label="Investimento" value={formatCurrency(summary.totals.spend)} icon="fa-coins" />
            <StatBadge label="Cliques" value={formatNumber(summary.totals.clicks)} icon="fa-arrow-pointer" />
            <StatBadge label="CTR" value={formatPercent(summary.totals.ctr)} icon="fa-bullseye" />
            <StatBadge label="CPC médio" value={formatCurrency(summary.totals.cpc)} icon="fa-hand-pointer" />
            <StatBadge label="Interessados (leads)" value={formatNumber(summary.totals.leads)} icon="fa-users" />
            <StatBadge label="Custo por interessado" value={formatCurrency(summary.totals.cpl)} icon="fa-tag" />
          </section>

          <GoalCard accountId={resolvedAccountId} />

          <TrendCharts data={dailySeries} />

          <section>
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
          </section>

          <section className="surface-card overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="section-label">Ranking</p>
                <h3 className="section-title mt-1">
                  {LEVEL_OPTIONS.find((option) => option.value === level)?.label} por performance
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-600">{ranked.length} itens</span>
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

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Veredito</th>
                    <th className="px-4 py-2 text-right font-medium">Gasto</th>
                    <th className="px-4 py-2 text-right font-medium">CTR</th>
                    <th className="px-4 py-2 text-right font-medium">Leads</th>
                    <th className="px-4 py-2 text-right font-medium">CPL</th>
                    <th className="px-4 py-2 text-right font-medium">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((item, index) => (
                    <tr key={item.id} className="border-b border-zinc-900/80 last:border-0">
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
                        Nenhum dado para o período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface-card overflow-hidden">
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
          </section>
        </>
      )}
    </div>
  )
}
