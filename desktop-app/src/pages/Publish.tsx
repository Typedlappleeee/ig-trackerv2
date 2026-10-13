import { lazy, Suspense, useState } from 'react'
import { BigCard, ToolTabs } from '@/components/BigCard'
import { HomeHero } from '@/components/CineHero'
import { usePhotos } from '@/pages/Explore'
import { takeOpenArg } from '@/lib/openTool'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Icon, Skeleton, SkeletonRows } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { peekRelaunch } from '@/lib/runHistory'
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
  // Relance des échecs (depuis Activité) : on ouvre directement le bon composer.
  const [mode, setMode] = useState<string | null>(() => (takeOpenArg<{ mode?: string }>('publish')?.mode) ?? peekRelaunch()?.kind ?? null)
  // Cross-posting réservé au superadmin (pas à tout le monde — chaque owner d'orga
  // ne doit PAS y avoir accès automatiquement).
  const isAdmin = isSuperAdmin
  // Formats réservés au superadmin : masqués (au lieu d'une carte grisée) pour les autres.
  const visible = (f: { id: string }) => isAdmin || (f.id !== 'cross' && f.id !== 'photo')
  const photos = usePhotos(user, org)

  const FORMAT_TABS = FORMATS.filter(visible).map(f => ({ k: f.id, t: f.t, i: f.icon }))
  // Un format ouvert : barre des formats en haut (le format actif bien visible, 1 clic pour changer).
  const tabs = (k: string) => <ToolTabs backLabel="Publication" onBack={() => setMode(null)} items={FORMAT_TABS} current={k} onPick={setMode} />
  if (mode === 'reels') return <>{tabs('reels')}<Suspense fallback={<Wait />}><ReelsComposer key="reels" theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense></>
  if (mode === 'tiktok') return <>{tabs('tiktok')}<Suspense fallback={<Wait />}><ReelsComposer key="tiktok" platform="tiktok" theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense></>
  if (mode === 'story') return <>{tabs('story')}<Suspense fallback={<Wait />}><StoryComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense></>
  if (mode === 'photo' && isAdmin) return <>{tabs('photo')}<Suspense fallback={<Wait />}><PhotoComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense></>
  if (mode === 'cross' && isAdmin) return <>{tabs('cross')}<Suspense fallback={<Wait />}><CrossComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense></>

  const pool = [...photos.viral, ...photos.bank]
  let n = 0
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <HomeHero photos={photos.viral} kicker="Publication" line1="Publie partout" line2="en un clic"
        sub="Choisis un format : les comptes, la vidéo et la légende se règlent à l’étape suivante. Chaque téléphone publie en parallèle."
        stats={[{ v: '2 cr', l: 'par Reel / compte' }, { v: '1 cr', l: 'par Story / compte' }, { v: '24/7', l: 'programmable' }]}
        cta="Publier un Reel" onCta={() => setMode('reels')} secondary="Publier une Story" onSecondary={() => setMode('story')} />
      {PLATS.filter(pl => FORMATS.some(f => f.plat === pl.k && visible(f))).map(pl => (
        <section key={pl.k} style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '6px 2px 14px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: `${pl.color}1F`, border: `1px solid ${pl.color}55`, color: pl.color }}><Icon d={pl.icon} size={17} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, textTransform: 'uppercase', color: '#F4F4F5' }}>{pl.label}</span>
                <span style={{ fontSize: 12.5, color: '#8B8B94' }}>{pl.sub}</span>
              </span>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(300px,100%),1fr))', gap: 14 }}>
            {FORMATS.filter(f => f.plat === pl.k && visible(f)).map(f => {
              const k = n++
              return (
                <BigCard key={f.id} i={k} preview={f.id} icon={f.icon} title={f.t} desc={f.d} foot={f.cost} tag={f.id === 'reels' ? 'Populaire' : undefined}
                  onOpen={() => setMode(f.id)} pick={j => pool.length ? pool[(f.id === 'reels' ? j : k * 3 + j + 2) % pool.length] : null} />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
