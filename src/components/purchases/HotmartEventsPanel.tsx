import { useQuery } from '@tanstack/react-query'
import { fetchHotmartEvents } from '@/services/hotmartEventsService.ts'
import { formatCurrency, formatNumber } from '@/lib/format.ts'
import type { HotmartEvent, Purchase } from '@/types'

export interface EventGroup {
  key: string
  eyebrow: string
  items: Purchase[]
}

const SITUATION_LABEL: Record<string, string> = {
  pago: 'Pago',
  cancelado: 'Cancelado',
  pendente: 'Pendente',
  vencido: 'Vencido?',
  recuperado: 'Comprou depois',
  'em aberto': 'Em aberto',
  cancelada: 'Cancelada',
  atrasada: 'Atrasada',
  expirada: 'Expirada',
  reembolsada: 'Reembolsada',
  chargeback: 'Chargeback',
}

function brDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Evento da Hotmart no formato que as janelas de venda já sabem mostrar. */
export function eventToPurchase(event: HotmartEvent, eyebrow: string): Purchase {
  return {
    id: event.id,
    nome: event.nome,
    email: event.email,
    telefone: event.telefone,
    curso: event.produto,
    campanha: event.campanha || event.canal,
    liberacao: '',
    data: brDate(event.data),
    valor: event.valor,
    status: 'ativo',
    createdAt: event.data,
    src: event.src || null,
    xcod: event.xcod || null,
    campaignId: event.campaignId,
    pagamentoTipo: event.pagamento || null,
    evento: eyebrow,
    badge: event.situacao ? (SITUATION_LABEL[event.situacao] ?? event.situacao) : null,
  }
}

/** Uma linha por pessoa (a mais recente), para o carrinho abandonado não repetir quem tentou várias vezes. */
function latestPerPerson(events: HotmartEvent[]): HotmartEvent[] {
  const seen = new Set<string>()
  const result: HotmartEvent[] = []
  for (const event of [...events].sort((a, b) => b.data.localeCompare(a.data))) {
    const key = event.email || event.id
    if (seen.has(key)) continue
    seen.add(key)
    result.push(event)
  }
  return result
}

interface CardProps {
  label: string
  value: number
  hint: string
  tone: 'amber' | 'red' | 'zinc'
  onClick: () => void
}

function Card({ label, value, hint, tone, onClick }: CardProps) {
  const color = tone === 'amber' ? 'text-amber-200' : tone === 'red' ? 'text-red-300' : 'text-zinc-50'
  return (
    <button
      type="button"
      onClick={onClick}
      className="kpi-card cursor-pointer text-left transition-colors hover:border-amber-400/60"
      title="Ver a lista"
    >
      <p className="section-label">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${color}`}>{formatNumber(value)}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p>
    </button>
  )
}

/** Pendências vindas dos eventos da Hotmart: quem gerou Pix/boleto e não pagou, carrinhos abandonados... */
export function HotmartEventsPanel({ onOpen }: { onOpen: (group: EventGroup) => void }) {
  const query = useQuery({
    queryKey: ['hotmart-events'],
    queryFn: () => fetchHotmartEvents(),
    retry: false,
    staleTime: 60_000,
  })

  if (query.isLoading) return null

  if (query.isError || !query.data?.resumo) {
    return (
      <p className="text-xs text-zinc-600">
        <i className="fa-solid fa-circle-info mr-1.5" />
        Não consegui ler os eventos da Hotmart (planilha de tracking) agora.
      </p>
    )
  }

  const { events, resumo } = query.data
  const open = (key: string, eyebrow: string, list: HotmartEvent[]) =>
    onOpen({ key, eyebrow, items: list.map((event) => eventToPurchase(event, eyebrow)) })

  const pix = events.filter((event) => event.categoria === 'pix_boleto' && (event.situacao === 'pendente' || event.situacao === 'vencido'))
  const carts = latestPerPerson(events.filter((event) => event.categoria === 'abandono' && event.situacao === 'em aberto'))
  const canceled = events.filter((event) => event.categoria === 'cancelamento')
  const refunds = events.filter((event) => event.categoria === 'reembolso')

  return (
    <section className="space-y-2">
      <div>
        <p className="section-label">Hotmart · pendências</p>
        <h3 className="section-title mt-1">Quem ainda pode virar venda</h3>
        <p className="mt-1 text-xs text-zinc-600">
          Eventos da Hotmart registrados na planilha de tracking. Clique para ver a lista e chamar no WhatsApp.
        </p>
      </div>
      <div className="kpi-scroll">
        <Card
          label="Pix e boletos pendentes"
          value={resumo.pixBoleto.pendentes}
          tone="amber"
          hint={
            resumo.pixBoleto.pendentes > 0
              ? `${formatCurrency(resumo.pixBoleto.valorPendente)} a receber${resumo.pixBoleto.vencidos ? ` · ${resumo.pixBoleto.vencidos} vencido(s)?` : ''}`
              : resumo.pixBoleto.vencidos
                ? `${resumo.pixBoleto.vencidos} vencido(s)?`
                : 'nenhum em aberto'
          }
          onClick={() => open('Pix e boletos pendentes', 'Boleto/Pix gerado', pix)}
        />
        <Card
          label="Carrinhos abandonados"
          value={resumo.abandono.emAberto}
          tone="zinc"
          hint={`${formatNumber(resumo.abandono.recuperadas)} compraram depois`}
          onClick={() => open('Carrinhos abandonados em aberto', 'Carrinho abandonado', carts)}
        />
        <Card
          label="Cancelamentos e atrasos"
          value={resumo.cancelamentos.total}
          tone="zinc"
          hint={[
            resumo.cancelamentos.canceladas ? `${resumo.cancelamentos.canceladas} cancelada(s)` : '',
            resumo.cancelamentos.atrasadas ? `${resumo.cancelamentos.atrasadas} atrasada(s)` : '',
            resumo.cancelamentos.expiradas ? `${resumo.cancelamentos.expiradas} expirada(s)` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'nenhum'}
          onClick={() => open('Cancelamentos e atrasos', 'Cancelamento ou atraso', canceled)}
        />
        <Card
          label="Reembolsos e chargebacks"
          value={resumo.reembolsos.total}
          tone={resumo.reembolsos.total > 0 ? 'red' : 'zinc'}
          hint={resumo.reembolsos.total > 0 ? 'atenção' : 'nenhum'}
          onClick={() => open('Reembolsos e chargebacks', 'Reembolso ou chargeback', refunds)}
        />
      </div>
    </section>
  )
}
