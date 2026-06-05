import { useState, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '@/lib/i18n'
import { playNav, playTick } from '@/lib/sounds'
import type { Page } from '@/components/Layout'

// ── SVG icon paths (mirrors Layout ICONS) ────────────────────────────────────
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
  scissors:  'M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm12 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8.586 12.586l7.07 7.07M15.657 12.586l-7.07 7.07',
}

type ToolDef = {
  id: Page
  labelKey: string
  descKey: string
  icon: keyof typeof ICONS
  accent: string          // base hue for the card glow
  badge?: 'NEW' | 'BETA' | 'SOON'
  category: 'instagram' | 'creation' | 'ai' | 'social'
}

const TOOLS: ToolDef[] = [
  // Instagram
  { id: 'phones',      labelKey: 'navPhones',      descKey: 'hubDescPhones',      icon: 'phone',    accent: '139,92,246', category: 'instagram' },
  { id: 'posting',     labelKey: 'navPosting',     descKey: 'hubDescPosting',     icon: 'send',     accent: '139,92,246', category: 'instagram' },
  { id: 'massposting', labelKey: 'navMassPosting', descKey: 'hubDescMassPosting', icon: 'zap',      accent: '236,72,153', category: 'instagram' },
  { id: 'scheduler',   labelKey: 'navScheduler',   descKey: 'hubDescScheduler',   icon: 'calendar', accent: '34,211,238', category: 'instagram' },
  { id: 'warmup',      labelKey: 'navWarmup',      descKey: 'hubDescWarmup',       icon: 'flame',    accent: '245,158,11', category: 'instagram', badge: 'BETA' },
  // Creation / Montage
  { id: 'bank',        labelKey: 'navBank',        descKey: 'hubDescBank',        icon: 'video',    accent: '34,211,238', category: 'creation' },
  { id: 'remix',       labelKey: 'navRemix',       descKey: 'hubDescRemix',       icon: 'refresh',  accent: '129,140,248', category: 'creation' },
  { id: 'repurpose',   labelKey: 'navRepurpose',   descKey: 'hubDescRepurpose',   icon: 'zap',      accent: '168,85,247', category: 'creation', badge: 'NEW' },
  { id: 'mixer',       labelKey: 'navMixer',       descKey: 'hubDescMixer',       icon: 'edit',     accent: '236,72,153', category: 'creation', badge: 'NEW' },
  // AI
  { id: 'aitools',     labelKey: 'navAiTools',     descKey: 'hubDescAiTools',     icon: 'sparkles', accent: '168,85,247', category: 'ai' },
  { id: 'captionbank', labelKey: 'navCaptionBank', descKey: 'hubDescCaptionBank', icon: 'chat',     accent: '139,92,246', category: 'ai' },
  { id: 'scaleia',     labelKey: 'hubScaleIA',     descKey: 'hubDescScaleIA',     icon: 'sparkles', accent: '168,85,247', category: 'ai', badge: 'SOON' },
  // Social
  { id: 'community',   labelKey: 'navCommunity',   descKey: 'hubDescCommunity',   icon: 'chat',     accent: '34,211,238', category: 'social' },
]

const CATEGORIES: { id: ToolDef['category']; labelKey: string }[] = [
  { id: 'instagram', labelKey: 'hubCatInstagram' },
  { id: 'creation',  labelKey: 'hubCatCreation' },
  { id: 'ai',        labelKey: 'hubCatAI' },
  { id: 'social',    labelKey: 'hubCatSocial' },
]

function badgeStyle(badge: NonNullable<ToolDef['badge']>): React.CSSProperties {
  switch (badge) {
    case 'NEW':  return { background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }
    case 'BETA': return { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.28)' }
    case 'SOON': return { background: 'linear-gradient(90deg,rgba(167,139,250,0.22),rgba(34,211,238,0.14))', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)', boxShadow: '0 0 6px rgba(139,92,246,0.3)' }
  }
}

