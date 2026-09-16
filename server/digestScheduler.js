import { buildAndSendDigest, resolveDigestSlot } from './digest.js'

const TIMEZONE = 'America/Sao_Paulo'
const DEFAULT_HOURS = [10, 17]

function parseHours(env) {
  const raw = env.DIGEST_HOURS
  if (!raw || typeof raw !== 'string') return DEFAULT_HOURS

  const hours = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)

  return hours.length ? [...new Set(hours)] : DEFAULT_HOURS
}

function getSaoPauloClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]))

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

/**
 * Agenda o envio do digest nos horários configurados (padrão 10h e 17h, SP).
 * Checa a cada minuto — adequado a processo Node sempre ligado (Plesk).
 */
export function startDigestScheduler(env) {
  const enabled = String(env.DIGEST_SCHEDULER_ENABLED ?? 'true').toLowerCase() !== 'false'
  if (!enabled) {
    console.log('[digest] scheduler desligado (DIGEST_SCHEDULER_ENABLED=false)')
    return { stop() {} }
  }

  if (!env.META_ACCESS_TOKEN) {
    console.warn('[digest] scheduler não iniciado: META_ACCESS_TOKEN ausente')
    return { stop() {} }
  }

  if (!(env.N8N_DIGEST_WEBHOOK_URL || env.N8N_WEBHOOK_URL)) {
    console.warn('[digest] scheduler não iniciado: webhook n8n ausente')
    return { stop() {} }
  }

  const hours = parseHours(env)
  const sentKeys = new Set()
  let running = false

  console.log(
    `[digest] scheduler ativo · ${hours.map((h) => `${String(h).padStart(2, '0')}:00`).join(' e ')} (${TIMEZONE})`,
  )

  const tick = async () => {
    if (running) return

    const clock = getSaoPauloClock()
    if (clock.minute !== 0) return
    if (!hours.includes(clock.hour)) return

    const key = `${clock.dateKey}-${clock.hour}`
    if (sentKeys.has(key)) return

    running = true
    sentKeys.add(key)

    // Limpa chaves antigas (mantém só o dia atual)
    for (const existing of [...sentKeys]) {
      if (!existing.startsWith(clock.dateKey)) sentKeys.delete(existing)
    }

    const slot = resolveDigestSlot(clock.hour)

    try {
      console.log(`[digest] enviando boletim ${slot} (${clock.hour}:00)`)
      const result = await buildAndSendDigest(env, { slot })
      console.log(
        `[digest] ok · ${result.digest.account?.name} · ${result.digest.tips?.length ?? 0} dicas · webhook ${result.delivery.status}`,
      )
    } catch (error) {
      sentKeys.delete(key)
      console.error('[digest] falha no envio agendado:', error.message || error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => {
    tick().catch((error) => {
      console.error('[digest] erro no tick:', error)
    })
  }, 30_000)

  if (typeof timer.unref === 'function') timer.unref()

  // Roda uma checagem inicial (se reiniciar exatamente na hora, ainda envia)
  tick().catch(() => {})

  return {
    stop() {
      clearInterval(timer)
    },
  }
}
