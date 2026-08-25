import { useEffect, useRef, useState } from 'react'

/** Compteur qui s'anime de 0 à `target` la première fois qu'il entre dans le viewport. */
export function StatCounter({ target, suffix = '', label, compact = false }: {
  target: number; suffix?: string; label: string; compact?: boolean
}) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  const fmt = (n: number) => compact
    ? new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 0 }).format(n)
    : n.toLocaleString('fr-FR')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started.current) return
      started.current = true
      const start = Date.now()
      const duration = 1400
      const tick = () => {
        const p = Math.min((Date.now() - start) / duration, 1)
        const ease = 1 - Math.pow(1 - p, 3)
        setCount(Math.round(ease * target))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [target])

  return (
    <div
      ref={ref}
      className="rounded-[18px] px-4 py-[22px] text-center"
      style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)', backdropFilter: 'blur(12px)' }}
    >
      <div className="stat-value font-display text-[34px] font-bold leading-none tracking-tight text-text">
        {fmt(count)}{suffix}
      </div>
      <div className="mt-1.5 text-[12.5px] font-semibold text-text2">{label}</div>
    </div>
  )
}
