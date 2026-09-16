import {
  CPL_IDEAL,
  getDisplayName,
  getGreeting,
  rateMetric,
  renderSemaphoreBadge,
} from '../lib/metrics.js'
import { renderIndexBar } from '../lib/campaignIndices.js'
import { renderAnalysisBadge } from '../lib/analysis.js'
import { PERIODS, LEVELS, OBJECTIVES } from '../services/dataService.js'
import { formatCurrency, formatNumber, formatPercent } from '../lib/format.js'
import { formatLocalDate, MAX_CUSTOM_DAYS } from '../lib/period.js'

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const KPI_ICONS = {
  Investimento: 'fa-wallet',
  Leads: 'fa-user-plus',
  CPL: 'fa-bullseye',
  CTR: 'fa-mouse-pointer',
  CPC: 'fa-hand-pointer',
  Frequência: 'fa-arrows-rotate',
}

export function renderSidebar({ state }) {
  const openClass = state.sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'
  const userLabel = getDisplayName(state.user)
  const initial = userLabel.charAt(0).toUpperCase()
  const page = state.page ?? 'dashboard'

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line' },
    { id: 'compare', label: 'Comparar', icon: 'fa-chart-column' },
    { id: 'purchases', label: 'Compras', icon: 'fa-bag-shopping' },
  ]

  return `
    <aside id="sidebar" class="sidebar ${openClass} fixed inset-y-0 left-0 flex flex-col">
      <div class="sidebar-header flex h-16 shrink-0 items-center gap-2 border-b border-zinc-800/50 px-2 xl:gap-3 xl:px-3">
        <div class="sidebar-header-inner flex min-w-0 flex-1 items-center gap-2 xl:gap-3">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold-border bg-gold-dim text-sm font-semibold text-gold">${escapeHtml(initial)}</div>
          <div class="sidebar-fade min-w-0 flex-1 overflow-hidden">
            <p class="truncate font-display text-base text-zinc-100">${escapeHtml(userLabel)}</p>
            <p class="truncate text-[11px] text-zinc-500">${escapeHtml(state.user?.email ?? state.user?.usuario ?? '')}</p>
          </div>
        </div>
        <button id="sidebar-toggle" type="button" class="sidebar-toggle-btn hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-800/80 text-zinc-500 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 xl:inline-flex" aria-label="${state.sidebarOpen ? 'Recolher menu' : 'Expandir menu'}">
          <i class="fa-solid fa-chevron-left sidebar-toggle-icon text-[10px]"></i>
        </button>
      </div>

      <div class="sidebar-body flex flex-1 flex-col overflow-hidden p-3 xl:p-4">
        <p class="sidebar-fade section-label px-1">Navegação</p>
        <nav class="mt-3 space-y-1" aria-label="Menu principal">
          ${navItems
            .map((item) => {
              const active = page === item.id
              return `
                <button
                  type="button"
                  data-nav-page="${item.id}"
                  class="sidebar-nav-btn ${active ? 'sidebar-nav-btn-active' : ''}"
                  aria-current="${active ? 'page' : 'false'}"
                  title="${escapeHtml(item.label)}"
                >
                  <i class="fa-solid ${item.icon}"></i>
                  <span class="sidebar-fade">${escapeHtml(item.label)}</span>
                </button>
              `
            })
            .join('')}
        </nav>
      </div>

      <div class="sidebar-footer shrink-0 border-t border-zinc-800/50 p-3">
        <button id="btn-logout" type="button" class="sidebar-logout-btn flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800/80 px-3 py-2.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 xl:justify-start">
          <i class="fa-solid fa-right-from-bracket text-[10px]"></i>
          <span class="sidebar-fade">Sair</span>
        </button>
        <p class="sidebar-fade mt-3 px-1 text-[10px] leading-relaxed text-zinc-600">
          <i class="fa-solid fa-shield-halved mr-1 text-gold/50"></i>
          Dados protegidos · Tuzinho Academy
        </p>
      </div>
    </aside>
  `
}

function countActiveFilters(state) {
  let count = 0
  if (state.period !== 'last7') count++
  if (state.level !== 'campaigns') count++
  if (state.objective !== 'all') count++
  if (state.search.trim()) count++
  return count
}

