import { useEffect, useMemo } from 'react'
import { TONE_CLASSES } from '@/lib/analysis.js'
import { resolveDailySeries } from '@/lib/trends.js'
import { evidenceGap, stepsFor } from '@/lib/actions.ts'
import { formatCurrency, formatDecimal, formatNumber } from '@/lib/format.ts'
import { leadsHint } from '@/lib/leadsHint.ts'
import { TrendCharts } from '@/components/charts/TrendCharts.tsx'
import type { DailyPoint } from '@/lib/dailySeries.ts'
import type { CampaignItem, EnrichedCampaignItem, InsightsData, Level } from '@/types'

interface Averages {
  ctr: number
  cpc: number
  cpl: number
  frequency: number
}

interface CampaignDrawerProps {
  item: EnrichedCampaignItem
  averages: Averages
  series: DailyPoint[]
  children: CampaignItem[]
  childrenLabel: string
  onClose: () => void
}

const VERDICT_TEXT: Record<string, string> = {
  scale: 'Esta campanha merece mais verba.',
  pause: 'Esta campanha está queimando dinheiro.',
  fix: 'Esta campanha tem um ponto fraco claro.',
  wait: 'Ainda é cedo para decidir.',
  monitor: 'Está na média — só acompanhar.',
}

function Compare({ value, avg, lowerIsBetter }: { value: number; avg: number; lowerIsBetter?: boolean }) {
  if (!avg || !value) return <span className="drawer-vs">sem comparação</span>
  const diff = ((value - avg) / avg) * 100
  if (Math.abs(diff) < 3) return <span className="drawer-vs">igual à média da conta</span>
  const better = lowerIsBetter ? diff < 0 : diff > 0
  return (
    <span className={`drawer-vs ${better ? 'drawer-vs-good' : 'drawer-vs-bad'}`}>
      <i className={`fa-solid ${diff > 0 ? 'fa-arrow-up' : 'fa-arrow-down'}`} />
      {formatDecimal(Math.abs(diff), 0)}% {diff > 0 ? 'acima' : 'abaixo'} da média
    </span>
  )
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="drawer-stat">
      <span className="drawer-stat-label">{label}</span>
      <span className="drawer-stat-value">{value}</span>
      {children}
    </div>
  )
}

function FunnelStep({ label, value, rate, width }: { label: string; value: number; rate?: string; width: number }) {
  return (
    <div className="funnel-step">
      <div className="funnel-bar" style={{ width: `${Math.max(width, 4)}%` }} />
      <div className="funnel-text">
        <span>{label}</span>
        <strong>{formatNumber(value)}</strong>
        {rate && <em>{rate}</em>}
      </div>
    </div>
  )
}

