import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apagarRegistro, executarImportacao, fetchImportacao, fetchRegistros } from '@/services/registrosService.ts'
import { confirmar } from '@/components/ui/ConfirmDialog.tsx'
import { useAuthStore } from '@/store/authStore.ts'
import { isAdmin } from '@/lib/roles.ts'
import { fetchPurchases } from '@/services/purchaseService.ts'
import { RegistrosGroupModal, type RegistroGroupKind } from '@/components/registros/RegistrosGroupModal.tsx'
import { RegistroModal } from '@/components/registros/RegistroModal.tsx'
import { RegistrosMapa } from '@/components/registros/RegistrosMapa.tsx'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format.ts'
import { ExportCsvModal } from '@/components/registros/ExportCsvModal.tsx'
import { agruparRegistros, apareceTexto, campanhaDe, STATUS_ROTULO, type RegistroAgrupado } from '@/lib/mergeRegistros.ts'
import type { RegistroTab } from '@/types'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'

const PAGE_SIZE = 200

/** Quem se cadastrou há menos de 10 horas ganha o selo "Novo". */
const JANELA_NOVO_MS = 10 * 60 * 60 * 1000

function ehNovo(pessoa: { primeiraEm: string }, agora: number): boolean {
  const quando = pessoa.primeiraEm ? new Date(pessoa.primeiraEm).getTime() : NaN
  return Number.isFinite(quando) && agora - quando >= 0 && agora - quando < JANELA_NOVO_MS
}

function SeloNovo() {
  return (
    <span
      title="Cadastrou há menos de 10 horas"
      className="ml-1.5 inline-block rounded-full bg-emerald-400 px-1.5 py-px align-middle text-[9px] font-bold uppercase tracking-wide text-zinc-950"
    >
      Novo
    </span>
  )
}

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