function renderTopActions({ state }) {
  const activeCount = countActiveFilters(state)
  const showFilters = state.page === 'dashboard'
  const accountLabel = state.accountName?.trim() || 'Conta'
  const busy = state.loading || state.compare?.loading

  return `
    <div class="topbar-actions" aria-label="Ações da conta">
      <button
        type="button"
        id="fab-account"
        class="topbar-action-btn"
        aria-label="Trocar conta"
        title="${escapeHtml(accountLabel)}"
        ${busy ? 'disabled' : ''}
      >
        <i class="fa-solid fa-building-columns"></i>
        <span class="topbar-action-label">${escapeHtml(accountLabel)}</span>
      </button>
      ${
        showFilters
          ? `
        <button
          type="button"
          id="fab-filter"
          class="topbar-action-btn topbar-action-btn-accent"
          aria-label="Filtros"
          title="Filtros"
          aria-expanded="${state.filterModalOpen ? 'true' : 'false'}"
          ${busy ? 'disabled' : ''}
        >
          <i class="fa-solid fa-sliders"></i>
          <span class="topbar-action-label">Filtros</span>
          ${activeCount > 0 ? `<span class="topbar-action-badge">${activeCount}</span>` : ''}
        </button>
      `
          : ''
      }
    </div>
  `
}

export function renderTopBar({ state }) {
  const pageTitle =
    state.page === 'compare'
      ? 'Comparar períodos'
      : state.page === 'purchases'
        ? 'Compras'
        : `${state.accountName ?? 'Conta'} · ${state.currency}`

  return `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="topbar-leading">
          <button id="sidebar-toggle-mobile" type="button" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-900 xl:hidden" aria-label="Menu">
            <i class="fa-solid fa-bars text-sm"></i>
          </button>
          <div class="min-w-0">
            <p class="truncate font-display text-lg text-zinc-50 sm:text-xl">${escapeHtml(pageTitle)}</p>
          </div>
        </div>
        ${renderTopActions({ state })}
      </div>
    </header>
  `
}

export function renderAccountModal({ state }) {
  if (!state.accountModalOpen) return ''

  const recentIds = state.recentAccountIds ?? []
  const ordered = sortAccountsForModal(state.adAccounts ?? [], recentIds, state.accountId)
  const disabled = state.loading || !ordered.length

  const tiles = ordered.length
    ? ordered
        .map((account) => {
          const selected = account.id === state.accountId
          const initial = escapeHtml((account.name || '?').trim().charAt(0).toUpperCase() || '?')
          const shortId = String(account.id).replace(/^act_/, '')
          return `
            <button
              type="button"
              class="account-tile ${selected ? 'account-tile-active' : ''}"
              data-account-id="${escapeHtml(account.id)}"
              ${disabled ? 'disabled' : ''}
              title="${escapeHtml(account.name)} · ${escapeHtml(account.id)}"
            >
              <span class="account-tile-initial">${initial}</span>
              <span class="account-tile-name">${escapeHtml(account.name)}</span>
              <span class="account-tile-id">${escapeHtml(shortId)}</span>
            </button>
          `
        })
        .join('')
    : `<p class="col-span-full py-8 text-center text-sm text-zinc-500">Nenhuma conta disponível</p>`

  return `
    <div id="account-modal" class="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div id="account-modal-backdrop" class="absolute inset-0 bg-zinc-950/85 backdrop-blur-sm"></div>
      <div class="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div class="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <p class="section-label text-gold/70">Conta de anúncios</p>
            <h3 class="font-display mt-1 text-xl text-zinc-50">Trocar conta</h3>
          </div>
          <button id="account-modal-close" type="button" class="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">Fechar</button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <p class="mb-3 text-xs text-zinc-500">
            <i class="fa-solid fa-clock-rotate-left mr-1 text-[10px] text-gold/60"></i>
            Contas recentes aparecem primeiro. Toque em um card para trocar.
          </p>
          <div class="account-tile-grid">
            ${tiles}
          </div>
        </div>
      </div>
    </div>
  `
}

