import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { handleDeployRequest, rodarDeploy } from './deploy.js'

function respostaFalsa() {
  return {
    statusCode: 0,
    corpo: '',
    setHeader() {},
    end(texto) {
      this.corpo = texto
    },
  }
}
const pedido = (metodo, token) => ({ method: metodo, headers: token === undefined ? {} : { 'x-deploy-token': token } })
const TOKEN = 'um-segredo-bem-comprido-123'

test('só aceita POST com o token certo, e fica desligado sem DEPLOY_TOKEN', async () => {
  const executar = async () => {
    throw new Error('não deveria rodar')
  }
  const chamar = async (req, env) => {
    const res = respostaFalsa()
    await handleDeployRequest(req, res, env, { executar })
    return res.statusCode
  }
  assert.equal(await chamar(pedido('GET', TOKEN), { DEPLOY_TOKEN: TOKEN }), 405)
  assert.equal(await chamar(pedido('POST', TOKEN), {}), 503)
  assert.equal(await chamar(pedido('POST', TOKEN), { DEPLOY_TOKEN: 'curto' }), 503)
  assert.equal(await chamar(pedido('POST'), { DEPLOY_TOKEN: TOKEN }), 401)
  assert.equal(await chamar(pedido('POST', 'outro-segredo-qualquer'), { DEPLOY_TOKEN: TOKEN }), 401)
})

test('com o token certo responde 202 na hora, roda uma vez só e recusa um segundo deploy ao mesmo tempo', async () => {
  let liberar
  const preso = new Promise((resolve) => {
    liberar = resolve
  })
  let execucoes = 0
  const executar = async () => {
    execucoes += 1
    await preso
  }
  const res1 = respostaFalsa()
  const primeira = handleDeployRequest(pedido('POST', TOKEN), res1, { DEPLOY_TOKEN: TOKEN }, { executar })
  assert.equal(res1.statusCode, 202)

  const res2 = respostaFalsa()
  await handleDeployRequest(pedido('POST', TOKEN), res2, { DEPLOY_TOKEN: TOKEN }, { executar })
  assert.equal(res2.statusCode, 409)

  liberar()
  await primeira
  assert.equal(execucoes, 1)

  const res3 = respostaFalsa()
  await handleDeployRequest(pedido('POST', TOKEN), res3, { DEPLOY_TOKEN: TOKEN }, { executar: async () => {} })
  assert.equal(res3.statusCode, 202) // liberou de novo depois que terminou
})

function spawnFalso(codigos) {
  const chamadas = []
  const impl = (comando, argumentos, opcoes) => {
    chamadas.push({ comando, argumentos, cwd: opcoes.cwd, path: opcoes.env.PATH })
    const filho = new EventEmitter()
    filho.stdout = new EventEmitter()
    filho.stderr = new EventEmitter()
    const codigo = codigos[chamadas.length - 1] ?? 0
    setImmediate(() => {
      filho.stdout.emit('data', Buffer.from(`saída do passo ${chamadas.length}\n`))
      filho.emit('close', codigo)
    })
    return filho
  }
  return { impl, chamadas }
}

test('rodarDeploy: instala, faz o build, reinicia o app e registra tudo no deploy.log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dep-'))
  const { impl, chamadas } = spawnFalso([0, 0])
  assert.equal(await rodarDeploy({ dir, spawnImpl: impl }), true)
  assert.deepEqual(chamadas.map((c) => c.argumentos.join(' ')), ['install --include=dev --no-audit --no-fund', 'run build'])
  assert.ok(chamadas.every((c) => c.cwd === dir))
  assert.ok(chamadas.every((c) => c.path.startsWith(process.execPath.replace(/[\\/][^\\/]*$/, ''))), 'o npm precisa ser achado pela pasta do node')
  const log = await readFile(join(dir, 'deploy.log'), 'utf8')
  assert.match(log, /npm install\.\.\./)
  assert.match(log, /saída do passo 2/)
  assert.match(log, /Deploy concluído/)
  assert.ok((await stat(join(dir, 'tmp', 'restart.txt'))).isFile(), 'precisa tocar o restart.txt')
})

test('rodarDeploy: se o build falha, não reinicia e o log diz ERRO', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dep-'))
  const { impl } = spawnFalso([0, 1])
  assert.equal(await rodarDeploy({ dir, spawnImpl: impl }), false)
  const log = await readFile(join(dir, 'deploy.log'), 'utf8')
  assert.match(log, /ERRO: npm run build falhou/)
  await assert.rejects(stat(join(dir, 'tmp', 'restart.txt')))
})
