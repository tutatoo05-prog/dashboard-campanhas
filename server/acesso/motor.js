import { normalizarEvento, primeiroNome } from './hotmart.js'
import {
  CAMPANHA_PADRAO,
  DIAS_PIX_PARCELADO,
  ESPERA_TENTATIVAS_MIN,
  MAX_TENTATIVAS,
  ROTULOS_COM_ABANDONO,
  decidir,
  emailValido,
  esperaDaTentativa,
  momentoDoBloqueio,
  nomeDoCurso,
  rotuloCurso,
  telefoneWhatsapp,
  whatsappBrasileiroValido,
} from './regras.js'
import * as integracoesPadrao from './integracoes.js'
import { v2Configurado } from './tekwayV2.js'

/**
 * Motor da liberação de acesso: pega um evento da Hotmart já gravado, decide o que fazer e executa
 * os passos um a um. O resultado de cada passo fica gravado no próprio evento, então uma nova
 * tentativa só refaz o que falhou (nunca libera, avisa ou manda e-mail duas vezes).
 *
 * Modos (ACESSO_MODO): desligado | teste (decide e registra, sem tocar em nada fora do dash) | ativo.
 */

export function modoAcesso(env) {
  const modo = String(env.ACESSO_MODO ?? 'desligado').trim().toLowerCase()
  return modo === 'ativo' || modo === 'teste' ? modo : 'desligado'
}

/** Falha que não adianta tentar de novo (ex.: e-mail do comprador inválido): vira "atenção" e avisa a equipe. */
export class ErroPermanente extends Error {}

const ASSUNTO_BOAS_VINDAS = '🎨 Tudo certo! Você agora é um aluno da Tuzinho Academy'
const PASSOS_CRITICOS = new Set(['liberar', 'revogar_acesso'])
const ALERTA_NA_TENTATIVA = 3

