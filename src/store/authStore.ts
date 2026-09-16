import { create } from 'zustand'
import type { User } from '@/types'
import { pickNameFromUser } from '@/lib/userName.ts'

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  user: User | null
  setUser: (user: User | null) => void
  setStatus: (status: AuthState['status']) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  setUser: (user) => {
    try {
      localStorage.removeItem('dash-user-name')
    } catch {
      /* ignore */
    }

    const nome = user ? pickNameFromUser(user) : null
    const nextUser = user && nome ? { ...user, nome } : user

    if (nome) {
      try {
        localStorage.setItem('dash-user-name', nome)
      } catch {
        /* ignore */
      }
    }

    set({ user: nextUser, status: nextUser ? 'authenticated' : 'unauthenticated' })
  },
  setStatus: (status) => set({ status }),
}))
