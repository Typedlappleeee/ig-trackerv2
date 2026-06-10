import { useState, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '@/lib/i18n'
import { playNav, playTick } from '@/lib/sounds'
import type { Page } from '@/components/Layout'

// ── SVG icon paths ─────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  phone:     'M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z',
  send:      'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  zap:       'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  calendar:  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  video:     'M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
  chat:      'M17 8h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v4l-4-4H9a1.994 1.994 0 0 1-1.414-.586m0 0L11 14h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v4',
  flame:     'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z',
  sparkles:  'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
  refresh:   'M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15',
  edit:      'M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  link:      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  arrow:     'M5 12h14M13 6l6 6-6 6',
}

type ToolDef = {
  id: Page
  labelKey: string
  descKey: string
  icon: keyof typeof ICONS
  accent: string
  accent2: string
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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.85"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[icon]} />
    </svg>
  )
}

// ── Badge chip helper ──────────────────────────────────────────────────────────
function BadgeChip({ badge }: { badge: NonNullable<ToolDef['badge']> }) {
  const isNew = badge === 'NEW'
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '2.5px 7px', borderRadius: 5,
      background: isNew ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)',
      color: isNew ? '#34d399' : '#fbbf24',
      border: `1px solid ${isNew ? 'rgba(52,211,153,0.35)' : 'rgba(251,191,36,0.35)'}`,
    }}>
      {badge}
    </span>
  )
}

// ── Decorative 3D Sphere (pure CSS/SVG) ───────────────────────────────────────
function DecoSphere() {
  return (
    <div style={{ position: 'absolute', right: -20, top: '50%', transform: 'translateY(-54%)', width: 300, height: 300, pointerEvents: 'none' }}>
      {/* Outer glow */}
      <div style={{
        position: 'absolute', inset: -40,
        background: 'radial-gradient(circle at 45% 40%, rgba(99,102,241,0.35) 0%, rgba(124,58,237,0.2) 40%, transparent 70%)',
        filter: 'blur(24px)',
      }} />
      {/* Sphere body */}
      <div style={{
        position: 'absolute', inset: 20,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #4c3a8a 0%, #2d1f5e 35%, #18103a 65%, #0c0820 100%)',
        boxShadow: '0 0 60px -10px rgba(99,102,241,0.6), inset 0 2px 20px rgba(255,255,255,0.06), inset -10px -10px 30px rgba(0,0,0,0.5)',
      }} />
      {/* Highlight */}
      <div style={{
        position: 'absolute', top: 46, left: 60, width: 60, height: 36,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(255,255,255,0.22) 0%, transparent 80%)',
        filter: 'blur(4px)',
      }} />
      {/* Ring */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%) rotateX(72deg)',
        width: 280, height: 280, borderRadius: '50%',
        border: '1.5px solid rgba(139,92,246,0.35)',
        boxShadow: '0 0 20px rgba(139,92,246,0.2)',
      }} />
      {/* Sparkle stars */}
      {[
        { top: 14, left: 130, size: 14, opacity: 0.9 },
        { top: 60, left: 240, size: 10, opacity: 0.7 },
        { top: 220, left: 260, size: 8,  opacity: 0.6 },
        { top: 10,  left: 50,  size: 7,  opacity: 0.5 },
      ].map((s, i) => (
        <svg key={i} width={s.size} height={s.size} viewBox="0 0 24 24" fill="rgba(196,181,253,0.8)"
          style={{ position: 'absolute', top: s.top, left: s.left, opacity: s.opacity }} aria-hidden="true">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
        </svg>
      ))}
    </div>
  )
}

