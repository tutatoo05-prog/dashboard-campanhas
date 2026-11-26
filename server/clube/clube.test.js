import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { criarToken, lerToken } from './token.js'
import { cargoDe, cursosEssentials, statusDaConfiguracao } from './config.js'
import { listarMembrosYoutube, canalDoMembro, urlLoginGoogle, credenciaisDoLogin } from './youtube.js'
import { adicionarAoServidor, darCargo, tirarCargo, urlAutorizar } from './discord.js'
import { sincronizarClube } from './sync.js'
import { handleResgateRequest, zerarLimitesDoResgate } from './resgate.js'
import { handleClubeRequest } from './handler.js'

const ENV = {
  CLUBE_SEGREDO: 'segredo-de-teste',
  APP_URL: 'https://dash.exemplo.test',
  YOUTUBE_CLIENT_ID: 'cid',
  YOUTUBE_CLIENT_SECRET: 'csecret',
  YOUTUBE_MEMBROS_REFRESH_TOKEN: 'rtoken',
  DISCORD_BOT_TOKEN: 'bot',
  DISCORD_GUILD_ID: '111111111111',
  DISCORD_CLIENT_ID: 'dcid',
  DISCORD_CLIENT_SECRET: 'dsecret',
  DISCORD_ROLE_YOUTUBE: '222222222222',
  DISCORD_ROLE_ESSENTIALS: '333333333333',
  BREVO_API_KEY: 'brevo',
  BREVO_REMETENTE_EMAIL: 'no-reply@exemplo.test',
}

// ───────────────────────────── token
test('token: ida e volta, validade, propósito e adulteração', () => {
  const t = criarToken(ENV, 'resgate', { m: 7 }, 60_000, 1000)
  assert.equal(lerToken(ENV, 'resgate', t, 2000).m, 7)
  assert.equal(lerToken(ENV, 'resgate', t, 1000 + 60_001), null, 'vencido')
  assert.equal(lerToken(ENV, 'discord-state', t, 2000), null, 'propósito errado')
  const [corpo, assinatura] = t.split('.')
  const outro = Buffer.from(JSON.stringify({ m: 8, exp: 99999999999999 })).toString('base64url')
  assert.equal(lerToken(ENV, 'resgate', `${outro}.${assinatura}`, 2000), null, 'payload trocado')
  assert.equal(lerToken(ENV, 'resgate', `${corpo}.x`, 2000), null)
  assert.equal(lerToken({ ...ENV, CLUBE_SEGREDO: 'outro' }, 'resgate', t, 2000), null, 'outro segredo')
  assert.equal(lerToken(ENV, 'resgate', 'lixo', 2000), null)
  assert.equal(lerToken(ENV, 'resgate', undefined, 2000), null)
  assert.equal(criarToken({}, 'resgate', { m: 1 }, 1000), null, 'sem segredo não cria')
})

test('token: não carrega e-mail nem nada pessoal, só o id', () => {
  const t = criarToken(ENV, 'resgate', { m: 7 }, 60_000)
  assert.doesNotMatch(Buffer.from(t.split('.')[0], 'base64url').toString(), /@/)
})

// ───────────────────────────── config
test('config: diz o que falta sem mostrar valores', () => {
  const vazio = statusDaConfiguracao({})
  assert.equal(vazio.find((b) => b.id === 'discord').pronto, false)
  assert.ok(vazio.find((b) => b.id === 'discord').faltando.includes('DISCORD_BOT_TOKEN'))
  assert.equal(vazio.find((b) => b.id === 'essentials').pronto, true)
  const completo = statusDaConfiguracao(ENV)
  assert.ok(completo.every((b) => b.pronto))
  assert.doesNotMatch(JSON.stringify(completo), /segredo-de-teste|csecret|dsecret/)
})

