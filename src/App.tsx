import { useEffect, useState } from 'react'
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
      // Trocar de tela não refaz a leitura de quem acabou de carregar (o servidor também guarda por alguns minutos).
      staleTime: 60_000,
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

  const [rodada, setRodada] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    // Só vai para o login quando o servidor RESPONDE "não está logado". Servidor lento, fora do ar ou com erro
    // não é logout: tenta de novo algumas vezes e, se continuar, mostra o aviso com o botão "Tentar de novo".
    const tentar = (numero: number) => {
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
          if (cancelled) return
          if (numero >= 4) {
            setStatus('offline')
            return
          }
          timer = setTimeout(() => tentar(numero + 1), 1500 * numero)
        })
    }
    tentar(1)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodada])

  if (status === 'loading') return <AppLoading />
  if (status === 'offline') {
    return (
      <div className="app-loading">
        <div>
          <Tatu size={56} mood="spin" className="mx-auto" />
          <p className="app-loading-text">O servidor demorou para responder. Você continua logado.</p>
          <button
            type="button"
            className="btn-gold mt-4"
            onClick={() => {
              setStatus('loading')
              setRodada((valor) => valor + 1)
            }}
          >
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }

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
