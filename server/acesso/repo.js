import { query } from '../db.js'
import { insertBatch, toPurchase } from '../salesSync.js'
import { normalizarEvento } from './hotmart.js'
import { nomeDoCurso } from './regras.js'

/**
 * Acesso ao banco do dash para a liberação de acesso. Mantido separado do motor para o motor ser
 * testado com um repositório de mentira.
 */

const EVENTOS_IGNORADOS_SEM_GRAVAR = new Set([])

/** Grava o evento do webhook. Devolve { id, novo } — repetido (mesmo event_id) volta com novo=false. */
export async function inserirEvento(env, payload, { estadoInicial = 'novo' } = {}) {
  const venda = normalizarEvento(payload)
  if (EVENTOS_IGNORADOS_SEM_GRAVAR.has(venda.evento)) return { id: null, novo: false }
  const inserido = await query(
    env,
    `insert into hotmart_eventos (event_id, evento, transacao, email, nome, curso, payload, estado)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     on conflict (event_id) do nothing
     returning id`,
    [venda.eventId, venda.evento || 'DESCONHECIDO', venda.transacao || null, venda.email || null, venda.nome || null, nomeDoCurso(venda) || null, JSON.stringify(payload), estadoInicial],
  )
  if (inserido.rows[0]) return { id: Number(inserido.rows[0].id), novo: true }
  const existente = await query(env, 'select id from hotmart_eventos where event_id = $1', [venda.eventId])
  return { id: Number(existente.rows[0]?.id ?? 0) || null, novo: false }
}

