// Linhas da tela de Finanças. "auto" = tem fonte automática (a sincronização grava sozinha enquanto ninguém digitar o valor).
export const LINHAS = {
  receita: [
    { id: 'hotmart', rotulo: 'Hotmart', auto: true },
    { id: 'asaas', rotulo: 'Asaas', auto: false },
    { id: 'principia', rotulo: 'Principia', auto: false },
    { id: 'stripe', rotulo: 'Stripe', auto: false },
    { id: 'pix_ted', rotulo: 'Pix / TED', auto: false },
    { id: 'facebook', rotulo: 'Facebook (perfil Academy)', auto: false },
    { id: 'youtube', rotulo: 'YouTube', auto: true },
  ],
  custo: [
    { id: 'operacao', rotulo: 'Gastos (operação + anúncios)', auto: false },
    // Os anúncios já estão dentro dos "Gastos": aparecem só como detalhe, sem entrar no total.
    { id: 'anuncios', rotulo: 'dos quais: anúncios (Meta)', auto: true, incluso: true },
  ],
}

export function linhaValida(tipo, id) {
  return Boolean(LINHAS[tipo]?.some((linha) => linha.id === id))
}

export function mesValido(mes) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes))
}

/** Lista 'AAAA-MM' de `desde` até `ate` (inclusive). */
export function mesesEntre(desde, ate) {
  const lista = []
  let [ano, mes] = desde.split('-').map(Number)
  const [anoFim, mesFim] = ate.split('-').map(Number)
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    lista.push(`${ano}-${String(mes).padStart(2, '0')}`)
    mes += 1
    if (mes > 12) {
      mes = 1
      ano += 1
    }
  }
  return lista
}
