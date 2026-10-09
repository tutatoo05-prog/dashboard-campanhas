import { useMemo, useState } from 'react'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchRegistros } from '@/services/registrosService.ts'
import { formatNumber, formatPercent } from '@/lib/format.ts'
import { exportCsv } from '@/lib/csv.ts'
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

function BarList({
  rows,
  total,
  active,
  onSelect,
  empty,
}: {
  rows: CountRow[]
  total: number
  active: string
  onSelect: (label: string) => void
  empty: string
}) {
  const max = rows[0]?.total ?? 0
  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        const isActive = active === row.label
        return (
          <button
            key={row.label}
            type="button"
            onClick={() => onSelect(isActive ? '' : row.label)}
            className={`relative block w-full overflow-hidden rounded-lg border px-3 py-2 text-left transition ${
              isActive
                ? 'border-amber-500/50 bg-amber-500/10'
                : 'border-zinc-800/60 bg-zinc-950/40 hover:border-zinc-700'
            }`}
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
  const [canal, setCanal] = useState('')
  const [campanha, setCampanha] = useState('')
  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [refreshing, setRefreshing] = useState(false)

  const registrosQuery = useQuery({
    queryKey: ['registros'],
    queryFn: () => fetchRegistros(),
    retry: false,
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return scoped
      .filter((record) => !canal || record.canal === canal)
      .filter((record) => !campanha || campaignOf(record) === campanha)
      .filter(
        (record) =>
          !term ||
          [record.nome, record.email, record.telefone, record.campanha, record.criativo]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(term)),
      )
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
  }, [scoped, canal, campanha, search])

  const totalRecords = records.length
  const totalUnique = useMemo(() => uniqueContacts(records), [records])
  const failedTabs = tabs.filter((tab) => tab.error)
  const selectedInfo = tabs.find((tab) => tabKey(tab) === selectedTab)
  const filtersActive = Boolean(selectedTab || canal || campanha || search)

  function selectTab(key: string) {
    setSelectedTab((current) => (current === key ? '' : key))
    setCanal('')
    setCampanha('')
    setVisible(PAGE_SIZE)
  }

  function clearFilters() {
    setSelectedTab('')
    setCanal('')
    setCampanha('')
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

          <section className="surface-card p-4">
            <p className="section-label">Por planilha e aba</p>
            <h3 className="section-title mt-1 mb-1">Quantos registros em cada lugar</h3>
            <p className="mb-4 text-xs text-zinc-600">Clique numa aba para filtrar tudo abaixo.</p>
            <div className="grid gap-4 lg:grid-cols-2">
              {sheets.map(([sheetName, sheetTabs]) => {
                const sheetTotal = sheetTabs.reduce((sum, tab) => sum + (tab.count ?? 0), 0)
                return (
                  <div key={sheetName} className="rounded-xl border border-zinc-800/60 bg-zinc-950/30 p-3">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium text-zinc-100">{sheetName}</p>
                      <p className="shrink-0 text-xs text-zinc-500">
                        <span className="text-base font-semibold text-amber-200">{formatNumber(sheetTotal)}</span>{' '}
                        registros
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {sheetTabs.map((tab) => {
                        const key = tabKey(tab)
                        const active = selectedTab === key
                        const max = Math.max(...sheetTabs.map((item) => item.count ?? 0), 1)
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => selectTab(key)}
                              className={`relative flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition ${
                                active
                                  ? 'border-amber-500/50 bg-amber-500/10'
                                  : 'border-zinc-800/60 bg-zinc-950/40 hover:border-zinc-700'
                              }`}
                            >
                              <span
                                className="absolute inset-y-0 left-0 bg-amber-500/10"
                                style={{ width: `${((tab.count ?? 0) / max) * 100}%` }}
                              />
                              <span className="relative flex min-w-0 items-center gap-2">
                                <span className="truncate text-zinc-200">{tab.aba}</span>
                                {tab.tipo === 'comprador' && (
                                  <span className="shrink-0 rounded-full border border-emerald-500/25 px-1.5 text-[10px] text-emerald-300">
                                    compradores
                                  </span>
                                )}
                              </span>
                              <span className="relative shrink-0 text-zinc-300">
                                {tab.count === null ? 'erro' : formatNumber(tab.count)}
                              </span>
                            </button>
                            <a
                              href={tab.url}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir a aba no Google Sheets"
                              className="shrink-0 rounded-lg border border-zinc-800/60 px-2 py-2 text-[11px] text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                            >
                              <i className="fa-solid fa-arrow-up-right-from-square" />
                            </a>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="surface-card p-4">
              <p className="section-label">Origem do lead</p>
              <h3 className="section-title mt-1 mb-1">De onde vieram</h3>
              <p className="mb-3 text-xs text-zinc-600">
                {selectedInfo ? `Aba ${selectedInfo.aba} · ` : 'Todas as abas · '}
                {formatNumber(scoped.length)} registros. Clique para filtrar a lista.
              </p>
              <BarList
                rows={byCanal}
                total={scoped.length}
                active={canal}
                onSelect={(label) => {
                  setCanal(label)
                  setVisible(PAGE_SIZE)
                }}
                empty="Nenhum registro."
              />
            </section>

            <section className="surface-card p-4">
              <p className="section-label">Campanhas</p>
              <h3 className="section-title mt-1 mb-1">Leads por campanha</h3>
              <p className="mb-3 text-xs text-zinc-600">
                {selectedInfo ? `Aba ${selectedInfo.aba} · ` : 'Todas as abas · '}
                {formatNumber(byCampanha.length)} campanhas. Clique para filtrar a lista.
              </p>
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <BarList
                  rows={byCampanha}
                  total={scoped.length}
                  active={campanha}
                  onSelect={(label) => {
                    setCampanha(label)
                    setVisible(PAGE_SIZE)
                  }}
                  empty="Nenhum registro."
                />
              </div>
            </section>
          </div>

          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="section-label">Lista</p>
                <h3 className="section-title mt-1">
                  {formatNumber(filtered.length)} {filtered.length === 1 ? 'registro' : 'registros'}
                  {filtersActive && (
                    <span className="ml-2 text-sm text-zinc-500">de {formatNumber(totalRecords)}</span>
                  )}
                </h3>
                {filtersActive && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {selectedInfo && <span>Aba: {selectedInfo.aba}</span>}
                    {canal && <span>Origem: {canal}</span>}
                    {campanha && <span>Campanha: {campanha}</span>}
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
                      ['Planilha', 'Aba', 'Nome', 'Email', 'Telefone', 'Data', 'Origem', 'Campanha', 'Criativo'],
                      filtered.map((record) => [
                        record.planilha,
                        record.aba,
                        record.nome,
                        record.email,
                        record.telefone,
                        formatDate(record.data),
                        record.canal,
                        record.campanha,
                        record.criativo,
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
                    <th className="px-4 py-2 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, visible).map((record, index) => (
                    <tr key={`${tabKey(record)}-${index}`} className="border-b border-zinc-900/80 last:border-0">
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
                        <span className="text-zinc-300">{record.aba}</span>
                        <span className="block text-[10px] text-zinc-600">{record.planilha}</span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-300">{record.canal}</td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-zinc-300" title={record.campanha}>
                        {record.campanha || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{formatDate(record.data)}</td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
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
    </div>
  )
}
