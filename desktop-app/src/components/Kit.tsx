// Kit visuel partagé (style Explorer / Tableau de bord) : en-tête de page, onglets soulignés,
// cartes « bento », zone de dépôt, vignettes média, barre de progression, rangées de réglage,
// cartes de choix, journal repliable, bandeau GeeLark. Purement visuel — aucune logique métier.
import { useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { Icon, Toggle, useNarrow } from '@/lib/ui'
import { MediaThumb } from '@/components/MediaThumb'

// ── En-tête de page : sur-titre, titre (casse normale), sous-titre, actions ─────
export function PageHeader({ kicker, title, sub, actions, style }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; style?: CSSProperties }) {
  const narrow = useNarrow(760)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 22, ...style }}>
      <div style={{ minWidth: 0 }}>
        {kicker && <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#71717A' }}>{kicker}</span>}
        <h1 style={{ margin: kicker ? '4px 0 0' : 0, fontSize: narrow ? 30 : 38, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: '#F4F4F5' }}>{title}</h1>
        {sub && <p style={{ margin: '8px 0 0', fontSize: 14.5, lineHeight: 1.5, color: '#8B8B94', maxWidth: 680 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}

// ── Onglets soulignés (collants, pleine largeur) ─────────────────────────────
export interface TabItem<T extends string> { k: T; l: ReactNode; n?: number; icon?: string }
export function UnderlineTabs<T extends string>({ items, value, onChange, back, right, sticky = true, style }: {
  items: TabItem<T>[]; value: T; onChange: (k: T) => void; back?: { label: string; onClick: () => void }; right?: ReactNode; sticky?: boolean; style?: CSSProperties
}) {
  const narrow = useNarrow(760)
  // Marges calées sur celles de la page (Shell : 16 px sous 860 px, sinon 32 px) : pas de
  // débordement horizontal entre 760 et 860 px.
  const tight = useNarrow(860)
  return (
    <div style={{ position: sticky ? 'sticky' : 'relative', top: 0, zIndex: 6, margin: tight ? '0 -16px 22px' : '0 -32px 26px', padding: tight ? '0 16px' : '0 32px', background: 'rgba(10,10,11,0.86)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.07)', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {back && (
          <>
            <button type="button" onClick={back.onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, height: 34, padding: '0 10px 0 6px', marginRight: 4, borderRadius: 9, border: 'none', background: 'transparent', color: '#D4D4D8', fontSize: 13.5, fontWeight: 650, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <Icon d="M15 18l-6-6 6-6" size={16} sw={2.2} />{narrow ? '' : back.label}
            </button>
            <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', marginRight: 6, flexShrink: 0 }} />
          </>
        )}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {items.map(t => {
            const on = t.k === value
            return (
              <button key={t.k} type="button" onClick={() => onChange(t.k)} aria-pressed={on}
                style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, height: 48, padding: '0 13px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: on ? 700 : 600, color: on ? '#F4F4F5' : '#71717A', transition: 'color .15s ease' }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.color = '#D4D4D8' }} onMouseLeave={e => { if (!on) e.currentTarget.style.color = '#71717A' }}>
                {t.icon && <Icon d={t.icon} size={14} />}{t.l}
                {t.n !== undefined && <span style={{ fontSize: 12, fontWeight: 600, color: on ? '#A1A1AA' : '#52525B', fontVariantNumeric: 'tabular-nums' }}>{t.n}</span>}
                <span style={{ position: 'absolute', left: 11, right: 11, bottom: -1, height: 2, borderRadius: 2, background: on ? '#F4F4F5' : 'transparent' }} />
              </button>
            )
          })}
        </div>
        {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingLeft: 8 }}>{right}</div>}
      </div>
    </div>
  )
}

// ── Carte « bento » + intitulé avec icône ─────────────────────────────────────
export function Bento({ children, style, glow, onClick, delay = 0, pad }: { children: ReactNode; style?: CSSProperties; glow?: string; onClick?: () => void; delay?: number; pad?: number | string }) {
  const [h, setH] = useState(false)
  return (
    <section onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: 'relative', overflow: 'hidden', minWidth: 0, boxSizing: 'border-box', borderRadius: 22, background: '#0E0E10', border: `1px solid ${h && onClick ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)'}`, cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color .2s ease', animation: `dbRise .55s cubic-bezier(.2,.8,.2,1) ${delay}s both`, ...style }}>
      {glow && <span style={{ position: 'absolute', top: -120, right: -80, width: 320, height: 320, borderRadius: 999, background: `radial-gradient(circle, ${glow}, transparent 65%)`, pointerEvents: 'none', opacity: h ? 1 : 0.75, transition: 'opacity .3s ease' }} />}
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: pad }}>{children}</div>
    </section>
  )
}
export const BENTO_KEYFRAMES = '@keyframes dbRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}'
export function Label({ icon, children, right }: { icon: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 650, color: '#A1A1AA', minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, flexShrink: 0, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: '#E4E4E7' }}><Icon d={icon} size={13} /></span>
        {children}
      </span>
      {right}
    </div>
  )
}

