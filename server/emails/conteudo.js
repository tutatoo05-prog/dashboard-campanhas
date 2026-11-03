import { escaparHtml } from '../acesso/integracoes.js'

/**
 * Textos e montagem dos e-mails de sequência (carrinho abandonado, Pix/boleto, expirada, onboarding).
 * Todos os textos ficam AQUI, num lugar só, para revisar e editar sem mexer na fila.
 * Regra de redação: nada de escassez falsa (vaga limitada, última chance de verdade) e nada de prometer o que o
 * dash não controla (prazo exato de Pix/boleto vem da Hotmart).
 *
 * Variáveis: nome (primeiro nome), curso, linkCheckout, linkPagamento (boleto), pixCodigo, linkLogin, linkSuporte.
 */

export const LINK_LOGIN = 'https://tuzinho.academy/login'
export const LINK_SUPORTE = 'https://tuzinho.academy/ajuda/'
export const LINK_CHECKOUT_PADRAO = 'https://pay.hotmart.com/C105186161Q?checkoutMode=10'

/** Checkout de cada oferta do novo Essentials (código da oferta na Hotmart → link): cada pessoa volta para o preço que viu. */
export const CHECKOUTS_POR_OFERTA = {
  scq7pq9v: 'https://pay.hotmart.com/N108253747X?off=scq7pq9v', // R$ 2.999
  '0gapxraj': 'https://pay.hotmart.com/N108253747X?off=0gapxraj', // R$ 1.497
}

/** Link da oferta que a pessoa viu, ou '' se a oferta é desconhecida (aí vale o link padrão). */
export function linkCheckoutDaOferta(oferta) {
  return CHECKOUTS_POR_OFERTA[String(oferta ?? '').trim().toLowerCase()] ?? ''
}

/** Cursos que recebem as sequências de venda (os que têm o checkout do link padrão). */
export const CURSOS_COM_SEQUENCIA = new Set(['Essentials', 'Mentoria Essentials'])

const H = 3_600_000

/**
 * Cada e-mail: quando sai (atraso depois do evento), prioridade (1 = o aluno espera, 2 = conversão/pós-venda)
 * e o conteúdo. `botao.link` é o nome da variável que guarda o endereço.
 */
