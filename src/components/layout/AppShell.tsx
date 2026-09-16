import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.tsx'
import TopBar from './TopBar.tsx'
import { useUiStore } from '@/store/uiStore.ts'

export default function AppShell() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const closeSidebarOnMobile = useUiStore((state) => state.closeSidebarOnMobile)

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
      <Sidebar />
      <div
        id="sidebar-backdrop"
        className={sidebarOpen ? 'sidebar-backdrop-visible' : 'hidden'}
        onClick={closeSidebarOnMobile}
      />

      <div className="main-content">
        <TopBar />
        <div className="page-inner space-y-6 sm:space-y-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
