import { query } from './db.js'
import { avisarProblema } from './acesso/integracoes.js'
import { fetchHotmartSalesHistory, getHotmartAccessToken } from './hotmartApi.js'
import { insertBatch, normalizeCourse, toPurchase } from './salesSync.js'
import { consultarAcesso, v2Configurado } from './acesso/tekwayV2.js'

/**
 * Conferência Hotmart x dash: de tempos em tempos compara as vendas aprovadas na Hotmart (API de histórico)
 * com a tabela de compras. Venda que a Hotmart tem e o dash não tem (webhook que falhou, fluxo parado) é lançada
 * em Compras e avisada no Telegram. NÃO libera acesso nem manda e-mail: isso é só do webhook; o aviso diz quem
 * está sem acesso na plataforma (consulta a API V2; sem ela, olha a tabela de acessos do dash).
 * Variáveis: CONCILIACAO_ENABLED (padrão true), CONCILIACAO_HORAS (padrão 3), CONCILIACAO_DIAS (padrão 7).
 */

const HORAS_PADRAO = 3
const DIAS_PADRAO = 7
const ESPERA_MIN = 30 // venda muito recente: o webhook ainda pode estar a caminho
const JANELA_DIAS = 3 // mesma pessoa e curso até 3 dias de diferença = é a mesma compra
const STATUS_DE_VENDA = new Set(['APPROVED', 'COMPLETE'])

/** Só a primeira cobrança de venda aprovada conta como venda nova (parcela 2+ é recorrência). */
export function vendasDaHistoria(itens, agora = Date.now()) {
  const vendas = []
  for (const item of itens ?? []) {
    const compra = item?.purchase ?? {}
    const email = String(item?.buyer?.email ?? '').trim().toLowerCase()
    if (!compra.transaction || !email) continue
    if (!STATUS_DE_VENDA.has(String(compra.status ?? '').toUpperCase())) continue
    const recorrencia = Number(compra.recurrency_number)
    if (Number.isFinite(recorrencia) && recorrencia > 1) continue
    const aprovadaEm = new Date(Number(compra.approved_date ?? compra.order_date))
    if (Number.isNaN(aprovadaEm.getTime())) continue
    if (agora - aprovadaEm.getTime() < ESPERA_MIN * 60_000) continue
    const moeda = String(compra.price?.currency_code ?? 'BRL').toUpperCase()
    // O valor da Hotmart inclui os juros do parcelamento; as demais linhas do dash guardam o valor base do produto.
    const base = Number(compra.hotmart_fee?.base)
    vendas.push({
      transacao: String(compra.transaction),
      nome: String(item.buyer.name ?? '').trim(),
      email,
      curso: normalizeCourse(item.product?.name),
      valor: moeda === 'BRL' ? (Number.isFinite(base) && base > 0 ? base : Number(compra.price?.value)) : null,
      moeda,
      pagamentoTipo: String(compra.payment?.type ?? '').toUpperCase(),
      src: compra.tracking?.source ?? null,
      xcod: compra.tracking?.external_code ?? null,
      aprovadaEm,
    })
  }
  return vendas
}

/** Quais vendas da Hotmart não estão em `compras` (linhas já gravadas: { transacao, email, curso, created_at }). */
export function vendasFaltando(vendas, compras) {
  const transacoes = new Set(compras.map((c) => c.transacao).filter(Boolean))
  return vendas.filter((venda) => {
    if (transacoes.has(venda.transacao)) return false
    return !compras.some(
      (c) =>
        String(c.email ?? '').toLowerCase() === venda.email &&
        normalizeCourse(c.curso) === venda.curso &&
        Math.abs(new Date(c.created_at).getTime() - venda.aprovadaEm.getTime()) <= JANELA_DIAS * 86_400_000,
    )
  })
}

export function textoDoAviso(lancadas, semAcesso, naoConferidos = []) {
  const linhas = lancadas.map((v) => {
    const valor = v.valor === null ? 'sem valor (moeda ' + v.moeda + ')' : `R$ ${v.valor.toFixed(2).replace('.', ',')}`
    const dia = v.aprovadaEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    return `• ${v.nome || v.email} · ${v.curso} · ${valor} · ${dia}`
  })
  let acesso = semAcesso.length
    ? `\n\nSem acesso liberado (liberar na mão):\n${semAcesso.map((v) => `• ${v.email}`).join('\n')}`
    : '\n\nTodos já têm acesso liberado.'
  if (naoConferidos.length) acesso += `\n\nNão consegui conferir o acesso de:\n${naoConferidos.map((v) => `• ${v.email}`).join('\n')}`
  return (
    `🟠 Conferência Hotmart: ${lancadas.length} venda(s) aprovada(s) não tinham chegado ao dash. ` +
    `Lancei em Compras (sem liberar acesso nem mandar e-mail):\n\n${linhas.join('\n')}${acesso}\n\n` +
    'O webhook da Hotmart pode estar falhando: confira Hotmart → Webhook → Histórico.'
  )
}

/**
 * Uma rodada. Dependências injetáveis para teste. Devolve { vendas, faltando, lancadas }.
 */
