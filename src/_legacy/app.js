import {
  PERIODS,
  LEVELS,
  OBJECTIVES,
  fetchAdAccounts,
  fetchMetaInsights,
  fetchPermissions,
  getMockData,
} from './services/dataService.js'
import {
  computeSummary,
  renderAnalysisBadge,
  enrichItems,
} from './lib/analysis.js'
import {
  buildRecommendations,
  buildRecommendationsPanelData,
  buildCampaignDetailData,
  computeAvgFrequency,
} from './lib/metrics.js'
import { pickNameFromUser } from './lib/userName.js'
import { formatCurrency, formatNumber, formatPercent } from './lib/format.js'
import { buildReportPayload } from './lib/reportPayload.js'
import { requestReport } from './services/reportService.js'
import { logout } from './services/authService.js'
import {
  renderSidebar,
  renderAccountModal,
  renderFilterModal,
  renderTopBar,
  renderWelcomeBrief,
  renderSemaphoreKpis,
  renderBestWorstCards,
  renderRecommendationsModal,
  renderCampaignDetailModal,
  renderRanking,
} from './ui/layout.js'
import { renderComparePage } from './ui/compare.js'
import { renderPurchasesPage } from './ui/purchases.js'
import { fetchPurchases } from './services/purchaseService.js'
import {
  buildCampaignCompareRows,
  buildCompareSummary,
  getComparePreset,
} from './lib/compare.js'
import {
  defaultCustomRange,
  getPeriodLabel,
  validateCustomRange,
} from './lib/period.js'
import { pushRecentAccount, readRecentAccountIds } from './lib/recentAccounts.js'

const SIDEBAR_KEY = 'dash-sidebar-open'

const state = {
  page: 'dashboard',
  period: 'last7',
  since: null,
  until: null,
  level: 'campaigns',
  objective: 'all',
  search: '',
  loading: true,
  error: null,
  source: 'meta',
  dailyByCampaign: {},
  accountId: null,
  accountName: null,
  currency: 'BRL',
  adAccounts: [],
  permission: null,
  sidebarOpen: readSidebarPreference(),
  data: { campaigns: [], adSets: [], ads: [] },
  compare: {
    preset: 'last7_prev7',
    loading: false,
    error: null,
    loaded: false,
    current: null,
    previous: null,
  },
  purchases: {
    loading: false,
    loaded: false,
    error: null,
    items: [],
    filters: {
      search: '',
      campanha: '',
      curso: '',
    },
  },
  report: {
    open: false,
    loading: false,
    loadingItemId: null,
    error: null,
    title: '',
    format: 'text',
    content: '',
  },
  recommendationsModal: { open: false },
  campaignDetailModal: { open: false, itemId: null },
  accountModalOpen: false,
  recentAccountIds: readRecentAccountIds(),
  filterModalOpen: false,
  filterDraft: {
    period: 'last7',
    since: null,
    until: null,
    level: 'campaigns',
    objective: 'all',
    search: '',
    rangeError: null,
  },
  tableSort: {
    key: 'score',
    dir: 'desc',
  },
  user: null,
}

export function setCurrentUser(user) {
  try {
    localStorage.removeItem('dash-user-name')
  } catch {
    /* ignore */
  }

  const nome = pickNameFromUser(user)

  state.user = nome ? { ...user, nome } : user

  if (nome) {
    try {
      localStorage.setItem('dash-user-name', nome)
    } catch {
      /* ignore */
    }
  }
}

function readSidebarPreference() {
  try {
    if (window.innerWidth < 1280) return false
    return localStorage.getItem(SIDEBAR_KEY) !== 'false'
  } catch {
    return window.innerWidth >= 1280
  }
}

function saveSidebarPreference() {
  try {
    localStorage.setItem(SIDEBAR_KEY, String(state.sidebarOpen))
  } catch {
    /* ignore */
  }
}

const STATUS_CLASSES = {
  Ativa: 'bg-amber-500/10 text-amber-200 ring-amber-500/20',
  Pausada: 'bg-zinc-700/30 text-zinc-500 ring-zinc-600/30',
}

function rangeOptions() {
  if (state.period !== 'custom') return {}
  return { since: state.since, until: state.until }
}

function syncFilterDraft() {
  state.filterDraft = {
    period: state.period,
    since: state.since,
    until: state.until,
    level: state.level,
    objective: state.objective,
    search: state.search,
    rangeError: null,
  }
}

