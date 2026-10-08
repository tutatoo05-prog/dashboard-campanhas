import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  /** Posição na sequência (atraso escalonado). */
  index?: number
  className?: string
  as?: 'div' | 'section'
  /** Marca o bloco como parada do tour guiado do Tatu. */
  tour?: string
  tourText?: string
}

/** Revela o bloco quando ele entra na tela: desembaça, sobe e passa uma faixa de luz. */
export function Reveal({ children, index = 0, className = '', as: Tag = 'div', tour, tourText }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      setShown(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.08 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref as never}
      className={`reveal ${shown ? 'is-in' : ''} ${className}`}
      style={{ '--i': Math.min(index, 8) } as CSSProperties}
      data-tour={tour}
      data-tour-text={tourText}
    >
      {children}
    </Tag>
  )
}
