export function formatCurrency(value?: number | null): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value ?? 0)
}

export function formatNumber(value?: number | null): string {
  return new Intl.NumberFormat('pt-BR').format(value ?? 0)
}

export function formatPercent(value?: number | null): string {
  return `${(value ?? 0).toFixed(2).replace('.', ',')}%`
}

export function formatDecimal(value?: number | null, digits = 2): string {
  return (value ?? 0).toFixed(digits).replace('.', ',')
}
