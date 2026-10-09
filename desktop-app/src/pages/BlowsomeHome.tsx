import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { fmtNumber } from '@/lib/data'

// Blowsome — accueil VIP. Style « SaaS épuré » : surfaces plates, accent mauve
// (et or pour le statut VIP) utilisé avec parcimonie. Données RÉELLES : nb de téléphones + nb de vidéos (Supabase).
// Les pages internes (Parc VIP, Contenu auto, Outils) arrivent à la passe suivante.
const ACCENT = '#D8B4FE'
const GOLD = '#E9C46A'
const INK = '#EDEDEF'
const MUTED = '#8B8B94'
const EDGE = 'rgba(255,255,255,0.07)'

function Card({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={className} style={{
      borderRadius: 8, background: '#111113', border: `1px solid ${EDGE}`,
      ...style,
    }}>{children}</div>
  )
}

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent: string }) {
  void accent
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: MUTED }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: INK, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </Card>
  )
}

const hoverOn = (e: { currentTarget: HTMLElement }) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.background = '#141416' }
const hoverOff = (e: { currentTarget: HTMLElement }) => { e.currentTarget.style.borderColor = EDGE; e.currentTarget.style.background = '#111113' }

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
      <Card style={{ padding: 24, marginBottom: 20 }}>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 5, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: ACCENT, fontSize: 11.5, fontWeight: 500 }}>✦ Espace Blowsome</span>
          <h1 style={{ margin: '14px 0 0', display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '.28em', fontSize: 24, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
            <span style={{ color: INK }}>Bonjour,</span>
            <span style={{ textTransform: 'capitalize', color: ACCENT }}>{firstName}</span>
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: '#A1A1AA', maxWidth: 520 }}>
            Ton cockpit VIP — pilote tes flottes premium et retrouve toute ta banque, sans quitter Blowsome.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            <button onClick={() => onNavigate?.('blowContent')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 6, border: '1px solid #EDEDEF', cursor: 'pointer', background: '#EDEDEF', color: '#0A0A0B', fontSize: 13, fontWeight: 500 }}>Publier maintenant</button>
            <button onClick={() => onNavigate?.('blowParc')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 6, cursor: 'pointer', background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#E4E4E7', fontSize: 13, fontWeight: 500 }}>Voir le parc VIP</button>
          </div>
        </div>
      </Card>

      {/* Stats réelles (cliquables) */}
      <div className="blow-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        <button onClick={() => onNavigate?.('blowParc')} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <Stat label="Appareils du parc" value={phoneCount === null ? '…' : fmtNumber(phoneCount)} accent="#A855F7" />
        </button>
        <button onClick={() => onNavigate?.('bank')} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <Stat label="Vidéos en banque" value={videoCount === null ? '…' : fmtNumber(videoCount)} accent="#EC4899" />
        </button>
        <Stat label="Statut agence" value={<span style={{ color: GOLD }}>VIP</span>} accent="#E9C46A" />
      </div>

      {/* Accès rapide — tout cliquable */}
      <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 10 }}>Accès rapide</div>
      <div className="blow-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
        {[
          { t: 'Posting', d: 'Publie sur tes comptes (Reels, Story, cross-post).', go: 'publish', i: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z' },
          { t: 'Auto-contenu', d: 'Génération de variantes en pilote.', go: 'blowContent', i: 'M13 2 3 14h9l-1 8 10-12h-9z' },
          { t: 'Banque', d: 'Tout ton contenu VIP.', go: 'bank', i: 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z' },
          { t: 'Gestionnaire de tools', d: 'Remix, spoof, sous-titres, mixer.', go: 'blowTools', i: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2-2 2.1-2.1z' },
          { t: 'Phone Farm', d: 'Tes iPhones VIP pilotés à distance.', go: 'blowParc', i: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01' },
          { t: 'Performances', d: 'Vues et engagement de tes comptes.', go: 'insights', i: 'M22 12h-4l-3 9L9 3l-3 9H2' },
        ].map(x => (
          <button key={x.t} onClick={() => onNavigate?.(x.go)} onMouseEnter={hoverOn} onMouseLeave={hoverOff} style={{ textAlign: 'left', cursor: 'pointer', padding: 16, borderRadius: 8, background: '#111113', border: `1px solid ${EDGE}`, transition: 'background .12s ease, border-color .12s ease' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: ACCENT, marginBottom: 12 }}>
              <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{x.i.split('|').map((d, k) => <path key={k} d={d} />)}</svg>
            </span>
            <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 4 }}>{x.t}</div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: MUTED }}>{x.d}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
