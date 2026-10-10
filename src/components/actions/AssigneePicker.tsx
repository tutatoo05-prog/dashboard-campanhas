import type { AssignableUser } from '@/services/actionsService.ts'
import { Menu } from './Menu.tsx'

interface AssigneePickerProps {
  users: AssignableUser[]
  assignee?: { userId: string | null; userName: string } | null
  onAssign: (userId: string | null) => void
}

function initial(name?: string | null): string {
  return (name ?? '?').trim().charAt(0).toUpperCase() || '?'
}

/** Quem cuida desta ação. Mostra a inicial do responsável e abre a lista de usuários ativos. */
export function AssigneePicker({ users, assignee, onAssign }: AssigneePickerProps) {
  return (
    <Menu
      align="right"
      ariaLabel={assignee ? `Responsável: ${assignee.userName}` : 'Atribuir responsável'}
      title={assignee ? `Responsável: ${assignee.userName}` : 'Atribuir responsável'}
      className="menu-assignee"
      trigger={
        assignee ? (
          <span className="avatar">{initial(assignee.userName)}</span>
        ) : (
          <span className="avatar avatar-empty">
            <i className="fa-solid fa-user-plus" />
          </span>
        )
      }
    >
      {(close) => (
        <>
          <p className="menu-title">Responsável</p>
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              role="menuitem"
              className={`menu-item ${assignee?.userId === user.id ? 'menu-item-active' : ''}`}
              onClick={() => {
                onAssign(user.id)
                close()
              }}
            >
              <span className="avatar avatar-small">{initial(user.nome)}</span>
              <span>{user.nome}</span>
            </button>
          ))}
          {assignee && (
            <button
              type="button"
              role="menuitem"
              className="menu-item menu-item-danger"
              onClick={() => {
                onAssign(null)
                close()
              }}
            >
              <i className="fa-solid fa-user-xmark" /> Tirar responsável
            </button>
          )}
        </>
      )}
    </Menu>
  )
}
