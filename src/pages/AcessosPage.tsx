import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import {
  fetchAcessoAlunos,
  fetchAcessoEventos,
  fetchAcessoResumo,
  marcarBloqueioFeito,
  reprocessarEvento,
  type AcessoAluno,
  type AcessoEvento,
} from '@/services/acessosService.ts'
import { formatNumber } from '@/lib/format.ts'

type Aba = 'eventos' | 'alunos'

const MODO_LABEL = { desligado: 'Desligado (o n8n cuida)', teste: 'Teste (só simula)', ativo: 'Ativo' } as const

const ESTADO_LABEL: Record<string, { texto: string; classe: string }> = {
  ok: { texto: 'Feito', classe: 'text-emerald-300' },
  novo: { texto: 'Na fila', classe: 'text-zinc-300' },
  processando: { texto: 'Processando', classe: 'text-zinc-300' },
  erro: { texto: 'Tentando de novo', classe: 'text-amber-300' },
  falhou: { texto: 'Falhou', classe: 'text-red-300' },
  atencao: { texto: 'Precisa de atenção', classe: 'text-red-300' },
  ignorado: { texto: 'Ignorado', classe: 'text-zinc-500' },
}

const STATUS_ALUNO: Record<string, { texto: string; classe: string }> = {
  ativo: { texto: 'Ativo', classe: 'text-emerald-300' },
  atrasado: { texto: 'Parcela atrasada', classe: 'text-amber-300' },
  bloqueio_pendente: { texto: 'Bloquear na mão', classe: 'text-red-300' },
  bloqueado: { texto: 'Bloqueado', classe: 'text-red-300' },
}

const DECISAO_LABEL: Record<string, string> = {
  liberar: 'Compra nova',
  renovar: 'Parcela paga',
  sem_liberacao: 'Sem curso (só aviso)',
  abandono: 'Carrinho abandonado',
  atraso: 'Parcela atrasada',
  atencao: 'Atenção',
}

const ETAPA_LABEL: Record<string, string> = {
  liberar: 'Liberar curso',
  registrar_acesso: 'Registrar acesso',
  email_boas_vindas: 'E-mail com o acesso',
  registrar_venda: 'Registrar venda',
  whatsapp_aluno: 'WhatsApp ao aluno',
  aviso_tuzinho: 'Aviso ao Tuzinho',
  whatsapp_correcao: 'WhatsApp pedindo correção',
  registrar_atraso: 'Registrar atraso',
  registrar_abandono: 'Registrar abandono',
  email_apoio: 'E-mail de apoio',
}

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'
const soData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')

