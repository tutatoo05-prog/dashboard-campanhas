import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Tatu } from '@/components/mascot/Tatu.tsx'
import { Sticker } from '@/components/flash/Sticker.tsx'
import { Avatar } from '@/components/layout/Avatar.tsx'
import { logout } from '@/services/authService.ts'
import { NAV_GROUPS, type NavItem } from '@/lib/navItems.ts'
import { canAccessPath } from '@/lib/roles.ts'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { isAdmin } from '@/lib/roles.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { useThemeStore, type ThemeMode } from '@/store/themeStore.ts'
import { useTourStore } from '@/store/tourStore.ts'
import { useUiStore } from '@/store/uiStore.ts'

const MODOS: { id: ThemeMode; rotulo: string }[] = [
  { id: 'light', rotulo: 'Claro' },
  { id: 'dark', rotulo: 'Escuro' },
  { id: 'auto', rotulo: 'Auto' },
]

/** Menu do topo (substitui a barra lateral): dock de adesivos, busca, tema e o menu da conta. */
export default function TopNav() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen)
  const menuLabels = useUiStore((state) => state.menuLabels)
  const mode = useThemeStore((state) => state.mode)
  const theme = useThemeStore((state) => state.theme)
  const setMode = useThemeStore((state) => state.setMode)
  const toggleTheme = useThemeStore((state) => state.toggle)
  const startTour = useTourStore((state) => state.start)
  const mascotEnabled = useMascotStore((state) => state.enabled)
  const setMascotEnabled = useMascotStore((state) => state.setEnabled)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuAberto, setMenuAberto] = useState(false)
  const [folhaAberta, setFolhaAberta] = useState(false)
  const acoesRef = useRef<HTMLDivElement>(null)

  const nome = getDisplayName(user)
  const admin = isAdmin(user)
  const visiveis = (item: NavItem) => (!item.adminOnly || admin) && canAccessPath(user, item.to)
  const grupos = NAV_GROUPS.map((grupo) => ({ ...grupo, items: grupo.items.filter(visiveis) })).filter((grupo) => grupo.items.length)

  // fecha os menus ao trocar de página, ao clicar fora e com Esc
  useEffect(() => {
    setMenuAberto(false)
    setFolhaAberta(false)
  }, [pathname])
  useEffect(() => {
    function fora(evento: MouseEvent) {
      if (acoesRef.current && !acoesRef.current.contains(evento.target as Node)) setMenuAberto(false)
    }
    function esc(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        setMenuAberto(false)
        setFolhaAberta(false)
      }
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [])

  async function sair() {
    await logout()
    setUser(null)
  }

  function tour() {
    setMenuAberto(false)
    if (!mascotEnabled) setMascotEnabled(true)
    window.setTimeout(startTour, mascotEnabled ? 0 : 400)
  }

  function ir(destino: string) {
    setMenuAberto(false)
    setFolhaAberta(false)
    navigate(destino)
  }

  const principais = grupos.flatMap((grupo) => grupo.items)
  const barra = [principais.find((i) => i.to === '/'), principais.find((i) => i.to === '/acoes'), principais.find((i) => i.to === '/leads'), principais.find((i) => i.to === '/purchases')].filter(Boolean) as NavItem[]
  const barraFinal = barra.length ? barra : principais.slice(0, 3)

  return (
    <>
      <header className={`tn ${menuLabels ? 'tn-labels' : ''}`}>
        <NavLink to="/" className="tn-brand" aria-label="Academy Labs, ir para o Dashboard">
          <Tatu size={44} className="tatu-brand" />
          <div>
            <b>Academy</b>
            <small>LABS</small>
          </div>
        </NavLink>

        <nav className="tn-dock" aria-label="Menu principal">
          {grupos.map((grupo) => (
            <div key={grupo.title} className="tn-group" data-name={grupo.title}>
              {grupo.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `tn-item ${isActive ? 'tn-on' : ''}`} aria-label={item.label}>
                  <span className="tn-ic">
                    <Sticker name={item.sticker} flat />
                  </span>
                  <span className="tn-tip">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="tn-actions" ref={acoesRef}>
          <button type="button" className="tn-search" onClick={() => setPaletteOpen(true)} aria-label="Buscar ou ir para (Ctrl+K)">
            <i className="fa-solid fa-magnifying-glass" />
            <span className="tn-txt">Buscar ou ir para…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button type="button" className="tn-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}>
            <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
          </button>
          <button type="button" className="tn-me" onClick={() => setMenuAberto((v) => !v)} aria-haspopup="menu" aria-expanded={menuAberto} aria-label="Menu da conta">
            <Avatar user={user} size={36} />
            <span className="tn-who">
              <b>{nome}</b>
              <small>{admin ? 'admin' : 'usuário'}</small>
            </span>
          </button>

          {menuAberto && (
            <div className="tn-pop" role="menu">
              <div className="tn-pop-head">
                <Avatar user={user} size={48} />
                <div className="min-w-0">
                  <b>{nome}</b>
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
              <div className="tn-sep" />
              <div className="tn-row" style={{ cursor: 'default' }}>
                <i className="fa-solid fa-palette" /> Tema
                <span className="tn-seg">
                  {MODOS.map((m) => (
                    <button key={m.id} type="button" className={mode === m.id ? 'tn-sel' : ''} onClick={() => setMode(m.id)}>
                      {m.rotulo}
                    </button>
                  ))}
                </span>
              </div>
              <button type="button" className="tn-row" onClick={() => setMascotEnabled(!mascotEnabled)}>
                <i className="fa-solid fa-paw" /> Mascote TaTuzinho
                <span className="tn-seg">
                  <button type="button" className={mascotEnabled ? 'tn-sel' : ''}>
                    Ligado
                  </button>
                  <button type="button" className={!mascotEnabled ? 'tn-sel' : ''}>
                    Desligado
                  </button>
                </span>
              </button>
              <button type="button" className="tn-row" onClick={tour}>
                <i className="fa-solid fa-wand-magic-sparkles" /> Tour com o TaTuzinho
              </button>
              <div className="tn-sep" />
              <button type="button" className="tn-row" onClick={() => void sair()}>
                <i className="fa-solid fa-right-from-bracket" /> Sair
              </button>
            </div>
          )}
        </div>
      </header>

      {/* celular: barra de baixo + folha "Mais" */}
      <nav className="tn-bar" aria-label="Menu">
        {barraFinal.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'tn-on' : '')}>
            <span className="tn-ic">
              <Sticker name={item.sticker} flat />
            </span>
            {item.label === 'Central de Ações' ? 'Ações' : item.label === 'Dashboard' ? 'Início' : item.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setFolhaAberta(true)}>
          <span className="tn-ic">
            <Sticker name="swallow" flat />
          </span>
          Mais
        </button>
      </nav>
      <div className={`tn-sheet ${folhaAberta ? 'tn-open' : ''}`}>
        <div className="tn-back" onClick={() => setFolhaAberta(false)} />
        <div className="tn-body">
          {grupos.map((grupo) => (
            <div key={grupo.title}>
              <h4>{grupo.title}</h4>
              <div className="tn-grid">
                {grupo.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}>
                    <span className="tn-ic">
                      <Sticker name={item.sticker} flat />
                    </span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <h4>Você</h4>
          <div className="tn-grid">
            <button type="button" onClick={() => ir('/perfil')}>
              <span className="tn-ic">
                <Sticker name="swallow" flat />
              </span>
              Minha conta
            </button>
            {admin && (
              <button type="button" onClick={() => ir('/config')}>
                <span className="tn-ic">
                  <Sticker name="eye" flat />
                </span>
                Configurações
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
