import { ICONS } from './iconData.ts'

interface StickerProps {
  name: string
  className?: string
  /** Sem recorte branco/sombra (ícones dentro de botões e círculos). */
  flat?: boolean
}

/** Ícone de tatuagem em estilo adesivo. */
export function Sticker({ name, className = '', flat = false }: StickerProps) {
  return (
    <svg
      className={`stk ${flat ? 'flat' : ''} ${className}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }}
    />
  )
}