// ── Tool card ─────────────────────────────────────────────────────────────────
function ToolCard({ tool, index, onOpen }: { tool: ToolDef; index: number; onOpen: () => void }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const a = tool.accent

  return (
    <button
      onClick={() => { playNav(); onOpen() }}
      onMouseEnter={() => { setHover(true); playTick() }}
      onMouseLeave={() => setHover(false)}
      className="hub-card"
      style={{
        position: 'relative',
        textAlign: 'left',
        padding: 18,
        borderRadius: 18,
        cursor: 'pointer',
        background: hover
          ? `linear-gradient(150deg, rgba(${a},0.12), rgba(14,14,22,0.9))`
          : 'linear-gradient(150deg, rgba(255,255,255,0.025), rgba(14,14,22,0.85))',
        border: `1px solid ${hover ? `rgba(${a},0.4)` : 'rgba(255,255,255,0.07)'}`,
        boxShadow: hover
          ? `0 12px 40px -8px rgba(${a},0.35), 0 0 0 1px rgba(${a},0.15)`
          : '0 2px 12px -4px rgba(0,0,0,0.5)',
        transform: hover ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s, background 0.28s, border-color 0.28s',
        overflow: 'hidden',
        animation: `hub-card-in 0.5s cubic-bezier(0.22,1,0.36,1) both`,
        animationDelay: `${index * 0.035}s`,
      }}
    >
      {/* Corner glow */}
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 120, height: 120,
        background: `radial-gradient(circle, rgba(${a},${hover ? 0.3 : 0.12}) 0%, transparent 70%)`,
        filter: 'blur(12px)', transition: 'all 0.3s', pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        {/* Icon tile */}
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, rgba(${a},0.22), rgba(${a},0.06))`,
          border: `1px solid rgba(${a},0.25)`,
          transform: hover ? 'scale(1.08) rotate(-4deg)' : 'scale(1)',
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke={`rgb(${a})`} strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONS[tool.icon]} />
          </svg>
        </div>

        {tool.badge && (
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '3px 7px', borderRadius: 5, flexShrink: 0, ...badgeStyle(tool.badge),
          }}>
            {tool.badge}
          </span>
        )}
      </div>

      <p style={{
        fontSize: 14, fontWeight: 700, marginBottom: 5,
        color: hover ? '#fff' : '#e8e6f0', transition: 'color 0.2s',
      }}>
        {t(tool.labelKey as any)}
      </p>
      <p style={{ fontSize: 11.5, lineHeight: 1.55, color: 'rgba(148,163,184,0.62)' }}>
        {t(tool.descKey as any)}
      </p>

      {/* Arrow hint */}
      <div style={{
        position: 'absolute', bottom: 16, right: 16,
        opacity: hover ? 1 : 0, transform: hover ? 'translateX(0)' : 'translateX(-6px)',
        transition: 'all 0.25s', color: `rgb(${a})`,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>
    </button>
  )
}

export default function Hub({ user, onNavigate }: { user: User; onNavigate: (p: Page) => void }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState<ToolDef['category'] | 'all'>('all')

  const firstName = (user.email?.split('@')[0] ?? 'créateur').replace(/[._]/g, ' ')
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6)  return t('hubGreetingNight')
    if (h < 12) return t('hubGreetingMorning')
    if (h < 18) return t('hubGreetingAfternoon')
    return t('hubGreetingEvening')
  })()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TOOLS.filter(tool => {
      if (activeCat !== 'all' && tool.category !== activeCat) return false
      if (!q) return true
      return t(tool.labelKey as any).toLowerCase().includes(q) || t(tool.descKey as any).toLowerCase().includes(q)
    })
  }, [query, activeCat, t])

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 4px 60px', animation: 'page-fade-in 0.4s ease both' }}>

      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 28 }}>
        <div style={{
          position: 'absolute', top: -60, left: '20%', width: 400, height: 160,
          background: 'radial-gradient(ellipse, rgba(124,58,237,0.16) 0%, transparent 70%)',
          filter: 'blur(40px)', pointerEvents: 'none',
        }} />
        <p style={{ fontSize: 13, color: 'rgba(167,139,250,0.75)', fontWeight: 600, letterSpacing: '0.02em', marginBottom: 6 }}>
          {greeting}
        </p>
        <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 10, textTransform: 'capitalize' }}>
          <span style={{ background: 'linear-gradient(120deg,#f2f0ff,#c4b5fd 60%,#67e8f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {firstName}
          </span>
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.6)', maxWidth: 540, lineHeight: 1.5 }}>
          {t('hubSubtitle')}
        </p>
      </div>

      {/* ── Search + categories ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 22, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 220, maxWidth: 360 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('hubSearchPlaceholder')}
            style={{
              width: '100%', height: 40, paddingLeft: 38, paddingRight: 14,
              borderRadius: 11, fontSize: 13,
              background: 'rgba(14,14,22,0.8)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#e8e6f0', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {(['all', ...CATEGORIES.map(c => c.id)] as const).map(catId => {
            const active = activeCat === catId
            const label = catId === 'all' ? t('hubCatAll') : t(CATEGORIES.find(c => c.id === catId)!.labelKey as any)
            return (
              <button
                key={catId}
                onClick={() => { playTick(); setActiveCat(catId as any) }}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 100, cursor: 'pointer',
                  background: active ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  color: active ? '#c4b5fd' : 'rgba(148,163,184,0.6)',
                  transition: 'all 0.18s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tools grid ───────────────────────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))', gap: 14 }}>
          {filtered.map((tool, i) => (
            <ToolCard key={tool.id} tool={tool} index={i} onOpen={() => onNavigate(tool.id)} />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(148,163,184,0.5)' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>🔍</p>
          <p style={{ fontSize: 14 }}>{t('hubNoResults')}</p>
        </div>
      )}
    </div>
  )
}
