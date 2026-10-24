import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { formatNumber } from '@/lib/format.ts'
import { fetchMonitor, verificarAgora, type AlvoMonitorado, type ProjetoMonitorado, type Situacao } from '@/services/monitorService.ts'

const ROTULO: Record<Situacao, { texto: string; ponto: string; texto_cor: string }> = {
  ok: { texto: 'No ar', ponto: 'bg-emerald-400', texto_cor: 'text-emerald-300' },
  lento: { texto: 'Lento', ponto: 'bg-amber-400', texto_cor: 'text-amber-300' },
  fora: { texto: 'Fora do ar', ponto: 'bg-red-500', texto_cor: 'text-red-300' },
  'sem-dados': { texto: 'Aguardando', ponto: 'bg-zinc-500', texto_cor: 'text-zinc-400' },
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

function quando(iso: string | null) {
  if (!iso) return 'nunca'
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutos < 1) return 'agora há pouco'
  if (minutos < 90) return `há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 48) return `há ${horas} h`
  return `há ${Math.round(horas / 24)} dias`
}

function Cartao({ rotulo, valor, dica, tom }: { rotulo: string; valor: string; dica?: string; tom?: 'ok' | 'alerta' }) {
  const cor = tom === 'alerta' ? 'text-red-300' : tom === 'ok' ? 'text-emerald-300' : 'text-zinc-50'
  return (
    <div className="kpi-card">
      <p className="section-label">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-semibold ${cor}`}>{valor}</p>
      {dica && <p className="mt-0.5 text-[11px] text-zinc-500">{dica}</p>}
    </div>
  )
}

