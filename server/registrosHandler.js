// Tela Registros: todos os cadastros do dash, agrupados por tipo (Essentials, Workshops, Mentoria particular) e por
// projeto (slug). Tudo vem do banco: as planilhas do Google não são mais lidas aqui (só o importador do histórico usa).
// Os eventos da Hotmart (venda, Pix/boleto, carrinho...) entram como um grupo à parte.

import { query } from './db.js'
import { readRequestBody } from './readBody.js'
import { rotuloDoEvento, loadExtraBuyers, loadHotmartEvents } from './hotmartEvents.js'
import { ApagarInvalido, apagarPessoa, ocultarApagados } from './registrosApagados.js'
import { importarHistorico, situacaoDaImportacao } from './importarPlanilhas.js'
import { cleanEmail, registroDeEvento, resolveCampaign, resolveChannel } from './registrosUtil.js'
import { PROJETOS, TIPOS, classificar } from './projetos/catalogo.js'
import { garantirEsquemaDeLeads } from './projetos/esquema.js'

const GRUPO_HOTMART = 'Hotmart'
const ABAS_HOTMART = [
  { nome: 'Vendas aprovadas', categoria: 'venda' },
  { nome: 'Boleto e Pix gerados', categoria: 'pix_boleto' },
  { nome: 'Carrinho abandonado', categoria: 'abandono' },
  { nome: 'Cancelamentos e atrasos', categoria: 'cancelamento' },
  { nome: 'Reembolsos e chargebacks', categoria: 'reembolso' },
]

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

const ultimos11 = (telefone) => String(telefone ?? '').replace(/\D/g, '').slice(-11)

/**
 * Leads do banco -> registros da tela. Quem aparece duas vezes no MESMO projeto (mesmo e-mail ou telefone, ex.: cadastros
 * que o site mandou duas vezes) conta uma vez só; o mais antigo vale. Nada é apagado do banco.
 */
export function registrosDosLeads(linhas) {
  const vistos = new Map() // slug -> Set
  const records = []
  const contagem = new Map() // slug -> { projeto, total }

  for (const linha of linhas) {
    const projeto = classificar(linha.slug || linha.origem)
    const email = cleanEmail(String(linha.email ?? ''))
    const tel = ultimos11(linha.telefone)
    const chaves = [email && `e:${email}`, tel.length >= 8 && `t:${tel}`].filter(Boolean)
    if (!vistos.has(projeto.slug)) vistos.set(projeto.slug, new Set())
    const jaVistos = vistos.get(projeto.slug)
    if (chaves.length && chaves.some((chave) => jaVistos.has(chave))) continue
    chaves.forEach((chave) => jaVistos.add(chave))

    const campanha = resolveCampaign(linha.campanha ?? '')
    records.push({
      planilha: TIPOS[projeto.tipo] ?? TIPOS.outros,
      aba: projeto.nome,
      tipo: 'lead',
      nome: linha.nome ?? '',
      email,
      telefone: linha.telefone ?? '',
      data: new Date(linha.created_at).toISOString(),
      canal: resolveChannel(linha.veio_de ?? '', linha.midia ?? '', campanha),
      campanha,
      criativo: linha.criativo ?? '',
    })
    contagem.set(projeto.slug, { projeto, total: (contagem.get(projeto.slug)?.total ?? 0) + 1 })
  }

  // Ordem: o catálogo (Essentials, Workshops, Mentoria), depois o que não está nele.
  const ordem = new Map(PROJETOS.map((projeto, indice) => [projeto.slug, indice]))
  const tabs = [...contagem.values()]
    .sort((a, b) => (ordem.get(a.projeto.slug) ?? 999) - (ordem.get(b.projeto.slug) ?? 999))
    .map(({ projeto, total }) => ({
      planilha: TIPOS[projeto.tipo] ?? TIPOS.outros,
      aba: projeto.nome,
      tipo: 'lead',
      url: '',
      slug: projeto.slug,
      count: total,
      error: null,
    }))
  return { tabs, records }
}

/**
 * Compras da Hotmart com identificação de vertente (a página de origem vai em campanha/src: "live", "essentials_live",
 * "membros"...) viram registros do projeto certo (Essentials · Live / Membros), no mesmo formato dos leads.
 * Quem já está no projeto (como lead, mesmo e-mail ou telefone) não conta duas vezes.
 */
