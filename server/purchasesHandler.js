import { query } from './db.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function toPurchase(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    curso: row.curso,
    // Quando o checkout trouxe o ID da campanha da Meta, mostra o nome dela (pelo cadastro do site);
    // senão fica o rótulo de origem da página (live, essentials_live...).
    campanha: row.campanha_meta || row.campanha,
    liberacao: row.liberacao,
    data: row.data,
    valor: row.valor != null ? Number(row.valor) : null,
    status: row.status,
    canceledAt: row.canceled_at,
    subscriberCode: row.subscriber_code,
    createdAt: row.created_at,
    src: row.src,
    xcod: row.xcod,
    campaignId: row.campaign_id,
    pagamentoTipo: row.pagamento_tipo,
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
      `select p.id, p.nome, p.email, p.telefone, p.curso, p.campanha, p.liberacao, p.data, p.valor, p.status,
              p.canceled_at, p.subscriber_code, p.created_at, p.src, p.xcod, p.campaign_id, p.pagamento_tipo,
              (select l.campanha from leads l
                where p.campaign_id is not null and l.campaign_id = p.campaign_id and btrim(l.campanha) <> ''
                order by l.created_at desc limit 1) as campanha_meta
         from purchases p
        order by p.created_at desc`,
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
