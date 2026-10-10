import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'dash-theme'
const THEME_COLORS: Record<Theme, string> = { light: '#efe2c4', dark: '#14100b' }

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
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
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    set({ theme })
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))

applyTheme(readTheme())
