import { useState, useMemo, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '@/lib/i18n'
import { playNav, playTick } from '@/lib/sounds'
import type { Page } from '@/components/Layout'

// ── Design tokens — "ScaleFlow Noir" ─────────────────────────────────────────
const SERIF = "'Instrument Serif', 'Times New Roman', Georgia, serif"
const SANS  = "'Inter', system-ui, sans-serif"
const IVORY = '#F3F1EC'
const MUTED = 'rgba(243,241,236,0.42)'
const FAINT = 'rgba(243,241,236,0.22)'
const HAIR  = 'rgba(243,241,236,0.08)'
const GOLD  = '#C9B584'

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
  arrowUpR:  'M7 7h10v10M7 17 17 7',
  search:    'M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z',
}

type ToolDef = {
  id: Page
  labelKey: string
  descKey: string
  icon: keyof typeof ICONS
  badge?: 'NEW' | 'BETA'
  category: 'instagram' | 'creation' | 'ai' | 'social'
  featured?: boolean
}

const TOOLS: ToolDef[] = [
  { id: 'phones',      labelKey: 'navPhones',      descKey: 'hubDescPhones',      icon: 'phone',    category: 'instagram' },
  { id: 'storylink',   labelKey: 'navStoryLink',   descKey: 'hubDescStoryLink',   icon: 'link',     category: 'instagram', badge: 'NEW', featured: true },
  { id: 'posting',     labelKey: 'navPosting',     descKey: 'hubDescPosting',     icon: 'send',     category: 'instagram' },
  { id: 'massposting', labelKey: 'navMassPosting', descKey: 'hubDescMassPosting', icon: 'zap',      category: 'instagram' },
  { id: 'scheduler',   labelKey: 'navScheduler',   descKey: 'hubDescScheduler',   icon: 'calendar', category: 'instagram' },
  { id: 'warmup',      labelKey: 'navWarmup',      descKey: 'hubDescWarmup',      icon: 'flame',    category: 'instagram', badge: 'BETA' },
  { id: 'bank',        labelKey: 'navBank',        descKey: 'hubDescBank',        icon: 'video',    category: 'creation' },
  { id: 'repurpose',   labelKey: 'navRepurpose',   descKey: 'hubDescRepurpose',   icon: 'zap',      category: 'creation', badge: 'NEW', featured: true },
  { id: 'remix',       labelKey: 'navRemix',       descKey: 'hubDescRemix',       icon: 'refresh',  category: 'creation' },
  { id: 'mixer',       labelKey: 'navMixer',       descKey: 'hubDescMixer',       icon: 'edit',     category: 'creation', badge: 'NEW' },
  { id: 'aitools',     labelKey: 'navAiTools',     descKey: 'hubDescAiTools',     icon: 'sparkles', category: 'ai' },
  { id: 'community',   labelKey: 'navCommunity',   descKey: 'hubDescCommunity',   icon: 'chat',     category: 'social' },
]

const CATEGORIES: { id: ToolDef['category']; labelKey: string; num: string }[] = [
  { id: 'instagram', labelKey: 'hubCatInstagram', num: '01' },
  { id: 'creation',  labelKey: 'hubCatCreation',  num: '02' },
  { id: 'ai',        labelKey: 'hubCatAI',        num: '03' },
  { id: 'social',    labelKey: 'hubCatSocial',    num: '04' },
]

function IconGlyph({ icon, size = 24, color }: { icon: keyof typeof ICONS; size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[icon]} />
    </svg>
  )
}

// ── Badge — hairline éditorial ─────────────────────────────────────────────────
function BadgeChip({ badge }: { badge: NonNullable<ToolDef['badge']> }) {
  return (
    <span style={{
      fontFamily: SANS, fontSize: 8, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase',
      padding: '3px 8px 2px',
      color: badge === 'NEW' ? GOLD : MUTED,
      border: `1px solid ${badge === 'NEW' ? 'rgba(201,181,132,0.4)' : 'rgba(243,241,236,0.18)'}`,
    }}>
      {badge}
    </span>
  )
}

