import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import {
  fetchAcessoAlunos,
  fetchAcessoEventos,
  fetchAcessoResumo,
  marcarBloqueioFeito,
  marcarReativacaoFeita,
  reprocessarEvento,
  verificarAcessos,
  type AcessoAluno,
  type AcessoEvento,
} from '@/services/acessosService.ts'
import { formatNumber } from '@/lib/format.ts'

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
  bloqueio_pendente: { texto: 'Inativar na plataforma', classe: 'text-red-300' },
  reativar_pendente: { texto: 'Reativar na plataforma', classe: 'text-amber-300' },
  bloqueado: { texto: 'Inativado', classe: 'text-red-300' },
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

function Verificador() {
  const [emailTeste, setEmailTeste] = useState('')
  const verificar = useMutation({ mutationFn: (email: string) => verificarAcessos(email) })
  const resultado = verificar.data
  const icone = { ok: 'fa-circle-check text-emerald-500', erro: 'fa-circle-xmark text-red-500', aviso: 'fa-triangle-exclamation text-amber-500' } as const

  return (
    <section className="surface-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-label">Antes de ligar</p>
          <h3 className="section-title mt-1">Conferir conexões</h3>
          <p className="mt-1 text-xs text-zinc-500">Testa a Brevo e o WhatsApp com as chaves do servidor, sem mexer em nenhum aluno.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={emailTeste}
            onChange={(evento) => setEmailTeste(evento.target.value)}
            placeholder="Seu e-mail (opcional: manda 1 e-mail de teste)"
            className="w-72 max-w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
          />
          <button
            type="button"
            disabled={verificar.isPending}
            onClick={() => verificar.mutate(emailTeste.trim())}
            className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-zinc-50 hover:bg-amber-400/10 disabled:opacity-50"
          >
            <i className="fa-solid fa-plug mr-1.5" />
            {verificar.isPending ? 'Conferindo...' : emailTeste.trim() ? 'Conferir e mandar teste' : 'Conferir conexões'}
          </button>
        </div>
      </div>
      {verificar.isError && <p className="mt-3 text-red-300">{(verificar.error as Error).message}</p>}
      {resultado && (
        <div className="mt-3 space-y-3">
          {[...new Set(resultado.itens.map((item) => item.grupo))].map((grupo) => (
            <div key={grupo}>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{grupo}</p>
              <ul className="mt-1 space-y-1">
                {resultado.itens
                  .filter((item) => item.grupo === grupo)
                  .map((item, indice) => (
                    <li key={indice} className="flex items-baseline gap-2 text-zinc-300">
                      <i className={`fa-solid ${icone[item.nivel]}`} />
                      <span>{item.texto}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <p className={`font-medium ${resultado.falhas ? 'text-red-300' : 'text-emerald-300'}`}>
            {resultado.falhas ? `${resultado.falhas} problema(s) para corrigir antes de ligar.` : 'Tudo certo para ligar.'}
          </p>
        </div>
      )}
    </section>
  )
}

/** Quem precisa de uma ação na mão na plataforma de cursos (enquanto a API dela não inativa nem reativa). */
function AcoesManuais({ alunos }: { alunos: AcessoAluno[] }) {
  const queryClient = useQueryClient()
  const inativar = alunos.filter((aluno) => aluno.status === 'bloqueio_pendente')
  const reativar = alunos.filter((aluno) => aluno.status === 'reativar_pendente')
  const atrasados = alunos.filter((aluno) => aluno.status === 'atrasado')
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ['acessos'] })
  const feito = useMutation({
    mutationFn: ({ id, tipo }: { id: number; tipo: 'inativar' | 'reativar' }) => (tipo === 'inativar' ? marcarBloqueioFeito(id) : marcarReativacaoFeita(id)),
    onSuccess: refrescar,
  })

  if (!inativar.length && !reativar.length && !atrasados.length) return null

  const linha = (aluno: AcessoAluno, tipo: 'inativar' | 'reativar' | null) => {
    const zap = aluno.telefone ? `https://wa.me/${aluno.telefone.replace(/\D/g, '')}` : ''
    return (
      <li key={aluno.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/60 py-2 first:border-t-0">
        <div className="min-w-0">
          <p className="truncate text-zinc-100">{aluno.nome || aluno.email}</p>
          <p className="truncate text-xs text-zinc-500">
            {aluno.email || 'sem e-mail'} · {aluno.curso}
            {aluno.atrasoDesde && <> · atrasado desde {soData(aluno.atrasoDesde)}</>}
            {aluno.status === 'atrasado' && aluno.bloquearEm && <> · vira "inativar" em {soData(aluno.bloquearEm)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {zap && (
            <a href={zap} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600">
              <i className="fa-brands fa-whatsapp mr-1" />
              WhatsApp
            </a>
          )}
          {tipo && (
            <button
              type="button"
              disabled={feito.isPending}
              onClick={() => feito.mutate({ id: aluno.id, tipo })}
              className="rounded-lg border border-amber-500/40 px-3 py-1 text-xs text-zinc-50 hover:bg-amber-400/10 disabled:opacity-50"
            >
              {tipo === 'inativar' ? 'Já inativei' : 'Já reativei'}
            </button>
          )}
        </div>
      </li>
    )
  }

  return (
    <section className="surface-card border-amber-500/30 p-4 text-sm">
      <p className="section-label">Na mão, na plataforma de cursos</p>
      <h3 className="section-title mt-1">O que você precisa fazer agora</h3>
      <p className="mt-1 text-xs text-zinc-500">
        A plataforma ainda não inativa nem reativa por API. Quem atrasa uma parcela do Pix parcelado aparece aqui no 2º dia de atraso;
        marque "Já inativei" depois de inativar lá. Se a pessoa pagar de novo, ela volta aqui para reativar.
      </p>
      {inativar.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold text-red-300">Inativar ({inativar.length})</p>
          <ul>{inativar.map((aluno) => linha(aluno, 'inativar'))}</ul>
        </div>
      )}
      {reativar.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold text-amber-300">Reativar ({reativar.length})</p>
          <ul>{reativar.map((aluno) => linha(aluno, 'reativar'))}</ul>
        </div>
      )}
      {atrasados.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold text-zinc-300">Atrasados, ainda no prazo ({atrasados.length})</p>
          <ul>{atrasados.map((aluno) => linha(aluno, null))}</ul>
        </div>
      )}
    </section>
  )
}

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
  const reativado = useMutation({
    mutationFn: () => marcarReativacaoFeita(aluno.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['acessos'] })
    },
  })
  const status = STATUS_ALUNO[aluno.status] ?? { texto: aluno.status, classe: 'text-zinc-300' }
  return (
    <tr className="border-b border-zinc-900/80">
      <td className="max-w-[240px] truncate px-4 py-2.5 text-zinc-200" title={aluno.email ?? ''}>
        {aluno.nome || aluno.email || '—'}
        <span className="block truncate text-xs text-zinc-500">{aluno.email || 'e-mail ainda não conhecido'}</span>
      </td>
      <td className="px-4 py-2.5 text-zinc-300">{aluno.curso}</td>
      <td className="px-4 py-2.5 text-zinc-400">
        {aluno.origem === 'plataforma'
          ? `Já na plataforma${aluno.plataformaId ? ` · nº ${aluno.plataformaId}` : ''}`
          : [aluno.parcelado ? 'Pix parcelado' : aluno.pagamentoTipo, aluno.diasRegra ? `${aluno.diasRegra} dias` : ''].filter(Boolean).join(' · ') || '—'}
      </td>
      <td className="px-4 py-2.5 text-zinc-300">
        {soData(aluno.liberadoAte)}
        {aluno.parcelado && aluno.pagoAte && <span className="block text-xs text-zinc-500">pago até {soData(aluno.pagoAte)}</span>}
      </td>
      <td className="px-4 py-2.5 text-center text-zinc-400">{aluno.origem === 'plataforma' ? '—' : aluno.parcelasPagas}</td>
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
            Já inativei
          </button>
        )}
        {aluno.status === 'reativar_pendente' && (
          <button
            type="button"
            disabled={reativado.isPending}
            onClick={() => reativado.mutate()}
            className="mt-1 block rounded border border-zinc-700 px-2 py-0.5 text-xs font-normal text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
          >
            Já reativei
          </button>
        )}
      </td>
    </tr>
  )
}

