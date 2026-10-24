import { createHash } from 'node:crypto'
import { query } from './db.js'
import { CHAVE_REGISTROS, gravarCopia, lerCopia } from './planilhasCopia.js'
import { TIPOS, classificar } from './projetos/catalogo.js'
import { garantirEsquemaDeLeads } from './projetos/esquema.js'

/**
 * Importação única do histórico das planilhas do Google para a tabela leads (o banco passa a ser a única fonte).
 * Lê a cópia que o dash já guarda no banco (planilhas_copia), classifica cada aba num projeto e grava só quem ainda
 * não existe naquele projeto (mesmo e-mail ou telefone). Pode rodar de novo sem duplicar (fonte_id é derivado da pessoa).
 */

export const CHAVE_IMPORTACAO = 'importacao-leads'

/** "planilha||aba" -> slug do projeto. Aba que não está aqui (ex.: Leads reprovados) não é importada. */
const ABA_PARA_SLUG = {
  'Dados Academy||Essentials': 'essentials',
  'Dados Academy||interessados - lp': 'workirezumi', // as mesmas pessoas do Irezumi (o formulário mandava duas vezes)
  'Dados Academy||Prompt': 'workprompt',
  'Dados Academy||particular': 'mentoria-particular',
  'Workshop Irezumi - 1ª edição||leads': 'workirezumi',
  'Work gratuito Leão - 2ª edição||Dados': 'workleao2',
  'Dashboard campanhas||Geral': 'essentials',
  'Dashboard campanhas||Work Cobertura': 'workcobertura',
  'Tracking Essentials||Leads novos': 'essentials',
  'Tracking Essentials||Leads repetidos': 'essentials',
}

const LOTE = 200
const soDigitos = (valor) => String(valor ?? '').replace(/\D/g, '')
const ultimos11 = (valor) => soDigitos(valor).slice(-11)

/** O Registros guarda só o rótulo do canal ("Meta Ads (pago)"); aqui volta para origem/mídia, de onde o rótulo sai igual. */
export function canalParaOrigem(canal) {
  switch (canal) {
    case 'Meta Ads (pago)':
      return { veio_de: 'meta', midia: 'paid' }
    case 'Orgânico':
      return { veio_de: 'organico', midia: '' }
    case 'Instagram · DM':
      return { veio_de: 'ig', midia: 'dm' }
    case 'Instagram · Feed':
      return { veio_de: 'ig', midia: 'feed' }
    case 'Instagram · Bio':
      return { veio_de: 'ig', midia: 'link_in_bio' }
    case 'Instagram (orgânico)':
      return { veio_de: 'ig', midia: '' }
    case 'Sem rastreamento':
    case '':
    case undefined:
    case null:
      return { veio_de: '', midia: '' }
    default:
      return { veio_de: String(canal), midia: '' }
  }
}

