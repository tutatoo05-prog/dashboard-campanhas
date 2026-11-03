import { query } from '../db.js'
import { readRequestBody } from '../readBody.js'
import { getClientIp } from '../security.js'
import * as integracoesPadrao from './integracoes.js'
import { htmlBoasVindasComLink } from './motor.js'
import { criarTokenNovoLink, lerTokenNovoLink, segredoConfigurado } from './tokenNovoLink.js'
import { FOLGA_MS, lerTokenCriarSenha } from './tokenCriarSenha.js'

/**
 * POST /api/novo-link  { t }  — PÚBLICO (o aluno clica no botão do e-mail, sem login).
 * O link de criar senha vale pouco tempo; quem perdeu o prazo pede outro aqui. O link novo vai SÓ por e-mail para o
 * endereço do próprio acesso: nunca volta na resposta. O código `t` (tokenNovoLink.js) não traz dado pessoal.
 */

export const ASSUNTO_NOVO_LINK = 'Seu novo link para criar a senha — Tuzinho Academy'

/** Limite de pedidos em memória: no máximo `max` por `janelaMs`, por chave. */
export function criarLimite({ max, janelaMs }, relogio = () => Date.now()) {
  const entradas = new Map()
  return (chave) => {
    const agora = relogio()
    if (entradas.size > 5000) for (const [k, v] of entradas) if (agora > v.fim) entradas.delete(k)
    const atual = entradas.get(chave)
    if (!atual || agora > atual.fim) {
      entradas.set(chave, { conta: 1, fim: agora + janelaMs })
      return { ok: true }
    }
    if (atual.conta >= max) return { ok: false, espera: Math.ceil((atual.fim - agora) / 1000) }
    atual.conta += 1
    return { ok: true }
  }
}

/** a***@gmail.com: mostra para quem pediu onde o link foi, sem expor o e-mail inteiro. */
export function mascararEmail(email) {
  const [usuario = '', dominio = ''] = String(email).split('@')
  return `${usuario.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, usuario.length - 1)))}@${dominio}`
}

const MSG_INVALIDO = 'Este link não é válido. Na tela de entrada da plataforma, use “Esqueci minha senha”.'

export function criarServicoNovoLink({ limites = {}, relogio } = {}) {
  const porIp = limites.porIp ?? criarLimite({ max: 10, janelaMs: 15 * 60_000 }, relogio)
  const porAcessoCurto = limites.porAcessoCurto ?? criarLimite({ max: 1, janelaMs: 60_000 }, relogio)
  const porAcessoHora = limites.porAcessoHora ?? criarLimite({ max: 5, janelaMs: 60 * 60_000 }, relogio)

  /** Devolve { status, corpo }. `deps` existe para os testes não saírem pela rede nem tocarem no banco. */
  return async function processar(env, { token, ip }, deps = {}) {
    const integ = deps.integ ?? integracoesPadrao
    const buscarAcesso =
      deps.buscarAcesso ??
      (async (id) => (await query(env, 'select id, email, nome from acessos where id = $1', [id])).rows[0] ?? null)

    if (!integ.v2Configurado(env) || !segredoConfigurado(env)) return { status: 503, corpo: { error: 'Isso não está disponível agora. Tente de novo mais tarde.' } }

    const limiteIp = porIp(ip)
    if (!limiteIp.ok) return { status: 429, corpo: { error: `Muitas tentativas. Aguarde ${limiteIp.espera}s e tente de novo.` } }

    const id = lerTokenNovoLink(env, token)
    if (!id) return { status: 400, corpo: { error: MSG_INVALIDO } }

    const curto = porAcessoCurto(id)
    const hora = curto.ok ? porAcessoHora(id) : null
    if (!curto.ok || !hora.ok) {
      const espera = curto.ok ? hora.espera : curto.espera
      return { status: 429, corpo: { error: `Já enviamos um link há pouco. Olhe sua caixa de entrada (e o spam) ou aguarde ${espera}s para pedir outro.` } }
    }

    const acesso = await buscarAcesso(id)
    if (!acesso?.email) return { status: 400, corpo: { error: MSG_INVALIDO } }

    try {
      const html = await htmlBoasVindasComLink(env, integ, { nome: acesso.nome ?? '', email: acesso.email, acessoId: id })
      await integ.enviarEmail(env, { para: acesso.email, nomePara: acesso.nome ?? '', assunto: ASSUNTO_NOVO_LINK, html })
    } catch (erro) {
      const mensagem = String(erro?.message ?? erro)
      console.error('[novo-link] não consegui enviar:', mensagem.slice(0, 200))
      if (/respondeu 409/.test(mensagem)) return { status: 409, corpo: { error: 'Seu acesso está inativo no momento. Fale com o suporte.' } }
      return { status: 502, corpo: { error: 'Não conseguimos enviar agora. Tente de novo em alguns minutos.' } }
    }
    return { status: 200, corpo: { ok: true, email: mascararEmail(acesso.email) } }
  }
}

