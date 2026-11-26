import { appUrl } from './config.js'

// YouTube: (1) lista de membros do canal e (2) login do membro com a conta Google, para provarmos QUAL canal é o dele.
//
// A API de membros (`members.list`) devolve o ID do canal do membro, nome e nível, mas NUNCA o e-mail. Por isso o resgate
// dos membros do YouTube não pergunta e-mail: a pessoa entra com o Google (escopo youtube.readonly), pegamos o canal dela e
// comparamos com a lista de membros.
//
// Todas as funções aceitam `fetchImpl` para os testes não saírem pela rede.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TIMEOUT_MS = 20_000
export const ESCOPO_LOGIN = 'https://www.googleapis.com/auth/youtube.readonly'

async function pedirJson(fetchImpl, url, opcoes = {}) {
  const resposta = await fetchImpl(url, { ...opcoes, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const corpo = await resposta.json().catch(() => ({}))
  return { resposta, corpo }
}

/** Access token do DONO do canal (refresh token com o escopo youtube.channel-memberships.creator). */
export async function tokenDoCanal(env, fetchImpl = fetch) {
  const { resposta, corpo } = await pedirJson(fetchImpl, TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: env.YOUTUBE_MEMBROS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!resposta.ok || !corpo.access_token) {
    throw new Error(`Google recusou o token dos membros (${corpo.error_description || corpo.error || resposta.status}).`)
  }
  return corpo.access_token
}

/**
 * Membros ativos do canal. Devolve [{ chave, nome, nivel, desde }] (chave = ID do canal do membro).
 * Percorre todas as páginas (até 50, trava de segurança).
 */
export async function listarMembrosYoutube(env, fetchImpl = fetch) {
  const token = await tokenDoCanal(env, fetchImpl)
  const membros = new Map()
  let pagina = ''
  for (let i = 0; i < 50; i += 1) {
    const url = new URL('https://youtube.googleapis.com/youtube/v3/members')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('mode', 'all_current')
    url.searchParams.set('maxResults', '1000')
    if (pagina) url.searchParams.set('pageToken', pagina)
    const { resposta, corpo } = await pedirJson(fetchImpl, url, { headers: { Authorization: `Bearer ${token}` } })
    if (!resposta.ok) throw new Error(`YouTube recusou a lista de membros (${corpo?.error?.message || resposta.status}).`)
    for (const item of corpo.items ?? []) {
      const s = item.snippet ?? {}
      const id = s.memberDetails?.channelId
      if (!id) continue
      membros.set(id, {
        chave: id,
        nome: s.memberDetails?.displayName ?? null,
        nivel: s.membershipsDetails?.highestAccessibleLevelDisplayName ?? null,
        desde: s.membershipsDetails?.membershipsDuration?.memberSince ?? null,
      })
    }
    pagina = corpo.nextPageToken ?? ''
    if (!pagina) break
  }
  return [...membros.values()]
}

export const redirectGoogle = (env) => `${appUrl(env)}/api/clube/resgate/google/callback`

/** Endereço do login Google do membro. `state` é um token assinado (token.js). */
export function urlLoginGoogle(env, state) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env.YOUTUBE_CLIENT_ID)
  url.searchParams.set('redirect_uri', redirectGoogle(env))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', ESCOPO_LOGIN)
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

/** Troca o código do login pelo ID do canal da PESSOA que entrou. Não guarda token nenhum. */
export async function canalDoMembro(env, codigo, fetchImpl = fetch) {
  const { resposta, corpo } = await pedirJson(fetchImpl, TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: codigo,
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      redirect_uri: redirectGoogle(env),
      grant_type: 'authorization_code',
    }),
  })
  if (!resposta.ok || !corpo.access_token) throw new Error(`Google recusou o login (${corpo.error_description || corpo.error || resposta.status}).`)

  const canal = await pedirJson(fetchImpl, 'https://youtube.googleapis.com/youtube/v3/channels?part=id&mine=true', {
    headers: { Authorization: `Bearer ${corpo.access_token}` },
  })
  if (!canal.resposta.ok) throw new Error(`YouTube recusou a leitura do canal (${canal.corpo?.error?.message || canal.resposta.status}).`)
  return canal.corpo.items?.[0]?.id ?? null
}
