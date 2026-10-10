const TIMEZONE = 'America/Sao_Paulo'

/** Data (AAAA-MM-DD), hora e minuto no fuso de São Paulo. */
export function getSaoPauloClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
  }
}

export { TIMEZONE }
