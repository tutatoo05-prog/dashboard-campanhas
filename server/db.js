import pg from 'pg'

const { Pool } = pg

let pool = null

/** Pool lazy — criado na primeira query, usando DATABASE_URL do runtime env. */
export function getPool(env = process.env) {
  if (pool) return pool

  const connectionString = env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL não configurada.')
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10,
    // Sem isso, uma conexão que não abre deixa a consulta (e a tela) esperando para sempre.
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 60_000,
    keepAlive: true,
  })

  // Erro numa conexão parada do pool (rede caiu): só registra, o pool abre outra na próxima consulta.
  pool.on('error', (erro) => console.error('[banco] conexão do pool com erro:', erro.message))

  return pool
}

export async function query(env, text, params) {
  const client = getPool(env)
  return client.query(text, params)
}
