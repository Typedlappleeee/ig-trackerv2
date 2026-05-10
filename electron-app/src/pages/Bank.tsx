import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'

interface BankProps { user: User }

function formatDuration(s: number | null): string {
  if (!s) return ''
  const m   = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

function nameWithoutExt(p: string): string {
  const b   = basename(p)
  const dot = b.lastIndexOf('.')
  return dot > 0 ? b.slice(0, dot) : b
}

// ── Video thumbnail via <video> element (local files) ─────────────────────────
function VideoPreview({ filePath }: { filePath: string | null }) {
  const [ready, setReady]   = useState(false)
  const [failed, setFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    setReady(false)
    setFailed(false)
  }, [filePath])

  if (!filePath) {
    return (
      <div className="w-full h-full flex items-center justify-center text-4xl bg-surface2">🎬</div>
    )
  }

  const src = `file:///${filePath.replace(/\\/g, '/')}`

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface2 flex-col gap-1">
        <span className="text-3xl">🎬</span>
        <span className="text-[10px] text-text2">{basename(filePath)}</span>
      </div>
    )
  }

  return (
    <>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface2">
          <Spinner size="sm" />
        </div>
      )}
      <video
        ref={videoRef}
        src={src}
        className={`w-full h-full object-cover transition-opacity ${ready ? 'opacity-100' : 'opacity-0'}`}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={() => {
          if (videoRef.current) videoRef.current.currentTime = 1
        }}
        onSeeked={() => setReady(true)}
        onError={() => setFailed(true)}
      />
    </>
  )
}

