import { useEffect, useState, type ElementType } from 'react'
import { useMascotStore } from '@/store/mascotStore.ts'

interface TypewriterProps {
  text: string
  as?: ElementType
  className?: string
  speed?: number
  /** O Tatu escreve junto (pose "write") enquanto o texto aparece. */
  withMascot?: boolean
}

/** Texto que é "escrito" na tela, caractere por caractere. Respeita prefers-reduced-motion. */
export function Typewriter({ text, as: Tag = 'span', className, speed = 28, withMascot = true }: TypewriterProps) {
  const [count, setCount] = useState(0)
  const act = useMascotStore((s) => s.act)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(text.length)
      return
    }
    setCount(0)
    let i = 0
    let id = 0
    const start = window.setTimeout(() => {
      if (withMascot) act('write', text.length * speed + 200)
      id = window.setInterval(() => {
        i += 1
        setCount(i)
        if (i >= text.length) window.clearInterval(id)
      }, speed)
    }, 250)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [text, speed, withMascot, act])

  return (
    <Tag className={className} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      {count < text.length && <span className="type-caret" aria-hidden="true" />}
      <span className="sr-only">{text}</span>
    </Tag>
  )
}
