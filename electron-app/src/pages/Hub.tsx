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
  accent: string
  badge?: 'NEW' | 'BETA' | 'SOON'
  category: 'instagram' | 'creation' | 'ai' | 'social'
}

const TOOLS: ToolDef[] = [
  { id: 'phones',      labelKey: 'navPhones',      descKey: 'hubDescPhones',      icon: 'phone',    accent: '139,92,246',  category: 'instagram' },
  { id: 'posting',     labelKey: 'navPosting',     descKey: 'hubDescPosting',     icon: 'send',     accent: '139,92,246',  category: 'instagram' },
  { id: 'massposting', labelKey: 'navMassPosting', descKey: 'hubDescMassPosting', icon: 'zap',      accent: '236,72,153',  category: 'instagram' },
  { id: 'scheduler',   labelKey: 'navScheduler',   descKey: 'hubDescScheduler',   icon: 'calendar', accent: '34,211,238',  category: 'instagram' },
  { id: 'warmup',      labelKey: 'navWarmup',      descKey: 'hubDescWarmup',      icon: 'flame',    accent: '245,158,11',  category: 'instagram', badge: 'BETA' },
  { id: 'bank',        labelKey: 'navBank',        descKey: 'hubDescBank',        icon: 'video',    accent: '34,211,238',  category: 'creation' },
  { id: 'remix',       labelKey: 'navRemix',       descKey: 'hubDescRemix',       icon: 'refresh',  accent: '129,140,248', category: 'creation' },
  { id: 'repurpose',   labelKey: 'navRepurpose',   descKey: 'hubDescRepurpose',   icon: 'zap',      accent: '168,85,247',  category: 'creation', badge: 'NEW' },
  { id: 'mixer',       labelKey: 'navMixer',       descKey: 'hubDescMixer',       icon: 'edit',     accent: '236,72,153',  category: 'creation', badge: 'NEW' },
  { id: 'aitools',     labelKey: 'navAiTools',     descKey: 'hubDescAiTools',     icon: 'sparkles', accent: '168,85,247',  category: 'ai' },
  { id: 'captionbank', labelKey: 'navCaptionBank', descKey: 'hubDescCaptionBank', icon: 'chat',     accent: '139,92,246',  category: 'ai' },
  { id: 'scaleia',     labelKey: 'hubScaleIA',     descKey: 'hubDescScaleIA',     icon: 'sparkles', accent: '168,85,247',  category: 'ai', badge: 'SOON' },
  { id: 'community',   labelKey: 'navCommunity',   descKey: 'hubDescCommunity',   icon: 'chat',     accent: '34,211,238',  category: 'social' },
]

