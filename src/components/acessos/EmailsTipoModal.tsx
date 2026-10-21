import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEmailsDoTipo, type EmailItem, type EmailTipo } from '@/services/acessosService.ts'
import { formatNumber } from '@/lib/format.ts'
import { PessoaModal } from '@/components/registros/PessoaModal.tsx'

const ESTADO: Record<EmailItem['estado'], { texto: string; classe: string }> = {
  enviado: { texto: 'Enviado', classe: 'text-emerald-300' },
  simulado: { texto: 'Simulado', classe: 'text-sky-300' },
  pendente: { texto: 'Agendado', classe: 'text-amber-300' },
  cancelado: { texto: 'Cancelado', classe: 'text-zinc-500' },
  falhou: { texto: 'Falhou', classe: 'text-red-300' },
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

/** Janela que abre ao clicar no cartão de um e-mail: todos os envios daquele tipo e para quem foram. */
export function EmailsTipoModal({ tipo, dias, onClose }: { tipo: EmailTipo; dias: number; onClose: () => void }) {
  const [estado, setEstado] = useState('todos')
  const [busca, setBusca] = useState('')
  const [pessoa, setPessoa] = useState<EmailItem | null>(null)
  const consulta = useQuery({ queryKey: ['acessos', 'emails', 'tipo', tipo.tipo, dias], queryFn: () => fetchEmailsDoTipo(tipo.tipo, dias), retry: false })

  useEffect(() => {
    if (pessoa) return undefined
    function aoTeclar(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', aoTeclar)
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = anterior
    }
  }, [onClose, pessoa])

  const itens = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (consulta.data ?? []).filter((item) => {
      if (estado !== 'todos' && item.estado !== estado) return false
      if (!termo) return true
      return [item.nome, item.email, item.curso].filter(Boolean).some((valor) => String(valor).toLowerCase().includes(termo))
    })
  }, [consulta.data, estado, busca])

  const contagem = useMemo(() => {
    const mapa: Record<string, number> = {}
    for (const item of consulta.data ?? []) mapa[item.estado] = (mapa[item.estado] ?? 0) + 1
    return mapa
  }, [consulta.data])

  return (
    <>
      <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className="dialog sale-dialog" role="dialog" aria-modal="true" aria-labelledby="email-tipo-titulo" style={{ maxWidth: 860 }}>
          <div className="sale-head">
            <div className="min-w-0">
              <p className="section-label">{tipo.grupo} · sai {tipo.quando}</p>
              <h3 id="email-tipo-titulo" className="dialog-title">
                {tipo.rotulo}
              </h3>
              <p className="sale-sub">
                Últimos {dias} dias
                {consulta.data
                  ? ` · ${Object.entries(ESTADO)
                      .filter(([chave]) => contagem[chave])
                      .map(([chave, e]) => `${formatNumber(contagem[chave])} ${e.texto.toLowerCase()}`)
                      .join(' · ') || 'nenhum e-mail'}`
                  : ''}
              </p>
            </div>
            <div className="sale-head-side">
              <button type="button" className="sale-close" onClick={onClose} aria-label="Fechar">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="list-tools" style={{ margin: '4px 0 10px' }}>
            <select value={estado} onChange={(evento) => setEstado(evento.target.value)} className="filter-select" aria-label="Situação">
              <option value="todos">Todas as situações</option>
              {Object.entries(ESTADO).map(([chave, e]) => (
                <option key={chave} value={chave}>
                  {e.texto}
                </option>
              ))}
            </select>
            <input type="text" value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar nome ou e-mail..." className="filter-select" />
          </div>

          {consulta.isLoading && <p className="sale-note">Carregando os e-mails...</p>}
          {consulta.isError && <p className="sale-note text-red-300">Não consegui carregar: {(consulta.error as Error).message}</p>}
          {consulta.data && !itens.length && <p className="sale-note">Nenhum e-mail deste tipo {estado !== 'todos' || busca ? 'com esse filtro' : 'neste período'}.</p>}

          {itens.length > 0 && (
            <div className="overflow-auto" style={{ maxHeight: '52vh' }}>
              <table className="data-table data-table-brief">
                <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="font-medium">Quando</th>
                    <th className="font-medium">Para</th>
                    <th className="font-medium">Curso</th>
                    <th className="font-medium">Situação</th>
                    <th className="font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item) => {
                    const situacao = ESTADO[item.estado]
                    return (
                      <tr key={item.id} className="border-b border-zinc-900/80">
                        <td className="cell-brief text-zinc-500" data-label="Quando">
                          {dataHora(item.quando)}
                          {item.estado === 'pendente' && <span className="block text-[11px]">agendado</span>}
                        </td>
                        <td className="cell-name text-zinc-200" data-label="Para" data-sensivel>
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
                        <td className="cell-more" data-label="">
                          {item.email && (
                            <button type="button" onClick={() => setPessoa(item)} className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:border-zinc-500" title="Ver a linha do tempo desta pessoa">
                              <i className="fa-solid fa-timeline mr-1" />
                              Linha do tempo
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="dialog-actions">
            <button type="button" className="btn-gold" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
      {pessoa && <PessoaModal nome={pessoa.nome} email={pessoa.email} onClose={() => setPessoa(null)} closeLabel="Voltar à lista" />}
    </>
  )
}
