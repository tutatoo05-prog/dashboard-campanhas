// Configuração do clube: o que o servidor precisa para cada parte funcionar (a tela Clube mostra o que falta).
// Nada aqui lê segredo para a tela: só diz QUAIS variáveis faltam, nunca os valores.

const BASE_PADRAO = 'https://dash.tuzinho.academy'

/** Cursos da tabela `acessos` que contam como membro "Essentials" (nome exato, separados por vírgula em CLUBE_ESSENTIALS_CURSOS). */
export function cursosEssentials(env) {
  const lista = String(env.CLUBE_ESSENTIALS_CURSOS ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  return lista.length ? lista : ['Essentials', 'Mentoria Essentials']
}

export function appUrl(env) {
  return String(env.APP_URL || BASE_PADRAO).replace(/\/+$/, '')
}

/** Segredo que assina os links e os "estados" do resgate. CLUBE_SEGREDO manda; sem ele usa o token da API V2 (que já existe). */
export function segredoDoClube(env) {
  return String(env.CLUBE_SEGREDO || env.TELWAY_V2_TOKEN || '').trim() || null
}

const tem = (env, nomes) => nomes.filter((n) => !String(env[n] ?? '').trim())

/** O login público do Google usa CLUBE_GOOGLE_* (se algum dos dois existir, exige os dois) ou, sem eles, YOUTUBE_CLIENT_ID/SECRET. */
function faltaDoLoginGoogle(env) {
  const proprio = String(env.CLUBE_GOOGLE_CLIENT_ID ?? '').trim() || String(env.CLUBE_GOOGLE_CLIENT_SECRET ?? '').trim()
  return proprio ? tem(env, ['CLUBE_GOOGLE_CLIENT_ID', 'CLUBE_GOOGLE_CLIENT_SECRET']) : tem(env, ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'])
}

/** Cargo do Discord para cada plataforma. */
export function cargoDe(env, plataforma) {
  const id = String((plataforma === 'youtube' ? env.DISCORD_ROLE_YOUTUBE : env.DISCORD_ROLE_ESSENTIALS) ?? '').trim()
  return /^\d{5,25}$/.test(id) ? id : null
}

/**
 * Cada bloco é uma capacidade do clube e o que ainda falta para ela ligar.
 * `faltando` lista nomes de variáveis de ambiente (ou do segredo), nunca valores.
 */
export function statusDaConfiguracao(env) {
  const segredoFalta = segredoDoClube(env) ? [] : ['CLUBE_SEGREDO (ou TELWAY_V2_TOKEN)']
  const blocos = [
    {
      id: 'youtube-membros',
      titulo: 'Membros do YouTube (lista do canal)',
      dica: 'Autorização do dono do canal com o escopo youtube.channel-memberships.creator.',
      faltando: tem(env, ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_MEMBROS_REFRESH_TOKEN']),
    },
    {
      id: 'essentials',
      titulo: 'Membros da Essentials (vem da tabela acessos)',
      dica: `Conta os acessos ativos e vigentes dos cursos: ${cursosEssentials(env).join(', ')}.`,
      faltando: [],
    },
    {
      id: 'discord',
      titulo: 'Discord (bot, entrada no servidor e cargos)',
      dica: 'App e bot criados no Discord Developer Portal; o cargo do bot precisa ficar acima dos cargos de membro.',
      faltando: tem(env, ['DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_ROLE_YOUTUBE', 'DISCORD_ROLE_ESSENTIALS']),
    },
    {
      id: 'resgate-essentials',
      titulo: 'Resgate por e-mail (Essentials)',
      dica: 'Manda um link de confirmação ao e-mail do aluno (Brevo).',
      faltando: [...tem(env, ['BREVO_API_KEY', 'BREVO_REMETENTE_EMAIL']), ...segredoFalta],
    },
    {
      id: 'resgate-youtube',
      titulo: 'Resgate com a conta Google (YouTube)',
      dica: 'O membro entra com o Google para provarmos qual canal é o dele (escopo youtube.readonly; o Google exige verificação do app para o público geral). Ideal: credenciais próprias CLUBE_GOOGLE_CLIENT_ID/SECRET, de um projeto separado.',
      faltando: [...faltaDoLoginGoogle(env), ...segredoFalta],
    },
  ]
  return blocos.map((b) => ({ ...b, pronto: b.faltando.length === 0 }))
}

export const discordConfigurado = (env) => statusDaConfiguracao(env).find((b) => b.id === 'discord').pronto
export const youtubeMembrosConfigurado = (env) => statusDaConfiguracao(env).find((b) => b.id === 'youtube-membros').pronto
export const resgateEssentialsConfigurado = (env) => statusDaConfiguracao(env).find((b) => b.id === 'resgate-essentials').pronto && discordConfigurado(env)
export const resgateYoutubeConfigurado = (env) => statusDaConfiguracao(env).find((b) => b.id === 'resgate-youtube').pronto && discordConfigurado(env)