function formatDateShort(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
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
  const admin = isAdmin(useAuthStore((state) => state.user))
  const [selectedTab, setSelectedTab] = useState('')
  const [group, setGroup] = useState<{ kind: RegistroGroupKind; label: string } | null>(null)
  const [selected, setSelected] = useState<RegistroAgrupado | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [fOrigem, setFOrigem] = useState('')
  const [fCampanha, setFCampanha] = useState('')
  const [fSituacao, setFSituacao] = useState('')
  const [fPeriodo, setFPeriodo] = useState<'' | 'hoje' | '7d' | '30d'>('')
  const [soNovos, setSoNovos] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [refreshing, setRefreshing] = useState(false)

  const registrosQuery = useQuery({
    queryKey: ['registros'],
    queryFn: () => fetchRegistros(),
    retry: false,
  })

  // Importação única do histórico das planilhas do Google para o banco (só admin; some depois de feita).
  const importacaoQuery = useQuery({ queryKey: ['registros-importacao'], queryFn: fetchImportacao, retry: false, enabled: admin })
  const importacao = useMutation({
    mutationFn: executarImportacao,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['registros-importacao'] })
      await queryClient.invalidateQueries({ queryKey: ['registros'] })
    },
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

  async function apagarPessoaSelecionada(pessoa: RegistroAgrupado) {
    const ok = await confirmar({
      titulo: `Apagar ${pessoa.nome || 'este registro'}?`,
      texto:
        'A pessoa some de todas as abas desta tela. Os cadastros que entraram direto no dash são apagados do banco. O que veio do site só fica escondido, e as vendas da Hotmart dela também somem daqui. Se a pessoa se cadastrar de novo depois, o novo cadastro aparece.',
      confirmar: 'Apagar',
      perigo: true,
    })
    if (!ok) return
    const contatos = [pessoa, ...pessoa.historico].map((item) => ({ email: item.email, telefone: item.telefone }))
    try {
      await apagarRegistro(contatos)
      setSelected(null)
      setGroup(null)
      await queryClient.invalidateQueries({ queryKey: ['registros'] })
    } catch (erro) {
      await confirmar({ titulo: 'Não consegui apagar', texto: erro instanceof Error ? erro.message : 'Tente de novo.', confirmar: 'Ok', cancelar: 'Fechar' })
    }
  }

  // Uma linha por PESSOA: quem está em várias abas/planilhas (lead, Pix gerado, venda...) vira um registro só, com linha do tempo.
  const people = useMemo(() => agruparRegistros(records), [records])
  const agora = useMemo(() => Date.now(), [registrosQuery.dataUpdatedAt])
  const novos10h = people.filter((pessoa) => ehNovo(pessoa, agora)).length

  // Com uma aba escolhida, ficam as pessoas que aparecem nela (cada uma com a história completa).
  const grouped = useMemo(
    () => (selectedTab ? people.filter((person) => person.historico.some((passagem) => tabKey(passagem) === selectedTab)) : people),
    [people, selectedTab],
  )
  const scoped = grouped

  // Inscritos novos do recorte filtrado: hoje, ontem (dias de Brasília), últimas 24 h e últimos 7 dias.
  const novosPorJanela = useMemo(() => {
    const diaSP = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const hoje = diaSP(agora)
    const ontem = diaSP(agora - 86_400_000)
    const resultado = { hoje: 0, ontem: 0, h24: 0, d7: 0 }
    for (const pessoa of grouped) {
      const quando = pessoa.primeiraEm ? new Date(pessoa.primeiraEm).getTime() : NaN
      if (!Number.isFinite(quando) || quando > agora) continue
      const dia = diaSP(quando)
      if (dia === hoje) resultado.hoje++
      else if (dia === ontem) resultado.ontem++
      if (agora - quando < 86_400_000) resultado.h24++
      if (agora - quando < 7 * 86_400_000) resultado.d7++
    }
    return resultado
  }, [grouped, agora])

  const byCanal = useMemo(() => countBy(grouped, (person) => person.canal || 'Sem rastreamento'), [grouped])
  const byCampanha = useMemo(() => countBy(grouped, campanhaDe), [grouped])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const dias = fPeriodo === 'hoje' ? 1 : fPeriodo === '7d' ? 7 : fPeriodo === '30d' ? 30 : 0
    const desde = dias ? Date.now() - dias * 86_400_000 : 0
    return grouped
      .filter((record) => {
        if (term && !record.nome.toLowerCase().includes(term) && ![record.email, record.telefone, record.campanha, record.criativo].some((value) => value?.toLowerCase().includes(term))) return false
        if (fOrigem && (record.canal || 'Sem rastreamento') !== fOrigem) return false
        if (fCampanha && campanhaDe(record) !== fCampanha) return false
        if (fSituacao && record.status !== fSituacao) return false
        if (desde && !(record.data && new Date(record.data).getTime() >= desde)) return false
        if (soNovos && !ehNovo(record, agora)) return false
        return true
      })
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
  }, [grouped, search, fOrigem, fCampanha, fSituacao, fPeriodo, soNovos, agora])

  const totalRecords = records.length
  const rowsInScope = useMemo(() => grouped.reduce((soma, person) => soma + person.historico.length, 0), [grouped])
  const totalUnique = people.length
  const failedTabs = tabs.filter((tab) => tab.error)
  const selectedInfo = tabs.find((tab) => tabKey(tab) === selectedTab)
  const filtersActive = Boolean(selectedTab || search || fOrigem || fCampanha || fSituacao || fPeriodo || soNovos)

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
    setFOrigem('')
    setFCampanha('')
    setFSituacao('')
    setFPeriodo('')
    setSoNovos(false)
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
              Todos os cadastros do dash, vindos do banco e separados por tipo (Essentials, Workshops, Mentoria) e por projeto:
              quantos são, de onde cada lead veio e de qual campanha.
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
            Atualizado em {formatDate(registrosQuery.data.fetchedAt)}
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
          Lendo os registros...
        </section>
      )}

      {!isLoading && !error && (
        <>
          {admin && importacaoQuery.data && !importacaoQuery.data.feita && !importacaoQuery.data.semCopia && importacaoQuery.data.pendentes > 0 && (
            <section className="surface-card border-amber-500/40 p-4 text-sm">
              <p className="section-label">Histórico das planilhas</p>
              <h3 className="section-title mt-1">{formatNumber(importacaoQuery.data.pendentes)} cadastros ainda só estão nas planilhas do Google</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Importe uma vez para o banco: quem já está no projeto (mesmo e-mail ou telefone) não entra de novo. Depois disso as planilhas deixam de ser
                lidas e tudo passa a vir só do banco.
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                {(importacaoQuery.data.detalhe ?? []).map((item) => (
                  <li key={item.slug}>
                    {item.grupo} · {item.nome}: <b className="text-zinc-200">{formatNumber(item.total)}</b>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={importacao.isPending}
                onClick={async () => {
                  const ok = await confirmar({
                    titulo: 'Importar o histórico das planilhas?',
                    texto: `Vão entrar ${formatNumber(importacaoQuery.data?.pendentes ?? 0)} cadastros no banco, sem repetir quem já está. Isso só acrescenta, não apaga nada.`,
                    confirmar: 'Importar',
                  })
                  if (ok) importacao.mutate()
                }}
                className="mt-3 rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-zinc-50 hover:bg-amber-400/10 disabled:opacity-50"
              >
                {importacao.isPending ? 'Importando…' : 'Importar histórico'}
              </button>
              {importacao.isError && <p className="mt-2 text-xs text-red-300">{(importacao.error as Error).message}</p>}
            </section>
          )}

          <section className="kpi-scroll">
            <div className="kpi-card">
              <p className="section-label">Cadastros no banco</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(totalRecords)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Pessoas (sem repetir)</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(totalUnique)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Novos (10 h)</p>
              <p className="mt-0.5 text-lg font-semibold text-emerald-300">{formatNumber(novos10h)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Tipos</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(sheets.length)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Projetos</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(tabs.length)}</p>
            </div>
          </section>

          {totalRecords > totalUnique && (
            <p className="-mt-3 text-xs leading-relaxed text-zinc-500">
              <i className="fa-solid fa-circle-info mr-1.5 text-amber-200/70" />
              <b className="text-zinc-400">Cadastros no banco</b> soma todos os projetos. <b className="text-zinc-400">Pessoas</b>{' '}
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

          {selectedInfo && (
            <section className="kpi-scroll -mt-3" aria-label="Inscritos novos do filtro">
              {[
                { rotulo: 'Novos hoje', valor: novosPorJanela.hoje },
                { rotulo: 'Ontem', valor: novosPorJanela.ontem },
                { rotulo: 'Últimas 24 h', valor: novosPorJanela.h24 },
                { rotulo: 'Últimos 7 dias', valor: novosPorJanela.d7 },
              ].map((item) => (
                <div key={item.rotulo} className="kpi-card">
                  <p className="section-label">{item.rotulo}</p>
                  <p className="mt-0.5 text-lg font-semibold text-emerald-300">{formatNumber(item.valor)}</p>
                </div>
              ))}
            </section>
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
                  {formatNumber(rowsInScope)} cadastros viram {formatNumber(grouped.length)} pessoas · a etiqueta mostra em quantas abas cada uma aparece.
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
                  onClick={() => setExportOpen(true)}
                  className="shrink-0 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                >
                  <i className="fa-solid fa-download mr-1.5" />
                  CSV
                </button>
              </div>
            </div>

            <div className="registros-filtros" role="group" aria-label="Filtrar a lista">
              <label className="registros-filtro">
                <span>Projeto</span>
                <select
                  className={`filter-select ${selectedTab ? 'registros-filtro-ativo' : ''}`}
                  value={selectedTab}
                  onChange={(event) => {
                    setSelectedTab(event.target.value)
                    setVisible(PAGE_SIZE)
                  }}
                >
                  <option value="">Todos</option>
                  {tabs
                    .filter((tab) => tab.count)
                    .map((tab) => (
                      <option key={tabKey(tab)} value={tabKey(tab)}>
                        {tab.planilha} · {tab.aba} ({formatNumber(tab.count ?? 0)})
                      </option>
                    ))}
                </select>
              </label>
              <label className="registros-filtro">
                <span>Origem</span>
                <select
                  className={`filter-select ${fOrigem ? 'registros-filtro-ativo' : ''}`}
                  value={fOrigem}
                  onChange={(event) => {
                    setFOrigem(event.target.value)
                    setVisible(PAGE_SIZE)
                  }}
                >
                  <option value="">Todas</option>
                  {byCanal.map((linha) => (
                    <option key={linha.label} value={linha.label}>
                      {linha.label} ({formatNumber(linha.total)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="registros-filtro">
                <span>Campanha</span>
                <select
                  className={`filter-select ${fCampanha ? 'registros-filtro-ativo' : ''}`}
                  value={fCampanha}
                  onChange={(event) => {
                    setFCampanha(event.target.value)
                    setVisible(PAGE_SIZE)
                  }}
                >
                  <option value="">Todas</option>
                  {byCampanha.slice(0, 80).map((linha) => (
                    <option key={linha.label} value={linha.label}>
                      {linha.label} ({formatNumber(linha.total)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="registros-filtro">
                <span>Situação</span>
                <select
                  className={`filter-select ${fSituacao ? 'registros-filtro-ativo' : ''}`}
                  value={fSituacao}
                  onChange={(event) => {
                    setFSituacao(event.target.value)
                    setVisible(PAGE_SIZE)
                  }}
                >
                  <option value="">Todas</option>
                  {(Object.keys(STATUS_ROTULO) as (keyof typeof STATUS_ROTULO)[]).map((chave) => (
                    <option key={chave} value={chave}>
                      {STATUS_ROTULO[chave]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="registros-filtro">
                <span>Período</span>
                <select
                  className={`filter-select ${fPeriodo ? 'registros-filtro-ativo' : ''}`}
                  value={fPeriodo}
                  onChange={(event) => {
                    setFPeriodo(event.target.value as typeof fPeriodo)
                    setVisible(PAGE_SIZE)
                  }}
                >
                  <option value="">Todo o período</option>
                  <option value="hoje">Últimas 24 horas</option>
                  <option value="7d">Últimos 7 dias</option>
                  <option value="30d">Últimos 30 dias</option>
                </select>
              </label>
              <label className={`registros-filtro-novos ${soNovos ? 'registros-filtro-ativo' : ''}`}>
                <input
                  type="checkbox"
                  checked={soNovos}
                  onChange={(event) => {
                    setSoNovos(event.target.checked)
                    setVisible(PAGE_SIZE)
                  }}
                />
                Só novos (10 h)
              </label>
              {filtersActive && (
                <button type="button" onClick={clearFilters} className="registros-filtro-limpar">
                  <i className="fa-solid fa-xmark" /> Limpar filtros
                </button>
              )}
            </div>

            <div className="overflow-auto md:max-h-[560px]">
              <table className="data-table data-table-brief data-table-fit registros-tabela">
                <colgroup>
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <thead>
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="font-medium">Nome</th>
                    <th className="font-medium">Contato</th>
                    <th className="font-medium">Tipo · Projeto</th>
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
                        {ehNovo(record, agora) && <SeloNovo />}
                      </td>
                      <td
                        className="cell-more text-zinc-400"
                        title={`${record.email} ${record.telefone}`}
                       data-label="Contato">
                        {record.email || record.telefone || '—'}
                      </td>
                      <td className="cell-more text-xs text-zinc-400" data-label="Tipo · Projeto">
                        <span className="flex items-center gap-1.5">
                          <span className="text-zinc-300">{record.aba}</span>
                          {record.aparece.length > 1 && (
                            <span
                              className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-semibold text-amber-200"
                              title={`Aparece em ${record.aparece.length} projetos: ${apareceTexto(record)}`}
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
                      <td className="cell-more whitespace-nowrap text-zinc-500" data-label="Última passagem">{formatDateShort(record.data)}</td>
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

      {exportOpen && <ExportCsvModal filename="registros.csv" records={filtered} onClose={() => setExportOpen(false)} />}
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
          onApagar={admin ? () => apagarPessoaSelecionada(selected) : undefined}
        />
      )}
    </div>
  )
}