test('config: cursos da Essentials e cargos', () => {
  assert.deepEqual(cursosEssentials({}), ['Essentials'])
  assert.deepEqual(cursosEssentials({ CLUBE_ESSENTIALS_CURSOS: ' Essentials , Essentials 7 ' }), ['Essentials', 'Essentials 7'])
  assert.equal(cargoDe(ENV, 'youtube'), '222222222222')
  assert.equal(cargoDe(ENV, 'essentials'), '333333333333')
  assert.equal(cargoDe({ DISCORD_ROLE_YOUTUBE: 'abc' }, 'youtube'), null)
})

// ───────────────────────────── YouTube
function respostaJson(corpo, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo }
}

test('youtube: lista os membros percorrendo as páginas e sem e-mail', async () => {
  const chamadas = []
  const fetchFalso = async (url, opcoes) => {
    const u = String(url)
    chamadas.push(u)
    if (u.includes('oauth2.googleapis.com/token')) {
      assert.match(String(opcoes.body), /refresh_token=rtoken/)
      return respostaJson({ access_token: 'acesso' })
    }
    assert.equal(opcoes.headers.Authorization, 'Bearer acesso')
    if (!u.includes('pageToken')) {
      return respostaJson({
        items: [{ snippet: { memberDetails: { channelId: 'UC1', displayName: 'Ana' }, membershipsDetails: { highestAccessibleLevelDisplayName: 'Apoiador', membershipsDuration: { memberSince: '2026-01-01T00:00:00Z' } } } }],
        nextPageToken: 'p2',
      })
    }
    return respostaJson({ items: [{ snippet: { memberDetails: { channelId: 'UC2', displayName: 'Bia' } } }, { snippet: {} }] })
  }
  const membros = await listarMembrosYoutube(ENV, fetchFalso)
  assert.deepEqual(membros.map((m) => m.chave), ['UC1', 'UC2'])
  assert.equal(membros[0].nivel, 'Apoiador')
  assert.equal(membros[0].desde, '2026-01-01T00:00:00Z')
  assert.ok(chamadas.some((c) => c.includes('mode=all_current')))
})

test('youtube: token recusado vira erro claro', async () => {
  const fetchFalso = async () => respostaJson({ error: 'invalid_grant', error_description: 'Token expirado' }, 400)
  await assert.rejects(() => listarMembrosYoutube(ENV, fetchFalso), /Google recusou o token dos membros/)
})

test('youtube: canal de quem entrou com o Google', async () => {
  const fetchFalso = async (url) => {
    if (String(url).includes('oauth2.googleapis.com/token')) return respostaJson({ access_token: 'a' })
    return respostaJson({ items: [{ id: 'UCmembro' }] })
  }
  assert.equal(await canalDoMembro(ENV, 'codigo', fetchFalso), 'UCmembro')
  const semCanal = async (url) => (String(url).includes('oauth2') ? respostaJson({ access_token: 'a' }) : respostaJson({}))
  assert.equal(await canalDoMembro(ENV, 'codigo', semCanal), null)
})

test('youtube: o endereço do login leva state e o retorno do dash', () => {
  const u = new URL(urlLoginGoogle(ENV, 'ESTADO'))
  assert.equal(u.searchParams.get('state'), 'ESTADO')
  assert.equal(u.searchParams.get('redirect_uri'), 'https://dash.exemplo.test/api/clube/resgate/google/callback')
  assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/youtube.readonly')
})

// ───────────────────────────── Discord
test('discord: entra no servidor, dá e tira cargo; 404 ao tirar conta como feito', async () => {
  const feitas = []
  const fetchFalso = (status) => async (url, opcoes) => {
    feitas.push([opcoes.method, String(url).replace('https://discord.com/api/v10', ''), opcoes.headers.Authorization])
    return { status, json: async () => ({}) }
  }
  assert.deepEqual(await adicionarAoServidor(ENV, '9', 'acc', fetchFalso(201)), { jaEstava: false })
  assert.deepEqual(await adicionarAoServidor(ENV, '9', 'acc', fetchFalso(204)), { jaEstava: true })
  await assert.rejects(() => adicionarAoServidor(ENV, '9', 'acc', fetchFalso(403)), /não deixou entrar/)
  await darCargo(ENV, '9', '333333333333', fetchFalso(204))
  await assert.rejects(() => darCargo(ENV, '9', '333333333333', fetchFalso(403)), /hierarquia/)
  await tirarCargo(ENV, '9', '333333333333', fetchFalso(404))
  await assert.rejects(() => tirarCargo(ENV, '9', '333333333333', fetchFalso(500)), /não tirou/)
  assert.deepEqual(feitas[0], ['PUT', '/guilds/111111111111/members/9', 'Bot bot'])
  assert.ok(feitas.some((f) => f[0] === 'PUT' && f[1] === '/guilds/111111111111/members/9/roles/333333333333'))
  assert.ok(feitas.some((f) => f[0] === 'DELETE'))
})

