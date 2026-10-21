import { query } from '../db.js'
import { EMAILS } from './conteudo.js'
import { modoSequencias } from './fila.js'

/**
 * Painel de e-mails da tela Acessos: o que a fila de sequências e o motor (boas-vindas e apoio) mandaram, mandam
 * ou deixaram de mandar. Só leitura. `consultar` é injetável para teste.
 */

const TETO_BREVO_DIA = 300
const TETO_FILA_PADRAO = 180
const LISTA_MAX = 400
const LINHAS_MAX = 2000

/** Nome legível e grupo de cada e-mail (o que aparece nos gráficos e na lista). */
export const CATALOGO = [
  { tipo: 'boas_vindas', rotulo: 'Boas-vindas (acesso liberado)', grupo: 'Compra', quando: 'na hora da compra aprovada', origem: 'direto' },
  { tipo: 'apoio_carrinho', rotulo: 'Carrinho abandonado · na hora', grupo: 'Carrinho abandonado', quando: 'na hora do abandono', origem: 'direto' },
  { tipo: 'carrinho_24h', rotulo: 'Carrinho abandonado · 24 h', grupo: 'Carrinho abandonado', quando: '24 h depois', origem: 'fila' },
  { tipo: 'carrinho_72h', rotulo: 'Carrinho abandonado · 72 h', grupo: 'Carrinho abandonado', quando: '3 dias depois', origem: 'fila' },
  { tipo: 'pix_90min', rotulo: 'Pix gerado · 1h30', grupo: 'Pix e boleto', quando: '1h30 depois', origem: 'fila' },
  { tipo: 'pix_18h', rotulo: 'Pix gerado · 18 h', grupo: 'Pix e boleto', quando: '18 h depois', origem: 'fila' },
  { tipo: 'boleto_24h', rotulo: 'Boleto gerado · 24 h', grupo: 'Pix e boleto', quando: '24 h depois', origem: 'fila' },
  { tipo: 'boleto_72h', rotulo: 'Boleto gerado · 72 h', grupo: 'Pix e boleto', quando: '3 dias depois', origem: 'fila' },
  { tipo: 'expirou_1h', rotulo: 'Pagamento expirado · 1 h', grupo: 'Pix e boleto', quando: '1 h depois', origem: 'fila' },
  { tipo: 'apoio_atraso', rotulo: 'Parcela atrasada · na hora', grupo: 'Parcelas', quando: 'na hora do atraso', origem: 'direto' },
  { tipo: 'onboarding_d1', rotulo: 'Onboarding · dia 1', grupo: 'Onboarding', quando: '1 dia depois da liberação', origem: 'fila' },
  { tipo: 'onboarding_d3', rotulo: 'Onboarding · dia 3', grupo: 'Onboarding', quando: '3 dias depois da liberação', origem: 'fila' },
  { tipo: 'onboarding_d7', rotulo: 'Onboarding · dia 7', grupo: 'Onboarding', quando: '7 dias depois da liberação', origem: 'fila' },
]
const POR_TIPO = new Map(CATALOGO.map((c) => [c.tipo, c]))

const diaBr = (data) => new Date(data).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

async function tentar(consultar, texto, params) {
  try {
    return (await consultar(texto, params)).rows
  } catch (erro) {
    if (erro?.code === '42P01') return [] // tabela ainda não existe (sequências nunca ligadas)
    throw erro
  }
}

/** Linhas da fila de sequências já no formato do painel. */
export function itensDaFila(linhas) {
  return linhas.map((l) => ({
    id: `fila-${l.id}`,
    tipo: l.passo,
    origem: 'fila',
    quando: l.estado === 'enviado' || l.estado === 'simulado' ? l.enviado_em ?? l.enviar_em : l.enviar_em,
    nome: l.nome ?? null,
    email: l.email,
    curso: l.curso ?? null,
    estado: l.estado,
    motivo: l.erro ?? null,
    comprouDepois: l.comprou_depois === null || l.comprou_depois === undefined ? null : Boolean(l.comprou_depois),
  }))
}

