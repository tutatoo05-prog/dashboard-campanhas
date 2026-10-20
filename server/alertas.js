/**
 * Avisos de problema para a equipe pelo Telegram (grátis, instantâneo, sem risco para o número do WhatsApp).
 *
 * Variáveis (Plesk → Node.js): TELEGRAM_BOT_TOKEN (do @BotFather) e TELEGRAM_CHAT_ID (o seu id, ou o de um grupo).
 * Sem elas, os avisos de problema continuam indo pelo WhatsApp da equipe (ver avisarProblema em acesso/integracoes.js).
 */

const TIMEOUT_MS = 20_000
const LIMITE_TEXTO = 4000

export function telegramConfigurado(env) {
  return Boolean(String(env.TELEGRAM_BOT_TOKEN ?? '').trim() && String(env.TELEGRAM_CHAT_ID ?? '').trim())
}

/** Os textos do dash vêm formatados para o WhatsApp (*negrito*, _itálico_); no Telegram simples isso viraria símbolos soltos. */
export function textoSimples(texto) {
  return String(texto ?? '')
    .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '$1')
    .replace(/(^|\s)_(\S(?:[^_\n]*\S)?)_(?=\s|$)/g, '$1$2')
}

function recortar(corpo) {
  return String(corpo ?? '').replace(/\s+/g, ' ').slice(0, 300)
}

export async function chamar(env, metodo, opcoes, fetchImpl = fetch) {
  const resposta = await fetchImpl(`https://api.telegram.org/bot${String(env.TELEGRAM_BOT_TOKEN).trim()}/${metodo}`, {
    ...opcoes,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const corpo = await resposta.text().catch(() => '')
  if (!resposta.ok) {
    // Nunca devolve o token: a URL com ele não entra na mensagem de erro.
    throw new Error(`Telegram respondeu ${resposta.status}: ${recortar(corpo)}`)
  }
  return corpo
}

export async function enviarTelegram(env, texto, fetchImpl = fetch) {
  if (!telegramConfigurado(env)) throw new Error('Telegram não configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)')
  await chamar(
    env,
    'sendMessage',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(env.TELEGRAM_CHAT_ID).trim(), text: textoSimples(texto).slice(0, LIMITE_TEXTO), disable_web_page_preview: true }),
    },
    fetchImpl,
  )
  return { enviado: true }
}

/** Manda um arquivo (até 50 MB) para o chat: usado no backup diário. */
export async function enviarArquivoTelegram(env, { nome, conteudo, legenda = '' }, fetchImpl = fetch) {
  if (!telegramConfigurado(env)) throw new Error('Telegram não configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)')
  if (conteudo.length > 49 * 1024 * 1024) throw new Error('Arquivo maior que o limite do Telegram (50 MB)')
  const form = new FormData()
  form.append('chat_id', String(env.TELEGRAM_CHAT_ID).trim())
  if (legenda) form.append('caption', textoSimples(legenda).slice(0, 1000))
  form.append('document', new Blob([conteudo]), nome)
  await chamar(env, 'sendDocument', { method: 'POST', body: form }, fetchImpl)
  return { enviado: true }
}

/** Evita o mesmo aviso repetido a cada rodada: cada "chave" só passa de novo depois de `minutos`. */
export function criarLimiteDeAvisos(agora = () => Date.now()) {
  const ultimos = new Map()
  return (chave, minutos) => {
    const antes = ultimos.get(chave)
    if (antes !== undefined && agora() - antes < minutos * 60_000) return false
    ultimos.set(chave, agora())
    return true
  }
}
