import { query } from '../db.js'
import { avisarProblema } from '../acesso/integracoes.js'
import { criarLimitador } from '../limitador.js'
import { estatisticasDaCaptura } from '../capturaHandler.js'
import { PROJETOS } from './projetos.js'

/**
 * Monitoramento dos sites: confere cada endereço de tempos em tempos, guarda o histórico no banco e avisa a equipe
 * (Telegram) quando algo cai (2 falhas seguidas) e quando volta.
 * Variáveis: MONITOR_ENABLED (padrão true), MONITOR_MINUTES (padrão 5).
 */

const TIMEOUT_MS = 12_000
export const LENTO_MS = 4000
const GUARDAR_DIAS = 14
const FALHAS_PARA_AVISAR = 2

export async function garantirTabela(env, consultar = (texto, params) => query(env, texto, params)) {
  await consultar(`create table if not exists monitor_checagens (
    id bigserial primary key,
    projeto text not null,
    alvo text not null,
    url text not null,
    ok boolean not null,
    status integer,
    ms integer,
    erro text,
    checado_em timestamptz not null default now()
  )`)
  await consultar('create index if not exists monitor_checagens_alvo_idx on monitor_checagens (projeto, alvo, checado_em desc)')
}

function motivoDoErro(erro) {
  const causa = erro?.cause?.code || erro?.cause?.message || ''
  if (erro?.name === 'TimeoutError' || erro?.name === 'AbortError') return `sem resposta em ${TIMEOUT_MS / 1000}s`
  return String(`${erro?.message ?? erro} ${causa}`).trim().slice(0, 160)
}

