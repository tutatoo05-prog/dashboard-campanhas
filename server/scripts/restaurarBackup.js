// Restaura um backup do dash (arquivo .bkp gerado por server/backup.js) num banco.
//   node --env-file=.env server/scripts/restaurarBackup.js caminho/dash-2026-10-17.bkp --confirmar [--limpar]
// Variáveis: DATABASE_URL (o banco de destino) e BACKUP_PASSPHRASE (a mesma senha do backup).
// Sem --limpar, só restaura em tabelas vazias (recusa se já houver dados). Com --limpar, apaga as tabelas antes.
// Atenção: o "Run script" do Plesk NÃO carrega as variáveis do app; rode no seu computador com --env-file
// (apontando DATABASE_URL para o banco que quer restaurar).
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { decifrar } from '../backup.js'
import { getPool } from '../db.js'

const argumentos = process.argv.slice(2)
const caminho = argumentos.find((item) => !item.startsWith('--'))
if (!caminho || !argumentos.includes('--confirmar')) {
  console.error('Uso: node server/scripts/restaurarBackup.js arquivo.bkp --confirmar [--limpar]')
  process.exit(1)
}

const senha = process.env.BACKUP_PASSPHRASE ?? ''
const banco = JSON.parse(gunzipSync(decifrar(await readFile(caminho), senha)).toString('utf8'))
console.log(`Backup de ${banco.geradoEm}: ${Object.keys(banco.tabelas).length} tabelas.`)

// Tabelas que as outras referenciam entram primeiro.
const PRIMEIRAS = ['users', 'automation_rules']
const nomes = Object.keys(banco.tabelas).sort((a, b) => {
  const pa = PRIMEIRAS.indexOf(a)
  const pb = PRIMEIRAS.indexOf(b)
  return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb)
})
const aspas = (nome) => `"${nome.replace(/"/g, '""')}"`

const pool = getPool(process.env)
const cliente = await pool.connect()
try {
  await cliente.query('begin')
  if (argumentos.includes('--limpar')) {
    await cliente.query(`truncate ${nomes.map(aspas).join(', ')} restart identity cascade`)
  } else {
    for (const nome of nomes) {
      const { rows } = await cliente.query(`select 1 from ${aspas(nome)} limit 1`)
      if (rows.length) throw new Error(`A tabela ${nome} já tem dados. Use --limpar se quer apagar e restaurar.`)
    }
  }
  for (const nome of nomes) {
    const linhas = banco.tabelas[nome]
    for (let i = 0; i < linhas.length; i += 300) {
      await cliente.query(`insert into ${aspas(nome)} select * from jsonb_populate_recordset(null::${aspas(nome)}, $1::jsonb)`, [JSON.stringify(linhas.slice(i, i + 300))])
    }
    // Recoloca os contadores (ids automáticos) depois do maior id restaurado.
    const { rows: sequencias } = await cliente.query(
      `select a.attname coluna, pg_get_serial_sequence($1, a.attname) sequencia
         from pg_attribute a where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped`,
      [aspas(nome)],
    )
    for (const { coluna, sequencia } of sequencias.filter((item) => item.sequencia)) {
      await cliente.query(`select setval($1, greatest(coalesce((select max(${aspas(coluna)}) from ${aspas(nome)}), 0), 1), (select count(*) > 0 from ${aspas(nome)}))`, [sequencia])
    }
    console.log(`  ${nome}: ${linhas.length} linhas`)
  }
  await cliente.query('commit')
  console.log('Restauração concluída. ✅')
} catch (erro) {
  await cliente.query('rollback').catch(() => {})
  console.error(`Não restaurei nada: ${erro.message || erro}`)
  process.exitCode = 1
} finally {
  cliente.release()
  await pool.end()
}
