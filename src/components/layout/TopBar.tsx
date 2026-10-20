import { useLocation } from 'react-router-dom'
import { LiveQuick } from '@/components/layout/LiveQuick.tsx'
import { isAdmin } from '@/lib/roles.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useUiStore } from '@/store/uiStore.ts'
import { useTourStore } from '@/store/tourStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { useThemeStore } from '@/store/themeStore.ts'

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/acoes': 'Central de Ações',
  '/compare': 'Comparar períodos',
  '/leads': 'Leads',
  '/registros': 'Registros',
  '/purchases': 'Compras',
  '/live': 'Live do Essentials',
  '/videos': 'Vídeos',
  '/acessos': 'Acessos',
  '/usuarios': 'Usuários',
  '/seguranca': 'Segurança',
}

export default function TopBar() {
  const location = useLocation()
  const admin = isAdmin(useAuthStore((state) => state.user))
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen)
  const startTour = useTourStore((state) => state.start)
  const mascotEnabled = useMascotStore((state) => state.enabled)
  const setMascotEnabled = useMascotStore((state) => state.setEnabled)
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggle)
  const title = TITLES[location.pathname] ?? 'Dashboard'

  function handleTour() {
    if (!mascotEnabled) setMascotEnabled(true)
    window.setTimeout(startTour, mascotEnabled ? 0 : 400)
  }

  return (
    <header className="topbar flex h-16 shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="topbar-menu-btn inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-400 transition hover:border-white/20 hover:text-zinc-100 xl:hidden"
          aria-label="Abrir menu"
          onClick={toggleSidebar}
        >
          <i className="fa-solid fa-bars text-sm" />
        </button>
        <div className="min-w-0">
          <p className="section-label hidden sm:block">Academy Labs</p>
          <h1 className="topbar-title truncate">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cmdk-trigger"
          onClick={() => setPaletteOpen(true)}
          aria-label="Buscar ou ir para (Ctrl+K)"
        >
          <i className="fa-solid fa-magnifying-glass text-xs" />
          <span className="hidden sm:inline">Buscar ou ir para…</span>
          <kbd className="hidden sm:inline">Ctrl K</kbd>
        </button>
        <button
          type="button"
          className="topbar-icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
          aria-pressed={theme === 'dark'}
        >
          {/* Lâmpada que mostra o tema de agora: acesa no claro, apagada (só o contorno) no escuro. */}
          <i className={theme === 'dark' ? 'fa-regular fa-lightbulb' : 'fa-solid fa-lightbulb topbar-lamp-on'} />
        </button>
        {admin && <LiveQuick />}
        <button type="button" className="topbar-icon-btn" onClick={handleTour} title="Tour com o TaTuzinho" aria-label="Tour guiado com o TaTuzinho">
          <i className="fa-regular fa-circle-question" />
        </button>
      </div>
    </header>
  )
}
