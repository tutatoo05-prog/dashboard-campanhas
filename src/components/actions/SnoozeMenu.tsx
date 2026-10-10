import { Menu } from './Menu.tsx'

interface SnoozeMenuProps {
  onSnooze: (until: Date) => void
}

function at9(date: Date): Date {
  const next = new Date(date)
  next.setHours(9, 0, 0, 0)
  return next
}

export function snoozeOptions(now = new Date()): { label: string; until: Date }[] {
  const tomorrow = at9(new Date(now.getTime() + 86_400_000))

  const monday = new Date(now)
  const daysUntilMonday = ((8 - monday.getDay()) % 7) || 7
  monday.setDate(monday.getDate() + daysUntilMonday)

  return [
    { label: 'Amanhã de manhã', until: tomorrow },
    { label: 'Em 48 horas', until: new Date(now.getTime() + 2 * 86_400_000) },
    { label: 'Na segunda-feira', until: at9(monday) },
    { label: 'Em 7 dias', until: at9(new Date(now.getTime() + 7 * 86_400_000)) },
  ]
}

export function formatSnoozeDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** "Lembrar depois": a ação some da lista e volta na data escolhida. */
export function SnoozeMenu({ onSnooze }: SnoozeMenuProps) {
  return (
    <Menu
      ariaLabel="Adiar esta ação"
      title="Adiar"
      trigger={
        <>
          <i className="fa-solid fa-clock" /> Adiar
        </>
      }
    >
      {(close) => (
        <>
          <p className="menu-title">Lembrar</p>
          {snoozeOptions().map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                onSnooze(option.until)
                close()
              }}
            >
              <span>{option.label}</span>
              <small>{formatSnoozeDate(option.until.toISOString())}</small>
            </button>
          ))}
        </>
      )}
    </Menu>
  )
}
