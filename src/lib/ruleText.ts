import type { AutomationRule, RuleType } from '@/services/actionsService.ts'
import { formatCurrency } from '@/lib/format.ts'

export const RULE_LABELS: Record<RuleType, string> = {
  cpl_above_avg: 'CPL acima da média',
  spend_no_leads: 'Gasto sem lead',
  budget_used: 'Verba do mês',
}

export const RULE_DEFAULTS: Record<RuleType, AutomationRule['params']> = {
  cpl_above_avg: { pct: 30, days: 2 },
  spend_no_leads: { amount: 50 },
  budget_used: { pct: 90 },
}

/** Frase da regra em linguagem simples (a mesma ideia do servidor). */
export function describeRule(rule: Pick<AutomationRule, 'type' | 'params'>): string {
  const p = rule.params
  if (rule.type === 'cpl_above_avg') {
    return `Se o CPL de uma campanha ficar ${p.pct}% acima da média da conta por ${p.days} ${p.days === 1 ? 'dia' : 'dias'} seguidos, criar uma ação urgente`
  }
  if (rule.type === 'spend_no_leads') {
    return `Se uma campanha gastar ${formatCurrency(p.amount)} sem nenhum lead, avisar na hora`
  }
  return `Se a verba do mês passar de ${p.pct}% da meta, sugerir reduzir os orçamentos`
}
