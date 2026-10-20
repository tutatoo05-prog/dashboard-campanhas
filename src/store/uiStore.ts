import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean
  paletteOpen: boolean
  toggleSidebar: () => void
  closeSidebarOnMobile: () => void
  setPaletteOpen: (open: boolean) => void
}

/**
 * O menu lateral SEMPRE começa fechado ao abrir o sistema (no computador fica só a faixa de ícones; no celular some).
 * A pessoa abre quando quiser; a escolha vale só até recarregar a página (não é mais guardada).
 */
export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: false,
  paletteOpen: false,
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  closeSidebarOnMobile: () => {
    if (window.innerWidth < 1280 && get().sidebarOpen) {
      set({ sidebarOpen: false })
    }
  },
  setPaletteOpen: (open) => set({ paletteOpen: open }),
}))