/**
 * GET /api/criar-senha?c=<código>  — PÚBLICO (o aluno clica no botão "Criar minha senha" do e-mail).
 * Decide só pelo horário: link da plataforma ainda vivo → devolve o endereço dele para a página redirecionar;
 * vencido → avisa e devolve o código de "novo envio" (o mesmo do /api/novo-link). Não vê se o link já foi usado: isso é da plataforma.
 */
export function criarServicoCriarSenha({ limite, relogio = () => Date.now() } = {}) {
  const porIp = limite ?? criarLimite({ max: 30, janelaMs: 15 * 60_000 }, relogio)
  return function decidir(env, { token, ip }) {
    const rl = porIp(ip)
    if (!rl.ok) return { status: 429, corpo: { estado: 'limite', error: `Muitas tentativas. Aguarde ${rl.espera}s e tente de novo.` } }
    const dados = lerTokenCriarSenha(env, token)
    if (!dados) return { status: 400, corpo: { estado: 'invalido' } }
    if (relogio() < dados.expiraEmMs - FOLGA_MS) return { status: 200, corpo: { estado: 'ativo', url: dados.url } }
    // vencido: oferece pedir outro (só se for possível assinar o código e a API V2 estiver ligada)
    const novo = integracoesPadrao.v2Configurado(env) && dados.acessoId ? criarTokenNovoLink(env, dados.acessoId) : null
    return { status: 200, corpo: { estado: 'vencido', ...(novo ? { t: novo } : {}) } }
  }
}

const decidirCriarSenha = criarServicoCriarSenha()

export function handleCriarSenhaRequest(req, res, env) {
  const responder = (status, corpo) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(corpo))
  }
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname !== '/api/criar-senha') return responder(404, { error: 'Rota não encontrada.' })
  if (req.method !== 'GET') return responder(405, { error: 'Método não permitido.' })
  const resposta = decidirCriarSenha(env, { token: url.searchParams.get('c') ?? '', ip: getClientIp(req) })
  return responder(resposta.status, resposta.corpo)
}

const processarPadrao = criarServicoNovoLink()

export async function handleNovoLinkRequest(req, res, env) {
  const responder = (status, corpo) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(corpo))
  }
  if (req.method !== 'POST') return responder(405, { error: 'Método não permitido.' })
  let corpo = {}
  try {
    corpo = JSON.parse((await readRequestBody(req)) || '{}')
  } catch {
    return responder(400, { error: 'Pedido inválido.' })
  }
  try {
    const resposta = await processarPadrao(env, { token: String(corpo?.t ?? ''), ip: getClientIp(req) })
    return responder(resposta.status, resposta.corpo)
  } catch (erro) {
    console.error('[novo-link]', erro?.message || erro)
    return responder(500, { error: 'Não conseguimos processar agora. Tente de novo em alguns minutos.' })
  }
}