function sortAccountsForModal(accounts, recentIds, currentId) {
  const byId = new Map(accounts.map((account) => [String(account.id), account]))
  const ordered = []
  const seen = new Set()

  // Atual no topo, depois recentes, depois o resto
  if (currentId && byId.has(String(currentId))) {
    ordered.push(byId.get(String(currentId)))
    seen.add(String(currentId))
  }

  for (const id of recentIds) {
    const key = String(id)
    if (seen.has(key)) continue
    const account = byId.get(key)
    if (account) {
      ordered.push(account)
      seen.add(key)
    }
  }

  for (const account of accounts) {
    const key = String(account.id)
    if (!seen.has(key)) {
      ordered.push(account)
      seen.add(key)
    }
  }

  return ordered
}

export function renderFilterModal({ state }) {
  if (!state.filterModalOpen) return ''

  const draft = state.filterDraft ?? {
    period: state.period,
    level: state.level,
    objective: state.objective,
    search: state.search,
    since: state.since,
    until: state.until,
  }
  const isCustom = draft.period === 'custom'
  const todayMax = formatLocalDate(new Date())

  return `
    <div id="filter-modal" class="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div id="filter-modal-backdrop" class="absolute inset-0 bg-zinc-950/85 backdrop-blur-sm"></div>
      <div class="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <p class="section-label text-gold/70">Visualização</p>
            <h3 class="font-display mt-1 text-xl text-zinc-50">Filtros</h3>
            <p class="mt-1 text-xs text-zinc-500">Escolha os filtros e clique em Filtrar.</p>
          </div>
          <button id="filter-modal-close" type="button" class="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">Fechar</button>
        </div>
        <div class="overflow-y-auto px-5 py-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block min-w-0 sm:col-span-2">
              <span class="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"><i class="fa-regular fa-calendar w-3 text-center text-[10px]"></i> Período</span>
              <select id="filter-period" class="filter-input" ${state.loading ? 'disabled' : ''}>
                ${Object.entries(PERIODS)
                  .map(
                    ([key, label]) =>
                      `<option value="${key}" ${draft.period === key ? 'selected' : ''}>${label}</option>`,
                  )
                  .join('')}
              </select>
            </label>
            ${
              isCustom
                ? `
            <label class="block min-w-0">
              <span class="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"><i class="fa-solid fa-play w-3 text-center text-[10px]"></i> De</span>
              <input
                id="filter-since"
                type="date"
                value="${escapeHtml(draft.since ?? '')}"
                max="${todayMax}"
                class="filter-input"
                ${state.loading ? 'disabled' : ''}
              />
            </label>
            <label class="block min-w-0">
              <span class="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"><i class="fa-solid fa-flag-checkered w-3 text-center text-[10px]"></i> Até</span>
              <input
                id="filter-until"
                type="date"
                value="${escapeHtml(draft.until ?? '')}"
                max="${todayMax}"
                class="filter-input"
                ${state.loading ? 'disabled' : ''}
              />
            </label>
            <p class="sm:col-span-2 text-xs ${draft.rangeError ? 'text-red-400' : 'text-zinc-500'}">
              ${
                draft.rangeError
                  ? escapeHtml(draft.rangeError)
                  : `Intervalo máximo de ${MAX_CUSTOM_DAYS} dias.`
              }
            </p>
            `
                : ''
            }
            <label class="block min-w-0">
              <span class="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"><i class="fa-solid fa-layer-group w-3 text-center text-[10px]"></i> Nível</span>
              <select id="filter-level" class="filter-input">
                ${Object.entries(LEVELS)
                  .map(
                    ([key, label]) =>
                      `<option value="${key}" ${draft.level === key ? 'selected' : ''}>${label}</option>`,
                  )
                  .join('')}
              </select>
            </label>
            <label class="block min-w-0">
              <span class="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"><i class="fa-solid fa-crosshairs w-3 text-center text-[10px]"></i> Objetivo</span>
              <select id="filter-objective" class="filter-input">
                <option value="all" ${draft.objective === 'all' ? 'selected' : ''}>Todos</option>
                ${Object.entries(OBJECTIVES)
                  .map(
                    ([key, label]) =>
                      `<option value="${key}" ${draft.objective === key ? 'selected' : ''}>${label}</option>`,
                  )
                  .join('')}
              </select>
            </label>
            <label class="block min-w-0 sm:col-span-2">
              <span class="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"><i class="fa-solid fa-magnifying-glass w-3 text-center text-[10px]"></i> Buscar</span>
              <input id="filter-search" type="search" placeholder="Nome da campanha..." value="${escapeHtml(draft.search)}" class="filter-input" />
            </label>
          </div>
        </div>
        <div class="border-t border-zinc-800 px-5 py-4">
          <button type="button" id="btn-apply-filters" class="btn-gold w-full" ${state.loading ? 'disabled' : ''}>
            <i class="fa-solid fa-check text-xs"></i>
            Filtrar
          </button>
        </div>
      </div>
    </div>
  `
}

