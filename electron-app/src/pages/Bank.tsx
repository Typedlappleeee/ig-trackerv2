import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { Button }  from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { VideoPreview } from '@/components/VideoPreview'

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

// ── Context menu ─────────────────────────────────────────────────────────────
interface CtxMenu {
  item: ContentItem
  x: number
  y: number
}

// ── Rename modal ─────────────────────────────────────────────────────────────
function RenameModal({ item, onSave, onClose }: {
  item: ContentItem
  onSave: (id: string, title: string) => void
  onClose: () => void
}) {
  const [val, setVal] = useState(item.title)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-5 w-80 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text">Renommer la vidéo</h3>
        <input
          autoFocus
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onSave(item.id, val.trim()); onClose() } if (e.key === 'Escape') onClose() }}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
          <Button size="sm" onClick={() => { onSave(item.id, val.trim()); onClose() }} disabled={!val.trim()}>Enregistrer</Button>
        </div>
      </div>
    </div>
  )
}

// ── Move modal ───────────────────────────────────────────────────────────────
function MoveModal({ item, folders, onSave, onClose }: {
  item: ContentItem
  folders: string[]
  onSave: (id: string, folder: string | null) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-5 w-72 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text">Déplacer vers</h3>
        <button
          onClick={() => { onSave(item.id, null); onClose() }}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!item.folder ? 'bg-accent/10 text-accent' : 'hover:bg-surface2 text-text'}`}
        >
          📁 Toute la banque (sans dossier)
        </button>
        {folders.map(f => (
          <button
            key={f}
            onClick={() => { onSave(item.id, f); onClose() }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${item.folder === f ? 'bg-accent/10 text-accent' : 'hover:bg-surface2 text-text'}`}
          >
            📂 {f}
          </button>
        ))}
        <Button variant="secondary" size="sm" className="w-full" onClick={onClose}>Annuler</Button>
      </div>
    </div>
  )
}

// ── Tags modal ───────────────────────────────────────────────────────────────
function TagsModal({ item, onSave, onClose }: {
  item: ContentItem
  onSave: (id: string, tags: string[]) => void
  onClose: () => void
}) {
  const [val, setVal] = useState(item.tags.join(', '))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-5 w-80 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text">Tags</h3>
        <input
          autoFocus
          placeholder="viral, trending, fitness…"
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        />
        <p className="text-[11px] text-text2">Sépare les tags par des virgules.</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
          <Button size="sm" onClick={() => {
            const tags = val.split(',').map(t => t.trim()).filter(Boolean)
            onSave(item.id, tags); onClose()
          }}>Enregistrer</Button>
        </div>
      </div>
    </div>
  )
}

const MIGRATION_SQL = `-- Colle dans Supabase → SQL Editor → Run
alter table public.content_bank add column if not exists folder text default null;`

