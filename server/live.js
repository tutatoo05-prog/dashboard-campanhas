// Interruptor da Live do Essentials.
// O Apache do site principal mostra a página da Live em /produtos/essentials/
// enquanto o arquivo `live.on` existir na pasta (o conteúdo é irrelevante).
// Aqui só se cria/apaga ESSE arquivo — caminho fixo vindo de LIVE_FLAG_PATH,
// nunca da requisição. O banco guarda o estado desejado (manual + agenda);
// o arquivo é o estado real, e é ele que a tela mostra.

import { constants } from 'node:fs'
import { access, lstat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, normalize } from 'node:path'
import { query } from './db.js'

export const TIMEZONE = 'America/Sao_Paulo'
const FLAG_FILENAME = 'live.on'
const DEFAULT_MAX_HOURS = 6
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// ── Configuração ────────────────────────────────────────────────────────────

export function getLiveConfig(env) {
  const raw = String(env.LIVE_FLAG_PATH ?? '').trim()
  let flagPath = null
  let error = null

  if (!raw) {
    error = 'LIVE_FLAG_PATH não configurada.'
  } else if (!isAbsolute(raw)) {
    error = 'LIVE_FLAG_PATH precisa ser um caminho absoluto.'
  } else if (basename(raw) !== FLAG_FILENAME) {
    error = `LIVE_FLAG_PATH precisa terminar em /${FLAG_FILENAME}.`
  } else {
    flagPath = normalize(raw)
  }

  const hours = Number(env.LIVE_MAX_HOURS)
  const maxHours = Number.isFinite(hours) && hours > 0 && hours <= 24 ? hours : DEFAULT_MAX_HOURS

  const adminEmails = String(env.LIVE_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)

  return { flagPath, error, maxHours, adminEmails }
}

export function isLiveAdmin(env, user) {
  const email = String(user?.email ?? '').trim().toLowerCase()
  return Boolean(email) && getLiveConfig(env).adminEmails.includes(email)
}

// ── Relógio de São Paulo ────────────────────────────────────────────────────

export function getSaoPauloClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now)

  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]))

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    weekday: WEEKDAYS.indexOf(map.weekday),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Converte "AAAA-MM-DD" + "HH:MM" no horário de São Paulo para um Date (UTC). */
export function saoPauloToDate(dateKey, time) {
  const guess = new Date(`${dateKey}T${time}:00Z`)
  const clock = getSaoPauloClock(guess)
  const [y, m, d] = clock.dateKey.split('-').map(Number)
  const asUtc = Date.UTC(y, m - 1, d, clock.hour, clock.minute, clock.second)
  const offsetMs = asUtc - guess.getTime()
  return new Date(guess.getTime() - offsetMs)
}

function toMinutes(time) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Próxima ocorrência de HH:MM (São Paulo) a partir de agora — hoje ou amanhã. */
export function nextOccurrence(time, now = new Date()) {
  const clock = getSaoPauloClock(now)
  const today = saoPauloToDate(clock.dateKey, time)
  return today > now ? today : saoPauloToDate(addDays(clock.dateKey, 1), time)
}

// ── Agenda ──────────────────────────────────────────────────────────────────

/** Valida e normaliza a agenda semanal. Lança Error com mensagem amigável. */
export function normalizeSchedule(input) {
  if (!Array.isArray(input)) throw new Error('Agenda inválida.')
  if (input.length > 21) throw new Error('Agenda com janelas demais (máximo 21).')

  return input.map((item, index) => {
    const day = Number(item?.day)
    const start = String(item?.start ?? '')
    const end = String(item?.end ?? '')
    const label = `Janela ${index + 1}`

    if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error(`${label}: dia da semana inválido.`)
    if (!TIME_RE.test(start)) throw new Error(`${label}: hora de início inválida (use HH:MM).`)
    if (!TIME_RE.test(end)) throw new Error(`${label}: hora de fim inválida (use HH:MM).`)
    if (start === end) throw new Error(`${label}: início e fim não podem ser iguais.`)

    return { day, start, end }
  })
}

/**
 * Janela da agenda ativa agora (ou null). Janela com fim menor que o início
 * atravessa a meia-noite (ex.: sexta 22:00 → 00:30 de sábado).
 * Devolve também o instante exato em que ela termina.
 */
export function findActiveWindow(schedule, now = new Date()) {
  const clock = getSaoPauloClock(now)
  const minutes = clock.hour * 60 + clock.minute
  const yesterday = (clock.weekday + 6) % 7

  for (const window of schedule) {
    const start = toMinutes(window.start)
    const end = toMinutes(window.end)

    if (end > start) {
      if (window.day === clock.weekday && minutes >= start && minutes < end) {
        return { window, endsAt: saoPauloToDate(clock.dateKey, window.end) }
      }
      continue
    }

    // Atravessa a meia-noite
    if (window.day === clock.weekday && minutes >= start) {
      return { window, endsAt: saoPauloToDate(addDays(clock.dateKey, 1), window.end) }
    }
    if (window.day === yesterday && minutes < end) {
      return { window, endsAt: saoPauloToDate(clock.dateKey, window.end) }
    }
  }

  return null
}

// ── Estado desejado ─────────────────────────────────────────────────────────

/**
 * Desejado = (manual ligado e dentro do prazo) OU (dentro de janela da agenda),
 * a menos que alguém tenha desligado na mão durante a janela (pausa).
 */
