import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { fmtNumber } from '@/lib/data'

// Blowsome — accueil VIP. Design porté du design system Blowsome (dégradé rose→
// violet→indigo, or). Données RÉELLES : nb de téléphones + nb de vidéos (Supabase).
// Les pages internes (Parc VIP, Contenu auto, Outils) arrivent à la passe suivante.
const GRAD = 'linear-gradient(100deg,#EC4899,#A855F7,#6366F1)'
const GOLD = '#E9C46A'
const INK = '#ECE9F5'
const MUTED = '#A79FBD'
const SERIF = "'Space Grotesk',sans-serif"

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      borderRadius: 16, background: 'linear-gradient(168deg,#17111F,#120C19)',
      border: '1px solid rgba(216,180,254,0.12)', boxShadow: '0 20px 50px -30px rgba(168,85,247,0.5)',
      ...style,
    }}>{children}</div>
  )
}

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent: string }) {
  return (
    <Card style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden style={{ position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${accent}44, transparent 68%)`, opacity: 0.5 }} />
      <div style={{ position: 'relative', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ position: 'relative', marginTop: 8, fontFamily: SERIF, fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color: INK, lineHeight: 1 }}>{value}</div>
    </Card>
  )
}

export default function BlowsomeHome({ user, org, onNavigate }: { user: User; org: OrgState; onNavigate?: (p: string) => void }) {
  const { currentOrg } = org
  const firstName = (user.email?.split('@')[0] ?? 'VIP').replace(/[._]/g, ' ')
  const [phoneCount, setPhoneCount] = useState<number | null>(null)
  const [videoCount, setVideoCount] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    Promise.all([
      scope(supabase.from('phones').select('id', { count: 'exact', head: true })),
      scope(supabase.from('content_bank').select('id', { count: 'exact', head: true })),
    ]).then(([p, b]: any[]) => {
      if (!alive) return
      setPhoneCount(p.count ?? 0); setVideoCount(b.count ?? 0)
    }).catch(() => { if (alive) { setPhoneCount(0); setVideoCount(0) } })
    return () => { alive = false }
  }, [currentOrg?.id, user.id])

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* Hero */}
      <Card style={{ padding: 28, marginBottom: 22, position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', top: -60, right: -30, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.28), transparent 66%)' }} />
        <span aria-hidden style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}73, transparent)` }} />
        <div style={{ position: 'relative' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'rgba(168,85,247,0.14)', border: '1px solid rgba(168,85,247,0.4)', color: '#D8B4FE', fontSize: 11, fontWeight: 800 }}>✦ Espace Blowsome</span>
          <h1 style={{ margin: '16px 0 0', display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '.28em', fontSize: 'clamp(30px,4vw,44px)', lineHeight: 1, letterSpacing: '-0.035em' }}>
            <span style={{ fontFamily: SERIF, fontWeight: 700, color: INK }}>Bonjour,</span>
            <span style={{ fontFamily: 'Georgia, serif', fontWeight: 400, textTransform: 'capitalize', background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{firstName}</span>
          </h1>
          <p style={{ margin: '14px 0 0', fontSize: 14.5, lineHeight: 1.6, color: MUTED, maxWidth: 520 }}>
            Ton cockpit VIP — pilote tes flottes premium et retrouve toute ta banque, sans quitter Blowsome.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button onClick={() => onNavigate?.('blowContent')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 18px', borderRadius: 11, border: 'none', cursor: 'pointer', background: GRAD, color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 12px 30px -12px rgba(168,85,247,0.8)' }}>Publier maintenant</button>
            <button onClick={() => onNavigate?.('blowParc')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 16px', borderRadius: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.2)', color: '#D8B4FE', fontSize: 13, fontWeight: 700 }}>Voir le parc VIP</button>
          </div>
        </div>
      </Card>

      {/* Stats réelles (cliquables) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 22 }}>
        <button onClick={() => onNavigate?.('blowParc')} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <Stat label="Appareils du parc" value={phoneCount === null ? '…' : fmtNumber(phoneCount)} accent="#A855F7" />
        </button>
        <button onClick={() => onNavigate?.('bank')} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <Stat label="Vidéos en banque" value={videoCount === null ? '…' : fmtNumber(videoCount)} accent="#EC4899" />
        </button>
        <Stat label="Statut agence" value={<span style={{ color: GOLD }}>VIP</span>} accent="#E9C46A" />
      </div>

      {/* Accès rapide — tout cliquable */}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 12 }}>Accès rapide</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
        {[
          { t: 'Posting', d: 'Publie sur tes comptes (Reels, Story, cross-post).', go: 'publish', i: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z' },
          { t: 'Auto-contenu', d: 'Génération de variantes en pilote.', go: 'blowContent', i: 'M13 2 3 14h9l-1 8 10-12h-9z' },
          { t: 'Banque', d: 'Tout ton contenu VIP.', go: 'bank', i: 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z' },
          { t: 'Gestionnaire de tools', d: 'Remix, spoof, sous-titres, mixer.', go: 'blowTools', i: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2-2 2.1-2.1z' },
          { t: 'Phone Farm', d: 'Tes iPhones VIP pilotés à distance.', go: 'blowParc', i: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01' },
          { t: 'Performances', d: 'Vues et engagement de tes comptes.', go: 'insights', i: 'M22 12h-4l-3 9L9 3l-3 9H2' },
        ].map(x => (
          <button key={x.t} onClick={() => onNavigate?.(x.go)} style={{ textAlign: 'left', cursor: 'pointer', padding: 18, borderRadius: 16, background: 'linear-gradient(168deg,#17111F,#120C19)', border: '1px solid rgba(216,180,254,0.12)', boxShadow: '0 20px 50px -30px rgba(168,85,247,0.5)', transition: 'border-color .16s ease' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(216,180,254,0.12)' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.28)', color: '#D8B4FE', marginBottom: 11 }}>
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{x.i.split('|').map((d, k) => <path key={k} d={d} />)}</svg>
            </span>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 4 }}>{x.t}</div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: MUTED }}>{x.d}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
