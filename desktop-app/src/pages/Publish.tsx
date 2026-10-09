import { lazy, Suspense, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Chip, Icon, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
// Chaque composer n'est chargé qu'à l'ouverture de son format.
const ReelsComposer = lazy(() => import('./ReelsComposer'))
const StoryComposer = lazy(() => import('./StoryComposer'))
const CrossComposer = lazy(() => import('./CrossComposer'))
const PhotoComposer = lazy(() => import('./PhotoComposer'))
const Wait = () => <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTopColor: '#A1A1AA', animation: 'aSpin 0.7s linear infinite' }} /></div>

// Hub de publication : choix du format. Le contenu et les comptes se règlent à
// l'étape suivante (wizards Reels/Story — branchés à la phase actions).
interface Format { id: string; t: string; d: string; cost: string; tone: string; ready: boolean; icon: string }
const FORMATS: Format[] = [
  { id: 'reels', t: 'Reels', d: 'Une vidéo sur des dizaines de comptes Instagram ou TikTok, en parallèle.', cost: '2 crédits / compte', tone: '139,92,246', ready: true, icon: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z' },
  { id: 'story', t: 'Story', d: 'Une image et un sticker lien propre à chaque compte.', cost: '1 crédit / compte', tone: '6,182,212', ready: true, icon: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1' },
  { id: 'photo', t: 'Photo', d: 'Une photo (ou carrousel) + description dans le feed, sur tes comptes.', cost: '2 crédits / compte', tone: '236,72,153', ready: true, icon: 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21' },
  { id: 'cross', t: 'Cross-posting', d: 'Facebook, Shorts, X, Threads, Reddit et Pinterest en une fois.', cost: '2 crédits / compte', tone: '99,102,241', ready: true, icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z' },
]

export default function Publish({ theme, infra, user, org, isSuperAdmin }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; isSuperAdmin: boolean
}) {
  const [mode, setMode] = useState<string | null>(null)
  // Cross-posting réservé au superadmin (pas à tout le monde — chaque owner d'orga
  // ne doit PAS y avoir accès automatiquement).
  const isAdmin = isSuperAdmin

  if (mode === 'reels') return <Suspense fallback={<Wait />}><ReelsComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense>
  if (mode === 'story') return <Suspense fallback={<Wait />}><StoryComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense>
  if (mode === 'photo' && isAdmin) return <Suspense fallback={<Wait />}><PhotoComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense>
  if (mode === 'cross' && isAdmin) return <Suspense fallback={<Wait />}><CrossComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense>

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Publication" sub="Choisis un format. Les comptes et le contenu se règlent à l'étape suivante." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {FORMATS.map(f => {
          const adminOnly = (f.id === 'cross' || f.id === 'photo') && !isAdmin
          const locked = !f.ready || adminOnly
          return (
          <button key={f.id} disabled={locked} onClick={locked ? undefined : f.id === 'reels' ? () => setMode('reels') : f.id === 'story' ? () => setMode('story') : f.id === 'photo' ? () => setMode('photo') : f.id === 'cross' ? () => setMode('cross') : undefined} style={{
            display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 8, background: '#111113',
            border: '1px solid rgba(255,255,255,0.07)', cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.5 : 1,
            textAlign: 'left', transition: 'background .12s ease, border-color .12s ease', boxSizing: 'border-box', fontFamily: 'inherit',
          }}
            onMouseEnter={e => { if (locked) return; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.background = '#141416' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = '#111113' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, flexShrink: 0, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: `rgb(${f.tone})` }}>
                <Icon d={f.icon} size={15} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}>{f.t}</span>
              <span style={{ marginLeft: 'auto' }}><Chip text={adminOnly ? 'Admin' : f.ready ? f.cost : 'Bientôt'} tone={adminOnly ? 'violet' : 'mute'} /></span>
            </span>
            <span style={{ fontSize: 12.5, lineHeight: 1.55, color: '#8B8B94' }}>{adminOnly ? 'Réservé au superadmin.' : f.d}</span>
          </button>
          )
        })}
      </div>
    </div>
  )
}
