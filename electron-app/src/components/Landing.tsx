import { useState } from 'react'
import { AuthPage } from '@/components/auth/AuthPage'

const TELEGRAM_URL = 'https://t.me/justquentin'

// ── Logo ─────────────────────────────────────────────────────────────────────
function SFLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width="30" height="30" viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient id="lg-main" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1d4ed8"/>
            <stop offset="28%" stopColor="#3b5af0"/>
            <stop offset="58%" stopColor="#7c3aed"/>
            <stop offset="100%" stopColor="#a855f7"/>
          </linearGradient>
          <linearGradient id="lg-arr" x1="66" y1="24" x2="90" y2="1" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#db2777"/>
            <stop offset="100%" stopColor="#f472b6"/>
          </linearGradient>
        </defs>
        <path d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
          stroke="url(#lg-main)" strokeWidth="16" strokeLinecap="round" fill="none"/>
        <line x1="66" y1="22" x2="88" y2="2" stroke="url(#lg-arr)" strokeWidth="11" strokeLinecap="round"/>
        <line x1="77" y1="1" x2="90" y2="1" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
        <line x1="90" y1="1" x2="90" y2="15" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
      </svg>
      <span style={{ fontSize: 17, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.4px' }}>ScaleFlow</span>
    </div>
  )
}

// ── Auth modal ────────────────────────────────────────────────────────────────
function AuthModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: -14, right: -14, zIndex: 10,
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(148,163,184,0.7)', cursor: 'pointer', fontSize: 14,
          }}
        >✕</button>
        <AuthPage />
      </div>
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.12em', color: '#a78bfa', marginBottom: 12,
    }}>{children}</p>
  )
}

// ── Features ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '⚡', title: 'Mass Posting',      color: '#a78bfa', text: 'Poste sur des dizaines de comptes en parallèle. Sélectionne tes vidéos, lance, chaque téléphone se ferme dès sa publication faite.' },
  { icon: '🗂', title: 'Banque de contenu', color: '#ec4899', text: 'Organise et stocke tes vidéos dans le cloud. Import en glisser-déposer, miniatures auto, partage par organisation.' },
  { icon: '🔀', title: 'Remix & CloneVid',  color: '#34d399', text: 'Crée des copies uniques avec modifications FFmpeg : zoom, couleurs, crop. Évite le duplicate content à grande échelle.' },
  { icon: '🤖', title: 'Outils IA',         color: '#fbbf24', text: 'Scripts, hooks, captions virales, analyse de thumbnail. Powered by Groq Llama & Claude Vision.' },
  { icon: '📅', title: 'Programmation',     color: '#60a5fa', text: 'Planifie tes posts à l\'avance. Le scheduler s\'exécute même app fermée via Supabase Edge Functions.' },
  { icon: '📱', title: 'Gestion téléphones',color: '#f472b6', text: 'Suivi temps réel du statut de chaque GéeLark phone, sync automatique, gestion par groupes et sessions Instagram.' },
]

// ── Pricing ───────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Standard', price: '49,99$', period: '/mois', accent: '#60a5fa',
    cta: 'Choisir Standard',
    features: ['2 500 crédits / mois', '50 téléphones max', 'Accès à toutes les fonctionnalités', 'Mass Posting — 10 comptes max', 'Support 24/7'],
  },
  {
    name: 'Pro', price: '99,99$', period: '/mois', accent: '#c084fc', popular: true,
    cta: 'Choisir Pro',
    features: ['5 500 crédits / mois', '200 téléphones max', 'Accès à toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7'],
  },
  {
    name: 'Organisation', price: '149,99$', period: '/mois', accent: '#34d399',
    cta: 'Choisir Organisation',
    features: ['11 000 crédits / mois', 'Téléphones illimités', 'Accès à toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7 prioritaire', 'Proposition d\'ajouts avec les devs'],
  },
]

// ── FAQ ───────────────────────────────────────────────────────────────────────
const QA = [
  { q: "C'est quoi ScaleFlow exactement ?",         a: "Une app pour gérer en masse tes comptes Instagram : poster automatiquement sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives." },
  { q: "J'ai besoin de quoi pour l'utiliser ?",     a: "Un abonnement GéeLark (cloud phones) avec ton bearer token. ScaleFlow se connecte à ton compte GéeLark pour piloter tes téléphones virtuels." },
  { q: "Différence entre Standard et Pro ?",        a: "Standard = 2 500 crédits/mois + outils de base. Pro = 5 500 crédits + organisations multi-membres + support 24/7 + Mass Posting illimité." },
  { q: "C'est risqué pour mes comptes Instagram ?", a: "ScaleFlow utilise GéeLark qui simule de vrais devices avec leurs propres IPs/sessions. Respecte les rythmes humains (notre warmup t'aide) — le risque est très faible." },
  { q: "Version web ou téléchargement ?",           a: "Les deux. L'Electron (.exe/.dmg) est plus rapide et accède aux fichiers locaux. La version web est pratique pour bosser depuis n'importe où." },
  { q: "Comment je contacte le support ?",          a: "Via Telegram (@justquentin), réponse en moins d'1h en moyenne. Ou via le système de tickets dans l'app." },
]

