import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useUiStore } from '@/store/uiStore.ts'
import { canAccessPath, isAdmin } from '@/lib/roles.ts'
import { Tatu } from '@/components/mascot/Tatu.tsx'
import { UserMenu } from '@/components/layout/UserMenu.tsx'
import { logout } from '@/services/authService.ts'
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
  {
    title: 'Operação',
    items: [
      { to: '/monitoramento', label: 'Monitoramento', sticker: 'lighthouse', adminOnly: true },
      { to: '/financas', label: 'Finanças', sticker: 'crown', adminOnly: true },
    ],
  },
]

export default function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const closeSidebarOnMobile = useUiStore((state) => state.closeSidebarOnMobile)
  const setUser = useAuthStore((state) => state.setUser)
  const { pathname } = useLocation()
  const [menuAberto, setMenuAberto] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const blocoRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMenuAberto(false), [pathname])
  useEffect(() => {
    if (!menuAberto) return
    function fora(evento: MouseEvent) {
      const alvo = evento.target as Node
      if (!blocoRef.current?.contains(alvo) && !popRef.current?.contains(alvo)) setMenuAberto(false)
    }
    function esc(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setMenuAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [menuAberto])

  function alternarMenu() {
    if (!menuAberto && blocoRef.current) {
      const r = blocoRef.current.getBoundingClientRect()
      const lateral = r.width < 120
      setPos({ left: lateral ? r.right + 10 : r.left, top: Math.min(r.bottom + 6, window.innerHeight - 440) })
    }
    setMenuAberto((v) => !v)
  }

  /** O cartão inteiro abre o menu da conta. O "Sair" tem ação própria, e o menu aberto (que é filho do cartão
   * no React, mesmo desenhado no <body>) não deve se fechar por cliques dentro dele. */
  function cliqueNoCartao(evento: ReactMouseEvent<HTMLDivElement>) {
    const alvo = evento.target as HTMLElement
    if (alvo.closest('.fx-out') || popRef.current?.contains(alvo)) return
    alternarMenu()
  }

  async function sair() {
    await logout()
    setUser(null)
  }
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

      <div className="fx-user" ref={blocoRef} onClick={cliqueNoCartao}>
        <button type="button" className="fx-user-id" aria-label="Abrir menu da conta" title={userLabel}>
          <Avatar user={user} size={34} />
        </button>
        <div className="fx-user-txt">
          <b className="truncate" data-sensivel>{userLabel}</b>
          <button type="button" className="fx-out" onClick={() => void sair()}>
            Sair
          </button>
        </div>
        <button type="button" className="fx-plus" aria-haspopup="menu" aria-expanded={menuAberto} aria-label="Mais opções da conta" title="Mais opções">
          <i className="fa-solid fa-ellipsis" />
        </button>
        {menuAberto &&
          createPortal(
            <div ref={popRef} className="dd-wrap" style={{ left: pos.left, top: pos.top }}>
              <UserMenu onClose={() => setMenuAberto(false)} />
            </div>,
            document.body,
          )}
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

    </aside>
  )
}
