import pg from 'pg'
import { query } from './db.js'

const BATCH = 200

function toBrDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** ID da campanha da Meta dentro do xcod da Hotmart: "ad_<ID>|var_...|l_..." (só quando o anúncio mandou utm_id). */
export function campaignIdFromXcod(xcod) {
  const match = /(?:^|\|)ad_(\d{8,})(?=\||$)/.exec(String(xcod ?? ''))
  return match ? match[1] : null
}

/** "REC_Essentials" (plano recorrente) e "Essentials total" são o mesmo curso Essentials. */
export function normalizeCourse(value) {
  return String(value ?? '')
    .replace(/^REC_/i, '')
    .replace(/\s+total$/i, '')
    .trim()
}

function toPurchase(row) {
  const when = row.aprovada_em ?? row.criado_em
  const isBrl = !row.moeda || String(row.moeda).toUpperCase() === 'BRL'
  const valor = Number(row.valor)
  return {
    fonte_id: `venda:${row.id}`,
    nome: row.nome ?? '',
    email: String(row.email ?? '').toLowerCase(),
    telefone: row.telefone ?? '',
    curso: normalizeCourse(row.curso),
    // "Origem" do checkout (src). A campanha da Meta, quando existe, aparece pelo campaign_id.
    campanha: row.src ?? row.campanha ?? '',
    liberacao: row.liberacao ?? '',
    data: toBrDate(when),
    // Compra em outra moeda (EUR, JPY...) não entra como reais: fica sem valor em vez de errado.
    valor: isBrl && Number.isFinite(valor) ? valor : null,
    status: 'ativo',
    subscriber_code: row.assinante ?? null,
    transacao: row.transacao ?? null,
    pagamento_tipo: row.pagamento_tipo ?? null,
    src: row.src ?? null,
    xcod: row.xcod ?? null,
    campaign_id: campaignIdFromXcod(row.xcod),
    recorrencia: row.recorrencia ?? null,
    created_at: when,
  }
}

async function insertBatch(env, rows) {
  const col = (key) => rows.map((row) => row[key])
  const result = await query(
    env,
    `insert into purchases (fonte_id, nome, email, telefone, curso, campanha, liberacao, data, valor, status,
                            subscriber_code, transacao, pagamento_tipo, src, xcod, campaign_id, recorrencia, created_at)
     select v.* from unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
       $9::numeric[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[], $15::text[],
       $16::text[], $17::int[], $18::timestamptz[]
     ) as v(fonte_id, nome, email, telefone, curso, campanha, liberacao, data, valor, status,
            subscriber_code, transacao, pagamento_tipo, src, xcod, campaign_id, recorrencia, created_at)
     where not exists (
       select 1 from purchases p
        where p.fonte_id = v.fonte_id
           or (lower(p.email) = lower(v.email) and p.curso = v.curso and p.data = v.data)
     )
     on conflict (fonte_id) do nothing`,
    [
      col('fonte_id'), col('nome'), col('email'), col('telefone'), col('curso'), col('campanha'),
      col('liberacao'), col('data'), col('valor'), col('status'), col('subscriber_code'),
      col('transacao'), col('pagamento_tipo'), col('src'), col('xcod'), col('campaign_id'),
      col('recorrencia'), col('created_at'),
    ],
  )
  return result.rowCount ?? 0
}

/**
 * Copia as vendas aprovadas do banco do site (tabela vendas, preenchida pelo n8n) para
 * purchases, que é a tabela que a tela Compras lê. Idempotente.
 *
 * - Só entra a PRIMEIRA cobrança (recorrencia vazia ou 1). Parcelas seguintes (2+) não são venda nova.
 * - Venda que já existe em purchases (mesmo e-mail, curso e dia) não duplica.
 *
 * Devolve { total, parcelas, pending, inserted }.
 */
export async function syncSalesFromEssentials(env, { dry = false } = {}) {
  const sourceUrl = env.ESSENTIALS_DATABASE_URL
  if (!sourceUrl) throw new Error('ESSENTIALS_DATABASE_URL não configurada.')

  const source = new pg.Client({
    connectionString: sourceUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  })
  await source.connect()

  try {
    const { rows } = await source.query(
      `select id, criado_em, aprovada_em, transacao, nome, email, telefone, curso, campanha, liberacao,
              valor, moeda, pagamento_tipo, src, sck, xcod, recorrencia, assinante
         from vendas
        where coalesce(evento, 'PURCHASE_APPROVED') = 'PURCHASE_APPROVED'
          and coalesce(hotmart_event_id, '') not like 'TESTE-%'
        order by coalesce(aprovada_em, criado_em)`,
    )

    const firstCharges = rows.filter((row) => !(row.recorrencia > 1))
    const parcelas = rows.length - firstCharges.length
    const purchases = firstCharges.map(toPurchase)

    const known = await query(env, 'select fonte_id from purchases where fonte_id is not null')
    const knownIds = new Set(known.rows.map((row) => row.fonte_id))
    const pending = purchases.filter((purchase) => !knownIds.has(purchase.fonte_id))

    let inserted = 0
    if (!dry) {
      for (let i = 0; i < pending.length; i += BATCH) {
        inserted += await insertBatch(env, pending.slice(i, i + BATCH))
      }
    }
    return { total: rows.length, parcelas, pending: pending.length, inserted }
  } finally {
    await source.end().catch(() => {})
  }
}
