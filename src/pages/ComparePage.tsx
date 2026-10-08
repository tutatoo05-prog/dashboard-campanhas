import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAdAccounts, fetchMetaInsights } from '@/services/dataService.ts'
import {
  COMPARE_PRESETS,
  getComparePreset,
  buildCompareSummary,
  buildCampaignCompareRows,
  formatDeltaPercent,
} from '@/lib/compare.js'
import { pushRecentAccount, sortAccountsByRecent } from '@/lib/recentAccounts.ts'
import { getAccountTheme } from '@/lib/accountTheme.ts'
import { useAccountThemeStore } from '@/store/accountThemeStore.ts'
import { usePlatformStore } from '@/store/platformStore.ts'
import { PlatformSelect } from '@/components/layout/PlatformSelect.tsx'
import { PlatformComingSoon } from '@/components/layout/PlatformComingSoon.tsx'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format.ts'
import type { CampaignItem, Period } from '@/types'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'

interface CompareMetric {
  key: string
  label: string
  icon: string
  currentLabel: string
  previousLabel: string
  tone: 'up' | 'down' | 'neutral'
  deltaLabel: string
}

interface CompareRow {
  id: string
  name: string
  status: string
  current: CampaignItem | null
  previous: CampaignItem | null
  missingInCurrent?: boolean
  spendDelta: { percent: number }
  leadsDelta: { percent: number }
  cplDelta: { percent: number }
  ctrDelta: { percent: number }
  spendTone: 'up' | 'down' | 'neutral'
  leadsTone: 'up' | 'down' | 'neutral'
  cplTone: 'up' | 'down' | 'neutral'
  ctrTone: 'up' | 'down' | 'neutral'
}

function toneClass(tone: string): string {
  if (tone === 'up') return 'compare-delta-up'
  if (tone === 'down') return 'compare-delta-down'
  return 'compare-delta-neutral'
}

function toneIcon(tone: string): string {
  if (tone === 'up') return 'fa-arrow-trend-up'
  if (tone === 'down') return 'fa-arrow-trend-down'
  return 'fa-minus'
}

function toneWord(tone: string): string {
  if (tone === 'up') return 'Melhor'
  if (tone === 'down') return 'Pior'
  return 'Estável'
}

function MetricCell({
  currentLabel,
  previousLabel,
  delta,
  invert = false,
}: {
  currentLabel: string
  previousLabel: string
  delta: { percent: number }
  invert?: boolean
}) {
  const formatted = formatDeltaPercent(delta, { invert }) as { tone: 'up' | 'down' | 'neutral'; label: string }
  const hasChange = Math.abs(delta.percent) >= 0.05

  return (
    <div className="compare-metric-cell">
      <div className="compare-metric-pair">
        <div className="compare-metric-side">
          <span className="compare-metric-caption">Agora</span>
          <span className="compare-metric-now">{currentLabel}</span>
        </div>
        <div className="compare-metric-side compare-metric-side-prev">
          <span className="compare-metric-caption">Antes</span>
          <span className="compare-metric-was">{previousLabel}</span>
        </div>
      </div>
      <span className={`compare-metric-change ${toneClass(formatted.tone)}`}>
        {hasChange && <i className={`fa-solid ${toneIcon(formatted.tone)}`} />}
        {hasChange ? formatted.label : 'igual'}
      </span>
    </div>
  )
}

