import { query } from './db.js'

/**
 * Cópia das planilhas do Google no banco do dash. As telas (Registros, Compras) leem daqui, em
 * milésimos, e um agendador (planilhasSync.js) atualiza a cópia de tempos em tempos. Ler as planilhas ao
 * vivo levava ~14 segundos por causa das 16 abas.
 *
 * Tabela planilhas_copia (db/schema.sql): uma linha por conjunto de dados (chave) com o JSON pronto.
 */

export const CHAVE_REGISTROS = 'registros'
export const CHAVE_EVENTOS_HOTMART = 'hotmart-eventos'

/** Lê a cópia. Devolve null se ainda não existe (ou se a tabela ainda não foi criada). */
export async function lerCopia(env, chave) {
  if (!env?.DATABASE_URL) return null
  try {
    const { rows } = await query(env, 'select dados, atualizado_em from planilhas_copia where chave = $1', [chave])
    if (!rows[0]) return null
    return { dados: rows[0].dados, atualizadoEm: new Date(rows[0].atualizado_em).toISOString() }
  } catch (error) {
    if (error?.code !== '42P01') console.error('[planilhas] falha ao ler a cópia:', error.message || error)
    return null
  }
}

export async function gravarCopia(env, chave, dados) {
  await query(
    env,
    `insert into planilhas_copia (chave, dados, atualizado_em, erro)
     values ($1, $2::jsonb, now(), null)
     on conflict (chave) do update set dados = excluded.dados, atualizado_em = now(), erro = null`,
    [chave, JSON.stringify(dados)],
  )
}

/** Registra que a atualização falhou, sem apagar a última cópia boa. */
export async function registrarErroCopia(env, chave, erro) {
  try {
    await query(env, `update planilhas_copia set erro = $2 where chave = $1`, [chave, String(erro).slice(0, 500)])
  } catch {
    // sem tabela ainda: nada a registrar
  }
}
