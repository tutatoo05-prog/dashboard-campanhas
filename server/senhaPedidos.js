/**
 * "Esqueci minha senha" com liberação pela equipe (sem e-mail).
 *
 * Vários cadastros do dash usam e-mails que não existem de verdade, então o link não pode ir por e-mail. Também não
 * pode voltar para quem pediu só porque sabe o e-mail (isso deixava qualquer pessoa trocar a senha de qualquer conta).
 * O caminho é o mesmo do cadastro novo:
 *   1. a pessoa pede a troca → o dash grava o pedido e manda ao chat da equipe os botões Liberar / Negar;
 *   2. a tela dela fica perguntando o estado do pedido (pelo número do pedido, que só ela recebeu);
 *   3. quando um admin toca em Liberar, a próxima consulta devolve o token e a tela abre a troca de senha.
 * O token nunca sai antes da liberação. Se o Telegram não estiver configurado ou falhar, o pedido é desfeito.
 *
 * O aviso do Telegram leva o callback_data `lb:<pedido>` / `ng:<pedido>` (tratado em aprovacaoTelegram.js).
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { chamar, telegramConfigurado } from './alertas.js'
import { query } from './db.js'

export const PEDIDO_VALIDO_MS = 30 * 60 * 1000 // tempo para a equipe liberar
export const TOKEN_VALIDO_MS = 15 * 60 * 1000 // tempo para a pessoa digitar a nova senha depois de liberada
const REUSO_MS = 2 * 60 * 1000 // clicar de novo logo em seguida reaproveita o pedido (não repete o aviso)

let pronto = null

/** Acrescenta as colunas do pedido à tabela existente. Idempotente; espelho em db/schema.sql. */
export function garantirEsquemaPedidos(env, consultar = (texto, params) => query(env, texto, params)) {
  if (!pronto) {
    pronto = (async () => {
      await consultar('alter table password_resets add column if not exists pedido uuid not null default gen_random_uuid()')
      await consultar('alter table password_resets add column if not exists criado_em timestamptz not null default now()')
      await consultar('alter table password_resets add column if not exists liberado_em timestamptz')
      await consultar('alter table password_resets add column if not exists negado_em timestamptz')
      await consultar('alter table password_resets add column if not exists pedido_ip text')
      await consultar('create unique index if not exists password_resets_pedido_idx on password_resets (pedido)')
    })().catch((erro) => {
      pronto = null
      throw erro
    })
  }
  return pronto
}

export function reiniciarEsquemaPedidos() {
  pronto = null
}

function postJson(corpo) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }
}

function textoDoAviso({ nome, email, ip }) {
  const hora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  return (
    `Pedido de troca de senha às ${hora}\n\nNome: ${nome}\nE-mail: ${email}\nIP: ${ip || 'desconhecido'}\n\n` +
    'Só libere se a própria pessoa avisou que pediu. Depois de liberar, ela tem 15 minutos para definir a nova senha.'
  )
}

/**
 * Cria o pedido e avisa a equipe. Devolve { pedido } (sempre: para e-mail desconhecido ou cadastro não aprovado devolve
 * um número que nunca será liberado, para a tela não revelar quem tem conta). Lança se não deu para avisar a equipe.
 */
