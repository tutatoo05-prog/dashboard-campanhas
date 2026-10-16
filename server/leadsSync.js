import pg from 'pg'
import { query } from './db.js'

const BATCH = 200

function toBrDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function toDashLead(row) {
  const utm = row.utm ?? {}
  return {
    fonte_id: String(row.id),
    nome: row.nome ?? '',
    email: row.email ?? '',
    telefone: row.whatsapp ?? '',
    // produto do site vira a "origem" da tela Leads (essentials, workshop_irezumi_1...)
    origem: String(row.produto ?? '').replace(/-/g, '_'),
    campanha: utm.utm_campaign ?? '',
    midia: utm.utm_medium ?? '',
    veio_de: utm.utm_source ?? '',
    criativo: utm.utm_content ?? '',
    ad_id: '',
    landing_url: row.source_url ?? '',
    data: toBrDate(row.criado_em),
    created_at: row.criado_em,
  }
}

async function insertBatch(env, leads) {
  const col = (key) => leads.map((lead) => lead[key])
  const result = await query(
    env,
    `insert into leads (fonte_id, nome, email, telefone, origem, campanha, midia, veio_de, criativo, ad_id, landing_url, data, created_at)
     select * from unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
       $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::timestamptz[]
     )
     on conflict (fonte_id) do nothing`,
    [
      col('fonte_id'), col('nome'), col('email'), col('telefone'), col('origem'),
      col('campanha'), col('midia'), col('veio_de'), col('criativo'), col('ad_id'),
      col('landing_url'), col('data'), col('created_at'),
    ],
  )
  return result.rowCount ?? 0
}

/**
 * Copia os leads do banco do site (projeto Supabase "Dados Essentials") para a
 * tabela leads do dash. Idempotente: leads.fonte_id guarda o id do lead no site,
 * então só entra o que ainda não foi copiado.
 *
 * Precisa de ESSENTIALS_DATABASE_URL (leitura do banco do site) e DATABASE_URL.
 * Devolve { total, pending, inserted }.
 */
export async function syncLeadsFromEssentials(env, { dry = false } = {}) {
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
      `select id, criado_em, produto, nome, email, whatsapp, utm, source_url
         from leads
        order by criado_em`,
    )
    const known = await query(env, 'select fonte_id from leads where fonte_id is not null')
    const knownIds = new Set(known.rows.map((row) => row.fonte_id))
    const pending = rows.map(toDashLead).filter((lead) => !knownIds.has(lead.fonte_id))

    let inserted = 0
    if (!dry) {
      for (let i = 0; i < pending.length; i += BATCH) {
        inserted += await insertBatch(env, pending.slice(i, i + BATCH))
      }
    }
    return { total: rows.length, pending: pending.length, inserted }
  } finally {
    await source.end().catch(() => {})
  }
}
