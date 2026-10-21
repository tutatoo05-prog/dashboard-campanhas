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
import { agruparRegistros, apareceTexto, campanhaDe, STATUS_ROTULO, type RegistroAgrupado } from '@/lib/mergeRegistros.ts'
import type { RegistroTab } from '@/types'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'

const PAGE_SIZE = 200

interface CountRow {
  label: string
  total: number
}

function tabKey(item: { planilha: string; aba: string }): string {
  return `${item.planilha}||${item.aba}`
}

function countBy(records: RegistroAgrupado[], pick: (record: RegistroAgrupado) => string): CountRow[] {
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

  // Uma linha por PESSOA: quem está em várias abas/planilhas (lead, Pix gerado, venda...) vira um registro só, com linha do tempo.
  const people = useMemo(() => agruparRegistros(records), [records])

  // Com uma aba escolhida, ficam as pessoas que aparecem nela (cada uma com a história completa).
  const grouped = useMemo(
    () => (selectedTab ? people.filter((person) => person.historico.some((passagem) => tabKey(passagem) === selectedTab)) : people),
    [people, selectedTab],
  )
  const scoped = grouped

  const byCanal = useMemo(() => countBy(grouped, (person) => person.canal || 'Sem rastreamento'), [grouped])
  const byCampanha = useMemo(() => countBy(grouped, campanhaDe), [grouped])

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
  const rowsInScope = useMemo(() => grouped.reduce((soma, person) => soma + person.historico.length, 0), [grouped])
  const totalUnique = people.length
  const failedTabs = tabs.filter((tab) => tab.error)
  const selectedInfo = tabs.find((tab) => tabKey(tab) === selectedTab)
  const filtersActive = Boolean(selectedTab || search)

  const groupMerged = useMemo(() => {
    if (!group) return []
    return grouped.filter((person) => (group.kind === 'origem' ? (person.canal || 'Sem rastreamento') === group.label : campanhaDe(person) === group.label))
  }, [group, grouped])

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
              <p className="section-label">Linhas nas planilhas</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(totalRecords)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Pessoas (sem repetir)</p>
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
              <b className="text-zinc-400">Linhas nas planilhas</b> soma todas as abas. <b className="text-zinc-400">Pessoas</b>{' '}
              conta cada pessoa uma vez só, ligando por e-mail e telefone: quem aparece como lead repetido, gerou Pix e
              comprou é uma pessoa, com a linha do tempo no detalhe.
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
              <span>{formatNumber(grouped.length)} pessoas</span>
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
                {formatNumber(grouped.length)} pessoas. Clique para ver a lista.

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
              <div className="overflow-y-auto pr-1 md:max-h-[420px]">
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
                  {formatNumber(filtered.length)} {filtered.length === 1 ? 'pessoa' : 'pessoas'}
                  {filtersActive && (
                    <span className="ml-2 text-sm text-zinc-500">de {formatNumber(grouped.length)}</span>
                  )}
                  {selectedInfo && (
                <span className="filtro-selo ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-zinc-950">
                  <i className="fa-solid fa-filter" /> Filtrado: {selectedInfo.aba}
                </span>
              )}
                </h3>
                <p className="mt-1 text-xs text-zinc-600">
                  {formatNumber(rowsInScope)} linhas nas planilhas viram {formatNumber(grouped.length)} pessoas · a etiqueta mostra em quantas abas cada uma aparece.
                </p>
                {filtersActive && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {selectedInfo && <span>Aba: {selectedInfo.aba}</span>}
                    <button type="button" onClick={clearFilters} className="text-amber-200 hover:underline">
                      limpar filtros
                    </button>
                  </p>
                )}
              </div>
              <div className="list-tools">
                <input
                  type="text"
                  placeholder="Buscar nome, e-mail, telefone, campanha..."
                  className="filter-select"
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
                      ['Planilha', 'Aba', 'Aparece em', 'Situação comercial', 'Nome', 'Email', 'Telefone', 'Data', 'Origem', 'Campanha', 'Criativo', 'Evento', 'Situação', 'Produto', 'Valor', 'Pagamento'],
                      filtered.map((record) => [
                        record.planilha,
                        record.aba,
                        apareceTexto(record),
                        STATUS_ROTULO[record.status],
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

            <div className="overflow-auto md:max-h-[560px]">
              <table className="data-table data-table-brief data-table-fit">
                <colgroup>
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="font-medium">Nome</th>
                    <th className="font-medium">Contato</th>
                    <th className="font-medium">Planilha · Aba</th>
                    <th className="font-medium">Origem</th>
                    <th className="font-medium">Campanha</th>
                    <th className="font-medium">Situação</th>
                    <th className="font-medium">Última passagem</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, visible).map((record, index) => (
                    <tr
                      key={`${tabKey(record)}-${index}`}
                      onClick={() => setSelected(record)}
                      className="cursor-pointer border-b border-zinc-900/80 transition-colors last:border-0 hover:bg-amber-400/10"
                    >
                      <td className="cell-name text-zinc-200" title={record.nome} data-label="Nome" data-sensivel>
                        {record.nome || '—'}
                      </td>
                      <td
                        className="cell-more text-zinc-400"
                        title={`${record.email} ${record.telefone}`}
                       data-label="Contato">
                        {record.email || record.telefone || '—'}
                      </td>
                      <td className="cell-more text-xs text-zinc-400" data-label="Planilha · Aba">
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
                      <td className="cell-brief text-zinc-300" data-label="Origem">{record.canal}</td>
                      <td className="cell-brief text-zinc-300" title={record.campanha} data-label="Campanha">
                        {record.campanha || '—'}
                      </td>
                      <td className="cell-key cell-nolabel text-xs text-zinc-400" data-label="Situação">
                        {record.status !== 'lead' && <span className={`tl-status tl-status-${record.status} mb-1`}>{STATUS_ROTULO[record.status]}</span>}
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
                      <td className="cell-more whitespace-nowrap text-zinc-500" data-label="Última passagem">{formatDate(record.data)}</td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={7} className="cell-empty text-center text-zinc-600">
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
