import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { canAccessPath, homePath } from '@/lib/roles.ts'
import { useAuthStore } from '@/store/authStore.ts'
import Sidebar from './Sidebar.tsx'
import TopBar from './TopBar.tsx'
import { MascotCompanion } from '@/components/mascot/MascotCompanion.tsx'
import { useUiStore } from '@/store/uiStore.ts'

export default function AppShell() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const closeSidebarOnMobile = useUiStore((state) => state.closeSidebarOnMobile)

  const user = useAuthStore((state) => state.user)
  const { pathname } = useLocation()

  if (!canAccessPath(user, pathname)) return <Navigate to={homePath(user)} replace />

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
      <Sidebar />
      <div
        id="sidebar-backdrop"
        className={sidebarOpen ? 'sidebar-backdrop-visible' : 'hidden'}
        onClick={closeSidebarOnMobile}
      />

      <MascotCompanion />

      <div className="main-content">
        <TopBar />
        <div className="page-inner space-y-6 sm:space-y-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