export const EMAILS = {
  // ── Carrinho abandonado (o 1º e-mail, na hora, já existe: abandono.html) ──────────────────────────────
  carrinho_24h: {
    cenario: 'carrinho',
    atrasoMs: 24 * H,
    prioridade: 2,
    assunto: ({ nome }) => `${nome}, ficou alguma dúvida sobre a Tuzinho Academy?`,
    etiqueta: 'Sua compra ficou pela metade',
    titulo: ({ nome }) => `${nome}, posso te ajudar a terminar?`,
    paragrafos: ({ curso }) => [
      `Você começou a compra do ${curso} e não concluiu. Acontece: às vezes é o pagamento, às vezes bate uma dúvida na hora.`,
      'Se o que travou foi a forma de pagamento, dá para escolher outra na própria página (Pix, cartão ou boleto parcelado, conforme a oferta). Se foi dúvida sobre o conteúdo, nosso suporte responde.',
    ],
    botao: { texto: 'Voltar para minha compra', link: 'linkCheckout' },
  },
  carrinho_72h: {
    cenario: 'carrinho',
    atrasoMs: 72 * H,
    prioridade: 2,
    assunto: ({ curso }) => `Seu ${curso} ainda está esperando por você`,
    etiqueta: 'Última mensagem sobre isso',
    titulo: ({ nome }) => `${nome}, é a última vez que te lembro`,
    paragrafos: ({ curso }) => [
      `Não quero encher sua caixa de entrada: este é o último e-mail sobre o ${curso}.`,
      'Se ainda faz sentido para você, o link abaixo leva direto à compra. Se não, tudo bem, e você não vai receber mais lembretes sobre isso.',
    ],
    botao: { texto: 'Ir para o checkout', link: 'linkCheckout' },
  },

  // ── Pix ou boleto gerado e ainda não pago ────────────────────────────────────────────────────────────
  pix_90min: {
    cenario: 'pagamento',
    atrasoMs: 1.5 * H,
    prioridade: 1,
    assunto: ({ curso }) => `Seu Pix do ${curso} está esperando pagamento`,
    etiqueta: 'Pix gerado',
    titulo: ({ nome }) => `${nome}, seu Pix ainda não foi pago`,
    paragrafos: ({ curso }) => [
      `Você gerou o Pix do ${curso}, mas o pagamento ainda não apareceu para nós. Pix tem prazo para expirar, então vale pagar logo.`,
      'Assim que o pagamento é confirmado, seu acesso é liberado automaticamente e você recebe um e-mail com o login.',
    ],
    codigoPix: true,
    botao: { texto: 'Abrir meu pagamento', link: 'linkCheckout' },
  },
  pix_18h: {
    cenario: 'pagamento',
    atrasoMs: 18 * H,
    prioridade: 1,
    assunto: ({ curso }) => `Seu Pix do ${curso} pode expirar em breve`,
    etiqueta: 'Pix em aberto',
    titulo: ({ nome }) => `${nome}, não deixe seu Pix expirar`,
    paragrafos: ({ curso }) => [
      `O Pix do ${curso} continua em aberto e pode expirar em breve. Se expirar, é só gerar outro na página de compra, sem perder nada.`,
      'Teve algum problema para pagar? É só falar com o suporte.',
    ],
    codigoPix: true,
    botao: { texto: 'Pagar agora', link: 'linkCheckout' },
  },
  boleto_24h: {
    cenario: 'pagamento',
    atrasoMs: 24 * H,
    prioridade: 1,
    assunto: ({ curso }) => `Seu boleto do ${curso} ainda não foi pago`,
    etiqueta: 'Boleto gerado',
    titulo: ({ nome }) => `${nome}, falta pagar o seu boleto`,
    paragrafos: ({ curso }) => [
      `Você gerou o boleto do ${curso}, mas o pagamento ainda não foi identificado. Boleto pode levar até 2 dias úteis para compensar depois de pago, então, se você já pagou, é só aguardar.`,
      'Se ainda não pagou, o botão abaixo abre o boleto de novo.',
    ],
    botao: { texto: 'Abrir meu boleto', link: 'linkPagamento' },
  },
  boleto_72h: {
    cenario: 'pagamento',
    atrasoMs: 72 * H,
    prioridade: 1,
    assunto: ({ curso }) => `Precisa de ajuda com o boleto do ${curso}?`,
    etiqueta: 'Boleto em aberto',
    titulo: ({ nome }) => `${nome}, seu boleto segue em aberto`,
    paragrafos: ({ curso }) => [
      `O boleto do ${curso} continua sem pagamento. Se venceu ou se você prefere outra forma de pagar, dá para fazer uma nova compra pela página e escolher Pix ou cartão.`,
      'Qualquer dúvida, fale com o suporte.',
    ],
    botao: { texto: 'Fazer uma nova compra', link: 'linkCheckout' },
  },

  // ── Pix/boleto que expirou ──────────────────────────────────────────────────────────────────────────
  expirou_1h: {
    cenario: 'pagamento',
    atrasoMs: 1 * H,
    prioridade: 1,
    assunto: ({ curso }) => `Seu pagamento do ${curso} expirou`,
    etiqueta: 'Pagamento expirado',
    titulo: ({ nome }) => `${nome}, seu pagamento expirou`,
    paragrafos: ({ curso }) => [
      `O prazo do seu pagamento do ${curso} acabou e a compra não foi concluída.`,
      'Sem problema: é só gerar um novo na página de compra, e dá para escolher outra forma de pagamento.',
    ],
    botao: { texto: 'Gerar novo pagamento', link: 'linkCheckout' },
  },

  // ── Onboarding (depois da compra aprovada) ───────────────────────────────────────────────────────────
  onboarding_d1: {
    cenario: 'onboarding',
    atrasoMs: 24 * H,
    prioridade: 2,
    assunto: ({ nome }) => `${nome}, por onde começar na Tuzinho Academy`,
    etiqueta: 'Seu primeiro passo',
    titulo: ({ nome }) => `${nome}, vamos começar?`,
    paragrafos: ({ curso }) => [
      `Seu acesso ao ${curso} já está liberado. O melhor jeito de aproveitar é separar um tempo hoje para assistir à primeira aula e anotar o que você já quer aplicar no estúdio.`,
      'Para entrar, crie a sua senha pelo link do e-mail de boas-vindas. Se o link expirou ou você não encontrar o e-mail, use "Esqueci minha senha" na página de login.',
    ],
    botao: { texto: 'Entrar na plataforma', link: 'linkLogin' },
  },
  onboarding_d3: {
    cenario: 'onboarding',
    atrasoMs: 72 * H,
    prioridade: 2,
    assunto: ({ nome }) => `${nome}, você já assistiu à primeira aula?`,
    etiqueta: 'Seu acesso está ativo',
    titulo: ({ nome }) => `${nome}, como está indo?`,
    paragrafos: ({ curso }) => [
      `Faz 3 dias que o ${curso} está liberado para você. Quem assiste às primeiras aulas logo na primeira semana costuma ter muito mais resultado depois.`,
      'Se tiver qualquer dificuldade para entrar ou para achar o conteúdo, o suporte resolve rápido.',
    ],
    botao: { texto: 'Continuar de onde parei', link: 'linkLogin' },
  },
  onboarding_d7: {
    cenario: 'onboarding',
    atrasoMs: 7 * 24 * H,
    prioridade: 2,
    assunto: ({ nome }) => `${nome}, uma semana de Tuzinho Academy`,
    etiqueta: 'Uma semana juntos',
    titulo: ({ nome }) => `${nome}, tudo certo por aí?`,
    paragrafos: ({ curso }) => [
      `Já se passou uma semana desde que você entrou no ${curso}. Se alguma coisa travou, seja o acesso, uma aula ou uma dúvida, fale com a gente antes de decidir qualquer coisa: a maioria dos problemas se resolve em minutos.`,
      'E se está tudo indo bem, continue no seu ritmo. Estamos torcendo por você.',
    ],
    botao: { texto: 'Falar com o suporte', link: 'linkSuporte' },
  },
}

