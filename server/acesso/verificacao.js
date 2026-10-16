import { enviarEmail, enviarWhatsapp } from './integracoes.js'

/**
 * Confere as chaves da liberação de acesso SEM tocar em nenhum aluno (só consultas), usando o
 * ambiente do próprio servidor. Cada item: { grupo, nivel: 'ok' | 'erro' | 'aviso', texto }.
 * Usado pela tela Acessos (botão "Conferir conexões") e por `npm run acesso:verificar`.
 */

const CONFIG_OBRIGATORIA = {
  HOTMART_HOTTOK: 'Token do webhook da Hotmart',
  TEKWAY_LIBERAR_URL: 'Endereço do liberar-curso da plataforma',
  TEKWAY_TOKEN: 'Token da plataforma de cursos',
  BREVO_API_KEY: 'Chave da Brevo (e-mail)',
  BREVO_REMETENTE_EMAIL: 'E-mail remetente na Brevo',
  EVOLUTION_URL: 'Endereço da Evolution (WhatsApp)',
  EVOLUTION_ALUNO_INSTANCIA: 'Instância do WhatsApp que fala com o aluno',
  EVOLUTION_ALUNO_APIKEY: 'Chave da instância do aluno',
  EVOLUTION_EQUIPE_INSTANCIA: 'Instância do WhatsApp dos avisos à equipe',
  EVOLUTION_EQUIPE_APIKEY: 'Chave da instância dos avisos',
  ACESSO_AVISO_NUMERO: 'Número da equipe que recebe os avisos',
}
const CONFIG_OPCIONAL = { TEKWAY_BLOQUEAR_URL: 'Endereço do bloqueio de acesso (sem ele, o bloqueio é manual)' }

export function configuracaoFaltando(env) {
  const vazio = (nome) => !String(env[nome] ?? '').trim()
  return {
    obrigatorias: Object.entries(CONFIG_OBRIGATORIA).filter(([nome]) => vazio(nome)).map(([nome, descricao]) => ({ nome, descricao })),
    opcionais: Object.entries(CONFIG_OPCIONAL).filter(([nome]) => vazio(nome)).map(([nome, descricao]) => ({ nome, descricao })),
  }
}

async function consultar(url, headers) {
  const resposta = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  const corpo = await resposta.text().catch(() => '')
  let json = null
  try {
    json = JSON.parse(corpo)
  } catch {
    // resposta que não é JSON
  }
  return { resposta, json }
}

export async function verificarConexoes(env, { emailTeste = '' } = {}) {
  const itens = []
  const add = (grupo, nivel, texto) => itens.push({ grupo, nivel, texto })

  const faltando = configuracaoFaltando(env)
  if (faltando.obrigatorias.length) {
    faltando.obrigatorias.forEach((item) => add('Variáveis', 'erro', `Falta ${item.nome} — ${item.descricao}`))
  } else {
    add('Variáveis', 'ok', 'Todas as variáveis obrigatórias estão preenchidas')
  }

  // Brevo
  if (String(env.BREVO_API_KEY ?? '').trim()) {
    const cabecalho = { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' }
    try {
      const conta = await consultar('https://api.brevo.com/v3/account', cabecalho)
      if (!conta.resposta.ok) add('Brevo (e-mail)', 'erro', `Chave recusada pela Brevo (HTTP ${conta.resposta.status})`)
      else {
        add('Brevo (e-mail)', 'ok', `Chave válida (conta ${conta.json?.email ?? 'encontrada'})`)
        const remetente = String(env.BREVO_REMETENTE_EMAIL ?? '').toLowerCase()
        const dominio = remetente.split('@')[1]
        const dominios = await consultar('https://api.brevo.com/v3/senders/domains', cabecalho)
        const achado = (dominios.json?.domains ?? []).find((item) => String(item.domain_name).toLowerCase() === dominio)
        if (achado?.authenticated) add('Brevo (e-mail)', 'ok', `Domínio ${dominio} autenticado`)
        else {
          const senders = await consultar('https://api.brevo.com/v3/senders', cabecalho)
          const unico = (senders.json?.senders ?? []).find((item) => String(item.email).toLowerCase() === remetente)
          if (unico?.active) add('Brevo (e-mail)', 'ok', `Remetente ${remetente} verificado`)
          else add('Brevo (e-mail)', 'erro', `O remetente ${remetente || '(vazio)'} não está verificado na Brevo e o domínio ${dominio || ''} não está autenticado`)
        }
      }
    } catch (erro) {
      add('Brevo (e-mail)', 'erro', `Não consegui falar com a Brevo: ${erro.message}`)
    }
  }

  // Evolution (WhatsApp)
  for (const [rotulo, prefixo] of [['aluno', 'EVOLUTION_ALUNO'], ['equipe', 'EVOLUTION_EQUIPE']]) {
    const instancia = env[`${prefixo}_INSTANCIA`]
    const chave = env[`${prefixo}_APIKEY`]
    if (!String(env.EVOLUTION_URL ?? '').trim() || !instancia || !chave) continue
    try {
      const url = `${env.EVOLUTION_URL.replace(/\/+$/, '')}/instance/connectionState/${encodeURIComponent(instancia)}`
      const { resposta, json } = await consultar(url, { apikey: chave })
      const estado = json?.instance?.state ?? json?.state ?? ''
      if (resposta.status === 401 || resposta.status === 403) add('WhatsApp (Evolution)', 'erro', `Chave da instância "${instancia}" (${rotulo}) recusada`)
      else if (!resposta.ok) add('WhatsApp (Evolution)', 'aviso', `Instância "${instancia}" (${rotulo}): não consegui conferir (HTTP ${resposta.status})`)
      else if (estado && estado !== 'open') add('WhatsApp (Evolution)', 'erro', `Instância "${instancia}" (${rotulo}) está "${estado}": o WhatsApp precisa estar conectado`)
      else add('WhatsApp (Evolution)', 'ok', `Instância "${instancia}" (${rotulo}) conectada`)
    } catch (erro) {
      add('WhatsApp (Evolution)', 'erro', `Instância "${instancia}" (${rotulo}): ${erro.message}`)
    }
  }

  // Envio de teste (opcional)
  if (emailTeste) {
    try {
      await enviarEmail(env, { para: emailTeste, assunto: 'Teste da liberação de acesso — Tuzinho Academy', html: '<p>Se você recebeu este e-mail, a Brevo está enviando certo. ✅</p>' })
      add('Envio de teste', 'ok', `E-mail enviado para ${emailTeste} (olhe também o spam)`)
    } catch (erro) {
      add('Envio de teste', 'erro', `E-mail de teste falhou: ${erro.message}`)
    }
    for (const [conta, rotulo, texto] of [
      ['equipe', 'dos avisos à equipe', '✅ Teste da liberação de acesso: o aviso à equipe está funcionando.'],
      ['aluno', 'que fala com o aluno', '✅ Teste da liberação de acesso: a instância que fala com o aluno está funcionando.'],
    ]) {
      try {
        await enviarWhatsapp(env, { conta, numero: env.ACESSO_AVISO_NUMERO, texto })
        add('Envio de teste', 'ok', `WhatsApp de teste enviado pela instância ${rotulo} (chegou no número da equipe?)`)
      } catch (erro) {
        add('Envio de teste', 'erro', `WhatsApp pela instância ${rotulo} falhou: ${erro.message}`)
      }
    }
  }

  return { itens, falhas: itens.filter((item) => item.nivel === 'erro').length }
}
