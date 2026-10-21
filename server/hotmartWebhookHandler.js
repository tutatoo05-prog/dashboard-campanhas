import { readRequestBody } from './readBody.js'
import { query } from './db.js'
import { modoAcesso } from './acesso/motor.js'
import { inserirEvento } from './acesso/repo.js'
import { rodarAgora } from './acesso/scheduler.js'

// Eventos que a liberação de acesso trata; os demais ficam gravados só para consulta.
export const EVENTOS_DE_ACESSO = new Set(['PURCHASE_APPROVED', 'PURCHASE_OUT_OF_SHOPPING_CART', 'PURCHASE_DELAYED', 'PURCHASE_REFUNDED'])

/** O que o webhook viu desde que o app subiu: serve para a tela Segurança e para o vigia dizerem se a Hotmart está chegando. */
const estatisticas = { recusadas: 0, ultimaRecusaEm: null, aceitas: 0, ultimaAceitaEm: null }
export function estatisticasDoWebhook() {
  return { ...estatisticas }
}
export function zerarEstatisticasDoWebhook() {
  Object.assign(estatisticas, { recusadas: 0, ultimaRecusaEm: null, aceitas: 0, ultimaAceitaEm: null })
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function getProvidedHottok(req) {
  const header = req.headers['x-hotmart-hottok']
  if (typeof header === 'string' && header.trim()) return header.trim()
  return ''
}

function assertHottok(req, res, env) {
  const expected = String(env.HOTMART_HOTTOK || '').trim()
  if (!expected) {
    sendJson(res, 503, { error: 'HOTMART_HOTTOK não configurado no servidor.' })
    return false
  }

  const provided = getProvidedHottok(req)
  if (!provided || provided !== expected) {
    estatisticas.recusadas += 1
    estatisticas.ultimaRecusaEm = new Date().toISOString()
    sendJson(res, 401, { error: 'Hottok inválido.' })
    return false
  }

  return true
}

/**
 * Marca a assinatura como cancelada na compra mais recente e ainda ativa
 * daquele email. Não há transaction_id/subscriber_code gravado na compra
 * original (o insert é feito pelo n8n a partir do evento de compra), então
 * o casamento é feito por email — guarda o subscriber_code recebido para
 * casamentos futuros ficarem exatos.
 */
async function cancelSubscriptionByEmail(env, { email, subscriberCode }) {
  const result = await query(
    env,
    `update purchases
       set status = 'cancelado',
           canceled_at = now(),
           subscriber_code = coalesce(subscriber_code, $1)
     where id = (
       select id from purchases
        where email = $2 and status <> 'cancelado'
        order by created_at desc
        limit 1
     )
     returning id`,
    [subscriberCode || null, email],
  )
  return result.rows[0]?.id ?? null
}

/**
 * POST /api/hotmart/webhook
 *
 * Auth: header X-Hotmart-Hottok (token exibido em Hotmart → Ferramentas →
 * Webhook → Autenticação).
 *
 * Trata o evento SUBSCRIPTION_CANCELLATION; outros eventos retornam 200
 * sem ação para a Hotmart não ficar reenviando.
 */
export async function handleHotmartWebhookRequest(req, res, env) {
  const { pathname } = new URL(req.url, 'http://localhost')

  if (pathname !== '/api/hotmart/webhook') {
    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Método não permitido.' })
  }

  if (!assertHottok(req, res, env)) return
  estatisticas.aceitas += 1
  estatisticas.ultimaAceitaEm = new Date().toISOString()

  let payload
  try {
    const raw = await readRequestBody(req)
    payload = JSON.parse(raw || '{}')
  } catch (error) {
    return sendJson(res, 400, { error: 'JSON inválido.' })
  }

  const event = payload?.event
  const data = payload?.data || {}

  try {
    // Liberação de acesso: grava o evento ANTES de responder. Se o banco falhar, a resposta é 500 e a Hotmart
    // reenvia — nada se perde. O processamento acontece em seguida, fora da resposta.
    if (modoAcesso(env) !== 'desligado') {
      const gravado = await inserirEvento(env, payload, { estadoInicial: EVENTOS_DE_ACESSO.has(event) ? 'novo' : 'ignorado' })
      if (gravado.novo && EVENTOS_DE_ACESSO.has(event)) setImmediate(() => void rodarAgora(env))
      if (EVENTOS_DE_ACESSO.has(event)) return sendJson(res, 200, { success: true, registrado: true, repetido: !gravado.novo, event })
    }

    if (event === 'SUBSCRIPTION_CANCELLATION') {
      const email = data?.subscriber?.email
      const subscriberCode = data?.subscriber?.code

      if (!email) {
        return sendJson(res, 200, { success: false, reason: 'sem email no payload' })
      }

      const updatedId = await cancelSubscriptionByEmail(env, { email, subscriberCode })
      return sendJson(res, 200, {
        success: true,
        matched: Boolean(updatedId),
        purchaseId: updatedId,
      })
    }

    // Evento reconhecido mas ainda não tratado (ex.: novo plano, cobrança
    // recorrente) — responde 200 para a Hotmart não reenviar.
    return sendJson(res, 200, { success: true, ignored: true, event })
  } catch (error) {
    console.error('[hotmart-webhook]', error)
    return sendJson(res, 500, { error: error.message || 'Erro ao processar webhook da Hotmart.' })
  }
}
