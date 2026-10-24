import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { formatNumber } from '@/lib/format.ts'
import {
  fetchMonitor,
  verificarAgora,
  type AlvoMonitorado,
  type ProjetoMonitorado,
  type ResumoDoMonitor,
  type Situacao,
} from '@/services/monitorService.ts'

type Tom = 'ok' | 'lento' | 'fora' | 'vazio'

const TOM: Record<Tom, { ponto: string; texto: string; pilula: string }> = {
  ok: { ponto: 'bg-emerald-400', texto: 'text-emerald-300', pilula: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  lento: { ponto: 'bg-amber-400', texto: 'text-amber-300', pilula: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
  fora: { ponto: 'bg-red-500', texto: 'text-red-300', pilula: 'bg-red-500/15 text-red-300 ring-red-500/30' },
  vazio: { ponto: 'bg-zinc-500', texto: 'text-zinc-400', pilula: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30' },
}

const tomDe = (situacao: Situacao): Tom => (situacao === 'sem-dados' ? 'vazio' : situacao)

const ROTULO_PROJETO: Record<Tom, string> = { ok: 'No ar', lento: 'Lento', fora: 'Com problema', vazio: 'Aguardando' }

function quando(iso: string | null): string {
  if (!iso) return 'nunca'
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutos < 1) return 'agora'
  if (minutos < 90) return `há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 48) return `há ${horas} h`
  return `há ${Math.round(horas / 24)} dias`
}

const porcento = (valor: number | null) => (valor === null ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

function tomDaDisponibilidade(valor: number | null): Tom {
  if (valor === null) return 'vazio'
  if (valor >= 99) return 'ok'
  if (valor >= 95) return 'lento'
  return 'fora'
}

interface Problema {
  chave: string
  titulo: string
  detalhe: string
}

/** Tudo o que precisa de atenção agora: endereços fora do ar e cadastros que deram erro ao gravar. */
function problemasDe(projetos: ProjetoMonitorado[]): Problema[] {
  const lista: Problema[] = []
  for (const projeto of projetos) {
    for (const alvo of projeto.alvos) {
      if (alvo.situacao === 'fora') {
        lista.push({ chave: `${projeto.id}|${alvo.nome}`, titulo: `${projeto.nome} · ${alvo.nome} fora do ar`, detalhe: `${alvo.erro ?? 'sem resposta'} · ${quando(alvo.checadoEm)}` })
      }
    }
    if (projeto.captura && projeto.captura.falhas > 0) {
      lista.push({
        chave: `${projeto.id}|formulario`,
        titulo: `${projeto.nome} · ${formatNumber(projeto.captura.falhas)} ${projeto.captura.falhas === 1 ? 'cadastro não foi gravado' : 'cadastros não foram gravados'}`,
        detalhe: `último erro ${quando(projeto.captura.ultimaFalhaEm)}${projeto.captura.ultimoErro ? ` · ${projeto.captura.ultimoErro}` : ''}`,
      })
    }
  }
  return lista
}

function statusGeral(dados: ResumoDoMonitor, problemas: Problema[]): { tom: Tom; titulo: string; detalhe: string } {
  const alvos = dados.projetos.flatMap((projeto) => projeto.alvos)
  const comDados = alvos.filter((alvo) => alvo.situacao !== 'sem-dados')
  const noAr = alvos.filter((alvo) => alvo.situacao === 'ok' || alvo.situacao === 'lento').length
  const lentos = alvos.filter((alvo) => alvo.situacao === 'lento').length
  const resumo = `${formatNumber(noAr)} de ${formatNumber(alvos.length)} endereços no ar`
  if (!comDados.length) return { tom: 'vazio', titulo: 'Aguardando a primeira verificação', detalhe: 'Leva até 5 minutos depois que o dash sobe.' }
  if (problemas.length) return { tom: 'fora', titulo: problemas.length === 1 ? '1 problema agora' : `${formatNumber(problemas.length)} problemas agora`, detalhe: resumo }
  if (lentos) return { tom: 'lento', titulo: 'No ar, mas com lentidão', detalhe: `${resumo} · ${formatNumber(lentos)} ${lentos === 1 ? 'lento' : 'lentos'}` }
  return { tom: 'ok', titulo: 'Tudo funcionando', detalhe: resumo }
}

/** Resposta ao longo das últimas checagens: linha para os acertos (altura = tempo) e ponto vermelho para cada falha. */
function Tendencia({ alvo }: { alvo: AlvoMonitorado }) {
  const pontos = alvo.ultimas
  if (pontos.length < 2) return <span className="block h-5 w-20" aria-hidden="true" />
  const largura = 80
  const altura = 20
  const maior = Math.max(...pontos.map((p) => (p.ok ? (p.ms ?? 0) : 0)), 1)
  const x = (i: number) => (i / (pontos.length - 1)) * (largura - 4) + 2
  const y = (ms: number) => altura - 3 - (Math.min(ms, maior) / maior) * (altura - 8)
  const segmentos: string[] = []
  let atual: string[] = []
  pontos.forEach((p, i) => {
    if (p.ok) atual.push(`${x(i).toFixed(1)},${y(p.ms ?? 0).toFixed(1)}`)
    else if (atual.length) {
      segmentos.push(atual.join(' '))
      atual = []
    }
  })
  if (atual.length) segmentos.push(atual.join(' '))
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="h-5 w-20 shrink-0" role="img" aria-label="Tempo de resposta nas últimas 24 horas">
      {segmentos.map((segmento) => (
        <polyline key={segmento} points={segmento} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" className="text-emerald-400/80" />
      ))}
      {pontos.map((p, i) => (p.ok ? null : <circle key={p.em} cx={x(i)} cy={altura - 3} r="2.2" className="fill-red-500" />))}
    </svg>
  )
}

function LinhaDoEndereco({ alvo }: { alvo: AlvoMonitorado }) {
  const tom = tomDe(alvo.situacao)
  const fora = alvo.situacao === 'fora'
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TOM[tom].ponto}`} aria-hidden="true" />
      <a href={alvo.url} target="_blank" rel="noreferrer" title={alvo.url} className="min-w-0 flex-1 truncate text-sm text-zinc-100 hover:underline">
        {alvo.nome}
      </a>
      <span className="hidden sm:block">
        <Tendencia alvo={alvo} />
      </span>
      <span className={`w-16 shrink-0 text-right text-sm tabular-nums ${fora ? 'font-medium text-red-300' : alvo.situacao === 'lento' ? 'text-amber-300' : 'text-zinc-300'}`}>
        {fora ? 'fora' : alvo.ms !== null ? `${formatNumber(alvo.ms)} ms` : '—'}
      </span>
      <span className={`w-14 shrink-0 text-right text-xs tabular-nums ${TOM[tomDaDisponibilidade(alvo.disponibilidade24h)].texto}`} title="Disponibilidade nas últimas 24 horas">
        {porcento(alvo.disponibilidade24h)}
      </span>
    </li>
  )
}

