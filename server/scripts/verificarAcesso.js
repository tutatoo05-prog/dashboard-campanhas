// Confere, sem tocar em nenhum aluno, se as chaves da liberação de acesso estão certas.
//   node --env-file=.env server/scripts/verificarAcesso.js
//   node --env-file=.env server/scripts/verificarAcesso.js --enviar voce@email.com   (manda 1 e-mail e 1 WhatsApp de teste)
// No Plesk: Node.js → Run script → acesso:verificar
import { configuracaoFaltando } from '../acesso/handler.js'
import { enviarEmail, enviarWhatsapp } from '../acesso/integracoes.js'

const env = process.env
const argumentos = process.argv.slice(2)
const indice = argumentos.indexOf('--enviar')
const emailTeste = indice >= 0 ? argumentos[indice + 1] : null

let falhas = 0
const ok = (texto) => console.log(`  ✅ ${texto}`)
const ruim = (texto) => {
  falhas += 1
  console.log(`  ❌ ${texto}`)
}

async function pedir(url, headers) {
  const resposta = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  const corpo = await resposta.text().catch(() => '')
  return { resposta, corpo }
}

console.log(`\nModo atual: ${env.ACESSO_MODO || 'desligado'}\n`)

console.log('Variáveis')
const faltando = configuracaoFaltando(env)
if (faltando.obrigatorias.length) faltando.obrigatorias.forEach((item) => ruim(`falta ${item.nome} — ${item.descricao}`))
else ok('todas as variáveis obrigatórias estão preenchidas')
faltando.opcionais.forEach((item) => console.log(`  ⚠️  opcional ${item.nome} — ${item.descricao}`))

console.log('\nBrevo (e-mail)')
if (env.BREVO_API_KEY) {
  try {
    const conta = await pedir('https://api.brevo.com/v3/account', { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' })
    if (!conta.resposta.ok) ruim(`chave recusada (HTTP ${conta.resposta.status})`)
    else ok(`chave válida (${JSON.parse(conta.corpo).email ?? 'conta encontrada'})`)

    const remetente = String(env.BREVO_REMETENTE_EMAIL ?? '').toLowerCase()
    const dominio = remetente.split('@')[1]
    const dominios = await pedir('https://api.brevo.com/v3/senders/domains', { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' })
    const lista = dominios.resposta.ok ? (JSON.parse(dominios.corpo).domains ?? []) : []
    const achado = lista.find((item) => String(item.domain_name).toLowerCase() === dominio)
    if (achado?.authenticated) ok(`domínio ${dominio} autenticado`)
    else {
      const senders = await pedir('https://api.brevo.com/v3/senders', { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' })
      const unico = senders.resposta.ok ? (JSON.parse(senders.corpo).senders ?? []).find((item) => String(item.email).toLowerCase() === remetente) : null
      if (unico?.active) ok(`remetente ${remetente} verificado`)
      else ruim(`remetente ${remetente} não está verificado nem o domínio ${dominio} autenticado na Brevo`)
    }
  } catch (erro) {
    ruim(`não consegui falar com a Brevo: ${erro.message}`)
  }
} else console.log('  (sem BREVO_API_KEY)')

console.log('\nWhatsApp (Evolution)')
for (const [rotulo, prefixo] of [['aluno', 'EVOLUTION_ALUNO'], ['equipe', 'EVOLUTION_EQUIPE']]) {
  const instancia = env[`${prefixo}_INSTANCIA`]
  const chave = env[`${prefixo}_APIKEY`]
  if (!env.EVOLUTION_URL || !instancia || !chave) {
    console.log(`  (instância de ${rotulo} sem configuração completa)`)
    continue
  }
  try {
    const url = `${env.EVOLUTION_URL.replace(/\/+$/, '')}/instance/connectionState/${encodeURIComponent(instancia)}`
    const resultado = await pedir(url, { apikey: chave })
    const estado = (() => {
      try {
        const json = JSON.parse(resultado.corpo)
        return json?.instance?.state ?? json?.state ?? ''
      } catch {
        return ''
      }
    })()
    if (!resultado.resposta.ok) ruim(`instância "${instancia}" (${rotulo}): HTTP ${resultado.resposta.status}`)
    else if (estado && estado !== 'open') ruim(`instância "${instancia}" (${rotulo}) está "${estado}" — o WhatsApp precisa estar conectado`)
    else ok(`instância "${instancia}" (${rotulo}) conectada`)
  } catch (erro) {
    ruim(`instância "${instancia}" (${rotulo}): ${erro.message}`)
  }
}

console.log('\nPlataforma de cursos (Tekway)')
if (env.TEKWAY_LIBERAR_URL && env.TEKWAY_TOKEN) {
  console.log('  ⚠️  o liberar-curso não tem como ser testado sem criar um aluno: confira só a URL e o token e acompanhe a 1ª venda real')
  console.log(`      URL: ${env.TEKWAY_LIBERAR_URL}`)
} else console.log('  (sem TEKWAY_LIBERAR_URL ou TEKWAY_TOKEN)')

if (emailTeste) {
  console.log('\nEnvio de teste')
  try {
    await enviarEmail(env, { para: emailTeste, assunto: 'Teste da liberação de acesso — Tuzinho Academy', html: '<p>Se você recebeu este e-mail, a Brevo está enviando certo. ✅</p>' })
    ok(`e-mail de teste enviado para ${emailTeste} (confira a caixa de entrada e o spam)`)
  } catch (erro) {
    ruim(`e-mail de teste falhou: ${erro.message}`)
  }
  try {
    await enviarWhatsapp(env, { conta: 'equipe', numero: env.ACESSO_AVISO_NUMERO, texto: '✅ Teste da liberação de acesso: o aviso à equipe está funcionando.' })
    ok(`WhatsApp de teste enviado para ${env.ACESSO_AVISO_NUMERO}`)
  } catch (erro) {
    ruim(`WhatsApp de teste falhou: ${erro.message}`)
  }
}

console.log(falhas ? `\n${falhas} problema(s) para corrigir antes de ligar.\n` : '\nTudo certo para ligar. ✅\n')
process.exit(falhas ? 1 : 0)
