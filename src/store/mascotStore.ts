import { create } from 'zustand'
import type { TatuPose } from '@/components/mascot/TatuCharacter.tsx'

const ENABLED_KEY = 'dash-mascot-enabled'
const MUTED_KEY = 'dash-mascot-muted-until'

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

function readMutedUntil(): number {
  try {
    const value = Number(localStorage.getItem(MUTED_KEY) ?? 0)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

/** Humor do Tatu em PNG (telas de login e carregamento). */
export type MascotMood = 'idle' | 'happy' | 'spin' | 'shake'

export interface MascotAction {
  label: string
  run: () => void
  primary?: boolean
}

export interface MascotSpeech {
  id: number
  text: string
  /** Pose enquanto escreve. Padrão: write. */
  pose?: TatuPose
  /** Pose depois de terminar de escrever. Padrão: idle. */
  afterPose?: TatuPose
  actions?: MascotAction[]
  /** Quanto tempo o balão fica depois de escrito (ms). 0 = fica até fechar. */
  hold?: number
  /** Mostra o X de fechar mesmo quando há botões. */
  closable?: boolean
  /** Fala mesmo no modo silêncio (respostas a cliques, tour). */
  important?: boolean
}

interface MascotState {
  enabled: boolean
  speech: MascotSpeech | null
  /** Pose avulsa (sem balão), por exemplo "reveal" ao trocar de página. */
  pose: TatuPose
  poseUntil: number
  /** Enquanto estiver no futuro, o Tatu só fala o que for "important". */
  mutedUntil: number
  /** Sobe a cada comemoração (confete). */
  confettiId: number
  /** Chapéu de festa até este instante. */
  partyUntil: number
  setEnabled: (value: boolean) => void
  say: (text: string, options?: Omit<MascotSpeech, 'id' | 'text'>) => void
  dismiss: () => void
  act: (pose: TatuPose, ms?: number) => void
  mute: (ms: number) => void
  unmute: () => void
  celebrate: (options?: { party?: boolean }) => void
}

let speechId = 0

function persistMuted(value: number) {
  try {
    if (value > 0) localStorage.setItem(MUTED_KEY, String(value))
    else localStorage.removeItem(MUTED_KEY)
  } catch {
    /* ignore */
  }
}

export const useMascotStore = create<MascotState>((set, get) => ({
  enabled: readEnabled(),
  speech: null,
  pose: 'idle',
  poseUntil: 0,
  mutedUntil: readMutedUntil(),
  confettiId: 0,
  partyUntil: 0,
  setEnabled: (value) => {
    set({ enabled: value, speech: null, pose: 'idle' })
    try {
      localStorage.setItem(ENABLED_KEY, String(value))
    } catch {
      /* ignore */
    }
  },
  say: (text, options = {}) => {
    if (!options.important && get().mutedUntil > Date.now()) return
    set({ speech: { id: ++speechId, text, ...options } })
  },
  dismiss: () => set({ speech: null }),
  act: (pose, ms = 1400) => set({ pose, poseUntil: Date.now() + ms }),
  mute: (ms) => {
    const until = Date.now() + ms
    set({ mutedUntil: until })
    persistMuted(until)
  },
  unmute: () => {
    set({ mutedUntil: 0 })
    persistMuted(0)
  },
  celebrate: ({ party = false } = {}) =>
    set((state) => ({
      confettiId: state.confettiId + 1,
      partyUntil: party ? Date.now() + 10_000 : state.partyUntil,
    })),
}))

export function isMuted(): boolean {
  return useMascotStore.getState().mutedUntil > Date.now()
}
