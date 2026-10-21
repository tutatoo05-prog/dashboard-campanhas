import { query } from '../db.js'
import { avisarProblema, enviarEmail } from '../acesso/integracoes.js'
import { emailValido, nomeDoCurso } from '../acesso/regras.js'
import { CURSOS_COM_SEQUENCIA, EMAILS, LINK_CHECKOUT_PADRAO, montarEmail } from './conteudo.js'

/**
 * Fila de e-mails de sequência (carrinho, Pix/boleto, expirada, onboarding), com a conta grátis da Brevo em mente
 * (300 e-mails/dia no total). Regras:
 *  - Teto diário próprio da fila (EMAIL_FILA_LIMITE_DIA, padrão 180): o resto dos 300 fica para o que o motor manda
 *    direto (boas-vindas e e-mail de apoio).
 *  - Prioridade 1 (o aluno espera: Pix/boleto) sai antes da 2 (conversão e pós-venda).
 *  - Só envia entre 8h e 21h (São Paulo); o que vence fora da janela espera.
 *  - Prioridade 2 não vai para quem já recebeu e-mail da fila nas últimas 12 h.
 *  - Quem comprou depois de entrar na fila nunca recebe os e-mails de venda (carrinho/pagamento).
 * Modo (EMAIL_SEQUENCIAS_MODO): desligado (padrão) | teste (agenda e simula, não envia nada) | ativo.
 */

const LIMITE_DIA_PADRAO = 180
const JANELA_INICIO = 8
const JANELA_FIM = 21
const MAX_TENTATIVAS = 3
const CENARIOS_DE_VENDA = ['carrinho', 'pagamento']

export function modoSequencias(env) {
  const modo = String(env.EMAIL_SEQUENCIAS_MODO ?? 'desligado').trim().toLowerCase()
  return modo === 'ativo' || modo === 'teste' ? modo : 'desligado'
}

const diaBr = (data) => new Date(data).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
export const horaBr = (data) => Number(new Date(data).toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }))
export const naJanelaDeEnvio = (data) => horaBr(data) >= JANELA_INICIO && horaBr(data) < JANELA_FIM

/**
 * O que um evento da Hotmart já processado manda para a fila. Função pura.
 * Devolve { agendar: [...], cancelar: email | null }.
 */
export function agendamentosDoEvento(venda, plano, agora = new Date()) {
  const email = String(venda.email ?? '').trim().toLowerCase()
  const vazio = { agendar: [], cancelar: null }
  if (!email) return vazio
  const curso = nomeDoCurso(venda)
  const base = { email, nome: venda.nome }
  const item = (passo, ref, dados = {}) => ({
    ...base,
    cenario: EMAILS[passo].cenario,
    passo,
    chave: `${email}|${passo}|${ref}`,
    prioridade: EMAILS[passo].prioridade,
    enviarEm: new Date(agora.getTime() + EMAILS[passo].atrasoMs),
    dados: { curso, ...dados },
  })

  switch (venda.evento) {
    case 'PURCHASE_APPROVED': {
      const resultado = { agendar: [], cancelar: email }
      if (plano?.tipo === 'liberar') {
        const ref = venda.transacao || diaBr(agora)
        for (const passo of ['onboarding_d1', 'onboarding_d3', 'onboarding_d7']) resultado.agendar.push(item(passo, ref))
      }
      return resultado
    }
    case 'PURCHASE_OUT_OF_SHOPPING_CART': {
      if (!CURSOS_COM_SEQUENCIA.has(curso)) return vazio
      const ref = diaBr(agora)
      return { agendar: ['carrinho_24h', 'carrinho_72h'].map((passo) => item(passo, ref)), cancelar: null }
    }
    case 'PURCHASE_BILLET_PRINTED': {
      if (!CURSOS_COM_SEQUENCIA.has(curso)) return vazio
      const pix = String(venda.pagamentoTipo).startsWith('PIX')
      const passos = pix ? ['pix_90min', 'pix_18h'] : ['boleto_24h', 'boleto_72h']
      const ref = venda.transacao || diaBr(agora)
      const dados = { tipoPagamento: pix ? 'pix' : 'boleto', pixCodigo: venda.pixCodigo || '', linkPagamento: venda.boletoLink || '' }
      return { agendar: passos.map((passo) => item(passo, ref, dados)), cancelar: null }
    }
    case 'PURCHASE_EXPIRED': {
      if (!CURSOS_COM_SEQUENCIA.has(curso)) return vazio
      return { agendar: [item('expirou_1h', venda.transacao || diaBr(agora))], cancelar: null }
    }
    default:
      return vazio
  }
}

