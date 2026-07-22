// Blowsome — Gestionnaire de tool (placeholder stylé, contenu à venir).
import { useBlowCSS, Grad, Ico, ICON, GRAD, MUTED, INK, HAIR, BlowCard, BlowPageHeader, BlowBadge } from '../ui'

export function BlowTools() {
  useBlowCSS()
  return (
    <div>
      <BlowPageHeader title="Gestionnaire de tool" subtitle="Centralise et pilote tous tes outils au même endroit" />
      <BlowCard style={{ padding: 0, overflow: 'hidden', position: 'relative', animation: 'blow-rise .5s cubic-bezier(.16,1,.3,1) both' }}>
        <div aria-hidden style={{ position: 'absolute', top: -60, left: '30%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.2), transparent 66%)', animation: 'blow-glow 6s ease-in-out infinite' }} />
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '72px 24px', gap: 16 }}>
          <span style={{ width: 76, height: 76, borderRadius: 22, display: 'grid', placeItems: 'center', color: '#fff', background: GRAD, boxShadow: '0 18px 40px -16px rgba(168,85,247,0.85)', animation: 'blow-float 6s ease-in-out infinite' }}>
            <Ico d={ICON.wrench} size={34} sw={1.6} />
          </span>
          <BlowBadge tone="accent">✦ En préparation</BlowBadge>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.03em', color: INK }}>
            Un <Grad>hub d'outils</Grad> sur-mesure
          </h2>
          <p style={{ margin: 0, maxWidth: 440, fontSize: 14, lineHeight: 1.6, color: MUTED }}>
            Bientôt : active, configure et surveille tes outils Blowsome depuis un seul tableau de bord. On construit quelque chose de grand.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['Spoof', 'Remix', 'Sous-titres', 'Warmup', 'Automations'].map(x => (
              <span key={x} style={{ fontSize: 12, fontWeight: 600, color: MUTED, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIR}` }}>{x}</span>
            ))}
          </div>
        </div>
      </BlowCard>
    </div>
  )
}

export default BlowTools
