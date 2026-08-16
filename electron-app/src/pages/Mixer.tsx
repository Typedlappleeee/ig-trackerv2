import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { ACCENT, ACCENT_L, TEXT_1, TEXT_2, TEXT_3, HAIR, BG_1, BG_2, OK, WARN, ERR } from '@/lib/theme'
import { supabase, fetchAllRows, type ContentItem } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { getSignedUrl, uploadVideoFromPath } from '@/lib/storage'
import { BankFolderSelect } from '@/components/BankFolderSelect'
import { useTr } from '@/lib/i18n'
import { nextScaleflowNumber, scaleflowName } from '@/lib/bankNaming'
import type { CaptionItem } from './CaptionBank'
import { OverlayComposer } from './OverlayComposer'

interface MixerProps { user: User }
type MixPosition = 'bottom' | 'middle' | 'top' | 'custom'

// Localisation GPS proposée dans le Mixer (résolue côté serveur, comme le Spoof).
const MIX_GPS_OPTIONS: { value: string; label: string }[] = [
  { value: 'random',       label: '🎲 Aléatoire (tous pays)' },
  { value: 'random_usa',   label: '🇺🇸 Aléatoire USA (tout le pays)' },
  { value: 'newyork',      label: 'New York' },
  { value: 'losangeles',   label: 'Los Angeles' },
  { value: 'miami',        label: 'Miami' },
  { value: 'lasvegas',     label: 'Las Vegas' },
  { value: 'paris',        label: 'Paris' },
  { value: 'london',       label: 'Londres' },
  { value: 'dubai',        label: 'Dubaï' },
  { value: 'tokyo',        label: 'Tokyo' },
]

// ── Inline Lucide-style icons (no emoji UI icons) ─────────────────────────────
function SfIcon({ size = 16, children, ...rest }: { size?: number; children: React.ReactNode } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}
const IconX            = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></SfIcon>
const IconClapperboard = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></SfIcon>
const IconChevronUp    = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><polyline points="18 15 12 9 6 15"/></SfIcon>
const IconChevronDown  = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><polyline points="6 9 12 15 18 9"/></SfIcon>
const IconAlignCenter  = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="12" x2="7" y2="12"/><line x1="19" y1="18" x2="5" y2="18"/></SfIcon>

interface MixJob {
  id:        string
  videoItem: ContentItem
  caption:   CaptionItem
  status:    'pending' | 'processing' | 'done' | 'error'
  outputUrl?:   string
  localPath?:   string
  storagePath?: string  // Supabase storage path (web only) for bank-save
  savedToBank?: boolean
  error?:    string
}

// ── Video thumbnail (lazy signed URL) ────────────────────────────────────────
function VideoThumb({ item, size = 'sm' }: { item: ContentItem; size?: 'sm' | 'md' }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    getSignedUrl(item.thumbnail_path ?? item.storage_path).then(setUrl)
  }, [item.thumbnail_path, item.storage_path])
  const h = size === 'md' ? 100 : 72
  return (
    <div style={{ width: '100%', height: h, background: BG_2, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
      {url
        ? <img src={url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: TEXT_3 }}><IconClapperboard size={18} /></div>
      }
    </div>
  )
}

// ── Draggable caption placement preview (9:16) ───────────────────────────────
// Affiche la miniature de la 1re vidéo et un chip texte déplaçable. Renvoie la
// position en fractions (0..1) du CENTRE — mêmes coordonnées que le serveur.
function CaptionDragPreview({
  bgItem, value, onChange, sample, color,
}: {
  bgItem?: ContentItem
  value: { x: number; y: number }
  onChange: (v: { x: number; y: number }) => void
  sample: string
  color: string
}) {
  const [bg, setBg] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  useEffect(() => {
    if (bgItem) getSignedUrl(bgItem.thumbnail_path ?? bgItem.storage_path).then(setBg)
    else setBg(null)
  }, [bgItem?.thumbnail_path, bgItem?.storage_path])

  const moveTo = (clientX: number, clientY: number) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.min(Math.max((clientX - r.left) / r.width, 0), 1)
    const y = Math.min(Math.max((clientY - r.top) / r.height, 0), 1)
    onChange({ x: +x.toFixed(4), y: +y.toFixed(4) })
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
      <div
        ref={boxRef}
        onPointerDown={e => { dragging.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); moveTo(e.clientX, e.clientY) }}
        onPointerMove={e => { if (dragging.current) moveTo(e.clientX, e.clientY) }}
        onPointerUp={() => { dragging.current = false }}
        style={{ position: 'relative', width: 150, aspectRatio: '9 / 16', borderRadius: 10, overflow: 'hidden', border: `1px solid ${HAIR}`, background: bg ? `#000 url(${bg}) center/cover` : BG_2, cursor: 'crosshair', touchAction: 'none' }}
      >
        <div
          style={{
            position: 'absolute', left: `${value.x * 100}%`, top: `${value.y * 100}%`,
            transform: 'translate(-50%, -50%)', maxWidth: '92%', padding: '2px 6px', borderRadius: 5,
            background: 'rgba(0,0,0,0.35)', color, fontWeight: 800, fontSize: 11, lineHeight: 1.15,
            textAlign: 'center', textShadow: '0 1px 2px #000, 0 0 2px #000', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {sample || 'Aa'}
        </div>
      </div>
    </div>
  )
}

