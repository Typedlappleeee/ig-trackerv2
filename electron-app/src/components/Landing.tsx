import { useState, useEffect, useRef } from 'react'
import { AuthPage } from '@/components/auth/AuthPage'

const TELEGRAM_URL = 'https://t.me/+drqJbwraMag5M2I0'
const LAUNCH_DATE  = new Date('2026-06-01T00:00:00')

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown() {
  const calc = () => {
    const diff = LAUNCH_DATE.getTime() - Date.now()
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, launched: true }
    return {
      days:    Math.floor(diff / 86400000),
      hours:   Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000)  / 60000),
      seconds: Math.floor((diff % 60000)    / 1000),
      launched: false,
    }
  }
  const [t, setT] = useState(calc)
  useEffect(() => { const id = setInterval(() => setT(calc()), 1000); return () => clearInterval(id) }, [])
  return t
}

// ── Star canvas background ────────────────────────────────────────────────────
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    // Generate stars
    type Star = { x: number; y: number; r: number; alpha: number; speed: number; phase: number }
    const stars: Star[] = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.1 + 0.2,
      alpha: Math.random() * 0.5 + 0.1,
      speed: Math.random() * 0.006 + 0.002,
      phase: Math.random() * Math.PI * 2,
    }))

    let frame = 0
    let raf: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      frame++
      for (const s of stars) {
        const a = s.alpha * (0.55 + 0.45 * Math.sin(s.phase + frame * s.speed))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200, 190, 255, ${a})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.7 }} />
}

// ── Auth modal ────────────────────────────────────────────────────────────────
function AuthModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
        <button onClick={onClose} style={{ position: 'absolute', top: -14, right: -14, zIndex: 10, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12121c', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(148,163,184,0.7)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        <AuthPage />
      </div>
    </div>
  )
}

// ── Countdown block ───────────────────────────────────────────────────────────
function CountdownBlock() {
  const { days, hours, minutes, seconds, launched } = useCountdown()
  if (launched) return null
  const pad = (n: number) => String(n).padStart(2, '0')

  const unit = (v: number, label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 80, height: 80, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.2)',
        fontSize: 36, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.05em',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {pad(v)}
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(148,163,184,0.35)' }}>{label}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, margin: '48px 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 14px', borderRadius: 99, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ouverture le 1er Juin 2026</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {unit(days, 'jours')}
        <span style={{ fontSize: 28, fontWeight: 900, color: 'rgba(139,92,246,0.3)', marginTop: 20, lineHeight: 1 }}>:</span>
        {unit(hours, 'heures')}
        <span style={{ fontSize: 28, fontWeight: 900, color: 'rgba(139,92,246,0.3)', marginTop: 20, lineHeight: 1 }}>:</span>
        {unit(minutes, 'min')}
        <span style={{ fontSize: 28, fontWeight: 900, color: 'rgba(139,92,246,0.3)', marginTop: 20, lineHeight: 1 }}>:</span>
        {unit(seconds, 'sec')}
      </div>
    </div>
  )
}

// ── Features data ─────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '⚡', title: 'Mass Posting',        color: '#a78bfa', text: 'Poste sur des dizaines de comptes en parallèle. Sélectionne tes vidéos, lance — chaque téléphone se ferme dès sa publication.' },
  { icon: '🗂', title: 'Banque de contenu',   color: '#ec4899', text: 'Organise et stocke tes vidéos dans le cloud. Import en glisser-déposer, miniatures auto, partage par organisation.' },
  { icon: '🔀', title: 'Remix & CloneVid',    color: '#38bdf8', text: 'Génère des copies uniques via FFmpeg : zoom, couleurs, crop, overlay texte. Anti duplicate content à grande échelle.' },
  { icon: '🤖', title: 'Outils IA',           color: '#34d399', text: 'Scripts, hooks, captions virales, analyse thumbnail. Powered by Groq Llama & Claude Vision.' },
  { icon: '📅', title: 'Programmation',       color: '#fbbf24', text: "Planifie tes posts. Le scheduler s'exécute même app fermée via Supabase Edge Functions." },
  { icon: '📱', title: 'Suivi téléphones',    color: '#f472b6', text: "Status temps réel de chaque GéeLark phone, sync auto, gestion par groupes et sessions Instagram." },
]

