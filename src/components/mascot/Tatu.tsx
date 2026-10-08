import tatuUrl from '@/assets/brand/tatu-laranja.png'
import type { MascotMood } from '@/store/mascotStore.ts'

interface TatuProps {
  size?: number
  mood?: MascotMood | 'curl'
  className?: string
}

/** Mascote da Academy Labs: o tatu enrolado, animado via CSS (ver .tatu em style.css). */
export function Tatu({ size = 56, mood = 'idle', className = '' }: TatuProps) {
  return (
    <span className={`tatu ${className}`} data-mood={mood} style={{ width: size, height: size }} aria-hidden="true">
      <img src={tatuUrl} alt="" draggable={false} className="tatu-img" />
    </span>
  )
}