// ── Main Landing ──────────────────────────────────────────────────────────────
export function Landing() {
  const [showAuth, setShowAuth] = useState(false)
  const [faqOpen, setFaqOpen]   = useState<number | null>(null)

  return (
    <div style={{ minHeight: '100vh', background: '#07070C', color: '#F2F0FF', overflowX: 'hidden' }}>

      {/* Background glows */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -200, left: '50%', transform: 'translateX(-50%)', width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(124,58,237,0.22), transparent)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: -200, right: -100, width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(236,72,153,0.14), transparent)', filter: 'blur(60px)' }} />
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(7,7,12,0.8)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(139,92,246,0.10)',
      }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SFLogo />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <a href="#features" style={{ fontSize: 13, color: 'rgba(148,163,184,0.65)', textDecoration: 'none', padding: '6px 12px', borderRadius: 8, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F2F0FF')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.65)')}>
              Fonctionnalités
            </a>
            <a href="#pricing" style={{ fontSize: 13, color: 'rgba(148,163,184,0.65)', textDecoration: 'none', padding: '6px 12px', borderRadius: 8, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F2F0FF')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.65)')}>
              Tarifs
            </a>
            <a href="#faq" style={{ fontSize: 13, color: 'rgba(148,163,184,0.65)', textDecoration: 'none', padding: '6px 12px', borderRadius: 8, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F2F0FF')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.65)')}>
              FAQ
            </a>
            <button
              onClick={() => setShowAuth(true)}
              style={{
                marginLeft: 8, padding: '8px 18px', borderRadius: 10,
                background: 'linear-gradient(130deg, #7c3aed, #ec4899)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '-0.1px',
                boxShadow: '0 4px 16px rgba(124,58,237,0.35)',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Se connecter
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '96px 24px 80px', textAlign: 'center' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 14px', borderRadius: 99, marginBottom: 28,
            background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.22)',
            fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.04em',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite', flexShrink: 0 }} />
            Nouvelle version 2.0 disponible
          </div>

          <h1 style={{
            fontSize: 'clamp(38px, 7vw, 72px)', fontWeight: 900, lineHeight: 1.06,
            letterSpacing: '-0.04em', margin: '0 0 24px', color: '#F2F0FF',
          }}>
            Automatise ton Instagram<br />
            <span style={{ background: 'linear-gradient(130deg, #7c3aed, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              à grande échelle.
            </span>
          </h1>

          <p style={{ fontSize: 18, color: 'rgba(148,163,184,0.75)', maxWidth: 540, margin: '0 auto 40px', lineHeight: 1.65 }}>
            Mass posting, banque de contenu, IA, statistiques temps réel.<br />
            La seule app conçue pour gérer <strong style={{ color: '#F2F0FF' }}>100+ comptes</strong> sans se prendre la tête.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => setShowAuth(true)}
              style={{
                padding: '14px 32px', borderRadius: 12,
                background: 'linear-gradient(130deg, #7c3aed, #ec4899)',
                border: 'none', color: '#fff', fontSize: 15, fontWeight: 800,
                cursor: 'pointer', boxShadow: '0 8px 32px rgba(124,58,237,0.4)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(124,58,237,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 32px rgba(124,58,237,0.4)' }}
            >
              🚀 Commencer maintenant
            </button>
            <a
              href={TELEGRAM_URL}
              target="_blank" rel="noreferrer"
              style={{
                padding: '14px 28px', borderRadius: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#F2F0FF', fontSize: 15, fontWeight: 700, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
              </svg>
              Acheter une clé
            </a>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', marginTop: 32, fontSize: 12, color: 'rgba(148,163,184,0.5)' }}>
            {['✓ Version Web & Electron (Mac/Win)', '✓ Activation immédiate', '✓ Support Telegram inclus'].map(t => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Screenshot placeholder ─────────────────────────────────────────── */}
      <section id="showcase" style={{ position: 'relative', zIndex: 1, padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{
            borderRadius: 20, overflow: 'hidden',
            border: '1px solid rgba(139,92,246,0.22)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
            background: '#0C0C15',
            minHeight: 480,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Top bar chrome */}
            <div style={{ width: '100%', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.055)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {['#ef4444','#f59e0b','#22c55e'].map(c => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
              ))}
              <div style={{ flex: 1, margin: '0 12px', height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)' }}>scaleflow-fvtu.vercel.app</span>
              </div>
            </div>
            {/* Placeholder content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(139,92,246,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📸</div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#F2F0FF', margin: 0 }}>Screenshots à venir</p>
              <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.45)', margin: 0, textAlign: 'center', maxWidth: 280 }}>Les captures d'écran de l'interface seront ajoutées prochainement.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <SectionTag>Tout pour scaler</SectionTag>
            <h2 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 16px', color: '#F2F0FF' }}>
              Une seule app, <span style={{ background: 'linear-gradient(130deg, #7c3aed, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tout dedans.</span>
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(148,163,184,0.65)', maxWidth: 500, margin: '0 auto' }}>
              Plus besoin de jongler entre 10 outils. ScaleFlow regroupe tout ce qu'il faut pour gérer ton empire Instagram.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{
                background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)',
                borderRadius: 16, padding: '22px 22px 20px',
                transition: 'border-color 0.2s, transform 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${f.color}40`; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.055)'; e.currentTarget.style.transform = '' }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12, marginBottom: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                  background: `${f.color}14`, border: `1px solid ${f.color}28`,
                }}>{f.icon}</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#F2F0FF', margin: '0 0 8px' }}>{f.title}</p>
                <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.6)', margin: 0, lineHeight: 1.6 }}>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <SectionTag>Tarifs</SectionTag>
            <h2 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 16px', color: '#F2F0FF' }}>
              Choisis ton <span style={{ background: 'linear-gradient(130deg, #7c3aed, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>plan.</span>
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(148,163,184,0.65)' }}>
              Tout est inclus dès le Standard. Activation via Telegram — immédiate.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
            {PLANS.map(p => (
              <div key={p.name} style={{
                position: 'relative',
                background: '#0C0C15', borderRadius: 18, padding: '28px 24px',
                border: p.popular ? '1.5px solid rgba(124,58,237,0.45)' : '1px solid rgba(255,255,255,0.07)',
                display: 'flex', flexDirection: 'column',
                boxShadow: p.popular ? '0 0 40px rgba(124,58,237,0.12)' : 'none',
              }}>
                {p.popular && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    padding: '3px 14px', borderRadius: 99, fontSize: 10, fontWeight: 900,
                    color: '#fff', letterSpacing: '0.1em',
                    background: 'linear-gradient(130deg, #7c3aed, #ec4899)',
                  }}>POPULAIRE</div>
                )}
                <p style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: p.accent, margin: '0 0 8px' }}>{p.name}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 20 }}>
                  <span style={{ fontSize: 36, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.04em' }}>{p.price}</span>
                  <span style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)' }}>{p.period}</span>
                </div>
                <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'rgba(196,181,253,0.75)' }}>
                      <span style={{ color: p.accent, flexShrink: 0, marginTop: 1 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                  style={{
                    display: 'block', textAlign: 'center', padding: '11px', borderRadius: 10,
                    fontSize: 13, fontWeight: 700, textDecoration: 'none', transition: 'opacity 0.15s',
                    ...(p.popular
                      ? { background: 'linear-gradient(130deg, #7c3aed, #ec4899)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }
                      : { background: 'rgba(255,255,255,0.05)', border: `1px solid ${p.accent}35`, color: '#F2F0FF' }),
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >{p.cta} →</a>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(148,163,184,0.35)', marginTop: 20 }}>
            Paiement via Telegram · Crypto ou virement · Clé activable immédiatement
          </p>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ position: 'relative', zIndex: 1, padding: '60px 24px 80px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <SectionTag>FAQ</SectionTag>
            <h2 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: '#F2F0FF' }}>
              On répond à <span style={{ background: 'linear-gradient(130deg, #7c3aed, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tout.</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {QA.map((item, i) => (
              <div key={i} style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  style={{
                    width: '100%', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 12,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#F2F0FF' }}>{item.q}</span>
                  <span style={{ color: 'rgba(148,163,184,0.5)', fontSize: 18, lineHeight: 1, flexShrink: 0, transition: 'transform 0.2s', transform: faqOpen === i ? 'rotate(45deg)' : 'none' }}>+</span>
                </button>
                {faqOpen === i && (
                  <div style={{ padding: '0 18px 16px', fontSize: 13, color: 'rgba(148,163,184,0.65)', lineHeight: 1.7 }}>{item.a}</div>
                )}
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 40, textAlign: 'center', background: '#0C0C15',
            border: '1px solid rgba(139,92,246,0.18)', borderRadius: 18, padding: '36px 24px',
          }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#F2F0FF', margin: '0 0 8px' }}>Une autre question ?</p>
            <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.55)', margin: '0 0 20px' }}>Réponse en moins d'1h sur Telegram, en moyenne.</p>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 24px', borderRadius: 10,
                background: 'linear-gradient(130deg, #7c3aed, #ec4899)',
                color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                boxShadow: '0 4px 16px rgba(124,58,237,0.35)',
              }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
              </svg>
              Contacter sur Telegram
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,0.055)', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <SFLogo />
          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'rgba(148,163,184,0.4)' }}>
            <a href="#features" style={{ color: 'inherit', textDecoration: 'none' }}>Fonctionnalités</a>
            <a href="#pricing" style={{ color: 'inherit', textDecoration: 'none' }}>Tarifs</a>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Support</a>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.3)', margin: 0 }}>© {new Date().getFullYear()} ScaleFlow. Tous droits réservés.</p>
        </div>
      </footer>

    </div>
  )
}
