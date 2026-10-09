import { Sticker } from './Sticker.tsx'
import { stickerSetFor } from './pageThemes.ts'

interface Slot {
  side: 'l' | 'r'
  /** Posição vertical em % da altura da página. */
  top: number
  /** Deslocamento lateral em px (negativo = para fora). */
  x: number
  w: number
  rot: number
  anim: string
  /** Índice no conjunto de adesivos da página. */
  pick: number
}

const SLOTS: Slot[] = [
  { side: 'r', top: 16, x: -10, w: 64, rot: 12, anim: 'a4', pick: 2 },
  { side: 'l', top: 30, x: -14, w: 62, rot: -14, anim: 'a1', pick: 3 },
  { side: 'r', top: 46, x: -12, w: 68, rot: -10, anim: 'a2', pick: 4 },
  { side: 'l', top: 62, x: -14, w: 64, rot: 10, anim: 'a3', pick: 5 },
  { side: 'r', top: 76, x: -12, w: 66, rot: 14, anim: 'a1', pick: 6 },
  { side: 'l', top: 90, x: -14, w: 62, rot: -8, anim: 'a4', pick: 7 },
]

/** Adesivos pequenos nas laterais da página, diferentes em cada seção. */
export function StickerLayer({ pathname }: { pathname: string }) {
  const theme = stickerSetFor(pathname)
  return (
    <div className="sticker-layer" aria-hidden="true">
      {SLOTS.map((slot, n) => (
        <div
          key={`${pathname}-${n}`}
          className={slot.anim}
          style={{
            [slot.side === 'l' ? 'left' : 'right']: slot.x,
            top: `${slot.top}%`,
            width: slot.w,
            ['--r0' as string]: `${slot.rot}deg`,
            animationDelay: `${(-n * 1.3).toFixed(1)}s`,
          }}
        >
          <Sticker name={theme.stickers[slot.pick % theme.stickers.length]} />
        </div>
      ))}
    </div>
  )
}