function readFiltersFromDom() {
  return {
    period: document.getElementById('filter-period')?.value ?? state.period,
    since: document.getElementById('filter-since')?.value || state.filterDraft?.since || state.since,
    until: document.getElementById('filter-until')?.value || state.filterDraft?.until || state.until,
    level: document.getElementById('filter-level')?.value ?? state.level,
    objective: document.getElementById('filter-objective')?.value ?? state.objective,
    search: document.getElementById('filter-search')?.value ?? '',
  }
}

function onFilterPeriodChange() {
  const draft = readFiltersFromDom()

  if (draft.period === 'custom') {
    if (!draft.since || !draft.until) {
      const defaults = defaultCustomRange()
      draft.since = draft.since || defaults.since
      draft.until = draft.until || defaults.until
    }
  }

  state.filterDraft = { ...draft, rangeError: null }
  render()
}

function applyFilters() {
  const next = readFiltersFromDom()

  if (next.period === 'custom') {
    const validated = validateCustomRange(next.since, next.until)
    if (!validated.ok) {
      state.filterDraft = { ...next, rangeError: validated.error }
      render()
      return
    }
    next.since = validated.since
    next.until = validated.until
  } else {
    next.since = null
    next.until = null
  }

  const periodChanged =
    next.period !== state.period ||
    next.since !== state.since ||
    next.until !== state.until

  state.period = next.period
  state.since = next.since
  state.until = next.until
  state.level = next.level
  state.objective = next.objective
  state.search = next.search
  state.filterDraft = { ...next, rangeError: null }
  state.filterModalOpen = false

  if (periodChanged) {
    loadData()
  } else {
    render()
  }
}

function openAccountModal() {
  state.recentAccountIds = readRecentAccountIds()
  state.accountModalOpen = true
  state.filterModalOpen = false
  state.campaignDetailModal = { open: false, itemId: null }
  render()
}

function closeAccountModal() {
  if (!state.accountModalOpen) return
  state.accountModalOpen = false
  render()
}

function selectAccount(accountId) {
  if (!accountId) return

  pushRecentAccount(accountId)
  state.recentAccountIds = readRecentAccountIds()

  if (accountId === state.accountId) {
    state.accountModalOpen = false
    render()
    return
  }

  const account = state.adAccounts.find((row) => row.id === accountId)
  state.accountId = accountId
  state.accountName = account?.name ?? null
  state.currency = account?.currency ?? 'BRL'
  state.accountModalOpen = false
  state.compare.loaded = false
  state.compare.current = null
  state.compare.previous = null

  if (state.page === 'compare') {
    loadCompareData()
  } else {
    loadData()
  }
}

function navigateTo(page) {
  if (!page || page === state.page) {
    if (window.innerWidth < 1280 && state.sidebarOpen) {
      state.sidebarOpen = false
      saveSidebarPreference()
      applyShellLayout()
    }
    return
  }

  state.page = page
  state.accountModalOpen = false
  state.filterModalOpen = false
  state.recommendationsModal.open = false
  state.campaignDetailModal = { open: false, itemId: null }

  if (window.innerWidth < 1280 && state.sidebarOpen) {
    state.sidebarOpen = false
    saveSidebarPreference()
  }

  if (page === 'compare') {
    render()
    loadCompareData()
    return
  }

  if (page === 'purchases') {
    render()
    loadPurchasesData()
    return
  }

  render()
}

async function loadPurchasesData({ force = false } = {}) {
  if (state.purchases.loading) return
  if (state.purchases.loaded && !force && !state.purchases.error) {
    render()
    return
  }

  state.purchases.loading = true
  state.purchases.error = null
  render()

  try {
    const items = await fetchPurchases()
    state.purchases.items = items
    state.purchases.loaded = true
    state.purchases.error = null
  } catch (error) {
    if (error.message === 'SESSION_EXPIRED') {
      window.location.reload()
      return
    }
    state.purchases.error = error.message
    if (!state.purchases.loaded) {
      state.purchases.items = []
    }
  } finally {
    state.purchases.loading = false
    render()
  }
}

function updatePurchasesFilter(key, value) {
  state.purchases.filters = {
    ...state.purchases.filters,
    [key]: value,
  }

  let caret = null
  if (key === 'search') {
    const input = document.getElementById('purchases-search')
    caret = input
      ? { start: input.selectionStart, end: input.selectionEnd }
      : null
  }

  render()

  if (key === 'search') {
    const next = document.getElementById('purchases-search')
    if (next) {
      next.focus()
      if (caret && typeof caret.start === 'number') {
        next.setSelectionRange(caret.start, caret.end ?? caret.start)
      }
    }
  }
}

