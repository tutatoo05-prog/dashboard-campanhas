import { randomBytes } from 'node:crypto'
import { query } from './db.js'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const COOKIE_NAME = 'dash_session'

export async function createSession(env, userId) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await query(
    env,
    'insert into sessions (token, user_id, expires_at) values ($1, $2, $3)',
    [token, userId, expiresAt],
  )

  return token
}

// Cada chamada da API confere o login no banco; uma tela faz dezenas. Guardar 30 s elimina quase todas e
// faz o login resistir a um banco lento por um instante. Sair (logout) apaga na hora.
const VALIDADE_CACHE_MS = 30_000
/** @type {Map<string, { at: number, user: object }>} */
const usuariosEmMemoria = new Map()

export function limparCacheDeSessoes() {
  usuariosEmMemoria.clear()
}

export async function getSessionUser(env, token) {
  if (!token) return null

  const guardado = usuariosEmMemoria.get(token)
  if (guardado && Date.now() - guardado.at < VALIDADE_CACHE_MS) return guardado.user

  const result = await query(
    env,
    `select u.id, u.nome, u.email, u.usuario, u.ativo, u.cargo
       from sessions s
       join users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now()`,
    [token],
  )

  const user = result.rows[0] ?? null
  if (user) {
    if (usuariosEmMemoria.size > 500) usuariosEmMemoria.clear()
    usuariosEmMemoria.set(token, { at: Date.now(), user })
  } else {
    usuariosEmMemoria.delete(token)
  }
  return user
}

export async function destroySession(env, token) {
  if (!token) return
  usuariosEmMemoria.delete(token)
  await query(env, 'delete from sessions where token = $1', [token])
}

export function parseCookies(req) {
  const header = req.headers.cookie ?? ''
  const cookies = {}

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key) cookies[key] = decodeURIComponent(rest.join('='))
  }

  return cookies
}

export function getSessionToken(req) {
  return parseCookies(req)[COOKIE_NAME] ?? null
}

export async function getUserFromRequest(env, req) {
  return getSessionUser(env, getSessionToken(req))
}

export function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000)
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  )
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  )
}

export { COOKIE_NAME }
