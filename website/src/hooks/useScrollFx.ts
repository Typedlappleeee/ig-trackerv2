import { useEffect } from 'react'

/**
 * Effets liés au scroll, écrits directement sur les éléments (pas de re-render).
 * Marque tes éléments avec :
 *   data-reveal            → entrée 3D + flou qui se dissipe
 *   data-stagger           → sur un conteneur : cascade auto sur ses enfants [data-reveal]
 *   data-fadeout           → s'efface et descend quand on scrolle (hero)
 *   data-zoom              → grossit de 84 % à 100 % selon l'entrée dans le viewport
 *   data-rotate            → se redresse de 16° à 0°
 *   data-count="1284"      → compteur qui monte au reveal (+ data-suffix)
 */
export function useScrollFx() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // ── Reveals ──
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        el.style.transitionDelay = (el.dataset.delay ?? '0') + 's'
        el.style.opacity = '1'
        el.style.transform = 'none'
        el.style.filter = 'blur(0)'
        obs.unobserve(el)
      }),
      { threshold: 0.08, rootMargin: '0px 0px -70px 0px' },
    )

    if (!reduce) {
      document.querySelectorAll<HTMLElement>('[data-stagger]').forEach(grid => {
        Array.from(grid.querySelectorAll<HTMLElement>('[data-reveal]')).forEach((el, i) => {
          el.dataset.delay = (i * 0.075).toFixed(3)
        })
      })
      document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => {
        el.style.opacity = '0'
        el.style.transform = 'perspective(1200px) rotateX(9deg) translateY(46px) scale(0.965)'
        el.style.filter = 'blur(7px)'
        el.style.transformOrigin = '50% 100%'
        el.style.transition =
          'opacity .95s cubic-bezier(0.16,1,0.3,1), transform 1.05s cubic-bezier(0.16,1,0.3,1), filter .8s ease'
        obs.observe(el)
      })
    }

    // ── Compteurs ──
    const cobs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (!e.isIntersecting) return
        cobs.unobserve(e.target)
        const el = e.target as HTMLElement
        const target = parseFloat(el.dataset.count ?? '0')
        const suffix = el.dataset.suffix ?? ''
        const t0 = Date.now()
        const step = () => {
          const p = Math.min((Date.now() - t0) / 1500, 1)
          const ease = 1 - Math.pow(1 - p, 4)
          el.textContent = Math.round(ease * target).toLocaleString('fr-FR') + suffix
          if (p < 1) requestAnimationFrame(step)
        }
        step()
      }),
      { threshold: 0.4 },
    )
    document.querySelectorAll('[data-count]').forEach(el => cobs.observe(el))

    // ── Transforms liés au scroll ──
    const px = Array.from(document.querySelectorAll<HTMLElement>('[data-zoom]'))
    const rt = Array.from(document.querySelectorAll<HTMLElement>('[data-rotate]'))
    const fd = Array.from(document.querySelectorAll<HTMLElement>('[data-fadeout]'))
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
    let raf: number | null = null

    const apply = () => {
      raf = null
      const vh = window.innerHeight
      px.forEach(el => {
        const r = el.getBoundingClientRect()
        const p = clamp(1 - (r.top - vh * 0.15) / (vh * 0.85), 0, 1)
        el.style.transform = `scale(${(0.84 + p * 0.16).toFixed(4)})`
      })
      rt.forEach(el => {
        const r = el.getBoundingClientRect()
        const p = clamp(1 - (r.top - vh * 0.1) / (vh * 0.9), 0, 1)
        el.style.transform = `perspective(1400px) rotateX(${((1 - p) * 16).toFixed(2)}deg) scale(${(0.9 + p * 0.1).toFixed(4)})`
      })
      fd.forEach(el => {
        const p = clamp(window.scrollY / (vh * 0.9), 0, 1)
        el.style.opacity = String(1 - p * 0.85)
        el.style.transform = `translate3d(0,${(p * 70).toFixed(1)}px,0) scale(${(1 - p * 0.05).toFixed(4)})`
      })
    }

    const onFx = () => { if (!raf) raf = requestAnimationFrame(apply) }
    if (!reduce) {
      window.addEventListener('scroll', onFx, { passive: true })
      window.addEventListener('resize', onFx)
      apply()
    }

    return () => {
      obs.disconnect()
      cobs.disconnect()
      window.removeEventListener('scroll', onFx)
      window.removeEventListener('resize', onFx)
    }
  }, [])
}

/** Barre de progression de scroll (0 → 100). */
export function useScrollProgress(setPct: (n: number) => void) {
  useEffect(() => {
    const onScroll = () => {
      const d = document.documentElement
      const total = d.scrollHeight - d.clientHeight
      setPct(total > 0 ? Math.min(100, (d.scrollTop / total) * 100) : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [setPct])
}
