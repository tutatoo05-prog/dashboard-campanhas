import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveLeadNota } from '@/services/leadService.ts'
import { formatCurrency } from '@/lib/format.ts'
import { categoriaDe, type RegistroAgrupado } from '@/lib/mergeRegistros.ts'
import { SITUACAO_ROTULO, dataRelativa, whatsappDe, type LeadRico } from '@/lib/leadsAnalytics.ts'
import type { LeadNota, SituacaoContato } from '@/types'

const SITUACOES_CONTATO: { id: SituacaoContato; rotulo: string }[] = [
  { id: 'novo', rotulo: 'Ainda não contatado' },
  { id: 'chamado', rotulo: 'Chamado' },
  { id: 'respondeu', rotulo: 'Respondeu' },
  { id: 'sem_interesse', rotulo: 'Sem interesse' },
]

const CATEGORIA_TITULO: Record<string, string> = {
  venda: 'Compra aprovada',
  pix_boleto: 'Gerou Pix/boleto',
  abandono: 'Abandonou o carrinho',
  cancelamento: 'Cancelamento ou atraso',
  reembolso: 'Reembolso',
}

interface LeadDrawerProps {
  rico: LeadRico
  pessoa: RegistroAgrupado | null
  nota: LeadNota | undefined
  podeEditar: boolean
  carregandoHistorico: boolean
  onClose: () => void
  onTimeline: () => void
}

