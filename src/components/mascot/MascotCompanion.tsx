import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { TatuCharacter, type TatuPose } from './TatuCharacter.tsx'
import { useMascotStore } from '@/store/mascotStore.ts'
import { isTourDone, markTourDone, useTourStore } from '@/store/tourStore.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { getDisplayName } from '@/lib/userDisplay.ts'

const SIZE = 124
const MARGIN = 6

const ROUTE_TIPS: Record<string, string[]> = {
  '/': ['De olho no CPL! Se ele subir, vale revisar o criativo.', 'Compare o investimento com os leads do período.'],
  '/acoes': ['Comece pelo vermelho: o urgente é o que mais custa dinheiro.', 'Marque como feito o que já resolveu. A lista zera todo dia.'],
  '/compare': ['Comparar períodos mostra se a campanha melhora de verdade.'],
  '/leads': ['Leads novos chegando. Bora qualificar?'],
  '/registros': ['Use os filtros pra achar o registro que precisa.'],
  '/purchases': ['Vendas fechadas! Cruze com o investimento pra achar o ROAS.'],
  '/live': ['Lembra de desligar a Live quando ela acabar!'],
  '/usuarios': ['Aprove os novos cadastros por aqui.'],
}

const CLICK_TIPS = [
  'Psiu! Aperte Ctrl+K pra ir a qualquer página rapidinho.',
  'Se preferir, me desligo pelo menu lateral.',
  'Quer um tour? É só me pedir pelo botão de ajuda lá em cima.',
  'Tatu bom é tatu que acompanha métrica todo dia.',
]

const SEEN_KEY = 'dash-mascot-seen'

function markSeen(key: string): boolean {
  let seen: string[] = []
  try {
    seen = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[]
  } catch {
    /* ignore */
  }
  if (seen.includes(key)) return false
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, key]))
  } catch {
    /* ignore */
  }
  return true
}

function dockPosition() {
  return { left: window.innerWidth - SIZE - MARGIN, top: window.innerHeight - SIZE - MARGIN }
}

function visibleTourTargets(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-tour]')).filter((el) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
}

