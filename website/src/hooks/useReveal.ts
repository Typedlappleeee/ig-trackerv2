import { useEffect, useRef } from 'react'

/**
 * Ajoute la classe `visible` aux enfants `.reveal` quand ils entrent dans le viewport.
 * À poser sur le conteneur de section : `const ref = useReveal()`.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    el.querySelectorAll('.reveal').forEach(n => obs.observe(n))
    return () => obs.disconnect()
  }, [])
  return ref
}