// ── banco ────────────────────────────────────────────────────────────────────────────────────────────────

let tabelaPronta = false
async function garantirTabela(consultar) {
  if (tabelaPronta) return
  await consultar(`create table if not exists emails_fila (
    id bigserial primary key,
    chave text not null unique,
    email text not null,
    nome text,
    cenario text not null,
    passo text not null,
    dados jsonb not null default '{}'::jsonb,
    prioridade int not null default 2,
    enviar_em timestamptz not null,
    estado text not null default 'pendente',   -- pendente | enviado | simulado | cancelado | falhou
    tentativas int not null default 0,
    erro text,
    enviado_em timestamptz,
    criado_em timestamptz not null default now()
  )`)
  await consultar('create index if not exists emails_fila_pendentes_idx on emails_fila (estado, enviar_em)')
  await consultar('create index if not exists emails_fila_email_idx on emails_fila (email)')
  tabelaPronta = true
}

export function criarFila(env, consultar = (texto, params) => query(env, texto, params)) {
  return {
    async agendar(itens) {
      await garantirTabela(consultar)
      let novos = 0
      for (const i of itens) {
        const r = await consultar(
          `insert into emails_fila (chave, email, nome, cenario, passo, dados, prioridade, enviar_em)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) on conflict (chave) do nothing returning id`,
          [i.chave, i.email, i.nome || null, i.cenario, i.passo, JSON.stringify(i.dados ?? {}), i.prioridade, i.enviarEm],
        )
        novos += r.rows.length
      }
      return novos
    },

    /** Quem comprou: cancela o que ainda não saiu das sequências de venda (carrinho e pagamento). */
    async cancelarVendaPendente(email) {
      await garantirTabela(consultar)
      const r = await consultar(
        `update emails_fila set estado = 'cancelado', erro = 'comprou'
          where email = $1 and estado = 'pendente' and cenario = any($2::text[]) returning id`,
        [email, CENARIOS_DE_VENDA],
      )
      return r.rows.length
    },

    async enviadosHoje() {
      await garantirTabela(consultar)
      const r = await consultar(
        `select count(*)::int n from emails_fila
          where estado = 'enviado' and enviado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`,
      )
      return r.rows[0].n
    },

    /** Próximos vencidos, prioridade 1 primeiro. Prioridade 2 pula quem recebeu algo da fila nas últimas 12 h. */
    async vencidos(limite) {
      await garantirTabela(consultar)
      const r = await consultar(
        `select f.* from emails_fila f
          where f.estado = 'pendente' and f.enviar_em <= now()
            and (f.prioridade = 1 or not exists (
                  select 1 from emails_fila o where o.email = f.email and o.estado = 'enviado' and o.enviado_em > now() - interval '12 hours'))
          order by f.prioridade, f.enviar_em limit $1`,
        [limite],
      )
      return r.rows
    },

    /** Rede de segurança: houve compra desse e-mail depois de o item entrar na fila? */
    async compraDepois(item) {
      const r = await consultar(`select 1 from purchases where lower(email) = $1 and created_at > $2 limit 1`, [item.email, item.criado_em])
      return r.rows.length > 0
    },

    async marcar(id, campos) {
      const chaves = Object.keys(campos)
      const sets = chaves.map((c, i) => `${c} = $${i + 2}`).join(', ')
      await consultar(`update emails_fila set ${sets} where id = $1`, [id, ...chaves.map((c) => campos[c])])
    },
  }
}

// ── envio ────────────────────────────────────────────────────────────────────────────────────────────────