function Cartao({ rotulo, valor, dica, tom }: { rotulo: string; valor: number; dica?: string; tom?: 'red' | 'amber' }) {
  const cor = tom === 'red' && valor > 0 ? 'text-red-300' : tom === 'amber' && valor > 0 ? 'text-amber-200' : 'text-zinc-50'
  return (
    <div className="kpi-card">
      <p className="section-label">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-semibold ${cor}`}>{formatNumber(valor)}</p>
      {dica && <p className="mt-0.5 text-[11px] text-zinc-500">{dica}</p>}
    </div>
  )
}

function EventoLinha({ evento }: { evento: AcessoEvento }) {
  const [aberto, setAberto] = useState(false)
  const queryClient = useQueryClient()
  const reprocessar = useMutation({
    mutationFn: () => reprocessarEvento(evento.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['acessos'] })
    },
  })
  const estado = ESTADO_LABEL[evento.estado] ?? { texto: evento.estado, classe: 'text-zinc-300' }
  const podeReprocessar = ['erro', 'falhou', 'atencao'].includes(evento.estado)

  return (
    <>
      <tr onClick={() => setAberto((valor) => !valor)} className="cursor-pointer border-b border-zinc-900/80 transition-colors hover:bg-amber-400/10">
        <td className="px-4 py-2.5 text-zinc-500">{dataHora(evento.recebidoEm)}</td>
        <td className="max-w-[200px] truncate px-4 py-2.5 text-zinc-200" title={evento.email ?? ''}>
          {evento.nome || evento.email || '—'}
        </td>
        <td className="px-4 py-2.5 text-zinc-300">{evento.curso || '—'}</td>
        <td className="px-4 py-2.5 text-zinc-400">{(evento.decisao && DECISAO_LABEL[evento.decisao]) || evento.evento}</td>
        <td className={`px-4 py-2.5 font-medium ${estado.classe}`}>
          {estado.texto}
          {evento.simulado && <span className="ml-1.5 text-[11px] font-normal text-zinc-500">(simulado)</span>}
        </td>
      </tr>
      {aberto && (
        <tr className="border-b border-zinc-900/80 bg-zinc-950/60">
          <td colSpan={5} className="px-4 py-3 text-xs text-zinc-400">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <p>E-mail: <span className="text-zinc-200">{evento.email || '—'}</span></p>
              <p>Pagamento: <span className="text-zinc-200">{[evento.pagamentoTipo, evento.plano].filter(Boolean).join(' · ') || '—'}</span></p>
              <p>Dias de acesso: <span className="text-zinc-200">{evento.dias ?? '—'}</span></p>
              <p>Tentativas: <span className="text-zinc-200">{evento.tentativas}</span>{evento.proximaTentativa && evento.estado === 'erro' && <> · próxima {dataHora(evento.proximaTentativa)}</>}</p>
            </div>
            <ul className="mt-3 space-y-1">
              {evento.previstos.map((nome) => {
                const etapa = evento.etapas.find((item) => item.nome === nome)
                const icone = !etapa ? 'fa-circle text-zinc-700' : etapa.ok ? 'fa-circle-check text-emerald-400' : 'fa-circle-xmark text-red-400'
                return (
                  <li key={nome} className="flex flex-wrap items-baseline gap-2">
                    <i className={`fa-solid ${icone}`} />
                    <span className="text-zinc-200">{ETAPA_LABEL[nome] ?? nome}</span>
                    {etapa?.pulado && <span className="text-zinc-500">pulado: {etapa.pulado}</span>}
                    {etapa?.erro && <span className="text-red-300">{etapa.erro}</span>}
                    {etapa?.simulado && <span className="text-zinc-500">simulado</span>}
                  </li>
                )
              })}
            </ul>
            {evento.erro && <p className="mt-2 text-red-300">{evento.erro}</p>}
            {podeReprocessar && (
              <button
                type="button"
                disabled={reprocessar.isPending}
                onClick={(clique) => {
                  clique.stopPropagation()
                  reprocessar.mutate()
                }}
                className="mt-3 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
              >
                <i className="fa-solid fa-rotate mr-1.5" />
                {reprocessar.isPending ? 'Enviando...' : 'Tentar de novo agora'}
              </button>
            )}
            {reprocessar.isError && <p className="mt-2 text-red-300">{(reprocessar.error as Error).message}</p>}
          </td>
        </tr>
      )}
    </>
  )
}

function AlunoLinha({ aluno }: { aluno: AcessoAluno }) {
  const queryClient = useQueryClient()
  const feito = useMutation({
    mutationFn: () => marcarBloqueioFeito(aluno.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['acessos'] })
    },
  })
  const status = STATUS_ALUNO[aluno.status] ?? { texto: aluno.status, classe: 'text-zinc-300' }
  return (
    <tr className="border-b border-zinc-900/80">
      <td className="max-w-[220px] truncate px-4 py-2.5 text-zinc-200" title={aluno.email}>
        {aluno.nome || aluno.email}
        <span className="block truncate text-xs text-zinc-500">{aluno.email}</span>
      </td>
      <td className="px-4 py-2.5 text-zinc-300">{aluno.curso}</td>
      <td className="px-4 py-2.5 text-zinc-400">
        {[aluno.pagamentoTipo, aluno.diasRegra ? `${aluno.diasRegra} dias` : ''].filter(Boolean).join(' · ') || '—'}
      </td>
      <td className="px-4 py-2.5 text-zinc-300">{soData(aluno.liberadoAte)}</td>
      <td className="px-4 py-2.5 text-center text-zinc-400">{aluno.parcelasPagas}</td>
      <td className={`px-4 py-2.5 font-medium ${status.classe}`}>
        {status.texto}
        {aluno.status === 'atrasado' && aluno.bloquearEm && <span className="block text-xs font-normal text-zinc-500">bloqueia {soData(aluno.bloquearEm)}</span>}
        {aluno.bloqueioErro && <span className="block text-xs font-normal text-red-300">{aluno.bloqueioErro}</span>}
        {aluno.status === 'bloqueio_pendente' && (
          <button
            type="button"
            disabled={feito.isPending}
            onClick={() => feito.mutate()}
            className="mt-1 block rounded border border-zinc-700 px-2 py-0.5 text-xs font-normal text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
          >
            Já bloqueei
          </button>
        )}
      </td>
    </tr>
  )
}

export default function AcessosPage() {
  const [aba, setAba] = useState<Aba>('eventos')
  const [estado, setEstado] = useState('todos')
  const [busca, setBusca] = useState('')

  const resumo = useQuery({ queryKey: ['acessos', 'resumo'], queryFn: fetchAcessoResumo, retry: false, refetchInterval: 30_000 })
  const eventos = useQuery({ queryKey: ['acessos', 'eventos', estado, busca], queryFn: () => fetchAcessoEventos(estado, busca), retry: false, refetchInterval: 30_000, enabled: aba === 'eventos' })
  const alunos = useQuery({ queryKey: ['acessos', 'alunos'], queryFn: fetchAcessoAlunos, retry: false, refetchInterval: 60_000, enabled: aba === 'alunos' })

  const dados = resumo.data
  const porEstado = dados?.porEstado ?? {}
  const problemas = (porEstado.falhou ?? 0) + (porEstado.atencao ?? 0)
  const erro = resumo.error as Error | undefined
  const faltando = dados?.configuracao.obrigatorias ?? []

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Operação</p>
        <Typewriter as="h2" className="section-title mt-1" text="Acessos" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Quem comprou, se o acesso foi liberado e até quando vale. Cada venda da Hotmart passa por aqui; o que falhar fica na lista para tentar de novo.
        </p>
      </PageHero>

      {erro && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {erro.message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : erro.message}
        </section>
      )}

      {dados && (
        <>
          <section className={`surface-card p-4 text-sm ${dados.modo === 'ativo' ? '' : 'border-amber-500/30'}`}>
            <p className="text-zinc-300">
              <i className="fa-solid fa-circle-info mr-2 text-zinc-500" />
              Modo: <strong className="text-zinc-100">{MODO_LABEL[dados.modo]}</strong>
              {dados.ultimoEventoEm && <span className="text-zinc-500"> · último evento da Hotmart em {dataHora(dados.ultimoEventoEm)}</span>}
            </p>
            {dados.modo === 'desligado' && (
              <p className="mt-1.5 text-xs text-zinc-500">O dash ainda não está recebendo os eventos. Defina ACESSO_MODO=teste (ou ativo) no servidor — veja o DEPLOY.md.</p>
            )}
            {dados.modo === 'teste' && (
              <p className="mt-1.5 text-xs text-zinc-500">Em teste o dash grava e decide, mas não libera curso nem manda e-mail ou WhatsApp. Compare com o que o n8n fez e depois mude para ativo.</p>
            )}
            {faltando.length > 0 && (
              <div className="mt-2 text-xs text-amber-200">
                Falta configurar no servidor para o modo ativo:
                <ul className="mt-1 list-disc pl-5 text-amber-200/80">
                  {faltando.map((item) => (
                    <li key={item.nome}><code>{item.nome}</code> — {item.descricao}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="kpi-scroll">
            <Cartao rotulo="Precisam de você" valor={problemas} tom="red" dica="falhou ou pede atenção" />
            <Cartao rotulo="Tentando de novo" valor={porEstado.erro ?? 0} tom="amber" dica="o dash refaz sozinho" />
            <Cartao rotulo="Na fila" valor={(porEstado.novo ?? 0) + (porEstado.processando ?? 0)} />
            <Cartao rotulo="Feitos" valor={porEstado.ok ?? 0} />
            <Cartao rotulo="Alunos com acesso" valor={dados.acessosPorStatus.ativo ?? 0} />
            <Cartao rotulo="Parcela atrasada" valor={(dados.acessosPorStatus.atrasado ?? 0) + (dados.acessosPorStatus.bloqueio_pendente ?? 0)} tom="amber" dica={`${dados.acessosPorStatus.bloqueado ?? 0} bloqueado(s)`} />
          </section>
        </>
      )}

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex gap-2">
            {(['eventos', 'alunos'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setAba(item)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${aba === item ? 'border-amber-400/70 bg-amber-400/20 font-semibold text-zinc-50' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
              >
                {item === 'eventos' ? 'Eventos da Hotmart' : 'Alunos'}
              </button>
            ))}
          </div>
          {aba === 'eventos' && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={estado} onChange={(evento) => setEstado(evento.target.value)} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
                <option value="todos">Todos</option>
                <option value="atencao">Precisam de atenção</option>
                <option value="falhou">Falharam</option>
                <option value="erro">Tentando de novo</option>
                <option value="ok">Feitos</option>
                <option value="ignorado">Ignorados</option>
              </select>
              <input
                type="text"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Buscar nome, e-mail ou transação..."
                className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              />
            </div>
          )}
        </div>

        <div className="max-h-[560px] overflow-auto">
          {aba === 'eventos' ? (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                  <th className="px-4 py-2 font-medium">Recebido</th>
                  <th className="px-4 py-2 font-medium">Aluno</th>
                  <th className="px-4 py-2 font-medium">Curso</th>
                  <th className="px-4 py-2 font-medium">O que é</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {(eventos.data ?? []).map((evento) => (
                  <EventoLinha key={evento.id} evento={evento} />
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                  <th className="px-4 py-2 font-medium">Aluno</th>
                  <th className="px-4 py-2 font-medium">Curso</th>
                  <th className="px-4 py-2 font-medium">Pagamento</th>
                  <th className="px-4 py-2 font-medium">Acesso até</th>
                  <th className="px-4 py-2 text-center font-medium">Parcelas</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {(alunos.data ?? []).map((aluno) => (
                  <AlunoLinha key={aluno.id} aluno={aluno} />
                ))}
              </tbody>
            </table>
          )}
          {aba === 'eventos' && eventos.isSuccess && !eventos.data.length && <p className="p-6 text-center text-sm text-zinc-500">Nenhum evento por aqui ainda.</p>}
          {aba === 'alunos' && alunos.isSuccess && !alunos.data.length && <p className="p-6 text-center text-sm text-zinc-500">Nenhum aluno registrado ainda — os acessos aparecem conforme as compras forem processadas pelo dash.</p>}
          {(eventos.isError && aba === 'eventos') && <p className="p-6 text-center text-sm text-red-300">{(eventos.error as Error).message}</p>}
          {(alunos.isError && aba === 'alunos') && <p className="p-6 text-center text-sm text-red-300">{(alunos.error as Error).message}</p>}
        </div>
      </section>
    </div>
  )
}
