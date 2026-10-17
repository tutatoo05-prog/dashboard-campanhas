import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchRegistros } from '@/services/registrosService.ts'
import { fetchPurchases } from '@/services/purchaseService.ts'
import { RegistrosGroupModal, type RegistroGroupKind } from '@/components/registros/RegistrosGroupModal.tsx'
import { RegistroModal } from '@/components/registros/RegistroModal.tsx'
import { RegistrosMapa } from '@/components/registros/RegistrosMapa.tsx'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format.ts'
import { exportCsv } from '@/lib/csv.ts'
import { agruparRegistros, apareceTexto, type RegistroAgrupado } from '@/lib/mergeRegistros.ts'
import type { Registro, RegistroTab } from '@/types'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'

const NO_CAMPAIGN = 'Sem campanha'
const PAGE_SIZE = 200

interface CountRow {
  label: string
  total: number
}

function tabKey(item: { planilha: string; aba: string }): string {
  return `${item.planilha}||${item.aba}`
}

function contactKey(record: Registro): string {
  return record.email || record.telefone.replace(/\D/g, '') || record.nome.toLowerCase()
}

function uniqueContacts(records: Registro[]): number {
  return new Set(records.map(contactKey).filter(Boolean)).size
}

function campaignOf(record: Registro): string {
  return record.campanha || NO_CAMPAIGN
}

function countBy(records: Registro[], pick: (record: Registro) => string): CountRow[] {
  const map = new Map<string, number>()
  for (const record of records) {
    const label = pick(record)
    map.set(label, (map.get(label) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total)
}

function formatDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function rolarPara(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function BarList({
  rows,
  total,
  onSelect,
  empty,
}: {
  rows: CountRow[]
  total: number
  onSelect: (label: string) => void
  empty: string
}) {
  const max = rows[0]?.total ?? 0
  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        return (
          <button
            key={row.label}
            type="button"
            onClick={() => onSelect(row.label)}
            title="Ver a lista"
            className="relative block w-full cursor-pointer overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-left transition hover:border-amber-500/50"
          >
            <span
              className="absolute inset-y-0 left-0 bg-amber-500/10"
              style={{ width: `${max ? (row.total / max) * 100 : 0}%` }}
            />
            <span className="relative flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-zinc-200">{row.label}</span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
                <span className="text-zinc-300">{formatNumber(row.total)}</span>
                <span className="w-12 text-right">{formatPercent(total ? (row.total / total) * 100 : 0)}</span>
              </span>
            </span>
          </button>
        )
      })}
      {!rows.length && <p className="py-4 text-center text-sm text-zinc-600">{empty}</p>}
    </div>
  )
}

