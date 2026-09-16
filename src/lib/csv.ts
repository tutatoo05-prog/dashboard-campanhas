function escapeCsvValue(value: string | number | null | undefined): string {
  const str = String(value ?? '')
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function exportCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): void {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(','))
  const csv = `﻿${lines.join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
