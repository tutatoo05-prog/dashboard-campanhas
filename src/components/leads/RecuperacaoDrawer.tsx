import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveLeadNota } from '@/services/leadService.ts'
import { formatCurrency } from '@/lib/format.ts'
import { dataRelativa, whatsappDe } from '@/lib/leadsAnalytics.ts'
import type { CasoRecuperacao, MotivoRecuperacao } from '@/services/recuperacaoService.ts'
import type { LeadNota, SituacaoContato } from '@/types'

export const MOTIVO_ROTULO: Record<MotivoRecuperacao, string> = {
  abandono: 'Carrinho abandonado',
  pix_boleto: 'Pix/boleto não pago',
  cancelamento: 'Cancelou / atrasou',
  reembolso: 'Reembolso / chargeback',
}

export const CONTATO_ROTULO: Record<SituacaoContato, string> = {
  novo: 'Ainda não contatado',
  chamado: 'Chamado',
  respondeu: 'Respondeu',
  sem_interesse: 'Sem interesse',
}

function primeiroNome(nome: string): string {
  const n = nome.trim().split(/\s+/)[0] ?? ''
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ''
}

/** Mensagem pronta para abrir a conversa no WhatsApp, de acordo com o motivo. */
export function mensagemDeRecuperacao(caso: CasoRecuperacao): string {
  const oi = primeiroNome(caso.nome) ? `Oi, ${primeiroNome(caso.nome)}! Tudo bem?` : 'Oi! Tudo bem?'
  const produto = caso.produto || 'o curso'
  switch (caso.motivo) {
    case 'abandono':
      return `${oi} Aqui é da equipe da Tuzinho Academy. Vi que você começou a inscrição no ${produto} e não chegou a finalizar. Ficou alguma dúvida ou aconteceu algum problema no pagamento? Posso te ajudar por aqui.`
    case 'pix_boleto':
      return `${oi} Aqui é da equipe da Tuzinho Academy. Vi que você gerou o ${caso.pagamento?.toLowerCase().includes('pix') ? 'Pix' : 'pagamento'} do ${produto}, mas ele ainda não foi confirmado. Quer que eu te mande um novo link pra garantir sua vaga?`
    case 'cancelamento':
      return `${oi} Aqui é da equipe da Tuzinho Academy. Vi que teve um problema com o seu acesso ao ${produto} (cancelamento/pagamento em atraso). Aconteceu alguma coisa? Quero entender e ver como posso te ajudar a continuar.`
    case 'reembolso':
      return `${oi} Aqui é da equipe da Tuzinho Academy. Vi que você pediu o reembolso do ${produto}. Pode me contar o que te fez desistir? Sua resposta ajuda muito a gente a melhorar, e se tiver algo que eu possa resolver, resolvo.`
  }
}

