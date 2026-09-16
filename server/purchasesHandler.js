import { query } from './db.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function toPurchase(row) {
  return {
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    curso: row.curso,
    campanha: row.campanha,
    liberacao: row.liberacao,
    data: row.data,
    valor: row.valor != null ? Number(row.valor) : null,
  }
}

export async function handlePurchasesRequest(req, res, env) {
  const { pathname } = new URL(req.url, 'http://localhost')

  if (pathname !== '/api/purchases') {
    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Método não permitido.' })
  }

  try {
    const result = await query(
      env,
      'select nome, email, telefone, curso, campanha, liberacao, data, valor from purchases order by created_at desc',
    )
    const purchases = result.rows.map(toPurchase)

    return sendJson(res, 200, {
      success: true,
      count: purchases.length,
      purchases,
    })
  } catch (error) {
    console.error('Erro ao buscar compras:', error)
    return sendJson(res, 502, { error: 'Erro ao buscar compras no banco de dados.' })
  }
}
