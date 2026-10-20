/**
 * Aprovação de cadastros pelo Telegram, sem n8n.
 *
 * Quando alguém se cadastra, o dash manda ao chat da equipe uma mensagem com os botões Aprovar / Recusar.
 * Ao tocar, o Telegram chama /api/telegram (webhook do mesmo bot dos alertas) e o dash atualiza o cadastro no banco.
 * O administrador também aprova pela tela Usuários e cargos; os dois caminhos usam o mesmo banco.
 *
 * Variáveis: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (já usadas nos alertas) e TELEGRAM_WEBHOOK_SECRET
 * (um texto aleatório; o Telegram o devolve no cabeçalho de cada chamada para provar que veio dele).
 */
import { timingSafeEqual } from 'node:crypto'
import { chamar, telegramConfigurado } from './alertas.js'
import { query } from './db.js'
import { readRequestBody } from './readBody.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function enviarJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function postJson(corpo) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }
}

function segredoConfere(esperado, recebido) {
  const a = Buffer.from(String(esperado ?? ''))
  const b = Buffer.from(String(recebido ?? ''))
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

/** Avisa o chat da equipe sobre um cadastro pendente, com os botões. Nunca lança: o cadastro não pode falhar por isso. */
export async function avisarCadastroPendente(env, { id, nome, email }, fetchImpl = fetch) {
  if (!telegramConfigurado(env)) {
    console.warn('[cadastros] Telegram não configurado: o cadastro ficou pendente sem aviso (aprove em Usuários e cargos).')
    return false
  }
  try {
    await chamar(
      env,
      'sendMessage',
      postJson({
        chat_id: String(env.TELEGRAM_CHAT_ID).trim(),
        text: `Novo cadastro aguardando aprovação\n\nNome: ${nome}\nE-mail: ${email}`,
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Aprovar', callback_data: `ap:${id}` },
            { text: '❌ Recusar', callback_data: `rc:${id}` },
          ]],
        },
      }),
      fetchImpl,
    )
    return true
  } catch (erro) {
    console.error('[cadastros] não consegui avisar o Telegram:', erro.message || erro)
    return false
  }
}

/** Aplica a decisão e devolve o texto que substitui a mensagem. */
export async function decidirCadastro(env, acao, id, consultar = (texto, params) => query(env, texto, params)) {
  const coluna = acao === 'ap' ? 'ativo = true, recusado_em = null' : 'recusado_em = now()'
  const filtro = acao === 'ap' ? 'ativo = false' : 'ativo = false and recusado_em is null'
  const feito = await consultar(`update users set ${coluna} where id = $1 and ${filtro} returning nome, email`, [id])
  const linha = feito.rows[0]
  if (linha) {
    const quem = `${linha.nome} (${linha.email})`
    return acao === 'ap' ? `✅ Cadastro aprovado: ${quem}` : `❌ Cadastro recusado: ${quem}`
  }
  const atual = await consultar('select nome, email, ativo, recusado_em from users where id = $1', [id])
  const u = atual.rows[0]
  if (!u) return 'Esse cadastro não existe mais.'
  const quem = `${u.nome} (${u.email})`
  if (u.ativo) return `✅ Esse cadastro já estava aprovado: ${quem}`
  return `❌ Esse cadastro já estava recusado: ${quem}`
}

/** POST /api/telegram: atualizações do bot. Responde 200 sempre que a chamada é legítima, para o Telegram não reenviar. */
export async function handleTelegramWebhook(req, res, env, fetchImpl = fetch) {
  const segredo = String(env.TELEGRAM_WEBHOOK_SECRET ?? '').trim()
  if (!segredo || req.method !== 'POST') return enviarJson(res, 404, { error: 'Rota não encontrada.' })
  if (!segredoConfere(segredo, req.headers['x-telegram-bot-api-secret-token'])) {
    return enviarJson(res, 403, { error: 'Acesso negado.' })
  }

  let update
  try {
    update = JSON.parse((await readRequestBody(req, 64 * 1024)) || '{}')
  } catch {
    return enviarJson(res, 400, { error: 'Requisição inválida.' })
  }

  const clique = update.callback_query
  const [acao, id] = String(clique?.data ?? '').split(':')
  if (!clique || !['ap', 'rc'].includes(acao) || !UUID_RE.test(id ?? '')) return enviarJson(res, 200, { ok: true })

  const chatDaEquipe = String(env.TELEGRAM_CHAT_ID ?? '').trim()
  const veioDoChat = String(clique.message?.chat?.id ?? '') === chatDaEquipe
  try {
    if (!veioDoChat) {
      await chamar(env, 'answerCallbackQuery', postJson({ callback_query_id: clique.id, text: 'Sem permissão.' }), fetchImpl)
      return enviarJson(res, 200, { ok: true })
    }
    const texto = await decidirCadastro(env, acao, id)
    console.log(`[cadastros] Telegram: ${acao === 'ap' ? 'aprovar' : 'recusar'} ${id} por ${clique.from?.id ?? '?'}`)
    await chamar(env, 'answerCallbackQuery', postJson({ callback_query_id: clique.id }), fetchImpl)
    await chamar(
      env,
      'editMessageText',
      postJson({ chat_id: clique.message.chat.id, message_id: clique.message.message_id, text: texto }),
      fetchImpl,
    )
  } catch (erro) {
    console.error('[cadastros] erro no webhook do Telegram:', erro.message || erro)
    // O clique falhou de verdade: avisa quem clicou em vez de fingir que deu certo.
    await chamar(
      env,
      'answerCallbackQuery',
      postJson({ callback_query_id: clique.id, text: 'Não consegui salvar. Aprove em Usuários e cargos.', show_alert: true }),
      fetchImpl,
    ).catch(() => {})
  }
  return enviarJson(res, 200, { ok: true })
}
