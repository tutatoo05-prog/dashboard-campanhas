import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { enviarTelegram, telegramConfigurado } from '../alertas.js'

/**
 * Chamadas para fora do dash: plataforma de cursos (Telway), Brevo (e-mail) e Evolution (WhatsApp).
 * Cada função lança erro quando algo dá errado, para a fila refazer a tentativa.
 * Todas aceitam `fetchImpl` para os testes não saírem pela rede.
 */

const TEMPLATES_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'templates')
const TIMEOUT_MS = 20_000

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escaparHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char])

/** Troca {{campo}} pelos valores (já escapados para HTML). */
export function renderizar(modelo, valores) {
  return modelo.replace(/\{\{(\w+)\}\}/g, (_, chave) => escaparHtml(valores[chave] ?? ''))
}

const cacheTemplates = new Map()
export async function carregarTemplate(nome) {
  if (!cacheTemplates.has(nome)) cacheTemplates.set(nome, await readFile(join(TEMPLATES_DIR, `${nome}.html`), 'utf8'))
  return cacheTemplates.get(nome)
}

async function pedir(fetchImpl, url, opcoes) {
  const resposta = await fetchImpl(url, { ...opcoes, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const corpo = await resposta.text().catch(() => '')
  return { resposta, corpo }
}

function exigir(env, nomes) {
  const faltando = nomes.filter((nome) => !String(env[nome] ?? '').trim())
  if (faltando.length) throw new Error(`Variável(is) de ambiente não configurada(s): ${faltando.join(', ')}`)
}

function recortar(corpo) {
  return String(corpo ?? '').replace(/\s+/g, ' ').slice(0, 300)
}

/**
 * Libera (ou renova) o curso na plataforma. Os campos e valores são os mesmos que o n8n mandava
 * (day vai como texto, como no n8n).
 */
export async function liberarCurso(env, dados, fetchImpl = fetch) {
  exigir(env, ['TELWAY_LIBERAR_URL', 'TELWAY_TOKEN'])
  const corpo = {
    id_venda: String(dados.idVenda),
    nome: dados.nome,
    email: dados.email,
    telefone: dados.telefone,
    campanha: dados.campanha,
    day: String(dados.dias),
    documento: dados.documento,
  }
  const { resposta, corpo: texto } = await pedir(fetchImpl, env.TELWAY_LIBERAR_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TELWAY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!resposta.ok) throw new Error(`liberar-curso respondeu ${resposta.status}: ${recortar(texto)}`)
  let json = null
  try {
    json = JSON.parse(texto)
  } catch {
    // resposta que não é JSON conta como sucesso se o status foi 2xx
  }
  if (json && json.success === false) throw new Error(`liberar-curso recusou: ${recortar(texto)}`)
  return { status: resposta.status, resposta: recortar(texto) }
}

/** Bloqueia o acesso de uma parcela atrasada. Só funciona com TELWAY_BLOQUEAR_URL (endpoint a combinar com a Telway). */
export async function bloquearCurso(env, dados, fetchImpl = fetch) {
  exigir(env, ['TELWAY_BLOQUEAR_URL', 'TELWAY_TOKEN'])
  const { resposta, corpo: texto } = await pedir(fetchImpl, env.TELWAY_BLOQUEAR_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TELWAY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: dados.email, campanha: dados.campanha, documento: dados.documento, motivo: dados.motivo ?? 'parcela atrasada' }),
  })
  if (!resposta.ok) throw new Error(`bloqueio respondeu ${resposta.status}: ${recortar(texto)}`)
  return { status: resposta.status, resposta: recortar(texto) }
}

// API V2 da plataforma (consultar / revogar / reativar acesso): ver telwayV2.js.
export { consultarAcesso, reativarAcesso, revogarAcesso, v2Configurado } from './telwayV2.js'

/** E-mail transacional pela Brevo. */
export async function enviarEmail(env, { para, nomePara, assunto, html }, fetchImpl = fetch) {
  exigir(env, ['BREVO_API_KEY', 'BREVO_REMETENTE_EMAIL'])
  const { resposta, corpo } = await pedir(fetchImpl, 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: env.BREVO_REMETENTE_NOME || 'Tuzinho Academy', email: env.BREVO_REMETENTE_EMAIL },
      to: [{ email: para, ...(nomePara ? { name: nomePara } : {}) }],
      subject: assunto,
      htmlContent: html,
    }),
  })
  if (!resposta.ok) throw new Error(`Brevo respondeu ${resposta.status}: ${recortar(corpo)}`)
  let messageId = null
  try {
    messageId = JSON.parse(corpo).messageId ?? null
  } catch {
    // sem id na resposta
  }
  return { messageId }
}

/** WhatsApp pela Evolution API. `conta` é "aluno" (instância do atendimento) ou "equipe" (aviso ao Tuzinho). */
export async function enviarWhatsapp(env, { conta, numero, texto }, fetchImpl = fetch) {
  const prefixo = conta === 'equipe' ? 'EVOLUTION_EQUIPE' : 'EVOLUTION_ALUNO'
  exigir(env, ['EVOLUTION_URL', `${prefixo}_INSTANCIA`, `${prefixo}_APIKEY`])
  const url = `${env.EVOLUTION_URL.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(env[`${prefixo}_INSTANCIA`])}`
  const { resposta, corpo } = await pedir(fetchImpl, url, {
    method: 'POST',
    headers: { apikey: env[`${prefixo}_APIKEY`], 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: String(numero), text: texto }),
  })
  if (!resposta.ok) throw new Error(`Evolution respondeu ${resposta.status}: ${recortar(corpo)}`)
  return { status: resposta.status }
}

/**
 * Aviso de PROBLEMA para a equipe: vai pelo Telegram quando estiver configurado (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID);
 * se não estiver ou se o Telegram falhar, cai no WhatsApp da equipe. Nunca lança: avisar não pode derrubar quem avisa.
 */
export async function avisarProblema(env, texto, fetchImpl = fetch) {
  if (telegramConfigurado(env)) {
    try {
      return await enviarTelegram(env, texto, fetchImpl)
    } catch (erro) {
      console.error('[alerta] Telegram falhou, tentando o WhatsApp da equipe:', erro.message || erro)
    }
  }
  try {
    return await avisarEquipe(env, texto, fetchImpl)
  } catch (erro) {
    console.error('[alerta] não consegui avisar a equipe:', erro.message || erro)
    return { enviado: false }
  }
}

/** Aviso à equipe (número fixo em ACESSO_AVISO_NUMERO). */
export async function avisarEquipe(env, texto, fetchImpl = fetch) {
  exigir(env, ['ACESSO_AVISO_NUMERO'])
  return enviarWhatsapp(env, { conta: 'equipe', numero: env.ACESSO_AVISO_NUMERO, texto }, fetchImpl)
}
