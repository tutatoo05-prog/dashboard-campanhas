import { COMPARE_PRESETS, formatDeltaPercent } from '../lib/compare.js'
import { formatCurrency, formatNumber, formatPercent } from '../lib/format.js'

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function toneClass(tone) {
  if (tone === 'up') return 'compare-delta-up'
  if (tone === 'down') return 'compare-delta-down'
  return 'compare-delta-neutral'
}

function toneIcon(tone) {
  if (tone === 'up') return 'fa-arrow-trend-up'
  if (tone === 'down') return 'fa-arrow-trend-down'
  return 'fa-minus'
}

function toneWord(tone) {
  if (tone === 'up') return 'Melhor'
  if (tone === 'down') return 'Pior'
  return 'Estável'
}

export function renderComparePage({ state, metrics, rows, preset }) {
  const loading = state.compare.loading
  const error = state.compare.error

  return `
    <section class="space-y-6 sm:space-y-8">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="section-label text-gold/70">Análise temporal</p>
          <h1 class="font-display mt-1 text-3xl text-zinc-50 sm:text-4xl">Comparar períodos</h1>
          <p class="mt-2 max-w-xl text-sm text-zinc-500">
            Valor atual em destaque · variação colorida em relação ao período anterior.
          </p>
        </div>
        <label class="block min-w-0 sm:w-80">
          <span class="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500">
            <i class="fa-solid fa-calendar-days w-3 text-center text-[10px]"></i>
            Comparação
          </span>
          <select id="compare-preset" class="filter-input" ${loading ? 'disabled' : ''}>
            ${Object.entries(COMPARE_PRESETS)
              .map(
                ([key, item]) =>
                  `<option value="${key}" ${state.compare.preset === key ? 'selected' : ''}>${escapeHtml(item.label)}</option>`,
              )
              .join('')}
          </select>
        </label>
      </div>

      ${error ? `
        <div class="rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-200">
          <p class="font-medium">${escapeHtml(error)}</p>
          <button id="compare-retry" type="button" class="mt-2 text-xs underline">Tentar novamente</button>
        </div>
      ` : ''}

      <div class="compare-period-bar">
        <div class="compare-period-item">
          <span class="compare-period-dot compare-period-dot-current"></span>
          <div>
            <p class="compare-period-caption">Período atual</p>
            <p class="compare-period-value">${escapeHtml(preset.currentLabel)}</p>
          </div>
        </div>
        <div class="compare-period-vs">vs</div>
        <div class="compare-period-item">
          <span class="compare-period-dot compare-period-dot-previous"></span>
          <div>
            <p class="compare-period-caption">Período anterior</p>
            <p class="compare-period-value">${escapeHtml(preset.previousLabel)}</p>
          </div>
        </div>
      </div>

      ${loading ? renderCompareLoading() : `
        ${renderCompareKpis(metrics)}
        ${renderCompareTable(rows)}
      `}
    </section>
  `
}

function renderCompareLoading() {
  return `
    <div class="surface-card p-12 text-center">
      <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400"></div>
      <p class="mt-3 text-sm text-zinc-500">Comparando períodos...</p>
    </div>
  `
}

function renderCompareKpis(metrics) {
  if (!metrics.length) {
    return `<div class="surface-card p-10 text-center text-sm text-zinc-500">Sem dados para comparar neste período.</div>`
  }

  return `
    <div class="kpi-scroll">
      ${metrics
        .map(
          (metric) => `
            <article class="kpi-card compare-kpi">
              <div class="flex items-center justify-between gap-2">
                <div class="kpi-icon"><i class="fa-solid ${metric.icon}"></i></div>
                <span class="compare-tone-tag ${toneClass(metric.tone)}">${toneWord(metric.tone)}</span>
              </div>
              <p class="mt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">${escapeHtml(metric.label)}</p>
              <p class="mt-1 font-display text-2xl font-semibold text-zinc-50">${escapeHtml(metric.currentLabel)}</p>
              <div class="compare-kpi-delta ${toneClass(metric.tone)}">
                <i class="fa-solid ${toneIcon(metric.tone)}"></i>
                <span>${escapeHtml(metric.deltaLabel)}</span>
              </div>
              <p class="compare-kpi-prev">
                <span class="compare-kpi-prev-label">Anterior</span>
                <span class="compare-kpi-prev-value">${escapeHtml(metric.previousLabel)}</span>
              </p>
            </article>
          `,
        )
        .join('')}
    </div>
  `
}

