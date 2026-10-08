import { NavLink } from 'react-router-dom'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useUiStore } from '@/store/uiStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { logout } from '@/services/authService.ts'
import { canAccessPath, isAdmin } from '@/lib/roles.ts'
import { Tatu } from '@/components/mascot/Tatu.tsx'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'fa-chart-line', end: true },
  { to: '/compare', label: 'Comparar', icon: 'fa-chart-column', end: false },
  { to: '/leads', label: 'Leads', icon: 'fa-user-plus', end: false },
  { to: '/registros', label: 'Registros', icon: 'fa-table-list', end: false },
  { to: '/purchases', label: 'Compras', icon: 'fa-bag-shopping', end: false },
  { to: '/live', label: 'Live', icon: 'fa-tower-broadcast', end: false },
  { to: '/usuarios', label: 'Usuários', icon: 'fa-users-gear', end: false, adminOnly: true },
]

export default function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const closeSidebarOnMobile = useUiStore((state) => state.closeSidebarOnMobile)
  const mascotEnabled = useMascotStore((state) => state.enabled)
  const setMascotEnabled = useMascotStore((state) => state.setEnabled)

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
      <div className="sidebar-header flex shrink-0 items-center gap-2 px-3 pt-5 pb-3">
        <div className="sidebar-brand flex min-w-0 flex-1 items-center gap-3">
          <Tatu size={40} className="tatu-brand" />
          <div className="sidebar-fade min-w-0">
            <p className="truncate font-display text-xl leading-none text-zinc-50">Academy</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-gold">Labs</p>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-toggle-btn hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-500 transition hover:border-white/25 hover:text-zinc-100 xl:inline-flex"
          aria-label={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
          onClick={toggleSidebar}
        >
          <i className="fa-solid fa-chevron-left sidebar-toggle-icon text-[10px]" />
        </button>
      </div>

      <div className="sidebar-body flex flex-1 flex-col overflow-hidden px-3 py-4">
        <nav className="space-y-2" aria-label="Menu principal">
          {NAV_ITEMS.filter((item) => (!item.adminOnly || isAdmin(user)) && canAccessPath(user, item.to)).map(
            (item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={closeSidebarOnMobile}
                className={({ isActive }) => `sidebar-nav-btn ${isActive ? 'sidebar-nav-btn-active' : ''}`}
                title={item.label}
              >
                <i className={`fa-solid ${item.icon}`} />
                <span className="sidebar-fade">{item.label}</span>
              </NavLink>
            ),
          )}
        </nav>
      </div>

      <div className="sidebar-footer shrink-0 space-y-2 px-3 pt-3 pb-4">
        <button
          type="button"
          className="sidebar-nav-btn sidebar-mascot-btn"
          aria-pressed={mascotEnabled}
          title={mascotEnabled ? 'Desligar o Tatu' : 'Ligar o Tatu'}
          onClick={() => setMascotEnabled(!mascotEnabled)}
        >
          <i className={`fa-solid ${mascotEnabled ? 'fa-toggle-on' : 'fa-toggle-off'}`} />
          <span className="sidebar-fade">Mascote Tatu</span>
        </button>
        <button type="button" className="sidebar-nav-btn" onClick={handleLogout} title="Sair">
          <i className="fa-solid fa-right-from-bracket" />
          <span className="sidebar-fade">Sair</span>
        </button>
        <div className="sidebar-user flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-dim text-sm font-semibold text-gold">
            {initial}
          </div>
          <div className="sidebar-fade min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100">{userLabel}</p>
            <p className="truncate text-[11px] text-zinc-500">{user?.email ?? user?.usuario ?? ''}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
