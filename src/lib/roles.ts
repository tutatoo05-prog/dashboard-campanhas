import type { User } from '@/types'

/** Admin altera tudo; "usuario" usa as funcionalidades sem alterar nada. */
export function isAdmin(user: User | null | undefined): boolean {
  return user?.cargo === 'admin'
}

/** Páginas liberadas pro cargo "usuario" (por enquanto só Leads). */
const USER_PATHS = ['/leads']
const ALWAYS_PATHS = ['/perfil']

export function canAccessPath(user: User | null | undefined, pathname: string): boolean {
  if (isAdmin(user)) return true
  return USER_PATHS.includes(pathname) || ALWAYS_PATHS.includes(pathname)
}

export function homePath(user: User | null | undefined): string {
  return isAdmin(user) ? '/' : USER_PATHS[0]
}
