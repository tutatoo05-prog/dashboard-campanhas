import { soDigitos } from './hotmart.js'

/**
 * Regras de decisão do acesso. Tudo aqui é função pura (sem rede e sem banco), reproduzindo o que o
 * fluxo "HOTMART PAGAMENTOS" do n8n fazia, mais a regra dos 30 dias do Pix parcelado.
 */

// Igual ao n8n: todos os cursos que liberam acesso usam esta campanha na plataforma de cursos.
export const CAMPANHA_PADRAO = 'mentoria-essentials-boleto-parcelado'
export const DIAS_PADRAO = 365
// Quanto cada parcela de Pix parcelado cobre (só para o controle de atraso no dash; na plataforma o acesso é de 365 dias).
export const DIAS_PIX_PARCELADO = 30

export function validarCpf(valor) {
  const cpf = soDigitos(valor)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  const digito = (tamanho) => {
    let soma = 0
    for (let i = 0; i < tamanho; i += 1) soma += Number(cpf[i]) * (tamanho + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 || resto === 11 ? 0 : resto
  }
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}

/**
 * Telefone para o WhatsApp. Brasil (país BR, ou sem país e com cara de celular brasileiro) ganha o 55
 * uma vez só; número de outro país fica como a Hotmart mandou (já vem com o código do país).
 */
export function telefoneWhatsapp(bruto, pais) {
  const digitos = soDigitos(bruto)
  if (!digitos) return ''
  const sigla = String(pais ?? '').toUpperCase()
  const brasileiro = sigla === 'BR' || (!sigla && digitos.length >= 10 && digitos.length <= 11)
  if (!brasileiro) return digitos
  return `55${digitos.length > 11 ? digitos.replace(/^55/, '') : digitos}`
}

/** O n8n só mandava WhatsApp ao aluno quando o número era brasileiro completo (55 + DDD + 9 dígitos). */
export function whatsappBrasileiroValido(telefone) {
  const digitos = soDigitos(telefone)
  return digitos.startsWith('55') && digitos.length === 13
}

/** Nome do curso como aparece nos e-mails de abandono e nas mensagens. */
export function rotuloCurso(venda) {
  const nome = venda.produto
  const minusculo = nome.toLowerCase()
  if (minusculo.includes('presencial')) return 'Workshop Presencial'
  if (minusculo.includes('particular')) return 'Mentoria Particular com Tuzinho Tattoo'
  if (minusculo.includes('mentoria') && minusculo.includes('essentials')) return 'Mentoria Essentials'
  if (minusculo.includes('essentials')) return 'Essentials'
  return nome
}

const PLANOS_LIBERAM = new Set(['Essentials', 'REC_Essentials', 'REC_Essentials total', 'Essentials total'])

/**
 * Qual caminho a compra aprovada segue (mesma lógica do Switch1 do n8n):
 *  - particular / presencial: só e-mail e aviso, sem liberar curso;
 *  - liberar: Essentials em qualquer forma de pagamento e Mentoria Essentials;
 *  - sem_regra: produto que nenhuma regra conhece (vira alerta, não some em silêncio).
 */
export function rotaDaCompra(venda) {
  const item = venda.produtoItem.toLowerCase()
  const produto = venda.produto.toLowerCase()
  if (item === 'mentoria particular com tuzinho tattoo' || produto.includes('particular')) return 'particular'
  if (item === 'workshop presencial' || produto.includes('presencial')) return 'presencial'
  if (venda.produto === 'Mentoria Essentials') return 'liberar'
  if (PLANOS_LIBERAM.has(venda.plano)) return 'liberar'
  // Plano com nome novo ou sem plano: se o produto é o Essentials, quem pagou recebe o acesso (365 dias).
  if (produto.includes('essentials')) return 'liberar'
  return 'sem_regra'
}

/** Plano de pagamento parcelado (REC_...), não o "total". */
export function planoParcelado(plano) {
  return /^REC_/i.test(plano) && !/\btotal$/i.test(plano)
}

const TIPOS_PIX = new Set(['PIX', 'PIX_AUTOMATIC'])

/**
 * Pix parcelado: plano parcelado (REC_...) pago por Pix, ou parcela seguinte (recorrência > 1) de um Pix.
 * Na plataforma TODO MUNDO recebe 365 dias (decisão do Ygor: a API da plataforma ainda não renova nem bloqueia).
 * O Pix parcelado só é marcado à parte no dash: cada parcela paga cobre 30 dias (`pago_ate`) e, se uma
 * parcela atrasar, o aluno aparece em Acessos para ser inativado na plataforma na mão.
 */
export function ehPixParcelado(venda) {
  if (!TIPOS_PIX.has(venda.pagamentoTipo)) return false
  return planoParcelado(venda.plano) || Number(venda.recorrencia) > 1
}

/** Dias que o dash pede à plataforma: sempre 365, em qualquer forma de pagamento. */
export function diasDeAcesso() {
  return DIAS_PADRAO
}

/**
 * É uma parcela seguinte de quem já tem acesso (e não a primeira compra)? Cruza com o acesso guardado:
 * mesmo assinante com outra transação, ou número da recorrência maior que 1.
 */
export function ehRenovacao(venda, acesso) {
  if (Number(venda.recorrencia) > 1) return true
  if (acesso && venda.assinante && acesso.subscriber_code === venda.assinante && acesso.ultima_transacao && acesso.ultima_transacao !== venda.transacao) {
    return true
  }
  return false
}

/** "REC_Essentials" (plano recorrente) e "Essentials total" são o mesmo curso Essentials. */
export function normalizarCurso(valor) {
  return String(valor ?? '')
    .replace(/^REC_/i, '')
    .replace(/\s+total$/i, '')
    .trim()
}

/** Nome do curso nas mensagens, no cadastro do acesso e na tela Compras (o plano tem prioridade, como no n8n). */
export function nomeDoCurso(venda) {
  return normalizarCurso(venda.plano) || rotuloCurso(venda)
}

export const ROTULOS_COM_ABANDONO = new Set([
  'Mentoria Particular com Tuzinho Tattoo',
  'Workshop Presencial',
  'Essentials',
  'Mentoria Essentials',
])

export function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim())
}

