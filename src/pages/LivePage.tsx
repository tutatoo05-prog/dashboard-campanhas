import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LiveError,
  fetchLiveStatus,
  saveLiveSchedule,
  turnLiveOff,
  turnLiveOn,
} from '@/services/liveService.ts'
import type { LiveStatus, LiveWindow } from '@/types'

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const NEW_WINDOW: LiveWindow = { day: 3, start: '20:00', end: '22:00' }

const ACTION_LABELS: Record<string, string> = {
  ligou: 'Ligou',
  desligou: 'Desligou',
  agenda: 'Agenda',
  erro: 'Erro',
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  agenda: 'Agenda',
  sistema: 'Automático',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function describeSources(status: LiveStatus): string {
  const sources = status.desired?.sources ?? []
  if (!sources.length) return '—'
  return sources
    .map((source) =>
      source === 'manual'
        ? `Manual${status.manual?.by ? ` (${status.manual.by})` : ''}`
        : 'Agenda semanal',
    )
    .join(' + ')
}

export default function LivePage() {
  const queryClient = useQueryClient()
  const [offAt, setOffAt] = useState('')
  const [draft, setDraft] = useState<LiveWindow[] | null>(null)
  const [busy, setBusy] = useState<'' | 'on' | 'off' | 'schedule'>('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  const liveQuery = useQuery({
    queryKey: ['live'],
    queryFn: fetchLiveStatus,
    refetchInterval: 20_000,
    retry: false,
  })

  const status = liveQuery.data
  const loadError = liveQuery.error as Error | null
  const isOn = status?.real?.on ?? null
  const canEdit = Boolean(status?.canEdit && status.configured)
  const schedule = draft ?? status?.schedule ?? []

  async function run(kind: 'on' | 'off' | 'schedule', task: () => Promise<LiveStatus>, success: string) {
    setBusy(kind)
    setActionError('')
    setNotice('')
    try {
      const data = await task()
      queryClient.setQueryData(['live'], data)
      setNotice(success)
      return true
    } catch (error) {
      if (error instanceof LiveError && error.status) {
        queryClient.setQueryData(['live'], error.status)
      }
      const message = (error as Error).message
      setActionError(message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : message)
      return false
    } finally {
      setBusy('')
    }
  }

  async function handleOn() {
    if (!status) return
    // Desabilitada no meio de um horário da agenda: reabilitar retoma a agenda até o fim dele.
    const limit = offAt
      ? `até ${offAt}`
      : status.pausedUntil
        ? `até o fim do horário da agenda (${formatDate(status.pausedUntil)})`
        : `por ${status.maxHours} h (depois desabilita sozinha)`
    const question = isOn
      ? `Mudar o horário de desabilitar para ${offAt}?`
      : `Habilitar a página de Live?\n\ntuzinho.academy/produtos/essentials/ vai mostrar a Live ${limit}.`
    if (!window.confirm(question)) return
    const ok = await run('on', () => turnLiveOn(offAt), isOn ? 'Horário atualizado.' : 'Página de Live habilitada.')
    if (ok) setOffAt('')
  }

  async function handleOff() {
    const question = status?.desired?.sources.includes('agenda')
      ? 'Desabilitar a página de Live agora?\n\nA agenda fica pausada só até o fim deste horário e volta a valer normalmente no próximo.'
      : 'Desabilitar a página de Live agora?\n\nO endereço volta a mostrar a página principal do Essentials.'
    if (!window.confirm(question)) return
    await run('off', turnLiveOff, 'Página de Live desabilitada.')
  }

  async function handleSaveSchedule() {
    if (!draft) return
    const ok = await run('schedule', () => saveLiveSchedule(draft), 'Agenda salva.')
    if (ok) setDraft(null)
  }

  function updateWindow(index: number, patch: Partial<LiveWindow>) {
    setDraft(schedule.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="hero-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-label">Essentials</p>
            <h2 className="section-title mt-1">Live</h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-500">
              Enquanto a Live estiver ligada, <b className="text-zinc-400">tuzinho.academy/produtos/essentials/</b>{' '}
              mostra a página da Live (com desconto) no lugar da página principal. Liga e desliga na mão ou
              sozinha pela agenda semanal (horário de São Paulo).
            </p>
          </div>
          <button
            type="button"
            onClick={() => liveQuery.refetch()}
            disabled={liveQuery.isFetching}
            className="shrink-0 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
          >
            <i className={`fa-solid fa-rotate mr-1.5 ${liveQuery.isFetching ? 'fa-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </section>

      {loadError && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {loadError.message === 'SESSION_EXPIRED'
            ? 'Sua sessão expirou. Faça login novamente.'
            : loadError.message || 'Não foi possível carregar o estado da Live.'}
        </section>
      )}

      {liveQuery.isLoading && !loadError && (
        <section className="surface-card p-8 text-center text-sm text-zinc-500">Verificando a Live...</section>
      )}

      {status && (
        <>
          {!status.configured && (
            <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
              <i className="fa-solid fa-triangle-exclamation mr-2" />
              Live não configurada no servidor: {status.configError}
            </section>
          )}

          {[status.lastError?.message, status.realError, status.writeError, status.dbError, actionError]
            .filter((message, index, list): message is string => Boolean(message) && list.indexOf(message) === index)
            .map((message) => (
              <section key={message} className="surface-card border-red-500/30 p-4 text-sm text-red-300">
                <i className="fa-solid fa-triangle-exclamation mr-2" />
                {message}
                {status.lastError?.message === message && (
                  <span className="mt-1 block text-xs text-red-300/70">
                    Desde {formatDate(status.lastError.at)}. Nada foi alterado no site.
                  </span>
                )}
              </section>
            ))}

          {notice && !actionError && (
            <section className="surface-card border-emerald-500/30 p-4 text-sm text-emerald-300">
              <i className="fa-solid fa-circle-check mr-2" />
              {notice}
            </section>
          )}

          <section className="surface-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="section-label">Página de Live</p>
                <p
                  className={`mt-1 font-display text-2xl tracking-wide ${
                    isOn === null ? 'text-zinc-400' : isOn ? 'text-emerald-300' : 'text-zinc-300'
                  }`}
                >
                  {isOn === null ? 'Estado desconhecido' : isOn ? 'Habilitada' : 'Desabilitada'}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {isOn
                    ? 'Quem abrir ou recarregar /produtos/essentials/ vê a página de Live.'
                    : 'Quem abrir ou recarregar /produtos/essentials/ vê a página principal.'}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={Boolean(isOn)}
                aria-label={isOn ? 'Desabilitar página de Live' : 'Habilitar página de Live'}
                onClick={isOn ? handleOff : handleOn}
                disabled={!canEdit || isOn === null || Boolean(busy)}
                title={canEdit ? undefined : 'Só administradores da Live podem alterar'}
                className={`relative inline-flex h-10 w-[4.5rem] shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isOn ? 'border-emerald-400/60 bg-emerald-500/30' : 'border-zinc-700 bg-zinc-800'
                }`}
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full shadow transition-transform ${
                    isOn ? 'translate-x-[2.15rem] bg-emerald-300 text-emerald-950' : 'translate-x-1 bg-zinc-400 text-zinc-900'
                  }`}
                >
                  <i
                    className={`fa-solid text-xs ${
                      busy === 'on' || busy === 'off' ? 'fa-spinner fa-spin' : isOn ? 'fa-tower-broadcast' : 'fa-power-off'
                    }`}
                  />
                </span>
              </button>
            </div>

            <dl className="mt-5 grid gap-4 border-t border-zinc-800/60 pt-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="section-label">Habilitada desde</dt>
                <dd className="mt-1 text-zinc-200">{isOn ? formatDate(status.real?.since) : '—'}</dd>
              </div>
              <div>
                <dt className="section-label">Desabilita sozinha às</dt>
                <dd className="mt-1 text-zinc-200">{isOn ? formatDate(status.desired?.until) : '—'}</dd>
              </div>
              <div>
                <dt className="section-label">Origem</dt>
                <dd className="mt-1 text-zinc-200">{isOn ? describeSources(status) : '—'}</dd>
              </div>
            </dl>

            {status.canEdit && (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">
                    {isOn ? 'Mudar horário de desabilitar' : 'Desabilitar sozinha às (opcional)'}
                  </span>
                  <input
                    type="time"
                    value={offAt}
                    onChange={(event) => setOffAt(event.target.value)}
                    disabled={!canEdit || Boolean(busy)}
                    className="filter-input w-36 [color-scheme:dark]"
                  />
                </label>
                {isOn && (
                  <button
                    type="button"
                    onClick={handleOn}
                    disabled={!canEdit || !offAt || Boolean(busy)}
                    className="rounded-lg border border-zinc-800 px-3 py-2.5 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
                  >
                    <i className="fa-solid fa-clock mr-1.5" />
                    Salvar horário
                  </button>
                )}
                <p className="w-full text-xs text-zinc-600">
                  {isOn
                    ? `Máximo de ${status.maxHours} h a partir de agora.`
                    : `Em branco: desabilita sozinha em ${status.maxHours} h (ou no fim do horário da agenda, se estiver dentro dele).`}
                </p>
              </div>
            )}

            {!status.canEdit && (
              <p className="mt-4 text-xs text-zinc-500">
                <i className="fa-solid fa-lock mr-1.5" />
                Modo leitura: só administradores podem habilitar, desabilitar e mudar a agenda.
              </p>
            )}

            {status.real && status.desired && !status.inSync && !status.lastError && (
              <p className="mt-4 text-xs text-amber-200/80">
                <i className="fa-solid fa-clock mr-1.5" />
                Ajustando: o desejado é {status.desired.on ? 'habilitada' : 'desabilitada'}. Corrige sozinho em até 30 s.
              </p>
            )}

            {status.pausedUntil && !isOn && (
              <p className="mt-4 text-xs text-zinc-500">
                <i className="fa-solid fa-pause mr-1.5" />
                Desabilitada na mão durante o horário da agenda (que ia até {formatDate(status.pausedUntil)}). A agenda
                volta a valer normalmente no próximo horário.
              </p>
            )}
          </section>

          <section className="surface-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="section-label">Agenda semanal</p>
                <h3 className="section-title mt-1 mb-1">Liga e desliga sozinha</h3>
                <p className="text-xs text-zinc-600">
                  Horários de São Paulo. Se o fim for menor que o início, a janela atravessa a meia-noite.
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setDraft([...schedule, NEW_WINDOW])}
                  disabled={Boolean(busy)}
                  className="shrink-0 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
                >
                  <i className="fa-solid fa-plus mr-1.5" />
                  Adicionar janela
                </button>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {schedule.map((item, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800/60 bg-zinc-950/30 p-3"
                >
                  <select
                    value={item.day}
                    onChange={(event) => updateWindow(index, { day: Number(event.target.value) })}
                    disabled={!canEdit || Boolean(busy)}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                  >
                    {DAYS.map((label, day) => (
                      <option key={label} value={day}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500">das</span>
                  <input
                    type="time"
                    value={item.start}
                    onChange={(event) => updateWindow(index, { start: event.target.value })}
                    disabled={!canEdit || Boolean(busy)}
                    className="filter-input w-32 [color-scheme:dark]"
                  />
                  <span className="text-xs text-zinc-500">às</span>
                  <input
                    type="time"
                    value={item.end}
                    onChange={(event) => updateWindow(index, { end: event.target.value })}
                    disabled={!canEdit || Boolean(busy)}
                    className="filter-input w-32 [color-scheme:dark]"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setDraft(schedule.filter((_, i) => i !== index))}
                      disabled={Boolean(busy)}
                      title="Remover janela"
                      className="ml-auto rounded-lg border border-zinc-800/60 px-2.5 py-2 text-xs text-zinc-500 hover:border-red-500/40 hover:text-red-300"
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  )}
                </div>
              ))}
              {!schedule.length && (
                <p className="py-4 text-center text-sm text-zinc-600">Nenhuma janela na agenda.</p>
              )}
            </div>

            {canEdit && draft && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={Boolean(busy)}
                  className="btn-gold disabled:opacity-60"
                >
                  <i className={`fa-solid ${busy === 'schedule' ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
                  Salvar agenda
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  disabled={Boolean(busy)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Descartar alterações
                </button>
              </div>
            )}
          </section>

          <section className="surface-card overflow-hidden">
            <div className="p-4">
              <p className="section-label">Histórico</p>
              <h3 className="section-title mt-1">Quem ligou e desligou</h3>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="px-4 py-2 font-medium">Quando</th>
                    <th className="px-4 py-2 font-medium">Ação</th>
                    <th className="px-4 py-2 font-medium">Origem</th>
                    <th className="px-4 py-2 font-medium">Quem</th>
                    <th className="px-4 py-2 font-medium">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {status.log.map((entry) => (
                    <tr key={entry.id} className="border-b border-zinc-900/80 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{formatDate(entry.createdAt)}</td>
                      <td className={`px-4 py-2.5 ${entry.ok ? 'text-zinc-200' : 'text-red-300'}`}>
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400">{SOURCE_LABELS[entry.source] ?? entry.source}</td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-zinc-400" title={entry.userEmail ?? ''}>
                        {entry.userEmail || '—'}
                      </td>
                      <td className={`px-4 py-2.5 ${entry.ok ? 'text-zinc-300' : 'text-red-300'}`}>{entry.detail}</td>
                    </tr>
                  ))}
                  {!status.log.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-600">
                        Nada registrado ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
