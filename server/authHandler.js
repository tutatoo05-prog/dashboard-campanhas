import { randomBytes } from 'node:crypto'
import { readRequestBody } from './readBody.js'
import { query } from './db.js'
import { hashPassword, verifyPassword } from './passwords.js'
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getUserFromRequest,
  getSessionToken,
  setSessionCookie,
} from './session.js'
import { checkLoginRateLimit, resetLoginRateLimit, checkResetRateLimit } from './security.js'

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isStrongPassword(value) {
  return (
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  )
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function toPublicUser(row) {
  if (!row) return null
  return { id: row.id, nome: row.nome, email: row.email, usuario: row.usuario }
}

/** Avisa o n8n (WhatsApp) sobre um novo cadastro pendente de aprovação. Não bloqueia a resposta se falhar. */
function notifyRegistration(env, { id, nome, email }) {
  const webhookUrl = env.N8N_APPROVAL_WEBHOOK_URL
  if (!webhookUrl) return

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, nome, email }),
  }).catch((error) => {
    console.error('Erro ao avisar novo cadastro via n8n:', error)
  })
}

/** Avisa o n8n (e-mail/WhatsApp) com o link de redefinição de senha. Não bloqueia a resposta se falhar. */
function notifyPasswordReset(env, { nome, email, resetLink }) {
  const webhookUrl = env.N8N_RESET_PASSWORD_WEBHOOK_URL
  if (!webhookUrl) return

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, email, resetLink }),
  }).catch((error) => {
    console.error('Erro ao avisar redefinição de senha via n8n:', error)
  })
}

/** Link enviado ao usuário. Prioriza APP_URL (evita confiar no header Host em produção). */
function buildResetLink(env, req, token) {
  const base = env.APP_URL || `https://${req.headers.host}`
  return `${base.replace(/\/$/, '')}/reset-password?token=${token}`
}

export async function requireAuth(req, res, env) {
  const user = await getUserFromRequest(env, req)

  if (!user) {
    sendJson(res, 401, { error: 'Não autenticado.', code: 'UNAUTHORIZED' })
    return null
  }

  return user
}