async function loadCompareData() {
  const preset = getComparePreset(state.compare.preset)
  state.compare.loading = true
  state.compare.error = null
  render()

  try {
    if (!state.adAccounts.length) {
      const { accounts, defaultAccountId, permissionWarning } = await fetchAdAccounts()
      state.adAccounts = accounts
      if (!state.accountId) state.accountId = defaultAccountId ?? accounts[0]?.id ?? null
      const selected = accounts.find((a) => a.id === state.accountId)
      state.accountName = selected?.name ?? null
      state.currency = selected?.currency ?? state.currency
      if (permissionWarning && state.accountId === defaultAccountId) {
        state.compare.error = permissionWarning.error
      }
    }

    const [current, previous] = await Promise.all([
      fetchMetaInsights(preset.current, state.accountId),
      fetchMetaInsights(preset.previous, state.accountId),
    ])

    state.compare.current = current
    state.compare.previous = previous
    state.compare.loaded = true
    state.accountId = current.account?.id ?? state.accountId
    state.accountName = current.account?.name ?? state.accountName
    state.currency = current.account?.currency ?? state.currency
    state.compare.error = null
  } catch (error) {
    if (error.message === 'SESSION_EXPIRED') {
      window.location.reload()
      return
    }

    try {
      state.compare.current = getMockData(preset.current)
      state.compare.previous = getMockData(preset.previous)
      state.compare.loaded = true
      state.compare.error = `${error.message} · exibindo dados simulados.`
    } catch {
      state.compare.error = error.message
      state.compare.loaded = false
    }
  } finally {
    state.compare.loading = false
    render()
  }
}

function changeComparePreset(presetKey) {
  if (!presetKey || presetKey === state.compare.preset) return
  state.compare.preset = presetKey
  state.compare.loaded = false
  loadCompareData()
}

function openFilterModal() {
  syncFilterDraft()
  state.filterModalOpen = true
  state.accountModalOpen = false
  state.campaignDetailModal = { open: false, itemId: null }
  render()
}

function closeFilterModal() {
  if (!state.filterModalOpen) return
  state.filterModalOpen = false
  render()
}

function anyOverlayOpen() {
  return (
    state.accountModalOpen ||
    state.filterModalOpen ||
    state.report.open ||
    state.recommendationsModal.open ||
    state.campaignDetailModal.open
  )
}

function getFilteredItems() {
  let items = [...(state.data[state.level] ?? [])]

  if (state.objective !== 'all') {
    items = items.filter((item) => item.objective === state.objective)
  }

  if (state.search.trim()) {
    const term = state.search.trim().toLowerCase()
    items = items.filter((item) => item.name.toLowerCase().includes(term))
  }

  return items
}

const TABLE_SORT_COLUMNS = [
  { key: 'name', label: 'Campanha', type: 'text', sticky: true },
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'spend', label: 'Gasto', type: 'number' },
  { key: 'clicks', label: 'Cliques', type: 'number' },
  { key: 'ctr', label: 'CTR', type: 'number' },
  { key: 'cpc', label: 'CPC', type: 'number' },
  { key: 'leads', label: 'Leads', type: 'number' },
  { key: 'cpl', label: 'CPL', type: 'number' },
]

const TABLE_SORT_META = Object.fromEntries(TABLE_SORT_COLUMNS.map((col) => [col.key, col]))

function getSortValue(item, key) {
  if (key === 'score') return item.analysis?.score ?? 0
  if (key === 'name' || key === 'status') return String(item[key] ?? '').toLowerCase()
  if (key === 'cpl') return item.leads ? Number(item.cpl) || 0 : Number.POSITIVE_INFINITY
  return Number(item[key]) || 0
}

function sortTableItems(items) {
  const { key, dir } = state.tableSort
  const factor = dir === 'asc' ? 1 : -1

  return [...items].sort((a, b) => {
    const valueA = getSortValue(a, key)
    const valueB = getSortValue(b, key)

    if (typeof valueA === 'string' || typeof valueB === 'string') {
      return String(valueA).localeCompare(String(valueB), 'pt-BR', { sensitivity: 'base' }) * factor
    }

    if (valueA === valueB) {
      return (b.analysis?.score ?? 0) - (a.analysis?.score ?? 0)
    }

    return (valueA - valueB) * factor
  })
}