export function renderWelcomeBrief({ loading, totals, best, worst, periodLabel, recommendationCount, user }) {
  if (loading) {
    return `
      <section id="highlights" class="scroll-mt-20">
        <div class="hero-panel p-8 text-center">
          <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-800 border-t-amber-400"></div>
          <p class="mt-3 text-sm text-zinc-500">Carregando performance...</p>
        </div>
      </section>
    `
  }

  const name = getDisplayName(user)
  const cplText = totals.leads ? formatCurrency(totals.cpl) : '—'

  return `
    <section id="highlights" class="scroll-mt-20">
      <div class="hero-panel relative p-5 sm:p-7 lg:p-8">
        <div class="relative z-10">
          <p class="section-label text-gold/70">Performance · ${escapeHtml(periodLabel)}</p>
          <h2 class="font-display mt-2 text-3xl font-semibold leading-tight text-zinc-50 sm:text-4xl lg:text-[2.75rem]">
            ${getGreeting()}, <span class="text-gold-gradient">${escapeHtml(name)}</span>.
          </h2>

          <div class="mt-5 flex flex-wrap gap-2 sm:gap-3">
            <span class="stat-pill"><i class="fa-solid fa-coins text-gold/70"></i> <strong>${formatCurrency(totals.spend)}</strong> investidos</span>
            <span class="stat-pill"><i class="fa-solid fa-user-plus text-gold/70"></i> <strong>${formatNumber(totals.leads)}</strong> leads</span>
            <span class="stat-pill"><i class="fa-solid fa-bullseye text-gold/70"></i> CPL <strong>${cplText}</strong></span>
          </div>

          <div class="mt-5 space-y-2 text-sm leading-relaxed text-zinc-400 sm:text-base">
            ${best ? `<p><i class="fa-solid fa-fire text-amber-400 mr-1.5"></i> Melhor campanha: <span class="font-medium text-emerald-400">${escapeHtml(best.name)}</span></p>` : ''}
            ${worst && worst.id !== best?.id ? `<p><i class="fa-solid fa-triangle-exclamation text-red-400 mr-1.5"></i> Precisa de atenção: <span class="font-medium text-red-400">${escapeHtml(worst.name)}</span></p>` : ''}
            ${recommendationCount > 0
              ? `<p class="text-zinc-300"><i class="fa-solid fa-lightbulb text-gold mr-1.5"></i> <strong class="text-zinc-100">${recommendationCount}</strong> recomendações prontas para ação.</p>`
              : '<p class="text-zinc-500"><i class="fa-regular fa-circle-check mr-1.5"></i> Nenhuma ação urgente — continue monitorando.</p>'}
          </div>

          ${recommendationCount > 0 ? `
            <button type="button" id="btn-recommendations" class="btn-gold mt-6 w-full sm:w-auto">
              <i class="fa-solid fa-clipboard-list"></i>
              Ver recomendações
            </button>
          ` : ''}
        </div>
      </div>
    </section>
  `
}

