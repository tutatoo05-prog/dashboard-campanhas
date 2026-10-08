/**
 * Diagnóstico do interruptor da Live — NÃO cria nem apaga nada.
 * Mostra com qual usuário o processo roda e se ele pode escrever na pasta
 * de LIVE_FLAG_PATH (teste de permissão com access(W_OK)).
 *
 * Uso no Plesk: Node.js → "Run script" → `run live:check`
 * (se as variáveis do app não chegarem ao script, passe o caminho:
 *  `run live:check -- /var/www/vhosts/.../produtos/essentials/live.on`)
 * Local: node --env-file=.env server/scripts/liveCheck.js
 */
import { existsSync } from 'node:fs'
import { userInfo } from 'node:os'
import { dirname } from 'node:path'
import { checkWritable, getLiveConfig, readFlag } from '../live.js'

const env = process.argv[2] ? { ...process.env, LIVE_FLAG_PATH: process.argv[2] } : process.env
const config = getLiveConfig(env)
const user = userInfo()

console.log(`Usuário do processo: ${user.username} (uid ${user.uid ?? '-'}, gid ${user.gid ?? '-'})`)
console.log(`LIVE_ADMIN_EMAILS: ${config.adminEmails.length} e-mail(s) configurado(s)`)
console.log(`LIVE_MAX_HOURS: ${config.maxHours} h`)

if (!config.flagPath) {
  console.error(`ERRO: ${config.error}`)
  process.exit(1)
}

console.log(`LIVE_FLAG_PATH: ${config.flagPath}`)
const dir = dirname(config.flagPath)

if (!existsSync(dir)) {
  console.error(`ERRO: a pasta ${dir} não existe (ou o usuário não consegue enxergá-la).`)
  process.exit(1)
}

try {
  const flag = await readFlag(config.flagPath)
  console.log(`Arquivo live.on: ${flag.on ? `EXISTE (desde ${flag.since.toISOString()})` : 'não existe'}`)
} catch (error) {
  console.error(`ERRO ao ler o arquivo: ${error.message}`)
}

const writeError = await checkWritable(config.flagPath)
if (writeError) {
  console.error(`ERRO: ${writeError}`)
  process.exit(1)
}

console.log('OK: o processo tem permissão para criar e apagar o live.on nessa pasta.')