export async function pedirTrocaDeSenha(env, email, { ip = '', consultar = (texto, params) => query(env, texto, params), fetchImpl = fetch } = {}) {
  if (!telegramConfigurado(env)) throw new Error('SEM_TELEGRAM')

  const achado = await consultar('select id, nome, email, ativo from users where email = $1', [email])
  const usuario = achado.rows[0]
  if (!usuario || !usuario.ativo) return { pedido: randomUUID() }

  const recente = await consultar(
    `select pedido from password_resets
      where user_id = $1 and used_at is null and negado_em is null and liberado_em is null
        and expires_at > now() and criado_em > now() - ($2::int * interval '1 millisecond')
      order by criado_em desc limit 1`,
    [usuario.id, REUSO_MS],
  )
  if (recente.rows[0]) return { pedido: recente.rows[0].pedido }

  const token = randomBytes(32).toString('hex')
  const criado = await consultar(
    'insert into password_resets (token, user_id, expires_at, pedido_ip) values ($1, $2, $3, $4) returning pedido',
    [token, usuario.id, new Date(Date.now() + PEDIDO_VALIDO_MS), String(ip).slice(0, 64)],
  )
  const pedido = criado.rows[0].pedido

  try {
    await chamar(
      env,
      'sendMessage',
      postJson({
        chat_id: String(env.TELEGRAM_CHAT_ID).trim(),
        text: textoDoAviso({ nome: usuario.nome, email: usuario.email, ip }),
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Liberar', callback_data: `lb:${pedido}` },
            { text: '❌ Negar', callback_data: `ng:${pedido}` },
          ]],
        },
      }),
      fetchImpl,
    )
  } catch (erro) {
    await consultar('delete from password_resets where pedido = $1', [pedido]).catch(() => {})
    console.error('[senha] não consegui avisar a equipe no Telegram:', erro.message || erro)
    throw new Error('SEM_TELEGRAM')
  }
  return { pedido }
}

/**
 * Estado do pedido para a tela que está esperando. O token só vem quando está liberado e ainda não foi usado.
 * Número desconhecido responde "aguardando" (igual ao pedido falso de e-mail inexistente).
 */
export async function estadoDoPedido(env, pedido, consultar = (texto, params) => query(env, texto, params)) {
  const { rows } = await consultar(
    'select token, used_at, liberado_em, negado_em, (expires_at <= now()) as vencido from password_resets where pedido = $1',
    [pedido],
  )
  const linha = rows[0]
  if (!linha) return { estado: 'aguardando' }
  if (linha.used_at) return { estado: 'usado' }
  if (linha.negado_em) return { estado: 'negado' }
  if (linha.vencido) return { estado: 'expirado' }
  if (linha.liberado_em) return { estado: 'liberado', token: linha.token }
  return { estado: 'aguardando' }
}

/** Aplica o toque da equipe (`lb` libera, `ng` nega) e devolve o texto que substitui a mensagem do Telegram. */
export async function decidirPedido(env, acao, pedido, consultar = (texto, params) => query(env, texto, params)) {
  const libera = acao === 'lb'
  const feito = await consultar(
    libera
      ? `update password_resets r set liberado_em = now(), expires_at = now() + ($2::int * interval '1 millisecond')
          from users u
         where r.pedido = $1 and u.id = r.user_id and r.used_at is null and r.liberado_em is null
           and r.negado_em is null and r.expires_at > now()
         returning u.nome, u.email`
      : `update password_resets r set negado_em = now()
          from users u
         where r.pedido = $1 and u.id = r.user_id and r.used_at is null and r.liberado_em is null
           and r.negado_em is null and r.expires_at > now()
         returning u.nome, u.email`,
    libera ? [pedido, TOKEN_VALIDO_MS] : [pedido],
  )
  const linha = feito.rows[0]
  if (linha) {
    const quem = `${linha.nome} (${linha.email})`
    return libera ? `✅ Troca de senha liberada: ${quem}` : `❌ Troca de senha negada: ${quem}`
  }
  const atual = await consultar(
    'select u.nome, u.email, r.used_at, r.liberado_em, r.negado_em from password_resets r join users u on u.id = r.user_id where r.pedido = $1',
    [pedido],
  )
  const p = atual.rows[0]
  if (!p) return 'Esse pedido não existe mais.'
  const quem = `${p.nome} (${p.email})`
  if (p.used_at) return `✅ Esse pedido já foi usado: ${quem}`
  if (p.negado_em) return `❌ Esse pedido já estava negado: ${quem}`
  if (p.liberado_em) return `✅ Esse pedido já estava liberado: ${quem}`
  return `⌛ Esse pedido venceu: ${quem}. Peça para a pessoa pedir de novo.`
}
