import { query } from './db.js'
import { avisarProblema } from './acesso/integracoes.js'
import { criarLimiteDeAvisos } from './alertas.js'
import { estatisticasDoWebhook } from './hotmartWebhookHandler.js'
import { modoAcesso } from './acesso/motor.js'

/**
 * Vigia: confere de tempos em tempos se a liberação de acesso está saudável e avisa a equipe (Telegram) quando não está.
 * Cobre o que ninguém notaria sozinho: webhook mudo, evento preso, aluno pago sem acesso.
 * Variáveis: VIGIA_ENABLED (padrão true), VIGIA_MINUTES (padrão 10).
 */

const INTERVALO_PADRAO_MIN = 10
const PRESO_APOS_MIN = 15
const SILENCIO_APOS_H = 36

/** Cada verificação devolve um aviso (ou nada). `chave` + `repetirEmMin` controlam a repetição. */
export async function verificar(env, { consultar = (texto, params) => query(env, texto, params), estatisticas = estatisticasDoWebhook } = {}) {
  const avisos = []

  // 0) A Hotmart bate no dash, mas o dash recusa (hottok diferente do que está no Plesk).
  const webhook = estatisticas()
  if (webhook.recusadas >= 2 && !webhook.aceitas) {
    avisos.push({
      chave: 'hottok',
      repetirEmMin: 6 * 60,
      texto: `🔴 A Hotmart está mandando eventos ao dash, mas todos foram RECUSADOS (${webhook.recusadas} desde que o app subiu): o código de segurança (hottok) da Hotmart é diferente do HOTMART_HOTTOK do Plesk. Confira em Hotmart → Webhook → Autenticação e corrija no Plesk. Enquanto isso, as vendas não liberam o curso.`,
    })
  }

  // 1) Evento preso em "processando" (o processo caiu no meio, ou travou numa chamada externa).
  const presos = await consultar(
    `select count(*)::int n, min(iniciado_em) desde from hotmart_eventos
      where estado = 'processando' and iniciado_em < now() - make_interval(mins => $1)`,
    [PRESO_APOS_MIN],
  )
  if (presos.rows[0]?.n > 0) {
    avisos.push({
      chave: 'preso',
      repetirEmMin: 60,
      texto: `⚠️ ${presos.rows[0].n} evento(s) da Hotmart parado(s) há mais de ${PRESO_APOS_MIN} min, sem terminar de processar. Veja Acessos → Eventos.`,
    })
  }

  // 2) Pago e sem acesso: falhou de vez ou precisa de atenção nas últimas 24 h.
  const problemas = await consultar(
    `select count(*)::int n from hotmart_eventos
      where estado in ('falhou', 'atencao') and simulado = false and recebido_em > now() - interval '24 hours'`,
  )
  if (problemas.rows[0]?.n > 0) {
    avisos.push({
      chave: 'problemas',
      repetirEmMin: 6 * 60,
      texto: `🔴 ${problemas.rows[0].n} evento(s) da Hotmart nas últimas 24 h precisam de gente (aluno pode estar sem acesso). Veja Acessos → Problemas.`,
    })
  }

  // 3) Webhook mudo: ou nunca chegou nada, ou parou de chegar depois de ter funcionado.
  const resumo = await consultar(
    `select count(*)::int total,
            count(*) filter (where recebido_em > now() - interval '7 days')::int semana,
            max(recebido_em) ultimo
       from hotmart_eventos where estado <> 'ignorado'`,
  )
  const { total, semana, ultimo } = resumo.rows[0] ?? {}
  if (total === 0) {
    avisos.push({
      chave: 'nunca',
      repetirEmMin: 24 * 60,
      texto: '🟡 O dash ainda não recebeu nenhum evento da Hotmart. Se já houve compras, confira na Hotmart (Webhook → Histórico) se as entregas para dash.tuzinho.academy estão com status 200. (Se for hottok errado, o dash avisa à parte.)',
    })
  } else if (semana >= 5 && ultimo && Date.now() - new Date(ultimo).getTime() > SILENCIO_APOS_H * 3600_000) {
    avisos.push({
      chave: 'mudo',
      repetirEmMin: 12 * 60,
      texto: `🟡 Faz mais de ${SILENCIO_APOS_H} h que nenhum evento da Hotmart chega ao dash (o último foi em ${new Date(ultimo).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}). O webhook pode ter parado: confira na Hotmart (Webhook → Histórico).`,
    })
  }

  return avisos
}

/**
 * "Já avisei" guardado no banco (tabela vigia_avisos): reiniciar o app (deploy) não repete o mesmo aviso.
 * Se o banco falhar, cai para a memória.
 */
export function criarLimitePersistente(consultar, agora = () => Date.now()) {
  const memoria = criarLimiteDeAvisos(agora)
  let pronta = false
  return async (chave, minutos) => {
    try {
      if (!pronta) {
        await consultar('create table if not exists vigia_avisos (chave text primary key, avisado_em timestamptz not null)')
        pronta = true
      }
      const { rows } = await consultar('select avisado_em from vigia_avisos where chave = $1', [chave])
      const antes = rows[0]?.avisado_em ? new Date(rows[0].avisado_em).getTime() : null
      if (antes !== null && agora() - antes < minutos * 60_000) return false
      await consultar(
        'insert into vigia_avisos (chave, avisado_em) values ($1, now()) on conflict (chave) do update set avisado_em = now()',
        [chave],
      )
      return true
    } catch (erro) {
      console.error('[vigia] não consegui consultar os avisos já enviados:', erro.message || erro)
      return memoria(chave, minutos)
    }
  }
}

export function startVigia(env, { enviar = avisarProblema, verificarImpl = verificar } = {}) {
  const ligado = String(env.VIGIA_ENABLED ?? 'true').toLowerCase() !== 'false'
  if (!ligado || !env.DATABASE_URL || modoAcesso(env) !== 'ativo') {
    console.log('[vigia] desligado (só roda com ACESSO_MODO=ativo e banco configurado)')
    return { stop() {} }
  }
  const minutos = Math.max(1, Number(env.VIGIA_MINUTES) || INTERVALO_PADRAO_MIN)
  const podeAvisar = criarLimitePersistente((texto, params) => query(env, texto, params))
  let rodando = false

  const rodar = async () => {
    if (rodando) return
    rodando = true
    try {
      for (const aviso of await verificarImpl(env)) {
        if (await podeAvisar(aviso.chave, aviso.repetirEmMin)) await enviar(env, aviso.texto)
      }
    } catch (erro) {
      console.error('[vigia] falha na verificação:', erro.message || erro)
    } finally {
      rodando = false
    }
  }

  console.log(`[vigia] conferindo a liberação de acesso a cada ${minutos} min`)
  // Espera um pouco depois de subir para não avisar de algo que o próprio reinício resolve.
  const inicio = setTimeout(() => void rodar(), 3 * 60_000)
  const timer = setInterval(() => void rodar(), minutos * 60_000)
  inicio.unref?.()
  timer.unref?.()
  return { stop: () => { clearTimeout(inicio); clearInterval(timer) } }
}