export default function AcessosPage() {
  const [buscaAluno, setBuscaAluno] = useState('')

  const resumo = useQuery({ queryKey: ['acessos', 'resumo'], queryFn: fetchAcessoResumo, retry: false, refetchInterval: 30_000 })
  const alunos = useQuery({ queryKey: ['acessos', 'alunos'], queryFn: fetchAcessoAlunos, retry: false, refetchInterval: 60_000 })
  const dados = resumo.data
  const porEstado = dados?.porEstado ?? {}
  const problemas = (porEstado.falhou ?? 0) + (porEstado.atencao ?? 0) + (porEstado.erro ?? 0)
  // Só busca as falhas quando existem: a lista de eventos não é o foco da tela.
  const falhas = useQuery({
    queryKey: ['acessos', 'eventos', 'problemas'],
    queryFn: () => fetchAcessoEventos('problemas', ''),
    retry: false,
    refetchInterval: 30_000,
    enabled: problemas > 0,
  })

  const alunosFiltrados = (alunos.data ?? []).filter((aluno) => {
    const termo = buscaAluno.trim().toLowerCase()
    if (!termo) return true
    return [aluno.nome, aluno.email, aluno.curso, aluno.telefone].filter(Boolean).some((valor) => String(valor).toLowerCase().includes(termo))
  })
  const erro = resumo.error as Error | undefined
  const faltando = dados?.configuracao.obrigatorias ?? []

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Operação</p>
        <Typewriter as="h2" className="section-title mt-1" text="Acessos" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Seus alunos, até quando o acesso vale e quem precisa de uma ação na plataforma de cursos. A liberação das vendas da Hotmart acontece sozinha; só o que falhar aparece aqui.
        </p>
      </PageHero>

      {erro && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {erro.message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : erro.message}
        </section>
      )}

      {dados && (
        <>
          {(dados.modo !== 'ativo' || faltando.length > 0) && (
            <section className="surface-card border-amber-500/30 p-4 text-sm">
              <p className="text-zinc-300">
                <i className="fa-solid fa-circle-info mr-2 text-zinc-500" />
                Modo: <strong className="text-zinc-100">{MODO_LABEL[dados.modo]}</strong>
              </p>
              {dados.modo === 'desligado' && (
                <p className="mt-1.5 text-xs text-zinc-500">O dash ainda não está recebendo os eventos. Defina ACESSO_MODO=ativo no servidor — veja o DEPLOY.md.</p>
              )}
              {dados.modo === 'teste' && (
                <p className="mt-1.5 text-xs text-zinc-500">Em teste o dash grava e decide, mas não libera curso nem manda e-mail ou WhatsApp.</p>
              )}
              {faltando.length > 0 && (
                <div className="mt-2 text-xs text-amber-200">
                  Falta configurar no servidor:
                  <ul className="mt-1 list-disc pl-5 text-amber-200/80">
                    {faltando.map((item) => (
                      <li key={item.nome}><code>{item.nome}</code> — {item.descricao}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Cartao rotulo="Alunos com acesso" valor={dados.acessosPorStatus.ativo ?? 0} />
            <Cartao rotulo="Parcela atrasada" valor={dados.acessosPorStatus.atrasado ?? 0} tom="amber" dica="ainda no prazo" />
            <Cartao rotulo="Inativar na plataforma" valor={dados.acessosPorStatus.bloqueio_pendente ?? 0} tom="red" dica="faça na mão" />
            <Cartao rotulo="Reativar na plataforma" valor={dados.acessosPorStatus.reativar_pendente ?? 0} tom="amber" dica="pagou de novo" />
            <Cartao rotulo="Vendas com problema" valor={problemas} tom="red" dica="não liberou sozinho" />
          </section>
        </>
      )}

      <AcoesManuais alunos={alunos.data ?? []} />

      {problemas > 0 && (
        <section className="surface-card overflow-hidden border-red-500/30">
          <div className="p-4">
            <p className="section-label">Precisa de você</p>
            <h3 className="section-title mt-1">Vendas que não terminaram de liberar</h3>
            <p className="mt-1 text-xs text-zinc-500">O dash tenta de novo sozinho; se continuar, corrija o motivo e use "Tentar de novo agora".</p>
          </div>
          <div className="max-h-[420px] overflow-auto">
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
                {(falhas.data ?? []).map((evento) => (
                  <EventoLinha key={evento.id} evento={evento} />
                ))}
              </tbody>
            </table>
            {falhas.isError && <p className="p-4 text-center text-sm text-red-300">{(falhas.error as Error).message}</p>}
          </div>
        </section>
      )}

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="section-label">Lista</p>
            <h3 className="section-title mt-1">Alunos</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {alunos.isLoading ? 'Carregando...' : `${alunosFiltrados.length} aluno(s)${buscaAluno.trim() ? ' encontrados' : ''}`}
            </p>
          </div>
          <input
            type="text"
            value={buscaAluno}
            onChange={(evento) => setBuscaAluno(evento.target.value)}
            placeholder="Buscar nome, e-mail ou curso..."
            className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
          />
        </div>

        <div className="max-h-[640px] overflow-auto">
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
              {alunosFiltrados.map((aluno) => (
                <AlunoLinha key={aluno.id} aluno={aluno} />
              ))}
            </tbody>
          </table>
          {alunos.isLoading && <p className="p-6 text-center text-sm text-zinc-500">Carregando os alunos...</p>}
          {alunos.isError && (
            <p className="p-6 text-center text-sm text-red-300">
              Não consegui carregar os alunos: {(alunos.error as Error).message}{' '}
              <button type="button" className="underline" onClick={() => void alunos.refetch()}>
                tentar de novo
              </button>
            </p>
          )}
          {alunos.isSuccess && !alunosFiltrados.length && <p className="p-6 text-center text-sm text-zinc-500">Nenhum aluno encontrado.</p>}
        </div>
      </section>

      <Verificador />
    </div>
  )
}
