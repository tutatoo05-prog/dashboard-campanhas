// Recuperação: quem chegou perto de comprar e não comprou (carrinho abandonado, Pix/boleto sem pagar) e quem
// desistiu depois de comprar (cancelou, atrasou, pediu reembolso, chargeback). Uma linha por PESSOA, com o caso
// mais recente dela, a linha do tempo completa da Hotmart e o cadastro de lead (campanha, criativo, respostas).
// Fonte: os mesmos eventos da Hotmart da tela de Compras (hotmartEvents.js), já com as situações calculadas.

import { query } from './db.js'
import { loadHotmartEvents, ehParcelaSeguinte, rotuloDoEvento } from './hotmartEvents.js'
import { criarIdentidades, produtoParecido } from './pessoas.js'
import { chavesDoContato } from './registrosApagados.js'

/** Motivo do caso, na ordem em que aparece nas abas. */
export const MOTIVOS = ['abandono', 'pix_boleto', 'cancelamento', 'reembolso']

// Situações que ainda pedem contato da equipe.
const ABERTAS = new Set(['em aberto', 'pendente', 'vencido', 'cancelada', 'atrasada', 'expirada', 'reembolsada', 'chargeback'])
// Resolvidas: a pessoa comprou depois (por esse ou outro caminho).
const RECUPERADAS = new Set(['recuperado', 'regularizada'])

/** Prioridade quando a pessoa tem mais de um caso aberto: quem já pagou e desistiu vem antes de quem só abandonou. */
const PESO = { reembolso: 4, cancelamento: 3, pix_boleto: 2, abandono: 1 }

const DIA = 24 * 60 * 60 * 1000

function estadoDe(situacao) {
  if (ABERTAS.has(situacao)) return 'aberto'
  if (RECUPERADAS.has(situacao)) return 'recuperado'
  return null
}

/** Texto curto do que aconteceu, para a coluna "Motivo". */
export function rotuloDoCaso(evento) {
  switch (evento.situacao) {
    case 'em aberto':
      return 'Abandonou o carrinho'
    case 'recuperado':
      return evento.categoria === 'abandono' ? 'Abandonou e comprou depois' : 'Não pagou o Pix/boleto e comprou depois'
    case 'pendente':
      return 'Pix/boleto aguardando pagamento'
    case 'vencido':
      return 'Pix/boleto venceu sem pagar'
    case 'cancelada':
      return /assinatura/i.test(evento.evento) ? 'Cancelou a assinatura' : 'Compra cancelada'
    case 'atrasada':
      return 'Parcela/assinatura atrasada'
    case 'expirada':
      return 'Compra expirou'
    case 'regularizada':
      return 'Cancelou e voltou a comprar'
    case 'reembolsada':
      return 'Pediu reembolso'
    case 'chargeback':
      return 'Chargeback no cartão'
    default:
      return rotuloDoEvento(evento)
  }
}

/** Leads do banco (cadastro nas páginas) por pessoa: campanha, criativo, respostas. Sem banco: lista vazia. */
export async function lerLeadsParaRecuperacao(env, consultar = (texto, params) => query(env, texto, params)) {
  if (!env?.DATABASE_URL) return []
  try {
    const { rows } = await consultar(
      `select nome, email, telefone, slug, campanha, criativo, ad_id, veio_de, midia, landing_url, respostas, created_at
         from leads order by created_at desc limit 20000`,
    )
    return rows.map((row) => ({
      nome: row.nome ?? '',
      email: String(row.email ?? '').trim().toLowerCase(),
      telefone: row.telefone ?? '',
      projeto: row.slug ?? '',
      campanha: row.campanha ?? '',
      criativo: row.criativo || row.ad_id || '',
      veioDe: [row.veio_de, row.midia].filter(Boolean).join(' / '),
      pagina: row.landing_url ?? '',
      respostas: row.respostas && typeof row.respostas === 'object' ? row.respostas : {},
      data: row.created_at ? new Date(row.created_at).toISOString() : '',
    }))
  } catch (error) {
    if (error?.code !== '42P01') console.error('[recuperacao] não consegui ler os leads:', error.message || error)
    return []
  }
}

// Ofertas da Hotmart de cada página (pages/*/src/config.js do repositório de produtos). Essentials, Live e Membros
// usam o MESMO produto na Hotmart (N108253747X, "Essentials"): só a oferta e o `src` dizem de qual página veio.
const OFERTA_PAGINA = { scq7pq9v: 'essentials', '0gapxraj': 'live' }
const PAGINAS = {
  essentials: 'Essentials (página principal)',
  live: 'Essentials Live',
  membros: 'Essentials Membros',
  particular: 'Mentoria Particular',
}

