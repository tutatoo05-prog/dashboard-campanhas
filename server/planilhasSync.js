import { limparCache } from './cacheCurto.js'
import { lerEventosAoVivo, loadExtraBuyers } from './hotmartEvents.js'
import { CHAVE_EVENTOS_HOTMART, CHAVE_REGISTROS, gravarCopia, registrarErroCopia } from './planilhasCopia.js'
import { carregarRegistrosAoVivo } from './registrosHandler.js'

const MINUTOS_PADRAO = 5

/** Lê as 16 abas das planilhas (≈14 s) e guarda a cópia no banco. Em caso de falha, mantém a última cópia boa. */
export async function sincronizarRegistros(env) {
  try {
    const dados = await carregarRegistrosAoVivo(env)
    const abasComErro = dados.tabs.filter((aba) => aba.error)
    // Se TODAS as abas falharam (ex.: Google fora do ar), não troca uma cópia boa por uma vazia.
    if (abasComErro.length === dados.tabs.length) throw new Error('nenhuma aba pôde ser lida')
    await gravarCopia(env, CHAVE_REGISTROS, dados)
    limparCache('planilhas|')
    return { ok: true, registros: dados.records.length, abasComErro: abasComErro.length }
  } catch (erro) {
    await registrarErroCopia(env, CHAVE_REGISTROS, erro.message || erro)
    throw erro
  }
}

/** Eventos da Hotmart da planilha de tracking (guarda os eventos puros; as situações são calculadas na hora de ler). */
export async function sincronizarEventosHotmart(env) {
  try {
    const eventos = await lerEventosAoVivo()
    await gravarCopia(env, CHAVE_EVENTOS_HOTMART, { events: eventos })
    limparCache('planilhas|')
    return { ok: true, eventos: eventos.length }
  } catch (erro) {
    await registrarErroCopia(env, CHAVE_EVENTOS_HOTMART, erro.message || erro)
    throw erro
  }
}

/**
 * Mantém a cópia das planilhas no banco em dia. Roda junto do processo Node, como os outros agendadores.
 * Variáveis: PLANILHAS_SYNC_ENABLED (padrão true), PLANILHAS_SYNC_MINUTES (padrão 5).
 */
export function startPlanilhasScheduler(env) {
  if (String(env.PLANILHAS_SYNC_ENABLED ?? 'true').toLowerCase() === 'false') {
    console.log('[planilhas] cópia das planilhas desligada (PLANILHAS_SYNC_ENABLED=false): as telas leem o Google ao vivo')
    return { stop() {} }
  }
  if (!env.DATABASE_URL) {
    console.warn('[planilhas] DATABASE_URL não configurada: cópia das planilhas não iniciada')
    return { stop() {} }
  }

  const minutos = Math.max(1, Number(env.PLANILHAS_SYNC_MINUTES) || MINUTOS_PADRAO)
  let rodando = false

  const rodar = async () => {
    if (rodando) return
    rodando = true
    try {
      await loadExtraBuyers(env, { force: true }).catch(() => [])
      for (const [rotulo, tarefa] of [
        ['eventos da Hotmart', sincronizarEventosHotmart],
        ['registros', sincronizarRegistros],
      ]) {
        try {
          await tarefa(env)
        } catch (erro) {
          if (erro?.code === '42P01') console.warn('[planilhas] migração pendente: rode o bloco "Cópia das planilhas" de db/schema.sql')
          else console.error(`[planilhas] falha ao copiar ${rotulo}:`, erro.message || erro)
        }
      }
    } finally {
      rodando = false
    }
  }

  console.log(`[planilhas] cópia das planilhas no banco ativa · a cada ${minutos} min`)
  const inicio = setTimeout(() => void rodar(), 5_000) // deixa o servidor subir antes da 1ª cópia
  const timer = setInterval(() => void rodar(), minutos * 60_000)
  inicio.unref?.()
  timer.unref?.()
  return { stop: () => { clearTimeout(inicio); clearInterval(timer) } }
}
