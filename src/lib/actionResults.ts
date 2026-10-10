import type { ActionHistoryEntry } from '@/services/actionsService.ts'
import type { CampaignItem } from '@/types'

export interface ActionResult {
  key: string
  title: string
  campaignName: string
  daysAgo: number
  beforeCpl: number
  nowCpl: number
  /** Variação do custo por lead (negativo = ficou mais barato). */
  changePct: number
  tone: 'good' | 'bad' | 'flat'
  /** Economia estimada por semana, só quando o CPL caiu e há volume. */
  savings: number | null
}

const MIN_AGE_MS = 2 * 86_400_000
const MIN_LEADS = 3

/**
 * Compara o custo por lead de quando a ação foi feita (snapshot) com o dos últimos 7 dias da campanha.
 * Só olha ações com pelo menos 2 dias, pra dar tempo de a mudança aparecer nos números.
 */
export function computeResults(history: ActionHistoryEntry[], campaigns: CampaignItem[], now = Date.now()): ActionResult[] {
  const byCampaign = new Map(campaigns.map((campaign) => [String(campaign.id), campaign]))
  const latestByCampaign = new Map<string, ActionHistoryEntry>()

  for (const entry of history) {
    if (!entry.campaignId || !(entry.snapshot.cpl && entry.snapshot.cpl > 0)) continue
    if (now - new Date(entry.doneAt).getTime() < MIN_AGE_MS) continue
    const seen = latestByCampaign.get(entry.campaignId)
    if (!seen || entry.doneAt > seen.doneAt) latestByCampaign.set(entry.campaignId, entry)
  }

  const results: ActionResult[] = []
  for (const entry of latestByCampaign.values()) {
    const current = byCampaign.get(String(entry.campaignId))
    if (!current || current.leads < MIN_LEADS || !(current.cpl > 0)) continue

    const beforeCpl = entry.snapshot.cpl as number
    const changePct = ((current.cpl - beforeCpl) / beforeCpl) * 100
    const tone = changePct <= -5 ? 'good' : changePct >= 10 ? 'bad' : 'flat'
    const saved = tone === 'good' ? (beforeCpl - current.cpl) * current.leads : 0

    results.push({
      key: `${entry.accountId}::${entry.actionId}`,
      title: entry.title,
      campaignName: current.name,
      daysAgo: Math.max(2, Math.round((now - new Date(entry.doneAt).getTime()) / 86_400_000)),
      beforeCpl,
      nowCpl: current.cpl,
      changePct,
      tone,
      savings: saved >= 10 ? Math.round(saved / 5) * 5 : null,
    })
  }

  return results.sort((a, b) => a.daysAgo - b.daysAgo).slice(0, 6)
}