function toggleTableSort(key) {
  const meta = TABLE_SORT_META[key]
  if (!meta) return

  if (state.tableSort.key === key) {
    state.tableSort = {
      key,
      dir: state.tableSort.dir === 'asc' ? 'desc' : 'asc',
    }
  } else {
    state.tableSort = {
      key,
      dir: meta.type === 'text' ? 'asc' : 'desc',
    }
  }

  render()
}

function renderSortHeader(column) {
  const active = state.tableSort.key === column.key
  const icon = !active
    ? 'fa-sort'
    : state.tableSort.dir === 'asc'
      ? 'fa-sort-up'
      : 'fa-sort-down'
  const stickyClass = column.sticky ? 'sticky left-0 z-10 bg-zinc-950 ' : ''
  const ariaSort = !active ? 'none' : state.tableSort.dir === 'asc' ? 'ascending' : 'descending'

  return `
    <th class="${stickyClass}px-3 py-3 ${column.sticky ? 'px-4' : ''}">
      <button
        type="button"
        class="table-sort-btn ${active ? 'table-sort-btn-active' : ''}"
        data-sort-key="${column.key}"
        aria-sort="${ariaSort}"
        title="Ordenar por ${column.label}"
      >
        <span>${column.label}</span>
        <i class="fa-solid ${icon}"></i>
      </button>
    </th>
  `
}

function applyShellLayout() {
  const shell = document.querySelector('.app-shell')
  const sidebar = document.getElementById('sidebar')
  const backdrop = document.getElementById('sidebar-backdrop')
  const toggle = document.getElementById('sidebar-toggle')
  const isOpen = state.sidebarOpen
  const isOverlay = window.innerWidth < 1280

  shell?.classList.toggle('sidebar-open', isOpen)
  shell?.classList.toggle('sidebar-collapsed', !isOpen)
  sidebar?.classList.toggle('sidebar-open', isOpen)
  sidebar?.classList.toggle('sidebar-collapsed', !isOpen)

  if (toggle) {
    toggle.setAttribute('aria-label', isOpen ? 'Recolher menu' : 'Expandir menu')
  }

  if (backdrop) {
    backdrop.classList.toggle('sidebar-backdrop-visible', isOpen && isOverlay)
    backdrop.classList.toggle('hidden', !(isOpen && isOverlay))
  }

  document.body.style.overflow =
    (isOpen && isOverlay) || anyOverlayOpen() ? 'hidden' : ''
}

function renderTableRow(item, bestId) {
  const statusClass = STATUS_CLASSES[item.status] ?? STATUS_CLASSES.Pausada
  const tags = item.analysis.tags.map((tag) => renderAnalysisBadge(tag)).join('')
  const isGenerating = state.report.loading && state.report.loadingItemId === item.id
  const isBest = item.id === bestId

  return `
    <tr id="row-${escapeHtml(item.id)}" class="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/20 ${isBest ? 'row-best' : ''}">
      <td class="sticky left-0 z-10 bg-zinc-950/95 px-4 py-3 backdrop-blur-sm ${isBest ? '!bg-amber-950/20' : ''}">
        <div class="min-w-[160px]">
          <div class="flex items-center gap-2">
            ${isBest ? '<i class="fa-solid fa-trophy text-gold text-xs" title="Melhor campanha"></i>' : ''}
            <button
              type="button"
              data-campaign-detail="${escapeHtml(item.id)}"
              class="text-left font-medium text-zinc-100 transition hover:text-gold"
              title="Ver detalhes da campanha"
            >${escapeHtml(item.name)}</button>
          </div>
          <p class="text-xs text-zinc-500">${OBJECTIVES[item.objective] ?? item.objective}</p>
        </div>
      </td>
      <td class="px-3 py-3 whitespace-nowrap">
        <span class="inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${statusClass}">${item.status}</span>
      </td>
      <td class="px-3 py-3 whitespace-nowrap text-zinc-400">${formatCurrency(item.spend)}</td>
      <td class="px-3 py-3 whitespace-nowrap text-zinc-400">${formatNumber(item.clicks)}</td>
      <td class="px-3 py-3 whitespace-nowrap ${item.ctr >= 3 ? 'text-amber-300' : item.ctr < 1.5 ? 'text-red-400' : 'text-zinc-400'}">${formatPercent(item.ctr)}</td>
      <td class="px-3 py-3 whitespace-nowrap text-zinc-400">${formatCurrency(item.cpc)}</td>
      <td class="px-3 py-3 whitespace-nowrap text-zinc-400">${formatNumber(item.leads)}</td>
      <td class="px-3 py-3 whitespace-nowrap ${item.cpl > 0 && item.cpl < 10 ? 'text-amber-300' : item.cpl > 25 ? 'text-red-400' : 'text-zinc-400'}">${item.leads ? formatCurrency(item.cpl) : '—'}</td>
      <td class="px-3 py-3">
        <button
          type="button"
          data-campaign-detail="${escapeHtml(item.id)}"
          class="flex max-w-[220px] flex-wrap gap-1 text-left"
          title="Ver detalhes da análise"
        >${tags}</button>
      </td>
      <td class="px-3 py-3 whitespace-nowrap">
        <button type="button" data-report-id="${escapeHtml(item.id)}" aria-label="Gerar relatório" title="Gerar relatório" class="report-btn inline-flex items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10 px-2.5 py-1.5 text-xs text-violet-300 hover:bg-violet-500/20 disabled:opacity-50" ${isGenerating ? 'disabled' : ''}>
          ${isGenerating ? '<i class="fa-solid fa-spinner fa-spin"></i>' : '<i class="fa-solid fa-file-lines"></i>'}
        </button>
      </td>
    </tr>
  `
}

