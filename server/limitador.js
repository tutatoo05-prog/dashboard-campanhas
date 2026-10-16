/**
 * Limita quantas chamadas para fora (Meta, Google) acontecem ao mesmo tempo.
 *
 * Sem isso, abrir uma tela dispara dezenas de conexões de uma vez. O Node resolve nomes (DNS) numa fila de
 * só 4 threads: com a fila cheia, as conexões esperam mais que o limite de 10 s e TODAS falham com
 * "Connect Timeout", deixando a tela carregando para sempre.
 */
export function criarLimitador(maximo) {
  let ativas = 0
  const fila = []

  const proxima = () => {
    if (ativas >= maximo || !fila.length) return
    const { tarefa, resolver, rejeitar } = fila.shift()
    ativas += 1
    Promise.resolve()
      .then(tarefa)
      .then(resolver, rejeitar)
      .finally(() => {
        ativas -= 1
        proxima()
      })
  }

  return (tarefa) =>
    new Promise((resolver, rejeitar) => {
      fila.push({ tarefa, resolver, rejeitar })
      proxima()
    })
}

const ERROS_DE_REDE = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENOENT|socket hang up|Connect Timeout|UND_ERR/i

/** Tenta de novo (uma vez, depois de uma pausa curta) quando a falha foi de rede e não da própria Meta/Google. */
export async function comNovaTentativa(tarefa, { tentativas = 2, esperaMs = 600 } = {}) {
  let ultimo
  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      return await tarefa()
    } catch (erro) {
      ultimo = erro
      const texto = `${erro?.message ?? ''} ${erro?.cause?.code ?? ''} ${erro?.cause?.message ?? ''} ${erro?.code ?? ''}`
      if (tentativa >= tentativas || !ERROS_DE_REDE.test(texto)) throw erro
      await new Promise((resolver) => setTimeout(resolver, esperaMs * tentativa))
    }
  }
  throw ultimo
}
