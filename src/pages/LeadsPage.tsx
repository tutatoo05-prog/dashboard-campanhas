import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLeads } from '@/services/leadService.ts'
import { fetchPurchases } from '@/services/purchaseService.ts'
import { formatNumber, formatPercent } from '@/lib/format.ts'
import { exportCsv } from '@/lib/csv.ts'

const ORIGIN_LABELS: Record<string, string> = {
  anuncio: 'Anúncio (formulário)',
  work_cobertura: 'Work Cobertura',
  essentials: 'Essentials',
  prompt: 'Prompt',
  workshop_gratuito: 'Workshop gratuito',
  workshop_gratuito_leao: 'Workshop Leão',
}

function originLabel(origem?: string): string {
  if (!origem) return 'Sem origem'
  return ORIGIN_LABELS[origem] ?? origem
}

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
      <section className="hero-panel p-6 sm:p-8">
        <p className="section-label">Topo de funil</p>
        <h2 className="section-title mt-1">Leads</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Todo mundo que chegou pela Meta antes de virar aluno — separado por origem (anúncio,
          workshop gratuito, Essentials, Prompt), com a taxa real de conversão até a compra.
        </p>
      </section>

      {error && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {error.message === 'SESSION_EXPIRED'
            ? 'Sua sessão expirou. Faça login novamente.'
            : error.message || 'Não foi possível carregar os leads.'}
        </section>
      )}

      {isLoading && !error && (
        <section className="surface-card p-8 text-center text-sm text-zinc-500">
          Carregando leads...
        </section>
      )}

      {!isLoading && !error && (
        <>
          <section className="kpi-scroll">
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

          <section className="surface-card p-4">
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

          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="section-label">Lista</p>
                <h3 className="section-title mt-1">Todos os leads</h3>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar por nome, e-mail, campanha ou origem..."
                  className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
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

            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-4 py-2 font-medium">Contato</th>
                    <th className="px-4 py-2 font-medium">Origem</th>
                    <th className="px-4 py-2 font-medium">Campanha</th>
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-4 py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead, index) => {
                    const converted = purchasedEmails.has(normalizeEmail(lead.email))
                    return (
                      <tr key={`${lead.email}-${index}`} className="border-b border-zinc-900/80 last:border-0">
                        <td className="max-w-[180px] truncate px-4 py-2.5 text-zinc-200" title={lead.nome}>
                          {lead.nome || '—'}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-2.5 text-zinc-400" title={lead.email}>
                          {lead.email || lead.telefone || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-300">{originLabel(lead.origem)}</td>
                        <td className="max-w-[160px] truncate px-4 py-2.5 text-zinc-300" title={lead.campanha}>
                          {lead.campanha || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500">{lead.data || '—'}</td>
                        <td className="px-4 py-2.5 text-right">
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
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
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
    </div>
  )
}
