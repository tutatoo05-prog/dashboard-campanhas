import { readRequestBody } from './readBody.js'
import { query } from './db.js'
import { ROLES } from './roles.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function toUser(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    usuario: row.usuario,
    ativo: row.ativo,
    cargo: row.cargo,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  }
}

const USER_COLUMNS = 'id, nome, email, usuario, ativo, cargo, created_at'

/** Só administradores chegam aqui (checado no middleware). */
export async function handleUsersRequest(req, res, env, user) {
  const { pathname } = new URL(req.url, 'http://localhost')

  if (pathname === '/api/users') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido.' })
    try {
      const result = await query(env, `select ${USER_COLUMNS} from users order by created_at`)
      return sendJson(res, 200, { success: true, users: result.rows.map(toUser) })
    } catch (error) {
      console.error('Erro ao listar usuários:', error)
      return sendJson(res, 502, { error: 'Erro ao listar usuários no banco de dados.' })
    }
  }

  const match = pathname.match(/^\/api\/users\/([^/]+)$/)
  if (!match) return sendJson(res, 404, { error: 'Rota não encontrada.' })
  if (req.method !== 'PATCH') return sendJson(res, 405, { error: 'Método não permitido.' })

  const id = match[1]
  if (!UUID_RE.test(id)) return sendJson(res, 400, { error: 'Usuário inválido.' })

  let cargo
  let aprovar = false
  try {
    const raw = await readRequestBody(req, 4 * 1024)
    const body = raw ? JSON.parse(raw) : {}
    aprovar = body.aprovar === true
    cargo = String(body.cargo ?? '')
  } catch (error) {
    if (error.message === 'Payload too large') return sendJson(res, 413, { error: 'Requisição muito grande.' })
    return sendJson(res, 400, { error: 'Requisição inválida.' })
  }

  // Aprovar um cadastro pendente (ativo = true). Só aprova: desativar quem já entrou fica fora para ninguém se trancar.
  // Existe porque a aprovação pelo Telegram do n8n pode falhar sem o administrador perceber.
  if (aprovar) {
    try {
      const result = await query(env, `update users set ativo = true, recusado_em = null where id = $1 and ativo = false returning ${USER_COLUMNS}`, [id])
      if (!result.rows[0]) {
        const exists = await query(env, 'select ativo from users where id = $1', [id])
        if (!exists.rows[0]) return sendJson(res, 404, { error: 'Usuário não encontrado.' })
        return sendJson(res, 409, { error: 'Esse cadastro já está ativo.' })
      }
      console.log(`[cadastros] ${user.email} aprovou ${result.rows[0].email}`)
      return sendJson(res, 200, { success: true, user: toUser(result.rows[0]) })
    } catch (error) {
      console.error('Erro ao aprovar cadastro:', error)
      return sendJson(res, 502, { error: 'Erro ao aprovar o cadastro no banco de dados.' })
    }
  }

  if (!ROLES.includes(cargo)) {
    return sendJson(res, 400, { error: 'Cargo inválido (use "admin" ou "usuario").' })
  }

  try {
    // Numa instrução só: nunca deixa o sistema sem nenhum administrador.
    const result = await query(
      env,
      `update users set cargo = $2
        where id = $1
          and ($2 = 'admin' or exists (select 1 from users where cargo = 'admin' and ativo and id <> $1))
        returning ${USER_COLUMNS}`,
      [id, cargo],
    )

    if (!result.rows[0]) {
      const exists = await query(env, 'select 1 from users where id = $1', [id])
      if (!exists.rows[0]) return sendJson(res, 404, { error: 'Usuário não encontrado.' })
      return sendJson(res, 400, { error: 'É preciso ter pelo menos um administrador ativo.' })
    }

    console.log(`[cargos] ${user.email} mudou ${result.rows[0].email} para ${cargo}`)
    return sendJson(res, 200, { success: true, user: toUser(result.rows[0]) })
  } catch (error) {
    console.error('Erro ao mudar cargo:', error)
    return sendJson(res, 502, { error: 'Erro ao salvar o cargo no banco de dados.' })
  }
}
