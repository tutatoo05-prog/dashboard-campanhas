import { useMemo, useRef, useState } from 'react'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { useQuery } from '@tanstack/react-query'
import { fetchPurchases } from '@/services/purchaseService.ts'
import { fetchLeads } from '@/services/leadService.ts'
import { PurchaseModal } from '@/components/purchases/PurchaseModal.tsx'
import { formatCurrency, formatNumber } from '@/lib/format.ts'
import { exportCsv } from '@/lib/csv.ts'
import type { Purchase } from '@/types'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'

interface GroupRow {
  key: string
  count: number
  revenue: number
  revenueCount: number
}

const UNIDENTIFIED = 'Sem identificação'

/** Valor da campanha/curso de uma venda; vazio vira "Sem identificação" (igual nas listas e no filtro). */
function groupKey(purchase: Purchase, field: 'campanha' | 'curso'): string {
  return String(purchase[field] ?? '').trim() || UNIDENTIFIED
}

function groupBy(purchases: Purchase[], field: 'campanha' | 'curso'): GroupRow[] {
  const map = new Map<string, GroupRow>()

  for (const purchase of purchases) {
    const key = groupKey(purchase, field)
    const row = map.get(key) ?? { key, count: 0, revenue: 0, revenueCount: 0 }
    row.count += 1
    if (typeof purchase.valor === 'number') {
      row.revenue += purchase.valor
      row.revenueCount += 1
    }
    map.set(key, row)
  }

  return [...map.values()].sort((a, b) => b.count - a.count)
}

type StatusFilter = 'todos' | 'ativo' | 'cancelado'

interface GroupListProps {
  rows: GroupRow[]
  active: string | null
  onToggle: (key: string) => void
}