test('discord: o endereço do login pede só identify e guilds.join', () => {
  const u = new URL(urlAutorizar(ENV, 'E'))
  assert.equal(u.searchParams.get('scope'), 'identify guilds.join')
  assert.equal(u.searchParams.get('redirect_uri'), 'https://dash.exemplo.test/api/clube/resgate/discord/callback')
})

// ───────────────────────────── banco falso
function repoFalso(inicial = []) {
  const membros = inicial.map((m, i) => ({ id: i + 1, status: 'ativo', discord_id: null, cargo_aplicado: false, ...m }))
  const r = {
    membros,
    snapshots: [],
    estados: {},
    ehFaltaDeTabela: () => false,
    async lerEssentials() { return r.fonteEssentials ?? [] },
    async chavesAtivas(_env, p) { return new Set(membros.filter((m) => m.plataforma === p && m.status === 'ativo').map((m) => m.chave)) },
    async aplicarLista(_env, p, lista) {
      const antes = await r.chavesAtivas(_env, p)
      const agora = new Set(lista.map((m) => m.chave))
      for (const m of lista) {
        const ex = membros.find((x) => x.plataforma === p && x.chave === m.chave)
        if (ex) Object.assign(ex, { status: 'ativo', nome: m.nome })
        else membros.push({ id: membros.length + 1, plataforma: p, chave: m.chave, nome: m.nome, status: 'ativo', discord_id: null, cargo_aplicado: false })
      }
      const saidas = [...antes].filter((c) => !agora.has(c))
      for (const c of saidas) membros.find((x) => x.plataforma === p && x.chave === c).status = 'cancelado'
      return { ativos: lista.length, novos: [...agora].filter((c) => !antes.has(c)).length, cancelados: saidas.length }
    },
    async gravarSnapshot(_e, p, v) { r.snapshots.push([p, v]) },
    async gravarEstado(_e, k, v) { r.estados[k] = v },
    async pendentesDeRevogar() { return membros.filter((m) => m.status === 'cancelado' && m.discord_id && m.cargo_aplicado) },
    async marcarCargoRevogado(_e, id) { membros.find((m) => m.id === id).cargo_aplicado = false },
    async buscarAtivo(_e, p, chave) { return membros.find((m) => m.plataforma === p && m.chave === chave && m.status === 'ativo') ?? null },
    async buscarAtivoPorId(_e, id) { return membros.find((m) => m.id === Number(id) && m.status === 'ativo') ?? null },
    async vincularDiscord(_e, id, { discordId, discordNome }) { Object.assign(membros.find((m) => m.id === id), { discord_id: discordId, discord_nome: discordNome, cargo_aplicado: true }) },
  }
  return r
}

