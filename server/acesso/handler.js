import { query } from '../db.js'
import { readRequestBody } from '../readBody.js'
import { isAdmin } from '../roles.js'
import { ASSUNTO_BOAS_VINDAS, modoAcesso, textoAcessoManual } from './motor.js'
import { carregarTemplate, enviarEmail, enviarWhatsapp, renderizar } from './integracoes.js'
import { nomeDoCurso, telefoneWhatsapp, whatsappValido } from './regras.js'
import { normalizarEvento } from './hotmart.js'
import { rodarAgora } from './scheduler.js'
import { configuracaoFaltando, verificarConexoes } from './verificacao.js'
import { emailsDaPessoa, emailsDoTipo, painelEmails } from '../emails/painel.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

/** Acesso criado na mão na plataforma: fecha o evento como feito, guardando que foi manual. */
function resolverEventoManual(env, id) {
  return query(
    env,
    `update hotmart_eventos
        set estado = 'ok', erro = null, processado_em = now(),
            passos = coalesce(passos, '{}'::jsonb) || jsonb_build_object('acesso_manual', jsonb_build_object('ok', true, 'em', now()))
      where id = $1 and estado in ('erro', 'falhou', 'atencao')`,
    [id],
  )
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
 *   GET  /api/acessos/emails?dias=30   (painel dos e-mails: gráficos por e-mail e lista dos enviados)
 *   GET  /api/acessos/emails/tipo?tipo=&dias=   (todos os e-mails de um tipo e para quem foram)
 *   GET  /api/acessos/emails/pessoa?email=      (e-mails de uma pessoa, para a linha do tempo dela)
 *   POST /api/acessos/verificar   { emailTeste? }  (confere as chaves; com e-mail, manda 1 e-mail e 1 WhatsApp de teste)
 *   POST /api/acessos/eventos/:id/reprocessar
 *   POST /api/acessos/eventos/:id/resolver-manual  (acesso criado na mão: tira a venda da lista de problemas)
 *   POST /api/acessos/reenviar-boas-vindas  { email }  (manda de novo o e-mail de login e senha)
 *   POST /api/acessos/eventos/:id/avisar-manual { senha, telefone? }  (acesso criado na mão: manda e-mail e WhatsApp com a senha)
 *   POST /api/acessos/lista/:id/bloqueio-feito   (marca "já inativei na plataforma")
 *   POST /api/acessos/lista/:id/reativacao-feita (marca "já reativei na plataforma")
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
      if (estado === 'problemas') {
        filtros.push(`estado in ('erro', 'falhou', 'atencao')`)
      } else if (estado && estado !== 'todos') {
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

    if (req.method === 'GET' && caminho === '/api/acessos/emails/tipo') {
      const dias = Math.min(90, Math.max(7, Number(url.searchParams.get('dias')) || 30))
      const lista = await emailsDoTipo((texto, params) => query(env, texto, params), String(url.searchParams.get('tipo') ?? ''), { dias })
      return sendJson(res, 200, { lista })
    }

    if (req.method === 'GET' && caminho === '/api/acessos/emails/pessoa') {
      const lista = await emailsDaPessoa((texto, params) => query(env, texto, params), url.searchParams.get('email'))
      return sendJson(res, 200, { lista })
    }

    if (req.method === 'GET' && caminho === '/api/acessos/emails') {
      const dias = Math.min(90, Math.max(7, Number(url.searchParams.get('dias')) || 30))
      return sendJson(res, 200, await painelEmails(env, { dias }))
    }

    if (req.method === 'GET' && caminho === '/api/acessos/lista') {
      const { rows } = await query(env, `select * from acessos order by (origem = 'dash') desc, liberado_ate asc nulls last limit 1000`)
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
          origem: linha.origem,
          parcelado: linha.parcelado,
          pagoAte: linha.pago_ate,
          plataformaId: linha.plataforma_id,
        })),
      })
    }

    if (req.method === 'POST' && caminho === '/api/acessos/verificar') {
      if (!isAdmin(user)) return sendJson(res, 403, { error: 'Só admin.' })
      const corpo = JSON.parse((await readRequestBody(req)) || '{}')
      const emailTeste = String(corpo.emailTeste ?? '').trim()
      return sendJson(res, 200, await verificarConexoes(env, { emailTeste }))
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

    // Compra sem CPF: o acesso foi criado na mão na plataforma, aqui só mandamos o e-mail e o WhatsApp com a senha provisória.
    const avisarManual = /^\/api\/acessos\/eventos\/(\d+)\/avisar-manual$/.exec(caminho)
    if (req.method === 'POST' && avisarManual) {
      if (!isAdmin(user)) return sendJson(res, 403, { error: 'Só admin.' })
      const corpo = JSON.parse((await readRequestBody(req)) || '{}')
      const senha = String(corpo.senha ?? '').trim()
      if (!senha) return sendJson(res, 400, { error: 'Informe a senha provisória.' })
      const { rows } = await query(env, 'select payload from hotmart_eventos where id = $1', [Number(avisarManual[1])])
      if (!rows[0]) return sendJson(res, 404, { error: 'Evento não encontrado.' })
      const venda = normalizarEvento(rows[0].payload)
      const telefoneInformado = String(corpo.telefone ?? '').trim()
      const telefone = telefoneInformado ? telefoneWhatsapp(telefoneInformado, '') : telefoneWhatsapp(venda.telefoneBruto, venda.pais)
      const curso = nomeDoCurso(venda)
      const nome = venda.primeiroNome || venda.nome

      const resultado = {}
      try {
        const modelo = await carregarTemplate('boas-vindas')
        const html = renderizar(modelo, { nome: venda.nome, email: venda.email, documento: senha })
        await enviarEmail(env, { para: venda.email, nomePara: venda.nome, assunto: ASSUNTO_BOAS_VINDAS, html })
        resultado.email = { ok: true }
      } catch (erro) {
        resultado.email = { ok: false, erro: erro.message }
      }
      resultado.telefone = telefone
      if (!whatsappValido(telefone)) {
        resultado.whatsapp = { ok: false, erro: telefone ? `Número "${telefone}" não parece um WhatsApp válido.` : 'A compra não trouxe telefone.' }
      } else {
        try {
          await enviarWhatsapp(env, { conta: 'aluno', numero: telefone, texto: textoAcessoManual(nome, curso, venda.email, senha) })
          resultado.whatsapp = { ok: true }
        } catch (erro) {
          resultado.whatsapp = { ok: false, erro: erro.message }
        }
      }
      // Mandou o e-mail: a venda deixa de "precisar de atenção" (o acesso já foi criado na mão na plataforma).
      if (resultado.email.ok) await resolverEventoManual(env, Number(avisarManual[1]))
      return sendJson(res, 200, resultado)
    }

    // Reenvio do e-mail de boas-vindas (login e senha) para quem já tem acesso. A senha é o documento guardado na compra.
    if (req.method === 'POST' && caminho === '/api/acessos/reenviar-boas-vindas') {
      if (!isAdmin(user)) return sendJson(res, 403, { error: 'Só admin.' })
      const corpo = JSON.parse((await readRequestBody(req)) || '{}')
      const email = String(corpo.email ?? '').trim().toLowerCase()
      if (!email) return sendJson(res, 400, { error: 'Informe o e-mail da pessoa.' })
      let nome = ''
      let documento = ''
      const { rows: acessos } = await query(
        env,
        `select nome, documento from acessos where lower(email) = $1 and coalesce(documento, '') <> '' order by atualizado_em desc limit 1`,
        [email],
      )
      if (acessos[0]) {
        nome = acessos[0].nome ?? ''
        documento = acessos[0].documento ?? ''
      } else {
        const { rows: eventos } = await query(env, `select payload from hotmart_eventos where lower(email) = $1 order by recebido_em desc limit 20`, [email])
        for (const linha of eventos) {
          const venda = normalizarEvento(linha.payload)
          if (venda.documento) {
            nome = venda.nome
            documento = venda.documento
            break
          }
        }
      }
      if (!documento) return sendJson(res, 404, { error: 'Não achei o CPF/documento desta pessoa (a senha do acesso). Use "Enviar acesso manual" na compra.' })
      try {
        const modelo = await carregarTemplate('boas-vindas')
        const html = renderizar(modelo, { nome, email, documento })
        await enviarEmail(env, { para: email, nomePara: nome, assunto: ASSUNTO_BOAS_VINDAS, html })
        return sendJson(res, 200, { ok: true })
      } catch (erro) {
        return sendJson(res, 502, { error: `Não consegui enviar o e-mail: ${erro.message}` })
      }
    }

    const resolverManual = /^\/api\/acessos\/eventos\/(\d+)\/resolver-manual$/.exec(caminho)
    if (req.method === 'POST' && resolverManual) {
      if (!isAdmin(user)) return sendJson(res, 403, { error: 'Só admin.' })
      const { rowCount } = await resolverEventoManual(env, Number(resolverManual[1]))
      if (!rowCount) return sendJson(res, 409, { error: 'Só dá para resolver evento com erro, falha ou atenção.' })
      return sendJson(res, 200, { ok: true })
    }

    const reativacaoFeita =/^\/api\/acessos\/lista\/(\d+)\/reativacao-feita$/.exec(caminho)
    if (req.method === 'POST' && reativacaoFeita) {
      if (!isAdmin(user)) return sendJson(res, 403, { error: 'Só admin.' })
      const { rowCount } = await query(
        env,
        `update acessos set status = 'ativo', bloqueado_em = null, atualizado_em = now() where id = $1 and status = 'reativar_pendente'`,
        [Number(reativacaoFeita[1])],
      )
      if (!rowCount) return sendJson(res, 409, { error: 'Esse acesso não está aguardando reativação.' })
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
