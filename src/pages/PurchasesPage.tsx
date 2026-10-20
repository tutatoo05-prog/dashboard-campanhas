import { useMemo, useState } from 'react'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { useQuery } from '@tanstack/react-query'
import { fetchPurchases } from '@/services/purchaseService.ts'
import { fetchLeads } from '@/services/leadService.ts'
import { PurchaseModal } from '@/components/purchases/PurchaseModal.tsx'
import { GroupSalesModal, type GroupKind } from '@/components/purchases/GroupSalesModal.tsx'
import { HotmartEventsPanel, type EventGroup } from '@/components/purchases/HotmartEventsPanel.tsx'
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

/** Valor da campanha/curso de uma venda; vazio vira "Sem identificação" (igual nas listas e no modal). */
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
  onOpen: (key: string) => void
}

/** Lista de campanhas/cursos; clicar numa linha abre, em janela, as vendas daquele grupo. */
function GroupList({ rows, onOpen }: GroupListProps) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-zinc-600">Nenhuma venda ainda.</p>
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={() => onOpen(row.key)}
          title={`Ver as vendas de "${row.key}"`}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-left transition-colors hover:border-amber-400/60 hover:bg-amber-400/5"
        >
          <span className="truncate text-sm text-zinc-300">{row.key}</span>
          <span className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
            <span>{formatNumber(row.count)} vendas</span>
            {row.revenueCount > 0 && <span className="text-amber-200">{formatCurrency(row.revenue)}</span>}
            <i className="fa-solid fa-chevron-right text-zinc-600" aria-hidden="true" />
          </span>
        </button>
      ))}
    </div>
  )
}

function timeOf(purchase: Purchase): number {
  const time = purchase.createdAt ? new Date(purchase.createdAt).getTime() : NaN
  return Number.isFinite(time) ? time : 0
}

/** "há 5 min", "há 3 h", "há 2 dias" a partir do momento em que a venda entrou. */
function timeAgo(iso?: string): string {
  const time = iso ? new Date(iso).getTime() : NaN
  if (!Number.isFinite(time)) return '—'
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000))
  if (minutes < 1) return 'agora mesmo'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.round(hours / 24)
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

function isCanceled(purchase: Purchase): boolean {
  return purchase.status === 'cancelado'
}

