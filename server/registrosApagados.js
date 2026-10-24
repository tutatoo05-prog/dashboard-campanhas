import { query } from './db.js'
import { limparCache } from './cacheCurto.js'

/**
 * Apagar pessoa na tela Registros.
 *
 * Os registros vêm de planilhas do Google (o dash só lê) e de leads gravados direto no banco. Então "apagar" faz duas coisas:
 *  - apaga do banco os leads que entraram pelo dash (/api/captura, recuperados do n8n ou importados das planilhas);
 *  - guarda e-mail e telefone numa lista de apagados, e a tela esconde o que bate com ela (o que veio da planilha continua
 *    lá, mas não aparece). Só some o que é de ANTES do apagamento: se a pessoa se cadastrar de novo, o cadastro novo aparece.
 * Não mexe nas planilhas do Google, nas vendas da Hotmart nem na tela Leads (que também recebe cópia do site).
 */

const MAX_CONTATOS = 60

export async function garantirTabelaDeApagados(env, consultar = (texto, params) => query(env, texto, params)) {
  await consultar(`create table if not exists registros_apagados (
    chave text primary key,
    apagado_em timestamptz not null default now(),
    apagado_por text
  )`)
}

const digitos = (telefone) => String(telefone ?? '').replace(/\D/g, '').slice(-11)

/** Chaves de busca de um contato: "e:<email>" e "t:<últimos 11 dígitos do telefone>". */
export function chavesDoContato(contato) {
  const chaves = []
  const email = String(contato?.email ?? '').trim().toLowerCase()
  if (email) chaves.push(`e:${email}`)
  const tel = digitos(contato?.telefone)
  if (tel.length >= 8) chaves.push(`t:${tel}`)
  return chaves
}

export class ApagarInvalido extends Error {}

/** Apaga a pessoa (todos os e-mails e telefones que ela usou). Devolve quantas chaves foram escondidas e quantos leads saíram do banco. */
export async function apagarPessoa(env, contatos, { usuario = null, consultar = (texto, params) => query(env, texto, params) } = {}) {
  if (!Array.isArray(contatos) || !contatos.length) throw new ApagarInvalido('Informe quem apagar.')
  if (contatos.length > MAX_CONTATOS) throw new ApagarInvalido('Contatos demais de uma vez.')
  const chaves = [...new Set(contatos.flatMap(chavesDoContato))]
  if (!chaves.length) throw new ApagarInvalido('Sem e-mail ou telefone válido para identificar a pessoa.')

  await garantirTabelaDeApagados(env, consultar)
  await consultar(
    `insert into registros_apagados (chave, apagado_em, apagado_por)
     select k, now(), $2 from unnest($1::text[]) as k
     on conflict (chave) do update set apagado_em = now(), apagado_por = excluded.apagado_por`,
    [chaves, usuario],
  )

  const emails = chaves.filter((c) => c.startsWith('e:')).map((c) => c.slice(2))
  const telefones = chaves.filter((c) => c.startsWith('t:')).map((c) => c.slice(2))
  const apagados = await consultar(
    `delete from leads
      where (fonte_id like 'captura:%' or fonte_id like 'recuperado:%' or fonte_id like 'planilha:%')
        and (lower(email) = any($1::text[]) or right(regexp_replace(telefone, '\\D', '', 'g'), 11) = any($2::text[]))`,
    [emails, telefones],
  )
  limparCache('planilhas|')
  return { chaves: chaves.length, leadsApagados: apagados.rowCount ?? 0 }
}

/** Tira dos registros o que a equipe apagou (só o que é anterior ao apagamento). Se não der para ler a lista, devolve tudo como estava. */
export async function ocultarApagados(dados, env, consultar = (texto, params) => query(env, texto, params)) {
  if (!env || !dados?.records) return dados
  let apagados
  try {
    apagados = (await consultar('select chave, apagado_em from registros_apagados')).rows
  } catch (erro) {
    if (erro?.code !== '42P01') console.error('Erro ao ler os registros apagados:', erro.message || erro)
    return dados
  }
  if (!apagados.length) return dados

  const quando = new Map(apagados.map((linha) => [linha.chave, new Date(linha.apagado_em).getTime()]))
  const escondido = (registro) => {
    const chaves = chavesDoContato(registro)
    const limite = Math.max(-Infinity, ...chaves.map((chave) => quando.get(chave) ?? -Infinity))
    if (limite === -Infinity) return false
    const data = registro.data ? new Date(registro.data).getTime() : NaN
    return !Number.isFinite(data) || data <= limite
  }

  const records = dados.records.filter((registro) => !escondido(registro))
  if (records.length === dados.records.length) return dados

  // Atualiza a contagem de cada aba (só as que perderam linhas).
  const contagem = new Map()
  for (const registro of records) {
    const chave = `${registro.planilha}||${registro.aba}`
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  const tabs = dados.tabs.map((aba) => (aba.count === null ? aba : { ...aba, count: contagem.get(`${aba.planilha}||${aba.aba}`) ?? 0 }))
  return { ...dados, tabs, records }
}
