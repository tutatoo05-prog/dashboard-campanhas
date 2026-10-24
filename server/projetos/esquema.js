import { query } from '../db.js'
import { classificar } from './catalogo.js'

/**
 * Prepara a tabela leads para o tipo/vertente/slug de cada projeto e classifica o que já existe.
 * Idempotente: pode rodar a cada subida. Quem precisa das colunas chama garantirEsquemaDeLeads(env) antes de gravar/ler.
 */

let pronto = null

export function garantirEsquemaDeLeads(env, consultar = (texto, params) => query(env, texto, params)) {
  if (!pronto) {
    pronto = executar(consultar).catch((erro) => {
      pronto = null // tenta de novo na próxima chamada
      throw erro
    })
  }
  return pronto
}

/** Só para os testes. */
export function reiniciarEsquema() {
  pronto = null
}

async function executar(consultar) {
  await consultar('alter table leads add column if not exists tipo text')
  await consultar('alter table leads add column if not exists vertente text')
  await consultar('alter table leads add column if not exists slug text')
  await consultar("alter table leads add column if not exists respostas jsonb not null default '{}'::jsonb")
  await consultar('create index if not exists leads_slug_idx on leads (slug)')

  // Linhas antigas: classifica pela origem que já tinham (uma consulta por origem distinta, são poucas).
  const { rows } = await consultar('select distinct origem from leads where slug is null')
  for (const { origem } of rows) {
    const projeto = classificar(origem)
    await consultar('update leads set tipo = $1, vertente = $2, slug = $3 where slug is null and origem is not distinct from $4', [
      projeto.tipo,
      projeto.vertente,
      projeto.slug,
      origem,
    ])
  }
}
