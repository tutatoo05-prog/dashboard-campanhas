import { useEffect, useRef, useState, type CSSProperties } from 'react'
import artUrl from '@/imagem/fundo-login.png'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
  speed: number
}

const LINK_RADIUS = 150
const REPEL_RADIUS = 110

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Fundo animado das telas de autenticação: ilustração 3D dividida em duas
 * metades com parallax, holofote que segue o cursor e partículas douradas.
 * Publica --mx/--my (-1..1) e --px/--py (px) no elemento pai para que o
 * card e outras camadas reajam ao ponteiro.
 */
export function AuthBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [artLoaded, setArtLoaded] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.onload = () => setArtLoaded(true)
    img.src = artUrl
  }, [])

  useEffect(() => {
    const root = rootRef.current
    const host = root?.parentElement
    const canvas = canvasRef.current
    if (!root || !host || !canvas) return

    const ctx = canvas.getContext('2d')
    const reduced = prefersReducedMotion()

    let width = 0
    let height = 0
    let dpr = 1
    let particles: Particle[] = []

    const pointer = { x: -9999, y: -9999, active: false }
    const target = { mx: 0, my: 0 }
    const current = { mx: 0, my: 0 }

    function spawn(randomY: boolean): Particle {
      return {
        x: Math.random() * width,
        y: randomY ? Math.random() * height : height + 10,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -(0.12 + Math.random() * 0.35),
        r: 0.5 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.4,
      }
    }

    function resize() {
      width = host!.clientWidth
      height = host!.clientHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = reduced ? 0 : Math.round(Math.min(90, (width * height) / 16000))
      particles = Array.from({ length: count }, () => spawn(true))
    }

    function onPointerMove(event: PointerEvent) {
      const rect = host!.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.active = true
      target.mx = (pointer.x / rect.width) * 2 - 1
      target.my = (pointer.y / rect.height) * 2 - 1
      host!.style.setProperty('--px', `${pointer.x}px`)
      host!.style.setProperty('--py', `${pointer.y}px`)
      host!.classList.add('auth-pointer-active')
    }

    function onPointerLeave() {
      pointer.active = false
      pointer.x = -9999
      pointer.y = -9999
      target.mx = 0
      target.my = 0
      host!.classList.remove('auth-pointer-active')
    }

    let frame = 0
    let time = 0

    function tick() {
      time += 1 / 60

      current.mx += (target.mx - current.mx) * 0.06
      current.my += (target.my - current.my) * 0.06
      host!.style.setProperty('--mx', current.mx.toFixed(4))
      host!.style.setProperty('--my', current.my.toFixed(4))

      if (ctx) {
        ctx.clearRect(0, 0, width, height)

        for (const p of particles) {
          p.x += p.vx + Math.sin(time * p.speed + p.phase) * 0.18
          p.y += p.vy

          if (pointer.active) {
            const dx = p.x - pointer.x
            const dy = p.y - pointer.y
            const dist = Math.hypot(dx, dy)
            if (dist < REPEL_RADIUS && dist > 0.01) {
              const force = (1 - dist / REPEL_RADIUS) * 1.4
              p.x += (dx / dist) * force
              p.y += (dy / dist) * force
            }
            if (dist < LINK_RADIUS) {
              ctx.strokeStyle = `rgba(255, 192, 77, ${(1 - dist / LINK_RADIUS) * 0.35})`
              ctx.lineWidth = 0.6
              ctx.beginPath()
              ctx.moveTo(p.x, p.y)
              ctx.lineTo(pointer.x, pointer.y)
              ctx.stroke()
            }
          }

          if (p.y < -10 || p.x < -20 || p.x > width + 20) {
            Object.assign(p, spawn(false))
          }

          const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * p.speed * 2 + p.phase))
          ctx.fillStyle = `rgba(255, 192, 77, ${twinkle * 0.8})`
          ctx.shadowColor = 'rgba(255, 163, 26, 0.9)'
          ctx.shadowBlur = p.r * 6
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.shadowBlur = 0
      }

      frame = requestAnimationFrame(tick)
    }

    resize()
    window.addEventListener('resize', resize)
    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerleave', onPointerLeave)
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  const artStyle = { '--art': `url(${artUrl})` } as CSSProperties

  return (
    <div ref={rootRef} className="auth-backdrop" aria-hidden="true">
      <svg width="0" height="0" style={{ position: 'absolute' }} focusable="false">
        <filter id="auth-distort" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="auth-aurora auth-aurora-1" />
      <div className="auth-aurora auth-aurora-2" />
      <div className="auth-aurora auth-aurora-3" />
      <div className="auth-grid" />
      <div className="auth-spotlight" />

      <div className={`auth-art-stage ${artLoaded ? 'is-loaded' : ''}`} style={artStyle}>
        <div className="auth-art auth-art-left">
          <div className="auth-art-parallax">
            <div className="auth-art-float">
              <div className="auth-art-img" />
            </div>
          </div>
        </div>
        <div className="auth-art auth-art-right">
          <div className="auth-art-parallax">
            <div className="auth-art-float">
              <div className="auth-art-img" />
            </div>
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="auth-particles" />
      <div className="auth-vignette" />
    </div>
  )
}
