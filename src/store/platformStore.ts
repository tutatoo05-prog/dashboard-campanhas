import { create } from 'zustand'

export type AdPlatform = 'meta' | 'google'

interface PlatformState {
  platform: AdPlatform
  setPlatform: (platform: AdPlatform) => void
}

export const usePlatformStore = create<PlatformState>((set) => ({
  platform: 'meta',
  setPlatform: (platform) => set({ platform }),
}))
