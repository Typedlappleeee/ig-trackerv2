// Modal accessible partagé — remplace les ~10 implémentations copy-collées.
// Escape ferme, clic backdrop ferme, focus piégé dans le modal, aria-modal.
import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  /** Largeur max du panneau (px). Défaut 480. */
  width?: number
  children: ReactNode
  /** Désactive la fermeture par Escape/backdrop (ex: opération en cours) */
  locked?: boolean
}

export function Modal({ open, onClose, width = 480, children, locked = false }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose()
      // Focus trap minimal : Tab reste dans le panneau
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    // Focus initial dans le panneau
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>('input, textarea, button')
      el?.focus()
    }, 50)
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [open, onClose, locked])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => { if (!locked) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(4,4,10,0.72)', backdropFilter: 'blur(6px)',
        animation: 'sf-fade-in 0.18s ease both',
      }}
    >
      <div
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        className="sf-anim-scale-spring"
        style={{
          width: '100%', maxWidth: width, maxHeight: '85vh', overflowY: 'auto',
          background: 'var(--surface, #0E0E16)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          boxShadow: '0 24px 80px -16px rgba(0,0,0,0.7)',
          margin: 16,
        }}
      >
        {children}
      </div>
    </div>
  )
}
