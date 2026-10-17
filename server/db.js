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
    // O banco (pooler do Supabase em modo sessão) aceita no máximo 15 conexões no total, somando TODOS os
    // processos: o app, o app antigo ainda fechando num deploy, scripts, etc. Com 10 por processo, dois
    // processos já estouravam ("max clients reached") e as telas ficavam sem banco. Por isso 6.
    max: Number(env.DB_POOL_MAX) || 6,
    // Sem isso, uma conexão que não abre deixa a consulta (e a tela) esperando para sempre.
    connectionTimeoutMillis: 15_000,
    // O banco fica longe do servidor (≈150 ms por ida e volta); abrir conexão custa vários desses. Manter as
    // conexões abertas evita pagar isso a cada tela (ver aquecerPool).
    idleTimeoutMillis: 5 * 60_000,
    keepAlive: true,
  })

  // Erro numa conexão parada do pool (rede caiu): só registra, o pool abre outra na próxima consulta.
  pool.on('error', (erro) => console.error('[banco] conexão do pool com erro:', erro.message))

  return pool
}

/**
 * Abre (e mantém abertas) `quantas` conexões com o banco. Cada conexão nova leva ~1 s (DNS, TCP, TLS e login
 * a ≈150 ms cada); 10 abrindo juntas numa tela cheia estouravam o limite. Chamado ao subir e a cada 2 minutos.
 */
export async function aquecerPool(env, quantas = 3) {
  const resultados = await Promise.allSettled(Array.from({ length: quantas }, () => getPool(env).query('select pg_sleep(0.05)')))
  return resultados.filter((r) => r.status === 'fulfilled').length
}

// Falhas em que a consulta nem chegou a sair (banco sem vaga de conexão): seguro tentar de novo.
const SEM_VAGA = /EMAXCONN|max clients reached|too many clients|timeout exceeded when trying to connect/i

export async function query(env, text, params) {
  const client = getPool(env)
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      return await client.query(text, params)
    } catch (erro) {
      if (tentativa >= 3 || !SEM_VAGA.test(`${erro?.code ?? ''} ${erro?.message ?? ''}`)) throw erro
      await new Promise((resolver) => setTimeout(resolver, 500 * tentativa))
    }
  }
}
