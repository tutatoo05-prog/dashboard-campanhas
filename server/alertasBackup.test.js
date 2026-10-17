import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gunzipSync } from 'node:zlib'
import { criarLimiteDeAvisos, enviarArquivoTelegram, enviarTelegram, telegramConfigurado, textoSimples } from './alertas.js'
import { avisarProblema } from './acesso/integracoes.js'
import { cifrar, dataEHoraEmSaoPaulo, decifrar, exportarBanco, rodarBackup } from './backup.js'
import { verificar } from './vigia.js'

const ENV_TELEGRAM = { TELEGRAM_BOT_TOKEN: '123:ABC', TELEGRAM_CHAT_ID: '99' }

// ── Telegram ──────────────────────────────────────────────────────────────────

test('textoSimples tira a formatação do WhatsApp', () => {
  assert.equal(textoSimples('⚠️ *Acesso precisa de atenção*\n_Veja em Acessos._'), '⚠️ Acesso precisa de atenção\nVeja em Acessos.')
})

test('enviarTelegram manda o texto para o chat e não vaza o token no erro', async () => {
  let pedido
  await enviarTelegram(ENV_TELEGRAM, '*oi*', async (url, opcoes) => {
    pedido = { url, corpo: JSON.parse(opcoes.body) }
    return new Response('{"ok":true}', { status: 200 })
  })
  assert.equal(pedido.url, 'https://api.telegram.org/bot123:ABC/sendMessage')
  assert.deepEqual([pedido.corpo.chat_id, pedido.corpo.text], ['99', 'oi'])

  await assert.rejects(
    enviarTelegram(ENV_TELEGRAM, 'x', async () => new Response('Unauthorized', { status: 401 })),
    (erro) => /401/.test(erro.message) && !erro.message.includes('123:ABC'),
  )
  assert.equal(telegramConfigurado({}), false)
})

test('avisarProblema: Telegram primeiro, WhatsApp da equipe se o Telegram falhar, e nunca lança', async () => {
  const chamadas = []
  const fetchImpl = async (url) => {
    chamadas.push(String(url))
    if (String(url).includes('telegram')) return new Response('erro', { status: 500 })
    return new Response('{}', { status: 200 })
  }
  const env = { ...ENV_TELEGRAM, EVOLUTION_URL: 'https://evo.exemplo', EVOLUTION_EQUIPE_INSTANCIA: 'tuz', EVOLUTION_EQUIPE_APIKEY: 'k', ACESSO_AVISO_NUMERO: '5511999999999' }
  await avisarProblema(env, 'teste', fetchImpl)
  assert.equal(chamadas.length, 2)
  assert.ok(chamadas[0].includes('telegram') && chamadas[1].includes('evo.exemplo'))
  // sem nada configurado, só registra e segue
  assert.deepEqual(await avisarProblema({}, 'teste', fetchImpl), { enviado: false })
})

test('limite de avisos: o mesmo aviso só repete depois do prazo', () => {
  let agora = 0
  const pode = criarLimiteDeAvisos(() => agora)
  assert.equal(pode('a', 60), true)
  assert.equal(pode('a', 60), false)
  assert.equal(pode('b', 60), true)
  agora = 61 * 60_000
  assert.equal(pode('a', 60), true)
})

// ── Vigia ─────────────────────────────────────────────────────────────────────

function consultaFalsa({ presos = 0, problemas = 0, total = 10, semana = 10, ultimo = new Date().toISOString() }) {
  return async (texto) => {
    if (texto.includes("estado = 'processando'")) return { rows: [{ n: presos }] }
    if (texto.includes("estado in ('falhou', 'atencao')")) return { rows: [{ n: problemas }] }
    return { rows: [{ total, semana, ultimo }] }
  }
}

test('vigia: tudo saudável não avisa nada', async () => {
  assert.deepEqual(await verificar({}, { consultar: consultaFalsa({}) }), [])
})

test('vigia: avisa evento preso, aluno sem acesso, webhook mudo e webhook que nunca recebeu nada', async () => {
  const chaves = async (opcoes) => (await verificar({}, { consultar: consultaFalsa(opcoes) })).map((aviso) => aviso.chave)
  assert.deepEqual(await chaves({ presos: 2 }), ['preso'])
  assert.deepEqual(await chaves({ problemas: 1 }), ['problemas'])
  assert.deepEqual(await chaves({ total: 0, semana: 0, ultimo: null }), ['nunca'])
  assert.deepEqual(await chaves({ total: 30, semana: 8, ultimo: new Date(Date.now() - 40 * 3600_000).toISOString() }), ['mudo'])
  // poucos eventos na semana não é "mudo": pode ser só uma semana parada
  assert.deepEqual(await chaves({ total: 30, semana: 2, ultimo: new Date(Date.now() - 40 * 3600_000).toISOString() }), [])
})