// ── Spotlight banner (featured tools, large 2-col) ────────────────────────────
function SpotlightBanner({ tool, onOpen }: { tool: ToolDef; onOpen: () => void }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const { accent: a, accent2: a2 } = tool
  return (
    <button
      onClick={() => { playNav(); onOpen() }}
      onMouseEnter={() => { setHover(true); playTick() }}
      onMouseLeave={() => setHover(false)}
      aria-label={t(tool.labelKey as any)}
      className="sf-spotlight"
      style={{
        position: 'relative', overflow: 'hidden', textAlign: 'left', cursor: 'pointer',
        borderRadius: 20, padding: '28px 28px', minHeight: 160, width: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        background: `linear-gradient(130deg, rgba(${a},0.18) 0%, rgba(${a2},0.08) 60%, rgba(10,8,22,0.6) 100%)`,
        border: `1px solid ${hover ? `rgba(${a},0.45)` : `rgba(${a},0.2)`}`,
        boxShadow: hover
          ? `0 24px 64px -16px rgba(${a},0.45), 0 0 0 1px rgba(${a},0.15)`
          : `0 6px 32px -12px rgba(${a},0.3)`,
        transform: hover ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all 0.32s cubic-bezier(0.34,1.4,0.64,1)',
      }}
    >
      {/* background orbs */}
      <div style={{ position: 'absolute', top: -50, right: 30, width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, rgba(${a},0.35), transparent 65%)`, filter: 'blur(36px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -60, right: -20, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, rgba(${a2},0.28), transparent 65%)`, filter: 'blur(32px)', pointerEvents: 'none' }} />
      {/* ghost icon */}
      <div style={{
        position: 'absolute', right: 24, top: '50%',
        transform: `translateY(-50%) ${hover ? 'scale(1.1) rotate(-8deg)' : 'scale(1) rotate(0deg)'}`,
        opacity: hover ? 0.55 : 0.38,
        transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        pointerEvents: 'none',
      }}>
        <IconGlyph icon={tool.icon} size={120} color={`rgba(${a},1)`} />
      </div>

      <div style={{ position: 'relative', maxWidth: '68%' }}>
        {/* Icon + badge row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, rgba(${a},0.95), rgba(${a2},0.8))`,
            border: '1.5px solid rgba(255,255,255,0.18)',
            boxShadow: `0 6px 20px -6px rgba(${a},0.65)`,
            transform: hover ? 'scale(1.06)' : 'scale(1)',
            transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <IconGlyph icon={tool.icon} size={20} color="#fff" />
          </div>
          {tool.badge && <BadgeChip badge={tool.badge} />}
        </div>

        <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', marginBottom: 6, lineHeight: 1.15 }}>
          {t(tool.labelKey as any)}
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(203,213,225,0.65)', maxWidth: 380 }}>
          {t(tool.descKey as any)}
        </p>

        <div style={{
          marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, fontWeight: 700, color: `rgb(${a})`,
        }}>
          <span>{t('hubOpen')}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ transform: hover ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 0.25s' }}>
            <path d={ICONS.arrow} />
          </svg>
        </div>
      </div>
    </button>
  )
}

// ── Compact horizontal tool card ───────────────────────────────────────────────
function ToolCard({ tool, index, onOpen }: { tool: ToolDef; index: number; onOpen: () => void }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const a = tool.accent

  return (
    <button
      onClick={() => { playNav(); onOpen() }}
      onMouseEnter={() => { setHover(true); playTick() }}
      onMouseLeave={() => setHover(false)}
      aria-label={t(tool.labelKey as any)}
      style={{
        position: 'relative', width: '100%', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px',
        borderRadius: 16, cursor: 'pointer', overflow: 'hidden',
        background: hover
          ? `linear-gradient(135deg, rgba(${a},0.1) 0%, rgba(10,8,22,0.7) 100%)`
          : 'rgba(14,12,26,0.6)',
        border: `1px solid ${hover ? `rgba(${a},0.4)` : 'rgba(255,255,255,0.06)'}`,
        boxShadow: hover
          ? `0 16px 40px -12px rgba(${a},0.35), 0 0 0 1px rgba(${a},0.12)`
          : '0 1px 8px -4px rgba(0,0,0,0.5)',
        transform: hover ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 0.28s cubic-bezier(0.34,1.4,0.64,1)',
        animation: 'hub-card-in 0.45s cubic-bezier(0.22,1,0.36,1) backwards',
        animationDelay: `${index * 0.04}s`,
      }}
    >
      {/* Left accent bar on hover */}
      {hover && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: '16px 0 0 16px',
          background: `linear-gradient(to bottom, rgba(${a},0.9), rgba(${tool.accent2},0.6))`,
        }} />
      )}

      {/* Icon badge */}
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, rgba(${a},${hover ? '0.92' : '0.8'}), rgba(${tool.accent2},${hover ? '0.75' : '0.6'}))`,
        border: `1px solid rgba(${a},${hover ? '0.5' : '0.3'})`,
        boxShadow: hover ? `0 6px 18px -6px rgba(${a},0.65)` : `0 4px 12px -6px rgba(${a},0.4)`,
        transform: hover ? 'scale(1.06)' : 'scale(1)',
        transition: 'all 0.28s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <IconGlyph icon={tool.icon} size={19} color="#fff" />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <p style={{
            fontSize: 14, fontWeight: 700, color: hover ? '#fff' : '#ddd6fe',
            transition: 'color 0.2s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {t(tool.labelKey as any)}
          </p>
          {tool.badge && <BadgeChip badge={tool.badge} />}
        </div>
        <p style={{
          fontSize: 11.5, lineHeight: 1.5, color: 'rgba(148,163,184,0.55)',
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
        }}>
          {t(tool.descKey as any)}
        </p>
      </div>

      {/* Arrow */}
      <div style={{
        flexShrink: 0,
        color: hover ? `rgb(${a})` : 'rgba(148,163,184,0.25)',
        transform: hover ? 'translateX(3px)' : 'translateX(0)',
        transition: 'all 0.25s',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={ICONS.arrow} />
        </svg>
      </div>
    </button>
  )
}

// ── Category section with "Voir tout" ─────────────────────────────────────────
function CategorySection({ cat, tools, baseIndex, onNavigate }: {
  cat: typeof CATEGORIES[number]
  tools: ToolDef[]
  baseIndex: number
  onNavigate: (p: Page) => void
}) {
  const t = useT()
  const [showAll, setShowAll] = useState(false)
  const a = cat.accent
  if (!tools.length) return null

  const visible = showAll ? tools : tools.slice(0, 4)

  return (
    <section style={{ marginBottom: 38 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {/* Icon chip */}
        <span style={{
          width: 30, height: 30, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, rgba(${a},0.9), rgba(${a},0.5))`,
          border: `1px solid rgba(${a},0.35)`,
          boxShadow: `0 4px 14px -4px rgba(${a},0.55)`,
        }}>
          <IconGlyph icon={cat.icon} size={15} color="#fff" />
        </span>

        <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', color: '#e2dff7' }}>
          {t(cat.labelKey as any)}
        </h2>

        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.07), transparent)' }} />

        {/* "Voir tout" button */}
        {tools.length > 4 && (
          <button
            onClick={() => setShowAll(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 600, color: `rgb(${a})`,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '3px 0', transition: 'opacity 0.2s',
              opacity: 0.8,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
          >
            {showAll ? 'Voir moins' : 'Voir tout'}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              style={{ transform: showAll ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }}>
              <path d={ICONS.arrow} />
            </svg>
          </button>
        )}
        {tools.length <= 4 && (
          <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)', fontWeight: 600 }}>{tools.length}</span>
        )}
      </div>

      {/* Card grid — 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {visible.map((tool, i) => (
          <ToolCard key={tool.id} tool={tool} index={baseIndex + i} onOpen={() => onNavigate(tool.id)} />
        ))}
      </div>
    </section>
  )
}

// ── Main Hub page ──────────────────────────────────────────────────────────────
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
    <div className="anim-page" style={{ minHeight: '100%', paddingBottom: 80 }}>

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden', padding: '44px 40px 36px' }}>
        {/* Background mesh */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: -100, left: '5%',  width: 480, height: 300, background: 'radial-gradient(ellipse, rgba(124,58,237,0.3), transparent 65%)',  filter: 'blur(55px)' }} />
          <div style={{ position: 'absolute', top: -60,  right: '8%', width: 380, height: 260, background: 'radial-gradient(ellipse, rgba(99,102,241,0.22), transparent 65%)', filter: 'blur(55px)' }} />
          <div style={{ position: 'absolute', bottom: -120, left: '35%', width: 360, height: 240, background: 'radial-gradient(ellipse, rgba(236,72,153,0.14), transparent 65%)', filter: 'blur(55px)' }} />
          {/* dot grid */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.45,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'linear-gradient(to bottom, black 30%, transparent 85%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent 85%)',
          }} />
        </div>

        <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', animation: 'page-fade-in 0.5s ease both' }}>
          {/* Left: text + actions */}
          <div style={{ flex: 1, paddingRight: 60 }}>
            {/* Greeting pill */}
            <div className="sf-anim-slide-up sf-d50" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '4px 12px 4px 8px', borderRadius: 100, marginBottom: 16,
              background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.22)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#22d3ee)', boxShadow: '0 0 8px rgba(139,92,246,0.8)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(196,181,253,0.9)' }}>
                {greeting.replace(/,\s*$/, '')}
              </span>
            </div>

            {/* Name */}
            <h1 className="sf-anim-slide-up sf-d100" style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1, marginBottom: 14, textTransform: 'capitalize' }}>
              <span style={{ background: 'linear-gradient(115deg, #f0ecff 0%, #c4b5fd 45%, #67e8f9 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {firstName}
              </span>
            </h1>

            {/* Subtitle */}
            <p className="sf-anim-slide-up sf-d150" style={{ fontSize: 15, color: 'rgba(148,163,184,0.6)', maxWidth: 480, lineHeight: 1.6, marginBottom: 28 }}>
              {t('hubSubtitle')}
            </p>

            {/* Quick action chips */}
            <div className="sf-anim-slide-up sf-d200" style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
              {quickActions.map(qa => (
                <button
                  key={qa.id}
                  onClick={() => { playNav(); onNavigate(qa.id) }}
                  onMouseEnter={() => playTick()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    height: 40, padding: '0 16px 0 12px', borderRadius: 11,
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    color: '#e2dff7',
                    background: `linear-gradient(135deg, rgba(${qa.a},0.14), rgba(255,255,255,0.02))`,
                    border: `1px solid rgba(${qa.a},0.28)`,
                    transition: 'all 0.22s ease',
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = `0 10px 24px -10px rgba(${qa.a},0.5)`
                    e.currentTarget.style.borderColor = `rgba(${qa.a},0.5)`
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.borderColor = `rgba(${qa.a},0.28)`
                  }}
                >
                  <span style={{ color: `rgb(${qa.a})` }}>
                    <IconGlyph icon={qa.icon} size={16} color={`rgb(${qa.a})`} />
                  </span>
                  {qa.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: decorative 3D sphere */}
          <div className="sf-anim-scale-spring sf-d250" style={{ position: 'relative', width: 260, height: 240, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DecoSphere />
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="anim-stagger" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px' }}>

        {/* Search bar — full width */}
        <div style={{ position: 'relative', marginBottom: 32 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.45)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('hubSearchPlaceholder')}
            style={{
              width: '100%', height: 46, paddingLeft: 44, paddingRight: 16,
              borderRadius: 13, fontSize: 14,
              background: 'rgba(12,10,24,0.75)', border: '1px solid rgba(255,255,255,0.07)',
              color: '#e2dff7', outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              boxSizing: 'border-box',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'rgba(139,92,246,0.45)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>

        {/* Featured spotlights */}
        {!q && featured.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: featured.length > 1 ? 'repeat(auto-fit, minmax(340px, 1fr))' : '1fr',
            gap: 14, marginBottom: 40,
          }}>
            {featured.map(tool => (
              <SpotlightBanner key={tool.id} tool={tool} onOpen={() => onNavigate(tool.id)} />
            ))}
          </div>
        )}

        {/* Tool sections */}
        {q ? (
          searchResults.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {searchResults.map((tool, i) => (
                <ToolCard key={tool.id} tool={tool} index={i} onOpen={() => onNavigate(tool.id)} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0' }}>
              <span className="sf-anim-scale-spring" style={{
                width: 52, height: 52, borderRadius: 16, marginBottom: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.7)" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
              </span>
              <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.45)' }}>{t('hubNoResults')}</p>
            </div>
          )
        ) : (
          CATEGORIES.map((cat, ci) => {
            const tools = TOOLS.filter(tl => tl.category === cat.id)
            const baseIndex = TOOLS.filter(tl => CATEGORIES.findIndex(c => c.id === tl.category) < ci).length
            return (
              <CategorySection
                key={cat.id}
                cat={cat}
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