// ── Zone de dépôt (glisser-déposer + clic) ───────────────────────────────────
export function DropZone({ accept, multiple = true, onFiles, busy, title, hint, compact, children }: {
  accept: string; multiple?: boolean; onFiles: (files: File[]) => void; busy?: string | null; title: string; hint?: ReactNode; compact?: boolean; children?: ReactNode
}) {
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const accepts = (f: File) => accept.split(',').some(a => { a = a.trim(); return a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : f.type === a || f.name.toLowerCase().endsWith(a.replace('*', '')) })
  return (
    <div role="button" tabIndex={0} onClick={() => !busy && ref.current?.click()} onKeyDown={e => { if (e.key === 'Enter') ref.current?.click() }}
      onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const fs = Array.from(e.dataTransfer.files).filter(accepts); if (fs.length) onFiles(multiple ? fs : fs.slice(0, 1)) }}
      style={{ position: 'relative', display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: compact ? 12 : 10, padding: compact ? '14px 16px' : '28px 18px', borderRadius: 16, cursor: busy ? 'progress' : 'pointer', textAlign: compact ? 'left' : 'center',
        border: `1.5px dashed ${over ? '#A78BFA' : 'rgba(255,255,255,0.14)'}`, background: over ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.015)', transition: 'border-color .15s ease, background .15s ease', outline: 'none' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: compact ? 38 : 46, height: compact ? 38 : 46, flexShrink: 0, borderRadius: 99, background: over ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)', color: over ? '#C4B5FD' : '#D4D4D8' }}>
        {busy ? <span style={{ width: 18, height: 18, borderRadius: 99, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'aSpin .8s linear infinite' }} /> : <Icon d="M12 16V4|M7 9l5-5 5 5|M4 20h16" size={compact ? 16 : 19} sw={2} />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <b style={{ fontSize: 14, fontWeight: 700, color: '#F4F4F5' }}>{busy ?? title}</b>
        {hint && !busy && <span style={{ fontSize: 12.5, color: '#8B8B94', lineHeight: 1.45 }}>{hint}</span>}
      </span>
      {children}
      <input ref={ref} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }} onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) onFiles(fs); e.target.value = '' }} />
    </div>
  )
}

// ── Vignette média (9:16, 4:5…) avec titre, durée, retrait, lecture au survol ──
export function MediaTile({ thumb, video, title, sub, aspect = '9 / 16', onRemove, onClick, badge, selected, style }: {
  thumb?: string | null; video?: string | null; title?: string; sub?: ReactNode; aspect?: string; onRemove?: () => void; onClick?: () => void; badge?: ReactNode; selected?: boolean; style?: CSSProperties
}) {
  const [h, setH] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: 'relative', aspectRatio: aspect, borderRadius: 14, overflow: 'hidden', background: '#141416', cursor: onClick ? 'pointer' : 'default', boxShadow: selected ? '0 0 0 2px #A78BFA' : h ? '0 0 0 1px rgba(255,255,255,0.22)' : '0 0 0 1px rgba(255,255,255,0.06)', transition: 'box-shadow .15s ease', ...style }}>
      {/* Miniature → 1re image vidéo → repli lisible (jamais noir) ; lecture au survol. */}
      <MediaThumb id={title ?? thumb ?? video ?? 'media'} thumb={thumb ?? null} media={video ?? null} video={!!video || !thumb} small playing={h && !!video} />
      {(title || sub) && <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,.82))', pointerEvents: 'none' }} />}
      {badge && <span style={{ position: 'absolute', top: 7, left: 7 }}>{badge}</span>}
      {onRemove && (
        <button type="button" aria-label="Retirer" title="Retirer" onClick={e => { e.stopPropagation(); onRemove() }}
          style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 99, border: 'none', background: 'rgba(10,10,11,0.7)', backdropFilter: 'blur(6px)', color: '#fff', cursor: 'pointer', opacity: h ? 1 : 0.75 }}>
          <Icon d="M18 6L6 18|M6 6l12 12" size={11} sw={2.4} />
        </button>
      )}
      {(title || sub) && (
        <span style={{ position: 'absolute', left: 8, right: 8, bottom: 7, display: 'flex', flexDirection: 'column', gap: 1, pointerEvents: 'none' }}>
          {title && <span data-no-tr style={{ fontSize: 11.5, fontWeight: 650, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>}
          {sub && <span style={{ fontSize: 10.5, color: '#D4D4D8', fontVariantNumeric: 'tabular-nums' }}>{sub}</span>}
        </span>
      )}
    </div>
  )
}

