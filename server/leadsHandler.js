import { query } from './db.js'
import { readRequestBody } from './readBody.js'
import { garantirEsquemaDeLeads } from './projetos/esquema.js'
import { chavesDoContato } from './registrosApagados.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

/** Situações de contato que a equipe pode marcar na gaveta da pessoa. */
export const SITUACOES_CONTATO = ['novo', 'chamado', 'respondeu', 'sem_interesse']
const MAX_NOTA = 2000
const MAX_TAGS = 12
const MAX_TAG = 30

/** Chave da pessoa nas anotações: e-mail quando tem, senão os 11 últimos dígitos do telefone (mesma regra dos Registros). */
export function chaveDoLead(lead) {
  return chavesDoContato(lead)[0] ?? ''
}

function toLead(row) {
  return {
    chave: chaveDoLead(row),
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    origem: row.origem,
    slug: row.slug,
    tipo: row.tipo,
    vertente: row.vertente,
    campanha: row.campanha,
    campaign_id: row.campaign_id,
    midia: row.midia,
    veio_de: row.veio_de,
    criativo: row.criativo,
    ad_id: row.ad_id,
    landing_url: row.landing_url,
    data: row.data,
    data_nascimento: row.data_nascimento,
    created_at: row.created_at,
    respostas: row.respostas && typeof row.respostas === 'object' ? row.respostas : {},
  }
}

export async function garantirTabelaDeNotas(env, consultar = (texto, params) => query(env, texto, params)) {
  await consultar(`create table if not exists lead_notas (
    chave text primary key,
    nota text not null default '',
    situacao text not null default 'novo',
    tags text[] not null default '{}',
    atualizado_em timestamptz not null default now(),
    atualizado_por text
  )`)
}

function toNota(row) {
  return {
    chave: row.chave,
    nota: row.nota,
    situacao: row.situacao,
    tags: row.tags ?? [],
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  }
}

export class NotaInvalida extends Error {}

/** Valida e limpa o que veio da gaveta (nota, situação do contato e etiquetas). */
export function limparNota(corpo) {
  const chave = String(corpo?.chave ?? '').trim()
  if (!/^(e|t):.{3,200}$/.test(chave)) throw new NotaInvalida('Pessoa inválida.')
  const nota = String(corpo?.nota ?? '').slice(0, MAX_NOTA)
  const situacao = String(corpo?.situacao ?? 'novo')
  if (!SITUACOES_CONTATO.includes(situacao)) throw new NotaInvalida('Situação de contato inválida.')
  const tags = [...new Set((Array.isArray(corpo?.tags) ? corpo.tags : []).map((t) => String(t).trim().toLowerCase().slice(0, MAX_TAG)).filter(Boolean))].slice(
    0,
    MAX_TAGS,
  )
  return { chave, nota, situacao, tags }
}

export async function handleLeadsRequest(req, res, env, user = null, { consultar = (texto, params) => query(env, texto, params), esquema = garantirEsquemaDeLeads } = {}) {
  const { pathname } = new URL(req.url, 'http://localhost')

  if (pathname === '/api/leads/notas') {
    if (req.method === 'GET') {
      try {
        await garantirTabelaDeNotas(env, consultar)
        const { rows } = await consultar('select chave, nota, situacao, tags, atualizado_em, atualizado_por from lead_notas')
        return sendJson(res, 200, { success: true, notas: rows.map(toNota) })
      } catch (error) {
        console.error('Erro ao buscar anotações dos leads:', error)
        return sendJson(res, 502, { error: 'Não foi possível carregar as anotações.' })
      }
    }
    if (req.method !== 'PUT') return sendJson(res, 405, { error: 'Método não permitido.' })
    try {
      const dados = limparNota(JSON.parse((await readRequestBody(req)) || '{}'))
      await garantirTabelaDeNotas(env, consultar)
      const { rows } = await consultar(
        `insert into lead_notas (chave, nota, situacao, tags, atualizado_em, atualizado_por)
         values ($1, $2, $3, $4, now(), $5)
         on conflict (chave) do update
           set nota = excluded.nota, situacao = excluded.situacao, tags = excluded.tags,
               atualizado_em = now(), atualizado_por = excluded.atualizado_por
         returning chave, nota, situacao, tags, atualizado_em, atualizado_por`,
        [dados.chave, dados.nota, dados.situacao, dados.tags, user?.email ?? user?.nome ?? null],
      )
      return sendJson(res, 200, { success: true, nota: toNota(rows[0]) })
    } catch (error) {
      if (error instanceof SyntaxError) return sendJson(res, 400, { error: 'Corpo inválido.' })
      if (error instanceof NotaInvalida) return sendJson(res, 400, { error: error.message })
      console.error('Erro ao salvar anotação do lead:', error)
      return sendJson(res, 502, { error: 'Não foi possível salvar a anotação.' })
    }
  }

  if (pathname !== '/api/leads') {
    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Método não permitido.' })
  }

  try {
    await esquema(env)
    const result = await consultar(
      `select nome, email, telefone, origem, slug, tipo, vertente, campanha, campaign_id, midia, veio_de, criativo, ad_id, landing_url, data, respostas,
              created_at, to_char(data_nascimento, 'YYYY-MM-DD') as data_nascimento
         from leads
        order by created_at desc
        limit 5000`,
    )
    const leads = result.rows.map(toLead)

    return sendJson(res, 200, {
      success: true,
      count: leads.length,
      leads,
    })
  } catch (error) {
    console.error('Erro ao buscar leads:', error)
    return sendJson(res, 502, { error: 'Erro ao buscar leads no banco de dados.' })
  }
}
