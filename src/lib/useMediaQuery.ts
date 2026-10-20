import { useSyncExternalStore } from 'react'

/** true enquanto a tela casa com a media query (ex.: '(min-width: 768px)'). Acompanha rotação e redimensionamento. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const lista = window.matchMedia(query)
      lista.addEventListener('change', notify)
      return () => lista.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