const dataBr = (data) => new Date(data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export function textoAcessoAluno(nome, curso) {
  return `✅ Tudo certo, ${nome}! Seu acesso no ${curso} foi confirmado. Você receberá informações de acesso no mesmo e-mail que finalizou sua compra. \n\nAproveite para assistir agora e dominar novas técnicas.\n\n`
}

export function textoNovaVenda(nome, curso) {
  return `🎉 *NOVA VENDA REALIZADA!*\n\n👤 *Cliente:* ${nome}\n📚 *Curso:* ${curso}\n\n`
}

export function textoReativar(nome, email, curso) {
  return `🔓 *Reativar acesso na plataforma*\n\n${nome || email} voltou a pagar (${curso}).\n✉️ ${email}\n\nO acesso dele tinha sido inativado por atraso: reative na plataforma e marque como feito em Acessos.\n`
}

export function textoCorrecao(nome) {
  return `✅ Olá, ${nome}! Tivemos um problema com seus dados dentro da Hotmart, pedimos que acesse a plataforma e certifique que seus dados estão corretos.\n\n`
}

/** Linha no formato da tabela vendas do site, para reaproveitar a conversão que a tela Compras já usa. */
export function linhaDeVenda(venda, agora) {
  return {
    id: `hotmart-${venda.eventId}`,
    criado_em: agora,
    aprovada_em: venda.aprovadaEm ?? agora,
    transacao: venda.transacao,
    nome: venda.nome,
    email: venda.email,
    telefone: telefoneWhatsapp(venda.telefoneBruto, venda.pais),
    curso: nomeDoCurso(venda),
    campanha: venda.origem.utmCampaign,
    liberacao: 'sim',
    valor: venda.valor,
    moeda: venda.moeda,
    pagamento_tipo: venda.pagamentoTipo,
    src: venda.origem.src,
    xcod: venda.origem.xcod,
    recorrencia: venda.recorrencia,
    assinante: venda.assinante,
  }
}

function criarExecutores({ env, repo, integ, agora }, venda, plano, passos = {}) {
  const telefone = telefoneWhatsapp(venda.telefoneBruto, venda.pais)
  const nomeMensagem = venda.primeiroNome || venda.nome
  const cursoMensagem = nomeDoCurso(venda)

  return {
    async liberar() {
      return integ.liberarCurso(env, {
        idVenda: venda.eventId,
        nome: venda.nome,
        email: venda.email,
        telefone: venda.telefoneBruto,
        campanha: CAMPANHA_PADRAO,
        dias: plano.dias,
        documento: venda.documento,
      })
    },

    async registrar_acesso() {
      return repo.registrarPagamento({
        email: venda.email,
        curso: cursoMensagem,
        nome: venda.nome,
        telefone,
        documento: venda.documento,
        plano: venda.plano,
        pagamentoTipo: venda.pagamentoTipo,
        assinante: venda.assinante || null,
        dias: plano.dias,
        parcelado: Boolean(plano.parcelado),
        diasPagos: DIAS_PIX_PARCELADO,
        transacao: venda.transacao,
      })
    },

    /**
     * Quem tinha sido inativado por atraso e pagou de novo volta sozinho pela API V2 (só tira o bloqueio, não cria aluno).
     * Sem a API V2 configurada, cai no caminho antigo: avisa a equipe para reativar na mão.
     */
    async reativar_acesso() {
      if (!v2Configurado(env)) return integ.avisarEquipe(env, textoReativar(venda.nome, venda.email, cursoMensagem))
      const resultado = await integ.reativarAcesso(env, { email: venda.email, motivo: 'pagamento_regularizado' })
      const acessoId = passos.registrar_acesso?.acessoId
      if (acessoId) await repo.marcarReativado(acessoId)
      return resultado
    },
    aviso_reativar() {
      return this.reativar_acesso()
    },

    /** Reembolso: revoga o acesso na plataforma (reversível). Sem a API V2, vira "atenção" para a equipe revogar na mão. */
    async revogar_acesso() {
      if (!v2Configurado(env)) throw new ErroPermanente('Reembolso: a API V2 da plataforma não está configurada, revogue o acesso na mão.')
      return integ.revogarAcesso(env, { email: venda.email, motivo: 'reembolso', observacoes: `Hotmart ${venda.transacao}` })
    },

    async marcar_reembolso() {
      return repo.marcarReembolso({ email: venda.email, curso: cursoMensagem, transacao: venda.transacao })
    },

    async aviso_reembolso() {
      return integ.avisarEquipe(env, `↩️ *Reembolso: acesso revogado*

👤 ${venda.nome || venda.email}
✉️ ${venda.email}
📚 ${cursoMensagem}

O acesso foi revogado na plataforma e a compra marcada como cancelada no dash.
`)
    },

    async email_boas_vindas() {
      if (!emailValido(venda.email)) throw new ErroPermanente(`E-mail do comprador inválido: "${venda.email}"`)
      const modelo = await integ.carregarTemplate('boas-vindas')
      const html = integ.renderizar(modelo, { nome: venda.nome, email: venda.email, documento: venda.documento })
      return integ.enviarEmail(env, { para: venda.email, nomePara: venda.nome, assunto: ASSUNTO_BOAS_VINDAS, html })
    },

    async registrar_venda() {
      return repo.registrarCompra(linhaDeVenda(venda, agora()))
    },

    async whatsapp_aluno() {
      if (!whatsappBrasileiroValido(telefone)) return { pulado: 'telefone sem WhatsApp brasileiro completo' }
      return integ.enviarWhatsapp(env, { conta: 'aluno', numero: telefone, texto: textoAcessoAluno(nomeMensagem, cursoMensagem) })
    },

    async aviso_tuzinho() {
      return integ.avisarEquipe(env, textoNovaVenda(venda.nome, cursoMensagem))
    },

    async whatsapp_correcao() {
      if (!telefone) return { pulado: 'sem telefone' }
      return integ.enviarWhatsapp(env, { conta: 'aluno', numero: telefone, texto: textoCorrecao(nomeMensagem) })
    },

    async registrar_atraso() {
      const quando = venda.criadoEm ?? agora()
      return repo.registrarAtraso({
        email: venda.email,
        nome: venda.nome,
        telefone,
        assinante: venda.assinante || null,
        curso: cursoMensagem,
        parcelado: Boolean(plano.parcelado),
        atrasoDesde: quando,
        bloquearEm: momentoDoBloqueio(quando, Number(env.ACESSO_BLOQUEIO_DIA) || 2),
      })
    },

    async registrar_abandono() {
      return repo.registrarAbandono({
        email: venda.email,
        tipo: plano.abandono,
        nome: venda.primeiroNome || venda.nome,
        telefone,
        curso: plano.curso,
        ocorridoEm: venda.criadoEm ?? agora(),
        eventoId: plano.eventoId ?? null,
      })
    },

    async email_apoio() {
      if (!emailValido(venda.email)) return { pulado: 'e-mail inválido' }
      if (!ROTULOS_COM_ABANDONO.has(plano.curso)) return { pulado: `curso sem e-mail de apoio: "${plano.curso}"` }
      const modelo = await integ.carregarTemplate('abandono')
      const nome = primeiroNome(venda.primeiroNome || venda.nome) || 'amigo(a)'
      const html = integ.renderizar(modelo, { nome, curso: plano.curso })
      const resultado = await integ.enviarEmail(env, { para: venda.email, nomePara: nome, assunto: `${plano.curso} está te esperando 🚀`, html })
      await repo.marcarAbandonoEnviado({ email: venda.email, tipo: plano.abandono, enviadoEm: agora() })
      return resultado
    },
  }
}

/** Texto de aviso à equipe quando algo precisa de gente. */
export function textoAlerta(evento, venda, motivo) {
  return [
    '⚠️ *Acesso precisa de atenção*',
    '',
    `👤 ${venda.nome || '(sem nome)'}`,
    `✉️ ${venda.email || '(sem e-mail)'}`,
    `📚 ${nomeDoCurso(venda) || venda.produto || '(sem curso)'}`,
    `🔖 Evento ${evento.id} · ${venda.evento}`,
    '',
    motivo,
    '',
    '_Veja em Acessos → Eventos._',
  ].join('\n')
}

async function alertar(motor, evento, venda, passos, chave, motivo) {
  passos._alertas = passos._alertas ?? []
  if (passos._alertas.includes(chave)) return
  try {
    // Problema: Telegram primeiro (cai no WhatsApp da equipe se não houver). Nos testes/integrações simples vale o avisarEquipe.
    await (motor.integ.avisarProblema ?? motor.integ.avisarEquipe)(motor.env, textoAlerta(evento, venda, motivo))
    passos._alertas.push(chave)
  } catch (erro) {
    console.error('[acesso] não consegui avisar a equipe:', erro.message || erro)
  }
}

/**
 * Processa um evento já reivindicado (estado "processando"). Nunca lança: o que der errado fica
 * gravado no evento e a fila tenta de novo.
 */
export async function processarEvento(motor, evento) {
  const { env, repo } = motor
  const modo = modoAcesso(env)
  const venda = normalizarEvento(evento.payload)
  const passos = { ...(evento.passos ?? {}) }
  const simulado = modo !== 'ativo'

  try {
    if (!passos._plano) {
      const acesso = modo === 'desligado' ? null : await repo.buscarAcesso({ assinante: venda.assinante, email: venda.email, curso: nomeDoCurso(venda) })
      passos._plano = { ...decidir(venda, { acesso }), eventoId: evento.id }
    }
    const plano = passos._plano

    if (plano.tipo === 'ignorar') {
      await repo.salvarProgresso(evento.id, { estado: 'ignorado', decisao: 'ignorar', passos, simulado, processadoEm: motor.agora() })
      return { estado: 'ignorado' }
    }

    const executores = criarExecutores(motor, venda, plano, passos)
    const lista = [...(plano.passos ?? [])]
    const falhas = []
    const permanentes = []

    for (const nome of lista) {
      if (passos[nome]?.ok) continue
      try {
        const resultado = simulado ? { simulado: true } : await executores[nome]()
        passos[nome] = { ok: true, em: motor.agora().toISOString(), ...(resultado && typeof resultado === 'object' ? resultado : {}) }
      } catch (erro) {
        const permanente = erro instanceof ErroPermanente
        passos[nome] = { ok: false, em: motor.agora().toISOString(), erro: String(erro.message || erro).slice(0, 500), permanente }
        ;(permanente ? permanentes : falhas).push(`${nome}: ${passos[nome].erro}`)
        if (PASSOS_CRITICOS.has(nome)) break
      }
      await repo.salvarProgresso(evento.id, { passos })
    }

    const precisaAtencao = plano.tipo === 'atencao'
    const tentativas = (evento.tentativas ?? 0) + (falhas.length ? 1 : 0)

    if (precisaAtencao || permanentes.length) {
      if (!simulado) {
        const motivo = [plano.motivo, ...permanentes].filter(Boolean).join('\n')
        await alertar(motor, evento, venda, passos, 'atencao', motivo)
      }
      const emFalha = falhas.length > 0
      await repo.salvarProgresso(evento.id, {
        estado: emFalha && tentativas < MAX_TENTATIVAS ? 'erro' : 'atencao',
        decisao: plano.tipo,
        passos,
        tentativas,
        proxima: emFalha && tentativas < MAX_TENTATIVAS ? new Date(motor.agora().getTime() + esperaDaTentativa(tentativas) * 60_000) : undefined,
        erro: [plano.motivo, ...permanentes, ...falhas].filter(Boolean).join(' | ').slice(0, 1000),
        simulado,
        processadoEm: motor.agora(),
      })
      return { estado: 'atencao' }
    }

    if (falhas.length) {
      const esgotou = tentativas >= MAX_TENTATIVAS
      if (!simulado && (tentativas === ALERTA_NA_TENTATIVA || esgotou)) {
        const motivo = esgotou
          ? `Desisti depois de ${tentativas} tentativas:\n${falhas.join('\n')}`
          : `Ainda falhando na tentativa ${tentativas}:\n${falhas.join('\n')}`
        await alertar(motor, evento, venda, passos, esgotou ? 'falhou' : `tentativa-${tentativas}`, motivo)
      }
      await repo.salvarProgresso(evento.id, {
        estado: esgotou ? 'falhou' : 'erro',
        decisao: plano.tipo,
        passos,
        tentativas,
        proxima: esgotou ? undefined : new Date(motor.agora().getTime() + esperaDaTentativa(tentativas) * 60_000),
        erro: falhas.join(' | ').slice(0, 1000),
        simulado,
        processadoEm: esgotou ? motor.agora() : undefined,
      })
      return { estado: esgotou ? 'falhou' : 'erro' }
    }

    await repo.salvarProgresso(evento.id, { estado: 'ok', decisao: plano.tipo, passos, erro: null, simulado, processadoEm: motor.agora() })
    return { estado: 'ok' }
  } catch (erro) {
    // Falha inesperada (banco fora do ar, bug): volta para a fila com espera, sem perder o evento.
    const tentativas = (evento.tentativas ?? 0) + 1
    console.error('[acesso] erro inesperado no evento', evento.id, erro)
    await repo
      .salvarProgresso(evento.id, {
        estado: tentativas >= MAX_TENTATIVAS ? 'falhou' : 'erro',
        passos,
        tentativas,
        proxima: new Date(motor.agora().getTime() + esperaDaTentativa(tentativas) * 60_000),
        erro: String(erro.message || erro).slice(0, 1000),
      })
      .catch(() => {})
    return { estado: 'erro' }
  }
}

export function criarMotor(env, { repo, integ = integracoesPadrao, agora = () => new Date() } = {}) {
  return { env, repo, integ, agora }
}

/** Processa tudo o que está pronto na fila (um evento por vez). Devolve quantos foram processados. */
export async function processarFila(motor, { limite = 25 } = {}) {
  if (modoAcesso(motor.env) === 'desligado') return 0
  let feitos = 0
  while (feitos < limite) {
    const evento = await motor.repo.reivindicar()
    if (!evento) break
    await processarEvento(motor, evento)
    feitos += 1
  }
  return feitos
}

/**
 * Bloqueia quem passou do dia limite de atraso. Chamado pelo agendador. Se a plataforma ainda não tem
 * endpoint de bloqueio (TEKWAY_BLOQUEAR_URL), avisa a equipe uma vez para bloquear na mão.
 */
export async function bloquearAtrasados(motor) {
  const { env, repo, integ } = motor
  if (modoAcesso(env) !== 'ativo') return 0
  const lista = await repo.acessosParaBloquear()
  let bloqueados = 0

  for (const acesso of lista) {
    const resumo = `${acesso.nome || acesso.email} (${acesso.email}) — ${acesso.curso}, atrasado desde ${dataBr(acesso.atraso_desde)}`
    try {
      if (!v2Configurado(env) && !String(env.TEKWAY_BLOQUEAR_URL ?? '').trim()) {
        await integ.avisarEquipe(env, `🔒 *Inativar acesso na plataforma (parcela atrasada)*\n\n${resumo}\n\nA plataforma ainda não tem bloqueio automático: inative na mão e marque como feito em Acessos.\n`)
        await repo.marcarBloqueioManual(acesso.id)
        continue
      }
      if (v2Configurado(env)) await integ.revogarAcesso(env, { email: acesso.email, motivo: 'parcela atrasada', observacoes: `Atrasado desde ${dataBr(acesso.atraso_desde)}` })
      else await integ.bloquearCurso(env, { email: acesso.email, campanha: CAMPANHA_PADRAO, documento: acesso.documento, motivo: 'parcela atrasada' })
      await repo.marcarBloqueado(acesso.id)
      bloqueados += 1
      await integ.avisarEquipe(env, `🔒 *Acesso bloqueado (parcela atrasada)*\n\n${resumo}\n`).catch(() => {})
    } catch (erro) {
      const tentativas = (acesso.bloqueio_tentativas ?? 0) + 1
      await repo.marcarBloqueioFalha(acesso.id, {
        tentativas,
        proxima: new Date(motor.agora().getTime() + (ESPERA_TENTATIVAS_MIN[Math.min(tentativas, ESPERA_TENTATIVAS_MIN.length) - 1] ?? 60) * 60_000),
        erro: String(erro.message || erro).slice(0, 500),
      })
      if (tentativas === ALERTA_NA_TENTATIVA) {
        await (integ.avisarProblema ?? integ.avisarEquipe)(env, `⚠️ *Falha ao bloquear acesso*\n\n${resumo}\n${String(erro.message || erro).slice(0, 200)}\n`).catch(() => {})
      }
    }
  }
  return bloqueados
}

export { rotuloCurso }
