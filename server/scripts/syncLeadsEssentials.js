/**
 * Copia os leads do banco do site (projeto Supabase "Dados Essentials") para a
 * tabela leads do dash. Pode rodar quantas vezes quiser: só entra o que ainda
 * não foi copiado. O servidor já faz isso sozinho (server/leadsSyncScheduler.js);
 * este script serve para rodar na mão.
 *
 * Uso: node --env-file=.env server/scripts/syncLeadsEssentials.js [--dry]
 *
 * Precisa de:
 *   ESSENTIALS_DATABASE_URL  conexão de leitura do projeto "Dados Essentials"
 *   DATABASE_URL             banco do dash (o mesmo que o servidor usa)
 */
import { syncLeadsFromEssentials } from '../leadsSync.js'

const dry = process.argv.includes('--dry')

syncLeadsFromEssentials(process.env, { dry })
  .then(({ total, pending, inserted }) => {
    console.log(`Leads no banco do site: ${total} · a copiar: ${pending}`)
    console.log(dry ? 'Modo --dry: nada foi gravado.' : `Copiados: ${inserted}`)
    process.exit(0)
  })
  .catch((error) => {
    console.error('Falha na sincronização:', error.message)
    process.exit(1)
  })
