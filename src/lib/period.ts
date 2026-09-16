import type { Period } from '@/types'

/** Utilitários de período compartilhados (UI + API Meta). */

export const MAX_CUSTOM_DAYS = 90

/** Períodos aceitos pela API (filtro + Compare + digest). */
export const KNOWN_PERIODS = new Set<Period>([
  'today',
  'yesterday',
  'last7',
  'last30',
  'prev7',
  'prev30',
  'this_month',
  'last_month',
  'custom',
])

export function isKnownPeriod(period: string): period is Period {
  return KNOWN_PERIODS.has(period as Period)
}

export function padDate(value: number | string): string {
  return String(value).padStart(2, '0')
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}`
}

export function daysAgoLocal(days: number): Date {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return date
}

export function parseLocalDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export function daysInclusive(since: string, until: string): number | null {
  const start = parseLocalDate(since)
  const end = parseLocalDate(until)
  if (!start || !end) return null
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
}

/** Intervalo padrão ao escolher "Personalizado" (últimos 7 dias). */
export function defaultCustomRange(): { since: string; until: string } {
  return {
    since: formatLocalDate(daysAgoLocal(6)),
    until: formatLocalDate(daysAgoLocal(0)),
  }
}

export function getThisMonthRange(): { since: string; until: string } {
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const since = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0)
  return { since: formatLocalDate(since), until: formatLocalDate(now) }
}

export function getLastMonthRange(): { since: string; until: string } {
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const since = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12, 0, 0, 0)
  const until = new Date(now.getFullYear(), now.getMonth(), 0, 12, 0, 0, 0)
  return { since: formatLocalDate(since), until: formatLocalDate(until) }
}

export type ValidateRangeResult =
  | { ok: true; since: string; until: string; days: number }
  | { ok: false; error: string }

export function validateCustomRange(
  since?: string | null,
  until?: string | null,
  { maxDays = MAX_CUSTOM_DAYS }: { maxDays?: number } = {},
): ValidateRangeResult {
  if (!since || !until) {
    return { ok: false, error: 'Informe a data inicial e a data final.' }
  }

  const start = parseLocalDate(since)
  const end = parseLocalDate(until)
  if (!start || !end) {
    return { ok: false, error: 'Datas inválidas. Use o formato AAAA-MM-DD.' }
  }

  if (start > end) {
    return { ok: false, error: 'A data inicial não pode ser depois da data final.' }
  }

  const today = daysAgoLocal(0)
  if (end > today) {
    return { ok: false, error: 'A data final não pode ser no futuro.' }
  }

  const days = daysInclusive(since, until)
  if (days == null) {
    return { ok: false, error: 'Não foi possível calcular o intervalo.' }
  }

  if (days > maxDays) {
    return { ok: false, error: `O intervalo máximo é de ${maxDays} dias.` }
  }

  return { ok: true, since, until, days }
}

export function formatDateBr(value?: string | null): string {
  const date = parseLocalDate(value)
  if (!date) return value ?? ''
  return `${padDate(date.getDate())}/${padDate(date.getMonth() + 1)}/${date.getFullYear()}`
}

export function getPeriodLabel(
  period: string,
  { since, until }: { since?: string | null; until?: string | null } = {},
  periodsMap: Record<string, string> = {},
): string {
  if (period === 'custom' && since && until) {
    return `${formatDateBr(since)} — ${formatDateBr(until)}`
  }
  return periodsMap[period] ?? period
}

export interface ExplicitRange {
  ok: boolean
  since?: string
  until?: string
  error?: string
}

/**
 * Since/until explícitos para séries diárias e mock.
 * Presets mensais usam calendário local; a Meta continua com date_preset.
 */
export function resolveExplicitRange(
  period: string,
  { since, until }: { since?: string | null; until?: string | null } = {},
): ExplicitRange {
  if (period === 'custom') {
    const validated = validateCustomRange(since, until)
    if (!validated.ok) return { ok: false, error: validated.error }
    return { ok: true, since: validated.since, until: validated.until }
  }

  if (period === 'this_month') {
    return { ok: true, ...getThisMonthRange() }
  }

  if (period === 'last_month') {
    return { ok: true, ...getLastMonthRange() }
  }

  if (period === 'prev7') {
    return {
      ok: true,
      since: formatLocalDate(daysAgoLocal(13)),
      until: formatLocalDate(daysAgoLocal(7)),
    }
  }

  if (period === 'prev30') {
    return {
      ok: true,
      since: formatLocalDate(daysAgoLocal(59)),
      until: formatLocalDate(daysAgoLocal(30)),
    }
  }

  if (period === 'today') {
    const day = formatLocalDate(daysAgoLocal(0))
    return { ok: true, since: day, until: day }
  }

  if (period === 'yesterday') {
    const day = formatLocalDate(daysAgoLocal(1))
    return { ok: true, since: day, until: day }
  }

  if (period === 'last7') {
    return {
      ok: true,
      since: formatLocalDate(daysAgoLocal(6)),
      until: formatLocalDate(daysAgoLocal(0)),
    }
  }

  // last30 e fallback
  return {
    ok: true,
    since: formatLocalDate(daysAgoLocal(29)),
    until: formatLocalDate(daysAgoLocal(0)),
  }
}

/** Janela diária (4–30 dias) alinhada ao filtro do dashboard. */
export function resolveDailyWindow(
  period: string,
  { since, until }: { since?: string | null; until?: string | null } = {},
): { since: string; until: string; days: number } {
  const range = resolveExplicitRange(period, { since, until })
  if (!range.ok || !range.since || !range.until) {
    return {
      since: formatLocalDate(daysAgoLocal(13)),
      until: formatLocalDate(daysAgoLocal(0)),
      days: 14,
    }
  }

  const totalDays = daysInclusive(range.since, range.until) ?? 14
  const days = Math.max(4, Math.min(30, totalDays))
  const end = parseLocalDate(range.until)!
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))

  return {
    since: formatLocalDate(start),
    until: range.until,
    days,
  }
}