// ───────────────────────────── sincronização
test('sync: Essentials e YouTube entram, quem saiu perde o cargo do Discord', async () => {
  const repo = repoFalso([
    { plataforma: 'essentials', chave: 'saiu@x.com', discord_id: '555', cargo_aplicado: true },
    { plataforma: 'essentials', chave: 'fica@x.com' },
  ])
  repo.fonteEssentials = [{ chave: 'fica@x.com', nome: 'Fica' }, { chave: 'novo@x.com', nome: 'Novo' }]
  const removidos = []
  const resultado = await sincronizarClube(ENV, {
    repo,
    youtube: { listarMembrosYoutube: async () => [{ chave: 'UC1', nome: 'Ana' }] },
    discord: { tirarCargo: async (_e, id, cargo) => removidos.push([id, cargo]) },
  })
  assert.deepEqual(resultado.essentials, { ativos: 2, novos: 1, cancelados: 1 })
  assert.deepEqual(resultado.youtube, { ativos: 1, novos: 1, cancelados: 0 })
  assert.deepEqual(removidos, [['555', '333333333333']])
  assert.equal(resultado.discord.cargosRemovidos, 1)
  assert.equal(repo.membros.find((m) => m.chave === 'saiu@x.com').cargo_aplicado, false)
  assert.ok(repo.estados.essentials && repo.estados.youtube && repo.estados.discord)
})

test('sync: fonte vazia com gente ativa NÃO cancela ninguém (trava de segurança)', async () => {
  const repo = repoFalso([{ plataforma: 'youtube', chave: 'UC1', discord_id: '5', cargo_aplicado: true }])
  repo.fonteEssentials = []
  const removidos = []
  const resultado = await sincronizarClube(ENV, {
    repo,
    youtube: { listarMembrosYoutube: async () => [] },
    discord: { tirarCargo: async (...a) => removidos.push(a) },
  })
  assert.match(resultado.youtube.aviso, /nada foi cancelado/)
  assert.equal(repo.membros[0].status, 'ativo')
  assert.deepEqual(removidos, [])
})

test('sync: uma fonte que falha não derruba as outras, e sem configuração é pulada', async () => {
  const repo = repoFalso()
  repo.fonteEssentials = [{ chave: 'a@x.com', nome: 'A' }]
  const r1 = await sincronizarClube(ENV, { repo, youtube: { listarMembrosYoutube: async () => { throw new Error('Google fora do ar') } }, discord: { tirarCargo: async () => {} } })
  assert.equal(r1.essentials.ativos, 1)
  assert.match(r1.youtube.erro, /Google fora do ar/)
  const r2 = await sincronizarClube({}, { repo: repoFalso() })
  assert.equal(r2.youtube.pulado, 'não configurado')
  assert.equal(r2.discord.pulado, 'não configurado')
})

test('sync: falha ao tirar o cargo de um não impede os outros e fica registrada', async () => {
  const repo = repoFalso([
    { plataforma: 'essentials', chave: 'a@x.com', status: 'cancelado', discord_id: '1', cargo_aplicado: true },
    { plataforma: 'essentials', chave: 'b@x.com', status: 'cancelado', discord_id: '2', cargo_aplicado: true },
  ])
  repo.fonteEssentials = [{ chave: 'c@x.com', nome: 'C' }]
  const r = await sincronizarClube(ENV, {
    repo,
    youtube: { listarMembrosYoutube: async () => [{ chave: 'UC1' }] },
    discord: { tirarCargo: async (_e, id) => { if (id === '1') throw new Error('Discord 500') } },
  })
  assert.equal(r.discord.cargosRemovidos, 1)
  assert.equal(r.discord.falhas, 1)
  assert.equal(repo.membros.find((m) => m.discord_id === '1').cargo_aplicado, true, 'tenta de novo na próxima rodada')
})

// ───────────────────────────── resgate
function pedido(metodo, url, { corpo, ip = '10.0.0.1' } = {}) {
  const req = Readable.from(corpo === undefined ? [] : [typeof corpo === 'string' ? corpo : JSON.stringify(corpo)])
  req.method = metodo
  req.url = url
  req.headers = { 'x-forwarded-for': ip }
  req.socket = {}
  const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v }, end(b) { this.corpo = b } }
  return { req, res }
}
async function chamar(metodo, url, opcoes, deps, env = ENV) {
  const { req, res } = pedido(metodo, url, opcoes)
  await handleResgateRequest(req, res, env, deps)
  return { status: res.statusCode, local: res.headers.Location, json: res.corpo ? JSON.parse(res.corpo) : null }
}
const paginaErro = (local) => new URL(local).searchParams.get('erro')

