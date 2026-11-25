import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { confirmar } from '@/components/ui/ConfirmDialog.tsx'
import { formatCurrency } from '@/lib/format.ts'
import {
  LojaErro,
  cancelarPedido,
  definirDisponibilidade,
  entreguePedido,
  enviarPedido,
  fetchCatalogo,
  fetchFinanceiro,
  fetchPedido,
  fetchPedidos,
  fetchResumo,
  reembolsarPedido,
  revelarCpf,
  salvarNota,
  separarPedido,
  type PedidoDetalhe,
  type PedidoStatus,
} from '@/services/lojaService.ts'

/* ---------- apoio ---------- */
const reais = (cents?: number | null) => formatCurrency((cents ?? 0) / 100)
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const quando = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const dia = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')

const STATUS: Record<PedidoStatus, { rotulo: string; cor: string }> = {
  pending_payment: { rotulo: 'Aguardando pagamento', cor: 'bg-amber-500/15 text-amber-300' },
  paid: { rotulo: 'Pago · a enviar', cor: 'bg-emerald-500/15 text-emerald-300' },
  preparing: { rotulo: 'Em separação', cor: 'bg-sky-500/15 text-sky-300' },
  shipped: { rotulo: 'Enviado', cor: 'bg-violet-500/15 text-violet-300' },
  delivered: { rotulo: 'Entregue', cor: 'bg-lime-500/15 text-lime-300' },
  cancelled: { rotulo: 'Cancelado', cor: 'bg-red-500/15 text-red-300' },
  refunded: { rotulo: 'Reembolsado', cor: 'bg-pink-500/15 text-pink-300' },
}
const METODO: Record<string, string> = { pix: 'Pix', card: 'Cartão', boleto: 'Boleto' }

function Selo({ status }: { status: PedidoStatus }) {
  const s = STATUS[status]
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cor}`}>● {s.rotulo}</span>
}

function Erro({ erro, onRetry }: { erro: unknown; onRetry?: () => void }) {
  const e = erro instanceof LojaErro ? erro : null
  const naoLigada = e?.code === 'LOJA_NAO_CONFIGURADA'
  return (
    <section className="surface-card border-red-500/30 p-4 text-sm text-red-300" role="alert">
      <p className="font-semibold">{naoLigada ? 'A loja ainda não está ligada ao dash.' : 'Não foi possível carregar.'}</p>
      <p className="mt-1 text-red-300/80">{erro instanceof Error ? erro.message : 'Erro desconhecido.'}</p>
      {naoLigada && <p className="mt-2 text-zinc-400">No servidor do dash, cadastre <b>LOJA_API_URL</b> e <b>LOJA_ADMIN_KEY</b> (a mesma chave da Vercel) e reinicie.</p>}
      {onRetry && <button type="button" className="chip-btn mt-3" onClick={onRetry}>Tentar de novo</button>}
    </section>
  )
}

function Kpi({ label, valor, dica, destaque }: { label: string; valor: string; dica?: ReactNode; destaque?: boolean }) {
  return (
    <div className={`kpi2 ${destaque ? 'border-amber-400/50' : ''}`}>
      <p className="kpi2-label">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${destaque ? 'text-amber-300' : 'text-zinc-50'}`}>{valor}</p>
      {dica && <p className="mt-0.5 text-xs text-zinc-500">{dica}</p>}
    </div>
  )
}

const TH = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500'
const TD = 'px-3 py-2.5 text-sm text-zinc-200'

