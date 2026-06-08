import { useState, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '@/lib/i18n'
import { playNav, playTick } from '@/lib/sounds'
import type { Page } from '@/components/Layout'

// ── SVG icon paths ────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  phone:     'M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z',
  send:      'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  zap:       'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  calendar:  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  video:     'M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
  chat:      'M17 8h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v4l-4-4H9a1.994 1.994 0 0 1-1.414-.586m0 0L11 14h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v4',
  flame:     'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z',
  sparkles:  'M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  refresh:   'M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15',
  edit:      'M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  link:      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
}

type ToolDef = {
  id: Page
  labelKey: string
  descKey: string
  icon: keyof typeof ICONS
  accent: string       // "r,g,b"
  accent2: string      // second gradient stop "r,g,b"
  badge?: 'NEW' | 'BETA'
  category: 'instagram' | 'creation' | 'ai' | 'social'
  featured?: boolean
}

const TOOLS: ToolDef[] = [
  { id: 'phones',      labelKey: 'navPhones',      descKey: 'hubDescPhones',      icon: 'phone',    accent: '139,92,246',  accent2: '99,102,241',  category: 'instagram' },
  { id: 'storylink',   labelKey: 'navStoryLink',   descKey: 'hubDescStoryLink',   icon: 'link',     accent: '236,72,153',  accent2: '168,85,247',  category: 'instagram', badge: 'NEW', featured: true },
  { id: 'posting',     labelKey: 'navPosting',     descKey: 'hubDescPosting',     icon: 'send',     accent: '139,92,246',  accent2: '34,211,238',  category: 'instagram' },
  { id: 'massposting', labelKey: 'navMassPosting', descKey: 'hubDescMassPosting', icon: 'zap',      accent: '236,72,153',  accent2: '245,158,11',  category: 'instagram' },
  { id: 'scheduler',   labelKey: 'navScheduler',   descKey: 'hubDescScheduler',   icon: 'calendar', accent: '34,211,238',  accent2: '129,140,248', category: 'instagram' },
  { id: 'warmup',      labelKey: 'navWarmup',      descKey: 'hubDescWarmup',      icon: 'flame',    accent: '245,158,11',  accent2: '236,72,153',  category: 'instagram', badge: 'BETA' },
  { id: 'bank',        labelKey: 'navBank',        descKey: 'hubDescBank',        icon: 'video',    accent: '34,211,238',  accent2: '139,92,246',  category: 'creation' },
  { id: 'repurpose',   labelKey: 'navRepurpose',   descKey: 'hubDescRepurpose',   icon: 'zap',      accent: '168,85,247',  accent2: '34,211,238',  category: 'creation', badge: 'NEW', featured: true },
  { id: 'remix',       labelKey: 'navRemix',       descKey: 'hubDescRemix',       icon: 'refresh',  accent: '129,140,248', accent2: '34,211,238',  category: 'creation' },
  { id: 'mixer',       labelKey: 'navMixer',       descKey: 'hubDescMixer',       icon: 'edit',     accent: '236,72,153',  accent2: '139,92,246',  category: 'creation', badge: 'NEW' },
  { id: 'aitools',     labelKey: 'navAiTools',     descKey: 'hubDescAiTools',     icon: 'sparkles', accent: '168,85,247',  accent2: '236,72,153',  category: 'ai' },
  { id: 'community',   labelKey: 'navCommunity',   descKey: 'hubDescCommunity',   icon: 'chat',     accent: '34,211,238',  accent2: '129,140,248', category: 'social' },
]

const CATEGORIES: { id: ToolDef['category']; labelKey: string; icon: keyof typeof ICONS; accent: string }[] = [
  { id: 'instagram', labelKey: 'hubCatInstagram', icon: 'send',     accent: '139,92,246' },
  { id: 'creation',  labelKey: 'hubCatCreation',  icon: 'video',    accent: '34,211,238' },
  { id: 'ai',        labelKey: 'hubCatAI',        icon: 'sparkles', accent: '168,85,247' },
  { id: 'social',    labelKey: 'hubCatSocial',    icon: 'chat',     accent: '236,72,153' },
]

function IconGlyph({ icon, size = 24, color }: { icon: keyof typeof ICONS; size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[icon]} />
    </svg>
  )
}

