import { spawn } from 'node:child_process'
import { createHash, timingSafeEqual } from 'node:crypto'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'

/**
 * Deploy feito pelo próprio dash.
 *
 * O ambiente em que o Plesk roda as "ações pós-implantação" é uma jaula sem node, npm, git nem date: nada de build lá.
 * Mas ele tem `curl`. Então a ação do Plesk só chama POST /api/deploy (com o segredo DEPLOY_TOKEN) e o dash, que
 * roda com o Node de verdade, faz o `npm install`, o `npm run build` e reinicia o app (tmp/restart.txt), registrando
 * tudo em deploy.log (a tela Segurança mostra o "Último deploy").
 *
 * Variável (Plesk → Node.js): DEPLOY_TOKEN, 16+ caracteres. Sem ela o endereço responde 503 (desligado).
 */

const TOKEN_MINIMO = 16
let rodando = false

const hora = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false })

function tokenConfere(recebido, esperado) {
  const a = createHash('sha256').update(String(recebido ?? '')).digest()
  const b = createHash('sha256').update(String(esperado)).digest()
  return timingSafeEqual(a, b)
}

function rodarComando(comando, argumentos, { dir, escrever, spawnImpl }) {
  return new Promise((resolver) => {
    // O processo do app foi iniciado com o Node do Plesk: o npm mora na mesma pasta.
    // Sem NODE_ENV=production: ele faria o npm pular as ferramentas de build (vite, tsc, esbuild).
    const { NODE_ENV: _ignorado, ...base } = process.env
    const ambiente = { ...base, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`, CI: 'true' }
    const filho = spawnImpl(comando, argumentos, { cwd: dir, env: ambiente, shell: process.platform === 'win32' })
    let resto = ''
    const linhas = (dados) => {
      resto += dados.toString()
      const partes = resto.split(/\r?\n/)
      resto = partes.pop() ?? ''
      for (const linha of partes) if (linha.trim()) escrever(`  ${linha}`)
    }
    filho.stdout?.on('data', linhas)
    filho.stderr?.on('data', linhas)
    filho.on('error', (erro) => {
      escrever(`  ${erro.message}`)
      resolver(1)
    })
    filho.on('close', (codigo) => {
      if (resto.trim()) escrever(`  ${resto}`)
      resolver(codigo ?? 1)
    })
  })
}

/** Roda o deploy e escreve cada passo em deploy.log. Devolve true se terminou bem. */
export async function rodarDeploy({ dir = process.cwd(), spawnImpl = spawn } = {}) {
  const arquivo = join(dir, 'deploy.log')
  await writeFile(arquivo, '')
  const escrever = (texto) => appendFile(arquivo, `${texto}\n`).catch(() => {})
  const passo = (texto) => escrever(`[${hora()}] ${texto}`)

  await passo(`deploy iniciado em ${dir}`)
  await passo(`node ${process.version}`)

  for (const [nome, argumentos] of [
    ['npm install', ['install', '--include=dev', '--no-audit', '--no-fund']],
    ['npm run build', ['run', 'build']],
  ]) {
    await passo(`${nome}...`)
    const codigo = await rodarComando('npm', argumentos, { dir, escrever, spawnImpl })
    if (codigo !== 0) {
      await passo(`ERRO: ${nome} falhou (código ${codigo}). O app antigo continua no ar.`)
      return false
    }
  }

  // O Passenger (Plesk) reinicia o app quando a data deste arquivo muda.
  await mkdir(join(dir, 'tmp'), { recursive: true })
  await writeFile(join(dir, 'tmp', 'restart.txt'), String(Date.now()))
  await passo('Deploy concluído: o app foi reiniciado')
  return true
}

function responder(res, status, corpo) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(corpo))
}

/** POST /api/deploy — chamado pelo Plesk depois de puxar o código. Cabeçalho: x-deploy-token. */
export async function handleDeployRequest(req, res, env, { executar = rodarDeploy } = {}) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Use POST.' })
  const esperado = String(env.DEPLOY_TOKEN ?? '')
  if (esperado.length < TOKEN_MINIMO) return responder(res, 503, { error: 'Deploy pelo dash desligado (defina DEPLOY_TOKEN com 16+ caracteres).' })
  if (!tokenConfere(req.headers['x-deploy-token'], esperado)) return responder(res, 401, { error: 'Token inválido.' })
  if (rodando) return responder(res, 409, { error: 'Já existe um deploy em andamento.', rodando: true })

  rodando = true
  responder(res, 202, { iniciado: true, acompanhe: 'Admin → Segurança → Último deploy' })
  try {
    await executar({ dir: env.DEPLOY_DIR || process.cwd() })
  } catch (erro) {
    console.error('[deploy] falhou:', erro.message || erro)
  } finally {
    rodando = false
  }
}
