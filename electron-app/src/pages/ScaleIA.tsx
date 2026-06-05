export default function ScaleIA() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#06060e' }}>

      {/* ── Background mockup (blurred recreation of the marketplace screen) ── */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(3px) brightness(0.45)', pointerEvents: 'none', userSelect: 'none' }}>

        {/* Top bar */}
        <div style={{ padding: '28px 32px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.12em', color: '#fff', textTransform: 'uppercase' }}>TRENDING</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {['←', '→'].map((a, i) => (
              <div key={i} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>{a}</div>
            ))}
          </div>
        </div>

        {/* Video thumbnails row */}
        <div style={{ display: 'flex', gap: 10, padding: '0 24px', height: 300 }}>
          {[
            { bg: 'linear-gradient(160deg,#c0392b,#8e44ad)', w: '22%' },
            { bg: 'linear-gradient(160deg,#1a1a2e,#16213e)', w: '18%' },
            { bg: 'linear-gradient(160deg,#f39c12,#e74c3c)', w: '22%' },
            { bg: 'linear-gradient(160deg,#2c3e50,#3498db)', w: '22%' },
            { bg: 'linear-gradient(160deg,#1e272e,#485460)', w: '16%' },
          ].map((v, i) => (
            <div key={i} style={{ flex: `0 0 ${v.w}`, background: v.bg, borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 10, left: 10, width: 24, height: 24, borderRadius: 5, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M10 9l5 3-5 3V9z"/></svg>
              </div>
            </div>
          ))}
        </div>

        {/* See more */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0', gap: 6 }}>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em' }}>SEE MORE</span>
          <span style={{ color: '#fff', fontSize: 13 }}>→</span>
        </div>

        {/* Services section */}
        <div style={{ margin: '0 24px', borderRadius: 16, background: 'rgba(30,30,60,0.8)', padding: '28px 32px', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 160px' }}>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              NEED<br />
              <span style={{ color: '#6c63ff' }}>SERVICES?</span>
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 10, lineHeight: 1.5 }}>Already have the content but need help scaling? Explore our creator growth services.</p>
            <div style={{ marginTop: 16, background: '#fff', color: '#000', fontSize: 10, fontWeight: 800, padding: '7px 14px', borderRadius: 4, display: 'inline-block', letterSpacing: '0.05em' }}>VIEW ALL</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flex: 1 }}>
            {[
              { bg: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)', label: 'INSTAGRAM MARKETING', icon: '📸' },
              { bg: '#000', label: 'X MARKETING', icon: '✕' },
              { bg: 'linear-gradient(135deg,#ff4500,#ff6534)', label: 'REDDIT MARKETING', icon: '🤖' },
              { bg: '#fffc00', label: 'SNAPCHAT MARKETING', icon: '👻', dark: true },
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, background: s.bg, borderRadius: 12, height: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 32 }}>{s.icon}</span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: s.dark ? '#000' : '#fff', textAlign: 'center', padding: '0 8px' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Coming soon overlay ─────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(124,58,237,0.18) 0%, rgba(6,6,14,0.72) 65%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 0,
      }}>
        {/* Glow halo */}
        <div style={{
          position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 400, height: 200,
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.35) 0%, transparent 70%)',
          filter: 'blur(30px)',
          pointerEvents: 'none',
        }} />

        {/* SOON chip */}
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase',
          color: '#a78bfa', border: '1px solid rgba(139,92,246,0.45)',
          padding: '5px 14px', borderRadius: 100, background: 'rgba(139,92,246,0.1)',
          marginBottom: 22,
        }}>
          BIENTÔT DISPONIBLE
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', lineHeight: 1.05, marginBottom: 20 }}>
          <div style={{
            fontSize: 64, fontWeight: 900, letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #e2e8f0 0%, #a78bfa 50%, #22d3ee 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            textShadow: 'none',
          }}>
            Scale<span style={{ background: 'linear-gradient(135deg,#a78bfa,#f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>IA</span>
          </div>
        </div>

        {/* Subtitle */}
        <p style={{
          fontSize: 15, color: 'rgba(226,232,240,0.55)', textAlign: 'center',
          maxWidth: 460, lineHeight: 1.6, marginBottom: 36,
        }}>
          La marketplace de contenu intelligente — découvrez des vidéos tendances,<br />
          commandez des services de croissance et gérez vos créateurs.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 500 }}>
          {[
            { icon: '🔥', label: 'Contenu Trending' },
            { icon: '🛒', label: 'Marketplace' },
            { icon: '🤖', label: 'IA Recommandations' },
            { icon: '📈', label: 'Growth Services' },
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
        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'rgba(167,139,250,0.7)', letterSpacing: '0.1em', fontWeight: 600 }}>EN DÉVELOPPEMENT</span>
          <div style={{ width: 220, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: '62%', height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg, #7c3aed, #a78bfa, #22d3ee)',
              boxShadow: '0 0 8px rgba(139,92,246,0.7)',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)' }}>62% terminé</span>
        </div>
      </div>
    </div>
  )
}
