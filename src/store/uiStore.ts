import { create } from 'zustand'

const SIDEBAR_KEY = 'dash-sidebar-open'

/** Sem preferência salva, o menu começa recolhido (só ícones). */
function readSidebarPreference(): boolean {
  try {
    if (window.innerWidth < 1280) return false
    return localStorage.getItem(SIDEBAR_KEY) === 'true'
  } catch {
    return false
  }
}

interface UiState {
  sidebarOpen: boolean
  paletteOpen: boolean
  toggleSidebar: () => void
  closeSidebarOnMobile: () => void
  setPaletteOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: readSidebarPreference(),
  paletteOpen: false,
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
  setPaletteOpen: (open) => set({ paletteOpen: open }),
}))
