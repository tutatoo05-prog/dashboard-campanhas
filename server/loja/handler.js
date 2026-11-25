import { readRequestBody } from '../readBody.js'
import { enviarEmail } from '../acesso/integracoes.js'

/**
 * Página "Tuzinho Store" do dash. Este servidor é a ponte: o navegador fala com /api/loja e este arquivo repassa para
 * a API de admin da loja (LOJA_API_URL + /api/admin) com a chave secreta (LOJA_ADMIN_KEY), que NUNCA vai para o navegador.
 * Só administrador chega aqui (ver roles.js: cargo "usuario" não acessa /api/loja).
 *
 *   GET  /api/loja?a=overview | orders | order | catalog | finance   (+ n, status, q, limit, month)
 *   POST /api/loja { a: 'ship' | 'prepare' | 'delivered' | 'cancel' | 'refund' | 'note' | 'availability' | 'cpf', ... }
 *
 * Ao registrar o envio (ship) com sucesso, manda o e-mail "seu pedido foi enviado" pela Brevo, com o código e o botão Rastrear.
 */

const GET_ACOES = new Set(['overview', 'orders', 'order', 'catalog', 'finance'])
const POST_ACOES = new Set(['ship', 'prepare', 'delivered', 'cancel', 'refund', 'note', 'availability', 'cpf'])
const GET_CAMPOS = ['a', 'n', 'status', 'q', 'limit', 'month']
const POST_CAMPOS = ['a', 'n', 'tracking', 'carrier', 'service', 'text', 'sku', 'active']

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

export function lojaConfigurada(env) {
  return Boolean(String(env.LOJA_API_URL ?? '').trim() && String(env.LOJA_ADMIN_KEY ?? '').trim())
}

export function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/** E-mail enviado ao cliente quando o pedido é postado. Só links https; tudo escapado. */
export function emailEnvio({ nome, numero, codigo, urlRastreio, urlPedido }) {
  const primeiro = String(nome ?? '').trim().split(/\s+/)[0] || 'tudo bem'
  const seguro = (u) => (/^https:\/\//.test(String(u ?? '')) ? escapeHtml(u) : '')
  const botao = (href, texto, escuro) =>
    href
      ? `<a href="${href}" style="display:inline-block;padding:13px 22px;border-radius:10px;font-weight:700;text-decoration:none;${escuro ? 'background:#1b1915;color:#fff' : 'background:#fea300;color:#1b1915'}">${texto}</a>`
      : ''
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f2ed;font-family:Arial,Helvetica,sans-serif;color:#1b1915">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="background:#fff;border:1px solid #e3ded3;border-radius:14px;padding:28px">
<p style="margin:0 0 6px;font-size:13px;color:#6a645a">TuzinhoStore · pedido ${escapeHtml(numero)}</p>
<h1 style="margin:0 0 14px;font-size:24px">Seu pedido foi enviado</h1>
<p style="margin:0 0 16px;line-height:1.55">Oi, ${escapeHtml(primeiro)}. O pedido saiu de São Paulo e já tem código de rastreio.</p>
<p style="margin:0 0 6px;font-size:13px;color:#6a645a">Código de rastreio</p>
<p style="margin:0 0 20px;font-size:22px;font-weight:700;letter-spacing:.04em">${escapeHtml(codigo)}</p>
<p style="margin:0 0 10px">${botao(seguro(urlRastreio), 'Rastrear pedido')}</p>
<p style="margin:0 0 22px">${botao(seguro(urlPedido), 'Ver meu pedido', true)}</p>
<p style="margin:0;font-size:13px;color:#6a645a;line-height:1.5">O rastreio pode levar algumas horas para aparecer depois da postagem. Dúvidas? Responda este e-mail ou chame no WhatsApp (11) 96775-6449.</p>
</div></div></body></html>`
  return { assunto: `Seu pedido ${numero} foi enviado`, html }
}

/** Chamada à API de admin da loja. Erros da loja viram 502 (401 do dash significaria "sessão expirada", e não é o caso). */
export async function chamarLoja(env, { metodo, query, corpo, ator }, fetchImpl = fetch) {
  const url = new URL('/api/admin', env.LOJA_API_URL)
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v))
  let resposta
  try {
    resposta = await fetchImpl(url, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-admin-key': env.LOJA_ADMIN_KEY,
        'x-admin-actor': String(ator ?? 'dash').slice(0, 80),
      },
      body: metodo === 'POST' ? JSON.stringify(corpo ?? {}) : undefined,
      signal: AbortSignal.timeout(25_000),
    })
  } catch {
    return { status: 502, dados: { error: 'A loja não respondeu. Tente de novo em instantes.' } }
  }
  const dados = await resposta.json().catch(() => ({}))
  if (resposta.status === 401 || resposta.status === 503) {
    return { status: 502, dados: { error: 'O dash não conseguiu falar com a loja (chave ou configuração). Veja LOJA_ADMIN_KEY nas duas pontas.', code: 'LOJA_AUTH' } }
  }
  return { status: resposta.status, dados }
}

function recortar(objeto, campos) {
  const saida = {}
  for (const c of campos) if (objeto[c] !== undefined && objeto[c] !== null && objeto[c] !== '') saida[c] = objeto[c]
  return saida
}

export async function handleLojaRequest(req, res, env, user, fetchImpl = fetch) {
  if (!lojaConfigurada(env)) {
    return sendJson(res, 503, { error: 'A loja ainda não está ligada ao dash. Falta LOJA_API_URL e LOJA_ADMIN_KEY no servidor.', code: 'LOJA_NAO_CONFIGURADA' })
  }
  const ator = user?.email ?? user?.nome ?? 'dash'
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname !== '/api/loja') return sendJson(res, 404, { error: 'Rota não encontrada.' })

  if (req.method === 'GET') {
    const query = recortar(Object.fromEntries(url.searchParams), GET_CAMPOS)
    if (!GET_ACOES.has(String(query.a))) return sendJson(res, 400, { error: 'Ação inválida.' })
    const { status, dados } = await chamarLoja(env, { metodo: 'GET', query, ator }, fetchImpl)
    return sendJson(res, status, dados)
  }

  if (req.method === 'POST') {
    let corpo
    try {
      corpo = JSON.parse(await readRequestBody(req))
    } catch {
      return sendJson(res, 400, { error: 'Dados inválidos.' })
    }
    corpo = recortar(corpo && typeof corpo === 'object' ? corpo : {}, POST_CAMPOS)
    if (!POST_ACOES.has(String(corpo.a))) return sendJson(res, 400, { error: 'Ação inválida.' })
    const { status, dados } = await chamarLoja(env, { metodo: 'POST', corpo, ator }, fetchImpl)

    if (corpo.a === 'ship' && status === 200 && dados?.ok && dados.email) {
      let aviso = 'enviado'
      try {
        const { assunto, html } = emailEnvio({ nome: dados.name, numero: dados.number, codigo: dados.tracking, urlRastreio: dados.tracking_url, urlPedido: dados.order_url })
        await enviarEmail(env, { para: dados.email, nomePara: dados.name, assunto, html }, fetchImpl)
      } catch (erro) {
        console.error('[loja] e-mail de envio falhou:', erro.message || erro)
        aviso = 'falhou'
      }
      // o e-mail e o link com token do cliente não voltam para o navegador
      return sendJson(res, 200, { ok: true, number: dados.number, tracking: dados.tracking, email: aviso })
    }
    return sendJson(res, status, dados)
  }

  res.setHeader('Allow', 'GET, POST')
  return sendJson(res, 405, { error: 'Método não permitido.' })
}
