import { randomUUID } from 'node:crypto'
import { readRequestBody } from './readBody.js'
import { query } from './db.js'
import { getClientIp } from './security.js'
import { classificar, normalizar } from './projetos/catalogo.js'
import { parseNascimento } from './leadsSync.js'
import { garantirEsquemaDeLeads } from './projetos/esquema.js'

// Recebe o cadastro dos formulários do site (PÚBLICO, sem login) e grava direto na tabela leads do dash.
// Substitui o fluxo do n8n (webhook -> Google Sheets -> Supabase): aqui o banco é o primeiro e único passo
// obrigatório, então a planilha do Google (cheia, sem permissão, fora do ar) não consegue mais derrubar o cadastro.

const ORIGENS_PADRAO = ['https://tuzinho.academy', 'https://www.tuzinho.academy', 'https://tuzinho.app', 'https://www.tuzinho.app']

const NUMERIC_ID = /^\d{8,}$/
const JANELA_MS = 10 * 60 * 1000
const MAX_POR_JANELA = 40
const MAX_BODY = 32 * 1024

/** @type {Map<string, { count: number, resetAt: number }>} */
const tentativas = new Map()

export function limparLimite() {
  tentativas.clear()
}

/** O que o endpoint viu desde que o app subiu: a tela Monitoramento mostra isso (cadastro com erro é lead perdido). */
const contadores = { gravados: 0, duplicados: 0, invalidos: 0, bloqueados: 0, falhas: 0, ultimoGravadoEm: null, ultimaFalhaEm: null, ultimoErro: null, desde: new Date().toISOString() }

export function estatisticasDaCaptura() {
  return { ...contadores }
}

export function zerarEstatisticasDaCaptura() {
  Object.assign(contadores, { gravados: 0, duplicados: 0, invalidos: 0, bloqueados: 0, falhas: 0, ultimoGravadoEm: null, ultimaFalhaEm: null, ultimoErro: null, desde: new Date().toISOString() })
}

function dentroDoLimite(ip, agora = Date.now()) {
  const atual = tentativas.get(ip)
  if (!atual || agora > atual.resetAt) {
    tentativas.set(ip, { count: 1, resetAt: agora + JANELA_MS })
    return true
  }
  if (atual.count >= MAX_POR_JANELA) return false
  atual.count += 1
  return true
}

const texto = (valor, max = 500) => String(valor ?? '').trim().slice(0, max)
const soDigitos = (valor) => String(valor ?? '').replace(/\D/g, '')

export class CapturaInvalida extends Error {}

/**
 * Slug do projeto. Páginas novas mandam `slug` (ex.: workirezumi). Os formulários do Essentials mandam `product` +
 * `variante` ("live" e "membros" são as vertentes); a mentoria manda só `product`. `evento` é o nome antigo.
 */
export function slugDoCorpo(corpo) {
  if (texto(corpo?.slug)) return corpo.slug
  const produto = normalizar(corpo?.product ?? corpo?.produto)
  if (produto === 'essentials') {
    const variante = normalizar(corpo?.variante)
    if (variante === 'live') return 'essentials-live'
    if (variante === 'membros') return 'essentials-membros'
    return 'essentials'
  }
  return texto(corpo?.product ?? corpo?.produto) || corpo?.evento
}

const FORA_DAS_RESPOSTAS = new Set([
  'nome', 'name', 'email', 'telefone', 'phone', 'whatsapp', 'utm', 'atribuicao', 'website', 'user_agent', 'landing_url',
  'source_url', 'slug', 'evento', 'product', 'produto', 'tipo', 'data_nascimento', 'submitted_at', 'visitor_id',
])

/** O que o formulário perguntou além do contato (ex.: respostas da aplicação da mentoria), guardado como veio. */
function respostasDoCorpo(corpo) {
  const saida = {}
  for (const [chave, valor] of Object.entries(corpo ?? {})) {
    if (FORA_DAS_RESPOSTAS.has(chave) || valor === null || valor === undefined || valor === '') continue
    if (typeof valor === 'object' && !Array.isArray(valor)) continue
    saida[chave] = Array.isArray(valor) ? valor.map((item) => texto(item, 200)).slice(0, 20) : typeof valor === 'string' ? texto(valor, 1000) : valor
  }
  return JSON.stringify(saida).length > 8000 ? {} : saida
}

