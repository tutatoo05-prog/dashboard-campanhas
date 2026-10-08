import { usePlatformStore, type AdPlatform } from '@/store/platformStore.ts'

const PLATFORM_OPTIONS: { value: AdPlatform; label: string; disabled?: boolean }[] = [
  { value: 'meta', label: 'Meta Ads' },
  { value: 'google', label: 'Google Ads (em breve)' },
]

export function PlatformSelect() {
  const platform = usePlatformStore((state) => state.platform)
  const setPlatform = usePlatformStore((state) => state.setPlatform)

  return (
    <select
      className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
      value={platform}
      onChange={(event) => setPlatform(event.target.value as AdPlatform)}
    >
      {PLATFORM_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
