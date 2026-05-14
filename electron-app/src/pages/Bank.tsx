import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { canAccessBankFolder } from '@/lib/permissions'
import { uploadVideoFromPath, uploadVideoFromBlob, deleteStorageObjects, type UploadScope } from '@/lib/storage'
import { logActivity } from '@/lib/activityLog'
import { Button }  from '@/components/ui/Button'
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

// ── Add Media modal (drag-drop zone + pick from PC) ───────────────────────────
function AddMediaModal({ onFiles, onElectronPick, onClose }: {
  onFiles: (files: File[]) => void
  onElectronPick?: () => void
  onClose: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) onFiles(files)
    onClose()
  }

  function handlePickClick() {
    if (onElectronPick) {
      onElectronPick()
      onClose()
    } else {
      fileInputRef.current?.click()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl p-6 w-96 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">➕ Ajouter un média</h3>
          <button onClick={onClose} className="text-text2 hover:text-text transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Drag-drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 py-10 transition-all cursor-default
            ${dragOver ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 bg-surface2/40'}
          `}
        >
          <span className="text-4xl">{dragOver ? '📂' : '🎬'}</span>
          <div className="text-center">
            <p className="text-sm font-semibold text-text">Glisse tes fichiers ici</p>
            <p className="text-xs text-text2 mt-0.5">Vidéos, photos, GIFs, audio</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text2">ou</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*,audio/*,.gif"
          multiple
          style={{ display: 'none' }}
          onChange={e => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) onFiles(files)
            e.target.value = ''
            onClose()
          }}
        />
        <button
          onClick={handlePickClick}
          className="w-full bg-accent hover:bg-accent2 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
        >
          📁 Choisir depuis ton PC
        </button>
      </div>
    </div>
  )
}

export function Bank({ user }: BankProps) {
  const { currentOrg, role, perms } = useOrg()
  const [items, setItems]         = useState<ContentItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [adding, setAdding]       = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [newFolderName, setNewFolderName]   = useState('')
  const [showNewFolder, setShowNewFolder]   = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [sqlCopied, setSqlCopied]           = useState(false)
  // Type filter (Python: Tous/Vidéo/Photo/GIF/Audio)
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'photo' | 'gif' | 'audio'>('all')
  // Empty folders — scoped per user so accounts don't bleed into each other
  const folderKey = `bank-empty-folders-${user.id}`
  const [emptyFolders, setEmptyFolders] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`bank-empty-folders-${user.id}`) ?? '[]') } catch { return [] }
  })

  function persistEmptyFolders(next: string[]) {
    setEmptyFolders(next)
    localStorage.setItem(folderKey, JSON.stringify(next))
  }

  // Context menu
  const [ctxMenu, setCtxMenu]       = useState<CtxMenu | null>(null)
  const [playingItem, setPlayingItem] = useState<ContentItem | null>(null)

  // Modals
  const [renameItem, setRenameItem] = useState<ContentItem | null>(null)
  const [moveItem, setMoveItem]     = useState<ContentItem | null>(null)
  const [tagsItem, setTagsItem]     = useState<ContentItem | null>(null)

  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadItems() }, [currentOrg?.id])

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [ctxMenu])

  async function loadItems() {
    setLoading(true)
    let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false })
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data, error: err } = await q
    if (err) {
      setError('Erreur lors du chargement.')
    } else {
      let rows = (data ?? []) as ContentItem[]
      // In org mode, filter out folders the member is not allowed to see
      if (role) rows = rows.filter(i => canAccessBankFolder(role, perms, i.folder ?? null))
      setItems(rows)
      if (data && data.length > 0 && !('folder' in data[0])) setNeedsMigration(true)
    }
    setLoading(false)
  }

  // Insert a content_bank row pointing at already-uploaded Storage paths.
  // Used by both addFromPath (file picker) and addFromFile (drag-drop).
  async function insertBankRow(opts: { title: string; storagePath: string; thumbnailPath: string | null }) {
    const folder = selectedFolder ?? null
    const baseRow = {
      user_id: user.id, org_id: currentOrg?.id ?? null, title: opts.title,
      file_url:       null,
      storage_path:   opts.storagePath,
      thumbnail_path: opts.thumbnailPath,
      duration: null, tags: [], notes: '',
    }
    let res = await supabase.from('content_bank').insert({ ...baseRow, folder }).select().single()

    // Fallback if the storage_path columns or folder column don't exist yet
    if (res.error && /storage_path|thumbnail_path|folder/i.test(res.error.message) && /column|cache/i.test(res.error.message)) {
      setNeedsMigration(true)
      res = await supabase.from('content_bank').insert({
        user_id: user.id, org_id: currentOrg?.id ?? null, title: opts.title, file_url: null,
        duration: null, tags: [], notes: '',
      }).select().single()
    }

    if (res.error) {
      setError("Erreur lors de l'ajout : " + res.error.message)
      await deleteStorageObjects([opts.storagePath, opts.thumbnailPath])
      return
    }
    if (res.data) setItems(prev => [res.data, ...prev])
  }

  function uploadProgressLabels(phase: string): string {
    const labels: Record<string, string> = {
      'reading':          '📂 Lecture du fichier…',
      'uploading-video':  '☁ Upload vers Supabase…',
      'thumbnail':        '🖼 Génération de la miniature…',
      'uploading-thumb':  '☁ Upload de la miniature…',
    }
    return labels[phase] ?? ''
  }

  // Upload via Electron file picker (we only have an absolute path → must read via IPC).
  async function addFromPath(filePath: string) {
    const title = nameWithoutExt(filePath)
    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }

    setAdding(true); setUploadStatus(`📤 Lecture de ${basename(filePath)}…`)
    try {
      const { storagePath, thumbnailPath } = await uploadVideoFromPath(filePath, scope, phase => setUploadStatus(uploadProgressLabels(phase)))
      await insertBankRow({ title, storagePath, thumbnailPath })
      logActivity({ orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '', action: 'bank_add', details: { title, source: 'file_picker', folder: selectedFolder } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setAdding(false); setUploadStatus(null)
  }

  // Upload via drag-drop: the File object is already in renderer memory — skip IPC.
  async function addFromFile(file: File) {
    const title = (file.name.match(/^(.*?)(\.[^.]+)?$/)?.[1]) ?? file.name
    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }

    setAdding(true); setUploadStatus(`📤 ${file.name}`)
    try {
      const { storagePath, thumbnailPath } = await uploadVideoFromBlob(file, file.name, scope, phase => setUploadStatus(`${file.name} : ${uploadProgressLabels(phase)}`))
      await insertBankRow({ title, storagePath, thumbnailPath })
      logActivity({ orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '', action: 'bank_add', details: { title, source: 'drag_drop', folder: selectedFolder } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setAdding(false); setUploadStatus(null)
  }

  // Migrate a legacy item (file_url is a local path) to cloud storage.
  // Reads the local file, uploads it, updates the row to clear file_url and set storage_path.
  async function reuploadItem(item: ContentItem) {
    if (!item.file_url) return
    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }
    setUploadStatus(`📤 Migration de ${item.title}…`)
    try {
      const { storagePath, thumbnailPath } = await uploadVideoFromPath(item.file_url, scope, phase => {
        const labels: Record<string, string> = {
          'reading':          '📂 Lecture du fichier local…',
          'uploading-video':  '☁ Upload vers Supabase…',
          'thumbnail':        '🖼 Miniature…',
          'uploading-thumb':  '☁ Upload miniature…',
        }
        setUploadStatus(`${item.title} : ${labels[phase] ?? ''}`)
      })
      const { error: err } = await supabase.from('content_bank').update({
        storage_path: storagePath, thumbnail_path: thumbnailPath, file_url: null,
      }).eq('id', item.id)
      if (err) {
        setError('Migration échouée : ' + err.message)
        await deleteStorageObjects([storagePath, thumbnailPath])
      } else {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, storage_path: storagePath, thumbnail_path: thumbnailPath, file_url: null } : i))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setUploadStatus(null)
  }

  async function pickFile() {
    if (!window.electronAPI?.pickVideoFile) return
    const p = await window.electronAPI.pickVideoFile()
    if (!p) return
    // In web mode, pickVideoFile returns a blob: URL. Fetching it via readFileBytes
    // can fail ("Failed to fetch"). Get the original File from the in-memory store
    // and upload it directly as a Blob — same path drag-drop uses.
    if (p.startsWith('blob:')) {
      const { getStoredFile } = await import('@/lib/webAPI')
      const file = getStoredFile(p)
      if (file) { addFromFile(file); return }
    }
    addFromPath(p)
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setDragging(false)
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    // Process sequentially — concurrent thumbnail generation on N large videos
    // can saturate RAM/CPU and freeze the renderer.
    for (const file of files) await addFromFile(file)
  }

  async function deleteItem(id: string) {
    const item = items.find(i => i.id === id)
    const { error: err } = await supabase.from('content_bank').delete().eq('id', id)
    if (!err) {
      setItems(prev => prev.filter(i => i.id !== id))
      if (item) {
        deleteStorageObjects([item.storage_path, item.thumbnail_path])
        logActivity({ orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '', action: 'bank_delete', details: { title: item.title, folder: item.folder } })
      }
    }
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

  function inferType(filePath: string | null): 'video' | 'photo' | 'gif' | 'audio' {
    if (!filePath) return 'video'
    const ext = filePath.toLowerCase().split('.').pop() ?? ''
    if (['gif'].includes(ext)) return 'gif'
    if (['jpg','jpeg','png','webp','heic','bmp'].includes(ext)) return 'photo'
    if (['mp3','wav','m4a','aac','flac','ogg'].includes(ext)) return 'audio'
    return 'video'
  }

  const visible = items.filter(item => {
    const folder = (item as unknown as {folder?: string | null}).folder
    const folderMatch = selectedFolder === null ? true : folder === selectedFolder
    if (!folderMatch) return false
    if (typeFilter !== 'all' && inferType(item.storage_path ?? item.file_url) !== typeFilter) return false
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
              onDropItem={itemId => { moveItemSave(itemId, f); setSelectedFolder(f) }}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 overflow-auto flex flex-col">
        {/* Header (Python: top bar at #070a10) */}
        <div className="px-6 py-3 border-b border-border bg-[#070a10] flex items-center gap-2 flex-shrink-0">
          <h2 className="text-sm font-semibold text-text mr-2">🗂 Banque de médias</h2>
          <div className="flex-1" />
          <Button onClick={() => setShowAddModal(true)} size="sm">+ Ajouter un média</Button>
          <Button variant="secondary" size="sm" onClick={() => alert('Réglage du dossier export à faire dans Paramètres → Profil')}>📂 Export dir</Button>
          <Button variant="secondary" size="sm" onClick={loadItems}>↺ Rafraîchir</Button>
        </div>

        {/* Filter bar */}
        <div className="px-6 py-3 border-b border-border bg-[#070a10] flex items-center gap-3 flex-shrink-0">
          <input
            type="text"
            placeholder="🔍  Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 max-w-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder:text-text2 focus:border-accent focus:outline-none transition-colors"
          />
          {/* Type pills */}
          <div className="flex gap-1">
            {([
              { k: 'all',   l: 'Tous'  },
              { k: 'video', l: 'Vidéo' },
              { k: 'photo', l: 'Photo' },
              { k: 'gif',   l: 'GIF'   },
              { k: 'audio', l: 'Audio' },
            ] as const).map(t => (
              <button
                key={t.k}
                onClick={() => setTypeFilter(t.k)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                  typeFilter === t.k ? 'bg-accent text-white' : 'bg-surface text-text2 hover:text-text'
                }`}
              >{t.l}</button>
            ))}
          </div>
          <div className="flex-1" />
          <span className="text-text2 text-xs">{visible.length} média{visible.length !== 1 ? 's' : ''}</span>
          {adding && <span className="text-xs text-accent animate-pulse">Ajout…</span>}
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

        {uploadStatus && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-lg bg-accent/10 border border-accent/30 text-accent text-sm flex items-center gap-2">
            <span className="animate-spin">↻</span>
            <span>{uploadStatus}</span>
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
                  onPlay={setPlayingItem}
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
            ...(ctxMenu.item.file_url && !ctxMenu.item.storage_path ? [
              { label: '☁ Uploader vers le cloud', action: () => { reuploadItem(ctxMenu.item); setCtxMenu(null) } },
            ] : []),
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

      {/* ── Video player ── */}
      {playingItem && (
        <VideoPlayerModal item={playingItem} onClose={() => setPlayingItem(null)} />
      )}

      {/* ── Modals ── */}
      {showAddModal && (
        <AddMediaModal
          onFiles={async files => { for (const f of files) await addFromFile(f) }}
          onElectronPick={window.electronAPI?.pickVideoFile ? pickFile : undefined}
          onClose={() => setShowAddModal(false)}
        />
      )}
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
function FolderRow({ name, count, active, onClick, onRename, onDelete, onDropItem }: {
  name: string
  count: number
  active: boolean
  onClick: () => void
  onRename: (newName: string) => void
  onDelete: () => void
  onDropItem: (itemId: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(name)
  const [showActions, setShowActions] = useState(false)
  const [dragOver, setDragOver] = useState(false)

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
      } ${dragOver ? 'bg-accent/20 border-l-2 border-accent pl-[10px]' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        const itemId = e.dataTransfer.getData('bank-item-id')
        if (itemId) onDropItem(itemId)
      }}
    >
      <span className="text-base flex-shrink-0">{dragOver ? '📥' : '📂'}</span>
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

// ── Video thumbnail ───────────────────────────────────────────────────────────
// Priority order:
//   1. thumbnailPath (Supabase Storage)  → signed URL → <img>   (fast)
//   2. storagePath  (Supabase Storage)   → signed video URL → <video> first-frame
//      (fallback when thumbnail extraction failed at upload time)
//   3. filePath     (legacy local)       → localvideo:// → <video> first-frame
//   4. emoji
import { getSignedUrl } from '@/lib/storage'

const IMAGE_EXTS = new Set(['jpg','jpeg','png','webp','gif','bmp','heic'])
function isImagePath(p: string | null | undefined): boolean {
  if (!p) return false
  return IMAGE_EXTS.has(p.toLowerCase().split('.').pop() ?? '')
}

export function VideoThumbnail({ filePath, thumbnailPath, storagePath }: {
  filePath?:      string | null
  thumbnailPath?: string | null
  storagePath?:   string | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const [thumbUrl, setThumbUrl]     = useState<string | null>(null)
  const [videoSrc, setVideoSrc]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setThumbUrl(null); setVideoSrc(null); setFailed(false)
    if (thumbnailPath) {
      getSignedUrl(thumbnailPath).then(u => { if (!cancelled) setThumbUrl(u) })
    } else if (storagePath) {
      getSignedUrl(storagePath).then(u => { if (!cancelled) setVideoSrc(u) })
    }
    return () => { cancelled = true }
  }, [thumbnailPath, storagePath])

  // 1. JPEG thumbnail
  if (thumbnailPath) {
    if (!thumbUrl) return <div className="w-full h-full flex items-center justify-center bg-surface2 text-4xl">🎬</div>
    if (failed)    return <div className="w-full h-full flex items-center justify-center bg-surface2 text-4xl">🎬</div>
    return (
      <img src={thumbUrl} alt=""
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        onError={() => setFailed(true)} />
    )
  }

  // 2. Cloud asset (image or video)
  if (storagePath) {
    if (!videoSrc || failed) return <div className="w-full h-full flex items-center justify-center bg-surface2 text-4xl">🎬</div>
    if (isImagePath(storagePath)) {
      return (
        <img src={videoSrc} alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={() => setFailed(true)} />
      )
    }
    return (
      <video
        ref={videoRef}
        src={videoSrc}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        muted playsInline preload="metadata" crossOrigin="anonymous"
        onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = 0.5 }}
        onError={() => setFailed(true)}
      />
    )
  }

  // 3. Legacy local path (or web blob:/https: URL passed directly)
  const localUrl = (() => {
    if (!filePath) return ''
    if (filePath.startsWith('http') || filePath.startsWith('blob:') || filePath.startsWith('data:')) {
      return filePath
    }
    let n = filePath.replace(/\\/g, '/')
    if (n.startsWith('file://')) n = n.slice(7)
    if (!n.startsWith('/')) n = '/' + n
    return 'localvideo://' + n
  })()
  if (!localUrl || failed) {
    return <div className="w-full h-full flex items-center justify-center bg-surface2 text-4xl">🎬</div>
  }
  return (
    <video
      ref={videoRef}
      src={localUrl}
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      muted playsInline preload="metadata"
      onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = 0.5 }}
      onError={() => setFailed(true)}
    />
  )
}

