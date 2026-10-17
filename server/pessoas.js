/**
 * Quem é "a mesma pessoa" no sistema inteiro.
 *
 * Duas linhas são da mesma pessoa quando dividem o e-mail OU o telefone (10 últimos dígitos). A ligação é
 * transitiva: lead só com e-mail + evento da Hotmart com e-mail e telefone + outra compra só com telefone
 * viram uma pessoa só. Usado para decidir, por exemplo, que um carrinho abandonado, um Pix pendente ou um
 * atraso já foi resolvido porque a pessoa comprou por outro caminho.
 */

/** Telefone comparável: os 10 últimos dígitos (ignora 55 e formatação). */
export function chaveTelefone(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '')
  return digitos.length >= 10 ? digitos.slice(-10) : ''
}

export function chaveEmail(valor) {
  return String(valor ?? '').trim().toLowerCase()
}

/**
 * Recebe itens com { email, telefone } e devolve uma função `idDe(item)` com o mesmo valor para quem é a mesma
 * pessoa (ou null quando o item não tem e-mail nem telefone: aí não dá para ligar com ninguém).
 */
export function criarIdentidades(itens) {
  const pai = new Map()
  const achar = (x) => {
    let raiz = x
    while (pai.get(raiz) !== raiz) raiz = pai.get(raiz)
    let atual = x
    while (pai.get(atual) !== raiz) {
      const proximo = pai.get(atual)
      pai.set(atual, raiz)
      atual = proximo
    }
    return raiz
  }
  const chavesDe = (item) => [chaveEmail(item.email) && `e:${chaveEmail(item.email)}`, chaveTelefone(item.telefone) && `p:${chaveTelefone(item.telefone)}`].filter(Boolean)

  for (const item of itens) {
    const chaves = chavesDe(item)
    for (const chave of chaves) if (!pai.has(chave)) pai.set(chave, chave)
    if (chaves.length === 2) {
      const [a, b] = [achar(chaves[0]), achar(chaves[1])]
      if (a !== b) pai.set(a, b)
    }
  }
  return (item) => {
    const chaves = chavesDe(item)
    return chaves.length ? achar(chaves[0]) : null
  }
}

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Produtos "parecidos": nome vazio vale como curinga; senão um nome contém o outro ("Essentials" x "Mentoria Essentials"). */
export function produtoParecido(a, b) {
  const x = normalizar(a)
  const y = normalizar(b)
  if (!x || !y) return true
  return x === y || x.includes(y) || y.includes(x)
}
