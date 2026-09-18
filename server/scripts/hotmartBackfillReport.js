/**
 * Cruza o histórico de vendas da Hotmart com os leads já registrados
 * (por e-mail), pra identificar de qual campanha cada comprador veio.
 * Só gera um relatório — não grava nada no banco.
 *
 * Uso: node --env-file=.env server/scripts/hotmartBackfillReport.js [caminho/leads.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { getHotmartAccessToken, fetchHotmartSalesHistory } from '../hotmartApi.js'

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

async function main() {
  const leadsPath = process.argv[2]
  if (!leadsPath) {
    console.error('Uso: node --env-file=.env server/scripts/hotmartBackfillReport.js <leads.json>')
    process.exit(1)
  }

  const leads = JSON.parse(readFileSync(leadsPath, 'utf-8'))
  const leadsByEmail = new Map()
  for (const lead of leads) {
    const email = normalizeEmail(lead.Email)
    if (email) leadsByEmail.set(email, lead)
  }
  console.log(`Leads carregados: ${leads.length} (${leadsByEmail.size} com e-mail único)`)

  const env = process.env
  console.log('Autenticando na API Hotmart...')
  const token = await getHotmartAccessToken(env)

  console.log('Buscando histórico de vendas (últimos 12 meses)...')
  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setMonth(startDate.getMonth() - 12)

  const sales = await fetchHotmartSalesHistory(token, { startDate, endDate })
  console.log(`Vendas encontradas na Hotmart: ${sales.length}`)

  const rows = sales.map((sale) => {
    const email = normalizeEmail(sale.buyer?.email)
    const lead = leadsByEmail.get(email)
    return {
      email: sale.buyer?.email ?? '',
      nome: sale.buyer?.name ?? '',
      produto: sale.product?.name ?? '',
      valor: sale.purchase?.price?.value ?? '',
      data_aprovacao: sale.purchase?.approved_date
        ? new Date(sale.purchase.approved_date).toISOString()
        : '',
      status: sale.purchase?.status ?? '',
      matched: Boolean(lead),
      campanha: lead?.Campanha ?? '',
      midia: lead?.Midia ?? '',
      criativo: lead?.Criativo ?? '',
      veio_de: lead?.['Veio de'] ?? '',
    }
  })

  const matchedCount = rows.filter((r) => r.matched).length
  console.log(`\nResultado: ${matchedCount}/${rows.length} vendas com lead correspondente por e-mail.\n`)

  const outPath = leadsPath.replace(/leads\.json$/, 'hotmart-backfill-report.json')
  writeFileSync(outPath, JSON.stringify(rows, null, 2))
  console.log(`Relatório salvo em: ${outPath}`)

  const csvHeader = ['email','nome','produto','valor','data_aprovacao','status','matched','campanha','midia','criativo','veio_de']
  const csvLines = [csvHeader.join(',')]
  for (const r of rows) {
    csvLines.push(csvHeader.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))
  }
  const csvPath = outPath.replace(/\.json$/, '.csv')
  writeFileSync(csvPath, csvLines.join('\n'))
  console.log(`CSV salvo em: ${csvPath}`)
}

main().catch((error) => {
  console.error('Erro:', error.message)
  process.exit(1)
})