function Numero({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`text-xl font-semibold tabular-nums leading-tight ${destaque ? 'text-zinc-50' : 'text-zinc-100'}`}>{valor}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-500">{rotulo}</p>
    </div>
  )
}

function CartaoDoProjeto({ projeto }: { projeto: ProjetoMonitorado }) {
  const tom = tomDe(projeto.situacao)
  const { leads, captura } = projeto
  return (
    <section className={`surface-card p-4 sm:p-5 ${tom === 'fora' ? 'border-red-500/40' : ''}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="section-title truncate">{projeto.nome}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{projeto.descricao}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${TOM[tom].pilula}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TOM[tom].ponto}`} aria-hidden="true" />
          {ROTULO_PROJETO[tom]}
        </span>
      </header>

      <ul className="mt-3 divide-y divide-zinc-800/60">
        {projeto.alvos.map((alvo) => (
          <LinhaDoEndereco key={alvo.nome} alvo={alvo} />
        ))}
      </ul>

      {leads && (
        <div className="mt-3 border-t border-zinc-800/60 pt-3">
          <p className="section-label">Cadastros</p>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <Numero rotulo="24 horas" valor={formatNumber(leads.ultimas24h)} destaque />
            <Numero rotulo="7 dias" valor={formatNumber(leads.ultimos7dias)} />
            <Numero rotulo="Último" valor={leads.ultimoEm ? quando(leads.ultimoEm) : 'nenhum'} />
          </div>
        </div>
      )}

      {captura && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-950/40 px-3 py-2.5 text-xs">
          <span className="text-zinc-400">Formulário</span>
          {captura.falhas > 0 ? (
            <span className={`rounded-full px-2.5 py-0.5 font-medium ring-1 ${TOM.fora.pilula}`}>{formatNumber(captura.falhas)} com erro ao gravar</span>
          ) : (
            <span className={`rounded-full px-2.5 py-0.5 font-medium ring-1 ${TOM.ok.pilula}`}>gravando normalmente</span>
          )}
        </div>
      )}
    </section>
  )
}

export default function MonitorPage() {
  const queryClient = useQueryClient()
  const resumo = useQuery({ queryKey: ['monitor'], queryFn: fetchMonitor, retry: false, refetchInterval: 60_000, staleTime: 30_000 })
  const verificar = useMutation({ mutationFn: verificarAgora, onSuccess: (dados) => queryClient.setQueryData(['monitor'], dados) })

  const dados = resumo.data
  const erro = (resumo.error ?? verificar.error) as Error | null
  const problemas = dados ? problemasDe(dados.projetos) : []
  const geral = dados ? statusGeral(dados, problemas) : null

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Operação</p>
        <Typewriter as="h2" className="section-title mt-1" text="Monitoramento" />
        {geral && dados && (
          <div className="mt-3 flex items-center gap-3">
            <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${TOM[geral.tom].ponto}`} aria-hidden="true" />
            <div>
              <p className={`text-lg font-semibold leading-tight ${TOM[geral.tom].texto}`}>{geral.titulo}</p>
              <p className="text-xs text-zinc-500">
                {geral.detalhe} · verificado {quando(dados.geradoEm)}
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => verificar.mutate()}
          disabled={verificar.isPending}
          className="mt-4 rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-zinc-50 hover:bg-amber-400/10 disabled:opacity-50"
        >
          {verificar.isPending ? 'Verificando…' : 'Verificar agora'}
        </button>
      </PageHero>

      {erro && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {erro.message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : erro.message}
        </section>
      )}

      {problemas.length > 0 && (
        <section className="surface-card border-red-500/40 p-4 sm:p-5" aria-label="Precisa de atenção">
          <p className="section-label text-red-300">Precisa de atenção</p>
          <ul className="mt-2 space-y-2">
            {problemas.map((problema) => (
              <li key={problema.chave} className="flex items-start gap-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TOM.fora.ponto}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{problema.titulo}</p>
                  <p className="text-xs text-zinc-500">{problema.detalhe}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dados && (
        <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {dados.projetos.map((projeto) => (
            <CartaoDoProjeto key={projeto.id} projeto={projeto} />
          ))}
        </div>
      )}

      {resumo.isLoading && <p className="text-sm text-zinc-500">Carregando…</p>}

      {dados && <p className="text-center text-[11px] text-zinc-600">Verificação automática a cada 5 minutos · aviso no Telegram quando algo cai ou volta</p>}
    </div>
  )
}
