import { createHmac, timingSafeEqual } from 'node:crypto'
import { segredoDoClube } from './config.js'

// Tokens assinados do resgate (links do e-mail e "state" dos logins). Sem banco: o próprio token carrega o que precisa e
// a assinatura impede inventar ou alterar. Cada token tem um PROPÓSITO e uma validade; um token de um propósito não vale
// em outro (ex.: o state do Google não serve de link de resgate).
//
// Formato: <payload em base64url>.<assinatura>. O payload leva só plataforma, chave (e-mail ou id do canal) e validade.
// Nada disso vai para log: quem chama não deve registrar a URL com o token.

const chave = (env) => {
  const base = segredoDoClube(env)
  return base ? createHmac('sha256', 'clube-v1').update(base).digest() : null
}

const assinar = (k, proposito, corpo) => createHmac('sha256', k).update(`${proposito}.${corpo}`).digest('base64url').slice(0, 32)

/** Token novo, ou null se o servidor não tem segredo. `agora` existe para os testes. */
export function criarToken(env, proposito, dados, validadeMs, agora = Date.now()) {
  const k = chave(env)
  if (!k) return null
  const corpo = Buffer.from(JSON.stringify({ ...dados, exp: agora + validadeMs })).toString('base64url')
  return `${corpo}.${assinar(k, proposito, corpo)}`
}

/** Dados do token se for autêntico, do propósito certo e dentro da validade; senão null. */
export function lerToken(env, proposito, token, agora = Date.now()) {
  const k = chave(env)
  if (!k || typeof token !== 'string' || token.length > 2000) return null
  const partes = token.split('.')
  if (partes.length !== 2) return null
  const esperado = Buffer.from(assinar(k, proposito, partes[0]))
  const recebido = Buffer.from(partes[1])
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null
  try {
    const dados = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'))
    return Number.isFinite(dados.exp) && dados.exp > agora ? dados : null
  } catch {
    return null
  }
}
