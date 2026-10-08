import { readRequestBody } from './readBody.js'
import {
  TIMEZONE,
  addLog,
  applyFlag,
  checkWritable,
  computeDesired,
  findActiveWindow,
  getLastError,
  getLiveConfig,
  isLiveAdmin,
  loadLog,
  loadSettings,
  nextOccurrence,
  normalizeSchedule,
  readFlag,
  saveSettings,
  withLiveLock,
} from './live.js'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function iso(date) {
  return date ? date.toISOString() : null
}

function formatSp(date) {
  return date.toLocaleString('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function readJson(req) {
  const raw = await readRequestBody(req, 16 * 1024)
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error('JSON inválido')
  }
}

function bodyError(res, error) {
  if (error.message === 'Payload too large') return sendJson(res, 413, { error: 'Requisição muito grande.' })
  return sendJson(res, 400, { error: 'Requisição inválida.' })
}

/** Monta o retrato completo: estado real (arquivo), desejado (banco), agenda e log. */
async function buildStatus(env, user) {
  const config = getLiveConfig(env)
  const now = new Date()

  let real = null
  let realError = null
  let writeError = null
  if (config.flagPath) {
    try {
      real = await readFlag(config.flagPath)
    } catch (error) {
      realError = `Não consegui verificar o arquivo da Live (${error.code || error.message}).`
    }
    writeError = await checkWritable(config.flagPath)
  }

  let settings = null
  let log = []
  let dbError = null
  try {
    settings = await loadSettings(env)
    log = await loadLog(env)
  } catch (error) {
    console.error('[live] erro ao ler banco:', error.message || error)
    dbError = 'Não consegui ler a configuração da Live no banco de dados.'
  }

  const desired = settings ? computeDesired(settings, now) : null
  const manualActive = Boolean(settings?.manualOn && settings.manualUntil && settings.manualUntil > now)

  return {
    success: true,
    now: now.toISOString(),
    timezone: TIMEZONE,
    canEdit: isLiveAdmin(env, user),
    configured: Boolean(config.flagPath),
    configError: config.error,
    maxHours: config.maxHours,
    real: real ? { on: real.on, since: iso(real.since) } : null,
    realError,
    writeError,
    desired: desired ? { on: desired.on, sources: desired.sources, until: iso(desired.until) } : null,
    inSync: Boolean(real && desired && real.on === desired.on),
    manual: settings
      ? {
          active: manualActive,
          since: manualActive ? iso(settings.manualSince) : null,
          until: manualActive ? iso(settings.manualUntil) : null,
          by: manualActive ? settings.manualBy : null,
        }
      : null,
    pausedUntil: settings?.pausedUntil && settings.pausedUntil > now ? iso(settings.pausedUntil) : null,
    schedule: settings?.schedule ?? [],
    lastError: getLastError(),
    dbError,
    log,
  }
}

/**
 * Aplica uma mudança com falha segura: primeiro mexe no arquivo; só grava no
 * banco se o arquivo ficou certo. Se o banco falhar, desfaz o arquivo.
 */
async function commitChange(env, user, mutate) {
  const config = getLiveConfig(env)

  return withLiveLock(async () => {
    const current = await loadSettings(env)
    const { next, log } = mutate(current, user)

    let previousOn
    try {
      previousOn = (await readFlag(config.flagPath)).on
    } catch {
      previousOn = null
    }

    try {
      await applyFlag(config.flagPath, computeDesired(next).on)
    } catch (error) {
      await addLog(env, {
        action: 'erro',
        source: 'manual',
        userEmail: user.email,
        detail: `${log.action}: ${error.message}`,
        ok: false,
      })
      const failure = new Error(error.message)
      failure.code = 'FLAG_WRITE_FAILED'
      throw failure
    }

    try {
      await saveSettings(env, next)
    } catch (error) {
      console.error('[live] erro ao salvar no banco:', error.message || error)
      if (previousOn !== null) {
        await applyFlag(config.flagPath, previousOn).catch(() => {})
      }
      const failure = new Error('Erro ao salvar no banco de dados — nada foi alterado.')
      failure.code = 'DB_WRITE_FAILED'
      throw failure
    }

    await addLog(env, { ...log, userEmail: user.email })
  })
}

