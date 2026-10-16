import { query } from '../db.js'
import { isAdmin } from '../roles.js'
import { modoAcesso } from './motor.js'
import { normalizarEvento } from './hotmart.js'
import { rodarAgora } from './scheduler.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

// Variáveis que o modo "ativo" precisa. Falta alguma → o painel mostra o que falta em vez de falhar em silêncio.
const CONFIG_OBRIGATORIA = {
  HOTMART_HOTTOK: 'Token do webhook da Hotmart',
  TEKWAY_LIBERAR_URL: 'Endereço do liberar-curso da plataforma',
  TEKWAY_TOKEN: 'Token da plataforma de cursos',
  BREVO_API_KEY: 'Chave da Brevo (e-mail)',
  BREVO_REMETENTE_EMAIL: 'E-mail remetente na Brevo',
  EVOLUTION_URL: 'Endereço da Evolution (WhatsApp)',
  EVOLUTION_ALUNO_INSTANCIA: 'Instância do WhatsApp que fala com o aluno',
  EVOLUTION_ALUNO_APIKEY: 'Chave da instância do aluno',
  EVOLUTION_EQUIPE_INSTANCIA: 'Instância do WhatsApp dos avisos à equipe',
  EVOLUTION_EQUIPE_APIKEY: 'Chave da instância dos avisos',
  ACESSO_AVISO_NUMERO: 'Número da equipe que recebe os avisos',
}
const CONFIG_OPCIONAL = { TEKWAY_BLOQUEAR_URL: 'Endereço do bloqueio de acesso (sem ele, o bloqueio é manual)' }

export function configuracaoFaltando(env) {
  const vazio = (nome) => !String(env[nome] ?? '').trim()
  return {
    obrigatorias: Object.entries(CONFIG_OBRIGATORIA).filter(([nome]) => vazio(nome)).map(([nome, descricao]) => ({ nome, descricao })),
    opcionais: Object.entries(CONFIG_OPCIONAL).filter(([nome]) => vazio(nome)).map(([nome, descricao]) => ({ nome, descricao })),
  }
}

function eventoParaApi(linha) {
  const venda = normalizarEvento(linha.payload)
  const passos = linha.passos ?? {}
  const plano = passos._plano ?? null
  const etapas = Object.entries(passos)
    .filter(([nome]) => !nome.startsWith('_'))
    .map(([nome, info]) => ({ nome, ok: Boolean(info?.ok), simulado: Boolean(info?.simulado), pulado: info?.pulado ?? null, erro: info?.erro ?? null, em: info?.em ?? null }))
  return {
    id: Number(linha.id),
    eventId: linha.event_id,
    evento: linha.evento,
    estado: linha.estado,
    decisao: linha.decisao,
    simulado: linha.simulado,
    nome: linha.nome,
    email: linha.email,
    curso: linha.curso,
    pagamentoTipo: venda.pagamentoTipo || null,
    plano: venda.plano || null,
    recorrencia: venda.recorrencia,
    dias: plano?.dias ?? null,
    previstos: plano?.passos ?? [],
    etapas,
    tentativas: linha.tentativas,
    proximaTentativa: linha.proxima_tentativa,
    erro: linha.erro,
    recebidoEm: linha.recebido_em,
    processadoEm: linha.processado_em,
  }
}

/**
 * /api/acessos/* — painel da liberação de acesso (só admin, ver canAccessApi).
 *   GET  /api/acessos/resumo
 *   GET  /api/acessos/eventos?estado=&busca=&limite=
 *   GET  /api/acessos/lista
 *   POST /api/acessos/eventos/:id/reprocessar
 *   POST /api/acessos/lista/:id/bloqueio-feito
 */