// ── Backup ────────────────────────────────────────────────────────────────────

test('cifrar/decifrar: volta igual com a senha certa e recusa a errada', () => {
  const original = Buffer.from('dados {"cpf":"123"}')
  const arquivo = cifrar(original, 'senha-bem-grande-123')
  assert.ok(!arquivo.includes('cpf'))
  assert.deepEqual(decifrar(arquivo, 'senha-bem-grande-123'), original)
  assert.throws(() => decifrar(arquivo, 'outra-senha-qualquer'), /Senha errada/)
  assert.throws(() => decifrar(Buffer.from('lixo'), 'x'), /não é um backup/)
})

test('dataEHoraEmSaoPaulo usa o fuso de São Paulo', () => {
  assert.deepEqual(dataEHoraEmSaoPaulo(new Date('2026-10-17T05:30:00Z')), { dia: '2026-10-17', hora: 2 })
  assert.deepEqual(dataEHoraEmSaoPaulo(new Date('2026-10-17T02:30:00Z')), { dia: '2026-10-16', hora: 23 })
})

function bancoFalso() {
  const tabelas = { users: [{ id: 1, email: 'a@x.com', cpf: '47024636831' }], leads: [{ id: 2 }], sessions: [{ token: 'segredo' }], planilhas_copia: [{ chave: 'registros' }] }
  return async (texto) => {
    if (texto.includes('pg_tables')) return { rows: Object.keys(tabelas).map((tablename) => ({ tablename })) }
    const nome = /from "(\w+)"/.exec(texto)[1]
    return { rows: tabelas[nome] }
  }
}

test('exportarBanco deixa de fora sessões e a cópia das planilhas', async () => {
  const banco = await exportarBanco(bancoFalso())
  assert.deepEqual(Object.keys(banco.tabelas).sort(), ['leads', 'users'])
})

test('rodarBackup grava criptografado na pasta, guarda só os últimos dias e manda ao Telegram', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bkp-'))
  for (const dia of ['2026-10-01', '2026-10-02', '2026-10-03']) await writeFile(join(dir, `dash-${dia}.bkp`), 'antigo')
  const enviados = []
  const env = { BACKUP_PASSPHRASE: 'uma-senha-forte-123', BACKUP_DIR: dir, BACKUP_DIAS: '2', ...ENV_TELEGRAM }
  const resumo = await rodarBackup(env, {
    consultar: bancoFalso(),
    enviarArquivo: async (_env, arquivo) => enviados.push(arquivo),
    agora: () => new Date('2026-10-17T12:00:00Z'),
  })
  assert.deepEqual(resumo.destinos, ['servidor', 'telegram'])
  assert.equal(resumo.linhas, 2)
  assert.deepEqual((await readdir(dir)).sort(), ['dash-2026-10-03.bkp', 'dash-2026-10-17.bkp']) // rotação: ficam 2
  assert.equal(enviados.length, 1)
  assert.equal(enviados[0].nome, 'dash-2026-10-17.bkp')
  const conteudo = JSON.parse(gunzipSync(decifrar(await readFile(join(dir, 'dash-2026-10-17.bkp')), 'uma-senha-forte-123')).toString())
  assert.equal(conteudo.tabelas.users[0].cpf, '47024636831')
  assert.ok(!(await readFile(join(dir, 'dash-2026-10-17.bkp'))).includes('47024636831'), 'o arquivo não pode ter dados em texto aberto')
})

test('rodarBackup exige senha forte e falha se não conseguiu guardar em lugar nenhum', async () => {
  await assert.rejects(rodarBackup({ BACKUP_PASSPHRASE: 'curta' }, { consultar: bancoFalso() }), /BACKUP_PASSPHRASE/)
  // uma pasta "dentro de um arquivo" nunca pode ser criada, em qualquer sistema
  const dirTemp = await mkdtemp(join(tmpdir(), 'bkp-'))
  const arquivo = join(dirTemp, 'arquivo')
  await writeFile(arquivo, 'x')
  await assert.rejects(
    rodarBackup({ BACKUP_PASSPHRASE: 'uma-senha-forte-123', BACKUP_DIR: join(arquivo, 'pasta') }, { consultar: bancoFalso() }),
    /nenhum lugar/,
  )
})

test('enviarArquivoTelegram manda como documento', async () => {
  let corpo
  await enviarArquivoTelegram(ENV_TELEGRAM, { nome: 'a.bkp', conteudo: Buffer.from('x'), legenda: '*ok*' }, async (_url, opcoes) => {
    corpo = opcoes.body
    return new Response('{"ok":true}', { status: 200 })
  })
  assert.equal(corpo.get('chat_id'), '99')
  assert.equal(corpo.get('caption'), 'ok')
  assert.equal(corpo.get('document').name, 'a.bkp')
})
