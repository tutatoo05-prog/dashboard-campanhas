import { syncLeadsFromEssentials } from './leadsSync.js'

const DEFAULT_MINUTES = 10

/**
 * Agendador da cópia de leads do site para o dash (roda junto do processo Node,
 * como o do digest, o da Live e o dos alertas). A cada N minutos traz os leads
 * novos do banco "Dados Essentials". Se a coluna fonte_id ainda não existe,
 * só registra um aviso e tenta de novo na próxima rodada.
 *
 * Variáveis: ESSENTIALS_DATABASE_URL (obrigatória), LEADS_SYNC_ENABLED (padrão true),
 * LEADS_SYNC_MINUTES (padrão 10).
 */
export function startLeadsSyncScheduler(env) {
  if (String(env.LEADS_SYNC_ENABLED ?? 'true').toLowerCase() === 'false') {
    console.log('[leads] sincronização desligada (LEADS_SYNC_ENABLED=false)')
    return { stop() {} }
  }
  if (!env.DATABASE_URL || !env.ESSENTIALS_DATABASE_URL) {
    console.warn('[leads] sincronização não iniciada: precisa de DATABASE_URL e ESSENTIALS_DATABASE_URL')
    return { stop() {} }
  }

  const minutes = Math.max(1, Number(env.LEADS_SYNC_MINUTES) || DEFAULT_MINUTES)
  let running = false
  let warnedMigration = false

  const tick = async () => {
    if (running) return
    running = true
    try {
      const { total, inserted } = await syncLeadsFromEssentials(env)
      if (inserted > 0) console.log(`[leads] ${inserted} lead(s) novo(s) copiado(s) · ${total} no site`)
    } catch (error) {
      if (error?.code === '42703') {
        if (!warnedMigration) console.warn('[leads] coluna fonte_id não existe: rode o bloco de leads de db/schema.sql')
        warnedMigration = true
      } else {
        console.error('[leads] falha na sincronização:', error.message || error)
      }
    } finally {
      running = false
    }
  }

  console.log(`[leads] sincronização ativa · a cada ${minutes} min`)
  const timer = setInterval(() => void tick(), minutes * 60_000)
  const startTimer = setTimeout(() => void tick(), 45_000)
  for (const handle of [timer, startTimer]) if (typeof handle.unref === 'function') handle.unref()

  return {
    stop() {
      clearInterval(timer)
      clearTimeout(startTimer)
    },
  }
}