export async function handleAuthRequest(req, res, env) {
  const { pathname } = new URL(req.url, 'http://localhost')

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await getUserFromRequest(env, req)

    if (!user) {
      return sendJson(res, 200, { authenticated: false })
    }

    return sendJson(res, 200, { authenticated: true, user: toPublicUser(user) })
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    await destroySession(env, getSessionToken(req))
    clearSessionCookie(res)
    return sendJson(res, 200, { success: true })
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const rate = checkLoginRateLimit(req)
      if (!rate.allowed) {
        return sendJson(res, 429, {
          error: `Muitas tentativas. Aguarde ${rate.retryAfterSec}s e tente novamente.`,
        })
      }

      const rawBody = await readRequestBody(req)
      let body = {}
      try {
        body = rawBody ? JSON.parse(rawBody) : {}
      } catch {
        return sendJson(res, 400, { error: 'JSON inválido.' })
      }

      const email = String(body.email ?? '').trim()
      const usuario = String(body.usuario ?? body.email ?? body.username ?? email).trim().toLowerCase()
      const senha = String(body.senha ?? body.password ?? '')

      if (!usuario || !senha) {
        return sendJson(res, 400, { error: 'Informe usuário e senha.' })
      }

      const result = await query(
        env,
        'select id, nome, email, usuario, senha_hash, ativo from users where usuario = $1 or email = $1',
        [usuario],
      )
      const row = result.rows[0]

      if (!row || !(await verifyPassword(senha, row.senha_hash))) {
        return sendJson(res, 401, { error: 'Usuário ou senha incorretos.' })
      }

      if (!row.ativo) {
        return sendJson(res, 403, { error: 'Conta pendente de aprovação.' })
      }

      const token = await createSession(env, row.id)
      setSessionCookie(res, token)
      resetLoginRateLimit(req)

      return sendJson(res, 200, {
        success: true,
        user: toPublicUser(row),
      })
    } catch (error) {
      if (error.message === 'Payload too large') {
        return sendJson(res, 413, { error: 'Requisição muito grande.' })
      }
      console.error('Erro no login:', error)
      return sendJson(res, 500, { error: 'Erro ao validar login.' })
    }
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const rate = checkLoginRateLimit(req)
      if (!rate.allowed) {
        return sendJson(res, 429, {
          error: `Muitas tentativas. Aguarde ${rate.retryAfterSec}s e tente novamente.`,
        })
      }

      const rawBody = await readRequestBody(req)
      let body = {}
      try {
        body = rawBody ? JSON.parse(rawBody) : {}
      } catch {
        return sendJson(res, 400, { error: 'JSON inválido.' })
      }

      const nome = String(body.nome ?? body.name ?? '').trim()
      const email = String(body.email ?? body.usuario ?? '').trim().toLowerCase()
      const senha = String(body.senha ?? body.password ?? '')

      if (!nome) {
        return sendJson(res, 400, { error: 'Informe seu nome.' })
      }

      if (!email || !isEmail(email)) {
        return sendJson(res, 400, { error: 'Informe um e-mail válido.' })
      }

      if (!isStrongPassword(senha)) {
        return sendJson(res, 400, {
          error: 'A senha precisa ter 8+ caracteres, maiúscula, minúscula, número e caractere especial.',
        })
      }

      const existing = await query(env, 'select id from users where email = $1 or usuario = $1', [email])
      if (existing.rows.length) {
        return sendJson(res, 409, { error: 'Já existe uma conta com esse e-mail.' })
      }

      const senhaHash = await hashPassword(senha)

      const inserted = await query(
        env,
        'insert into users (nome, email, usuario, senha_hash, ativo) values ($1, $2, $2, $3, false) returning id',
        [nome, email, senhaHash],
      )

      notifyRegistration(env, { id: inserted.rows[0].id, nome, email })

      return sendJson(res, 200, {
        success: true,
        message: 'Conta criada. Aguarde aprovação para fazer login.',
      })
    } catch (error) {
      if (error.message === 'Payload too large') {
        return sendJson(res, 413, { error: 'Requisição muito grande.' })
      }
      console.error('Erro no registro:', error)
      return sendJson(res, 500, { error: 'Erro ao registrar conta.' })
    }
  }

  if (pathname === '/api/auth/forgot-password' && req.method === 'POST') {
    try {
      const rate = checkResetRateLimit(req)
      if (!rate.allowed) {
        return sendJson(res, 429, {
          error: `Muitas tentativas. Aguarde ${rate.retryAfterSec}s e tente novamente.`,
        })
      }

      const rawBody = await readRequestBody(req)
      let body = {}
      try {
        body = rawBody ? JSON.parse(rawBody) : {}
      } catch {
        return sendJson(res, 400, { error: 'JSON inválido.' })
      }

      const email = String(body.email ?? '').trim().toLowerCase()

      // Resposta genérica sempre — não revela se o e-mail existe na base.
      const genericResponse = {
        success: true,
        message: 'Se esse e-mail estiver cadastrado, você vai receber um link para redefinir a senha.',
      }

      if (!email || !isEmail(email)) {
        return sendJson(res, 200, genericResponse)
      }

      const result = await query(env, 'select id, nome, email from users where email = $1', [email])
      const user = result.rows[0]

      if (user) {
        const token = randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

        await query(
          env,
          'insert into password_resets (token, user_id, expires_at) values ($1, $2, $3)',
          [token, user.id, expiresAt],
        )

        notifyPasswordReset(env, {
          nome: user.nome,
          email: user.email,
          resetLink: buildResetLink(env, req, token),
        })
      }

      return sendJson(res, 200, genericResponse)
    } catch (error) {
      console.error('Erro ao solicitar redefinição de senha:', error)
      return sendJson(res, 500, { error: 'Erro ao processar a solicitação.' })
    }
  }

  if (pathname === '/api/auth/reset-password' && req.method === 'POST') {
    try {
      const rawBody = await readRequestBody(req)
      let body = {}
      try {
        body = rawBody ? JSON.parse(rawBody) : {}
      } catch {
        return sendJson(res, 400, { error: 'JSON inválido.' })
      }

      const token = String(body.token ?? '').trim()
      const senha = String(body.senha ?? body.password ?? '')

      if (!token) {
        return sendJson(res, 400, { error: 'Link inválido.' })
      }

      if (!isStrongPassword(senha)) {
        return sendJson(res, 400, {
          error: 'A senha precisa ter 8+ caracteres, maiúscula, minúscula, número e caractere especial.',
        })
      }

      const result = await query(
        env,
        'select user_id from password_resets where token = $1 and used_at is null and expires_at > now()',
        [token],
      )
      const reset = result.rows[0]

      if (!reset) {
        return sendJson(res, 400, { error: 'Link inválido ou expirado. Solicite um novo.' })
      }

      const senhaHash = await hashPassword(senha)

      await query(env, 'update users set senha_hash = $1 where id = $2', [senhaHash, reset.user_id])
      await query(env, 'update password_resets set used_at = now() where token = $1', [token])
      // Invalida sessões ativas — a troca de senha não deve deixar sessões antigas válidas.
      await query(env, 'delete from sessions where user_id = $1', [reset.user_id])

      return sendJson(res, 200, { success: true, message: 'Senha redefinida. Faça login novamente.' })
    } catch (error) {
      console.error('Erro ao redefinir senha:', error)
      return sendJson(res, 500, { error: 'Erro ao redefinir a senha.' })
    }
  }

  return sendJson(res, 404, { error: 'Rota não encontrada.' })
}
