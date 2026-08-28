import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Chip, Icon, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import ReelsComposer from './ReelsComposer'
import StoryComposer from './StoryComposer'
import CrossComposer from './CrossComposer'

// Hub de publication : choix du format. Le contenu et les comptes se règlent à
// l'étape suivante (wizards Reels/Story — branchés à la phase actions).
interface Format { id: string; t: string; d: string; cost: string; tone: string; ready: boolean; icon: string }
const FORMATS: Format[] = [
  { id: 'reels', t: 'Reels', d: 'Une vidéo sur des dizaines de comptes Instagram ou TikTok, en parallèle.', cost: '2 crédits / compte', tone: '139,92,246', ready: true, icon: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z' },
  { id: 'story', t: 'Story', d: 'Une image et un sticker lien propre à chaque compte.', cost: '1 crédit / compte', tone: '6,182,212', ready: true, icon: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1' },
  { id: 'photo', t: 'Photo', d: 'Une photo dans le feed sur tous tes comptes.', cost: 'bientôt', tone: '113,113,122', ready: false, icon: 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21' },
  { id: 'cross', t: 'Cross-posting', d: 'Facebook, Shorts, X, Threads, Reddit et Pinterest en une fois.', cost: '2 crédits / compte', tone: '99,102,241', ready: true, icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z' },
]

export default function Publish({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const [mode, setMode] = useState<string | null>(null)

  if (mode === 'reels') return <ReelsComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} />
  if (mode === 'story') return <StoryComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} />
  if (mode === 'cross') return <CrossComposer theme={theme} user={user} org={org} onBack={() => setMode(null)} />

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Publication" sub="Choisis un format. Les comptes et le contenu se règlent à l'étape suivante." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
        {FORMATS.map(f => (
          <button key={f.id} disabled={!f.ready} onClick={f.id === 'reels' ? () => setMode('reels') : f.id === 'story' ? () => setMode('story') : f.id === 'cross' ? () => setMode('cross') : undefined} style={{
            display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 10, background: '#101015',
            border: '1px solid rgba(255,255,255,0.06)', cursor: f.ready ? 'pointer' : 'not-allowed', opacity: f.ready ? 1 : 0.5,
            textAlign: 'left', transition: 'all .18s ease', boxSizing: 'border-box',
          }}
            onMouseEnter={e => { if (!f.ready) return; e.currentTarget.style.borderColor = `rgba(${f.tone},0.4)`; e.currentTarget.style.background = '#13131A' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = '#101015' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: `rgba(${f.tone},0.12)`, border: `1px solid rgba(${f.tone},0.24)`, color: `rgb(${f.tone})` }}>
                <Icon d={f.icon} size={16} />
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#F4F4F6' }}>{f.t}</span>
              <span style={{ marginLeft: 'auto' }}><Chip text={f.ready ? f.cost : 'Bientôt'} tone="mute" /></span>
            </span>
            <span style={{ fontSize: 12, lineHeight: 1.6, color: '#71717A' }}>{f.d}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