// ── Barre de progression (globale + étape) ───────────────────────────────────
export function ProgressBar({ value, label, right, step }: { value: number; label?: ReactNode; right?: ReactNode; step?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {(label || right) && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#D4D4D8' }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span><span style={{ color: '#A1A1AA', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{right}</span></div>}
      <div style={{ position: 'relative', height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pct}%`, borderRadius: 99, background: 'linear-gradient(90deg,#8B5CF6,#EC4899)', boxShadow: '0 0 12px rgba(236,72,153,.45)', transition: 'width .3s ease' }} />
      </div>
      {step !== undefined && (
        <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(0, Math.min(1, step)) * 100}%`, background: 'rgba(196,181,253,0.6)', transition: 'width .2s ease' }} />
        </div>
      )}
    </div>
  )
}

// ── Rangée de réglage : intitulé + aide + contrôle ───────────────────────────
export function FieldRow({ label, hint, children, inline }: { label: ReactNode; hint?: ReactNode; children: ReactNode; inline?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', alignItems: inline ? 'center' : 'stretch', justifyContent: 'space-between', gap: inline ? 12 : 8 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 650, color: '#E4E4E7' }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: '#71717A', lineHeight: 1.45 }}>{hint}</span>}
      </span>
      <span style={{ flexShrink: 0, minWidth: 0 }}>{children}</span>
    </div>
  )
}
export function SwitchRow({ label, hint, on, onChange }: { label: ReactNode; hint?: ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: on ? 'rgba(167,139,250,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', transition: 'background .15s ease, border-color .15s ease' }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 650, color: '#E4E4E7' }}>{label}</span>
        {hint && <span style={{ fontSize: 11.5, color: '#71717A', lineHeight: 1.4 }}>{hint}</span>}
      </span>
      <Toggle on={on} onChange={onChange} />
    </label>
  )
}

// ── Cartes de choix (remplace un petit segmenté quand le choix compte) ────────
export function ChoiceCards<T extends string>({ value, onChange, options, cols }: { value: T; onChange: (v: T) => void; options: { v: T; l: ReactNode; d?: ReactNode; icon?: string }[]; cols?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0,1fr))`, gap: 8 }}>
      {options.map(o => {
        const on = o.v === value
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={on}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0, padding: '11px 12px', borderRadius: 13, cursor: 'pointer', textAlign: 'left', color: 'inherit',
              background: on ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.07)'}`, boxShadow: on ? '0 0 0 3px rgba(167,139,250,0.12)' : 'none', transition: 'all .15s ease' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: on ? '#F4F4F5' : '#D4D4D8' }}>{o.icon && <Icon d={o.icon} size={14} />}{o.l}</span>
            {o.d && <span style={{ fontSize: 11.5, color: '#8B8B94', lineHeight: 1.4 }}>{o.d}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── Journal repliable (détails techniques) ───────────────────────────────────
export function RunLog({ lines, defaultOpen = false, title = 'Détails techniques' }: { lines: string[]; defaultOpen?: boolean; title?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!lines.length) return null
  return (
    <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)', overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: 'none', background: 'transparent', color: '#A1A1AA', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>
        <span style={{ display: 'flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}><Icon d="M9 18l6-6-6-6" size={13} sw={2.2} /></span>
        {title}<span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#5A5A63', fontVariantNumeric: 'tabular-nums' }}>{lines.length}</span>
      </button>
      {open && <div data-no-tr style={{ maxHeight: 180, overflowY: 'auto', padding: '0 12px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 1.65, color: '#8B8B94', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{lines.join('\n')}</div>}
    </div>
  )
}

// ── Bandeau « Connecte GeeLark » (unique, partagé par les pages) ─────────────
export function GeelarkBanner({ onConnect, text }: { onConnect: () => void; text?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 16, borderRadius: 14, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.28)', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 99, flexShrink: 0, background: 'rgba(251,191,36,0.14)', color: '#FBBF24' }}><Icon d="M12 9v4|M12 17h.01|M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" size={15} /></span>
      <span style={{ flex: '1 1 220px', fontSize: 13, color: '#FDE68A', lineHeight: 1.45 }}>{text ?? 'Connecte ton compte GeeLark (token OpenAPI) pour piloter tes téléphones.'}</span>
      <button type="button" onClick={onConnect} style={{ height: 32, padding: '0 13px', borderRadius: 9, border: 'none', background: '#FBBF24', color: '#0A0A0B', fontSize: 12.5, fontWeight: 750, cursor: 'pointer' }}>Connecter GeeLark</button>
    </div>
  )
}