function renderMetricCell({ currentLabel, previousLabel, delta, invert = false }) {
  const formatted = formatDeltaPercent(delta, { invert })
  const hasChange = Math.abs(delta?.percent ?? 0) >= 0.05
  const changeLabel = hasChange ? formatted.label : 'igual'

  return `
    <div class="compare-metric-cell">
      <div class="compare-metric-pair">
        <div class="compare-metric-side">
          <span class="compare-metric-caption">Agora</span>
          <span class="compare-metric-now">${currentLabel ?? '—'}</span>
        </div>
        <div class="compare-metric-side compare-metric-side-prev">
          <span class="compare-metric-caption">Antes</span>
          <span class="compare-metric-was">${previousLabel ?? '—'}</span>
        </div>
      </div>
      <span class="compare-metric-change ${toneClass(formatted.tone)}">
        ${hasChange ? `<i class="fa-solid ${toneIcon(formatted.tone)}"></i>` : ''}
        ${escapeHtml(changeLabel)}
      </span>
    </div>
  `
}

function metricHeader(label) {
  return `
    <th class="px-3 py-3">
      <span class="block">${label}</span>
      <span class="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-zinc-600">agora · antes</span>
    </th>
  `
}

function renderCompareTable(rows) {
  if (!rows.length) {
    return `<div class="surface-card p-10 text-center text-sm text-zinc-500">Nenhuma campanha nos períodos selecionados.</div>`
  }

  return `
    <section class="space-y-4">
      <div>
        <p class="section-label">Campanhas</p>
        <h2 class="section-title mt-1">Variação por campanha</h2>
        <p class="mt-1 text-sm text-zinc-500">Compare o valor de agora com o de antes em cada métrica.</p>
      </div>
      <div class="surface-card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr class="border-b border-zinc-800/60 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
                <th class="sticky left-0 z-10 bg-zinc-950 px-4 py-3">Campanha</th>
                ${metricHeader('Gasto')}
                ${metricHeader('Leads')}
                ${metricHeader('CPL')}
                ${metricHeader('CTR')}
              </tr>
            </thead>
            <tbody>
              ${rows
                .map((row) => {
                  const current = row.current
                  const previous = row.previous
                  const missing = row.missingInCurrent
                  return `
                    <tr class="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/20">
                      <td class="sticky left-0 z-10 bg-zinc-950/95 px-4 py-3 backdrop-blur-sm">
                        <p class="font-medium text-zinc-100">${escapeHtml(row.name)}</p>
                        <p class="text-xs text-zinc-500">${missing ? 'Só no período anterior' : escapeHtml(row.status ?? '')}</p>
                      </td>
                      <td class="px-3 py-3">${renderMetricCell({
                        currentLabel: current ? formatCurrency(current.spend) : '—',
                        previousLabel: previous ? formatCurrency(previous.spend) : '—',
                        delta: row.spendDelta,
                        invert: true,
                      })}</td>
                      <td class="px-3 py-3">${renderMetricCell({
                        currentLabel: current ? formatNumber(current.leads) : '—',
                        previousLabel: previous ? formatNumber(previous.leads) : '—',
                        delta: row.leadsDelta,
                      })}</td>
                      <td class="px-3 py-3">${renderMetricCell({
                        currentLabel: current?.leads ? formatCurrency(current.cpl) : '—',
                        previousLabel: previous?.leads ? formatCurrency(previous.cpl) : '—',
                        delta: row.cplDelta,
                        invert: true,
                      })}</td>
                      <td class="px-3 py-3">${renderMetricCell({
                        currentLabel: current ? formatPercent(current.ctr) : '—',
                        previousLabel: previous ? formatPercent(previous.ctr) : '—',
                        delta: row.ctrDelta,
                      })}</td>
                    </tr>
                  `
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `
}