const COR = { escuro: '#1a1814', dourado: '#ffcb47', fundo: '#f7f4ec', texto: '#3a362e', botao: '#25d366' }

function primeiroNome(nome) {
  return String(nome ?? '').trim().split(/\s+/)[0] || 'aluno(a)'
}

/** Monta assunto e HTML de um e-mail da sequência. Todos os valores variáveis são escapados. */
export function montarEmail(chave, dados = {}) {
  const modelo = EMAILS[chave]
  if (!modelo) throw new Error(`E-mail de sequência desconhecido: ${chave}`)
  const vars = {
    nome: primeiroNome(dados.nome),
    curso: String(dados.curso || 'curso'),
    linkCheckout: dados.linkCheckout || LINK_CHECKOUT_PADRAO,
    linkPagamento: dados.linkPagamento || dados.linkCheckout || LINK_CHECKOUT_PADRAO,
    linkLogin: LINK_LOGIN,
    linkSuporte: LINK_SUPORTE,
    pixCodigo: dados.pixCodigo || '',
  }
  const assunto = modelo.assunto(vars)
  const titulo = modelo.titulo(vars)
  const paragrafos = modelo.paragrafos(vars)
  const link = vars[modelo.botao.link]

  const p = (texto) =>
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:${COR.texto};font-weight:500">${escaparHtml(texto)}</p>`
  const pix = modelo.codigoPix && vars.pixCodigo
    ? `<p style="margin:0 0 6px;font-size:13px;color:#8a8478">Pix copia e cola:</p><p style="margin:0 0 22px;padding:12px 14px;background:#fffaf0;border:1px solid #f0dfb3;border-radius:10px;font-family:Consolas,monospace;font-size:12px;line-height:1.5;color:${COR.escuro};word-break:break-all">${escaparHtml(vars.pixCodigo)}</p>`
    : ''

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light only"><title>${escaparHtml(assunto)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};font-family:Arial,Helvetica,sans-serif;color:${COR.escuro}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escaparHtml(modelo.paragrafos(vars)[0])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.fundo};padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%">
<tr><td align="center" style="padding:8px 0 22px"><a href="https://tuzinho.academy/"><img src="https://tuzinho.academy/assets/img/material/img/logo%20tuzinho%20academy%20-%20laranja.png" alt="Tuzinho Academy" width="72" height="72" style="width:72px;height:72px;border-radius:16px;display:block"></a></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:22px;overflow:hidden;border:1px solid #eadfca">
<tr><td align="center" style="background:${COR.escuro};padding:28px 30px 24px">
<span style="display:inline-block;color:${COR.dourado};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,203,71,.35)">${escaparHtml(modelo.etiqueta)}</span>
<div style="padding-top:18px;font-size:26px;line-height:1.25;font-weight:800;color:${COR.dourado}">${escaparHtml(titulo)}</div></td></tr>
<tr><td style="padding:30px 32px 8px">${paragrafos.map(p).join('')}${pix}</td></tr>
<tr><td align="center" style="padding:6px 32px 30px"><a href="${escaparHtml(link)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:17px 32px;font-size:15px;font-weight:800;text-transform:uppercase;text-decoration:none;color:#fff;background:${COR.botao};border-radius:14px">${escaparHtml(modelo.botao.texto)} →</a></td></tr>
<tr><td align="center" style="padding:0 32px 28px"><p style="margin:0;font-size:14px;line-height:1.55;color:#5a564c">Precisa de ajuda? <a href="${LINK_SUPORTE}" style="color:#c47c00;font-weight:700;text-decoration:none">Fale com o suporte</a></p></td></tr>
</table></td></tr>
<tr><td align="center" style="padding:22px 16px 8px"><p style="margin:0 0 6px;font-size:13px;color:#8a8478;font-weight:600">Tuzinho Academy</p>
<p style="margin:0;font-size:11px;line-height:1.5;color:#b0aaa0">Você recebeu este e-mail por causa de uma compra ou cadastro em tuzinho.academy. Para não receber mais mensagens como esta, fale com o suporte.</p></td></tr>
</table></td></tr></table></body></html>`

  return { assunto, html, cenario: modelo.cenario, prioridade: modelo.prioridade }
}
