import { useState, useEffect, useRef } from 'react'
import { AuthPage } from '@/components/auth/AuthPage'

const TELEGRAM_URL = 'https://t.me/+drqJbwraMag5M2I0'
const LAUNCH_DATE  = new Date('2026-06-01T00:00:00')

// ── Logo SVG (S mark, no background) ─────────────────────────────────────────
function SFMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="sf-main" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"  stopColor="#1d4ed8"/>
          <stop offset="28%" stopColor="#3b5af0"/>
          <stop offset="58%" stopColor="#7c3aed"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <linearGradient id="sf-dep" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"  stopColor="#0c1f6e" stopOpacity="0.6"/>
          <stop offset="55%" stopColor="#2e1065" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#3b0764" stopOpacity="0.6"/>
        </linearGradient>
        <linearGradient id="sf-arr" x1="66" y1="24" x2="90" y2="1" gradientUnits="userSpaceOnUse">
          <stop offset="0%"  stopColor="#db2777"/>
          <stop offset="100%" stopColor="#f472b6"/>
        </linearGradient>
      </defs>
      {/* depth shadow */}
      <path d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#sf-dep)" strokeWidth="18" strokeLinecap="round" fill="none" transform="translate(2.5,4.5)"/>
      {/* main stroke */}
      <path d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#sf-main)" strokeWidth="16" strokeLinecap="round" fill="none"/>
      {/* arrow */}
      <line x1="66" y1="22" x2="88" y2="2"  stroke="url(#sf-arr)" strokeWidth="11" strokeLinecap="round"/>
      <line x1="77" y1="1"  x2="90" y2="1"  stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
      <line x1="90" y1="1"  x2="90" y2="15" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
    </svg>
  )
}

// ── "Drawn" text — La révolution commence ────────────────────────────────────
function DrawnPhrase() {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <svg viewBox="0 0 420 52" width="420" height="52" style={{ maxWidth: '90vw', display: 'block', overflow: 'visible' }}>
        <defs>
          <filter id="rough" x="-5%" y="-20%" width="110%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03 0.06" numOctaves="3" seed="5" result="noise"/>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
        </defs>
        {/* main text */}
        <text
          x="210" y="34"
          textAnchor="middle"
          style={{
            fontSize: 28,
            fontWeight: 700,
            fontStyle: 'italic',
            fill: 'rgba(196,181,253,0.82)',
            letterSpacing: '0.04em',
            fontFamily: "'Georgia', 'Times New Roman', serif",
          }}
          filter="url(#rough)"
        >
          La révolution commence.
        </text>
        {/* hand-drawn underline — wavy path */}
        <path
          d="M 32,44 C 60,41 90,47 120,43 C 150,39 180,46 210,44 C 240,42 270,47 300,43 C 330,39 360,46 388,44"
          fill="none"
          stroke="rgba(167,139,250,0.45)"
          strokeWidth="1.8"
          strokeLinecap="round"
          filter="url(#rough)"
        />
        {/* small star doodle left */}
        <path d="M 14,26 L 16,20 L 18,26 L 24,26 L 19,30 L 21,36 L 16,32 L 11,36 L 13,30 L 8,26 Z"
          fill="none" stroke="rgba(236,72,153,0.4)" strokeWidth="1.2" strokeLinejoin="round"
          filter="url(#rough)"/>
        {/* small star doodle right */}
        <path d="M 406,26 L 408,20 L 410,26 L 416,26 L 411,30 L 413,36 L 408,32 L 403,36 L 405,30 L 400,26 Z"
          fill="none" stroke="rgba(167,139,250,0.4)" strokeWidth="1.2" strokeLinejoin="round"
          filter="url(#rough)"/>
      </svg>
    </div>
  )
}

