import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { Button }  from '@/components/ui/Button'

interface MontageProps { user: User }

// ── Types ─────────────────────────────────────────────────────────────────────
interface TimelineClip {
  uid:       string     // unique per-instance (not item.id — same item can appear twice)
  item:      ContentItem
  trimStart: number     // seconds from start of original
  trimEnd:   number     // seconds from start (0 = use full)
  caption:   string
  color:     string
}

type Preset   = '9:16' | '1:1' | '16:9'
type Tool     = 'select' | 'cut'

// ── Helpers ───────────────────────────────────────────────────────────────────
const COLORS = ['#4f9eff','#a56ef5','#00ccaa','#ffaa2a','#ff6ec7','#2dde78','#ff5c6e','#00e5d4']

function effectiveDur(c: TimelineClip): number {
  const raw = c.item.duration ?? 30
  const end = c.trimEnd > 0 ? Math.min(c.trimEnd, raw) : raw
  return Math.max(0.5, end - c.trimStart)
}

function totalDur(clips: TimelineClip[]): number {
  return clips.reduce((s, c) => s + effectiveDur(c), 0)
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function basename(p: string) { return p.replace(/\\/g, '/').split('/').pop() ?? p }

function localSrc(filePath: string | null | undefined): string | null {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  // Normalize windows backslashes
  const norm = filePath.replace(/\\/g, '/')
  return `file://${norm.startsWith('/') ? '' : '/'}${norm}`
}

let _colorIdx = 0
function nextColor() { return COLORS[_colorIdx++ % COLORS.length] }

// ── Ruler component ───────────────────────────────────────────────────────────
function TimeRuler({ totalSec, scale }: { totalSec: number; scale: number }) {
  const width = Math.max(totalSec * scale, 400)
  const step  = scale >= 60 ? 1 : scale >= 30 ? 2 : 5
  const ticks: number[] = []
  for (let t = 0; t <= totalSec + step; t += step) ticks.push(t)
  return (
    <div className="relative bg-surface select-none flex-shrink-0" style={{ width, height: 24 }}>
      {ticks.map(t => (
        <div key={t} className="absolute top-0 flex flex-col items-center" style={{ left: t * scale }}>
          <div className="w-px bg-border" style={{ height: t % (step * 5) === 0 ? 12 : 6 }} />
          {t % (step * 5) === 0 && (
            <span className="text-[9px] text-text2 mt-0.5 -translate-x-1/2">{fmtTime(t)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Clip block in timeline ────────────────────────────────────────────────────
function ClipBlock({
  clip, scale, isSelected,
  onSelect, onUpdate, onDelete,
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
  onDrop:      (targetUid: string) => void
}) {
  const dur   = effectiveDur(clip)
  const width = Math.max(dur * scale, 40)
  const raw   = clip.item.duration ?? 30

  // Trim handle drag (mouse events on window)
  function startTrimDrag(e: React.MouseEvent, side: 'start' | 'end') {
    e.stopPropagation(); e.preventDefault()
    const startX   = e.clientX
    const startVal = side === 'start' ? clip.trimStart : (clip.trimEnd > 0 ? clip.trimEnd : raw)

    function onMove(ev: MouseEvent) {
      const delta = (ev.clientX - startX) / scale
      if (side === 'start') {
        const v = Math.max(0, Math.min(startVal + delta, raw - 0.5))
        onUpdate(clip.uid, { trimStart: Math.round(v * 10) / 10 })
      } else {
        const v = Math.max(clip.trimStart + 0.5, Math.min(startVal + delta, raw))
        onUpdate(clip.uid, { trimEnd: Math.round(v * 10) / 10 })
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className={`relative h-14 rounded-lg overflow-visible flex-shrink-0 cursor-pointer select-none transition-shadow ${isSelected ? 'ring-2 ring-white/60 shadow-lg' : 'hover:brightness-110'}`}
      style={{ width, backgroundColor: clip.color + (isSelected ? '' : 'cc') }}
      onClick={() => onSelect(clip.uid)}
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart(clip.uid) }}
      onDragOver={e => { e.preventDefault(); onDragOver(e) }}
      onDrop={e => { e.preventDefault(); onDrop(clip.uid) }}
    >
      {/* Left trim handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2.5 bg-black/40 hover:bg-black/60 cursor-col-resize z-10 rounded-l-lg flex items-center justify-center"
        onMouseDown={e => startTrimDrag(e, 'start')}
      >
        <span className="text-white/60 text-[8px] leading-none">◀</span>
      </div>

      {/* Content */}
      <div className="px-3 h-full flex flex-col justify-center overflow-hidden">
        <p className="text-white text-xs font-semibold truncate leading-tight">{clip.item.title}</p>
        <p className="text-white/70 text-[9px] leading-tight mt-0.5">
          {clip.trimStart > 0 ? `${fmtTime(clip.trimStart)} → ` : ''}{fmtTime(clip.trimEnd > 0 ? clip.trimEnd : raw)}
          {' · '}{fmtTime(dur)}
        </p>
      </div>

      {/* Right trim handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2.5 bg-black/40 hover:bg-black/60 cursor-col-resize z-10 rounded-r-lg flex items-center justify-center"
        onMouseDown={e => startTrimDrag(e, 'end')}
      >
        <span className="text-white/60 text-[8px] leading-none">▶</span>
      </div>

      {/* Delete badge */}
      {isSelected && (
        <button
          className="absolute -top-2 -right-2 w-4 h-4 bg-danger rounded-full text-white text-[9px] flex items-center justify-center z-20 hover:bg-danger/80"
          onClick={e => { e.stopPropagation(); onDelete(clip.uid) }}
        >✕</button>
      )}
    </div>
  )
}

// ── Properties panel ──────────────────────────────────────────────────────────
function PropertiesPanel({
  clip, onUpdate,
}: {
  clip:     TimelineClip | null
  onUpdate: (uid: string, p: Partial<TimelineClip>) => void
}) {
  if (!clip) {
    return (
      <div className="flex items-center justify-center h-full text-text2 text-xs p-4 text-center">
        Sélectionne un clip sur la timeline pour voir ses propriétés
      </div>
    )
  }
  const raw = clip.item.duration ?? 30
  const end = clip.trimEnd > 0 ? clip.trimEnd : raw

  return (
    <div className="p-4 space-y-4 overflow-auto h-full">
      <div>
        <p className="text-xs font-semibold text-text2 uppercase tracking-wider mb-1">Clip sélectionné</p>
        <p className="text-sm font-medium text-text truncate">{clip.item.title}</p>
        {clip.item.file_url && (
          <p className="text-[10px] text-text2 font-mono truncate mt-0.5">{basename(clip.item.file_url)}</p>
        )}
      </div>

      {/* Trim */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-text2 uppercase tracking-wider">Trim</p>
        <div>
          <div className="flex justify-between text-[10px] text-text2 mb-1">
            <span>Début: <span className="text-accent">{fmtTime(clip.trimStart)}</span></span>
            <span>Fin: <span className="text-accent">{fmtTime(end)}</span></span>
          </div>
          {/* Trim range: start */}
          <label className="text-[10px] text-text2 block mb-0.5">Point d'entrée</label>
          <input type="range" min={0} max={end - 0.5} step={0.1}
            value={clip.trimStart}
            onChange={e => onUpdate(clip.uid, { trimStart: parseFloat(e.target.value) })}
            className="w-full accent-accent h-1.5"
          />
          {/* Trim range: end */}
          <label className="text-[10px] text-text2 block mt-2 mb-0.5">Point de sortie</label>
          <input type="range" min={clip.trimStart + 0.5} max={raw} step={0.1}
            value={end}
            onChange={e => onUpdate(clip.uid, { trimEnd: parseFloat(e.target.value) })}
            className="w-full accent-accent h-1.5"
          />
          <p className="text-[10px] text-text2 mt-1">Durée: <span className="text-accent font-medium">{fmtTime(effectiveDur(clip))}</span></p>
        </div>
      </div>

      {/* Caption */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-text2 uppercase tracking-wider">Caption (ce clip)</p>
        <textarea
          value={clip.caption}
          rows={3}
          onChange={e => onUpdate(clip.uid, { caption: e.target.value })}
          placeholder="Caption spécifique à ce clip…"
          className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent resize-none transition-colors"
        />
      </div>

      {/* Color picker */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-text2 uppercase tracking-wider">Couleur</p>
        <div className="flex gap-1.5 flex-wrap">
          {COLORS.map(c => (
            <button key={c} onClick={() => onUpdate(clip.uid, { color: c })}
              className={`w-5 h-5 rounded-full transition-all ${clip.color === c ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Montage component ────────────────────────────────────────────────────
export function Montage({ user }: MontageProps) {
  const [bankItems, setBankItems]     = useState<ContentItem[]>([])
  const [bankLoading, setBankLoading] = useState(true)
  const [bankSearch, setBankSearch]   = useState('')

  const [clips, setClips]             = useState<TimelineClip[]>([])
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [draggingUid, setDraggingUid] = useState<string | null>(null)

  const [scale, setScale]             = useState(60)   // px per second
  const [playhead, setPlayhead]       = useState(0)    // seconds
  const [tool, setTool]               = useState<Tool>('select')

  const [preset, setPreset]           = useState<Preset>('9:16')
  const [globalCaption, setGCaption]  = useState('')
  const [projectName, setProjName]    = useState('Mon montage')

  const [exporting, setExporting]     = useState(false)
  const [exportResult, setExpResult]  = useState<{ ok: boolean; msg: string; command?: string } | null>(null)

  const [dragging, setDragging]       = useState(false)   // OS drag into window
  const timelineRef                   = useRef<HTMLDivElement>(null)
  const videoRef                      = useRef<HTMLVideoElement>(null)
  const dropRef                       = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('content_bank').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setBankItems(data ?? []); setBankLoading(false) })
  }, [])

  // ── Clip management ────────────────────────────────────────────────────
  function addClip(item: ContentItem) {
    const clip: TimelineClip = {
      uid:       `${item.id}-${Date.now()}`,
      item,
      trimStart: 0,
      trimEnd:   0,
      caption:   '',
      color:     nextColor(),
    }
    setClips(prev => [...prev, clip])
    setSelectedUid(clip.uid)
  }

  function updateClip(uid: string, patch: Partial<TimelineClip>) {
    setClips(prev => prev.map(c => c.uid === uid ? { ...c, ...patch } : c))
  }

  function deleteClip(uid: string) {
    setClips(prev => prev.filter(c => c.uid !== uid))
    if (selectedUid === uid) setSelectedUid(null)
  }

  // ── Drag to reorder ─────────────────────────────────────────────────────
  function handleDrop(targetUid: string) {
    if (!draggingUid || draggingUid === targetUid) return
    setClips(prev => {
      const next    = [...prev]
      const fromIdx = next.findIndex(c => c.uid === draggingUid)
      const toIdx   = next.findIndex(c => c.uid === targetUid)
      if (fromIdx < 0 || toIdx < 0) return prev
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
    setDraggingUid(null)
  }

  // ── Cut at playhead ──────────────────────────────────────────────────────
  const cutAtPlayhead = useCallback(() => {
    if (!selectedUid) return
    const clip = clips.find(c => c.uid === selectedUid)
    if (!clip) return

    // playhead relative to this clip's start in timeline
    let offset = 0
    for (const c of clips) {
      if (c.uid === selectedUid) break
      offset += effectiveDur(c)
    }
    const localT   = playhead - offset
    const raw      = clip.item.duration ?? 30
    const clipEnd  = clip.trimEnd > 0 ? clip.trimEnd : raw
    const cutPoint = clip.trimStart + localT

    if (cutPoint <= clip.trimStart + 0.5 || cutPoint >= clipEnd - 0.5) return

    const a: TimelineClip = { ...clip, uid: `${clip.uid}-a`, trimEnd: cutPoint }
    const b: TimelineClip = { ...clip, uid: `${clip.uid}-b`, trimStart: cutPoint, trimEnd: clip.trimEnd }

    setClips(prev => {
      const idx = prev.findIndex(c => c.uid === selectedUid)
      if (idx < 0) return prev
      const next = [...prev]
      next.splice(idx, 1, a, b)
      return next
    })
    setSelectedUid(a.uid)
  }, [clips, selectedUid, playhead])

  // ── Timeline click → move playhead ──────────────────────────────────────
  function onTimelineClick(e: React.MouseEvent) {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft
    const t = Math.max(0, x / scale)
    setPlayhead(Math.min(t, totalDur(clips)))
    if (videoRef.current) videoRef.current.currentTime = t
  }

  // ── OS file drag into window ─────────────────────────────────────────────
  function onOsDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true) }
  function onOsDragLeave(e: React.DragEvent) {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setDragging(false)
  }
  async function onOsDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const filePath = (file as File & { path?: string }).path ?? file.name
    const title    = filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Vidéo'
    const { data } = await supabase.from('content_bank')
      .insert({ user_id: user.id, title, file_url: filePath, tags: [], notes: '' }).select().single()
    if (data) { setBankItems(prev => [data, ...prev]); addClip(data) }
  }

  // ── Export ───────────────────────────────────────────────────────────────
  async function handleExport() {
    if (clips.length === 0) return
    const hasPaths = clips.every(c => c.item.file_url && !c.item.file_url.startsWith('http'))
    if (!hasPaths) {
      setExpResult({ ok: false, msg: 'Certains clips n\'ont pas de fichier local. Ajoute les vidéos via glisser-déposer.' })
      return
    }
    setExporting(true); setExpResult(null)
    const outPath = await window.electronAPI?.pickOutputFile?.({ defaultName: `${projectName.replace(/\s+/g, '_')}.mp4` })
    if (!outPath) { setExporting(false); return }

    const res = await window.electronAPI?.runFfmpeg?.({
      clips: clips.map(c => ({
        filePath:  c.item.file_url!,
        trimStart: c.trimStart,
        trimEnd:   c.trimEnd,
      })),
      outputPath: outPath,
      preset,
      transition: 'cut',
    })
    setExporting(false)
    if (res?.ok) {
      setExpResult({ ok: true, msg: `✓ Exporté : ${outPath}` })
    } else {
      setExpResult({ ok: false, msg: res?.error ?? 'Erreur FFmpeg', command: res?.command })
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  const selectedClip = clips.find(c => c.uid === selectedUid) ?? null
  const total        = totalDur(clips)
  const timelineW    = Math.max(total * scale, 600)

  // For video preview: selected clip's local src
  const previewSrc = selectedClip?.item.file_url ? localSrc(selectedClip.item.file_url) : null

  const filteredBank = bankItems.filter(item => {
    if (!bankSearch) return true
    const q = bankSearch.toLowerCase()
    return item.title.toLowerCase().includes(q) || item.tags.some(t => t.toLowerCase().includes(q))
  })

  const presetDims: Record<Preset, string> = { '9:16': '1080×1920', '1:1': '1080×1080', '16:9': '1920×1080' }

  return (
    <div ref={dropRef} className="flex flex-col h-screen min-h-0 bg-bg"
      onDragOver={onOsDragOver} onDragLeave={onOsDragLeave} onDrop={onOsDrop}>

      {/* OS drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-accent rounded-2xl px-20 py-12 bg-bg/90 backdrop-blur text-center space-y-3">
            <p className="text-5xl">🎬</p>
            <p className="text-xl font-semibold text-accent">Dépose la vidéo ici</p>
            <p className="text-sm text-text2">Ajoutée à la banque et à la timeline</p>
          </div>
        </div>
      )}

      {/* ── Top toolbar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border bg-surface flex-shrink-0 flex-wrap">
        {/* Project name */}
        <input value={projectName} onChange={e => setProjName(e.target.value)}
          className="text-sm font-semibold text-text bg-transparent focus:outline-none focus:border-b focus:border-accent w-40 truncate"
          placeholder="Nom du montage…"
        />
        <div className="w-px h-5 bg-border" />

        {/* Preset selector */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-text2">Format:</span>
          {(['9:16', '1:1', '16:9'] as Preset[]).map(p => (
            <button key={p} onClick={() => setPreset(p)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${preset === p ? 'bg-accent text-white' : 'text-text2 hover:text-text bg-surface2'}`}>
              {p}
            </button>
          ))}
          <span className="text-[10px] text-text2 ml-1">{presetDims[preset]}</span>
        </div>
        <div className="w-px h-5 bg-border" />

        {/* Tools */}
        <div className="flex items-center gap-1">
          <button onClick={() => setTool('select')}
            className={`px-2.5 py-1 rounded text-xs transition-all ${tool === 'select' ? 'bg-accent/20 text-accent' : 'text-text2 hover:text-text'}`}
            title="Outil sélection">
            ↖ Sélection
          </button>
          <button onClick={() => { setTool('cut'); }}
            className={`px-2.5 py-1 rounded text-xs transition-all ${tool === 'cut' ? 'bg-warn/20 text-warn' : 'text-text2 hover:text-text'}`}
            title="Outil couper (✂ coupe le clip sélectionné à la position de la tête de lecture)">
            ✂ Couper
          </button>
          <button onClick={cutAtPlayhead} disabled={!selectedUid}
            className="px-2.5 py-1 rounded text-xs bg-surface2 text-text2 hover:text-text disabled:opacity-40 transition-all"
            title="Couper le clip sélectionné à la position de la tête de lecture">
            ✂ Couper ici
          </button>
        </div>
        <div className="w-px h-5 bg-border" />

        {/* Zoom */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text2">Zoom:</span>
          <button onClick={() => setScale(s => Math.max(10, s - 10))} className="text-text2 hover:text-text text-sm px-1">−</button>
          <span className="text-[10px] text-accent w-8 text-center">{scale}px/s</span>
          <button onClick={() => setScale(s => Math.min(200, s + 10))} className="text-text2 hover:text-text text-sm px-1">+</button>
        </div>
        <div className="w-px h-5 bg-border" />

        {/* Playhead display */}
        <span className="text-xs text-text2 font-mono">
          ▶ {fmtTime(playhead)} / {fmtTime(total)}
        </span>

        <div className="flex-1" />

        {/* Export */}
        <Button size="sm" onClick={handleExport} loading={exporting} disabled={clips.length === 0}>
          🎬 Exporter (FFmpeg)
        </Button>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left: clip bank */}
        <aside className="w-52 flex-shrink-0 flex flex-col border-r border-border bg-surface">
          <div className="px-3 py-3 border-b border-border">
            <p className="text-xs font-semibold text-text2 uppercase tracking-wider mb-2">Banque de clips</p>
            <input type="text" placeholder="🔍 Rechercher…" value={bankSearch}
              onChange={e => setBankSearch(e.target.value)}
              className="w-full bg-surface2 border border-border rounded px-2 py-1.5 text-[11px] text-text placeholder:text-text2 focus:border-accent focus:outline-none transition-colors"
            />
          </div>
          <div className="flex-1 overflow-auto py-1">
            {bankLoading ? (
              <div className="flex justify-center py-8"><Spinner size="sm" /></div>
            ) : filteredBank.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-text2">
                {bankItems.length === 0 ? 'Banque vide — glisse une vidéo ici.' : 'Aucun résultat.'}
              </p>
            ) : filteredBank.map(item => (
              <button key={item.id} onClick={() => addClip(item)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface2 transition-colors group"
                title="Cliquer pour ajouter à la timeline"
              >
                <div className="w-9 h-7 rounded bg-surface2 flex items-center justify-center text-base flex-shrink-0">🎬</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-text truncate">{item.title}</p>
                  <p className="text-[9px] text-text2 truncate">
                    {item.duration ? fmtTime(item.duration) : '?'}
                    {item.file_url ? ` · ${basename(item.file_url)}` : ''}
                  </p>
                </div>
                <span className="opacity-0 group-hover:opacity-100 text-accent text-sm flex-shrink-0">+</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Center: preview + timeline */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* Video preview */}
          <div className="flex-shrink-0 h-44 bg-black border-b border-border flex items-center justify-center gap-4 px-4">
            {previewSrc ? (
              <video
                ref={videoRef}
                src={previewSrc}
                className="h-full max-w-sm rounded object-contain"
                controls
                onTimeUpdate={e => setPlayhead((e.target as HTMLVideoElement).currentTime)}
              />
            ) : (
              <div className="text-text2 text-center space-y-1">
                <p className="text-3xl">🎞</p>
                <p className="text-xs">Sélectionne un clip pour prévisualiser</p>
              </div>
            )}
            {/* Global caption */}
            <div className="flex-1 max-w-xs space-y-1.5">
              <label className="text-[10px] text-text2 uppercase tracking-wider font-semibold">Caption globale</label>
              <textarea value={globalCaption} rows={4}
                onChange={e => setGCaption(e.target.value)}
                placeholder="Caption pour tous les posts…"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent resize-none transition-colors"
              />
            </div>
            {/* Stats */}
            <div className="text-xs text-text2 space-y-1 text-right flex-shrink-0">
              <p><span className="text-text font-medium">{clips.length}</span> clips</p>
              <p>Durée: <span className="text-accent font-medium">{fmtTime(total)}</span></p>
              <p>Format: <span className="text-accent font-medium">{preset}</span></p>
              {total > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 w-24 bg-surface2 rounded-full overflow-hidden ml-auto">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(100, (total / 90) * 100)}%` }} />
                  </div>
                  <p className="text-[9px] mt-0.5 text-right">
                    {total > 90 ? '⚠ > 90s' : `${Math.round((total / 90) * 100)}% / 90s`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Timeline area */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Ruler + clips scroll area */}
            <div ref={timelineRef} className="flex-1 overflow-x-auto overflow-y-hidden bg-bg relative cursor-crosshair"
              onClick={onTimelineClick}
              style={{ minHeight: 0 }}>
              <div style={{ width: timelineW + 40, minHeight: '100%', position: 'relative' }}>
                {/* Ruler */}
                <TimeRuler totalSec={total + 10} scale={scale} />

                {/* Playhead */}
                <div className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
                  style={{ left: playhead * scale }}>
                  <div className="w-3 h-3 bg-red-500 rounded-full -translate-x-1/2 -mt-0.5" />
                </div>

                {/* Clips */}
                <div className="flex items-center gap-1 px-2 py-3" style={{ paddingTop: 30 }}>
                  {clips.length === 0 ? (
                    <div className="flex items-center justify-center text-text2 text-xs" style={{ width: 500, height: 56 }}>
                      ← Clique sur un clip dans la banque pour l'ajouter, ou glisse-dépose une vidéo ici
                    </div>
                  ) : (
                    clips.map(clip => (
                      <ClipBlock
                        key={clip.uid}
                        clip={clip}
                        scale={scale}
                        isSelected={clip.uid === selectedUid}
                        onSelect={setSelectedUid}
                        onUpdate={updateClip}
                        onDelete={deleteClip}
                        onDragStart={setDraggingUid}
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleDrop}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: properties */}
        <aside className="w-56 flex-shrink-0 border-l border-border bg-surface">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-text2 uppercase tracking-wider">Propriétés</p>
          </div>
          <PropertiesPanel clip={selectedClip} onUpdate={updateClip} />
        </aside>
      </div>

      {/* Export result banner */}
      {exportResult && (
        <div className={`px-5 py-3 text-sm flex items-start justify-between gap-3 flex-shrink-0 ${exportResult.ok ? 'bg-ok/10 border-t border-ok/20 text-ok' : 'bg-danger/10 border-t border-danger/20 text-danger'}`}>
          <div className="flex-1 min-w-0">
            <p>{exportResult.msg}</p>
            {exportResult.command && (
              <div className="mt-1">
                <p className="text-[10px] text-text2 mb-1">Commande FFmpeg (copier-coller dans un terminal) :</p>
                <code className="text-[10px] bg-surface px-2 py-1 rounded block truncate text-text2 hover:whitespace-normal cursor-pointer"
                  onClick={() => navigator.clipboard.writeText(exportResult.command!)}
                  title="Cliquer pour copier">
                  {exportResult.command}
                </code>
              </div>
            )}
          </div>
          <button onClick={() => setExpResult(null)} className="opacity-60 hover:opacity-100 flex-shrink-0">✕</button>
        </div>
      )}
    </div>
  )
}
