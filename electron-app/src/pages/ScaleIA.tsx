export default function ScaleIA() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#06060e' }}>

      {/* ── Real background screenshot ───────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'url(/scaleia-bg.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        filter: 'blur(8px) brightness(0.3)',
        transform: 'scale(1.04)',
        pointerEvents: 'none',
      }} />

      {/* ── Overlay gradient ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 38%, rgba(124,58,237,0.22) 0%, rgba(6,6,14,0.75) 65%)',
        pointerEvents: 'none',
      }} />
      {/* Extra mask on top to hide any logo/branding */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 80,
        background: 'linear-gradient(to bottom, #06060e 40%, transparent)',
        pointerEvents: 'none',
      }} />

      {/* ── Glow halo ────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: '36%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 500, height: 220,
        background: 'radial-gradient(ellipse, rgba(139,92,246,0.38) 0%, transparent 70%)',
        filter: 'blur(35px)',
        pointerEvents: 'none',
      }} />

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 0,
      }}>
        {/* BIENTÔT chip */}
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase',
          color: '#a78bfa', border: '1px solid rgba(139,92,246,0.45)',
          padding: '5px 14px', borderRadius: 100, background: 'rgba(139,92,246,0.1)',
          marginBottom: 20,
        }}>
          BIENTÔT DISPONIBLE
        </div>

        {/* Title */}
        <div style={{ marginBottom: 18, textAlign: 'center' }}>
          <span style={{
            fontSize: 68, fontWeight: 900, letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #e2e8f0 0%, #c4b5fd 45%, #67e8f9 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Scale</span><span style={{
            fontSize: 68, fontWeight: 900, letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg,#a78bfa,#f472b6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>IA</span>
        </div>

        {/* Subtitle */}
        <p style={{
          fontSize: 15, color: 'rgba(226,232,240,0.55)', textAlign: 'center',
          maxWidth: 480, lineHeight: 1.65, marginBottom: 32,
        }}>
          Crée ta modèle IA, génère du contenu illimité<br />
          et construis ton empire Instagram.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 520, marginBottom: 44 }}>
          {[
            { icon: '🤖', label: 'Modèle IA Custom' },
            { icon: '✨', label: 'Contenu génératif' },
            { icon: '📸', label: 'Photos & Vidéos IA' },
            { icon: '📈', label: 'Empire Instagram' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 100,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              fontSize: 12, color: 'rgba(226,232,240,0.7)',
            }}>
              <span>{f.icon}</span>
              <span style={{ fontWeight: 500 }}>{f.label}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'rgba(167,139,250,0.7)', letterSpacing: '0.1em', fontWeight: 600 }}>EN DÉVELOPPEMENT</span>
          <div style={{ width: 240, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: '10%', height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
              boxShadow: '0 0 8px rgba(139,92,246,0.8)',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)' }}>10% terminé</span>
        </div>
      </div>
    </div>
  )
}
