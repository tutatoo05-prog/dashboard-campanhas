import type { Lead, Purchase } from '@/types'

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

/** Telefone comparável: os 10 últimos dígitos (ignora 55 e o 9 a mais não importa para o DDD+número). */
function phoneKey(value: unknown): string {
  const digits = onlyDigits(value)
  return digits.length >= 10 ? digits.slice(-10) : ''
}

function timeOf(value?: string): number {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isFinite(time) ? time : 0
}

/** Cadastros do site (leads) feitos pela mesma pessoa que comprou: mesmo e-mail ou mesmo telefone. Do mais antigo ao mais novo. */
export function findBuyerLeads(purchase: Purchase, leads: Lead[]): Lead[] {
  const email = normalizeEmail(purchase.email)
  const phone = phoneKey(purchase.telefone)
  if (!email && !phone) return []

  return leads
    .filter(
      (lead) =>
        (email && normalizeEmail(lead.email) === email) ||
        (phone && phoneKey(lead.telefone) === phone),
    )
    .sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at))
}

/** Outras compras da mesma pessoa (mesmo e-mail), da mais recente para a mais antiga. */
export function findOtherPurchases(purchase: Purchase, purchases: Purchase[]): Purchase[] {
  const email = normalizeEmail(purchase.email)
  if (!email) return []

  return purchases
    .filter((item) => item !== purchase && item.id !== purchase.id && normalizeEmail(item.email) === email)
    .sort((a, b) => timeOf(b.createdAt as string | undefined) - timeOf(a.createdAt as string | undefined))
}

/** Link do WhatsApp (assume Brasil quando o número vem só com DDD). */
export function whatsappLink(phone?: string): string | null {
  const digits = onlyDigits(phone)
  if (digits.length < 10) return null
  const full = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${full}`
}

/** Dias entre dois instantes (arredondado para baixo, nunca negativo). */
export function daysBetween(fromIso?: string, toIso?: string): number | null {
  const from = timeOf(fromIso)
  const to = timeOf(toIso)
  if (!from || !to) return null
  return Math.max(0, Math.floor((to - from) / 86_400_000))
}