/* ---------- Visão geral ---------- */
function Geral({ onAbrir }: { onAbrir: (n: string) => void }) {
  const q = useQuery({ queryKey: ['loja', 'resumo'], queryFn: fetchResumo, refetchInterval: 60_000 })
  if (q.isError) return <Erro erro={q.error} onRetry={() => q.refetch()} />
  if (!q.data) return <p className="py-10 text-center text-sm text-zinc-500">Carregando a loja…</p>
  const d = q.data
  const max = Math.max(1, ...d.perDay.map((x) => x.cents))
  return (
    <div className="space-y-6">
      <section className="kpi-scroll">
        <Kpi destaque label="Receita · 7 dias" valor={reais(d.revenue7)} dica={d.growth == null ? 'sem semana anterior para comparar' : `${d.growth >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d.growth * 100))}% vs. semana anterior`} />
        <Kpi label="Pedidos pagos" valor={String(d.paid7)} dica={`${d.awaitingPayment} aguardando pagamento`} />
        <Kpi label="Ticket médio" valor={reais(d.avgTicket)} dica="frete incluso" />
        <Kpi label="A enviar" valor={String(d.toShip)} dica={d.lateToShip ? `${d.lateToShip} há mais de 24h` : 'nenhum atrasado'} />
        <Kpi label="Margem sobre custo" valor={pct(d.margin)} dica="itens com custo cadastrado" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="surface-card p-4">
          <p className="section-label">Receita por dia</p>
          <div className="mt-3 flex h-44 items-end gap-2" role="img" aria-label="Receita dos últimos 7 dias">
            {d.perDay.map((x) => (
              <div key={x.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1 text-[11px] text-zinc-500">
                <b className="text-zinc-300">{x.cents ? reais(x.cents).replace('R$ ', '').replace(',00', '') : ''}</b>
                <span className="w-full rounded-t-md bg-gradient-to-t from-amber-600 to-amber-300" style={{ height: `${Math.max(3, Math.round((x.cents / max) * 100))}%` }} />
                {dia(x.day)}
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card p-4">
          <p className="section-label">Atenção agora</p>
          <div className="mt-3 space-y-2">
            {d.late.length === 0 && d.awaitingPayment === 0 && <p className="text-sm text-zinc-500">Tudo em dia.</p>}
            {d.late.map((l) => (
              <button key={l.number} type="button" onClick={() => onAbrir(l.number)} className="flex w-full items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-left text-sm text-red-200">
                <span><b>{l.number}</b> pago há {l.hours}h sem envio</span><span className="text-xs">Abrir ›</span>
              </button>
            ))}
            {d.awaitingPayment > 0 && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{d.awaitingPayment} pedido(s) aguardando pagamento (Pix expira em 30 min, boleto em 3 dias).</p>}
          </div>
        </section>
      </div>

      <section className="surface-card p-4">
        <p className="section-label">A enviar agora</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead><tr><th className={TH}>Pedido</th><th className={TH}>Cliente</th><th className={TH}>Itens</th><th className={TH}>Frete</th><th className={TH}>Pago há</th><th /></tr></thead>
            <tbody>
              {d.queue.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-zinc-500">Nada para enviar agora.</td></tr>}
              {d.queue.map((o) => (
                <tr key={o.number} className="cursor-pointer border-t border-[var(--line)] hover:bg-black/5" onClick={() => onAbrir(o.number)}>
                  <td className={`${TD} font-semibold`}>{o.number}</td>
                  <td className={TD}>{o.name}</td>
                  <td className={`${TD} text-zinc-400`}>{o.items.map((i) => `${i.qty}× ${i.name.split(' · ')[0]}`).join(', ')}</td>
                  <td className={TD}>{String(o.shipping_label ?? '').split(' (')[0] || '—'}</td>
                  <td className={`${TD} ${o.hours >= 24 ? 'text-red-300' : ''}`}>{o.hours}h</td>
                  <td className={`${TD} text-right`}><span className="btn-gold !px-3 !py-1 text-xs">Registrar envio</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

/* ---------- Pedidos ---------- */
const FILTROS: [string, string][] = [['all', 'Todos'], ['pending_payment', 'Aguardando pgto'], ['paid', 'A enviar'], ['preparing', 'Em separação'], ['shipped', 'Enviados'], ['delivered', 'Entregues'], ['cancelled', 'Cancelados'], ['refunded', 'Reembolsados']]

function Pedidos({ onAbrir }: { onAbrir: (n: string) => void }) {
  const [status, setStatus] = useState('all')
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  useEffect(() => { const t = setTimeout(() => setBusca(texto.trim()), 350); return () => clearTimeout(t) }, [texto])
  const q = useQuery({ queryKey: ['loja', 'pedidos', status, busca], queryFn: () => fetchPedidos(status, busca), staleTime: 15_000 })
  return (
    <section className="surface-card space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map(([id, rotulo]) => (
          <button key={id} type="button" className="chip-btn" aria-pressed={status === id} onClick={() => setStatus(id)}>
            {rotulo}<span className="ml-1.5 opacity-60">{q.data?.count[id] ?? 0}</span>
          </button>
        ))}
        <input className="ml-auto min-w-[240px] rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm" placeholder="Número, nome, e-mail ou CPF" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar pedido" />
      </div>
      {q.isError ? <Erro erro={q.error} onRetry={() => q.refetch()} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead><tr><th className={TH}>Pedido</th><th className={TH}>Data</th><th className={TH}>Cliente</th><th className={TH}>Pagamento</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Total</th></tr></thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={6} className="py-8 text-center text-sm text-zinc-500">Carregando…</td></tr>}
              {q.data?.orders.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-zinc-500">Nenhum pedido encontrado.</td></tr>}
              {q.data?.orders.map((o) => (
                <tr key={o.number} className="cursor-pointer border-t border-[var(--line)] hover:bg-black/5" onClick={() => onAbrir(o.number)}>
                  <td className={`${TD} font-semibold`}>{o.number}</td>
                  <td className={`${TD} text-zinc-400`}>{quando(o.created_at)}</td>
                  <td className={TD}>{o.name}<div className="text-xs text-zinc-500">{o.email}</div></td>
                  <td className={TD}>{o.method ? METODO[o.method] : '—'}</td>
                  <td className={TD}><Selo status={o.status} /></td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>{reais(o.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/* ---------- Detalhe do pedido (painel lateral) ---------- */
function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-3.5"><h3 className="section-label mb-2">{titulo}</h3>{children}</section>
}

const ETAPAS = ['Pedido criado', 'Pagamento confirmado', 'Separação e embalagem', 'Enviado', 'Entregue']
function Linha({ p }: { p: PedidoDetalhe }) {
  const idx = ({ pending_payment: 0, paid: 2, preparing: 2, shipped: 3, delivered: 5, cancelled: -1, refunded: -1 } as Record<string, number>)[p.status]
  if (idx < 0) return <p className="text-sm text-zinc-400">{p.status === 'refunded' ? 'Pedido reembolsado. O estoque voltou.' : 'Pedido cancelado. O estoque voltou.'}</p>
  return (
    <ol className="space-y-2">
      {ETAPAS.map((e, i) => (
        <li key={e} className={`flex items-center gap-3 text-sm ${i > idx ? 'text-zinc-500' : 'text-zinc-100'}`}>
          <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${i < idx ? 'bg-emerald-500 text-black' : i === idx ? 'bg-amber-400 text-black' : 'border border-white/20'}`}>{i < idx ? '✓' : i + 1}</span>
          {e}
        </li>
      ))}
    </ol>
  )
}

function PedidoPainel({ numero, onFechar }: { numero: string; onFechar: () => void }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['loja', 'pedido', numero], queryFn: () => fetchPedido(numero) })
  const [codigo, setCodigo] = useState('')
  const [nota, setNota] = useState<string | null>(null)
  const [cpf, setCpf] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const refresh = () => { qc.invalidateQueries({ queryKey: ['loja'] }) }
  const agir = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: (r) => {
      const email = (r as { email?: string } | undefined)?.email
      setAviso({ tipo: 'ok', texto: email === 'falhou' ? 'Envio registrado, mas o e-mail ao cliente falhou. Avise pelo WhatsApp.' : email === 'enviado' ? 'Envio registrado e e-mail com o rastreio enviado ao cliente.' : 'Feito.' })
      setCodigo('')
      refresh()
    },
    onError: (e) => setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não deu certo.' }),
  })

  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onFechar(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onFechar])

  const p = q.data
  const podeEnviar = p && (p.status === 'paid' || p.status === 'preparing')
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onFechar} aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[620px] overflow-y-auto border-l-2 border-[var(--line)] bg-[var(--card)] p-5" role="dialog" aria-label={`Pedido ${numero}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><p className="section-label">Pedido</p><h2 className="text-3xl font-semibold">{numero}</h2>{p && <div className="mt-1"><Selo status={p.status} /></div>}</div>
          <button type="button" className="chip-btn" onClick={onFechar}>✕ Fechar</button>
        </div>
        {q.isError && <Erro erro={q.error} onRetry={() => q.refetch()} />}
        {!p && !q.isError && <p className="text-sm text-zinc-500">Carregando…</p>}
        {aviso && <p role="status" className={`mb-3 rounded-lg border px-3 py-2 text-sm ${aviso.tipo === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>{aviso.texto}</p>}
        {p && (
          <div className="space-y-3">
            <Bloco titulo="Acompanhamento"><Linha p={p} /></Bloco>

            {podeEnviar && (
              <Bloco titulo="Registrar envio">
                <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); agir.mutate(() => enviarPedido(p.number, codigo)) }}>
                  <input className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm uppercase" placeholder="Código de rastreio (AA123456789BR)" maxLength={16} value={codigo} onChange={(e) => setCodigo(e.target.value)} aria-label="Código de rastreio" />
                  <button type="submit" className="btn-gold" disabled={agir.isPending || !codigo.trim()}>{agir.isPending ? 'Enviando…' : 'Marcar como enviado'}</button>
                </form>
                <p className="mt-2 text-xs text-zinc-500">O pedido vira “Enviado”, o cliente recebe o e-mail com o botão Rastrear e o link aparece na página dele.</p>
                {p.status === 'paid' && <button type="button" className="chip-btn mt-2" onClick={() => agir.mutate(() => separarPedido(p.number))}>Marcar “em separação”</button>}
              </Bloco>
            )}

            {p.shipment?.tracking_code && (
              <Bloco titulo="Rastreio">
                <p className="text-sm">Código <b>{p.shipment.tracking_code}</b> · {p.shipment.carrier ?? 'Correios'}{p.shipment.service ? ` ${p.shipment.service}` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.shipment.tracking_url && <a className="chip-btn" href={p.shipment.tracking_url} target="_blank" rel="noopener noreferrer">Abrir rastreio ↗</a>}
                  {p.status === 'shipped' && <button type="button" className="chip-btn" onClick={() => agir.mutate(() => entreguePedido(p.number))}>Marcar como entregue</button>}
                </div>
              </Bloco>
            )}

            <Bloco titulo="Itens">
              <table className="w-full text-sm"><tbody>
                {p.items.map((i) => <tr key={i.sku}><td className="py-1 pr-2">{i.name}<div className="text-xs text-zinc-500">{i.qty} × {reais(i.unit_price_cents)}{i.cost_cents != null ? ` · custo ${reais(i.cost_cents)}` : ''}</div></td><td className="py-1 text-right tabular-nums">{reais(i.qty * i.unit_price_cents)}</td></tr>)}
                <tr><td className="pt-2 text-zinc-400">Frete ({String(p.shipping_label ?? '—')})</td><td className="pt-2 text-right tabular-nums">{reais(p.shipping_cents)}</td></tr>
                <tr><td className="pt-1 font-semibold">Total</td><td className="pt-1 text-right font-semibold tabular-nums">{reais(p.total_cents)}</td></tr>
              </tbody></table>
            </Bloco>

            <Bloco titulo="Cliente e entrega">
              <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-zinc-500">Nome</dt><dd>{p.name}</dd>
                <dt className="text-zinc-500">E-mail</dt><dd className="break-all">{p.email}</dd>
                <dt className="text-zinc-500">WhatsApp</dt><dd>{p.phone ?? '—'}</dd>
                <dt className="text-zinc-500">CPF</dt>
                <dd>{cpf ?? p.cpf_masked}{!cpf && <button type="button" className="chip-btn ml-2 !py-0.5 text-xs" onClick={async () => { const r = await revelarCpf(p.number).catch(() => null); if (r) setCpf(r.cpf) }}>Mostrar (fica no registro)</button>}</dd>
                <dt className="text-zinc-500">Endereço</dt>
                <dd>{p.address ? `${p.address.street}, ${p.address.number}${p.address.complement ? ` · ${p.address.complement}` : ''} · ${p.address.district} · ${p.address.city}/${p.address.state} · CEP ${p.address.zip}` : 'Item digital: sem entrega'}</dd>
              </dl>
            </Bloco>

            <Bloco titulo="Pagamento">
              {p.payments.map((x, i) => <p key={i} className="text-sm">{METODO[x.method] ?? x.method} · {x.status === 'approved' ? 'aprovado' : x.status === 'refunded' ? 'reembolsado' : x.status === 'expired' ? 'expirado' : x.status} · {reais(x.amount_cents)}{x.ref ? ` · Stripe ${x.ref}` : ''}</p>)}
              {p.cost_cents != null && <p className="mt-1 text-xs text-zinc-500">Custo dos itens {reais(p.cost_cents)} · margem dos itens {reais(p.subtotal_cents - p.cost_cents)}</p>}
            </Bloco>

            <Bloco titulo="Ações">
              <div className="flex flex-wrap gap-2">
                <a className="chip-btn" href={`https://wa.me/55${(p.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Sobre o pedido ${p.number}…`)}`} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>
                <a className="chip-btn" href={p.order_url} target="_blank" rel="noopener noreferrer">Ver como o cliente ↗</a>
                {p.status === 'pending_payment' && <button type="button" className="btn-danger" onClick={async () => { if (await confirmar({ titulo: `Cancelar o pedido ${p.number}?`, texto: 'O estoque reservado volta. O cliente poderá fazer outro pedido.', confirmar: 'Cancelar pedido', perigo: true })) agir.mutate(() => cancelarPedido(p.number)) }}>Cancelar pedido</button>}
                {(p.status === 'paid' || p.status === 'preparing') && <button type="button" className="btn-danger" onClick={async () => { if (await confirmar({ titulo: `Reembolsar ${reais(p.total_cents)}?`, texto: 'O valor total volta ao cliente pelo mesmo meio de pagamento (Stripe) e o estoque volta. Não dá para desfazer.', confirmar: 'Reembolsar', perigo: true })) agir.mutate(() => reembolsarPedido(p.number)) }}>Reembolsar</button>}
              </div>
            </Bloco>

            <Bloco titulo="Nota interna">
              <textarea className="w-full rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm" rows={2} maxLength={500} placeholder="Só a equipe vê" value={nota ?? p.note} onChange={(e) => setNota(e.target.value)} aria-label="Nota interna" />
              {nota !== null && nota !== p.note && <button type="button" className="chip-btn mt-2" onClick={() => agir.mutate(() => salvarNota(p.number, nota))}>Salvar nota</button>}
            </Bloco>
          </div>
        )}
      </aside>
    </>
  )
}

/* ---------- Catálogo ---------- */
function Catalogo() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['loja', 'catalogo'], queryFn: fetchCatalogo })
  const [filtro, setFiltro] = useState('')
  const alternar = useMutation({ mutationFn: ({ sku, active }: { sku: string; active: boolean }) => definirDisponibilidade(sku, active), onSuccess: () => qc.invalidateQueries({ queryKey: ['loja', 'catalogo'] }) })
  if (q.isError) return <Erro erro={q.error} onRetry={() => q.refetch()} />
  const itens = (q.data?.items ?? []).filter((i) => !filtro || `${i.name} ${i.sku}`.toLowerCase().includes(filtro.toLowerCase()))
  return (
    <section className="surface-card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className="min-w-[240px] rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm" placeholder="Buscar produto ou SKU" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Buscar produto" />
        <span className="text-xs text-zinc-500">Custo e margem só aparecem aqui, nunca no site. O interruptor tira o item da venda (indisponível no fornecedor).</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead><tr><th className={TH}>Produto</th><th className={TH}>SKU</th><th className={`${TH} text-right`}>Custo</th><th className={`${TH} text-right`}>Preço</th><th className={`${TH} text-right`}>Margem</th><th className={TH}>Anvisa</th><th className={TH}>À venda</th></tr></thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={7} className="py-8 text-center text-sm text-zinc-500">Carregando…</td></tr>}
            {itens.map((i) => (
              <tr key={i.sku} className="border-t border-[var(--line)]">
                <td className={TD}>{i.name}{i.label && <span className="text-zinc-500"> · {i.label}</span>}{!i.product_active && <span className="ml-2 rounded bg-white/10 px-1.5 text-[10px] uppercase text-zinc-400">produto oculto</span>}</td>
                <td className={`${TD} text-xs text-zinc-500`}>{i.sku}</td>
                <td className={`${TD} text-right tabular-nums text-zinc-400`}>{i.cost_cents == null ? '—' : reais(i.cost_cents)}</td>
                <td className={`${TD} text-right font-semibold tabular-nums`}>{i.price_cents == null ? 'a definir' : reais(i.price_cents)}</td>
                <td className={`${TD} text-right font-semibold tabular-nums ${i.margin == null ? '' : i.margin >= 0.4 ? 'text-emerald-300' : 'text-amber-300'}`}>{pct(i.margin)}</td>
                <td className={TD}>{i.anvisa ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${i.anvisa === 'conferido' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{i.anvisa}</span> : '—'}</td>
                <td className={TD}>
                  <button type="button" role="switch" aria-checked={i.variant_active} aria-label={`${i.name} à venda`} disabled={alternar.isPending} onClick={() => alternar.mutate({ sku: i.sku, active: !i.variant_active })} className={`relative h-6 w-11 rounded-full transition-colors ${i.variant_active ? 'bg-amber-400' : 'bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${i.variant_active ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ---------- Financeiro ---------- */
function Financeiro() {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
  const [mes, setMes] = useState(hoje)
  const q = useQuery({ queryKey: ['loja', 'financeiro', mes], queryFn: () => fetchFinanceiro(mes) })
  if (q.isError) return <Erro erro={q.error} onRetry={() => q.refetch()} />
  const d = q.data
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><label className="text-sm text-zinc-400" htmlFor="mes-loja">Mês</label><input id="mes-loja" type="month" value={mes} max={hoje} onChange={(e) => e.target.value && setMes(e.target.value)} className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-sm" /></div>
      {!d ? <p className="py-10 text-center text-sm text-zinc-500">Carregando…</p> : (
        <>
          <section className="kpi-scroll">
            <Kpi destaque label="Bruto" valor={reais(d.gross_cents)} dica={`${d.orders} pedido(s) pagos`} />
            <Kpi label="Frete cobrado" valor={reais(d.shipping_cents)} dica="entra no bruto" />
            <Kpi label="Itens vendidos" valor={reais(d.items_cents)} />
            <Kpi label="Custo dos itens" valor={reais(d.cost_cents)} dica={d.orders_without_cost ? `${d.orders_without_cost} pedido(s) sem custo cadastrado` : 'atacado'} />
            <Kpi label="Margem dos itens" valor={reais(d.margin_cents)} dica="antes das taxas do Stripe e do frete real" />
          </section>
          <section className="surface-card p-4">
            <p className="section-label">Por pedido</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead><tr><th className={TH}>Pedido</th><th className={TH}>Pago em</th><th className={`${TH} text-right`}>Total</th><th className={`${TH} text-right`}>Itens</th><th className={`${TH} text-right`}>Custo</th><th className={`${TH} text-right`}>Margem</th><th className={TH}>NF</th></tr></thead>
                <tbody>
                  {d.rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-sm text-zinc-500">Nenhuma venda neste mês.</td></tr>}
                  {d.rows.map((r) => (
                    <tr key={r.number} className="border-t border-[var(--line)]">
                      <td className={`${TD} font-semibold`}>{r.number}</td><td className={`${TD} text-zinc-400`}>{quando(r.paid_at)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{reais(r.total_cents)}</td><td className={`${TD} text-right tabular-nums`}>{reais(r.items_cents)}</td>
                      <td className={`${TD} text-right tabular-nums text-zinc-400`}>{r.cost_cents == null ? '—' : reais(r.cost_cents)}</td>
                      <td className={`${TD} text-right font-semibold tabular-nums`}>{r.margin_cents == null ? '—' : reais(r.margin_cents)}</td>
                      <td className={TD}>{r.nf ? 'emitida' : <span className="text-zinc-500">não emitida</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-zinc-500">As taxas do Stripe e o custo real do frete ainda não entram nesta conta. Sem nota fiscal no primeiro mês.</p>
          </section>
        </>
      )}
    </div>
  )
}

/* ---------- Atendimento ---------- */
const RESPOSTAS: [string, string][] = [
  ['Quanto custa o frete e quanto demora?', 'O frete é calculado pelo seu CEP no carrinho. Você vê valor e prazo antes de pagar, e o prazo começa a contar depois da confirmação do pagamento.'],
  ['Paguei o Pix e não confirmou.', 'A confirmação é automática, em geral em poucos minutos. Mande o número do pedido e o comprovante que a gente confere.'],
  ['Quero desistir da compra.', 'Você tem 7 dias corridos a partir do recebimento. Mande o número do pedido e respondemos com o código de postagem. O frete de volta é por nossa conta.'],
  ['Vocês emitem nota fiscal?', 'Por enquanto não. Avisamos quando começar a emitir.'],
  ['Esse produto tem registro na Anvisa?', 'Cartucho, tinta, agulha e máquina são produtos regulados. Quando o registro está informado, o número aparece na página do produto. O que ainda está em conferência aparece como “Em breve”.'],
  ['Chegou com defeito.', 'Mande o número do pedido e fotos ou vídeo. O prazo é de 30 dias para itens não duráveis e 90 para duráveis, do recebimento. Se confirmado, o frete de ida e volta é por nossa conta.'],
]
function Atendimento() {
  const [copiado, setCopiado] = useState<number | null>(null)
  return (
    <section className="surface-card space-y-3 p-4">
      <p className="section-label">Respostas prontas</p>
      <div className="grid gap-3 md:grid-cols-2">
        {RESPOSTAS.map(([p, r], i) => (
          <div key={p} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-3">
            <p className="text-sm font-semibold">{p}</p>
            <p className="mt-1 text-sm text-zinc-400">{r}</p>
            <button type="button" className="chip-btn mt-2" onClick={() => navigator.clipboard?.writeText(r).then(() => { setCopiado(i); setTimeout(() => setCopiado(null), 1800) })}>{copiado === i ? 'Copiado ✓' : 'Copiar'}</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-500">Trocas e devoluções com controle de prazo entram na próxima etapa.</p>
    </section>
  )
}

/* ---------- Conexão ---------- */
function Conexao() {
  const q = useQuery({ queryKey: ['loja', 'resumo'], queryFn: fetchResumo })
  return (
    <section className="surface-card space-y-3 p-4 text-sm">
      <p className="section-label">Ligação com a loja</p>
      {q.isError ? <Erro erro={q.error} onRetry={() => q.refetch()} /> : <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-300">{q.data ? 'Dash e loja conversando normalmente.' : 'Testando a ligação…'}</p>}
      <p className="text-zinc-400">As chaves do Stripe (teste ou real), do Melhor Envio (sandbox ou real) e o <b>noindex</b> ficam na Vercel, no projeto <b>tuzinhostore</b>. Antes de abrir ao público:</p>
      <ul className="list-disc space-y-1 pl-5 text-zinc-400">
        <li>Trocar as chaves do Stripe de teste para as reais e criar o webhook de produção.</li>
        <li>Trocar <b>MELHOR_ENVIO_SANDBOX</b> para <b>false</b> e tirar o frete estimado (<b>ALLOW_ESTIMATED_SHIPPING</b>).</li>
        <li>Tirar o <b>noindex</b> da loja e ligar o domínio próprio.</li>
      </ul>
    </section>
  )
}

/* ---------- página ---------- */
const VIEWS: { id: string; to: string; rotulo: string; titulo: string; texto: string }[] = [
  { id: '', to: '/loja', rotulo: 'Visão geral', titulo: 'Visão geral da loja', texto: 'Receita, pedidos a enviar e o que pede atenção agora.' },
  { id: 'pedidos', to: '/loja/pedidos', rotulo: 'Pedidos', titulo: 'Pedidos', texto: 'Todos os pedidos da loja. Clique em um para registrar o envio, reembolsar ou falar com o cliente.' },
  { id: 'catalogo', to: '/loja/catalogo', rotulo: 'Catálogo', titulo: 'Catálogo e preços', texto: 'Preço, custo e margem de cada item, e o interruptor de “à venda”.' },
  { id: 'financeiro', to: '/loja/financeiro', rotulo: 'Financeiro', titulo: 'Financeiro da loja', texto: 'Bruto, custo e margem por mês e por pedido.' },
  { id: 'atendimento', to: '/loja/atendimento', rotulo: 'Atendimento', titulo: 'Atendimento', texto: 'Respostas prontas para as perguntas mais comuns.' },
  { id: 'conexao', to: '/loja/conexao', rotulo: 'Conexão', titulo: 'Conexão com a loja', texto: 'Estado da ligação e o que falta para abrir ao público.' },
]

export default function LojaPage() {
  const { view = '' } = useParams()
  const [aberto, setAberto] = useState<string | null>(null)
  const atual = VIEWS.find((v) => v.id === view)
  if (!atual) return <Navigate to="/loja" replace />
  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Tuzinho Store</p>
        <Typewriter as="h2" className="section-title mt-1" text={atual.titulo} />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">{atual.texto}</p>
      </PageHero>
      <nav className="flex flex-wrap gap-2" aria-label="Seções da loja">
        {VIEWS.map((v) => (
          <NavLink key={v.id} to={v.to} end className="chip-btn" aria-pressed={v.id === view}>{v.rotulo}</NavLink>
        ))}
      </nav>
      {view === '' && <Geral onAbrir={setAberto} />}
      {view === 'pedidos' && <Pedidos onAbrir={setAberto} />}
      {view === 'catalogo' && <Catalogo />}
      {view === 'financeiro' && <Financeiro />}
      {view === 'atendimento' && <Atendimento />}
      {view === 'conexao' && <Conexao />}
      {aberto && <PedidoPainel numero={aberto} onFechar={() => setAberto(null)} />}
    </div>
  )
}
