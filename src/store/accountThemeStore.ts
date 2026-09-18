import { create } from 'zustand'
import { applyAccountThemeVars, getAccountTheme } from '@/lib/accountTheme.ts'

const ACCOUNT_NAME_KEY = 'dash-active-account-name'

function readStoredAccountName(): string | null {
  try {
    return localStorage.getItem(ACCOUNT_NAME_KEY)
  } catch {
    return null
  }
}

interface AccountThemeState {
  accountName: string | null
  setAccountName: (name: string | null | undefined) => void
}

export const useAccountThemeStore = create<AccountThemeState>((set, get) => ({
  accountName: readStoredAccountName(),
  setAccountName: (name) => {
    const normalized = name ?? null
    if (normalized === get().accountName) return

    set({ accountName: normalized })
    applyAccountThemeVars(getAccountTheme(normalized))

    try {
      if (normalized) localStorage.setItem(ACCOUNT_NAME_KEY, normalized)
      else localStorage.removeItem(ACCOUNT_NAME_KEY)
    } catch {
      /* ignore */
    }
  },
}))

applyAccountThemeVars(getAccountTheme(readStoredAccountName()))
