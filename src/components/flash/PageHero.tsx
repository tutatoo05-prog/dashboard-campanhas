import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { SprayArt } from './SprayArt.tsx'
import { Sticker } from './Sticker.tsx'
import { stickerSetFor } from './pageThemes.ts'

interface PageHeroProps {
  children: ReactNode
}

/**
 * Abertura de cada página: o texto da tela à esquerda e, à direita, o bicho (ou adesivo)
 * da seção, pichado com spray. Mantém as classes antigas do hero para o resto do CSS.
 */
export function PageHero({ children }: PageHeroProps) {
  const { pathname } = useLocation()
  const theme = stickerSetFor(pathname)

  return (
    <section className="hero-panel flash-hero p-6 sm:p-8">
      <div className="flash-hero-text">{children}</div>
      <SprayArt kind={theme.hero} key={pathname} className="flash-hero-art" />
      <span className="deco" aria-hidden="true">
        <Sticker name={theme.stickers[0]} className="a1" />
      </span>
    </section>
  )
}