export async function conciliar(env, deps = {}) {
  const {
    agora = Date.now(),
    dias = DIAS_PADRAO,
    buscar = async (inicio, fim) => {
      const token = await getHotmartAccessToken(env)
      return fetchHotmartSalesHistory(token, { startDate: inicio, endDate: fim })
    },
    consultar = (texto, params) => query(env, texto, params),
    inserir = (linhas) => insertBatch(env, linhas),
    avisar = (texto) => avisarProblema(env, texto),
    // Quem pagou e está sem acesso: pergunta à plataforma (API V2); sem ela, usa a tabela de acessos do dash.
    conferirAcesso = async (vendasLancadas) => {
      if (v2Configurado(env)) {
        const semAcesso = []
        const naoConferidos = []
        for (const venda of vendasLancadas) {
          try {
            if (!(await consultarAcesso(env, { email: venda.email })).acessoLiberado) semAcesso.push(venda)
          } catch {
            naoConferidos.push(venda)
          }
        }
        return { semAcesso, naoConferidos }
      }
      const { rows } = await consultar(`select lower(email) as email from acessos where lower(email) = any($1::text[])`, [vendasLancadas.map((v) => v.email)])
      const comAcesso = new Set(rows.map((r) => r.email))
      return { semAcesso: vendasLancadas.filter((v) => !comAcesso.has(v.email)), naoConferidos: [] }
    },
  } = deps

  const fim = new Date(agora)
  const inicio = new Date(agora - dias * 86_400_000)
  const vendas = vendasDaHistoria(await buscar(inicio, fim), agora)
  if (!vendas.length) return { vendas: 0, faltando: 0, lancadas: 0 }

  const { rows: compras } = await consultar(
    `select transacao, lower(email) as email, curso, created_at from purchases where created_at >= $1`,
    [new Date(agora - (dias + JANELA_DIAS) * 86_400_000)],
  )
  const faltando = vendasFaltando(vendas, compras)
  if (!faltando.length) return { vendas: vendas.length, faltando: 0, lancadas: 0 }

  const lancadas = []
  for (const venda of faltando) {
    const gravadas = await inserir([
      toPurchase({
        id: `conciliacao-${venda.transacao}`,
        aprovada_em: venda.aprovadaEm,
        transacao: venda.transacao,
        nome: venda.nome,
        email: venda.email,
        telefone: '',
        curso: venda.curso,
        campanha: venda.src ?? '',
        liberacao: '',
        valor: venda.valor,
        moeda: venda.moeda,
        pagamento_tipo: venda.pagamentoTipo,
        src: venda.src,
        xcod: venda.xcod,
        recorrencia: 1,
        assinante: null,
      }),
    ])
    if (gravadas > 0) lancadas.push(venda)
  }

  if (lancadas.length) {
    const { semAcesso, naoConferidos } = await conferirAcesso(lancadas)
    await avisar(textoDoAviso(lancadas, semAcesso, naoConferidos))
  }
  return { vendas: vendas.length, faltando: faltando.length, lancadas: lancadas.length }
}

export function startConciliacao(env, { rodar = conciliar, avisar = avisarProblema } = {}) {
  const ligado = String(env.CONCILIACAO_ENABLED ?? 'true').toLowerCase() !== 'false'
  if (!ligado || !env.DATABASE_URL || !env.HOTMART_CLIENT_ID || !env.HOTMART_CLIENT_SECRET || !env.HOTMART_BASIC) {
    console.log('[conciliacao] desligada (precisa de DATABASE_URL e das chaves HOTMART_CLIENT_ID/SECRET/BASIC)')
    return { stop() {} }
  }
  const horas = Math.max(0.25, Number(env.CONCILIACAO_HORAS) || HORAS_PADRAO)
  const dias = Math.max(1, Number(env.CONCILIACAO_DIAS) || DIAS_PADRAO)
  let rodando = false
  let falhaAvisadaEm = 0

  const tick = async () => {
    if (rodando) return
    rodando = true
    try {
      const resultado = await rodar(env, { dias })
      if (resultado.lancadas > 0) console.log(`[conciliacao] ${resultado.lancadas} venda(s) lançada(s) que o webhook não entregou`)
    } catch (erro) {
      console.error('[conciliacao] falha:', erro.message || erro)
      // Se a conferência em si quebra (chave da Hotmart vencida, banco fora), avisa no máximo a cada 12 h.
      if (Date.now() - falhaAvisadaEm > 12 * 3600_000) {
        falhaAvisadaEm = Date.now()
        await avisar(env, `🟡 A conferência diária Hotmart x dash falhou: ${String(erro.message || erro).slice(0, 200)}`)
      }
    } finally {
      rodando = false
    }
  }

  console.log(`[conciliacao] conferindo as vendas da Hotmart a cada ${horas} h (últimos ${dias} dias)`)
  const inicio = setTimeout(() => void tick(), 5 * 60_000)
  const timer = setInterval(() => void tick(), horas * 3600_000)
  inicio.unref?.()
  timer.unref?.()
  return { stop: () => { clearTimeout(inicio); clearInterval(timer) } }
}
