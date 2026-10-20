/** Cada página tem seu bicho (ou adesivo) principal e um conjunto de adesivos de enfeite. */
export interface PageTheme {
  hero: string
  stickers: string[]
}

const DEFAULT_THEME: PageTheme = { hero: 'lion', stickers: ['anchor', 'rose', 'swallow', 'dagger', 'heart', 'star', 'moon', 'coin'] }

const THEMES: Record<string, PageTheme> = {
  '/': DEFAULT_THEME,
  '/acoes': { hero: 'dragon', stickers: ['dagger', 'bolt', 'skull', 'machine', 'eye', 'rose', 'star', 'bottle'] },
  '/compare': { hero: 'shark', stickers: ['scales', 'anchor', 'dice', 'wave', 'heart', 'star', 'moon', 'swallow'] },
  '/leads': { hero: 'cobra', stickers: ['rose', 'heart', 'dagger', 'bottle', 'swallow', 'eye', 'star', 'moon'] },
  '/registros': { hero: 'scroll', stickers: ['machine', 'bottle', 'anchor', 'rose', 'eye', 'dagger', 'star', 'swallow'] },
  '/purchases': { hero: 'skull', stickers: ['coin', 'dice', 'crown', 'heart', 'bolt', 'rose', 'star', 'dagger'] },
  '/live': { hero: 'lighthouse', stickers: ['wave', 'anchor', 'moon', 'bolt', 'eye', 'swallow', 'star', 'heart'] },
  '/videos': { hero: 'eye', stickers: ['eye', 'bolt', 'moon', 'star', 'wave', 'dagger', 'heart', 'anchor'] },
  '/config/seguranca': { hero: 'cobra', stickers: ['eye', 'dagger', 'skull', 'bolt', 'anchor', 'machine', 'star', 'moon'] },
  '/config/usuarios': { hero: 'lion', stickers: ['crown', 'skull', 'dagger', 'rose', 'machine', 'heart', 'star', 'eye'] },
}

export function stickerSetFor(pathname: string): PageTheme {
  return THEMES[pathname] ?? DEFAULT_THEME
}
