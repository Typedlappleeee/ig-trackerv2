import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { MetadataChanger } from './MetadataChanger'
import { TextCopy } from './TextCopy'
import { useT, useTr } from '@/lib/i18n'

interface AiToolsProps { user: User }

// ── Inline Lucide-style SVG icons (no emoji UI chrome) ─────────────────────────
type IconName =
  | 'search' | 'message-square' | 'calendar' | 'clapperboard' | 'anchor'
  | 'user' | 'globe' | 'search-check' | 'sparkles' | 'tag' | 'pen-line'
  | 'flame' | 'dna' | 'image' | 'arrow-left' | 'copy' | 'check' | 'zap'
  | 'alert-triangle' | 'eye' | 'eye-off' | 'cpu' | 'layers' | 'video'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    'search': <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    'message-square': <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    'calendar': <><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    'clapperboard': <><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" /><path d="m6.2 5.3 3.1 3.9M12.4 3.4l3.1 4M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>,
    'anchor': <><circle cx="12" cy="5" r="3" /><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3" /></>,
    'user': <><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></>,
    'globe': <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" /></>,
    'search-check': <><path d="m8 11 2 2 4-4" /><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    'sparkles': <path d="M9.94 14.34A2 2 0 0 0 8.66 13l-6.13-1.9a.5.5 0 0 1 0-.95l6.13-1.9a2 2 0 0 0 1.28-1.28l1.9-6.13a.5.5 0 0 1 .95 0l1.9 6.13a2 2 0 0 0 1.28 1.28l6.13 1.9a.5.5 0 0 1 0 .95l-6.13 1.9a2 2 0 0 0-1.28 1.28l-1.9 6.13a.5.5 0 0 1-.95 0z" />,
    'tag': <><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></>,
    'pen-line': <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    'flame': <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
    'dna': <><path d="M2 15c6.667-6 13.333 0 20-6" /><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" /><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" /><path d="m17 6-2.5-2.5M14 8l-1-1M7 18l2.5 2.5M10 16l1 1M5 14l-3-3M22 13l-3-3" /></>,
    'image': <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>,
    'arrow-left': <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
    'copy': <><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
    'check': <path d="M20 6 9 17l-5-5" />,
    'zap': <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
    'alert-triangle': <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></>,
    'eye': <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    'eye-off': <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></>,
    'cpu': <><rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" rx="1" /><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2" /></>,
    'layers': <><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></>,
    'video': <><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

type ActiveTool = 'hub' | 'metadata' | 'textcopy'

