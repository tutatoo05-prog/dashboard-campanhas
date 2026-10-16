import type { CampaignItem } from '@/types'

/**
 * Explica de onde vem o número de leads de uma campanha.
 * O servidor usa o maior entre os cadastros do site e os eventos de Lead do pixel da Meta;
 * quando o site tem mais, avisamos para ninguém achar que o dash e a Meta divergem por erro.
 */
export function leadsHint(item: Pick<CampaignItem, 'leadsMeta' | 'leadsSite'>): string | null {
  const site = item.leadsSite ?? 0
  const meta = item.leadsMeta ?? 0
  if (site <= meta) return null
  return `Cadastros no site: ${site} · Eventos de Lead no pixel da Meta: ${meta}`
}
