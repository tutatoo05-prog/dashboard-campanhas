import { useCallback, useEffect, useRef } from 'react'
import { ANIMAL_PATHS } from './animalPaths.ts'
import { ICONS } from './iconData.ts'

const NS = 'http://www.w3.org/2000/svg'
const INK = '#15110d'
const PAPER = '#fffaf0'

interface Art {
  viewBox: string
  cls: string
  inner: string
}

/** Desenho de cada tela: animais vetorizados das imagens de referência ou um adesivo de tatuagem. */
function artFor(kind: string): Art | null {
  const a = ANIMAL_PATHS as Record<string, { w: number; h: number; outer: string; lines?: string; holes?: string }>
  const animal = a[kind]
  if (animal) {
    const inner =
      kind === 'lion'
        ? `<path d="${animal.outer}" fill="${PAPER}"/><path d="${animal.lines}" fill="${INK}" fill-rule="evenodd"/>`
        : `<path d="${animal.outer}" fill="${INK}"/>${animal.holes ? `<path d="${animal.holes}" fill="${PAPER}"/>` : ''}`
    return { viewBox: `0 0 ${animal.w} ${animal.h}`, cls: 'animal sticker', inner }
  }
  if (ICONS[kind]) return { viewBox: '0 0 100 100', cls: 'stk', inner: ICONS[kind] }
  return null
}

const ease = (p: number) => 0.5 - Math.cos(Math.PI * p) / 2

/**
 * Pichação: uma lata de spray percorre o desenho em zigue-zague e a tinta aparece
 * por onde ela passa (máscara com borda granulada), com névoa e pingos no final.
 */