/** Valida e normaliza o corpo do formulário. Devolve a linha pronta para a tabela leads. */
export function montarLead(corpo, agora = new Date()) {
  const nome = texto(corpo?.nome ?? corpo?.name, 120)
  const email = texto(corpo?.email, 160).toLowerCase()
  const telefone = soDigitos(corpo?.telefone ?? corpo?.phone ?? corpo?.whatsapp)

  if (nome.length < 2) throw new CapturaInvalida('Informe o nome.')
  if (telefone.length < 10 || telefone.length > 15) throw new CapturaInvalida('Informe um WhatsApp válido.')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new CapturaInvalida('E-mail inválido.')

  // O site manda o utm_* (nome da campanha, mídia...) tanto soltos quanto na URL de entrada; vale o que vier solto,
  // senão o que está na URL (alguns navegadores embutidos tiram os campos mas mantêm o link).
  let daUrl = new URLSearchParams()
  try {
    daUrl = new URL(texto(corpo?.landing_url || corpo?.source_url, 2000)).searchParams
  } catch {
    /* sem URL válida: só os campos soltos */
  }
  // Solto no corpo, dentro de `atribuicao` (atribuição salva por 30 dias) ou de `utm` (Essentials/mentoria), ou na URL.
  const utm = (chave) => texto(corpo?.[chave] || corpo?.atribuicao?.[chave] || corpo?.utm?.[chave] || daUrl.get(chave), 200)

  // O slug da página (ex.: workirezumi) manda; "evento" é o nome antigo, aceito para páginas que ainda não foram atualizadas.
  const projeto = classificar(slugDoCorpo(corpo))

  const conteudo = utm('utm_content')
  const conteudoEId = NUMERIC_ID.test(conteudo)
  const idCampanha = utm('utm_id') || texto(corpo?.campaign_id, 40)

  return {
    fonte_id: `captura:${randomUUID()}`,
    nome,
    email,
    telefone,
    origem: projeto.origem,
    slug: projeto.slug,
    tipo: projeto.tipo,
    vertente: projeto.vertente,
    campanha: utm('utm_campaign'),
    campaign_id: NUMERIC_ID.test(idCampanha) ? idCampanha : null,
    midia: utm('utm_medium'),
    veio_de: utm('utm_source'),
    criativo: texto(corpo?.criativo, 200) || (conteudoEId ? '' : conteudo),
    ad_id: texto(corpo?.ad_id, 40) || (conteudoEId ? conteudo : ''),
    landing_url: texto(corpo?.landing_url || corpo?.source_url, 2000),
    data_nascimento: parseNascimento({ data_nascimento: corpo?.data_nascimento }, agora),
    respostas: respostasDoCorpo(corpo),
    data: agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    created_at: agora.toISOString(),
  }
}

/**
 * Grava o lead (ou diz que já existe). "Já existe" = mesmo telefone ou mesmo e-mail na mesma origem.
 * `consultar` é injetável para os testes.
 */
export async function registrarLead(env, lead, consultar = query) {
  const existente = await consultar(
    env,
    `select 1 from leads
      where slug = $1
        and (right(regexp_replace(telefone, '\\D', '', 'g'), 11) = right($2, 11) or ($3 <> '' and lower(email) = $3))
      limit 1`,
    [lead.slug, lead.telefone, lead.email],
  )
  if (existente.rowCount) return { status: 'duplicado' }

  await consultar(
    env,
    `insert into leads (fonte_id, nome, email, telefone, origem, campanha, campaign_id, midia, veio_de, criativo, ad_id, landing_url, data, created_at, slug, tipo, vertente, data_nascimento, respostas)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb)`,
    [
      lead.fonte_id, lead.nome, lead.email, lead.telefone, lead.origem, lead.campanha, lead.campaign_id, lead.midia,
      lead.veio_de, lead.criativo, lead.ad_id, lead.landing_url, lead.data, lead.created_at, lead.slug, lead.tipo, lead.vertente,
      lead.data_nascimento, JSON.stringify(lead.respostas ?? {}),
    ],
  )
  return { status: 'ok' }
}

function origensPermitidas(env) {
  const extras = String(env.CAPTURA_ORIGENS || '').split(',').map((o) => o.trim()).filter(Boolean)
  return new Set([...ORIGENS_PADRAO, ...extras])
}

function responder(res, status, payload, cors) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  for (const [nome, valor] of Object.entries(cors)) res.setHeader(nome, valor)
  res.end(JSON.stringify(payload))
}