// ── Decorative "cover" art — a premium gradient banner with mesh + grid ───────
function CoverArt({ a, a2, icon, hover }: { a: string; a2: string; icon: keyof typeof ICONS; hover: boolean }) {
  return (
    <div style={{
      position: 'relative', height: 92, overflow: 'hidden',
      background: `linear-gradient(135deg, rgba(${a},0.9), rgba(${a2},0.75))`,
    }}>
      {/* mesh orbs */}
      <div style={{ position: 'absolute', top: -30, right: -10, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, rgba(255,255,255,0.35), transparent 65%)`, filter: 'blur(8px)' }} />
      <div style={{ position: 'absolute', bottom: -40, left: 10, width: 110, height: 110, borderRadius: '50%', background: `radial-gradient(circle, rgba(${a2},0.6), transparent 65%)`, filter: 'blur(6px)' }} />
      {/* fine grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.18,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        maskImage: 'radial-gradient(ellipse at 70% 40%, black, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 70% 40%, black, transparent 75%)',
      }} />
      {/* big ghost icon */}
      <div style={{
        position: 'absolute', right: 14, bottom: -14,
        opacity: hover ? 0.5 : 0.32, transform: hover ? 'scale(1.08) rotate(-6deg)' : 'scale(1)',
        transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <IconGlyph icon={icon} size={76} color="rgba(255,255,255,0.85)" />
      </div>
      {/* bottom fade into card body */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 45%, rgba(13,13,20,0.55))' }} />
    </div>
  )
}

function badgeChip(badge: NonNullable<ToolDef['badge']>): React.CSSProperties {
  return badge === 'NEW'
    ? { background: 'rgba(16,185,129,0.9)', color: '#04140d', border: '1px solid rgba(52,211,153,0.5)' }
    : { background: 'rgba(245,158,11,0.92)', color: '#1a1102', border: '1px solid rgba(251,191,36,0.5)' }
}

// ── Tool card (with cover banner) ─────────────────────────────────────────────
function ToolCard({ tool, index, onOpen }: { tool: ToolDef; index: number; onOpen: () => void }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const a = tool.accent

  return (
    <button
      onClick={() => { playNav(); onOpen() }}
      onMouseEnter={() => { setHover(true); playTick() }}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', textAlign: 'left', display: 'flex', flexDirection: 'column',
        borderRadius: 18, cursor: 'pointer', overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(20,20,30,0.9), rgba(11,11,18,0.92))',
        border: `1px solid ${hover ? `rgba(${a},0.5)` : 'rgba(255,255,255,0.07)'}`,
        boxShadow: hover
          ? `0 22px 60px -16px rgba(${a},0.45), 0 0 0 1px rgba(${a},0.18)`
          : '0 2px 16px -6px rgba(0,0,0,0.55)',
        transform: hover ? 'translateY(-6px)' : 'translateY(0)',
        transition: 'transform 0.32s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.32s, border-color 0.3s',
        animation: 'hub-card-in 0.5s cubic-bezier(0.22,1,0.36,1) both',
        animationDelay: `${index * 0.045}s`,
      }}
    >
      <CoverArt a={tool.accent} a2={tool.accent2} icon={tool.icon} hover={hover} />

      {/* Floating icon badge overlapping the cover */}
      <div style={{
        position: 'absolute', top: 66, left: 18,
        width: 46, height: 46, borderRadius: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, rgba(${a},0.95), rgba(${tool.accent2},0.85))`,
        border: '1.5px solid rgba(255,255,255,0.16)',
        boxShadow: `0 8px 22px -6px rgba(${a},0.6)`,
        transform: hover ? 'scale(1.06) translateY(-2px)' : 'scale(1)',
        transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <IconGlyph icon={tool.icon} size={22} color="#fff" />
      </div>

      {tool.badge && (
        <span style={{
          position: 'absolute', top: 12, right: 12,
          fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '3px 8px', borderRadius: 6, ...badgeChip(tool.badge),
        }}>
          {tool.badge}
        </span>
      )}

      {/* Body */}
      <div style={{ padding: '34px 18px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: hover ? '#fff' : '#e8e6f0', transition: 'color 0.2s' }}>
          {t(tool.labelKey as any)}
        </p>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(148,163,184,0.62)', flex: 1 }}>
          {t(tool.descKey as any)}
        </p>
        <div style={{
          marginTop: 14, display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11.5, fontWeight: 600,
          color: hover ? `rgb(${a})` : 'rgba(148,163,184,0.4)', transition: 'color 0.25s',
        }}>
          <span>{t('hubOpen')}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: hover ? 'translateX(3px)' : 'translateX(0)', transition: 'transform 0.25s' }}>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </div>
      </div>
    </button>
  )
}

// ── Featured spotlight banner (big) ───────────────────────────────────────────
function SpotlightBanner({ tool, onOpen }: { tool: ToolDef; onOpen: () => void }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const { accent: a, accent2: a2 } = tool
  return (
    <button
      onClick={() => { playNav(); onOpen() }}
      onMouseEnter={() => { setHover(true); playTick() }}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', overflow: 'hidden', textAlign: 'left', cursor: 'pointer',
        borderRadius: 22, padding: '30px 32px', minHeight: 168, width: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        background: `linear-gradient(115deg, rgba(${a},0.22), rgba(${a2},0.1) 55%, rgba(13,13,20,0.6))`,
        border: `1px solid ${hover ? `rgba(${a},0.5)` : `rgba(${a},0.25)`}`,
        boxShadow: hover ? `0 26px 70px -18px rgba(${a},0.5)` : `0 8px 36px -14px rgba(${a},0.35)`,
        transform: hover ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 0.35s cubic-bezier(0.34,1.4,0.64,1)',
      }}
    >
      {/* art orbs */}
      <div style={{ position: 'absolute', top: -60, right: 40, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, rgba(${a},0.4), transparent 65%)`, filter: 'blur(40px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -80, right: -40, width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, rgba(${a2},0.35), transparent 65%)`, filter: 'blur(36px)', pointerEvents: 'none' }} />
      {/* ghost icon */}
      <div style={{ position: 'absolute', right: 34, top: '50%', transform: `translateY(-50%) ${hover ? 'scale(1.08) rotate(-6deg)' : 'scale(1)'}`, opacity: 0.5, transition: 'all 0.45s cubic-bezier(0.34,1.56,0.64,1)', pointerEvents: 'none' }}>
        <IconGlyph icon={tool.icon} size={130} color={`rgba(${a},0.9)`} />
      </div>

      <div style={{ position: 'relative', maxWidth: '70%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, rgba(${a},0.95), rgba(${a2},0.85))`,
            border: '1.5px solid rgba(255,255,255,0.18)', boxShadow: `0 8px 22px -6px rgba(${a},0.6)`,
          }}>
            <IconGlyph icon={tool.icon} size={21} color="#fff" />
          </div>
          {tool.badge && (
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 7, ...badgeChip(tool.badge) }}>
              ✦ {tool.badge}
            </span>
          )}
        </div>
        <p style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', color: '#fff', marginBottom: 7 }}>
          {t(tool.labelKey as any)}
        </p>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'rgba(226,232,240,0.7)', maxWidth: 420 }}>
          {t(tool.descKey as any)}
        </p>
        <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: `rgb(${a})` }}>
          <span>{t('hubOpen')}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: hover ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 0.25s' }}>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </div>
      </div>
    </button>
  )
}

