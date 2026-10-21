import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchEmailsPainel, type EmailItem, type EmailTipo } from '@/services/acessosService.ts'
import { formatNumber } from '@/lib/format.ts'

const TZ = 'America/Sao_Paulo'
const COR_FILA = '#ff8a1f'
const COR_DIRETOS = '#34d399'
const TOOLTIP_STYLE = {
  background: 'var(--card)',
  border: '3px solid var(--line)',
  borderRadius: 10,
  boxShadow: '3px 3px 0 var(--shade)',
  color: 'var(--ink)',
  fontSize: 12,
}

const MODO = {
  desligado: { texto: 'Sequências desligadas', classe: 'text-zinc-400', dica: 'Só aparecem os e-mails de boas-vindas e de apoio. Defina EMAIL_SEQUENCIAS_MODO no servidor para ligar as sequências.' },
  teste: { texto: 'Sequências em teste', classe: 'text-amber-300', dica: 'Em teste a fila agenda e marca como simulado, sem enviar nada.' },
  ativo: { texto: 'Sequências ativas', classe: 'text-emerald-300', dica: '' },
} as const

const ESTADO: Record<EmailItem['estado'], { texto: string; classe: string }> = {
  enviado: { texto: 'Enviado', classe: 'text-emerald-300' },
  simulado: { texto: 'Simulado', classe: 'text-sky-300' },
  pendente: { texto: 'Agendado', classe: 'text-amber-300' },
  cancelado: { texto: 'Cancelado', classe: 'text-zinc-500' },
  falhou: { texto: 'Falhou', classe: 'text-red-300' },
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

function Cartao({ rotulo, valor, dica, tom }: { rotulo: string; valor: string; dica?: string; tom?: 'red' | 'amber' }) {
  const cor = tom === 'red' ? 'text-red-300' : tom === 'amber' ? 'text-amber-200' : 'text-zinc-50'
  return (
    <div className="kpi-card">
      <p className="section-label">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-semibold ${cor}`}>{valor}</p>
      {dica && <p className="mt-0.5 text-[11px] text-zinc-500">{dica}</p>}
    </div>
  )
}

/** Cartão de um e-mail: quantos saíram e uma barra empilhada com enviados, agendados, cancelados e falhas. */
function CartaoEmail({ t }: { t: EmailTipo }) {
  const partes = [
    { chave: 'enviados', valor: t.enviados, classe: 'bg-emerald-400', rotulo: 'enviados' },
    { chave: 'simulados', valor: t.simulados, classe: 'bg-sky-400', rotulo: 'simulados' },
    { chave: 'pendentes', valor: t.pendentes, classe: 'bg-amber-400', rotulo: 'agendados' },
    { chave: 'cancelados', valor: t.cancelados, classe: 'bg-zinc-500', rotulo: 'cancelados' },
    { chave: 'falhas', valor: t.falhas, classe: 'bg-red-400', rotulo: 'falhas' },
  ]
  const soma = partes.reduce((acc, p) => acc + p.valor, 0)
  const outros = partes.filter((p) => p.valor > 0 && p.chave !== 'enviados').map((p) => `${p.valor} ${p.rotulo}`)
  return (
    <div className="kpi-card">
      <p className="text-sm font-semibold text-zinc-100">{t.rotulo}</p>
      <p className="text-[11px] text-zinc-500">Sai {t.quando}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-50">{formatNumber(t.enviados)}</p>
      <p className="-mt-1 text-[11px] text-zinc-500">enviados</p>
      <div
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-zinc-800"
        role="img"
        aria-label={`${t.rotulo}: ${partes.map((p) => `${p.valor} ${p.rotulo}`).join(', ')}`}
      >
        {partes
          .filter((p) => p.valor > 0)
          .map((p) => (
            <div key={p.chave} className={p.classe} style={{ width: `${(p.valor / soma) * 100}%` }} title={`${p.valor} ${p.rotulo}`} />
          ))}
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-500">{soma === 0 ? 'nenhum ainda' : outros.join(' · ') || 'todos enviados'}</p>
      {t.taxaCompra !== null && (
        <p className="mt-1 text-[11px] text-emerald-300">
          {t.comprouDepois} compraram em até 7 dias depois ({String(t.taxaCompra).replace('.', ',')}%)
        </p>
      )}
    </div>
  )
}

export function EmailsPainel() {
  const [dias, setDias] = useState(30)
  const [tipo, setTipo] = useState('todos')
  const [estado, setEstado] = useState('todos')
  const [busca, setBusca] = useState('')
  const [limite, setLimite] = useState(50)

  const painel = useQuery({ queryKey: ['acessos', 'emails', dias], queryFn: () => fetchEmailsPainel(dias), retry: false, refetchInterval: 60_000 })
  const dados = painel.data

  const grupos = useMemo(() => {
    const mapa = new Map<string, EmailTipo[]>()
    for (const t of dados?.porTipo ?? []) mapa.set(t.grupo, [...(mapa.get(t.grupo) ?? []), t])
    return [...mapa.entries()]
  }, [dados])

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (dados?.lista ?? []).filter((item) => {
      if (tipo !== 'todos' && item.tipo !== tipo) return false
      if (estado !== 'todos' && item.estado !== estado) return false
      if (!termo) return true
      return [item.nome, item.email, item.curso, item.rotulo].filter(Boolean).some((valor) => String(valor).toLowerCase().includes(termo))
    })
  }, [dados, tipo, estado, busca])

  const pontos = (dados?.porDia ?? []).map((d) => ({ nome: diaCurto(d.dia), Sequências: d.fila, 'Boas-vindas e apoio': d.diretos }))
  const modo = dados ? MODO[dados.modo] : null

  return (
    <section className="space-y-4">
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="section-label">E-mails</p>
          <h3 className="section-title mt-1">Controle de e-mails enviados</h3>
          {modo && (
            <p className="mt-1 text-xs text-zinc-500">
              <span className={`font-semibold ${modo.classe}`}>{modo.texto}</span>
              {modo.dica && <> · {modo.dica}</>}
            </p>
          )}
        </div>
        <select value={dias} onChange={(evento) => setDias(Number(evento.target.value))} className="filter-select" aria-label="Período">
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
      </div>

      {painel.isError && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          Não consegui carregar os e-mails: {(painel.error as Error).message}{' '}
          <button type="button" className="underline" onClick={() => void painel.refetch()}>
            tentar de novo
          </button>
        </section>
      )}
      {painel.isLoading && <p className="p-6 text-center text-sm text-zinc-500">Carregando os e-mails...</p>}

      {dados && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Cartao
              rotulo="Enviados hoje"
              valor={`${formatNumber(dados.hoje.total)} de ${dados.hoje.tetoBrevo}`}
              dica={`fila: ${dados.hoje.fila} de ${dados.hoje.tetoFila}`}
              tom={dados.hoje.total >= dados.hoje.tetoBrevo * 0.9 ? 'amber' : undefined}
            />
            <Cartao rotulo={`Enviados em ${dados.dias} dias`} valor={formatNumber(dados.total.enviados)} dica={dados.total.simulados ? `${dados.total.simulados} simulados` : undefined} />
            <Cartao rotulo="Agendados" valor={formatNumber(dados.total.pendentes)} dica="ainda vão sair" />
            <Cartao rotulo="Cancelados" valor={formatNumber(dados.total.cancelados)} dica="comprou antes de sair" />
            <Cartao rotulo="Falhas" valor={formatNumber(dados.total.falhas)} tom={dados.total.falhas > 0 ? 'red' : undefined} dica="não saíram" />
          </div>

          <div className="surface-card p-4">
            <p className="section-label">Ritmo</p>
            <h4 className="section-title mt-1">E-mails enviados por dia</h4>
            <div style={{ width: '100%', height: 220 }} role="img" aria-label="E-mails enviados por dia">
              <ResponsiveContainer>
                <BarChart data={pontos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="nome" stroke="var(--muted)" tick={{ fontSize: 11 }} tickLine={false} interval={dados.dias > 14 ? Math.floor(dados.dias / 10) : 0} />
                  <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} width={32} />
                  <Tooltip cursor={{ fill: 'var(--chart-grid)' }} contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Sequências" stackId="a" fill={COR_FILA} />
                  <Bar dataKey="Boas-vindas e apoio" stackId="a" fill={COR_DIRETOS} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {grupos.map(([grupo, tipos]) => (
            <div key={grupo}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{grupo}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tipos.map((t) => (
                  <CartaoEmail key={t.tipo} t={t} />
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-zinc-500">
            "Compraram depois" é a pessoa que comprou em até 7 dias depois do envio: mostra a relação, não prova que o e-mail causou a compra.
          </p>

          <div className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="section-label">Lista</p>
                <h4 className="section-title mt-1">Todos os e-mails</h4>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatNumber(lista.length)} e-mail(s){dados.listaCortada ? ' (mostrando os mais recentes)' : ''}
                </p>
              </div>
              <div className="list-tools">
                <select
                  value={tipo}
                  onChange={(evento) => {
                    setTipo(evento.target.value)
                    setLimite(50)
                  }}
                  className="filter-select"
                  aria-label="Tipo de e-mail"
                >
                  <option value="todos">Todos os e-mails</option>
                  {dados.porTipo.map((t) => (
                    <option key={t.tipo} value={t.tipo}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
                <select
                  value={estado}
                  onChange={(evento) => {
                    setEstado(evento.target.value)
                    setLimite(50)
                  }}
                  className="filter-select"
                  aria-label="Situação"
                >
                  <option value="todos">Todas as situações</option>
                  {Object.entries(ESTADO).map(([chave, e]) => (
                    <option key={chave} value={chave}>
                      {e.texto}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={busca}
                  onChange={(evento) => {
                    setBusca(evento.target.value)
                    setLimite(50)
                  }}
                  placeholder="Buscar nome ou e-mail..."
                  className="filter-select"
                />
              </div>
            </div>
            <div className="overflow-auto md:max-h-[560px]">
              <table className="data-table data-table-brief">
                <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="font-medium">Quando</th>
                    <th className="font-medium">E-mail</th>
                    <th className="font-medium">Para</th>
                    <th className="font-medium">Curso</th>
                    <th className="font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, limite).map((item) => {
                    const situacao = ESTADO[item.estado]
                    return (
                      <tr key={item.id} className="border-b border-zinc-900/80">
                        <td className="cell-brief text-zinc-500" data-label="Quando">
                          {dataHora(item.quando)}
                          {item.estado === 'pendente' && <span className="block text-[11px]">agendado</span>}
                        </td>
                        <td className="cell-name text-zinc-200" data-label="E-mail">
                          {item.rotulo}
                        </td>
                        <td className="cell-brief text-zinc-300" data-label="Para" title={item.email ?? ''} data-sensivel>
                          {item.nome || item.email || '—'}
                          <span className="block truncate text-xs text-zinc-500">{item.email}</span>
                        </td>
                        <td className="cell-more text-zinc-400" data-label="Curso">
                          {item.curso || '—'}
                        </td>
                        <td className={`cell-key cell-nolabel font-medium ${situacao.classe}`} data-label="Situação">
                          {situacao.texto}
                          {item.comprouDepois && <span className="block text-xs font-normal text-emerald-300">comprou depois</span>}
                          {item.motivo && <span className="block text-xs font-normal text-zinc-500">{item.motivo === 'comprou' ? 'já tinha comprado' : item.motivo}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!lista.length && <p className="p-6 text-center text-sm text-zinc-500">Nenhum e-mail encontrado neste período.</p>}
              {lista.length > limite && (
                <div className="p-4 text-center">
                  <button
                    type="button"
                    onClick={() => setLimite((valor) => valor + 100)}
                    className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
                  >
                    Mostrar mais
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