/** Uma rodada de envio. Devolve { enviados, simulados, cancelados, falhas }. Dependências injetáveis para teste. */
export async function enviarDaFila(env, { fila = criarFila(env), enviar = enviarEmail, avisar = avisarProblema, agora = () => new Date(), montar = montarEmail } = {}) {
  const resultado = { enviados: 0, simulados: 0, cancelados: 0, falhas: 0 }
  const modo = modoSequencias(env)
  if (modo === 'desligado' || !naJanelaDeEnvio(agora())) return resultado

  const limite = Math.max(1, Number(env.EMAIL_FILA_LIMITE_DIA) || LIMITE_DIA_PADRAO)
  const restante = limite - (await fila.enviadosHoje())
  if (restante <= 0) return resultado

  let falhouDeVez = 0
  for (const item of await fila.vencidos(Math.min(restante, 50))) {
    if (!emailValido(item.email)) {
      await fila.marcar(item.id, { estado: 'cancelado', erro: 'e-mail inválido' })
      resultado.cancelados += 1
      continue
    }
    if (CENARIOS_DE_VENDA.includes(item.cenario) && (await fila.compraDepois(item))) {
      await fila.marcar(item.id, { estado: 'cancelado', erro: 'comprou' })
      resultado.cancelados += 1
      continue
    }
    try {
      const dados = { ...item.dados, nome: item.nome, linkCheckout: env.EMAIL_LINK_CHECKOUT || LINK_CHECKOUT_PADRAO }
      const { assunto, html } = montar(item.passo, dados)
      if (modo === 'teste') {
        await fila.marcar(item.id, { estado: 'simulado', enviado_em: agora() })
        resultado.simulados += 1
        continue
      }
      await enviar(env, { para: item.email, nomePara: item.nome, assunto, html })
      await fila.marcar(item.id, { estado: 'enviado', enviado_em: agora(), tentativas: (item.tentativas ?? 0) + 1, erro: null })
      resultado.enviados += 1
    } catch (erro) {
      const tentativas = (item.tentativas ?? 0) + 1
      const desistiu = tentativas >= MAX_TENTATIVAS
      await fila.marcar(item.id, {
        estado: desistiu ? 'falhou' : 'pendente',
        tentativas,
        erro: String(erro.message || erro).slice(0, 300),
        enviar_em: new Date(agora().getTime() + 30 * 60_000),
      })
      resultado.falhas += 1
      if (desistiu) falhouDeVez += 1
    }
  }
  if (falhouDeVez > 0) await avisar(env, `🟡 ${falhouDeVez} e-mail(s) da fila de sequências falharam ${MAX_TENTATIVAS} vezes e foram descartados. Veja a tabela emails_fila (estado = falhou).`)
  return resultado
}

// ── ligação com a liberação de acesso e com o app ─────────────────────────────────────────────────────────

/** Objeto que o motor chama depois de processar um evento. Nunca lança: e-mail de sequência não pode atrapalhar o acesso. */
export function criarSequencias(env, fila = criarFila(env)) {
  if (modoSequencias(env) === 'desligado') return null
  return {
    async aoProcessar(venda, plano, agora = new Date()) {
      try {
        const { agendar, cancelar } = agendamentosDoEvento(venda, plano, agora)
        if (cancelar) await fila.cancelarVendaPendente(cancelar)
        if (agendar.length) await fila.agendar(agendar)
      } catch (erro) {
        console.error('[emails] não consegui agendar a sequência:', erro.message || erro)
      }
    },
  }
}

export function startFilaEmails(env) {
  const modo = modoSequencias(env)
  if (modo === 'desligado' || !env.DATABASE_URL) {
    console.log('[emails] sequências de e-mail desligadas (EMAIL_SEQUENCIAS_MODO não definido)')
    return { stop() {} }
  }
  let rodando = false
  const rodar = async () => {
    if (rodando) return
    rodando = true
    try {
      const r = await enviarDaFila(env)
      if (r.enviados || r.simulados || r.cancelados || r.falhas) console.log('[emails]', JSON.stringify(r))
    } catch (erro) {
      console.error('[emails] falha na rodada:', erro.message || erro)
    } finally {
      rodando = false
    }
  }
  console.log(`[emails] sequências de e-mail em modo "${modo}" (rodada a cada 5 min)`)
  const timer = setInterval(() => void rodar(), 5 * 60_000)
  const inicio = setTimeout(() => void rodar(), 90_000)
  timer.unref?.()
  inicio.unref?.()
  return { stop: () => { clearInterval(timer); clearTimeout(inicio) } }
}