// ── Picker sidebar ────────────────────────────────────────────────────────────
function PickerSidebar({
  folders, active, onSelect, allCount, allLabel,
}: {
  folders: string[]; active: string | null
  onSelect: (f: string | null) => void
  allCount: number; allLabel: string
}) {
  const btnBase: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', textAlign: 'left', fontSize: 12,
    background: 'transparent', border: 'none', cursor: 'pointer',
    overflow: 'hidden',
  }
  const active0 = active === null
  return (
    <div style={{ width: 160, flexShrink: 0, borderRight: `1px solid ${HAIR}`, overflowY: 'auto', padding: '4px 0' }}>
      <button
        onClick={() => onSelect(null)}
        style={{ ...btnBase, background: active0 ? 'rgba(99,102,241,0.12)' : 'transparent', borderLeft: `2px solid ${active0 ? ACCENT : 'transparent'}`, color: active0 ? ACCENT_L : TEXT_2, paddingLeft: active0 ? 10 : 12 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span style={{ flex: 1 }}>{allLabel}</span>
        <span style={{ fontSize: 10, opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}>{allCount}</span>
      </button>
      {folders.map(f => {
        const isA = active === f
        return (
          <button
            key={f}
            onClick={() => onSelect(f)}
            style={{ ...btnBase, background: isA ? 'rgba(99,102,241,0.12)' : 'transparent', borderLeft: `2px solid ${isA ? ACCENT : 'transparent'}`, color: isA ? ACCENT_L : TEXT_2, paddingLeft: isA ? 10 : 12 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Video picker modal ────────────────────────────────────────────────────────
function VideoPicker({
  user, onSelect, onClose,
}: {
  user: User
  onSelect: (items: ContentItem[]) => void
  onClose: () => void
}) {
  const { currentOrg } = useOrg()
  const tr = useTr()
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchAllRows<ContentItem>((from, to) => {
      let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false }).range(from, to)
      q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
      return q
    }).then((rows) => {
      setItems(rows.filter(i => i.storage_path?.match(/\.(mp4|mov)$/i) || i.file_url?.match(/\.(mp4|mov)$/i)))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [currentOrg?.id, user.id])

  const folders = [...new Set(items.map(i => i.folder).filter((f): f is string => Boolean(f)))].sort()
  const visible = items.filter(i => {
    if (folder !== null && i.folder !== folder) return false
    if (!search) return true
    return i.title.toLowerCase().includes(search.toLowerCase())
  })

  const toggle = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const confirm = () => onSelect(items.filter(i => selected.has(i.id)))

  return (
    <div tabIndex={-1} ref={el => el?.focus()} onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', outline: 'none' }} onClick={onClose}>
      <div style={{ background: BG_2, border: `1px solid ${HAIR}`, borderRadius: 16, width: 900, maxWidth: '95vw', height: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px -12px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_L} strokeWidth="2"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
          </div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: TEXT_1, flex: 1 }}>{tr('Banque vidéo', 'Video bank')}</h2>
          <input
            type="text" placeholder={tr('Rechercher…', 'Search…')} value={search} onChange={e => setSearch(e.target.value)}
            className="sf-input" style={{ width: 160 }}
          />
          {selected.size > 0 && (
            <button onClick={confirm} className="sf-btn sf-btn-primary" style={{ cursor: 'pointer' }}>
              {tr('Confirmer', 'Confirm')} ({selected.size})
            </button>
          )}
          <button onClick={onClose} aria-label={tr('Fermer', 'Close')} className="sf-btn sf-btn-ghost sf-btn-icon" style={{ cursor: 'pointer' }}><IconX size={18} /></button>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <PickerSidebar folders={folders} active={folder} onSelect={setFolder} allCount={items.length} allLabel={tr('Tout', 'All')} />
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="sf-skeleton-card" style={{ height: 124 }} />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="sf-empty" style={{ padding: '48px 16px' }}>
                <div className="sf-empty-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-glow)" strokeWidth="1.75"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
                </div>
                <p className="sf-empty-title" style={{ fontSize: 14, fontWeight: 700 }}>{tr('Aucune vidéo', 'No video')}</p>
                <p className="sf-empty-desc" style={{ fontSize: 12.5 }}>{search ? tr('Aucun résultat pour cette recherche', 'No result for this search') : tr('Importe des vidéos dans la banque', 'Import videos into the bank')}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                {visible.map(item => {
                  const sel = selected.has(item.id)
                  return (
                    <div key={item.id} onClick={() => toggle(item.id)}
                      className="sf-hover-lift"
                      style={{ cursor: 'pointer', borderRadius: 10, overflow: 'hidden', border: `2px solid ${sel ? ACCENT : HAIR}`, background: BG_1, transition: 'border-color 0.12s, transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease', position: 'relative' }}>
                      <VideoThumb item={item} size="md" />
                      <p style={{ fontSize: 10, color: TEXT_2, padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                      {sel && (
                        <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 6, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Caption picker modal ──────────────────────────────────────────────────────
function CaptionPicker({
  user, onSelect, onClose,
}: {
  user: User
  onSelect: (items: CaptionItem[]) => void
  onClose: () => void
}) {
  const { currentOrg } = useOrg()
  const tr = useTr()
  const [items, setItems] = useState<CaptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    let q = supabase.from('caption_bank').select('*').order('created_at', { ascending: false })
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => { setItems(data ?? []); setLoading(false) })
  }, [currentOrg?.id, user.id])

  const folders = [...new Set(items.map(i => i.folder).filter((f): f is string => Boolean(f)))].sort()
  const visible = items.filter(i => {
    if (folder !== null && i.folder !== folder) return false
    if (!search) return true
    const q = search.toLowerCase()
    return i.title?.toLowerCase().includes(q) || i.content.toLowerCase().includes(q)
  })

  const toggle = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const confirm = () => onSelect(items.filter(i => selected.has(i.id)))

  return (
    <div tabIndex={-1} ref={el => el?.focus()} onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', outline: 'none' }} onClick={onClose}>
      <div style={{ background: BG_2, border: `1px solid ${HAIR}`, borderRadius: 16, width: 720, maxWidth: '95vw', height: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px -12px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_L} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: TEXT_1, flex: 1 }}>{tr('Banque de captions', 'Caption bank')}</h2>
          <input
            type="text" placeholder={tr('Rechercher…', 'Search…')} value={search} onChange={e => setSearch(e.target.value)}
            className="sf-input" style={{ width: 160 }}
          />
          {selected.size > 0 && (
            <button onClick={confirm} className="sf-btn sf-btn-primary" style={{ cursor: 'pointer' }}>
              {tr('Confirmer', 'Confirm')} ({selected.size})
            </button>
          )}
          <button onClick={onClose} aria-label={tr('Fermer', 'Close')} className="sf-btn sf-btn-ghost sf-btn-icon" style={{ cursor: 'pointer' }}><IconX size={18} /></button>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <PickerSidebar folders={folders} active={folder} onSelect={setFolder} allCount={items.length} allLabel={tr('Tout', 'All')} />
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="sf-skeleton-card" style={{ height: 68 }} />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="sf-empty" style={{ padding: '48px 16px' }}>
                <div className="sf-empty-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-glow)" strokeWidth="1.75" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <p className="sf-empty-title" style={{ fontSize: 14, fontWeight: 700 }}>{tr('Aucune caption', 'No caption')}</p>
                <p className="sf-empty-desc" style={{ fontSize: 12.5 }}>{search ? tr('Aucun résultat pour cette recherche', 'No result for this search') : tr('Crée des captions dans la banque', 'Create captions in the bank')}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visible.map(item => {
                  const sel = selected.has(item.id)
                  return (
                    <div key={item.id} onClick={() => toggle(item.id)}
                      className="sf-hover-lift"
                      style={{ padding: '12px 14px', borderRadius: 12, background: sel ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${sel ? 'rgba(99,102,241,0.4)' : HAIR}`, cursor: 'pointer', transition: 'all 0.12s', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${sel ? ACCENT : 'rgba(255,255,255,0.15)'}`, background: sel ? ACCENT : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {item.title && <p style={{ fontSize: 12, fontWeight: 600, color: TEXT_1, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>}
                        <p className="line-clamp-3" style={{ fontSize: 11, color: TEXT_2, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{item.content}</p>
                        {item.folder && (
                          <span className="sf-badge sf-badge-accent" style={{ marginTop: 6, display: 'inline-flex' }}>{item.folder}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function Mixer({ user }: MixerProps) {
  const { currentOrg } = useOrg()
  const tr = useTr()

  const [selVideos,   setSelVideos]   = useState<ContentItem[]>([])
  const [selCaptions, setSelCaptions] = useState<CaptionItem[]>([])

  const [showVideoPicker,   setShowVideoPicker]   = useState(false)
  const [showCaptionPicker, setShowCaptionPicker] = useState(false)

  const [position,  setPosition]  = useState<MixPosition>('bottom')
  // Placement libre : fraction (0..1) du CENTRE du texte quand position==='custom'.
  const [customXY,  setCustomXY]  = useState<{ x: number; y: number }>({ x: 0.5, y: 0.85 })
  const [fontSize,  setFontSize]  = useState(52)
  const [fontColor, setFontColor] = useState('#ffffff')
  const [mode,      setMode]      = useState<'random' | 'all'>('random')
  const [composerMode, setComposerMode] = useState<'caption' | 'overlay'>('caption')

  // Spoof intégré : nettoyage métadonnées + injection GPS directement au mix.
  const [gpsSpoof,  setGpsSpoof]  = useState(true)
  const [gpsCity,   setGpsCity]   = useState('random')
  // Piste audio MP3 optionnelle (remplace le son d'origine).
  const [mp3, setMp3]             = useState<{ name: string; storagePath: string; url: string } | null>(null)
  const [mp3Uploading, setMp3Uploading] = useState(false)

  const [jobs,    setJobs]    = useState<MixJob[]>([])
  const [running, setRunning] = useState(false)
  const cancelRef             = useRef(false)   // « Annuler » : stoppe le traitement en cours
  const [cancelling, setCancelling] = useState(false)
  const [error,   setError]   = useState('')
  const [saveFolder, setSaveFolder] = useState<string | null>(null)
  // Numérotation « scaleflowN » réservée avant le lot : JS mono-thread ⇒ pas de
  // doublon entre les workers parallèles de l'auto-enregistrement.
  const bankNum = useRef(0)

  const removeVideo   = (id: string) => setSelVideos(p => p.filter(v => v.id !== id))
  const removeCaption = (id: string) => setSelCaptions(p => p.filter(c => c.id !== id))

  const addVideos   = (items: ContentItem[]) => {
    setSelVideos(p => { const ids = new Set(p.map(v => v.id)); return [...p, ...items.filter(i => !ids.has(i.id))] })
    setShowVideoPicker(false)
  }
  const addCaptions = (items: CaptionItem[]) => {
    setSelCaptions(p => { const ids = new Set(p.map(c => c.id)); return [...p, ...items.filter(i => !ids.has(i.id))] })
    setShowCaptionPicker(false)
  }

  // Upload d'un MP3 dans le storage (bucket content, arborescence de l'utilisateur
  // → accepté par la garde SSRF isOwnStoragePath). Une fois uploadé, le même fichier
  // sert pour tout le lot (son injecté à la place de la piste d'origine).
  const onPickMp3 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.(mp3|m4a|aac|wav)$/i.test(file.name)) { setError(tr('Formats audio acceptés : mp3, m4a, aac, wav', 'Accepted audio: mp3, m4a, aac, wav')); return }
    setMp3Uploading(true); setError('')
    try {
      const ext = (file.name.match(/\.[^.]+$/)?.[0] ?? '.mp3').toLowerCase()
      const storagePath = `videos/users/${user.id}/mixaudio-${Date.now()}${ext}`
      const { error: upErr } = await supabase.storage.from('content').upload(storagePath, file, { contentType: file.type || 'audio/mpeg', upsert: true })
      if (upErr) throw upErr
      const url = await getSignedUrl(storagePath)
      setMp3({ name: file.name, storagePath, url: url ?? '' })
    } catch (err) {
      setError(tr('Échec upload audio : ', 'Audio upload failed: ') + (err instanceof Error ? err.message : String(err)))
    } finally {
      setMp3Uploading(false)
    }
  }

  const canStart = selVideos.length > 0 && selCaptions.length > 0 && !running

  const updateJob = (id: string, patch: Partial<MixJob>) =>
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))

  const buildJobs = (): MixJob[] => {
    if (mode === 'all') {
      return selVideos.flatMap(v => selCaptions.map(c => ({ id: `${v.id}-${c.id}`, videoItem: v, caption: c, status: 'pending' as const })))
    }
    return selVideos.map((v, i) => ({
      id: `${v.id}-${selCaptions[i % selCaptions.length].id}-${i}`,
      videoItem: v,
      caption: selCaptions[i % selCaptions.length],
      status: 'pending' as const,
    }))
  }

  // Enregistre une vidéo terminée dans la banque. Sur le web, la vidéo est déjà
  // dans le storage (job.storagePath) → simple insert. Sur Electron, on upload
  // d'abord le fichier local. Idempotent (ne ré-enregistre pas).
  const saveJobToBank = async (job: MixJob, assignedNum?: number): Promise<boolean> => {
    if (job.savedToBank) return true
    try {
      let storagePath = job.storagePath ?? null
      let thumbnailPath: string | null = null
      if (!storagePath && job.localPath && !job.localPath.startsWith('http')) {
        const scope = currentOrg?.id ? { mode: 'org' as const, id: currentOrg.id } : { mode: 'user' as const, id: user.id }
        const up = await uploadVideoFromPath(job.localPath, scope)
        storagePath = up.storagePath
        thumbnailPath = up.thumbnailPath
      }
      if (!storagePath) return false
      // Numéro réservé pendant le lot (pas de course), sinon requête fraîche (bouton manuel).
      const n = assignedNum ?? await nextScaleflowNumber(user.id, currentOrg?.id ?? null)
      const { error } = await supabase.from('content_bank').insert({
        user_id: user.id, org_id: currentOrg?.id ?? null,
        title: scaleflowName(n),
        file_url: null, storage_path: storagePath, thumbnail_path: thumbnailPath,
        folder: saveFolder, tags: [], notes: '',
      })
      if (error) return false
      updateJob(job.id, { savedToBank: true })
      return true
    } catch { return false }
  }

  // Annule le mix en cours : on arrête de lancer de nouveaux jobs.
  const cancelMix = () => { cancelRef.current = true; setCancelling(true) }

  const startMix = async () => {
    setError('')
    cancelRef.current = false; setCancelling(false)
    const newJobs = buildJobs()
    setJobs(newJobs)
    setRunning(true)
    bankNum.current = await nextScaleflowNumber(user.id, currentOrg?.id ?? null)   // numérotation du lot

    const CONCURRENCY = 3
    const processJob = async (job: MixJob) => {
      updateJob(job.id, { status: 'processing' })
      try {
        // Resolve video URL — prefer storage_path (fresh signed URL), fall back to file_url
        const signedUrl = job.videoItem.storage_path
          ? await getSignedUrl(job.videoItem.storage_path)
          : job.videoItem.file_url ?? null
        if (!signedUrl) throw new Error(tr('URL vidéo introuvable (storage_path et file_url sont vides)', 'Video URL not found (storage_path and file_url are empty)'))

        const api = window.electronAPI
        if (!api?.runFfmpegMixOverlay) throw new Error(tr('IPC runFfmpegMixOverlay manquant — rebuild l\'app Electron', 'IPC runFfmpegMixOverlay missing — rebuild the Electron app'))

        const res = await api.runFfmpegMixOverlay({
          sourcePath: signedUrl,
          caption:    job.caption.content,
          position,
          ...(position === 'custom' ? { posX: customXY.x, posY: customXY.y } : {}),
          fontSize,
          fontColor,
          gpsSpoof,
          gpsCity,
          ...(mp3 ? { audioStoragePath: mp3.storagePath, audioPath: mp3.url } : {}),
        })
        if (!res.ok || !res.outputPath) throw new Error(res.error ?? tr('Échec ffmpeg', 'ffmpeg failed'))

        // Web: outputPath is a Supabase URL → use directly.
        // Electron: outputPath is a local path → wrap in localvideo://.
        const localUrl = res.outputPath.startsWith('http')
          ? res.outputPath
          : (() => {
              let n = res.outputPath.replace(/\\/g, '/')
              if (!n.startsWith('/')) n = '/' + n
              return 'localvideo://' + n.split('/').map(encodeURIComponent).join('/')
            })()

        const storagePath = (res as any).storagePath
        updateJob(job.id, { status: 'done', outputUrl: localUrl, localPath: res.outputPath, storagePath })
        supabase.from('caption_bank').update({ used_count: (job.caption.used_count ?? 0) + 1 }).eq('id', job.caption.id).then(() => {})
        // Enregistrement automatique dans la banque (numéro scaleflow réservé).
        await saveJobToBank({ ...job, status: 'done', outputUrl: localUrl, localPath: res.outputPath, storagePath }, bankNum.current++)
      } catch (e: unknown) {
        updateJob(job.id, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }

    for (let i = 0; i < newJobs.length; i += CONCURRENCY) {
      if (cancelRef.current) break
      await Promise.all(newJobs.slice(i, i + CONCURRENCY).map(processJob))
    }
    if (cancelRef.current) setJobs(prev => prev.map(j => (j.status === 'pending' || j.status === 'processing') ? { ...j, status: 'error', error: 'annulé' } : j))
    setRunning(false); setCancelling(false)
  }

  const doneJobs  = jobs.filter(j => j.status === 'done')
  const errorJobs = jobs.filter(j => j.status === 'error')

  // Mode « Image/Vidéo positionnée » → composeur dédié (placement + timing).
  if (composerMode === 'overlay') return <OverlayComposer user={user} onExit={() => setComposerMode('caption')} />

  return (
    <div className="anim-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--base)' }}>

      {/* ── Premium Header ── */}
      <header className="sf-page-header" style={{ background: 'rgba(7,7,12,0.96)', backdropFilter: 'blur(20px)' }}>
        <div className="sf-anim-slide-up sf-d50" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Icon badge */}
          <div className="sf-page-icon sf-anim-scale-spring" style={{ ['--icon-grad' as string]: 'linear-gradient(135deg,#818CF8,#8B5CF6 55%,#6366F1)' }}>
            {/* Edit + merge icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="sf-page-title sf-title-grad" style={{ fontSize: 22, fontWeight: 800 }}>
                Mixer
              </h1>
              {running ? (
                <span className="sf-status-chip is-accent">
                  <span className="sf-status-dot" />
                  {tr('En cours', 'Running')}
                </span>
              ) : (
                <span className="sf-status-chip">{tr('Prêt', 'Ready')}</span>
              )}
            </div>
            <p className="sf-page-sub">
              {tr('Superpose tes captions sur tes vidéos de la banque, en lot.', 'Overlay your captions on your bank videos, in bulk.')} · {selVideos.length} {tr(`vidéo${selVideos.length !== 1 ? 's' : ''}`, `video${selVideos.length !== 1 ? 's' : ''}`)} · {selCaptions.length} caption{selCaptions.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="sf-anim-slide-up sf-d100" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Composer type : texte (défaut) vs image/vidéo positionnée */}
          <div className="sf-segment">
            <button className="sf-segment-item is-active cursor-pointer">{tr('Texte', 'Text')}</button>
            <button className="sf-segment-item cursor-pointer" onClick={() => setComposerMode('overlay')}>{tr('Image/Vidéo', 'Image/Video')}</button>
          </div>
          {/* Mode toggle */}
          <div className="sf-segment">
            {([{ k: 'random' as const, label: tr('Aléatoire', 'Random') }, { k: 'all' as const, label: tr('Tout combiner', 'Combine all') }] as const).map(m => (
              <button key={m.k} onClick={() => setMode(m.k)}
                className={`sf-segment-item${mode === m.k ? ' is-active' : ''}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Launch */}
          <button onClick={startMix} disabled={!canStart}
            className="sf-btn sf-btn-primary sf-btn-lg"
            style={{ cursor: canStart ? 'pointer' : 'not-allowed', opacity: canStart ? 1 : 0.35 }}>
            {running ? (
              <><div className="sf-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />{tr('En cours…', 'Running…')}</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>{tr('Lancer le mix', 'Start mix')}</>
            )}
          </button>
          {running && (
            <button onClick={cancelMix} disabled={cancelling}
              className="sf-btn sf-btn-lg cursor-pointer"
              style={{ background: 'rgba(248,113,113,0.14)', border: '1px solid rgba(248,113,113,0.4)', color: '#F87171', fontWeight: 700 }}>
              {cancelling ? tr('Annulation…', 'Cancelling…') : tr('Annuler', 'Cancel')}
            </button>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="anim-stagger" style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

        {/* Col 1 — Videos */}
        <aside style={{ width: 275, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
          {/* Panel header */}
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_L} strokeWidth="2"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{tr('Vidéos source', 'Source videos')}</span>
            </div>
            {selVideos.length > 0 && (
              <span className="sf-badge sf-badge-accent">{selVideos.length}</span>
            )}
          </div>

          {/* Add button */}
          <div style={{ padding: '12px 14px', flexShrink: 0 }}>
            <button onClick={() => setShowVideoPicker(true)}
              className="sf-btn sf-btn-primary cursor-pointer"
              style={{ width: '100%', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {tr('Depuis la Banque', 'From the Bank')}
            </button>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
            {selVideos.length === 0 ? (
              <div className="sf-empty" style={{ padding: '32px 16px' }}>
                <div className="sf-empty-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-glow)" strokeWidth="1.75"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
                </div>
                <p className="sf-empty-title" style={{ fontSize: 14, fontWeight: 700 }}>{tr('Aucune vidéo', 'No video')}</p>
                <p className="sf-empty-desc" style={{ fontSize: 12.5 }}>{tr('Ajoute des vidéos depuis la banque', 'Add videos from the bank')}</p>
                <button onClick={() => setShowVideoPicker(true)} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer" style={{ marginTop: 12 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {tr('Ajouter des vidéos', 'Add videos')}
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {selVideos.map(v => (
                  <div key={v.id} style={{ position: 'relative' }}>
                    <VideoThumb item={v} />
                    <p style={{ fontSize: 9, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '3px 2px', textAlign: 'center' }}>{v.title}</p>
                    <button onClick={() => removeVideo(v.id)} aria-label={tr('Retirer', 'Remove')} className="sf-btn sf-btn-danger cursor-pointer"
                      style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, padding: 0, borderRadius: 5, minWidth: 0 }}>
                      <IconX size={10} strokeWidth={2.25} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Col 2 — Captions */}
        <aside style={{ width: 275, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
          {/* Panel header */}
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_L} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Captions</span>
            </div>
            {selCaptions.length > 0 && (
              <span className="sf-badge sf-badge-accent">{selCaptions.length}</span>
            )}
          </div>

          {/* Add button */}
          <div style={{ padding: '12px 14px', flexShrink: 0 }}>
            <button onClick={() => setShowCaptionPicker(true)}
              className="sf-btn sf-btn-primary cursor-pointer"
              style={{ width: '100%', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {tr('Depuis la Banque', 'From the Bank')}
            </button>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
            {selCaptions.length === 0 ? (
              <div className="sf-empty" style={{ padding: '32px 16px' }}>
                <div className="sf-empty-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-glow)" strokeWidth="1.75" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <p className="sf-empty-title" style={{ fontSize: 14, fontWeight: 700 }}>{tr('Aucune caption', 'No caption')}</p>
                <p className="sf-empty-desc" style={{ fontSize: 12.5 }}>{tr('Ajoute des captions depuis la banque', 'Add captions from the bank')}</p>
                <button onClick={() => setShowCaptionPicker(true)} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer" style={{ marginTop: 12 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {tr('Ajouter des captions', 'Add captions')}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selCaptions.map(c => (
                  <div key={c.id} className="sf-card" style={{ position: 'relative', padding: '10px 12px' }}>
                    {c.title && <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 20 }}>{c.title}</p>}
                    <p className="line-clamp-2" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                    <button onClick={() => removeCaption(c.id)} aria-label={tr('Retirer', 'Remove')} className="sf-btn sf-btn-danger cursor-pointer"
                      style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, padding: 0, borderRadius: 4, minWidth: 0 }}>
                      <IconX size={9} strokeWidth={2.25} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Col 3 — Configuration panel */}
        <div className="anim-stagger" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--base)', padding: '24px 28px', gap: 20 }}>

          {/* Config card */}
          <div className="sf-card sf-spotlight" style={{ padding: '20px 22px' }}>
            <p className="sf-section-label" style={{ marginBottom: 20 }}>{tr('Configuration du texte', 'Text configuration')}</p>

            {/* Position */}
            <div style={{ marginBottom: 20 }}>
              <p className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Position du texte', 'Text position')}</p>
              <div className="sf-segment" style={{ display: 'flex', width: '100%' }}>
                {(['top', 'middle', 'bottom', 'custom'] as MixPosition[]).map(p => (
                  <button key={p} onClick={() => setPosition(p)}
                    className={`sf-segment-item${position === p ? ' is-active' : ''}`}
                    style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {p === 'top' ? <><IconChevronUp size={14} /> {tr('Haut', 'Top')}</> : p === 'middle' ? <><IconAlignCenter size={14} /> {tr('Centre', 'Center')}</> : p === 'bottom' ? <><IconChevronDown size={14} /> {tr('Bas', 'Bottom')}</> : <>✋ {tr('Libre', 'Free')}</>}
                  </button>
                ))}
              </div>
              {position === 'custom' && (
                <>
                  <CaptionDragPreview
                    bgItem={selVideos[0]}
                    value={customXY}
                    onChange={setCustomXY}
                    sample={selCaptions[0]?.content?.split('\n')[0]?.slice(0, 22) ?? 'Aa'}
                    color={fontColor}
                  />
                  <p style={{ fontSize: 10.5, color: TEXT_3, textAlign: 'center', marginTop: 6 }}>
                    {tr('Glisse le texte où tu veux · appliqué à toutes les vidéos', 'Drag the text anywhere · applied to every video')}
                  </p>
                </>
              )}
            </div>

            {/* Font size */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p className="sf-section-label" style={{ margin: 0 }}>{tr('Taille de police', 'Font size')}</p>
                <span className="sf-badge sf-badge-accent" style={{ fontVariantNumeric: 'tabular-nums' }}>{fontSize}px</span>
              </div>
              <input type="range" min={18} max={72} step={2} value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366F1', cursor: 'pointer' }} />
            </div>

            {/* Font color */}
            <div>
              <p className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Couleur du texte', 'Text color')}</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                  style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${HAIR}`, background: 'transparent', cursor: 'pointer', padding: 2 }} />
                {['#ffffff', '#000000', '#ffff00', '#ff4444', '#44aaff'].map(c => (
                  <button key={c} onClick={() => setFontColor(c)} className="cursor-pointer"
                    style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `2px solid ${fontColor === c ? ACCENT : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', transform: fontColor === c ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.1s' }} />
                ))}
              </div>
            </div>

            {/* Spoof intégré — nettoyage métadonnées + GPS (plus besoin de spoof après) */}
            <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={gpsSpoof} onChange={e => setGpsSpoof(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#6366F1', cursor: 'pointer' }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{tr('🛡 Nettoyer les métadonnées + injecter un GPS', '🛡 Strip metadata + inject GPS')}</span>
              </label>
              <p style={{ fontSize: 10.5, color: TEXT_3, margin: '6px 0 0 26px' }}>
                {tr('Le mix sort déjà « spoofé » — inutile de repasser par l\'onglet Spoof.', 'The mix comes out already spoofed — no need for the Spoof tab.')}
              </p>
              {gpsSpoof && (
                <select
                  value={gpsCity}
                  onChange={e => setGpsCity(e.target.value)}
                  className="sf-input"
                  style={{ width: '100%', marginTop: 10, fontSize: 12, color: '#e8e8f0', background: '#1a1a2e' }}
                >
                  {MIX_GPS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value} style={{ color: '#e8e8f0', background: '#1a1a2e' }}>{o.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Piste audio MP3 optionnelle (remplace le son d'origine) */}
            <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
              <p className="sf-section-label" style={{ marginBottom: 8 }}>{tr('🎵 Musique (MP3) — optionnel', '🎵 Music (MP3) — optional')}</p>
              {mp3 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="sf-badge sf-badge-accent" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mp3.name}</span>
                  <button onClick={() => setMp3(null)} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">{tr('Retirer', 'Remove')}</button>
                </div>
              ) : (
                <label className="sf-btn sf-btn-ghost cursor-pointer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {mp3Uploading
                    ? <><div className="sf-spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />{tr('Upload…', 'Uploading…')}</>
                    : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>{tr('Choisir un MP3', 'Choose an MP3')}</>}
                  <input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav" onChange={onPickMp3} disabled={mp3Uploading} style={{ display: 'none' }} />
                </label>
              )}
              <p style={{ fontSize: 10.5, color: TEXT_3, marginTop: 6 }}>
                {tr('Remplace la bande-son de chaque vidéo (bouclée si plus courte).', 'Replaces each video\'s soundtrack (looped if shorter).')}
              </p>
            </div>

            {/* Bank destination — chosen before launching */}
            <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
              <BankFolderSelect value={saveFolder} onChange={setSaveFolder} userId={user.id} orgId={currentOrg?.id} label={tr('Dossier de la banque', 'Bank folder')} />
            </div>
          </div>

          {/* Summary card */}
          {canStart && (
            <div className="sf-card anim-scale-in sf-glow-accent" style={{ padding: '16px 20px', borderColor: 'rgba(139,92,246,0.28)', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.15)', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_L} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: ACCENT_L, fontVariantNumeric: 'tabular-nums' }}>
                    {mode === 'random'
                      ? tr(`${selVideos.length} vidéo${selVideos.length > 1 ? 's' : ''} × 1 caption = ${selVideos.length} résultat${selVideos.length > 1 ? 's' : ''}`, `${selVideos.length} video${selVideos.length > 1 ? 's' : ''} × 1 caption = ${selVideos.length} result${selVideos.length > 1 ? 's' : ''}`)
                      : tr(`${selVideos.length} × ${selCaptions.length} = ${selVideos.length * selCaptions.length} résultat${selVideos.length * selCaptions.length > 1 ? 's' : ''}`, `${selVideos.length} × ${selCaptions.length} = ${selVideos.length * selCaptions.length} result${selVideos.length * selCaptions.length > 1 ? 's' : ''}`)
                    }
                  </p>
                  <p style={{ fontSize: 11, color: TEXT_3, marginTop: 2 }}>Mode: {mode === 'random' ? tr('Aléatoire — 1 caption par vidéo', 'Random — 1 caption per video') : tr('Toutes les combinaisons', 'All combinations')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="sf-banner is-danger sf-anim-slide-up" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Results strip ── */}
      {jobs.length > 0 && (
        <div className="sf-anim-slide-up" style={{ flexShrink: 0, height: 250, borderTop: '1px solid var(--border)', padding: '14px 20px 24px', overflowX: 'auto', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexShrink: 0 }}>
            <p className="sf-section-label" style={{ margin: 0 }}>{tr('Résultats', 'Results')}</p>
            {running && <div className="sf-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />}
            {!running && doneJobs.length > 0 && <span className="sf-badge sf-badge-ok" style={{ fontVariantNumeric: 'tabular-nums' }}>{tr(`${doneJobs.length}/${jobs.length} terminés`, `${doneJobs.length}/${jobs.length} done`)}</span>}
            {errorJobs.length > 0 && <span className="sf-badge sf-badge-danger" style={{ fontVariantNumeric: 'tabular-nums' }}>{tr(`${errorJobs.length} erreur${errorJobs.length > 1 ? 's' : ''}`, `${errorJobs.length} error${errorJobs.length > 1 ? 's' : ''}`)}</span>}
            {doneJobs.length > 0 && (
              <div style={{ marginLeft: 'auto', fontSize: 10, color: TEXT_3, whiteSpace: 'nowrap' }}>
                {tr('Dossier :', 'Folder:')} <span style={{ color: ACCENT_L, fontWeight: 600 }}>{saveFolder ?? tr('Racine', 'Root')}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, height: 165 }}>
            {jobs.map(job => (
              <div key={job.id} style={{ flexShrink: 0, width: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div className="sf-card" style={{ position: 'relative', width: 90, height: 130, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10 }}>
                  {job.status === 'done' && job.outputUrl ? (
                    <video src={job.outputUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted
                      onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                      onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }} />
                  ) : job.status === 'error' ? (
                    <div title={job.error} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, width: '100%', height: '100%' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ERR} strokeWidth="1.75" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span style={{ color: ERR, fontSize: 9, textAlign: 'center', lineHeight: 1.4, wordBreak: 'break-word' }}>{job.error ?? tr('Erreur', 'Error')}</span>
                    </div>
                  ) : (
                    <div className="sf-spinner" />
                  )}
                  {job.status === 'done' && job.outputUrl && (
                    <div style={{ position: 'absolute', bottom: 4, right: 4, display: 'flex', gap: 3 }}>
                      {/* Save to bank */}
                      {(job.storagePath || job.localPath) && !job.savedToBank && (
                        <button
                          title={tr('Enregistrer dans la banque', 'Save to bank')}
                          onClick={e => { e.stopPropagation(); void saveJobToBank(job) }}
                          className="sf-press cursor-pointer"
                          style={{ background: ACCENT, borderRadius: 6, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4 20h16"/><path d="M4 12v4h4l4-4 4 4h4v-4"/><path d="M12 4v12"/></svg>
                        </button>
                      )}
                      {job.savedToBank && (
                        <div title={tr('Sauvegardé dans la banque', 'Saved to bank')} style={{ background: OK, borderRadius: 6, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                      {/* Download */}
                      <button
                        title={tr('Télécharger', 'Download')}
                        onClick={async e => {
                          e.stopPropagation()
                          if (job.localPath && window.electronAPI?.saveFileAs) {
                            const r = await window.electronAPI.saveFileAs({ sourcePath: job.localPath, defaultName: `scaleflow-${job.videoItem.title}.mov` })
                            if (r.ok || r.canceled) return
                          }
                          const a = document.createElement('a'); a.href = job.outputUrl!; a.download = `scaleflow-${job.videoItem.title}.mov`; a.click()
                        }}
                        className="sf-press cursor-pointer"
                        style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </button>
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{job.videoItem.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showVideoPicker && (
        <VideoPicker user={user} onSelect={addVideos} onClose={() => setShowVideoPicker(false)} />
      )}
      {showCaptionPicker && (
        <CaptionPicker user={user} onSelect={addCaptions} onClose={() => setShowCaptionPicker(false)} />
      )}
    </div>
  )
}