export function comprasComoLeads(compras) {
  const linhas = []
  for (const compra of compras) {
    const identificacao = `${compra.campanha ?? ''} ${compra.src ?? ''}`
    const slug = /membros/i.test(identificacao) ? 'essentials-membros' : /live/i.test(identificacao) ? 'essentials-live' : null
    if (!slug) continue
    linhas.push({
      nome: compra.nome,
      email: compra.email,
      telefone: compra.telefone,
      origem: classificar(slug).origem,
      slug,
      campanha: compra.campanha ?? '',
      midia: '',
      veio_de: 'Compra (Hotmart)',
      criativo: '',
      created_at: compra.created_at,
    })
  }
  return linhas
}

const DOIS_DIAS_MS = 2 * 24 * 3600 * 1000
const chavesDaPessoa = (email, telefone) => {
  const e = String(email ?? '').trim().toLowerCase()
  const t = ultimos11(telefone)
  return [e && `e:${e}`, t.length >= 8 && `t:${t}`].filter(Boolean)
}

/**
 * Compras do dash (tabela purchases) como "Vendas aprovadas". Os eventos da Hotmart só existem desde que o tracking
 * começou (08/10); quem comprou antes está só nas compras e ficava sem o selo "Comprou" e sem histórico de compra.
 * Só entra a compra que NÃO tem uma venda da Hotmart da mesma pessoa em até 2 dias (para não contar a mesma venda duas vezes).
 */
export function comprasComoVendas(compras, vendasDaHotmart) {
  const vendas = new Map() // chave da pessoa -> horários das vendas já registradas
  for (const venda of vendasDaHotmart) {
    const quando = new Date(venda.data).getTime()
    for (const chave of chavesDaPessoa(venda.email, venda.telefone)) vendas.set(chave, [...(vendas.get(chave) ?? []), quando])
  }
  const registros = []
  for (const compra of compras) {
    const quando = new Date(compra.created_at).getTime()
    const chaves = chavesDaPessoa(compra.email, compra.telefone)
    if (!chaves.length) continue
    if (chaves.some((chave) => (vendas.get(chave) ?? []).some((outra) => Math.abs(outra - quando) <= DOIS_DIAS_MS))) continue
    registros.push(
      registroDeEvento(GRUPO_HOTMART, 'Vendas aprovadas', 'evento', {
        nome: compra.nome ?? '',
        email: cleanEmail(String(compra.email ?? '')),
        telefone: compra.telefone ?? '',
        data: new Date(compra.created_at).toISOString(),
        canal: 'Compra (dash)',
        campanha: compra.campanha ?? '',
        categoria: 'venda',
        situacao: '',
        produto: compra.curso ?? '',
        valor: compra.valor === null || compra.valor === undefined ? null : Number(compra.valor),
        pagamento: '',
      }),
    )
  }
  return registros
}

/** Eventos da Hotmart do banco (webhook direto) + histórico já guardado. Se não der para ler, segue só com os leads. */
export async function eventosDaHotmart(env) {
  let eventos
  try {
    await loadExtraBuyers(env).catch(() => [])
    eventos = (await loadHotmartEvents({ env })).events
  } catch (erro) {
    console.error('Erro ao juntar os eventos da Hotmart nos registros:', erro.message || erro)
    return { tabs: [], records: [] }
  }
  const records = ABAS_HOTMART.flatMap((aba) =>
    eventos.filter((evento) => evento.categoria === aba.categoria).map((evento) => registroDeEvento(GRUPO_HOTMART, aba.nome, 'evento', { ...evento, evento: rotuloDoEvento(evento) })),
  )
  const tabs = ABAS_HOTMART.map((aba) => ({
    planilha: GRUPO_HOTMART,
    aba: aba.nome,
    tipo: 'evento',
    url: '',
    count: records.filter((registro) => registro.aba === aba.nome).length,
    error: null,
  }))
  return { tabs, records }
}

