/** Cliente da página "Tuzinho Store". Fala só com /api/loja (o servidor do dash repassa à loja com a chave secreta). Valores em centavos. */

export type PedidoStatus = 'pending_payment' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'

export interface FilaItem {
  number: string
  name: string
  shipping_label: string | null
  hours: number
  status: PedidoStatus
  items: { name: string; qty: number }[]
}

export interface LojaResumo {
  revenue7: number
  revenuePrev7: number
  growth: number | null
  paid7: number
  avgTicket: number
  awaitingPayment: number
  toShip: number
  lateToShip: number
  margin: number | null
  perDay: { day: string; cents: number }[]
  queue: FilaItem[]
  late: { number: string; hours: number }[]
}

export interface PedidoLinha {
  number: string
  status: PedidoStatus
  created_at: string
  paid_at: string | null
  name: string
  email: string
  total_cents: number
  method: 'pix' | 'card' | 'boleto' | null
}

export interface PedidosLista {
  count: Record<string, number>
  orders: PedidoLinha[]
}

export interface PedidoDetalhe {
  number: string
  status: PedidoStatus
  created_at: string
  paid_at: string | null
  name: string
  email: string
  phone: string | null
  cpf_masked: string
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
  shipping_label: string | null
  address: { zip?: string; street?: string; number?: string; complement?: string | null; district?: string; city?: string; state?: string } | null
  professional_declared: boolean
  note: string
  items: { sku: string; name: string; qty: number; unit_price_cents: number; cost_cents: number | null }[]
  cost_cents: number | null
  payments: { method: string; status: string; ref: string | null; amount_cents: number; installments: number }[]
  shipment: { carrier: string | null; service: string | null; tracking_code: string | null; tracking_url: string | null; shipped_at: string | null; delivered_at: string | null } | null
  order_url: string
}

export interface CatalogoItem {
  sku: string
  name: string
  label: string | null
  price_cents: number | null
  cost_cents: number | null
  margin: number | null
  variant_active: boolean
  product_active: boolean
  kind: string
  anvisa: 'conferido' | 'pendente' | null
}

export interface LojaFinanceiro {
  month: string
  orders: number
  gross_cents: number
  shipping_cents: number
  items_cents: number
  cost_cents: number
  margin_cents: number
  orders_without_cost: number
  rows: { number: string; paid_at: string; total_cents: number; shipping_cents: number; items_cents: number; cost_cents: number | null; margin_cents: number | null; nf: boolean }[]
}

export class LojaErro extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

const json = { Accept: 'application/json', 'Content-Type': 'application/json' }

async function ler<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new LojaErro(data.error ?? 'Não foi possível falar com a loja.', data.code)
  return data as T
}

function buscar<T>(params: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
  return fetch(`/api/loja?${qs}`, { credentials: 'include', headers: { Accept: 'application/json' } }).then((r) => ler<T>(r))
}

function agir<T = { ok: boolean }>(corpo: Record<string, unknown>): Promise<T> {
  return fetch('/api/loja', { method: 'POST', credentials: 'include', headers: json, body: JSON.stringify(corpo) }).then((r) => ler<T>(r))
}

export const fetchResumo = () => buscar<LojaResumo>({ a: 'overview' })
export const fetchPedidos = (status: string, q: string) => buscar<PedidosLista>({ a: 'orders', status, q })
export const fetchPedido = (n: string) => buscar<PedidoDetalhe>({ a: 'order', n })
export const fetchCatalogo = () => buscar<{ items: CatalogoItem[] }>({ a: 'catalog' })
export const fetchFinanceiro = (month: string) => buscar<LojaFinanceiro>({ a: 'finance', month })

export const enviarPedido = (n: string, tracking: string) => agir<{ ok: boolean; number: string; tracking: string; email: 'enviado' | 'falhou' }>({ a: 'ship', n, tracking })
export const separarPedido = (n: string) => agir({ a: 'prepare', n })
export const entreguePedido = (n: string) => agir({ a: 'delivered', n })
export const cancelarPedido = (n: string) => agir({ a: 'cancel', n })
export const reembolsarPedido = (n: string) => agir({ a: 'refund', n })
export const salvarNota = (n: string, text: string) => agir({ a: 'note', n, text })
export const definirDisponibilidade = (sku: string, active: boolean) => agir({ a: 'availability', sku, active })
export const revelarCpf = (n: string) => agir<{ cpf: string }>({ a: 'cpf', n })
