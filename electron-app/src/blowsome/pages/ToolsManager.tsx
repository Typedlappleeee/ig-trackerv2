// Blowsome — Gestionnaire de tool : hub des outils VIP. Ouvre chaque outil en place.
import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { OverlayComposer } from '@/pages/OverlayComposer'
import { useBlowCSS, Grad, Ico, GRAD, MUTED, INK, HAIR, BlowCard, BlowPageHeader, BlowBadge } from '../ui'

type Tool = 'overlay'

const TOOLS: { id: Tool; title: string; desc: string; emoji: string }[] = [
  { id: 'overlay', title: 'Incrustation photo/vidéo', desc: 'Mets une vidéo, choisis une photo et place-la où tu veux, pendant la durée que tu veux.', emoji: '🖼' },
]

export function BlowTools({ user }: { user: User }) {
  useBlowCSS()
  const [tool, setTool] = useState<Tool | null>(null)

  if (tool === 'overlay') {
    return (
      <div style={{ height: '100%' }}>
        <OverlayComposer user={user} onExit={() => setTool(null)} />
      </div>
    )
  }

  return (
    <div className="blow-scroll" style={{ height: '100%', overflowY: 'auto', padding: '30px 30px 80px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <BlowPageHeader title="Gestionnaire de tool" subtitle="Tes outils VIP, au même endroit" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {TOOLS.map((t, i) => (
            <BlowCard
              key={t.id}
              hover
              onClick={() => setTool(t.id)}
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

          {/* Placeholder "à venir" pour les futurs outils */}
          <BlowCard style={{ padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, borderStyle: 'dashed' }}>
            <BlowBadge tone="muted">Bientôt</BlowBadge>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: INK }}>D'autres outils arrivent</p>
            <p style={{ margin: 0, fontSize: 12.5, color: MUTED, borderTop: `1px solid ${HAIR}`, paddingTop: 8, marginTop: 4 }}>Spoof, sous-titres, remix… regroupés ici.</p>
          </BlowCard>
        </div>
      </div>
    </div>
  )
}

export default BlowTools
