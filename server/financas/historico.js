// Carga inicial: planilha "Lucro Academy 2026" (valores até 11/11/2026). Só entra uma vez, com o banco vazio.
// YouTube de novembro fica de fora de propósito (vem da sincronização). A Hotmart da planilha era o valor depositado;
// no dash a linha vem da API da Hotmart (vendas), então ela só entra na carga se pedida (testes).
const RECEITAS = {
  hotmart: [377.71, 5292.85, 197.11, 5414.88, 13163.35, 5265.0, 17813.81, 4409.46, 6498.68, 20910.27],
  asaas: [1204.98, 1419.99, 525.0, 525.0, 525.0, 505.61, 268.69, 273.22, 0, 0, 0],
  principia: [6291.0, 6291.0, 3791.0, 3570.0, 0, 0, 0, 0, 0, 0, 0],
  stripe: [497.0, 497.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  pix_ted: [0, 0, 0, 0, 0, 0, 1300.0, 0, 0, 0, 0],
  facebook: [0, 0, 0, 0, 0, 0, 0, 766.86, 182.62, 7.34, 34.89],
  youtube: [2118.7, 2345.53, 2291.03, 2302.32, 2404.46, 2181.97, 2812.13, 2769.56, 2405.39, 1999.59],
}
const GASTOS = [6651.07, 6651.07, 6651.07, 6492.49, 7821.29, 10016.61, 9692.5, 7587.5, 8702.64, 7587.5, 8387.5, 7587.5]
export const CAIXA_INICIAL = 41635.32

export function lancamentosDaPlanilha(ano = 2026, { comHotmart = false } = {}) {
  const lista = []
  const mesDe = (indice) => `${ano}-${String(indice + 1).padStart(2, '0')}`
  for (const [linha, valores] of Object.entries(RECEITAS)) {
    if (linha === 'hotmart' && !comHotmart) continue
    valores.forEach((valor, i) => lista.push({ mes: mesDe(i), tipo: 'receita', linha, valor }))
  }
  GASTOS.forEach((valor, i) => lista.push({ mes: mesDe(i), tipo: 'custo', linha: 'operacao', valor }))
  return lista
}