// ── Star canvas background ────────────────────────────────────────────────────
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize(); window.addEventListener('resize', resize)
    type Star = { x: number; y: number; r: number; alpha: number; speed: number; phase: number }
    const stars: Star[] = Array.from({ length: 180 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.0 + 0.15,
      alpha: Math.random() * 0.5 + 0.08,
      speed: Math.random() * 0.005 + 0.002,
      phase: Math.random() * Math.PI * 2,
    }))
    let frame = 0, raf: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height); frame++
      for (const s of stars) {
        const a = s.alpha * (0.5 + 0.5 * Math.sin(s.phase + frame * s.speed))
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,190,255,${a})`; ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.65 }} />
}

// ── Auth modal ────────────────────────────────────────────────────────────────
function AuthModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
        <button onClick={onClose} style={{ position: 'absolute', top: -14, right: -14, zIndex: 10, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12121c', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(148,163,184,0.7)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        <AuthPage />
      </div>
    </div>
  )
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function useCountdown() {
  const calc = () => {
    const diff = LAUNCH_DATE.getTime() - Date.now()
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, launched: true }
    return { days: Math.floor(diff / 86400000), hours: Math.floor((diff % 86400000) / 3600000), minutes: Math.floor((diff % 3600000) / 60000), seconds: Math.floor((diff % 60000) / 1000), launched: false }
  }
  const [t, setT] = useState(calc)
  useEffect(() => { const id = setInterval(() => setT(calc()), 1000); return () => clearInterval(id) }, [])
  return t
}

function CountdownBlock() {
  const { days, hours, minutes, seconds, launched } = useCountdown()
  if (launched) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const unit = (v: number, label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 76, height: 76, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.18)', fontSize: 34, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.05em', fontVariantNumeric: 'tabular-nums' }}>{pad(v)}</div>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(148,163,184,0.32)' }}>{label}</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, margin: '52px 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 14px', borderRadius: 99, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.16)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ouverture le 1er Juin 2026</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {unit(days, 'jours')}
        <span style={{ fontSize: 26, fontWeight: 900, color: 'rgba(139,92,246,0.25)', marginTop: 20, lineHeight: 1 }}>:</span>
        {unit(hours, 'heures')}
        <span style={{ fontSize: 26, fontWeight: 900, color: 'rgba(139,92,246,0.25)', marginTop: 20, lineHeight: 1 }}>:</span>
        {unit(minutes, 'min')}
        <span style={{ fontSize: 26, fontWeight: 900, color: 'rgba(139,92,246,0.25)', marginTop: 20, lineHeight: 1 }}>:</span>
        {unit(seconds, 'sec')}
      </div>
    </div>
  )
}

// ── App mockup screenshots ────────────────────────────────────────────────────
function AppMockup() {
  return (
    <div style={{ maxWidth: 1020, margin: '0 auto', position: 'relative' }}>
      {/* Glow behind */}
      <div style={{ position: 'absolute', inset: '-20px', borderRadius: 32, background: 'radial-gradient(ellipse at 50% 50%, rgba(124,58,237,0.18) 0%, transparent 70%)', filter: 'blur(30px)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(139,92,246,0.22)', boxShadow: '0 40px 100px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03)', background: '#08080f' }}>
        {/* Chrome bar */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.045)', display: 'flex', alignItems: 'center', gap: 8, background: '#0b0b16' }}>
          {['#ef4444','#f59e0b','#22c55e'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.5 }} />)}
          <div style={{ flex: 1, margin: '0 10px', height: 20, borderRadius: 5, background: 'rgba(255,255,255,0.035)', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
            <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.22)' }}>scaleflow-fvtu.vercel.app</span>
          </div>
        </div>

        {/* App shell */}
        <div style={{ display: 'flex', height: 520 }}>

          {/* Sidebar */}
          <div style={{ width: 200, background: '#07070c', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', padding: '16px 10px', gap: 2, flexShrink: 0 }}>
            {/* Logo in sidebar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 12 }}>
              <SFMark size={22} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.3px' }}>ScaleFlow</span>
            </div>
            {/* Nav items */}
            {[
              { icon: '📊', label: 'Dashboard',       active: false },
              { icon: '📱', label: 'Téléphones',      active: false },
              { icon: '⚡', label: 'Mass Posting',    active: true  },
              { icon: '📅', label: 'Programmation',   active: false },
              { icon: '🗂', label: 'Banque vidéos',   active: false },
              { icon: '🔀', label: 'Remix vidéo',     active: false },
              { icon: '🤖', label: 'Outils IA',       active: false },
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, fontSize: 12,
                background: item.active ? 'rgba(124,58,237,0.15)' : 'transparent',
                color: item.active ? '#a78bfa' : 'rgba(148,163,184,0.45)',
                borderLeft: item.active ? '2px solid #7c3aed' : '2px solid transparent',
              }}>
                <span style={{ fontSize: 13 }}>{item.icon}</span>
                <span style={{ fontWeight: item.active ? 600 : 400 }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Main content — Mass Posting mockup */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#07070c' }}>
            {/* Header */}
            <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#F2F0FF', margin: 0 }}>Mass Posting</p>
                <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', margin: '2px 0 0' }}>Poster sur plusieurs comptes en parallèle</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>Paramètres</div>
                <div style={{ padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(130deg,#7c3aed,#ec4899)', fontSize: 11, color: '#fff', fontWeight: 700 }}>▶ Lancer</div>
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Left col — phone list */}
              <div style={{ width: 220, borderRight: '1px solid rgba(255,255,255,0.04)', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flexShrink: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.3)', padding: '0 6px', margin: '0 0 6px' }}>12 Téléphones</p>
                {[
                  { name: 'Phone_001', grp: 'Groupe A', online: true,  sel: true  },
                  { name: 'Phone_002', grp: 'Groupe A', online: true,  sel: true  },
                  { name: 'Phone_003', grp: 'Groupe B', online: false, sel: false },
                  { name: 'Phone_004', grp: 'Groupe B', online: true,  sel: true  },
                  { name: 'Phone_005', grp: 'Groupe A', online: true,  sel: true  },
                  { name: 'Phone_006', grp: 'Groupe C', online: false, sel: false },
                ].map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 7, background: p.sel ? 'rgba(124,58,237,0.10)' : 'transparent', border: p.sel ? '1px solid rgba(124,58,237,0.18)' : '1px solid transparent' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.online ? '#22c55e' : 'rgba(148,163,184,0.2)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: p.sel ? '#c4b5fd' : 'rgba(148,163,184,0.45)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <p style={{ fontSize: 9, color: 'rgba(148,163,184,0.28)', margin: 0 }}>{p.grp}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right col — config + log */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
                {/* Video zone */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.3)', margin: '0 0 8px' }}>Vidéos sélectionnées — 3</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['#7c3aed','#ec4899','#3b82f6'].map((c, i) => (
                      <div key={i} style={{ width: 52, height: 52, borderRadius: 8, background: `${c}18`, border: `1px solid ${c}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎬</div>
                    ))}
                    <div style={{ width: 52, height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'rgba(148,163,184,0.25)' }}>+</div>
                  </div>
                </div>

                {/* Caption */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.3)', margin: '0 0 6px' }}>Caption</p>
                  <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: 'rgba(148,163,184,0.4)', fontStyle: 'italic' }}>
                    La révolution est en marche 🚀 #scaleflow #instagram ...
                  </div>
                </div>

                {/* Live log */}
                <div style={{ flex: 1, padding: '10px 16px', overflowY: 'auto' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.3)', margin: '0 0 8px' }}>Journal en temps réel</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: 'monospace' }}>
                    {[
                      { t: '14:22:01', msg: '✅ Phone_001 — Publication réussie', c: '#22c55e' },
                      { t: '14:22:03', msg: '✅ Phone_002 — Publication réussie', c: '#22c55e' },
                      { t: '14:22:05', msg: '⏳ Phone_004 — Upload en cours…', c: '#a78bfa' },
                      { t: '14:22:07', msg: '✅ Phone_005 — Publication réussie', c: '#22c55e' },
                      { t: '14:22:09', msg: '⏳ Phone_004 — Posting…', c: '#a78bfa' },
                    ].map((l, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                        <span style={{ color: 'rgba(148,163,184,0.25)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{l.t}</span>
                        <span style={{ color: l.c }}>{l.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating stat cards */}
      <div style={{ position: 'absolute', bottom: -28, left: 40, display: 'flex', gap: 10 }}>
        {[
          { label: 'Publiés', value: '4/6', color: '#22c55e' },
          { label: 'En cours', value: '1', color: '#a78bfa' },
          { label: 'Téléphones en ligne', value: '9/12', color: '#38bdf8' },
        ].map(c => (
          <div key={c.label} style={{ padding: '8px 14px', borderRadius: 10, background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F2F0FF' }}>{c.value}</span>
            <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)' }}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '⚡', title: 'Mass Posting',      color: '#a78bfa', text: 'Poste sur des dizaines de comptes en parallèle. Sélectionne tes vidéos, lance — chaque téléphone se ferme après sa publication.' },
  { icon: '🗂', title: 'Banque de contenu', color: '#ec4899', text: 'Organise et stocke tes vidéos dans le cloud. Import drag & drop, miniatures auto, partage par organisation.' },
  { icon: '🔀', title: 'Remix & CloneVid',  color: '#38bdf8', text: 'Génère des copies uniques via FFmpeg : zoom, couleurs, crop, overlay texte. Anti duplicate content à grande échelle.' },
  { icon: '🤖', title: 'Outils IA',         color: '#34d399', text: 'Scripts, hooks, captions virales, analyse thumbnail. Powered by Groq Llama & Claude Vision.' },
  { icon: '📅', title: 'Programmation',     color: '#fbbf24', text: "Planifie tes posts. Le scheduler s'exécute même app fermée via Supabase Edge Functions." },
  { icon: '📱', title: 'Suivi téléphones',  color: '#f472b6', text: "Status temps réel de chaque GéeLark phone, sync auto, gestion par groupes et sessions Instagram." },
]

// ── Pricing ───────────────────────────────────────────────────────────────────
const PLANS = [
  { name: 'Standard', price: '49,99$', period: '/mois', accent: '#60a5fa', features: ['2 500 crédits / mois', '50 téléphones max', 'Toutes les fonctionnalités', 'Mass Posting — 10 comptes max', 'Support 24/7'] },
  { name: 'Pro', price: '99,99$', period: '/mois', accent: '#c084fc', popular: true, features: ['5 500 crédits / mois', '200 téléphones max', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7'] },
  { name: 'Organisation', price: '149,99$', period: '/mois', accent: '#34d399', features: ['11 000 crédits / mois', 'Téléphones illimités', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support prioritaire', "Suggestions d'ajouts avec les devs"] },
]

// ── FAQ ───────────────────────────────────────────────────────────────────────
const QA = [
  { q: "C'est quoi ScaleFlow ?",          a: "Une app pour gérer en masse tes comptes Instagram : poster sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives." },
  { q: "J'ai besoin de quoi ?",           a: "Un abonnement GéeLark (cloud phones) + ton bearer token. ScaleFlow se connecte à GéeLark pour piloter tes téléphones virtuels." },
  { q: "Différence Standard vs Pro ?",   a: "Standard = 2 500 crédits/mois + outils de base. Pro = 5 500 crédits + Mass Posting illimité + organisations multi-membres + support prioritaire." },
  { q: "C'est risqué pour mes comptes ?", a: "ScaleFlow utilise GéeLark qui simule de vrais devices avec leurs propres IPs/sessions. Warmup intégré pour respecter les rythmes humains." },
  { q: "Version web ou téléchargement ?", a: "Les deux. L'Electron (.exe/.dmg) est plus rapide. La version web est accessible depuis n'importe où." },
  { q: "Comment contacter le support ?",  a: "Via Telegram (@justquentin), réponse en moins d'1h. Ou via les tickets dans l'app." },
]

// ── Divider ───────────────────────────────────────────────────────────────────
const Divider = () => <div style={{ maxWidth: 1100, margin: '0 auto', height: 1, background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.12), transparent)' }} />

// ── TG icon ───────────────────────────────────────────────────────────────────
const TGIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
  </svg>
)

// ── Main ──────────────────────────────────────────────────────────────────────
export function Landing() {
  const [showAuth, setShowAuth] = useState(false)
  const [faqOpen, setFaqOpen]   = useState<number | null>(null)

  return (
    <div style={{ minHeight: '100vh', background: '#06060f', color: '#F2F0FF', overflowX: 'hidden', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <StarField />

      {/* Nebula glows */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-15%', left: '30%', width: 1000, height: 1000, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(109,40,217,0.11), transparent)', filter: 'blur(50px)' }} />
        <div style={{ position: 'absolute', top: '40%', right: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(236,72,153,0.07), transparent)', filter: 'blur(50px)' }} />
        <div style={{ position: 'absolute', bottom: '5%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(56,189,248,0.04), transparent)', filter: 'blur(50px)' }} />
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(6,6,15,0.8)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <SFMark size={28} />
            <span style={{ fontSize: 15, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.3px' }}>ScaleFlow</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {[['#features','Fonctionnalités'], ['#pricing','Tarifs'], ['#faq','FAQ']].map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: 13, color: 'rgba(148,163,184,0.55)', textDecoration: 'none', padding: '6px 12px', borderRadius: 8, transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F2F0FF')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.55)')}>
                {label}
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#F2F0FF', textDecoration: 'none', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}>
              <TGIcon /> Acheter une clé
            </a>
            <button onClick={() => setShowAuth(true)} style={{ padding: '7px 16px', borderRadius: 9, background: 'linear-gradient(130deg,#7c3aed,#a855f7)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,58,237,0.3)', transition: 'opacity 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Se connecter →
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '100px 24px 50px', textAlign: 'center' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>

          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 99, marginBottom: 28, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: 'rgba(148,163,184,0.55)', letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase' }}>
            <SFMark size={14} />
            ScaleFlow — Instagram Automation
          </div>

          {/* Drawn phrase */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <DrawnPhrase />
          </div>

          {/* Headline */}
          <h1 style={{ fontSize: 'clamp(44px,8vw,84px)', fontWeight: 900, lineHeight: 1.02, letterSpacing: '-0.045em', margin: '0 0 26px', color: '#F2F0FF' }}>
            Gère 100+ comptes<br />
            <span style={{ background: 'linear-gradient(120deg,#a78bfa 0%,#ec4899 55%,#38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              sans effort.
            </span>
          </h1>

          <p style={{ fontSize: 17, color: 'rgba(148,163,184,0.58)', maxWidth: 480, margin: '0 auto 44px', lineHeight: 1.7 }}>
            Mass posting, IA, banque de contenu, stats temps réel.<br />
            Tout ce qu'il faut pour scaler ton empire Instagram.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => setShowAuth(true)} style={{ padding: '14px 34px', borderRadius: 12, background: 'linear-gradient(130deg,#7c3aed,#ec4899)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 32px rgba(124,58,237,0.35)', transition: 'transform 0.15s, box-shadow 0.15s', letterSpacing: '-0.01em' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(124,58,237,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 32px rgba(124,58,237,0.35)' }}>
              🚀 Accéder à l'app
            </button>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{ padding: '14px 28px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#F2F0FF', fontSize: 15, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'background 0.15s, border-color 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}>
              <TGIcon size={16} /> Acheter une clé
            </a>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', marginTop: 32, fontSize: 12, color: 'rgba(148,163,184,0.35)' }}>
            {['✓ Mac & Windows', '✓ Version web disponible', '✓ Activation instantanée'].map(t => <span key={t}>{t}</span>)}
          </div>

          {/* Countdown */}
          <CountdownBlock />
        </div>
      </section>

      {/* ── App mockup ───────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '60px 24px 100px' }}>
        <AppMockup />
      </section>

      <Divider />

      {/* ── Features ──────────────────────────────────────────────────────────── */}
      <section id="features" style={{ position: 'relative', zIndex: 1, padding: '90px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 14px' }}>Tout pour scaler</p>
            <h2 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 16px', color: '#F2F0FF' }}>
              Une seule app,{' '}
              <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tout dedans.</span>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(148,163,184,0.5)', maxWidth: 460, margin: '0 auto' }}>Plus besoin de jongler entre 10 outils différents.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: '22px', transition: 'border-color 0.2s, transform 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${f.color}35`; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = '' }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: `${f.color}10`, border: `1px solid ${f.color}20` }}>{f.icon}</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#F2F0FF', margin: '0 0 7px' }}>{f.title}</p>
                <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)', margin: 0, lineHeight: 1.65 }}>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Telegram CTA ─────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ borderRadius: 22, padding: '48px 36px', background: 'linear-gradient(135deg,rgba(124,58,237,0.08),rgba(236,72,153,0.05))', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 0 60px rgba(124,58,237,0.07)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(130deg,rgba(124,58,237,0.2),rgba(236,72,153,0.15))', border: '1px solid rgba(139,92,246,0.3)' }}>
              <TGIcon size={24} />
            </div>
            <h3 style={{ fontSize: 26, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.03em', margin: '0 0 10px' }}>Acheter une clé ScaleFlow</h3>
            <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.5)', margin: '0 0 28px', lineHeight: 1.6 }}>Activation immédiate après paiement.<br />Paiement via Telegram — crypto ou virement.</p>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '14px 32px', borderRadius: 12, background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', fontSize: 15, fontWeight: 800, textDecoration: 'none', boxShadow: '0 8px 28px rgba(124,58,237,0.4)', transition: 'opacity 0.15s, transform 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = '' }}>
              <TGIcon size={16} /> Rejoindre sur Telegram
            </a>
            <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.28)', marginTop: 18 }}>Réponse en moins d'1h · Support inclus avec chaque plan</p>
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Pricing ───────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 14px' }}>Tarifs</p>
            <h2 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 14px', color: '#F2F0FF' }}>
              Choisis ton{' '}
              <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>plan.</span>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(148,163,184,0.5)' }}>Tout est inclus dès le Standard. Activation via Telegram.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(265px,1fr))', gap: 14 }}>
            {PLANS.map(p => (
              <div key={p.name} style={{ position: 'relative', background: '#0a0a14', borderRadius: 18, padding: '28px 24px', border: p.popular ? '1.5px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', boxShadow: p.popular ? '0 0 50px rgba(124,58,237,0.1)' : 'none' }}>
                {p.popular && <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', borderRadius: 99, fontSize: 10, fontWeight: 900, color: '#fff', letterSpacing: '0.1em', background: 'linear-gradient(130deg,#7c3aed,#ec4899)', whiteSpace: 'nowrap' }}>POPULAIRE</div>}
                <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: p.accent, margin: '0 0 8px' }}>{p.name}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 22 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.04em' }}>{p.price}</span>
                  <span style={{ fontSize: 13, color: 'rgba(148,163,184,0.38)' }}>{p.period}</span>
                </div>
                <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'rgba(196,181,253,0.65)' }}>
                      <span style={{ color: p.accent, flexShrink: 0 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '11px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', transition: 'opacity 0.15s', ...(p.popular ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' } : { background: 'rgba(255,255,255,0.04)', border: `1px solid ${p.accent}28`, color: '#F2F0FF' }) }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                  Choisir {p.name} →
                </a>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(148,163,184,0.25)', marginTop: 24 }}>Paiement via Telegram · Crypto ou virement · Activation immédiate</p>
        </div>
      </section>

      <Divider />

      {/* ── FAQ ───────────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 14px' }}>FAQ</p>
            <h2 style={{ fontSize: 'clamp(26px,4vw,44px)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0, color: '#F2F0FF' }}>
              On répond à{' '}
              <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tout.</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {QA.map((item, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden' }}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{ width: '100%', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#F2F0FF' }}>{item.q}</span>
                  <span style={{ color: 'rgba(167,139,250,0.45)', fontSize: 18, lineHeight: 1, flexShrink: 0, transition: 'transform 0.2s', display: 'inline-block', transform: faqOpen === i ? 'rotate(45deg)' : 'none' }}>+</span>
                </button>
                {faqOpen === i && <div style={{ padding: '0 18px 16px', fontSize: 13, color: 'rgba(148,163,184,0.55)', lineHeight: 1.7 }}>{item.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <footer style={{ position: 'relative', zIndex: 1, padding: '32px 24px 44px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><SFMark size={26} /><span style={{ fontSize: 15, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.3px' }}>ScaleFlow</span></div>
            <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
              {[['#features','Fonctionnalités'], ['#pricing','Tarifs'], ['#faq','FAQ'], [TELEGRAM_URL,'Telegram']].map(([href, label]) => (
                <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                  style={{ color: 'rgba(148,163,184,0.35)', textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.75)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.35)')}>
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.22)', margin: 0 }}>© {new Date().getFullYear()} ScaleFlow. Tous droits réservés.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <DrawnPhrase />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
