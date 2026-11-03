import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPaginas, savePaginas, type PaginaId } from '@/services/videoService.ts'

const PAGINAS: { id: PaginaId; nome: string; dica: string }[] = [
  { id: 'essentials', nome: 'Essentials', dica: 'Página principal de vendas' },
  { id: 'membros', nome: 'Membros', dica: 'Página da oferta para quem já é da comunidade' },
  { id: 'live', nome: 'Live', dica: 'Página da live (padrão: sem trava)' },
]

type Tempos = Record<PaginaId, number>

function textoTempo(segundos: number): string {
  if (segundos <= 0) return 'sem trava'
  if (segundos < 60) return `${segundos} s`
  const min = Math.floor(segundos / 60)
  const resto = segundos % 60
  return resto ? `${min} min ${resto} s` : `${min} min`
}

/** Quanto tempo cada página de venda fica "travada" (sem rolar e sem menu) logo depois de abrir. */
export function PaginasControl() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['paginas-config'], queryFn: fetchPaginas, retry: false })
  const estado = query.data
  const [form, setForm] = useState<Tempos | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null)

  // o formulário nasce do que está salvo; depois disso só o próprio usuário mexe nele
  useEffect(() => {
    if (estado) setForm({ essentials: estado.paginas.essentials.config.travaSegundos, membros: estado.paginas.membros.config.travaSegundos, live: estado.paginas.live.config.travaSegundos })
  }, [estado])

  if (query.isLoading) return <section className="surface-card p-4"><div className="skeleton h-24 w-full" /></section>
  if (query.error) {
    return (
      <section className="surface-card border-red-500/30 p-4 text-sm text-red-300" role="alert">
        {(query.error as Error).message}
      </section>
    )
  }
  if (!estado || !form) return null

  const alterado = PAGINAS.some(({ id }) => form[id] !== estado.paginas[id].config.travaSegundos)

  function mudar(id: PaginaId, valor: number) {
    setForm((atual) => (atual ? { ...atual, [id]: valor } : atual))
    setMessage(null)
  }

  async function salvar() {
    if (!form) return
    setSaving(true)
    setMessage(null)
    try {
      const novo = await savePaginas(form)
      queryClient.setQueryData(['paginas-config'], novo)
      setMessage({ kind: 'ok', text: 'Salvo. Vale para quem abrir a página a partir de agora.' })
    } catch (erro) {
      setMessage({ kind: 'erro', text: (erro as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="surface-card p-4" data-tour="Trava das páginas" data-tour-text="Defina por quantos segundos cada página de venda fica sem rolar e sem menu logo ao abrir. Zero tira a trava.">
      <p className="section-label">Páginas de venda</p>
      <h3 className="section-title mt-1 mb-1">Tempo de trava ao abrir a página</h3>
      <p className="mb-4 max-w-2xl text-xs text-zinc-500">
        Logo que a pessoa abre a página, ela não rola e o menu lateral fica escondido por esse tempo, para o vídeo ter a atenção dela. Depois
        disso a página libera. Cada página tem o seu tempo; <b className="text-zinc-300">0 = sem trava</b>. Quem abre um link direto para o conteúdo
        (<code>#conteudo</code>) nunca fica travado.
      </p>

      {estado.precisaMigracao && (
        <div className="migration-note mb-4" role="status">
          <i className="fa-solid fa-database" />
          <div>
            <b>Falta criar a tabela no banco.</b> Rode o bloco "Central de vídeos" de <code>db/schema.sql</code> no SQL Editor do Supabase. Até lá
            as páginas usam o tempo padrão e este painel não consegue salvar.
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {PAGINAS.map(({ id, nome, dica }) => (
          <label key={id} className="block rounded-xl border border-white/10 p-3">
            <b className="block text-sm text-zinc-100">{nome}</b>
            <span className="mb-2 block text-xs text-zinc-500">{dica}</span>
            <span className="pc-label">
              Trava de <b className="text-zinc-100">{textoTempo(form[id])}</b>
            </span>
            <input
              type="range"
              className="pc-range"
              min={0}
              max={estado.maximo}
              step={5}
              value={form[id]}
              aria-label={`Tempo da trava da página ${nome}, em segundos`}
              onChange={(e) => mudar(id, Number(e.target.value))}
            />
            <span className="block text-xs text-zinc-500">Padrão: {textoTempo(estado.padroes[id].travaSegundos)}</span>
          </label>
        ))}
      </div>

      <div className="pc-salvar">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-gold disabled:opacity-60" disabled={saving || !alterado || estado.precisaMigracao} onClick={() => void salvar()}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            className="chip-btn"
            disabled={saving}
            onClick={() => setForm({ essentials: estado.padroes.essentials.travaSegundos, membros: estado.padroes.membros.travaSegundos, live: estado.padroes.live.travaSegundos })}
          >
            Restaurar padrão
          </button>
          {alterado && !message && <span className="text-xs text-amber-300">Mudanças ainda não salvas.</span>}
        </div>
        {message && (
          <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role={message.kind === 'erro' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
