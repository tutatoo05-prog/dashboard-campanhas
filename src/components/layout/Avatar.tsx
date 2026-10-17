import type { User } from '@/types'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { ICONS } from '@/components/flash/iconData.ts'

interface AvatarProps {
  user: User | null | undefined
  /** Para pré-visualizar antes de salvar: sobrepõe o avatar do usuário. */
  avatar?: string | null
  nome?: string
  size?: number
  className?: string
}

/** Foto, adesivo de tatuagem ou a inicial do nome, dentro do círculo. */
export function Avatar({ user, avatar, nome, size = 36, className = '' }: AvatarProps) {
  const valor = avatar !== undefined ? avatar : (user?.avatar ?? null)
  const texto = nome ?? getDisplayName(user)
  const estilo = { width: size, height: size, fontSize: Math.round(size * 0.42) }

  if (valor?.startsWith('data:image/')) {
    return (
      <span className={`tn-avatar ${className}`} style={estilo}>
        <img src={valor} alt="" />
      </span>
    )
  }

  const adesivo = valor?.startsWith('sticker:') ? ICONS[valor.slice(8)] : null
  if (adesivo) {
    return (
      <span className={`tn-avatar ${className}`} style={estilo} aria-hidden="true">
        <svg className="stk flat" viewBox="0 0 100 100" dangerouslySetInnerHTML={{ __html: adesivo }} />
      </span>
    )
  }

  return (
    <span className={`tn-avatar ${className}`} style={estilo} aria-hidden="true">
      {(texto.trim().charAt(0) || '?').toUpperCase()}
    </span>
  )
}
