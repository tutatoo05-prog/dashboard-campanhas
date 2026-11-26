import { query } from '../db.js'

// Banco do clube (db/clube.sql). Sem as tabelas, `ehFaltaDeTabela(erro)` é true e quem chama avisa "falta rodar db/clube.sql".

export const ehFaltaDeTabela = (erro) => erro?.code === '42P01'

const minusculo = (v) => String(v ?? '').trim().toLowerCase()

/** Acessos ativos e vigentes dos cursos da Essentials, um por e-mail: [{ chave (e-mail), email, nome, nivel, desde }]. */
export async function lerEssentials(env, cursos) {
  const { rows } = await query(
    env,
    `select lower(email) as email, max(nome) as nome, string_agg(distinct curso, ', ') as cursos, min(criado_em) as desde
       from acessos
      where curso = any($1) and status = 'ativo' and email is not null and email <> ''
        and (liberado_ate is null or liberado_ate > now())
      group by lower(email)`,
    [cursos],
  )
  return rows.map((r) => ({ chave: r.email, email: r.email, nome: r.nome ?? null, nivel: r.cursos, desde: r.desde }))
}

/** Chaves dos membros hoje ativos numa plataforma. */
export async function chavesAtivas(env, plataforma) {
  const { rows } = await query(env, "select chave from clube_membros where plataforma = $1 and status = 'ativo'", [plataforma])
  return new Set(rows.map((r) => r.chave))
}

/**
 * Aplica a lista que acabou de vir da fonte: quem está nela fica ativo (e é criado se for novo); quem estava ativo e não
 * está mais fica cancelado. Devolve { ativos, novos, cancelados }. NÃO apaga ninguém (o histórico e o discord_id ficam).
 */
export async function aplicarLista(env, plataforma, lista) {
  const antes = await chavesAtivas(env, plataforma)
  const agora = new Set(lista.map((m) => m.chave))
  const novos = [...agora].filter((c) => !antes.has(c)).length
  const saidas = [...antes].filter((c) => !agora.has(c))

  if (lista.length) {
    await query(
      env,
      `insert into clube_membros (plataforma, chave, nome, email, nivel, desde, status, sincronizado_em)
       select $1, t.chave, t.nome, t.email, t.nivel, t.desde, 'ativo', now()
         from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[]) as t(chave, nome, email, nivel, desde)
       on conflict (plataforma, chave) do update
         set nome = coalesce(excluded.nome, clube_membros.nome),
             email = coalesce(excluded.email, clube_membros.email),
             nivel = excluded.nivel,
             desde = coalesce(clube_membros.desde, excluded.desde),
             status = 'ativo',
             cancelado_em = null,
             sincronizado_em = now()`,
      [plataforma, lista.map((m) => m.chave), lista.map((m) => m.nome ?? null), lista.map((m) => m.email ?? null), lista.map((m) => m.nivel ?? null), lista.map((m) => m.desde ?? null)],
    )
  }
  if (saidas.length) {
    await query(env, "update clube_membros set status = 'cancelado', cancelado_em = now(), sincronizado_em = now() where plataforma = $1 and chave = any($2) and status = 'ativo'", [plataforma, saidas])
  }
  return { ativos: lista.length, novos, cancelados: saidas.length }
}

/** Membro ativo (ou null). */
export async function buscarAtivo(env, plataforma, chave) {
  const { rows } = await query(env, "select id, plataforma, chave, nome, nivel, discord_id from clube_membros where plataforma = $1 and chave = $2 and status = 'ativo'", [plataforma, plataforma === 'essentials' ? minusculo(chave) : chave])
  return rows[0] ?? null
}

/** Membro ativo pelo id (é o que os tokens do resgate carregam: nada pessoal na URL). */
export async function buscarAtivoPorId(env, id) {
  const n = Number(id)
  if (!Number.isSafeInteger(n) || n <= 0) return null
  const { rows } = await query(env, "select id, plataforma, chave, nome, nivel, discord_id from clube_membros where id = $1 and status = 'ativo'", [n])
  return rows[0] ?? null
}

