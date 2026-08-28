import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Chip, Icon, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'

// Studio vidéo : hub des outils (gratuits). Les wizards par outil (remix/spoof/
// sous-titres/mixer, avec vidéos sources de la banque) arrivent à la phase actions.
interface Tool { k: string; t: string; d: string; tone: string; tag: string; i: string }
const TOOLS: Tool[] = [
  { k: 'remix', t: 'Remix', d: 'Une vidéo devient des dizaines de variantes uniques : luminosité, zoom, vitesse, recadrage.', tone: '139,92,246', tag: '×24 variantes', i: 'M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6' },
  { k: 'spoof', t: 'Spoof', d: "Réécrit device, GPS et EXIF, micro-varie l'image. Invisible aux filtres de doublons.", tone: '167,139,250', tag: 'anti-détection', i: 'M12 22s8-4.5 8-11a8 8 0 1 0-16 0c0 6.5 8 11 8 11z|M9 12l2 2 4-4' },
  { k: 'subs', t: 'Sous-titres', d: 'Transcription IA et incrustation stylée, mot par mot.', tone: '6,182,212', tag: 'Whisper', i: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z|M7 9h10|M7 13h6' },
  { k: 'mixer', t: 'Mixer', d: 'Incruste un hook accrocheur sur la vidéo, rendu côté serveur.', tone: '236,72,153', tag: 'overlay', i: 'M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M1 14h6|M9 8h6|M17 16h6' },
]

export default function Studio({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const [, setTool] = useState<string | null>(null)
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Studio vidéo" sub="Une vidéo source, quatre outils, des dizaines de variantes uniques. Tout est gratuit — aucun crédit consommé." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
        {TOOLS.map(t => (
          <button key={t.k} onClick={() => setTool(t.k)} style={{
            display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 10, background: '#101015', textAlign: 'left',
            border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all .18s ease', boxSizing: 'border-box',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `rgba(${t.tone},0.4)`; e.currentTarget.style.background = '#13131A' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = '#101015' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: `rgba(${t.tone},0.12)`, border: `1px solid rgba(${t.tone},0.24)`, color: `rgb(${t.tone})` }}>
                <Icon d={t.i} size={16} />
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#F4F4F6' }}>{t.t}</span>
              <span style={{ marginLeft: 'auto' }}><Chip text={t.tag} tone="mute" /></span>
            </span>
            <span style={{ fontSize: 12, lineHeight: 1.6, color: '#71717A' }}>{t.d}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
