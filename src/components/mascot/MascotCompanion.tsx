import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TatuCharacter, type TatuPose } from './TatuCharacter.tsx'
import { monthKey, readDoneActions, useMascotInsights } from './useMascotInsights.ts'
import { useMascotEvents } from './useMascotEvents.ts'
import { isMuted, useMascotStore, type MascotAction } from '@/store/mascotStore.ts'
import { isTourDone, markTourDone, useTourStore } from '@/store/tourStore.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useUiStore } from '@/store/uiStore.ts'
import { useAccountThemeStore } from '@/store/accountThemeStore.ts'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { isAdmin } from '@/lib/roles.ts'

const SIZE = 124
const MARGIN = 6
const TOP_MARGIN = 76
const SLEEP_AFTER_MS = 60_000
const MUTE_MS = 60 * 60 * 1000
/** Leads no mês que merecem festa. */
const MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000, 10000]
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
const CONFETTI_COLORS = ['#ff5d8f', '#ffd23f', '#4ade80', '#60a5fa', '#c084fc', '#fb923c']

type Corner = 'br' | 'bl' | 'tr' | 'tl'

const ROUTE_TIPS: Record<string, string[]> = {
  '/': ['De olho no CPL! Se ele subir, vale revisar o criativo.', 'Compare o investimento com os leads do período.'],
  '/acoes': ['Comece pelo vermelho: o urgente é o que mais custa dinheiro.', 'Marque como feito o que já resolveu. A lista zera todo dia.'],
  '/compare': ['Comparar períodos mostra se a campanha melhora de verdade.'],
  '/leads': ['Leads novos chegando. Bora qualificar?'],
  '/registros': ['Use os filtros pra achar o registro que precisa.'],
  '/purchases': ['Vendas fechadas! Cruze com o investimento pra achar o ROAS.'],
  '/live': ['Lembra de desligar a Live quando ela acabar!'],
  '/usuarios': ['Aprove os novos cadastros por aqui.'],
  '/seguranca': ['Backup, avisos e quem está logado: dá uma conferida de vez em quando.'],
}

const SEEN_KEY = 'dash-mascot-seen'
const CORNER_KEY = 'dash-mascot-corner'
const DAILY_KEY = 'dash-mascot-daily'

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

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function isFirstOfDay(): boolean {
  try {
    return localStorage.getItem(DAILY_KEY) !== todayKey()
  } catch {
    return false
  }
}

function markDaily() {
  try {
    localStorage.setItem(DAILY_KEY, todayKey())
  } catch {
    /* ignore */
  }
}

function readCorner(): Corner {
  try {
    const value = localStorage.getItem(CORNER_KEY)
    if (value === 'br' || value === 'bl' || value === 'tr' || value === 'tl') return value
  } catch {
    /* ignore */
  }
  return 'br'
}