function renderTable(items, bestId) {
  if (state.loading) {
    return `<div class="surface-card p-12 text-center"><div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400"></div></div>`
  }
  if (!items.length) {
    return `<div class="surface-card p-12 text-center text-zinc-500">Nenhum resultado.</div>`
  }

  return `
    <div class="surface-card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr class="border-b border-zinc-800/60 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
              ${TABLE_SORT_COLUMNS.map((column) => renderSortHeader(column)).join('')}
              <th class="px-3 py-3">Análise</th>
              <th class="px-3 py-3">Relatório</th>
            </tr>
          </thead>
          <tbody>${items.map((item) => renderTableRow(item, bestId)).join('')}</tbody>
        </table>
      </div>
    </div>
  `
}

function render() {
  const shellClass = state.sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'
  const isCompare = state.page === 'compare'
  const isPurchases = state.page === 'purchases'
  const preset = getComparePreset(state.compare.preset)

  let mainContent = ''
  let recommendationsPanel = []
  let campaignDetail = null
  let periodLabel = getPeriodLabel(state.period, rangeOptions(), PERIODS)

  if (isPurchases) {
    mainContent = renderPurchasesPage({ state })
  } else if (isCompare) {
    const currentCampaigns = state.compare.current?.campaigns ?? []
    const previousCampaigns = state.compare.previous?.campaigns ?? []
    const metrics =
      state.compare.loading || (!state.compare.loaded && !state.compare.error)
        ? []
        : buildCompareSummary(currentCampaigns, previousCampaigns)
    const rows =
      state.compare.loading || (!state.compare.loaded && !state.compare.error)
        ? []
        : buildCampaignCompareRows(currentCampaigns, previousCampaigns)

    mainContent = `
      ${renderPermissionBanner()}
      ${renderComparePage({ state, metrics, rows, preset })}
    `
  } else {
    const analysisOptions = { dailyByCampaign: state.dailyByCampaign }
    const items = getFilteredItems()
    const rawItems = state.data[state.level] ?? []
    const { totals, best, worst, enriched, activeRanked } = state.loading
      ? { totals: {}, best: null, worst: null, enriched: [], activeRanked: [] }
      : computeSummary(items, analysisOptions)
    const sortedItems = state.loading ? [] : sortTableItems(enriched)
    const recommendations = state.loading ? [] : buildRecommendations(items, analysisOptions)
    recommendationsPanel = state.loading
      ? []
      : buildRecommendationsPanelData(items, analysisOptions)
    campaignDetail =
      !state.loading && state.campaignDetailModal.open && state.campaignDetailModal.itemId
        ? buildCampaignDetailData(state.campaignDetailModal.itemId, items, analysisOptions)
        : null
    const avgFrequency = state.loading ? 0 : computeAvgFrequency(rawItems)
    periodLabel = getPeriodLabel(state.period, rangeOptions(), PERIODS)
    const bestId = best?.id ?? null
    const sortMeta = TABLE_SORT_META[state.tableSort.key]
    const sortHint =
      state.tableSort.key === 'score'
        ? 'Melhor desempenho · ordenado por score'
        : `Ordenado por ${sortMeta?.label ?? state.tableSort.key} · ${state.tableSort.dir === 'asc' ? 'crescente' : 'decrescente'}`

    mainContent = `
      ${renderPermissionBanner()}
      ${renderErrorBanner()}

      ${renderWelcomeBrief({ loading: state.loading, totals, best, worst, periodLabel, recommendationCount: recommendations.length, user: state.user })}
      ${renderSemaphoreKpis({ loading: state.loading, totals, avgFrequency })}
      ${renderBestWorstCards({ loading: state.loading, best, worst })}
      ${renderRanking(activeRanked?.length ? activeRanked : [], state.loading, bestId)}

      <section id="campaigns" class="scroll-mt-20 space-y-4">
        <div>
          <p class="section-label">Detalhamento</p>
          <h2 class="section-title mt-1">Todas as ${LEVELS[state.level].toLowerCase()}</h2>
          <p class="mt-1 text-sm text-zinc-500"><i class="fa-solid fa-trophy text-gold mr-1"></i> ${escapeHtml(sortHint)}</p>
        </div>
        ${renderTable(sortedItems, bestId)}
      </section>
    `
  }

  document.querySelector('#app').innerHTML = `
    <div class="app-shell ${shellClass}">
      ${renderSidebar({ state })}
      <div id="sidebar-backdrop" class="${state.sidebarOpen && window.innerWidth < 1280 ? 'sidebar-backdrop-visible' : 'hidden'}"></div>

      <div class="main-content">
        ${renderTopBar({ state })}

        <div class="page-inner space-y-6 sm:space-y-8">
          ${mainContent}
        </div>
      </div>

      ${renderAccountModal({ state })}
      ${state.page === 'dashboard' ? renderFilterModal({ state }) : ''}
      ${renderReportModal()}
      ${renderRecommendationsModal({
        open: state.recommendationsModal.open,
        items: recommendationsPanel,
        periodLabel,
      })}
      ${renderCampaignDetailModal({
        open: state.campaignDetailModal.open,
        detail: campaignDetail,
        periodLabel,
      })}
    </div>
  `

  bindEvents()
  fillReportContent()
  applyShellLayout()
}

