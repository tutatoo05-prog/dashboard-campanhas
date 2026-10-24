import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { canAccessPath } from '@/lib/roles.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useUiStore } from '@/store/uiStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { useTourStore } from '@/store/tourStore.ts'
import { useThemeStore } from '@/store/themeStore.ts'
import { logout } from '@/services/authService.ts'

interface Command {
  id: string
  label: string
  hint: string
  icon: string
  run: () => void
}

const PAGES = [
  { to: '/', label: 'Dashboard', hint: 'Visão geral das campanhas', icon: 'fa-chart-line' },
  { to: '/acoes', label: 'Central de Ações', hint: 'O que fazer hoje', icon: 'fa-bolt' },
  { to: '/compare', label: 'Comparar períodos', hint: 'Antes x depois', icon: 'fa-chart-column' },
  { to: '/leads', label: 'Leads', hint: 'Quem se inscreveu', icon: 'fa-user-plus' },
  { to: '/registros', label: 'Registros', hint: 'Tabela de registros', icon: 'fa-table-list' },
  { to: '/purchases', label: 'Compras', hint: 'Vendas aprovadas', icon: 'fa-bag-shopping' },
  { to: '/acessos', label: 'Acessos', hint: 'Liberação de curso e alunos', icon: 'fa-key' },
  { to: '/monitoramento', label: 'Monitoramento', hint: 'Sites no ar e cadastros chegando', icon: 'fa-heart-pulse' },
  { to: '/live', label: 'Live do Essentials', hint: 'Ligar ou desligar a página', icon: 'fa-tower-broadcast' },
  { to: '/videos', label: 'Vídeos', hint: 'Quem assiste à VSL e até onde', icon: 'fa-circle-play' },
  { to: '/config/usuarios', label: 'Usuários', hint: 'Cargos e aprovações', icon: 'fa-users-gear' },
  { to: '/config/seguranca', label: 'Segurança', hint: 'Backup, avisos e sessões', icon: 'fa-shield-halved' },
]

/** Paleta de comandos (Ctrl/Cmd + K): navegar entre páginas e acionar atalhos. */
export function CommandPalette() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const mascotEnabled = useMascotStore((s) => s.enabled)
  const setMascotEnabled = useMascotStore((s) => s.setEnabled)
  const startTour = useTourStore((s) => s.start)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)

  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<Command[]>(() => {
    const pages: Command[] = PAGES.filter((page) => canAccessPath(user, page.to)).map((page) => ({
      id: page.to,
      label: page.label,
      hint: page.hint,
      icon: page.icon,
      run: () => navigate(page.to),
    }))
    return [
      ...pages,
      {
        id: 'tour',
        label: 'Tour com o TaTuzinho',
        hint: 'Mostra os blocos desta página',
        icon: 'fa-wand-magic-sparkles',
        run: () => {
          if (!mascotEnabled) setMascotEnabled(true)
          window.setTimeout(startTour, 200)
        },
      },
      {
        id: 'theme',
        label: theme === 'dark' ? 'Tema claro' : 'Tema escuro',
        hint: 'Alternar entre papel claro e noite',
        icon: 'fa-lightbulb',
        run: toggleTheme,
      },
      {
        id: 'mascot',
        label: mascotEnabled ? 'Desligar o TaTuzinho' : 'Ligar o TaTuzinho',
        hint: 'Mascote na tela',
        icon: 'fa-paw',
        run: () => setMascotEnabled(!mascotEnabled),
      },
      {
        id: 'logout',
        label: 'Sair',
        hint: 'Encerrar a sessão',
        icon: 'fa-right-from-bracket',
        run: async () => {
          await logout()
          setUser(null)
        },
      },
    ]
  }, [navigate, user, mascotEnabled, setMascotEnabled, startTour, setUser, theme, toggleTheme])

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(q))
  }, [commands, term])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(!useUiStore.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  useEffect(() => {
    if (!open) return
    setTerm('')
    setActive(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [open])

  if (!open) return null

  function runCommand(command: Command | undefined) {
    if (!command) return
    setOpen(false)
    command.run()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') setOpen(false)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    }
    if (event.key === 'Enter') runCommand(filtered[active])
  }

  return (
    <div className="cmdk-overlay" onMouseDown={() => setOpen(false)}>
      <div
        className="cmdk"
        role="dialog"
        aria-label="Paleta de comandos"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="cmdk-input-row">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => {
              setTerm(e.target.value)
              setActive(0)
            }}
            placeholder="Ir para… ou fazer algo"
            aria-label="Buscar comando"
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="cmdk-list">
          {filtered.length === 0 && <li className="cmdk-empty">Nada encontrado. Tenta outra palavra.</li>}
          {filtered.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                className={`cmdk-item ${index === active ? 'cmdk-item-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => runCommand(command)}
              >
                <span className="cmdk-item-icon">
                  <i className={`fa-solid ${command.icon}`} />
                </span>
                <span className="cmdk-item-text">
                  <span>{command.label}</span>
                  <small>{command.hint}</small>
                </span>
                {index === active && <kbd>↵</kbd>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
