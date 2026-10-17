import { create } from 'zustand'

const LABELS_KEY = 'dash-menu-labels'

function readMenuLabels(): boolean {
  try {
    return localStorage.getItem(LABELS_KEY) === 'true'
  } catch {
    return false
  }
}

interface UiState {
  paletteOpen: boolean
  /** Mostrar o nome embaixo dos ícones do menu (preferência de cada pessoa, salva no navegador). */
  menuLabels: boolean
  setPaletteOpen: (open: boolean) => void
  setMenuLabels: (on: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  paletteOpen: false,
  menuLabels: readMenuLabels(),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setMenuLabels: (on) => {
    set({ menuLabels: on })
    try {
      localStorage.setItem(LABELS_KEY, String(on))
    } catch {
      /* ignore */
    }
  },
}))
