/**
 * Cliente da API V2 da plataforma de cursos (Tekway): consultar, revogar e reativar acesso.
 * Só é usado quando TEKWAY_V2_TOKEN está configurado; sem ele o dash continua no caminho antigo
 * (aviso à equipe para bloquear/reativar na mão). Nunca registra o token nem dados de resposta em log.
 * Todas aceitam `fetchImpl` para os testes não saírem pela rede.
 */

const TIMEOUT_MS = 20_000
const URL_PADRAO = 'https://gestao.tuzinho.academy/api/v2'
/** Curso "Essentials" na plataforma: Essentials e Mentoria Essentials são o mesmo produto, só muda o checkout. */
const CURSO_ID_PADRAO = 21

export function v2Configurado(env) {
  return Boolean(String(env.TEKWAY_V2_TOKEN ?? '').trim())
}

export function cursoIdV2(env) {
  return Number(env.TEKWAY_V2_CURSO_ID) || CURSO_ID_PADRAO
}

function recortar(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').slice(0, 300)
}

async function chamar(env, metodo, caminho, corpo, fetchImpl = fetch) {
  if (!v2Configurado(env)) throw new Error('API V2 da plataforma não configurada (TEKWAY_V2_TOKEN).')
  const base = String(env.TEKWAY_V2_URL || URL_PADRAO).replace(/\/+$/, '')
  const resposta = await fetchImpl(`${base}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${env.TEKWAY_V2_TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const texto = await resposta.text().catch(() => '')
  let json = null
  try {
    json = JSON.parse(texto)
  } catch {
    // resposta que não é JSON: segue só com o status
  }
  return { status: resposta.status, ok: resposta.ok, json, texto }
}

function falhar(nome, r) {
  return new Error(`${nome} respondeu ${r.status}: ${recortar(r.json?.message ?? r.texto)}`)
}

/** Situação real do aluno no curso. Aluno que não existe na plataforma volta como { existe: false }. */
export async function consultarAcesso(env, { email, cursoId = cursoIdV2(env) }, fetchImpl = fetch) {
  const r = await chamar(env, 'POST', '/acessos/consultar', { email, curso_id: cursoId }, fetchImpl)
  if (r.status === 404) return { existe: false, acessoLiberado: false, matriculas: [] }
  if (!r.ok) throw falhar('acessos/consultar', r)
  const dados = r.json?.data ?? {}
  return { existe: true, acessoLiberado: Boolean(dados.acesso_liberado), bloqueioManual: Boolean(dados.bloqueio_manual), matriculas: dados.matriculas ?? [] }
}

/** Revoga o acesso do aluno ao curso (reversível). `motivo` tem no máximo 64 caracteres. */
export async function revogarAcesso(env, { email, motivo, observacoes, cursoId = cursoIdV2(env) }, fetchImpl = fetch) {
  const corpo = { email, curso_id: cursoId, motivo: String(motivo).slice(0, 64) }
  if (observacoes) corpo.observacoes = String(observacoes).slice(0, 1000)
  const r = await chamar(env, 'POST', '/acessos/revogar', corpo, fetchImpl)
  // Aluno que nem existe na plataforma não tem o que revogar: não é erro para quem chamou.
  if (r.status === 404) return { status: 404, nada_a_revogar: true }
  if (!r.ok) throw falhar('acessos/revogar', r)
  return { status: r.status }
}

/**
 * Reativa o acesso: acha a matrícula mais recente do aluno no curso e remove o bloqueio.
 * Se a plataforma recusar (ex.: matrícula expirada), lança erro para a fila tentar de novo e avisar.
 */
export async function reativarAcesso(env, { email, motivo = 'pagamento_regularizado', cursoId = cursoIdV2(env) }, fetchImpl = fetch) {
  const atual = await consultarAcesso(env, { email, cursoId }, fetchImpl)
  if (!atual.existe || !atual.matriculas.length) throw new Error(`reativar: aluno sem matrícula na plataforma (${email})`)
  if (atual.acessoLiberado) return { status: 200, ja_ativo: true }
  const maisRecente = [...atual.matriculas].sort((a, b) => Number(b.id) - Number(a.id))[0]
  const r = await chamar(env, 'POST', `/matriculas/${maisRecente.id}/reativar`, { motivo: String(motivo).slice(0, 255) }, fetchImpl)
  if (!r.ok) throw falhar('matriculas/reativar', r)
  return { status: r.status, matricula: maisRecente.id }
}

/** Disponibilidade da API (usa a mesma chave). */
export async function saudeV2(env, fetchImpl = fetch) {
  const r = await chamar(env, 'GET', '/health', undefined, fetchImpl)
  return { ok: r.ok, status: r.status }
}
