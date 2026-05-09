import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { Button }  from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface MontageProps { user: User }

interface MontageClip {
  id:        string
  item:      ContentItem
  trimStart: number  // seconds
  trimEnd:   number  // seconds (0 = use full duration)
  caption:   string
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

function formatDur(s: number | null | undefined): string {
  if (!s) return '?'
  const m = Math.floor(s / 60); const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function totalDuration(clips: MontageClip[]): number {
  return clips.reduce((sum, c) => {
    const dur  = c.item.duration ?? 0
    const end  = c.trimEnd  > 0 ? c.trimEnd  : dur
    const start = c.trimStart > 0 ? c.trimStart : 0
    return sum + Math.max(0, end - start)
  }, 0)
}

// ── Drag-to-reorder timeline row ──────────────────────────────────────────────
function ClipRow({
  clip, index, total,
  onMove, onRemove, onUpdate,
}: {
  clip: MontageClip
  index: number
  total: number
  onMove:   (from: number, to: number) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<MontageClip>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const durMax = clip.item.duration ?? 999

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Drag handle */}
        <div className="flex flex-col gap-0.5 cursor-grab text-text2 flex-shrink-0">
          <span className="w-3 h-0.5 bg-current rounded" />
          <span className="w-3 h-0.5 bg-current rounded" />
          <span className="w-3 h-0.5 bg-current rounded" />
        </div>

        {/* Index badge */}
        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>

        {/* Thumbnail */}
        <div className="w-14 h-10 rounded bg-surface2 flex items-center justify-center text-lg flex-shrink-0">🎬</div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text truncate">{clip.item.title}</p>
          <div className="flex items-center gap-2 text-xs text-text2 mt-0.5">
            <span>{formatDur(clip.item.duration)}</span>
            {clip.item.tags.length > 0 && (
              <span className="text-accent">#{clip.item.tags[0]}</span>
            )}
          </div>
        </div>

        {/* Move up/down */}
        <div className="flex flex-col gap-0.5">
          <button disabled={index === 0} onClick={() => onMove(index, index - 1)}
            className="text-text2 hover:text-text disabled:opacity-20 text-xs px-1">▲</button>
          <button disabled={index === total - 1} onClick={() => onMove(index, index + 1)}
            className="text-text2 hover:text-text disabled:opacity-20 text-xs px-1">▼</button>
        </div>

        <button onClick={() => setExpanded(v => !v)}
          className="text-xs text-text2 hover:text-text px-2 py-1 rounded bg-surface2">
          {expanded ? '▲' : '⚙'}
        </button>

        <button onClick={() => onRemove(clip.id)}
          className="text-text2 hover:text-danger transition-colors p-1 text-sm">✕</button>
      </div>

      {/* Trim + caption expanded */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text2 block mb-1">Début (sec)</label>
              <input type="number" min={0} max={durMax - 1}
                value={clip.trimStart}
                onChange={e => onUpdate(clip.id, { trimStart: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-text2 block mb-1">Fin (sec, 0 = fin)</label>
              <input type="number" min={0} max={durMax}
                value={clip.trimEnd}
                onChange={e => onUpdate(clip.id, { trimEnd: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-text2 block mb-1">Caption de ce clip</label>
            <textarea value={clip.caption} rows={2}
              onChange={e => onUpdate(clip.id, { caption: e.target.value })}
              placeholder="Caption spécifique à ce clip (optionnel)…"
              className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text focus:outline-none focus:border-accent resize-none"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function Montage({ user }: MontageProps) {
  const [bankItems, setBankItems]   = useState<ContentItem[]>([])
  const [clips, setClips]           = useState<MontageClip[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [globalCaption, setGCaption]= useState('')
  const [projectName, setProjName]  = useState('Mon montage')
  const [saved, setSaved]           = useState(false)
  const [dragging, setDragging]     = useState(false)
  const dropRef                     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('content_bank').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setBankItems(data ?? []); setLoading(false) })
  }, [])

  function addClip(item: ContentItem) {
    setClips(prev => [...prev, {
      id:        `${item.id}-${Date.now()}`,
      item,
      trimStart: 0,
      trimEnd:   0,
      caption:   '',
    }])
  }

  function removeClip(id: string) {
    setClips(prev => prev.filter(c => c.id !== id))
  }

  function moveClip(from: number, to: number) {
    setClips(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function updateClip(id: string, patch: Partial<MontageClip>) {
    setClips(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  function clearAll() { setClips([]) }

  async function exportList() {
    // Build a text export of the montage sequence
    const lines = [
      `# ${projectName}`,
      `Durée totale estimée : ${formatDur(totalDuration(clips))}`,
      '',
      ...clips.map((c, i) => {
        const trim = c.trimEnd > 0 ? ` [${c.trimStart}s → ${c.trimEnd}s]` : ''
        const cap  = c.caption || globalCaption
        return [
          `${i + 1}. ${c.item.title}${trim}`,
          c.item.file_url ? `   Fichier : ${c.item.file_url}` : '',
          cap ? `   Caption : ${cap}` : '',
        ].filter(Boolean).join('\n')
      }),
      '',
      globalCaption ? `Caption globale :\n${globalCaption}` : '',
    ].filter(l => l !== null)

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${projectName.replace(/\s+/g, '_')}.txt`
    a.click(); URL.revokeObjectURL(url)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  // Drag video files from OS into the montage (adds them to bank + clips)
  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true) }
  function onDragLeave(e: React.DragEvent) {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setDragging(false)
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const path  = (file as File & { path?: string }).path ?? file.name
    const title = path.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Vidéo'
    // Insert into bank
    const { data } = await supabase.from('content_bank')
      .insert({ user_id: user.id, title, file_url: path, tags: [], notes: '' })
      .select().single()
    if (data) {
      setBankItems(prev => [data, ...prev])
      addClip(data)
    }
  }

  const filtered = bankItems.filter(item => {
    if (!search) return true
    const q = search.toLowerCase()
    return item.title.toLowerCase().includes(q) || item.tags.some(t => t.toLowerCase().includes(q))
  })

  const totalDur = totalDuration(clips)

  return (
    <div ref={dropRef} className="flex h-full min-h-screen"
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>

      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-accent rounded-2xl px-16 py-10 bg-bg/90 backdrop-blur text-center space-y-3">
            <p className="text-4xl">🎬</p>
            <p className="text-lg font-semibold text-accent">Ajoute la vidéo au montage</p>
          </div>
        </div>
      )}

      {/* Left: video bank */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-border bg-surface">
        <div className="px-4 py-4 border-b border-border">
          <p className="text-xs font-semibold text-text2 uppercase tracking-wider">Banque de clips</p>
          <p className="text-xs text-text2 mt-0.5">{bankItems.length} vidéo{bankItems.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="px-3 py-2 border-b border-border">
          <input type="text" placeholder="🔍 Rechercher…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface2 border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-text2 focus:border-accent focus:outline-none transition-colors"
          />
        </div>
        <div className="flex-1 overflow-auto py-2">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size="sm" /></div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-4 text-xs text-text2">
              {bankItems.length === 0
                ? 'Banque vide — va dans Banque de vidéos pour ajouter des clips.'
                : 'Aucun résultat.'}
            </p>
          ) : (
            filtered.map(item => (
              <button key={item.id} onClick={() => addClip(item)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface2 transition-colors group"
              >
                <div className="w-10 h-8 rounded bg-surface2 flex items-center justify-center text-base flex-shrink-0">🎬</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text truncate">{item.title}</p>
                  <p className="text-[10px] text-text2 truncate">
                    {item.duration ? formatDur(item.duration) : ''}
                    {item.file_url ? ` · ${basename(item.file_url)}` : ''}
                  </p>
                </div>
                <span className="opacity-0 group-hover:opacity-100 text-accent text-xs flex-shrink-0">+</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Right: timeline */}
      <div className="flex-1 overflow-auto p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <input
              value={projectName}
              onChange={e => setProjName(e.target.value)}
              className="text-2xl font-bold text-text bg-transparent focus:outline-none focus:border-b focus:border-accent w-full truncate"
              placeholder="Nom du montage…"
            />
            <p className="text-text2 text-sm mt-1">
              {clips.length} clip{clips.length !== 1 ? 's' : ''} · durée estimée{' '}
              <span className="text-accent font-medium">{formatDur(totalDur)}</span>
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {clips.length > 0 && (
              <Button variant="secondary" size="sm" onClick={clearAll}>🗑 Vider</Button>
            )}
            <Button size="sm" onClick={exportList} disabled={clips.length === 0}>
              {saved ? '✓ Exporté !' : '📋 Exporter la liste'}
            </Button>
          </div>
        </div>

        {/* Global caption */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <label className="text-xs font-semibold text-text2 uppercase tracking-wider">Caption globale</label>
          <textarea value={globalCaption} rows={3}
            onChange={e => setGCaption(e.target.value)}
            placeholder="Caption commune à toutes les publications (peut être écrasé par clip)…"
            className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-accent resize-none transition-colors"
          />
        </div>

        {/* Timeline */}
        {clips.length === 0 ? (
          <div className="text-center py-20 text-text2 space-y-4">
            <p className="text-5xl">🎞</p>
            <p className="font-medium text-base">Timeline vide</p>
            <p className="text-sm">Clique sur un clip dans la banque ou glisse-dépose une vidéo ici.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clips.map((clip, i) => (
              <ClipRow
                key={clip.id}
                clip={clip}
                index={i}
                total={clips.length}
                onMove={moveClip}
                onRemove={removeClip}
                onUpdate={updateClip}
              />
            ))}
          </div>
        )}

        {/* Duration bar */}
        {clips.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-text2 uppercase tracking-wider">Durée totale estimée</span>
              <span className="text-sm font-bold text-accent">{formatDur(totalDur)}</span>
            </div>
            <div className="h-2 bg-surface2 rounded-full overflow-hidden">
              {/* Max Instagram reel length ~60s = 100%, show up to 90s */}
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.min(100, (totalDur / 90) * 100)}%` }} />
            </div>
            <p className="text-[10px] text-text2 mt-1">
              {totalDur > 90 ? '⚠ Dépasse 90s (limite Reels recommandée)' : `${Math.round((totalDur / 90) * 100)}% de la limite Reels (90s)`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
