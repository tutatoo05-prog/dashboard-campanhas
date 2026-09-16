import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 64

export async function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(plain, salt, KEY_LENGTH)
  return `scrypt:${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false

  const [scheme, salt, hashHex] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hashHex) return false

  const derived = await scrypt(plain, salt, KEY_LENGTH)
  const stored_ = Buffer.from(hashHex, 'hex')

  if (derived.length !== stored_.length) return false
  return timingSafeEqual(derived, stored_)
}
