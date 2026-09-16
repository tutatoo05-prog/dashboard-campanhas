function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
  )
}

export function filterPurchases(purchases, { search = '', campanha = '', curso = '' } = {}) {
  const q = search.trim().toLowerCase()
  const campanhaKey = campanha.trim().toLowerCase()
  const cursoKey = curso.trim().toLowerCase()

  return (purchases ?? []).filter((row) => {
    if (campanhaKey && String(row.campanha ?? '').toLowerCase() !== campanhaKey) {
      return false
    }
    if (cursoKey && String(row.curso ?? '').toLowerCase() !== cursoKey) {
      return false
    }
    if (!q) return true

    const haystack = [row.nome, row.email, row.telefone, row.curso, row.campanha, row.data]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(q)
  })
}

function parsePurchaseDate(value) {
  if (!value) return 0
  const text = String(value).trim()
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (br) {
    const day = Number(br[1])
    const month = Number(br[2])
    let year = Number(br[3])
    if (year < 100) year += 2000
    return new Date(year, month - 1, day).getTime()
  }
  const ts = Date.parse(text)
  return Number.isNaN(ts) ? 0 : ts
}

export function sortPurchasesByDateDesc(purchases) {
  return [...(purchases ?? [])].sort(
    (a, b) => parsePurchaseDate(b.data) - parsePurchaseDate(a.data),
  )
}

function renderKpis(purchases) {
  const total = purchases.length
  const campanhas = uniqueSorted(purchases.map((p) => p.campanha)).length
  const cursos = uniqueSorted(purchases.map((p) => p.curso)).length

  const cards = [
    { label: 'Compras', value: String(total), icon: 'fa-bag-shopping' },
    { label: 'Campanhas / canais', value: String(campanhas), icon: 'fa-bullhorn' },
    { label: 'Cursos', value: String(cursos), icon: 'fa-graduation-cap' },
  ]

  return `
    <div class="grid gap-3 sm:grid-cols-3">
      ${cards
        .map(
          (card) => `
        <div class="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-4">
          <p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            <i class="fa-solid ${card.icon} text-gold/80"></i>
            ${escapeHtml(card.label)}
          </p>
          <p class="font-display mt-2 text-3xl text-zinc-50">${escapeHtml(card.value)}</p>
        </div>
      `,
        )
        .join('')}
    </div>
  `
}

function renderFilters({ state, campanhaOptions, cursoOptions }) {
  const filters = state.purchases?.filters ?? {}

  return `
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="block min-w-0">
        <span class="mb-1.5 block text-xs text-zinc-500">Buscar</span>
        <input
          id="purchases-search"
          type="search"
          class="filter-input"
          placeholder="Nome, e-mail, telefone..."
          value="${escapeHtml(filters.search ?? '')}"
        />
      </label>
      <label class="block min-w-0">
        <span class="mb-1.5 block text-xs text-zinc-500">Campanha / canal</span>
        <select id="purchases-campanha" class="filter-input">
          <option value="">Todas</option>
          ${campanhaOptions
            .map(
              (value) =>
                `<option value="${escapeHtml(value)}" ${filters.campanha === value ? 'selected' : ''}>${escapeHtml(value)}</option>`,
            )
            .join('')}
        </select>
      </label>
      <label class="block min-w-0">
        <span class="mb-1.5 block text-xs text-zinc-500">Curso</span>
        <select id="purchases-curso" class="filter-input">
          <option value="">Todos</option>
          ${cursoOptions
            .map(
              (value) =>
                `<option value="${escapeHtml(value)}" ${filters.curso === value ? 'selected' : ''}>${escapeHtml(value)}</option>`,
            )
            .join('')}
        </select>
      </label>
    </div>
  `
}

