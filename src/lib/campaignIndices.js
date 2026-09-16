export function clampIndex(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function getIndexTone(score) {
  if (score >= 70) return { tone: 'success', bar: 'index-bar-success', text: 'text-emerald-400' }
  if (score >= 45) return { tone: 'warning', bar: 'index-bar-warning', text: 'text-amber-400' }
  return { tone: 'danger', bar: 'index-bar-danger', text: 'text-red-400' }
}

function scoreFromRatio(value, average, higherIsBetter = true) {
  if (!average || average <= 0) return value > 0 ? 65 : 40
  const ratio = value / average
  const factor = higherIsBetter ? ratio : 1 / Math.max(ratio, 0.05)
  return clampIndex(50 + (factor - 1) * 45)
}

export function computeCampaignIndices(item, averages) {
  const ctr = scoreFromRatio(item.ctr, averages.ctr, true)

  const conversion =
    item.leads > 0
      ? scoreFromRatio(item.leads, Math.max(averages.leads, 1), true)
      : clampIndex((item.clicks / Math.max(averages.clicks, 1)) * 45)

  const efficiency =
    item.leads > 0 && averages.cpl > 0
      ? scoreFromRatio(item.cpl, averages.cpl, false)
      : 35

  const delivery =
    item.frequency > 0
      ? clampIndex(100 - ((Math.max(item.frequency, 1) - 1) / 3) * 100)
      : 75

  return [
    { id: 'ctr', label: 'Atratividade', hint: 'Quantas pessoas clicam', score: ctr },
    { id: 'conversion', label: 'Conversão', hint: 'Quantos interessados chegaram', score: conversion },
    { id: 'efficiency', label: 'Eficiência', hint: 'Quanto custa cada interessado', score: efficiency },
    { id: 'delivery', label: 'Entrega', hint: 'Quantas vezes a mesma pessoa viu', score: delivery },
  ]
}

export function renderIndexBar(index) {
  const tone = getIndexTone(index.score)
  return `
    <div class="index-row">
      <div class="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <div>
          <span class="font-medium text-zinc-300">${index.label}</span>
          <span class="ml-1.5 text-zinc-600">${index.hint}</span>
        </div>
        <span class="index-score ${tone.text}">${index.score}</span>
      </div>
      <div class="index-track">
        <div class="index-fill ${tone.bar}" style="width: ${index.score}%"></div>
      </div>
    </div>
  `
}
