import { useLocation } from 'react-router-dom'
import { TopActions } from '@/components/layout/TopActions.tsx'
import { useUiStore } from '@/store/uiStore.ts'

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
  '/monitoramento': 'Monitoramento',
}

export default function TopBar() {
  const location = useLocation()
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const title = TITLES[location.pathname] ?? 'Dashboard'

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

      {/* No celular estes botões ficam no MobileDock (botão flutuante), para não cobrir o nome da página. */}
      <div className="hidden items-center gap-2 md:flex">
        <TopActions />
      </div>
    </header>
  )
}
