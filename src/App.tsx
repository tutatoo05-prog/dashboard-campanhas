import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { fetchSession } from '@/services/authService.ts'
import { useAuthStore } from '@/store/authStore.ts'
import LoginPage from '@/pages/LoginPage.tsx'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage.tsx'
import ResetPasswordPage from '@/pages/ResetPasswordPage.tsx'
import AppShell from '@/components/layout/AppShell.tsx'
import DashboardPage from '@/pages/DashboardPage.tsx'
import ActionsPage from '@/pages/ActionsPage.tsx'
import ComparePage from '@/pages/ComparePage.tsx'
import PurchasesPage from '@/pages/PurchasesPage.tsx'
import AcessosPage from '@/pages/AcessosPage.tsx'
import LeadsPage from '@/pages/LeadsPage.tsx'
import RegistrosPage from '@/pages/RegistrosPage.tsx'
import LivePage from '@/pages/LivePage.tsx'
import UsersPage from '@/pages/UsersPage.tsx'
import { isAdmin } from '@/lib/roles.ts'
import { Tatu } from '@/components/mascot/Tatu.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

function AppLoading() {
  return (
    <div className="app-loading">
      <div>
        <Tatu size={56} mood="spin" className="tatu-loading mx-auto" />
        <p className="app-loading-text">Carregando...</p>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status)

  if (status === 'loading') return <AppLoading />
  if (status === 'unauthenticated') return <Navigate to="/login" replace />

  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)

  if (!isAdmin(user)) return <Navigate to="/" replace />

  return <>{children}</>
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status)

  if (status === 'loading') return <AppLoading />
  if (status === 'authenticated') return <Navigate to="/" replace />

  return <>{children}</>
}

function AppRoutes() {
  const status = useAuthStore((state) => state.status)
  const setUser = useAuthStore((state) => state.setUser)
  const setStatus = useAuthStore((state) => state.setStatus)

  useEffect(() => {
    let cancelled = false

    fetchSession()
      .then((session) => {
        if (cancelled) return
        if (session.authenticated && session.user) {
          setUser(session.user)
        } else {
          setStatus('unauthenticated')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('unauthenticated')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (status === 'loading') return <AppLoading />

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <RedirectIfAuthed>
            <ForgotPasswordPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/reset-password"
        element={
          <RedirectIfAuthed>
            <ResetPasswordPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="acoes" element={<ActionsPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route
          path="acessos"
          element={
            <RequireAdmin>
              <AcessosPage />
            </RequireAdmin>
          }
        />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="registros" element={<RegistrosPage />} />
        <Route path="live" element={<LivePage />} />
        <Route
          path="usuarios"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
