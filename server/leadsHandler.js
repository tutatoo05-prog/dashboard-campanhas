import { query } from './db.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function toLead(row) {
  return {
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    origem: row.origem,
    campanha: row.campanha,
    midia: row.midia,
    veio_de: row.veio_de,
    criativo: row.criativo,
    ad_id: row.ad_id,
    landing_url: row.landing_url,
    data: row.data,
    created_at: row.created_at,
  }
}

export async function handleLeadsRequest(req, res, env) {
  const { pathname } = new URL(req.url, 'http://localhost')

  if (pathname !== '/api/leads') {
    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Método não permitido.' })
  }

  try {
    const result = await query(
      env,
      `select nome, email, telefone, origem, campanha, midia, veio_de, criativo, ad_id, landing_url, data, created_at
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
