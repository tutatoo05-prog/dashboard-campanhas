import { useEffect, useId, useRef } from 'react'

export type TatuPose = 'idle' | 'wave' | 'write' | 'point' | 'reveal' | 'cheer' | 'sleep' | 'walk' | 'alert' | 'think'

interface TatuCharacterProps {
  pose?: TatuPose
  talking?: boolean
  size?: number
  facing?: 'left' | 'right'
  followCursor?: boolean
  className?: string
}

const INK = '#2a1a05'

/**
 * Tatu, mascote da Academy Labs, desenhado em SVG puro.
 * Poses via data-pose (CSS em premium.css): idle, wave, write, point, reveal, cheer, sleep, walk, alert, think.
 * Os olhos seguem o cursor (variáveis --ex/--ey no <svg>).
 */
export function TatuCharacter({
  pose = 'idle',
  talking = false,
  size = 120,
  facing = 'left',
  followCursor = true,
  className = '',
}: TatuCharacterProps) {
  const uid = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!followCursor || !svg || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    function onMove(event: PointerEvent) {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const rect = svg!.getBoundingClientRect()
        // centro dos olhos ≈ (68, 88) no viewBox 200x200
        const cx = rect.left + (rect.width * 68) / 200
        const cy = rect.top + (rect.height * 88) / 200
        const dx = event.clientX - cx
        const dy = event.clientY - cy
        const dist = Math.max(Math.hypot(dx, dy), 1)
        const reach = Math.min(dist / 220, 1)
        const flip = facing === 'right' ? -1 : 1
        svg!.style.setProperty('--ex', ((dx / dist) * reach * flip).toFixed(3))
        svg!.style.setProperty('--ey', ((dy / dist) * reach).toFixed(3))
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [followCursor, facing])

  const shell = `${uid}-shell`
  const clip = `${uid}-clip`

  return (
    <svg
      ref={svgRef}
      className={`tc ${className}`}
      data-pose={pose}
      data-talking={talking ? 'true' : 'false'}
      data-facing={facing}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Tatu, mascote da Academy Labs"
    >
      <defs>
        <linearGradient id={shell} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffc04d" />
          <stop offset="55%" stopColor="#ffa31a" />
          <stop offset="100%" stopColor="#d98200" />
        </linearGradient>
        <clipPath id={clip}>
          <ellipse cx="116" cy="116" rx="64" ry="60" />
        </clipPath>
      </defs>

      <g className="tc-flip">
        <ellipse className="tc-shadow" cx="112" cy="190" rx="60" ry="6" fill="rgba(0,0,0,0.38)" />

        <g className="tc-bob">
          {/* rabo */}
          <path
            className="tc-tail"
            d="M172 140 Q198 146 192 168 Q178 164 164 152 Z"
            fill="#f5b861"
            stroke={INK}
            strokeWidth="3"
            strokeLinejoin="round"
          />

          {/* pé de trás */}
          <ellipse className="tc-foot tc-foot-b" cx="132" cy="182" rx="14" ry="8" fill="#ffc266" stroke={INK} strokeWidth="3" />

          {/* braço de trás (livre) */}
          <g className="tc-arm tc-arm-far">
            <path d="M104 134 L102 160" stroke={INK} strokeWidth="15" strokeLinecap="round" fill="none" />
            <path d="M104 134 L102 160" stroke="#f5b861" strokeWidth="10" strokeLinecap="round" fill="none" />
            <circle cx="102" cy="162" r="7.5" fill="#f5b861" stroke={INK} strokeWidth="3" />
          </g>

          {/* corpo */}
          <g className="tc-body">
            <ellipse cx="116" cy="116" rx="64" ry="60" fill={`url(#${shell})`} stroke={INK} strokeWidth="3.5" />
            <g clipPath={`url(#${clip})`} fill="none" strokeLinecap="round">
              <path d="M94 56 Q82 116 98 176" stroke="#b86a00" strokeWidth="3" />
              <path d="M116 52 Q110 116 118 178" stroke="#b86a00" strokeWidth="3" />
              <path d="M138 56 Q138 116 136 176" stroke="#b86a00" strokeWidth="3" />
              <path d="M158 68 Q164 116 154 168" stroke="#b86a00" strokeWidth="3" />
              <path d="M82 80 Q102 54 134 52" stroke="rgba(255,255,255,0.4)" strokeWidth="6" />
            </g>
            <ellipse cx="94" cy="152" rx="32" ry="28" fill="#ffe2b0" stroke={INK} strokeWidth="3" />
          </g>

          {/* pé da frente */}
          <ellipse className="tc-foot tc-foot-f" cx="86" cy="182" rx="15" ry="8" fill="#ffc266" stroke={INK} strokeWidth="3" />

          {/* cabeça */}
          <g className="tc-head">
            <path d="M52 72 Q42 46 58 38 Q70 50 68 72 Z" fill="#ffc266" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
            <path d="M55 66 Q51 52 58 46 Q63 54 62 66 Z" fill="#ff9d7a" opacity="0.7" />
            <path d="M74 68 Q72 42 88 36 Q96 54 84 74 Z" fill="#ffc266" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
            <path d="M78 64 Q77 48 87 44 Q90 54 83 66 Z" fill="#ff9d7a" opacity="0.7" />
            <ellipse cx="70" cy="92" rx="34" ry="30" fill="#ffc266" stroke={INK} strokeWidth="3" />
            <ellipse cx="42" cy="101" rx="21" ry="14" fill="#ffd68a" stroke={INK} strokeWidth="3" />
            <ellipse cx="24" cy="99" rx="5.5" ry="4.5" fill={INK} />
            <ellipse cx="49" cy="107" rx="6" ry="4" fill="#ff7a59" opacity="0.45" />

            {/* olhos */}
            <g className="tc-eyes">
              <ellipse cx="58" cy="88" rx="9" ry="10.5" fill="#fffdf6" stroke={INK} strokeWidth="2.5" />
              <ellipse cx="82" cy="88" rx="8" ry="9.5" fill="#fffdf6" stroke={INK} strokeWidth="2.5" />
              <g className="tc-pupils">
                <circle cx="57" cy="89" r="5" fill={INK} />
                <circle cx="55.5" cy="86.5" r="1.8" fill="#fff" />
                <circle cx="81" cy="89" r="4.6" fill={INK} />
                <circle cx="79.6" cy="86.6" r="1.6" fill="#fff" />
              </g>
              <g className="tc-lids">
                <ellipse className="tc-lid" cx="58" cy="88" rx="10" ry="11.5" fill="#ffc266" stroke={INK} strokeWidth="2.5" />
                <ellipse className="tc-lid" cx="82" cy="88" rx="9" ry="10.5" fill="#ffc266" stroke={INK} strokeWidth="2.5" />
              </g>
            </g>

            {/* boca */}
            <path className="tc-smile" d="M33 109 Q43 117 53 110" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
            <ellipse className="tc-mouth" cx="43" cy="111" rx="6.5" ry="5.5" fill="#7a2a1a" stroke={INK} strokeWidth="2.2" />
          </g>

          {/* bloco de notas (pose write) */}
          <g className="tc-pad">
            <rect x="14" y="140" width="46" height="36" rx="5" fill="#fff8e7" stroke={INK} strokeWidth="3" transform="rotate(-6 37 158)" />
            <g transform="rotate(-6 37 158)" fill="none" stroke="#c98a2b" strokeWidth="2.4" strokeLinecap="round">
              <path className="tc-scribble tc-scribble-1" d="M21 150 H52" pathLength="1" />
              <path className="tc-scribble tc-scribble-2" d="M21 158 H46" pathLength="1" />
              <path className="tc-scribble tc-scribble-3" d="M21 166 H50" pathLength="1" />
            </g>
          </g>

          {/* braço da frente (o que age) */}
          <g className="tc-arm tc-arm-near">
            <path d="M88 136 L84 162" stroke={INK} strokeWidth="15" strokeLinecap="round" fill="none" />
            <path d="M88 136 L84 162" stroke="#ffc266" strokeWidth="10" strokeLinecap="round" fill="none" />
            <g className="tc-pencil">
              <path d="M80 168 L94 178 L91 181 L77 171 Z" fill="#ffd23f" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
              <path d="M94 178 L97 183 L91 181 Z" fill={INK} />
            </g>
            <circle cx="84" cy="164" r="8" fill="#ffc266" stroke={INK} strokeWidth="3" />
          </g>

          {/* extras */}
          <g className="tc-sparkles" fill="#ffd23f" stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
            <path className="tc-spark tc-spark-1" d="M20 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" />
            <path className="tc-spark tc-spark-2" d="M118 14 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5 z" />
            <path className="tc-spark tc-spark-3" d="M168 56 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" />
          </g>
          <g className="tc-alert">
            <circle cx="64" cy="20" r="13" fill="#ef4444" stroke={INK} strokeWidth="3" />
            <path d="M64 12 V22" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
            <circle cx="64" cy="28" r="2.4" fill="#fff" />
          </g>
          <g className="tc-think" fill="#fff8e7" stroke={INK} strokeWidth="2">
            <circle className="tc-dot tc-dot-1" cx="104" cy="54" r="3.5" />
            <circle className="tc-dot tc-dot-2" cx="116" cy="42" r="5" />
            <circle className="tc-dot tc-dot-3" cx="134" cy="26" r="8" />
          </g>
          <g className="tc-zzz"fill="#ffd8a0" fontFamily="DM Sans, sans-serif" fontWeight="700">
            <text className="tc-z tc-z-1" x="100" y="46" fontSize="20">z</text>
            <text className="tc-z tc-z-2" x="120" y="30" fontSize="15">z</text>
            <text className="tc-z tc-z-3" x="136" y="18" fontSize="11">z</text>
          </g>
        </g>
      </g>
    </svg>
  )
}