export default function ComparePage() {
  const [presetKey, setPresetKey] = useState('last7_prev7')
  const [accountId, setAccountId] = useState<string | null>(null)
  const preset = getComparePreset(presetKey)
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

  const currentQuery = useQuery({
    queryKey: ['meta-insights', resolvedAccountId, preset.current],
    queryFn: () => fetchMetaInsights(preset.current as Period, resolvedAccountId),
    enabled: isMeta && Boolean(resolvedAccountId),
    retry: false,
  })

  const previousQuery = useQuery({
    queryKey: ['meta-insights', resolvedAccountId, preset.previous],
    queryFn: () => fetchMetaInsights(preset.previous as Period, resolvedAccountId),
    enabled: isMeta && Boolean(resolvedAccountId),
    retry: false,
  })

  const currentCampaigns = (currentQuery.data?.campaigns ?? []) as CampaignItem[]
  const previousCampaigns = (previousQuery.data?.campaigns ?? []) as CampaignItem[]

  const metrics = useMemo(
    () => buildCompareSummary(currentCampaigns, previousCampaigns) as CompareMetric[],
    [currentCampaigns, previousCampaigns],
  )

  const rows = useMemo(
    () => buildCampaignCompareRows(currentCampaigns, previousCampaigns) as CompareRow[],
    [currentCampaigns, previousCampaigns],
  )

  function handleAccountChange(id: string) {
    setAccountId(id)
    pushRecentAccount(id)
  }

  const isLoading = accountsQuery.isLoading || currentQuery.isLoading || previousQuery.isLoading
  const loadError = accountsQuery.error ?? currentQuery.error ?? previousQuery.error

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="hero-panel p-6 sm:p-8">
        <p className="section-label">Análise temporal</p>
        <Typewriter as="h2" className="section-title mt-1" text="Comparar períodos" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Valor atual em destaque, variação em relação ao período anterior — veja rápido se a
          conta está melhorando ou piorando.
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
            value={presetKey}
            onChange={(event) => setPresetKey(event.target.value)}
          >
            {Object.entries(COMPARE_PRESETS).map(([key, item]) => (
              <option key={key} value={key}>
                {(item as { label: string }).label}
              </option>
            ))}
          </select>
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

      {isMeta && (
        <div className="compare-period-bar">
          <div className="compare-period-item">
            <span className="compare-period-dot compare-period-dot-current" />
            <div>
              <p className="compare-period-caption">Período atual</p>
              <p className="compare-period-value">{preset.currentLabel}</p>
            </div>
          </div>
          <div className="compare-period-vs">vs</div>
          <div className="compare-period-item">
            <span className="compare-period-dot compare-period-dot-previous" />
            <div>
              <p className="compare-period-caption">Período anterior</p>
              <p className="compare-period-value">{preset.previousLabel}</p>
            </div>
          </div>
        </div>
      )}

      {isMeta && isLoading && !loadError && (
        <section className="surface-card p-12 text-center text-sm text-zinc-500">
          Comparando períodos...
        </section>
      )}

      {isMeta && !isLoading && !loadError && (
        <>
          <div className="kpi-scroll">
            {metrics.map((metric) => (
              <article key={metric.key} className="kpi-card compare-kpi">
                <div className="flex items-center justify-between gap-2">
                  <div className="kpi-icon">
                    <i className={`fa-solid ${metric.icon}`} />
                  </div>
                  <span className={`compare-tone-tag ${toneClass(metric.tone)}`}>
                    {toneWord(metric.tone)}
                  </span>
                </div>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {metric.label}
                </p>
                <p className="font-display mt-1 text-2xl font-semibold text-zinc-50">
                  {metric.currentLabel}
                </p>
                <div className={`compare-kpi-delta ${toneClass(metric.tone)}`}>
                  <i className={`fa-solid ${toneIcon(metric.tone)}`} />
                  <span>{metric.deltaLabel}</span>
                </div>
                <p className="compare-kpi-prev">
                  <span className="compare-kpi-prev-label">Anterior</span>
                  <span className="compare-kpi-prev-value">{metric.previousLabel}</span>
                </p>
              </article>
            ))}
            {!metrics.length && (
              <p className="col-span-full py-6 text-center text-sm text-zinc-600">
                Sem dados para comparar neste período.
              </p>
            )}
          </div>

          <section className="space-y-4">
            <div>
              <p className="section-label">Campanhas</p>
              <h3 className="section-title mt-1">Variação por campanha</h3>
              <p className="mt-1 text-sm text-zinc-500">Compare o valor de agora com o de antes em cada métrica.</p>
            </div>

            <div className="surface-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 bg-zinc-950/60 text-xs tracking-wide text-zinc-500 uppercase">
                      <th className="sticky left-0 z-10 bg-zinc-950 px-4 py-3">Campanha</th>
                      <th className="px-3 py-3">Gasto</th>
                      <th className="px-3 py-3">Leads</th>
                      <th className="px-3 py-3">CPL</th>
                      <th className="px-3 py-3">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/20">
                        <td className="sticky left-0 z-10 bg-zinc-950/95 px-4 py-3 backdrop-blur-sm">
                          <p className="font-medium text-zinc-100">{row.name}</p>
                          <p className="text-xs text-zinc-500">
                            {row.missingInCurrent ? 'Só no período anterior' : (row.status ?? '')}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <MetricCell
                            currentLabel={row.current ? formatCurrency(row.current.spend) : '—'}
                            previousLabel={row.previous ? formatCurrency(row.previous.spend) : '—'}
                            delta={row.spendDelta}
                            invert
                          />
                        </td>
                        <td className="px-3 py-3">
                          <MetricCell
                            currentLabel={row.current ? formatNumber(row.current.leads) : '—'}
                            previousLabel={row.previous ? formatNumber(row.previous.leads) : '—'}
                            delta={row.leadsDelta}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <MetricCell
                            currentLabel={row.current?.leads ? formatCurrency(row.current.cpl) : '—'}
                            previousLabel={row.previous?.leads ? formatCurrency(row.previous.cpl) : '—'}
                            delta={row.cplDelta}
                            invert
                          />
                        </td>
                        <td className="px-3 py-3">
                          <MetricCell
                            currentLabel={row.current ? formatPercent(row.current.ctr) : '—'}
                            previousLabel={row.previous ? formatPercent(row.previous.ctr) : '—'}
                            delta={row.ctrDelta}
                          />
                        </td>
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-zinc-600">
                          Nenhuma campanha nos períodos selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
