/**
 * Progresso da Central de Ações guardado no navegador (zera todo dia, exceto o histórico da sequência).
 * A chave de "feito" é a mesma que o TaTuzinho lê pra contar as urgentes pendentes.
 */

function dayKey(offset = 0): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

const doneKey = (accountId: string) => `dash-actions-done:${accountId}:${dayKey()}`
const stepsKey = (accountId: string) => `dash-actions-steps:${accountId}:${dayKey()}`
const dailyKey = (accountId: string) => `dash-actions-daily:${accountId}`

export function loadDone(accountId: string): Set<string> {
  const raw = readJson<unknown>(doneKey(accountId), [])
  return new Set(Array.isArray(raw) ? raw.map(String) : [])
}

export function saveDone(accountId: string, done: Set<string>) {
  writeJson(doneKey(accountId), [...done])
}

/** Passos já marcados de cada ação: { idDaAção: [índices] }. */
export function loadSteps(accountId: string): Record<string, number[]> {
  const raw = readJson<unknown>(stepsKey(accountId), {})
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, number[]>) : {}
}

export function saveSteps(accountId: string, steps: Record<string, number[]>) {
  writeJson(stepsKey(accountId), steps)
}

/** Guarda quantas urgentes ficaram abertas hoje (a última visita do dia vale). Mantém 60 dias. */
export function recordUrgentOpen(accountId: string, urgentOpen: number) {
  const history = readJson<Record<string, number>>(dailyKey(accountId), {})
  history[dayKey()] = urgentOpen
  const keep = Object.keys(history)
    .sort()
    .slice(-60)
  writeJson(
    dailyKey(accountId),
    Object.fromEntries(keep.map((date) => [date, history[date]])),
  )
}

/**
 * Dias seguidos com a conta sem urgência parada. Só conta dia em que o painel foi aberto:
 * dia sem visita quebra a sequência. Hoje entra se já estiver zerado.
 */
export function currentStreak(accountId: string): number {
  const history = readJson<Record<string, number>>(dailyKey(accountId), {})
  let streak = 0
  const today = history[dayKey()]
  if (today != null && today > 0) return 0
  if (today === 0) streak += 1
  for (let offset = 1; offset <= 60; offset += 1) {
    if (history[dayKey(offset)] === 0) streak += 1
    else break
  }
  return streak
}