export function CampaignDrawer({ item, averages, series, children, childrenLabel, onClose }: CampaignDrawerProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const analysis = item.analysis
  const tone = TONE_CLASSES[analysis.primary.tone as keyof typeof TONE_CLASSES] ?? TONE_CLASSES.warning
  const steps = useMemo(() => stepsFor(item), [item])
  const gap = analysis.verdict === 'wait' ? evidenceGap(item) : null

  const rows = useMemo(() => {
    const withLeads = children.filter((c) => c.leads > 0 && c.cpl > 0)
    const best = withLeads.length > 1 ? Math.min(...withLeads.map((c) => c.cpl)) : null
    const worst = withLeads.length > 1 ? Math.max(...withLeads.map((c) => c.cpl)) : null
    return [...children]
      .sort((a, b) => b.spend - a.spend)
      .map((c) => ({
        ...c,
        flag: best != null && c.cpl === best ? 'best' : worst != null && c.cpl === worst && worst !== best ? 'worst' : '',
      }))
  }, [children])

  const clickRate = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0
  const leadRate = item.clicks > 0 ? (item.leads / item.clicks) * 100 : 0
  const trend = analysis.trend as { available: boolean; summary?: string | null }

  return (
    <div className="drawer-root" role="dialog" aria-modal="true" aria-label={`Detalhes de ${item.name}`}>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer-panel">
        <header className="drawer-head">
          <div className="min-w-0">
            <p className="section-label">{item.status === 'Ativa' ? 'Campanha ativa' : 'Campanha pausada'}</p>
            <h3 className="drawer-title" title={item.name}>
              {item.name}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
                {analysis.primary.emoji} {analysis.primary.label}
              </span>
              <span className="text-xs text-zinc-500">Nota {analysis.score}/100</span>
            </div>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Fechar detalhes">
            <i className="fa-solid fa-xmark" />
          </button>
        </header>

        <div className="drawer-body">
          <section className="drawer-verdict">
            <p className="drawer-verdict-title">{VERDICT_TEXT[analysis.verdict] ?? VERDICT_TEXT.monitor}</p>
            {analysis.notes.map((note) => (
              <p key={note} className="mt-1 text-sm text-zinc-400">
                {note}
              </p>
            ))}
            {gap && <p className="mt-2 text-xs text-amber-200/80">{gap}</p>}
            {trend.available && trend.summary && <p className="mt-2 text-xs text-zinc-500">{trend.summary}</p>}
          </section>

          <section>
            <p className="section-label mb-2">Números do período</p>
            <div className="drawer-stats">
              <Stat label="Investimento" value={formatCurrency(item.spend)} />
              <Stat label="Leads" value={formatNumber(item.leads)}>
                {leadsHint(item) && <span className="drawer-vs">{leadsHint(item)}</span>}
              </Stat>
              <Stat label="Custo por lead" value={item.leads > 0 ? formatCurrency(item.cpl) : '—'}>
                <Compare value={item.cpl} avg={averages.cpl} lowerIsBetter />
              </Stat>
              <Stat label="CTR" value={`${formatDecimal(item.ctr)}%`}>
                <Compare value={item.ctr} avg={averages.ctr} />
              </Stat>
              <Stat label="CPC" value={formatCurrency(item.cpc)}>
                <Compare value={item.cpc} avg={averages.cpc} lowerIsBetter />
              </Stat>
              <Stat label="Frequência" value={formatDecimal(item.frequency, 1)}>
                <span className="drawer-vs">
                  {item.frequency >= 3 ? 'alta: público saturado' : item.frequency >= 2 ? 'moderada' : 'saudável'}
                </span>
              </Stat>
            </div>
          </section>

          <section>
            <p className="section-label mb-2">Do anúncio ao lead</p>
            <div className="funnel">
              <FunnelStep label="Pessoas alcançadas" value={item.reach} width={100} />
              <FunnelStep label="Impressões" value={item.impressions} width={88} />
              <FunnelStep label="Cliques" value={item.clicks} rate={`${formatDecimal(clickRate)}% das impressões`} width={55} />
              <FunnelStep label="Leads" value={item.leads} rate={`${formatDecimal(leadRate)}% dos cliques`} width={30} />
            </div>
          </section>

          <section>
            <p className="section-label mb-2">O que fazer agora</p>
            <ol className="drawer-steps">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          {series.length >= 2 && (
            <section>
              <p className="section-label mb-2">Dia a dia</p>
              <TrendCharts data={series} stacked />
            </section>
          )}

          {rows.length > 0 && (
            <section>
              <p className="section-label mb-2">
                {childrenLabel} ({rows.length})
              </p>
              <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-zinc-500">
                      <th className="px-3 py-2 font-medium">Nome</th>
                      <th className="px-3 py-2 text-right font-medium">Gasto</th>
                      <th className="px-3 py-2 text-right font-medium">Leads</th>
                      <th className="px-3 py-2 text-right font-medium">CPL</th>
                      <th className="px-3 py-2 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-900/80 last:border-0">
                        <td className="max-w-[200px] truncate px-3 py-2 text-zinc-200" title={row.name}>
                          {row.flag === 'best' && <span title="Menor custo por lead">🟢 </span>}
                          {row.flag === 'worst' && <span title="Maior custo por lead">🔴 </span>}
                          {row.name}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-300">{formatCurrency(row.spend)}</td>
                        <td className="px-3 py-2 text-right text-zinc-300">{formatNumber(row.leads)}</td>
                        <td className="px-3 py-2 text-right text-zinc-300">{row.leads > 0 ? formatCurrency(row.cpl) : '—'}</td>
                        <td className="px-3 py-2 text-right text-zinc-300">{formatDecimal(row.ctr)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}

interface CampaignDetailProps {
  item: EnrichedCampaignItem
  level: Level
  data: InsightsData
  averages: Averages
  onClose: () => void
}

/** Monta os dados da gaveta (série diária e itens filhos) a partir da resposta da Meta. */
export function CampaignDetail({ item, level, data, averages, onClose }: CampaignDetailProps) {
  const series = useMemo<DailyPoint[]>(() => {
    const raw = resolveDailySeries(item, data.dailyByCampaign) as Array<Record<string, unknown>> | null
    return (raw ?? []).map((point) => {
      const spend = Number(point.spend) || 0
      const leads = Number(point.leads) || 0
      return {
        date: String(point.date),
        spend,
        leads,
        cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
      }
    })
  }, [item, data.dailyByCampaign])

  const { children, label } = useMemo(() => {
    if (level === 'campaigns') {
      return { children: data.adSets.filter((c) => c.campaignId === item.id), label: 'Conjuntos de anúncios' }
    }
    if (level === 'adSets') {
      return { children: data.ads.filter((c) => c.adsetId === item.id), label: 'Anúncios' }
    }
    return { children: [] as CampaignItem[], label: '' }
  }, [level, data, item.id])

  return (
    <CampaignDrawer
      item={item}
      averages={averages}
      series={series}
      children={children}
      childrenLabel={label}
      onClose={onClose}
    />
  )
}
