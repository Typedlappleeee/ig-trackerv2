import { lazy, Suspense, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Chip, Icon, PageHead, Skeleton, SkeletonRows } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
// Chaque composer n'est chargé qu'à l'ouverture de son format.
const ReelsComposer = lazy(() => import('./ReelsComposer'))
const StoryComposer = lazy(() => import('./StoryComposer'))
const CrossComposer = lazy(() => import('./CrossComposer'))
const PhotoComposer = lazy(() => import('./PhotoComposer'))
// Chargement d'un composer : squelette (titre + panneau) au lieu d'un spinner.
const Wait = () => (
  <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <Skeleton w={200} h={20} r={5} />
    <Skeleton w={320} h={12} style={{ marginBottom: 12 }} />
    <div style={{ borderRadius: 8, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}><SkeletonRows rows={4} /></div>
  </div>
)

// Hub de publication : choix du format, rangé PAR PLATEFORME (Instagram / TikTok /
// autres réseaux) pour qu'on ne se trompe jamais de réseau. Les comptes et le contenu
// se règlent à l'étape suivante.
type Plat = 'instagram' | 'tiktok' | 'other'
interface Format { id: string; plat: Plat; t: string; d: string; cost: string; ready: boolean; icon: string }
const FORMATS: Format[] = [
  { id: 'reels', plat: 'instagram', t: 'Reels', d: 'Une vidéo sur des dizaines de comptes Instagram, en parallèle.', cost: '2 crédits / compte', ready: true, icon: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z' },
  { id: 'story', plat: 'instagram', t: 'Story', d: 'Une image et un sticker lien propre à chaque compte.', cost: '1 crédit / compte', ready: true, icon: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1' },
  { id: 'photo', plat: 'instagram', t: 'Photo', d: 'Une photo (ou carrousel) + description dans le feed, sur tes comptes.', cost: '2 crédits / compte', ready: true, icon: 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21' },
  { id: 'tiktok', plat: 'tiktok', t: 'Vidéo TikTok', d: 'Une vidéo sur des dizaines de comptes TikTok, en parallèle.', cost: '2 crédits / compte', ready: true, icon: 'M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5' },
  { id: 'cross', plat: 'other', t: 'Cross-posting', d: 'Facebook, Shorts, X, Threads, Reddit et Pinterest en une fois.', cost: '2 crédits / compte', ready: true, icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z' },
]
const PLATS: { k: Plat; label: string; sub: string; color: string; icon: string }[] = [
  { k: 'instagram', label: 'Instagram', sub: 'Reels, Stories et posts photo sur tes comptes Instagram.', color: '#E1306C', icon: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z|M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4z|M17.5 6.5h.01' },
  { k: 'tiktok', label: 'TikTok', sub: 'Vidéos sur tes comptes TikTok (les téléphones doivent être connectés à TikTok).', color: '#25F4EE', icon: 'M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5' },
  { k: 'other', label: 'Autres réseaux', sub: 'Facebook, YouTube Shorts, X, Threads, Reddit, Pinterest.', color: '#A1A1AA', icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z' },
]

export default function Publish({ theme, infra, user, org, isSuperAdmin }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; isSuperAdmin: boolean
}) {
  const [mode, setMode] = useState<string | null>(null)
  // Cross-posting réservé au superadmin (pas à tout le monde — chaque owner d'orga
  // ne doit PAS y avoir accès automatiquement).
  const isAdmin = isSuperAdmin

  if (mode === 'reels') return <Suspense fallback={<Wait />}><ReelsComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense>
  if (mode === 'tiktok') return <Suspense fallback={<Wait />}><ReelsComposer key="tiktok" platform="tiktok" theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense>
  if (mode === 'story') return <Suspense fallback={<Wait />}><StoryComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense>
  if (mode === 'photo' && isAdmin) return <Suspense fallback={<Wait />}><PhotoComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense>
  if (mode === 'cross' && isAdmin) return <Suspense fallback={<Wait />}><CrossComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense>

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Publication" sub="Choisis un format. Les comptes et le contenu se règlent à l'étape suivante." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {PLATS.map(pl => (
          <section key={pl.k}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: pl.color, flexShrink: 0 }} />
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}>{pl.label}</span>
                <span style={{ fontSize: 12, color: '#71717A' }}>{pl.sub}</span>
              </span>
            </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(260px,100%),1fr))', gap: 12 }}>
        {FORMATS.filter(f => f.plat === pl.k).map(f => {
          const adminOnly = (f.id === 'cross' || f.id === 'photo') && !isAdmin
          const locked = !f.ready || adminOnly
          return (
          <button key={f.id} disabled={locked} onClick={locked ? undefined : f.id === 'reels' ? () => setMode('reels') : f.id === 'tiktok' ? () => setMode('tiktok') : f.id === 'story' ? () => setMode('story') : f.id === 'photo' ? () => setMode('photo') : f.id === 'cross' ? () => setMode('cross') : undefined} style={{
            display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 8, background: '#111113',
            border: '1px solid rgba(255,255,255,0.07)', cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.5 : 1,
            textAlign: 'left', transition: 'background .12s ease, border-color .12s ease', boxSizing: 'border-box', fontFamily: 'inherit',
          }}
            onMouseEnter={e => { if (locked) return; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.background = '#161618' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = '#111113' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, flexShrink: 0, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: theme.accentText }}>
                <Icon d={f.icon} size={15} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.t}</span>
            </span>
            <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.55, color: '#8B8B94' }}>{adminOnly ? 'Réservé au superadmin.' : f.d}</span>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Chip text={adminOnly ? 'Admin' : f.ready ? f.cost : 'Bientôt'} tone={adminOnly ? 'violet' : 'mute'} />
              {!locked && <span style={{ display: 'flex', color: '#71717A' }}><Icon d="M5 12h14|M13 6l6 6-6 6" size={14} /></span>}
            </span>
          </button>
          )
        })}
      </div>
          </section>
        ))}
      </div>
    </div>
  )
}