function Selo({ situacao }: { situacao: Situacao }) {
  const { texto, ponto, texto_cor } = ROTULO[situacao]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${texto_cor}`}>
      <span className={`h-2 w-2 rounded-full ${ponto}`} aria-hidden="true" />
      {texto}
    </span>
  )
}

/** Uma barrinha por checagem das últimas 24 h: verde acertou, vermelha falhou. */
function Faixa({ alvo }: { alvo: AlvoMonitorado }) {
  if (!alvo.ultimas.length) return <span className="text-[11px] text-zinc-600">sem histórico</span>
  return (
    <div className="flex h-5 items-end gap-px" aria-label={`Últimas ${alvo.ultimas.length} checagens`}>
      {alvo.ultimas.map((p) => (
        <span key={p.em} title={`${dataHora(p.em)} · ${p.ok ? `${p.ms} ms` : 'falhou'}`} className={`w-1 rounded-sm ${p.ok ? 'h-5 bg-emerald-500/70' : 'h-5 bg-red-500'}`} />
      ))}
    </div>
  )
}

function LinhaDoAlvo({ alvo }: { alvo: AlvoMonitorado }) {
  return (
    <li className="grid gap-x-4 gap-y-1 border-t border-zinc-800/70 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="font-medium text-zinc-100">{alvo.nome}</span>
          <Selo situacao={alvo.situacao} />
        </div>
        <a href={alvo.url} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-zinc-500 hover:text-zinc-300">
          {alvo.url}
        </a>
        {alvo.erro && <p className="mt-0.5 text-[11px] text-red-300">{alvo.erro}</p>}
      </div>
      <div className="text-xs text-zinc-400 sm:text-right">
        <p>
          {alvo.ms !== null ? `${formatNumber(alvo.ms)} ms` : '—'}
          {alvo.status ? ` · HTTP ${alvo.status}` : ''}
        </p>
        <p className="text-[11px] text-zinc-500">
          {alvo.disponibilidade24h !== null ? `${alvo.disponibilidade24h}% em 24 h` : 'sem dados'}
          {alvo.checadoEm ? ` · ${quando(alvo.checadoEm)}` : ''}
        </p>
      </div>
      <div className="sm:justify-self-end">
        <Faixa alvo={alvo} />
      </div>
    </li>
  )
}

function CartaoDoProjeto({ projeto }: { projeto: ProjetoMonitorado }) {
  const fora = projeto.alvos.filter((a) => a.situacao === 'fora').length
  const { captura, leads } = projeto
  return (
    <section className={`surface-card p-4 sm:p-5 ${projeto.situacao === 'fora' ? 'border-red-500/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="section-label">{projeto.id}</p>
          <h3 className="section-title mt-1">{projeto.nome}</h3>
          <p className="mt-1 text-xs text-zinc-500">{projeto.descricao}</p>
        </div>
        <div className="text-right">
          <Selo situacao={projeto.situacao} />
          {fora > 0 && <p className="text-[11px] text-red-300">{fora} de {projeto.alvos.length} fora do ar</p>}
        </div>
      </div>

      <ul className="mt-3">
        {projeto.alvos.map((alvo) => (
          <LinhaDoAlvo key={alvo.nome} alvo={alvo} />
        ))}
      </ul>

      {leads && (
        <div className="mt-3 grid gap-2 rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-3 text-xs sm:grid-cols-4">
          <div>
            <p className="section-label">Cadastros 24 h</p>
            <p className="text-base font-semibold text-zinc-50">{formatNumber(leads.ultimas24h)}</p>
          </div>
          <div>
            <p className="section-label">Cadastros 7 dias</p>
            <p className="text-base font-semibold text-zinc-50">{formatNumber(leads.ultimos7dias)}</p>
          </div>
          <div>
            <p className="section-label">Total</p>
            <p className="text-base font-semibold text-zinc-50">{formatNumber(leads.total)}</p>
          </div>
          <div>
            <p className="section-label">Último cadastro</p>
            <p className="text-base font-semibold text-zinc-50">{leads.ultimoEm ? quando(leads.ultimoEm) : 'nenhum'}</p>
            {leads.ultimoEm && <p className="text-[11px] text-zinc-500">{dataHora(leads.ultimoEm)}</p>}
          </div>
        </div>
      )}

      {captura && (
        <div className="mt-3 rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-3 text-xs text-zinc-400">
          <p className="section-label">Formulário (desde {dataHora(captura.desde)}, quando o dash subiu)</p>
          <p className="mt-1">
            <span className="font-semibold text-emerald-300">{formatNumber(captura.gravados)}</span> gravados ·{' '}
            {formatNumber(captura.duplicados)} repetidos · {formatNumber(captura.invalidos)} recusados por dados inválidos ·{' '}
            {formatNumber(captura.bloqueados)} barrados por excesso de tentativas ·{' '}
            <span className={captura.falhas ? 'font-semibold text-red-300' : ''}>{formatNumber(captura.falhas)} erros ao gravar</span>
          </p>
          {captura.falhas > 0 && captura.ultimaFalhaEm && (
            <p className="mt-1 text-red-300">
              Último erro {quando(captura.ultimaFalhaEm)}
              {captura.ultimoErro ? `: ${captura.ultimoErro}` : ''}
            </p>
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
  const alvos = dados?.projetos.flatMap((p) => p.alvos) ?? []
  const fora = alvos.filter((a) => a.situacao === 'fora').length
  const lentos = alvos.filter((a) => a.situacao === 'lento').length
  const cadastros24h = dados?.projetos.reduce((soma, p) => soma + (p.leads?.ultimas24h ?? 0), 0) ?? 0
  const errosDeCadastro = dados?.projetos.reduce((soma, p) => soma + (p.captura?.falhas ?? 0), 0) ?? 0

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Admin</p>
        <Typewriter as="h2" className="section-title mt-1" text="Monitoramento" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Se os sites estão no ar, quão rápidos estão e se os cadastros estão chegando. O servidor confere a cada 5 minutos e avisa no Telegram quando algo cai ou volta.
        </p>
        <button type="button" onClick={() => verificar.mutate()} disabled={verificar.isPending} className="mt-3 rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-zinc-50 hover:bg-amber-400/10 disabled:opacity-50">
          {verificar.isPending ? 'Conferindo…' : 'Verificar agora'}
        </button>
      </PageHero>

      {erro && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {erro.message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : erro.message}
        </section>
      )}

      {dados && (
        <>
          <section className="kpi-scroll">
            <Cartao rotulo="Fora do ar" valor={formatNumber(fora)} dica={`de ${formatNumber(alvos.length)} endereços`} tom={fora ? 'alerta' : 'ok'} />
            <Cartao rotulo="Lentos" valor={formatNumber(lentos)} dica="acima de 4 s" tom={lentos ? 'alerta' : 'ok'} />
            <Cartao rotulo="Cadastros 24 h" valor={formatNumber(cadastros24h)} dica="nos projetos com formulário" />
            <Cartao rotulo="Erros ao gravar lead" valor={formatNumber(errosDeCadastro)} dica="desde que o dash subiu" tom={errosDeCadastro ? 'alerta' : 'ok'} />
            <Cartao rotulo="Atualizado" valor={quando(dados.geradoEm)} dica={dataHora(dados.geradoEm)} />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            {dados.projetos.map((projeto) => (
              <CartaoDoProjeto key={projeto.id} projeto={projeto} />
            ))}
          </div>
        </>
      )}

      {resumo.isLoading && <p className="text-sm text-zinc-500">Carregando…</p>}
    </div>
  )
}