/** POST /api/captura — PÚBLICO. Só aceita chamadas vindas dos sites da Tuzinho. */
export async function handleCapturaRequest(req, res, env, { consultar = query, esquema = garantirEsquemaDeLeads } = {}) {
  const origem = req.headers.origin
  const permitidas = origensPermitidas(env)
  const cors = {
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
  if (origem && permitidas.has(origem)) cors['Access-Control-Allow-Origin'] = origem

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    for (const [nome, valor] of Object.entries(cors)) res.setHeader(nome, valor)
    return res.end()
  }

  const { pathname } = new URL(req.url, 'http://localhost')
  const ehExiste = pathname === '/api/captura/existe'
  if (pathname !== '/api/captura' && !ehExiste) return responder(res, 404, { status: 'error', message: 'Rota não encontrada.' }, cors)
  if (req.method !== 'POST') return responder(res, 405, { status: 'error', message: 'Método não permitido.' }, cors)

  // Quem não vem de um site nosso (curl, robô) não passa. Navegador sempre manda o Origin num POST entre sites.
  if (origem && !permitidas.has(origem)) return responder(res, 403, { status: 'error', message: 'Origem não permitida.' }, cors)

  if (!dentroDoLimite(getClientIp(req))) {
    contadores.bloqueados += 1
    return responder(res, 429, { status: 'error', message: 'Muitas tentativas. Aguarde alguns minutos.' }, cors)
  }

  let corpo
  try {
    corpo = JSON.parse((await readRequestBody(req, MAX_BODY)) || '{}')
  } catch {
    return responder(res, 400, { status: 'error', message: 'Corpo inválido.' }, cors)
  }

  // "Esta pessoa já se cadastrou neste projeto?" (a aplicação da mentoria confere antes de enviar).
  if (ehExiste) {
    try {
      await esquema(env)
      const projeto = classificar(slugDoCorpo(corpo))
      const email = texto(corpo?.email, 160).toLowerCase()
      const tel = soDigitos(corpo?.whatsapp ?? corpo?.telefone)
      const achou = await consultar(
        env,
        `select 1 from leads where slug = $1 and (($2 <> '' and lower(email) = $2) or (length($3) >= 10 and right(regexp_replace(telefone, '\\D', '', 'g'), 11) = right($3, 11))) limit 1`,
        [projeto.slug, email, tel],
      )
      return responder(res, 200, { exists: Boolean(achou.rowCount) }, cors)
    } catch (erro) {
      console.error('[captura] falha ao conferir cadastro:', erro?.message || erro)
      return responder(res, 503, { status: 'error', message: 'Não foi possível conferir agora.' }, cors)
    }
  }

  // Só cadastros: eventos de navegação/A-B (tipo diferente de "lead") não são leads e não entram aqui.
  if (corpo?.tipo && corpo.tipo !== 'lead') return responder(res, 200, { status: 'ignorado' }, cors)

  // Campo-isca "website": humano não vê. Preenchido = robô; finge sucesso e não grava.
  if (texto(corpo?.website)) return responder(res, 200, { status: 'ok' }, cors)

  let lead
  try {
    lead = montarLead(corpo)
  } catch (erro) {
    if (erro instanceof CapturaInvalida) contadores.invalidos += 1
    if (erro instanceof CapturaInvalida) return responder(res, 400, { status: 'error', message: erro.message }, cors)
    throw erro
  }

  // Uma segunda tentativa cobre queda passageira de conexão do pooler do banco.
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    try {
      await esquema(env)
      const resultado = await registrarLead(env, lead, consultar)
      if (resultado.status === 'ok') {
        contadores.gravados += 1
        contadores.ultimoGravadoEm = new Date().toISOString()
        console.log(`[captura] ${lead.slug} ${lead.telefone.slice(0, 4)}… gravado`)
      } else {
        contadores.duplicados += 1
      }
      return responder(res, 200, { status: resultado.status, ok: true, duplicate: resultado.status === 'duplicado' }, cors)
    } catch (erro) {
      console.error(`[captura] falha ao gravar (tentativa ${tentativa}):`, erro?.message || erro)
      contadores.ultimoErro = String(erro?.message || erro).slice(0, 200)
    }
  }
  contadores.falhas += 1
  contadores.ultimaFalhaEm = new Date().toISOString()
  return responder(res, 503, { status: 'error', message: 'Não foi possível gravar agora.' }, cors)
}