// ── Video player modal ────────────────────────────────────────────────────────
function VideoPlayerModal({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cloudUrl, setCloudUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (item.storage_path) {
      getSignedUrl(item.storage_path).then(u => { if (!cancelled) setCloudUrl(u) })
    }
    return () => { cancelled = true }
  }, [item.storage_path])

  const localUrl = item.storage_path
    ? cloudUrl ?? ''
    : (() => {
        if (!item.file_url) return ''
        if (item.file_url.startsWith('http') || item.file_url.startsWith('blob:') || item.file_url.startsWith('data:')) {
          return item.file_url
        }
        let n = item.file_url.replace(/\\/g, '/')
        if (n.startsWith('file://')) n = n.slice(7)
        if (!n.startsWith('/')) n = '/' + n
        return 'localvideo://' + n
      })()

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative rounded-xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ height: '94vh', aspectRatio: '9/16', maxWidth: '94vw', background: '#000' }}
      >
        {/* Close button — overlaid top-right */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
        >✕</button>

        {/* Title + duration overlay — top-left */}
        <div
          className="absolute top-3 left-3 z-20 flex items-center gap-2 text-white text-[11px] font-medium rounded-lg px-2.5 py-1.5 max-w-[60%]"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
        >
          <span className="truncate">{item.title}</span>
          {item.duration && <span className="opacity-60 flex-shrink-0">· {formatDuration(item.duration)}</span>}
        </div>

        {/* Video fills the container */}
        <video
          ref={videoRef}
          src={localUrl || undefined}
          controls
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          onError={() => {}}
        />
      </div>
    </div>
  )
}

