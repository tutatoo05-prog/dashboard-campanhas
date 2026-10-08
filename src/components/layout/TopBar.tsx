import { useLocation } from 'react-router-dom'
import { useUiStore } from '@/store/uiStore.ts'

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/compare': 'Comparar períodos',
  '/leads': 'Leads',
  '/purchases': 'Compras',
  '/live': 'Live do Essentials',
}

export default function TopBar() {
  const location = useLocation()
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const title = TITLES[location.pathname] ?? 'Dashboard'

  return (
    <header className="topbar flex h-16 shrink-0 items-center justify-between gap-3 border-b border-zinc-800/50 px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="topbar-menu-btn inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800/80 text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 xl:hidden"
          aria-label="Abrir menu"
          onClick={toggleSidebar}
        >
          <i className="fa-solid fa-bars text-sm" />
        </button>
        <h1 className="font-display text-lg text-zinc-100 sm:text-xl">{title}</h1>
      </div>
    </header>
  )
}