// ── Premium bento tool card ────────────────────────────────────────────────────
function ToolCard({ icon, title, desc, tags, locked, onClick }: {
  icon: React.ReactNode; title: string; desc: string; tags: string[]; locked?: boolean; onClick: () => void
}) {
  const tr = useTr()
  return (
    <button onClick={onClick} className="sf-card sf-card-lift sf-spotlight sf-press cursor-pointer text-left w-full group relative overflow-hidden"
      style={{
        borderColor: 'var(--border-accent)',
        padding: 'var(--sp-5)',
        opacity: locked ? 0.6 : 1,
      }}>
      {/* Hover glow overlay */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 160px 100px at 20% 30%, rgba(99,102,241,0.08), transparent)', transition: 'opacity var(--t-smooth)' }} />

      <div className="relative" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        {/* Icon row */}
        <div className="flex items-start justify-between gap-2">
          <div className="sf-page-icon-sm group-hover:scale-110"
            style={{ transition: 'transform var(--t-base)' }}>
            {icon}
          </div>
          {locked && (
            <span className="sf-badge sf-badge-warn inline-flex items-center gap-1">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              {tr('Clé Anthropic requise', 'Anthropic key required')}
            </span>
          )}
        </div>

        {/* Text */}
        <div>
          <p className="text-[13px] font-bold text-text1 group-hover:text-accent" style={{ transition: 'color var(--t-fast)' }}>{title}</p>
          <p className="text-[12px] mt-1 leading-relaxed text-text2">{desc}</p>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap" style={{ gap: 'var(--sp-2)' }}>
          {tags.map(tag => (
            <span key={tag} className="sf-badge sf-badge-muted">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}

// ── Section header (v2 section label) ─────────────────────────────────────────
function SectionHeader({ label, badge, icon }: { label: string; badge?: string; icon?: React.ReactNode }) {
  return (
    <div className="sf-cluster mb-4 sf-anim-slide-up" style={{ gap: 'var(--sp-3)' }}>
      {icon && (
        <span className="text-text3" style={{ opacity: 0.7, display: 'inline-flex' }}>{icon}</span>
      )}
      <p className="sf-section-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>{label}</p>
      {badge && (
        <span className="sf-badge sf-badge-warn">{badge}</span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function AiTools({ user }: AiToolsProps) {
  const t = useT()
  const tr = useTr()
  const [active, setActive] = useState<ActiveTool>('hub')
  const conns = useConnections(user)

  // Loading state — skeleton mirroring the hub geometry
  if (conns.loading) {
    return (
      <div className="sf-page anim-page">
        <div className="sf-page-header">
          <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
            <div className="sf-skeleton" style={{ width: 46, height: 46, borderRadius: 'var(--r-md)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div className="sf-skeleton sf-skeleton-text" style={{ width: 180, height: 18 }} />
              <div className="sf-skeleton sf-skeleton-text" style={{ width: 260, height: 12, marginTop: 8 }} />
            </div>
          </div>
        </div>
        <div className="sf-page-body">
          <div className="space-y-6 max-w-6xl">
            <div>
              <div className="sf-skeleton sf-skeleton-text" style={{ width: 140, height: 11, marginBottom: 16 }} />
              <div className="grid grid-cols-3 gap-4">
                {[0, 1].map(i => (
                  <div key={i} className="sf-skeleton sf-skeleton-card" style={{ height: 148 }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Route — metadata
  if (active === 'metadata') return <MetadataChanger user={user} onBack={() => setActive('hub')} />

  // Route — text copy
  if (active === 'textcopy') return <TextCopy user={user} onBack={() => setActive('hub')} />

  // ── Hub ────────────────────────────────────────────────────────────────────
  return (
    <div className="sf-page anim-page">

      {/* ── Page header ── */}
      <div className="sf-page-header">
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          {/* Sparkle/AI icon in header tile */}
          <div className="sf-page-icon sf-anim-scale-spring">
            <Icon name="sparkles" size={22} />
          </div>

          {/* Text */}
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title">{t('aiToolsTitle')}</h1>
            <p className="sf-page-sub">{tr('Outils de traitement vidéo et de variation de contenu', 'Video processing and content variation tools')}</p>
          </div>
        </div>

      </div>

      {/* ── Content ── */}
      <div className="sf-page-body">
        <div className="space-y-6 max-w-6xl">
          {/* ── Outils IA ── */}
          <section>
            <SectionHeader label={tr('Outils vidéo', 'Video tools')} badge="FFmpeg" icon={<Icon name="video" size={13} />} />
            <div className="grid grid-cols-3 gap-4 anim-stagger">
              <ToolCard
                icon={<Icon name="tag" />}
                title={tr('Métadonnées', 'Metadata')}
                desc={tr('Supprime toutes les métadonnées et injecte un timestamp aléatoire.', 'Strips all metadata and injects a random timestamp.')}
                tags={['FFmpeg', 'Stream copy', 'Instant']}
                onClick={() => setActive('metadata')}
              />
              <ToolCard
                icon={<Icon name="pen-line" />}
                title={tr('Texte IA', 'AI Text')}
                desc={tr('Ajoute du texte à plusieurs positions pour créer des copies vidéo uniques.', 'Adds text at multiple positions to create unique video copies.')}
                tags={['FFmpeg', tr('Texte', 'Text'), 'Anti-ban']}
                onClick={() => setActive('textcopy')}
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
