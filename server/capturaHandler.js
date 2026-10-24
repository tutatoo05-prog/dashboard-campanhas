import { randomUUID } from 'node:crypto'
import { readRequestBody } from './readBody.js'
import { query } from './db.js'
import { getClientIp } from './security.js'

// Recebe o cadastro dos formulários do site (PÚBLICO, sem login) e grava direto na tabela leads do dash.
// Substitui o fluxo do n8n (webhook -> Google Sheets -> Supabase): aqui o banco é o primeiro e único passo
// obrigatório, então a planilha do Google (cheia, sem permissão, fora do ar) não consegue mais derrubar o cadastro.

const ORIGENS_PADRAO = ['https://tuzinho.academy', 'https://www.tuzinho.academy', 'https://tuzinho.app', 'https://www.tuzinho.app']

/** evento que a página manda (data-evento) -> origem mostrada na tela Leads. Evento novo vira o próprio nome com "_". */
const EVENTO_PARA_ORIGEM = {
  'irezumi-oriental': 'workshop_irezumi_1',
}

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

export function origemDoEvento(evento) {
  const limpo = texto(evento, 80).toLowerCase()
  if (!limpo) return 'site'
  return EVENTO_PARA_ORIGEM[limpo] ?? limpo.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export class CapturaInvalida extends Error {}

/** Valida e normaliza o corpo do formulário. Devolve a linha pronta para a tabela leads. */
export function montarLead(corpo, agora = new Date()) {
  const nome = texto(corpo?.nome ?? corpo?.name, 120)
  const email = texto(corpo?.email, 160).toLowerCase()
  const telefone = soDigitos(corpo?.telefone ?? corpo?.phone)

  if (nome.length < 2) throw new CapturaInvalida('Informe o nome.')
  if (telefone.length < 10 || telefone.length > 15) throw new CapturaInvalida('Informe um WhatsApp válido.')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new CapturaInvalida('E-mail inválido.')

  // O site manda o utm_* (nome da campanha, mídia...) tanto soltos quanto na URL de entrada; vale o que vier solto,
  // senão o que está na URL (alguns navegadores embutidos tiram os campos mas mantêm o link).
  let daUrl = new URLSearchParams()
  try {
    daUrl = new URL(texto(corpo?.landing_url, 2000)).searchParams
  } catch {
    /* sem URL válida: só os campos soltos */
  }
  const utm = (chave) => texto(corpo?.[chave] || daUrl.get(chave), 200)

  const conteudo = utm('utm_content')
  const conteudoEId = NUMERIC_ID.test(conteudo)
  const idCampanha = utm('utm_id') || texto(corpo?.campaign_id, 40)

  return {
    fonte_id: `captura:${randomUUID()}`,
    nome,
    email,
    telefone,
    origem: origemDoEvento(corpo?.evento),
    campanha: utm('utm_campaign'),
    campaign_id: NUMERIC_ID.test(idCampanha) ? idCampanha : null,
    midia: utm('utm_medium'),
    veio_de: utm('utm_source'),
    criativo: texto(corpo?.criativo, 200) || (conteudoEId ? '' : conteudo),
    ad_id: texto(corpo?.ad_id, 40) || (conteudoEId ? conteudo : ''),
    landing_url: texto(corpo?.landing_url, 2000),
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
      where origem = $1
        and (regexp_replace(telefone, '\\D', '', 'g') = $2 or ($3 <> '' and lower(email) = $3))
      limit 1`,
    [lead.origem, lead.telefone, lead.email],
  )
  if (existente.rowCount) return { status: 'duplicado' }

  await consultar(
    env,
    `insert into leads (fonte_id, nome, email, telefone, origem, campanha, campaign_id, midia, veio_de, criativo, ad_id, landing_url, data, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      lead.fonte_id, lead.nome, lead.email, lead.telefone, lead.origem, lead.campanha, lead.campaign_id, lead.midia,
      lead.veio_de, lead.criativo, lead.ad_id, lead.landing_url, lead.data, lead.created_at,
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
export async function handleCapturaRequest(req, res, env, { consultar = query } = {}) {
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
  if (pathname !== '/api/captura') return responder(res, 404, { status: 'error', message: 'Rota não encontrada.' }, cors)
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
      const resultado = await registrarLead(env, lead, consultar)
      if (resultado.status === 'ok') {
        contadores.gravados += 1
        contadores.ultimoGravadoEm = new Date().toISOString()
        console.log(`[captura] ${lead.origem} ${lead.telefone.slice(0, 4)}… gravado`)
      } else {
        contadores.duplicados += 1
      }
      return responder(res, 200, { status: resultado.status }, cors)
    } catch (erro) {
      console.error(`[captura] falha ao gravar (tentativa ${tentativa}):`, erro?.message || erro)
      contadores.ultimoErro = String(erro?.message || erro).slice(0, 200)
    }
  }
  contadores.falhas += 1
  contadores.ultimaFalhaEm = new Date().toISOString()
  return responder(res, 503, { status: 'error', message: 'Não foi possível gravar agora.' }, cors)
}