test('resgate Essentials: e-mail de membro recebe o link; e-mail desconhecido recebe a MESMA resposta e nenhum e-mail', async () => {
  zerarLimitesDoResgate()
  const repo = repoFalso([{ plataforma: 'essentials', chave: 'ana@x.com', nome: 'Ana Silva' }])
  const enviados = []
  const deps = { repo, enviarEmail: async (_e, dados) => enviados.push(dados) }

  const a = await chamar('POST', '/api/clube/resgate/email', { corpo: { email: ' Ana@X.com ' } }, deps)
  const b = await chamar('POST', '/api/clube/resgate/email', { corpo: { email: 'ninguem@x.com' } }, deps)
  assert.equal(a.status, 200)
  assert.deepEqual(a.json, b.json, 'mesma resposta: não revela quem é membro')
  assert.equal(enviados.length, 1)
  assert.equal(enviados[0].para, 'ana@x.com')
  const link = enviados[0].html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&')
  assert.match(link, /^https:\/\/dash\.exemplo\.test\/discord\?t=/)
  const token = new URL(link).searchParams.get('t')
  assert.equal(lerToken(ENV, 'resgate', token).m, 1)
  assert.doesNotMatch(link, /ana/i, 'nada pessoal no endereço')
})

test('resgate Essentials: e-mail inválido, limite por e-mail e por IP, sem configuração', async () => {
  zerarLimitesDoResgate()
  const repo = repoFalso([{ plataforma: 'essentials', chave: 'ana@x.com' }])
  const enviados = []
  const deps = { repo, enviarEmail: async (_e, d) => enviados.push(d) }
  assert.equal((await chamar('POST', '/api/clube/resgate/email', { corpo: { email: 'isso nao e email' } }, deps)).status, 400)
  assert.equal((await chamar('POST', '/api/clube/resgate/email', { corpo: 'nao-json' }, deps)).status, 400)
  for (let i = 0; i < 4; i += 1) await chamar('POST', '/api/clube/resgate/email', { corpo: { email: 'ana@x.com' }, ip: '1.1.1.1' }, deps)
  assert.equal(enviados.length, 3, 'só 3 e-mails por hora para o mesmo endereço')
  zerarLimitesDoResgate()
  let ultimo
  for (let i = 0; i < 6; i += 1) ultimo = await chamar('POST', '/api/clube/resgate/email', { corpo: { email: `x${i}@x.com` }, ip: '2.2.2.2' }, deps)
  assert.equal(ultimo.status, 429, '5 pedidos por IP a cada 15 minutos')
  zerarLimitesDoResgate()
  assert.equal((await chamar('POST', '/api/clube/resgate/email', { corpo: { email: 'a@x.com' } }, deps, {})).status, 503)
})

test('resgate: falha ao enviar o e-mail não muda a resposta (não revela o membro)', async () => {
  zerarLimitesDoResgate()
  const repo = repoFalso([{ plataforma: 'essentials', chave: 'ana@x.com' }])
  const r = await chamar('POST', '/api/clube/resgate/email', { corpo: { email: 'ana@x.com' } }, { repo, enviarEmail: async () => { throw new Error('Brevo 500') } })
  assert.equal(r.status, 200)
})

