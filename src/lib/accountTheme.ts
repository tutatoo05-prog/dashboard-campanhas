export type AccountTheme = {
  dot: string
  ring: string
  text: string
}

const THEMES: { match: RegExp; theme: AccountTheme }[] = [
  {
    match: /original/i,
    theme: { dot: 'bg-red-500', ring: 'focus:ring-red-500/40 border-l-2 border-l-red-500', text: 'text-red-400' },
  },
  {
    match: /con[e3]ct/i,
    theme: { dot: 'bg-blue-500', ring: 'focus:ring-blue-500/40 border-l-2 border-l-blue-500', text: 'text-blue-400' },
  },
  {
    match: /academy/i,
    theme: {
      dot: 'bg-amber-400',
      ring: 'focus:ring-amber-400/40 border-l-2 border-l-amber-400',
      text: 'text-amber-300',
    },
  },
]

const DEFAULT_THEME: AccountTheme = {
  dot: 'bg-zinc-500',
  ring: 'focus:ring-zinc-500/40',
  text: 'text-zinc-400',
}

export function getAccountTheme(accountName: string | null | undefined): AccountTheme {
  if (!accountName) return DEFAULT_THEME
  const found = THEMES.find(({ match }) => match.test(accountName))
  return found ? found.theme : DEFAULT_THEME
}
