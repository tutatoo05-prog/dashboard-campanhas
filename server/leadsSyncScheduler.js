import { syncLeadsFromEssentials } from './leadsSync.js'
import { syncSalesFromEssentials } from './salesSync.js'

const DEFAULT_MINUTES = 10

/**
 * Agendador da cópia do banco do site para o dash (roda junto do processo Node, como o do
 * digest, o da Live e o dos alertas). A cada N minutos traz:
 *  - os leads novos (tabela leads) e completa ID da campanha, anúncio e criativo dos que já existem;
 *  - as vendas novas (tabela vendas -> purchases, que a tela Compras lê).
 * Cada cópia roda isolada: se uma falha, a outra segue. Se uma coluna da migração ainda não
 * existe, só registra um aviso e tenta de novo na próxima rodada.
 *
 * Variáveis: ESSENTIALS_DATABASE_URL (obrigatória), LEADS_SYNC_ENABLED (padrão true),
 * LEADS_SYNC_MINUTES (padrão 10).
 */
export function startLeadsSyncScheduler(env) {
  if (String(env.LEADS_SYNC_ENABLED ?? 'true').toLowerCase() === 'false') {
    console.log('[sync] cópia do banco do site desligada (LEADS_SYNC_ENABLED=false)')
    return { stop() {} }
  }
  if (!env.DATABASE_URL || !env.ESSENTIALS_DATABASE_URL) {
    console.warn('[sync] cópia do banco do site não iniciada: precisa de DATABASE_URL e ESSENTIALS_DATABASE_URL')
    return { stop() {} }
  }

  const minutes = Math.max(1, Number(env.LEADS_SYNC_MINUTES) || DEFAULT_MINUTES)
  let running = false
  const warned = new Set()

  const run = async (label, job) => {
    try {
      await job()
    } catch (error) {
      // 42703 = coluna que a migração cria ainda não existe; 42P01 = tabela ainda não existe.
      if (error?.code === '42703' || error?.code === '42P01') {
        if (!warned.has(label)) console.warn(`[${label}] migração pendente: rode os blocos novos de db/schema.sql`)
        warned.add(label)
      } else {
        console.error(`[${label}] falha na sincronização:`, error.message || error)
      }
    }
  }

  const tick = async () => {
    if (running) return
    running = true
    try {
      await run('leads', async () => {
        const { total, inserted, updated } = await syncLeadsFromEssentials(env)
        if (inserted > 0 || updated > 0) {
          console.log(`[leads] ${inserted} novo(s), ${updated} completado(s) · ${total} no site`)
        }
      })
      await run('vendas', async () => {
        const { total, inserted } = await syncSalesFromEssentials(env)
        if (inserted > 0) console.log(`[vendas] ${inserted} venda(s) nova(s) copiada(s) · ${total} no site`)
      })
    } finally {
      running = false
    }
  }

  console.log(`[sync] cópia de leads e vendas do banco do site ativa · a cada ${minutes} min`)
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
