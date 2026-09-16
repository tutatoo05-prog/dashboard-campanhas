import type { User } from '@/types'
import { pickNameFromUser, resolvePersonName } from './userName.ts'

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function getDisplayName(user: User | null | undefined): string {
  const fromUser = pickNameFromUser(user)
  if (fromUser) return fromUser

  try {
    const stored = localStorage.getItem('dash-user-name')
    const resolved = resolvePersonName(stored)
    if (resolved) return resolved
  } catch {
    /* ignore */
  }

  return 'Gestor'
}
