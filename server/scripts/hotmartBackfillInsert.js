/**
 * Grava na tabela purchases o resultado do cruzamento gerado por
 * hotmartBackfillReport.js (histórico de vendas da Hotmart x leads).
 *
 * Uso: node --env-file=.env server/scripts/hotmartBackfillInsert.js <hotmart-backfill-report.json>
 */
import { readFileSync } from 'node:fs'
import { query } from '../db.js'

function toBrDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

async function main() {
  const reportPath = process.argv[2]
  if (!reportPath) {
    console.error('Uso: node --env-file=.env server/scripts/hotmartBackfillInsert.js <relatorio.json>')
    process.exit(1)
  }

  const rows = JSON.parse(readFileSync(reportPath, 'utf-8'))
  const env = process.env

  let inserted = 0
  for (const row of rows) {
    await query(
      env,
      `insert into purchases (nome, email, telefone, curso, campanha, liberacao, data, valor, status, created_at)
       values ($1, $2, '', $3, $4, 'Hotmart (backfill)', $5, $6, 'ativo', $7)`,
      [
        row.nome || '',
        row.email || '',
        row.produto || '',
        row.campanha || '',
        toBrDate(row.data_aprovacao),
        row.valor || null,
        row.data_aprovacao || new Date().toISOString(),
      ],
    )
    inserted += 1
  }

  console.log(`Inseridas ${inserted} compras na tabela purchases.`)
  process.exit(0)
}

main().catch((error) => {
  console.error('Erro:', error.message)
  process.exit(1)
})
