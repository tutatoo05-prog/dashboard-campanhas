import { NavLink } from 'react-router-dom'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useUiStore } from '@/store/uiStore.ts'
import { canAccessPath, isAdmin } from '@/lib/roles.ts'
import { Tatu } from '@/components/mascot/Tatu.tsx'
import { Avatar } from '@/components/layout/Avatar.tsx'
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
]

export default function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const closeSidebarOnMobile = useUiStore((state) => state.closeSidebarOnMobile)
  const setUserModalOpen = useUiStore((state) => state.setUserModalOpen)
  const userLabel = getDisplayName(user)

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
        <button type="button" className="fx-close" aria-label={sidebarOpen ? 'Recolher menu' : 'Expandir menu'} title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'} onClick={toggleSidebar}>
          <i className={`fa-solid ${sidebarOpen ? 'fa-angles-left' : 'fa-angles-right'}`} />
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
        <button type="button" className="fx-me" onClick={() => setUserModalOpen(true)} aria-haspopup="dialog" aria-label="Abrir minha conta">
          <Avatar user={user} size={38} />
          <span className="fx-me-txt min-w-0 flex-1">
            <b className="truncate">{userLabel}</b>
            <span className="truncate">{isAdmin(user) ? 'Administrador' : 'Usuário'}</span>
          </span>
          <i className="fa-solid fa-sliders fx-me-dots" />
        </button>
      </div>
    </aside>
  )
}
