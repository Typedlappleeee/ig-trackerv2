import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { VideoThumbnail } from './Bank'
import { Spinner } from '@/components/ui/Spinner'
import { Button }  from '@/components/ui/Button'
import { useOrg } from '@/lib/orgContext'
import { uploadVideoFromPath, type UploadScope } from '@/lib/storage'

interface MontageProps { user: User }

// ── Types ─────────────────────────────────────────────────────────────────────
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

type Preset   = '9:16' | '1:1' | '16:9'
type Tab      = 'medias' | 'texte' | 'transitions' | 'filtres' | 'ajustement'
type Filter   = 'none' | 'vivid' | 'warm' | 'cold' | 'bw' | 'cinema' | 'vintage' | 'fade'

const FILTER_LABELS: Record<Filter, string> = {
  none: 'Original', vivid: 'Vif', warm: 'Chaud', cold: 'Froid',
  bw: 'Noir & Blanc', cinema: 'Cinéma', vintage: 'Vintage', fade: 'Doux',
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
const TRANSITIONS: { type: Transition['type']; label: string; icon: string }[] = [
  { type: 'cut',     label: 'Coupe',    icon: '✂' },
  { type: 'fade',    label: 'Fondu',    icon: '◑' },
  { type: 'dissolve',label: 'Dissolution', icon: '◌' },
  { type: 'wipe',    label: 'Balayage', icon: '→' },
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
  if (p.startsWith('http')) return p
  const n = p.replace(/\\/g, '/')
  const withSlash = n.startsWith('/') ? n : `/${n}`
  return `localvideo://${encodeURI(withSlash)}`
}

// ── Time ruler ────────────────────────────────────────────────────────────────
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

// ── Clip block in timeline ────────────────────────────────────────────────────
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
          className="absolute -top-2 -right-2 w-4 h-4 bg-danger rounded-full text-white text-[9px] flex items-center justify-center z-20 hover:scale-110 transition-transform"
        >✕</button>
      )}
    </div>
  )
}

// ── Transition badge between clips ───────────────────────────────────────────
function TransitionBadge({ type, onClick }: { type: Transition['type']; onClick: () => void }) {
  const info = TRANSITIONS.find(t => t.type === type) ?? TRANSITIONS[0]
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-8 h-8 rounded-full bg-surface border-2 border-border hover:border-accent flex items-center justify-center text-xs text-text2 hover:text-accent transition-all z-10 self-center"
      title={info.label}
    >
      {info.icon}
    </button>
  )
}