/** Tudo o que a tela mostra: leads por projeto + eventos da Hotmart, sem o que a equipe apagou. */
export async function montarRegistros(
  env,
  { consultar = (texto, params) => query(env, texto, params), esquema = garantirEsquemaDeLeads, hotmart = eventosDaHotmart, apagados = ocultarApagados } = {},
) {
  await esquema(env)
  const { rows } = await consultar(
    `select nome, email, telefone, origem, campanha, midia, veio_de, criativo, created_at, slug
       from leads
      order by created_at asc
      limit 50000`,
  )
  // Compras com identificação de vertente (live/membros). Se a leitura falhar, a tela segue só com os leads.
  let compras = []
  try {
    compras = comprasComoLeads((await consultar(
      `select nome, email, telefone, campanha, src, created_at from purchases where campanha ~* '(live|membros)' or src ~* '(live|membros)'`,
    )).rows)
  } catch (erro) {
    console.error('Erro ao juntar as compras nos registros:', erro.message || erro)
  }
  const juntos = [...rows, ...compras].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const leads = registrosDosLeads(juntos)
  const eventos = await hotmart(env)

  // Compras sem venda da Hotmart correspondente (anteriores ao tracking) entram como "Vendas aprovadas".
  let vendasExtras = []
  try {
    const compras = (await consultar(
      `select nome, email, telefone, curso, valor, campanha, created_at from purchases where coalesce(status, 'ativo') <> 'cancelado' order by created_at`,
    )).rows
    vendasExtras = comprasComoVendas(compras, eventos.records.filter((registro) => registro.aba === 'Vendas aprovadas'))
  } catch (erro) {
    console.error('Erro ao juntar as compras como vendas nos registros:', erro.message || erro)
  }
  const tabsDeEventos = vendasExtras.length
    ? eventos.tabs.some((aba) => aba.aba === 'Vendas aprovadas')
      ? eventos.tabs.map((aba) => (aba.aba === 'Vendas aprovadas' ? { ...aba, count: (aba.count ?? 0) + vendasExtras.length } : aba))
      : [...eventos.tabs, { planilha: GRUPO_HOTMART, aba: 'Vendas aprovadas', tipo: 'evento', url: '', count: vendasExtras.length, error: null }]
    : eventos.tabs
  const dados = { tabs: [...leads.tabs, ...tabsDeEventos], records: [...leads.records, ...eventos.records, ...vendasExtras] }
  return apagados(dados, env)
}

export async function handleRegistrosRequest(req, res, env = null) {
  const { pathname } = new URL(req.url, 'http://localhost')

  // Importação única do histórico das planilhas (só admin: a regra está no middleware).
  if (pathname === '/api/registros/importacao') {
    try {
      if (req.method === 'GET') return sendJson(res, 200, { success: true, ...(await situacaoDaImportacao(env)) })
      if (req.method === 'POST') return sendJson(res, 200, { success: true, ...(await importarHistorico(env)) })
      return sendJson(res, 405, { error: 'Método não permitido.' })
    } catch (erro) {
      console.error('Erro na importação das planilhas:', erro.message || erro)
      return sendJson(res, 502, { error: erro.message || 'Não consegui importar agora.' })
    }
  }

  if (pathname !== '/api/registros') {
    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  }

  // Apagar uma pessoa dos registros (só admin). Corpo: { contatos: [{ email, telefone }] }.
  if (req.method === 'DELETE') {
    try {
      const corpo = JSON.parse((await readRequestBody(req, 32 * 1024)) || '{}')
      return sendJson(res, 200, { success: true, ...(await apagarPessoa(env, corpo.contatos)) })
    } catch (erro) {
      if (erro instanceof ApagarInvalido || erro instanceof SyntaxError) return sendJson(res, 400, { error: erro.message })
      console.error('Erro ao apagar o registro:', erro.message || erro)
      return sendJson(res, 502, { error: 'Não consegui apagar agora.' })
    }
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Método não permitido.' })
  }

  try {
    const dados = await montarRegistros(env)
    return sendJson(res, 200, { success: true, fetchedAt: new Date().toISOString(), ...dados })
  } catch (error) {
    console.error('Erro ao buscar registros:', error)
    return sendJson(res, 502, { error: 'Erro ao ler os registros no banco.' })
  }
}