export function renderSemaphoreKpis({ loading, totals, avgFrequency }) {
  if (loading) {
    return `<div class="kpi-scroll">${Array(6).fill('<div class="kpi-card h-28 animate-pulse"></div>').join('')}</div>`
  }

  const ctx = { totals, avgFrequency }
  const kpis = [
    { label: 'Investimento', value: formatCurrency(totals.spend), metric: 'spend', raw: totals.spend, sub: null },
    { label: 'Leads', value: formatNumber(totals.leads), metric: 'leads', raw: totals.leads, sub: null },
    { label: 'CPL', value: totals.leads ? formatCurrency(totals.cpl) : '—', metric: 'cpl', raw: totals.cpl, sub: `Ideal < ${formatCurrency(CPL_IDEAL)}` },
    { label: 'CTR', value: formatPercent(totals.ctr), metric: 'ctr', raw: totals.ctr, sub: null },
    { label: 'CPC', value: formatCurrency(totals.cpc), metric: 'cpc', raw: totals.cpc, sub: null },
    { label: 'Frequência', value: String(avgFrequency), metric: 'frequency', raw: avgFrequency, sub: 'Média da conta' },
  ]

  return `
    <div class="kpi-scroll">
      ${kpis
        .map((kpi) => {
          const status = rateMetric(kpi.metric, kpi.raw, ctx)
          const icon = KPI_ICONS[kpi.label] ?? 'fa-chart-line'
          return `
            <article class="kpi-card">
              <div class="flex items-start justify-between gap-2">
                <div class="kpi-icon"><i class="fa-solid ${icon}"></i></div>
                ${renderSemaphoreBadge(status)}
              </div>
              <p class="mt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">${kpi.label}</p>
              <p class="mt-1 font-display text-2xl font-semibold text-zinc-50">${kpi.value}</p>
              ${kpi.sub ? `<p class="mt-1 text-[11px] text-zinc-600">${kpi.sub}</p>` : ''}
            </article>
          `
        })
        .join('')}
    </div>
  `
}

export function renderBestWorstCards({ loading, best, worst }) {
  if (loading || !best) return ''

  const bestTags = best.analysis.tags.slice(0, 2).map((tag) => renderAnalysisBadge(tag)).join('')

  const worstBlock =
    worst && worst.id !== best.id
      ? `
        <article class="surface-card border-red-500/20 p-5 sm:p-6">
          <div class="flex items-center gap-2">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
              <i class="fa-solid fa-triangle-exclamation text-sm"></i>
            </div>
            <p class="section-label text-red-400/80">Atenção necessária</p>
          </div>
          <h3 class="font-display mt-3 text-xl font-semibold text-zinc-100">${escapeHtml(worst.name)}</h3>
          <div class="mt-3 flex flex-wrap gap-1">${worst.analysis.tags.slice(0, 3).map((tag) => renderAnalysisBadge(tag)).join('')}</div>
          <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><p class="text-xs text-zinc-500">Gasto</p><p class="font-medium text-zinc-200">${formatCurrency(worst.spend)}</p></div>
            <div><p class="text-xs text-zinc-500">Leads</p><p class="font-medium text-zinc-200">${formatNumber(worst.leads)}</p></div>
            <div><p class="text-xs text-zinc-500">CTR</p><p class="font-medium text-zinc-200">${formatPercent(worst.ctr)}</p></div>
            <div><p class="text-xs text-zinc-500">CPL</p><p class="font-medium text-zinc-200">${worst.leads ? formatCurrency(worst.cpl) : '—'}</p></div>
          </div>
          <button type="button" data-campaign-detail="${escapeHtml(worst.id)}" class="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300">
            Ver detalhes <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </article>
      `
      : ''

  return `
    <section class="grid gap-4 lg:grid-cols-2">
      <article class="hero-glow p-5 sm:p-6">
        <div class="flex items-center gap-2">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-gold">
            <i class="fa-solid fa-trophy text-sm"></i>
          </div>
          <p class="section-label text-gold/80">Melhor campanha</p>
        </div>
        <h3 class="font-display mt-3 text-xl font-semibold text-zinc-50">${escapeHtml(best.name)}</h3>
        <div class="mt-3 flex flex-wrap gap-1">${bestTags}</div>
        <div class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><p class="text-xs text-zinc-500">Gasto</p><p class="font-medium text-zinc-100">${formatCurrency(best.spend)}</p></div>
          <div><p class="text-xs text-zinc-500">Leads</p><p class="font-medium text-emerald-400">${formatNumber(best.leads)}</p></div>
          <div><p class="text-xs text-zinc-500">CTR</p><p class="font-medium text-zinc-100">${formatPercent(best.ctr)}</p></div>
          <div><p class="text-xs text-zinc-500">CPL</p><p class="font-medium text-zinc-100">${best.leads ? formatCurrency(best.cpl) : '—'}</p></div>
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <button type="button" data-campaign-detail="${escapeHtml(best.id)}" class="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 px-3.5 py-2 text-xs text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900">
            <i class="fa-solid fa-chart-simple text-[10px]"></i> Ver detalhes
          </button>
          <button type="button" data-report-id="${escapeHtml(best.id)}" aria-label="Gerar relatório" title="Gerar relatório" class="report-btn inline-flex items-center justify-center rounded-xl bg-violet-500/12 px-3 py-2 text-xs text-violet-300 ring-1 ring-violet-500/25 transition hover:bg-violet-500/20">
            <i class="fa-solid fa-file-lines text-[10px]"></i>
          </button>
        </div>
      </article>
      ${worstBlock}
    </section>
  `
}