export function criarRepo(env) {
  const q = (texto, params) => query(env, texto, params)

  return {
    /** Pega o próximo evento pronto (ou um que ficou "processando" por mais de 10 minutos, travado). */
    async reivindicar() {
      const { rows } = await q(
        `update hotmart_eventos
            set estado = 'processando', iniciado_em = now()
          where id = (
            select id from hotmart_eventos
             where (estado in ('novo', 'erro') and proxima_tentativa <= now())
                or (estado = 'processando' and iniciado_em < now() - interval '10 minutes')
             order by proxima_tentativa, id
             limit 1
             for update skip locked
          )
          returning *`,
      )
      const linha = rows[0]
      if (!linha) return null
      return { ...linha, id: Number(linha.id), passos: linha.passos ?? {} }
    },

    /** Atualiza só os campos informados. */
    async salvarProgresso(id, campos) {
      const mapa = {
        estado: 'estado',
        decisao: 'decisao',
        tentativas: 'tentativas',
        proxima: 'proxima_tentativa',
        erro: 'erro',
        simulado: 'simulado',
        processadoEm: 'processado_em',
      }
      const sets = []
      const valores = [id]
      if (campos.passos !== undefined) {
        valores.push(JSON.stringify(campos.passos))
        sets.push(`passos = $${valores.length}::jsonb`)
      }
      for (const [chave, coluna] of Object.entries(mapa)) {
        if (campos[chave] === undefined) continue
        valores.push(campos[chave])
        sets.push(`${coluna} = $${valores.length}`)
      }
      if (!sets.length) return
      await q(`update hotmart_eventos set ${sets.join(', ')} where id = $1`, valores)
    },

    /** Acha o acesso do aluno: primeiro pelo código da assinatura, depois por e-mail e curso. */
    async buscarAcesso({ assinante, email, curso }) {
      if (assinante) {
        const porAssinante = await q('select * from acessos where subscriber_code = $1 order by atualizado_em desc limit 1', [assinante])
        if (porAssinante.rows[0]) return porAssinante.rows[0]
      }
      if (!email) return null
      const { rows } = await q('select * from acessos where email = $1 and curso = $2', [email, curso])
      return rows[0] ?? null
    },

    /** Registra um pagamento que liberou acesso: soma os dias ao fim do acesso e zera qualquer atraso. */
    async registrarPagamento({ email, curso, nome, telefone, documento, plano, pagamentoTipo, assinante, dias, transacao }) {
      const { rows } = await q(
        `insert into acessos (email, curso, nome, telefone, documento, plano, pagamento_tipo, subscriber_code, dias_regra,
                              liberado_ate, status, parcelas_pagas, ultima_transacao, ultima_liberacao_em)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(days => $9), 'ativo', 1, $10, now())
         on conflict (email, curso) do update set
           nome = excluded.nome,
           telefone = coalesce(nullif(excluded.telefone, ''), acessos.telefone),
           documento = coalesce(nullif(excluded.documento, ''), acessos.documento),
           plano = excluded.plano,
           pagamento_tipo = excluded.pagamento_tipo,
           subscriber_code = coalesce(excluded.subscriber_code, acessos.subscriber_code),
           dias_regra = excluded.dias_regra,
           liberado_ate = greatest(coalesce(acessos.liberado_ate, now()), now()) + make_interval(days => excluded.dias_regra),
           status = 'ativo',
           parcelas_pagas = acessos.parcelas_pagas + 1,
           ultima_transacao = excluded.ultima_transacao,
           ultima_liberacao_em = now(),
           atraso_desde = null, bloquear_em = null, bloqueado_em = null,
           bloqueio_tentativas = 0, bloqueio_proxima = null, bloqueio_erro = null,
           atualizado_em = now()
         returning id, liberado_ate, parcelas_pagas`,
        [email, curso, nome, telefone, documento, plano, pagamentoTipo, assinante, dias, transacao],
      )
      return { acessoId: Number(rows[0].id), liberadoAte: rows[0].liberado_ate, parcelasPagas: rows[0].parcelas_pagas }
    },

    /**
     * Parcela atrasada: só o acesso de Pix parcelado (30 dias por parcela) entra na regra de bloqueio.
     * Os outros só recebem o e-mail de apoio.
     */
    async registrarAtraso({ email, assinante, curso, atrasoDesde, bloquearEm }) {
      const { rows } = await q(
        `update acessos
            set status = 'atrasado',
                atraso_desde = coalesce(atraso_desde, $3),
                bloquear_em = coalesce(bloquear_em, $4),
                atualizado_em = now()
          where status <> 'bloqueado' and dias_regra = 30
            and (($1::text is not null and subscriber_code = $1) or (email = $2 and curso = $5))
          returning id`,
        [assinante, email, atrasoDesde, bloquearEm, curso],
      )
      return rows.length ? { acessoId: Number(rows[0].id), bloquearEm } : { pulado: 'sem acesso de Pix parcelado para este aluno' }
    },

    async registrarCompra(linha) {
      const inseridas = await insertBatch(env, [toPurchase(linha)])
      return { inseridas }
    },

    async registrarAbandono({ email, tipo, nome, telefone, curso, ocorridoEm, eventoId }) {
      if (!email) return { pulado: 'sem e-mail' }
      await q(
        `insert into abandonos (email, tipo, nome, telefone, curso, ocorrido_em, msg_apoio, evento_id)
         values ($1, $2, $3, $4, $5, $6, 'pendente', $7)
         on conflict (email, tipo) do update set
           nome = excluded.nome, telefone = excluded.telefone, curso = excluded.curso,
           ocorrido_em = excluded.ocorrido_em, msg_apoio = 'pendente', evento_id = excluded.evento_id,
           atualizado_em = now()`,
        [email, tipo, nome, telefone, curso, ocorridoEm, eventoId],
      )
      return {}
    },

    async marcarAbandonoEnviado({ email, tipo, enviadoEm }) {
      await q(`update abandonos set msg_apoio = 'enviado', enviado_em = $3, atualizado_em = now() where email = $1 and tipo = $2`, [email, tipo, enviadoEm])
    },

    async acessosParaBloquear() {
      const { rows } = await q(
        `select * from acessos
          where status = 'atrasado' and bloquear_em <= now()
            and (bloqueio_proxima is null or bloqueio_proxima <= now())
          order by bloquear_em limit 25`,
      )
      return rows
    },

    async marcarBloqueado(id) {
      await q(`update acessos set status = 'bloqueado', bloqueado_em = now(), bloqueio_erro = null, atualizado_em = now() where id = $1`, [id])
    },

    async marcarBloqueioManual(id) {
      await q(`update acessos set status = 'bloqueio_pendente', atualizado_em = now() where id = $1`, [id])
    },

    async marcarBloqueioFalha(id, { tentativas, proxima, erro }) {
      await q(`update acessos set bloqueio_tentativas = $2, bloqueio_proxima = $3, bloqueio_erro = $4, atualizado_em = now() where id = $1`, [id, tentativas, proxima, erro])
    },
  }
}