export function Bank({ user }: BankProps) {
  const [items, setItems]         = useState<ContentItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [adding, setAdding]       = useState(false)
  const [search, setSearch]       = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [newFolderName, setNewFolderName]   = useState('')
  const [showNewFolder, setShowNewFolder]   = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [sqlCopied, setSqlCopied]           = useState(false)
  // Empty folders (created by user but no videos yet) — kept in localStorage for persistence
  const [emptyFolders, setEmptyFolders] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('bank-empty-folders') ?? '[]') } catch { return [] }
  })

  function persistEmptyFolders(next: string[]) {
    setEmptyFolders(next)
    localStorage.setItem('bank-empty-folders', JSON.stringify(next))
  }

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)

  // Modals
  const [renameItem, setRenameItem] = useState<ContentItem | null>(null)
  const [moveItem, setMoveItem]     = useState<ContentItem | null>(null)
  const [tagsItem, setTagsItem]     = useState<ContentItem | null>(null)

  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadItems() }, [])

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [ctxMenu])

  async function loadItems() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('content_bank').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (err) {
      setError('Erreur lors du chargement.')
    } else {
      setItems(data ?? [])
      if (data && data.length > 0 && !('folder' in data[0])) setNeedsMigration(true)
    }
    setLoading(false)
  }

  // Insert a video directly from a file path — no form needed, title = filename
  // Gracefully handles missing 'folder' column (migration not run yet).
  async function addFromPath(filePath: string) {
    const title = nameWithoutExt(filePath)
    const folder = selectedFolder ?? null
    setAdding(true)
    const baseRow = { user_id: user.id, title, file_url: filePath, duration: null, tags: [], notes: '' }

    // First try with folder column
    let res = await supabase
      .from('content_bank')
      .insert({ ...baseRow, folder })
      .select().single()

    // If the folder column doesn't exist, retry without it and show migration banner
    if (res.error && /folder/i.test(res.error.message) && /column|cache/i.test(res.error.message)) {
      setNeedsMigration(true)
      res = await supabase.from('content_bank').insert(baseRow).select().single()
    }

    if (res.error) setError("Erreur lors de l'ajout : " + res.error.message)
    else if (res.data) setItems(prev => [res.data, ...prev])
    setAdding(false)
  }

  async function pickFile() {
    if (!window.electronAPI?.pickVideoFile) return
    const p = await window.electronAPI.pickVideoFile()
    if (p) addFromPath(p)
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setDragging(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    for (const file of files) {
      const filePath = (file as File & { path?: string }).path ?? file.name
      if (filePath) addFromPath(filePath)
    }
  }

  async function deleteItem(id: string) {
    const { error: err } = await supabase.from('content_bank').delete().eq('id', id)
    if (!err) setItems(prev => prev.filter(i => i.id !== id))
    setCtxMenu(null)
  }

  async function renameItemSave(id: string, newTitle: string) {
    if (!newTitle) return
    const { error: err } = await supabase.from('content_bank').update({ title: newTitle }).eq('id', id)
    if (!err) setItems(prev => prev.map(i => i.id === id ? { ...i, title: newTitle } : i))
  }

  async function moveItemSave(id: string, folder: string | null) {
    const { error: err } = await supabase.from('content_bank').update({ folder }).eq('id', id)
    if (!err) setItems(prev => prev.map(i => i.id === id ? { ...i, folder: folder as unknown as string } : i))
  }

  async function saveTagsSave(id: string, newTags: string[]) {
    const { error: err } = await supabase.from('content_bank').update({ tags: newTags }).eq('id', id)
    if (!err) setItems(prev => prev.map(i => i.id === id ? { ...i, tags: newTags } : i))
  }

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    // Folders persist as: 1) folder text on content items, 2) localStorage list for empty folders
    if (!emptyFolders.includes(name)) {
      persistEmptyFolders([...emptyFolders, name])
    }
    setNewFolderName('')
    setShowNewFolder(false)
    setSelectedFolder(name)
  }

  async function renameFolder(oldName: string, newName: string) {
    if (!newName || newName === oldName) return
    // Update DB rows in this folder
    await supabase.from('content_bank').update({ folder: newName }).eq('user_id', user.id).eq('folder', oldName)
    setItems(prev => prev.map(i => (i as unknown as {folder:string}).folder === oldName ? { ...i, folder: newName as unknown as string } : i))
    // Update localStorage empty folders
    persistEmptyFolders(emptyFolders.map(f => f === oldName ? newName : f))
    if (selectedFolder === oldName) setSelectedFolder(newName)
  }

  async function deleteFolder(name: string) {
    if (!confirm(`Supprimer le dossier "${name}" ? Les vidéos ne seront pas supprimées.`)) return
    await supabase.from('content_bank').update({ folder: null }).eq('user_id', user.id).eq('folder', name)
    setItems(prev => prev.map(i => (i as unknown as {folder:string}).folder === name ? { ...i, folder: null as unknown as string } : i))
    persistEmptyFolders(emptyFolders.filter(f => f !== name))
    if (selectedFolder === name) setSelectedFolder(null)
  }

  // Derived data — folders come from items + empty (newly-created) folders
  const folders = [...new Set([
    ...items.map(i => (i as unknown as {folder?: string | null}).folder).filter((f): f is string => Boolean(f)),
    ...emptyFolders,
  ])].sort()

  const visible = items.filter(item => {
    const folder = (item as unknown as {folder?: string | null}).folder
    const folderMatch = selectedFolder === null ? true : folder === selectedFolder
    if (!folderMatch) return false
    if (!search) return true
    const q = search.toLowerCase()
    return item.title.toLowerCase().includes(q) || item.notes.toLowerCase().includes(q) || item.tags.some(t => t.toLowerCase().includes(q))
  })

  const openCtx = useCallback((e: React.MouseEvent, item: ContentItem) => {
    e.preventDefault()
    setCtxMenu({ item, x: e.clientX, y: e.clientY })
  }, [])

  return (
    <div
      ref={dropRef}
      className={`flex h-full min-h-screen transition-colors ${dragging ? 'bg-accent/5' : ''}`}
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

      {/* ── Left sidebar: folders ── */}
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-border bg-surface">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-[10px] font-semibold text-text2 uppercase tracking-widest">Dossiers</p>
          <button
            onClick={() => setShowNewFolder(v => !v)}
            className="text-text2 hover:text-accent text-lg leading-none transition-colors"
            title="Nouveau dossier"
          >+</button>
        </div>

        {showNewFolder && (
          <div className="px-2 py-2 border-b border-border flex gap-1">
            <input
              autoFocus
              placeholder="Nom du dossier…"
              className="flex-1 bg-bg border border-border rounded px-2 py-1 text-xs text-text focus:border-accent focus:outline-none"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') } }}
            />
            <button
              onClick={createFolder}
              className="px-2 py-1 text-xs bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors"
            >OK</button>
          </div>
        )}

        <div className="flex-1 overflow-auto py-1">
          {/* All videos */}
          <button
            onClick={() => setSelectedFolder(null)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
              selectedFolder === null ? 'bg-surface2 border-l-2 border-accent pl-[10px]' : 'hover:bg-surface2'
            }`}
          >
            <span className="text-base flex-shrink-0">🎬</span>
            <span className="text-xs font-medium text-text flex-1">Toute la banque</span>
            <span className="text-[10px] text-text2 flex-shrink-0">{items.length}</span>
          </button>

          {/* Folder list */}
          {folders.map(f => (
            <FolderRow
              key={f}
              name={f}
              count={items.filter(i => (i as unknown as {folder?: string}).folder === f).length}
              active={selectedFolder === f}
              onClick={() => setSelectedFolder(f)}
              onRename={(newName) => renameFolder(f, newName)}
              onDelete={() => deleteFolder(f)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 overflow-auto flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center gap-4 flex-shrink-0">
          <div className="flex-1 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text">
              {selectedFolder ? `📂 ${selectedFolder}` : '🎬 Toute la banque'}
            </h2>
            <span className="text-text2 text-xs">{visible.length} vidéo{visible.length !== 1 ? 's' : ''}</span>
            {adding && <span className="text-xs text-accent animate-pulse">Ajout en cours…</span>}
          </div>
          <input
            type="text"
            placeholder="🔍 Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-44 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder:text-text2 focus:border-accent focus:outline-none transition-colors"
          />
          <Button onClick={pickFile} size="sm">+ Ajouter un média</Button>
        </div>

        {/* Migration notice */}
        {needsMigration && (
          <div className="mx-6 mt-4 bg-warn/10 border border-warn/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-warn">Migration requise — colonne "folder" manquante</p>
              <p className="text-xs text-text2 mt-1">Colle ce SQL dans Supabase → SQL Editor → Run :</p>
              <code className="text-[11px] font-mono text-text2 block mt-1">{MIGRATION_SQL.trim()}</code>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(MIGRATION_SQL); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000) }}
              className="px-3 py-1.5 bg-warn text-black text-xs font-semibold rounded-lg hover:bg-warn/80 flex-shrink-0"
            >
              {sqlCopied ? '✓ Copié' : '📋 Copier'}
            </button>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-center gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-danger hover:text-text">✕</button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-6">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-text2 space-y-4">
              <p className="text-5xl">🎬</p>
              <p className="font-medium text-base">Banque vide</p>
              <p className="text-sm">Glisse-dépose tes vidéos ici ou clique sur<br/><span className="text-accent font-medium">📂 Ajouter une vidéo</span> dans la colonne gauche.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-center py-8 text-text2 text-sm">Aucun résultat.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {visible.map(item => (
                <VideoCard
                  key={item.id}
                  item={item}
                  onContextMenu={openCtx}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-surface border border-border rounded-xl shadow-2xl py-1 min-w-[180px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          {[
            { label: '✏️ Renommer',          action: () => { setRenameItem(ctxMenu.item); setCtxMenu(null) } },
            { label: '📂 Déplacer vers…',    action: () => { setMoveItem(ctxMenu.item); setCtxMenu(null) } },
            { label: '🏷 Modifier les tags', action: () => { setTagsItem(ctxMenu.item); setCtxMenu(null) } },
            { label: '🗑 Supprimer',         action: () => deleteItem(ctxMenu.item.id), danger: true },
          ].map(({ label, action, danger }) => (
            <button
              key={label}
              onClick={action}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                danger ? 'text-danger hover:bg-danger/10' : 'text-text hover:bg-surface2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {renameItem && (
        <RenameModal
          item={renameItem}
          onSave={renameItemSave}
          onClose={() => setRenameItem(null)}
        />
      )}
      {moveItem && (
        <MoveModal
          item={moveItem}
          folders={folders}
          onSave={moveItemSave}
          onClose={() => setMoveItem(null)}
        />
      )}
      {tagsItem && (
        <TagsModal
          item={tagsItem}
          onSave={saveTagsSave}
          onClose={() => setTagsItem(null)}
        />
      )}
    </div>
  )
}

// ── Folder row with inline rename ────────────────────────────────────────────
function FolderRow({ name, count, active, onClick, onRename, onDelete }: {
  name: string
  count: number
  active: boolean
  onClick: () => void
  onRename: (newName: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(name)
  const [showActions, setShowActions] = useState(false)

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1.5">
        <input
          autoFocus
          className="flex-1 bg-bg border border-accent rounded px-2 py-0.5 text-xs text-text focus:outline-none"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onRename(val.trim()); setEditing(false) }
            if (e.key === 'Escape') { setVal(name); setEditing(false) }
          }}
        />
        <button onClick={() => { onRename(val.trim()); setEditing(false) }} className="text-ok text-xs">✓</button>
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
        active ? 'bg-surface2 border-l-2 border-accent pl-[10px]' : 'hover:bg-surface2'
      }`}
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <span className="text-base flex-shrink-0">📂</span>
      <span className="text-xs font-medium text-text flex-1 truncate">{name}</span>
      {showActions ? (
        <div className="flex gap-0.5 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setEditing(true) }}
            className="text-text2 hover:text-accent text-xs px-0.5"
            title="Renommer"
          >✏️</button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-text2 hover:text-danger text-xs px-0.5"
            title="Supprimer"
          >🗑</button>
        </div>
      ) : (
        <span className="text-[10px] text-text2 flex-shrink-0">{count}</span>
      )}
    </div>
  )
}