function renderPermissionBanner() {
  if (!state.permission || state.permission.hasAccessToDefault) return ''
  return `
    <div class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <p class="font-semibold">Sem permissão para a conta configurada</p>
      <p class="mt-1 text-xs opacity-90">${escapeHtml(state.permission.message ?? '')}</p>
    </div>
  `
}

function renderErrorBanner() {
  if (!state.error) return ''
  return `
    <div class="rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-200">
      <p class="font-medium">${escapeHtml(state.error)}</p>
      <button id="retry-load" type="button" class="mt-2 text-xs underline">Tentar novamente</button>
    </div>
  `
}

function renderReportConfirmation() {
  const title = state.report.title || 'Campanha'
  return `
    <div class="report-confirmation">
      <div class="report-confirmation-icon">
        <i class="fa-solid fa-circle-check"></i>
      </div>
      <p class="report-confirmation-eyebrow">Solicitação enviada</p>
      <h4 class="report-confirmation-title">Relatório em andamento</h4>
      <p class="report-confirmation-text">
        O relatório de <strong>${escapeHtml(title)}</strong> foi enviado para processamento.
        Em instantes você receberá o resultado pelo fluxo configurado no n8n.
      </p>
      <div class="report-confirmation-steps">
        <div class="report-confirmation-step">
          <span class="report-confirmation-step-dot report-confirmation-step-dot-done"></span>
          <span>Dados enviados ao n8n</span>
        </div>
        <div class="report-confirmation-step">
          <span class="report-confirmation-step-dot report-confirmation-step-dot-active"></span>
          <span>IA gerando análise</span>
        </div>
        <div class="report-confirmation-step">
          <span class="report-confirmation-step-dot"></span>
          <span>Entrega do relatório</span>
        </div>
      </div>
      <p class="report-confirmation-hint">
        <i class="fa-solid fa-bolt text-violet-400"></i>
        Pode fechar esta janela — o processamento continua em segundo plano.
      </p>
    </div>
  `
}

function renderReportModal() {
  if (!state.report.open) return ''

  let body = ''
  if (state.report.loading) {
    body =
      '<div class="py-16 text-center"><div class="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-400"></div><p class="mt-4 text-sm text-zinc-500">Enviando solicitação...</p></div>'
  } else if (state.report.error) {
    body = `<p class="text-red-300">${escapeHtml(state.report.error)}</p>`
  } else if (state.report.format === 'confirmation') {
    body = renderReportConfirmation()
  } else if (state.report.format === 'html') {
    body = '<div id="report-content" class="report-content"></div>'
  } else {
    body = '<div id="report-content" class="whitespace-pre-wrap text-sm text-zinc-200"></div>'
  }

  return `
    <div id="report-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div id="report-modal-backdrop" class="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"></div>
      <div class="relative flex max-h-[90vh] w-full ${state.report.format === 'confirmation' ? 'max-w-lg' : 'max-w-3xl'} flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl ${state.report.format === 'confirmation' ? 'report-modal-confirmation' : ''}">
        <div class="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h3 class="font-semibold text-zinc-50">${escapeHtml(state.report.title)}</h3>
          <button id="report-modal-close" type="button" class="rounded-lg border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800">Fechar</button>
        </div>
        <div class="overflow-y-auto px-5 py-4">${body}</div>
      </div>
    </div>
  `
}