/** Confere um endereço. Nunca lança: falha vira { ok: false, erro }. */
export async function checarAlvo(alvo, fetchImpl = fetch) {
  const inicio = Date.now()
  try {
    const resposta = await fetchImpl(alvo.url, {
      method: alvo.metodo ?? 'GET',
      headers: { 'User-Agent': 'TuzinhoMonitor/1.0', ...(alvo.cabecalhos ?? {}) },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const ms = Date.now() - inicio
    const statusCerto = alvo.esperaStatus ? resposta.status === alvo.esperaStatus : resposta.status >= 200 && resposta.status < 400
    if (!statusCerto) {
      await resposta.body?.cancel?.().catch(() => {})
      return { ok: false, status: resposta.status, ms, erro: `HTTP ${resposta.status}` }
    }
    if (alvo.contem) {
      const html = await resposta.text()
      if (!html.includes(alvo.contem)) return { ok: false, status: resposta.status, ms, erro: `a página abriu, mas sem o trecho "${alvo.contem}"` }
    } else {
      await resposta.body?.cancel?.().catch(() => {})
    }
    return { ok: true, status: resposta.status, ms, erro: null }
  } catch (erro) {
    return { ok: false, status: null, ms: Date.now() - inicio, erro: motivoDoErro(erro) }
  }
}

/** Confere tudo e grava o resultado. Devolve a lista { projeto, alvo, url, ...resultado }. */
export async function rodarChecagens(env, { fetchImpl = fetch, projetos = PROJETOS, consultar = (texto, params) => query(env, texto, params) } = {}) {
  const limitar = criarLimitador(4)
  const tarefas = projetos.flatMap((projeto) =>
    projeto.alvos.map((alvo) =>
      limitar(async () => ({ projeto: projeto.id, projetoNome: projeto.nome, alvo: alvo.nome, url: alvo.url, ...(await checarAlvo(alvo, fetchImpl)) })),
    ),
  )
  const resultados = await Promise.all(tarefas)
  if (resultados.length) {
    const col = (chave) => resultados.map((r) => r[chave])
    await consultar(
      `insert into monitor_checagens (projeto, alvo, url, ok, status, ms, erro)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::boolean[], $5::int[], $6::int[], $7::text[])`,
      [col('projeto'), col('alvo'), col('url'), col('ok'), col('status'), col('ms'), col('erro')],
    )
  }
  await consultar('delete from monitor_checagens where checado_em < now() - make_interval(days => $1)', [GUARDAR_DIAS])
  return resultados
}

/**
 * Decide o que avisar: cai depois de FALHAS_PARA_AVISAR falhas seguidas (uma só pode ser soluço de rede) e volta quando
 * o primeiro acerto aparece depois de um aviso de queda. `estado` é o mapa que a rodada anterior devolveu.
 */
export function avaliarTransicoes(resultados, estado = new Map()) {
  const avisos = []
  for (const r of resultados) {
    const chave = `${r.projeto}|${r.alvo}`
    const atual = estado.get(chave) ?? { falhas: 0, avisouQueda: false }
    if (r.ok) {
      if (atual.avisouQueda) avisos.push(`✅ Voltou: ${r.projetoNome} — ${r.alvo} está respondendo de novo (${r.ms} ms).\n${r.url}`)
      estado.set(chave, { falhas: 0, avisouQueda: false })
    } else {
      const falhas = atual.falhas + 1
      let avisouQueda = atual.avisouQueda
      if (falhas >= FALHAS_PARA_AVISAR && !avisouQueda) {
        avisos.push(`🔴 Fora do ar: ${r.projetoNome} — ${r.alvo}\nMotivo: ${r.erro}\n${r.url}`)
        avisouQueda = true
      }
      estado.set(chave, { falhas, avisouQueda })
    }
  }
  return avisos
}

const percentual = (parte, total) => (total ? Math.round((parte / total) * 1000) / 10 : null)

/** Monta o que a tela mostra: situação de cada endereço (últimas 24 h), cadastros e erros do formulário. */
export async function montarResumo(env, { projetos = PROJETOS, consultar = (texto, params) => query(env, texto, params), agora = new Date() } = {}) {
  const linhas = (
    await consultar(
      `select projeto, alvo, ok, status, ms, erro, checado_em from monitor_checagens
        where checado_em > now() - interval '24 hours' order by checado_em asc`,
    )
  ).rows

  const porAlvo = new Map()
  for (const linha of linhas) {
    const chave = `${linha.projeto}|${linha.alvo}`
    if (!porAlvo.has(chave)) porAlvo.set(chave, [])
    porAlvo.get(chave).push(linha)
  }

  const resultado = []
  for (const projeto of projetos) {
    const alvos = projeto.alvos.map((alvo) => {
      const historico = porAlvo.get(`${projeto.id}|${alvo.nome}`) ?? []
      const ultimo = historico.at(-1) ?? null
      const acertos = historico.filter((h) => h.ok)
      const lento = Boolean(ultimo?.ok && ultimo.ms > LENTO_MS)
      return {
        nome: alvo.nome,
        url: alvo.url,
        situacao: !ultimo ? 'sem-dados' : !ultimo.ok ? 'fora' : lento ? 'lento' : 'ok',
        status: ultimo?.status ?? null,
        ms: ultimo?.ms ?? null,
        erro: ultimo?.erro ?? null,
        checadoEm: ultimo?.checado_em ?? null,
        disponibilidade24h: percentual(acertos.length, historico.length),
        mediaMs: acertos.length ? Math.round(acertos.reduce((soma, h) => soma + (h.ms ?? 0), 0) / acertos.length) : null,
        ultimas: historico.slice(-48).map((h) => ({ ok: h.ok, ms: h.ms, em: h.checado_em })),
      }
    })

    let leads = null
    if (projeto.slugsDeLeads.length) {
      const r = (
        await consultar(
          `select count(*) filter (where created_at > now() - interval '24 hours')::int h24,
                  count(*) filter (where created_at > now() - interval '7 days')::int d7,
                  count(*)::int total, max(created_at) ultimo
             from leads where slug = any($1)`,
          [projeto.slugsDeLeads],
        )
      ).rows[0]
      leads = { ultimas24h: r.h24, ultimos7dias: r.d7, total: r.total, ultimoEm: r.ultimo }
    }

    const situacoes = alvos.map((a) => a.situacao)
    resultado.push({
      id: projeto.id,
      nome: projeto.nome,
      descricao: projeto.descricao,
      pasta: projeto.pasta,
      situacao: situacoes.includes('fora') ? 'fora' : situacoes.includes('lento') ? 'lento' : situacoes.every((s) => s === 'sem-dados') ? 'sem-dados' : 'ok',
      alvos,
      leads,
      captura: projeto.captura ? estatisticasDaCaptura() : null,
    })
  }
  return { geradoEm: agora.toISOString(), projetos: resultado }
}

export function startMonitor(env, { enviar = avisarProblema, rodar = rodarChecagens } = {}) {
  const ligado = String(env.MONITOR_ENABLED ?? 'true').toLowerCase() !== 'false'
  if (!ligado || !env.DATABASE_URL) {
    console.log('[monitor] desligado (precisa do banco configurado)')
    return { stop() {} }
  }
  const minutos = Math.max(1, Number(env.MONITOR_MINUTES) || 5)
  const estado = new Map()
  let rodando = false

  const ciclo = async () => {
    if (rodando) return
    rodando = true
    try {
      await garantirTabela(env)
      const resultados = await rodar(env)
      for (const aviso of avaliarTransicoes(resultados, estado)) await enviar(env, aviso)
    } catch (erro) {
      console.error('[monitor] falha na rodada:', erro.message || erro)
    } finally {
      rodando = false
    }
  }

  console.log(`[monitor] conferindo os sites a cada ${minutos} min`)
  // Espera um pouco depois de subir: o reinício do próprio dash não deve virar "fora do ar".
  const primeira = setTimeout(() => void ciclo(), 60_000)
  const timer = setInterval(() => void ciclo(), minutos * 60_000)
  primeira.unref?.()
  timer.unref?.()
  return { stop: () => (clearTimeout(primeira), clearInterval(timer)), rodarAgora: ciclo }
}