// ── Properties panel ──────────────────────────────────────────────────────────
function PropertiesPanel({
  clip, onUpdate,
}: {
  clip:     TimelineClip | null
  onUpdate: (uid: string, p: Partial<TimelineClip>) => void
}) {
  if (!clip) return (
    <div className="flex items-center justify-center h-full text-xs text-text2 p-4 text-center">
      <div className="space-y-2">
        <p className="text-2xl">🎬</p>
        <p>Sélectionne un clip pour éditer ses propriétés</p>
      </div>
    </div>
  )
  const raw = clip.item.duration ?? 30
  const end = clip.trimEnd > 0 ? clip.trimEnd : raw

  return (
    <div className="p-3 space-y-4 overflow-auto h-full text-xs">
      <div>
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Clip</p>
        <p className="font-medium text-text text-sm truncate">{clip.item.title}</p>
        {clip.item.file_url && <p className="text-[9px] text-text2 font-mono truncate mt-0.5">{basename(clip.item.file_url)}</p>}
      </div>

      {/* Trim */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">Découpe</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-text2 block mb-1">Début: <span className="text-accent">{fmtTime(clip.trimStart)}</span></label>
            <input type="range" min={0} max={end - 0.5} step={0.5} value={clip.trimStart}
              onChange={e => onUpdate(clip.uid, { trimStart: parseFloat(e.target.value) })}
              className="w-full accent-accent h-1.5" />
          </div>
          <div>
            <label className="text-text2 block mb-1">Fin: <span className="text-accent">{fmtTime(end)}</span></label>
            <input type="range" min={clip.trimStart + 0.5} max={raw} step={0.5} value={end}
              onChange={e => onUpdate(clip.uid, { trimEnd: parseFloat(e.target.value) })}
              className="w-full accent-accent h-1.5" />
          </div>
        </div>
        <p className="text-text2">Durée: <span className="text-accent font-medium">{fmtTime(effectiveDur(clip))}</span></p>
      </div>

      {/* Speed */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">Vitesse: <span className="text-accent">{clip.speed}×</span></p>
        <input type="range" min={0.25} max={4} step={0.25} value={clip.speed}
          onChange={e => onUpdate(clip.uid, { speed: parseFloat(e.target.value) })}
          className="w-full accent-accent h-1.5" />
        <div className="flex justify-between text-text2">
          <span>0.25×</span><span>1×</span><span>4×</span>
        </div>
      </div>

      {/* Fade */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">Fondu entrée</p>
        <button
          onClick={() => onUpdate(clip.uid, { fade: !clip.fade })}
          className={`w-8 h-4 rounded-full transition-colors ${clip.fade ? 'bg-accent' : 'bg-surface2'}`}
        >
          <span className={`block w-3 h-3 bg-white rounded-full shadow transition-all mt-0.5 ${clip.fade ? 'ml-[18px]' : 'ml-0.5'}`} />
        </button>
      </div>

      {/* Caption */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">Caption</p>
        <textarea value={clip.caption} rows={3}
          onChange={e => onUpdate(clip.uid, { caption: e.target.value })}
          placeholder="Caption pour ce clip…"
          className="w-full bg-surface border border-border rounded px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-accent resize-none" />
      </div>

      {/* Color */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">Couleur</p>
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

// ── Draggable text overlay with center snap ───────────────────────────────────
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

// ── Main component ────────────────────────────────────────────────────────────
export function Montage({ user }: MontageProps) {
  const { currentOrg } = useOrg()
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
  const [projectName, setProjName]  = useState('Mon montage')
  const [activeFilter, setFilter]   = useState<Filter>('none')
  const [preset, setPreset]         = useState<Preset>('9:16')
  const [scale, setScale]           = useState(50)
  const [playhead, setPlayhead]     = useState(0)
  const [activeTab, setActiveTab]   = useState<Tab>('medias')

  // Sequential playback
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)

  // Export
  const [exporting, setExporting]   = useState(false)
  const [expResult, setExpResult]   = useState<{ ok: boolean; msg: string; command?: string } | null>(null)

  // Refs
  const videoRef      = useRef<HTMLVideoElement>(null)
  const timelineRef   = useRef<HTMLDivElement>(null)
  const dropRef       = useRef<HTMLDivElement>(null)
  const [osDragging, setOsDrag] = useState(false)

  useEffect(() => {
    supabase.from('content_bank').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setBankItems(data ?? []); setLL(false) })
  }, [])

  // ── Clip management ────────────────────────────────────────────────────────
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

  // ── Cut at playhead ────────────────────────────────────────────────────────
  const cutAtPlayhead = useCallback(() => {
    if (!selectedUid) return
    const clip = clips.find(c => c.uid === selectedUid)
    if (!clip) return
    let offset = 0
    for (const c of clips) { if (c.uid === selectedUid) break; offset += effectiveDur(c) }
    const raw = clip.item.duration ?? 30
    const cutPoint = clip.trimStart + (playhead - offset) * clip.speed
    const clipEnd  = clip.trimEnd > 0 ? clip.trimEnd : raw
    if (cutPoint <= clip.trimStart + 0.5 || cutPoint >= clipEnd - 0.5) return
    const a: TimelineClip = { ...clip, uid: `${clip.uid}-a`, trimEnd: cutPoint }
    const b: TimelineClip = { ...clip, uid: `${clip.uid}-b`, trimStart: cutPoint, trimEnd: clip.trimEnd }
    setClips(prev => { const next = [...prev]; const i = next.findIndex(c => c.uid === selectedUid); next.splice(i, 1, a, b); return next })
    setSelUid(a.uid)
  }, [clips, selectedUid, playhead])

  // ── Transitions ────────────────────────────────────────────────────────────
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

  // ── Timeline click → playhead ──────────────────────────────────────────────
  function onTimelineClick(e: React.MouseEvent) {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft
    setPlayhead(Math.max(0, Math.min(x / scale, totalDur(clips))))
  }

  // ── OS drag-drop ───────────────────────────────────────────────────────────
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
      if (data) { setBankItems(prev => [data, ...prev]); addClip(data) }
    } catch (err) {
      console.error('[Montage] upload failed', err)
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  async function handleExport() {
    if (!clips.length) return
    setExporting(true); setExpResult(null)
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
      if (res?.ok) setExpResult({ ok: true, msg: `✓ Exporté : ${out}` })
      else setExpResult({ ok: false, msg: res?.error ?? 'Erreur FFmpeg', command: res?.command })
    } catch (e) {
      setExporting(false)
      setExpResult({ ok: false, msg: e instanceof Error ? e.message : String(e) })
    }
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const selectedClip  = clips.find(c => c.uid === selectedUid) ?? null
  const total         = totalDur(clips)
  const timelineW     = Math.max(total * scale + 250, 600)

  // When playing sequentially show that clip; otherwise show selected clip
  const previewClip   = playingIndex !== null ? (clips[playingIndex] ?? null) : selectedClip
  const previewSrc    = previewClip?.item.file_url ? localSrc(previewClip.item.file_url) : null

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
    const clip = clips[playingIndex]
    if (clip?.trimStart > 0) videoRef.current.currentTime = clip.trimStart
    else videoRef.current.play()
  }
  function onVideoSeekedForPlay() {
    if (playingIndex !== null) videoRef.current?.play()
  }
  function onVideoEnded() {
    if (playingIndex === null) return
    const next = playingIndex + 1
    if (next < clips.length) setPlayingIndex(next)
    else setPlayingIndex(null)
  }
  function onTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.target as HTMLVideoElement
    setPlayhead(v.currentTime)
    if (playingIndex !== null) {
      const clip = clips[playingIndex]
      const end  = clip?.trimEnd > 0 ? clip.trimEnd : Infinity
      if (v.currentTime >= end) { v.pause(); onVideoEnded() }
    }
  }
  const filteredBank  = bankItems.filter(i => !bankSearch || i.title.toLowerCase().includes(bankSearch.toLowerCase()) || i.tags.some(t => t.toLowerCase().includes(bankSearch.toLowerCase())))
  const PRESET_DIMS: Record<Preset, string> = { '9:16': '1080×1920', '1:1': '1080×1080', '16:9': '1920×1080' }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'medias',      label: 'Médias',      icon: '🎬' },
    { id: 'texte',       label: 'Texte',        icon: '𝐓' },
    { id: 'transitions', label: 'Transitions',  icon: '◑' },
    { id: 'filtres',     label: 'Filtres',      icon: '🎨' },
    { id: 'ajustement',  label: 'Ajustement',   icon: '⚙' },
  ]

  return (
    <div ref={dropRef} className="flex flex-col h-screen min-h-0 bg-bg"
      onDragOver={onOsDragOver} onDragLeave={onOsDragLeave} onDrop={onOsDrop}>

      {/* OS drop overlay */}
      {osDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-accent rounded-2xl px-20 py-12 bg-bg/90 backdrop-blur text-center space-y-3">
            <p className="text-5xl">🎬</p>
            <p className="text-xl font-semibold text-accent">Dépose la vidéo ici</p>
          </div>
        </div>
      )}

      {/* ── TOP TOOLBAR (CapCut-style) ────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-border bg-surface">
        {/* Row 1: project name + tabs */}
        <div className="flex items-center">
          {/* Project name */}
          <div className="w-56 flex-shrink-0 px-4 py-2 border-r border-border">
            <input value={projectName} onChange={e => setProjName(e.target.value)}
              className="text-sm font-semibold text-text bg-transparent focus:outline-none w-full truncate"
              placeholder="Nom du montage…" />
          </div>

          {/* Tab bar */}
          <div className="flex flex-1 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === t.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text2 hover:text-text'
                }`}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 px-4 border-l border-border flex-shrink-0">
            <span className="text-[10px] text-text2">Format:</span>
            {(['9:16','1:1','16:9'] as Preset[]).map(p => (
              <button key={p} onClick={() => setPreset(p)}
                className={`px-2 py-1 rounded text-[11px] font-mono transition-all ${preset === p ? 'bg-accent text-white' : 'text-text2 hover:text-text bg-surface2'}`}>
                {p}
              </button>
            ))}
            <span className="text-[9px] text-text2 ml-1">{PRESET_DIMS[preset]}</span>
            <div className="w-px h-5 bg-border mx-1" />
            <Button size="sm" onClick={handleExport} loading={exporting} disabled={!clips.length}>
              Exporter
            </Button>
          </div>
        </div>
      </div>

      {/* ── MIDDLE: left panel + preview + properties ─────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

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
                    if (data) { setBankItems(prev => [data, ...prev]); addClip(data) }
                  } catch (err) {
                    console.error('[Montage] upload failed', err)
                  }
                }} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold rounded-lg transition-colors">
                  + Importer
                </button>
              </div>
              <input type="text" placeholder="🔍 Rechercher…" value={bankSearch}
                onChange={e => setBSearch(e.target.value)}
                className="w-full bg-surface2 border border-border rounded px-2 py-1.5 text-[11px] text-text placeholder:text-text2 focus:border-accent focus:outline-none transition-colors"
              />
            </div>
            <div className="flex-1 overflow-auto py-1">
              {bankLoading ? <div className="flex justify-center py-8"><Spinner size="sm" /></div>
              : filteredBank.length === 0 ? (
                <div className="px-3 py-6 text-center text-[11px] text-text2 space-y-2">
                  <p className="text-2xl">🎬</p>
                  <p>{bankItems.length === 0 ? 'Banque vide.\nGlisse des vidéos ici.' : 'Aucun résultat.'}</p>
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
              <p className="text-[10px] text-text2 uppercase tracking-wider font-semibold">Ajouter un texte</p>
              {([
                { pos: 'top',    label: 'Haut',   x: 50, y: 10 },
                { pos: 'center', label: 'Centre', x: 50, y: 50 },
                { pos: 'bottom', label: 'Bas',    x: 50, y: 85 },
              ] as { pos: TextOverlay['position']; label: string; x: number; y: number }[]).map(({ pos, label, x, y }) => (
                <button key={pos} onClick={() => setTexts(prev => [...prev, {
                  uid: `text-${Date.now()}`, text: 'Texte ici…',
                  startTime: playhead, endTime: Math.min(playhead + 3, total),
                  position: pos, x, y, fontSize: 32, color: '#ffffff',
                }])}
                className="w-full py-3 bg-surface2 hover:bg-surface border border-border rounded-lg text-xs text-text transition-colors text-center">
                  + {label}
                </button>
              ))}
              {textOverlays.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-[10px] text-text2 uppercase tracking-wider font-semibold">Textes ({textOverlays.length})</p>
                  {textOverlays.map(ov => (
                    <div key={ov.uid} className="flex items-center gap-2 bg-surface2 rounded-lg px-2 py-1.5">
                      <input value={ov.text} onChange={e => setTexts(prev => prev.map(t => t.uid === ov.uid ? { ...t, text: e.target.value } : t))}
                        className="flex-1 bg-transparent text-[11px] text-text focus:outline-none" />
                      <button onClick={() => setTexts(prev => prev.filter(t => t.uid !== ov.uid))} className="text-text2 hover:text-danger text-xs">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transitions */}
          {activeTab === 'transitions' && (
            <div className="p-3 space-y-3 flex-1 overflow-auto">
              <p className="text-[10px] text-text2 uppercase tracking-wider font-semibold">Types de transition</p>
              <p className="text-[10px] text-text2">Clique sur le badge ◑ entre deux clips pour changer la transition.</p>
              <div className="space-y-2 pt-1">
                {TRANSITIONS.map(tr => (
                  <div key={tr.type} className="flex items-center gap-3 px-3 py-2 bg-surface2 rounded-lg">
                    <span className="text-xl w-6 text-center">{tr.icon}</span>
                    <div>
                      <p className="text-xs font-medium text-text">{tr.label}</p>
                      <p className="text-[9px] text-text2">
                        {tr.type === 'cut' ? 'Coupe directe' :
                         tr.type === 'fade' ? 'Fondu au noir' :
                         tr.type === 'dissolve' ? 'Fondu enchaîné' : 'Balayage horizontal'}
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
              <p className="text-[10px] text-text2 uppercase tracking-wider font-semibold">Filtre couleur</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(FILTER_LABELS) as Filter[]).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`py-2 px-3 rounded-lg text-xs text-center transition-all ${activeFilter === f ? 'bg-accent text-white font-semibold' : 'bg-surface2 text-text2 hover:text-text'}`}>
                    {FILTER_LABELS[f]}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-text2">Filtre appliqué dans l'export FFmpeg.</p>
            </div>
          )}

          {/* Ajustement */}
          {activeTab === 'ajustement' && (
            <div className="p-3 space-y-4 flex-1 overflow-auto">
              <p className="text-[10px] text-text2 uppercase tracking-wider font-semibold">Paramètres globaux</p>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-text2 mb-1">Caption globale</p>
                  <textarea value={globalCaption} rows={4}
                    onChange={e => setGCap(e.target.value)}
                    placeholder="Caption commune à toutes les publications…"
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-accent resize-none" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-text2">Total : <span className="text-accent font-medium">{fmtTime(total)}</span></p>
                  <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.min(100, (total / 90) * 100)}%` }} />
                  </div>
                  <p className="text-[9px] text-text2">{total > 90 ? '⚠ > 90s (limite Reels)' : `${Math.round((total / 90) * 100)}% de 90s`}</p>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent rounded-lg text-white text-xs font-semibold hover:bg-accent/80 transition-colors"
                >
                  ▶ Lire tout ({clips.length} clips)
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={stopAll} className="px-3 py-1.5 bg-surface/80 rounded-lg text-text text-xs hover:bg-surface transition-colors">
                    ⏹ Stop
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
            <div className="text-center text-text2 space-y-3">
              <p className="text-5xl">▶</p>
              <p className="text-sm">Sélectionne un clip pour prévisualiser</p>
              <p className="text-xs text-text2/60">ou glisse une vidéo dans l'application</p>
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
            <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">Propriétés</p>
          </div>
          <div className="h-[calc(100%-33px)] overflow-auto">
            <PropertiesPanel clip={selectedClip} onUpdate={updateClip} />
          </div>
        </aside>
      </div>

      {/* ── BOTTOM: Timeline ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-border bg-surface" style={{ height: 200 }}>
        {/* Timeline toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface2">
          {/* Edit tools */}
          <button onClick={cutAtPlayhead} disabled={!selectedUid} title="Couper le clip à la tête de lecture"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text2 hover:text-text hover:bg-surface disabled:opacity-40 transition-all">
            ✂ Couper
          </button>
          <button onClick={() => selectedUid && deleteClip(selectedUid)} disabled={!selectedUid}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text2 hover:text-danger disabled:opacity-40 transition-all">
            🗑 Suppr.
          </button>
          <button onClick={() => setClips([])} disabled={!clips.length}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text2 hover:text-danger disabled:opacity-40 transition-all">
            🗑 Tout vider
          </button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Time display */}
          <span className="text-xs text-text2 font-mono">
            {fmtTime(playhead)} / <span className="text-accent">{fmtTime(total)}</span>
          </span>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Zoom */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setScale(s => Math.max(10, s - 10))} className="text-text2 hover:text-text text-base w-5 text-center">−</button>
            <div className="w-16 h-1.5 bg-surface rounded-full relative cursor-pointer"
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setScale(Math.round(10 + ((e.clientX - r.left) / r.width) * 190)) }}>
              <div className="h-full bg-accent rounded-full" style={{ width: `${((scale - 10) / 190) * 100}%` }} />
            </div>
            <button onClick={() => setScale(s => Math.min(200, s + 10))} className="text-text2 hover:text-text text-base w-5 text-center">+</button>
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
              <div className="text-[9px] text-text2 mb-1 uppercase tracking-wider">Vidéo</div>
              {clips.length === 0 ? (
                <div className="flex items-center text-[11px] text-text2/50 h-12 px-4">
                  ← Clique sur un clip dans Médias pour l'ajouter
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
              <div className="text-[9px] text-text2/50 mb-1 uppercase tracking-wider">Audio</div>
              <div className="h-7 rounded bg-surface2/40 border border-dashed border-border/40 flex items-center justify-center text-[10px] text-text2/40" style={{ width: Math.max(timelineW - 20, 200) }}>
                Glisse un fichier audio ici (à venir)
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
                      𝐓 {ov.text.slice(0, 12)}
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
                title="Cliquer pour copier la commande">
                {expResult.command}
              </code>
            )}
          </div>
          <button onClick={() => setExpResult(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  )
}