interface Spot {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Tatu: personagem animado que mora no canto da tela. Escreve o que quer dizer num balão
 * (com a caneta se mexendo), acena, comemora e, no tour guiado, anda até cada bloco da página,
 * destaca o conteúdo e explica. Os olhos seguem o cursor. Só o corpo dele recebe cliques.
 */
export function MascotCompanion() {
  const { pathname } = useLocation()
  const enabled = useMascotStore((s) => s.enabled)
  const speech = useMascotStore((s) => s.speech)
  const storePose = useMascotStore((s) => s.pose)
  const poseUntil = useMascotStore((s) => s.poseUntil)
  const say = useMascotStore((s) => s.say)
  const dismiss = useMascotStore((s) => s.dismiss)
  const act = useMascotStore((s) => s.act)
  const tourActive = useTourStore((s) => s.active)
  const tourStep = useTourStore((s) => s.step)

  const [entered, setEntered] = useState(false)
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState(() => dockPosition())
  const [moving, setMoving] = useState(false)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [bubbleDown, setBubbleDown] = useState(false)
  const [typed, setTyped] = useState('')
  const [typing, setTyping] = useState(false)
  const [, force] = useState(0)
  const tipIndex = useRef(0)
  const moveTimer = useRef<number | undefined>(undefined)
  const tourPrev = useRef(false)

  // ── digitação do balão ──
  useEffect(() => {
    if (!speech) {
      setTyped('')
      setTyping(false)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setTyped(speech.text)
      setTyping(false)
      return
    }
    setTyped('')
    setTyping(true)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setTyped(speech.text.slice(0, i))
      if (i >= speech.text.length) {
        window.clearInterval(id)
        setTyping(false)
      }
    }, 24)
    return () => window.clearInterval(id)
  }, [speech])

  // fecha o balão sozinho (exceto em tour ou quando tem botões)
  useEffect(() => {
    if (!speech || typing || tourActive) return
    const hold = speech.hold ?? (speech.actions ? 0 : 5200 + speech.text.length * 35)
    if (!hold) return
    const t = window.setTimeout(() => dismiss(), hold)
    return () => window.clearTimeout(t)
  }, [speech, typing, tourActive, dismiss])

  // pose avulsa expira
  useEffect(() => {
    const left = poseUntil - Date.now()
    if (storePose === 'idle' || left <= 0) return
    const t = window.setTimeout(() => force((n) => n + 1), left + 20)
    return () => window.clearTimeout(t)
  }, [storePose, poseUntil])

  // ── entrada e saudação ──
  useEffect(() => {
    if (!enabled) {
      setEntered(false)
      return
    }
    const t = window.setTimeout(() => {
      setEntered(true)
      if (!markSeen('hello')) return
      const name = getDisplayName(useAuthStore.getState().user)
      if (isTourDone()) {
        say(`Oi, ${name}! Bom te ver de novo.`, { pose: 'wave', afterPose: 'idle' })
      } else {
        say(`Oi, ${name}! Eu sou o Tatu, mascote da Academy Labs. Quer um tour rápido pelo painel?`, {
          pose: 'wave',
          afterPose: 'wave',
          actions: [
            {
              label: 'Bora!',
              primary: true,
              run: () => {
                markTourDone()
                useMascotStore.getState().dismiss()
                window.setTimeout(() => useTourStore.getState().start(), 250)
              },
            },
            {
              label: 'Depois',
              run: () => {
                markTourDone()
                useMascotStore.getState().dismiss()
              },
            },
          ],
        })
      }
    }, 1300)
    return () => window.clearTimeout(t)
  }, [enabled, say])

  // dica por página (uma vez por sessão)
  useEffect(() => {
    if (!enabled || !entered || tourActive) return
    const tips = ROUTE_TIPS[pathname]
    if (!tips || !markSeen(pathname)) return
    const t = window.setTimeout(() => {
      if (useMascotStore.getState().speech || useTourStore.getState().active) return
      say(tips[Math.floor(Math.random() * tips.length)])
    }, 1800)
    return () => window.clearTimeout(t)
  }, [pathname, enabled, entered, tourActive, say])

  // ── posição: canto da tela ou ao lado do bloco do tour ──
  const goTo = useCallback((next: { left: number; top: number }) => {
    setPos(next)
    setMoving(true)
    window.clearTimeout(moveTimer.current)
    moveTimer.current = window.setTimeout(() => setMoving(false), 950)
  }, [])

  useEffect(() => {
    function onResize() {
      if (!useTourStore.getState().active) setPos(dockPosition())
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── tour guiado ──
  useEffect(() => {
    if (!tourActive) {
      setSpot(null)
      if (tourPrev.current) goTo(dockPosition())
      tourPrev.current = false
      return
    }
    tourPrev.current = true
    const targets = visibleTourTargets()
    const el = targets[tourStep]
    if (!el) {
      useTourStore.getState().stop()
      say('Pronto! Esse foi o tour desta página. Me chama de novo quando quiser.', {
        pose: 'cheer',
        afterPose: 'idle',
      })
      return
    }

    let cancelled = false
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })

    function place() {
      if (cancelled || !el) return
      const rect = el.getBoundingClientRect()
      setSpot({ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 })
      const maxLeft = window.innerWidth - SIZE - MARGIN
      const left = Math.max(MARGIN, Math.min(rect.right - SIZE * 0.6, maxLeft))
      let top: number
      // com o Tatu abaixo do bloco, o balão desce junto pra não cobrir o conteúdo destacado
      const below = rect.height <= window.innerHeight * 0.55 && rect.bottom + SIZE + 70 <= window.innerHeight
      setBubbleDown(below)
      if (rect.height > window.innerHeight * 0.55) {
        top = Math.min(rect.bottom, window.innerHeight) - SIZE - 16
      } else if (below) {
        top = rect.bottom + 4
      } else {
        top = rect.top - SIZE + 22
      }
      goTo({ left, top: Math.max(MARGIN, Math.min(top, window.innerHeight - SIZE - MARGIN)) })
    }

    const settle = window.setTimeout(() => {
      place()
      const total = targets.length
      const isLast = tourStep >= total - 1
      const tourStore = useTourStore.getState()
      say(`${el.dataset.tour ?? ''}: ${el.dataset.tourText ?? ''}`.replace(/^: /, '').replace(/: $/, ''), {
        pose: 'write',
        afterPose: 'point',
        actions: [
          { label: 'Sair', run: () => tourStore.stop() },
          {
            label: isLast ? 'Concluir' : `Próximo (${tourStep + 1}/${total})`,
            primary: true,
            run: () => (isLast ? tourStore.stop() : tourStore.setStep(tourStep + 1)),
          },
        ],
      })
    }, 520)

    const onMove = () => place()
    window.addEventListener('resize', onMove)
    return () => {
      cancelled = true
      window.clearTimeout(settle)
      window.removeEventListener('resize', onMove)
    }
  }, [tourActive, tourStep, pathname, say, goTo])

  // atalhos do tour
  useEffect(() => {
    if (!tourActive) return
    function onKey(event: KeyboardEvent) {
      const tour = useTourStore.getState()
      if (event.key === 'Escape') tour.stop()
      if (event.key === 'ArrowRight') tour.setStep(tour.step + 1)
      if (event.key === 'ArrowLeft') tour.setStep(Math.max(0, tour.step - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tourActive])

  // sair do tour limpa o balão do tour
  const wasTouring = useRef(false)
  useEffect(() => {
    if (wasTouring.current && !tourActive) dismiss()
    wasTouring.current = tourActive
  }, [tourActive, dismiss])

  if (!enabled) return null

  let pose: TatuPose = 'idle'
  if (moving) pose = 'walk'
  else if (speech && typing) pose = speech.pose ?? 'write'
  else if (speech) pose = speech.afterPose ?? 'idle'
  else if (storePose !== 'idle' && Date.now() < poseUntil) pose = storePose

  const awake = Boolean(speech) || tourActive || hover || pose !== 'idle'
  const docked = !tourActive
  const bubbleRight = pos.left < 320
  const facing = bubbleRight ? 'right' : 'left'

  function handleClick() {
    if (tourActive) return
    act('cheer', 1300)
    say(CLICK_TIPS[tipIndex.current++ % CLICK_TIPS.length], { pose: 'cheer', afterPose: 'idle' })
  }

  return (
    <>
      {tourActive && spot && (
        <div
          className="tour-spotlight"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          aria-hidden="true"
        />
      )}
      <div
        className={`mascot ${entered ? 'mascot-in' : ''} ${awake ? 'mascot-awake' : 'mascot-peek'} ${
          docked ? 'mascot-docked' : 'mascot-touring'
        } ${bubbleRight ? 'bubble-right' : ''} ${tourActive && bubbleDown ? 'bubble-down' : ''}`}
        style={{ left: pos.left, top: pos.top, width: SIZE, height: SIZE }}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        {speech && (
          <div className="mascot-bubble" role="status" key={speech.id}>
            <p className="mascot-bubble-text">
              {typed}
              {typing && <span className="mascot-caret" />}
            </p>
            {!typing && speech.actions && (
              <div className="mascot-bubble-actions">
                {speech.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={action.primary ? 'mascot-btn mascot-btn-primary' : 'mascot-btn'}
                    onClick={action.run}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
            {!speech.actions && (
              <button type="button" className="mascot-bubble-close" aria-label="Fechar" onClick={dismiss}>
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="mascot-body"
          aria-label="Tatu, mascote da Academy Labs"
          onClick={handleClick}
        >
          <TatuCharacter size={SIZE} pose={pose} talking={typing} facing={facing} />
        </button>
      </div>
    </>
  )
}
