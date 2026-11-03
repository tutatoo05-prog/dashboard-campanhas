import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Código do botão "Receber outro link" do e-mail de boas-vindas (ver novoLink.js).
 *
 * O código é `<id do acesso>.<assinatura>`: não tem e-mail nem nome na URL (nada pessoal em endereço, que vai para log e
 * histórico). Quem tem o código só consegue uma coisa: mandar um link novo PARA O E-MAIL DA PRÓPRIA PESSOA. Por isso ele
 * não precisa expirar; o que protege é o limite de pedidos (novoLink.js). A assinatura impede inventar códigos de outros alunos.
 */

const BASE_PADRAO = 'https://dash.tuzinho.academy'

/** Chave derivada do segredo do servidor. NOVO_LINK_SEGREDO manda; sem ele usa o token da API V2 (que já existe quando isto funciona). */
function chave(env) {
  const base = String(env.NOVO_LINK_SEGREDO || env.TELWAY_V2_TOKEN || '').trim()
  return base ? createHmac('sha256', 'novo-link-v1').update(base).digest() : null
}

function assinar(env, id) {
  return createHmac('sha256', chave(env)).update(`novo-link:${id}`).digest('base64url').slice(0, 22)
}

export function segredoConfigurado(env) {
  return chave(env) !== null
}

/** Código do acesso, ou null quando não dá para gerar (sem segredo ou id inválido). */
export function criarTokenNovoLink(env, acessoId) {
  const id = Number(acessoId)
  if (!chave(env) || !Number.isSafeInteger(id) || id <= 0) return null
  return `${id}.${assinar(env, id)}`
}

/** Id do acesso se o código for autêntico; senão null. */
export function lerTokenNovoLink(env, token) {
  if (!chave(env)) return null
  const partes = String(token ?? '').split('.')
  if (partes.length !== 2 || !/^\d{1,15}$/.test(partes[0])) return null
  const id = Number(partes[0])
  const esperado = Buffer.from(assinar(env, id))
  const recebido = Buffer.from(partes[1])
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido) ? id : null
}

/** Endereço do botão do e-mail (página do dash), ou null quando não há como assinar. */
export function urlNovoLink(env, acessoId) {
  const token = criarTokenNovoLink(env, acessoId)
  if (!token) return null
  return `${String(env.APP_URL || BASE_PADRAO).replace(/\/+$/, '')}/novo-link?t=${token}`
}
