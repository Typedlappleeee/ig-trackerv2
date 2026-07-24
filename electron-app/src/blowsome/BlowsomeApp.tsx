// Blowsome — sous-application VIP autonome.
// Rendu plein écran (remplace le shell ScaleFlow). Sa propre nav, ses propres pages,
// et un bouton "← ScaleFlow" pour rebasculer sur l'app principale.
import { useState, Suspense, lazy } from 'react'
import type { User } from '@supabase/supabase-js'
import { useBlowCSS, Grad, Ico, ICON, GRAD, INK, MUTED, HAIR, BlowBadge, BlowButton } from './ui'
import { BankHub } from '@/pages/BankHub'
import { BlowIntro } from './BlowIntro'
import { BlowDashboard } from './pages/Dashboard'
import { BlowPosting } from './pages/Posting'
import { BlowTools } from './pages/ToolsManager'
import { BlowPhoneFarm } from './pages/PhoneFarm'

const Publish = lazy(() => import('@/pages/Publish').then(m => ({ default: m.Publish })))

type Tab = 'dashboard' | 'posting' | 'bank' | 'tools' | 'phonefarm'

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard',   icon: ICON.grid },
  { id: 'posting',   label: 'Posting',     icon: ICON.send },
  { id: 'bank',      label: 'Banque',      icon: ICON.folder },
  { id: 'tools',     label: 'Gestionnaire de tool', icon: ICON.wrench },
  { id: 'phonefarm', label: 'Phone Farm',  icon: ICON.phone },
]

export function BlowsomeApp({ user, onExit }: { user: User; onExit: () => void }) {
  useBlowCSS()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [intro, setIntro] = useState(true)          // intro cinématique à l'entrée
  const [showPublish, setShowPublish] = useState(false)  // modale posting ScaleFlow
  const firstName = (user.email?.split('@')[0] ?? 'VIP').replace(/[._]/g, ' ')

  if (intro) return <BlowIntro onDone={() => setIntro(false)} />

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', background: 'radial-gradient(ellipse at 18% 0%, #140a1f 0%, #08070d 55%)', color: INK, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Orbes d'ambiance */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-8%', left: '20%', width: 480, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.22), transparent 66%)', filter: 'blur(70px)', animation: 'blow-orb 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-6%', right: '10%', width: 520, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.16), transparent 68%)', filter: 'blur(74px)', animation: 'blow-orb 24s ease-in-out infinite reverse' }} />
      </div>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside style={{ position: 'relative', zIndex: 1, width: 234, flexShrink: 0, borderRight: `1px solid ${HAIR}`, background: 'rgba(10,7,16,0.6)', backdropFilter: 'blur(14px)', display: 'flex', flexDirection: 'column', padding: '20px 14px' }}>
        {/* Wordmark */}
        <div style={{ padding: '4px 8px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', color: '#fff', background: GRAD, boxShadow: '0 10px 24px -10px rgba(168,85,247,0.8)', fontWeight: 900 }}>✦</span>
          <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-.02em' }}><Grad style={{ animation: 'blow-shimmer 6s linear infinite' }}>BLOWSOME</Grad></span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {NAV.map(n => {
            const active = tab === n.id
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className="blow-tap"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  fontSize: 13.5, fontWeight: active ? 800 : 600, textAlign: 'left',
                  color: active ? '#fff' : MUTED,
                  background: active ? 'linear-gradient(100deg, rgba(168,85,247,0.22), rgba(99,102,241,0.14))' : 'transparent',
                  boxShadow: active ? 'inset 0 0 0 1px rgba(168,85,247,0.35)' : 'none',
                }}
              >
                <span style={{ color: active ? '#D8B4FE' : FAINTish }}><Ico d={n.icon} size={18} /></span>
                {n.label}
              </button>
            )
          })}
        </nav>

        {/* Switch back to ScaleFlow */}
        <button
          onClick={onExit}
          className="blow-tap"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, border: `1px solid ${HAIR}`, cursor: 'pointer', color: MUTED, background: 'rgba(255,255,255,0.03)', fontSize: 12.5, fontWeight: 700 }}
        >
          <Ico d={ICON.back} size={16} />
          Retour à ScaleFlow
        </button>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="blow-scroll" style={{ position: 'relative', zIndex: 1, flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {/* Topbar */}
        <header style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 30px', borderBottom: `1px solid ${HAIR}`, background: 'rgba(8,7,13,0.72)', backdropFilter: 'blur(14px)' }}>
          <BlowBadge tone="gold">✦ Agence VIP</BlowBadge>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BlowButton onClick={() => setShowPublish(true)} style={{ height: 36 }}><Ico d={ICON.send} size={14} /> Publier</BlowButton>
            <span style={{ fontSize: 13, color: MUTED, textTransform: 'capitalize' }}>{firstName}</span>
            <span style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, background: GRAD }}>
              {firstName.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>

        {tab === 'bank' ? (
          // Banque : le VRAI composant ScaleFlow (même contenu). Plein cadre.
          <div style={{ height: 'calc(100% - 65px)', minHeight: 520 }}>
            <BankHub user={user} />
          </div>
        ) : tab === 'tools' ? (
          // Gestionnaire de tool : plein cadre (les outils gèrent leur propre layout).
          <div style={{ height: 'calc(100% - 65px)', minHeight: 520 }}>
            <BlowTools user={user} />
          </div>
        ) : (
          <div style={{ padding: '30px 30px 80px', maxWidth: 1120, margin: '0 auto' }}>
            {tab === 'dashboard' && <BlowDashboard user={user} onGo={setTab} onPublish={() => setShowPublish(true)} />}
            {tab === 'posting'   && <BlowPosting user={user} />}
            {tab === 'phonefarm' && <BlowPhoneFarm user={user} />}
          </div>
        )}
      </main>

      {/* ── Modale Posting ScaleFlow (on reste dans Blowsome) ─────────── */}
      {showPublish && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', background: '#07070c' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 20px', borderBottom: `1px solid ${HAIR}`, background: 'rgba(10,7,16,0.9)', backdropFilter: 'blur(14px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BlowBadge tone="accent">✦ Publier</BlowBadge>
              <span style={{ fontSize: 13, color: MUTED }}>Posting ScaleFlow — tu restes sur <Grad style={{ fontWeight: 800 }}>Blowsome</Grad></span>
            </div>
            <button
              onClick={() => setShowPublish(false)}
              className="blow-tap"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 15px', borderRadius: 11, cursor: 'pointer', color: INK, fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: `1px solid ${HAIR}` }}
            >
              <Ico d={ICON.back} size={15} /> Retour
            </button>
          </div>
          <div className="blow-scroll" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: '100%', color: MUTED }}>Chargement…</div>}>
              <Publish user={user} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  )
}

const FAINTish = 'rgba(236,233,245,0.5)'

export default BlowsomeApp
