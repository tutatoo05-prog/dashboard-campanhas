import { LINHAS } from './linhas.js'

const arredondar = (n) => Math.round(n * 100) / 100

/**
 * Monta a tabela do ano: uma lista de 12 células por linha ({ valor, origem } ou null), totais, lucro e os indicadores.
 * `lancamentos`: linhas de fin_lancamentos ({ mes, tipo, linha, valor, origem }). `caixa`: número ou null.
 */
export function montarResumo(lancamentos, ano, caixa) {
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)
  const mapa = new Map()
  for (const l of lancamentos) mapa.set(`${l.mes}|${l.tipo}|${l.linha}`, { valor: Number(l.valor), origem: l.origem })

  const montar = (tipo) =>
    LINHAS[tipo].map((linha) => ({
      id: linha.id,
      rotulo: linha.rotulo,
      auto: linha.auto,
      celulas: meses.map((mes) => mapa.get(`${mes}|${tipo}|${linha.id}`) ?? null),
    }))

  const receitas = montar('receita')
  const custos = montar('custo')
  const somaPorMes = (linhas) => meses.map((_, i) => arredondar(linhas.reduce((s, l) => s + (l.celulas[i]?.valor ?? 0), 0)))
  const totalReceita = somaPorMes(receitas)
  const totalCusto = somaPorMes(custos)
  const temDado = (i) => receitas.some((l) => l.celulas[i]) || custos.some((l) => l.celulas[i])
  const lucro = meses.map((_, i) => (temDado(i) ? arredondar(totalReceita[i] - totalCusto[i]) : null))

  const soma = (lista) => arredondar(lista.reduce((s, v) => s + (v ?? 0), 0))
  // Custo mensal de referência: o último mês do ano que tem custo lançado (a planilha projeta dezembro).
  const ultimoComCusto = totalCusto.reduce((acc, v, i) => (v > 0 ? i : acc), -1)
  const custoMensal = ultimoComCusto >= 0 ? totalCusto[ultimoComCusto] : 0

  const recorde = (valores) => {
    let melhor = -1
    valores.forEach((v, i) => {
      if (v > 0 && (melhor < 0 || v > valores[melhor])) melhor = i
    })
    return melhor < 0 ? null : { mes: meses[melhor], valor: valores[melhor] }
  }

  return {
    ano,
    meses,
    receitas,
    custos,
    totalReceita,
    totalCusto,
    lucro,
    anual: { receita: soma(totalReceita), custo: soma(totalCusto), lucro: soma(lucro) },
    caixa,
    mesesSobrevivencia: caixa !== null && custoMensal > 0 ? Math.floor(caixa / custoMensal) : null,
    faltamPara12Meses: caixa !== null && custoMensal > 0 ? arredondar(Math.max(0, custoMensal * 12 - caixa)) : null,
    custoMensalReferencia: custoMensal,
    recordes: {
      mes: recorde(totalReceita),
      porFonte: receitas.map((l) => ({ id: l.id, rotulo: l.rotulo, ...recorde(l.celulas.map((c) => c?.valor ?? 0)) })).filter((r) => r.mes),
    },
  }
}