/** E-mails que o motor manda direto (boas-vindas e apoio), lidos dos passos gravados em cada evento da Hotmart. */
export function itensDiretos(linhas) {
  const itens = []
  for (const l of linhas) {
    const passos = [
      ['email_boas_vindas', 'boas_vindas', l.bv],
      ['email_apoio', l.abandono === 'atraso' ? 'apoio_atraso' : 'apoio_carrinho', l.ap],
    ]
    for (const [, tipo, info] of passos) {
      if (!info || (info.ok && info.pulado)) continue // não houve envio (ex.: curso sem e-mail de apoio)
      const simulado = Boolean(l.simulado || info.simulado)
      itens.push({
        id: `evento-${l.id}-${tipo}`,
        tipo,
        origem: 'direto',
        quando: info.em ?? l.recebido_em,
        nome: l.nome ?? null,
        email: l.email ?? null,
        curso: l.curso ?? null,
        estado: info.ok ? (simulado ? 'simulado' : 'enviado') : 'falhou',
        motivo: info.ok ? null : info.erro ?? null,
        comprouDepois: null,
      })
    }
  }
  return itens
}

/** Junta tudo e calcula os números dos gráficos. Função pura (recebe os itens e o relógio). */
export function resumirEmails(itens, { agora = new Date(), dias = 30, env = {} } = {}) {
  const hoje = diaBr(agora)
  const porTipo = CATALOGO.map((c) => ({ ...c, enviados: 0, simulados: 0, pendentes: 0, cancelados: 0, falhas: 0, comprouDepois: 0, taxaCompra: null }))
  const indice = new Map(porTipo.map((t) => [t.tipo, t]))

  const porDia = new Map()
  for (let i = dias - 1; i >= 0; i -= 1) {
    const dia = diaBr(new Date(agora.getTime() - i * 86_400_000))
    porDia.set(dia, { dia, fila: 0, diretos: 0 })
  }

  let enviadosHoje = 0
  let filaHoje = 0
  const total = { enviados: 0, simulados: 0, pendentes: 0, cancelados: 0, falhas: 0 }

  for (const item of itens) {
    const linha = indice.get(item.tipo)
    if (item.estado === 'enviado') {
      total.enviados += 1
      if (linha) linha.enviados += 1
      if (linha && item.comprouDepois) linha.comprouDepois += 1
      const dia = diaBr(item.quando)
      const ponto = porDia.get(dia)
      if (ponto) ponto[item.origem === 'fila' ? 'fila' : 'diretos'] += 1
      if (dia === hoje) {
        enviadosHoje += 1
        if (item.origem === 'fila') filaHoje += 1
      }
    } else if (item.estado === 'simulado') {
      total.simulados += 1
      if (linha) linha.simulados += 1
    } else if (item.estado === 'pendente') {
      total.pendentes += 1
      if (linha) linha.pendentes += 1
    } else if (item.estado === 'cancelado') {
      total.cancelados += 1
      if (linha) linha.cancelados += 1
    } else if (item.estado === 'falhou') {
      total.falhas += 1
      if (linha) linha.falhas += 1
    }
  }
  for (const t of porTipo) {
    if (['carrinho', 'pagamento'].some((g) => EMAILS[t.tipo]?.cenario === g) && t.enviados > 0) t.taxaCompra = Math.round((t.comprouDepois / t.enviados) * 1000) / 10
  }

  return {
    modo: modoSequencias(env),
    dias,
    hoje: { total: enviadosHoje, fila: filaHoje, tetoBrevo: TETO_BREVO_DIA, tetoFila: Math.max(1, Number(env.EMAIL_FILA_LIMITE_DIA) || TETO_FILA_PADRAO) },
    total,
    porTipo,
    porDia: [...porDia.values()],
  }
}

const SQL_FILA = `select f.id, f.passo, f.cenario, f.email, f.nome, f.dados->>'curso' as curso, f.estado, f.erro, f.enviar_em, f.enviado_em,
            case when f.estado = 'enviado' and f.cenario in ('carrinho', 'pagamento')
                 then exists (select 1 from purchases p where lower(p.email) = f.email and p.created_at > f.enviado_em and p.created_at < f.enviado_em + interval '7 days')
            end as comprou_depois
       from emails_fila f`