function dataBr(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Monta o que seria gravado, sem gravar. `existentes` = [{ slug, email, telefone }] do que já está no banco. */
export function planejar(registros, existentes, { agora = new Date() } = {}) {
  const vistos = new Map() // slug -> Set de chaves e:/t:
  const chavesDe = (email, telefone) => {
    const chaves = []
    const e = String(email ?? '').trim().toLowerCase()
    if (e) chaves.push(`e:${e}`)
    const t = ultimos11(telefone)
    if (t.length >= 8) chaves.push(`t:${t}`)
    return chaves
  }
  for (const linha of existentes) {
    if (!linha.slug) continue
    if (!vistos.has(linha.slug)) vistos.set(linha.slug, new Set())
    for (const chave of chavesDe(linha.email, linha.telefone)) vistos.get(linha.slug).add(chave)
  }

  const ordenados = registros
    .filter((r) => r.tipo === 'lead' && ABA_PARA_SLUG[`${r.planilha}||${r.aba}`])
    .sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999'))

  const linhas = []
  const porProjeto = {}
  let repetidos = 0
  let semContato = 0
  for (const r of ordenados) {
    const projeto = classificar(ABA_PARA_SLUG[`${r.planilha}||${r.aba}`])
    const chaves = chavesDe(r.email, r.telefone)
    if (!chaves.length) {
      semContato += 1
      continue
    }
    if (!vistos.has(projeto.slug)) vistos.set(projeto.slug, new Set())
    const jaVistos = vistos.get(projeto.slug)
    if (chaves.some((chave) => jaVistos.has(chave))) {
      repetidos += 1
      continue
    }
    chaves.forEach((chave) => jaVistos.add(chave))

    const email = String(r.email ?? '').trim().toLowerCase()
    const telefone = soDigitos(r.telefone)
    const quando = r.data ? new Date(r.data).toISOString() : agora.toISOString()
    const campanhaNumerica = String(r.campanha ?? '').match(/^ID (\d{10,})$/)?.[1] ?? ''
    linhas.push({
      fonte_id: `planilha:${createHash('sha1').update(`${projeto.slug}|${email}|${ultimos11(telefone)}`).digest('hex').slice(0, 24)}`,
      nome: String(r.nome ?? '').trim(),
      email,
      telefone,
      origem: projeto.origem,
      campanha: campanhaNumerica || String(r.campanha ?? ''),
      campaign_id: campanhaNumerica || null,
      ...canalParaOrigem(r.canal),
      criativo: String(r.criativo ?? ''),
      data: dataBr(quando),
      created_at: quando,
      slug: projeto.slug,
      tipo: projeto.tipo,
      vertente: projeto.vertente,
    })
    porProjeto[projeto.slug] = (porProjeto[projeto.slug] ?? 0) + 1
  }
  return { linhas, porProjeto, lidas: ordenados.length, repetidos, semContato }
}

async function lerBase(env, consultar) {
  const copia = await lerCopia(env, CHAVE_REGISTROS)
  const registros = copia?.dados?.records
  if (!Array.isArray(registros)) return null
  const existentes = (await consultar('select slug, lower(email) as email, telefone from leads where slug is not null')).rows
  return { copia, registros, existentes }
}

/** O que a importação faria agora (para mostrar antes de confirmar) e se já foi feita. */
export async function situacaoDaImportacao(env, { consultar = (texto, params) => query(env, texto, params) } = {}) {
  await garantirEsquemaDeLeads(env)
  const marcador = await lerCopia(env, CHAVE_IMPORTACAO)
  const base = await lerBase(env, consultar)
  if (!base) return { feita: Boolean(marcador), marcador: marcador?.dados ?? null, semCopia: true, pendentes: 0, porProjeto: {} }
  const plano = planejar(base.registros, base.existentes)
  const detalhe = Object.entries(plano.porProjeto).map(([slug, total]) => {
    const projeto = classificar(slug)
    return { slug, grupo: TIPOS[projeto.tipo], nome: projeto.nome, total }
  })
  return {
    feita: Boolean(marcador),
    detalhe,
    marcador: marcador?.dados ?? null,
    semCopia: false,
    copiaDe: base.copia.atualizadoEm,
    pendentes: plano.linhas.length,
    porProjeto: plano.porProjeto,
    lidas: plano.lidas,
    repetidos: plano.repetidos,
  }
}

/** Grava o que falta e registra que a importação foi feita (depois disso a cópia das planilhas deixa de ser atualizada). */
export async function importarHistorico(env, { consultar = (texto, params) => query(env, texto, params) } = {}) {
  await garantirEsquemaDeLeads(env)
  const base = await lerBase(env, consultar)
  if (!base) throw new Error('Não há cópia das planilhas no banco para importar.')
  const plano = planejar(base.registros, base.existentes)

  let inseridos = 0
  for (let i = 0; i < plano.linhas.length; i += LOTE) {
    const lote = plano.linhas.slice(i, i + LOTE)
    const col = (chave) => lote.map((linha) => linha[chave])
    const resultado = await consultar(
      `insert into leads (fonte_id, nome, email, telefone, origem, campanha, campaign_id, veio_de, midia, criativo, data, created_at, slug, tipo, vertente)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::timestamptz[], $13::text[], $14::text[], $15::text[])
       on conflict (fonte_id) do nothing
       returning 1`,
      [col('fonte_id'), col('nome'), col('email'), col('telefone'), col('origem'), col('campanha'), col('campaign_id'), col('veio_de'), col('midia'), col('criativo'), col('data'), col('created_at'), col('slug'), col('tipo'), col('vertente')],
    )
    inseridos += resultado.rowCount ?? 0
  }

  const marcador = { em: new Date().toISOString(), inseridos, porProjeto: plano.porProjeto, repetidos: plano.repetidos }
  await gravarCopia(env, CHAVE_IMPORTACAO, marcador)
  return marcador
}
