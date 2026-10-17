import { create } from 'zustand'

export type Theme = 'light' | 'dark'
/** "auto" segue o tema do computador/celular. */
export type ThemeMode = Theme | 'auto'

const THEME_KEY = 'dash-theme'
const THEME_COLORS: Record<Theme, string> = { light: '#efe2c4', dark: '#14100b' }

function readMode(): ThemeMode {
  try {
    const salvo = localStorage.getItem(THEME_KEY)
    return salvo === 'dark' || salvo === 'auto' ? salvo : 'light'
  } catch {
    return 'light'
  }
}

function resolve(mode: ThemeMode): Theme {
  if (mode !== 'auto') return mode
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Liga o tema no <html> (o CSS lê data-theme) e ajusta a cor da barra do navegador. */
function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

interface ThemeState {
  /** O que a pessoa escolheu: claro, escuro ou automático. */
  mode: ThemeMode
  /** O tema que está valendo agora (o automático já resolvido). */
  theme: Theme
  setMode: (mode: ThemeMode) => void
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readMode(),
  theme: resolve(readMode()),
  setMode: (mode) => {
    const theme = resolve(mode)
    set({ mode, theme })
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_KEY, mode)
    } catch {
      /* ignore */
    }
  },
  setTheme: (theme) => get().setMode(theme),
  toggle: () => get().setMode(get().theme === 'dark' ? 'light' : 'dark'),
}))

applyTheme(resolve(readMode()))

// No modo automático, acompanha o sistema quando a pessoa troca o tema do computador.
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().mode === 'auto') useThemeStore.getState().setMode('auto')
  })
} catch {
  /* navegador sem matchMedia */
}
