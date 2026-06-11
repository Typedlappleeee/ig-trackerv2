import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { VideoThumbnail } from './Bank'
import { Spinner } from '@/components/ui/Spinner'
import { Button }  from '@/components/ui/Button'
import { useOrg } from '@/lib/orgContext'
import { uploadVideoFromPath, getSignedUrl, type UploadScope } from '@/lib/storage'
import { logActivity } from '@/lib/activityLog'
import { useConnections } from '@/lib/connections'
import { useT, useLang } from '@/lib/i18n'

interface MontageProps { user: User }

// ── Inline Lucide-style icons (no emoji UI icons) ─────────────────────────────
function SfIcon({ size = 16, children, ...rest }: { size?: number; children: React.ReactNode } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}
const IconX            = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></SfIcon>
const IconCheck        = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><polyline points="20 6 9 17 4 12"/></SfIcon>
const IconClapperboard = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></SfIcon>
const IconPalette      = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></SfIcon>
const IconSliders      = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></SfIcon>
const IconScissors     = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></SfIcon>
const IconZap          = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></SfIcon>

// ── Types ─────────────────────────────────────────────────────────────────────────────
interface TimelineClip {
  uid:       string
  item:      ContentItem
  trimStart: number    // seconds from start of original
  trimEnd:   number    // seconds (0 = use full duration)
  caption:   string
  color:     string
  speed:     number    // 1.0 = normal
  fade:      boolean   // fade-in at clip start
}

interface TextOverlay {
  uid:       string
  text:      string
  startTime: number
  endTime:   number
  position:  'top' | 'center' | 'bottom'  // kept for compat, unused when x/y set
  x:         number   // 0-100 (% from left)
  y:         number   // 0-100 (% from top)
  fontSize:  number
  color:     string
}

interface Transition {
  afterClipUid: string
  type: 'cut' | 'fade' | 'dissolve' | 'wipe'
}

type Preset        = '9:16' | '1:1' | '16:9'
type Tab           = 'medias' | 'texte' | 'transitions' | 'filtres' | 'ajustement'
type Filter        = 'none' | 'vivid' | 'warm' | 'cold' | 'bw' | 'cinema' | 'vintage' | 'fade'
type AutoCaptionPos = 'top' | 'center' | 'bottom'

const FILTER_LABELS: Record<Filter, string> = {
  none: 'Original', vivid: 'Vivid', warm: 'Warm', cold: 'Cold',
  bw: 'Black & White', cinema: 'Cinema', vintage: 'Vintage', fade: 'Soft',
}
const FILTER_CSS: Record<Filter, string> = {
  none:    '',
  vivid:   'saturate(1.6) contrast(1.1)',
  warm:    'sepia(0.3) saturate(1.2)',
  cold:    'hue-rotate(20deg) saturate(0.9)',
  bw:      'grayscale(1)',
  cinema:  'contrast(1.2) saturate(0.8) brightness(0.95)',
  vintage: 'sepia(0.4) contrast(0.9) brightness(1.05)',
  fade:    'brightness(1.1) contrast(0.85) saturate(0.85)',
}

const COLORS = ['#4f9eff','#a56ef5','#00ccaa','#ffaa2a','#ff6ec7','#2dde78','#ff5c6e','#00e5d4']
const TRANSITIONS: { type: Transition['type']; label: string; icon: React.ReactNode }[] = [
  { type: 'cut',     label: 'Cut',      icon: <IconScissors size={15} /> },
  { type: 'fade',    label: 'Fade',     icon: <SfIcon size={15}><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></SfIcon> },
  { type: 'dissolve',label: 'Dissolve', icon: <SfIcon size={15}><circle cx="12" cy="12" r="10" strokeDasharray="4 2"/></SfIcon> },
  { type: 'wipe',    label: 'Wipe',     icon: <SfIcon size={15}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></SfIcon> },
]

let _ci = 0
const nextColor = () => COLORS[_ci++ % COLORS.length]

