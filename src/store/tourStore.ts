import { create } from 'zustand'

const TOUR_DONE_KEY = 'dash-tour-done'

export function isTourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === 'true'
  } catch {
    return false
  }
}

export function markTourDone() {
  try {
    localStorage.setItem(TOUR_DONE_KEY, 'true')
  } catch {
    /* ignore */
  }
}

interface TourState {
  active: boolean
  step: number
  start: () => void
  stop: () => void
  setStep: (step: number) => void
}

/** Tour guiado: percorre os elementos marcados com data-tour da página atual. */
export const useTourStore = create<TourState>((set) => ({
  active: false,
  step: 0,
  start: () => set({ active: true, step: 0 }),
  stop: () => set({ active: false, step: 0 }),
  setStep: (step) => set({ step }),
}))
