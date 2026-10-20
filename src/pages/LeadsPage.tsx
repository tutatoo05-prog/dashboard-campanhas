import { useMemo, useState } from 'react'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { useQuery } from '@tanstack/react-query'
import { fetchLeads } from '@/services/leadService.ts'
import { fetchPurchases } from '@/services/purchaseService.ts'
import { formatNumber, formatPercent } from '@/lib/format.ts'
import { exportCsv } from '@/lib/csv.ts'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { originLabel } from '@/lib/leadOrigins.ts'
import { PessoaModal } from '@/components/registros/PessoaModal.tsx'
import type { Lead } from '@/types'

interface OriginRow {
  key: string
  label: string
  total: number
  converted: number
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export default function LeadsPage() {
  const [search, setSearch] = useState('')
  const [pessoa, setPessoa] = useState<Lead | null>(null)

  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: fetchLeads,
    retry: false,
  })

  const purchasesQuery = useQuery({
    queryKey: ['purchases'],
    queryFn: fetchPurchases,
    retry: false,
  })

  const leads = leadsQuery.data ?? []
  const purchasedEmails = useMemo(
    () => new Set((purchasesQuery.data ?? []).map((purchase) => normalizeEmail(purchase.email)).filter(Boolean)),
    [purchasesQuery.data],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return leads
    return leads.filter((lead) =>
      [lead.nome, lead.email, lead.campanha, originLabel(lead.origem)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [leads, search])

  const byOrigin = useMemo<OriginRow[]>(() => {
    const map = new Map<string, OriginRow>()

    for (const lead of leads) {
      const key = lead.origem || 'sem_origem'
      const row = map.get(key) ?? { key, label: originLabel(lead.origem), total: 0, converted: 0 }
      row.total += 1
      if (purchasedEmails.has(normalizeEmail(lead.email))) {
        row.converted += 1
      }
      map.set(key, row)
    }

    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [leads, purchasedEmails])

  const totalConverted = leads.filter((lead) => purchasedEmails.has(normalizeEmail(lead.email))).length
  const conversionRate = leads.length ? (totalConverted / leads.length) * 100 : 0

  const error = (leadsQuery.error ?? purchasesQuery.error) as Error | undefined
  const isLoading = leadsQuery.isLoading || purchasesQuery.isLoading

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Topo de funil</p>
        <Typewriter as="h2" className="section-title mt-1" text="Leads" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Todo mundo que chegou pela Meta antes de virar aluno — separado por origem (anúncio,
          workshop gratuito, Essentials, Prompt), com a taxa real de conversão até a compra.
        </p>
      </PageHero>

      {error && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {error.message === 'SESSION_EXPIRED'
            ? 'Sua sessão expirou. Faça login novamente.'
            : error.message || 'Não foi possível carregar os leads.'}
        </section>
      )}

      {isLoading && !error && (
        <div className="space-y-6" aria-busy="true" aria-label="Carregando leads">
          <div className="kpi-grid">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="kpi2">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-8 w-24" />
              </div>
            ))}
          </div>
          <div className="surface-card p-5">
            <div className="skeleton mb-3 h-3 w-32" />
            <div className="skeleton h-28 w-full" />
          </div>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <section
            className="kpi-scroll"
            data-tour="Resumo dos leads"
            data-tour-text="Total de leads, quantos já viraram aluno e a taxa de conversão. O cruzamento é feito pelo e-mail da compra."
          >
            <div className="kpi-card">
              <p className="section-label">Total de leads</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(leads.length)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Viraram aluno</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(totalConverted)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Taxa de conversão</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatPercent(conversionRate)}</p>
            </div>
            <div className="kpi-card">
              <p className="section-label">Origens ativas</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-50">{formatNumber(byOrigin.length)}</p>
            </div>
          </section>

          <section
            className="surface-card p-4"
            data-tour="Por origem"
            data-tour-text="De onde cada lead veio (anúncio, workshop, Essentials, Prompt) e quanto de cada origem converteu."
          >
            <p className="section-label">Por origem</p>
            <h3 className="section-title mt-1 mb-3">Volume e conversão por origem</h3>
            <div className="space-y-2">
              {byOrigin.map((row) => {
                const rate = row.total ? (row.converted / row.total) * 100 : 0
                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2"
                  >
                    <span className="truncate text-sm text-zinc-300">{row.label}</span>
                    <span className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
                      <span>{formatNumber(row.total)} leads</span>
                      <span>{formatNumber(row.converted)} vendas</span>
                      <span className={row.converted > 0 ? 'text-amber-200' : ''}>{formatPercent(rate)}</span>
                    </span>
                  </div>
                )
              })}
              {!byOrigin.length && (
                <p className="py-6 text-center text-sm text-zinc-600">Nenhum lead ainda.</p>
              )}
            </div>
          </section>

          <section
            className="surface-card overflow-hidden"
            data-tour="Lista de leads"
            data-tour-text="Todos os leads em tabela. Use a busca por nome, e-mail, campanha ou origem e exporte em CSV."
          >
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="section-label">Lista</p>
                <h3 className="section-title mt-1">Todos os leads</h3>
              </div>
              <div className="list-tools">
                <input
                  type="text"
                  placeholder="Buscar por nome, e-mail, campanha ou origem..."
                  className="filter-select"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() =>
                    exportCsv(
                      'leads.csv',
                      ['Nome', 'Email', 'Telefone', 'Origem', 'Campanha', 'Data', 'Status'],
                      filtered.map((lead) => [
                        lead.nome,
                        lead.email,
                        lead.telefone,
                        originLabel(lead.origem),
                        lead.campanha,
                        lead.data,
                        purchasedEmails.has(normalizeEmail(lead.email)) ? 'Virou aluno' : 'Lead',
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
                    <th className="font-medium">Origem</th>
                    <th className="font-medium">Campanha</th>
                    <th className="font-medium">Data</th>
                    <th className="num font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead, index) => {
                    const converted = purchasedEmails.has(normalizeEmail(lead.email))
                    return (
                      <tr
                        key={`${lead.email}-${index}`}
                        onClick={() => setPessoa(lead)}
                        title="Ver a linha do tempo desta pessoa"
                        className="cursor-pointer border-b border-zinc-900/80 transition-colors last:border-0 hover:bg-amber-400/10"
                      >
                        <td className="cell-name text-zinc-200" title={lead.nome} data-label="Nome" data-sensivel>
                          {lead.nome || '—'}
                        </td>
                        <td className="cell-more text-zinc-400" title={lead.email} data-label="Contato">
                          {lead.email || lead.telefone || '—'}
                        </td>
                        <td className="cell-brief text-zinc-300" data-label="Origem">{originLabel(lead.origem)}</td>
                        <td className="cell-brief text-zinc-300" title={lead.campanha} data-label="Campanha">
                          {lead.campanha || '—'}
                        </td>
                        <td className="cell-more text-zinc-500" data-label="Data">{lead.data || '—'}</td>
                        <td className="cell-key cell-nolabel num" data-label="Status">
                          {converted ? (
                            <span className="rounded-full border border-amber-500/25 bg-amber-500/8 px-2 py-0.5 text-xs text-amber-200">
                              Virou aluno
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-600">Lead</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={6} className="cell-empty text-center text-zinc-600">
                        Nenhum lead encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {pessoa && <PessoaModal nome={pessoa.nome} email={pessoa.email} telefone={pessoa.telefone} onClose={() => setPessoa(null)} />}
    </div>
  )
}
