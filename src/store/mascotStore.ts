import { create } from 'zustand'

const ENABLED_KEY = 'dash-mascot-enabled'

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export type MascotMood = 'idle' | 'happy' | 'spin' | 'shake'

interface MascotState {
  enabled: boolean
  message: string | null
  messageId: number
  mood: MascotMood
  setEnabled: (value: boolean) => void
  say: (message: string, mood?: MascotMood) => void
  dismiss: () => void
  setMood: (mood: MascotMood) => void
}

export const useMascotStore = create<MascotState>((set) => ({
  enabled: readEnabled(),
  message: null,
  messageId: 0,
  mood: 'idle',
  setEnabled: (value) => {
    set({ enabled: value, message: null })
    try {
      localStorage.setItem(ENABLED_KEY, String(value))
    } catch {
      /* ignore */
    }
  },
  say: (message, mood = 'happy') => set((s) => ({ message, mood, messageId: s.messageId + 1 })),
  dismiss: () => set({ message: null }),
  setMood: (mood) => set({ mood }),
}))