/** Grava a ligação com o Discord e marca o cargo como aplicado. */
export async function vincularDiscord(env, id, { discordId, discordNome }) {
  await query(
    env,
    'update clube_membros set discord_id = $2, discord_nome = $3, discord_vinculado_em = now(), cargo_aplicado = true where id = $1',
    [id, discordId, discordNome ?? null],
  )
}

/**
 * Quem já saiu do clube mas ainda tem o cargo: [{ id, plataforma, discord_id }]. Não inclui quem, na MESMA plataforma, tem
 * outra linha ativa com o mesmo Discord (aí o cargo continua valendo).
 */
export async function pendentesDeRevogar(env) {
  const { rows } = await query(
    env,
    `select m.id, m.plataforma, m.discord_id
       from clube_membros m
      where m.status = 'cancelado' and m.discord_id is not null and m.cargo_aplicado
        and not exists (select 1 from clube_membros o where o.plataforma = m.plataforma and o.discord_id = m.discord_id and o.status = 'ativo')`,
  )
  return rows
}

export async function marcarCargoRevogado(env, id) {
  await query(env, 'update clube_membros set cargo_aplicado = false where id = $1', [id])
}

export async function gravarSnapshot(env, plataforma, { ativos, novos, cancelados }) {
  await query(
    env,
    `insert into clube_snapshots (dia, plataforma, ativos, novos, cancelados)
     values ((now() at time zone 'America/Sao_Paulo')::date, $1, $2, $3, $4)
     on conflict (dia, plataforma) do update
       set ativos = excluded.ativos, novos = clube_snapshots.novos + excluded.novos, cancelados = clube_snapshots.cancelados + excluded.cancelados`,
    [plataforma, ativos, novos, cancelados],
  )
}

export async function gravarEstado(env, chave, valor) {
  await query(
    env,
    'insert into clube_estado (chave, valor, atualizado_em) values ($1, $2::jsonb, now()) on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()',
    [chave, JSON.stringify(valor)],
  )
}

/** Números da tela Clube. */
export async function resumo(env) {
  const [{ rows: contagens }, { rows: evolucao }, { rows: estado }] = await Promise.all([
    query(env, `select plataforma, status, count(*)::int as total, count(*) filter (where discord_id is not null)::int as no_discord from clube_membros group by plataforma, status`),
    query(env, `select dia::text as dia, plataforma, ativos, novos, cancelados from clube_snapshots where dia >= (now() at time zone 'America/Sao_Paulo')::date - 60 order by dia`),
    query(env, 'select chave, valor, atualizado_em from clube_estado'),
  ])
  const por = { youtube: { ativos: 0, cancelados: 0, noDiscord: 0 }, essentials: { ativos: 0, cancelados: 0, noDiscord: 0 } }
  for (const c of contagens) {
    const alvo = por[c.plataforma]
    if (!alvo) continue
    if (c.status === 'ativo') {
      alvo.ativos = c.total
      alvo.noDiscord = c.no_discord
    } else {
      alvo.cancelados = c.total
    }
  }
  return {
    plataformas: por,
    evolucao,
    estado: Object.fromEntries(estado.map((e) => [e.chave, { ...e.valor, atualizadoEm: new Date(e.atualizado_em).toISOString() }])),
  }
}

/** Lista para a tela (mais recentes primeiro). */
export async function listar(env, { limite = 300 } = {}) {
  const { rows } = await query(
    env,
    `select id, plataforma, chave, nome, email, nivel, status, desde, discord_id, discord_nome, discord_vinculado_em, cargo_aplicado
       from clube_membros order by (status = 'ativo') desc, coalesce(desde, criado_em) desc limit $1`,
    [limite],
  )
  return rows.map((r) => ({
    id: Number(r.id),
    plataforma: r.plataforma,
    chave: r.chave,
    nome: r.nome,
    email: r.email,
    nivel: r.nivel,
    status: r.status,
    desde: r.desde ? new Date(r.desde).toISOString() : null,
    discordNome: r.discord_nome,
    noDiscord: Boolean(r.discord_id),
    cargoAplicado: r.cargo_aplicado,
  }))
}
