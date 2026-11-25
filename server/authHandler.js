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
import { checkLoginRateLimit, resetLoginRateLimit, checkResetRateLimit, getClientIp } from './security.js'
import { estadoDoPedido, garantirEsquemaPedidos, pedirTrocaDeSenha } from './senhaPedidos.js'
import { avisarCadastroPendente } from './aprovacaoTelegram.js'
import { enviarTelegram } from './alertas.js'
import { emailDomainExists, isValidEmailFormat } from './emailValidation.js'
import { atualizarPerfil, senhaForte as isStrongPassword, trocarSenha } from './perfil.js'

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function toPublicUser(row) {
  if (!row) return null
  return { id: row.id, nome: row.nome, email: row.email, usuario: row.usuario, cargo: row.cargo ?? 'usuario', avatar: row.avatar ?? null }
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

  if (pathname === '/api/auth/me' && req.method === 'PATCH') {
    const user = await getUserFromRequest(env, req)
    if (!user) return sendJson(res, 401, { error: 'Não autenticado.', code: 'UNAUTHORIZED' })
    return atualizarPerfil(req, res, env, user)
  }

  if (pathname === '/api/auth/senha' && req.method === 'POST') {
    const user = await getUserFromRequest(env, req)
    if (!user) return sendJson(res, 401, { error: 'Não autenticado.', code: 'UNAUTHORIZED' })
    return trocarSenha(req, res, env, user)
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
        'select id, nome, email, usuario, senha_hash, ativo, cargo, avatar from users where usuario = $1 or email = $1',
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

      if (!isValidEmailFormat(email) || !(await emailDomainExists(email))) {
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

      // Aviso no Telegram com Aprovar/Recusar (não espera nem derruba o cadastro se falhar).
      void avisarCadastroPendente(env, { id: inserted.rows[0].id, nome, email })

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

      // Vários cadastros usam e-mail que não existe, então o link não vai por e-mail. O pedido vai para o Telegram da
      // equipe (Liberar / Negar) e a tela espera a liberação em /api/auth/reset-status. O token só sai depois disso.
      if (!email || !isEmail(email)) {
        return sendJson(res, 400, { error: 'Digite um e-mail válido.' })
      }

      try {
        await garantirEsquemaPedidos(env)
        const { pedido } = await pedirTrocaDeSenha(env, email, { ip: getClientIp(req) })
        return sendJson(res, 200, {
          success: true,
          pedido,
          message: 'Pedido enviado para a equipe. Assim que um administrador liberar, esta tela abre a troca de senha.',
        })
      } catch (erro) {
        if (erro?.message === 'SEM_TELEGRAM') {
          return sendJson(res, 503, { error: 'Não consegui avisar a equipe agora. Peça a um administrador para gerar a sua senha.' })
        }
        throw erro
      }
    } catch (error) {
      console.error('Erro ao solicitar redefinição de senha:', error)
      return sendJson(res, 500, { error: 'Erro ao processar a solicitação.' })
    }
  }

  if (pathname === '/api/auth/reset-status' && req.method === 'POST') {
    try {
      const rawBody = await readRequestBody(req)
      let body = {}
      try {
        body = rawBody ? JSON.parse(rawBody) : {}
      } catch {
        return sendJson(res, 400, { error: 'JSON inválido.' })
      }
      const pedido = String(body.pedido ?? '').trim()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pedido)) {
        return sendJson(res, 400, { error: 'Pedido inválido.' })
      }
      await garantirEsquemaPedidos(env)
      return sendJson(res, 200, await estadoDoPedido(env, pedido))
    } catch (error) {
      console.error('Erro ao consultar pedido de senha:', error)
      return sendJson(res, 500, { error: 'Erro ao consultar o pedido.' })
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
        `select r.user_id, u.nome, u.email from password_resets r join users u on u.id = r.user_id
          where r.token = $1 and r.used_at is null and r.liberado_em is not null and r.negado_em is null
            and r.expires_at > now()`,
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
      // A liberação foi da equipe, mas avisa também quando a troca termina, para uma troca indevida não passar despercebida.
      enviarTelegram(env, `🔐 Senha do dash trocada pela tela "Esqueci minha senha": ${reset.nome} (${reset.email})`).catch((erro) =>
        console.warn('[senha] não consegui avisar no Telegram:', erro.message || erro),
      )

      return sendJson(res, 200, { success: true, message: 'Senha redefinida. Faça login novamente.' })
    } catch (error) {
      console.error('Erro ao redefinir senha:', error)
      return sendJson(res, 500, { error: 'Erro ao redefinir a senha.' })
    }
  }

  return sendJson(res, 404, { error: 'Rota não encontrada.' })
}