/**
 * De qual página/checkout veio o caso. O rótulo `src` que a página manda ao checkout (essentials_<variante>, live,
 * membros) vale mais que a oferta; sem nenhum dos dois, usa o nome do produto na Hotmart (Mentoria Essentials,
 * Workshop Presencial...). Retorna { id, rotulo } — o id é o que o filtro compara.
 */
export function paginaDe(evento) {
  const src = String(evento?.src ?? '').trim().toLowerCase()
  const oferta = String(evento?.oferta ?? '').trim().toLowerCase()
  let id = ''
  if (/particular/.test(src)) id = 'particular'
  else if (/live/.test(src)) id = 'live'
  else if (/membros/.test(src)) id = 'membros'
  else if (/^essentials/.test(src)) id = 'essentials'
  else id = OFERTA_PAGINA[oferta] ?? ''
  if (id) return { id, rotulo: PAGINAS[id] }
  const produto = String(evento?.produto ?? '').trim()
  return produto ? { id: `produto:${produto.toLowerCase()}`, rotulo: produto } : { id: 'sem-pagina', rotulo: 'Sem página' }
}

const soma = (itens) => itens.reduce((total, item) => total + (item.valor ?? 0), 0)

/**
 * Eventos (com situação) + leads -> casos por pessoa e o resumo da tela.
 * Só entram pessoas com pelo menos um caso aberto ou recuperado; o resto (só compras) fica de fora.
 */
export function montarRecuperacao(eventos, leads = [], agora = Date.now()) {
  const idDe = criarIdentidades([...eventos, ...leads])
  const porPessoa = new Map()
  const grupo = (id) => {
    if (!porPessoa.has(id)) porPessoa.set(id, { eventos: [], leads: [] })
    return porPessoa.get(id)
  }
  for (const evento of eventos) {
    const id = idDe(evento)
    if (id) grupo(id).eventos.push(evento)
  }
  for (const lead of leads) {
    const id = idDe(lead)
    if (id && porPessoa.has(id)) porPessoa.get(id).leads.push(lead)
  }

  const casos = []
  for (const [id, { eventos: dela, leads: cadastros }] of porPessoa) {
    const ordenados = [...dela].sort((a, b) => b.data.localeCompare(a.data))
    const vendas = ordenados.filter((evento) => evento.categoria === 'venda' && !ehParcelaSeguinte(evento))

    // Reembolso seguido de nova compra do mesmo produto: a pessoa voltou (o hotmartEvents não marca isso).
    const comSituacao = ordenados.map((evento) => {
      if (evento.categoria !== 'reembolso') return evento
      const voltou = vendas.some((venda) => venda.data > evento.data && produtoParecido(venda.produto, evento.produto))
      return voltou ? { ...evento, situacao: 'regularizada' } : evento
    })
    const candidatos = comSituacao.filter((evento) => MOTIVOS.includes(evento.categoria) && estadoDe(evento.situacao))
    if (!candidatos.length) continue

    const abertos = candidatos.filter((evento) => estadoDe(evento.situacao) === 'aberto')
    // O caso que aparece na linha: o aberto mais grave (e mais recente entre os de mesmo peso); sem aberto, o recuperado mais recente.
    const principal = abertos.length
      ? [...abertos].sort((a, b) => PESO[b.categoria] - PESO[a.categoria] || b.data.localeCompare(a.data))[0]
      : candidatos[0]

    const contato = ordenados.find((evento) => evento.telefone) ?? principal
    const comNome = ordenados.find((evento) => evento.nome) ?? cadastros.find((lead) => lead.nome)
    const email = principal.email || ordenados.find((evento) => evento.email)?.email || cadastros.find((lead) => lead.email)?.email || ''
    const telefone = contato.telefone || cadastros.find((lead) => lead.telefone)?.telefone || ''
    const local = ordenados.find((evento) => evento.cidade || evento.estado) ?? {}
    const primeiroCadastro = [...cadastros].sort((a, b) => a.data.localeCompare(b.data))[0] ?? null

    casos.push({
      id,
      // Mesma chave das anotações da tela de Leads: a nota é uma só para a pessoa.
      chave: chavesDoContato({ email, telefone })[0] ?? '',
      nome: comNome?.nome ?? '',
      email,
      telefone,
      cidade: local.cidade ?? '',
      estado: local.estado ?? '',
      estadoCaso: estadoDe(principal.situacao),
      motivo: principal.categoria,
      situacao: principal.situacao,
      rotulo: rotuloDoCaso(principal),
      data: principal.data,
      diasParado: Math.max(0, Math.floor((agora - new Date(principal.data).getTime()) / DIA)),
      produto: principal.produto,
      pagina: paginaDe(principal).id,
      paginaRotulo: paginaDe(principal).rotulo,
      oferta: principal.oferta,
      valor: principal.valor,
      pagamento: principal.pagamento,
      parcelas: principal.parcelas,
      canal: principal.canal,
      campanha: principal.campanha,
      // Contexto para a conversa: quantas vezes tentou, o que já comprou, quanto já pagou.
      tentativas: {
        carrinhos: ordenados.filter((evento) => evento.categoria === 'abandono').length,
        pixBoletos: ordenados.filter((evento) => evento.categoria === 'pix_boleto').length,
      },
      outrosAbertos: abertos.filter((evento) => evento !== principal).map((evento) => ({ motivo: evento.categoria, rotulo: rotuloDoCaso(evento), produto: evento.produto, data: evento.data })),
      jaComprou: vendas.map((venda) => venda.produto).filter((produto, i, lista) => produto && lista.indexOf(produto) === i),
      totalPago: soma(ordenados.filter((evento) => evento.categoria === 'venda')),
      lead: primeiroCadastro && {
        projeto: primeiroCadastro.projeto,
        campanha: primeiroCadastro.campanha,
        criativo: primeiroCadastro.criativo,
        veioDe: primeiroCadastro.veioDe,
        pagina: primeiroCadastro.pagina,
        data: primeiroCadastro.data,
        respostas: primeiroCadastro.respostas,
        cadastros: cadastros.length,
      },
      linhaDoTempo: comSituacao.slice(0, 40).map((evento) => ({
        data: evento.data,
        titulo: MOTIVOS.includes(evento.categoria) && evento.situacao ? rotuloDoCaso(evento) : rotuloDoEvento(evento),
        categoria: evento.categoria,
        situacao: evento.situacao,
        produto: evento.produto,
        valor: evento.valor,
        pagamento: evento.pagamento,
      })),
    })
  }

  casos.sort((a, b) => (a.estadoCaso === b.estadoCaso ? b.data.localeCompare(a.data) : a.estadoCaso === 'aberto' ? -1 : 1))
  return { casos, resumo: resumir(casos, agora) }
}

