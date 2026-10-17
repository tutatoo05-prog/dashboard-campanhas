import { create } from 'zustand'

const SIDEBAR_KEY = 'dash-sidebar-open'

/** No computador o menu começa aberto; a pessoa recolhe (só ícones) e a escolha fica salva. */
function readSidebarPreference(): boolean {
  try {
    if (window.innerWidth < 1280) return false
    return localStorage.getItem(SIDEBAR_KEY) !== 'false'
  } catch {
    return false
  }
}

interface UiState {
  sidebarOpen: boolean
  paletteOpen: boolean
  userModalOpen: boolean
  setUserModalOpen: (open: boolean) => void
  toggleSidebar: () => void
  closeSidebarOnMobile: () => void
  setPaletteOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: readSidebarPreference(),
  paletteOpen: false,
  userModalOpen: false,
  setUserModalOpen: (open) => set({ userModalOpen: open }),
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