function dockPosition(corner: Corner) {
  return {
    left: corner.endsWith('r') ? window.innerWidth - SIZE - MARGIN : MARGIN,
    top: corner.startsWith('b') ? window.innerHeight - SIZE - MARGIN : TOP_MARGIN,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function shorten(text: string, max = 70) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
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

interface DragState {
  id: number
  startX: number
  startY: number
  originLeft: number
  originTop: number
  moved: boolean
}

/**
 * Tatu: personagem animado que mora no canto da tela. Escreve o que quer dizer num balão
 * (com a caneta se mexendo), acena, comemora e, no tour guiado, anda até cada bloco da página,
 * destaca o conteúdo e explica. Os olhos seguem o cursor. Só o corpo dele recebe cliques.
 *
 * Para admins ele também lê os números (mesma análise da Central de Ações): faz o resumo do dia,
 * avisa do que é urgente e mostra uma bolinha vermelha com o total pendente. Clicar abre um menu
 * rápido, duplo clique abre a busca (Ctrl+K) e dá pra arrastar pra qualquer canto da tela.
 * Sem mexer em nada por 1 minuto ele dorme.
 */
export function MascotCompanion() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const admin = isAdmin(user)
  const enabled = useMascotStore((s) => s.enabled)
  const speech = useMascotStore((s) => s.speech)
  const storePose = useMascotStore((s) => s.pose)
  const poseUntil = useMascotStore((s) => s.poseUntil)
  const say = useMascotStore((s) => s.say)
  const dismiss = useMascotStore((s) => s.dismiss)
  const tourActive = useTourStore((s) => s.active)
  const tourStep = useTourStore((s) => s.step)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const accountName = useAccountThemeStore((s) => s.accountName)
  const confettiId = useMascotStore((s) => s.confettiId)
  const partyUntil = useMascotStore((s) => s.partyUntil)

  const insights = useMascotInsights(enabled && admin)
  useMascotEvents({ active: enabled, admin })

  const [entered, setEntered] = useState(false)
  const [hover, setHover] = useState(false)
  const [corner, setCorner] = useState<Corner>(readCorner)
  const [pos, setPos] = useState(() => dockPosition(readCorner()))
  const [moving, setMoving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [bubbleDown, setBubbleDown] = useState(false)
  const [typed, setTyped] = useState('')
  const [typing, setTyping] = useState(false)
  const [, force] = useState(0)
  const moveTimer = useRef<number | undefined>(undefined)
  const tourPrev = useRef(false)
  const cornerRef = useRef(corner)
  const drag = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const lastActive = useRef(Date.now())
  const insightsHandled = useRef(false)
  const clickTimes = useRef<number[]>([])
  const paletteTimer = useRef<number | undefined>(undefined)
  const [confetti, setConfetti] = useState(0)
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        dx: Math.round((Math.random() - 0.5) * 190),
        up: -Math.round(40 + Math.random() * 70),
        rot: Math.round((Math.random() - 0.5) * 900),
        delay: Math.round(Math.random() * 160),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [confetti],
  )

  // urgentes que ainda não foram marcados como feitos (relê ao trocar de página)
  const pendingUrgent = useMemo(() => {
    const done = readDoneActions(insights.accountId)
    return insights.actions.filter((action) => action.priority === 'urgent' && !done.has(action.id))
    // pathname só força a releitura do "feito" (que mora no localStorage) a cada navegação
  },[insights.actions, insights.accountId, pathname])

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

  // chapéu de festa expira
  useEffect(() => {
    const left = partyUntil - Date.now()
    if (left <= 0) return
    const t = window.setTimeout(() => force((n) => n + 1), left + 20)
    return () => window.clearTimeout(t)
  }, [partyUntil])

  // confete: mostra por ~2,7s a cada comemoração
  useEffect(() => {
    if (!confettiId) return
    setConfetti(confettiId)
    const t = window.setTimeout(() => setConfetti(0), 2700)
    return () => window.clearTimeout(t)
  }, [confettiId])

  // código Konami (↑↑↓↓←→←→BA), fora de campos de texto
  useEffect(() => {
    if (!enabled) return
    let index = 0
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key !== KONAMI[index]) {
        index = key === KONAMI[0] ? 1 : 0
        return
      }
      index += 1
      if (index < KONAMI.length) return
      index = 0
      const store = useMascotStore.getState()
      store.celebrate({ party: true })
      store.say('Código Konami! Você ganhou 30 vidas e meu respeito.', {
        pose: 'cheer',
        afterPose: 'idle',
        important: true,
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  // ── dorme depois de 1 minuto sem atividade ──
  useEffect(() => {
    if (!enabled) return
    lastActive.current = Date.now()
    function wake() {
      lastActive.current = Date.now()
      setSleeping(false)
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll'] as const
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }))
    const id = window.setInterval(() => {
      const idle = Date.now() - lastActive.current > SLEEP_AFTER_MS
      if (idle && !useMascotStore.getState().speech && !useTourStore.getState().active) setSleeping(true)
    }, 5000)
    return () => {
      events.forEach((name) => window.removeEventListener(name, wake))
      window.clearInterval(id)
    }
  }, [enabled])

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
        say(`Oi, ${name}! Eu sou o TaTuzinho, mascote da Academy Labs. Quer um tour rápido pelo painel?`, {
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

  // ── leitura dos números ──
  const speakBriefing = useCallback(
    (forced: boolean) => {
      if (!insights.ready) {
        say('Ainda estou lendo os números... já te conto!', { pose: 'think', afterPose: 'idle', important: true })
        return
      }
      const lines = insights.summary.length ? insights.summary : insights.briefing.slice(0, 2)
      const urgent = pendingUrgent.length > 0
      say(lines.join(' '), {
        pose: urgent ? 'alert' : 'write',
        afterPose: urgent ? 'alert' : 'point',
        important: forced,
        closable: true,
        hold: 14_000,
        actions: [
          {
            label: 'Ver ações',
            primary: true,
            run: () => {
              dismiss()
              navigate('/acoes')
            },
          },
          { label: 'Fechar', run: dismiss },
        ],
      })
    },
    [insights.ready, insights.summary, insights.briefing, pendingUrgent.length, say, dismiss, navigate],
  )

  const speakUrgent = useCallback(
    (forced: boolean) => {
      if (!insights.ready) {
        say('Ainda estou lendo os números... já te conto!', { pose: 'think', afterPose: 'idle', important: true })
        return
      }
      if (!pendingUrgent.length) {
        say('Nada urgente agora. Pode respirar!', { pose: 'cheer', afterPose: 'idle', important: true })
        return
      }
      const count = pendingUrgent.length
      const title = shorten(pendingUrgent[0].title)
      say(count === 1 ? `Tem 1 coisa urgente: ${title}` : `Tem ${count} coisas urgentes. A primeira: ${title}`, {
        pose: 'alert',
        afterPose: 'alert',
        important: forced,
        closable: true,
        hold: 14_000,
        actions: [
          {
            label: 'Ver ações',
            primary: true,
            run: () => {
              dismiss()
              navigate('/acoes')
            },
          },
          { label: 'Depois', run: dismiss },
        ],
      })
    },
    [insights.ready, pendingUrgent, say, dismiss, navigate],
  )

  // quando os números chegam: resumo do dia (1ª vez no dia) ou aviso de urgentes
  useEffect(() => {
    if (!enabled || !entered || tourActive || speech || !insights.ready || insightsHandled.current) return
    const t = window.setTimeout(() => {
      if (useMascotStore.getState().speech || useTourStore.getState().active) return
      insightsHandled.current = true
      if (isMuted()) return
      if (isFirstOfDay()) {
        markDaily()
        speakBriefing(false)
      } else if (pendingUrgent.length && pathname !== '/acoes') {
        speakUrgent(false)
      }
    }, 1200)
    return () => window.clearTimeout(t)
  }, [enabled, entered, tourActive, speech, insights.ready, pendingUrgent.length, pathname, speakBriefing, speakUrgent])

  // falha ao ler a Meta: o Tatu avisa (uma vez por sessão) em vez de a tela ficar vazia
  useEffect(() => {
    if (!enabled || !entered || tourActive || speech || !insights.error) return
    if (!markSeen('insights-error')) return
    say(`Não consegui ler os números da Meta: ${shorten(insights.error, 110)}`, {
      pose: 'sad',
      afterPose: 'sad',
      closable: true,
      hold: 12_000,
      actions: [
        {
          label: 'Tentar de novo',
          primary: true,
          run: () => {
            dismiss()
            window.location.reload()
          },
        },
        { label: 'Fechar', run: dismiss },
      ],
    })
  }, [enabled, entered, tourActive, speech, insights.error, say, dismiss])

  // marcos de leads no mês: a 1ª leitura vira base; passou de um marco novo, é festa
  useEffect(() => {
    const leads = insights.monthLeads
    if (!enabled || !entered || tourActive || leads == null || !insights.accountId || isMuted()) return
    const reached = MILESTONES.filter((value) => leads >= value).pop() ?? 0
    const key = `dash-mascot-milestone:${insights.accountId}:${monthKey()}`
    let stored: number | null = null
    try {
      const raw = localStorage.getItem(key)
      stored = raw == null ? null : Number(raw)
    } catch {
      /* ignore */
    }
    if (stored != null && reached <= stored) return
    try {
      localStorage.setItem(key, String(reached))
    } catch {
      /* ignore */
    }
    if (stored == null || !reached) return
    useMascotStore.getState().celebrate({ party: true })
    say(`${new Intl.NumberFormat('pt-BR').format(reached)} leads no mês! Isso merece chapéu de festa.`, {
      pose: 'cheer',
      afterPose: 'idle',
      hold: 9000,
    })
  }, [enabled, entered, tourActive, insights.monthLeads, insights.accountId, say])

  // ── posição: canto da tela ou ao lado do bloco do tour ──
  const goTo = useCallback((next: { left: number; top: number }) => {
    setPos(next)
    setMoving(true)
    window.clearTimeout(moveTimer.current)
    moveTimer.current = window.setTimeout(() => setMoving(false), 950)
  }, [])

  useEffect(() => {
    function onResize() {
      if (!useTourStore.getState().active) setPos(dockPosition(cornerRef.current))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── tour guiado ──
  useEffect(() => {
    if (!tourActive) {
      setSpot(null)
      if (tourPrev.current) goTo(dockPosition(cornerRef.current))
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
        important: true,
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
        important: true,
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

  // ── menu rápido (clique) ──
  const openMenu = useCallback(() => {
    const muted = isMuted()
    const items: MascotAction[] = []
    if (admin) {
      items.push({ label: 'Resumo do dia', primary: true, run: () => speakBriefing(true) })
      items.push({ label: 'O que é urgente?', run: () => speakUrgent(true) })
    }
    items.push({
      label: 'Fazer tour',
      primary: !admin,
      run: () => {
        dismiss()
        window.setTimeout(() => useTourStore.getState().start(), 250)
      },
    })
    items.push(
      muted
        ? {
            label: 'Voltar a falar',
            run: () => {
              useMascotStore.getState().unmute()
              say('Voltei! Pode contar comigo.', { pose: 'wave', afterPose: 'idle', important: true })
            },
          }
        : {
            label: 'Silenciar 1h',
            run: () => {
              useMascotStore.getState().mute(MUTE_MS)
              say('Beleza, fico quietinho por 1 hora. Me chama se precisar!', {
                pose: 'wave',
                afterPose: 'idle',
                important: true,
              })
            },
          },
    )
    say(muted ? 'Estou no silêncio. O que você precisa?' : 'Em que posso ajudar?', {
      pose: 'wave',
      afterPose: 'idle',
      important: true,
      closable: true,
      hold: 14_000,
      actions: items,
    })
  }, [admin, speakBriefing, speakUrgent, dismiss, say])

  function handleClick() {
    if (tourActive || suppressClick.current) return
    window.clearTimeout(paletteTimer.current)

    // cutucou 5 vezes em 2,5s: ele se enrola numa bolinha
    const now = Date.now()
    clickTimes.current = [...clickTimes.current.filter((t) => now - t < 2500), now]
    if (clickTimes.current.length >= 5) {
      clickTimes.current = []
      useMascotStore.getState().act('curl', 3000)
      say('Ai! Para de me cutucar, vou virar bolinha!', {
        pose: 'curl',
        afterPose: 'curl',
        hold: 2400,
        important: true,
      })
      return
    }

    if (speech?.closable && speech.actions) dismiss()
    else openMenu()
  }

  // o duplo clique espera um instante: se vier um 3º clique, é cutucada e não busca
  function handleDoubleClick() {
    if (tourActive) return
    window.clearTimeout(paletteTimer.current)
    paletteTimer.current = window.setTimeout(() => {
      dismiss()
      setPaletteOpen(true)
    }, 280)
  }

  // ── arrastar pra outro canto ──
  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (tourActive || window.innerWidth <= 640 || event.button !== 0) return
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: pos.left,
      originTop: pos.top,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (!state.moved) {
      if (Math.hypot(dx, dy) < 6) return
      state.moved = true
      setDragging(true)
      dismiss()
    }
    setPos({
      left: clamp(state.originLeft + dx, 0, window.innerWidth - SIZE),
      top: clamp(state.originTop + dy, 0, window.innerHeight - SIZE),
    })
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = drag.current
    drag.current = null
    if (!state || !state.moved) return
    suppressClick.current = true
    window.setTimeout(() => {
      suppressClick.current = false
    }, 80)
    setDragging(false)
    const next = `${event.clientY < window.innerHeight / 2 ? 't' : 'b'}${
      event.clientX < window.innerWidth / 2 ? 'l' : 'r'
    }` as Corner
    cornerRef.current = next
    setCorner(next)
    try {
      localStorage.setItem(CORNER_KEY, next)
    } catch {
      /* ignore */
    }
    goTo(dockPosition(next))
  }

  if (!enabled) return null

  let pose: TatuPose = 'idle'
  if (moving) pose = 'walk'
  else if (dragging) pose = 'wave'
  else if (speech && typing) pose = speech.pose ?? 'write'
  else if (speech) pose = speech.afterPose ?? 'idle'
  else if (storePose !== 'idle' && Date.now() < poseUntil) pose = storePose
  else if (insights.loading && entered) pose = 'think'
  else if (sleeping) pose = 'sleep'

  const awake = Boolean(speech) || tourActive || hover || dragging || (pose !== 'idle' && pose !== 'sleep' && pose !== 'think')
  const docked = !tourActive
  const bubbleRight = pos.left < 320
  const facing = bubbleRight ? 'right' : 'left'
  const bubbleBelow = tourActive ? bubbleDown : corner.startsWith('t') && !dragging
  const showBadge = pendingUrgent.length > 0 && pathname !== '/acoes' && !tourActive
  const party = Date.now() < partyUntil
  const graduate = /academy/i.test(accountName ?? '')

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
        } ${bubbleRight ? 'bubble-right' : ''} ${bubbleBelow ? 'bubble-down' : ''} ${
          corner.endsWith('l') && docked ? 'dock-left' : ''
        } ${dragging ? 'mascot-dragging' : ''}`}
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
            {(!speech.actions || speech.closable) && (
              <button type="button" className="mascot-bubble-close" aria-label="Fechar" onClick={dismiss}>
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </div>
        )}
        {confetti > 0 && (
          <div className="mascot-confetti" key={confetti} aria-hidden="true">
            {confettiPieces.map((piece, i) => (
              <i
                key={i}
                style={
                  {
                    '--dx': `${piece.dx}px`,
                    '--up': `${piece.up}px`,
                    '--rot': `${piece.rot}deg`,
                    '--c': piece.color,
                    animationDelay: `${piece.delay}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
        {showBadge && (
          <span className="mascot-badge" aria-label={`${pendingUrgent.length} ações urgentes`}>
            {pendingUrgent.length}
          </span>
        )}
        <button
          type="button"
          className="mascot-body"
          aria-label="TaTuzinho, mascote da Academy Labs. Clique para o menu, duplo clique para buscar, arraste para mudar de canto."
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <TatuCharacter size={SIZE} pose={pose} talking={typing} facing={facing} party={party} cap={graduate} />
        </button>
      </div>
    </>
  )
}
