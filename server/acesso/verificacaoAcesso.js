import { timingSafeEqual } from 'node:crypto'
import { query } from '../db.js'
import { readRequestBody } from '../readBody.js'
import * as integracoesPadrao from './integracoes.js'
import { htmlBoasVindasComLink } from './motor.js'
import { ASSUNTO_NOVO_LINK, mascararEmail } from './novoLink.js'
import { emailValido, telefoneWhatsapp, whatsappValido } from './regras.js'
import { v2Configurado } from './telwayV2.js'

/**
 * Verificação do acesso depois da compra aprovada (só quem foi liberado pela API V2 e recebeu o link de senha):
 *   1. ~10 min depois, um WhatsApp pergunta se a pessoa conseguiu entrar (1 = sim, 2 = não);
 *   2. a resposta chega por webhook da Evolution em /api/whatsapp-resposta e é classificada:
 *        sim  → confirmado (nada mais é enviado);
 *        não  → novo link por e-mail na hora + aviso à equipe;
 *        outra coisa → aviso à equipe com o texto, para um humano responder;
 *   3. ~31 min depois (o link de senha vale 30), quem ainda não confirmou recebe um e-mail com link novo.
 *
 * Variáveis: VERIFICACAO_ACESSO_MODO (desligado | teste | ativo; padrão desligado), EVOLUTION_WEBHOOK_SEGREDO
 * (texto aleatório que a Evolution devolve na URL ?s=... ou no cabeçalho x-webhook-secret), VERIFICACAO_WHATSAPP_MIN (10),
 * VERIFICACAO_EMAIL_MIN (31). Tudo que a pessoa escreve é só dado: o texto nunca é executado nem vira comando.
 */

const WHATSAPP_APOS_MIN_PADRAO = 10
const EMAIL_APOS_MIN_PADRAO = 31
const JANELA_RESPOSTA = '3 days'
const MAX_TENTATIVAS_EMAIL = 3
const LOTE = 20

export function modoVerificacao(env) {
  const modo = String(env.VERIFICACAO_ACESSO_MODO ?? 'desligado').trim().toLowerCase()
  return modo === 'ativo' || modo === 'teste' ? modo : 'desligado'
}

const minutos = (valor, padrao) => (Number(valor) > 0 ? Number(valor) : padrao)

// ── textos ───────────────────────────────────────────────────────────────────────────────────────────────

export function textoPergunta(nome) {
  return `Oi, ${nome}! 👋 Aqui é da Tuzinho Academy.\n\nVocê conseguiu criar sua senha e entrar na plataforma?\n\nResponda com um número:\n1️⃣ Sim, consegui\n2️⃣ Não consegui\n\nSe responder 2, mandamos um novo link para o seu e-mail.`
}
export const TEXTO_CONFIRMADO = '🎉 Que ótimo! Seu acesso está funcionando. Bons estudos na Tuzinho Academy! Se precisar de algo, é só chamar por aqui.'
export const textoNovoLink = (email) =>
  `Sem problema! 😊 Acabamos de enviar um novo link para o seu e-mail (${mascararEmail(email)}). Olhe também a caixa de spam. Se continuar sem conseguir, responda aqui que nossa equipe te ajuda.`
export const TEXTO_EQUIPE_VAI_AJUDAR = 'Entendi. Já avisamos nossa equipe e alguém vai falar com você por aqui para resolver. 🙏'

// ── leitura da resposta ──────────────────────────────────────────────────────────────────────────────────

/** 'sim' | 'nao' | 'outra'. Texto da pessoa é só dado: compara com padrões fixos, nada mais. */
export function classificarResposta(texto) {
  const bruto = String(texto ?? '')
  const t = bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return /👍|✅/.test(bruto) ? 'sim' : 'outra'
  if (/^(2|nao|n)\b/.test(t) || /\bnao\b/.test(t) || /\bnada\b/.test(t)) return 'nao'
  if (/^(1|sim|s|ok|consegui|consegui sim|sim consegui|deu certo|tudo certo|tudo ok)\b/.test(t) && t.length <= 30) return 'sim'
  return 'outra'
}

/** Extrai { numero, texto } de uma mensagem RECEBIDA (webhook messages.upsert da Evolution). null se não serve. */
export function extrairMensagem(payload) {
  const dado = Array.isArray(payload?.data) ? payload.data[0] : payload?.data
  if (!dado || dado.key?.fromMe) return null
  const evento = String(payload?.event ?? '').toLowerCase().replace(/_/g, '.')
  if (evento && !evento.includes('messages.upsert')) return null
  const jid = [dado.key?.remoteJid, dado.key?.remoteJidAlt, dado.senderPn].find((j) => String(j ?? '').endsWith('@s.whatsapp.net'))
  if (!jid) return null // grupo, status, canal etc.
  const msg = dado.message ?? {}
  const texto = msg.conversation ?? msg.extendedTextMessage?.text ?? msg.buttonsResponseMessage?.selectedDisplayText ?? msg.listResponseMessage?.title ?? ''
  const numero = String(jid).split('@')[0].replace(/\D/g, '')
  if (!numero || !String(texto).trim()) return null
  return { numero, texto: String(texto).slice(0, 500) }
}

