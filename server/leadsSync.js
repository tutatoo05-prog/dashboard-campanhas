import pg from 'pg'
import { query } from './db.js'

const BATCH = 200
const NUMERIC_ID = /^\d{8,}$/

function toBrDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

const text = (value) => String(value ?? '').trim()

function toDashLead(row) {
  const utm = row.utm ?? {}
  const respostas = row.respostas ?? {}
  // Nos anúncios novos o utm_content é o ID do anúncio (utm_id = campanha, utm_term = conjunto).
  const contentIsId = NUMERIC_ID.test(text(utm.utm_content))
  return {
    fonte_id: String(row.id),
    nome: row.nome ?? '',
    email: row.email ?? '',
    telefone: row.whatsapp ?? '',
    // produto do site vira a "origem" da tela Leads (essentials, workshop_irezumi_1...)
    origem: String(row.produto ?? '').replace(/-/g, '_'),
    campanha: text(utm.utm_campaign),
    // ID da campanha da Meta (utm_id={{campaign.id}} no anúncio). Sem ele, o servidor resolve pelo nome.
    campaign_id: NUMERIC_ID.test(text(utm.utm_id)) ? text(utm.utm_id) : null,
    midia: text(utm.utm_medium),
    veio_de: text(utm.utm_source),
    // Nome do criativo: o que a página mandou em "criativo", ou o utm_content quando ele é um nome.
    criativo: text(respostas.criativo) || (contentIsId ? '' : text(utm.utm_content)),
    // ID do anúncio: o ad_id que a página mandou, ou o utm_content quando ele é um ID.
    ad_id: text(respostas.ad_id) || (contentIsId ? text(utm.utm_content) : ''),
    landing_url: row.source_url ?? '',
    data: toBrDate(row.criado_em),
    created_at: row.criado_em,
  }
}

async function upsertBatch(env, leads) {
  const col = (key) => leads.map((lead) => lead[key])
  // Lead novo entra inteiro. Lead que já existe só ganha o que estava vazio (ID da campanha, anúncio, criativo),
  // nunca perde nem troca o que já tinha.
  const result = await query(
    env,
    `insert into leads (fonte_id, nome, email, telefone, origem, campanha, campaign_id, midia, veio_de, criativo, ad_id, landing_url, data, created_at)
     select * from unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
       $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::timestamptz[]
     )
     on conflict (fonte_id) do update set
       campaign_id = coalesce(leads.campaign_id, excluded.campaign_id),
       ad_id = case when leads.ad_id = '' then excluded.ad_id else leads.ad_id end,
       criativo = case when leads.criativo = '' then excluded.criativo else leads.criativo end
     where (leads.campaign_id is null and excluded.campaign_id is not null)
        or (leads.ad_id = '' and excluded.ad_id <> '')
        or (leads.criativo = '' and excluded.criativo <> '')
     returning (xmax = 0) as novo`,
    [
      col('fonte_id'), col('nome'), col('email'), col('telefone'), col('origem'),
      col('campanha'), col('campaign_id'), col('midia'), col('veio_de'), col('criativo'), col('ad_id'),
      col('landing_url'), col('data'), col('created_at'),
    ],
  )
  const inserted = result.rows.filter((row) => row.novo).length
  return { inserted, updated: result.rows.length - inserted }
}

/**
 * Copia os leads do banco do site (projeto Supabase "Dados Essentials") para a
 * tabela leads do dash. Idempotente: leads.fonte_id guarda o id do lead no site,
 * então só entra o que ainda não foi copiado; nos que já existem, só completa o
 * que estava vazio (ID da campanha, anúncio e criativo).
 *
 * Precisa de ESSENTIALS_DATABASE_URL (leitura do banco do site) e DATABASE_URL.
 * Devolve { total, pending, inserted, updated }.
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
      `select id, criado_em, produto, nome, email, whatsapp, utm, respostas, source_url
         from leads
        order by criado_em`,
    )
    const known = await query(env, 'select fonte_id from leads where fonte_id is not null')
    const knownIds = new Set(known.rows.map((row) => row.fonte_id))
    const leads = rows.map(toDashLead)
    const pending = leads.filter((lead) => !knownIds.has(lead.fonte_id)).length

    let inserted = 0
    let updated = 0
    if (!dry) {
      for (let i = 0; i < leads.length; i += BATCH) {
        const result = await upsertBatch(env, leads.slice(i, i + BATCH))
        inserted += result.inserted
        updated += result.updated
      }
    }
    return { total: rows.length, pending, inserted, updated }
  } finally {
    await source.end().catch(() => {})
  }
}
