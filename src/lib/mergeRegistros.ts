import type { Registro } from '@/types'

/** Registro de uma pessoa que pode aparecer em várias abas/planilhas ao mesmo tempo. */
export interface RegistroAgrupado extends Registro {
  /** Onde esta pessoa aparece (cada aba só uma vez), da mais recente para a mais antiga. */
  aparece: { planilha: string; aba: string }[]
}

const NO_CAMPAIGN = 'Sem campanha'

function personKey(record: Registro): string {
  return record.email.trim().toLowerCase() || record.telefone.replace(/\D/g, '') || record.nome.trim().toLowerCase()
}

function time(record: Registro): number {
  const value = record.data ? new Date(record.data).getTime() : NaN
  return Number.isFinite(value) ? value : 0
}

/**
 * Junta a mesma pessoa (e-mail, senão telefone, senão nome) quando ela aparece em mais de uma
 * aba/planilha na MESMA campanha: vira um registro só, com a lista de onde ela aparece.
 * Só leads são juntados — eventos da Hotmart (compra, carrinho abandonado, atraso...) continuam
 * um por um, porque cada um é uma ocorrência diferente.
 */
export function agruparRegistros(records: Registro[]): RegistroAgrupado[] {
  const groups = new Map<string, Registro[]>()
  const result: RegistroAgrupado[] = []

  for (const record of records) {
    const person = personKey(record)
    if (record.tipo !== 'lead' || !person) {
      result.push({ ...record, aparece: [{ planilha: record.planilha, aba: record.aba }] })
      continue
    }
    const key = `${person}||${record.campanha || NO_CAMPAIGN}`
    groups.set(key, [...(groups.get(key) ?? []), record])
  }

  for (const items of groups.values()) {
    const ordered = [...items].sort((a, b) => time(b) - time(a))
    const main = ordered[0]
    const seen = new Set<string>()
    const aparece: RegistroAgrupado['aparece'] = []
    for (const item of ordered) {
      const key = `${item.planilha}||${item.aba}`
      if (seen.has(key)) continue
      seen.add(key)
      aparece.push({ planilha: item.planilha, aba: item.aba })
    }
    // Completa o que faltar com o que as outras linhas têm (nome, telefone, e-mail, criativo).
    const pick = (field: 'nome' | 'email' | 'telefone' | 'criativo') => main[field] || ordered.find((item) => item[field])?.[field] || ''
    result.push({ ...main, nome: pick('nome'), email: pick('email'), telefone: pick('telefone'), criativo: pick('criativo'), aparece })
  }

  return result
}

export function apareceTexto(record: RegistroAgrupado): string {
  return record.aparece.map((item) => `${item.aba} (${item.planilha})`).join(' · ')
}