/** Trecho da resposta para o aviso da equipe, sem caracteres que o Telegram/WhatsApp leem como formatação. */
const trechoSeguro = (texto) => String(texto).replace(/[*_`[\]]/g, '').replace(/\s+/g, ' ').slice(0, 200)

// ── banco ────────────────────────────────────────────────────────────────────────────────────────────────

let tabelaPronta = false
async function garantirTabela(consultar) {
  if (tabelaPronta) return
  await consultar(`create table if not exists acesso_verificacoes (
    id bigserial primary key,
    chave text not null unique,
    email text not null,
    nome text,
    telefone text,
    curso text,
    acesso_id bigint,
    estado text not null default 'aguardando',   -- aguardando | confirmado | sem_acesso | respondeu | simulado
    whatsapp_em timestamptz not null,
    whatsapp_enviado_em timestamptz,
    whatsapp_erro text,
    email_em timestamptz not null,
    email_enviado_em timestamptz,
    email_tentativas int not null default 0,
    email_erro text,
    resposta text,
    resposta_em timestamptz,
    criado_em timestamptz not null default now()
  )`)
  await consultar('create index if not exists acesso_verificacoes_email_idx on acesso_verificacoes (email)')
  tabelaPronta = true
}

export function criarRepoVerificacao(env, consultar = (texto, params) => query(env, texto, params)) {
  return {
    async agendar(i) {
      await garantirTabela(consultar)
      const r = await consultar(
        `insert into acesso_verificacoes (chave, email, nome, telefone, curso, acesso_id, whatsapp_em, email_em)
         values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (chave) do nothing returning id`,
        [i.chave, i.email, i.nome || null, i.telefone || null, i.curso || null, i.acessoId ?? null, i.whatsappEm, i.emailEm],
      )
      return r.rows.length
    },
    async whatsappVencidos(agora) {
      await garantirTabela(consultar)
      const r = await consultar(
        `select * from acesso_verificacoes
          where estado = 'aguardando' and whatsapp_enviado_em is null and whatsapp_erro is null and whatsapp_em <= $1
          order by whatsapp_em limit ${LOTE}`,
        [agora],
      )
      return r.rows
    },
    async emailsVencidos(agora) {
      await garantirTabela(consultar)
      const r = await consultar(
        `select * from acesso_verificacoes
          where estado in ('aguardando', 'respondeu') and email_enviado_em is null and email_tentativas < ${MAX_TENTATIVAS_EMAIL} and email_em <= $1
          order by email_em limit ${LOTE}`,
        [agora],
      )
      return r.rows
    },
    async abertaPorTelefone(numero, agora) {
      await garantirTabela(consultar)
      const final = String(numero).replace(/\D/g, '').slice(-8)
      if (final.length < 8) return null
      const r = await consultar(
        `select * from acesso_verificacoes
          where whatsapp_enviado_em is not null and whatsapp_enviado_em > $2::timestamptz - interval '${JANELA_RESPOSTA}'
            and estado in ('aguardando', 'sem_acesso', 'respondeu')
            and right(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), 8) = $1
          order by whatsapp_enviado_em desc limit 1`,
        [final, agora],
      )
      return r.rows[0] ?? null
    },
    async marcar(id, campos) {
      const chaves = Object.keys(campos)
      if (!chaves.length) return
      const sets = chaves.map((c, i) => `${c} = $${i + 2}`).join(', ')
      await consultar(`update acesso_verificacoes set ${sets} where id = $1`, [id, ...chaves.map((c) => campos[c])])
    },
  }
}

// ── agendamento (chamado pelo motor depois de liberar) ───────────────────────────────────────────────────

export function criarVerificacao(env, repo = criarRepoVerificacao(env)) {
  if (modoVerificacao(env) === 'desligado') return null
  return {
    /** Nunca lança: a verificação não pode atrapalhar a liberação do acesso. */
    async aoProcessar(venda, plano, agora = new Date()) {
      try {
        if (venda.evento !== 'PURCHASE_APPROVED' || plano?.tipo !== 'liberar' || !v2Configurado(env)) return
        const email = String(venda.email ?? '').trim().toLowerCase()
        if (!emailValido(email)) return
        const telefone = telefoneWhatsapp(venda.telefoneBruto, venda.pais)
        await repo.agendar({
          chave: `${email}|${venda.transacao || venda.eventId}`,
          email,
          nome: venda.primeiroNome || venda.nome,
          telefone: whatsappValido(telefone) ? telefone : '',
          curso: plano.curso,
          whatsappEm: new Date(agora.getTime() + minutos(env.VERIFICACAO_WHATSAPP_MIN, WHATSAPP_APOS_MIN_PADRAO) * 60_000),
          emailEm: new Date(agora.getTime() + minutos(env.VERIFICACAO_EMAIL_MIN, EMAIL_APOS_MIN_PADRAO) * 60_000),
        })
      } catch (erro) {
        console.error('[verificacao] não consegui agendar:', erro.message || erro)
      }
    },
  }
}

// ── envio ────────────────────────────────────────────────────────────────────────────────────────────────

async function mandarNovoLink(env, integ, item) {
  const html = await htmlBoasVindasComLink(env, integ, { nome: item.nome ?? '', email: item.email, acessoId: item.acesso_id })
  await integ.enviarEmail(env, { para: item.email, nomePara: item.nome ?? '', assunto: ASSUNTO_NOVO_LINK, html })
}

/** Uma rodada: manda os WhatsApps e os e-mails de link novo que já venceram. Devolve contagens. */
export async function rodarVerificacoes(env, { repo = criarRepoVerificacao(env), integ = integracoesPadrao, agora = () => new Date() } = {}) {
  const r = { whatsapp: 0, emails: 0, simulados: 0, falhas: 0 }
  const modo = modoVerificacao(env)
  if (modo === 'desligado') return r

  for (const item of await repo.whatsappVencidos(agora())) {
    if (!item.telefone) {
      await repo.marcar(item.id, { whatsapp_erro: 'sem telefone de WhatsApp válido' })
      continue
    }
    if (modo === 'teste') {
      await repo.marcar(item.id, { whatsapp_erro: 'simulado', estado: 'simulado' })
      r.simulados += 1
      continue
    }
    try {
      await integ.enviarWhatsapp(env, { conta: 'aluno', numero: item.telefone, texto: textoPergunta(item.nome || 'tudo bem') })
      await repo.marcar(item.id, { whatsapp_enviado_em: agora() })
      r.whatsapp += 1
    } catch (erro) {
      await repo.marcar(item.id, { whatsapp_erro: String(erro.message || erro).slice(0, 300) })
      r.falhas += 1
    }
  }

  for (const item of await repo.emailsVencidos(agora())) {
    if (modo === 'teste') {
      await repo.marcar(item.id, { email_erro: 'simulado', email_tentativas: MAX_TENTATIVAS_EMAIL })
      r.simulados += 1
      continue
    }
    try {
      await mandarNovoLink(env, integ, item)
      await repo.marcar(item.id, { email_enviado_em: agora(), email_erro: null })
      r.emails += 1
    } catch (erro) {
      const tentativas = (item.email_tentativas ?? 0) + 1
      // 409 = acesso inativo (ex.: reembolso): não adianta insistir
      const definitivo = /respondeu 409/.test(String(erro.message))
      await repo.marcar(item.id, {
        email_tentativas: definitivo ? MAX_TENTATIVAS_EMAIL : tentativas,
        email_erro: String(erro.message || erro).slice(0, 300),
        email_em: new Date(agora().getTime() + 10 * 60_000),
      })
      r.falhas += 1
    }
  }
  return r
}

export function startVerificacaoAcesso(env) {
  const modo = modoVerificacao(env)
  if (modo === 'desligado' || !env.DATABASE_URL) {
    console.log('[verificacao] verificação de acesso desligada (VERIFICACAO_ACESSO_MODO não definido)')
    return { stop() {} }
  }
  let rodando = false
  const rodar = async () => {
    if (rodando) return
    rodando = true
    try {
      const r = await rodarVerificacoes(env)
      if (r.whatsapp || r.emails || r.simulados || r.falhas) console.log('[verificacao]', JSON.stringify(r))
    } catch (erro) {
      console.error('[verificacao] falha na rodada:', erro.message || erro)
    } finally {
      rodando = false
    }
  }
  console.log(`[verificacao] verificação de acesso em modo "${modo}" (rodada a cada 60 s)`)
  const timer = setInterval(() => void rodar(), 60_000)
  const inicio = setTimeout(() => void rodar(), 45_000)
  timer.unref?.()
  inicio.unref?.()
  return { stop: () => { clearInterval(timer); clearTimeout(inicio) } }
}

// ── resposta do aluno (webhook da Evolution) ─────────────────────────────────────────────────────────────

/** Trata uma mensagem recebida. Devolve o que fez: 'ignorada' | 'confirmado' | 'novo_link' | 'sem_acesso' | 'respondeu'. */
export async function tratarResposta(env, { numero, texto }, { repo = criarRepoVerificacao(env), integ = integracoesPadrao, agora = () => new Date() } = {}) {
  const item = await repo.abertaPorTelefone(numero, agora())
  if (!item) return 'ignorada'
  const classe = classificarResposta(texto)
  const base = { resposta: String(texto).slice(0, 500), resposta_em: agora() }
  const avisar = async (msg) => {
    try {
      await (integ.avisarProblema ?? integ.avisarEquipe)(env, msg)
    } catch (erro) {
      console.error('[verificacao] aviso à equipe falhou:', erro.message || erro)
    }
  }
  const responder = async (msg) => {
    try {
      await integ.enviarWhatsapp(env, { conta: 'aluno', numero: item.telefone || numero, texto: msg })
    } catch (erro) {
      console.error('[verificacao] resposta não enviada:', erro.message || erro)
    }
  }
  const quem = `${item.nome || '(sem nome)'} · ${item.email}`

  if (classe === 'sim') {
    await repo.marcar(item.id, { ...base, estado: 'confirmado' })
    await responder(TEXTO_CONFIRMADO)
    return 'confirmado'
  }

  if (classe === 'nao') {
    if (item.estado === 'sem_acesso') {
      // já recebeu link novo e ainda não conseguiu: precisa de gente
      await repo.marcar(item.id, base)
      await responder(TEXTO_EQUIPE_VAI_AJUDAR)
      await avisar(`🔴 Aluno continua sem acesso\n\n👤 ${quem}\n📱 ${item.telefone}\n\nJá recebeu link novo e respondeu que não conseguiu. Fale com ele.`)
      return 'sem_acesso'
    }
    let enviou = false
    try {
      await mandarNovoLink(env, integ, item)
      enviou = true
    } catch (erro) {
      console.error('[verificacao] novo link não enviado:', erro.message || erro)
    }
    await repo.marcar(item.id, { ...base, estado: 'sem_acesso', ...(enviou ? { email_enviado_em: agora(), email_erro: null } : {}) })
    await responder(enviou ? textoNovoLink(item.email) : TEXTO_EQUIPE_VAI_AJUDAR)
    await avisar(`🟠 Aluno não conseguiu acessar\n\n👤 ${quem}\n📱 ${item.telefone}\n\n${enviou ? 'Mandei um novo link por e-mail.' : 'Não consegui mandar o novo link: reenvie em Registros.'}`)
    return 'novo_link'
  }

  await repo.marcar(item.id, { ...base, ...(item.estado === 'aguardando' ? { estado: 'respondeu' } : {}) })
  await avisar(`💬 Aluno respondeu à verificação de acesso\n\n👤 ${quem}\n📱 ${item.telefone}\n\nDisse: "${trechoSeguro(texto)}"\n\nResponda por aqui.`)
  return 'respondeu'
}

function segredoConfere(esperado, recebido) {
  const a = Buffer.from(String(esperado ?? ''))
  const b = Buffer.from(String(recebido ?? ''))
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

function enviarJson(res, status, corpo) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(corpo))
}

/** POST /api/whatsapp-resposta: webhook da Evolution (instância dos alunos). Protegido por EVOLUTION_WEBHOOK_SEGREDO. */
export async function handleWhatsappRespostaRequest(req, res, env, deps = {}) {
  const segredo = String(env.EVOLUTION_WEBHOOK_SEGREDO ?? '').trim()
  if (!segredo || req.method !== 'POST' || modoVerificacao(env) === 'desligado') return enviarJson(res, 404, { error: 'Rota não encontrada.' })
  const url = new URL(req.url, 'http://localhost')
  if (!segredoConfere(segredo, req.headers['x-webhook-secret'] ?? url.searchParams.get('s'))) return enviarJson(res, 403, { error: 'Acesso negado.' })

  let payload
  try {
    payload = JSON.parse((await readRequestBody(req, 256 * 1024)) || '{}')
  } catch {
    return enviarJson(res, 400, { error: 'Requisição inválida.' })
  }
  // só a instância dos alunos interessa (a da equipe não faz verificação)
  const esperada = String(env.EVOLUTION_ALUNO_INSTANCIA ?? '').trim()
  if (esperada && payload?.instance && payload.instance !== esperada) return enviarJson(res, 200, { ok: true, ignorada: true })

  const mensagem = extrairMensagem(payload)
  if (!mensagem) return enviarJson(res, 200, { ok: true, ignorada: true })
  try {
    const resultado = await tratarResposta(env, mensagem, deps)
    return enviarJson(res, 200, { ok: true, resultado })
  } catch (erro) {
    console.error('[verificacao] erro ao tratar a resposta:', erro.message || erro)
    return enviarJson(res, 200, { ok: true, erro: true }) // 200 para a Evolution não reenviar em loop
  }
}