export function Bank({ user }: BankProps) {
  const [items, setItems]       = useState<ContentItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch]     = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [view, setView]         = useState<'grid' | 'list'>('grid')

  // Form state
  const [title, setTitle]       = useState('')
  const [fileUrl, setFileUrl]   = useState('')
  const [duration, setDuration] = useState('')
  const [tags, setTags]         = useState('')
  const [notes, setNotes]       = useState('')

  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('content_bank').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (err) setError('Erreur lors du chargement.')
    else setItems(data ?? [])
    setLoading(false)
  }

  function resetForm() {
    setTitle(''); setFileUrl(''); setDuration(''); setTags(''); setNotes('')
    setShowForm(false)
  }

  function fillFormFromPath(filePath: string) {
    setFileUrl(filePath)
    if (!title) setTitle(nameWithoutExt(filePath))
    setShowForm(true)
  }

  async function pickFile() {
    if (!window.electronAPI?.pickVideoFile) return
    const path = await window.electronAPI.pickVideoFile()
    if (path) fillFormFromPath(path)
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setDragging(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const path = (file as File & { path?: string }).path ?? file.name
    fillFormFromPath(path)
  }

  async function addItem() {
    if (!title.trim()) return
    setAdding(true); setError(null)
    const tagsArr = tags.split(',').map(t => t.trim()).filter(Boolean)
    const durSec  = duration ? parseInt(duration) || null : null
    const { data, error: err } = await supabase
      .from('content_bank')
      .insert({ user_id: user.id, title: title.trim(), file_url: fileUrl.trim() || null, duration: durSec, tags: tagsArr, notes: notes.trim() })
      .select().single()
    if (err) setError("Erreur lors de l'ajout.")
    else { setItems(prev => [data, ...prev]); resetForm() }
    setAdding(false)
  }

  async function deleteItem(id: string) {
    const { error: err } = await supabase.from('content_bank').delete().eq('id', id)
    if (!err) setItems(prev => prev.filter(i => i.id !== id))
  }

  const visible = items.filter(item => {
    if (!search) return true
    const q = search.toLowerCase()
    return item.title.toLowerCase().includes(q) || item.notes.toLowerCase().includes(q) || item.tags.some(t => t.toLowerCase().includes(q))
  })

  return (
    <div
      ref={dropRef}
      className={`p-8 space-y-6 min-h-screen transition-colors ${dragging ? 'bg-accent/5' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-accent rounded-2xl px-16 py-10 bg-bg/90 backdrop-blur text-center space-y-3">
            <p className="text-4xl">🎬</p>
            <p className="text-lg font-semibold text-accent">Dépose la vidéo ici</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Banque de vidéos</h1>
          <p className="text-text2 text-sm mt-1">
            {items.length} vidéo{items.length !== 1 ? 's' : ''} · Glisse-dépose une vidéo n'importe où
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Grid / List toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setView('grid')}
              className={`px-3 py-1.5 text-xs transition-colors ${view === 'grid' ? 'bg-accent/20 text-accent' : 'text-text2 hover:text-text'}`}
              title="Vue grille"
            >⊞</button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-xs transition-colors border-l border-border ${view === 'list' ? 'bg-accent/20 text-accent' : 'text-text2 hover:text-text'}`}
              title="Vue liste"
            >☰</button>
          </div>
          <Button variant="secondary" onClick={pickFile}>📂 Choisir</Button>
          <Button onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Annuler' : '+ Ajouter'}
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text">Nouvelle vidéo</h2>
          {fileUrl && (
            <div className="flex items-center gap-2 px-3 py-2 bg-surface2 rounded-lg text-xs text-text2">
              <span className="text-accent">📄</span>
              <span className="truncate flex-1">{basename(fileUrl)}</span>
              <button onClick={() => setFileUrl('')} className="text-text2 hover:text-danger">✕</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Titre *" placeholder="Nom de la vidéo…" value={title} onChange={e => setTitle(e.target.value)} />
            <Input label="Chemin fichier (optionnel)" placeholder="C:\Videos\fichier.mp4" value={fileUrl} onChange={e => setFileUrl(e.target.value)} />
            <Input label="Durée (secondes)" type="number" placeholder="Ex: 30" value={duration} onChange={e => setDuration(e.target.value)} />
            <Input label="Tags (séparés par virgules)" placeholder="viral, trending…" value={tags} onChange={e => setTags(e.target.value)} />
          </div>
          <Input label="Notes" placeholder="Remarques…" value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="flex gap-3 items-center">
            <Button onClick={addItem} loading={adding} disabled={!title.trim()}>Ajouter</Button>
            <Button variant="secondary" onClick={pickFile}>📂 Parcourir…</Button>
            <Button variant="secondary" onClick={resetForm}>Annuler</Button>
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">{error}</div>
      )}

      {items.length > 0 && (
        <input type="text" placeholder="🔍 Rechercher par titre, tag…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none transition-colors"
        />
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-text2 space-y-4">
          <p className="text-5xl">🎬</p>
          <p className="font-medium text-base">Banque vide</p>
          <p className="text-sm">Glisse-dépose une vidéo ici ou clique sur "Ajouter".</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-center py-8 text-text2 text-sm">Aucun résultat.</p>
      ) : view === 'grid' ? (
        /* ── Grid view ── */
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map(item => (
            <div key={item.id}
              className="bg-card border border-border rounded-xl overflow-hidden hover:border-accent/40 transition-colors group cursor-default"
            >
              {/* Thumbnail zone — 9:16 ratio */}
              <div className="relative aspect-[9/16] bg-surface2 overflow-hidden">
                <VideoPreview filePath={item.file_url} />
                {/* Gradient + info overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                {/* Date badge */}
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] text-white font-medium">
                  {new Date(item.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                </div>
                {/* Duration badge */}
                {item.duration && (
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] text-white">
                    {formatDuration(item.duration)}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <p className="text-xs font-semibold text-white truncate leading-tight">{item.title}</p>
                </div>
                {/* Delete button */}
                <button
                  onClick={() => deleteItem(item.id)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger/80"
                  title="Supprimer"
                >✕</button>
                {/* Used count badge */}
                {item.used_count > 0 && (
                  <div className="absolute top-2 left-2 bg-accent/90 rounded-full px-1.5 py-0.5 text-[10px] text-white font-semibold">
                    {item.used_count}×
                  </div>
                )}
              </div>
              {/* Tags */}
              {item.tags.length > 0 && (
                <div className="px-2.5 py-2 flex flex-wrap gap-1">
                  {item.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[10px] bg-surface2 text-text2 px-1.5 py-0.5 rounded-full">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* ── List view ── */
        <div className="space-y-3">
          {visible.map(item => (
            <div key={item.id}
              className="bg-card border border-border rounded-xl p-4 flex items-start gap-4 hover:border-accent/30 transition-colors"
            >
              <div className="w-16 h-12 rounded-lg bg-surface2 overflow-hidden flex-shrink-0 relative">
                <VideoPreview filePath={item.file_url} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-text truncate">{item.title}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.duration && (
                      <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded">{formatDuration(item.duration)}</span>
                    )}
                    {item.used_count > 0 && (
                      <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded">{item.used_count}× utilisé</span>
                    )}
                  </div>
                </div>
                {item.file_url && (
                  <p className="text-[10px] text-text2 mt-0.5 font-mono truncate" title={item.file_url}>
                    {basename(item.file_url)}
                  </p>
                )}
                {item.notes && <p className="text-xs text-text2 mt-1 truncate">{item.notes}</p>}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {item.tags.map(tag => (
                    <span key={tag} className="text-xs bg-surface2 text-text2 px-2 py-0.5 rounded-full">#{tag}</span>
                  ))}
                  <span className="text-xs text-text2 ml-auto">
                    {new Date(item.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              </div>
              <button onClick={() => deleteItem(item.id)}
                className="text-text2 hover:text-danger transition-colors p-1 rounded flex-shrink-0" title="Supprimer">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
