import { resolveMx, resolve4, resolve6 } from 'node:dns/promises'

// Formato estrito: parte local sem pontos soltos, domínio com rótulos válidos e TLD de 2+ letras.
const EMAIL_RE = /^[a-z0-9]+(?:[._+-][a-z0-9]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i

export function isValidEmailFormat(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value)
}

/** Confere se o domínio do e-mail existe e recebe mensagens (MX, ou A/AAAA como alternativa). */
export async function emailDomainExists(email) {
  const domain = email.split('@')[1]
  if (!domain) return false
  try {
    const mx = await resolveMx(domain)
    if (mx.length) return true
  } catch (error) {
    // Falha de rede/DNS não deve impedir cadastros legítimos; só barra domínio comprovadamente inexistente.
    if (error.code !== 'ENOTFOUND' && error.code !== 'ENODATA') return true
  }
  try {
    const [a, aaaa] = await Promise.all([resolve4(domain).catch(() => []), resolve6(domain).catch(() => [])])
    return a.length + aaaa.length > 0
  } catch {
    return true
  }
}
