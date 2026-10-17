import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checklistDeConfiguracao, handleSegurancaRequest } from './segurancaHandler.js'

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

test('só admin entra na Segurança, em qualquer rota', async () => {
  for (const [metodo, url] of [['GET', '/api/seguranca/resumo'], ['POST', '/api/seguranca/backup'], ['POST', '/api/seguranca/encerrar-sessoes']]) {
    const res = respostaFalsa()
    await handleSegurancaRequest({ method: metodo, url, headers: {} }, res, {}, { cargo: 'usuario' })
    assert.equal(res.statusCode, 403, `${metodo} ${url}`)
  }
})

test('o checklist de configuração diz o que está ligado sem revelar nenhum valor', () => {
  const env = {
    DATABASE_URL: 'postgresql://dash_app.x:senhaSecreta@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
    ACESSO_MODO: 'ativo',
    HOTMART_HOTTOK: 'hottok-secreto',
    TELEGRAM_BOT_TOKEN: '123:token-secreto',
    TELEGRAM_CHAT_ID: '99',
    BACKUP_PASSPHRASE: 'frase-secreta-longa-1',
  }
  const lista = checklistDeConfiguracao(env)
  const por = Object.fromEntries(lista.map((item) => [item.id, item.ok]))
  assert.deepEqual(
    [por['porta-6543'], por['acesso-ativo'], por.hottok, por.telegram, por.backup, por.vigia, por.brevo, por.whatsapp],
    [true, true, true, true, true, true, false, false],
  )
  const texto = JSON.stringify(lista)
  for (const segredo of ['senhaSecreta', 'hottok-secreto', 'token-secreto', 'frase-secreta']) assert.ok(!texto.includes(segredo), `vazou ${segredo}`)
})

test('porta 5432 ou banco ausente aparece como pendente', () => {
  assert.equal(checklistDeConfiguracao({ DATABASE_URL: 'postgresql://u:p@host:5432/db' }).find((item) => item.id === 'porta-6543').ok, false)
  assert.equal(checklistDeConfiguracao({}).find((item) => item.id === 'porta-6543').ok, false)
})
