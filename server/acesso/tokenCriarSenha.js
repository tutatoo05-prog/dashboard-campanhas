import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

/**
 * Código do botão "Criar minha senha" do e-mail de boas-vindas (ver novoLink.js, rota /api/criar-senha).
 *
 * O botão não aponta direto para a plataforma: aponta para uma página nossa que, enquanto o link da plataforma ainda vale
 * (30 min), manda a pessoa para ele e, depois disso, avisa que não está mais ativo e oferece um novo envio.
 * Para não guardar nada no banco, o código TRAZ dentro o link da plataforma, o vencimento e o id do acesso, cifrados e
 * autenticados (AES-256-GCM): quem vê o endereço não lê nem falsifica nada. É o mesmo nível de segredo do link do e-mail.
 */

const BASE_PADRAO = 'https://dash.tuzinho.academy'
const MAX_TOKEN = 2400
/** Folga: o link da plataforma é tratado como vencido um pouco antes, para ninguém ser mandado para um link morrendo. */
export const FOLGA_MS = 30_000

/** Chave derivada do segredo do servidor. NOVO_LINK_SEGREDO manda; sem ele usa o token da API V2. */
function chave(env) {
  const base = String(env.NOVO_LINK_SEGREDO || env.TELWAY_V2_TOKEN || '').trim()
  return base ? createHmac('sha256', 'criar-senha-v1').update(base).digest() : null
}

/** Código cifrado, ou null quando não dá para gerar (sem segredo, link ou vencimento inválidos). */
export function criarTokenCriarSenha(env, { url, expiraEm, acessoId = null }) {
  const k = chave(env)
  const x = Date.parse(expiraEm)
  if (!k || !/^https:\/\//i.test(String(url ?? '')) || !Number.isFinite(x)) return null
  const a = Number(acessoId)
  const texto = JSON.stringify({ u: url, x, a: Number.isSafeInteger(a) && a > 0 ? a : null })
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', k, iv)
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return Buffer.concat([iv, cifra.getAuthTag(), dados]).toString('base64url')
}

/** { url, expiraEmMs, acessoId } se o código for autêntico; senão null. */
export function lerTokenCriarSenha(env, token) {
  const k = chave(env)
  const texto = String(token ?? '')
  if (!k || !texto || texto.length > MAX_TOKEN || !/^[\w-]+$/.test(texto)) return null
  try {
    const bruto = Buffer.from(texto, 'base64url')
    if (bruto.length < 12 + 16 + 2) return null
    const decifra = createDecipheriv('aes-256-gcm', k, bruto.subarray(0, 12))
    decifra.setAuthTag(bruto.subarray(12, 28))
    const dados = JSON.parse(Buffer.concat([decifra.update(bruto.subarray(28)), decifra.final()]).toString('utf8'))
    if (!/^https:\/\//i.test(String(dados.u ?? '')) || !Number.isFinite(dados.x)) return null
    return { url: dados.u, expiraEmMs: dados.x, acessoId: Number.isSafeInteger(dados.a) && dados.a > 0 ? dados.a : null }
  } catch {
    return null // adulterado, de outra chave ou quebrado
  }
}

/** Endereço do botão (página do dash), ou null quando não há como cifrar. */
export function urlCriarSenha(env, dados) {
  const token = criarTokenCriarSenha(env, dados)
  if (!token) return null
  return `${String(env.APP_URL || BASE_PADRAO).replace(/\/+$/, '')}/criar-senha?c=${token}`
}