export function renderCampaignDetailCard(rec, { index = null } = {}) {
  const toneBorder = {
    success: 'border-emerald-500/25',
    danger: 'border-red-500/25',
    warning: 'border-amber-500/25',
  }

  const trendToneClass = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-zinc-400',
  }

  const trend = rec.trend
  const trendBlock =
    trend?.available
      ? `
        <div class="mt-4 rounded-xl border border-zinc-800/60 bg-zinc-950/50 p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-[10px] font-semibold uppercase tracking-widest text-gold/70">Tendência recente</p>
            <span class="text-xs font-semibold ${
              trend.deteriorating
                ? 'text-red-400'
                : trend.improving
                  ? 'text-emerald-400'
                  : 'text-zinc-400'
            }">${escapeHtml(trend.label)}</span>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            ${['spend', 'leads', 'cpl', 'ctr']
              .map((key) => {
                const metric = trend.metrics?.[key]
                if (!metric) return ''
                const titles = { spend: 'Gasto', leads: 'Leads', cpl: 'CPL', ctr: 'CTR' }
                return `
                  <div class="rounded-lg border border-zinc-800/70 px-2.5 py-2">
                    <p class="text-[10px] uppercase tracking-wide text-zinc-600">${titles[key]}</p>
                    <p class="mt-0.5 text-sm font-semibold ${trendToneClass[metric.tone] ?? trendToneClass.neutral}">
                      ${escapeHtml(metric.label)}
                    </p>
                  </div>
                `
              })
              .join('')}
          </div>
        </div>
      `
      : ''

  const notesWithoutTrendSummary = (rec.notes ?? []).filter(
    (note) => !String(note).startsWith('Tendência recente'),
  )

  const titleLabel =
    index != null ? `Campanha ${index + 1}` : rec.status ? escapeHtml(rec.status) : 'Campanha'

  return `
    <article class="surface-card p-5 ${toneBorder[rec.tone] ?? toneBorder.warning}">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">${titleLabel}</p>
          <h4 class="font-display mt-1 text-xl text-zinc-50">${escapeHtml(rec.campaign)}</h4>
        </div>
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-center">
          <p class="text-[10px] uppercase tracking-wider text-zinc-600">Nota</p>
          <p class="font-display text-2xl text-gold">${rec.overallScore}</p>
        </div>
      </div>

      <div class="mt-2 flex flex-wrap gap-1">
        ${(rec.tags ?? []).slice(0, 3).map((tag) => renderAnalysisBadge(tag)).join('')}
      </div>

      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        ${(rec.indices ?? []).map((indexItem) => renderIndexBar(indexItem)).join('')}
      </div>

      ${trendBlock}

      <div class="mt-5 rounded-xl border border-zinc-800/60 bg-zinc-950/50 p-4">
        <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gold/70">Recomendação</p>
        <p class="font-medium text-zinc-100">${escapeHtml(rec.action)}</p>
        <ul class="mt-2 space-y-1.5">
          ${notesWithoutTrendSummary
            .map(
              (note) =>
                `<li class="text-sm text-zinc-400"><i class="fa-solid fa-chevron-right mr-1.5 text-[10px] text-zinc-600"></i>${escapeHtml(note)}</li>`,
            )
            .join('')}
        </ul>
      </div>
    </article>
  `
}

