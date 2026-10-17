import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { lerUltimoDeploy } from './segurancaHandler.js'

test('lerUltimoDeploy: sem arquivo devolve nada', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dep-'))
  assert.equal(await lerUltimoDeploy({}, { dir }), null)
})

test('lerUltimoDeploy: entende concluído, erro e em andamento, e tira as cores do terminal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dep-'))
  const esc = String.fromCharCode(27)

  await writeFile(join(dir, 'deploy.log'), `[10:00:01] deploy iniciado\n${esc}[32mbuild ok${esc}[0m\n[10:02:00] Deploy concluído: o app foi reiniciado\n`)
  const ok = await lerUltimoDeploy({}, { dir })
  assert.equal(ok.estado, 'ok')
  assert.ok(ok.linhas.includes('build ok'), 'as cores precisam sair')

  await writeFile(join(dir, 'deploy.log'), '[10:00:01] deploy iniciado\n[10:00:05] ERRO: npm install falhou\n')
  assert.equal((await lerUltimoDeploy({}, { dir })).estado, 'erro')

  await writeFile(join(dir, 'deploy.log'), '[10:00:01] deploy iniciado\n[10:00:03] npm install...\n')
  assert.equal((await lerUltimoDeploy({}, { dir })).estado, 'rodando')

  const longo = Array.from({ length: 100 }, (_, i) => `linha ${i}`).join('\n')
  await writeFile(join(dir, 'deploy.log'), longo)
  assert.equal((await lerUltimoDeploy({}, { dir, linhas: 5 })).linhas.length, 5)
})
