import { lazy, Suspense, useState } from 'react'
import { usePhotos, pickerFor, ToolCard, SectionHead } from '@/pages/Explore'
import { TOOLS } from '@/lib/tools'
import { PageHeader, UnderlineTabs } from '@/components/Kit'
import { SPOT_KEYFRAMES } from '@/components/LaunchSpotlight'
import { takeOpenArg, openTool } from '@/lib/openTool'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Icon, Skeleton, SkeletonRows, useNarrow } from '@/lib/ui'
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
    <div style={{ borderRadius: 18, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}><SkeletonRows rows={4} /></div>
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
  { id: 'cross', plat: 'other', t: 'Cross-posting', d: 'Facebook, Shorts, X, Threads, Reddit et Pinterest en une fois.', cost: '2 crédits / compte / réseau', ready: true, icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z' },
]
const PLATS: { k: Plat; label: string; sub: string; color: string; icon: string }[] = [
  { k: 'instagram', label: 'Instagram', sub: 'Reels, Stories et posts photo sur tes comptes Instagram.', color: '#E1306C', icon: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z|M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4z|M17.5 6.5h.01' },
  { k: 'tiktok', label: 'TikTok', sub: 'Vidéos sur tes comptes TikTok (les téléphones doivent être connectés à TikTok).', color: '#25F4EE', icon: 'M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5' },
  { k: 'other', label: 'Autres réseaux', sub: 'Facebook, YouTube Shorts, X, Threads, Reddit, Pinterest.', color: '#A1A1AA', icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z' },
]
const SCHED_ICON = 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 6v6l4 2'

export default function Publish({ theme, infra, user, org, isSuperAdmin, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; isSuperAdmin: boolean; onNavigate?: (p: string) => void
}) {
  // Relance des échecs (depuis Activité) : on ouvre directement le bon composer.
  const [mode, setMode] = useState<string | null>(() => (takeOpenArg<{ mode?: string }>('publish')?.mode) ?? peekRelaunch()?.kind ?? null)
  // Cross-posting / Photo réservés au superadmin (masqués pour les autres).
  const isAdmin = isSuperAdmin
  const visible = (f: { id: string }) => isAdmin || (f.id !== 'cross' && f.id !== 'photo')
  const photos = usePhotos(user, org)
  const narrow = useNarrow(760)
  void infra
  const tool = (id: string) => TOOLS.find(t => t.id === id)!
  const top = () => { try { document.querySelector('main')?.scrollTo?.({ top: 0 }) } catch { /* ignore */ } }
  const open = (id: string) => { setMode(id); top() }

  // Un format ouvert : onglets soulignés en haut (format actif visible, retour en 1 clic).
  const tabs = (k: string) => <UnderlineTabs back={{ label: 'Publication', onClick: () => { setMode(null); top() } }} value={k} onChange={open}
    items={FORMATS.filter(visible).map(f => ({ k: f.id, l: f.t, icon: f.icon }))} />
  if (mode === 'reels') return <>{tabs('reels')}<Suspense fallback={<Wait />}><ReelsComposer key="reels" theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense></>
  if (mode === 'tiktok') return <>{tabs('tiktok')}<Suspense fallback={<Wait />}><ReelsComposer key="tiktok" platform="tiktok" theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense></>
  if (mode === 'story') return <>{tabs('story')}<Suspense fallback={<Wait />}><StoryComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense></>
  if (mode === 'photo' && isAdmin) return <>{tabs('photo')}<Suspense fallback={<Wait />}><PhotoComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense></>
  if (mode === 'cross' && isAdmin) return <>{tabs('cross')}<Suspense fallback={<Wait />}><CrossComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} /></Suspense></>

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{SPOT_KEYFRAMES}</style>
      <PageHeader kicker="Diffusion" title="Publication" sub="Choisis un format : les comptes, la vidéo et la légende se règlent à l’étape suivante. Chaque téléphone publie en parallèle, ou plus tard (programmé)." />
      {/* Catégories par plateforme (tous les formats), puis la programmation */}
      {(() => {
        const head = (label: string, color: string, icon: string, count: number, sub: string) => (
          <SectionHead title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 9, background: `${color}1F`, border: `1px solid ${color}55`, color }}><Icon d={icon} size={14} /></span>{label}</span>} count={count}
            right={narrow ? undefined : <span style={{ fontSize: 12.5, color: '#71717A', maxWidth: 420, textAlign: 'right' }}>{sub}</span>} />
        )
        const grid = (cards: React.ReactNode) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${narrow ? 200 : 260}px, 100%), 1fr))`, gap: narrow ? '22px 12px' : '28px 18px' }}>{cards}</div>
        let n = 0
        const sched = onNavigate ? ['scheduled', 'calendar'].map(tool) : []
        return <>
          {PLATS.filter(pl => FORMATS.some(f => f.plat === pl.k && visible(f))).map(pl => {
            const list = FORMATS.filter(f => f.plat === pl.k && visible(f))
            return (
              <section key={pl.k} style={{ marginBottom: 40 }}>
                {head(pl.label, pl.color, pl.icon, list.length, pl.sub)}
                {grid(list.map(f => { const t = tool(f.id); const k = n++; return <ToolCard key={f.id} t={{ ...t, desc: f.d, cost: f.cost }} i={k} pick={pickerFor(t, k, photos)} fav={false} onOpen={() => open(f.id)} /> }))}
              </section>
            )
          })}
          {sched.length > 0 && (
            <section style={{ marginBottom: 40 }}>
              {head('Programmation', '#A78BFA', SCHED_ICON, sched.length, 'Tout ce qui part plus tard, même PC éteint.')}
              {grid(sched.map(t => { const k = n++; return <ToolCard key={t.id} t={t} i={k} pick={pickerFor(t, k, photos)} fav={false} onOpen={() => openTool(onNavigate!, t.page, t.arg, t.id)} /> }))}
            </section>
          )}
        </>
      })()}
    </div>
  )
}
