import { query } from './db.js'
import { getSaoPauloClock } from './clock.js'
import { runRulesEvaluation } from './rules.js'
import { notifyUrgentAlerts, sendDailyEmail } from './notify.js'

const EVALUATE_EVERY_MS = 15 * 60 * 1000

/**
 * Agendador das regras e dos avisos (roda junto do processo Node, como o do digest e o da Live):
 *  - a cada 15 min avalia as regras e, se ligado, avisa os alertas novos por WhatsApp;
 *  - 1x por dia, na hora escolhida na tela, manda o resumo por e-mail.
 * Se as tabelas da migração ainda não existem, só registra um aviso e tenta de novo depois.
 */
export function startAlertsScheduler(env) {
  if (String(env.ALERTS_SCHEDULER_ENABLED ?? 'true').toLowerCase() === 'false') {
    console.log('[alertas] scheduler desligado (ALERTS_SCHEDULER_ENABLED=false)')
    return { stop() {} }
  }
  if (!env.DATABASE_URL || !env.META_ACCESS_TOKEN) {
    console.warn('[alertas] scheduler não iniciado: precisa de DATABASE_URL e META_ACCESS_TOKEN')
    return { stop() {} }
  }

  let evaluating = false
  let warnedMigration = false

  const evaluate = async () => {
    if (evaluating) return
    evaluating = true
    try {
      const result = await runRulesEvaluation(env)
      const notified = await notifyUrgentAlerts(env)
      console.log(
        `[alertas] ${result.accounts} conta(s) · ${result.triggered} alerta(s) · ${result.newAlerts} novo(s) · avisos enviados: ${notified.sent}`,
      )
    } catch (error) {
      if (error?.code === '42P01') {
        if (!warnedMigration) console.warn('[alertas] tabelas ainda não existem: rode o bloco "Central de Ações v2" de db/schema.sql')
        warnedMigration = true
      } else {
        console.error('[alertas] falha na rodada:', error.message || error)
      }
    } finally {
      evaluating = false
    }
  }

  const dailyEmail = async () => {
    try {
      const clock = getSaoPauloClock()
      // "claim" atômico: só uma execução marca o dia, mesmo se houver duas instâncias.
      const claimed = await query(
        env,
        `update notification_settings set email_last_day = $1
          where id = 1 and email_daily and email_hour = $2 and email_last_day is distinct from $1
          returning id`,
        [clock.dateKey, clock.hour],
      )
      if (!claimed.rows[0]) return

      try {
        const result = await sendDailyEmail(env)
        console.log(`[alertas] resumo por e-mail: ${result.sent ? `enviado a ${result.recipients}` : result.reason}`)
        if (!result.sent) await query(env, 'update notification_settings set email_last_day = null where id = 1')
      } catch (error) {
        await query(env, 'update notification_settings set email_last_day = null where id = 1')
        console.error('[alertas] falha no resumo por e-mail:', error.message || error)
      }
    } catch (error) {
      if (error?.code !== '42P01') console.error('[alertas] erro no tick do e-mail:', error.message || error)
    }
  }

  console.log('[alertas] scheduler ativo · regras a cada 15 min')
  const evaluateTimer = setInterval(() => void evaluate(), EVALUATE_EVERY_MS)
  const emailTimer = setInterval(() => void dailyEmail(), 60_000)
  const startTimer = setTimeout(() => void evaluate(), 30_000)
  for (const timer of [evaluateTimer, emailTimer, startTimer]) if (typeof timer.unref === 'function') timer.unref()

  return {
    stop() {
      clearInterval(evaluateTimer)
      clearInterval(emailTimer)
      clearTimeout(startTimer)
    },
  }
}
