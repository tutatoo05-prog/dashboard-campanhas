import { readRequestBody } from '../readBody.js'
import { getClientIp } from '../security.js'
import { criarLimite } from '../acesso/novoLink.js'
import { enviarEmail as enviarEmailPadrao, escaparHtml } from '../acesso/integracoes.js'
import * as repoPadrao from './repo.js'
import * as youtubePadrao from './youtube.js'
import * as discordPadrao from './discord.js'
import { appUrl, cargoDe, resgateEssentialsConfigurado, resgateYoutubeConfigurado, discordConfigurado } from './config.js'
import { criarToken, lerToken } from './token.js'

// Resgate PÚBLICO: o membro entra no Discord do clube e ganha o cargo sem mexer nas "Conexões" do Discord.
//
//   Essentials:  e-mail → link de confirmação no próprio e-mail → "Entrar no Discord" → cargo
//   YouTube:     "Entrar com o Google" (prova qual canal é o dele) → "Entrar no Discord" → cargo
//
// Regras de segurança:
//  • O e-mail digitado NUNCA basta: só o link enviado ao próprio e-mail prova que é a pessoa.
//  • A resposta de "pedir link" é sempre a mesma (existir ou não o e-mail), para não revelar quem é membro.
//  • Os tokens (token.js) levam só o id do membro, têm validade curta e propósito próprio; o "state" dos logins impede
//    usar um retorno do Google/Discord forjado.
//  • Limite de pedidos por IP e por e-mail. Nada de token, e-mail ou segredo vai para o log.
//  • Um membro = um Discord: se refizer o resgate com outra conta, o cargo sai da anterior.
//  • A tela decide pelo `?erro=` / `?ok=` da página /discord: nunca mostramos o motivo técnico.

const VALIDADE_LINK_MS = 20 * 60_000
const VALIDADE_STATE_MS = 10 * 60_000
const MSG_PEDIDO = 'Se este e-mail tiver acesso ativo à Essentials, enviamos agora um link para confirmar. Olhe também o spam.'

const porIp = criarLimite({ max: 30, janelaMs: 15 * 60_000 })
const pedirPorIp = criarLimite({ max: 5, janelaMs: 15 * 60_000 })
const pedirPorEmail = criarLimite({ max: 3, janelaMs: 60 * 60_000 })
let limites = { porIp, pedirPorIp, pedirPorEmail }

