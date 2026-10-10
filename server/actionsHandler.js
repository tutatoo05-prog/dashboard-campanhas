import { readRequestBody } from './readBody.js'
import { query } from './db.js'
import { getSaoPauloClock } from './clock.js'
import { normalizeParams, RULE_TYPES } from './rulesEval.js'
import { runRulesEvaluation } from './rules.js'

/**
 * Central de Ações v2 (só admin): adiar, atribuir, histórico de "feito", regras e avisos.
 *
 *  GET   /api/actions/state?accountId=      tudo que a tela precisa, numa chamada só
 *  POST  /api/actions/snooze                { accountId, actionId, until | null }
 *  POST  /api/actions/assign                { accountId, actionId, userId | null }
 *  POST  /api/actions/done                  { accountId, actionId, done, campaignId, title, kind, snapshot }
 *  POST  /api/actions/rules                 { type, params, enabled }
 *  PATCH /api/actions/rules/:id             { enabled?, params? }
 *  DELETE /api/actions/rules/:id
 *  POST  /api/actions/rules/run             avalia as regras agora
 *  PATCH /api/actions/settings              { emailDaily?, emailHour?, whatsappUrgent? }
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SNOOZE_MS = 60 * 24 * 60 * 60 * 1000
const MAX_RULES = 30

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

class HttpError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function readJson(req) {
  let raw
  try {
    raw = await readRequestBody(req, 32 * 1024)
  } catch (error) {
    if (error.message === 'Payload too large') throw new HttpError(413, 'Requisição muito grande.')
    throw new HttpError(400, 'Requisição inválida.')
  }
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    throw new HttpError(400, 'JSON inválido.')
  }
}

function cleanText(value, max) {
  const text = String(value ?? '').trim()
  if (!text || text.length > max) return null
  return text
}

function requireIds(body) {
  const accountId = cleanText(body.accountId, 64)
  const actionId = cleanText(body.actionId, 200)
  if (!accountId || !actionId) throw new HttpError(400, 'Informe accountId e actionId.')
  return { accountId, actionId }
}

function cleanSnapshot(raw) {
  const out = {}
  if (raw && typeof raw === 'object') {
    for (const key of ['spend', 'leads', 'cpl', 'ctr', 'periodDays', 'moneyAtStake']) {
      const value = Number(raw[key])
      if (Number.isFinite(value)) out[key] = value
    }
  }
  return out
}

const toRule = (row) => ({
  id: row.id,
  type: row.type,
  params: row.params ?? {},
  enabled: row.enabled,
})

async function getState(env, url) {
  const accountId = url.searchParams.get('accountId')
  const day = getSaoPauloClock().dateKey
  const byAccount = accountId ? ' and account_id = $1' : ''
  const args = accountId ? [accountId] : []

  const [snoozes, assignments, history, rules, alerts, settings, users] = await Promise.all([
    query(env, `select account_id, action_id, until from action_snoozes where until > now()${byAccount}`, args),
    query(env, `select account_id, action_id, user_id, user_name, user_email from action_assignments where true${byAccount}`, args),
    query(
      env,
      `select account_id, action_id, campaign_id, title, kind, done_by, day, done_at, snapshot
         from action_history where done_at > now() - interval '30 days'${byAccount}
         order by done_at desc limit 200`,
      args,
    ),
    query(env, 'select id, type, params, enabled from automation_rules order by created_at'),
    query(
      env,
      `select a.id, a.account_id, a.campaign_id, a.campaign_name, a.title, a.detail, a.money, r.type
         from rule_alerts a join automation_rules r on r.id = a.rule_id
        where a.day = $${args.length + 1} and not a.cleared${accountId ? ' and a.account_id = $1' : ''}
        order by a.created_at`,
      [...args, day],
    ),
    query(env, 'select email_daily, email_hour, whatsapp_urgent from notification_settings where id = 1'),
    query(env, 'select id, nome, email from users where ativo order by nome'),
  ])

  const s = settings.rows[0]
  return {
    snoozes: snoozes.rows.map((row) => ({
      accountId: row.account_id,
      actionId: row.action_id,
      until: new Date(row.until).toISOString(),
    })),
    assignments: assignments.rows.map((row) => ({
      accountId: row.account_id,
      actionId: row.action_id,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
    })),
    history: history.rows.map((row) => ({
      accountId: row.account_id,
      actionId: row.action_id,
      campaignId: row.campaign_id,
      title: row.title,
      kind: row.kind,
      doneBy: row.done_by,
      day: row.day,
      doneAt: new Date(row.done_at).toISOString(),
      snapshot: row.snapshot ?? {},
    })),
    rules: rules.rows.map(toRule),
    alerts: alerts.rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      title: row.title,
      detail: row.detail,
      money: row.money != null ? Number(row.money) : null,
      ruleType: row.type,
    })),
    settings: {
      emailDaily: s?.email_daily ?? false,
      emailHour: s?.email_hour ?? 8,
      whatsappUrgent: s?.whatsapp_urgent ?? false,
    },
    delivery: { webhookConfigured: Boolean(env.N8N_ALERT_WEBHOOK_URL) },
    users: users.rows.map((row) => ({ id: row.id, nome: row.nome, email: row.email })),
  }
}

async function snooze(env, user, body) {
  const { accountId, actionId } = requireIds(body)

  if (body.until == null) {
    await query(env, 'delete from action_snoozes where account_id = $1 and action_id = $2', [accountId, actionId])
    return { success: true }
  }

  const until = new Date(body.until)
  const delta = until.getTime() - Date.now()
  if (Number.isNaN(delta) || delta < 60_000 || delta > MAX_SNOOZE_MS) {
    throw new HttpError(400, 'Data de retorno inválida (entre agora e 60 dias).')
  }

  await query(
    env,
    `insert into action_snoozes (account_id, action_id, until, by_email) values ($1, $2, $3, $4)
     on conflict (account_id, action_id) do update set until = excluded.until, by_email = excluded.by_email`,
    [accountId, actionId, until, user.email],
  )
  return { success: true, until: until.toISOString() }
}

async function assign(env, user, body) {
  const { accountId, actionId } = requireIds(body)

  if (body.userId == null) {
    await query(env, 'delete from action_assignments where account_id = $1 and action_id = $2', [accountId, actionId])
    return { success: true, assignment: null }
  }

  const userId = String(body.userId)
  if (!UUID_RE.test(userId)) throw new HttpError(400, 'Usuário inválido.')
  const found = await query(env, 'select id, nome, email from users where id = $1 and ativo', [userId])
  const target = found.rows[0]
  if (!target) throw new HttpError(404, 'Usuário não encontrado ou inativo.')

  await query(
    env,
    `insert into action_assignments (account_id, action_id, user_id, user_name, user_email, assigned_by, updated_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (account_id, action_id)
     do update set user_id = excluded.user_id, user_name = excluded.user_name, user_email = excluded.user_email,
                   assigned_by = excluded.assigned_by, updated_at = now()`,
    [accountId, actionId, target.id, target.nome, target.email, user.email],
  )
  return {
    success: true,
    assignment: { accountId, actionId, userId: target.id, userName: target.nome, userEmail: target.email },
  }
}

async function done(env, user, body) {
  const { accountId, actionId } = requireIds(body)
  const day = getSaoPauloClock().dateKey

  if (!body.done) {
    await query(env, 'delete from action_history where account_id = $1 and action_id = $2 and day = $3', [accountId, actionId, day])
    return { success: true }
  }

  await query(
    env,
    `insert into action_history (account_id, action_id, campaign_id, title, kind, done_by, day, snapshot)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     on conflict (account_id, action_id, day)
     do update set done_by = excluded.done_by, done_at = now(), snapshot = excluded.snapshot`,
    [
      accountId,
      actionId,
      cleanText(body.campaignId, 64),
      cleanText(body.title, 300) ?? '',
      cleanText(body.kind, 30) ?? '',
      user.email,
      day,
      JSON.stringify(cleanSnapshot(body.snapshot)),
    ],
  )
  return { success: true }
}

async function createRule(env, user, body) {
  const type = String(body.type ?? '')
  if (!RULE_TYPES.includes(type)) throw new HttpError(400, 'Tipo de regra inválido.')
  let params
  try {
    params = normalizeParams(type, body.params)
  } catch (error) {
    throw new HttpError(400, error.message)
  }

  const count = await query(env, 'select count(*)::int as total from automation_rules')
  if (count.rows[0].total >= MAX_RULES) throw new HttpError(400, `Limite de ${MAX_RULES} regras atingido.`)

  const result = await query(
    env,
    `insert into automation_rules (type, params, enabled, created_by) values ($1, $2::jsonb, $3, $4)
     returning id, type, params, enabled`,
    [type, JSON.stringify(params), body.enabled !== false, user.email],
  )
  return { success: true, rule: toRule(result.rows[0]) }
}

async function updateRule(env, id, body) {
  if (!UUID_RE.test(id)) throw new HttpError(400, 'Regra inválida.')
  const current = await query(env, 'select id, type, params, enabled from automation_rules where id = $1', [id])
  const rule = current.rows[0]
  if (!rule) throw new HttpError(404, 'Regra não encontrada.')

  let params = rule.params
  if (body.params !== undefined) {
    try {
      params = normalizeParams(rule.type, body.params)
    } catch (error) {
      throw new HttpError(400, error.message)
    }
  }
  const enabled = body.enabled === undefined ? rule.enabled : Boolean(body.enabled)

  const result = await query(
    env,
    'update automation_rules set params = $2::jsonb, enabled = $3 where id = $1 returning id, type, params, enabled',
    [id, JSON.stringify(params), enabled],
  )
  // Regra desligada não deve deixar alerta "preso" na tela.
  if (!enabled) await query(env, 'update rule_alerts set cleared = true where rule_id = $1', [id])
  return { success: true, rule: toRule(result.rows[0]) }
}

async function removeRule(env, id) {
  if (!UUID_RE.test(id)) throw new HttpError(400, 'Regra inválida.')
  await query(env, 'delete from automation_rules where id = $1', [id])
  return { success: true }
}

async function updateSettings(env, body) {
  const emailDaily = body.emailDaily === undefined ? null : Boolean(body.emailDaily)
  const whatsappUrgent = body.whatsappUrgent === undefined ? null : Boolean(body.whatsappUrgent)
  let emailHour = null
  if (body.emailHour !== undefined) {
    emailHour = Number(body.emailHour)
    if (!Number.isInteger(emailHour) || emailHour < 0 || emailHour > 23) throw new HttpError(400, 'Hora inválida (0 a 23).')
  }

  const result = await query(
    env,
    `update notification_settings set
       email_daily = coalesce($1, email_daily),
       email_hour = coalesce($2, email_hour),
       whatsapp_urgent = coalesce($3, whatsapp_urgent),
       updated_at = now()
     where id = 1
     returning email_daily, email_hour, whatsapp_urgent`,
    [emailDaily, emailHour, whatsappUrgent],
  )
  const s = result.rows[0]
  return { success: true, settings: { emailDaily: s.email_daily, emailHour: s.email_hour, whatsappUrgent: s.whatsapp_urgent } }
}

export async function handleActionsRequest(req, res, env, user) {
  const url = new URL(req.url, 'http://localhost')
  const { pathname } = url

  try {
    if (pathname === '/api/actions/state' && req.method === 'GET') return sendJson(res, 200, await getState(env, url))

    if (req.method === 'POST' && pathname === '/api/actions/snooze') return sendJson(res, 200, await snooze(env, user, await readJson(req)))
    if (req.method === 'POST' && pathname === '/api/actions/assign') return sendJson(res, 200, await assign(env, user, await readJson(req)))
    if (req.method === 'POST' && pathname === '/api/actions/done') return sendJson(res, 200, await done(env, user, await readJson(req)))
    if (req.method === 'POST' && pathname === '/api/actions/rules') return sendJson(res, 200, await createRule(env, user, await readJson(req)))

    if (req.method === 'POST' && pathname === '/api/actions/rules/run') {
      const summary = await runRulesEvaluation(env)
      return sendJson(res, 200, { success: true, ...summary })
    }

    const ruleMatch = pathname.match(/^\/api\/actions\/rules\/([^/]+)$/)
    if (ruleMatch && req.method === 'PATCH') return sendJson(res, 200, await updateRule(env, ruleMatch[1], await readJson(req)))
    if (ruleMatch && req.method === 'DELETE') return sendJson(res, 200, await removeRule(env, ruleMatch[1]))

    if (pathname === '/api/actions/settings' && req.method === 'PATCH') {
      return sendJson(res, 200, await updateSettings(env, await readJson(req)))
    }

    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  } catch (error) {
    if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message, code: error.code })
    // 42P01 = tabela inexistente: a migração do db/schema.sql ainda não foi rodada.
    if (error?.code === '42P01') {
      return sendJson(res, 503, {
        error: 'Recursos novos da Central de Ações precisam da migração do banco (bloco "Central de Ações v2" em db/schema.sql).',
        code: 'MIGRATION_NEEDED',
      })
    }
    console.error('[actions]', error)
    return sendJson(res, 502, { error: 'Erro ao acessar o banco de dados.' })
  }
}
