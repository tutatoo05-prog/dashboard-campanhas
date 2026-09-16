export interface DailyPoint {
  date: string
  spend: number
  leads: number
  cpl: number | null
}

/** Soma o gasto/leads de todas as campanhas por dia, a partir do dailyByCampaign da Meta. */
export function aggregateDailySeries(dailyByCampaign: unknown): DailyPoint[] {
  if (!dailyByCampaign || typeof dailyByCampaign !== 'object') return []

  const byDate = new Map<string, { spend: number; leads: number }>()

  for (const series of Object.values(dailyByCampaign as Record<string, unknown>)) {
    if (!Array.isArray(series)) continue

    for (const point of series as Array<Record<string, unknown>>) {
      const date = String(point?.date ?? '')
      if (!date) continue

      const entry = byDate.get(date) ?? { spend: 0, leads: 0 }
      entry.spend += Number(point.spend) || 0
      entry.leads += Number(point.leads) || 0
      byDate.set(date, entry)
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { spend, leads }]) => ({
      date,
      spend: Math.round(spend * 100) / 100,
      leads,
      cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
    }))
}