export function resumir(casos, agora = Date.now()) {
  const abertos = casos.filter((caso) => caso.estadoCaso === 'aberto')
  const recuperados = casos.filter((caso) => caso.estadoCaso === 'recuperado')
  const porMotivo = Object.fromEntries(
    MOTIVOS.map((motivo) => {
      const doMotivo = casos.filter((caso) => caso.motivo === motivo)
      const abertosDoMotivo = doMotivo.filter((caso) => caso.estadoCaso === 'aberto')
      return [motivo, { abertos: abertosDoMotivo.length, recuperados: doMotivo.length - abertosDoMotivo.length, valorAberto: soma(abertosDoMotivo) }]
    }),
  )
  // Por página/checkout (Essentials, Live, Membros...), não só pelo nome do produto da Hotmart.
  const produtos = new Map()
  for (const caso of abertos) {
    const id = caso.pagina || 'sem-pagina'
    const atual = produtos.get(id) ?? { pagina: id, produto: caso.paginaRotulo || caso.produto || 'Sem página', abertos: 0, valor: 0 }
    produtos.set(id, { ...atual, abertos: atual.abertos + 1, valor: atual.valor + (caso.valor ?? 0) })
  }
  return {
    abertos: abertos.length,
    recuperados: recuperados.length,
    taxaRecuperacao: casos.length ? recuperados.length / casos.length : 0,
    valorAberto: soma(abertos),
    novos7d: abertos.filter((caso) => agora - new Date(caso.data).getTime() <= 7 * DIA).length,
    porMotivo,
    produtos: [...produtos.values()].sort((a, b) => b.abertos - a.abertos).slice(0, 8),
  }
}

function enviarJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** GET /api/recuperacao */
export async function handleRecuperacaoRequest(req, res, env) {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost')
  if (pathname !== '/api/recuperacao') return enviarJson(res, 404, { error: 'Rota não encontrada.' })
  if (req.method !== 'GET') return enviarJson(res, 405, { error: 'Método não permitido.' })
  try {
    const [{ events, fetchedAt }, leads] = await Promise.all([
      loadHotmartEvents({ force: searchParams.get('refresh') === '1', env }),
      lerLeadsParaRecuperacao(env),
    ])
    return enviarJson(res, 200, { success: true, fetchedAt, ...montarRecuperacao(events, leads) })
  } catch (error) {
    console.error('[recuperacao] erro:', error)
    return enviarJson(res, 502, { error: 'Não consegui montar a lista de recuperação agora.' })
  }
}