// ── Pricing data ──────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Standard', price: '49,99$', period: '/mois', accent: '#60a5fa',
    cta: 'Choisir Standard',
    features: ['2 500 crédits / mois', '50 téléphones max', 'Toutes les fonctionnalités', 'Mass Posting — 10 comptes max', 'Support 24/7'],
  },
  {
    name: 'Pro', price: '99,99$', period: '/mois', accent: '#c084fc', popular: true,
    cta: 'Choisir Pro',
    features: ['5 500 crédits / mois', '200 téléphones max', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7'],
  },
  {
    name: 'Organisation', price: '149,99$', period: '/mois', accent: '#34d399',
    cta: 'Choisir Organisation',
    features: ['11 000 crédits / mois', 'Téléphones illimités', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support prioritaire', "Suggestions d'ajouts avec les devs"],
  },
]

// ── FAQ data ──────────────────────────────────────────────────────────────────
const QA = [
  { q: "C'est quoi ScaleFlow ?",                a: "Une app pour gérer en masse tes comptes Instagram : poster sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives." },
  { q: "J'ai besoin de quoi ?",                 a: "Un abonnement GéeLark (cloud phones) + ton bearer token. ScaleFlow se connecte à GéeLark pour piloter tes téléphones virtuels. N'importe quel Mac/PC moderne suffit." },
  { q: "Différence Standard vs Pro ?",          a: "Standard = 2 500 crédits/mois + outils de base + 10 comptes max. Pro = 5 500 crédits + Mass Posting illimité + organisations multi-membres + support prioritaire." },
  { q: "C'est risqué pour mes comptes ?",       a: "ScaleFlow utilise GéeLark qui simule de vrais devices avec leurs propres IPs/sessions. Respecte les rythmes humains (warmup intégré) — le risque est minimal." },
  { q: "Version web ou téléchargement ?",       a: "Les deux. L'Electron (.exe/.dmg) est plus rapide. La version web est accessible depuis n'importe où sans installation." },
  { q: "Comment je contacte le support ?",      a: "Via Telegram (@justquentin), réponse en moins d'1h. Ou via les tickets dans l'app." },
]

// ── Divider ───────────────────────────────────────────────────────────────────
const Divider = () => (
  <div style={{ maxWidth: 1100, margin: '0 auto', height: 1, background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.15), transparent)' }} />
)

// ── Main Landing ──────────────────────────────────────────────────────────────
export function Landing() {
  const [showAuth, setShowAuth] = useState(false)
  const [faqOpen, setFaqOpen]   = useState<number | null>(null)

  return (
    <div style={{ minHeight: '100vh', background: '#06060f', color: '#F2F0FF', overflowX: 'hidden', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Stars */}
      <StarField />

      {/* Nebula glows */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-15%', left: '35%', width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(109,40,217,0.13), transparent)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', top: '30%', right: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(236,72,153,0.07), transparent)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(56,189,248,0.05), transparent)', filter: 'blur(40px)' }} />
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(6,6,15,0.75)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
      }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="ScaleFlow" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover' }} />
            <span style={{ fontSize: 16, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.3px' }}>ScaleFlow</span>
          </div>

          {/* Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[['#features', 'Fonctionnalités'], ['#pricing', 'Tarifs'], ['#faq', 'FAQ']].map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: 13, color: 'rgba(148,163,184,0.6)', textDecoration: 'none', padding: '6px 12px', borderRadius: 8, transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F2F0FF')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.6)')}>
                {label}
              </a>
            ))}
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#F2F0FF', textDecoration: 'none', transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/></svg>
              Acheter une clé
            </a>
            <button onClick={() => setShowAuth(true)} style={{
              padding: '7px 16px', borderRadius: 9,
              background: 'linear-gradient(130deg, #7c3aed, #a855f7)',
              border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
              transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Se connecter →
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '110px 24px 60px', textAlign: 'center' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>

          {/* App tag */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 99, marginBottom: 32, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'rgba(148,163,184,0.6)', letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase' }}>
            <img src="/logo.png" alt="" style={{ width: 16, height: 16, borderRadius: 4 }} />
            ScaleFlow — Instagram Automation
          </div>

          {/* Main phrase */}
          <p style={{
            fontSize: 'clamp(13px, 2vw, 16px)', fontWeight: 500, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 16,
          }}>
            La révolution commence.
          </p>

          {/* Headline */}
          <h1 style={{
            fontSize: 'clamp(42px, 8vw, 82px)', fontWeight: 900, lineHeight: 1.03,
            letterSpacing: '-0.045em', margin: '0 0 28px', color: '#F2F0FF',
          }}>
            Gère 100+ comptes<br />
            <span style={{
              background: 'linear-gradient(120deg, #a78bfa 0%, #ec4899 55%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              sans effort.
            </span>
          </h1>

          <p style={{ fontSize: 17, color: 'rgba(148,163,184,0.6)', maxWidth: 500, margin: '0 auto 44px', lineHeight: 1.7 }}>
            Mass posting, IA, banque de contenu, stats temps réel.
            Tout ce qu'il faut pour scaler ton empire Instagram.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => setShowAuth(true)} style={{
              padding: '14px 34px', borderRadius: 12,
              background: 'linear-gradient(130deg, #7c3aed, #ec4899)',
              border: 'none', color: '#fff', fontSize: 15, fontWeight: 800,
              cursor: 'pointer', boxShadow: '0 8px 32px rgba(124,58,237,0.35)',
              transition: 'transform 0.15s, box-shadow 0.15s', letterSpacing: '-0.01em',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(124,58,237,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 32px rgba(124,58,237,0.35)' }}
            >
              🚀 Accéder à l'app
            </button>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{
              padding: '14px 28px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
              color: '#F2F0FF', fontSize: 15, fontWeight: 700, textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              transition: 'background 0.15s, border-color 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/></svg>
              Acheter une clé
            </a>
          </div>

          {/* Social proof */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', marginTop: 36, fontSize: 12, color: 'rgba(148,163,184,0.4)' }}>
            {['✓ Mac & Windows', '✓ Version web disponible', '✓ Activation instantanée'].map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>

        {/* Countdown */}
        <CountdownBlock />
      </section>

      {/* ── Screenshot ────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '40px 24px 80px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{
            borderRadius: 20, overflow: 'hidden',
            border: '1px solid rgba(139,92,246,0.2)',
            boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
            background: '#0a0a14',
          }}>
            {/* Chrome bar */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 8, background: '#0c0c18' }}>
              {['#ef4444','#f59e0b','#22c55e'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.55 }} />)}
              <div style={{ flex: 1, margin: '0 12px', height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.25)' }}>scaleflow-fvtu.vercel.app</span>
              </div>
            </div>
            {/* Placeholder */}
            <div style={{ minHeight: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(139,92,246,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/logo.png" alt="" style={{ width: 32, height: 32, borderRadius: 8 }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(148,163,184,0.35)', margin: 0 }}>Aperçu de l'interface — bientôt</p>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Features ──────────────────────────────────────────────────────────── */}
      <section id="features" style={{ position: 'relative', zIndex: 1, padding: '90px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 14px' }}>Tout pour scaler</p>
            <h2 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 16px', color: '#F2F0FF' }}>
              Une seule app,{' '}
              <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                tout dedans.
              </span>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(148,163,184,0.55)', maxWidth: 480, margin: '0 auto' }}>
              Plus besoin de jongler entre 10 outils différents.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.055)',
                borderRadius: 16, padding: '22px', transition: 'border-color 0.2s, transform 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${f.color}35`; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.055)'; e.currentTarget.style.transform = '' }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 11, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: `${f.color}12`, border: `1px solid ${f.color}22` }}>{f.icon}</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#F2F0FF', margin: '0 0 7px' }}>{f.title}</p>
                <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.55)', margin: 0, lineHeight: 1.65 }}>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Telegram CTA ────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            borderRadius: 22, padding: '48px 36px',
            background: 'linear-gradient(135deg, rgba(124,58,237,0.09), rgba(236,72,153,0.05))',
            border: '1px solid rgba(139,92,246,0.22)',
            boxShadow: '0 0 60px rgba(124,58,237,0.07)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="url(#tg-grad)" style={{ display: 'block', margin: '0 auto' }}>
                <defs>
                  <linearGradient id="tg-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7c3aed"/>
                    <stop offset="100%" stopColor="#ec4899"/>
                  </linearGradient>
                </defs>
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
              </svg>
            </div>
            <h3 style={{ fontSize: 26, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.03em', margin: '0 0 10px' }}>
              Acheter une clé ScaleFlow
            </h3>
            <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.55)', margin: '0 0 28px', lineHeight: 1.6 }}>
              Activation immédiate après paiement.<br />Paiement via Telegram — crypto ou virement.
            </p>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              padding: '14px 32px', borderRadius: 12,
              background: 'linear-gradient(130deg, #7c3aed, #ec4899)',
              color: '#fff', fontSize: 15, fontWeight: 800, textDecoration: 'none',
              boxShadow: '0 8px 28px rgba(124,58,237,0.4)',
              transition: 'opacity 0.15s, transform 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = '' }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/></svg>
              Rejoindre sur Telegram
            </a>
            <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.3)', marginTop: 18 }}>Réponse en moins d'1h · Support inclus avec chaque plan</p>
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Pricing ──────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 14px' }}>Tarifs</p>
            <h2 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 14px', color: '#F2F0FF' }}>
              Choisis ton{' '}
              <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>plan.</span>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(148,163,184,0.55)' }}>Tout est inclus dès le Standard. Activation via Telegram.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(265px, 1fr))', gap: 14 }}>
            {PLANS.map(p => (
              <div key={p.name} style={{
                position: 'relative', background: '#0a0a14', borderRadius: 18, padding: '28px 24px',
                border: p.popular ? '1.5px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.065)',
                display: 'flex', flexDirection: 'column',
                boxShadow: p.popular ? '0 0 50px rgba(124,58,237,0.1)' : 'none',
              }}>
                {p.popular && (
                  <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', borderRadius: 99, fontSize: 10, fontWeight: 900, color: '#fff', letterSpacing: '0.1em', background: 'linear-gradient(130deg,#7c3aed,#ec4899)', whiteSpace: 'nowrap' }}>POPULAIRE</div>
                )}
                <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: p.accent, margin: '0 0 8px' }}>{p.name}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 22 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.04em' }}>{p.price}</span>
                  <span style={{ fontSize: 13, color: 'rgba(148,163,184,0.4)' }}>{p.period}</span>
                </div>
                <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'rgba(196,181,253,0.7)' }}>
                      <span style={{ color: p.accent, flexShrink: 0 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{
                  display: 'block', textAlign: 'center', padding: '11px', borderRadius: 10,
                  fontSize: 13, fontWeight: 700, textDecoration: 'none', transition: 'opacity 0.15s',
                  ...(p.popular
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }
                    : { background: 'rgba(255,255,255,0.04)', border: `1px solid ${p.accent}30`, color: '#F2F0FF' }),
                }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >{p.cta} →</a>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(148,163,184,0.28)', marginTop: 24 }}>
            Paiement via Telegram · Crypto ou virement · Clé activable immédiatement
          </p>
        </div>
      </section>

      <Divider />

      {/* ── FAQ ───────────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 14px' }}>FAQ</p>
            <h2 style={{ fontSize: 'clamp(26px,4vw,44px)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0, color: '#F2F0FF' }}>
              On répond à{' '}
              <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tout.</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {QA.map((item, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{
                  width: '100%', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 12,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#F2F0FF' }}>{item.q}</span>
                  <span style={{ color: 'rgba(167,139,250,0.5)', fontSize: 18, lineHeight: 1, flexShrink: 0, transition: 'transform 0.2s', display: 'inline-block', transform: faqOpen === i ? 'rotate(45deg)' : 'none' }}>+</span>
                </button>
                {faqOpen === i && (
                  <div style={{ padding: '0 18px 16px', fontSize: 13, color: 'rgba(148,163,184,0.6)', lineHeight: 1.7 }}>{item.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <footer style={{ position: 'relative', zIndex: 1, padding: '32px 24px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <img src="/logo.png" alt="ScaleFlow" style={{ width: 28, height: 28, borderRadius: 7 }} />
              <span style={{ fontSize: 15, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.3px' }}>ScaleFlow</span>
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
              {[['#features','Fonctionnalités'], ['#pricing','Tarifs'], ['#faq','FAQ'], [TELEGRAM_URL,'Telegram']].map(([href, label]) => (
                <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                  style={{ color: 'rgba(148,163,184,0.4)', textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.8)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.4)')}
                >{label}</a>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.25)', margin: 0 }}>© {new Date().getFullYear()} ScaleFlow. Tous droits réservés.</p>
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.25)', margin: 0, fontStyle: 'italic', letterSpacing: '0.04em' }}>La révolution commence.</p>
          </div>
        </div>
      </footer>

    </div>
  )
}
