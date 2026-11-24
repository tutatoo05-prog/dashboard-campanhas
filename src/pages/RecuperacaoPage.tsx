import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { CONTATO_ROTULO, MOTIVO_ROTULO, RecuperacaoDrawer, mensagemDeRecuperacao } from '@/components/leads/RecuperacaoDrawer.tsx'
import { fetchRecuperacao, type CasoRecuperacao, type MotivoRecuperacao } from '@/services/recuperacaoService.ts'
import { fetchLeadNotas } from '@/services/leadService.ts'
import { exportCsv } from '@/lib/csv.ts'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format.ts'
import { dataRelativa, notasPorChave, whatsappDe } from '@/lib/leadsAnalytics.ts'
import type { SituacaoContato } from '@/types'

const POR_PAGINA = 25
const MOTIVOS: MotivoRecuperacao[] = ['abandono', 'pix_boleto', 'cancelamento', 'reembolso']

type Estado = 'aberto' | 'recuperado' | 'todos'
type Ordem = 'recentes' | 'valor' | 'parados'

export default function RecuperacaoPage() {
  const queryClient = useQueryClient()
  const [estado, setEstado] = useState<Estado>('aberto')
  const [motivo, setMotivo] = useState<MotivoRecuperacao | ''>('')
  const [contato, setContato] = useState<SituacaoContato | ''>('')
  const [produto, setProduto] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [copiado, setCopiado] = useState('')

  const dados = useQuery({ queryKey: ['recuperacao'], queryFn: () => fetchRecuperacao() })
  const notasQuery = useQuery({ queryKey: ['lead-notas'], queryFn: fetchLeadNotas })
  const notas = useMemo(() => notasPorChave(notasQuery.data ?? []), [notasQuery.data])
  const casos = dados.data?.casos ?? []
  const resumo = dados.data?.resumo
  const contatoDe = (caso: CasoRecuperacao): SituacaoContato => notas.get(caso.chave)?.situacao ?? 'novo'

  const produtos = useMemo(() => [...new Set(casos.map((c) => c.produto).filter(Boolean))].sort(), [casos])

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtrados = casos.filter((c) => {
      if (estado !== 'todos' && c.estadoCaso !== estado) return false
      if (motivo && c.motivo !== motivo) return false
      if (produto && c.produto !== produto) return false
      if (contato && contatoDe(c) !== contato) return false
      if (termo && ![c.nome, c.email, c.telefone, c.produto, c.campanha, c.lead?.campanha].some((v) => String(v ?? '').toLowerCase().includes(termo))) return false
      return true
    })
    const porOrdem: Record<Ordem, (a: CasoRecuperacao, b: CasoRecuperacao) => number> = {
      recentes: (a, b) => b.data.localeCompare(a.data),
      valor: (a, b) => (b.valor ?? 0) - (a.valor ?? 0),
      parados: (a, b) => b.diasParado - a.diasParado,
    }
    return filtrados.sort(porOrdem[ordem])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casos, estado, motivo, produto, contato, busca, ordem, notas])

  const abertos = casos.filter((c) => c.estadoCaso === 'aberto')
  const semContato = abertos.filter((c) => contatoDe(c) === 'novo').length
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = lista.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)
  const aberto = abertoId ? (casos.find((c) => c.id === abertoId) ?? null) : null

  function filtrar(mudanca: () => void) {
    mudanca()
    setPagina(0)
  }

  function copiar(texto: string, id: string) {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(id)
      setTimeout(() => setCopiado(''), 1500)
    })
  }

  function exportar() {
    exportCsv(
      'recuperacao.csv',
      ['Nome', 'Email', 'Telefone', 'Motivo', 'Situação', 'Produto', 'Valor', 'Pagamento', 'Data', 'Dias parado', 'Já comprou', 'Campanha do lead', 'Contato', 'Etiquetas', 'Anotação'],
      lista.map((c) => {
        const n = notas.get(c.chave)
        return [
          c.nome,
          c.email,
          c.telefone,
          MOTIVO_ROTULO[c.motivo],
          c.rotulo,
          c.produto,
          c.valor ?? '',
          c.pagamento,
          new Date(c.data).toLocaleString('pt-BR'),
          c.diasParado,
          c.jaComprou.join(' | '),
          c.lead?.campanha ?? '',
          CONTATO_ROTULO[contatoDe(c)],
          n?.tags.join(' | ') ?? '',
          n?.nota ?? '',
        ]
      }),
    )
  }

  const erro = dados.error as Error | null

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Pós-venda e resgate</p>
        <Typewriter as="h2" className="section-title mt-1" text="Recuperação" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Quem abandonou o carrinho, gerou Pix/boleto e não pagou, cancelou, atrasou ou pediu reembolso — com o histórico completo e a mensagem pronta pra chamar no WhatsApp.
        </p>
        <div className="lv-hero-controls">
          <button
            type="button"
            className="lv-btn"
            disabled={dados.isFetching}
            onClick={() => fetchRecuperacao(true).then((novo) => queryClient.setQueryData(['recuperacao'], novo))}
          >
            <i className={`fa-solid fa-rotate${dados.isFetching ? ' fa-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </PageHero>

      {erro && (
        <section className="surface-card p-4 text-sm" style={{ color: 'var(--bad)' }}>
          {erro.message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : erro.message}
        </section>
      )}

      {dados.isLoading && (
        <div className="lv-kpis" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="kpi2">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-8 w-24" />
            </div>
          ))}
        </div>
      )}

      {resumo && (
        <>
          <section className="lv-kpis">
            <button type="button" className="kpi2 lv-kpi lv-kpi-hot" onClick={() => filtrar(() => { setEstado('aberto'); setContato('') })}>
              <span className="kpi2-label">Em aberto</span>
              <b>{formatNumber(resumo.abertos)}</b>
              <small>pessoas pra chamar</small>
            </button>
            <div className="kpi2 lv-kpi">
              <span className="kpi2-label">Valor em jogo</span>
              <b>{formatCurrency(resumo.valorAberto)}</b>
              <small>soma dos casos abertos</small>
            </div>
            <button type="button" className="kpi2 lv-kpi" onClick={() => filtrar(() => { setEstado('aberto'); setContato('novo') })}>
              <span className="kpi2-label">Sem contato</span>
              <b>{formatNumber(semContato)}</b>
              <small>abertos ainda não chamados</small>
            </button>
            <div className="kpi2 lv-kpi">
              <span className="kpi2-label">Novos (7 dias)</span>
              <b>{formatNumber(resumo.novos7d)}</b>
              <small>casos da última semana</small>
            </div>
            <button type="button" className="kpi2 lv-kpi" onClick={() => filtrar(() => { setEstado('recuperado'); setContato('') })}>
              <span className="kpi2-label">Recuperados</span>
              <b>{formatNumber(resumo.recuperados)}</b>
              <small>compraram depois</small>
            </button>
            <div className="kpi2 lv-kpi">
              <span className="kpi2-label">Taxa de recuperação</span>
              <b>{formatPercent(resumo.taxaRecuperacao * 100)}</b>
              <small>de todos os casos</small>
            </div>
          </section>

          <section className="lv-grid2">
            <div className="surface-card lv-pad">
              <p className="section-label">Por motivo</p>
              <ul className="lv-rank">
                {MOTIVOS.map((m, i) => {
                  const r = resumo.porMotivo[m]
                  const total = r.abertos + r.recuperados
                  return (
                    <li key={m} onClick={() => filtrar(() => setMotivo(motivo === m ? '' : m))} aria-selected={motivo === m}>
                      <span className="n">{i + 1}</span>
                      <span className="nome">
                        {MOTIVO_ROTULO[m]}
                        <span className="sub">
                          {formatNumber(r.abertos)} em aberto · {formatNumber(r.recuperados)} recuperados
                        </span>
                      </span>
                      <span className="taxa">
                        {formatCurrency(r.valorAberto)}
                        <small>{total ? `${Math.round((r.recuperados / total) * 100)}% recuperado` : 'sem casos'}</small>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="surface-card lv-pad">
              <p className="section-label">Produtos com mais casos abertos</p>
              <ul className="lv-rank">
                {resumo.produtos.map((p, i) => (
                  <li key={p.produto} onClick={() => filtrar(() => setProduto(produto === p.produto ? '' : p.produto))} aria-selected={produto === p.produto}>
                    <span className="n">{i + 1}</span>
                    <span className="nome">{p.produto}</span>
                    <span className="taxa">
                      {formatNumber(p.abertos)}
                      <small>{formatCurrency(p.valor)}</small>
                    </span>
                  </li>
                ))}
                {!resumo.produtos.length && <li className="lv-empty">Nenhum caso aberto. 🎉</li>}
              </ul>
            </div>
          </section>

          <section className="surface-card lv-filters">
            <input type="text" className="filter-select lv-search" placeholder="Buscar nome, e-mail, telefone, produto, campanha…" value={busca} onChange={(e) => filtrar(() => setBusca(e.target.value))} />
            <div className="lv-seg" role="group" aria-label="Situação do caso">
              {(['aberto', 'recuperado', 'todos'] as Estado[]).map((s) => (
                <button key={s} type="button" aria-pressed={estado === s} onClick={() => filtrar(() => setEstado(s))}>
                  {s === 'aberto' ? `Em aberto ${formatNumber(resumo.abertos)}` : s === 'recuperado' ? `Recuperados ${formatNumber(resumo.recuperados)}` : `Todos ${formatNumber(casos.length)}`}
                </button>
              ))}
            </div>
            <select className="filter-select" value={motivo} onChange={(e) => filtrar(() => setMotivo(e.target.value as MotivoRecuperacao | ''))} aria-label="Motivo">
              <option value="">Motivo: todos</option>
              {MOTIVOS.map((m) => (
                <option key={m} value={m}>
                  {MOTIVO_ROTULO[m]}
                </option>
              ))}
            </select>
            <select className="filter-select" value={contato} onChange={(e) => filtrar(() => setContato(e.target.value as SituacaoContato | ''))} aria-label="Contato">
              <option value="">Contato: todos</option>
              {(Object.keys(CONTATO_ROTULO) as SituacaoContato[]).map((s) => (
                <option key={s} value={s}>
                  {CONTATO_ROTULO[s]}
                </option>
              ))}
            </select>
            <select className="filter-select" value={produto} onChange={(e) => filtrar(() => setProduto(e.target.value))} aria-label="Produto">
              <option value="">Produto: todos</option>
              {produtos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select className="filter-select" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
              <option value="recentes">Ordenar: mais recentes</option>
              <option value="valor">Maior valor</option>
              <option value="parados">Parados há mais tempo</option>
            </select>
            <button type="button" className="lv-btn" onClick={exportar} disabled={!lista.length}>
              <i className="fa-solid fa-download" /> CSV
            </button>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="lv-scroll md:max-h-[700px]">
              <table className="lt">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Motivo</th>
                    <th>Produto / valor</th>
                    <th>Quando</th>
                    <th>Contexto</th>
                    <th>Contato</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((c) => {
                    const zap = whatsappDe(c.telefone)
                    const situacaoContato = contatoDe(c)
                    return (
                      <tr key={c.id} aria-selected={abertoId === c.id} onClick={() => setAbertoId(c.id)} title="Abrir detalhes">
                        <td>
                          <div className="lv-who">
                            <div className="lv-av">{(c.nome || c.email || '?').charAt(0).toUpperCase()}</div>
                            <div style={{ minWidth: 0 }}>
                              <b data-sensivel title={c.nome}>
                                {c.nome || '—'}
                              </b>
                              <small data-sensivel>{c.email || c.telefone || '—'}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`rc-pill ${c.estadoCaso === 'recuperado' ? 'ok' : c.motivo}`}>{c.rotulo}</span>
                          {c.outrosAbertos.length > 0 && <small>+{c.outrosAbertos.length} pendência(s)</small>}
                        </td>
                        <td>
                          {c.produto || '—'}
                          <small>
                            {c.valor != null ? formatCurrency(c.valor) : ''}
                            {c.pagamento ? ` · ${c.pagamento}` : ''}
                          </small>
                        </td>
                        <td title={new Date(c.data).toLocaleString('pt-BR')}>
                          {dataRelativa(new Date(c.data).getTime())}
                          {c.estadoCaso === 'aberto' && c.diasParado >= 3 && <small className="rc-parado">parado há {c.diasParado} d</small>}
                        </td>
                        <td>
                          {c.jaComprou.length ? <span className="rc-tag aluno">já é aluno</span> : null}
                          {c.tentativas.carrinhos + c.tentativas.pixBoletos > 1 && <span className="rc-tag">{c.tentativas.carrinhos + c.tentativas.pixBoletos} tentativas</span>}
                          {c.lead && <small>{c.lead.campanha || c.lead.projeto}</small>}
                        </td>
                        <td>
                          <span className={`rc-contato ${situacaoContato}`}>{CONTATO_ROTULO[situacaoContato]}</span>
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="lv-acts">
                            {zap && (
                              <a className="lv-ic" href={`https://wa.me/${zap}?text=${encodeURIComponent(mensagemDeRecuperacao(c))}`} target="_blank" rel="noreferrer" title="Chamar no WhatsApp com a mensagem pronta">
                                <i className="fa-brands fa-whatsapp" />
                              </a>
                            )}
                            {c.email && (
                              <a className="lv-ic" href={`mailto:${c.email}`} title="Enviar e-mail">
                                <i className="fa-regular fa-envelope" />
                              </a>
                            )}
                            <button type="button" className="lv-ic" title="Copiar contato" onClick={() => copiar(c.telefone || c.email, c.id)}>
                              <i className={copiado === c.id ? 'fa-solid fa-check' : 'fa-regular fa-copy'} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!visiveis.length && (
                    <tr>
                      <td colSpan={7} className="lv-empty">
                        Ninguém com esses filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="lv-pager">
              <span>
                {lista.length ? `Mostrando ${paginaAtual * POR_PAGINA + 1}–${Math.min(lista.length, (paginaAtual + 1) * POR_PAGINA)} de ${formatNumber(lista.length)}` : '0 pessoas'}
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

      {aberto && <RecuperacaoDrawer key={aberto.id} caso={aberto} nota={notas.get(aberto.chave)} onClose={() => setAbertoId(null)} />}
    </div>
  )
}