// ── Hub keyframes ──────────────────────────────────────────────────────────────
const HUB_CSS = `
  @keyframes hub-fade-up {
    from { opacity: 0; transform: translateY(22px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes hub-line-grow {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }
  @keyframes hub-grain-drift {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(-2%, 2%); }
  }
`
function useHubCSS() {
  useEffect(() => {
    const id = 'sf-hub-css'
    if (!document.getElementById(id)) {
      const el = document.createElement('style')
      el.id = id; el.textContent = HUB_CSS
      document.head.appendChild(el)
    }
  }, [])
}

// ── Featured card — éditorial large ───────────────────────────────────────────
function FeaturedCard({ tool, num, onOpen }: { tool: ToolDef; num: string; onOpen: () => void }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={() => { playNav(); onOpen() }}
      onMouseEnter={() => { setHover(true); playTick() }}
      onMouseLeave={() => setHover(false)}
      aria-label={t(tool.labelKey as any)}
      style={{
        position: 'relative', overflow: 'hidden', textAlign: 'left', cursor: 'pointer',
        padding: '34px 32px', minHeight: 190, width: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: hover ? IVORY : 'rgba(243,241,236,0.02)',
        border: `1px solid ${hover ? IVORY : HAIR}`,
        transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* ghost icon */}
      <div style={{
        position: 'absolute', right: 18, bottom: 8,
        opacity: hover ? 0.14 : 0.06,
        transform: hover ? 'scale(1.05) rotate(-6deg)' : 'scale(1) rotate(0deg)',
        transition: 'all 0.55s cubic-bezier(0.16,1,0.3,1)',
        pointerEvents: 'none',
      }}>
        <IconGlyph icon={tool.icon} size={150} color={hover ? '#0A0A0C' : IVORY} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, color: hover ? 'rgba(10,10,12,0.45)' : 'rgba(201,181,132,0.65)', transition: 'color 0.4s' }}>{num}</span>
        <span style={{
          fontFamily: SANS, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase',
          color: hover ? '#0A0A0C' : GOLD,
          borderBottom: `1px solid ${hover ? 'rgba(10,10,12,0.5)' : 'rgba(201,181,132,0.4)'}`,
          paddingBottom: 3, transition: 'all 0.4s',
        }}>
          À la une
        </span>
      </div>

      <div style={{ position: 'relative' }}>
        <p style={{
          fontFamily: SANS, fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em',
          color: hover ? '#0A0A0C' : IVORY, margin: '0 0 8px', lineHeight: 1.05,
          transition: 'color 0.4s',
        }}>
          {t(tool.labelKey as any)}
        </p>
        <p style={{
          fontFamily: SANS, fontSize: 12.5, lineHeight: 1.65,
          color: hover ? 'rgba(10,10,12,0.6)' : MUTED, maxWidth: 380, margin: 0,
          transition: 'color 0.4s',
        }}>
          {t(tool.descKey as any)}
        </p>
        <div style={{
          marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 10,
          fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase',
          color: hover ? '#0A0A0C' : FAINT, transition: 'color 0.4s',
        }}>
          <span>{t('hubOpen')}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ transform: hover ? 'translate(3px, -3px)' : 'translate(0,0)', transition: 'transform 0.3s' }}>
            <path d={ICONS.arrowUpR} />
          </svg>
        </div>
      </div>
    </button>
  )
}