async function handleChange(req, res, env, user, mutateFactory) {
  const config = getLiveConfig(env)

  if (!isLiveAdmin(env, user)) {
    return sendJson(res, 403, { error: 'Você não tem permissão para alterar a Live.' })
  }
  if (!config.flagPath) {
    return sendJson(res, 503, { error: `Live não configurada no servidor: ${config.error}` })
  }

  let body
  try {
    body = await readJson(req)
  } catch (error) {
    return bodyError(res, error)
  }

  let mutate
  try {
    mutate = mutateFactory(body, config)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  try {
    await commitChange(env, user, mutate)
  } catch (error) {
    if (error.code === 'INVALID') {
      return sendJson(res, 400, { error: error.message })
    }
    if (error.code === 'FLAG_WRITE_FAILED' || error.code === 'DB_WRITE_FAILED') {
      return sendJson(res, 500, { error: error.message, code: error.code, ...(await buildStatus(env, user)), success: false })
    }
    console.error('[live] erro ao aplicar mudança:', error)
    return sendJson(res, 502, { error: 'Erro ao aplicar a mudança da Live.' })
  }

  return sendJson(res, 200, await buildStatus(env, user))
}

/** POST /api/live — { action: 'on', offAt?: 'HH:MM' } | { action: 'off' } */
function toggleMutation(body, config) {
  const action = String(body.action ?? '')
  const now = new Date()

  if (action === 'on') {
    const offAt = body.offAt == null ? '' : String(body.offAt).trim()
    const maxUntil = new Date(now.getTime() + config.maxHours * 60 * 60 * 1000)
    let until

    if (offAt) {
      if (!TIME_RE.test(offAt)) throw new Error('Horário de desligar inválido (use HH:MM).')
      until = nextOccurrence(offAt, now)
    } else {
      until = maxUntil
    }

    return (current, user) => {
      // Reabilitar sem horário durante uma janela da agenda só retoma a agenda
      // (desliga no fim da janela), sem criar ligação manual.
      const active = offAt ? null : findActiveWindow(current.schedule, now)
      if (active) {
        return {
          next: { ...current, pausedUntil: null },
          log: {
            action: 'ligou',
            source: 'manual',
            detail: `Agenda retomada · desliga às ${formatSp(active.endsAt)}`,
          },
        }
      }

      // Teto de emergência: no máximo maxHours a partir de agora — ou até o fim
      // do horário da agenda em andamento, se ele for mais longo.
      const scheduled = findActiveWindow(current.schedule, now)
      const limit = scheduled && scheduled.endsAt > maxUntil ? scheduled.endsAt : maxUntil
      if (until > limit) {
        const error = new Error(
          `O horário de desligar passa do limite de ${config.maxHours} h a partir de agora. Escolha um horário mais cedo.`,
        )
        error.code = 'INVALID'
        throw error
      }

      const alreadyOn = current.manualOn && current.manualUntil && current.manualUntil > now
      return {
        next: {
          ...current,
          manualOn: true,
          manualSince: alreadyOn ? current.manualSince : now,
          manualUntil: until,
          manualBy: user.email,
          pausedUntil: null,
        },
        log: {
          action: 'ligou',
          source: 'manual',
          detail: `${alreadyOn ? 'Prazo alterado' : 'Ligada manualmente'} · desliga às ${formatSp(until)}${
            offAt ? '' : ` (teto padrão de ${config.maxHours} h)`
          }`,
        },
      }
    }
  }

  if (action === 'off') {
    return (current) => {
      // Desligar no meio de uma janela da agenda pausa a agenda até o fim dela.
      const active = findActiveWindow(current.schedule, now)
      return {
        next: { ...current, manualOn: false, manualUntil: null, pausedUntil: active ? active.endsAt : null },
        log: {
          action: 'desligou',
          source: 'manual',
          detail: active
            ? `Desligada manualmente · agenda pausada até ${formatSp(active.endsAt)}`
            : 'Desligada manualmente',
        },
      }
    }
  }

  throw new Error('Ação inválida (use "on" ou "off").')
}

/** PUT /api/live/schedule — { schedule: [{ day, start, end }] } */
function scheduleMutation(body) {
  const schedule = normalizeSchedule(body.schedule)
  return (current) => ({
    next: { ...current, schedule },
    log: {
      action: 'agenda',
      source: 'manual',
      detail: `Agenda salva · ${schedule.length} ${schedule.length === 1 ? 'janela' : 'janelas'}`,
    },
  })
}

export async function handleLiveRequest(req, res, env, user) {
  const { pathname } = new URL(req.url, 'http://localhost')

  if (pathname === '/api/live') {
    if (req.method === 'GET') return sendJson(res, 200, await buildStatus(env, user))
    if (req.method === 'POST') return handleChange(req, res, env, user, toggleMutation)
    return sendJson(res, 405, { error: 'Método não permitido.' })
  }

  if (pathname === '/api/live/schedule') {
    if (req.method === 'GET') {
      try {
        const settings = await loadSettings(env)
        return sendJson(res, 200, { success: true, schedule: settings.schedule, timezone: TIMEZONE })
      } catch (error) {
        console.error('[live] erro ao ler agenda:', error.message || error)
        return sendJson(res, 502, { error: 'Erro ao ler a agenda no banco de dados.' })
      }
    }
    if (req.method === 'PUT') return handleChange(req, res, env, user, scheduleMutation)
    return sendJson(res, 405, { error: 'Método não permitido.' })
  }

  return sendJson(res, 404, { error: 'Rota não encontrada.' })
}
