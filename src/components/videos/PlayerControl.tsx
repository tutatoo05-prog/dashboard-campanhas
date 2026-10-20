import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPlayerConfig, savePlayerConfig, type PlayerConfig, type PlayerConfigState } from '@/services/videoService.ts'

/** Onde o player fica publicado (dist-player/ do projeto produtos). É o que as páginas de venda embutem. */
const PLAYER_URL = 'https://tuzinho.academy/produtos/player/'

function iframeCode(video: string): string {
  return [
    '<div style="position:relative;padding-top:56.25%;background:#000">',
    `  <iframe src="${PLAYER_URL}?v=${video}"`,
    '    title="Vídeo" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen',
    '    style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>',
    '</div>',
  ].join('\n')
}

function formatClock(segundos: number): string {
  const total = Math.max(0, Math.round(segundos))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  )
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

export function PlayerControl({ video }: { video: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['player-config', video], queryFn: () => fetchPlayerConfig(video), retry: false })
  const estado = query.data
  const [form, setForm] = useState<PlayerConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null)
  const [previewKey, setPreviewKey] = useState(0)
  const [copied, setCopied] = useState(false)

  // o formulário nasce do que está salvo; depois disso só o próprio usuário mexe nele
  useEffect(() => {
    if (estado) setForm(structuredClone(estado.config))
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

  const alterado = JSON.stringify(form) !== JSON.stringify(estado.config)

  function mudar(parcial: (atual: PlayerConfig) => PlayerConfig) {
    setForm((atual) => (atual ? parcial(structuredClone(atual)) : atual))
    setMessage(null)
  }

  async function salvar() {
    if (!form) return
    setSaving(true)
    setMessage(null)
    try {
      const novo: PlayerConfigState = await savePlayerConfig(video, form)
      queryClient.setQueryData(['player-config', video], novo)
      setForm(structuredClone(novo.config))
      setPreviewKey((k) => k + 1)
      setMessage({ kind: 'ok', text: 'Salvo. As páginas pegam a mudança em até 1 minuto.' })
    } catch (erro) {
      setMessage({ kind: 'erro', text: (erro as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(iframeCode(video))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage({ kind: 'erro', text: 'Não consegui copiar. Selecione o código e copie com Ctrl+C.' })
    }
  }

  return (
    <section className="surface-card p-4" data-tour="Controle do player" data-tour-text="Aqui você escolhe como o vídeo se comporta nas páginas: botão de compra num minuto, se dá para pular e o que aparece no fim. Salvou, as páginas já usam.">
      <p className="section-label">Controle do player</p>
      <h3 className="section-title mt-1 mb-1">Como o vídeo se comporta nas páginas</h3>
      <p className="mb-4 text-xs text-zinc-500">
        {estado.salvo
          ? `Salvo${estado.atualizadoPor ? ` por ${estado.atualizadoPor}` : ''}${estado.atualizadoEm ? ` em ${new Date(estado.atualizadoEm).toLocaleString('pt-BR')}` : ''}.`
          : 'Nada salvo ainda: as páginas usam o padrão do player.'}
      </p>

      {estado.precisaMigracao && (
        <div className="migration-note mb-4" role="status">
          <i className="fa-solid fa-database" />
          <div>
            <b>Falta criar a tabela no banco.</b> Rode o bloco "Central de vídeos" de <code>db/schema.sql</code> no SQL Editor do
            Supabase. Até lá o player usa o padrão e este painel não consegue salvar.
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Arquivo HD (computador)" hint="Nome do .mp4 na pasta de vídeos do servidor.">
              <input className="filter-select mt-1 w-full" value={form.arquivos.hd} onChange={(e) => mudar((c) => ({ ...c, arquivos: { ...c.arquivos, hd: e.target.value } }))} />
            </Field>
            <Field label="Arquivo leve (celular)" hint="Mais leve, para celular e conexão fraca.">
              <input className="filter-select mt-1 w-full" value={form.arquivos.leve} onChange={(e) => mudar((c) => ({ ...c, arquivos: { ...c.arquivos, leve: e.target.value } }))} />
            </Field>
          </div>

          <Toggle checked={form.permitirAvancar} onChange={(v) => mudar((c) => ({ ...c, permitirAvancar: v }))}>
            <b>Permitir pular para a frente</b>
            <span className="block text-xs text-zinc-500">Desligado, a pessoa só volta ou continua de onde já assistiu.</span>
          </Toggle>

          <div className="space-y-2">
            <Toggle checked={form.cta.ativo} onChange={(v) => mudar((c) => ({ ...c, cta: { ...c.cta, ativo: v } }))}>
              <b>Mostrar o botão de compra durante o vídeo</b>
              <span className="block text-xs text-zinc-500">Abre o mesmo fluxo de compra da página (cadastro e checkout).</span>
            </Toggle>
            {form.cta.ativo && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Aparece aos (segundos)" hint={`Equivale a ${formatClock(form.cta.segundo)} do vídeo.`}>
                  <input
                    type="number"
                    min={0}
                    max={7200}
                    className="filter-select mt-1 w-full"
                    value={form.cta.segundo}
                    onChange={(e) => mudar((c) => ({ ...c, cta: { ...c.cta, segundo: Number(e.target.value) } }))}
                  />
                </Field>
                <Field label="Texto do botão">
                  <input className="filter-select mt-1 w-full" maxLength={60} value={form.cta.texto} onChange={(e) => mudar((c) => ({ ...c, cta: { ...c.cta, texto: e.target.value } }))} />
                </Field>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Toggle checked={form.fim.ativo} onChange={(v) => mudar((c) => ({ ...c, fim: { ...c.fim, ativo: v } }))}>
              <b>Mostrar uma tela quando o vídeo terminar</b>
              <span className="block text-xs text-zinc-500">Mensagem e botão de compra sobre o vídeo parado.</span>
            </Toggle>
            {form.fim.ativo && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mensagem (opcional)">
                  <input className="filter-select mt-1 w-full" maxLength={120} value={form.fim.titulo} onChange={(e) => mudar((c) => ({ ...c, fim: { ...c.fim, titulo: e.target.value } }))} />
                </Field>
                <Field label="Texto do botão">
                  <input className="filter-select mt-1 w-full" maxLength={60} value={form.fim.texto} onChange={(e) => mudar((c) => ({ ...c, fim: { ...c.fim, texto: e.target.value } }))} />
                </Field>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-gold disabled:opacity-60" disabled={saving || !alterado || estado.precisaMigracao} onClick={() => void salvar()}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" className="chip-btn" disabled={saving} onClick={() => mudar(() => structuredClone(estado.padrao))}>
              Restaurar padrão
            </button>
            {alterado && <span className="text-xs text-amber-300">Mudanças ainda não salvas.</span>}
          </div>
          {message && (
            <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role={message.kind === 'erro' ? 'alert' : 'status'}>
              {message.text}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-zinc-300">Prévia (o que está salvo)</p>
            <div className="relative overflow-hidden rounded-xl bg-black" style={{ paddingTop: '56.25%' }}>
              <iframe
                key={previewKey}
                src={`${PLAYER_URL}?v=${video}`}
                title="Prévia do player"
                allow="fullscreen; picture-in-picture"
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">A prévia mostra o player publicado em tuzinho.academy.</p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm text-zinc-300">Código para colar em uma página</p>
              <button type="button" className="chip-btn" onClick={() => void copiar()}>
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <textarea readOnly rows={5} className="filter-select w-full font-mono text-xs" value={iframeCode(video)} onFocus={(e) => e.currentTarget.select()} />
            <p className="mt-1 text-xs text-zinc-500">
              Essentials, Membros e Live já usam o player. Em uma página nova, esse código mostra o vídeo com as opções acima; para
              também medir o vídeo e abrir o checkout, a página precisa da ponte <code>vsl-embed.js</code> do projeto produtos.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