// ── Video card ───────────────────────────────────────────────────────────────
function VideoCard({ item, onContextMenu, onPlay }: {
  item: ContentItem
  onContextMenu: (e: React.MouseEvent, item: ContentItem) => void
  onPlay: (item: ContentItem) => void
}) {
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('bank-item-id', item.id)}
      className="bg-card border border-border rounded-xl overflow-hidden hover:border-accent/40 transition-colors group cursor-default select-none"
      onContextMenu={e => onContextMenu(e, item)}
    >
      <div
        className="relative aspect-[9/16] bg-surface2 overflow-hidden cursor-pointer"
        onClick={() => (item.file_url || item.storage_path) && onPlay(item)}
      >
        <VideoThumbnail filePath={item.file_url} thumbnailPath={item.thumbnail_path} storagePath={item.storage_path} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        {/* Play button on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <span className="text-white text-xl ml-1">▶</span>
          </div>
        </div>

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
          onClick={e => { e.stopPropagation(); onContextMenu(e, item) }}
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
  const { currentOrg, role, perms } = useOrg()
  const [items, setItems]           = useState<ContentItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  // Selection is tracked by item.id so cloud-stored items work even though their file_url is null.
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [resolving, setResolving]   = useState<string | null>(null)

  useEffect(() => {
    let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false })
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      let rows = (data ?? []) as ContentItem[]
      if (role) rows = rows.filter(i => canAccessBankFolder(role, perms, i.folder ?? null))
      setItems(rows)
      setLoading(false)
    })
  }, [currentOrg?.id])

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

  // Download cloud-stored items to temp; legacy items return file_url as-is.
  async function resolvePaths(its: ContentItem[]): Promise<string[]> {
    const out: string[] = []
    for (let i = 0; i < its.length; i++) {
      const it = its[i]
      setResolving(`${i + 1}/${its.length} — ${it.title}`)
      try {
        const { resolveContentToLocalPath } = await import('@/lib/storage')
        out.push(await resolveContentToLocalPath(it))
      } catch (e) {
        console.error('[BankPicker] resolve failed', it.id, e)
      }
    }
    return out
  }

  async function toggle(item: ContentItem) {
    if (!item.file_url && !item.storage_path) return
    if (mode === 'single') {
      const paths = await resolvePaths([item])
      setResolving(null)
      if (paths.length > 0) onSelect(paths)
      return
    }
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  async function confirm() {
    const its = items.filter(i => selected.has(i.id))
    const paths = await resolvePaths(its)
    setResolving(null)
    onSelect(paths)
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
            <Button size="sm" onClick={confirm} disabled={!!resolving}>
              {resolving ? 'Téléchargement…' : `Confirmer (${selected.size})`}
            </Button>
          )}
          <button onClick={onClose} className="text-text2 hover:text-text transition-colors text-xl leading-none">✕</button>
        </div>
        {resolving && (
          <div className="px-5 py-2 bg-accent/10 border-b border-accent/30 text-accent text-xs flex items-center gap-2">
            <span className="animate-spin">↻</span><span>📥 Téléchargement depuis le cloud : {resolving}</span>
          </div>
        )}

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
                  const isSelected = selected.has(item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item)}
                      className={`text-left rounded-xl overflow-hidden border-2 transition-all ${
                        isSelected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-accent/40'
                      } ${!item.file_url && !item.storage_path ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!item.file_url && !item.storage_path}
                    >
                      <div className="relative aspect-[9/16] bg-surface2">
                        <VideoThumbnail filePath={item.file_url ?? ''} thumbnailPath={item.thumbnail_path} storagePath={item.storage_path} />
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