function escapeSrcdoc(html) {
  return String(html)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
}

function fillReportContent() {
  const container = document.getElementById('report-content')
  if (!container || state.report.loading || state.report.error || state.report.format === 'confirmation') return
  if (state.report.format === 'html') {
    container.innerHTML = `<iframe sandbox="" referrerpolicy="no-referrer" title="Relatório" class="report-frame" srcdoc="${escapeSrcdoc(state.report.content)}"></iframe>`
  } else {
    container.textContent = state.report.content
  }
}

function escapeHtml(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen
  saveSidebarPreference()
  applyShellLayout()
}

async function loadData() {
  state.loading = true
  state.error = null
  render()

  try {
    state.permission = await fetchPermissions()

    if (!state.adAccounts.length) {
      const { accounts, defaultAccountId, permissionWarning } = await fetchAdAccounts()
      state.adAccounts = accounts
      if (!state.accountId) state.accountId = defaultAccountId ?? accounts[0]?.id ?? null
      const selected = accounts.find((a) => a.id === state.accountId)
      state.accountName = selected?.name ?? null
      if (permissionWarning && state.accountId === defaultAccountId) state.error = permissionWarning.error
    }

    if (state.permission && !state.permission.hasAccessToDefault && state.accountId === state.permission.defaultAccountId) {
      throw new Error(state.permission.message)
    }

    const payload = await fetchMetaInsights(state.period, state.accountId, rangeOptions())
    state.data = { campaigns: payload.campaigns ?? [], adSets: payload.adSets ?? [], ads: payload.ads ?? [] }
    state.dailyByCampaign = payload.dailyByCampaign ?? {}
    state.source = payload.source ?? 'meta'
    state.accountId = payload.account?.id ?? state.accountId
    state.accountName = payload.account?.name ?? state.accountName
    state.currency = payload.account?.currency ?? 'BRL'
    if (state.accountId) {
      pushRecentAccount(state.accountId)
      state.recentAccountIds = readRecentAccountIds()
    }
    state.error = null
  } catch (error) {
    if (error.message === 'SESSION_EXPIRED') {
      window.location.reload()
      return
    }
    state.error = error.message
    const mock = getMockData(state.period, rangeOptions())
    state.data = { campaigns: mock.campaigns, adSets: mock.adSets, ads: mock.ads }
    state.dailyByCampaign = mock.dailyByCampaign ?? {}
    state.source = 'mock'
  } finally {
    state.loading = false
    syncFilterDraft()
    render()
  }
}

function getBenchmarkItems() {
  let items = [...(state.data[state.level] ?? [])]
  if (state.objective !== 'all') items = items.filter((i) => i.objective === state.objective)
  return enrichItems(items, { dailyByCampaign: state.dailyByCampaign })
}

async function generateReport(itemId) {
  const allItems = getBenchmarkItems()
  const item = allItems.find((row) => String(row.id) === String(itemId))
  if (!item) return

  state.report = { open: true, loading: true, loadingItemId: itemId, error: null, title: item.name, format: 'text', content: '' }
  render()

  try {
    const response = await requestReport(
      buildReportPayload({
        item,
        level: state.level,
        period: state.period,
        since: state.since,
        until: state.until,
        account: { id: state.accountId, name: state.accountName, currency: state.currency },
        currency: state.currency,
        source: state.source,
        allItems,
        data: state.data,
      }),
    )
    state.report = {
      open: true,
      loading: false,
      loadingItemId: null,
      error: null,
      title: item.name,
      format: response.format ?? 'text',
      content: response.report ?? '',
    }
  } catch (error) {
    state.report = { open: true, loading: false, loadingItemId: null, error: error.message, title: item.name, format: 'text', content: '' }
  }
  render()
  fillReportContent()
}

function closeReportModal() {
  state.report = { open: false, loading: false, loadingItemId: null, error: null, title: '', format: 'text', content: '' }
  render()
}

