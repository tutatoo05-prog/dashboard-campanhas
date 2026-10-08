import type { User } from '@/types'

/** Admin altera tudo; "usuario" usa as funcionalidades sem alterar nada. */
export function isAdmin(user: User | null | undefined): boolean {
  return user?.cargo === 'admin'
}
