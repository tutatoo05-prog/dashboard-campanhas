import { useEffect, useRef, useState } from 'react'

interface SparklineProps {
  values: number[]
  stroke?: string
}

/** Mini gráfico de linha sem eixos. Desenha a linha ao aparecer. */
export function Sparkline({ values, stroke = 'var(--spark, #15110d)' }: SparklineProps) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100
    const y = 30 - ((value - min) / range) * 26
    return [x, y] as const
  })
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg className="kpi2-spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} pathLength={1} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="2.6" fill={stroke} />
    </svg>
  )
}

/** Número que "sobe" até o valor final ao aparecer (ou quando muda). */
function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(target)
  const from = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !Number.isFinite(target)) {
      setValue(target)
      return
    }
    const start = performance.now()
    const origin = from.current
    let raf = 0
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(origin + (target - origin) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

interface KpiCardProps {
  label: string
  icon: string
  value: number
  format: (value: number) => string
  /** Valor do período anterior, pra calcular a variação. */
  previous?: number | null
  /** true = subir é bom (leads, CTR); false = descer é bom (CPL, CPC); null = neutro (investimento). */
  higherIsBetter?: boolean | null
  spark?: number[]
  accent?: boolean
}

export function KpiCard({ label, icon, value, format, previous, higherIsBetter = true, spark, accent }: KpiCardProps) {
  const shown = useCountUp(value)

  let delta: number | null = null
  if (previous != null && previous > 0) delta = ((value - previous) / previous) * 100
  else if (previous === 0 && value > 0) delta = 100

  let tone = ''
  if (delta != null && Math.abs(delta) >= 0.5 && higherIsBetter !== null) {
    const improved = higherIsBetter ? delta > 0 : delta < 0
    tone = improved ? 'delta-chip-good' : 'delta-chip-bad'
  }

  return (
    <div className={`kpi2 ${accent ? 'kpi2-accent' : ''}`}>
      <div className="kpi2-head">
        <span className="kpi2-label">{label}</span>
        <span className="kpi2-icon">
          <i className={`fa-solid ${icon}`} />
        </span>
      </div>
      <p className="kpi2-value">{format(shown)}</p>
      <div className="kpi2-foot">
        {delta != null ? (
          <div className="flex flex-col gap-0.5">
            <span className={`delta-chip ${tone}`}>
              <i className={`fa-solid ${delta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} text-[9px]`} />
              {delta >= 0 ? '+' : ''}
              {delta.toFixed(Math.abs(delta) >= 100 ? 0 : 1)}%
            </span>
            <span className="delta-note">vs período anterior</span>
          </div>
        ) : (
          <span className="delta-note">sem período anterior</span>
        )}
        {spark && <Sparkline values={spark} stroke={accent ? '#15110d' : 'var(--spark, #15110d)'} />}
      </div>
    </div>
  )
}

export function KpiSkeletons() {
  return (
    <div className="kpi-grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="kpi2">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-8 w-28" />
          <div className="skeleton h-5 w-24" />
        </div>
      ))}
    </div>
  )
}