function openRecommendationsModal() {
  state.recommendationsModal.open = true
  state.campaignDetailModal = { open: false, itemId: null }
  render()
}

function closeRecommendationsModal() {
  state.recommendationsModal.open = false
  render()
}

function openCampaignDetailModal(itemId) {
  if (!itemId) return
  state.campaignDetailModal = { open: true, itemId }
  state.recommendationsModal.open = false
  state.accountModalOpen = false
  state.filterModalOpen = false
  render()
}

function closeCampaignDetailModal() {
  if (!state.campaignDetailModal.open) return
  state.campaignDetailModal = { open: false, itemId: null }
  render()
}

function bindEvents() {
  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar)
  document.getElementById('sidebar-toggle-mobile')?.addEventListener('click', toggleSidebar)
  document.getElementById('sidebar-backdrop')?.addEventListener('click', toggleSidebar)

  document.querySelectorAll('[data-nav-page]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.navPage))
  })

  document.querySelectorAll('[data-campaign-detail]').forEach((btn) => {
    btn.addEventListener('click', () => openCampaignDetailModal(btn.dataset.campaignDetail))
  })

  document.getElementById('btn-recommendations')?.addEventListener('click', openRecommendationsModal)

  document.querySelectorAll('[data-sort-key]').forEach((btn) => {
    btn.addEventListener('click', () => toggleTableSort(btn.dataset.sortKey))
  })

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await logout()
    window.location.reload()
  })

  document.getElementById('fab-account')?.addEventListener('click', openAccountModal)
  document.getElementById('fab-filter')?.addEventListener('click', openFilterModal)

  document.getElementById('account-modal-close')?.addEventListener('click', closeAccountModal)
  document.getElementById('account-modal-backdrop')?.addEventListener('click', closeAccountModal)
  document.querySelectorAll('[data-account-id]').forEach((button) => {
    button.addEventListener('click', () => {
      selectAccount(button.dataset.accountId)
    })
  })

  document.getElementById('filter-modal-close')?.addEventListener('click', closeFilterModal)
  document.getElementById('filter-modal-backdrop')?.addEventListener('click', closeFilterModal)
  document.getElementById('filter-period')?.addEventListener('change', onFilterPeriodChange)
  document.getElementById('btn-apply-filters')?.addEventListener('click', applyFilters)

  document.getElementById('compare-preset')?.addEventListener('change', (event) => {
    changeComparePreset(event.target.value)
  })
  document.getElementById('compare-retry')?.addEventListener('click', loadCompareData)

  document.getElementById('purchases-refresh')?.addEventListener('click', () => {
    loadPurchasesData({ force: true })
  })
  document.getElementById('purchases-retry')?.addEventListener('click', () => {
    loadPurchasesData({ force: true })
  })
  document.getElementById('purchases-search')?.addEventListener('input', (event) => {
    updatePurchasesFilter('search', event.target.value)
  })
  document.getElementById('purchases-campanha')?.addEventListener('change', (event) => {
    updatePurchasesFilter('campanha', event.target.value)
  })
  document.getElementById('purchases-curso')?.addEventListener('change', (event) => {
    updatePurchasesFilter('curso', event.target.value)
  })

  document.getElementById('retry-load')?.addEventListener('click', loadData)

  document.querySelectorAll('.report-btn').forEach((btn) => {
    btn.addEventListener('click', () => generateReport(btn.dataset.reportId))
  })

  document.getElementById('report-modal-close')?.addEventListener('click', closeReportModal)
  document.getElementById('report-modal-backdrop')?.addEventListener('click', closeReportModal)

  document.getElementById('recommendations-modal-close')?.addEventListener('click', closeRecommendationsModal)
  document.getElementById('recommendations-modal-backdrop')?.addEventListener('click', closeRecommendationsModal)

  document.getElementById('campaign-detail-modal-close')?.addEventListener('click', closeCampaignDetailModal)
  document.getElementById('campaign-detail-modal-backdrop')?.addEventListener('click', closeCampaignDetailModal)
}

export function initApp() {
  if (!window.__dashShellResizeBound) {
    window.__dashShellResizeBound = true
    let wasOverlay = window.innerWidth < 1280
    window.addEventListener('resize', () => {
      const isOverlay = window.innerWidth < 1280
      if (!wasOverlay && isOverlay && state.sidebarOpen) {
        state.sidebarOpen = false
      }
      wasOverlay = isOverlay
      applyShellLayout()
    })
  }
  loadData()
}