// ── Tool row — ligne éditoriale ────────────────────────────────────────────────
function ToolRow({ tool, index, onOpen }: { tool: ToolDef; index: number; onOpen: () => void }) {
  const t = useT()
  const [hover, setHover] = useState(false)

  return (
    <button
      onClick={() => { playNav(); onOpen() }}
      onMouseEnter={() => { setHover(true); playTick() }}
      onMouseLeave={() => setHover(false)}
      aria-label={t(tool.labelKey as any)}
      style={{
        position: 'relative', width: '100%', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 18,
        padding: '20px 22px',
        cursor: 'pointer', overflow: 'hidden',
        background: hover ? 'rgba(243,241,236,0.035)' : '#060608',
        border: 'none',
        transition: 'background 0.35s',
        animation: 'hub-fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both',
        animationDelay: `${index * 0.04}s`,
      }}
    >
      {/* gold indicator */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
        background: GOLD,
        transform: hover ? 'scaleY(1)' : 'scaleY(0)', transformOrigin: 'top',
        transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1)',
      }} />

      {/* Icon — cercle hairline */}
      <div style={{
        width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${hover ? 'rgba(201,181,132,0.5)' : HAIR}`,
        color: hover ? GOLD : MUTED,
        transform: hover ? 'rotate(0deg)' : 'rotate(-6deg)',
        transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <IconGlyph icon={tool.icon} size={18} color="currentColor" />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <p style={{
            fontFamily: SANS, fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em',
            color: IVORY, margin: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {t(tool.labelKey as any)}
          </p>
          {tool.badge && <BadgeChip badge={tool.badge} />}
        </div>
        <p style={{
          fontFamily: SANS, fontSize: 11.5, lineHeight: 1.5, color: hover ? MUTED : FAINT, margin: 0,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
          transition: 'color 0.3s',
        }}>
          {t(tool.descKey as any)}
        </p>
      </div>

      {/* Arrow */}
      <div style={{
        flexShrink: 0,
        color: hover ? GOLD : 'rgba(243,241,236,0.12)',
        transform: hover ? 'translate(2px,-2px)' : 'translate(0,0)',
        transition: 'all 0.3s',
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={ICONS.arrowUpR} />
        </svg>
      </div>
    </button>
  )
}

// ── Category section ───────────────────────────────────────────────────────────
function CategorySection({ cat, tools, baseIndex, onNavigate }: {
  cat: typeof CATEGORIES[number]
  tools: ToolDef[]
  baseIndex: number
  onNavigate: (p: Page) => void
}) {
  const t = useT()
  if (!tools.length) return null

  return (
    <section style={{ marginBottom: 56 }}>
      {/* Header — numéro serif + titre + filet */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 18 }}>
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 19, color: 'rgba(201,181,132,0.65)' }}>{cat.num}</span>
        <h2 style={{
          fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase',
          color: IVORY, margin: 0,
        }}>
          {t(cat.labelKey as any)}
        </h2>
        <div style={{ flex: 1, height: 1, background: HAIR, alignSelf: 'center' }} />
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: FAINT }}>{tools.length} outil{tools.length > 1 ? 's' : ''}</span>
      </div>

      {/* Grid hairline */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 1, background: HAIR, border: `1px solid ${HAIR}`,
      }}>
        {tools.map((tool, i) => (
          <ToolRow key={tool.id} tool={tool} index={baseIndex + i} onOpen={() => onNavigate(tool.id)} />
        ))}
      </div>
    </section>
  )
}

// ── Main Hub page ──────────────────────────────────────────────────────────────
export default function Hub({ user, onNavigate }: { user: User; onNavigate: (p: Page) => void }) {
  const t = useT()
  const [query, setQuery] = useState('')
  useHubCSS()

  const firstName = (user.email?.split('@')[0] ?? 'créateur').replace(/[._]/g, ' ')
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6)  return t('hubGreetingNight')
    if (h < 12) return t('hubGreetingMorning')
    if (h < 18) return t('hubGreetingAfternoon')
    return t('hubGreetingEvening')
  })()

  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const q = query.trim().toLowerCase()
  const matches = (tool: ToolDef) =>
    !q || t(tool.labelKey as any).toLowerCase().includes(q) || t(tool.descKey as any).toLowerCase().includes(q)
  const searchResults = useMemo(() => TOOLS.filter(matches), [q, t])
  const featured = TOOLS.filter(tl => tl.featured)

  return (
    <div style={{ minHeight: '100%', paddingBottom: 100, background: '#060608' }}>

      {/* ── Hero éditorial ─────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden', padding: '64px 48px 0' }}>
        {/* glow discret */}
        <div style={{ position: 'absolute', top: -140, left: '30%', width: 600, height: 320, background: 'radial-gradient(ellipse, rgba(201,181,132,0.05), transparent 65%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -100, right: '10%', width: 420, height: 280, background: 'radial-gradient(ellipse, rgba(201,181,132,0.04), transparent 65%)', filter: 'blur(60px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', maxWidth: 1140, margin: '0 auto' }}>
          {/* Ligne méta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 38, animation: 'hub-fade-up 0.7s cubic-bezier(0.16,1,0.3,1) both' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
              <span style={{ display: 'block', width: 32, height: 1, background: 'rgba(201,181,132,0.5)' }} />
              <span style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(201,181,132,0.65)' }}>
                Le Studio — {dateLabel}
              </span>
            </div>
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: FAINT }}>
              {TOOLS.length} outils actifs
            </span>
          </div>

          {/* Greeting géant */}
          <div style={{ animation: 'hub-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.08s both' }}>
            <h1 style={{ margin: '0 0 16px', lineHeight: 0.98, letterSpacing: '-0.045em' }}>
              <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(40px, 5.4vw, 72px)', color: IVORY }}>
                {greeting.replace(/,\s*$/, '')},
              </span>
              <span style={{
                fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
                fontSize: 'clamp(42px, 5.7vw, 78px)', color: GOLD,
                marginLeft: '0.22em', textTransform: 'capitalize',
              }}>
                {firstName}.
              </span>
            </h1>
            <p style={{ fontFamily: SANS, fontSize: 13.5, color: MUTED, maxWidth: 460, lineHeight: 1.75, margin: 0 }}>
              {t('hubSubtitle')}
            </p>
          </div>

          {/* Recherche — underline éditoriale */}
          <div style={{ position: 'relative', margin: '44px 0 0', maxWidth: 520, animation: 'hub-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.16s both' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <path d={ICONS.search} />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('hubSearchPlaceholder')}
              aria-label={t('hubSearchPlaceholder')}
              style={{
                width: '100%', height: 46, paddingLeft: 30, paddingRight: 8,
                fontSize: 14, fontFamily: SANS,
                background: 'transparent',
                border: 'none', borderBottom: `1px solid rgba(243,241,236,0.16)`,
                borderRadius: 0,
                color: IVORY, outline: 'none',
                transition: 'border-color 0.3s',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderBottomColor = GOLD }}
              onBlur={e => { e.currentTarget.style.borderBottomColor = 'rgba(243,241,236,0.16)' }}
            />
          </div>

          {/* Filet bas de hero */}
          <div style={{ height: 1, background: HAIR, margin: '52px 0 0', transformOrigin: 'left', animation: 'hub-line-grow 1s cubic-bezier(0.16,1,0.3,1) 0.3s both' }} />
        </div>
      </div>

      {/* ── Contenu ───────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '48px 48px 0' }}>

        {/* À la une */}
        {!q && featured.length > 0 && (
          <div style={{ marginBottom: 64, animation: 'hub-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.22s both' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: featured.length > 1 ? 'repeat(auto-fit, minmax(340px, 1fr))' : '1fr',
              gap: 1, background: HAIR, border: `1px solid ${HAIR}`,
            }}>
              {featured.map((tool, i) => (
                <FeaturedCard key={tool.id} tool={tool} num={`— 0${i + 1}`} onOpen={() => onNavigate(tool.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Sections / résultats */}
        {q ? (
          searchResults.length > 0 ? (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 1, background: HAIR, border: `1px solid ${HAIR}`,
            }}>
              {searchResults.map((tool, i) => (
                <ToolRow key={tool.id} tool={tool} index={i} onOpen={() => onNavigate(tool.id)} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '90px 0', borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}` }}>
              <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 22, color: MUTED, margin: '0 0 8px' }}>Aucun résultat.</p>
              <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: FAINT, margin: 0 }}>{t('hubNoResults')}</p>
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