test('resgate YouTube: o Google confirma o canal; só membro ativo segue', async () => {
  zerarLimitesDoResgate()
  const repo = repoFalso([{ plataforma: 'youtube', chave: 'UCmembro', nome: 'Ana' }, { plataforma: 'youtube', chave: 'UCsaiu', status: 'cancelado' }])
  const youtube = {
    urlLoginGoogle: (env, state) => `https://google.test/auth?state=${state}`,
    canalDoMembro: async (_e, codigo) => ({ bom: 'UCmembro', saiu: 'UCsaiu', outro: 'UCoutro', vazio: null }[codigo]),
  }
  const deps = { repo, youtube }

  const inicio = await chamar('GET', '/api/clube/resgate/google', {}, deps)
  assert.equal(inicio.status, 302)
  const state = new URL(inicio.local).searchParams.get('state')
  assert.ok(lerToken(ENV, 'google-state', state))

  const ok = await chamar('GET', `/api/clube/resgate/google/callback?code=bom&state=${state}`, {}, deps)
  const token = new URL(ok.local).searchParams.get('t')
  assert.equal(lerToken(ENV, 'resgate', token).m, 1)
  assert.equal(paginaErro((await chamar('GET', `/api/clube/resgate/google/callback?code=outro&state=${state}`, {}, deps)).local), 'nao-membro')
  assert.equal(paginaErro((await chamar('GET', `/api/clube/resgate/google/callback?code=saiu&state=${state}`, {}, deps)).local), 'nao-membro')
  assert.equal(paginaErro((await chamar('GET', `/api/clube/resgate/google/callback?code=vazio&state=${state}`, {}, deps)).local), 'sem-canal')
  assert.equal(paginaErro((await chamar('GET', '/api/clube/resgate/google/callback?code=bom&state=forjado', {}, deps)).local), 'link-expirado', 'state forjado')
  assert.equal(paginaErro((await chamar('GET', `/api/clube/resgate/google/callback?error=access_denied&state=${state}`, {}, deps)).local), 'cancelado')
})

test('resgate Discord: entra no servidor, ganha o cargo certo e a ligação é gravada', async () => {
  zerarLimitesDoResgate()
  const repo = repoFalso([{ plataforma: 'essentials', chave: 'ana@x.com', nome: 'Ana' }, { plataforma: 'youtube', chave: 'UC1' }])
  const feitas = []
  const discord = {
    urlAutorizar: (env, state) => `https://discord.test/authorize?state=${state}`,
    trocarCodigo: async () => 'acesso-discord',
    usuarioAtual: async () => ({ id: '777', nome: 'ana#1' }),
    adicionarAoServidor: async (_e, id, acc) => feitas.push(['entrar', id, acc]),
    darCargo: async (_e, id, cargo) => feitas.push(['cargo', id, cargo]),
    tirarCargo: async (_e, id, cargo) => feitas.push(['tirar', id, cargo]),
  }
  const deps = { repo, discord }
  const link = criarToken(ENV, 'resgate', { m: 1 }, 60_000)

  const inicio = await chamar('GET', `/api/clube/resgate/discord?t=${link}`, {}, deps)
  const state = new URL(inicio.local).searchParams.get('state')
  assert.equal(lerToken(ENV, 'discord-state', state).m, 1)

  const fim = await chamar('GET', `/api/clube/resgate/discord/callback?code=abc&state=${state}`, {}, deps)
  assert.equal(new URL(fim.local).searchParams.get('ok'), '1')
  assert.deepEqual(feitas, [['entrar', '777', 'acesso-discord'], ['cargo', '777', '333333333333']])
  assert.equal(repo.membros[0].discord_id, '777')
  assert.equal(repo.membros[0].cargo_aplicado, true)

  // o membro do YouTube recebe o cargo do YouTube
  feitas.length = 0
  const state2 = criarToken(ENV, 'discord-state', { m: 2 }, 60_000)
  await chamar('GET', `/api/clube/resgate/discord/callback?code=abc&state=${state2}`, {}, deps)
  assert.equal(feitas[1][2], '222222222222')
})

test('resgate Discord: refazer com outra conta tira o cargo da anterior', async () => {
  zerarLimitesDoResgate()
  const repo = repoFalso([{ plataforma: 'essentials', chave: 'ana@x.com', discord_id: '111', cargo_aplicado: true }])
  const feitas = []
  const discord = {
    trocarCodigo: async () => 'a',
    usuarioAtual: async () => ({ id: '999', nome: 'nova' }),
    adicionarAoServidor: async () => {},
    darCargo: async (_e, id) => feitas.push(['cargo', id]),
    tirarCargo: async (_e, id) => feitas.push(['tirar', id]),
  }
  const state = criarToken(ENV, 'discord-state', { m: 1 }, 60_000)
  await chamar('GET', `/api/clube/resgate/discord/callback?code=abc&state=${state}`, {}, { repo, discord })
  assert.deepEqual(feitas, [['cargo', '999'], ['tirar', '111']])
  assert.equal(repo.membros[0].discord_id, '999')
})

