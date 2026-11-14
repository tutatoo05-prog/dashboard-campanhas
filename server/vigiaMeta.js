import { query } from './db.js'
import { avisarProblema } from './acesso/integracoes.js'
import { criarLimitePersistente } from './vigia.js'
import { aoTokenRejeitado } from './metaApi.js'

/**
 * Vigia do token da Meta: avisa a equipe (Telegram, ou WhatsApp da equipe) quando a Meta rejeita o META_ACCESS_TOKEN,
 * em vez de esperar alguém abrir uma tela e ver o erro. Dois gatilhos:
 *  - na hora: qualquer chamada do dash à Meta que volte com "token inválido" (código 190) dispara o aviso;
 *  - de tempos em tempos: confere o token sozinho (e avisa antes, se ele tiver data para vencer).
 * Variáveis: VIGIA_META_ENABLED (padrão true), VIGIA_META_MINUTES (padrão 60), VIGIA_META_DIAS_ANTES (padrão 7).
 */

const GRAPH = 'https://graph.facebook.com/v21.0'
const TIMEOUT_MS = 20_000
const REPETIR_REJEITADO_MIN = 6 * 60
const REPETIR_VENCENDO_MIN = 24 * 60

/** Códigos da Meta que significam "este token não vale mais" (190 = token inválido/expirado/revogado, 102 = sessão). */
export function erroDeToken(erro) {
  // Aceita o Error do graphGet (metaCode) e o objeto cru "error" que a Meta devolve (code).
  const codigo = Number(erro?.metaCode ?? erro?.code)
  return codigo === 190 || codigo === 102
}

function motivoLegivel(erro) {
  const sub = Number(erro?.metaSubcode ?? erro?.error_subcode)
  if (sub === 463 || sub === 467) return 'o token expirou'
  if (sub === 460) return 'a senha da conta que gerou o token foi trocada'
  if (sub === 458 || sub === 459) return 'o app foi removido ou a conta precisa confirmar o acesso'
  return 'a Meta recusou o token'
}

function textoRejeitado(motivo) {
  return (
    `🔴 A Meta rejeitou o token do dash (${motivo}). Enquanto isso, campanhas, gastos e alertas de anúncios não atualizam.\n` +
    'Como resolver: Meta Business → Configurações → Usuários do sistema → gerar novo token (ads_read, ads_management, read_insights) ' +
    'e trocar o META_ACCESS_TOKEN no Plesk (Node.js → variáveis) e reiniciar o app.'
  )
}

function textoVencendo(dias) {
  return (
    `🟡 O token da Meta do dash vence em ${dias} dia(s). Gere um novo antes disso (Meta Business → Usuários do sistema) ` +
    'e troque o META_ACCESS_TOKEN no Plesk, para as campanhas não pararem de atualizar.'
  )
}

async function pedir(url, fetchImpl) {
  const resposta = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  const corpo = await resposta.json().catch(() => ({}))
  return { ok: resposta.ok && !corpo?.error, corpo }
}

/**
 * Confere o token agora. Devolve { estado: 'ok' | 'rejeitado' | 'vencendo' | 'indeterminado', ... }.
 * "indeterminado" é rede fora ou erro que não é do token: não vale aviso (o resto do dash já mostra o erro dele).
 */
export async function conferirTokenMeta(env, { fetchImpl = fetch, agora = () => Date.now() } = {}) {
  const token = env.META_ACCESS_TOKEN
  if (!token) return { estado: 'indeterminado', motivo: 'sem token' }
  const diasAntes = Math.max(1, Number(env.VIGIA_META_DIAS_ANTES) || 7)

  try {
    const depuracao = await pedir(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
      fetchImpl,
    )
    if (!depuracao.ok) {
      return erroDeToken(depuracao.corpo?.error)
        ? { estado: 'rejeitado', motivo: motivoLegivel(depuracao.corpo.error) }
        : { estado: 'indeterminado', motivo: depuracao.corpo?.error?.message ?? 'resposta inesperada' }
    }
    const dados = depuracao.corpo?.data ?? {}
    if (dados.is_valid === false) {
      return { estado: 'rejeitado', motivo: motivoLegivel(dados.error) }
    }
    // expires_at 0 = sem vencimento (token de usuário do sistema).
    const tipo = dados.type ?? 'desconhecido'
    if (Number(dados.expires_at) > 0) {
      const dias = Math.ceil((Number(dados.expires_at) * 1000 - agora()) / 86_400_000)
      if (dias <= diasAntes) return { estado: 'vencendo', dias: Math.max(dias, 0), tipo }
      return { estado: 'ok', tipo, dias }
    }
    return { estado: 'ok', tipo, dias: null }
  } catch (erro) {
    return { estado: 'indeterminado', motivo: String(erro?.message ?? erro).slice(0, 160) }
  }
}

