import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { fetchClube, sincronizarClube, type Clube, type ClubeMembro, type PlataformaClube, type ResultadoSync } from '@/services/clubeService.ts'
import { formatNumber } from '@/lib/format.ts'
import { formatDateBr } from '@/lib/period.ts'

const NOMES: Record<PlataformaClube, string> = { youtube: 'YouTube', essentials: 'Essentials' }
const CORES: Record<PlataformaClube, string> = { youtube: '#ff4d4d', essentials: '#ff8a1f' }
const GRID = 'var(--chart-grid)'
const AXIS = 'var(--muted)'
const TOOLTIP_STYLE = { background: 'var(--card)', border: '3px solid var(--line)', borderRadius: 10, boxShadow: '3px 3px 0 var(--shade)', color: 'var(--ink)', fontSize: 12 }
const NOMES_FONTE: Record<string, string> = { essentials: 'Essentials (tabela de acessos)', youtube: 'YouTube (membros do canal)', discord: 'Discord (cargos)' }

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="kpi-card">
      <p className="section-label">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-zinc-50">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

function textoDoResultado(r: ResultadoSync[string] | undefined): string {
  if (!r) return '—'
  if (r.erro) return `erro: ${r.erro}`
  if (r.pulado) return `pulado (${r.pulado})`
  if (r.aviso) return r.aviso
  if (r.cargosRemovidos !== undefined) return `${r.cargosRemovidos} cargo(s) removido(s)`
  return `${r.ativos ?? 0} ativos · ${r.novos ?? 0} novos · ${r.cancelados ?? 0} saíram`
}

