import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Tatu } from './Tatu.tsx'
import { useMascotStore } from '@/store/mascotStore.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { getDisplayName } from '@/lib/userDisplay.ts'

const ROUTE_TIPS: Record<string, string[]> = {
  '/': ['De olho no CPL! Se ele subir, vale revisar o criativo.', 'Compare o investimento com os leads do período.'],
  '/compare': ['Comparar períodos ajuda a ver se a campanha está melhorando de verdade.'],
  '/leads': ['Leads novos chegando. Bora qualificar?'],
  '/registros': ['Aqui ficam os registros. Use os filtros pra achar o que precisa.'],
  '/purchases': ['Vendas fechadas! Cruze com o investimento pra achar o ROAS.'],
  '/live': ['Lembra de desligar a Live quando ela acabar!'],
  '/usuarios': ['Aprove os novos cadastros por aqui.'],
}

const CLICK_TIPS = [
  'Psiu! Se preferir, me desligo pelo menu lateral.',
  'Dica: recolha o menu lateral pra ganhar espaço nos gráficos.',
  'Tatu bom é tatu que acompanha métrica todo dia.',
]

const SEEN_KEY = 'dash-mascot-seen'

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function markSeen(key: string): boolean {
  const seen = readSeen()
  if (seen.has(key)) return false
  seen.add(key)
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]))
  } catch {
    /* ignore */
  }
  return true
}

/**
 * Mascote flutuante e discreto: rola pra dentro da tela, dá uma dica curta por página
 * (uma vez por sessão) e volta a espiar na borda. Só o corpo dele recebe cliques, e dá
 * pra desligar pelo menu lateral.
 */
export function MascotCompanion() {
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const enabled = useMascotStore((s) => s.enabled)
  const message = useMascotStore((s) => s.message)
  const messageId = useMascotStore((s) => s.messageId)
  const mood = useMascotStore((s) => s.mood)
  const say = useMascotStore((s) => s.say)
  const dismiss = useMascotStore((s) => s.dismiss)
  const setMood = useMascotStore((s) => s.setMood)

  const [awake, setAwake] = useState(false)
  const [entered, setEntered] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const sleepTimer = useRef<number | undefined>(undefined)
  const tipIndex = useRef(0)

  const wake = useCallback((ms: number) => {
    setAwake(true)
    window.clearTimeout(sleepTimer.current)
    sleepTimer.current = window.setTimeout(() => {
      useMascotStore.getState().dismiss()
      setAwake(false)
    }, ms)
  }, [])

  // entrada: rola pra dentro da tela e cumprimenta uma vez por sessão
  useEffect(() => {
    if (!enabled) {
      setEntered(false)
      setAwake(false)
      return
    }
    const t = window.setTimeout(() => {
      setEntered(true)
      if (markSeen('hello')) {
        say(`Olá, ${getDisplayName(useAuthStore.getState().user)}! Eu sou o Tatu, mascote da Academy Labs.`)
      }
    }, 1200)
    return () => window.clearTimeout(t)
  }, [enabled, say])

  // dica contextual por página, uma vez por sessão
  useEffect(() => {
    if (!enabled || !entered) return
    const tips = ROUTE_TIPS[pathname]
    if (!tips || !markSeen(pathname)) return
    const t = window.setTimeout(() => say(tips[Math.floor(Math.random() * tips.length)]), 900)
    return () => window.clearTimeout(t)
  }, [pathname, enabled, entered, say, user])

  // mensagem nova acorda o tatu
  useEffect(() => {
    if (!message || !enabled) return
    wake(message.length > 60 ? 9000 : 6500)
  }, [message, messageId, enabled, wake])

  // volta ao estado normal depois da animação
  useEffect(() => {
    if (mood === 'idle') return
    const t = window.setTimeout(() => setMood('idle'), 1100)
    return () => window.clearTimeout(t)
  }, [mood, messageId, setMood])

  // inclina na direção do cursor
  useEffect(() => {
    const el = rootRef.current
    if (!enabled || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    function onMove(e: PointerEvent) {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const rect = el!.getBoundingClientRect()
        const dx = e.clientX - (rect.left + rect.width / 2)
        const dy = e.clientY - (rect.top + rect.height / 2)
        const dist = Math.hypot(dx, dy)
        const angle = (dx / Math.max(dist, 1)) * 14 * Math.min(dist / 300, 1)
        el!.style.setProperty('--tilt', `${angle.toFixed(1)}deg`)
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [enabled, entered])

  useEffect(() => () => window.clearTimeout(sleepTimer.current), [])

  if (!enabled) return null

  function handleClick() {
    wake(6500)
    say(CLICK_TIPS[tipIndex.current++ % CLICK_TIPS.length], 'spin')
  }

  return (
    <div
      ref={rootRef}
      className={`mascot ${entered ? 'mascot-in' : ''} ${awake ? 'mascot-awake' : 'mascot-peek'}`}
      onPointerEnter={() => entered && !awake && wake(3500)}
    >
      {message && awake && (
        <div className="mascot-bubble" role="status" key={messageId}>
          <span>{message}</span>
          <button type="button" className="mascot-bubble-close" aria-label="Fechar dica" onClick={dismiss}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      )}
      <button type="button" className="mascot-body" aria-label="Tatu, mascote da Academy Labs" onClick={handleClick}>
        <Tatu size={52} mood={mood} />
      </button>
    </div>
  )
}