function spray(host: HTMLElement, art: Art, dur: number, cancelRef: { current: () => void }) {
  host.innerHTML = `<svg class="${art.cls}" viewBox="${art.viewBox}">${art.inner}</svg>`
  const svg = host.querySelector('svg') as SVGSVGElement
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const vb = svg.viewBox.baseVal
  const { x: X, y: Y, width: W, height: H } = vb
  const id = `sp${Math.random().toString(36).slice(2, 7)}`

  const rows = 7
  const rh = H / rows
  const xl = X - W * 0.06
  const xr = X + W * 1.06
  let d = `M${xl} ${Y + rh * 0.1}`
  for (let i = 0; i < rows; i++) {
    const y = Y + rh * (i + 0.1)
    const dir = i % 2 ? -1 : 1
    const far = dir > 0 ? xr : xl
    d += ` L${far} ${y}`
    if (i < rows - 1) d += ` Q${far + dir * rh * 0.8} ${y + rh / 2} ${far} ${y + rh}`
  }
  const sw = rh * 1.55

  svg.innerHTML = `
    <defs>
      <filter id="${id}f" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency=".085" numOctaves="2" seed="5" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="${(W * 0.05).toFixed(1)}"/>
      </filter>
      <mask id="${id}" maskUnits="userSpaceOnUse" x="${X - W * 0.15}" y="${Y - H * 0.15}" width="${W * 1.3}" height="${H * 1.3}">
        <g filter="url(#${id}f)">
          <path class="trail" d="${d}" style="fill:none;stroke:#fff;stroke-width:${sw.toFixed(1)}px;stroke-linecap:round;stroke-linejoin:round"/>
        </g>
        <rect class="fin" x="${X - W * 0.1}" y="${Y - H * 0.1}" width="${W * 1.2}" height="${H * 1.2}" fill="#fff" opacity="0"/>
      </mask>
    </defs>
    <g mask="url(#${id})">${art.inner}</g>
    <g class="mist"></g>
    <g class="drips"></g>
    <g class="can" opacity="0">
      <g transform="rotate(-38) scale(${(W * 0.0042).toFixed(3)})">
        <rect x="26" y="-13" width="58" height="26" rx="5" fill="#d9382c" stroke="${INK}" stroke-width="3"/>
        <rect x="46" y="-13" width="18" height="26" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
        <path d="M14 -9 L26 -13 V13 L14 9Z" fill="${PAPER}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <rect x="2" y="-7" width="13" height="14" rx="2" fill="${INK}"/>
        <rect x="-5" y="-3" width="8" height="6" rx="1.5" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/>
      </g>
    </g>`

  const trail = svg.querySelector('.trail') as SVGPathElement
  const fin = svg.querySelector('.fin') as SVGRectElement
  const can = svg.querySelector('.can') as SVGGElement
  const mist = svg.querySelector('.mist') as SVGGElement
  const drips = svg.querySelector('.drips') as SVGGElement
  const len = trail.getTotalLength()
  trail.style.strokeDasharray = String(len)

  const timers: number[] = []
  let raf = 0
  let lastMist = 0
  let dripsStarted = false
  let cancelled = false
  cancelRef.current = () => {
    cancelled = true
    cancelAnimationFrame(raf)
    timers.forEach((t) => window.clearTimeout(t))
  }

  const t0 = performance.now()
  const dripXs = [0.3, 0.46, 0.63].map((f) => X + W * f)

  function frame(now: number) {
    if (cancelled) return
    const p = Math.max(0, Math.min(1, (now - t0) / dur))
    const e = ease(p)
    trail.style.strokeDashoffset = String(len * (1 - e))
    const pt = trail.getPointAtLength(e * len)
    can.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`)
    can.setAttribute('opacity', String(p < 0.96 ? 1 : Math.max(0, (1 - p) / 0.04)))
    fin.setAttribute('opacity', String(Math.max(0, Math.min(1, (p - 0.86) / 0.14))))

    if (p < 1 && now - lastMist > 16) {
      lastMist = now
      for (let i = 0; i < 4; i++) {
        const c = document.createElementNS(NS, 'circle')
        const a = Math.random() * 6.283
        const r = Math.random() * W * 0.035
        c.setAttribute('cx', (pt.x + Math.cos(a) * r).toFixed(1))
        c.setAttribute('cy', (pt.y + Math.sin(a) * r).toFixed(1))
        c.setAttribute('r', (W * (0.002 + Math.random() * 0.005)).toFixed(2))
        c.setAttribute('class', 'mistdot')
        mist.appendChild(c)
        timers.push(window.setTimeout(() => c.remove(), 650))
      }
    }

    if (p >= 0.9 && !dripsStarted) {
      dripsStarted = true
      dripXs.forEach((x, k) => {
        const g = document.createElementNS(NS, 'rect')
        g.setAttribute('x', (x - W * 0.006).toFixed(1))
        g.setAttribute('y', (Y + H * 0.985).toFixed(1))
        g.setAttribute('width', (W * 0.012).toFixed(1))
        g.setAttribute('height', '0')
        g.setAttribute('rx', (W * 0.006).toFixed(1))
        g.setAttribute('fill', INK)
        drips.appendChild(g)
        const start = performance.now()
        const max = H * (0.05 + k * 0.018)
        const step = (n: number) => {
          if (cancelled) return
          const q = Math.max(0, Math.min(1, (n - start) / (900 + k * 250)))
          g.setAttribute('height', (max * (1 - Math.pow(1 - q, 3))).toFixed(1))
          if (q < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
    }

    if (p < 1) raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
}

interface SprayArtProps {
  kind: string
  className?: string
  /** Duração da pichação em ms. */
  duration?: number
}

/** Desenho da tela, pichado ao aparecer. Clicar repete a animação. */
export function SprayArt({ kind, className = '', duration = 2600 }: SprayArtProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<() => void>(() => {})

  const run = useCallback(() => {
    const host = hostRef.current
    const art = artFor(kind)
    if (!host) return
    cancelRef.current()
    if (!art) {
      host.innerHTML = ''
      return
    }
    spray(host, art, duration, cancelRef)
  }, [kind, duration])

  useEffect(() => {
    run()
    return () => cancelRef.current()
  }, [run])

  return (
    <div
      ref={hostRef}
      className={`spray-art ${className}`}
      onClick={run}
      title="Clique para ver a pichação de novo"
      role="img"
      aria-label="Ilustração da página"
    />
  )
}
