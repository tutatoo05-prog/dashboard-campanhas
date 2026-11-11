import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import {
  fetchCambio,
  fetchFinancas,
  salvarCaixa,
  salvarLancamento,
  sincronizarFinancas,
  type FinCelula,
  type FinLinha,
  type Financas,
} from '@/services/financasService.ts'
import { formatCurrency } from '@/lib/format.ts'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const GRID = 'var(--chart-grid)'
const AXIS = 'var(--muted)'
const TOOLTIP_STYLE = {
  background: 'var(--card)',
  border: '3px solid var(--line)',
  borderRadius: 10,
  boxShadow: '3px 3px 0 var(--shade)',
  color: 'var(--ink)',
  fontSize: 12,
}

const ORIGEM_DICA: Record<FinCelula['origem'], string> = {
  auto: 'Automático (atualiza sozinho). Clique para digitar um valor.',
  manual: 'Digitado por você. Limpe o campo para voltar ao automático (se a linha tiver).',
  planilha: 'Veio da planilha "Lucro Academy 2026". Clique para corrigir.',
}

// Tabela mensal: valor completo com R$; zero aparece como traco.
function reais(v: number) {
  return v === 0 ? '—' : formatCurrency(v)
}

function CotacaoAoVivo() {
  const query = useQuery({ queryKey: ['cambio'], queryFn: fetchCambio, refetchInterval: 60_000, retry: 1 })
  if (query.isError) return <p className="text-xs text-zinc-500">Cotação indisponível agora.</p>
  const moedas = [
    { id: 'USD', rotulo: 'Dólar' },
    { id: 'EUR', rotulo: 'Euro' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1" aria-live="polite" title="Atualiza a cada minuto (AwesomeAPI)">
      {moedas.map(({ id, rotulo }) => {
        const c = query.data?.[id]
        if (!c) return <span key={id} className="text-xs text-zinc-500">{rotulo} …</span>
        return (
          <span key={id} className="flex items-baseline gap-1.5 text-sm text-zinc-200">
            <span className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</span>
            <b className="tabular-nums">{formatCurrency(c.valor)}</b>
            <span className={`text-xs tabular-nums ${c.variacao < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {c.variacao < 0 ? '▼' : '▲'} {Math.abs(c.variacao).toFixed(2).replace('.', ',')}%
            </span>
          </span>
        )
      })}
      <span className="flex items-center gap-1 text-[11px] text-zinc-500">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden /> ao vivo
      </span>
    </div>
  )
}

function Kpi({ label, value, hint, tom }: { label: string; value: string; hint?: string; tom?: 'bom' | 'ruim' }) {
  return (
    <div className="kpi2">
      <p className="kpi2-label">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tom === 'ruim' ? 'text-red-400' : tom === 'bom' ? 'text-emerald-400' : 'text-zinc-50'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

function parseValor(texto: string): number | null | undefined {
  const limpo = texto.trim()
  if (!limpo) return null
  const numero = Number(limpo.replace(/[R$\s.]/g, '').replace(',', '.'))
  return Number.isFinite(numero) ? numero : undefined
}

function Celula({
  celula,
  onSalvar,
  editavel,
}: {
  celula: FinCelula | null
  onSalvar: (valor: number | null) => Promise<unknown>
  editavel: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState(false)

  async function confirmar() {
    const valor = parseValor(texto)
    if (valor === undefined) {
      setErro(true)
      return
    }
    setEditando(false)
    if (valor === (celula?.valor ?? null)) return
    try {
      await onSalvar(valor)
    } catch {
      setErro(true)
    }
  }

  if (editando) {
    return (
      <input
        autoFocus
        className={`w-24 rounded border bg-transparent px-1 py-1 text-center text-sm ${erro ? 'border-red-500' : 'border-white/20'}`}
        value={texto}
        inputMode="decimal"
        aria-label="Valor em reais"
        onChange={(e) => {
          setTexto(e.target.value)
          setErro(false)
        }}
        onBlur={() => void confirmar()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void confirmar()
          if (e.key === 'Escape') setEditando(false)
        }}
      />
    )
  }

  const vazio = celula === null
  return (
    <button
      type="button"
      disabled={!editavel}
      title={celula ? `${formatCurrency(celula.valor)} · ${ORIGEM_DICA[celula.origem]}` : 'Sem valor. Clique para digitar.'}
      className={`w-full whitespace-nowrap rounded px-1 py-1.5 text-center text-[13px] tabular-nums hover:bg-white/10 ${vazio || celula.valor === 0 ? 'text-zinc-600' : 'text-zinc-100'}`}
      onClick={() => {
        setTexto(celula ? String(celula.valor).replace('.', ',') : '')
        setErro(false)
        setEditando(true)
      }}
    >
      {celula?.origem === 'auto' && <i className="fa-solid fa-bolt mr-0.5 text-[8px] text-amber-400" aria-hidden />}
      {vazio ? '—' : reais(celula.valor)}
    </button>
  )
}

function Bloco({
  tipo,
  linhas,
  meses,
  indices,
  onSalvar,
}: {
  meses: string[]
  indices: number[]
  tipo: 'receita' | 'custo'
  linhas: FinLinha[]
  onSalvar: (mes: string, tipo: 'receita' | 'custo', linha: string, valor: number | null) => Promise<unknown>
}) {
  return (
    <>
      {linhas.map((linha) => (
        <tr key={linha.id} className="border-t border-white/5 hover:bg-white/[0.03]">
          <th scope="row" className={`sticky left-0 z-10 whitespace-nowrap bg-[var(--card)] px-3 py-1.5 text-left text-sm font-medium ${linha.incluso ? 'pl-6 italic text-zinc-500' : 'text-zinc-300'}`}>
            {linha.rotulo}
          </th>
          {indices.map((i) => (
            <td key={i} className="px-0.5 py-0.5">
              <Celula celula={linha.celulas[i]} editavel onSalvar={(valor) => onSalvar(meses[i], tipo, linha.id, valor)} />
            </td>
          ))}
          <td className="whitespace-nowrap border-l border-white/10 px-2 text-center text-[13px] font-semibold tabular-nums text-zinc-100">
            {reais(linha.celulas.reduce((s, c) => s + (c?.valor ?? 0), 0))}
          </td>
        </tr>
      ))}
    </>
  )
}

function Tabela({ titulo, tom, ano, indices, children }: { titulo: string; tom: 'verde' | 'vermelho' | 'neutro'; ano: number; indices: number[]; children: React.ReactNode }) {
  const cor = tom === 'verde' ? 'text-emerald-300' : tom === 'vermelho' ? 'text-rose-300' : 'text-zinc-100'
  const fundo = tom === 'verde' ? 'bg-emerald-500/10' : tom === 'vermelho' ? 'bg-rose-500/10' : 'bg-white/5'
  return (
    <section className="surface-card overflow-hidden">
      <p className={`${fundo} ${cor} px-3 py-2 text-xs font-semibold uppercase tracking-wide`}>{titulo}</p>
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col style={{ width: 190 }} />
          {indices.map((i) => (
            <col key={i} />
          ))}
          <col style={{ width: 112 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-sm font-semibold text-zinc-200">{ano}</th>
            {indices.map((i) => (
              <th key={i} className="px-1 py-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {MESES[i]}
              </th>
            ))}
            <th className="border-l border-white/10 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-200">Ano</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  )
}

function LinhaTotal({ rotulo, valores, indices, cor, forte }: { rotulo: string; valores: number[]; indices: number[]; cor: string; forte?: boolean }) {
  return (
    <tr className="border-t border-white/10">
      <th scope="row" className={`whitespace-nowrap px-3 py-2.5 text-left text-sm font-semibold ${cor}`}>
        {rotulo}
      </th>
      {indices.map((i) => (
        <td key={i} title={formatCurrency(valores[i])} className={`whitespace-nowrap px-1 py-2.5 text-center text-[13px] font-semibold tabular-nums ${cor}`}>
          {reais(valores[i])}
        </td>
      ))}
      <td className={`whitespace-nowrap border-l border-white/10 px-2 text-center text-[13px] tabular-nums ${forte ? 'font-bold' : 'font-semibold'} ${cor}`}>{reais(valores.reduce((a, v) => a + v, 0))}</td>
    </tr>
  )
}

const TODOS = Array.from({ length: 12 }, (_, i) => i)

function Planilha({
  dados,
  ano,
  indices,
  lancar,
}: {
  dados: Financas
  ano: number
  indices: number[]
  lancar: { mutateAsync: (p: { mes: string; tipo: 'receita' | 'custo'; linha: string; valor: number | null }) => Promise<unknown> }
}) {
  return (
    <div className="space-y-4">
    <Tabela titulo="Ganhos" tom="verde" ano={ano} indices={indices}>
    <Bloco meses={dados.meses} indices={indices} tipo="receita" linhas={dados.receitas} onSalvar={(mes, tipo, linha, valor) => lancar.mutateAsync({ mes, tipo, linha, valor })} />
  </Tabela>

  <Tabela titulo="Custos" tom="vermelho" ano={ano} indices={indices}>
    <Bloco meses={dados.meses} indices={indices} tipo="custo" linhas={dados.custos} onSalvar={(mes, tipo, linha, valor) => lancar.mutateAsync({ mes, tipo, linha, valor })} />
  </Tabela>

  <Tabela titulo="Resultado" tom="neutro" ano={ano} indices={indices}>
    <LinhaTotal indices={indices} rotulo="Total de ganhos" valores={dados.totalReceita} cor="text-emerald-300" />
    <LinhaTotal indices={indices} rotulo="Total de custos" valores={dados.totalCusto} cor="text-rose-300" />
    <tr className="border-t-2 border-white/20 bg-white/[0.04]">
      <th scope="row" className="whitespace-nowrap px-3 py-3 text-left text-sm font-bold text-zinc-50">
        Lucro
      </th>
      {indices.map((i) => {
        const valor = dados.lucro[i]
        return (
        <td key={i} title={valor === null ? undefined : formatCurrency(valor)} className={`whitespace-nowrap px-1 py-3 text-center text-[13px] font-bold tabular-nums ${valor === null ? 'text-zinc-600' : valor < 0 ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
          {valor === null ? '—' : reais(valor)}
        </td>
        )
      })}
      <td className={`whitespace-nowrap border-l border-white/10 px-2 text-center text-[13px] font-bold tabular-nums ${dados.anual.lucro < 0 ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{reais(dados.anual.lucro)}</td>
    </tr>
  </Tabela>
    </div>
  )
}

function Conteudo({ dados, ano }: { dados: Financas; ano: number }) {
  const queryClient = useQueryClient()
  const guardar = (novo: Financas) => queryClient.setQueryData(['financas', novo.ano], novo)

  const lancar = useMutation({
    mutationFn: (p: { mes: string; tipo: 'receita' | 'custo'; linha: string; valor: number | null }) => salvarLancamento(p.mes, p.tipo, p.linha, p.valor),
    onSuccess: guardar,
  })
  const atualizar = useMutation({ mutationFn: (desde?: string) => sincronizarFinancas(desde), onSuccess: guardar })
  const caixaMut = useMutation({ mutationFn: (valor: number) => salvarCaixa(valor, ano), onSuccess: guardar })

  const [completa, setCompleta] = useState(false)
  const hoje = new Date()
  const fim = ano < hoje.getFullYear() ? 11 : ano > hoje.getFullYear() ? 4 : Math.max(4, hoje.getMonth())
  const recorte = TODOS.slice(fim - 4, fim + 1)
  useEffect(() => {
    if (!completa) return
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setCompleta(false)
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [completa])

  const [editandoCaixa, setEditandoCaixa] = useState(false)
  const [textoCaixa, setTextoCaixa] = useState('')

  const grafico = dados.meses.map((_, i) => ({
    nome: MESES[i],
    Receita: dados.totalReceita[i],
    Custos: dados.totalCusto[i],
    Lucro: dados.lucro[i],
  }))
  const lucroAno = dados.anual.lucro
  const sync = dados.sincronizacao

  return (
    <div className="space-y-6">
      <div className="kpi-grid">
        <Kpi label="Receita no ano" value={formatCurrency(dados.anual.receita)} />
        <Kpi label="Custos no ano" value={formatCurrency(dados.anual.custo)} hint={`Referência mensal: ${formatCurrency(dados.custoMensalReferencia)}`} />
        <Kpi label="Lucro no ano" value={formatCurrency(lucroAno)} tom={lucroAno >= 0 ? 'bom' : 'ruim'} />
        <div className="kpi2">
          <p className="kpi2-label">Caixa acumulado</p>
          {editandoCaixa ? (
            <input
              autoFocus
              className="mt-1 w-full rounded border border-white/20 bg-transparent px-1 text-lg"
              value={textoCaixa}
              inputMode="decimal"
              aria-label="Caixa acumulado em reais"
              onChange={(e) => setTextoCaixa(e.target.value)}
              onBlur={() => setEditandoCaixa(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditandoCaixa(false)
                if (e.key === 'Enter') {
                  const v = parseValor(textoCaixa)
                  if (typeof v === 'number') caixaMut.mutate(v)
                  setEditandoCaixa(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="mt-1 block text-left text-2xl font-semibold text-zinc-50 hover:underline"
              title="Clique para atualizar o caixa"
              onClick={() => {
                setTextoCaixa(dados.caixa === null ? '' : String(dados.caixa).replace('.', ','))
                setEditandoCaixa(true)
              }}
            >
              {dados.caixa === null ? 'Definir' : formatCurrency(dados.caixa)}
            </button>
          )}
          <p className="mt-0.5 text-xs text-zinc-500">Atualizado por você</p>
        </div>
        <Kpi
          label="Meses de sobrevivência"
          value={dados.mesesSobrevivencia === null ? '—' : String(dados.mesesSobrevivencia)}
          hint="Caixa dividido pelo custo mensal"
          tom={dados.mesesSobrevivencia !== null && dados.mesesSobrevivencia < 3 ? 'ruim' : undefined}
        />
        <Kpi label="Faltam para 12 meses" value={dados.faltamPara12Meses === null ? '—' : formatCurrency(dados.faltamPara12Meses)} hint="12 × custo mensal − caixa" />
      </div>

      <section className="surface-card p-4">
        <p className="section-label mb-3">Receita, custos e lucro por mês</p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={grafico}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="nome" stroke={AXIS} fontSize={12} />
              <YAxis stroke={AXIS} fontSize={12} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(Number(v))} />
              <Legend />
              <Bar dataKey="Receita" fill="#2f9e6e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Custos" fill="#ff8a1f" radius={[4, 4, 0, 0]} />
              <Line dataKey="Lucro" stroke="#e8e0d0" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="surface-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-zinc-400">
          Mostrando {MESES[recorte[0]]} a {MESES[recorte[recorte.length - 1]]}. A coluna Ano soma o ano inteiro.
        </p>
        <button type="button" className="btn-gold" onClick={() => setCompleta(true)}>
          Ver planilha completa
        </button>
      </section>

      <Planilha dados={dados} ano={ano} indices={recorte} lancar={lancar} />

      {completa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Planilha completa" onClick={() => setCompleta(false)}>
          <div className="max-h-[92vh] w-[90vw] overflow-y-auto rounded-2xl bg-[var(--bg,#0b0f17)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="section-label">Planilha completa {ano}</p>
              <button type="button" className="btn-gold" onClick={() => setCompleta(false)}>
                Fechar
              </button>
            </div>
            <Planilha dados={dados} ano={ano} indices={TODOS} lancar={lancar} />
          </div>
        </div>
      )}

      <section className="surface-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-label">Fontes automáticas</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Atualizam sozinhas a cada 6 horas (mês atual e anterior). Células com <i className="fa-solid fa-bolt text-[9px] text-amber-400" /> são automáticas; o que você digita nunca é sobrescrito.
              {sync.em ? ` Última busca: ${new Date(sync.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.` : ''}
            </p>
          </div>
          <button type="button" className="btn-gold" disabled={atualizar.isPending} onClick={() => atualizar.mutate(undefined)}>
            {atualizar.isPending ? 'Buscando...' : 'Atualizar agora'}
          </button>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {dados.fontes.map((fonte) => {
            const r = sync.resultado.find((x) => x.id === fonte.id)
            const cor = !fonte.configurada ? 'text-zinc-500' : r?.status === 'erro' ? 'text-red-400' : 'text-emerald-400'
            return (
              <li key={fonte.id} className="rounded-lg border border-white/10 p-3 text-xs">
                <p className={`font-semibold ${cor}`}>
                  {fonte.rotulo} · {!fonte.configurada ? 'não configurado' : r?.status === 'erro' ? 'com erro' : 'ligado'}
                </p>
                <p className="mt-1 text-zinc-500">{!fonte.configurada ? `Falta ${fonte.vars} no servidor.` : r?.mensagem ?? 'Aguardando a primeira busca.'}</p>
              </li>
            )
          })}
        </ul>
        {(atualizar.error || lancar.error || caixaMut.error) && (
          <p className="mt-3 text-xs text-red-300" role="alert">
            {((atualizar.error || lancar.error || caixaMut.error) as Error).message}
          </p>
        )}
      </section>

      {dados.recordes.mes && (
        <section className="surface-card p-4">
          <p className="section-label mb-2">Recordes</p>
          <ul className="grid gap-1 text-sm text-zinc-300 sm:grid-cols-2">
            <li>
              Melhor mês ({MESES[Number(dados.recordes.mes.mes.slice(5)) - 1]}): <b>{formatCurrency(dados.recordes.mes.valor)}</b>
            </li>
            {dados.recordes.porFonte
              .filter((r) => ['hotmart', 'youtube'].includes(r.id))
              .map((r) => (
                <li key={r.id}>
                  {r.rotulo} ({MESES[Number(r.mes.slice(5)) - 1]}): <b>{formatCurrency(r.valor)}</b>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default function FinancasPage() {
  const [ano, setAno] = useState(new Date().getFullYear())
  const query = useQuery({ queryKey: ['financas', ano], queryFn: () => fetchFinancas(ano), retry: false })
  const error = query.error as Error | null

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Operação</p>
        <Typewriter as="h2" className="section-title mt-1" text="Finanças" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Quanto entra e quanto sai na Academy, mês a mês. Hotmart, anúncios e YouTube chegam sozinhos; o resto você digita clicando na célula.
        </p>
      </PageHero>

      <section className="surface-card filter-bar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="seg" role="group" aria-label="Ano">
          {[ano - 1, ano, ano + 1].map((a) => (
            <button key={a} type="button" className={`seg-btn ${a === ano ? 'seg-btn-active' : ''}`} aria-pressed={a === ano} onClick={() => setAno(a)}>
              {a}
            </button>
          ))}
        </div>
        <CotacaoAoVivo />
      </section>

      {error && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300" role="alert">
          {error.message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : error.message}
        </section>
      )}

      {query.isLoading && !error && (
        <div className="kpi-grid" aria-busy="true" aria-label="Carregando finanças">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="kpi2">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-8 w-24" />
            </div>
          ))}
        </div>
      )}

      {query.data && !error && <Conteudo dados={query.data} ano={ano} />}
    </div>
  )
}
