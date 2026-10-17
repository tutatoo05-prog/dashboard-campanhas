import { ICONS } from '@/components/flash/iconData.ts'

/** Avatares prontos (mesmos adesivos que o servidor aceita). Envio de foto própria fica para depois. */
export const AVATARES_PRONTOS = ['rose', 'skull', 'anchor', 'eye', 'swallow', 'dagger', 'heart', 'star', 'moon', 'bolt', 'crown', 'lighthouse', 'machine', 'wave']

interface AvatarPickerProps {
  value: string
  inicial: string
  onChange: (valor: string) => void
}

export function AvatarPicker({ value, inicial, onChange }: AvatarPickerProps) {
  return (
    <div className="ac-picks" role="radiogroup" aria-label="Escolher avatar">
      <button type="button" role="radio" aria-checked={value === ''} className={`ac-pick ${value === '' ? 'ac-sel' : ''}`} onClick={() => onChange('')} title="Inicial do nome">
        {(inicial.trim().charAt(0) || '?').toUpperCase()}
      </button>
      {AVATARES_PRONTOS.map((nome) => (
        <button key={nome} type="button" role="radio" aria-checked={value === `sticker:${nome}`} className={`ac-pick ${value === `sticker:${nome}` ? 'ac-sel' : ''}`} onClick={() => onChange(`sticker:${nome}`)} title={nome}>
          <svg className="stk flat" viewBox="0 0 100 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[nome] ?? '' }} />
        </button>
      ))}
    </div>
  )
}
