import { readRequestBody } from './readBody.js'
import { query } from './db.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function toGoal(row) {
  if (!row) return null
  return {
    accountId: row.account_id,
    month: row.month,
    spendTarget: row.spend_target != null ? Number(row.spend_target) : null,
    cplTarget: row.cpl_target != null ? Number(row.cpl_target) : null,
  }
}

export async function handleGoalsRequest(req, res, env) {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname !== '/api/goals') {
    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  }

  if (req.method === 'GET') {
    const accountId = url.searchParams.get('accountId')
    const month = url.searchParams.get('month')

    if (!accountId || !month) {
      return sendJson(res, 400, { error: 'Informe accountId e month.' })
    }

    try {
      const result = await query(
        env,
        'select account_id, month, spend_target, cpl_target from goals where account_id = $1 and month = $2',
        [accountId, month],
      )

      return sendJson(res, 200, { success: true, goal: toGoal(result.rows[0]) })
    } catch (error) {
      console.error('Erro ao buscar meta:', error)
      return sendJson(res, 502, { error: 'Erro ao buscar meta no banco de dados.' })
    }
  }

  if (req.method === 'POST') {
    try {
      const rawBody = await readRequestBody(req)
      const body = rawBody ? JSON.parse(rawBody) : {}

      const accountId = String(body.accountId ?? '').trim()
      const month = String(body.month ?? '').trim()
      const spendTarget = body.spendTarget === '' || body.spendTarget == null ? null : Number(body.spendTarget)
      const cplTarget = body.cplTarget === '' || body.cplTarget == null ? null : Number(body.cplTarget)

      if (!accountId || !/^\d{4}-\d{2}$/.test(month)) {
        return sendJson(res, 400, { error: 'Informe accountId e month (AAAA-MM) válidos.' })
      }

      if (spendTarget != null && !Number.isFinite(spendTarget)) {
        return sendJson(res, 400, { error: 'Meta de investimento inválida.' })
      }

      if (cplTarget != null && !Number.isFinite(cplTarget)) {
        return sendJson(res, 400, { error: 'Meta de CPL inválida.' })
      }

      const result = await query(
        env,
        `insert into goals (account_id, month, spend_target, cpl_target, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (account_id, month)
         do update set spend_target = excluded.spend_target, cpl_target = excluded.cpl_target, updated_at = now()
         returning account_id, month, spend_target, cpl_target`,
        [accountId, month, spendTarget, cplTarget],
      )

      return sendJson(res, 200, { success: true, goal: toGoal(result.rows[0]) })
    } catch (error) {
      if (error.message === 'Payload too large') {
        return sendJson(res, 413, { error: 'Requisição muito grande.' })
      }
      console.error('Erro ao salvar meta:', error)
      return sendJson(res, 502, { error: 'Erro ao salvar meta no banco de dados.' })
    }
  }

  return sendJson(res, 405, { error: 'Método não permitido.' })
}
