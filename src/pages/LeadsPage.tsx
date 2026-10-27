import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { PessoaModal } from '@/components/registros/PessoaModal.tsx'
import { LeadDrawer } from '@/components/leads/LeadDrawer.tsx'
import { fetchLeadNotas, fetchLeads } from '@/services/leadService.ts'
import { fetchPurchases } from '@/services/purchaseService.ts'
import { fetchRegistros } from '@/services/registrosService.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { isAdmin } from '@/lib/roles.ts'
import { exportCsv } from '@/lib/csv.ts'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format.ts'
import { acharPessoa, pessoasDeRegistros } from '@/lib/mergeRegistros.ts'
import {
  DIAS_SEMANA,
  FAIXAS_HORA,
  PERIODOS,
  SITUACAO_ROTULO,
  dataRelativa,
  enriquecerLeads,
  funil,
  noPeriodo,
  notasPorChave,
  perfil,
  periodoAnterior,
  rankingCriativos,
  rankingOrigens,
  resumir,
  serieDiaria,
  variacao,
  whatsappDe,
  type LeadRico,
  type Periodo,
  type SituacaoLead,
} from '@/lib/leadsAnalytics.ts'

const POR_PAGINA = 25
const DIA = 86_400_000

type FiltroSituacao = 'todos' | SituacaoLead
type Ordem = 'recentes' | 'antigos' | 'interesse' | 'nome'

const COLUNAS = [
  { id: 'projeto', rotulo: 'Projeto' },
  { id: 'origem', rotulo: 'Origem / criativo' },
  { id: 'cadastro', rotulo: 'Cadastro' },
  { id: 'interesse', rotulo: 'Interesse' },
  { id: 'status', rotulo: 'Status' },
] as const
type ColunaId = (typeof COLUNAS)[number]['id']

const CHAVE_COLUNAS = 'leads.colunas'

function lerColunas(): ColunaId[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_COLUNAS) ?? 'null')
    if (Array.isArray(salvo)) return COLUNAS.map((c) => c.id).filter((id) => salvo.includes(id))
  } catch {
    /* sem armazenamento: usa todas */
  }
  return COLUNAS.map((c) => c.id)
}