export function renderRecommendationsModal({ open, items, periodLabel }) {
  if (!open) return ''

  const body = items.length
    ? items
        .map((rec, index) => renderCampaignDetailCard(rec, { index }))
        .join('')
    : '<p class="py-12 text-center text-sm text-zinc-500">Nenhuma recomendação no período.</p>'

  return `
    <div id="recommendations-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div id="recommendations-modal-backdrop" class="absolute inset-0 bg-zinc-950/85 backdrop-blur-sm"></div>
      <div class="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <p class="section-label text-gold/70">Análise por campanha</p>
            <h3 class="font-display mt-1 text-2xl text-zinc-50">Recomendações</h3>
            <p class="mt-1 text-xs text-zinc-500">${escapeHtml(periodLabel)} · evidência estatística + tendência diária</p>
          </div>
          <button id="recommendations-modal-close" type="button" class="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">Fechar</button>
        </div>
        <div class="overflow-y-auto px-5 py-5">
          <div class="mb-5 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span class="inline-flex items-center gap-1.5"><span class="index-legend index-bar-success"></span> 70–100 Bom</span>
            <span class="inline-flex items-center gap-1.5"><span class="index-legend index-bar-warning"></span> 45–69 Médio</span>
            <span class="inline-flex items-center gap-1.5"><span class="index-legend index-bar-danger"></span> 0–44 Fraco</span>
          </div>
          <div class="space-y-5">${body}</div>
        </div>
      </div>
    </div>
  `
}

export function renderCampaignDetailModal({ open, detail, periodLabel }) {
  if (!open) return ''

  const body = detail
    ? renderCampaignDetailCard(detail)
    : '<p class="py-12 text-center text-sm text-zinc-500">Campanha não encontrada no período.</p>'

  return `
    <div id="campaign-detail-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div id="campaign-detail-modal-backdrop" class="absolute inset-0 bg-zinc-950/85 backdrop-blur-sm"></div>
      <div class="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <p class="section-label text-gold/70">Detalhe da campanha</p>
            <h3 class="font-display mt-1 text-2xl text-zinc-50">${escapeHtml(detail?.campaign ?? 'Campanha')}</h3>
            <p class="mt-1 text-xs text-zinc-500">${escapeHtml(periodLabel)} · o que está indo bem ou precisa de atenção</p>
          </div>
          <button id="campaign-detail-modal-close" type="button" class="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">Fechar</button>
        </div>
        <div class="overflow-y-auto px-5 py-5">
          <div class="mb-5 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span class="inline-flex items-center gap-1.5"><span class="index-legend index-bar-success"></span> 70–100 Bom</span>
            <span class="inline-flex items-center gap-1.5"><span class="index-legend index-bar-warning"></span> 45–69 Médio</span>
            <span class="inline-flex items-center gap-1.5"><span class="index-legend index-bar-danger"></span> 0–44 Fraco</span>
          </div>
          ${body}
        </div>
      </div>
    </div>
  `
}

export function renderRanking(enriched, loading, bestId) {
  if (loading || !enriched.length) return ''

  const items = enriched.slice(0, 5)
  const medals = ['fa-medal', 'fa-medal', 'fa-medal', null, null]

  return `
    <section>
      <p class="section-label mb-3">Top 5 · score de desempenho</p>
      <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        ${items
          .map((item, index) => {
            const isBest = item.id === bestId
            const medalClass = index === 0 ? 'text-amber-400' : index === 1 ? 'text-zinc-400' : index === 2 ? 'text-amber-700' : 'text-zinc-600'
            const barWidth = Math.max(8, item.analysis.score)

            return `
              <button
                type="button"
                data-campaign-detail="${escapeHtml(item.id)}"
                class="rank-card group rounded-2xl border p-3.5 text-left transition-all duration-200 ${isBest ? 'border-amber-500/30 bg-amber-500/5 ring-1 ring-amber-500/15' : 'border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-800/40'}"
              >
                <div class="flex items-center justify-between gap-2">
                  ${medals[index]
                    ? `<i class="fa-solid ${medals[index]} ${medalClass}"></i>`
                    : `<span class="text-xs font-medium text-zinc-600">${index + 1}º</span>`}
                  <span class="text-xs font-medium text-zinc-500">${item.analysis.score} pts</span>
                </div>
                <p class="mt-2 break-words text-sm font-medium text-zinc-200 group-hover:text-zinc-50">${escapeHtml(item.name)}</p>
                <div class="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div class="h-full rounded-full transition-all duration-500 ${isBest ? 'accent-gradient' : 'bg-zinc-600'}" style="width: ${barWidth}%"></div>
                </div>
                <p class="mt-2 text-xs text-zinc-500">${formatNumber(item.leads)} leads · CPL ${item.leads ? formatCurrency(item.cpl) : '—'}</p>
              </button>
            `
          })
          .join('')}
      </div>
    </section>
  `
}