function renderTable(rows, loading) {
  if (loading) {
    return `
      <div class="rounded-2xl border border-zinc-800/70 bg-zinc-900/30 px-4 py-16 text-center text-sm text-zinc-500">
        <i class="fa-solid fa-spinner fa-spin mr-2"></i>
        Carregando compras...
      </div>
    `
  }

  if (!rows.length) {
    return `
      <div class="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 px-4 py-16 text-center">
        <p class="text-sm font-medium text-zinc-300">Nenhuma compra encontrada</p>
        <p class="mt-1 text-xs text-zinc-500">Ajuste os filtros ou aguarde novas vendas na planilha.</p>
      </div>
    `
  }

  return `
    <div class="overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-900/30">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr class="border-b border-zinc-800/60 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
              <th class="px-3 py-3">Nome</th>
              <th class="px-3 py-3">E-mail</th>
              <th class="px-3 py-3">Telefone</th>
              <th class="px-3 py-3">Curso</th>
              <th class="px-3 py-3">Campanha</th>
              <th class="px-3 py-3">Liberação</th>
              <th class="px-3 py-3">Data</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr class="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-900/50">
                <td class="px-3 py-3 font-medium text-zinc-100">${escapeHtml(row.nome || '—')}</td>
                <td class="px-3 py-3 text-zinc-400">
                  ${
                    row.email
                      ? `<a class="hover:text-gold" href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a>`
                      : '—'
                  }
                </td>
                <td class="px-3 py-3 whitespace-nowrap text-zinc-400">${escapeHtml(row.telefone || '—')}</td>
                <td class="px-3 py-3 text-zinc-300">${escapeHtml(row.curso || '—')}</td>
                <td class="px-3 py-3">
                  <span class="inline-flex rounded-md border border-zinc-700/80 bg-zinc-950/50 px-2 py-0.5 text-xs text-zinc-300">
                    ${escapeHtml(row.campanha || '—')}
                  </span>
                </td>
                <td class="px-3 py-3 text-zinc-400">${escapeHtml(row.liberacao || '—')}</td>
                <td class="px-3 py-3 whitespace-nowrap text-zinc-400">${escapeHtml(row.data || '—')}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `
}

export function renderPurchasesPage({ state }) {
  const purchasesState = state.purchases ?? {
    loading: false,
    error: null,
    items: [],
    filters: { search: '', campanha: '', curso: '' },
  }
  const allItems = purchasesState.items ?? []
  const filtered = sortPurchasesByDateDesc(
    filterPurchases(allItems, purchasesState.filters),
  )
  const campanhaOptions = uniqueSorted(allItems.map((p) => p.campanha))
  const cursoOptions = uniqueSorted(allItems.map((p) => p.curso))

  return `
    <section class="space-y-6 sm:space-y-8">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="section-label text-gold/70">Hotmart · planilha</p>
          <h1 class="font-display mt-1 text-3xl text-zinc-50 sm:text-4xl">Compras</h1>
          <p class="mt-2 max-w-xl text-sm text-zinc-500">
            Lista de quem comprou, com campanha/canal vindos do fluxo n8n
            ${purchasesState.loading || !allItems.length ? '' : ` · ${filtered.length} de ${allItems.length}`}.
          </p>
        </div>
        <button
          id="purchases-refresh"
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          ${purchasesState.loading ? 'disabled' : ''}
        >
          <i class="fa-solid fa-arrows-rotate ${purchasesState.loading ? 'fa-spin' : ''}"></i>
          Atualizar
        </button>
      </div>

      ${
        purchasesState.error
          ? `
        <div class="rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-200">
          <p class="font-medium">${escapeHtml(purchasesState.error)}</p>
          <button id="purchases-retry" type="button" class="mt-2 text-xs underline">Tentar novamente</button>
        </div>
      `
          : ''
      }

      ${purchasesState.loading && !allItems.length ? '' : renderKpis(allItems)}
      ${renderFilters({ state, campanhaOptions, cursoOptions })}
      ${renderTable(filtered, purchasesState.loading && !allItems.length)}
    </section>
  `
}