function humanizar(chave: string): string {
  const texto = chave.replace(/[_-]+/g, ' ').trim()
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function formatarResposta(valor: unknown): string {
  if (Array.isArray(valor)) return valor.join(', ')
  if (valor && typeof valor === 'object') return JSON.stringify(valor)
  return String(valor ?? '')
}

function quando(ts: number): string {
  return ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

/** Gaveta com tudo sobre um lead: dados, respostas, linha do tempo e a anotação interna da equipe. */
export function LeadDrawer({ rico, pessoa, nota, podeEditar, carregandoHistorico, onClose, onTimeline }: LeadDrawerProps) {
  const queryClient = useQueryClient()
  const { lead } = rico
  const chave = lead.chave ?? ''
  const [texto, setTexto] = useState(nota?.nota ?? '')
  const [situacao, setSituacao] = useState<SituacaoContato>(nota?.situacao ?? 'novo')
  const [tags, setTags] = useState<string[]>(nota?.tags ?? [])
  const [novaTag, setNovaTag] = useState('')

  useEffect(() => {
    function aoTeclar(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onClose])

  const salvar = useMutation({
    mutationFn: () => saveLeadNota({ chave, nota: texto, situacao, tags }),
    onSuccess: (salva) => {
      queryClient.setQueryData<LeadNota[]>(['lead-notas'], (atual = []) => [...atual.filter((n) => n.chave !== salva.chave), salva])
    },
  })

  const linhaDoTempo = useMemo(() => {
    const itens = (pessoa?.historico ?? []).map((p) => {
      const categoria = categoriaDe(p)
      const ts = p.data ? new Date(p.data).getTime() : 0
      const titulo = categoria ? CATEGORIA_TITULO[categoria] : p.tipo === 'lead' ? `Cadastrou (${p.aba || p.planilha})` : p.aba || 'Registro'
      const detalhe = [p.produto, p.valor != null ? formatCurrency(p.valor) : '', p.campanha].filter(Boolean).join(' · ')
      return { ts: Number.isFinite(ts) ? ts : 0, titulo, detalhe, lead: p.tipo === 'lead' }
    })
    if (rico.ts && !itens.some((i) => i.lead && Math.abs(i.ts - rico.ts) < 86_400_000)) {
      itens.push({ ts: rico.ts, titulo: `Cadastrou em ${rico.projeto}`, detalhe: lead.campanha ?? '', lead: true })
    }
    return itens.sort((a, b) => b.ts - a.ts).slice(0, 12)
  }, [pessoa, rico, lead.campanha])

  const respostas = Object.entries(lead.respostas ?? {}).filter(([, v]) => String(v ?? '').trim() !== '')
  const zap = whatsappDe(rico.telefone)
  const alterado = texto !== (nota?.nota ?? '') || situacao !== (nota?.situacao ?? 'novo') || tags.join('|') !== (nota?.tags ?? []).join('|')

  function adicionarTag() {
    const t = novaTag.trim().toLowerCase()
    if (t && !tags.includes(t) && tags.length < 12) setTags([...tags, t])
    setNovaTag('')
  }

  return (
    <>
      <div className="lv-backdrop" onMouseDown={onClose} />
      <aside className="lv-drawer" role="dialog" aria-label={`Detalhes de ${rico.nome || 'lead'}`}>
        <div className="lv-drawer-head">
          <div className="lv-av lg">{(rico.nome || rico.email || '?').charAt(0).toUpperCase()}</div>
          <div>
            <h3 data-sensivel>{rico.nome || 'Sem nome'}</h3>
            <span className={`lv-pill ${rico.situacao}`}>
              {SITUACAO_ROTULO[rico.situacao]} · interesse {rico.score}
            </span>
          </div>
          <button type="button" className="lv-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="lv-kv">
          <div data-sensivel>
            <span>E-mail</span>
            {rico.email || '—'}
          </div>
          <div data-sensivel>
            <span>WhatsApp</span>
            {rico.telefone || '—'}
            {rico.uf ? ` · ${rico.uf}` : ''}
          </div>
          <div>
            <span>Projeto</span>
            {rico.projeto}
          </div>
          <div>
            <span>Cadastro</span>
            {quando(rico.ts)} ({dataRelativa(rico.ts)})
          </div>
          <div>
            <span>Campanha</span>
            {lead.campanha || '—'}
          </div>
          <div>
            <span>Criativo</span>
            {lead.criativo || lead.ad_id || '—'}
          </div>
          <div>
            <span>Veio de</span>
            {[lead.veio_de, lead.midia].filter(Boolean).join(' / ') || '—'}
          </div>
          <div>
            <span>Página</span>
            {lead.landing_url || '—'}
          </div>
          {rico.comprou && (
            <div>
              <span>Compra</span>
              {formatCurrency(rico.valor)} {rico.produto && `· ${rico.produto}`}
            </div>
          )}
          {rico.inscritoEm > 1 && (
            <div>
              <span>Inscrições</span>
              {rico.inscritoEm} projetos
            </div>
          )}
        </div>

        {respostas.length > 0 && (
          <>
            <p className="lv-h">Respostas do formulário</p>
            <div className="lv-kv" style={{ marginTop: '0.4rem' }}>
              {respostas.map(([k, v]) => (
                <div key={k}>
                  <span>{humanizar(k)}</span>
                  {formatarResposta(v)}
                </div>
              ))}
            </div>
          </>
        )}

        <p className="lv-h">Linha do tempo</p>
        <ul className="lv-tl">
          {linhaDoTempo.map((item, i) => (
            <li key={`${item.ts}-${i}`}>
              {item.titulo}
              <small>{[quando(item.ts), item.detalhe].filter(Boolean).join(' · ')}</small>
            </li>
          ))}
          {!pessoa && carregandoHistorico && <li style={{ color: 'var(--muted)' }}>Carregando o histórico completo...</li>}
        </ul>

        <p className="lv-h">Anotação interna</p>
        <div className="lv-nota">
          <select className="filter-select" value={situacao} disabled={!podeEditar} onChange={(e) => setSituacao(e.target.value as SituacaoContato)}>
            {SITUACOES_CONTATO.map((s) => (
              <option key={s.id} value={s.id}>
                {s.rotulo}
              </option>
            ))}
          </select>
          <textarea value={texto} readOnly={!podeEditar} maxLength={2000} placeholder={podeEditar ? 'Ex.: pediu desconto, retornar amanhã de manhã…' : 'Sem anotação.'} onChange={(e) => setTexto(e.target.value)} />
          <div className="lv-tags">
            {tags.map((t) => (
              <button key={t} type="button" className="lv-chip" disabled={!podeEditar} title={podeEditar ? 'Remover etiqueta' : undefined} onClick={() => setTags(tags.filter((x) => x !== t))}>
                {t}
                {podeEditar && ' ✕'}
              </button>
            ))}
          </div>
          {podeEditar && (
            <input
              value={novaTag}
              placeholder="Nova etiqueta (Enter)"
              maxLength={30}
              onChange={(e) => setNovaTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  adicionarTag()
                }
              }}
            />
          )}
          {nota?.atualizadoEm && (
            <small className="lv-sub">
              Atualizado {dataRelativa(new Date(nota.atualizadoEm).getTime())}
              {nota.atualizadoPor ? ` por ${nota.atualizadoPor}` : ''}
            </small>
          )}
          {salvar.isError && <p className="lv-error">{(salvar.error as Error).message}</p>}
          {podeEditar && (
            <button type="button" className="lv-btn pri" disabled={!chave || !alterado || salvar.isPending} onClick={() => salvar.mutate()}>
              {salvar.isPending ? 'Salvando...' : salvar.isSuccess && !alterado ? 'Salvo ✓' : 'Salvar anotação'}
            </button>
          )}
        </div>

        <div className="lv-drawer-actions">
          {zap && (
            <a className="lv-btn pri" href={`https://wa.me/${zap}`} target="_blank" rel="noreferrer">
              <i className="fa-brands fa-whatsapp" /> WhatsApp
            </a>
          )}
          {rico.email && (
            <a className="lv-btn" href={`mailto:${rico.email}`}>
              <i className="fa-regular fa-envelope" /> E-mail
            </a>
          )}
          <button type="button" className="lv-btn" onClick={onTimeline}>
            Histórico completo
          </button>
        </div>
      </aside>
    </>
  )
}
