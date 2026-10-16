/**
 * Cache curto em memória, com "quem pediu junto espera o mesmo resultado": se 5 telas pedem os mesmos
 * números da Meta ao mesmo tempo, só uma chamada sai. Erro nunca fica guardado.
 *
 * O cache é do processo (some no Restart) e sempre é limpo quando o painel muda algo na Meta ou na
 * ficha de campanha, para a tela nunca mostrar o valor velho logo depois de uma alteração.
 */

/** @type {Map<string, { at: number, promise: Promise<unknown> }>} */
const entradas = new Map()

export function comCache(chave, ttlMs, carregar) {
  const existente = entradas.get(chave)
  if (existente && Date.now() - existente.at < ttlMs) return existente.promise

  const promise = Promise.resolve().then(carregar)
  entradas.set(chave, { at: Date.now(), promise })
  promise.catch(() => {
    if (entradas.get(chave)?.promise === promise) entradas.delete(chave)
  })
  return promise
}

/** Apaga as entradas que começam com o prefixo (sem prefixo, apaga tudo). */
export function limparCache(prefixo = '') {
  for (const chave of [...entradas.keys()]) {
    if (chave.startsWith(prefixo)) entradas.delete(chave)
  }
}