// ── Video card ───────────────────────────────────────────────────────────────
function VideoCard({ item, onContextMenu }: {
  item: ContentItem
  onContextMenu: (e: React.MouseEvent, item: ContentItem) => void
}) {
  return (
    <div
      className="bg-card border border-border rounded-xl overflow-hidden hover:border-accent/40 transition-colors group cursor-default select-none"
      onContextMenu={e => onContextMenu(e, item)}
    >
      <div className="relative aspect-[9/16] bg-surface2 overflow-hidden">
        <VideoPreview filePath={item.file_url} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
        {/* Date — top left */}
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] text-white font-medium">
          {new Date(item.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
        </div>
        {/* Duration — top right (fades on hover) */}
        {item.duration && (
          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] text-white group-hover:opacity-0 transition-opacity pointer-events-none">
            {formatDuration(item.duration)}
          </div>
        )}
        {/* Used count badge */}
        {item.used_count > 0 && (
          <div className="absolute bottom-8 right-2 bg-accent/90 rounded-full px-1.5 py-0.5 text-[10px] text-bg font-bold pointer-events-none">
            {item.used_count}×
          </div>
        )}
        {/* Title */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5 pointer-events-none">
          <p className="text-xs font-semibold text-white truncate leading-tight">{item.title}</p>
        </div>
        {/* ⋮ menu button on hover */}
        <button
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"
          onClick={e => onContextMenu(e, item)}
          title="Options"
        >⋮</button>
      </div>
      {/* Tags */}
      {item.tags.length > 0 && (
        <div className="px-2.5 py-2 flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] bg-surface2 text-text2 px-1.5 py-0.5 rounded-full">#{tag}</span>
          ))}
          {item.tags.length > 3 && (
            <span className="text-[10px] text-text2">+{item.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── BankPicker (modal for Posting/MassPosting) ───────────────────────────────
export interface BankPickerProps {
  user: User
  mode: 'single' | 'multi'
  onSelect: (paths: string[]) => void
  onClose: () => void
}

export function BankPicker({ user, mode, onSelect, onClose }: BankPickerProps) {
  const [items, setItems]           = useState<ContentItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selected, setSelected]     = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.from('content_bank').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false) })
  }, [])

  const folders = [...new Set(
    items.map(i => (i as unknown as {folder?: string | null}).folder).filter((f): f is string => Boolean(f))
  )].sort()

  const visible = items.filter(item => {
    const folder = (item as unknown as {folder?: string | null}).folder
    if (selectedFolder !== null && folder !== selectedFolder) return false
    if (!search) return true
    const q = search.toLowerCase()
    return item.title.toLowerCase().includes(q) || item.tags.some(t => t.toLowerCase().includes(q))
  })

  function toggle(item: ContentItem) {
    if (!item.file_url) return
    if (mode === 'single') {
      onSelect([item.file_url])
      return
    }
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(item.file_url!)) next.delete(item.file_url!)
      else next.add(item.file_url!)
      return next
    })
  }

  function confirm() {
    onSelect([...selected])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl w-[880px] max-w-[95vw] h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🗂</span>
            <h2 className="text-sm font-semibold text-text">Banque de vidéos</h2>
            <span className="text-xs text-text2">
              {mode === 'multi' ? 'Sélection multiple' : 'Sélection unique'}
            </span>
          </div>
          <div className="flex-1" />
          <input
            type="text"
            placeholder="🔍 Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-44 bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder:text-text2 focus:border-accent focus:outline-none"
          />
          {mode === 'multi' && selected.size > 0 && (
            <Button size="sm" onClick={confirm}>
              Confirmer ({selected.size})
            </Button>
          )}
          <button onClick={onClose} className="text-text2 hover:text-text transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-44 flex-shrink-0 border-r border-border overflow-auto py-1">
            <button
              onClick={() => setSelectedFolder(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                selectedFolder === null ? 'bg-surface2 border-l-2 border-accent pl-[10px]' : 'hover:bg-surface2'
              }`}
            >
              <span className="text-sm">🎬</span>
              <span className="text-xs text-text flex-1">Toute la banque</span>
              <span className="text-[10px] text-text2">{items.length}</span>
            </button>
            {folders.map(f => (
              <button
                key={f}
                onClick={() => setSelectedFolder(f)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                  selectedFolder === f ? 'bg-surface2 border-l-2 border-accent pl-[10px]' : 'hover:bg-surface2'
                }`}
              >
                <span className="text-sm">📂</span>
                <span className="text-xs text-text flex-1 truncate">{f}</span>
                <span className="text-[10px] text-text2">
                  {items.filter(i => (i as unknown as {folder?: string}).folder === f).length}
                </span>
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            ) : visible.length === 0 ? (
              <div className="text-center py-16 text-text2 space-y-2">
                <p className="text-3xl">🎬</p>
                <p className="text-sm">Aucune vidéo</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                {visible.map(item => {
                  const isSelected = item.file_url ? selected.has(item.file_url) : false
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item)}
                      className={`text-left rounded-xl overflow-hidden border-2 transition-all ${
                        isSelected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-accent/40'
                      } ${!item.file_url ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!item.file_url}
                    >
                      <div className="relative aspect-[9/16] bg-surface2">
                        <VideoPreview filePath={item.file_url} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                            <span className="text-bg text-xs font-bold">✓</span>
                          </div>
                        )}
                        {mode === 'multi' && !isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white/50 bg-black/30" />
                        )}
                        <p className="absolute bottom-2 left-2 right-2 text-[11px] font-semibold text-white truncate">
                          {item.title}
                        </p>
                      </div>
                    </button>
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