function Delta({ valor, sufixo = '%' }: { valor: number | null; sufixo?: string }) {
  if (valor === null) return <span className="lv-delta lv-flat">sem comparação</span>
  const classe = valor > 0.5 ? 'lv-up' : valor < -0.5 ? 'lv-down' : 'lv-flat'
  const seta = valor > 0.5 ? '▲' : valor < -0.5 ? '▼' : '='
  return (
    <span className={`lv-delta ${classe}`}>
      {seta} {Math.abs(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
      {sufixo}
    </span>
  )
}

/** Card que acompanha o mouse nos gráficos. */
interface DadosCard {
  titulo: string
  sub?: string
  linhas: { k: string; v: string; cor?: string }[]
  nota?: string
}
interface CardAberto extends DadosCard {
  x: number
  y: number
}

function CardFlutuante({ card }: { card: CardAberto | null }) {
  if (!card) return null
  const viradoParaEsquerda = card.x > window.innerWidth - 260
  const viradoParaCima = card.y > window.innerHeight - 220
  return createPortal(
    <div
      className="lv-tip"
      role="tooltip"
      style={{
        left: card.x,
        top: card.y,
        transform: `translate(${viradoParaEsquerda ? 'calc(-100% - 16px)' : '16px'}, ${viradoParaCima ? 'calc(-100% - 12px)' : '12px'})`,
      }}
    >
      <b>{card.titulo}</b>
      {card.sub && <small>{card.sub}</small>}
      {card.linhas.map((l) => (
        <div key={l.k} className="lv-tip-row">
          <span>
            {l.cor && <i className="lv-dot" style={{ background: l.cor }} />}
            {l.k}
          </span>
          <b>{l.v}</b>
        </div>
      ))}
      {card.nota && <em>{card.nota}</em>}
    </div>,
    document.body,
  )
}

function formatDias(dias: number | null): string {
  if (dias === null) return '—'
  if (dias < 1) return `${Math.max(1, Math.round(dias * 24))} h`
  return `${dias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`
}

export default function LeadsPage() {
  const admin = isAdmin(useAuthStore((state) => state.user))
  const [periodo, setPeriodo] = useState<Periodo>('30d')
  const [projeto, setProjeto] = useState('')
  const [campanha, setCampanha] = useState('')
  const [situacao, setSituacao] = useState<FiltroSituacao>('todos')
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [colunas, setColunas] = useState<ColunaId[]>(lerColunas)
  const [colunasAbertas, setColunasAbertas] = useState(false)
  const [abertoIndice, setAbertoIndice] = useState<number | null>(null)
  const [historico, setHistorico] = useState<LeadRico | null>(null)
  const [copiado, setCopiado] = useState('')
  const [card, setCard] = useState<CardAberto | null>(null)

  /** Props de hover que mostram o card ao lado do mouse. */
  const dica = (dados: DadosCard) => ({
    onMouseEnter: (e: MouseEvent) => setCard({ ...dados, x: e.clientX, y: e.clientY }),
    onMouseMove: (e: MouseEvent) => setCard((atual) => (atual ? { ...atual, x: e.clientX, y: e.clientY } : { ...dados, x: e.clientX, y: e.clientY })),
    onMouseLeave: () => setCard(null),
  })

  const leadsQuery = useQuery({ queryKey: ['leads'], queryFn: fetchLeads, retry: false })
  const purchasesQuery = useQuery({ queryKey: ['purchases'], queryFn: fetchPurchases, retry: false })
  // O histórico (Pix gerado, carrinho abandonado) vem das planilhas: se falhar, a tela segue só com leads e compras.
  const registrosQuery = useQuery({ queryKey: ['registros'], queryFn: () => fetchRegistros(), retry: false })
  const notasQuery = useQuery({ queryKey: ['lead-notas'], queryFn: fetchLeadNotas, retry: false })

  const pessoas = useMemo(() => (registrosQuery.data ? pessoasDeRegistros(registrosQuery.data.records) : null), [registrosQuery.data])
  const notas = useMemo(() => notasPorChave(notasQuery.data ?? []), [notasQuery.data])

  const ricos = useMemo(
    () => enriquecerLeads(leadsQuery.data ?? [], purchasesQuery.data ?? [], pessoas),
    [leadsQuery.data, purchasesQuery.data, pessoas],
  )

  const projetos = useMemo(() => [...new Set(ricos.map((l) => l.projeto))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [ricos])

  // Base = filtro de projeto; o período é aplicado em cima dela.
  const base = useMemo(() => (projeto ? ricos.filter((l) => l.projeto === projeto) : ricos), [ricos, projeto])
  const doPeriodo = useMemo(() => noPeriodo(base, periodo), [base, periodo])
  const anterior = useMemo(() => periodoAnterior(base, periodo), [base, periodo])

  const resumo = useMemo(() => resumir(doPeriodo), [doPeriodo])
  const resumoAnterior = useMemo(() => (anterior ? resumir(anterior) : null), [anterior])

  const hojeInicio = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [])
  const novosHoje = base.filter((l) => l.ts >= hojeInicio).length
  const novosOntem = base.filter((l) => l.ts >= hojeInicio - DIA && l.ts < hojeInicio).length

  const diasGrafico = periodo === 'hoje' ? 14 : periodo === '7d' ? 7 : periodo === '30d' ? 30 : 90
  const serie = useMemo(() => serieDiaria(base, diasGrafico), [base, diasGrafico])
  const maxSerie = Math.max(1, ...serie.map((d) => d.total))
  const mediaSerie = serie.reduce((s, d) => s + d.total, 0) / Math.max(1, serie.length)

  const passosFunil = useMemo(() => funil(doPeriodo), [doPeriodo])
  const origens = useMemo(() => rankingOrigens(doPeriodo), [doPeriodo])
  const criativos = useMemo(() => rankingCriativos(doPeriodo).slice(0, 5), [doPeriodo])
  const perfilLeads = useMemo(() => perfil(doPeriodo), [doPeriodo])

  const campanhas = useMemo(
    () => [...new Set(doPeriodo.map((l) => (l.lead.campanha ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [doPeriodo],
  )

  // Lista: período + campanha + busca; as abas de situação mostram quantos há em cada uma.
  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return doPeriodo.filter((l) => {
      if (campanha && (l.lead.campanha ?? '').trim() !== campanha) return false
      if (!termo) return true
      const texto = [l.nome, l.email, l.projeto, l.lead.campanha, l.lead.criativo, l.lead.ad_id, l.uf].filter(Boolean).join(' ').toLowerCase()
      return texto.includes(termo) || (digitos.length >= 4 && l.telefone.replace(/\D/g, '').includes(digitos))
    })
  }, [doPeriodo, campanha, busca])

  const contagem = useMemo(() => {
    const c: Record<FiltroSituacao, number> = { todos: candidatos.length, aluno: 0, quente: 0, novo: 0, lead: 0, frio: 0 }
    for (const l of candidatos) c[l.situacao] += 1
    return c
  }, [candidatos])

  const lista = useMemo(() => {
    const filtrados = situacao === 'todos' ? candidatos : candidatos.filter((l) => l.situacao === situacao)
    const copia = [...filtrados]
    if (ordem === 'antigos') copia.sort((a, b) => a.ts - b.ts)
    else if (ordem === 'interesse') copia.sort((a, b) => b.score - a.score || b.ts - a.ts)
    else if (ordem === 'nome') copia.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    else copia.sort((a, b) => b.ts - a.ts)
    return copia
  }, [candidatos, situacao, ordem])

  useEffect(() => setPagina(0), [periodo, projeto, campanha, situacao, ordem, busca])
  useEffect(() => {
    if (campanha && !campanhas.includes(campanha)) setCampanha('')
  }, [campanha, campanhas])

  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = lista.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)

  function alternarColuna(id: ColunaId) {
    const proximo = colunas.includes(id) ? colunas.filter((c) => c !== id) : COLUNAS.map((c) => c.id).filter((c) => c === id || colunas.includes(c))
    setColunas(proximo)
    try {
      localStorage.setItem(CHAVE_COLUNAS, JSON.stringify(proximo))
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  }

  function copiar(valor: string, rotulo: string) {
    void navigator.clipboard?.writeText(valor).then(() => {
      setCopiado(rotulo)
      window.setTimeout(() => setCopiado(''), 1500)
    })
  }

  function exportar() {
    exportCsv(
      'leads.csv',
      ['Nome', 'Email', 'Telefone', 'UF', 'Projeto', 'Campanha', 'Criativo', 'Cadastro', 'Situação', 'Interesse', 'Compra (R$)', 'Contato', 'Etiquetas', 'Anotação'],
      lista.map((l) => {
        const n = notas.get(l.lead.chave ?? '')
        return [
          l.nome,
          l.email,
          l.telefone,
          l.uf,
          l.projeto,
          l.lead.campanha,
          l.lead.criativo,
          l.ts ? new Date(l.ts).toLocaleString('pt-BR') : '',
          SITUACAO_ROTULO[l.situacao],
          l.score,
          l.comprou ? l.valor : '',
          n?.situacao ?? '',
          n?.tags.join(' | ') ?? '',
          n?.nota ?? '',
        ]
      }),
    )
  }

  const aberto = abertoIndice === null ? null : (ricos.find((l) => l.indice === abertoIndice) ?? null)
  const error = (leadsQuery.error ?? purchasesQuery.error) as Error | undefined
  const isLoading = leadsQuery.isLoading || purchasesQuery.isLoading
  const mostra = (id: ColunaId) => colunas.includes(id)
  const pessoaAberta = aberto && pessoas ? acharPessoa(pessoas, { email: aberto.email, telefone: aberto.telefone }) : null
  const rotuloPeriodoAnterior = PERIODOS.find((p) => p.id === periodo)?.rotulo.toLowerCase()

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Topo de funil</p>
        <Typewriter as="h2" className="section-title mt-1" text="Leads" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Quem chegou, de onde veio, o que respondeu e se já virou aluno — com a hora certa de abordar cada pessoa.
        </p>
        <div className="lv-hero-controls">
          <div className="lv-seg" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p.id} type="button" aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>
                {p.rotulo}
              </button>
            ))}
          </div>
          <div className="lv-seg" role="group" aria-label="Projeto">
            <button type="button" aria-pressed={projeto === ''} onClick={() => setProjeto('')}>
              Todos os projetos
            </button>
            {projetos.map((p) => (
              <button key={p} type="button" aria-pressed={projeto === p} onClick={() => setProjeto(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </PageHero>

      {error && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {error.message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : error.message || 'Não foi possível carregar os leads.'}
        </section>
      )}

      {isLoading && !error && (
        <div className="space-y-6" aria-busy="true" aria-label="Carregando leads">
          <div className="lv-kpis">
            {Array.from({ length: 6 }, (_, i) => (
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
            className="lv-kpis"
            data-tour="Resumo dos leads"
            data-tour-text="Leads do período, novos hoje, quantos viraram aluno, conversão, quanto tempo levam para comprar e os leads quentes (com sinal de compra, sem compra)."
          >
            <div className="kpi-card lv-kpi">
              <p className="section-label">Leads no período</p>
              <b>{formatNumber(resumo.total)}</b>
              <Delta valor={resumoAnterior ? variacao(resumo.total, resumoAnterior.total) : null} />
              {resumoAnterior && <small>vs {rotuloPeriodoAnterior} anteriores</small>}
            </div>
            <div className="kpi-card lv-kpi">
              <p className="section-label">Novos hoje</p>
              <b>{formatNumber(novosHoje)}</b>
              <Delta valor={novosHoje - novosOntem} sufixo=" vs ontem" />
            </div>
            <div className="kpi-card lv-kpi">
              <p className="section-label">Viraram aluno</p>
              <b>{formatNumber(resumo.comprou)}</b>
              <Delta valor={resumoAnterior ? variacao(resumo.comprou, resumoAnterior.comprou) : null} />
              <small>{formatCurrency(resumo.valor)} em vendas</small>
            </div>
            <div className="kpi-card lv-kpi">
              <p className="section-label">Conversão</p>
              <b>{formatPercent(resumo.taxa)}</b>
              <Delta valor={resumoAnterior ? resumo.taxa - resumoAnterior.taxa : null} sufixo=" pp" />
            </div>
            <div className="kpi-card lv-kpi">
              <p className="section-label">Tempo até comprar</p>
              <b>{formatDias(resumo.medianaDias)}</b>
              <small>{resumo.medianaDias === null ? 'sem compras no período' : `mediana · ${resumo.mesmoDia}% no mesmo dia`}</small>
            </div>
            <button
              type="button"
              className="kpi-card lv-kpi lv-kpi-hot"
              onClick={() => {
                setSituacao('quente')
                document.getElementById('lv-lista')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <p className="section-label">Leads quentes</p>
              <b>{formatNumber(resumo.quentes)}</b>
              <small>sem compra · ver lista →</small>
            </button>
          </section>

          <section className="lv-grid2">
            <div className="surface-card lv-pad" data-tour="Cadastros por dia" data-tour-text="Quantos leads entraram por dia. Fim de semana em amarelo; a faixa verde mostra a parte que comprou.">
              <p className="section-label">Captação</p>
              <h3 className="section-title mt-1">Cadastros por dia</h3>
              <div className="lv-bars">
                {serie.map((d) => {
                  const diff = mediaSerie > 0 ? ((d.total - mediaSerie) / mediaSerie) * 100 : 0
                  return (
                    <span
                      key={d.inicio}
                      className="col"
                      {...dica({
                        titulo: new Date(d.inicio).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }),
                        sub: d.fimDeSemana ? 'Fim de semana' : 'Dia útil',
                        linhas: [
                          { k: 'Cadastros', v: formatNumber(d.total), cor: d.fimDeSemana ? 'var(--y)' : 'var(--o)' },
                          { k: 'Compraram', v: formatNumber(d.comprou), cor: 'var(--good)' },
                          { k: 'Conversão no dia', v: d.total ? formatPercent((d.comprou / d.total) * 100) : '—' },
                          { k: 'vs média do período', v: `${diff > 0.5 ? '▲' : diff < -0.5 ? '▼' : '='} ${Math.abs(diff).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%` },
                        ],
                      })}
                    >
                      <i className={`${d.fimDeSemana ? 'fds' : ''} ${d.comprou > 0 ? 'cv' : ''}`} style={{ height: `${(d.total / maxSerie) * 100}%` }} />
                    </span>
                  )
                })}
              </div>
              <div className="lv-axis">
                <span>{new Date(serie[0].inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                <span>últimos {diasGrafico} dias</span>
                <span>{new Date(serie[serie.length - 1].inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
              </div>
              <div className="lv-legend">
                <span>
                  <i className="lv-dot" style={{ background: 'var(--o)' }} />
                  Dia útil
                </span>
                <span>
                  <i className="lv-dot" style={{ background: 'var(--y)' }} />
                  Fim de semana
                </span>
                <span>
                  <i className="lv-dot" style={{ background: 'var(--good)' }} />
                  Teve compra no dia
                </span>
              </div>
            </div>

            <div className="surface-card lv-pad" data-tour="Funil" data-tour-text="Do cadastro até a compra, passando por quem chegou à página de pagamento (Pix, boleto ou carrinho abandonado).">
              <p className="section-label">Funil</p>
              <h3 className="section-title mt-1">Do cadastro à compra</h3>
              {passosFunil.passos.map((passo, i) => (
                <div
                  className="lv-step"
                  key={passo.rotulo}
                  {...dica({
                    titulo: passo.rotulo,
                    sub: i === 0 ? 'Ponto de partida do funil' : `${formatPercent(passo.pct)} de quem cadastrou`,
                    linhas: [
                      { k: 'Pessoas', v: formatNumber(passo.total) },
                      ...(i > 0
                        ? [
                            { k: 'Do passo anterior', v: passosFunil.passos[i - 1].total ? formatPercent((passo.total / passosFunil.passos[i - 1].total) * 100) : '—' },
                            { k: 'Ficaram pelo caminho', v: formatNumber(passosFunil.passos[i - 1].total - passo.total) },
                          ]
                        : []),
                    ],
                  })}
                >
                  <div className="lv-step-row">
                    <span>{passo.rotulo}</span>
                    <span>
                      {formatNumber(passo.total)}
                      {i > 0 && ` · ${formatPercent(passo.pct)}`}
                    </span>
                  </div>
                  <div className="lv-track">
                    <i className={i === 2 ? 'g' : i === 1 ? 't' : ''} style={{ width: `${Math.max(passo.total ? 1.5 : 0, passo.pct)}%` }} />
                  </div>
                </div>
              ))}
              {passosFunil.maiorPerda && <p className="lv-drop">{passosFunil.maiorPerda}</p>}
              {registrosQuery.isError && <p className="lv-sub" style={{ marginTop: '0.5rem' }}>Histórico da Hotmart indisponível agora: o passo de pagamento pode estar incompleto.</p>}
            </div>
          </section>

          <section className="lv-grid3">
            <div className="surface-card lv-pad" data-tour="Por origem" data-tour-text="De onde cada lead veio e quanto de cada origem converteu.">
              <p className="section-label">Por origem</p>
              <h3 className="section-title mt-1">Volume e conversão</h3>
              <ul className="lv-rank">
                {origens.slice(0, 6).map((o, i) => (
                  <li
                    key={o.chave}
                    {...dica({
                      titulo: o.rotulo,
                      sub: `${resumo.total ? formatPercent((o.total / resumo.total) * 100) : '0%'} dos leads do período`,
                      linhas: [
                        { k: 'Leads', v: formatNumber(o.total) },
                        { k: 'Compraram', v: formatNumber(o.comprou), cor: 'var(--good)' },
                        { k: 'Conversão', v: formatPercent(o.taxa) },
                      ],
                    })}
                  >
                    <span className="n">{i + 1}</span>
                    <div>
                      <span className="nome">{o.rotulo}</span>
                      <span className="sub">{formatNumber(o.total)} leads</span>
                    </div>
                    <div className="taxa">
                      {formatPercent(o.taxa)}
                      <small>{formatNumber(o.comprou)} vendas</small>
                    </div>
                  </li>
                ))}
              </ul>
              {!origens.length && <p className="lv-empty">Nenhum lead no período.</p>}
            </div>

            <div className="surface-card lv-pad" data-tour="Criativos" data-tour-text="Anúncios que trazem lead que compra (só criativos com 3 leads ou mais, para a taxa não enganar).">
              <p className="section-label">Anúncios</p>
              <h3 className="section-title mt-1">Melhores criativos</h3>
              <ul className="lv-rank">
                {criativos.map((c, i) => (
                  <li
                    key={c.chave}
                    {...dica({
                      titulo: c.rotulo,
                      sub: c.detalhe || 'sem campanha',
                      linhas: [
                        { k: 'Leads', v: formatNumber(c.total) },
                        { k: 'Compraram', v: formatNumber(c.comprou), cor: 'var(--good)' },
                        { k: 'Conversão', v: formatPercent(c.taxa) },
                      ],
                    })}
                  >
                    <span className="n">{i + 1}</span>
                    <div>
                      <span className="nome">
                        {c.rotulo}
                      </span>
                      <span className="sub">
                        {c.detalhe || 'sem campanha'} · {formatNumber(c.total)} leads
                      </span>
                    </div>
                    <div className="taxa">
                      {formatPercent(c.taxa)}
                      <small>{formatNumber(c.comprou)} vendas</small>
                    </div>
                  </li>
                ))}
              </ul>
              {!criativos.length && <p className="lv-empty">Ainda sem criativo com 3 leads ou mais.</p>}
            </div>

            <div className="surface-card lv-pad" data-tour="Perfil" data-tour-text="Quando os leads se cadastram (dia e faixa de 3 horas, horário de Brasília), de que estado são (pelo DDD) e a idade média.">
              <p className="section-label">Perfil</p>
              <h3 className="section-title mt-1">Quando e onde cadastram</h3>
              <div className="lv-heat">
                <span />
                {FAIXAS_HORA.map((h) => (
                  <span key={h} style={{ textAlign: 'center' }}>
                    {h}
                  </span>
                ))}
                {perfilLeads.calor.map((linha, dia) => (
                  <HeatRow key={DIAS_SEMANA[dia]} dia={dia} valores={linha} contagem={perfilLeads.contagem[dia]} total={perfilLeads.totalComData} dica={dica} />
                ))}
              </div>
              {perfilLeads.melhorMomento && <p className="lv-sub" style={{ marginTop: '0.5rem' }}>Pico: {perfilLeads.melhorMomento}</p>}
              <div className="lv-chips">
                {perfilLeads.estados.slice(0, 5).map((e) => (
                  <span
                    key={e.uf}
                    className="lv-chip"
                    {...dica({
                      titulo: e.uf,
                      sub: 'Estado pelo DDD do telefone',
                      linhas: [
                        { k: 'Cadastros', v: formatNumber(Math.round((e.pct / 100) * (resumo.total - perfilLeads.semEstado))) },
                        { k: '% dos leads com estado', v: formatPercent(e.pct) },
                      ],
                    })}
                  >
                    {e.uf} {Math.round(e.pct)}%
                  </span>
                ))}
                {perfilLeads.estados.length > 5 && <span className="lv-chip">+ {perfilLeads.estados.length - 5} {perfilLeads.estados.length - 5 === 1 ? 'UF' : 'UFs'}</span>}
                {perfilLeads.idadeMedia !== null && <span className="lv-chip">Idade média {perfilLeads.idadeMedia}</span>}
                {resumo.total > 0 && <span className="lv-chip">{Math.round((perfilLeads.comTelefone / resumo.total) * 100)}% com telefone</span>}
              </div>
            </div>
          </section>

          <section className="surface-card lv-filters" id="lv-lista" data-tour="Filtros" data-tour-text="Busque por nome, e-mail, telefone, campanha ou criativo, filtre pela situação e escolha as colunas da tabela.">
            <input
              type="text"
              className="filter-select lv-search"
              placeholder="Buscar nome, e-mail, telefone, campanha, criativo…"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
            <div className="lv-seg" role="group" aria-label="Situação">
              {(['todos', 'quente', 'novo', 'aluno', 'lead', 'frio'] as FiltroSituacao[]).map((s) => (
                <button key={s} type="button" aria-pressed={situacao === s} onClick={() => setSituacao(s)}>
                  {s === 'todos' ? 'Todos' : s === 'quente' ? 'Quentes' : s === 'novo' ? 'Novos' : s === 'aluno' ? 'Alunos' : s === 'lead' ? 'Em andamento' : 'Frios'} {formatNumber(contagem[s])}
                </button>
              ))}
            </div>
            <select className="filter-select" value={campanha} onChange={(event) => setCampanha(event.target.value)} aria-label="Campanha">
              <option value="">Campanha: todas</option>
              {campanhas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select className="filter-select" value={ordem} onChange={(event) => setOrdem(event.target.value as Ordem)} aria-label="Ordenar">
              <option value="recentes">Ordenar: mais recentes</option>
              <option value="antigos">Mais antigos</option>
              <option value="interesse">Maior interesse</option>
              <option value="nome">Nome (A–Z)</option>
            </select>
            <div className="lv-cols">
              <button type="button" className="lv-btn" aria-expanded={colunasAbertas} onClick={() => setColunasAbertas((v) => !v)}>
                <i className="fa-solid fa-table-columns" /> Colunas
              </button>
              {colunasAbertas && (
                <div className="lv-cols-panel">
                  {COLUNAS.map((c) => (
                    <label key={c.id}>
                      <input type="checkbox" checked={mostra(c.id)} onChange={() => alternarColuna(c.id)} />
                      {c.rotulo}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="lv-btn" onClick={exportar} disabled={!lista.length}>
              <i className="fa-solid fa-download" /> CSV
            </button>
          </section>

          <section className="surface-card overflow-hidden" data-tour="Lista de leads" data-tour-text="Clique em uma linha para abrir a gaveta com os dados, as respostas, a linha do tempo e a anotação da equipe.">
            <div className="lv-scroll md:max-h-[640px]">
              <table className="lt">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    {mostra('projeto') && <th>Projeto</th>}
                    {mostra('origem') && <th>Origem / criativo</th>}
                    {mostra('cadastro') && <th>Cadastro</th>}
                    {mostra('interesse') && <th>Interesse</th>}
                    {mostra('status') && <th>Status</th>}
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l) => {
                    const zap = whatsappDe(l.telefone)
                    const n = notas.get(l.lead.chave ?? '')
                    return (
                      <tr key={`${l.lead.chave}-${l.indice}`} aria-selected={abertoIndice === l.indice} onClick={() => setAbertoIndice(l.indice)} title="Abrir detalhes">
                        <td>
                          <div className="lv-who">
                            <div className="lv-av">{(l.nome || l.email || '?').charAt(0).toUpperCase()}</div>
                            <div style={{ minWidth: 0 }}>
                              <b data-sensivel title={l.nome}>
                                {l.nome || '—'}
                              </b>
                              <small data-sensivel>{l.email || l.telefone || '—'}</small>
                            </div>
                          </div>
                        </td>
                        {mostra('projeto') && (
                          <td>
                            <span className="lv-proj">{l.projeto}</span>
                            {l.inscritoEm > 1 && <small>inscrito em {l.inscritoEm}</small>}
                          </td>
                        )}
                        {mostra('origem') && (
                          <td>
                            {l.lead.criativo || l.lead.veio_de || '—'}
                            <small>{l.lead.campanha || ''}</small>
                          </td>
                        )}
                        {mostra('cadastro') && (
                          <td title={l.ts ? new Date(l.ts).toLocaleString('pt-BR') : ''}>
                            {dataRelativa(l.ts)}
                            {l.uf && <small>{l.uf}</small>}
                          </td>
                        )}
                        {mostra('interesse') && (
                          <td>
                            <span className="lv-score" title={`Interesse ${l.score}/100`}>
                              {[1, 2, 3, 4, 5].map((i) => (
                                <i key={i} className={i <= l.estrelas ? 'on' : ''} />
                              ))}
                            </span>
                          </td>
                        )}
                        {mostra('status') && (
                          <td>
                            <span className={`lv-pill ${l.situacao}`}>{SITUACAO_ROTULO[l.situacao]}</span>
                            {l.comprou && (
                              <small>
                                {formatCurrency(l.valor)}
                                {l.produto && ` · ${l.produto}`}
                              </small>
                            )}
                            {!l.comprou && n && n.situacao !== 'novo' && <small>{n.situacao === 'sem_interesse' ? 'sem interesse' : n.situacao}</small>}
                          </td>
                        )}
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="lv-acts">
                            {zap && (
                              <a className="lv-ic" href={`https://wa.me/${zap}`} target="_blank" rel="noreferrer" title="Chamar no WhatsApp">
                                <i className="fa-brands fa-whatsapp" />
                              </a>
                            )}
                            {l.email && (
                              <a className="lv-ic" href={`mailto:${l.email}`} title="Enviar e-mail">
                                <i className="fa-regular fa-envelope" />
                              </a>
                            )}
                            <button type="button" className="lv-ic" title="Copiar contato" onClick={() => copiar(l.email || l.telefone, l.lead.chave ?? '')}>
                              <i className={copiado === l.lead.chave ? 'fa-solid fa-check' : 'fa-regular fa-copy'} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!visiveis.length && (
                    <tr>
                      <td colSpan={7} className="lv-empty">
                        Nenhum lead encontrado com esses filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="lv-pager">
              <span>
                {lista.length
                  ? `Mostrando ${paginaAtual * POR_PAGINA + 1}–${Math.min(lista.length, (paginaAtual + 1) * POR_PAGINA)} de ${formatNumber(lista.length)}`
                  : '0 leads'}
              </span>
              <span style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="lv-btn" disabled={paginaAtual === 0} onClick={() => setPagina(paginaAtual - 1)}>
                  ← Anterior
                </button>
                <button type="button" className="lv-btn pri" disabled={paginaAtual >= totalPaginas - 1} onClick={() => setPagina(paginaAtual + 1)}>
                  Próxima →
                </button>
              </span>
            </div>
          </section>
        </>
      )}

      <CardFlutuante card={card} />
      {aberto && (
        <LeadDrawer
          rico={aberto}
          pessoa={pessoaAberta}
          nota={notas.get(aberto.lead.chave ?? '')}
          podeEditar={admin}
          carregandoHistorico={registrosQuery.isLoading}
          onClose={() => setAbertoIndice(null)}
          onTimeline={() => setHistorico(aberto)}
        />
      )}
      {historico && <PessoaModal nome={historico.nome} email={historico.email} telefone={historico.telefone} onClose={() => setHistorico(null)} />}
    </div>
  )
}

const DIAS_COMPLETOS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

function HeatRow({
  dia,
  valores,
  contagem,
  total,
  dica,
}: {
  dia: number
  valores: number[]
  contagem: number[]
  total: number
  dica: (dados: DadosCard) => object
}) {
  return (
    <>
      <span>{DIAS_SEMANA[dia]}</span>
      {valores.map((v, i) => (
        <b
          key={i}
          {...dica({
            titulo: `${DIAS_COMPLETOS[dia]}, ${FAIXAS_HORA[i]} às ${(i + 1) * 3}h`,
            sub: 'Horário de Brasília',
            linhas: [
              { k: 'Cadastros', v: formatNumber(contagem[i]) },
              { k: '% do total', v: total ? formatPercent((contagem[i] / total) * 100) : '—' },
            ],
            nota: v >= 1 ? 'Pico de cadastros' : undefined,
          })}
          style={{ opacity: 0.1 + v * 0.9 }}
        />
      ))}
    </>
  )
}
