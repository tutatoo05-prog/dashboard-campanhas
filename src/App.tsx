import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { fetchSession } from '@/services/authService.ts'
import { useAuthStore } from '@/store/authStore.ts'
import LoginPage from '@/pages/LoginPage.tsx'
import AppShell from '@/components/layout/AppShell.tsx'
import DashboardPage from '@/pages/DashboardPage.tsx'
import ComparePage from '@/pages/ComparePage.tsx'
import PurchasesPage from '@/pages/PurchasesPage.tsx'
import LeadsPage from '@/pages/LeadsPage.tsx'

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
        <div className="app-loading-spinner" />
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
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="leads" element={<LeadsPage />} />
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