/** Lista de campanhas/cursos; clicar numa linha filtra "Todas as vendas" (clicar de novo limpa). */
function GroupList({ rows, active, onToggle }: GroupListProps) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-zinc-600">Nenhuma venda ainda.</p>
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const isActive = active === row.key
        return (
          <button
            key={row.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(row.key)}
            title={isActive ? 'Clique para limpar o filtro' : `Ver as vendas de "${row.key}"`}
            className={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
              isActive
                ? 'border-amber-400/70 bg-amber-400/10'
                : 'border-zinc-800/60 bg-zinc-950/40 hover:border-zinc-600'
            }`}
          >
            <span className="truncate text-sm text-zinc-300">{row.key}</span>
            <span className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
              <span>{formatNumber(row.count)} vendas</span>
              {row.revenueCount > 0 && (
                <span className="text-amber-200">{formatCurrency(row.revenue)}</span>
              )}
              <i
                className={`fa-solid ${isActive ? 'fa-xmark text-amber-300' : 'fa-chevron-right text-zinc-600'}`}
                aria-hidden="true"
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}

function isCanceled(purchase: Purchase): boolean {
  return purchase.status === 'cancelado'
}

export default function PurchasesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null)
  const [courseFilter, setCourseFilter] = useState<string | null>(null)
  const listRef = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<Purchase | null>(null)

  const purchasesQuery = useQuery({
    queryKey: ['purchases'],
    queryFn: fetchPurchases,
    retry: false,
  })

  // Os cadastros do site só são buscados quando alguém abre uma venda (o modal mostra de onde a pessoa veio).
  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: fetchLeads,
    enabled: Boolean(selected),
    retry: false,
  })

  const purchases = purchasesQuery.data ?? []
  const canceledCount = purchases.filter(isCanceled).length

  const byStatus = useMemo(() => {
    if (statusFilter === 'todos') return purchases
    return purchases.filter((purchase) =>
      statusFilter === 'cancelado' ? isCanceled(purchase) : !isCanceled(purchase),
    )
  }, [purchases, statusFilter])

  const byGroup = useMemo(
    () =>
      byStatus.filter(
        (purchase) =>
          (!campaignFilter || groupKey(purchase, 'campanha') === campaignFilter) &&
          (!courseFilter || groupKey(purchase, 'curso') === courseFilter),
      ),
    [byStatus, campaignFilter, courseFilter],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return byGroup
    return byGroup.filter((purchase) =>
      [purchase.nome, purchase.email, purchase.curso, purchase.campanha]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [byGroup, search])

  const filteredRevenue = filtered.reduce(
    (sum, purchase) => sum + (typeof purchase.valor === 'number' ? purchase.valor : 0),
    0,
  )
  const hasGroupFilter = Boolean(campaignFilter || courseFilter)

  function toggleFilter(kind: 'campanha' | 'curso', key: string) {
    const setter = kind === 'campanha' ? setCampaignFilter : setCourseFilter
    const current = kind === 'campanha' ? campaignFilter : courseFilter
    const next = current === key ? null : key
    setter(next)
    // Ao escolher uma linha, leva direto para a lista já filtrada.
    if (next) listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function clearGroupFilters() {
    setCampaignFilter(null)
    setCourseFilter(null)
  }

  const totalRevenue = purchases.reduce(
    (sum, purchase) => sum + (typeof purchase.valor === 'number' ? purchase.valor : 0),
    0,
  )
  const withValue = purchases.filter((purchase) => typeof purchase.valor === 'number')
  const avgTicket = withValue.length ? totalRevenue / withValue.length : 0

  const byCampaign = useMemo(() => groupBy(purchases, 'campanha'), [purchases])
  const byCourse = useMemo(() => groupBy(purchases, 'curso'), [purchases])

  const error = purchasesQuery.error as Error | undefined

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Leads &amp; vendas</p>
        <Typewriter as="h2" className="section-title mt-1" text="Compras" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Todas as vendas registradas, separadas por curso e por campanha de origem — a base
          real de quem virou aluno, não só quem clicou no anúncio.
        </p>
      </PageHero>

      {error && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {error.message === 'SESSION_EXPIRED'
            ? 'Sua sessão expirou. Faça login novamente.'
            : error.message || 'Não foi possível carregar as compras.'}
        </section>
      )}

      {purchasesQuery.isLoading && !error && (
        <section className="surface-card p-8 text-center text-sm text-zinc-500">
          Carregando compras...
        </section>
      )}

      {!purchasesQuery.isLoading && !error && (
        <>
          <section className="kpi-scroll">
            <div className="kpi-card">
              <p className="section-label">Total de vendas</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">
                {formatNumber(purchases.length)}
              </p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Receita registrada</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">
                {withValue.length ? formatCurrency(totalRevenue) : '—'}
              </p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Ticket médio</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">
                {withValue.length ? formatCurrency(avgTicket) : '—'}
              </p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Vendas sem valor</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">
                {formatNumber(purchases.length - withValue.length)}
              </p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Assinaturas canceladas</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">
                {formatNumber(canceledCount)}
              </p>
            </div>
          </section>

          {!withValue.length && purchases.length > 0 && (
            <section className="surface-card border-amber-500/20 p-4 text-sm text-amber-200/90">
              Nenhuma venda tem valor registrado ainda, então a receita fica em branco. Assim
              que o n8n passar o valor de cada venda (ou você preencher manualmente), o ticket
              médio e a receita por campanha aparecem aqui automaticamente.
            </section>
          )}

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="surface-card p-4">
              <p className="section-label">Por campanha</p>
              <h3 className="section-title mt-1 mb-3">Vendas por campanha</h3>
              <GroupList
                rows={byCampaign}
                active={campaignFilter}
                onToggle={(key) => toggleFilter('campanha', key)}
              />
            </div>

            <div className="surface-card p-4">
              <p className="section-label">Por curso</p>
              <h3 className="section-title mt-1 mb-3">Vendas por curso</h3>
              <GroupList
                rows={byCourse}
                active={courseFilter}
                onToggle={(key) => toggleFilter('curso', key)}
              />
            </div>
          </section>

          <section ref={listRef} className="surface-card scroll-mt-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="section-label">Lista</p>
                <h3 className="section-title mt-1">
                  {hasGroupFilter ? 'Vendas filtradas' : 'Todas as vendas'}
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatNumber(filtered.length)} {filtered.length === 1 ? 'venda' : 'vendas'}
                  {filteredRevenue > 0 && <> · {formatCurrency(filteredRevenue)}</>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                >
                  <option value="todos">Todos os status</option>
                  <option value="ativo">Somente ativos</option>
                  <option value="cancelado">Somente cancelados</option>
                </select>
                <input
                  type="text"
                  placeholder="Buscar por nome, e-mail, curso ou campanha..."
                  className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() =>
                    exportCsv(
                      'compras.csv',
                      ['Nome', 'Email', 'Telefone', 'Curso', 'Campanha', 'Data', 'Valor', 'Status'],
                      filtered.map((purchase) => [
                        purchase.nome,
                        purchase.email,
                        purchase.telefone,
                        purchase.curso,
                        purchase.campanha,
                        purchase.data,
                        purchase.valor ?? '',
                        isCanceled(purchase) ? 'Cancelado' : 'Ativo',
                      ]),
                    )
                  }
                  className="shrink-0 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                >
                  <i className="fa-solid fa-download mr-1.5" />
                  CSV
                </button>
              </div>
            </div>

            {hasGroupFilter && (
              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/60 px-4 py-2.5 text-xs">
                <span className="text-zinc-500">Filtrando por:</span>
                {campaignFilter && (
                  <button
                    type="button"
                    onClick={() => setCampaignFilter(null)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-400/10 px-2.5 py-1 text-amber-200 hover:bg-amber-400/20"
                  >
                    Campanha: {campaignFilter}
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                )}
                {courseFilter && (
                  <button
                    type="button"
                    onClick={() => setCourseFilter(null)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-400/10 px-2.5 py-1 text-amber-200 hover:bg-amber-400/20"
                  >
                    Curso: {courseFilter}
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearGroupFilters}
                  className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                >
                  Limpar filtros
                </button>
              </div>
            )}

            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-4 py-2 font-medium">Contato</th>
                    <th className="px-4 py-2 font-medium">Curso</th>
                    <th className="px-4 py-2 font-medium">Campanha</th>
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-4 py-2 text-right font-medium">Valor</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((purchase, index) => (
                    <tr
                      key={purchase.id || `${purchase.email}-${index}`}
                      onClick={() => setSelected(purchase)}
                      className="cursor-pointer border-b border-zinc-900/80 transition-colors last:border-0 hover:bg-amber-400/10"
                    >
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-zinc-200" title={purchase.nome}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelected(purchase)
                          }}
                          className="max-w-full cursor-pointer truncate text-left font-medium hover:underline"
                          title="Ver os dados da venda"
                        >
                          {purchase.nome || '—'}
                        </button>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-zinc-400" title={purchase.email}>
                        {purchase.email || purchase.telefone || '—'}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-zinc-300" title={purchase.curso}>
                        {purchase.curso || '—'}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-zinc-300" title={purchase.campanha}>
                        {purchase.campanha || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500">{purchase.data || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-300">
                        {typeof purchase.valor === 'number' ? formatCurrency(purchase.valor) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {isCanceled(purchase) ? (
                          <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300">
                            Cancelado
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                            Ativo
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">
                        Nenhuma venda encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {selected && (
            <PurchaseModal
              purchase={selected}
              purchases={purchases}
              leads={leadsQuery.data}
              leadsError={leadsQuery.isError}
              onClose={() => setSelected(null)}
              onSelect={setSelected}
            />
          )}
        </>
      )}
    </div>
  )
}
