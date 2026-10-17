import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import TopNav from './TopNav.tsx'
import { CommandPalette } from './CommandPalette.tsx'
import { StickerLayer } from '@/components/flash/StickerLayer.tsx'
import { MascotCompanion } from '@/components/mascot/MascotCompanion.tsx'
import { canAccessPath, homePath } from '@/lib/roles.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'

export default function AppShell() {
  const user = useAuthStore((state) => state.user)
  const act = useMascotStore((state) => state.act)
  const { pathname } = useLocation()

  // ao trocar de página, o Tatu "revela" o conteúdo novo
  useEffect(() => {
    if (!useMascotStore.getState().speech) act('reveal', 1500)
  }, [pathname, act])

  if (!canAccessPath(user, pathname)) return <Navigate to={homePath(user)} replace />

  return (
    <div className="app-shell has-topnav">
      <TopNav />
      <MascotCompanion />
      <CommandPalette />

      <div className="main-content">
        <div className="page-inner space-y-6 sm:space-y-8">
          <StickerLayer pathname={pathname} />
          <Outlet />
        </div>
      </div>
    </div>
  )
}
