import { appUrl } from './config.js'

// Discord: login do membro (OAuth2 identify + guilds.join), entrada no servidor e cargos pelo bot.
//
// O bot precisa da permissão "Gerenciar cargos" e o cargo DELE tem de ficar acima dos cargos de membro na hierarquia do
// servidor. O token do bot e o segredo do app só existem no servidor (.env) e nunca são logados.
// Todas as funções aceitam `fetchImpl` para os testes não saírem pela rede.

const API = 'https://discord.com/api/v10'
const TIMEOUT_MS = 20_000

export const redirectDiscord = (env) => `${appUrl(env)}/api/clube/resgate/discord/callback`

/** Endereço do login Discord. `state` é um token assinado (token.js). */
export function urlAutorizar(env, state) {
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', env.DISCORD_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectDiscord(env))
  url.searchParams.set('scope', 'identify guilds.join')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'consent')
  return url.toString()
}

/** Chamada à API do bot, com uma nova tentativa se o Discord pedir para esperar (429). */
async function chamarBot(env, fetchImpl, metodo, caminho, corpo) {
  for (let tentativa = 1; ; tentativa += 1) {
    const resposta = await fetchImpl(`${API}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (resposta.status === 429 && tentativa < 3) {
      const dados = await resposta.json().catch(() => ({}))
      await new Promise((r) => setTimeout(r, Math.min(5000, Math.ceil((Number(dados.retry_after) || 1) * 1000))))
      continue
    }
    return resposta
  }
}

/** Troca o código do login pelo access token da pessoa (usado uma vez, não é guardado). */
export async function trocarCodigo(env, codigo, fetchImpl = fetch) {
  const resposta = await fetchImpl(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: codigo,
      redirect_uri: redirectDiscord(env),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const corpo = await resposta.json().catch(() => ({}))
  if (!resposta.ok || !corpo.access_token) throw new Error(`Discord recusou o login (${corpo.error_description || corpo.error || resposta.status}).`)
  return corpo.access_token
}

/** Quem é a pessoa que entrou: { id, nome }. */
export async function usuarioAtual(accessToken, fetchImpl = fetch) {
  const resposta = await fetchImpl(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const corpo = await resposta.json().catch(() => ({}))
  if (!resposta.ok || !corpo.id) throw new Error(`Discord recusou a leitura do usuário (${resposta.status}).`)
  return { id: String(corpo.id), nome: corpo.global_name || corpo.username || null }
}

/** Coloca a pessoa no servidor (201 = entrou agora, 204 = já estava). */
export async function adicionarAoServidor(env, userId, accessToken, fetchImpl = fetch) {
  const resposta = await chamarBot(env, fetchImpl, 'PUT', `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, { access_token: accessToken })
  if (resposta.status !== 201 && resposta.status !== 204) throw new Error(`Discord não deixou entrar no servidor (${resposta.status}).`)
  return { jaEstava: resposta.status === 204 }
}

export async function darCargo(env, userId, cargoId, fetchImpl = fetch) {
  const resposta = await chamarBot(env, fetchImpl, 'PUT', `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${cargoId}`)
  if (resposta.status !== 204) throw new Error(`Discord não deu o cargo (${resposta.status}). O cargo do bot está acima dele na hierarquia?`)
}

/** Tira o cargo. 404 (a pessoa saiu do servidor) conta como feito. */
export async function tirarCargo(env, userId, cargoId, fetchImpl = fetch) {
  const resposta = await chamarBot(env, fetchImpl, 'DELETE', `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${cargoId}`)
  if (resposta.status !== 204 && resposta.status !== 404) throw new Error(`Discord não tirou o cargo (${resposta.status}).`)
}
