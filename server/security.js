const MAX_BODY_BYTES = 256 * 1024

/** @type {Map<string, { count: number, resetAt: number }>} */
const loginAttempts = new Map()

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 15

/** @type {Map<string, { count: number, resetAt: number }>} */
const resetAttempts = new Map()

const RESET_WINDOW_MS = 15 * 60 * 1000
const RESET_MAX_ATTEMPTS = 5

export function applySecurityHeaders(res, { isProduction = false } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')

  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-src https://tuzinho.academy", // só a prévia do player (tela Vídeos)
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )
}

/** IP privado, de loopback ou link-local: é o próprio proxy (nginx/Apache), nunca o visitante. */
export function ipInterno(ip) {
  const v = String(ip ?? '').trim().toLowerCase().replace(/^::ffff:/, '')
  if (!v) return true
  if (v === '::1' || v.startsWith('fe80:') || /^f[cd][0-9a-f]{2}:/.test(v)) return true
  const m = v.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

/**
 * IP do visitante para os limites de uso (login, captura, reset).
 *
 * O cliente controla o COMEÇO do X-Forwarded-For (basta mandar o cabeçalho com um IP inventado), e cada proxy
 * confiável ACRESCENTA o IP que viu no FIM. Por isso vale o último IP público lido da direita para a esquerda
 * (pula os proxies internos); pegar o primeiro deixava qualquer um trocar de "IP" a cada pedido e anular os limites.
 * Só com endereços internos (dev/testes) usa o último da lista; sem cabeçalho, o endereço da conexão.
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length) {
    const lista = forwarded.split(',').map((p) => p.trim()).filter(Boolean).slice(-10)
    for (let i = lista.length - 1; i >= 0; i -= 1) if (!ipInterno(lista[i])) return lista[i]
    if (lista.length) return lista.at(-1)
  }
  return req.socket?.remoteAddress ?? 'unknown'
}

export function checkLoginRateLimit(req) {
  const ip = getClientIp(req)
  const now = Date.now()
  const entry = loginAttempts.get(ip)

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return { allowed: true }
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  entry.count += 1
  return { allowed: true }
}

export function resetLoginRateLimit(req) {
  loginAttempts.delete(getClientIp(req))
}

export function checkResetRateLimit(req) {
  const ip = getClientIp(req)
  const now = Date.now()
  const entry = resetAttempts.get(ip)

  if (!entry || now > entry.resetAt) {
    resetAttempts.set(ip, { count: 1, resetAt: now + RESET_WINDOW_MS })
    return { allowed: true }
  }

  if (entry.count >= RESET_MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  entry.count += 1
  return { allowed: true }
}

export { MAX_BODY_BYTES }