// ── Category section ──────────────────────────────────────────────────────────
function CategorySection({ icon, accent, title, tools, baseIndex, onNavigate }: {
  icon: keyof typeof ICONS; accent: string; title: string; tools: ToolDef[]; baseIndex: number; onNavigate: (p: Page) => void
}) {
  if (!tools.length) return null
  return (
    <section style={{ marginBottom: 42 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, rgba(${accent},0.95), rgba(${accent},0.55))`,
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: `0 4px 14px -4px rgba(${accent},0.6)`,
        }}>
          <IconGlyph icon={icon} size={15} color="#fff" />
        </span>
        <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', color: '#e8e6f0' }}>{title}</h2>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.08), transparent)' }} />
        <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', fontWeight: 600 }}>{tools.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(264px, 1fr))', gap: 18 }}>
        {tools.map((tool, i) => (
          <ToolCard key={tool.id} tool={tool} index={baseIndex + i} onOpen={() => onNavigate(tool.id)} />
        ))}
      </div>
    </section>
  )
}

export default function Hub({ user, onNavigate }: { user: User; onNavigate: (p: Page) => void }) {
  const t = useT()
  const [query, setQuery] = useState('')

  const firstName = (user.email?.split('@')[0] ?? 'créateur').replace(/[._]/g, ' ')
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6)  return t('hubGreetingNight')
    if (h < 12) return t('hubGreetingMorning')
    if (h < 18) return t('hubGreetingAfternoon')
    return t('hubGreetingEvening')
  })()

  const q = query.trim().toLowerCase()
  const matches = (tool: ToolDef) =>
    !q || t(tool.labelKey as any).toLowerCase().includes(q) || t(tool.descKey as any).toLowerCase().includes(q)
  const searchResults = useMemo(() => TOOLS.filter(matches), [q, t])
  const featured = TOOLS.filter(tl => tl.featured)

  const quickActions: { id: Page; label: string; icon: keyof typeof ICONS; a: string }[] = [
    { id: 'massposting', label: t('navMassPosting'), icon: 'zap',   a: '236,72,153' },
    { id: 'storylink',   label: t('navStoryLink'),   icon: 'link',  a: '168,85,247' },
    { id: 'bank',        label: t('navBank'),        icon: 'video', a: '34,211,238' },
  ]

  return (
    <div style={{ minHeight: '100%', padding: '0 0 80px', overflow: 'hidden' }}>
      {/* ── Hero banner (full bleed) ────────────────────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden', padding: '46px 40px 38px', marginBottom: 8 }}>
        {/* layered mesh background */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: -120, left: '6%', width: 520, height: 320, background: 'radial-gradient(ellipse, rgba(124,58,237,0.32), transparent 65%)', filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', top: -80, right: '4%', width: 460, height: 300, background: 'radial-gradient(ellipse, rgba(34,211,238,0.2), transparent 65%)', filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', bottom: -160, left: '40%', width: 420, height: 280, background: 'radial-gradient(ellipse, rgba(236,72,153,0.16), transparent 65%)', filter: 'blur(60px)' }} />
          {/* subtle dotted grid */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.5,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'linear-gradient(to bottom, black, transparent 80%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 80%)',
          }} />
        </div>

        <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', animation: 'page-fade-in 0.5s ease both' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 100, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 18 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#22d3ee)', boxShadow: '0 0 8px rgba(139,92,246,0.7)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(196,181,253,0.85)' }}>{greeting.replace(/,\s*$/, '')}</span>
          </div>

          <h1 style={{ fontSize: 46, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.02, marginBottom: 16, textTransform: 'capitalize' }}>
            <span style={{ background: 'linear-gradient(120deg,#f2f0ff,#c4b5fd 50%,#67e8f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {firstName}
            </span>
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(148,163,184,0.66)', maxWidth: 600, lineHeight: 1.55, marginBottom: 26 }}>
            {t('hubSubtitle')}
          </p>

          {/* Quick actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {quickActions.map(qa => (
              <button key={qa.id}
                onClick={() => { playNav(); onNavigate(qa.id) }}
                onMouseEnter={() => playTick()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, height: 42, padding: '0 18px 0 14px',
                  borderRadius: 12, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#e8e6f0',
                  background: `linear-gradient(135deg, rgba(${qa.a},0.16), rgba(255,255,255,0.02))`,
                  border: `1px solid rgba(${qa.a},0.3)`,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 10px 26px -10px rgba(${qa.a},0.55)` }}
                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <span style={{ display: 'flex', color: `rgb(${qa.a})` }}><IconGlyph icon={qa.icon} size={17} color={`rgb(${qa.a})`} /></span>
                {qa.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 40px' }}>
        {/* ── Search ────────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', maxWidth: 440, marginBottom: 34 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('hubSearchPlaceholder')}
            style={{
              width: '100%', height: 46, paddingLeft: 44, paddingRight: 16,
              borderRadius: 13, fontSize: 14,
              background: 'rgba(14,14,22,0.8)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#e8e6f0', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>

        {/* ── Featured spotlights ───────────────────────────────────────────── */}
        {!q && featured.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: featured.length > 1 ? 'repeat(auto-fit, minmax(380px, 1fr))' : '1fr', gap: 18, marginBottom: 44 }}>
            {featured.map(tool => (
              <SpotlightBanner key={tool.id} tool={tool} onOpen={() => onNavigate(tool.id)} />
            ))}
          </div>
        )}

        {/* ── Tools ─────────────────────────────────────────────────────────── */}
        {q ? (
          searchResults.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(264px, 1fr))', gap: 18 }}>
              {searchResults.map((tool, i) => (
                <ToolCard key={tool.id} tool={tool} index={i} onOpen={() => onNavigate(tool.id)} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', color: 'rgba(148,163,184,0.5)' }}>
              <span style={{
                width: 56, height: 56, borderRadius: 18, marginBottom: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
              </span>
              <p style={{ fontSize: 15 }}>{t('hubNoResults')}</p>
            </div>
          )
        ) : (
          CATEGORIES.map((cat, ci) => {
            const tools = TOOLS.filter(tl => tl.category === cat.id)
            const baseIndex = TOOLS.filter(tl => CATEGORIES.findIndex(c => c.id === tl.category) < ci).length
            return (
              <CategorySection
                key={cat.id}
                icon={cat.icon}
                accent={cat.accent}
                title={t(cat.labelKey as any)}
                tools={tools}
                baseIndex={baseIndex}
                onNavigate={onNavigate}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