export default function RegistrosPage() {
  const queryClient = useQueryClient()
  const [selectedTab, setSelectedTab] = useState('')
  const [group, setGroup] = useState<{ kind: RegistroGroupKind; label: string } | null>(null)
  const [selected, setSelected] = useState<RegistroAgrupado | null>(null)
  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [refreshing, setRefreshing] = useState(false)

  const registrosQuery = useQuery({
    queryKey: ['registros'],
    queryFn: () => fetchRegistros(),
    retry: false,
  })

  const purchasesQuery = useQuery({
    queryKey: ['purchases'],
    queryFn: fetchPurchases,
    retry: false,
    enabled: Boolean(selected),
  })

  const tabs = useMemo(() => registrosQuery.data?.tabs ?? [], [registrosQuery.data])
  const records = useMemo(() => registrosQuery.data?.records ?? [], [registrosQuery.data])

  const sheets = useMemo(() => {
    const map = new Map<string, RegistroTab[]>()
    for (const tab of tabs) {
      map.set(tab.planilha, [...(map.get(tab.planilha) ?? []), tab])
    }
    return [...map.entries()]
  }, [tabs])

  const scoped = useMemo(
    () => (selectedTab ? records.filter((record) => tabKey(record) === selectedTab) : records),
    [records, selectedTab],
  )

  const byCanal = useMemo(() => countBy(scoped, (record) => record.canal), [scoped])
  const byCampanha = useMemo(() => countBy(scoped, campaignOf), [scoped])

  // Quem aparece em mais de uma planilha, na mesma campanha, vira um registro só (com a contagem de planilhas).
  const grouped = useMemo(() => agruparRegistros(scoped), [scoped])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return grouped
      .filter(
        (record) =>
          !term ||
          [record.nome, record.email, record.telefone, record.campanha, record.criativo]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(term)),
      )
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
  }, [grouped, search])

  const totalRecords = records.length
  const totalUnique = useMemo(() => uniqueContacts(records), [records])
  const failedTabs = tabs.filter((tab) => tab.error)
  const selectedInfo = tabs.find((tab) => tabKey(tab) === selectedTab)
  const filtersActive = Boolean(selectedTab || search)

  const groupRecords = useMemo(() => {
    if (!group) return []
    return scoped.filter((record) => (group.kind === 'origem' ? record.canal === group.label : campaignOf(record) === group.label))
  }, [group, scoped])
  const groupMerged = useMemo(() => agruparRegistros(groupRecords), [groupRecords])

  function selectTab(key: string) {
    setSelectedTab((current) => (current === key ? '' : key))
    setVisible(PAGE_SIZE)
  }

  function clearFilters() {
    setSelectedTab('')
    setSearch('')
    setVisible(PAGE_SIZE)
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const data = await fetchRegistros(true)
      queryClient.setQueryData(['registros'], data)
    } catch {
      // mantém os dados atuais; o erro reaparece no próximo carregamento normal
    } finally {
      setRefreshing(false)
    }
  }

  // Ao filtrar, leva a pessoa até o resultado; ao limpar, devolve ela para o quadro de abas.
  const abaAnterior = useRef('')
  useEffect(() => {
    const anterior = abaAnterior.current
    abaAnterior.current = selectedTab
    if (selectedTab === anterior) return undefined
    const espera = window.setTimeout(() => rolarPara(selectedTab ? 'registros-filtrados' : 'registros-por-lugar'), 80)
    return () => window.clearTimeout(espera)
  }, [selectedTab])

  const error = registrosQuery.error as Error | null
  const isLoading = registrosQuery.isLoading

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-label">Base completa</p>
            <Typewriter as="h2" className="section-title mt-1" text="Registros" />
            <p className="mt-2 max-w-2xl text-sm text-zinc-500">
              Tudo o que está nas planilhas do Google, lido ao vivo: quantos registros existem no
              total, em cada planilha e em cada aba, de onde cada lead veio e de qual campanha.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || isLoading}
            className="shrink-0 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
          >
            <i className={`fa-solid fa-rotate mr-1.5 ${refreshing ? 'fa-spin' : ''}`} />
            Atualizar
          </button>
        </div>
        {registrosQuery.data?.fetchedAt && (
          <p className="mt-3 text-[11px] text-zinc-600">
            Lido do Google Sheets em {formatDate(registrosQuery.data.fetchedAt)}
          </p>
        )}
      </PageHero>

      {error && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {error.message === 'SESSION_EXPIRED'
            ? 'Sua sessão expirou. Faça login novamente.'
            : error.message || 'Não foi possível carregar os registros.'}
        </section>
      )}

      {isLoading && !error && (
        <section className="surface-card p-8 text-center text-sm text-zinc-500">
          Lendo as planilhas...
        </section>
      )}

      {!isLoading && !error && (
        <>
          <section className="kpi-scroll">
            <div className="kpi-card">
              <p className="section-label">Total de registros</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(totalRecords)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Contatos únicos</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(totalUnique)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Planilhas</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(sheets.length)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Abas</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(tabs.length)}</p>
            </div>
          </section>

          {totalRecords > totalUnique && (
            <p className="-mt-3 text-xs leading-relaxed text-zinc-500">
              <i className="fa-solid fa-circle-info mr-1.5 text-amber-200/70" />
              Total de registros soma todas as abas; <b className="text-zinc-400">contatos únicos</b>{' '}
              conta cada e-mail/telefone uma vez só. A diferença existe porque a mesma pessoa aparece
              em mais de uma aba (por exemplo, a aba Geral repete leads de Essentials, Prompt e Work
              Cobertura).
            </p>
          )}

          {failedTabs.length > 0 && (
            <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
              Não consegui ler: {failedTabs.map((tab) => `${tab.planilha} / ${tab.aba} (${tab.error})`).join('; ')}
            </section>
          )}

          <section id="registros-por-lugar" className="surface-card scroll-mt-24 p-4">
            <RegistrosMapa sheets={sheets} selectedTab={selectedTab} tabKey={tabKey} onSelect={selectTab} totalRecords={totalRecords} />
          </section>

          {selectedInfo && (
            <div key={selectedTab} role="status" className="filtro-barra">
              <i className="fa-solid fa-filter" />
              <span>Filtrando tudo abaixo por</span>
              <span className="filtro-barra-pilula">
                {selectedInfo.planilha} · {selectedInfo.aba}
              </span>
              <span>{formatNumber(scoped.length)} registros</span>
              <span className="filtro-barra-acoes">
                <button type="button" onClick={() => rolarPara('lista-registros')} className="filtro-btn">
                  <i className="fa-solid fa-arrow-down" /> Ver a lista
                </button>
                <button type="button" onClick={clearFilters} className="filtro-btn filtro-btn-escuro">
                  <i className="fa-solid fa-xmark" /> Limpar filtro
                </button>
              </span>
            </div>
          )}

          <div id="registros-filtrados" className="grid scroll-mt-36 gap-4 lg:grid-cols-2">
            <section key={`origem-${selectedTab}`} className={`surface-card p-4 ${selectedTab ? 'filtro-flash' : ''}`}>
              <p className="section-label">Origem do lead</p>
              <h3 className="section-title mt-1 mb-1">De onde vieram {selectedInfo && (
                <span className="filtro-selo ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-zinc-950">
                  <i className="fa-solid fa-filter" /> Filtrado: {selectedInfo.aba}
                </span>
              )}</h3>
              <p className="mb-3 text-xs text-zinc-600">
                {selectedInfo ? `Aba ${selectedInfo.aba} · ` : 'Todas as abas · '}
                {formatNumber(scoped.length)} registros. Clique para ver a lista.

              </p>
              <BarList
                rows={byCanal}
                total={scoped.length}
                onSelect={(label) => setGroup({ kind: 'origem', label })}
                empty="Nenhum registro."
              />
            </section>

            <section key={`camp-${selectedTab}`} className={`surface-card p-4 ${selectedTab ? 'filtro-flash' : ''}`}>
              <p className="section-label">Campanhas</p>
              <h3 className="section-title mt-1 mb-1">Leads por campanha {selectedInfo && (
                <span className="filtro-selo ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-zinc-950">
                  <i className="fa-solid fa-filter" /> Filtrado: {selectedInfo.aba}
                </span>
              )}</h3>
              <p className="mb-3 text-xs text-zinc-600">
                {selectedInfo ? `Aba ${selectedInfo.aba} · ` : 'Todas as abas · '}
                {formatNumber(byCampanha.length)} campanhas. Clique para ver a lista.
              </p>
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <BarList
                  rows={byCampanha}
                  total={scoped.length}
                  onSelect={(label) => setGroup({ kind: 'campanha', label })}
                  empty="Nenhum registro."
                />
              </div>
            </section>
          </div>

          <section id="lista-registros" key={`lista-${selectedTab}`} className={`surface-card scroll-mt-32 overflow-hidden ${selectedTab ? 'filtro-flash' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="section-label">Lista</p>
                <h3 className="section-title mt-1">
                  {formatNumber(filtered.length)} {filtered.length === 1 ? 'registro' : 'registros'}
                  {filtersActive && (
                    <span className="ml-2 text-sm text-zinc-500">de {formatNumber(grouped.length)}</span>
                  )}
                  {selectedInfo && (
                <span className="filtro-selo ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-zinc-950">
                  <i className="fa-solid fa-filter" /> Filtrado: {selectedInfo.aba}
                </span>
              )}
                </h3>
                {grouped.length < scoped.length && (
                  <p className="mt-1 text-xs text-zinc-600">
                    {formatNumber(scoped.length)} linhas nas planilhas · quem aparece em mais de uma, na mesma campanha, vira um registro só (a etiqueta mostra em quantas).
                  </p>
                )}
                {filtersActive && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {selectedInfo && <span>Aba: {selectedInfo.aba}</span>}
                    <button type="button" onClick={clearFilters} className="text-amber-200 hover:underline">
                      limpar filtros
                    </button>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar nome, e-mail, telefone, campanha..."
                  className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setVisible(PAGE_SIZE)
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    exportCsv(
                      'registros.csv',
                      ['Planilha', 'Aba', 'Aparece em', 'Nome', 'Email', 'Telefone', 'Data', 'Origem', 'Campanha', 'Criativo', 'Evento', 'Situação', 'Produto', 'Valor', 'Pagamento'],
                      filtered.map((record) => [
                        record.planilha,
                        record.aba,
                        apareceTexto(record),
                        record.nome,
                        record.email,
                        record.telefone,
                        formatDate(record.data),
                        record.canal,
                        record.campanha,
                        record.criativo,
                        record.evento,
                        record.situacao,
                        record.produto,
                        record.valor ?? '',
                        record.pagamento,
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

            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-4 py-2 font-medium">Contato</th>
                    <th className="px-4 py-2 font-medium">Planilha · Aba</th>
                    <th className="px-4 py-2 font-medium">Origem</th>
                    <th className="px-4 py-2 font-medium">Campanha</th>
                    <th className="px-4 py-2 font-medium">Detalhe</th>
                    <th className="px-4 py-2 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, visible).map((record, index) => (
                    <tr
                      key={`${tabKey(record)}-${index}`}
                      onClick={() => setSelected(record)}
                      className="cursor-pointer border-b border-zinc-900/80 transition-colors last:border-0 hover:bg-amber-400/10"
                    >
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-zinc-200" title={record.nome}>
                        {record.nome || '—'}
                      </td>
                      <td
                        className="max-w-[220px] truncate px-4 py-2.5 text-zinc-400"
                        title={`${record.email} ${record.telefone}`}
                      >
                        {record.email || record.telefone || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <span className="text-zinc-300">{record.aba}</span>
                          {record.aparece.length > 1 && (
                            <span
                              className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-semibold text-amber-200"
                              title={`Aparece em ${record.aparece.length} planilhas: ${apareceTexto(record)}`}
                            >
                              {record.aparece.length}
                            </span>
                          )}
                        </span>
                        <span className="block text-[10px] text-zinc-600">{record.planilha}</span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-300">{record.canal}</td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-zinc-300" title={record.campanha}>
                        {record.campanha || '—'}
                      </td>
                      <td className="max-w-[220px] px-4 py-2.5 text-xs text-zinc-400">
                        {record.tipo === 'evento' ? (
                          <>
                            <span className="block truncate text-zinc-300">
                              {[record.produto, typeof record.valor === 'number' ? formatCurrency(record.valor) : '']
                                .filter(Boolean)
                                .join(' · ') || record.evento}
                            </span>
                            <span className="block truncate text-[10px] text-zinc-600">
                              {[record.situacao, record.pagamento].filter(Boolean).join(' · ')}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{formatDate(record.data)}</td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">
                        Nenhum registro encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > visible && (
              <div className="border-t border-zinc-800/60 p-3 text-center">
                <button
                  type="button"
                  onClick={() => setVisible((current) => current + PAGE_SIZE)}
                  className="rounded-lg border border-zinc-800 px-4 py-2 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                >
                  Mostrar mais ({formatNumber(filtered.length - visible)} restantes)
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {group && !selected && (
        <RegistrosGroupModal
          kind={group.kind}
          label={group.label}
          scope={selectedInfo ? `Aba ${selectedInfo.aba}` : 'Todas as abas'}
          records={groupMerged}
          totalRegistros={groupRecords.length}
          onClose={() => setGroup(null)}
          onOpenRecord={setSelected}
        />
      )}

      {selected && (
        <RegistroModal
          record={selected}
          purchases={purchasesQuery.isError ? [] : purchasesQuery.data}
          closeLabel={group ? 'Voltar à lista' : 'Fechar'}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
