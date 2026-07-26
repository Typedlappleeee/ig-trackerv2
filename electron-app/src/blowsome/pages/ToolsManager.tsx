// Blowsome — Gestionnaire de tool : hub des outils VIP. Tous les outils vidéo du
// Studio (incrustation, remix, spoof, sous-titres, mixer, montage) sont ici,
// directement dans Blowsome (pas besoin du plan Pro/Org). Ouvre chaque outil en place.
import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { OverlayComposer } from '@/pages/OverlayComposer'
import { Remix } from '@/pages/Remix'
import { Spoof } from '@/pages/Spoof'
import { Subtitles } from '@/pages/Subtitles'
import { Mixer } from '@/pages/Mixer'
import { Montage } from '@/pages/Montage'
import { useBlowCSS, Grad, Ico, GRAD, MUTED, INK, BlowCard, BlowPageHeader } from '../ui'

type Tool = 'overlay' | 'remix' | 'spoof' | 'subtitles' | 'mixer' | 'montage'

const TOOLS: { id: Tool; title: string; desc: string; emoji: string }[] = [
  { id: 'overlay',   title: 'Incrustation photo/vidéo', desc: 'Mets une vidéo, choisis une photo et place-la où tu veux, le temps que tu veux.', emoji: '🖼' },
  { id: 'montage',   title: 'Montage',                  desc: 'Assemble et découpe tes vidéos.', emoji: '✂️' },
  { id: 'mixer',     title: 'Mixer',                    desc: 'Ajoute une légende / un montage par-dessus ta vidéo.', emoji: '🎚' },
  { id: 'remix',     title: 'Remix',                    desc: 'Régénère des variantes uniques de tes vidéos.', emoji: '🎞' },
  { id: 'spoof',     title: 'Spoof',                    desc: 'Anti-empreinte : rend chaque vidéo unique pour l\'algo.', emoji: '🛡' },
  { id: 'subtitles', title: 'Sous-titres',              desc: 'Sous-titres automatiques (Groq Whisper).', emoji: '💬' },
]

export function BlowTools({ user }: { user: User }) {
  useBlowCSS()
  const [tool, setTool] = useState<Tool | null>(null)
  const openTool = (id: Tool) => setTool(id)

  // Chaque outil s'ouvre en pleine page, sous une barre « Retour aux outils »
  // (navigation). L'annulation de la TÂCHE en cours (spoof, rendu…) se fait
  // DANS chaque outil, via son propre bouton « Annuler ».
  if (tool) {
    const inner =
      tool === 'overlay'   ? <OverlayComposer user={user} onExit={() => setTool(null)} /> :
      tool === 'remix'     ? <Remix user={user} /> :
      tool === 'spoof'     ? <Spoof user={user} /> :
      tool === 'subtitles' ? <Subtitles user={user} /> :
      tool === 'mixer'     ? <Mixer user={user} /> :
      /* montage */          <Montage user={user} />
    const label = TOOLS.find(t => t.id === tool)?.title ?? ''
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={() => setTool(null)} className="blow-tap" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: '#D8B4FE', fontSize: 13, fontWeight: 700 }} title="Retour au hub d'outils">
            <Ico d="M19 12H5M11 6l-6 6 6 6" size={15} /> Retour aux outils
          </button>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }} className="blow-scroll">{inner}</div>
      </div>
    )
  }

  return (
    <div className="blow-scroll" style={{ height: '100%', overflowY: 'auto', padding: '30px 30px 80px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <BlowPageHeader title="Gestionnaire de tool" subtitle="Tous tes outils vidéo VIP, au même endroit" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {TOOLS.map((t, i) => (
            <BlowCard
              key={t.id}
              hover
              onClick={() => openTool(t.id)}
              style={{ padding: 22, cursor: 'pointer', position: 'relative', overflow: 'hidden', animation: `blow-rise .5s cubic-bezier(.16,1,.3,1) ${i * 0.05}s both` }}
            >
              <div aria-hidden style={{ position: 'absolute', top: -34, right: -24, width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.22), transparent 68%)', opacity: .6 }} />
              <span style={{ position: 'relative', width: 52, height: 52, borderRadius: 15, display: 'grid', placeItems: 'center', fontSize: 24, background: GRAD, boxShadow: '0 12px 26px -12px rgba(168,85,247,0.8)' }}>{t.emoji}</span>
              <h3 style={{ position: 'relative', margin: '14px 0 6px', fontSize: 17, fontWeight: 800, color: INK }}>{t.title}</h3>
              <p style={{ position: 'relative', margin: 0, fontSize: 13, lineHeight: 1.55, color: MUTED }}>{t.desc}</p>
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 12.5, fontWeight: 700 }}>
                <Grad>Ouvrir</Grad> <Ico d="M5 12h14M13 6l6 6-6 6" size={14} />
              </span>
            </BlowCard>
          ))}
        </div>
      </div>
    </div>
  )
}

export default BlowTools
