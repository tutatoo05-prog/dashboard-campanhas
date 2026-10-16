/**
 * Tipo da campanha ("para que ela serve"): o dash descobre sozinho a partir do que a Meta informa
 * (objetivo, meta de otimização dos conjuntos, destino, evento do pixel e link dos anúncios) e só
 * pergunta ao usuário quando não tem certeza. A escolha manual vale sempre.
 *
 * Arquivo em JavaScript puro porque o servidor e o painel usam as mesmas regras.
 */

export const TIPOS = {
  captacao: { label: 'Captação de leads', emoji: '🎯', resultado: 'lead', cobraLead: true },
  live: { label: 'Live / vídeo', emoji: '🎥', resultado: 'visualização (ThruPlay)', cobraLead: false },
  engajamento: { label: 'Engajamento', emoji: '💬', resultado: 'interação', cobraLead: false },
  venda: { label: 'Venda direta', emoji: '💰', resultado: 'compra', cobraLead: false },
  reconhecimento: { label: 'Reconhecimento', emoji: '📣', resultado: 'alcance', cobraLead: false },
  conversas: { label: 'Conversas', emoji: '🗨️', resultado: 'conversa', cobraLead: false },
  indefinido: { label: 'Tipo não identificado', emoji: '❓', resultado: 'não sei', cobraLead: true },
}

export const TIPOS_ESCOLHIVEIS = ['captacao', 'live', 'engajamento', 'venda', 'reconhecimento', 'conversas']

/** Domínios das páginas do próprio negócio (anúncio que leva para elas costuma ser captação). */
export const DOMINIOS_PROPRIOS = ['tuzinho.academy', 'tuzinho.app']

const DOMINIOS_SOCIAIS = ['instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'l.instagram.com', 'wa.me', 'whatsapp.com']

const lista = (valor) => (Array.isArray(valor) ? valor : valor ? [...valor] : [])
const maiusculas = (valor) => lista(valor).map((item) => String(item).toUpperCase())

function hostDe(link) {
  try {
    return new URL(String(link)).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

const eDominio = (host, dominios) => dominios.some((dominio) => host === dominio || host.endsWith(`.${dominio}`))

/** O tipo não é "captação": a campanha não deve ser cobrada por lead. */
export function tipoSemLead(tipo) {
  return Boolean(tipo) && TIPOS[tipo] ? TIPOS[tipo].cobraLead === false : false
}

/**
 * @param {{ objetivoBruto?: string, otimizacoes?: string[], destinos?: string[], eventos?: string[], links?: string[], leadsSite?: number }} info
 * @returns {{ tipo: string, confianca: 'alta' | 'media' | 'baixa', motivo: string }}
 */
export function inferirTipo(info = {}) {
  const objetivo = String(info.objetivoBruto ?? '').toUpperCase()
  const otimizacoes = maiusculas(info.otimizacoes)
  const destinos = maiusculas(info.destinos)
  const eventos = maiusculas(info.eventos)
  const hosts = [...new Set(lista(info.links).map(hostDe).filter(Boolean))]
  const tem = (valores, ...procurados) => procurados.some((item) => valores.includes(item))

  // Live ou vídeo: a Meta otimiza para visualização.
  if (tem(destinos, 'INSTAGRAM_LIVE') || tem(otimizacoes, 'THRUPLAY', 'VIDEO_VIEWS', 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS', 'CONTINUOUS_VIDEO_VIEWS') || objetivo.includes('VIDEO')) {
    const live = tem(destinos, 'INSTAGRAM_LIVE')
    return {
      tipo: 'live',
      confianca: 'alta',
      motivo: live ? 'A Meta entrega para a sua live no Instagram e otimiza para visualização (ThruPlay).' : 'A Meta otimiza para visualização de vídeo (ThruPlay).',
    }
  }

  // Captação de leads: formulário da Meta, evento Lead do pixel ou objetivo de leads.
  if (objetivo.includes('LEAD') || tem(otimizacoes, 'LEAD_GENERATION', 'QUALITY_LEAD', 'QUALITY_CALL') || tem(eventos, 'LEAD', 'COMPLETE_REGISTRATION') || tem(destinos, 'ON_AD')) {
    return { tipo: 'captacao', confianca: 'alta', motivo: 'O objetivo ou o evento medido é cadastro (lead).' }
  }

  // Venda direta
  if (objetivo.includes('SALES') || objetivo.includes('PURCHASE') || tem(eventos, 'PURCHASE', 'INITIATED_CHECKOUT', 'ADD_TO_CART') || tem(otimizacoes, 'VALUE')) {
    return { tipo: 'venda', confianca: 'alta', motivo: 'O objetivo ou o evento medido é compra.' }
  }

  // Conversas (WhatsApp, Direct, Messenger)
  if (tem(destinos, 'WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP', 'MESSAGING_MESSENGER_WHATSAPP') || tem(otimizacoes, 'CONVERSATIONS')) {
    return { tipo: 'conversas', confianca: 'alta', motivo: 'A campanha leva para conversa (WhatsApp, Direct ou Messenger).' }
  }

  // Reconhecimento
  if (objetivo.includes('AWARENESS') || objetivo.includes('REACH') || tem(otimizacoes, 'REACH', 'IMPRESSIONS', 'AD_RECALL_LIFT')) {
    return { tipo: 'reconhecimento', confianca: 'alta', motivo: 'A Meta otimiza para alcance e lembrança da marca.' }
  }

  // Engajamento (curtidas, comentários, visitas ao perfil)
  if (objetivo.includes('ENGAGEMENT') || tem(otimizacoes, 'POST_ENGAGEMENT', 'PAGE_LIKES', 'PROFILE_VISIT', 'PROFILE_AND_PAGE_ENGAGEMENT')) {
    return { tipo: 'engajamento', confianca: 'alta', motivo: 'A Meta otimiza para interação (curtidas, comentários, visitas ao perfil).' }
  }

  // Tráfego: pode ser captação (leva para uma página sua com formulário) ou só divulgação.
  if (objetivo.includes('TRAFFIC') || tem(otimizacoes, 'LANDING_PAGE_VIEWS', 'LINK_CLICKS', 'OFFSITE_CONVERSIONS', 'CONVERSIONS')) {
    const proprios = hosts.filter((host) => eDominio(host, DOMINIOS_PROPRIOS))
    if (proprios.length) {
      return { tipo: 'captacao', confianca: 'media', motivo: `O anúncio leva para uma página sua (${proprios[0]}), onde a pessoa se cadastra.` }
    }
    if (hosts.length && hosts.every((host) => eDominio(host, DOMINIOS_SOCIAIS))) {
      return { tipo: 'engajamento', confianca: 'media', motivo: `O anúncio leva para ${hosts[0]} (perfil ou publicação), não para uma página de cadastro.` }
    }
    if (Number(info.leadsSite) > 0) {
      return { tipo: 'captacao', confianca: 'media', motivo: 'Chegam cadastros do seu site com o ID desta campanha.' }
    }
  }

  return { tipo: 'indefinido', confianca: 'baixa', motivo: 'Não consegui entender para que esta campanha serve.' }
}
