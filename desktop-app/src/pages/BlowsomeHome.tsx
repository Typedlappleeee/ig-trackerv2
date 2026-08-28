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

      {/* Stats réelles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 22 }}>
        <Stat label="Appareils du parc" value={phoneCount === null ? '…' : fmtNumber(phoneCount)} accent="#A855F7" />
        <Stat label="Vidéos en banque" value={videoCount === null ? '…' : fmtNumber(videoCount)} accent="#EC4899" />
        <Stat label="Statut agence" value={<span style={{ color: GOLD }}>VIP</span>} accent="#E9C46A" />
      </div>

      {/* Sections à venir (honnête) */}
      <Card style={{ padding: 22 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 6 }}>Cockpit Blowsome</div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: MUTED, maxWidth: 560 }}>
          Cette infrastructure VIP est réservée aux comptes qui ont l'accès Blowsome — tu la vois parce que ton compte y a droit. Le parc VIP, le contenu auto et le gestionnaire d'outils seront branchés ici à la prochaine passe.
        </p>
      </Card>
    </div>
  )
}
