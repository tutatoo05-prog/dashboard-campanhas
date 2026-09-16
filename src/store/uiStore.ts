import { create } from 'zustand'

const SIDEBAR_KEY = 'dash-sidebar-open'

function readSidebarPreference(): boolean {
  try {
    if (window.innerWidth < 1280) return false
    return localStorage.getItem(SIDEBAR_KEY) !== 'false'
  } catch {
    return window.innerWidth >= 1280
  }
}

interface UiState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebarOnMobile: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: readSidebarPreference(),
  toggleSidebar: () => {
    const next = !get().sidebarOpen
    set({ sidebarOpen: next })
    try {
      localStorage.setItem(SIDEBAR_KEY, String(next))
    } catch {
      /* ignore */
    }
  },
  closeSidebarOnMobile: () => {
    if (window.innerWidth < 1280 && get().sidebarOpen) {
      set({ sidebarOpen: false })
    }
  },
}))