/** Transforma o resultado da conferência no aviso a enviar (ou nada). */
export function avisoDaConferencia(resultado) {
  if (resultado.estado === 'rejeitado') {
    return { chave: 'meta-token-rejeitado', repetirEmMin: REPETIR_REJEITADO_MIN, texto: textoRejeitado(resultado.motivo) }
  }
  if (resultado.estado === 'vencendo') {
    return { chave: 'meta-token-vencendo', repetirEmMin: REPETIR_VENCENDO_MIN, texto: textoVencendo(resultado.dias) }
  }
  return null
}

let ultimoEstado = null
const VALIDADE_ESTADO_MS = 10 * 60_000

/** Resultado da última conferência (guardado por 10 minutos): é o que a tela Segurança mostra, sem pedir à Meta a cada abertura. */
export async function estadoDoTokenMeta(env, { conferir = conferirTokenMeta, agora = () => Date.now() } = {}) {
  if (!ultimoEstado || agora() - ultimoEstado.em > VALIDADE_ESTADO_MS) {
    const resultado = await conferir(env)
    ultimoEstado = { em: agora(), resultado }
  }
  return { ...ultimoEstado.resultado, conferidoEm: new Date(ultimoEstado.em).toISOString(), descricao: descreverResultado(ultimoEstado.resultado) }
}

/** Linha de log (sem o token): serve para ver, no log de produção, qual token o app está usando. */
export function descreverResultado(r) {
  const tipo = r.tipo ? ` · tipo ${r.tipo}` : ''
  if (r.estado === 'ok') return `token ok${tipo} · ${r.dias == null ? 'sem vencimento' : `vence em ${r.dias} dia(s)`}`
  if (r.estado === 'vencendo') return `token ok, mas vence em ${r.dias} dia(s)${tipo}`
  if (r.estado === 'rejeitado') return `token REJEITADO pela Meta (${r.motivo})`
  return `não consegui conferir o token (${r.motivo ?? 'sem detalhe'})`
}

export function startVigiaMeta(env, { enviar = avisarProblema, conferir = conferirTokenMeta } = {}) {
  const ligado = String(env.VIGIA_META_ENABLED ?? 'true').toLowerCase() !== 'false'
  if (!ligado || !env.DATABASE_URL || !env.META_ACCESS_TOKEN) {
    console.log('[vigia-meta] desligado (precisa de banco e META_ACCESS_TOKEN)')
    return { stop() {} }
  }
  const minutos = Math.max(5, Number(env.VIGIA_META_MINUTES) || 60)
  const podeAvisar = criarLimitePersistente((texto, params) => query(env, texto, params))
  let rodando = false

  const avisar = async (aviso) => {
    if (aviso && (await podeAvisar(aviso.chave, aviso.repetirEmMin))) await enviar(env, aviso.texto)
  }

  // Gatilho imediato: uma chamada qualquer do dash voltou com "token inválido".
  aoTokenRejeitado((erro) => {
    void avisar(avisoDaConferencia({ estado: 'rejeitado', motivo: motivoLegivel(erro) })).catch((falha) =>
      console.error('[vigia-meta] não consegui avisar:', falha.message || falha),
    )
  })

  const rodar = async () => {
    if (rodando) return
    rodando = true
    try {
      const resultado = await conferir(env)
      console.log(`[vigia-meta] ${descreverResultado(resultado)}`)
      await avisar(avisoDaConferencia(resultado))
    } catch (erro) {
      console.error('[vigia-meta] falha na conferência:', erro.message || erro)
    } finally {
      rodando = false
    }
  }

  console.log(`[vigia-meta] conferindo o token da Meta a cada ${minutos} min`)
  const inicio = setTimeout(() => void rodar(), 2 * 60_000)
  const timer = setInterval(() => void rodar(), minutos * 60_000)
  inicio.unref?.()
  timer.unref?.()
  return {
    stop() {
      clearTimeout(inicio)
      clearInterval(timer)
      aoTokenRejeitado(null)
    },
  }
}
