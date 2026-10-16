import { bloquearAtrasados, criarMotor, modoAcesso, processarFila } from './motor.js'
import { criarRepo } from './repo.js'

const INTERVALO_MS = 20_000

let motorCompartilhado = null
let rodando = false
let pedidoPendente = false

function motorDo(env) {
  if (!motorCompartilhado) motorCompartilhado = criarMotor(env, { repo: criarRepo(env) })
  return motorCompartilhado
}

/** Roda uma rodada: processa a fila e bloqueia quem passou do limite do atraso. Nunca roda em paralelo. */
export async function rodarAgora(env) {
  if (modoAcesso(env) === 'desligado') return
  if (rodando) {
    pedidoPendente = true // alguém pediu no meio de uma rodada: faz outra logo em seguida
    return
  }
  rodando = true
  try {
    do {
      pedidoPendente = false
      const motor = motorDo(env)
      await processarFila(motor)
      await bloquearAtrasados(motor)
    } while (pedidoPendente)
  } catch (erro) {
    if (erro?.code === '42P01' || erro?.code === '42703') {
      console.warn('[acesso] migração pendente: rode o bloco "Liberação de acesso" de db/schema.sql')
    } else {
      console.error('[acesso] falha na rodada:', erro.message || erro)
    }
  } finally {
    rodando = false
  }
}

/**
 * Agendador da liberação de acesso. Roda junto do processo Node (como os outros). O webhook também
 * chama rodarAgora() assim que grava um evento, então o aluno não espera o próximo intervalo.
 * Variáveis: ACESSO_MODO (desligado | teste | ativo) — ver DEPLOY.md.
 */
export function startAcessoScheduler(env) {
  const modo = modoAcesso(env)
  if (modo === 'desligado') {
    console.log('[acesso] liberação pelo dash desligada (ACESSO_MODO não definido): o n8n continua responsável')
    return { stop() {} }
  }
  if (!env.DATABASE_URL) {
    console.warn('[acesso] DATABASE_URL não configurada: liberação de acesso não iniciada')
    return { stop() {} }
  }
  console.log(`[acesso] liberação pelo dash em modo "${modo}" (a cada ${INTERVALO_MS / 1000}s)`)
  const timer = setInterval(() => void rodarAgora(env), INTERVALO_MS)
  timer.unref?.()
  void rodarAgora(env)
  return { stop: () => clearInterval(timer) }
}