test('resgate Discord: link vencido, state de outro propósito, membro que saiu e falha do Discord', async () => {
  zerarLimitesDoResgate()
  const repo = repoFalso([{ plataforma: 'essentials', chave: 'ana@x.com' }, { plataforma: 'essentials', chave: 'saiu@x.com', status: 'cancelado' }])
  const discord = {
    urlAutorizar: () => 'https://discord.test/x',
    trocarCodigo: async () => { throw new Error('Discord recusou') },
    usuarioAtual: async () => ({ id: '1' }),
    adicionarAoServidor: async () => {},
    darCargo: async () => {},
    tirarCargo: async () => {},
  }
  const deps = { repo, discord }
  const vencido = criarToken(ENV, 'resgate', { m: 1 }, 1000, Date.now() - 60_000)
  assert.equal(paginaErro((await chamar('GET', `/api/clube/resgate/discord?t=${vencido}`, {}, deps)).local), 'link-expirado')
  assert.equal(paginaErro((await chamar('GET', '/api/clube/resgate/discord?t=lixo', {}, deps)).local), 'link-expirado')
  const doGoogle = criarToken(ENV, 'google-state', { m: 1 }, 60_000)
  assert.equal(paginaErro((await chamar('GET', `/api/clube/resgate/discord/callback?code=a&state=${doGoogle}`, {}, deps)).local), 'link-expirado', 'um token não vale em outro propósito')
  const saiu = criarToken(ENV, 'discord-state', { m: 2 }, 60_000)
  assert.equal(paginaErro((await chamar('GET', `/api/clube/resgate/discord/callback?code=a&state=${saiu}`, {}, deps)).local), 'nao-membro')
  const bom = criarToken(ENV, 'discord-state', { m: 1 }, 60_000)
  assert.equal(paginaErro((await chamar('GET', `/api/clube/resgate/discord/callback?code=a&state=${bom}`, {}, deps)).local), 'discord-falhou')
  assert.equal(repo.membros[0].discord_id, null, 'nada gravado quando falha')
  assert.equal(paginaErro((await chamar('GET', `/api/clube/resgate/discord/callback?error=access_denied&state=${bom}`, {}, deps)).local), 'cancelado')
})

test('resgate: sem configuração do Discord ou do Google, a página recebe "indisponivel"; rota estranha 404; POST errado 405', async () => {
  zerarLimitesDoResgate()
  const deps = { repo: repoFalso([{ plataforma: 'essentials', chave: 'a@x.com' }]) }
  const link = criarToken(ENV, 'resgate', { m: 1 }, 60_000)
  assert.equal(paginaErro((await chamar('GET', `/api/clube/resgate/discord?t=${link}`, {}, deps, { CLUBE_SEGREDO: 'segredo-de-teste' })).local), 'indisponivel')
  assert.equal(paginaErro((await chamar('GET', '/api/clube/resgate/google', {}, deps, { CLUBE_SEGREDO: 'x' })).local), 'indisponivel')
  assert.equal((await chamar('GET', '/api/clube/resgate/nada', {}, deps)).status, 404)
  assert.equal((await chamar('POST', '/api/clube/resgate/google', {}, deps)).status, 405)
})

test('resgate: o redirecionamento não deixa o código vazar para a página seguinte', async () => {
  zerarLimitesDoResgate()
  const { req, res } = pedido('GET', '/api/clube/resgate/google')
  await handleResgateRequest(req, res, ENV, { repo: repoFalso(), youtube: { urlLoginGoogle: () => 'https://g.test' } })
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer')
  assert.equal(res.headers['Cache-Control'], 'no-store')
})

