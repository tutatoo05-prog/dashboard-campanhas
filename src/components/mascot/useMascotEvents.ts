import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLeads } from '@/services/leadService.ts'
import { fetchPurchases } from '@/services/purchaseService.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { useTourStore } from '@/store/tourStore.ts'
import { formatCurrency } from '@/lib/format.ts'
import type { Lead, Purchase } from '@/types'

const POLL_MS = 90_000
/** Acima disso é carga em lote (backfill), não vale comemorar uma a uma. */
const BATCH_LIMIT = 20

function purchaseKey(p: Purchase) {
  return `${p.email ?? ''}|${p.data ?? ''}|${p.curso ?? ''}|${p.valor ?? ''}`
}

function leadKey(l: Lead) {
  return `${l.email ?? ''}|${l.created_at ?? l.data ?? ''}`
}

function firstName(name?: string) {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : 'Alguém'
}

/** O Tatu não interrompe tour nem balão com botões; nesse caso o evento fica pro próximo ciclo. */
function busy(): boolean {
  const state = useMascotStore.getState()
  return useTourStore.getState().active || Boolean(state.speech?.actions)
}

/**
 * Reage ao que acontece enquanto o painel está aberto: venda nova (confete e balão) e lead novo
 * (aceno discreto). Faz polling leve nas mesmas consultas das páginas de Leads e Compras.
 * O que já existia ao abrir o painel vira "base" e não é anunciado.
 */
export function useMascotEvents({ active, admin }: { active: boolean; admin: boolean }) {
  const purchasesQuery = useQuery({
    queryKey: ['purchases'],
    queryFn: fetchPurchases,
    enabled: active && admin,
    retry: false,
    refetchInterval: POLL_MS,
  })
  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: fetchLeads,
    enabled: active,
    retry: false,
    refetchInterval: POLL_MS,
  })

  const knownPurchases = useRef<Set<string> | null>(null)
  const knownLeads = useRef<Set<string> | null>(null)

  useEffect(() => {
    const data = purchasesQuery.data
    if (!data) return
    if (!knownPurchases.current) {
      knownPurchases.current = new Set(data.map(purchaseKey))
      return
    }
    let timer: number | undefined

    function announce() {
      const fresh = data!.filter((p) => !knownPurchases.current!.has(purchaseKey(p)))
      if (!fresh.length) return
      if (busy()) {
        timer = window.setTimeout(announce, 8000)
        return
      }
      fresh.forEach((p) => knownPurchases.current!.add(purchaseKey(p)))

      const sales = fresh.filter((p) => p.status !== 'cancelado' && !p.canceledAt)
      if (!sales.length || fresh.length > BATCH_LIMIT) return
      const store = useMascotStore.getState()
      store.celebrate()
      if (sales.length === 1) {
        const [sale] = sales
        const value = sale.valor ? ` · ${formatCurrency(sale.valor)}` : ''
        store.say(`Venda nova! ${firstName(sale.nome)}${sale.curso ? ` levou ${sale.curso}` : ''}${value}.`, {
          pose: 'cheer',
          afterPose: 'idle',
        })
      } else {
        store.say(`${sales.length} vendas novas chegaram!`, { pose: 'cheer', afterPose: 'idle' })
      }
    }

    announce()
    return () => window.clearTimeout(timer)
  }, [purchasesQuery.data])

  useEffect(() => {
    const data = leadsQuery.data
    if (!data) return
    if (!knownLeads.current) {
      knownLeads.current = new Set(data.map(leadKey))
      return
    }
    const fresh = data.filter((l) => !knownLeads.current!.has(leadKey(l)))
    if (!fresh.length) return
    fresh.forEach((l) => knownLeads.current!.add(leadKey(l)))
    if (fresh.length > BATCH_LIMIT || useTourStore.getState().active) return
    // sem balão: só um aceno, pra não virar barulho
    if (!useMascotStore.getState().speech) useMascotStore.getState().act('wave', 1800)
  }, [leadsQuery.data])
}