export function computeDesired(settings, now = new Date()) {
  const manualActive = Boolean(settings.manualOn && settings.manualUntil && settings.manualUntil > now)
  const active = findActiveWindow(settings.schedule, now)
  const paused = Boolean(settings.pausedUntil && settings.pausedUntil > now)
  const scheduleActive = Boolean(active) && !paused

  const sources = []
  const ends = []
  if (manualActive) {
    sources.push('manual')
    ends.push(settings.manualUntil)
  }
  if (scheduleActive) {
    sources.push('agenda')
    ends.push(active.endsAt)
  }

  return {
    on: manualActive || scheduleActive,
    sources,
    until: ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null,
    activeWindow: active,
    paused,
  }
}

// ── Banco ───────────────────────────────────────────────────────────────────

function toSettings(row) {
  return {
    manualOn: Boolean(row.manual_on),
    manualSince: row.manual_since ? new Date(row.manual_since) : null,
    manualUntil: row.manual_until ? new Date(row.manual_until) : null,
    manualBy: row.manual_by ?? null,
    pausedUntil: row.paused_until ? new Date(row.paused_until) : null,
    schedule: Array.isArray(row.schedule) ? row.schedule : [],
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  }
}

export async function loadSettings(env) {
  await query(env, 'insert into live_settings (id) values (1) on conflict (id) do nothing')
  const result = await query(
    env,
    `select manual_on, manual_since, manual_until, manual_by, paused_until, schedule, updated_at
       from live_settings where id = 1`,
  )
  return toSettings(result.rows[0])
}

export async function saveSettings(env, settings) {
  await query(
    env,
    `update live_settings
        set manual_on = $1, manual_since = $2, manual_until = $3, manual_by = $4,
            paused_until = $5, schedule = $6::jsonb, updated_at = now()
      where id = 1`,
    [
      settings.manualOn,
      settings.manualSince,
      settings.manualUntil,
      settings.manualBy,
      settings.pausedUntil,
      JSON.stringify(settings.schedule),
    ],
  )
}

export async function addLog(env, { action, source, userEmail = null, detail = '', ok = true }) {
  try {
    await query(
      env,
      'insert into live_log (action, source, user_email, detail, ok) values ($1, $2, $3, $4, $5)',
      [action, source, userEmail, detail, ok],
    )
  } catch (error) {
    console.error('[live] falha ao gravar log:', error.message || error)
  }
}

export async function loadLog(env, limit = 30) {
  const result = await query(
    env,
    `select id, action, source, user_email, detail, ok, created_at
       from live_log order by created_at desc limit $1`,
    [limit],
  )
  return result.rows.map((row) => ({
    id: String(row.id),
    action: row.action,
    source: row.source,
    userEmail: row.user_email,
    detail: row.detail,
    ok: row.ok,
    createdAt: new Date(row.created_at).toISOString(),
  }))
}

// ── Arquivo-interruptor ─────────────────────────────────────────────────────

/** Estado real: o arquivo existe? Devolve { on, since } ou lança erro. */
export async function readFlag(flagPath) {
  try {
    const info = await lstat(flagPath)
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`${flagPath} existe mas não é um arquivo comum.`)
    }
    return { on: true, since: info.mtime }
  } catch (error) {
    if (error.code === 'ENOENT') return { on: false, since: null }
    throw error
  }
}

/**
 * O processo consegue criar/apagar o arquivo? Testa a permissão da pasta com
 * access(W_OK) — não cria nada. Devolve null se ok, ou a mensagem do problema.
 */
export async function checkWritable(flagPath) {
  try {
    await access(dirname(flagPath), constants.W_OK | constants.X_OK)
    return null
  } catch (error) {
    return `O servidor não consegue escrever em ${dirname(flagPath)}: ${describeFsError(error)}.`
  }
}

async function writeFlag(flagPath, on) {
  if (on) {
    // flag "w" sem mkdir: se a pasta não existir, falha (não cria nada além do arquivo).
    await writeFile(flagPath, `ligado em ${new Date().toISOString()}\n`, { flag: 'w', mode: 0o644 })
  } else {
    try {
      await unlink(flagPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
}

function describeFsError(error) {
  if (error.code === 'EACCES' || error.code === 'EPERM') return 'sem permissão de escrita na pasta do site'
  if (error.code === 'ENOENT') return 'a pasta do arquivo não existe'
  if (error.code === 'EROFS') return 'o disco está somente leitura'
  return error.message || String(error)
}

// ── Reconciliação (com trava, para o agendador e a API não se atropelarem) ──

let chain = Promise.resolve()
export function withLiveLock(task) {
  const run = chain.then(task, task)
  chain = run.catch(() => {})
  return run
}

let lastError = null
export function getLastError() {
  return lastError
}
export function clearLastError() {
  lastError = null
}
export function setLastError(message) {
  lastError = { message, at: new Date().toISOString() }
}

/**
 * Leva o arquivo ao estado `desiredOn`. Idempotente.
 * Devolve { changed, on } ou lança Error com mensagem amigável.
 */
export async function applyFlag(flagPath, desiredOn) {
  let current
  try {
    current = await readFlag(flagPath)
  } catch (error) {
    const message = `Não consegui verificar o arquivo da Live: ${describeFsError(error)}.`
    setLastError(message)
    throw new Error(message)
  }

  if (current.on === desiredOn) {
    lastError = null
    return { changed: false, on: current.on }
  }

  try {
    await writeFlag(flagPath, desiredOn)
  } catch (error) {
    const message = `Não consegui ${desiredOn ? 'criar' : 'apagar'} o arquivo da Live: ${describeFsError(error)}.`
    setLastError(message)
    throw new Error(message)
  }

  lastError = null
  return { changed: true, on: desiredOn }
}
