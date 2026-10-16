/**
 * Cache de DNS dentro do processo (importe este arquivo ANTES de qualquer conexão).
 *
 * O Node resolve nomes com getaddrinfo numa fila de poucas threads. Num servidor com DNS lento ou instável, cada
 * conexão nova (banco, Meta, Google, Brevo...) espera na fila e o painel inteiro fica lento, e a leitura da
 * sessão do login estoura o tempo e "desloga" a pessoa. Aqui:
 *  - o endereço de cada nome fica guardado: nos primeiros 5 minutos vale direto; depois disso o endereço velho
 *    ainda é usado na hora (até 24 h) enquanto o DNS é consultado em segundo plano — ninguém espera DNS;
 *  - pedidos iguais ao mesmo tempo viram um só;
 *  - se o DNS falhar, vale o último endereço conhecido (mesmo velho), em vez de derrubar a conexão.
 */
import dns from 'node:dns'
import net from 'node:net'

const VALIDADE_PADRAO_MS = 5 * 60_000
const VALIDADE_MAXIMA_PADRAO_MS = 24 * 60 * 60_000

function chaveDe(hostname, opcoes) {
  return `${hostname}|${opcoes.family || 0}|${opcoes.all ? 1 : 0}|${opcoes.order ?? ''}|${opcoes.verbatim ?? ''}|${opcoes.hints ?? 0}`
}

/** Monta uma versão de dns.lookup com cache em cima de `original` (injetável para os testes). */
export function criarLookupComCache(original, { validadeMs = VALIDADE_PADRAO_MS, validadeMaximaMs = VALIDADE_MAXIMA_PADRAO_MS, agora = Date.now } = {}) {
  /** @type {Map<string, { at: number, valor: unknown[] }>} */
  const cache = new Map()
  /** @type {Map<string, Function[]>} */
  const emAndamento = new Map()
  const estatisticas = { acertos: 0, consultas: 0, reservas: 0, falhas: 0 }

  function lookup(hostname, opcoes, callback) {
    if (typeof opcoes === 'function') {
      callback = opcoes
      opcoes = {}
    } else if (typeof opcoes === 'number') {
      opcoes = { family: opcoes }
    }
    opcoes = opcoes ?? {}

    // IP, localhost e coisas estranhas seguem o caminho normal.
    if (typeof hostname !== 'string' || !hostname || net.isIP(hostname) || hostname === 'localhost') {
      return original.call(dns, hostname, opcoes, callback)
    }

    const chave = chaveDe(hostname, opcoes)
    const guardado = cache.get(chave)

    if (guardado && agora() - guardado.at < validadeMaximaMs) {
      estatisticas.acertos += 1
      process.nextTick(() => callback(null, ...guardado.valor))
      // Passou dos 5 minutos: usa o endereço guardado agora e atualiza em segundo plano, sem ninguém esperar.
      if (agora() - guardado.at >= validadeMs && !emAndamento.has(chave)) {
        emAndamento.set(chave, [])
        estatisticas.consultas += 1
        original.call(dns, hostname, opcoes, (erro, ...resto) => {
          emAndamento.delete(chave)
          if (!erro) cache.set(chave, { at: agora(), valor: resto })
        })
      }
      return undefined
    }

    const fila = emAndamento.get(chave)
    if (fila) {
      fila.push(callback)
      return undefined
    }

    estatisticas.consultas += 1
    const novaFila = [callback]
    emAndamento.set(chave, novaFila)
    original.call(dns, hostname, opcoes, (erro, ...resto) => {
      emAndamento.delete(chave)
      if (!erro) cache.set(chave, { at: agora(), valor: resto })
      if (erro) estatisticas[guardado ? 'reservas' : 'falhas'] += 1
      for (const aviso of novaFila) {
        if (erro && guardado) aviso(null, ...guardado.valor) // DNS falhou: usa o último endereço conhecido
        else aviso(erro, ...resto)
      }
    })
    return undefined
  }

  return { lookup, estatisticas, limpar: () => (cache.clear(), emAndamento.clear()) }
}

const padrao = criarLookupComCache(dns.lookup)
export const estatisticas = padrao.estatisticas
export const limparCacheDeDns = padrao.limpar

let instalado = false

export function instalarCacheDeDns() {
  if (instalado) return
  instalado = true
  dns.lookup = padrao.lookup
}

instalarCacheDeDns()
