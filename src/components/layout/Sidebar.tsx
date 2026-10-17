import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useUiStore } from '@/store/uiStore.ts'
import { useThemeStore, type ThemeMode } from '@/store/themeStore.ts'
import { useTourStore } from '@/store/tourStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { logout } from '@/services/authService.ts'
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
  {
    title: 'Operação',
    items: [
      { to: '/live', label: 'Live', sticker: 'lighthouse' },
      { to: '/acessos', label: 'Acessos', sticker: 'crown', adminOnly: true },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/usuarios', label: 'Usuários', sticker: 'skull', adminOnly: true },
      { to: '/seguranca', label: 'Segurança', sticker: 'eye', adminOnly: true },
    ],
  },
]

const MODOS: { id: ThemeMode; rotulo: string }[] = [
  { id: 'light', rotulo: 'Claro' },
  { id: 'dark', rotulo: 'Escuro' },
  { id: 'auto', rotulo: 'Auto' },
]

export default function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const closeSidebarOnMobile = useUiStore((state) => state.closeSidebarOnMobile)
  const mascotEnabled = useMascotStore((state) => state.enabled)
  const setMascotEnabled = useMascotStore((state) => state.setEnabled)

  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)
  const startTour = useTourStore((state) => state.start)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [popAberto, setPopAberto] = useState(false)
  const rodapeRef = useRef<HTMLDivElement>(null)
  const admin = isAdmin(user)

  useEffect(() => setPopAberto(false), [pathname])
  useEffect(() => {
    function fora(evento: MouseEvent) {
      if (rodapeRef.current && !rodapeRef.current.contains(evento.target as Node)) setPopAberto(false)
    }
    function esc(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setPopAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [])

  function ir(destino: string) {
    setPopAberto(false)
    closeSidebarOnMobile()
    navigate(destino)
  }

  function tour() {
    setPopAberto(false)
    closeSidebarOnMobile()
    if (!mascotEnabled) setMascotEnabled(true)
    window.setTimeout(startTour, mascotEnabled ? 0 : 400)
  }

  const userLabel = getDisplayName(user)

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
        <button
          type="button"
          className="fx-ticket"
          aria-pressed={mascotEnabled}
          title={mascotEnabled ? 'Desligar o TaTuzinho' : 'Ligar o TaTuzinho'}
          onClick={() => setMascotEnabled(!mascotEnabled)}
        >
          <b>Mascote TaTuzinho</b>
          <span>{mascotEnabled ? 'Ligado — clique para desligar' : 'Desligado — clique para ligar'}</span>
        </button>
        <div className="fx-me-wrap" ref={rodapeRef}>
          {popAberto && (
            <div className="tn-pop fx-pop" role="menu">
              <div className="tn-pop-head">
                <Avatar user={user} size={48} />
                <div className="min-w-0">
                  <b>{userLabel}</b>
                  <small>{user?.email ?? user?.usuario ?? ''}</small>
                  <br />
                  <span className="tn-role">{admin ? 'ADMIN' : 'USUÁRIO'}</span>
                </div>
              </div>
              <button type="button" className="tn-row" onClick={() => ir('/perfil')}>
                <i className="fa-solid fa-id-card" /> Minha conta
              </button>
              {admin && (
                <button type="button" className="tn-row" onClick={() => ir('/config')}>
                  <i className="fa-solid fa-gear" /> Configurações do sistema
                </button>
              )}
              {admin && (
                <button type="button" className="tn-row" onClick={() => ir('/config/seguranca')}>
                  <i className="fa-solid fa-shield-halved" /> Segurança e backup
                </button>
              )}
              {admin && (
                <button type="button" className="tn-row" onClick={() => ir('/config/usuarios')}>
                  <i className="fa-solid fa-users-gear" /> Usuários e cargos
                </button>
              )}
              <div className="tn-sep" />
              <div className="tn-row" style={{ cursor: 'default' }}>
                <i className="fa-solid fa-palette" /> Tema
                <span className="tn-seg">
                  {MODOS.map((item) => (
                    <button key={item.id} type="button" className={mode === item.id ? 'tn-sel' : ''} onClick={() => setMode(item.id)}>
                      {item.rotulo}
                    </button>
                  ))}
                </span>
              </div>
              <button type="button" className="tn-row" onClick={tour}>
                <i className="fa-solid fa-wand-magic-sparkles" /> Tour com o TaTuzinho
              </button>
              <div className="tn-sep" />
              <button type="button" className="tn-row" onClick={() => void handleLogout()}>
                <i className="fa-solid fa-right-from-bracket" /> Sair
              </button>
            </div>
          )}
          <button type="button" className="fx-me" onClick={() => setPopAberto((v) => !v)} aria-haspopup="menu" aria-expanded={popAberto} aria-label="Menu da conta">
            <Avatar user={user} size={38} />
            <span className="fx-me-txt min-w-0 flex-1">
              <b className="truncate">{userLabel}</b>
              <span className="truncate">{admin ? 'Administrador' : 'Usuário'}</span>
            </span>
            <i className="fa-solid fa-ellipsis-vertical fx-me-dots" />
          </button>
        </div>
      </div>
    </aside>
  )
}
