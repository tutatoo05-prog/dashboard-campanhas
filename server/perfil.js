import { readRequestBody } from './readBody.js'
import { query } from './db.js'
import { hashPassword, verifyPassword } from './passwords.js'
import { getSessionToken, limparCacheDeSessoes } from './session.js'
import { checkLoginRateLimit, resetLoginRateLimit } from './security.js'

/**
 * "Minha conta": cada pessoa muda o próprio nome, a foto (ou adesivo) e a senha.
 *   PATCH /api/auth/me     { nome?, avatar? }
 *   POST  /api/auth/senha  { atual, nova }
 * O cargo, o e-mail e o status só o admin altera (tela Usuários).
 */

/** Adesivos de tatuagem que podem ser o avatar (mesmos nomes de src/components/flash/iconData.ts). */
export const ADESIVOS_DE_AVATAR = ['rose', 'skull', 'anchor', 'eye', 'swallow', 'dagger', 'heart', 'star', 'moon', 'bolt', 'crown', 'lighthouse', 'machine', 'wave']
const FOTO_MAXIMA = 90_000 // caracteres do data URL (a tela reduz a foto para ~256 px antes de mandar)
const FOTO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

export function senhaForte(valor) {
  const v = String(valor ?? '')
  return v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)
}

export function validarNome(valor) {
  const nome = String(valor ?? '').replace(/\s+/g, ' ').trim()
  if (nome.length < 2) return { erro: 'Escreva um nome com pelo menos 2 letras.' }
  if (nome.length > 80) return { erro: 'O nome pode ter no máximo 80 caracteres.' }
  return { valor: nome }
}

/** '' = voltar para a inicial do nome; 'sticker:rose' = adesivo; 'data:image/...' = foto enviada. */
export function validarAvatar(valor) {
  const v = String(valor ?? '')
  if (v === '') return { valor: null }
  if (v.startsWith('sticker:')) {
    return ADESIVOS_DE_AVATAR.includes(v.slice(8)) ? { valor: v } : { erro: 'Esse adesivo não existe.' }
  }
  if (v.length > FOTO_MAXIMA) return { erro: 'A foto ficou grande demais. Escolha uma menor.' }
  if (!FOTO.test(v)) return { erro: 'Envie uma foto PNG, JPG ou WebP.' }
  return { valor: v }
}

function responder(res, status, corpo) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(corpo))
}

async function lerJson(req) {
  try {
    return JSON.parse((await readRequestBody(req, 160 * 1024)) || '{}')
  } catch (erro) {
    if (erro?.message === 'Payload too large') throw erro
    return null
  }
}

function publico(linha) {
  return { id: linha.id, nome: linha.nome, email: linha.email, usuario: linha.usuario, cargo: linha.cargo ?? 'usuario', avatar: linha.avatar ?? null }
}

export async function atualizarPerfil(req, res, env, user, consultar = (texto, params) => query(env, texto, params)) {
  let corpo
  try {
    corpo = await lerJson(req)
  } catch {
    return responder(res, 413, { error: 'A foto ficou grande demais. Escolha uma menor.' })
  }
  if (!corpo) return responder(res, 400, { error: 'JSON inválido.' })

  const mudancas = []
  const valores = [user.id]
  if ('nome' in corpo) {
    const r = validarNome(corpo.nome)
    if (r.erro) return responder(res, 400, { error: r.erro })
    valores.push(r.valor)
    mudancas.push(`nome = $${valores.length}`)
  }
  if ('avatar' in corpo) {
    const r = validarAvatar(corpo.avatar)
    if (r.erro) return responder(res, 400, { error: r.erro })
    valores.push(r.valor)
    mudancas.push(`avatar = $${valores.length}`)
  }
  if (!mudancas.length) return responder(res, 400, { error: 'Nada para alterar.' })

  const { rows } = await consultar(`update users set ${mudancas.join(', ')} where id = $1 returning id, nome, email, usuario, cargo, avatar`, valores)
  limparCacheDeSessoes() // a próxima chamada já enxerga o nome/foto novos
  return responder(res, 200, { success: true, user: publico(rows[0]) })
}

export async function trocarSenha(req, res, env, user, consultar = (texto, params) => query(env, texto, params)) {
  const limite = checkLoginRateLimit(req)
  if (!limite.allowed) return responder(res, 429, { error: `Muitas tentativas. Aguarde ${limite.retryAfterSec}s e tente de novo.` })

  const corpo = await lerJson(req).catch(() => null)
  if (!corpo) return responder(res, 400, { error: 'JSON inválido.' })
  const atual = String(corpo.atual ?? '')
  const nova = String(corpo.nova ?? '')
  if (!senhaForte(nova)) return responder(res, 400, { error: 'A nova senha precisa de 8+ caracteres, com maiúscula, minúscula, número e símbolo.' })

  const { rows } = await consultar('select senha_hash from users where id = $1', [user.id])
  if (!rows[0] || !(await verifyPassword(atual, rows[0].senha_hash))) return responder(res, 400, { error: 'A senha atual não confere.' })

  await consultar('update users set senha_hash = $2 where id = $1', [user.id, await hashPassword(nova)])
  // Quem tinha a senha antiga em outro aparelho precisa entrar de novo; a sessão desta pessoa continua.
  await consultar('delete from sessions where user_id = $1 and token <> $2', [user.id, getSessionToken(req) ?? ''])
  limparCacheDeSessoes()
  resetLoginRateLimit(req)
  return responder(res, 200, { success: true })
}
