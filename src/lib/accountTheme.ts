export type AccountTheme = {
  dot: string
  ring: string
  text: string
  vars: {
    '--gold': string
    '--gold-light': string
    '--gold-dark': string
    '--gold-dim': string
    '--gold-border': string
  }
}

const THEMES: { match: RegExp; theme: AccountTheme }[] = [
  {
    match: /original/i,
    theme: {
      dot: 'bg-red-500',
      ring: 'focus:ring-red-500/40 border-l-2 border-l-red-500',
      text: 'text-red-400',
      vars: {
        '--gold': '#ef4444',
        '--gold-light': '#f87171',
        '--gold-dark': '#b91c1c',
        '--gold-dim': 'rgba(239, 68, 68, 0.1)',
        '--gold-border': 'rgba(239, 68, 68, 0.22)',
      },
    },
  },
  {
    match: /con[e3]ct/i,
    theme: {
      dot: 'bg-blue-500',
      ring: 'focus:ring-blue-500/40 border-l-2 border-l-blue-500',
      text: 'text-blue-400',
      vars: {
        '--gold': '#3b82f6',
        '--gold-light': '#60a5fa',
        '--gold-dark': '#1d4ed8',
        '--gold-dim': 'rgba(59, 130, 246, 0.1)',
        '--gold-border': 'rgba(59, 130, 246, 0.22)',
      },
    },
  },
  {
    match: /academy/i,
    theme: {
      dot: 'bg-amber-400',
      ring: 'focus:ring-amber-400/40 border-l-2 border-l-amber-400',
      text: 'text-amber-300',
      vars: {
        '--gold': '#ffa31a',
        '--gold-light': '#ffc04d',
        '--gold-dark': '#d98200',
        '--gold-dim': 'rgba(255, 163, 26, 0.1)',
        '--gold-border': 'rgba(255, 163, 26, 0.22)',
      },
    },
  },
]

const DEFAULT_THEME: AccountTheme = {
  dot: 'bg-zinc-500',
  ring: 'focus:ring-zinc-500/40',
  text: 'text-zinc-400',
  vars: {
    '--gold': '#ffa31a',
    '--gold-light': '#ffc04d',
    '--gold-dark': '#d98200',
    '--gold-dim': 'rgba(255, 163, 26, 0.1)',
    '--gold-border': 'rgba(255, 163, 26, 0.22)',
  },
}

export function getAccountTheme(accountName: string | null | undefined): AccountTheme {
  if (!accountName) return DEFAULT_THEME
  const found = THEMES.find(({ match }) => match.test(accountName))
  return found ? found.theme : DEFAULT_THEME
}

/** Aplica a paleta da conta nas variáveis CSS globais (--gold*), refletindo em todo o app. */
export function applyAccountThemeVars(theme: AccountTheme): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value)
  }
}
