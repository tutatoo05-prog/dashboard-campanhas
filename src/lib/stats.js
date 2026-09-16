/**
 * Volume mínimo + teste de duas proporções (z-test).
 * Usado para evitar recomendações fortes com amostra pequena.
 */

export const EVIDENCE = {
  /** Nível de significância (5%). */
  alpha: 0.05,
  /** Impressões mínimas para julgar CTR. */
  minImpressionsForCtr: 1000,
  /** Cliques mínimos para escalar ou acusar landing/público. */
  minClicksForRate: 100,
  /** Leads mínimos para confiar em CPL / escala. */
  minLeadsForCpl: 20,
  /** Cliques mínimos para flag de gasto sem resultado. */
  minClicksForWaste: 80,
  /** Impressões mínimas alternativas para waste (se pouquíssimos cliques). */
  minImpressionsForWaste: 3000,
}

/** Aproximação de erf (Abramowitz & Stegun). */
function erf(x) {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * ax)
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return sign * y
}

export function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

/**
 * Teste z de duas proporções.
 * @param {number} successes1 - sucessos no grupo 1 (ex.: cliques da campanha)
 * @param {number} n1 - tentativas no grupo 1 (ex.: impressões)
 * @param {number} successes2 - sucessos no grupo 2 (resto da conta)
 * @param {number} n2 - tentativas no grupo 2
 * @param {'two-sided'|'greater'|'less'} alternative
 */
export function twoProportionZTest(successes1, n1, successes2, n2, alternative = 'two-sided') {
  const s1 = Math.max(0, Number(successes1) || 0)
  const s2 = Math.max(0, Number(successes2) || 0)
  const N1 = Math.max(0, Number(n1) || 0)
  const N2 = Math.max(0, Number(n2) || 0)

  if (N1 < 1 || N2 < 1) {
    return { z: 0, pValue: 1, significant: false, p1: 0, p2: 0 }
  }

  const p1 = s1 / N1
  const p2 = s2 / N2
  const pPool = (s1 + s2) / (N1 + N2)
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / N1 + 1 / N2))

  if (!Number.isFinite(se) || se === 0) {
    return { z: 0, pValue: 1, significant: false, p1, p2 }
  }

  const z = (p1 - p2) / se
  let pValue

  if (alternative === 'greater') {
    pValue = 1 - normalCdf(z)
  } else if (alternative === 'less') {
    pValue = normalCdf(z)
  } else {
    pValue = 2 * (1 - normalCdf(Math.abs(z)))
  }

  return {
    z,
    pValue,
    significant: pValue < EVIDENCE.alpha,
    p1,
    p2,
  }
}

export function sumField(items, field) {
  return (items ?? []).reduce((acc, item) => acc + (Number(item?.[field]) || 0), 0)
}

/** Totais da conta excluindo a campanha (para contraste justo). */
export function restTotals(item, items) {
  const rest = (items ?? []).filter((other) => String(other.id) !== String(item.id))
  return {
    items: rest,
    impressions: sumField(rest, 'impressions'),
    clicks: sumField(rest, 'clicks'),
    leads: sumField(rest, 'leads'),
    conversions: sumField(rest, 'conversions'),
    spend: sumField(rest, 'spend'),
  }
}

export function hasCtrVolume(item) {
  return (Number(item.impressions) || 0) >= EVIDENCE.minImpressionsForCtr
}

export function hasScaleVolume(item) {
  const clicks = Number(item.clicks) || 0
  const leads = Number(item.leads) || 0
  return clicks >= EVIDENCE.minClicksForRate && leads >= EVIDENCE.minLeadsForCpl
}

export function hasWasteVolume(item) {
  const clicks = Number(item.clicks) || 0
  const impressions = Number(item.impressions) || 0
  return clicks >= EVIDENCE.minClicksForWaste || impressions >= EVIDENCE.minImpressionsForWaste
}

export function hasRateVolume(item) {
  return (Number(item.clicks) || 0) >= EVIDENCE.minClicksForRate
}