export async function handleAcessosRequest(req, res, env, user) {
  const url = new URL(req.url, 'http://localhost')
  const caminho = url.pathname.replace(/\/+$/, '')

  try {
    if (req.method === 'GET' && caminho === '/api/acessos/resumo') {
      const contagem = await query(env, `select estado, count(*)::int n from hotmart_eventos group by 1`)
      const porEstado = Object.fromEntries(contagem.rows.map((linha) => [linha.estado, linha.n]))
      const acessos = await query(env, `select status, count(*)::int n from acessos group by 1`)
      const ultimo = await query(env, `select max(recebido_em) ultimo from hotmart_eventos where estado <> 'ignorado'`)
      return sendJson(res, 200, {
        modo: modoAcesso(env),
        porEstado,
        acessosPorStatus: Object.fromEntries(acessos.rows.map((linha) => [linha.status, linha.n])),
        ultimoEventoEm: ultimo.rows[0]?.ultimo ?? null,
        configuracao: configuracaoFaltando(env),
      })
    }

    if (req.method === 'GET' && caminho === '/api/acessos/eventos') {
      const estado = url.searchParams.get('estado')
      const busca = (url.searchParams.get('busca') ?? '').trim().toLowerCase()
      const limite = Math.min(200, Math.max(1, Number(url.searchParams.get('limite')) || 60))
      const filtros = []
      const valores = []
      if (estado && estado !== 'todos') {
        valores.push(estado)
        filtros.push(`estado = $${valores.length}`)
      } else {
        filtros.push(`estado <> 'ignorado'`)
      }
      if (busca) {
        valores.push(`%${busca}%`)
        filtros.push(`(lower(email) like $${valores.length} or lower(nome) like $${valores.length} or transacao like $${valores.length})`)
      }
      valores.push(limite)
      const { rows } = await query(env, `select * from hotmart_eventos where ${filtros.join(' and ')} order by recebido_em desc limit $${valores.length}`, valores)
      return sendJson(res, 200, { eventos: rows.map(eventoParaApi) })
    }

    if (req.method === 'GET' && caminho === '/api/acessos/lista') {
      const { rows } = await query(env, `select * from acessos order by atualizado_em desc limit 300`)
      return sendJson(res, 200, {
        acessos: rows.map((linha) => ({
          id: Number(linha.id),
          email: linha.email,
          nome: linha.nome,
          telefone: linha.telefone,
          curso: linha.curso,
          plano: linha.plano,
          pagamentoTipo: linha.pagamento_tipo,
          status: linha.status,
          diasRegra: linha.dias_regra,
          liberadoAte: linha.liberado_ate,
          parcelasPagas: linha.parcelas_pagas,
          atrasoDesde: linha.atraso_desde,
          bloquearEm: linha.bloquear_em,
          bloqueadoEm: linha.bloqueado_em,
          bloqueioErro: linha.bloqueio_erro,
          ultimaLiberacaoEm: linha.ultima_liberacao_em,
        })),
      })
    }

    const reprocessar = /^\/api\/acessos\/eventos\/(\d+)\/reprocessar$/.exec(caminho)
    if (req.method === 'POST' && reprocessar) {
      if (!isAdmin(user)) return sendJson(res, 403, { error: 'Só admin.' })
      const { rowCount } = await query(
        env,
        `update hotmart_eventos set estado = 'novo', tentativas = 0, proxima_tentativa = now(), erro = null
          where id = $1 and estado in ('erro', 'falhou', 'atencao')`,
        [Number(reprocessar[1])],
      )
      if (!rowCount) return sendJson(res, 409, { error: 'Só dá para reprocessar evento com erro, falha ou atenção.' })
      setImmediate(() => void rodarAgora(env))
      return sendJson(res, 200, { ok: true })
    }

    const bloqueioFeito = /^\/api\/acessos\/lista\/(\d+)\/bloqueio-feito$/.exec(caminho)
    if (req.method === 'POST' && bloqueioFeito) {
      if (!isAdmin(user)) return sendJson(res, 403, { error: 'Só admin.' })
      const { rowCount } = await query(
        env,
        `update acessos set status = 'bloqueado', bloqueado_em = now(), atualizado_em = now() where id = $1 and status = 'bloqueio_pendente'`,
        [Number(bloqueioFeito[1])],
      )
      if (!rowCount) return sendJson(res, 409, { error: 'Esse acesso não está aguardando bloqueio manual.' })
      return sendJson(res, 200, { ok: true })
    }

    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  } catch (error) {
    if (error?.code === '42P01' || error?.code === '42703') {
      return sendJson(res, 503, { error: 'Migração pendente: rode o bloco "Liberação de acesso" de db/schema.sql.', code: 'MIGRATION' })
    }
    console.error('[acessos]', error)
    return sendJson(res, 500, { error: error.message || 'Erro no painel de acessos.' })
  }
}
