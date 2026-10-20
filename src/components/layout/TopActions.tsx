import { LiveQuick } from '@/components/layout/LiveQuick.tsx'
import { isAdmin } from '@/lib/roles.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { useThemeStore } from '@/store/themeStore.ts'
import { useTourStore } from '@/store/tourStore.ts'
import { useUiStore } from '@/store/uiStore.ts'

/**
 * Busca, tema, Live e tour. No computador ficam no topo (TopBar); no celular o MobileDock mostra os mesmos
 * botões num botão flutuante, para não esconder o nome da página.
 */
export function TopActions({ onPick }: { onPick?: () => void }) {
  const admin = isAdmin(useAuthStore((state) => state.user))
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen)
  const startTour = useTourStore((state) => state.start)
  const mascotEnabled = useMascotStore((state) => state.enabled)
  const setMascotEnabled = useMascotStore((state) => state.setEnabled)
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggle)

  function handleTour() {
    onPick?.()
    if (!mascotEnabled) setMascotEnabled(true)
    window.setTimeout(startTour, mascotEnabled ? 0 : 400)
  }

  return (
    <>
      <button
        type="button"
        className="cmdk-trigger"
        onClick={() => {
          onPick?.()
          setPaletteOpen(true)
        }}
        aria-label="Buscar ou ir para (Ctrl+K)"
      >
        <i className="fa-solid fa-magnifying-glass text-xs" />
        <span className="hidden sm:inline">Buscar ou ir para…</span>
        <kbd className="hidden sm:inline">Ctrl K</kbd>
      </button>
      <button
        type="button"
        className="topbar-icon-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
        aria-pressed={theme === 'dark'}
      >
        {/* Lâmpada que mostra o tema de agora: acesa no claro, apagada (só o contorno) no escuro. */}
        <i className={theme === 'dark' ? 'fa-regular fa-lightbulb' : 'fa-solid fa-lightbulb topbar-lamp-on'} />
      </button>
      {admin && <LiveQuick />}
      <button type="button" className="topbar-icon-btn" onClick={handleTour} title="Tour com o TaTuzinho" aria-label="Tour guiado com o TaTuzinho">
        <i className="fa-regular fa-circle-question" />
      </button>
    </>
  )
}