export default function PurchasesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [selected, setSelected] = useState<Purchase | null>(null)
  // Janela com as vendas de uma campanha ou de um curso (abre ao clicar nas listas "Vendas por ...").
  const [group, setGroup] = useState<{ kind: GroupKind; key: string; eyebrow?: string; items?: Purchase[] } | null>(null)

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return byStatus
    return byStatus.filter((purchase) =>
      [purchase.nome, purchase.email, purchase.curso, purchase.campanha]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [byStatus, search])

  const filteredRevenue = filtered.reduce(
    (sum, purchase) => sum + (typeof purchase.valor === 'number' ? purchase.valor : 0),
    0,
  )

  const totalRevenue = purchases.reduce(
    (sum, purchase) => sum + (typeof purchase.valor === 'number' ? purchase.valor : 0),
    0,
  )
  const withValue = purchases.filter((purchase) => typeof purchase.valor === 'number')
  const avgTicket = withValue.length ? totalRevenue / withValue.length : 0

  const latestSales = useMemo(
    () => [...purchases].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, 3),
    [purchases],
  )

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

          {latestSales.length > 0 && (
            <section className="surface-card p-4">
              <p className="section-label">Acabou de vender</p>
              <h3 className="section-title mt-1 mb-3">Últimas 3 vendas</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {latestSales.map((purchase, index) => (
                  <button
                    key={purchase.id || `${purchase.email}-${index}`}
                    type="button"
                    onClick={() => setSelected(purchase)}
                    title="Ver os dados da venda"
                    className="cursor-pointer rounded-lg border border-amber-400/40 bg-amber-400/5 p-3 text-left transition-colors hover:border-amber-400/80 hover:bg-amber-400/10"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-500">{timeAgo(purchase.createdAt)}</span>
                      {isCanceled(purchase) && (
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
                          Cancelado
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-zinc-100">{purchase.nome || '—'}</p>
                    <p className="truncate text-xs text-zinc-400">{purchase.curso || '—'}</p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <span className="truncate text-xs text-zinc-500">{groupKey(purchase, 'campanha')}</span>
                      <span className="shrink-0 text-base font-semibold text-amber-200">
                        {typeof purchase.valor === 'number' ? formatCurrency(purchase.valor) : '—'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <HotmartEventsPanel
            onOpen={(eventGroup: EventGroup) =>
              setGroup({ kind: 'evento', key: eventGroup.key, eyebrow: eventGroup.eyebrow, items: eventGroup.items })
            }
          />

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="surface-card p-4">
              <p className="section-label">Por campanha</p>
              <h3 className="section-title mt-1 mb-3">Vendas por campanha</h3>
              <GroupList rows={byCampaign} onOpen={(key) => setGroup({ kind: 'campanha', key })} />
            </div>

            <div className="surface-card p-4">
              <p className="section-label">Por curso</p>
              <h3 className="section-title mt-1 mb-3">Vendas por curso</h3>
              <GroupList rows={byCourse} onOpen={(key) => setGroup({ kind: 'curso', key })} />
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="section-label">Lista</p>
                <h3 className="section-title mt-1">Todas as vendas</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatNumber(filtered.length)} {filtered.length === 1 ? 'venda' : 'vendas'}
                  {filteredRevenue > 0 && <> · {formatCurrency(filteredRevenue)}</>}
                </p>
              </div>
              <div className="list-tools">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="filter-select"
                >
                  <option value="todos">Todos os status</option>
                  <option value="ativo">Somente ativos</option>
                  <option value="cancelado">Somente cancelados</option>
                </select>
                <input
                  type="text"
                  placeholder="Buscar por nome, e-mail, curso ou campanha..."
                  className="filter-select"
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

            <div className="overflow-auto md:max-h-[520px]">
              <table className="data-table data-table-brief">
                <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="font-medium">Nome</th>
                    <th className="font-medium">Contato</th>
                    <th className="font-medium">Curso</th>
                    <th className="font-medium">Campanha</th>
                    <th className="font-medium">Data</th>
                    <th className="num font-medium">Valor</th>
                    <th className="font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((purchase, index) => (
                    <tr
                      key={purchase.id || `${purchase.email}-${index}`}
                      onClick={() => setSelected(purchase)}
                      className="cursor-pointer border-b border-zinc-900/80 transition-colors last:border-0 hover:bg-amber-400/10"
                    >
                      <td className="cell-name text-zinc-200" title={purchase.nome} data-label="Nome">
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
                      <td className="cell-more text-zinc-400" title={purchase.email} data-label="Contato">
                        {purchase.email || purchase.telefone || '—'}
                      </td>
                      <td className="cell-brief text-zinc-300" title={purchase.curso} data-label="Curso">
                        {purchase.curso || '—'}
                      </td>
                      <td className="cell-more text-zinc-300" title={purchase.campanha} data-label="Campanha">
                        {purchase.campanha || '—'}
                      </td>
                      <td className="cell-more text-zinc-500" data-label="Data">{purchase.data || '—'}</td>
                      <td className="cell-key num text-zinc-300" data-label="Valor">
                        {typeof purchase.valor === 'number' ? formatCurrency(purchase.valor) : '—'}
                      </td>
                      <td  data-label="Status" className="cell-brief cell-nolabel">
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
                      <td colSpan={7} className="cell-empty text-center text-zinc-600">
                        Nenhuma venda encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Venda aberta: se veio de dentro de uma lista, fechar volta para ela. */}
          {selected ? (
            <PurchaseModal
              purchase={selected}
              purchases={purchases}
              leads={leadsQuery.data}
              leadsError={leadsQuery.isError}
              onClose={() => setSelected(null)}
              onSelect={setSelected}
              closeLabel={group ? 'Voltar à lista' : 'Fechar'}
            />
          ) : (
            group && (
              <GroupSalesModal
                kind={group.kind}
                label={group.key}
                eyebrow={group.eyebrow}
                purchases={
                  group.items ??
                  purchases.filter((purchase) => groupKey(purchase, group.kind === 'curso' ? 'curso' : 'campanha') === group.key)
                }
                onClose={() => setGroup(null)}
                onOpenSale={setSelected}
              />
            )
          )}
        </>
      )}
    </div>
  )
}