const CATEGORIES: { id: ToolDef['category']; labelKey: string; emoji: string }[] = [
  { id: 'instagram', labelKey: 'hubCatInstagram', emoji: '🚀' },
  { id: 'creation',  labelKey: 'hubCatCreation',  emoji: '🎬' },
  { id: 'ai',        labelKey: 'hubCatAI',        emoji: '✨' },
  { id: 'social',    labelKey: 'hubCatSocial',    emoji: '💬' },
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
      style={{
        position: 'relative',
        textAlign: 'left',
        padding: 22,
        minHeight: 168,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 20,
        cursor: 'pointer',
        background: hover
          ? `linear-gradient(155deg, rgba(${a},0.13), rgba(13,13,20,0.92))`
          : 'linear-gradient(155deg, rgba(255,255,255,0.028), rgba(13,13,20,0.88))',
        border: `1px solid ${hover ? `rgba(${a},0.42)` : 'rgba(255,255,255,0.07)'}`,
        boxShadow: hover
          ? `0 18px 50px -12px rgba(${a},0.4), 0 0 0 1px rgba(${a},0.15)`
          : '0 2px 14px -6px rgba(0,0,0,0.5)',
        transform: hover ? 'translateY(-5px)' : 'translateY(0)',
        transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s, background 0.3s, border-color 0.3s',
        overflow: 'hidden',
        animation: `hub-card-in 0.5s cubic-bezier(0.22,1,0.36,1) both`,
        animationDelay: `${index * 0.04}s`,
      }}
    >
      {/* Corner glow */}
      <div style={{
        position: 'absolute', top: -50, right: -50, width: 150, height: 150,
        background: `radial-gradient(circle, rgba(${a},${hover ? 0.32 : 0.12}) 0%, transparent 70%)`,
        filter: 'blur(14px)', transition: 'all 0.3s', pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 15, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, rgba(${a},0.24), rgba(${a},0.06))`,
          border: `1px solid rgba(${a},0.28)`,
          transform: hover ? 'scale(1.08) rotate(-5deg)' : 'scale(1)',
          transition: 'transform 0.32s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none"
            stroke={`rgb(${a})`} strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONS[tool.icon]} />
          </svg>
        </div>

        {tool.badge && (
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 6, flexShrink: 0, ...badgeStyle(tool.badge),
          }}>
            {tool.badge}
          </span>
        )}
      </div>

      <p style={{
        fontSize: 16, fontWeight: 700, marginBottom: 6,
        color: hover ? '#fff' : '#e8e6f0', transition: 'color 0.2s',
      }}>
        {t(tool.labelKey as any)}
      </p>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(148,163,184,0.62)', flex: 1 }}>
        {t(tool.descKey as any)}
      </p>

      {/* Open hint */}
      <div style={{
        marginTop: 14, display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11.5, fontWeight: 600,
        color: hover ? `rgb(${a})` : 'rgba(148,163,184,0.4)',
        transition: 'color 0.25s',
      }}>
        <span>{t('hubOpen')}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: hover ? 'translateX(3px)' : 'translateX(0)', transition: 'transform 0.25s' }}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>
    </button>
  )
}

// ── Category section ──────────────────────────────────────────────────────────
function CategorySection({ emoji, title, tools, baseIndex, onNavigate }: {
  emoji: string; title: string; tools: ToolDef[]; baseIndex: number; onNavigate: (p: Page) => void
}) {
  if (!tools.length) return null
  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', color: '#e8e6f0' }}>{title}</h2>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.08), transparent)' }} />
        <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', fontWeight: 600 }}>{tools.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
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

  return (
    <div style={{ minHeight: '100%', padding: '36px 36px 80px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', animation: 'page-fade-in 0.4s ease both' }}>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', marginBottom: 36 }}>
          <div style={{
            position: 'absolute', top: -80, left: '10%', width: 460, height: 200,
            background: 'radial-gradient(ellipse, rgba(124,58,237,0.18) 0%, transparent 70%)',
            filter: 'blur(50px)', pointerEvents: 'none',
          }} />
          <p style={{ fontSize: 14, color: 'rgba(167,139,250,0.75)', fontWeight: 600, marginBottom: 8 }}>
            {greeting}
          </p>
          <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.05, marginBottom: 14, textTransform: 'capitalize' }}>
            <span style={{ background: 'linear-gradient(120deg,#f2f0ff,#c4b5fd 55%,#67e8f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {firstName}
            </span>
          </h1>
          <p style={{ fontSize: 15.5, color: 'rgba(148,163,184,0.62)', maxWidth: 580, lineHeight: 1.55 }}>
            {t('hubSubtitle')}
          </p>
        </div>

        {/* ── Search ────────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', maxWidth: 440, marginBottom: 40 }}>
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

        {/* ── Tools ─────────────────────────────────────────────────────────── */}
        {q ? (
          searchResults.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
              {searchResults.map((tool, i) => (
                <ToolCard key={tool.id} tool={tool} index={i} onOpen={() => onNavigate(tool.id)} />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'rgba(148,163,184,0.5)' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>🔍</p>
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
                emoji={cat.emoji}
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
