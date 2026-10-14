// Studio vidéo : accueil (Remix en vedette, tous les outils de création issus de lib/tools.ts)
// + espace de travail par outil (components/studio/Workspace). Tout tourne sur l'ordinateur
// (ffmpeg.wasm), aucun crédit. Les résultats de la session restent quand on change d'outil.
import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { takeOpenArg, openTool } from '@/lib/openTool'
import { TOOLS } from '@/lib/tools'
import { useNarrow } from '@/lib/ui'
import { usePhotos, pickerFor, ToolCard, ToolTile, SectionHead } from '@/pages/Explore'
import { SPOT_KEYFRAMES } from '@/components/LaunchSpotlight'
import { PageHeader, UnderlineTabs } from '@/components/Kit'
import { Workspace } from '@/components/studio/Workspace'
import { Results, type StudioResult } from '@/components/studio/Results'
import type { StudioToolId } from '@/components/studio/Preview'

// Outils du Studio (ordre d'affichage) — libellés, icônes et couleurs viennent de lib/tools.ts.
const IDS: StudioToolId[] = ['remix', 'spoof', 'mixer', 'subs', 'overlay', 'montage', 'imgspoof']
const STUDIO = IDS.map(id => TOOLS.find(t => t.id === id)!).filter(Boolean)
const isStudioTool = (k: unknown): k is StudioToolId => typeof k === 'string' && (IDS as string[]).includes(k)

export default function Studio({ theme, user, org, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; onNavigate?: (p: string) => void
}) {
  const narrow = useNarrow(760)
  const photos = usePhotos(user, org)
  const [openArg] = useState(() => takeOpenArg<{ tool?: string; ids?: string[] }>('studio'))
  const [tool, setTool] = useState<StudioToolId | null>(() => isStudioTool(openArg?.tool) ? openArg!.tool as StudioToolId : null)
  const [results, setResults] = useState<StudioResult[]>([])
  // Les fichiers générés restent jusqu'à la sortie du Studio ; on libère alors la mémoire.
  const live = useRef(results); live.current = results
  useEffect(() => () => { live.current.forEach(r => URL.revokeObjectURL(r.url)) }, [])
  const top = () => { try { document.querySelector('main')?.scrollTo?.({ top: 0 }) } catch { /* ignore */ } }
  const go = (k: StudioToolId) => { setTool(k); top() }

  if (!tool) {
    const extras = TOOLS.filter(t => t.id === 'autocontent')
    return (
      <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
        <style>{SPOT_KEYFRAMES}</style>
        <PageHeader kicker={`${STUDIO.length} outils · gratuits`} title="Studio vidéo" sub="Rends chaque vidéo unique, ajoute du texte, une photo, des sous-titres, coupe et assemble. Tout tourne sur ton ordinateur, aucun crédit." />
        <section style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1.9fr) minmax(0,1fr)', gridTemplateRows: narrow ? undefined : '210px 210px', gap: narrow ? 12 : 16, marginBottom: 40 }}>
          {(['remix', 'mixer', 'subs'] as StudioToolId[]).map((id, j) => {
            const t = STUDIO.find(x => x.id === id)!
            return (
              <ToolTile key={id} t={t} i={j} pick={pickerFor(t, j * 4 + 1, photos)} size={j === 0 ? 'xl' : 'md'}
                kicker={j === 0 ? 'Le plus utilisé' : undefined}
                title={j === 0 ? 'Une vidéo, 24 variantes uniques' : undefined}
                text={j === 0 ? 'Couleurs, recadrage, vitesse, miroir : chaque compte publie une version différente. Métadonnées effacées, appareil et GPS réécrits.' : undefined}
                cta={j === 0 ? 'Ouvrir le Remix' : undefined} onOpen={() => go(id)}
                style={j === 0 ? (narrow ? { height: 340 } : { gridRow: 'span 2' }) : (narrow ? { height: 220 } : undefined)} />
            )
          })}
        </section>
        <SectionHead title="Tous les outils" count={STUDIO.length + (onNavigate ? extras.length : 0)} />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${narrow ? 200 : 250}px, 100%), 1fr))`, gap: narrow ? '22px 12px' : '28px 18px' }}>
          {STUDIO.map((t, i) => <ToolCard key={t.id} t={t} i={i} pick={pickerFor(t, i, photos)} fav={false} onOpen={() => go(t.id as StudioToolId)} />)}
          {onNavigate && extras.map((t, i) => <ToolCard key={t.id} t={t} i={STUDIO.length + i} pick={pickerFor(t, STUDIO.length + i, photos)} fav={false} onOpen={() => openTool(onNavigate, t.page, t.arg, t.id)} />)}
        </div>
        <Results results={results} onClear={() => { results.forEach(r => URL.revokeObjectURL(r.url)); setResults([]) }}
          onBank={onNavigate ? () => openTool(onNavigate, 'bank', { tab: 'video' }) : undefined} onPublish={onNavigate ? () => openTool(onNavigate, 'publish', { mode: 'reels' }) : undefined} />
      </div>
    )
  }

  const T = STUDIO.find(t => t.id === tool)!
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <UnderlineTabs back={{ label: 'Studio', onClick: () => { setTool(null); top() } }} items={STUDIO.map(t => ({ k: t.id as StudioToolId, l: t.label, icon: t.icon }))} value={tool} onChange={go} />
      <Workspace key="ws" theme={theme} user={user} org={org} tool={tool} label={T.label} desc={T.desc} icon={T.icon} a={T.a} b={T.b}
        onNavigate={onNavigate} initialIds={openArg?.ids} addResult={r => setResults(rs => [r, ...rs])} />
      <Results results={results} onClear={() => { results.forEach(r => URL.revokeObjectURL(r.url)); setResults([]) }}
        onBank={onNavigate ? () => openTool(onNavigate, 'bank', { tab: tool === 'imgspoof' ? 'image' : 'video' }) : undefined}
        onPublish={onNavigate ? () => openTool(onNavigate, 'publish', { mode: 'reels' }) : undefined} />
    </div>
  )
}