function quando(iso: string): string {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

function humanizar(chave: string): string {
  const texto = chave.replace(/[_-]+/g, ' ').trim()
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

interface Props {
  caso: CasoRecuperacao
  nota: LeadNota | undefined
  onClose: () => void
}

/** Gaveta da pessoa na Recuperação: o caso, o contexto (cadastro, compras, tentativas), a linha do tempo e a anotação. */
export function RecuperacaoDrawer({ caso, nota, onClose }: Props) {
  const queryClient = useQueryClient()
  const [texto, setTexto] = useState(nota?.nota ?? '')
  const [situacao, setSituacao] = useState<SituacaoContato>(nota?.situacao ?? 'novo')
  const [tags, setTags] = useState<string[]>(nota?.tags ?? [])
  const [novaTag, setNovaTag] = useState('')
  const [mensagem, setMensagem] = useState(() => mensagemDeRecuperacao(caso))

  useEffect(() => {
    function aoTeclar(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onClose])

  const salvar = useMutation({
    mutationFn: (dados: { situacao: SituacaoContato }) => saveLeadNota({ chave: caso.chave, nota: texto, situacao: dados.situacao, tags }),
    onSuccess: (salva) => {
      setSituacao(salva.situacao)
      queryClient.setQueryData<LeadNota[]>(['lead-notas'], (atual = []) => [...atual.filter((n) => n.chave !== salva.chave), salva])
    },
  })

  const zap = whatsappDe(caso.telefone)
  const alterado = texto !== (nota?.nota ?? '') || situacao !== (nota?.situacao ?? 'novo') || tags.join('|') !== (nota?.tags ?? []).join('|')
  const respostas = Object.entries(caso.lead?.respostas ?? {}).filter(([, v]) => String(v ?? '').trim() !== '')

  function adicionarTag() {
    const t = novaTag.trim().toLowerCase()
    if (t && !tags.includes(t) && tags.length < 12) setTags([...tags, t])
    setNovaTag('')
  }

  function abrirWhatsApp() {
    window.open(`https://wa.me/${zap}?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener')
    // Abriu a conversa: marca como "chamado" se ainda estava sem contato (a equipe pode trocar depois).
    if (caso.chave && situacao === 'novo') salvar.mutate({ situacao: 'chamado' })
  }

  return (
    <>
      <div className="lv-backdrop" onMouseDown={onClose} />
      <aside className="lv-drawer" role="dialog" aria-label={`Recuperação de ${caso.nome || 'pessoa'}`}>
        <div className="lv-drawer-head">
          <div className="lv-av lg">{(caso.nome || caso.email || '?').charAt(0).toUpperCase()}</div>
          <div>
            <h3 data-sensivel>{caso.nome || 'Sem nome'}</h3>
            <span className={`rc-pill ${caso.estadoCaso === 'recuperado' ? 'ok' : caso.motivo}`}>{caso.rotulo}</span>
          </div>
          <button type="button" className="lv-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="lv-kv">
          <div data-sensivel>
            <span>E-mail</span>
            {caso.email || '—'}
          </div>
          <div data-sensivel>
            <span>WhatsApp</span>
            {caso.telefone || '—'}
          </div>
          <div>
            <span>Produto</span>
            {caso.produto || '—'}
            {caso.oferta ? ` · oferta ${caso.oferta}` : ''}
          </div>
          <div>
            <span>Valor</span>
            {caso.valor != null ? formatCurrency(caso.valor) : '—'}
            {caso.parcelas && caso.parcelas > 1 ? ` · ${caso.parcelas}x` : ''}
          </div>
          <div>
            <span>Quando</span>
            {quando(caso.data)} ({dataRelativa(new Date(caso.data).getTime())})
          </div>
          <div>
            <span>Pagamento</span>
            {caso.pagamento || '—'}
          </div>
          <div>
            <span>Origem da compra</span>
            {[caso.canal, caso.campanha].filter(Boolean).join(' · ') || '—'}
          </div>
          <div>
            <span>Local</span>
            {[caso.cidade, caso.estado].filter(Boolean).join(' / ') || '—'}
          </div>
          <div>
            <span>Tentativas</span>
            {caso.tentativas.carrinhos} carrinho(s) · {caso.tentativas.pixBoletos} Pix/boleto(s)
          </div>
          <div>
            <span>Já comprou</span>
            {caso.jaComprou.length ? `${caso.jaComprou.join(', ')} (${formatCurrency(caso.totalPago)})` : 'Nada ainda'}
          </div>
        </div>

        {caso.outrosAbertos.length > 0 && (
          <>
            <p className="lv-h">Outras pendências dessa pessoa</p>
            <ul className="lv-tl">
              {caso.outrosAbertos.map((o, i) => (
                <li key={i}>
                  {o.rotulo}
                  <small>{[quando(o.data), o.produto].filter(Boolean).join(' · ')}</small>
                </li>
              ))}
            </ul>
          </>
        )}

        {caso.lead && (
          <>
            <p className="lv-h">Cadastro de lead</p>
            <div className="lv-kv" style={{ marginTop: '0.4rem' }}>
              <div>
                <span>Projeto</span>
                {caso.lead.projeto || '—'}
                {caso.lead.cadastros > 1 ? ` (+${caso.lead.cadastros - 1})` : ''}
              </div>
              <div>
                <span>Cadastrou</span>
                {quando(caso.lead.data)}
              </div>
              <div>
                <span>Campanha</span>
                {caso.lead.campanha || '—'}
              </div>
              <div>
                <span>Criativo</span>
                {caso.lead.criativo || '—'}
              </div>
              <div>
                <span>Veio de</span>
                {caso.lead.veioDe || '—'}
              </div>
              <div>
                <span>Página</span>
                {caso.lead.pagina || '—'}
              </div>
              {respostas.map(([k, v]) => (
                <div key={k}>
                  <span>{humanizar(k)}</span>
                  {Array.isArray(v) ? v.join(', ') : String(v)}
                </div>
              ))}
            </div>
          </>
        )}

        <p className="lv-h">Linha do tempo na Hotmart</p>
        <ul className="lv-tl">
          {caso.linhaDoTempo.map((item, i) => (
            <li key={`${item.data}-${i}`}>
              {item.titulo}
              <small>{[quando(item.data), item.produto, item.valor != null ? formatCurrency(item.valor) : '', item.pagamento].filter(Boolean).join(' · ')}</small>
            </li>
          ))}
        </ul>

        {zap && (
          <>
            <p className="lv-h">Mensagem para o WhatsApp</p>
            <div className="lv-nota">
              <textarea value={mensagem} maxLength={1000} onChange={(e) => setMensagem(e.target.value)} />
              <button type="button" className="lv-btn pri" onClick={abrirWhatsApp}>
                <i className="fa-brands fa-whatsapp" /> Abrir conversa com essa mensagem
              </button>
            </div>
          </>
        )}

        <p className="lv-h">Acompanhamento</p>
        <div className="lv-nota">
          <select className="filter-select" value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoContato)}>
            {(Object.keys(CONTATO_ROTULO) as SituacaoContato[]).map((s) => (
              <option key={s} value={s}>
                {CONTATO_ROTULO[s]}
              </option>
            ))}
          </select>
          <textarea value={texto} maxLength={2000} placeholder="Ex.: disse que vai pagar sexta, pediu parcelamento, motivo do reembolso…" onChange={(e) => setTexto(e.target.value)} />
          <div className="lv-tags">
            {tags.map((t) => (
              <button key={t} type="button" className="lv-chip" title="Remover etiqueta" onClick={() => setTags(tags.filter((x) => x !== t))}>
                {t} ✕
              </button>
            ))}
          </div>
          <input
            value={novaTag}
            placeholder="Nova etiqueta (Enter) — ex.: sem dinheiro, voltar mês que vem"
            maxLength={30}
            onChange={(e) => setNovaTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                adicionarTag()
              }
            }}
          />
          {nota?.atualizadoEm && (
            <small className="lv-sub">
              Atualizado {dataRelativa(new Date(nota.atualizadoEm).getTime())}
              {nota.atualizadoPor ? ` por ${nota.atualizadoPor}` : ''}
            </small>
          )}
          {!caso.chave && <p className="lv-error">Essa pessoa não tem e-mail nem telefone: não dá para guardar anotação.</p>}
          {salvar.isError && <p className="lv-error">{(salvar.error as Error).message}</p>}
          <button type="button" className="lv-btn pri" disabled={!caso.chave || !alterado || salvar.isPending} onClick={() => salvar.mutate({ situacao })}>
            {salvar.isPending ? 'Salvando...' : salvar.isSuccess && !alterado ? 'Salvo ✓' : 'Salvar acompanhamento'}
          </button>
        </div>

        <div className="lv-drawer-actions">
          {caso.email && (
            <a className="lv-btn" href={`mailto:${caso.email}`}>
              <i className="fa-regular fa-envelope" /> E-mail
            </a>
          )}
        </div>
      </aside>
    </>
  )
}
