/**
 * Publish — page unifiée « Publication ».
 * Fusionne Posting (simple) et MassPosting (masse) sous un seul onglet de nav,
 * avec un sélecteur de mode persistant. La Programmation reste une page à part.
 */
import { useState, Suspense, lazy } from 'react'
import type { User } from '@supabase/supabase-js'
import { Spinner } from '@/components/ui/Spinner'
import { ACCENT, ACCENT_L, HAIR } from '@/lib/theme'

const Posting     = lazy(() => import('@/pages/Posting').then(m => ({ default: m.Posting })))
const MassPosting = lazy(() => import('@/pages/MassPosting').then(m => ({ default: m.MassPosting })))

type Mode = 'simple' | 'mass'
const LS_MODE = 'sf-publish-mode'

export function Publish({ user }: { user: User }) {
  const [mode, setMode] = useState<Mode>(() =>
    (localStorage.getItem(LS_MODE) as Mode | null) ?? 'simple')

  function pick(m: Mode) {
    setMode(m)
    localStorage.setItem(LS_MODE, m)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Sélecteur de mode ─────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 28px 0',
      }}>
        {([
          { k: 'simple' as Mode, label: 'Simple',   desc: 'Un envoi, contrôle fin par téléphone' },
          { k: 'mass'   as Mode, label: 'En masse', desc: 'Distribution automatique sur tous les comptes' },
        ]).map(m => {
          const active = mode === m.k
          return (
            <button
              key={m.k}
              onClick={() => pick(m.k)}
              title={m.desc}
              className="cursor-pointer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '7px 16px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                background: active ? 'rgba(99,102,241,0.14)' : 'transparent',
                border: `1px solid ${active ? 'rgba(99,102,241,0.4)' : HAIR}`,
                color: active ? ACCENT_L : 'rgba(233,234,240,0.42)',
                transition: 'all 0.15s',
              }}
            >
              {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />}
              {m.label}
            </button>
          )
        })}
      </div>

      {/* ── Page du mode choisi ───────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Suspense fallback={
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner />
          </div>
        }>
          {mode === 'simple' ? <Posting user={user} /> : <MassPosting user={user} />}
        </Suspense>
      </div>
    </div>
  )
}
