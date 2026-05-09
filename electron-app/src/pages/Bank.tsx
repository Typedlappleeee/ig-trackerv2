import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { Button }  from '@/components/ui/Button'
import { Input }   from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'

interface BankProps { user: User }

function formatDuration(s: number | null): string {
  if (!s) return ''
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

function nameWithoutExt(p: string): string {
  const b = basename(p)
  const dot = b.lastIndexOf('.')
  return dot > 0 ? b.slice(0, dot) : b
}

export function Bank({ user }: BankProps) {
  const [items, setItems]       = useState<ContentItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch]     = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

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

  // ── Drag & drop handlers ─────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    // Only clear when leaving the root drop zone
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setDragging(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    // Electron extends File with a .path property
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
    if (err) setError('Erreur lors de l\'ajout.')
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
        <div className="flex gap-2">
          <Button variant="secondary" onClick={pickFile}>
            📂 Choisir un fichier
          </Button>
          <Button onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Annuler' : '+ Ajouter'}
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-slide-up">
          <h2 className="text-sm font-semibold text-text">Nouvelle vidéo</h2>

          {/* File path display */}
          {fileUrl && (
            <div className="flex items-center gap-2 px-3 py-2 bg-surface2 rounded-lg text-xs text-text2">
              <span className="text-accent">📄</span>
              <span className="truncate flex-1">{basename(fileUrl)}</span>
              <button onClick={() => setFileUrl('')} className="text-text2 hover:text-danger">✕</button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Titre *" placeholder="Nom de la vidéo…" value={title} onChange={e => setTitle(e.target.value)} />
            <Input label="URL ou chemin (optionnel)" placeholder="chemin/vers/fichier.mp4" value={fileUrl} onChange={e => setFileUrl(e.target.value)} />
            <Input label="Durée (secondes)" type="number" placeholder="Ex: 30" value={duration} onChange={e => setDuration(e.target.value)} />
            <Input label="Tags (séparés par virgules)" placeholder="viral, trending, danse…" value={tags} onChange={e => setTags(e.target.value)} />
          </div>
          <Input label="Notes" placeholder="Remarques, contexte…" value={notes} onChange={e => setNotes(e.target.value)} />
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
      ) : (
        <div className="grid grid-cols-1 gap-3 animate-fade-in">
          {visible.map(item => (
            <div key={item.id}
              className="bg-card border border-border rounded-xl p-4 flex items-start gap-4 hover:border-accent/30 transition-colors"
            >
              <div className="w-16 h-12 rounded-lg bg-surface2 flex items-center justify-center flex-shrink-0 text-xl">🎬</div>
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
