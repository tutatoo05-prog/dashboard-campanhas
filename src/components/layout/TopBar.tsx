import { useLocation } from 'react-router-dom'
import { useUiStore } from '@/store/uiStore.ts'
import { useTourStore } from '@/store/tourStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { getDisplayName } from '@/lib/userDisplay.ts'

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/acoes': 'Central de Ações',
  '/compare': 'Comparar períodos',
  '/leads': 'Leads',
  '/registros': 'Registros',
  '/purchases': 'Compras',
  '/live': 'Live do Essentials',
  '/usuarios': 'Usuários',
}

export default function TopBar() {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen)
  const startTour = useTourStore((state) => state.start)
  const mascotEnabled = useMascotStore((state) => state.enabled)
  const setMascotEnabled = useMascotStore((state) => state.setEnabled)
  const title = TITLES[location.pathname] ?? 'Dashboard'
  const name = getDisplayName(user)

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
          onClick={handleTour}
          title="Tour com o Tatu"
          aria-label="Tour com o Tatu"
        >
          <i className="fa-solid fa-wand-magic-sparkles text-xs" />
        </button>
        <div className="topbar-user" title={name}>
          {name.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