function effectiveDur(c: TimelineClip): number {
  const raw = c.item.duration ?? 30
  const end = c.trimEnd > 0 ? Math.min(c.trimEnd, raw) : raw
  return Math.max(0.5, (end - c.trimStart) / c.speed)
}
function totalDur(clips: TimelineClip[]): number { return clips.reduce((s, c) => s + effectiveDur(c), 0) }
function fmtTime(s: number): string {
  const m = Math.floor(Math.abs(s) / 60)
  const sec = Math.floor(Math.abs(s) % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
function basename(p: string) { return p.replace(/\\/g, '/').split('/').pop() ?? p }
function localSrc(p: string | null | undefined): string | null {
  if (!p) return null
  if (p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:')) return p
  if (!window.electronAPI) return null  // web mode: can’t serve local file paths
  const n = p.replace(/\\/g, '/')
  const withSlash = n.startsWith('/') ? n : `/${n}`
  return `localvideo://${encodeURI(withSlash)}`
}

// ── Time ruler ──────────────────────────────────────────────────────────────────────────────
function TimeRuler({ total, scale }: { total: number; scale: number }) {
  const w = Math.max(total * scale + 200, 600)
  const step = scale >= 60 ? 1 : scale >= 20 ? 2 : 5
  const ticks: number[] = []
  for (let t = 0; t <= total + step * 5; t += step) ticks.push(t)
  return (
    <div className="relative select-none bg-surface flex-shrink-0" style={{ width: w, height: 22 }}>
      {ticks.map(t => (
        <div key={t} className="absolute top-0 flex flex-col" style={{ left: t * scale }}>
          <div className="w-px bg-border/60" style={{ height: t % (step * 5) === 0 ? 12 : 6 }} />
          {t % (step * 5) === 0 && (
            <span className="text-[9px] text-text2/60 ml-0.5 -translate-x-1/2">{fmtTime(t)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Clip block in timeline ──────────────────────────────────────────────────────────────────────────
function ClipBlock({
  clip, scale, isSelected, onSelect, onUpdate, onDelete,
  onDragStart, onDragOver, onDrop,
}: {
  clip:        TimelineClip
  scale:       number
  isSelected:  boolean
  onSelect:    (uid: string) => void
  onUpdate:    (uid: string, p: Partial<TimelineClip>) => void
  onDelete:    (uid: string) => void
  onDragStart: (uid: string) => void
  onDragOver:  (e: React.DragEvent) => void
  onDrop:      (uid: string) => void
}) {
  const dur   = effectiveDur(clip)
  const raw   = clip.item.duration ?? 30
  const width = Math.max(dur * scale, 44)

  function startTrimDrag(e: React.MouseEvent, side: 'start' | 'end') {
    e.stopPropagation(); e.preventDefault()
    const startX = e.clientX
    const initVal = side === 'start' ? clip.trimStart : (clip.trimEnd > 0 ? clip.trimEnd : raw)
    function onMove(mv: MouseEvent) {
      const delta = (mv.clientX - startX) / scale
      if (side === 'start') onUpdate(clip.uid, { trimStart: Math.max(0, Math.min(initVal + delta, raw - 0.5)) })
      else onUpdate(clip.uid, { trimEnd: Math.max(clip.trimStart + 0.5, Math.min(initVal + delta, raw)) })
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className={`relative flex-shrink-0 rounded-lg overflow-visible cursor-pointer select-none h-12 group transition-shadow ${
        isSelected ? 'ring-2 ring-white/70 shadow-xl z-10' : 'hover:brightness-110'
      }`}
      style={{ width, background: `linear-gradient(135deg, ${clip.color}ee, ${clip.color}88)` }}
      onClick={() => onSelect(clip.uid)}
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart(clip.uid) }}
      onDragOver={e => { e.preventDefault(); onDragOver(e) }}
      onDrop={e => { e.preventDefault(); onDrop(clip.uid) }}
    >
      {/* Left trim handle */}
      <div
        className="absolute left-0 inset-y-0 w-2.5 flex items-center justify-center cursor-col-resize bg-black/30 hover:bg-black/50 z-10 rounded-l-lg"
        onMouseDown={e => startTrimDrag(e, 'start')}
      ><div className="w-0.5 h-4 bg-white/60 rounded-full" /></div>

      {/* Label */}
      <div className="px-3 h-full flex flex-col justify-center overflow-hidden">
        <p className="text-white text-[11px] font-semibold truncate leading-tight">{clip.item.title}</p>
        <p className="text-white/60 text-[9px] leading-tight">
          {clip.trimStart > 0 ? `${fmtTime(clip.trimStart)}→` : ''}{fmtTime(clip.trimEnd > 0 ? clip.trimEnd : raw)} · {fmtTime(dur)}
          {clip.speed !== 1 ? ` · ${clip.speed}×` : ''}
        </p>
      </div>

      {/* Right trim handle */}
      <div
        className="absolute right-0 inset-y-0 w-2.5 flex items-center justify-center cursor-col-resize bg-black/30 hover:bg-black/50 z-10 rounded-r-lg"
        onMouseDown={e => startTrimDrag(e, 'end')}
      ><div className="w-0.5 h-4 bg-white/60 rounded-full" /></div>

      {/* Delete on hover/select */}
      {isSelected && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(clip.uid) }}
          aria-label="Delete clip"
          className="absolute -top-2 -right-2 w-4 h-4 bg-danger rounded-full text-white flex items-center justify-center z-20 hover:scale-110 transition-transform"
        ><IconX size={10} strokeWidth={2.25} /></button>
      )}
    </div>
  )
}

// ── Transition badge between clips ───────────────────────────────────────────────────────────────────────
function TransitionBadge({ type, onClick }: { type: Transition['type']; onClick: () => void }) {
  const info = TRANSITIONS.find(t => t.type === type) ?? TRANSITIONS[0]
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-8 h-8 rounded-full bg-surface border-2 border-border hover:border-accent flex items-center justify-center text-xs text-text2 hover:text-accent transition-all z-10 self-center sf-press"
      style={{ transition: 'transform 0.09s cubic-bezier(0.4,0,0.2,1), border-color 0.18s ease, color 0.18s ease' }}
      title={info.label}
    >
      {info.icon}
    </button>
  )
}

// ── Properties panel ───────────────────────────────────────────────────────────────────────────────
function PropertiesPanel({
  clip, onUpdate,
}: {
  clip:     TimelineClip | null
  onUpdate: (uid: string, p: Partial<TimelineClip>) => void
}) {
  const t = useT()
  if (!clip) return (
    <div className="flex items-center justify-center h-full text-xs text-text2 p-4 text-center">
      <div className="space-y-2 flex flex-col items-center sf-anim-scale-in">
        <IconClapperboard size={24} />
        <p>{t('montageSelectClipProps')}</p>
      </div>
    </div>
  )
  const raw = clip.item.duration ?? 30
  const end = clip.trimEnd > 0 ? clip.trimEnd : raw

  return (
    <div className="p-3 space-y-4 overflow-auto h-full text-xs">
      <div>
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">{t('montageClipLabel')}</p>
        <p className="font-medium text-text text-sm truncate">{clip.item.title}</p>
        {clip.item.file_url && <p className="text-[9px] text-text2 font-mono truncate mt-0.5">{basename(clip.item.file_url)}</p>}
      </div>

      {/* Trim */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">{t('montageTrimLabel')}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-text2 block mb-1">{t('montageStartLabel')} <span className="text-accent">{fmtTime(clip.trimStart)}</span></label>
            <input type="range" min={0} max={end - 0.5} step={0.5} value={clip.trimStart}
              onChange={e => onUpdate(clip.uid, { trimStart: parseFloat(e.target.value) })}
              className="w-full accent-accent h-1.5" />
          </div>
          <div>
            <label className="text-text2 block mb-1">{t('montageEndLabel')} <span className="text-accent">{fmtTime(end)}</span></label>
            <input type="range" min={clip.trimStart + 0.5} max={raw} step={0.5} value={end}
              onChange={e => onUpdate(clip.uid, { trimEnd: parseFloat(e.target.value) })}
              className="w-full accent-accent h-1.5" />
          </div>
        </div>
        <p className="text-text2">{t('montageDurationLabel')} <span className="text-accent font-medium">{fmtTime(effectiveDur(clip))}</span></p>
      </div>

      {/* Speed */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">{t('montageSpeedLabel')} <span className="text-accent">{clip.speed}×</span></p>
        <input type="range" min={0.25} max={4} step={0.25} value={clip.speed}
          onChange={e => onUpdate(clip.uid, { speed: parseFloat(e.target.value) })}
          className="w-full accent-accent h-1.5" />
        <div className="flex justify-between text-text2">
          <span>0.25×</span><span>1×</span><span>4×</span>
        </div>
      </div>

      {/* Fade */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">{t('montageFadeInLabel')}</p>
        <button
          onClick={() => onUpdate(clip.uid, { fade: !clip.fade })}
          className={`w-8 h-4 rounded-full transition-colors ${clip.fade ? 'bg-accent' : 'bg-surface2'}`}
        >
          <span className={`block w-3 h-3 bg-white rounded-full shadow transition-all mt-0.5 ${clip.fade ? 'ml-[18px]' : 'ml-0.5'}`} />
        </button>
      </div>

      {/* Caption */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">{t('montageCaptionLabel')}</p>
        <textarea value={clip.caption} rows={3}
          onChange={e => onUpdate(clip.uid, { caption: e.target.value })}
          placeholder={t('montageCaptionPlaceholder')}
          className="w-full bg-surface border border-border rounded px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-accent resize-none" />
      </div>

      {/* Color */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">{t('montageColorLabel')}</p>
        <div className="flex gap-1.5 flex-wrap">
          {COLORS.map(c => (
            <button key={c} onClick={() => onUpdate(clip.uid, { color: c })}
              className={`w-5 h-5 rounded-full transition-all ${clip.color === c ? 'ring-2 ring-white scale-110' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Draggable text overlay with center snap ───────────────────────────────────────────────────
const SNAP_ZONE = 5  // % distance from center to trigger snap

function DraggableText({ overlay, onMove }: {
  overlay: TextOverlay
  onMove:  (uid: string, x: number, y: number) => void
}) {
  const ref     = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const start    = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })
  const [snapping, setSnapping] = useState(false)

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    start.current = { mx: e.clientX, my: e.clientY, ox: overlay.x, oy: overlay.y }

    function onMove_(ev: MouseEvent) {
      if (!dragging.current || !ref.current) return
      const parent = ref.current.parentElement!
      const rect   = parent.getBoundingClientRect()
      const dx = ((ev.clientX - start.current.mx) / rect.width)  * 100
      const dy = ((ev.clientY - start.current.my) / rect.height) * 100
      let nx = Math.max(0, Math.min(100, start.current.ox + dx))
      let ny = Math.max(0, Math.min(100, start.current.oy + dy))
      const snap = Math.abs(nx - 50) < SNAP_ZONE || Math.abs(ny - 50) < SNAP_ZONE
      if (Math.abs(nx - 50) < SNAP_ZONE) nx = 50
      if (Math.abs(ny - 50) < SNAP_ZONE) ny = 50
      setSnapping(snap)
      onMove(overlay.uid, nx, ny)
    }
    function onUp() {
      dragging.current = false
      setSnapping(false)
      window.removeEventListener('mousemove', onMove_)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove_)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      className="absolute select-none cursor-grab active:cursor-grabbing"
      style={{
        left:      `${overlay.x}%`,
        top:       `${overlay.y}%`,
        transform: 'translate(-50%, -50%)',
        fontSize:  overlay.fontSize * 0.5,
        color:     overlay.color,
        textShadow: '0 2px 8px rgba(0,0,0,0.9)',
        padding:   '4px 8px',
        borderRadius: 6,
        border:    snapping ? '1px dashed rgba(79,158,255,0.8)' : '1px solid transparent',
        boxShadow: snapping ? '0 0 0 2px rgba(79,158,255,0.4)' : 'none',
        transition: 'box-shadow 0.1s, border-color 0.1s',
        whiteSpace: 'nowrap',
      }}
    >
      {overlay.text}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────────────────────
export function Montage({ user }: MontageProps) {
  const t = useT()
  const { currentOrg } = useOrg()
  const credits = useCredits()
  const conns = useConnections(user)

  // AI caption generation state
  const [aiCapLoading, setAiCapLoading] = useState(false)
  const [aiCapError, setAiCapError]     = useState<string | null>(null)

  // Bank
  const [bankItems, setBankItems] = useState<ContentItem[]>([])
  const [bankLoading, setLL]      = useState(true)
  const [bankSearch, setBSearch]  = useState('')

  // Project state
  const [clips, setClips]           = useState<TimelineClip[]>([])
  const [transitions, setTrans]     = useState<Transition[]>([])
  const [textOverlays, setTexts]    = useState<TextOverlay[]>([])
  const [selectedUid, setSelUid]    = useState<string | null>(null)
  const [draggingUid, setDragUid]   = useState<string | null>(null)
  const [globalCaption, setGCap]    = useState('')
  const [projectName, setProjName]  = useState('My edit')
  const [activeFilter, setFilter]   = useState<Filter>('none')
  const [preset, setPreset]         = useState<Preset>('9:16')
  const [scale, setScale]           = useState(50)
  const [playhead, setPlayhead]     = useState(0)
  const [activeTab, setActiveTab]   = useState<Tab>('medias')

  // Sequential playback
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)
  const playAdvancedRef = useRef(false)  // guard against double-advance (onTimeUpdate + onEnded)

  // Auto-caption mode
  const [autoCaptionEnabled, setAutoCaptionEnabled] = useState(false)
  const [autoCaptionText, setAutoCaptionText]       = useState('')
  const [autoCaptionPos, setAutoCaptionPos]         = useState<AutoCaptionPos>('bottom')
  const [autoCaptionSize, setAutoCaptionSize]       = useState(36)
  const [autoCaptionColor, setAutoCaptionColor]     = useState('#ffffff')

  // Export
  const [exporting, setExporting]   = useState(false)
  const [expResult, setExpResult]   = useState<{ ok: boolean; msg: string; command?: string } | null>(null)

  // Refs
  const videoRef      = useRef<HTMLVideoElement>(null)
  const timelineRef   = useRef<HTMLDivElement>(null)
  const dropRef       = useRef<HTMLDivElement>(null)
  const [osDragging, setOsDrag] = useState(false)

  useEffect(() => {
    let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false })
    if (currentOrg) q = q.eq('org_id', currentOrg.id)
    else q = q.eq('user_id', user.id)
    Promise.resolve(q)
      .then(({ data }) => { setBankItems(data ?? []); setLL(false) })
      .catch((err: unknown) => { console.error('[Montage] bank load failed:', err); setLL(false) })
  }, [currentOrg?.id])

  // Sync auto-caption overlay → textOverlays
  useEffect(() => {
    const yMap: Record<AutoCaptionPos, number> = { top: 10, center: 50, bottom: 88 }
    setTexts(prev => {
      const rest = prev.filter(t => t.uid !== '__auto_caption__')
      if (!autoCaptionEnabled || !autoCaptionText.trim()) return rest
      const dur = totalDur(clips)
      return [...rest, {
        uid:       '__auto_caption__',
        text:      autoCaptionText,
        startTime: 0,
        endTime:   Math.max(dur, 1),
        position:  autoCaptionPos,
        x:         50,
        y:         yMap[autoCaptionPos],
        fontSize:  autoCaptionSize,
        color:     autoCaptionColor,
      }]
    })
  }, [autoCaptionEnabled, autoCaptionText, autoCaptionPos, autoCaptionSize, autoCaptionColor, clips])

  // ── Clip management ────────────────────────────────────────────────────────────────────
  function addClip(item: ContentItem) {
    const c: TimelineClip = { uid: `${item.id}-${Date.now()}`, item, trimStart: 0, trimEnd: 0, caption: '', color: nextColor(), speed: 1, fade: false }
    setClips(prev => [...prev, c])
    setSelUid(c.uid)
  }
  function updateClip(uid: string, p: Partial<TimelineClip>) { setClips(prev => prev.map(c => c.uid === uid ? { ...c, ...p } : c)) }
  function deleteClip(uid: string) {
    setClips(prev => prev.filter(c => c.uid !== uid))
    setTrans(prev => prev.filter(t => t.afterClipUid !== uid))
    if (selectedUid === uid) setSelUid(null)
  }
  function handleDrop(targetUid: string) {
    if (!draggingUid || draggingUid === targetUid) return
    setClips(prev => {
      const next = [...prev]
      const fi = next.findIndex(c => c.uid === draggingUid)
      const ti = next.findIndex(c => c.uid === targetUid)
      if (fi < 0 || ti < 0) return prev
      const [m] = next.splice(fi, 1); next.splice(ti, 0, m); return next
    })
    setDragUid(null)
  }

  // ── Cut at playhead ────────────────────────────────────────────────────────────────────────────
  const cutAtPlayhead = useCallback(() => {
    if (!selectedUid) return
    const clip = clips.find(c => c.uid === selectedUid)
    if (!clip) return
    let offset = 0
    for (const c of clips) { if (c.uid === selectedUid) break; offset += effectiveDur(c) }
    const raw = clip.item.duration ?? 30
    const cutPoint = clip.trimStart + (playhead - offset) * clip.speed
    const clipEnd  = clip.trimEnd > 0 ? clip.trimEnd : raw
    if (cutPoint <= clip.trimStart + 0.5 || cutPoint >= clipEnd - 0.5) {
      alert('Impossible de couper ici — place le curseur à au moins 0,5 s des bords du clip.')
      return
    }
    const a: TimelineClip = { ...clip, uid: `${clip.uid}-a`, trimEnd: cutPoint }
    // Start the second half 0.3s after the cut to avoid showing the uncut frame on transition
    const b: TimelineClip = { ...clip, uid: `${clip.uid}-b`, trimStart: Math.min(cutPoint + 0.3, clipEnd - 0.1), trimEnd: clip.trimEnd }
    setClips(prev => { const next = [...prev]; const i = next.findIndex(c => c.uid === selectedUid); next.splice(i, 1, a, b); return next })
    setSelUid(a.uid)
  }, [clips, selectedUid, playhead])

  // ── Transitions ────────────────────────────────────────────────────────────────────────────
  function getTransition(afterUid: string): Transition['type'] {
    return transitions.find(t => t.afterClipUid === afterUid)?.type ?? 'cut'
  }
  function cycleTransition(afterUid: string) {
    const cur = getTransition(afterUid)
    const idx = TRANSITIONS.findIndex(t => t.type === cur)
    const next = TRANSITIONS[(idx + 1) % TRANSITIONS.length].type
    setTrans(prev => {
      const filtered = prev.filter(t => t.afterClipUid !== afterUid)
      if (next === 'cut') return filtered
      return [...filtered, { afterClipUid: afterUid, type: next }]
    })
  }

  // ── Timeline click → playhead ───────────────────────────────────────────────────────────────
  function onTimelineClick(e: React.MouseEvent) {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft
    setPlayhead(Math.max(0, Math.min(x / scale, totalDur(clips))))
  }

  // ── OS drag-drop ─────────────────────────────────────────────────────────────────────────────
  function onOsDragOver(e: React.DragEvent) { e.preventDefault(); setOsDrag(true) }
  function onOsDragLeave(e: React.DragEvent) { if (!dropRef.current?.contains(e.relatedTarget as Node)) setOsDrag(false) }
  async function onOsDrop(e: React.DragEvent) {
    e.preventDefault(); setOsDrag(false)
    const file = e.dataTransfer.files[0]; if (!file) return
    const fp = (file as File & { path?: string }).path ?? file.name
    const title = fp.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Vidéo'
    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }
    try {
      const { storagePath, thumbnailPath } = await uploadVideoFromPath(fp, scope)
      const { data } = await supabase.from('content_bank').insert({
        user_id: user.id, org_id: currentOrg?.id ?? null, title,
        file_url: null, storage_path: storagePath, thumbnail_path: thumbnailPath,
        tags: [], notes: '',
      }).select().single()
      if (data) {
        setBankItems(prev => [data, ...prev]); addClip(data)
        logActivity({ orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '', action: 'bank_add', details: { title, source: 'montage_drop' } })
      }
    } catch (err) {
      console.error('[Montage] upload failed', err)
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────────────────────
  async function handleExport() {
    if (!clips.length) return
    setExporting(true); setExpResult(null)

    // Montage is free — no credit deduction

    const out = await window.electronAPI?.pickOutputFile?.({ defaultName: `${projectName.replace(/\s+/g, '_')}.mp4` })
    if (!out) { setExporting(false); return }
    try {
      const { resolveContentToLocalPath } = await import('@/lib/storage')
      const ffmpegClips = await Promise.all(clips.map(async c => ({
        filePath: await resolveContentToLocalPath(c.item),
        trimStart: c.trimStart,
        trimEnd:   c.trimEnd,
      })))
      const res = await window.electronAPI?.runFfmpeg?.({
        clips: ffmpegClips, outputPath: out, preset, transition: 'cut',
      })
      setExporting(false)
      if (res?.ok) setExpResult({ ok: true, msg: `Exported: ${out}` })
      else setExpResult({ ok: false, msg: res?.error ?? 'FFmpeg error', command: res?.command })
    } catch (e) {
      setExporting(false)
      setExpResult({ ok: false, msg: e instanceof Error ? e.message : String(e) })
    }
  }

  // ── AI Caption generation ────────────────────────────────────────────────────────────────
  async function generateAiCaption(clip: TimelineClip) {
    if (!conns.anthropic) { setAiCapError('Missing Anthropic API key (Settings → Connections)'); return }
    setAiCapLoading(true); setAiCapError(null)
    try {
      const { resolveContentToLocalPath } = await import('@/lib/storage')
      const filePath = await resolveContentToLocalPath(clip.item)
      const fr = await window.electronAPI!.extractFrames!({ filePath, endTime: 5, fps: 0.5 })
      if (!fr.ok || !fr.frames?.length) throw new Error('Unable to extract a frame from the video')

      const images = fr.frames.slice(0, 4).map(f => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.data },
      }))

      const res = await window.electronAPI!.anthropicVisionRequest!({
        apiKey: conns.anthropic,
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 120,
        messages: [{
          role: 'user',
          content: [
            ...images,
            {
              type: 'text',
              text: `Tu es un expert en contenu viral Instagram Reels.
Regarde ces frames de la vidéo et génère UNE SEULE caption courte (5-12 mots max) à superposer directement sur la vidéo.

RÈGLES ABSOLUES :
- Style "POV:" quand c’est pertinent (ex: "POV: tu découvres un endroit secret", "POV: quand la vie te surprend")
- Sinon une phrase accrocheuse, mystérieuse ou émotionnelle
- PAS de hashtags, PAS de guillemets, PAS d’explication
- Minuscules possibles, peut commencer par une minuscule
- EN FRANÇAIS

Réponds UNIQUEMENT avec la caption, rien d’autre.`,
            },
          ],
        }],
      })

      if (!res.ok) throw new Error(res.error ?? 'Erreur Anthropic')
      const raw = res.data as { content?: Array<{ type: string; text?: string }> }
      const text = raw?.content?.find(b => b.type === 'text')?.text?.trim() ?? ''
      if (!text) throw new Error('Empty response')

      // Apply to auto-caption mode
      setAutoCaptionEnabled(true)
      setAutoCaptionText(text)
      setAutoCaptionPos('bottom')
    } catch (e) {
      setAiCapError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiCapLoading(false)
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────────────────
  const selectedClip  = clips.find(c => c.uid === selectedUid) ?? null
  const total         = totalDur(clips)
  const timelineW     = Math.max(total * scale + 250, 600)

  // When playing sequentially show that clip; otherwise show selected clip
  const previewClip = playingIndex !== null ? (clips[playingIndex] ?? null) : selectedClip
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const item = previewClip?.item
    if (!item) { setPreviewSrc(null); return }
    if (item.file_url) { setPreviewSrc(localSrc(item.file_url)); return }
    if (item.storage_path) {
      // Clear first so we don’t briefly play the wrong clip when clip changes
      setPreviewSrc(null)
      getSignedUrl(item.storage_path)
        .then(url => { if (!cancelled) setPreviewSrc(url) })
        .catch(err => { console.error('[Montage] signed URL failed:', err) })
    } else {
      setPreviewSrc(null)
    }
    return () => { cancelled = true }
  // Use uid (timeline-unique) so effect reruns even when the same ContentItem is used twice
  }, [previewClip?.uid])

  function playAll() {
    if (clips.length === 0) return
    setPlayingIndex(0)
  }
  function stopAll() {
    setPlayingIndex(null)
    videoRef.current?.pause()
  }
  function onVideoLoaded() {
    if (playingIndex === null || !videoRef.current) return
    playAdvancedRef.current = false  // reset guard for this clip
    const clip = clips[playingIndex]
    if (clip?.trimStart > 0) videoRef.current.currentTime = clip.trimStart
    else videoRef.current.play().catch(() => {})
  }
  function onVideoSeekedForPlay() {
    if (playingIndex !== null) videoRef.current?.play().catch(() => {})
  }
  function onVideoEnded() {
    if (playAdvancedRef.current) return  // already advanced from onTimeUpdate
    playAdvancedRef.current = true
    if (playingIndex === null) return
    const next = playingIndex + 1
    if (next < clips.length) setPlayingIndex(next)
    else setPlayingIndex(null)
  }
  function onTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.target as HTMLVideoElement
    setPlayhead(v.currentTime)
    if (playingIndex !== null && !playAdvancedRef.current) {
      const clip = clips[playingIndex]
      const end  = clip?.trimEnd > 0 ? clip.trimEnd : Infinity
      // Detect 0.25s early to compensate for timeupdate’s ~250ms firing interval.
      // This ensures we never overshoot the cut point and show unwanted content.
      if (v.currentTime >= end - 0.25) { v.pause(); onVideoEnded() }
    }
  }
  const filteredBank  = bankItems.filter(i => !bankSearch || i.title.toLowerCase().includes(bankSearch.toLowerCase()) || i.tags.some(t => t.toLowerCase().includes(bankSearch.toLowerCase())))
  const PRESET_DIMS: Record<Preset, string> = { '9:16': '1080×1920', '1:1': '1080×1080', '16:9': '1920×1080' }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'medias',      label: t('montageMediaTab'),       icon: <IconClapperboard size={14} /> },
    { id: 'texte',       label: t('montageTextTab'),        icon: <SfIcon size={14}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></SfIcon> },
    { id: 'transitions', label: t('montageTransitionsTab'), icon: <IconScissors size={14} /> },
    { id: 'filtres',     label: t('montageFiltersTab'),     icon: <IconPalette size={14} /> },
    { id: 'ajustement',  label: t('montageAdjustTab'),      icon: <IconSliders size={14} /> },
  ]
  const FILTER_LABELS_DYN: Record<Filter, string> = {
    none: t('montageFilterOriginal'), vivid: t('montageFilterVivid'), warm: t('montageFilterWarm'), cold: t('montageFilterCold'),
    bw: t('montageFilterBW'), cinema: t('montageFilterCinema'), vintage: t('montageFilterVintage'), fade: t('montageFilterFade'),
  }

  return (
    <div ref={dropRef} className="flex flex-col h-full min-h-0 bg-bg anim-page"
      onDragOver={onOsDragOver} onDragLeave={onOsDragLeave} onDrop={onOsDrop}>

      {/* OS drop overlay */}
      {osDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-accent rounded-2xl px-20 py-12 bg-bg/90 backdrop-blur text-center space-y-4 flex flex-col items-center text-accent sf-anim-scale-in">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <IconClapperboard size={32} />
            </div>
            <p className="text-xl font-semibold">{t('montageDropVideoHere')}</p>
          </div>
        </div>
      )}

      {/* ── TOP TOOLBAR ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-border bg-surface">
        <div className="flex items-center">
          {/* Project name + icon */}
          <div className="w-56 flex-shrink-0 px-4 py-2.5 border-r border-border flex items-center gap-2 sf-anim-slide-up sf-d50">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(99,102,241,0.15)' }}>
              <IconClapperboard size={12} style={{ color: '#818CF8' }} />
            </div>
            <input value={projectName} onChange={e => setProjName(e.target.value)}
              className="text-[13px] font-semibold text-text bg-transparent focus:outline-none w-full truncate"
              placeholder={t('montageProjectName')} />
          </div>

          {/* Tab bar */}
          <div className="flex flex-1 overflow-x-auto sf-anim-slide-up sf-d100">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-[12px] font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === t.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text2 hover:text-text'
                }`}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 px-4 flex-shrink-0 border-l border-border sf-anim-slide-up sf-d150">
            <span className="text-[11px] text-text2">{t('montageFormat')}</span>
            {(['9:16','1:1','16:9'] as Preset[]).map(p => (
              <button key={p} onClick={() => setPreset(p)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${preset === p ? 'text-white' : 'text-text2 hover:text-text'}`}
                style={preset === p ? { background: 'linear-gradient(130deg,#6366F1,#6366F1)' } : { background: 'rgba(255,255,255,0.05)' }}>
                {p}
              </button>
            ))}
            <span className="text-[10px] text-text2 ml-1">{PRESET_DIMS[preset]}</span>
            <div className="w-px h-5 mx-1 bg-border" />
            <Button size="sm" onClick={handleExport} loading={exporting} disabled={!clips.length}>
              {t('montageExport')}
            </Button>
          </div>
        </div>
      </div>

      {/* ── MIDDLE: left panel + preview + properties ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden anim-stagger">

        {/* Left panel — content changes per tab */}
        <aside className="w-56 flex-shrink-0 border-r border-border bg-surface flex flex-col">

          {/* Médias */}
          {activeTab === 'medias' && (<>
            <div className="px-3 py-2 border-b border-border space-y-2">
              <div className="flex gap-1">
                <button onClick={async () => {
                  const p = await window.electronAPI?.pickVideoFile?.()
                  if (!p) return
                  const title = p.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Vidéo'
                  const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }
                  try {
                    const { storagePath, thumbnailPath } = await uploadVideoFromPath(p, scope)
                    const { data } = await supabase.from('content_bank').insert({
                      user_id: user.id, org_id: currentOrg?.id ?? null, title,
                      file_url: null, storage_path: storagePath, thumbnail_path: thumbnailPath,
                      tags: [], notes: '',
                    }).select().single()
                    if (data) {
                      setBankItems(prev => [data, ...prev]); addClip(data)
                      logActivity({ orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '', action: 'bank_add', details: { title, source: 'montage_import' } })
                    }
                  } catch (err) {
                    console.error('[Montage] upload failed', err)
                  }
                }} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold rounded-lg transition-colors">
                  {t('montageImport')}
                </button>
              </div>
              <input type="text" placeholder={t('montageSearchBank')} value={bankSearch}
                onChange={e => setBSearch(e.target.value)}
                className="w-full bg-surface2 border border-border rounded px-2 py-1.5 text-[11px] text-text placeholder:text-text2 focus:border-accent focus:outline-none transition-colors"
              />
            </div>
            <div className="flex-1 overflow-auto py-1">
              {bankLoading ? <div className="flex justify-center py-8"><Spinner size="sm" /></div>
              : filteredBank.length === 0 ? (
                <div className="px-3 py-6 text-center text-[11px] text-text2 space-y-2 flex flex-col items-center">
                  <IconClapperboard size={24} />
                  <p>{bankItems.length === 0 ? t('montageBankEmpty') : t('montageBankNoResults')}</p>
                </div>
              ) : filteredBank.map(item => (
                <button key={item.id} onClick={() => addClip(item)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface2 group transition-colors">
                  <div className="w-10 h-14 rounded overflow-hidden flex-shrink-0"><VideoThumbnail filePath={item.file_url} thumbnailPath={item.thumbnail_path} storagePath={item.storage_path} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-text truncate">{item.title}</p>
                    <p className="text-[9px] text-text2">{item.duration ? fmtTime(item.duration) : '?s'}</p>
                  </div>
                  <span className="opacity-0 group-hover:opacity-100 text-accent text-sm flex-shrink-0">+</span>
                </button>
              ))}
            </div>
          </>)}

          {/* Texte */}
          {activeTab === 'texte' && (
            <div className="p-3 space-y-3 flex-1 overflow-auto">

              {/* ── Auto Caption ──────────────────────────────────────────────────── */}
              <div className="rounded-xl border border-border bg-surface2 overflow-hidden">
                {/* Header / toggle */}
                <button
                  onClick={() => setAutoCaptionEnabled(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-accent"><IconZap size={16} /></span>
                    <div className="text-left">
                      <p className="text-xs font-semibold text-text">{t('montageAutoCaption')}</p>
                      <p className="text-[9px] text-text2">{t('montageAutoCaptionDesc')}</p>
                    </div>
                  </div>
                  <div className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${autoCaptionEnabled ? 'bg-accent' : 'bg-surface'}`}>
                    <span className={`block w-4 h-4 bg-white rounded-full shadow transition-all mt-0.5 ${autoCaptionEnabled ? 'ml-4.5' : 'ml-0.5'}`} style={{ marginLeft: autoCaptionEnabled ? '18px' : '2px' }} />
                  </div>
                </button>

                {autoCaptionEnabled && (
                  <div className="px-3 pb-3 space-y-2.5 border-t border-border">
                    {/* AI generate button */}
                    <button
                      onClick={() => { if (selectedClip) generateAiCaption(selectedClip) }}
                      disabled={!selectedClip || aiCapLoading || !conns.anthropic}
                      className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all bg-gradient-to-r from-violet-600 to-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {aiCapLoading ? <><Spinner size="sm" /><span>{t('montageAnalyzing')}</span></> : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.94 14.34A2 2 0 0 0 8.66 13l-6.13-1.9a.5.5 0 0 1 0-.95l6.13-1.9a2 2 0 0 0 1.28-1.28l1.9-6.13a.5.5 0 0 1 .95 0l1.9 6.13a2 2 0 0 0 1.28 1.28l6.13 1.9a.5.5 0 0 1 0 .95l-6.13 1.9a2 2 0 0 0-1.28 1.28l-1.9 6.13a.5.5 0 0 1-.95 0z"/></svg><span>{t('montageGenerateAI')}</span></>}
                    </button>
                    {!conns.anthropic && !conns.loading && (
                      <p className="text-[9px] text-amber-400/80">{t('montageAIKeyRequired')}</p>
                    )}
                    {!selectedClip && conns.anthropic && (
                      <p className="text-[9px] text-text2/60">{t('montageSelectClipFirst')}</p>
                    )}
                    {aiCapError && <p className="text-[9px] text-danger">{aiCapError}</p>}

                    {/* Text input */}
                    <textarea
                      value={autoCaptionText}
                      onChange={e => setAutoCaptionText(e.target.value)}
                      rows={3}
                      placeholder={t('montageTypeCaption')}
                      className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-[11px] text-text focus:outline-none focus:border-accent resize-none placeholder:text-text2/60"
                    />

                    {/* Position */}
                    <div>
                      <p className="text-[9px] text-text2 uppercase tracking-wider mb-1.5">Position</p>
                      <div className="grid grid-cols-3 gap-1">
                        {(['top','center','bottom'] as AutoCaptionPos[]).map(p => (
                          <button key={p} onClick={() => setAutoCaptionPos(p)}
                            className={`py-1.5 rounded text-[10px] font-medium transition-all ${autoCaptionPos === p ? 'bg-accent text-white' : 'bg-surface text-text2 hover:text-text'}`}>
                            {p === 'top' ? t('montagePositionTop') : p === 'center' ? t('montagePositionCenter') : t('montagePositionBottom')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Font size */}
                    <div>
                      <p className="text-[9px] text-text2 uppercase tracking-wider mb-1">Size: <span className="text-accent">{autoCaptionSize}px</span></p>
                      <input type="range" min={16} max={80} step={2} value={autoCaptionSize}
                        onChange={e => setAutoCaptionSize(+e.target.value)}
                        className="w-full accent-accent h-1.5" />
                    </div>

                    {/* Color */}
                    <div>
                      <p className="text-[9px] text-text2 uppercase tracking-wider mb-1.5">Color</p>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        {['#ffffff','#000000','#ffff00','#ff5c6e','#4f9eff','#2dde78','#ff6ec7','#ffaa2a'].map(c => (
                          <button key={c} onClick={() => setAutoCaptionColor(c)}
                            className={`w-5 h-5 rounded-full transition-all ${autoCaptionColor === c ? 'ring-2 ring-white scale-110' : 'hover:scale-110'}`}
                            style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid rgba(255,255,255,0.3)' : undefined }} />
                        ))}
                        <input type="color" value={autoCaptionColor} onChange={e => setAutoCaptionColor(e.target.value)}
                          className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0" title="Custom color" />
                      </div>
                    </div>

                    {!autoCaptionText.trim() && (
                      <p className="text-[9px] text-text2/60 italic">Enter text to see the preview on the video.</p>
                    )}
                    {autoCaptionText.trim() && (
                      <p className="text-[9px] text-ok/80 flex items-center gap-1"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Text shown for the full video duration</p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Manuel ────────────────────────────────────────────────────────────────────── */}
              <p className="text-[10px] text-text2 uppercase tracking-wider font-semibold pt-1">{t('montageManual')}</p>
              {([
                { pos: 'top',    label: t('montagePositionTop'),    x: 50, y: 10 },
                { pos: 'center', label: t('montagePositionCenter'), x: 50, y: 50 },
                { pos: 'bottom', label: t('montagePositionBottom'), x: 50, y: 85 },
              ] as { pos: TextOverlay['position']; label: string; x: number; y: number }[]).map(({ pos, label, x, y }) => (
                <button key={pos} onClick={() => setTexts(prev => [...prev, {
                  uid: `text-${Date.now()}`, text: t('montageTypeCaption'),
                  startTime: playhead, endTime: Math.min(playhead + 3, total),
                  position: pos, x, y, fontSize: 32, color: '#ffffff',
                }])}
                className="w-full py-2.5 bg-surface2 hover:bg-surface border border-border rounded-lg text-xs text-text transition-colors text-center">
                  + {label}
                </button>
              ))}

              {/* List of manual overlays (exclude auto-caption) */}
              {textOverlays.filter(t => t.uid !== '__auto_caption__').length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-[10px] text-text2 uppercase tracking-wider font-semibold">
                    Manual text ({textOverlays.filter(t => t.uid !== '__auto_caption__').length})
                  </p>
                  {textOverlays.filter(t => t.uid !== '__auto_caption__').map(ov => (
                    <div key={ov.uid} className="flex items-center gap-2 bg-surface2 rounded-lg px-2 py-1.5">
                      <input value={ov.text} onChange={e => setTexts(prev => prev.map(t => t.uid === ov.uid ? { ...t, text: e.target.value } : t))}
                        className="flex-1 bg-transparent text-[11px] text-text focus:outline-none" />
                      <button onClick={() => setTexts(prev => prev.filter(t => t.uid !== ov.uid))} aria-label="Supprimer" className="text-text2 hover:text-danger inline-flex items-center sf-press"><IconX size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transitions */}
          {activeTab === 'transitions' && (
            <div className="p-3 space-y-3 flex-1 overflow-auto">
              <p className="text-[10px] text-text2 uppercase tracking-wider font-semibold">{t('montageTransitionsTab')}</p>
              <p className="text-[10px] text-text2">Click the transition badge between two clips to change the transition.</p>
              <div className="space-y-2 pt-1">
                {TRANSITIONS.map(tr => (
                  <div key={tr.type} className="flex items-center gap-3 px-3 py-2 bg-surface2 rounded-lg">
                    <span className="text-xl w-6 text-center">{tr.icon}</span>
                    <div>
                      <p className="text-xs font-medium text-text">{tr.label}</p>
                      <p className="text-[9px] text-text2">
                        {tr.type === 'cut' ? t('montageTransitionCut') :
                         tr.type === 'fade' ? t('montageFadeBlack') :
                         tr.type === 'dissolve' ? t('montageCrossFade') : t('montageHorizSweep')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filtres */}
          {activeTab === 'filtres' && (
            <div className="p-3 space-y-3 flex-1 overflow-auto">
              <p className="text-[10px] text-text2 uppercase tracking-wider font-semibold">{t('montageColorFilter')}</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(FILTER_LABELS) as Filter[]).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`py-2 px-3 rounded-lg text-xs text-center transition-all ${activeFilter === f ? 'bg-accent text-white font-semibold' : 'bg-surface2 text-text2 hover:text-text'}`}>
                    {FILTER_LABELS_DYN[f]}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-text2">{t('montageFilterNote')}</p>
            </div>
          )}

          {/* Ajustement */}
          {activeTab === 'ajustement' && (
            <div className="p-3 space-y-4 flex-1 overflow-auto">
              <p className="text-[10px] text-text2 uppercase tracking-wider font-semibold">{t('montageGlobalSettings')}</p>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-text2 mb-1">{t('montageGlobalCaption')}</p>
                  <textarea value={globalCaption} rows={4}
                    onChange={e => setGCap(e.target.value)}
                    placeholder={t('montageGlobalCaptionDesc')}
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-accent resize-none" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-text2">Total: <span className="text-accent font-medium">{fmtTime(total)}</span></p>
                  <div className="sf-progress">
                    <div className="sf-progress-bar" style={{ width: `${Math.min(100, (total / 90) * 100)}%` }} />
                  </div>
                  <p className="text-[9px] text-text2 flex items-center gap-1">{total > 90 ? <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-warn"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>{t('montageReelsLimit')}</> : `${Math.round((total / 90) * 100)}% of 90s`}</p>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* CENTER: video preview */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center bg-black/50 relative overflow-hidden">
          {/* Play all controls */}
          {clips.length > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
              {playingIndex === null ? (
                <button
                  onClick={playAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent rounded-lg text-white text-xs font-semibold hover:bg-accent/80 transition-colors cursor-pointer"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Play all ({clips.length} clips)
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={stopAll} className="px-3 py-1.5 bg-surface/80 rounded-lg text-text text-xs hover:bg-surface transition-colors cursor-pointer flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                    Stop
                  </button>
                  <span className="text-xs text-white/70 bg-black/40 px-2 py-1 rounded">
                    Clip {playingIndex + 1}/{clips.length}
                  </span>
                </div>
              )}
            </div>
          )}

          {previewSrc ? (
            <video
              key={playingIndex !== null ? `play-${playingIndex}` : 'preview'}
              ref={videoRef}
              src={previewSrc}
              className="max-h-full max-w-full rounded object-contain"
              style={{ filter: FILTER_CSS[activeFilter] || undefined }}
              controls={playingIndex === null}
              onLoadedData={onVideoLoaded}
              onSeeked={onVideoSeekedForPlay}
              onEnded={onVideoEnded}
              onTimeUpdate={onTimeUpdate}
            />
          ) : (
            <div className="text-center text-text2 space-y-3 flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center sf-anim-scale-spring" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </div>
              <p className="text-sm">{t('montageSelectClipPreview')}</p>
              <p className="text-xs text-text2/60">{t('montageOrDragVideo')}</p>
            </div>
          )}

          {/* Text overlays — draggable with center snap */}
          {textOverlays.filter(t => t.startTime <= playhead && t.endTime >= playhead).map(ov => (
            <DraggableText
              key={ov.uid}
              overlay={ov}
              onMove={(uid, x, y) => setTexts(prev => prev.map(t => t.uid === uid ? { ...t, x, y } : t))}
            />
          ))}
        </div>

        {/* RIGHT: properties */}
        <aside className="w-52 flex-shrink-0 border-l border-border bg-surface">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">{t('montageProperties')}</p>
          </div>
          <div className="h-[calc(100%-33px)] overflow-auto">
            <PropertiesPanel clip={selectedClip} onUpdate={updateClip} />
          </div>
        </aside>
      </div>

      {/* ── BOTTOM: Timeline ─────────────────────────────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-border bg-surface sf-anim-slide-up sf-d200" style={{ height: 200 }}>
        {/* Timeline toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface2">
          {/* Edit tools */}
          <button onClick={cutAtPlayhead} disabled={!selectedUid} title="Cut clip at playhead"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text2 hover:text-text hover:bg-surface disabled:opacity-40 transition-all">
            {t('montageCut')}
          </button>
          <button onClick={() => selectedUid && deleteClip(selectedUid)} disabled={!selectedUid}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text2 hover:text-danger disabled:opacity-40 transition-all">
            {t('montageDelete')}
          </button>
          <button onClick={() => setClips([])} disabled={!clips.length}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text2 hover:text-danger disabled:opacity-40 transition-all">
            {t('montageClearAll')}
          </button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Time display */}
          <span className="text-xs text-text2 font-mono">
            {fmtTime(playhead)} / <span className="text-accent">{fmtTime(total)}</span>
          </span>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Zoom */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setScale(s => Math.max(10, s - 10))} className="text-text2 hover:text-text text-base w-5 text-center sf-press">−</button>
            <div className="w-16 h-1.5 bg-surface rounded-full relative cursor-pointer"
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setScale(Math.round(10 + ((e.clientX - r.left) / r.width) * 190)) }}>
              <div className="h-full bg-accent rounded-full" style={{ width: `${((scale - 10) / 190) * 100}%` }} />
            </div>
            <button onClick={() => setScale(s => Math.min(200, s + 10))} className="text-text2 hover:text-text text-base w-5 text-center sf-press">+</button>
            <span className="text-[10px] text-text2 w-10">{scale}px/s</span>
          </div>
        </div>

        {/* Scrollable tracks */}
        <div ref={timelineRef}
          className="overflow-x-auto overflow-y-hidden cursor-crosshair relative"
          style={{ height: 155 }}
          onClick={onTimelineClick}>
          <div style={{ width: timelineW, minHeight: '100%', position: 'relative' }}>
            {/* Ruler */}
            <TimeRuler total={total + 10} scale={scale} />

            {/* Playhead */}
            <div className="absolute inset-y-0 pointer-events-none z-30" style={{ left: playhead * scale }}>
              <div className="w-0.5 h-full bg-red-500/80" />
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full -mt-0.5 -ml-1" />
            </div>

            {/* Video track */}
            <div className="px-2 py-1">
              <div className="text-[9px] text-text2 mb-1 uppercase tracking-wider">{t('montageVideoTrack')}</div>
              {clips.length === 0 ? (
                <div className="flex items-center gap-2 text-[11px] text-text2/50 h-12 px-4">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                  Click a clip in Media to add it
                </div>
              ) : (
                <div className="flex items-center gap-0.5">
                  {clips.map((clip, i) => (
                    <div key={clip.uid} className="flex items-center gap-0.5">
                      <ClipBlock
                        clip={clip} scale={scale} isSelected={clip.uid === selectedUid}
                        onSelect={setSelUid} onUpdate={updateClip} onDelete={deleteClip}
                        onDragStart={setDragUid} onDragOver={e => e.preventDefault()} onDrop={handleDrop}
                      />
                      {i < clips.length - 1 && (
                        <TransitionBadge type={getTransition(clip.uid)} onClick={() => cycleTransition(clip.uid)} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audio track (placeholder) */}
            <div className="px-2 py-0.5 border-t border-border/40">
              <div className="text-[9px] text-text2/50 mb-1 uppercase tracking-wider">{t('montageAudioTrack')}</div>
              <div className="h-7 rounded bg-surface2/40 border border-dashed border-border/40 flex items-center justify-center text-[10px] text-text2/40" style={{ width: Math.max(timelineW - 20, 200) }}>
                {t('montageAudioDragHint')}
              </div>
            </div>

            {/* Text overlay track */}
            {textOverlays.length > 0 && (
              <div className="px-2 py-0.5 border-t border-border/40">
                <div className="text-[9px] text-text2/50 mb-1 uppercase tracking-wider">Texte</div>
                <div className="relative h-6" style={{ width: timelineW - 20 }}>
                  {textOverlays.map(ov => (
                    <div key={ov.uid}
                      className="absolute h-full bg-accent/30 border border-accent/50 rounded text-[9px] text-accent flex items-center px-1.5 overflow-hidden cursor-pointer hover:bg-accent/50"
                      style={{ left: ov.startTime * scale, width: Math.max((ov.endTime - ov.startTime) * scale, 40) }}
                      onClick={e => { e.stopPropagation() }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 mr-0.5"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>{ov.text.slice(0, 12)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export result */}
      {expResult && (
        <div className={`flex-shrink-0 px-5 py-2.5 text-xs flex items-start gap-3 ${expResult.ok ? 'bg-ok/10 border-t border-ok/20 text-ok' : 'bg-danger/10 border-t border-danger/20 text-danger'}`}>
          <div className="flex-1 min-w-0">
            <p>{expResult.msg}</p>
            {expResult.command && (
              <code className="block mt-1 text-[10px] bg-surface px-2 py-1 rounded text-text2 truncate cursor-pointer hover:whitespace-normal"
                onClick={() => navigator.clipboard.writeText(expResult.command!)}
                title="Click to copy the command">
                {expResult.command}
              </code>
            )}
          </div>
          <button onClick={() => setExpResult(null)} aria-label="Fermer" className="opacity-60 hover:opacity-100 inline-flex items-center sf-press"><IconX size={14} /></button>
        </div>
      )}
    </div>
  )
}
