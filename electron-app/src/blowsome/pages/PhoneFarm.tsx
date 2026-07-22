// Blowsome — Phone Farm / Automatisation (placeholder stylé, contenu à venir).
import { useBlowCSS, Grad, Ico, ICON, GRAD, GOLD, MUTED, INK, HAIR, BlowCard, BlowPageHeader, BlowBadge } from '../ui'

export function BlowPhoneFarm() {
  useBlowCSS()
  return (
    <div>
      <BlowPageHeader title="Phone Farm — Automatisation" subtitle="Pilote ta ferme de téléphones réels et ses automatisations" />
      <BlowCard style={{ padding: 0, overflow: 'hidden', position: 'relative', animation: 'blow-rise .5s cubic-bezier(.16,1,.3,1) both' }}>
        <div aria-hidden style={{ position: 'absolute', top: -60, right: '25%', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.18), transparent 66%)', animation: 'blow-glow 7s ease-in-out infinite' }} />
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '72px 24px', gap: 16 }}>
          <span style={{ width: 76, height: 76, borderRadius: 22, display: 'grid', placeItems: 'center', color: '#fff', background: GRAD, boxShadow: '0 18px 40px -16px rgba(236,72,153,0.85)', animation: 'blow-float 6s ease-in-out infinite' }}>
            <Ico d={ICON.phone} size={32} sw={1.6} />
          </span>
          <BlowBadge tone="gold">✦ Bientôt</BlowBadge>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.03em', color: INK }}>
            Ta <Grad>ferme de téléphones</Grad>, automatisée
          </h2>
          <p style={{ margin: 0, maxWidth: 460, fontSize: 14, lineHeight: 1.6, color: MUTED }}>
            Bientôt : connecte tes téléphones physiques, orchestre les publications à distance et laisse les automatisations tourner 24/7 — le tout piloté depuis Blowsome.
          </p>
          <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[['0', 'Téléphones'], ['0', 'Automations'], ['24/7', 'Uptime cible']].map(([v, l]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: '-.03em' }}><span style={{ color: v === '24/7' ? GOLD : INK }}>{v}</span></p>
                <p style={{ margin: '2px 0 0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED }}>{l}</p>
              </div>
            ))}
          </div>
        </div>
      </BlowCard>
      <p style={{ margin: '16px 2px 0', fontSize: 12, color: MUTED, textAlign: 'center', borderTop: `1px solid ${HAIR}`, paddingTop: 16 }}>
        Verticalisation en cours — bientôt, plus besoin d'un prestataire externe.
      </p>
    </div>
  )
}

export default BlowPhoneFarm