// ───────────────────────────── painel
test('painel: devolve o que falta, os endereços para cadastrar e os números; sem tabela avisa a migração', async () => {
  const req = { method: 'GET', url: '/api/clube' }
  const res = { headers: {}, statusCode: 0, setHeader() {}, end(b) { this.corpo = JSON.parse(b) } }
  await handleClubeRequest(req, res, {}, { repo: { resumo: async () => ({ plataformas: { youtube: { ativos: 3 } }, evolucao: [], estado: {} }), listar: async () => [{ id: 1 }], ehFaltaDeTabela: () => false } })
  assert.equal(res.corpo.membros.length, 1)
  assert.equal(res.corpo.enderecos.retornoDiscord, 'https://dash.tuzinho.academy/api/clube/resgate/discord/callback')
  assert.ok(res.corpo.config.find((b) => b.id === 'discord').faltando.length > 0)

  const res2 = { headers: {}, statusCode: 0, setHeader() {}, end(b) { this.corpo = JSON.parse(b) } }
  const erro = Object.assign(new Error('x'), { code: '42P01' })
  await handleClubeRequest(req, res2, {}, { repo: { resumo: async () => { throw erro }, listar: async () => [], ehFaltaDeTabela: (e) => e?.code === '42P01' } })
  assert.equal(res2.corpo.precisaMigracao, true)

  const res3 = { headers: {}, statusCode: 0, setHeader() {}, end(b) { this.corpo = JSON.parse(b) } }
  await handleClubeRequest({ method: 'POST', url: '/api/clube/sincronizar' }, res3, {}, { sincronizar: async () => ({ essentials: { ativos: 1 } }) })
  assert.equal(res3.corpo.resultado.essentials.ativos, 1)
})

// ───────────────────────────── login Google com credenciais próprias
test('login Google: usa CLUBE_GOOGLE_* quando existe e cai nas do canal quando não', async () => {
  assert.deepEqual(credenciaisDoLogin(ENV), { id: 'cid', segredo: 'csecret' })
  const proprio = { ...ENV, CLUBE_GOOGLE_CLIENT_ID: 'pub-id', CLUBE_GOOGLE_CLIENT_SECRET: 'pub-secret' }
  assert.deepEqual(credenciaisDoLogin(proprio), { id: 'pub-id', segredo: 'pub-secret' })
  assert.equal(new URL(urlLoginGoogle(proprio, 'E')).searchParams.get('client_id'), 'pub-id')

  const corpos = []
  const fetchFalso = async (url, opcoes) => {
    if (String(url).includes('oauth2.googleapis.com/token')) { corpos.push(String(opcoes.body)); return respostaJson({ access_token: 'a' }) }
    return respostaJson({ items: [{ id: 'UC9' }] })
  }
  assert.equal(await canalDoMembro(proprio, 'codigo', fetchFalso), 'UC9')
  assert.match(corpos[0], /client_id=pub-id/)
  assert.match(corpos[0], /client_secret=pub-secret/)
  assert.doesNotMatch(corpos[0], /csecret/, 'o segredo do canal não é usado no login público')
})

test('config: o par próprio do login precisa vir completo; sem ele vale o do canal', () => {
  const bloco = (env) => statusDaConfiguracao(env).find((b) => b.id === 'resgate-youtube')
  const base = { ...ENV }
  delete base.YOUTUBE_CLIENT_ID
  delete base.YOUTUBE_CLIENT_SECRET
  assert.deepEqual(bloco(base).faltando, ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'])
  assert.equal(bloco({ ...base, CLUBE_GOOGLE_CLIENT_ID: 'a', CLUBE_GOOGLE_CLIENT_SECRET: 'b' }).pronto, true)
  assert.deepEqual(bloco({ ...base, CLUBE_GOOGLE_CLIENT_ID: 'a' }).faltando, ['CLUBE_GOOGLE_CLIENT_SECRET'])
  assert.equal(bloco(ENV).pronto, true, 'o par do canal continua servindo')
})
