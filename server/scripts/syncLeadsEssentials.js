/**
 * Copia leads e vendas do banco do site (projeto Supabase "Dados Essentials") para o banco do dash.
 * Pode rodar quantas vezes quiser: só entra o que ainda não foi copiado. O servidor já faz isso
 * sozinho (server/leadsSyncScheduler.js); este script serve para rodar na mão.
 *
 * Uso: node --env-file=.env server/scripts/syncLeadsEssentials.js [--dry]
 *
 * Precisa de:
 *   ESSENTIALS_DATABASE_URL  conexão de leitura do projeto "Dados Essentials"
 *   DATABASE_URL             banco do dash (o mesmo que o servidor usa)
 */
import { syncLeadsFromEssentials } from '../leadsSync.js'
import { syncSalesFromEssentials } from '../salesSync.js'

const dry = process.argv.includes('--dry')

try {
  const leads = await syncLeadsFromEssentials(process.env, { dry })
  console.log(`Leads: ${leads.total} no site · novos: ${leads.pending}${dry ? '' : ` · copiados: ${leads.inserted} · completados: ${leads.updated}`}`)

  const sales = await syncSalesFromEssentials(process.env, { dry })
  console.log(
    `Vendas: ${sales.total} no site (${sales.parcelas} parcela(s) de assinatura ignorada(s)) · novas: ${sales.pending}${dry ? '' : ` · copiadas: ${sales.inserted}`}`,
  )
  if (dry) console.log('Modo --dry: nada foi gravado.')
  process.exit(0)
} catch (error) {
  console.error('Falha na sincronização:', error.message)
  process.exit(1)
}
