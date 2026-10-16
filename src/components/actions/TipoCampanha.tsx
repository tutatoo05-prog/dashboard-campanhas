import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TIPOS, TIPOS_ESCOLHIVEIS } from '@/lib/campaignType.js'
import { salvarFicha } from '@/services/fichasService.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { isAdmin } from '@/lib/roles.ts'
import type { CampaignItem } from '@/types'

type TipoKey = keyof typeof TIPOS

/** Etiqueta com o tipo da campanha (descoberto sozinho ou confirmado) e, para admin, a troca. */
export function TipoCampanha({ item }: { item: CampaignItem }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [aberto, setAberto] = useState(false)
  const tipo = (item.tipo as TipoKey | undefined) ?? 'indefinido'
  const info = TIPOS[tipo] ?? TIPOS.indefinido
  const manual = item.tipoOrigem === 'manual'

  const salvar = useMutation({
    mutationFn: (novo: string | null) => salvarFicha({ accountId: String(item.accountId ?? ''), campaignId: String(item.campaignId ?? item.id), tipo: novo }),
    onSuccess: () => {
      setAberto(false)
      void queryClient.invalidateQueries({ queryKey: ['meta-insights'] })
    },
  })

  return (
    <span className="tipo-campanha" title={String(item.tipoMotivo ?? '')}>
      <span className="tipo-chip">
        {info.emoji} {info.label}
        <small>{manual ? 'confirmado' : tipo === 'indefinido' ? 'não identificado' : item.tipoConfianca === 'media' ? 'automático · confira' : 'automático'}</small>
      </span>
      {isAdmin(user) && (
        <button type="button" className="tipo-mudar" onClick={() => setAberto((valor) => !valor)} aria-expanded={aberto}>
          mudar
        </button>
      )}
      {aberto && (
        <span className="tipo-menu">
          {TIPOS_ESCOLHIVEIS.map((chave) => (
            <button key={chave} type="button" disabled={salvar.isPending} onClick={() => salvar.mutate(chave)}>
              {TIPOS[chave as TipoKey].emoji} {TIPOS[chave as TipoKey].label}
            </button>
          ))}
          {manual && (
            <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate(null)}>
              ↩ Voltar ao automático
            </button>
          )}
          {salvar.isError && <em>{(salvar.error as Error).message}</em>}
        </span>
      )}
    </span>
  )
}

/** Pergunta da Central de Ações: "para que serve esta campanha?" (só quando o dash não entendeu). */
export function TipoPergunta({ item }: { item: CampaignItem }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const salvar = useMutation({
    mutationFn: (novo: string) => salvarFicha({ accountId: String(item.accountId ?? ''), campaignId: String(item.campaignId ?? item.id), tipo: novo }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['meta-insights'] }),
  })
  if (!isAdmin(user)) return <p className="mt-2 text-xs text-zinc-500">Peça a um administrador para dizer o que esta campanha faz.</p>

  return (
    <div className="tipo-pergunta">
      {TIPOS_ESCOLHIVEIS.map((chave) => (
        <button key={chave} type="button" className="chip-btn" disabled={salvar.isPending} onClick={() => salvar.mutate(chave)}>
          {TIPOS[chave as TipoKey].emoji} {TIPOS[chave as TipoKey].label}
        </button>
      ))}
      {salvar.isError && <em className="text-red-300">{(salvar.error as Error).message}</em>}
    </div>
  )
}
