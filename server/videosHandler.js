import { comCache } from './cacheCurto.js'
import { TRACKING_SHEET_ID, loadExtraBuyers } from './hotmartEvents.js'
import { csvToObjects, fetchSheetQueryCsv } from './sheetsCsv.js'
import { calcularMetricasVideo } from './videosMetrics.js'
import {
  MAX_TRAVA_SEGUNDOS,
  PAGINAS,
  padraoDe,
  ConfigInvalida,
  gravarConfig,
  gravarPaginas,
  lerConfig,
  lerPaginas,
  paginaValida,
  sanitizarConfig,
  sanitizarPagina,
  videoValido,
} from './playerConfig.js'
import { readRequestBody } from './readBody.js'

// Só as linhas de vídeo e de visita da aba "Eventos (todos)" (coluna B = evento): o Google filtra do lado dele,
// em vez de baixar as ~5.500 linhas e 61 colunas a cada leitura.
const ABA_EVENTOS = 'Eventos (todos)'
const CONSULTA = "select * where B starts with 'video_' or B = 'visita'"
const CACHE_MS = 5 * 60_000
const PERIODOS = new Set([1, 7, 30, 90, 0])

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function lerEventos() {
  return comCache('videos|eventos', CACHE_MS, async () => {
    const csv = await fetchSheetQueryCsv(TRACKING_SHEET_ID, ABA_EVENTOS, CONSULTA)
    return { linhas: csvToObjects(csv), atualizadoEm: new Date().toISOString() }
  })
}

/**
 * GET /api/videos/config?video=vsl — configuração do player + o padrão (para o painel "Restaurar padrão").
 * PUT /api/videos/config?video=vsl — grava (só administrador: a trava de escrita está no middleware).
 */
async function handleConfigRequest(req, res, env, user, url) {
  const video = url.searchParams.get('video') ?? 'vsl'
  if (!videoValido(video)) return sendJson(res, 400, { error: 'Vídeo inválido.' })

  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, { success: true, video, padrao: padraoDe(video), ...(await lerConfig(env, video)) })
    }
    if (req.method === 'PUT') {
      let corpo
      try {
        corpo = JSON.parse(await readRequestBody(req))
      } catch {
        return sendJson(res, 400, { error: 'Corpo inválido.' })
      }
      const config = sanitizarConfig(corpo?.config)
      const estado = await lerConfig(env, video)
      if (estado.precisaMigracao) {
        return sendJson(res, 409, { error: 'Falta criar a tabela video_config no banco (veja db/schema.sql).', code: 'MIGRACAO' })
      }
      await gravarConfig(env, video, config, user?.email)
      return sendJson(res, 200, { success: true, video, padrao: padraoDe(video), ...(await lerConfig(env, video)) })
    }
    return sendJson(res, 405, { error: 'Método não permitido.' })
  } catch (error) {
    if (error instanceof ConfigInvalida) return sendJson(res, 400, { error: error.message })
    console.error('Erro na configuração do player:', error.message || error)
    return sendJson(res, 502, { error: 'Não consegui acessar a configuração do player agora.' })
  }
}

/**
 * GET /api/videos/paginas — tempo da trava inicial de cada página de venda (+ o padrão de cada uma).
 * PUT /api/videos/paginas { paginas: { essentials: { travaSegundos }, ... } } — grava (só administrador, trava no middleware).
 */
async function handlePaginasRequest(req, res, env, user) {
  const resposta = async () => ({ success: true, padroes: PAGINAS, maximo: MAX_TRAVA_SEGUNDOS, ...(await lerPaginas(env)) })
  try {
    if (req.method === 'GET') return sendJson(res, 200, await resposta())
    if (req.method === 'PUT') {
      let corpo
      try {
        corpo = JSON.parse(await readRequestBody(req))
      } catch {
        return sendJson(res, 400, { error: 'Corpo inválido.' })
      }
      const novas = {}
      for (const [pagina, config] of Object.entries(corpo?.paginas ?? {})) {
        if (!paginaValida(pagina)) return sendJson(res, 400, { error: `Página desconhecida: ${String(pagina).slice(0, 30)}.` })
        novas[pagina] = sanitizarPagina(config, pagina)
      }
      if (!Object.keys(novas).length) return sendJson(res, 400, { error: 'Nada para salvar.' })
      const estado = await lerPaginas(env)
      if (estado.precisaMigracao) return sendJson(res, 409, { error: 'Falta criar a tabela video_config no banco (veja db/schema.sql).', code: 'MIGRACAO' })
      await gravarPaginas(env, novas, user?.email)
      return sendJson(res, 200, await resposta())
    }
    return sendJson(res, 405, { error: 'Método não permitido.' })
  } catch (error) {
    if (error instanceof ConfigInvalida) return sendJson(res, 400, { error: error.message })
    console.error('Erro na configuração das páginas:', error.message || error)
    return sendJson(res, 502, { error: 'Não consegui acessar a configuração das páginas agora.' })
  }
}

/** GET /api/videos?dias=30&video=vsl — métricas de reprodução dos vídeos das páginas de venda. */
export async function handleVideosRequest(req, res, env, user) {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/api/videos/config') return handleConfigRequest(req, res, env, user, url)
  if (url.pathname === '/api/videos/paginas') return handlePaginasRequest(req, res, env, user)
  if (url.pathname !== '/api/videos') return sendJson(res, 404, { error: 'Rota não encontrada.' })
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido.' })

  const dias = Number(url.searchParams.get('dias') ?? 30)
  const video = (url.searchParams.get('video') ?? 'vsl').trim().slice(0, 60) || 'vsl'
  if (!PERIODOS.has(dias)) return sendJson(res, 400, { error: 'Período inválido. Use 1 (hoje), 7, 30, 90 ou 0 (tudo).' })

  try {
    const { linhas, atualizadoEm } = await lerEventos()
    // Quem já comprou (e-mails): só serve para cruzar com quem se identificou; nunca vai para a tela.
    const compradores = new Set((await loadExtraBuyers(env)).map((c) => c.email).filter(Boolean))
    return sendJson(res, 200, { success: true, atualizadoEm, ...calcularMetricasVideo(linhas, { video, dias, compradores }) })
  } catch (error) {
    console.error('Erro ao ler os eventos de vídeo:', error.message || error)
    return sendJson(res, 502, { error: 'Não consegui ler a planilha de eventos agora. Tente de novo em instantes.' })
  }
}
