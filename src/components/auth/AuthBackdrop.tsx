import { SprayArt } from '@/components/flash/SprayArt.tsx'
import { Sticker } from '@/components/flash/Sticker.tsx'

const STICKERS: { name: string; style: Record<string, string | number>; anim: string }[] = [
  { name: 'rose', style: { left: '4%', top: '8%', width: 78, '--r0': '-10deg' }, anim: 'a1' },
  { name: 'dagger', style: { right: '5%', top: '10%', width: 70, '--r0': '14deg' }, anim: 'a4' },
  { name: 'anchor', style: { left: '9%', bottom: '9%', width: 74, '--r0': '8deg' }, anim: 'a2' },
  { name: 'swallow', style: { right: '9%', bottom: '8%', width: 80, '--r0': '-8deg' }, anim: 'a1' },
  { name: 'star', style: { left: '30%', top: '5%', width: 52, '--r0': '10deg' }, anim: 'a3' },
  { name: 'heart', style: { right: '28%', bottom: '5%', width: 56, '--r0': '-12deg' }, anim: 'a3' },
  { name: 'bottle', style: { right: '24%', top: '6%', width: 54, '--r0': '12deg' }, anim: 'a4' },
  { name: 'moon', style: { left: '26%', bottom: '6%', width: 52, '--r0': '-6deg' }, anim: 'a1' },
]

/**
 * Fundo das telas de autenticação: adesivos de tatuagem flutuando e, nas laterais,
 * o leão e a cobra pichados com spray.
 */
export function AuthBackdrop() {
  return (
    <div className="auth-backdrop" aria-hidden="true">
      <SprayArt kind="lion" duration={3200} className="auth-beast auth-beast-l" />
      <SprayArt kind="cobra" duration={3200} className="auth-beast auth-beast-r" />
      {STICKERS.map((item, index) => (
        <div
          key={item.name}
          className={`auth-sticker ${item.anim}`}
          style={{ ...item.style, animationDelay: `${(-index * 1.1).toFixed(1)}s` }}
        >
          <Sticker name={item.name} />
        </div>
      ))}
    </div>
  )
}
