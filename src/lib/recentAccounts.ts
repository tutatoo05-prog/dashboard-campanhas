import type { AdAccount } from '@/types'

const RECENT_ACCOUNTS_KEY = 'dash-recent-accounts'
const MAX_RECENT = 8

export function readRecentAccountIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_ACCOUNTS_KEY) || '[]')
    return Array.isArray(raw) ? raw.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export function pushRecentAccount(accountId?: string | null): void {
  if (!accountId) return

  const id = String(accountId)
  const next = [id, ...readRecentAccountIds().filter((item) => item !== id)].slice(0, MAX_RECENT)

  try {
    localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** Contas recentes primeiro; demais na ordem original. */
export function sortAccountsByRecent(
  accounts: AdAccount[] = [],
  recentIds: string[] = readRecentAccountIds(),
): AdAccount[] {
  const byId = new Map(accounts.map((account) => [String(account.id), account]))
  const ordered: AdAccount[] = []
  const seen = new Set<string>()

  for (const id of recentIds) {
    const account = byId.get(String(id))
    if (account) {
      ordered.push(account)
      seen.add(String(account.id))
    }
  }

  for (const account of accounts) {
    const id = String(account.id)
    if (!seen.has(id)) {
      ordered.push(account)
      seen.add(id)
    }
  }

  return ordered
}

export function isRecentAccount(
  accountId: string,
  recentIds: string[] = readRecentAccountIds(),
): boolean {
  return recentIds.includes(String(accountId))
}
