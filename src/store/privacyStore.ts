import { create } from 'zustand'
import { useAuthStore } from '@/store/authStore.ts'

const CLASSE = 'modo-privado'
const MARCA = 'priv-auto'

/**
 * Modo privacidade: borra o que é sensível para dividir a tela ou gravar sem expor ninguém.
 * Nomes de pessoas levam o atributo data-sensivel; e-mails, telefones e valores em R$ são achados pelo texto
 * (assim vale também para o que o código ainda não conhece, como modais e tabelas novas).
 * Sempre começa ligado: ao abrir o dash e a cada login. Desligar vale só até recarregar a página ou sair.
 */
function aplicar(ligado: boolean) {
  document.documentElement.classList.toggle(CLASSE, ligado)
}

interface PrivacyState {
  ligado: boolean
  alternar: () => void
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  ligado: true,
  alternar: () => {
    const ligado = !get().ligado
    set({ ligado })
    aplicar(ligado)
  },
}))

// Saiu (ou a sessão expirou): o próximo login volta com o desfoque ligado.
useAuthStore.subscribe((estado, anterior) => {
  if (estado.status === 'unauthenticated' && anterior.status !== 'unauthenticated' && !usePrivacyStore.getState().ligado) {
    usePrivacyStore.setState({ ligado: true })
    aplicar(true)
  }
})

aplicar(usePrivacyStore.getState().ligado)

const SENSIVEL = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // e-mail
  /(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]\d{4}/, // telefone com espaço ou traço
  /\b55\d{10,11}\b/, // telefone só com números
  /R\$\s?-?\d/, // valores em reais
]

const IGNORAR = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'])

function ehSensivel(texto: string): boolean {
  return SENSIVEL.some((regra) => regra.test(texto))
}

/** Dica de mouse também entregaria o dado: guarda e tira o title do que está borrado. */
function esconderDica(elemento: Element) {
  const dica = elemento.getAttribute('title')
  if (dica !== null) {
    elemento.setAttribute('data-priv-title', dica)
    elemento.removeAttribute('title')
  }
}

function varrer() {
  const andador = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let no = andador.nextNode(); no; no = andador.nextNode()) {
    const pai = no.parentElement
    if (!pai || IGNORAR.has(pai.tagName) || pai.classList.contains(MARCA)) continue
    if (ehSensivel(no.nodeValue ?? '')) {
      pai.classList.add(MARCA)
      esconderDica(pai)
    }
  }
  document.querySelectorAll('[data-sensivel]').forEach(esconderDica)
}

function limpar() {
  document.querySelectorAll(`.${MARCA}`).forEach((el) => el.classList.remove(MARCA))
  document.querySelectorAll('[data-priv-title]').forEach((el) => {
    el.setAttribute('title', el.getAttribute('data-priv-title') ?? '')
    el.removeAttribute('data-priv-title')
  })
}

/** Liga a varredura enquanto o modo estiver ativo e devolve a função que desliga tudo. */
export function iniciarVarreduraDePrivacidade(): () => void {
  let observador: MutationObserver | null = null
  let agendado = 0

  function agendar() {
    if (agendado) return
    agendado = window.setTimeout(() => {
      agendado = 0
      varrer()
    }, 120)
  }

  function sincronizar(ligado: boolean) {
    observador?.disconnect()
    observador = null
    if (!ligado) {
      limpar()
      return
    }
    varrer()
    observador = new MutationObserver(agendar)
    observador.observe(document.body, { childList: true, subtree: true, characterData: true })
  }

  sincronizar(usePrivacyStore.getState().ligado)
  const parar = usePrivacyStore.subscribe((estado, anterior) => {
    if (estado.ligado !== anterior.ligado) sincronizar(estado.ligado)
  })
  return () => {
    parar()
    window.clearTimeout(agendado)
    observador?.disconnect()
    limpar()
  }
}
