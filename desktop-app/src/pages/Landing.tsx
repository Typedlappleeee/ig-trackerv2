// Devanture commerciale — affichée à la racine quand le visiteur n'est PAS connecté.
// Objectif : présenter ScaleFlow (mass-posting Insta/TikTok/Threads via téléphones
// cloud GeeLark + auto-contenu/spoof + programmation) et pousser vers login.dc.html.
// 100 % autonome (styles inline + classes premium déjà définies dans index.html :
// blow-card / blow-cta / blow-shine / blow-float / blow-stagger).

const VIOLET = '#A855F7'
const GRAD_TEXT = 'linear-gradient(96deg,#A855F7,#C4B5FD 34%,#93C5FD 68%,#67E8F9)'
const CARD_BG = 'linear-gradient(168deg, rgba(24,20,44,0.55), rgba(12,10,22,0.72))'
const CARD_BORDER = '1px solid rgba(168,85,247,0.16)'

function goLogin() { window.location.assign('./login.dc.html') }

// Petit pictogramme (même système d'icônes « path » que l'app : segments séparés par |).
function Ico({ d, size = 22, color = VIOLET }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

const FEATURES = [
  { i: 'M22 2 11 13|M22 2l-7 20-4-9-9-4 20-7z', t: 'Mass Posting', d: 'Publie la même vidéo — ou des dizaines de variantes — sur tous tes comptes en un clic. Reels, posts, TikTok, Threads.' },
  { i: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01', t: 'Téléphones cloud', d: 'Des centaines de vrais téléphones Android dans le cloud (GeeLark), pilotés automatiquement. Aucun matériel à gérer.' },
  { i: 'M12 22s8-4.5 8-11a8 8 0 1 0-16 0c0 6.5 8 11 8 11z|M9 12l2 2 4-4', t: 'Auto-contenu & Spoof', d: 'Une source → X variantes uniques : légende, coupe, micro-vitesse, zoom, EXIF/GPS réécrits. Anti-doublon pour l’algo.' },
  { i: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z', t: 'Stories & liens', d: 'Stories automatiques avec sticker de lien propre à chaque compte, texte et image en rotation. Warmup intégré.' },
  { i: 'M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z', t: 'Programmation 24/7', d: 'Planifie tes posts et tâches récurrentes. Tout tourne côté serveur — même PC éteint.' },
  { i: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75', t: 'Équipes & multi-comptes', d: 'Organisations, rôles et permissions. Gère des centaines de comptes à plusieurs, proprement.' },
]

const STEPS = [
  { n: '01', t: 'Connecte tes comptes', d: 'Relie tes téléphones cloud et ta banque de contenu. Prêt en quelques minutes.' },
  { n: '02', t: 'Génère tes variantes', d: 'L’Auto-contenu décline chaque vidéo/photo en versions uniques, prêtes à poster.' },
  { n: '03', t: 'Publie à grande échelle', d: 'Lance ou programme. ScaleFlow poste sur tous tes comptes et suit chaque run en direct.' },
]

const STATS = [
  { k: 'Insta · TikTok · Threads', v: '3 plateformes' },
  { k: 'téléphones cloud pilotés', v: '100aines' },
  { k: 'variantes uniques / source', v: '×24' },
  { k: 'même PC éteint', v: '24/7' },
]

export default function Landing() {
  const wrap: React.CSSProperties = { height: '100vh', overflowY: 'auto', background: '#0B0B0F', color: '#F4F4F6', fontFamily: "'Manrope',system-ui,sans-serif" }
  const shell: React.CSSProperties = { maxWidth: 1120, margin: '0 auto', padding: '0 22px', boxSizing: 'border-box' }
  const btnSolid: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 22px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#A855F7,#7C3AED)', boxShadow: '0 14px 34px -14px rgba(168,85,247,0.9)' }
  const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 20px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700, color: '#E9E6F5', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }
  const h2: React.CSSProperties = { fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(26px,3.4vw,40px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.08, margin: 0 }
  const eyebrow: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 13px', borderRadius: 99, fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', color: '#C4B5FD', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.24)' }

  return (
    <div style={wrap}>
      {/* ── Glow d'arrière-plan ── */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(60% 42% at 50% -6%, rgba(168,85,247,0.22), transparent 70%), radial-gradient(46% 34% at 88% 8%, rgba(103,232,249,0.10), transparent 70%)' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Barre de navigation ── */}
        <nav style={{ ...shell, display: 'flex', alignItems: 'center', gap: 12, height: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginRight: 'auto' }}>
            <div style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(145deg,#A855F7,#7C3AED)', boxShadow: '0 8px 22px -10px rgba(168,85,247,0.9)' }}>
              <Ico d="M22 2 11 13|M22 2l-7 20-4-9-9-4 20-7z" size={17} color="#fff" />
            </div>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>ScaleFlow</span>
          </div>
          <button onClick={goLogin} style={{ ...btnGhost, height: 40 }}>Se connecter</button>
          <button onClick={goLogin} className="blow-cta" style={{ ...btnSolid, height: 40 }}>Commencer</button>
        </nav>

        {/* ── Hero ── */}
        <header style={{ ...shell, textAlign: 'center', paddingTop: 'clamp(40px,7vw,86px)', paddingBottom: 'clamp(30px,5vw,60px)' }} className="blow-stagger">
          <span style={eyebrow}>Instagram · TikTok · Threads</span>
          <h1 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontWeight: 400, fontSize: 'clamp(42px,7vw,84px)', lineHeight: 1.02, letterSpacing: '-0.01em', margin: '22px auto 0', maxWidth: 900 }}>
            Poste à grande échelle,<br />
            <span className="blow-shine" style={{ backgroundImage: GRAD_TEXT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>sans te faire griller.</span>
          </h1>
          <p style={{ maxWidth: 620, margin: '22px auto 0', fontSize: 'clamp(15px,1.7vw,18px)', lineHeight: 1.6, color: '#A9A6B8' }}>
            ScaleFlow pilote des centaines de téléphones cloud pour publier tes Reels, posts et stories sur tous tes comptes — avec des variantes uniques générées automatiquement pour rester invisible aux algorithmes.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 30 }}>
            <button onClick={goLogin} className="blow-cta" style={btnSolid}>Commencer gratuitement →</button>
            <button onClick={goLogin} style={btnGhost}>J’ai déjà un compte</button>
          </div>
          <p style={{ marginTop: 18, fontSize: 12.5, color: '#6B6878' }}>Sans engagement · Configuration en quelques minutes</p>
        </header>

        {/* ── Bandeau de stats ── */}
        <section style={{ ...shell, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, padding: '20px', borderRadius: 18, background: CARD_BG, border: CARD_BORDER }}>
            {STATS.map(s => (
              <div key={s.k} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, background: GRAD_TEXT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{s.v}</div>
                <div style={{ fontSize: 12, color: '#8B8898', marginTop: 3 }}>{s.k}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Fonctionnalités ── */}
        <section style={{ ...shell, marginTop: 'clamp(56px,8vw,96px)' }}>
          <div style={{ textAlign: 'center', marginBottom: 34 }}>
            <span style={eyebrow}>Tout-en-un</span>
            <h2 style={{ ...h2, marginTop: 16 }}>Une seule plateforme, tout ton système de posting</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }} className="blow-stagger">
            {FEATURES.map(f => (
              <div key={f.t} className="blow-card" style={{ padding: 24, borderRadius: 16, background: CARD_BG, border: CARD_BORDER }}>
                <div style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 12, background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.24)' }}><Ico d={f.i} /></div>
                <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, margin: '16px 0 8px' }}>{f.t}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#9C99AA', margin: 0 }}>{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Comment ça marche ── */}
        <section style={{ ...shell, marginTop: 'clamp(56px,8vw,96px)' }}>
          <div style={{ textAlign: 'center', marginBottom: 34 }}>
            <span style={eyebrow}>3 étapes</span>
            <h2 style={{ ...h2, marginTop: 16 }}>De zéro à publier partout</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ padding: 24, borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 40, fontWeight: 700, lineHeight: 1, background: GRAD_TEXT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{s.n}</div>
                <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, margin: '14px 0 8px' }}>{s.t}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#9C99AA', margin: 0 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Bloc anti-détection ── */}
        <section style={{ ...shell, marginTop: 'clamp(56px,8vw,96px)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 30, alignItems: 'center', padding: 'clamp(26px,4vw,48px)', borderRadius: 22, background: 'linear-gradient(150deg, rgba(168,85,247,0.14), rgba(103,232,249,0.06))', border: '1px solid rgba(168,85,247,0.24)' }}>
            <div>
              <span style={eyebrow}>Anti-détection</span>
              <h2 style={{ ...h2, marginTop: 16 }}>Chaque publication est unique</h2>
              <p style={{ fontSize: 15, lineHeight: 1.65, color: '#B6B3C4', marginTop: 14 }}>
                Micro-zoom, recadrage, vitesse, légendes, métadonnées EXIF et GPS réécrits (iPhone, localisation FR…) : ScaleFlow transforme une source en dizaines de variantes que les algorithmes ne reconnaissent pas comme des doublons.
              </p>
              <button onClick={goLogin} className="blow-cta" style={{ ...btnSolid, marginTop: 22 }}>Essayer maintenant →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['Empreinte vidéo & image unique', 'Device + GPS spoofés', 'Rotation de proxys', 'Reprise auto après coupure'].map(x => (
                <div key={x} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 12, background: 'rgba(11,11,15,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 7, background: 'rgba(52,211,153,0.14)', flexShrink: 0 }}><Ico d="M20 6 9 17l-5-5" size={15} color="#34D399" /></span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#E4E1EF' }}>{x}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA final ── */}
        <section style={{ ...shell, marginTop: 'clamp(56px,8vw,96px)', textAlign: 'center' }}>
          <div style={{ padding: 'clamp(36px,6vw,64px) 22px', borderRadius: 24, background: CARD_BG, border: CARD_BORDER }}>
            <h2 style={{ ...h2, maxWidth: 640, margin: '0 auto' }}>Prêt à faire tourner tes comptes en pilote automatique ?</h2>
            <p style={{ maxWidth: 520, margin: '16px auto 0', fontSize: 15.5, lineHeight: 1.6, color: '#A9A6B8' }}>Rejoins ScaleFlow et lance ta première vague de publications aujourd’hui.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
              <button onClick={goLogin} className="blow-cta" style={btnSolid}>Créer mon compte →</button>
              <button onClick={goLogin} style={btnGhost}>Se connecter</button>
            </div>
          </div>
        </section>

        {/* ── Pied de page ── */}
        <footer style={{ ...shell, marginTop: 'clamp(50px,7vw,80px)', paddingBottom: 40, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24 }}>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, letterSpacing: '-0.02em', marginRight: 'auto' }}>ScaleFlow</span>
          <span style={{ fontSize: 12.5, color: '#6B6878' }}>© {new Date().getFullYear()} ScaleFlow · Tous droits réservés</span>
          <button onClick={goLogin} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#A78BFA' }}>Se connecter →</button>
        </footer>
      </div>
    </div>
  )
}