/**
 * Passos de cada tipo de evento. "critico" interrompe a sequência quando falha (sem o acesso liberado
 * não faz sentido avisar o aluno); os demais passos são independentes e refeitos um a um.
 */
export function decidir(venda, { acesso = null } = {}) {
  switch (venda.evento) {
    case 'PURCHASE_APPROVED': {
      if (!venda.email) return { tipo: 'atencao', motivo: 'Compra aprovada sem e-mail do comprador.' }

      // Sem documento o n8n não liberava: pedia ao aluno para corrigir os dados na Hotmart.
      if (!venda.documento) {
        return { tipo: 'atencao', motivo: 'Compra sem CPF/documento: acesso não liberado.', passos: ['whatsapp_correcao'], dados: { rota: rotaDaCompra(venda) } }
      }

      const rota = rotaDaCompra(venda)
      const curso = nomeDoCurso(venda)

      if (rota === 'sem_regra') {
        return { tipo: 'atencao', motivo: `Produto sem regra de liberação: "${venda.produto}" / plano "${venda.plano}".`, dados: { rota } }
      }
      if (rota === 'particular' || rota === 'presencial') {
        return { tipo: 'sem_liberacao', rota, curso, passos: ['email_boas_vindas', 'aviso_tuzinho'] }
      }

      const renovacao = ehRenovacao(venda, acesso)
      const dias = diasDeAcesso(venda)
      const parcelado = ehPixParcelado(venda)
      // Quem tinha sido inativado na plataforma e pagou de novo: a equipe precisa reativar na mão.
      const reativar = acesso?.status === 'bloqueado'
      const aviso = reativar ? ['aviso_reativar'] : []
      if (renovacao) {
        return { tipo: 'renovar', rota, curso, dias, parcelado, reativar, passos: ['liberar', 'registrar_acesso', ...aviso] }
      }
      return {
        tipo: 'liberar',
        rota,
        curso,
        dias,
        parcelado,
        reativar,
        passos: ['liberar', 'registrar_acesso', ...aviso, 'email_boas_vindas', 'registrar_venda', 'whatsapp_aluno', 'aviso_tuzinho'],
      }
    }

    case 'PURCHASE_OUT_OF_SHOPPING_CART':
      return { tipo: 'abandono', abandono: 'carrinho', curso: rotuloCurso(venda), passos: ['registrar_abandono', 'email_apoio'] }

    case 'PURCHASE_DELAYED':
      return { tipo: 'atraso', abandono: 'atraso', curso: rotuloCurso(venda), parcelado: ehPixParcelado(venda), passos: ['registrar_atraso', 'registrar_abandono', 'email_apoio'] }

    default:
      return { tipo: 'ignorar' }
  }
}

/**
 * Quando bloquear uma parcela atrasada: no N-ésimo dia de atraso (padrão: 2º), à meia-noite de São Paulo.
 * O 1º dia de atraso é o dia em que a Hotmart avisou o atraso.
 */
export function momentoDoBloqueio(atrasoDesde, diaDoBloqueio = 2) {
  const base = new Date(atrasoDesde)
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(base)
  const [ano, mes, dia] = partes.split('-').map(Number)
  // Brasília não tem horário de verão desde 2019: UTC-3 fixo.
  const meiaNoite = Date.UTC(ano, mes - 1, dia, 3, 0, 0)
  return new Date(meiaNoite + (Math.max(1, diaDoBloqueio) - 1) * 24 * 60 * 60 * 1000)
}

/** Soma dias a partir do que for maior: agora ou o fim do acesso atual (pagar adiantado não perde dias). */
export function novoFimDoAcesso(atual, agora, dias) {
  const inicio = atual && new Date(atual) > agora ? new Date(atual) : new Date(agora)
  return new Date(inicio.getTime() + dias * 24 * 60 * 60 * 1000)
}

/** Espera antes de cada nova tentativa (minutos): 1, 2, 5, 10, 30, 60. */
export const ESPERA_TENTATIVAS_MIN = [1, 2, 5, 10, 30, 60]
export const MAX_TENTATIVAS = ESPERA_TENTATIVAS_MIN.length + 1

export function esperaDaTentativa(tentativas) {
  return ESPERA_TENTATIVAS_MIN[Math.min(Math.max(tentativas, 1), ESPERA_TENTATIVAS_MIN.length) - 1]
}
