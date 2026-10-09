import { NavLink } from 'react-router-dom'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useUiStore } from '@/store/uiStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { logout } from '@/services/authService.ts'
import { canAccessPath, isAdmin } from '@/lib/roles.ts'
import { Tatu } from '@/components/mascot/Tatu.tsx'
import { Sticker } from '@/components/flash/Sticker.tsx'

interface NavItem {
  to: string
  label: string
  /** Nome do adesivo de tatuagem (ver components/flash/iconData.ts). */
  sticker: string
  end?: boolean
  adminOnly?: boolean
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Visão geral',
    items: [
      { to: '/', label: 'Dashboard', sticker: 'star', end: true },
      { to: '/acoes', label: 'Central de Ações', sticker: 'bolt' },
      { to: '/compare', label: 'Comparar', sticker: 'scales' },
    ],
  },
  {
    title: 'Dados',
    items: [
      { to: '/leads', label: 'Leads', sticker: 'rose' },
      { to: '/registros', label: 'Registros', sticker: 'scroll' },
      { to: '/purchases', label: 'Compras', sticker: 'coin' },
    ],
  },
  { title: 'Operação', items: [{ to: '/live', label: 'Live', sticker: 'lighthouse' }] },
  { title: 'Admin', items: [{ to: '/usuarios', label: 'Usuários', sticker: 'skull', adminOnly: true }] },
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
      className={`sidebar fx-menu ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'} fixed inset-y-0 left-0 flex flex-col`}
    >
      <div className="fx-brand">
        <Tatu size={46} className="tatu-brand" />
        <div className="min-w-0">
          <b>Academy</b>
          <small>LABS</small>
        </div>
        <button type="button" className="fx-close xl:hidden" aria-label="Fechar menu" onClick={toggleSidebar}>
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      <nav className="fx-nav" aria-label="Menu principal">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => (!item.adminOnly || isAdmin(user)) && canAccessPath(user, item.to))
          if (!items.length) return null
          return (
            <div key={section.title}>
              <p className="fx-sec">{section.title}</p>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={closeSidebarOnMobile}
                  className={({ isActive }) => `fx-mi ${isActive ? 'fx-mi-active' : ''}`}
                >
                  <span className="fx-bd">
                    <Sticker name={item.sticker} flat />
                  </span>
                  <span className="fx-lb">{item.label}</span>
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      <div className="fx-foot">
        <button
          type="button"
          className="fx-ticket"
          aria-pressed={mascotEnabled}
          title={mascotEnabled ? 'Desligar o Tatu' : 'Ligar o Tatu'}
          onClick={() => setMascotEnabled(!mascotEnabled)}
        >
          <b>Mascote Tatu</b>
          <span>{mascotEnabled ? 'Ligado — clique para desligar' : 'Desligado — clique para ligar'}</span>
        </button>
        <div className="fx-me">
          <div className="fx-av">{initial}</div>
          <div className="min-w-0 flex-1">
            <b className="truncate">{userLabel}</b>
            <span className="truncate">{user?.email ?? user?.usuario ?? ''}</span>
          </div>
          <button type="button" onClick={handleLogout} title="Sair" aria-label="Sair">
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        </div>
      </div>
    </aside>
  )
}
