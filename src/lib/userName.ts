const TEMPLATE_PATTERN = /\{\{|\}\}/

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] ?? value.trim()
}

export function isValidNameValue(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return Boolean(trimmed) && !TEMPLATE_PATTERN.test(trimmed)
}

/** Nome real (planilha / webhook) — nunca deriva de e-mail. */
export function resolvePersonName(rawValue: unknown): string | null {
  if (!isValidNameValue(rawValue)) return null

  const trimmed = rawValue.trim()
  if (isEmail(trimmed)) return null

  const name = firstName(trimmed)
  if (!name) return null

  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

export function pickNameFromSources(...sources: unknown[]): string | null {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue

    const record = source as Record<string, unknown>
    const candidates = [
      record.nome,
      record.Nome,
      record.name,
      record.Name,
      record.displayName,
    ]

    for (const value of candidates) {
      const resolved = resolvePersonName(value)
      if (resolved) return resolved
    }

    for (const [key, value] of Object.entries(record)) {
      if (!/^nome$/i.test(key)) continue
      const resolved = resolvePersonName(value)
      if (resolved) return resolved
    }
  }

  return null
}

export function pickNameFromUser(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null

  const record = user as Record<string, unknown>
  const nestedUser = record.user && typeof record.user === 'object' ? record.user : null
  return pickNameFromSources(user, nestedUser)
}

/** @deprecated use resolvePersonName */
export function resolveDisplayName(rawValue: unknown): string | null {
  return resolvePersonName(rawValue)
}
