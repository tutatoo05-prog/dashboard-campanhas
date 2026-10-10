import { query } from './db.js'
import { buildDigest } from './digest.js'
import { brl } from './rulesEval.js'

/**
 * Avisos fora do painel, entregues por um webhook n8n (N8N_ALERT_WEBHOOK_URL).
 * O workflow do n8n decide o canal pelo campo "channel" ("whatsapp" ou "email") e usa "message"
 * (texto pronto, com *negrito* do WhatsApp) e, no e-mail, "subject" e "recipients".
 */

export async function sendAlertWebhook(env, payload) {
  const url = env.N8N_ALERT_WEBHOOK_URL
  if (!url) return { sent: false, reason: 'N8N_ALERT_WEBHOOK_URL não configurado.' }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain' },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Webhook n8n retornou ${response.status}: ${text.slice(0, 200)}`)
  return { sent: true, status: response.status }
}

async function accountNames(env) {
  try {
    const { getAdAccounts, parseAllowedAccountIds } = await import('./metaApi.js')
    const accounts = await getAdAccounts(env.META_ACCESS_TOKEN, { allowedIds: parseAllowedAccountIds(env) })
    return new Map(accounts.map((account) => [account.id, account.name]))
  } catch {
    return new Map()
  }
}

/** Manda por WhatsApp os alertas de hoje que ainda não foram avisados (se a opção estiver ligada). */
export async function notifyUrgentAlerts(env) {
  const settings = (await query(env, 'select whatsapp_urgent from notification_settings where id = 1')).rows[0]
  if (!settings?.whatsapp_urgent) return { sent: 0, reason: 'desligado' }
  if (!env.N8N_ALERT_WEBHOOK_URL) return { sent: 0, reason: 'webhook ausente' }

  const pending = (
    await query(
      env,
      `select id, account_id, title, detail, money
         from rule_alerts
        where day = (now() at time zone 'America/Sao_Paulo')::date::text and not cleared and notified_at is null
        order by created_at limit 20`,
    )
  ).rows
  if (!pending.length) return { sent: 0 }

  const names = await accountNames(env)
  const lines = ['*Alerta Academy Labs* 🚨', '']
  for (const alert of pending) {
    lines.push(`*${names.get(alert.account_id) ?? alert.account_id}*`)
    lines.push(`• ${alert.title}`)
    if (alert.money != null) lines.push(`  ~${brl(alert.money)}/semana em jogo`)
    lines.push('')
  }
  lines.push('_Veja os passos na Central de Ações._')

  await sendAlertWebhook(env, {
    type: 'alert',
    channel: 'whatsapp',
    message: lines.join('\n'),
    alerts: pending.map((alert) => ({
      id: alert.id,
      account: names.get(alert.account_id) ?? alert.account_id,
      title: alert.title,
      detail: alert.detail,
      money: alert.money != null ? Number(alert.money) : null,
    })),
    generatedAt: new Date().toISOString(),
  })

  await query(env, 'update rule_alerts set notified_at = now() where id = any($1::uuid[])', [pending.map((alert) => alert.id)])
  return { sent: pending.length }
}

/** Resumo diário por e-mail para os administradores ativos (ontem, em todas as contas do boletim). */
export async function sendDailyEmail(env) {
  if (!env.N8N_ALERT_WEBHOOK_URL) throw new Error('N8N_ALERT_WEBHOOK_URL não configurado.')

  const digest = await buildDigest(env, { period: 'yesterday', slot: 'email' })
  const recipients = (await query(env, "select email from users where ativo and cargo = 'admin' order by email")).rows.map(
    (row) => row.email,
  )
  if (!recipients.length) return { sent: false, reason: 'sem administradores ativos' }

  const date = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
  await sendAlertWebhook(env, {
    type: 'daily_summary',
    channel: 'email',
    subject: `Resumo Academy Labs · ${date}`,
    message: digest.message,
    recipients,
    digest,
    generatedAt: new Date().toISOString(),
  })
  return { sent: true, recipients: recipients.length }
}
