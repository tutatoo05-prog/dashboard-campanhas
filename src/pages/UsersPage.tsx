import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUsers, updateUserRole } from '@/services/usersService.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { formatNumber } from '@/lib/format.ts'
import type { Cargo, ManagedUser } from '@/types'

const CARGO_LABELS: Record<Cargo, string> = {
  admin: 'Administrador',
  usuario: 'Usuário',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const me = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const [savingId, setSavingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    retry: false,
  })

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const admins = users.filter((user) => user.cargo === 'admin').length

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return users
    return users.filter((user) =>
      [user.nome, user.email, user.usuario].some((value) => value?.toLowerCase().includes(term)),
    )
  }, [users, search])

  async function handleChange(target: ManagedUser, cargo: Cargo) {
    if (cargo === target.cargo) return
    const isMe = target.id === me?.id
    const question =
      cargo === 'admin'
        ? `Tornar ${target.nome || target.email} administrador?\n\nEle poderá alterar tudo no dash, inclusive a Live e os cargos.`
        : `Tornar ${target.nome || target.email} usuário comum?\n\nEle continua vendo tudo, mas não poderá alterar nada.${
            isMe ? '\n\nAtenção: é você. Você perde o acesso a esta tela.' : ''
          }`
    if (!window.confirm(question)) return

    setSavingId(target.id)
    setActionError('')
    setNotice('')
    try {
      const updated = await updateUserRole(target.id, cargo)
      queryClient.setQueryData<ManagedUser[]>(['users'], (current) =>
        (current ?? []).map((user) => (user.id === updated.id ? updated : user)),
      )
      setNotice(`${updated.nome || updated.email} agora é ${CARGO_LABELS[updated.cargo].toLowerCase()}.`)
      if (isMe && me) setUser({ ...me, cargo: updated.cargo })
    } catch (error) {
      const message = (error as Error).message
      setActionError(message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : message)
    } finally {
      setSavingId('')
    }
  }

  const error = usersQuery.error as Error | null

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="hero-panel p-6 sm:p-8">
        <p className="section-label">Administração</p>
        <h2 className="section-title mt-1">Usuários</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Todos os cadastrados no dash e o cargo de cada um. A mudança vale na hora, sem precisar sair e entrar
          de novo.
        </p>
        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/30 p-3">
            <p className="font-medium text-amber-200">
              <i className="fa-solid fa-crown mr-1.5" />
              Administrador
            </p>
            <p className="mt-1 text-zinc-500">
              Acesso a tudo: vê e altera (metas, Live, agenda e cargos dos usuários).
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/30 p-3">
            <p className="font-medium text-zinc-300">
              <i className="fa-solid fa-user mr-1.5" />
              Usuário
            </p>
            <p className="mt-1 text-zinc-500">
              Usa todas as telas e pode gerar relatório, mas não altera nada.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {error.message === 'SESSION_EXPIRED'
            ? 'Sua sessão expirou. Faça login novamente.'
            : error.message || 'Não foi possível carregar os usuários.'}
        </section>
      )}

      {actionError && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          <i className="fa-solid fa-triangle-exclamation mr-2" />
          {actionError}
        </section>
      )}

      {notice && !actionError && (
        <section className="surface-card border-emerald-500/30 p-4 text-sm text-emerald-300">
          <i className="fa-solid fa-circle-check mr-2" />
          {notice}
        </section>
      )}

      {usersQuery.isLoading && !error && (
        <section className="surface-card p-8 text-center text-sm text-zinc-500">Carregando usuários...</section>
      )}

      {usersQuery.data && (
        <section className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="section-label">Cadastrados</p>
              <h3 className="section-title mt-1">
                {formatNumber(users.length)} {users.length === 1 ? 'usuário' : 'usuários'}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                {formatNumber(admins)} {admins === 1 ? 'administrador' : 'administradores'}
              </p>
            </div>
            <input
              type="text"
              placeholder="Buscar nome ou e-mail..."
              className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950/95">
                <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">E-mail</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                  <th className="px-4 py-2 font-medium">Cadastro</th>
                  <th className="px-4 py-2 font-medium">Cargo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const isMe = user.id === me?.id
                  const lastAdmin = user.cargo === 'admin' && admins <= 1
                  return (
                    <tr key={user.id} className="border-b border-zinc-900/80 last:border-0">
                      <td className="px-4 py-2.5 text-zinc-200">
                        {user.nome || '—'}
                        {isMe && <span className="ml-2 text-[10px] text-zinc-500">(você)</span>}
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-2.5 text-zinc-400" title={user.email}>
                        {user.email}
                      </td>
                      <td className="px-4 py-2.5">
                        {user.ativo ? (
                          <span className="rounded-full border border-emerald-500/25 px-2 py-0.5 text-[11px] text-emerald-300">
                            ativo
                          </span>
                        ) : (
                          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
                            aguardando aprovação
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={user.cargo}
                            onChange={(event) => handleChange(user, event.target.value as Cargo)}
                            disabled={Boolean(savingId) || lastAdmin}
                            title={lastAdmin ? 'É preciso ter pelo menos um administrador' : undefined}
                            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-60"
                          >
                            <option value="admin">{CARGO_LABELS.admin}</option>
                            <option value="usuario">{CARGO_LABELS.usuario}</option>
                          </select>
                          {savingId === user.id && <i className="fa-solid fa-spinner fa-spin text-xs text-zinc-500" />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!filtered.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-600">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