const SQL_DIRETOS = `select id, nome, email, curso, simulado, recebido_em,
            passos->'email_boas_vindas' as bv, passos->'email_apoio' as ap, passos->'_plano'->>'abandono' as abandono
       from hotmart_eventos`

const comRotulo = (itens) => itens.map((i) => ({ ...i, rotulo: POR_TIPO.get(i.tipo)?.rotulo ?? i.tipo }))
const maisRecentePrimeiro = (itens) => itens.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime())

/** Todos os e-mails de uma pessoa (qualquer época), do mais recente para o mais antigo: alimenta a linha do tempo dela. */
export async function emailsDaPessoa(consultar, email) {
  const chave = String(email ?? '').trim().toLowerCase()
  if (!chave) return []
  const fila = await tentar(consultar, `${SQL_FILA} where f.email = $1 order by coalesce(f.enviado_em, f.enviar_em) desc limit 100`, [chave])
  const diretos = await tentar(
    consultar,
    `${SQL_DIRETOS} where lower(email) = $1 and (passos ? 'email_boas_vindas' or passos ? 'email_apoio') order by recebido_em desc limit 100`,
    [chave],
  )
  return comRotulo(maisRecentePrimeiro([...itensDaFila(fila), ...itensDiretos(diretos)]))
}

/** Todos os e-mails de um tipo no período (até 500): alimenta a janela que abre ao clicar no cartão. */
export async function emailsDoTipo(consultar, tipo, { dias = 30, agora = new Date() } = {}) {
  const modelo = POR_TIPO.get(tipo)
  if (!modelo) return []
  const desde = new Date(agora.getTime() - dias * 86_400_000)
  let itens
  if (modelo.origem === 'fila') {
    const fila = await tentar(
      consultar,
      `${SQL_FILA} where f.passo = $1 and (coalesce(f.enviado_em, f.enviar_em) >= $2 or f.estado = 'pendente') order by coalesce(f.enviado_em, f.enviar_em) desc limit 500`,
      [tipo, desde],
    )
    itens = itensDaFila(fila)
  } else {
    const diretos = await tentar(
      consultar,
      `${SQL_DIRETOS} where recebido_em >= $1 and (passos ? 'email_boas_vindas' or passos ? 'email_apoio') order by recebido_em desc limit ${LINHAS_MAX}`,
      [desde],
    )
    itens = itensDiretos(diretos).filter((i) => i.tipo === tipo).slice(0, 500)
  }
  return comRotulo(maisRecentePrimeiro(itens))
}

/** Monta a resposta completa do painel. */
export async function montarPainelEmails(consultar, { dias = 30, agora = new Date(), env = {} } = {}) {
  const desde = new Date(agora.getTime() - dias * 86_400_000)
  const fila = await tentar(
    consultar,
    `${SQL_FILA} where coalesce(f.enviado_em, f.enviar_em) >= $1 or f.estado = 'pendente' order by coalesce(f.enviado_em, f.enviar_em) desc limit ${LINHAS_MAX}`,
    [desde],
  )
  const diretos = await tentar(
    consultar,
    `${SQL_DIRETOS} where recebido_em >= $1 and (passos ? 'email_boas_vindas' or passos ? 'email_apoio') order by recebido_em desc limit ${LINHAS_MAX}`,
    [desde],
  )
  const itens = [...itensDaFila(fila), ...itensDiretos(diretos)]
  maisRecentePrimeiro(itens)
  const resumo = resumirEmails(itens, { agora, dias, env })
  const lista = comRotulo(itens.slice(0, LISTA_MAX))
  return { ...resumo, lista, listaCortada: itens.length > LISTA_MAX }
}

export const painelEmails = (env, opcoes = {}) => montarPainelEmails((texto, params) => query(env, texto, params), { env, ...opcoes })