/** Zera os contadores (só os testes usam). */
export function zerarLimitesDoResgate() {
  limites = {
    porIp: criarLimite({ max: 30, janelaMs: 15 * 60_000 }),
    pedirPorIp: criarLimite({ max: 5, janelaMs: 15 * 60_000 }),
    pedirPorEmail: criarLimite({ max: 3, janelaMs: 60 * 60_000 }),
  }
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

function json(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function redirecionar(res, url) {
  res.statusCode = 302
  res.setHeader('Location', url)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer') // o código do login não pode vazar na navegação seguinte
  res.end()
}

const paginaDiscord = (env, params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return `${appUrl(env)}/discord${qs ? `?${qs}` : ''}`
}

const ASSUNTO = 'Seu acesso ao Discord — Tuzinho Academy'

function htmlEmail(nome, link) {
  const saudacao = nome ? `Olá, ${escaparHtml(String(nome).split(' ')[0])}!` : 'Olá!'
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1c1c">
<p style="font-size:16px">${saudacao}</p>
<p style="font-size:15px;line-height:1.5">Clique no botão para entrar no Discord da Tuzinho Academy. O link vale por 20 minutos.</p>
<p style="margin:28px 0"><a href="${escaparHtml(link)}" style="background:#ff8a1f;color:#15110d;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:10px;display:inline-block">Continuar</a></p>
<p style="font-size:13px;color:#666">Se você não pediu isso, é só ignorar este e-mail.</p></div>`
}

/**
 * Roteador público de /api/clube/resgate/*. `deps` existe para os testes (banco, Google, Discord e e-mail simulados).
 */
export async function handleResgateRequest(req, res, env, deps = {}) {
  const repo = deps.repo ?? repoPadrao
  const youtube = deps.youtube ?? youtubePadrao
  const discord = deps.discord ?? discordPadrao
  const enviarEmail = deps.enviarEmail ?? enviarEmailPadrao

  const url = new URL(req.url, 'http://localhost')
  const rota = url.pathname.replace(/^\/api\/clube\/resgate/, '').replace(/\/+$/, '') || '/'
  const ip = getClientIp(req)

  const limite = limites.porIp(ip)
  if (!limite.ok) return json(res, 429, { error: `Muitas tentativas. Aguarde ${limite.espera}s e tente de novo.` })

  try {
    // ── 1. Essentials: pedir o link de confirmação por e-mail
    if (rota === '/email' && req.method === 'POST') {
      if (!resgateEssentialsConfigurado(env)) return json(res, 503, { error: 'Esta função ainda não está disponível. Tente mais tarde.' })
      const pedido = limites.pedirPorIp(ip)
      if (!pedido.ok) return json(res, 429, { error: `Muitos pedidos. Aguarde ${pedido.espera}s.` })
      let corpo
      try {
        corpo = JSON.parse((await readRequestBody(req, 4 * 1024)) || '{}')
      } catch {
        return json(res, 400, { error: 'Pedido inválido.' })
      }
      const email = String(corpo?.email ?? '').trim().toLowerCase()
      if (email.length > 254 || !EMAIL.test(email)) return json(res, 400, { error: 'Digite um e-mail válido.' })
      const doEmail = limites.pedirPorEmail(email)
      if (!doEmail.ok) return json(res, 200, { ok: true, mensagem: MSG_PEDIDO }) // mesma resposta: não revela o limite

      const membro = await repo.buscarAtivo(env, 'essentials', email)
      if (membro) {
        const token = criarToken(env, 'resgate', { m: membro.id }, VALIDADE_LINK_MS)
        try {
          await enviarEmail(env, { para: email, nomePara: membro.nome ?? '', assunto: ASSUNTO, html: htmlEmail(membro.nome, paginaDiscord(env, { t: token })) })
        } catch (erro) {
          console.error('[clube] não consegui enviar o link de resgate:', String(erro?.message ?? erro).slice(0, 160))
        }
      }
      return json(res, 200, { ok: true, mensagem: MSG_PEDIDO })
    }

    if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' })

    // ── 2. YouTube: login com o Google para provar o canal
    if (rota === '/google') {
      if (!resgateYoutubeConfigurado(env)) return redirecionar(res, paginaDiscord(env, { erro: 'indisponivel' }))
      const state = criarToken(env, 'google-state', {}, VALIDADE_STATE_MS)
      return redirecionar(res, youtube.urlLoginGoogle(env, state))
    }

    if (rota === '/google/callback') {
      if (url.searchParams.get('error')) return redirecionar(res, paginaDiscord(env, { erro: 'cancelado' }))
      if (!lerToken(env, 'google-state', url.searchParams.get('state'))) return redirecionar(res, paginaDiscord(env, { erro: 'link-expirado' }))
      const codigo = url.searchParams.get('code')
      if (!codigo || !resgateYoutubeConfigurado(env)) return redirecionar(res, paginaDiscord(env, { erro: 'cancelado' }))
      let canal
      try {
        canal = await youtube.canalDoMembro(env, codigo)
      } catch (erro) {
        console.error('[clube] login Google falhou:', String(erro?.message ?? erro).slice(0, 160))
        return redirecionar(res, paginaDiscord(env, { erro: 'google-falhou' }))
      }
      if (!canal) return redirecionar(res, paginaDiscord(env, { erro: 'sem-canal' }))
      const membro = await repo.buscarAtivo(env, 'youtube', canal)
      if (!membro) return redirecionar(res, paginaDiscord(env, { erro: 'nao-membro' }))
      return redirecionar(res, paginaDiscord(env, { t: criarToken(env, 'resgate', { m: membro.id }, VALIDADE_LINK_MS) }))
    }

    // ── 3. Discord: o clique em "Entrar no Discord" (vindo da página /discord) abre o login do Discord
    if (rota === '/discord') {
      const dados = lerToken(env, 'resgate', url.searchParams.get('t'))
      if (!dados) return redirecionar(res, paginaDiscord(env, { erro: 'link-expirado' }))
      if (!discordConfigurado(env)) return redirecionar(res, paginaDiscord(env, { erro: 'indisponivel' }))
      return redirecionar(res, discord.urlAutorizar(env, criarToken(env, 'discord-state', { m: dados.m }, VALIDADE_STATE_MS)))
    }

    if (rota === '/discord/callback') {
      if (url.searchParams.get('error')) return redirecionar(res, paginaDiscord(env, { erro: 'cancelado' }))
      const dados = lerToken(env, 'discord-state', url.searchParams.get('state'))
      if (!dados) return redirecionar(res, paginaDiscord(env, { erro: 'link-expirado' }))
      const codigo = url.searchParams.get('code')
      if (!codigo || !discordConfigurado(env)) return redirecionar(res, paginaDiscord(env, { erro: 'cancelado' }))

      const membro = await repo.buscarAtivoPorId(env, dados.m)
      if (!membro) return redirecionar(res, paginaDiscord(env, { erro: 'nao-membro' })) // saiu do clube desde o pedido
      const cargo = cargoDe(env, membro.plataforma)
      if (!cargo) return redirecionar(res, paginaDiscord(env, { erro: 'indisponivel' }))

      try {
        const acesso = await discord.trocarCodigo(env, codigo)
        const usuario = await discord.usuarioAtual(acesso)
        await discord.adicionarAoServidor(env, usuario.id, acesso)
        await discord.darCargo(env, usuario.id, cargo)
        // um membro = um Discord: se havia outra conta ligada, o cargo sai dela (se falhar, a sincronização não a conhece mais)
        if (membro.discord_id && membro.discord_id !== usuario.id) await discord.tirarCargo(env, membro.discord_id, cargo).catch(() => {})
        await repo.vincularDiscord(env, membro.id, { discordId: usuario.id, discordNome: usuario.nome })
      } catch (erro) {
        console.error('[clube] resgate no Discord falhou:', String(erro?.message ?? erro).slice(0, 200))
        return redirecionar(res, paginaDiscord(env, { erro: 'discord-falhou' }))
      }
      return redirecionar(res, paginaDiscord(env, { ok: '1' }))
    }

    return json(res, 404, { error: 'Rota não encontrada.' })
  } catch (erro) {
    if (repo.ehFaltaDeTabela?.(erro)) return json(res, 503, { error: 'Esta função ainda não está disponível. Tente mais tarde.' })
    console.error('[clube] erro no resgate:', String(erro?.message ?? erro).slice(0, 200))
    return json(res, 500, { error: 'Não conseguimos agora. Tente de novo em instantes.' })
  }
}
