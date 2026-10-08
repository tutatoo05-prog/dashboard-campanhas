import { create } from 'zustand'
import type { TatuPose } from '@/components/mascot/TatuCharacter.tsx'

const ENABLED_KEY = 'dash-mascot-enabled'

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return true
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
}

interface MascotState {
  enabled: boolean
  speech: MascotSpeech | null
  /** Pose avulsa (sem balão), por exemplo "reveal" ao trocar de página. */
  pose: TatuPose
  poseUntil: number
  setEnabled: (value: boolean) => void
  say: (text: string, options?: Omit<MascotSpeech, 'id' | 'text'>) => void
  dismiss: () => void
  act: (pose: TatuPose, ms?: number) => void
}

let speechId = 0

export const useMascotStore = create<MascotState>((set) => ({
  enabled: readEnabled(),
  speech: null,
  pose: 'idle',
  poseUntil: 0,
  setEnabled: (value) => {
    set({ enabled: value, speech: null, pose: 'idle' })
    try {
      localStorage.setItem(ENABLED_KEY, String(value))
    } catch {
      /* ignore */
    }
  },
  say: (text, options = {}) => set({ speech: { id: ++speechId, text, ...options } }),
  dismiss: () => set({ speech: null }),
  act: (pose, ms = 1400) => set({ pose, poseUntil: Date.now() + ms }),
}))
