import { NavLink } from 'react-router-dom'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useUiStore } from '@/store/uiStore.ts'
import { logout } from '@/services/authService.ts'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'fa-chart-line', end: true },
  { to: '/compare', label: 'Comparar', icon: 'fa-chart-column', end: false },
  { to: '/leads', label: 'Leads', icon: 'fa-user-plus', end: false },
  { to: '/purchases', label: 'Compras', icon: 'fa-bag-shopping', end: false },
]

export default function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)

  const userLabel = getDisplayName(user)
  const initial = userLabel.charAt(0).toUpperCase()

  async function handleLogout() {
    await logout()
    setUser(null)
  }

  return (
    <aside
      id="sidebar"
      className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'} fixed inset-y-0 left-0 flex flex-col`}
    >
      <div className="sidebar-header flex h-16 shrink-0 items-center gap-2 border-b border-zinc-800/50 px-2 xl:gap-3 xl:px-3">
        <div className="sidebar-header-inner flex min-w-0 flex-1 items-center gap-2 xl:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold-border bg-gold-dim text-sm font-semibold text-gold">
            {initial}
          </div>
          <div className="sidebar-fade min-w-0 flex-1 overflow-hidden">
            <p className="truncate font-display text-base text-zinc-100">{userLabel}</p>
            <p className="truncate text-[11px] text-zinc-500">{user?.email ?? user?.usuario ?? ''}</p>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-toggle-btn hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-800/80 text-zinc-500 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 xl:inline-flex"
          aria-label={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
          onClick={toggleSidebar}
        >
          <i className="fa-solid fa-chevron-left sidebar-toggle-icon text-[10px]" />
        </button>
      </div>

      <div className="sidebar-body flex flex-1 flex-col overflow-hidden p-3 xl:p-4">
        <p className="sidebar-fade section-label px-1">Navegação</p>
        <nav className="mt-3 space-y-1" aria-label="Menu principal">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `sidebar-nav-btn ${isActive ? 'sidebar-nav-btn-active' : ''}`
              }
              title={item.label}
            >
              <i className={`fa-solid ${item.icon}`} />
              <span className="sidebar-fade">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer shrink-0 border-t border-zinc-800/50 p-3">
        <button
          type="button"
          className="sidebar-logout-btn flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800/80 px-3 py-2.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 xl:justify-start"
          onClick={handleLogout}
        >
          <i className="fa-solid fa-right-from-bracket text-[10px]" />
          <span className="sidebar-fade">Sair</span>
        </button>
        <p className="sidebar-fade mt-3 px-1 text-[10px] leading-relaxed text-zinc-600">
          <i className="fa-solid fa-shield-halved mr-1 text-gold/50" />
          Dados protegidos · Tuzinho Academy
        </p>
      </div>
    </aside>
  )
}