function Configuracao({ dados }: { dados: Clube }) {
  const faltam = dados.config.filter((b) => !b.pronto)
  return (
    <section className="surface-card p-4" data-tour="O que falta" data-tour-text="Cada bloco liga uma parte do clube. Os nomes em destaque são variáveis que faltam no .env do servidor (os valores nunca aparecem aqui).">
      <p className="section-label">Configuração</p>
      <h3 className="section-title mt-1 mb-3">{faltam.length === 0 ? 'Tudo configurado' : `O que falta para ligar (${faltam.length})`}</h3>
      <ul className="space-y-3">
        {dados.config.map((b) => (
          <li key={b.id} className="flex gap-3">
            <i className={`fa-solid ${b.pronto ? 'fa-circle-check text-emerald-400' : 'fa-circle-exclamation text-amber-300'} mt-1`} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100">{b.titulo}</p>
              <p className="text-xs text-zinc-500">{b.dica}</p>
              {!b.pronto && (
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {b.faltando.map((nome) => (
                    <code key={nome} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-amber-200">{nome}</code>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-zinc-700/40 pt-3">
        <p className="section-label">Endereços para cadastrar nos painéis</p>
        <dl className="mt-2 space-y-1.5 text-xs">
          <div><dt className="text-zinc-500">Google Cloud → credencial OAuth → URIs de redirecionamento</dt><dd><code className="break-all text-zinc-200">{dados.enderecos.retornoGoogle}</code></dd></div>
          <div><dt className="text-zinc-500">Discord Developer Portal → OAuth2 → Redirects</dt><dd><code className="break-all text-zinc-200">{dados.enderecos.retornoDiscord}</code></dd></div>
          <div><dt className="text-zinc-500">Página pública de resgate (é o link que vai para os membros)</dt><dd><code className="break-all text-zinc-200">{dados.enderecos.paginaDeResgate}</code></dd></div>
        </dl>
      </div>
    </section>
  )
}

function Evolucao({ dados }: { dados: Clube }) {
  const pontos = useMemo(() => {
    const porDia = new Map<string, Record<string, number | string>>()
    for (const s of dados.evolucao) {
      const linha = porDia.get(s.dia) ?? { dia: s.dia }
      linha[s.plataforma] = s.ativos
      porDia.set(s.dia, linha)
    }
    return [...porDia.values()]
  }, [dados.evolucao])
  if (pontos.length < 2) {
    return <p className="text-sm text-zinc-400">A evolução aparece depois de dois dias de sincronização.</p>
  }
  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={pontos} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="dia" tickFormatter={(d: string) => formatDateBr(d).slice(0, 5)} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} width={36} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatDateBr(String(d))} formatter={(v, nome) => [formatNumber(Number(v)), NOMES[nome as PlataformaClube] ?? String(nome)]} />
          {(['youtube', 'essentials'] as PlataformaClube[]).map((p) => (
            <Line key={p} type="monotone" dataKey={p} stroke={CORES[p]} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function Membros({ membros }: { membros: ClubeMembro[] }) {
  const [busca, setBusca] = useState('')
  const [plataforma, setPlataforma] = useState<'todas' | PlataformaClube>('todas')
  const [status, setStatus] = useState<'ativo' | 'cancelado' | 'todos'>('ativo')

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return membros.filter((m) => {
      if (plataforma !== 'todas' && m.plataforma !== plataforma) return false
      if (status !== 'todos' && m.status !== status) return false
      if (!termo) return true
      return [m.nome, m.email, m.discordNome, m.nivel].some((c) => (c ?? '').toLowerCase().includes(termo))
    })
  }, [membros, busca, plataforma, status])

  return (
    <section className="surface-card p-4">
      <p className="section-label">Membros</p>
      <h3 className="section-title mt-1 mb-3">Quem está no clube</h3>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="filter-select w-56" placeholder="Buscar por nome, e-mail ou Discord" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar membro" />
        <div className="seg" role="group" aria-label="Plataforma">
          {(['todas', 'youtube', 'essentials'] as const).map((p) => (
            <button key={p} type="button" className={`seg-btn ${plataforma === p ? 'seg-btn-active' : ''}`} aria-pressed={plataforma === p} onClick={() => setPlataforma(p)}>
              {p === 'todas' ? 'Todas' : NOMES[p]}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Situação">
          {(['ativo', 'cancelado', 'todos'] as const).map((s) => (
            <button key={s} type="button" className={`seg-btn ${status === s ? 'seg-btn-active' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'ativo' ? 'Ativos' : s === 'cancelado' ? 'Saíram' : 'Todos'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-zinc-500">{formatNumber(filtrados.length)} de {formatNumber(membros.length)}</span>
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-zinc-400">Nenhum membro com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Nome</th>
                <th className="py-1.5 pr-3 font-medium">Plataforma</th>
                <th className="py-1.5 pr-3 font-medium">Nível</th>
                <th className="py-1.5 pr-3 font-medium">Situação</th>
                <th className="py-1.5 pr-3 font-medium">Discord</th>
                <th className="py-1.5 font-medium">Desde</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, 300).map((m) => (
                <tr key={m.id} className="border-t border-zinc-700/30 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-zinc-100">{m.nome || '—'}</p>
                    {m.email && <p className="text-xs text-zinc-500">{m.email}</p>}
                  </td>
                  <td className="py-2 pr-3 text-zinc-300">{NOMES[m.plataforma]}</td>
                  <td className="py-2 pr-3 text-zinc-400">{m.nivel || '—'}</td>
                  <td className="py-2 pr-3">
                    <span className={m.status === 'ativo' ? 'text-emerald-300' : 'text-zinc-500'}>{m.status === 'ativo' ? 'Ativo' : 'Saiu'}</span>
                  </td>
                  <td className="py-2 pr-3 text-zinc-300">
                    {m.noDiscord ? <span title={m.cargoAplicado ? 'Com o cargo' : 'Cargo já removido'}>{m.discordNome || 'ligado'}{m.cargoAplicado ? '' : ' (sem cargo)'}</span> : <span className="text-zinc-500">não resgatou</span>}
                  </td>
                  <td className="py-2 text-zinc-400">{m.desde ? formatDateBr(m.desde.slice(0, 10)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length > 300 && <p className="mt-2 text-xs text-zinc-500">Mostrando os 300 primeiros. Use a busca para achar os demais.</p>}
        </div>
      )}
    </section>
  )
}

export default function ClubePage() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['clube'], queryFn: fetchClube, retry: false })
  const sync = useMutation({
    mutationFn: sincronizarClube,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clube'] }),
  })

  const dados = query.data
  const erro = query.error as Error | null
  const p = dados?.plataformas
  const noDiscord = (p?.youtube.noDiscord ?? 0) + (p?.essentials.noDiscord ?? 0)

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Operação</p>
        <Typewriter as="h2" className="section-title mt-1" text="Clube" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Membros do YouTube e da Essentials, e quem já entrou no Discord com o cargo. A lista atualiza sozinha a cada poucas horas.
        </p>
      </PageHero>

      {erro && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300" role="alert">
          {erro.message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : erro.message}
        </section>
      )}

      {query.isLoading && !erro && <div className="surface-card p-5" aria-busy="true"><div className="skeleton h-28 w-full" /></div>}

      {dados && (
        <>
          {dados.precisaMigracao && (
            <section className="surface-card border-amber-500/30 p-4 text-sm text-amber-300" role="status">
              Falta criar as tabelas do clube no banco: rode o arquivo <code>db/clube.sql</code> no SQL Editor do Supabase (schema <code>dash</code>). Enquanto isso, o resto do dash segue normal.
            </section>
          )}

          {p && (
            <section className="kpi-scroll" data-tour="Resumo do clube" data-tour-text="Quantos membros ativos há em cada plataforma e quantos já entraram no Discord.">
              <Kpi label="YouTube" value={formatNumber(p.youtube.ativos)} hint="membros ativos do canal" />
              <Kpi label="Essentials" value={formatNumber(p.essentials.ativos)} hint="alunos com acesso ativo" />
              <Kpi label="No Discord" value={formatNumber(noDiscord)} hint="já fizeram o resgate" />
              <Kpi label="Saíram" value={formatNumber(p.youtube.cancelados + p.essentials.cancelados)} hint="não são mais membros" />
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Configuracao dados={dados} />

            <section className="surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="section-label">Sincronização</p>
                  <h3 className="section-title mt-1 mb-3">Última leitura das fontes</h3>
                </div>
                <button type="button" className="btn-gold" disabled={sync.isPending || dados.precisaMigracao} onClick={() => sync.mutate()}>
                  {sync.isPending ? 'Sincronizando...' : 'Sincronizar agora'}
                </button>
              </div>
              <ul className="space-y-2 text-sm">
                {['essentials', 'youtube', 'discord'].map((fonte) => {
                  const e = dados.estado[fonte]
                  return (
                    <li key={fonte}>
                      <p className="font-semibold text-zinc-100">{NOMES_FONTE[fonte]}</p>
                      <p className={`text-xs ${e?.erro ? 'text-red-300' : 'text-zinc-500'}`}>
                        {e ? `${textoDoResultado(e)} · ${new Date(e.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'ainda não sincronizou'}
                      </p>
                    </li>
                  )
                })}
              </ul>
              {sync.isError && <p className="mt-3 text-sm text-red-300" role="alert">{(sync.error as Error).message}</p>}
              {sync.data && !sync.isPending && <p className="mt-3 text-sm text-emerald-300" role="status">Sincronizado agora.</p>}

              <div className="mt-4 border-t border-zinc-700/40 pt-3">
                <p className="section-label">Evolução dos ativos</p>
                <div className="mt-2"><Evolucao dados={dados} /></div>
              </div>
            </section>
          </div>

          {!dados.precisaMigracao && <Membros membros={dados.membros} />}
        </>
      )}
    </div>
  )
}
