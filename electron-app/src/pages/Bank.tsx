import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { useT, useLang } from '@/lib/i18n'
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

// ── Download helper — use Supabase SDK (handles CORS) then blob URL ───────────
const DOWNLOAD_BUCKET = 'content'
async function downloadItem(item: ContentItem) {
  const filename = getDownloadName(item)
  if (item.storage_path) {
    const { data, error } = await supabase.storage.from(DOWNLOAD_BUCKET).download(item.storage_path)
    if (!error && data) {
      const blobUrl = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = blobUrl; a.download = filename
      document.body.appendChild(a); a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000)
      return
    }
  }
  // fallback: file_url (legacy)
  if (item.file_url) {
    const a = document.createElement('a')
    a.href = item.file_url; a.download = filename
    document.body.appendChild(a); a.click()
    document.body.removeChild(a)
  }
}

function getDownloadName(item: ContentItem) {
  const title = item.title ?? 'video'
  return title.match(/\.[a-z0-9]+$/i) ? title : title + '.mp4'
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
  const t = useT()
  const [val, setVal] = useState(item.title)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-5 w-80 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text">{t('bankRenameVideo')}</h3>
        <input
          autoFocus
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onSave(item.id, val.trim()); onClose() } if (e.key === 'Escape') onClose() }}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button size="sm" onClick={() => { onSave(item.id, val.trim()); onClose() }} disabled={!val.trim()}>{t('save')}</Button>
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
  const t = useT()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-5 w-72 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text">{t('bankMoveTo')}</h3>
        <button
          onClick={() => { onSave(item.id, null); onClose() }}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!item.folder ? 'bg-accent/10 text-accent' : 'hover:bg-surface2 text-text'}`}
        >
          {t('bankAllNoFolder')}
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
        <Button variant="secondary" size="sm" className="w-full" onClick={onClose}>{t('cancel')}</Button>
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
  const t = useT()
  const [val, setVal] = useState(item.tags.join(', '))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-5 w-80 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text">{t('bankTagsTitle')}</h3>
        <input
          autoFocus
          placeholder={t('bankTagsPlaceholder')}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        />
        <p className="text-[11px] text-text2">{t('bankTagsSeparate')}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button size="sm" onClick={() => {
            const tags = val.split(',').map(tag => tag.trim()).filter(Boolean)
            onSave(item.id, tags); onClose()
          }}>{t('save')}</Button>
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
  const t = useT()
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
          <h3 className="text-sm font-bold text-text">{t('bankAddMedia')}</h3>
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
            <p className="text-sm font-semibold text-text">{t('bankDragFiles')}</p>
            <p className="text-xs text-text2 mt-0.5">{t('bankMediaTypes')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text2">{t('bankOr')}</span>
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
          {t('bankChoosePC')}
        </button>
      </div>
    </div>
  )
}

export function Bank({ user }: BankProps) {
  const t = useT()
  const { currentOrg, role, perms } = useOrg()
  const [personalMode, setPersonalMode] = useState(false)
  // true when we should show personal (user-scoped) items regardless of org
  const isPersonal = personalMode || !currentOrg

  // Scope helper — applies the correct user/org filter to any Supabase query
  function scopeQ<T>(q: T): T {
    const qq = q as any
    return isPersonal
      ? qq.eq('user_id', user.id).is('org_id', null)
      : qq.eq('org_id', currentOrg!.id)
  }

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

  // Folder action modal
  const [folderModal, setFolderModal] = useState<{ name: string; mode: 'delete' | 'merge' } | null>(null)

  // Multi-selection — selectionMode is derived (true when any item selected)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkMove, setShowBulkMove] = useState(false)
  const selectionMode = selectedIds.size > 0

  function toggleSelection(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function exitSelection() { setSelectedIds(new Set()) }

  async function deleteSelected() {
    if (!selectedIds.size) return
    if (!confirm(`${t('bankDeleteSelected')} ${selectedIds.size} video(s)? ${t('phoneDeleteMsg')}`)) return
    const ids = [...selectedIds]
    const toDelete = items.filter(i => ids.includes(i.id))
    let q = scopeQ(supabase.from('content_bank').delete().in('id', ids))
    const { error: err } = await q
    if (err) {
      setError('Deletion failed: ' + err.message)
      return
    }
    deleteStorageObjects(toDelete.flatMap(i => [i.storage_path, i.thumbnail_path]))
    setItems(prev => prev.filter(i => !ids.includes(i.id)))
    exitSelection()
  }

  async function moveSelected(folder: string | null) {
    if (!selectedIds.size) return
    const ids = [...selectedIds]
    await supabase.from('content_bank').update({ folder }).in('id', ids)
    setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, folder: folder as unknown as string } : i))
    setShowBulkMove(false)
    exitSelection()
  }

  // Modals
  const [renameItem, setRenameItem] = useState<ContentItem | null>(null)
  const [moveItem, setMoveItem]     = useState<ContentItem | null>(null)
  const [tagsItem, setTagsItem]     = useState<ContentItem | null>(null)

  const dropRef = useRef<HTMLDivElement>(null)
  const dragCounter = useRef(0)

  useEffect(() => { loadItems() }, [currentOrg?.id, personalMode])

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [ctxMenu])

  async function loadItems() {
    setLoading(true)
    // Fetch all pages — Supabase default page size is 1000, so paginate to get every row.
    const PAGE = 1000
    let allRows: ContentItem[] = []
    let from = 0
    let hasMigrationIssue = false
    while (true) {
      let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false }).range(from, from + PAGE - 1)
      q = scopeQ(q)
      const { data, error: err } = await q
      if (err) { setError('Erreur lors du chargement.'); setLoading(false); return }
      const rows = (data ?? []) as ContentItem[]
      if (rows.length > 0 && !hasMigrationIssue && !('folder' in rows[0])) hasMigrationIssue = true
      allRows = allRows.concat(rows)
      if (rows.length < PAGE) break   // last page
      from += PAGE
    }
    {
      let rows = allRows
      // In org mode, filter out folders the member is not allowed to see
      if (role) rows = rows.filter(i => canAccessBankFolder(role, perms, i.folder ?? null))
      setItems(rows)
      if (hasMigrationIssue) setNeedsMigration(true)
    }
    setLoading(false)
  }

  // Insert a content_bank row pointing at already-uploaded Storage paths.
  // Used by both addFromPath (file picker) and addFromFile (drag-drop).
  async function insertBankRow(opts: { title: string; storagePath: string; thumbnailPath: string | null }) {
    const folder = selectedFolder ?? null
    const baseRow = {
      user_id: user.id, org_id: isPersonal ? null : (currentOrg?.id ?? null), title: opts.title,
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
        user_id: user.id, org_id: isPersonal ? null : (currentOrg?.id ?? null), title: opts.title, file_url: null,
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
      'thumbnail':        '🖼 Generating thumbnail…',
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
        setError('Migration failed: ' + err.message)
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
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
  }
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current += 1
    if (dragCounter.current === 1) setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    dragCounter.current -= 1
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false) }
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    // Process sequentially — concurrent thumbnail generation on N large videos
    // can saturate RAM/CPU and freeze the renderer.
    for (const file of files) await addFromFile(file)
  }

  async function deleteItem(id: string) {
    const item = items.find(i => i.id === id)
    let q = scopeQ(supabase.from('content_bank').delete().eq('id', id))
    const { error: err } = await q
    if (err) {
      setError('Deletion failed: ' + err.message)
    } else {
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
    let q = scopeQ(supabase.from('content_bank').update({ folder: newName }).eq('folder', oldName))
    await q
    setItems(prev => prev.map(i => (i as unknown as {folder:string}).folder === oldName ? { ...i, folder: newName as unknown as string } : i))
    // Update localStorage empty folders
    persistEmptyFolders(emptyFolders.map(f => f === oldName ? newName : f))
    if (selectedFolder === oldName) setSelectedFolder(newName)
  }

  async function deleteFolder(name: string, withVideos: boolean) {
    if (withVideos) {
      const toDelete = items.filter(i => (i as unknown as {folder?: string}).folder === name)
      if (toDelete.length > 0) {
        let dq = scopeQ(supabase.from('content_bank').delete().in('id', toDelete.map(i => i.id)))
        const { error: dErr } = await dq
        if (dErr) { setError('Deletion failed: ' + dErr.message); return }
        deleteStorageObjects(toDelete.flatMap(i => [i.storage_path, i.thumbnail_path]))
        setItems(prev => prev.filter(i => (i as unknown as {folder?: string}).folder !== name))
      }
    } else {
      let qu = scopeQ(supabase.from('content_bank').update({ folder: null }).eq('folder', name))
      await qu
      setItems(prev => prev.map(i => (i as unknown as {folder:string}).folder === name ? { ...i, folder: null as unknown as string } : i))
    }
    persistEmptyFolders(emptyFolders.filter(f => f !== name))
    if (selectedFolder === name) setSelectedFolder(null)
    setFolderModal(null)
  }

  async function mergeFolderTo(fromFolder: string, toFolder: string | null) {
    let qm = scopeQ(supabase.from('content_bank').update({ folder: toFolder }).eq('folder', fromFolder))
    await qm
    setItems(prev => prev.map(i => (i as unknown as {folder?:string}).folder === fromFolder ? { ...i, folder: toFolder as unknown as string } : i))
    persistEmptyFolders(emptyFolders.filter(f => f !== fromFolder))
    if (selectedFolder === fromFolder) setSelectedFolder(toFolder)
    setFolderModal(null)
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

  // View mode state (grid / list)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  return (
    <div
      ref={dropRef}
      className={`h-full flex flex-col overflow-hidden anim-page transition-colors ${dragging ? 'ring-2 ring-inset ring-accent/40' : ''}`}
      style={{ background: '#07070B' }}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* ── Global drag overlay ── */}
      {dragging && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div
            className="flex flex-col items-center gap-4 px-20 py-14 rounded-3xl"
            style={{
              background: 'rgba(7,7,11,0.92)',
              border: '2px dashed #8B5CF6',
              boxShadow: '0 0 60px -10px rgba(139,92,246,0.6)',
              backdropFilter: 'blur(24px)',
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className="text-[15px] font-bold text-white">{t('bankDropFiles')}</p>
            <p className="text-[12px]" style={{ color: '#A1A1AA' }}>{t('bankMediaTypes')}</p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header
        className="flex-shrink-0 px-8 pt-7 pb-5 flex items-center justify-between gap-4"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.12)' }}
      >
        {/* Title + badge */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-[22px] font-black text-white leading-none tracking-tight">{t('bankTitle')}</h1>
            <p className="text-[12px] mt-0.5" style={{ color: '#52525B' }}>
              {t('bankSubtitle')}
            </p>
          </div>
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-bold"
            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA' }}
          >
            {items.length}
          </span>
        </div>

        {/* Search + controls */}
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder={t('bankSearchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="sf-search w-full pl-9 pr-4 py-2 text-[13px]"
            />
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Personal / Org toggle — only when in an org */}
          {currentOrg && (
            <div
              className="flex rounded-lg overflow-hidden"
              style={{ border: '1px solid rgba(139,92,246,0.18)', background: '#0E0E16' }}
            >
              <button
                onClick={() => { setPersonalMode(false); setSelectedFolder(null) }}
                className="px-3 py-1.5 text-[11px] font-semibold transition-colors flex items-center gap-1.5"
                style={!personalMode ? { background: 'rgba(139,92,246,0.25)', color: '#A78BFA' } : { color: '#52525B' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Orga
              </button>
              <button
                onClick={() => { setPersonalMode(true); setSelectedFolder(null) }}
                className="px-3 py-1.5 text-[11px] font-semibold transition-colors flex items-center gap-1.5"
                style={personalMode ? { background: 'rgba(139,92,246,0.25)', color: '#A78BFA' } : { color: '#52525B' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                Perso
              </button>
            </div>
          )}
          {/* View toggle */}
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: '1px solid rgba(139,92,246,0.18)', background: '#0E0E16' }}
          >
            <button
              onClick={() => setViewMode('grid')}
              className="px-2.5 py-1.5 transition-colors"
              style={viewMode === 'grid' ? { background: 'rgba(139,92,246,0.25)', color: '#A78BFA' } : { color: '#52525B' }}
              title={t('bankGridView')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="px-2.5 py-1.5 transition-colors"
              style={viewMode === 'list' ? { background: 'rgba(139,92,246,0.25)', color: '#A78BFA' } : { color: '#52525B' }}
              title={t('bankListView')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>

          <button
            onClick={loadItems}
            className="px-3 py-2 rounded-lg text-[12px] font-medium transition-colors"
            style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.18)', color: '#A1A1AA' }}
            title={t('refresh')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-sf-primary px-4 py-2 rounded-lg text-[13px] font-semibold flex items-center gap-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('add')}
          </button>
        </div>
      </header>

      {/* ── Toolbar (type filters + select-all + count) ── */}
      <div
        className="flex-shrink-0 px-8 py-2.5 flex items-center gap-3"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}
      >
        {/* Select-all checkbox */}
        <button
          onClick={() => setSelectedIds(prev => prev.size === visible.length ? new Set() : new Set(visible.map(i => i.id)))}
          className="flex items-center gap-1.5 text-[12px] font-medium transition-colors px-2 py-1 rounded"
          style={{ color: selectedIds.size === visible.length && visible.length > 0 ? '#A78BFA' : '#52525B' }}
          title={t('bankSelectAll')}
        >
          <div
            className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
            style={selectedIds.size === visible.length && visible.length > 0
              ? { background: '#8B5CF6', border: '1px solid #8B5CF6' }
              : { background: 'transparent', border: '1px solid rgba(139,92,246,0.3)' }}
          >
            {selectedIds.size > 0 && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="2,6 5,9 10,3"/></svg>}
          </div>
          <span className="hidden sm:inline">{t('bankSelectAllLabel')}</span>
        </button>

        <div style={{ width: '1px', height: '16px', background: 'rgba(139,92,246,0.15)' }} />

        {/* Type pills */}
        <div className="flex gap-1">
          {([
            { k: 'all',   l: t('bankTypeAll')   },
            { k: 'video', l: t('bankTypeVideo')  },
            { k: 'photo', l: t('bankTypePhoto')  },
            { k: 'gif',   l: t('bankTypeGif')    },
            { k: 'audio', l: t('bankTypeAudio')  },
          ] as const).map(tf => (
            <button
              key={tf.k}
              onClick={() => setTypeFilter(tf.k)}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
              style={typeFilter === tf.k
                ? { background: 'rgba(139,92,246,0.2)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.4)' }
                : { background: 'transparent', color: '#52525B', border: '1px solid transparent' }}
            >{tf.l}</button>
          ))}
        </div>

        <div className="flex-1" />

        <span className="text-[12px]" style={{ color: '#52525B' }}>
          {visible.length} item{visible.length !== 1 ? 's' : ''}
        </span>
        {adding && (
          <span className="flex items-center gap-1.5 text-[12px]" style={{ color: '#A78BFA' }}>
            <span className="animate-spin inline-block">↻</span> {t('bankUploading')}
          </span>
        )}
      </div>

      {/* ── Body: sidebar + main ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Folder sidebar ── */}
        <aside
          className="w-52 flex-shrink-0 flex flex-col overflow-hidden"
          style={{ borderRight: '1px solid rgba(139,92,246,0.1)' }}
        >
          {/* Sidebar header */}
          <div
            className="px-4 py-3 flex items-center justify-between flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#52525B' }}>{t('bankFolders')}</span>
            <button
              onClick={() => setShowNewFolder(v => !v)}
              className="w-5 h-5 rounded flex items-center justify-center transition-colors"
              style={{ color: '#52525B' }}
              title={t('bankNewFolderTitle')}
              onMouseEnter={e => (e.currentTarget.style.color = '#A78BFA')}
              onMouseLeave={e => (e.currentTarget.style.color = '#52525B')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>

          {/* New folder input */}
          {showNewFolder && (
            <div
              className="px-3 py-2 flex gap-1.5 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}
            >
              <input
                autoFocus
                placeholder={t('bankFolderNamePlaceholder')}
                className="sf-search flex-1 px-2.5 py-1.5 text-[12px]"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createFolder()
                  if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
                }}
              />
              <button
                onClick={createFolder}
                className="px-2 py-1 rounded-md text-[11px] font-semibold"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.35)' }}
              >OK</button>
            </div>
          )}

          {/* Folder list */}
          <div className="flex-1 overflow-y-auto py-1">
            {/* All items */}
            <button
              onClick={() => setSelectedFolder(null)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all group"
              style={selectedFolder === null
                ? { background: 'rgba(139,92,246,0.1)', borderLeft: '2px solid #8B5CF6', paddingLeft: '10px' }
                : { borderLeft: '2px solid transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={selectedFolder === null ? '#A78BFA' : '#52525B'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <span className="text-[13px] font-medium flex-1" style={{ color: selectedFolder === null ? '#FFFFFF' : '#A1A1AA' }}>
                {t('bankAllItems')}
              </span>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}
              >{items.length}</span>
            </button>

            {folders.map(f => (
              <FolderRow
                key={f}
                name={f}
                count={items.filter(i => (i as unknown as {folder?: string}).folder === f).length}
                active={selectedFolder === f}
                onClick={() => setSelectedFolder(f)}
                onRename={(newName) => renameFolder(f, newName)}
                onDelete={() => setFolderModal({ name: f, mode: 'delete' })}
                onMerge={() => setFolderModal({ name: f, mode: 'merge' })}
                onDropItem={itemId => { moveItemSave(itemId, f); setSelectedFolder(f) }}
              />
            ))}
          </div>
        </aside>

        {/* ── Main content area ── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* ── Selection bar (bottom-ish, shown as top banner when active) ── */}
          {selectionMode && (
            <div
              className="flex-shrink-0 px-6 py-2.5 flex items-center gap-3"
              style={{ background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.2)' }}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: '#8B5CF6', boxShadow: '0 0 8px rgba(139,92,246,0.8)' }}
              />
              <span className="text-[13px] font-bold" style={{ color: '#A78BFA' }}>
                {selectedIds.size} {t('bankSelected')}
              </span>
              <button
                onClick={() => setSelectedIds(prev => prev.size === visible.length ? new Set() : new Set(visible.map(i => i.id)))}
                className="text-[12px] px-2.5 py-1 rounded-md font-medium transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#A1A1AA' }}
              >
                {selectedIds.size === visible.length ? t('bankDeselectAll') : t('selectAll')}
              </button>
              <button
                onClick={() => setShowBulkMove(true)}
                className="text-[12px] px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1.5"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.3)' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                {t('bankMoveSelected')} ({selectedIds.size})
              </button>
              <button
                onClick={() => {
                  const sel = items.filter(i => selectedIds.has(i.id))
                  sel.forEach((it, i) => setTimeout(() => downloadItem(it), i * 600))
                }}
                className="text-[12px] px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1.5"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,197,94,0.18)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(34,197,94,0.1)')}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Télécharger ({selectedIds.size})
              </button>
              <button
                onClick={deleteSelected}
                className="text-[12px] px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1.5"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                </svg>
                {t('bankDeleteSelected')} ({selectedIds.size})
              </button>
              <div className="flex-1" />
              <button
                onClick={exitSelection}
                className="text-[12px] transition-colors px-2 py-1 rounded"
                style={{ color: '#52525B' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#A1A1AA')}
                onMouseLeave={e => (e.currentTarget.style.color = '#52525B')}
              >✕ {t('bankCancelSelection')}</button>
            </div>
          )}

          {/* ── Notices ── */}
          {needsMigration && (
            <div
              className="mx-6 mt-4 rounded-xl p-4 flex items-start gap-3 flex-shrink-0"
              style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 mt-0.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: '#FBBF24' }}>Migration requise — colonne "folder" manquante</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#A1A1AA' }}>Colle ce SQL dans Supabase → SQL Editor → Run :</p>
                <code className="text-[11px] font-mono block mt-1" style={{ color: '#A1A1AA' }}>{MIGRATION_SQL.trim()}</code>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(MIGRATION_SQL); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000) }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex-shrink-0 transition-colors"
                style={{ background: 'rgba(251,191,36,0.12)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.28)' }}
              >
                {sqlCopied ? t('bankSqlCopied') : t('copy')}
              </button>
            </div>
          )}

          {error && (
            <div
              className="mx-6 mt-4 px-4 py-3 rounded-xl flex items-center gap-3 flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span className="text-[13px] flex-1" style={{ color: '#F87171' }}>{error}</span>
              <button onClick={() => setError(null)} style={{ color: '#F87171' }} className="hover:opacity-70 transition-opacity">✕</button>
            </div>
          )}

          {uploadStatus && (
            <div
              className="mx-6 mt-4 px-4 py-3 rounded-xl flex items-center gap-3 flex-shrink-0"
              style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)' }}
            >
              <span className="animate-spin" style={{ color: '#A78BFA' }}>↻</span>
              <span className="text-[13px]" style={{ color: '#A78BFA' }}>{uploadStatus}</span>
            </div>
          )}

          {/* ── Scrollable content ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading ? (
              <div className="flex justify-center py-20"><Spinner size="lg" /></div>

            ) : items.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)' }}
                >
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                </div>
                <h2 className="text-[16px] font-bold text-white mb-2">{t('bankEmptyTitle')}</h2>
                <p className="text-[13px] max-w-xs" style={{ color: '#A1A1AA' }}>
                  {t('bankEmptyDesc')}
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="btn-sf-primary mt-5 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
                >
                  {t('bankAddMediaBtn')}
                </button>
              </div>

            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="1.5" strokeLinecap="round" className="mb-3">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p className="text-[14px] font-medium text-white">{t('bankNoResults')}</p>
                <p className="text-[12px] mt-1" style={{ color: '#52525B' }}>{t('bankNoResultsHint')}</p>
              </div>

            ) : viewMode === 'grid' ? (
              /* ── Grid view ── */
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {visible.map(item => (
                  <VideoCard
                    key={item.id}
                    item={item}
                    onContextMenu={openCtx}
                    onPlay={setPlayingItem}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleSelection(item.id)}
                  />
                ))}
              </div>

            ) : (
              /* ── List view ── */
              <div className="sf-card overflow-hidden">
                {/* List header */}
                <div
                  className="grid gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-widest"
                  style={{ gridTemplateColumns: '40px 1fr 80px 100px 32px', color: '#52525B', borderBottom: '1px solid rgba(139,92,246,0.1)' }}
                >
                  <span />
                  <span>{t('bankColName')}</span>
                  <span>{t('bankColDuration')}</span>
                  <span>{t('bankColTags')}</span>
                  <span />
                </div>
                {visible.map((item, idx) => (
                  <div
                    key={item.id}
                    className="grid gap-3 px-4 py-2.5 items-center group cursor-default transition-colors"
                    style={{
                      gridTemplateColumns: '40px 1fr 80px 100px 32px',
                      borderBottom: idx < visible.length - 1 ? '1px solid rgba(139,92,246,0.07)' : 'none',
                      background: selectedIds.has(item.id) ? 'rgba(139,92,246,0.06)' : undefined,
                    }}
                    onMouseEnter={e => { if (!selectedIds.has(item.id)) e.currentTarget.style.background = 'rgba(139,92,246,0.04)' }}
                    onMouseLeave={e => { if (!selectedIds.has(item.id)) e.currentTarget.style.background = 'transparent' }}
                    onContextMenu={e => !selectionMode && openCtx(e, item)}
                  >
                    {/* Thumbnail */}
                    <div
                      className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer relative"
                      style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.15)' }}
                      onClick={() => selectionMode ? toggleSelection(item.id) : (item.file_url || item.storage_path) && setPlayingItem(item)}
                    >
                      <VideoThumbnail filePath={item.file_url} thumbnailPath={item.thumbnail_path} storagePath={item.storage_path} />
                      {/* Checkbox overlay when selected */}
                      {isSelected(item) && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.7)' }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="2,6 5,9 10,3"/></svg>
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-white truncate">{item.title}</p>
                      {item.notes && <p className="text-[11px] truncate mt-0.5" style={{ color: '#52525B' }}>{item.notes}</p>}
                    </div>

                    {/* Duration */}
                    <span className="text-[12px]" style={{ color: '#52525B' }}>
                      {item.duration ? formatDuration(item.duration) : '—'}
                    </span>

                    {/* Tags */}
                    <div className="flex gap-1 overflow-hidden">
                      {item.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>#{tag}</span>
                      ))}
                    </div>

                    {/* Actions */}
                    <button
                      className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}
                      onClick={e => { e.stopPropagation(); openCtx(e, item) }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Premium context menu ── */}
      {ctxMenu && (
        <div
          className="fixed z-[60] rounded-xl py-1.5 min-w-[188px] shadow-2xl"
          style={{
            left: ctxMenu.x,
            top: ctxMenu.y,
            background: '#0E0E16',
            border: '1px solid rgba(139,92,246,0.2)',
            boxShadow: '0 16px 48px -8px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.5)',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {[
            {
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
              label: t('bankCtxRename'),
              action: () => { setRenameItem(ctxMenu.item); setCtxMenu(null) }
            },
            {
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
              label: t('bankCtxMoveTo'),
              action: () => { setMoveItem(ctxMenu.item); setCtxMenu(null) }
            },
            {
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
              label: t('bankCtxEditTags'),
              action: () => { setTagsItem(ctxMenu.item); setCtxMenu(null) }
            },
            {
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
              label: 'Télécharger',
              action: async () => {
                const it = ctxMenu.item
                setCtxMenu(null)
                await downloadItem(it)
              }
            },
            ...(ctxMenu.item.file_url && !ctxMenu.item.storage_path ? [{
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
              label: t('bankCtxUpload'),
              action: () => { reuploadItem(ctxMenu.item); setCtxMenu(null) }
            }] : []),
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="w-full text-left px-3.5 py-2 text-[13px] flex items-center gap-2.5 transition-colors"
              style={{ color: '#A1A1AA' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; e.currentTarget.style.color = '#FFFFFF' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1AA' }}
            >
              <span style={{ color: '#8B5CF6' }}>{icon}</span>
              {label}
            </button>
          ))}
          <div style={{ height: '1px', background: 'rgba(139,92,246,0.12)', margin: '4px 0' }} />
          <button
            onClick={() => deleteItem(ctxMenu.item.id)}
            className="w-full text-left px-3.5 py-2 text-[13px] flex items-center gap-2.5 transition-colors"
            style={{ color: '#F87171' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
            {t('bankCtxDelete')}
          </button>
        </div>
      )}

      {/* ── Video player ── */}
      {playingItem && (
        <VideoPlayerModal item={playingItem} onClose={() => setPlayingItem(null)} />
      )}

      {/* ── Folder action modal ── */}
      {folderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setFolderModal(null)}>
          <div
            className="rounded-2xl p-6 w-80 space-y-4"
            style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.8)' }}
            onClick={e => e.stopPropagation()}
          >
            {folderModal.mode === 'delete' ? (<>
              <div>
                <p className="font-semibold text-white text-[14px]">
                  {t('bankDeleteFolderTitle')} <span style={{ color: '#A78BFA' }}>"{folderModal.name}"</span>
                </p>
                <p className="text-[12px] mt-1" style={{ color: '#A1A1AA' }}>
                  {items.filter(i => (i as unknown as {folder?:string}).folder === folderModal.name).length} {t('bankVideosInFolder')}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => deleteFolder(folderModal.name, false)}
                  className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors"
                  style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.25)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.15)')}
                >
                  {t('bankDeleteFolderKeep')}
                </button>
                <button
                  onClick={() => deleteFolder(folderModal.name, true)}
                  className="w-full py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.25)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.18)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                >
                  {t('bankDeleteFolderAll')}
                </button>
                <button
                  onClick={() => setFolderModal(null)}
                  className="w-full py-2.5 rounded-xl text-[13px] font-medium transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#A1A1AA', border: '1px solid rgba(255,255,255,0.07)' }}
                >{t('cancel')}</button>
              </div>
            </>) : (<>
              <p className="font-semibold text-white text-[14px]">
                {t('bankMoveVideosFrom')} <span style={{ color: '#A78BFA' }}>"{folderModal.name}"</span> {t('bankMoveVideosTo')}
              </p>
              <div className="flex flex-col gap-1 max-h-56 overflow-auto">
                <button
                  onClick={() => mergeFolderTo(folderModal.name, null)}
                  className="text-left px-3 py-2 rounded-lg text-[13px] transition-colors"
                  style={{ color: '#A1A1AA' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1AA' }}
                >
                  {t('bankRootNoFolder')}
                </button>
                {folders.filter(f => f !== folderModal.name).map(f => (
                  <button
                    key={f}
                    onClick={() => mergeFolderTo(folderModal.name, f)}
                    className="text-left px-3 py-2 rounded-lg text-[13px] transition-colors"
                    style={{ color: '#A1A1AA' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1AA' }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setFolderModal(null)}
                className="w-full py-2.5 rounded-xl text-[13px] font-medium transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#A1A1AA', border: '1px solid rgba(255,255,255,0.07)' }}
              >{t('cancel')}</button>
            </>)}
          </div>
        </div>
      )}

      {/* ── Bulk move modal ── */}
      {showBulkMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowBulkMove(false)}>
          <div
            className="rounded-2xl p-6 w-72 space-y-4"
            style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.8)' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold text-white text-[14px]">
              {t('bankMoveSelected')} {selectedIds.size} video{selectedIds.size > 1 ? 's' : ''} {t('bankVideosBulkTo')}
            </p>
            <div className="flex flex-col gap-1 max-h-64 overflow-auto">
              <button
                onClick={() => moveSelected(null)}
                className="text-left px-3 py-2 rounded-lg text-[13px] transition-colors"
                style={{ color: '#A1A1AA' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1AA' }}
              >
                {t('bankRootNoFolder')}
              </button>
              {folders.map(f => (
                <button
                  key={f}
                  onClick={() => moveSelected(f)}
                  className="text-left px-3 py-2 rounded-lg text-[13px] transition-colors"
                  style={{ color: '#A1A1AA' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1AA' }}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowBulkMove(false)}
              className="w-full py-2.5 rounded-xl text-[13px] font-medium"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#A1A1AA', border: '1px solid rgba(255,255,255,0.07)' }}
            >{t('cancel')}</button>
          </div>
        </div>
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
        <RenameModal item={renameItem} onSave={renameItemSave} onClose={() => setRenameItem(null)} />
      )}
      {moveItem && (
        <MoveModal item={moveItem} folders={folders} onSave={moveItemSave} onClose={() => setMoveItem(null)} />
      )}
      {tagsItem && (
        <TagsModal item={tagsItem} onSave={saveTagsSave} onClose={() => setTagsItem(null)} />
      )}
    </div>
  )

  function isSelected(item: ContentItem) { return selectedIds.has(item.id) }
}

// ── Folder row with inline rename ────────────────────────────────────────────
function FolderRow({ name, count, active, onClick, onRename, onDelete, onMerge, onDropItem }: {
  name: string
  count: number
  active: boolean
  onClick: () => void
  onRename: (newName: string) => void
  onDelete: () => void
  onMerge: () => void
  onDropItem: (itemId: string) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(name)
  const [showActions, setShowActions] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <input
          autoFocus
          className="sf-search flex-1 px-2 py-1 text-[12px]"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onRename(val.trim()); setEditing(false) }
            if (e.key === 'Escape') { setVal(name); setEditing(false) }
          }}
        />
        <button
          onClick={() => { onRename(val.trim()); setEditing(false) }}
          className="text-[11px] font-bold px-1.5 py-1 rounded"
          style={{ color: '#A78BFA', background: 'rgba(139,92,246,0.12)' }}
        >✓</button>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all group"
      style={
        dragOver
          ? { background: 'rgba(139,92,246,0.15)', borderLeft: '2px solid #8B5CF6', paddingLeft: '10px' }
          : active
          ? { background: 'rgba(139,92,246,0.08)', borderLeft: '2px solid #8B5CF6', paddingLeft: '10px' }
          : { borderLeft: '2px solid transparent' }
      }
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
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={active || dragOver ? '#A78BFA' : '#52525B'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        {dragOver
          ? <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>
          : <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>
        }
      </svg>
      <span
        className="text-[12px] font-medium flex-1 truncate"
        style={{ color: active ? '#FFFFFF' : '#A1A1AA' }}
      >{name}</span>

      {showActions ? (
        <div className="flex gap-0.5 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setEditing(true) }}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors"
            style={{ color: '#52525B' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#A78BFA')}
            onMouseLeave={e => (e.currentTarget.style.color = '#52525B')}
            title={t('bankFolderRename')}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button
            onClick={e => { e.stopPropagation(); onMerge() }}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors"
            style={{ color: '#52525B' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#A78BFA')}
            onMouseLeave={e => (e.currentTarget.style.color = '#52525B')}
            title={t('bankFolderMergeTo')}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors"
            style={{ color: '#52525B' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F87171')}
            onMouseLeave={e => (e.currentTarget.style.color = '#52525B')}
            title={t('bankFolderDelete')}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      ) : (
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'rgba(139,92,246,0.08)', color: '#52525B' }}
        >{count}</span>
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
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed,    setFailed]    = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [thumbUrl,  setThumbUrl]  = useState<string | null>(null)
  const [videoSrc,  setVideoSrc]  = useState<string | null>(null)
  const [retryKey,  setRetryKey]  = useState(0)

  useEffect(() => {
    let cancelled = false
    setThumbUrl(null); setVideoSrc(null); setFailed(false); setLoading(true)
    if (thumbnailPath) {
      getSignedUrl(thumbnailPath).then(u => {
        if (cancelled) return
        setLoading(false)
        if (u) setThumbUrl(u)
        else setFailed(true)
      })
    } else if (storagePath) {
      getSignedUrl(storagePath).then(u => {
        if (cancelled) return
        setLoading(false)
        if (u) setVideoSrc(u)
        else setFailed(true)
      })
    } else {
      setLoading(false)
    }
    return () => { cancelled = true }
  }, [thumbnailPath, storagePath, retryKey])

  // Retry once on load error (URL may have expired mid-session)
  const handleError = () => {
    if (retryKey === 0) setRetryKey(1)
    else setFailed(true)
  }

  if (failed) return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-surface2 gap-1">
      <span className="text-2xl">⚠️</span>
      <span className="text-[10px] text-text2/50">{t('bankVideoUnableLoad')}</span>
    </div>
  )

  // 1. JPEG thumbnail
  if (thumbnailPath) {
    if (loading || !thumbUrl) return <div className="w-full h-full flex items-center justify-center bg-surface2 text-4xl animate-pulse">🎬</div>
    return (
      <img src={thumbUrl} alt=""
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        onError={handleError} />
    )
  }

  // 2. Cloud asset (image or video)
  if (storagePath) {
    if (loading || !videoSrc) return <div className="w-full h-full flex items-center justify-center bg-surface2 text-4xl animate-pulse">🎬</div>
    if (isImagePath(storagePath)) {
      return (
        <img src={videoSrc} alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={handleError} />
      )
    }
    return (
      <video
        ref={videoRef}
        src={videoSrc}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        muted playsInline preload="metadata"
        onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = 0.5 }}
        onError={handleError}
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
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cloudUrl, setCloudUrl] = useState<string | null>(null)
  const [urlError, setUrlError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (item.storage_path) {
      getSignedUrl(item.storage_path).then(u => {
        if (cancelled) return
        if (u) setCloudUrl(u)
        else setUrlError(true)
      })
    }
    return () => { cancelled = true }
  }, [item.storage_path, retryKey])

  const handleVideoError = () => {
    if (retryKey === 0) { setCloudUrl(null); setRetryKey(1) }
    else setUrlError(true)
  }

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

  const loading = item.storage_path && !cloudUrl && !urlError

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

        {/* Loading / error states */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        )}
        {urlError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/60">
            <span className="text-3xl">⚠️</span>
            <span className="text-sm">{t('bankVideoUnableLoad')}</span>
          </div>
        )}

        {/* Video fills the container */}
        {localUrl && (
          <video
            key={localUrl}
            ref={videoRef}
            src={localUrl}
            controls
            autoPlay
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onError={handleVideoError}
          />
        )}
      </div>
    </div>
  )
}

// ── Video card ───────────────────────────────────────────────────────────────
function VideoCard({ item, onContextMenu, onPlay, selectionMode, isSelected, onToggleSelect }: {
  item: ContentItem
  onContextMenu: (e: React.MouseEvent, item: ContentItem) => void
  onPlay: (item: ContentItem) => void
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
}) {
  const t = useT()
  return (
    <div
      draggable={!selectionMode}
      onDragStart={e => e.dataTransfer.setData('bank-item-id', item.id)}
      className="group cursor-default select-none rounded-xl overflow-hidden transition-all"
      style={{
        background: '#0E0E16',
        border: isSelected ? '1px solid #8B5CF6' : '1px solid rgba(139,92,246,0.12)',
        boxShadow: isSelected ? '0 0 0 2px rgba(139,92,246,0.25)' : undefined,
        transform: undefined,
      }}
      onContextMenu={e => !selectionMode && onContextMenu(e, item)}
    >
      {/* Thumbnail area */}
      <div
        className="relative overflow-hidden cursor-pointer"
        style={{ aspectRatio: '9/16' }}
        onClick={() => selectionMode ? onToggleSelect?.() : (item.file_url || item.storage_path) && onPlay(item)}
      >
        <VideoThumbnail filePath={item.file_url} thumbnailPath={item.thumbnail_path} storagePath={item.storage_path} />

        {/* Gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%, rgba(0,0,0,0.15) 100%)' }}
        />

        {/* Hover scale effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ background: 'rgba(139,92,246,0.06)' }} />

        {/* Checkbox — top-left */}
        <button
          className="absolute top-2 left-2 z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all"
          style={isSelected
            ? { background: '#8B5CF6', border: '1px solid #8B5CF6', opacity: 1 }
            : { background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.3)', opacity: 0 }
          }
          onClick={e => { e.stopPropagation(); onToggleSelect?.() }}
          title={isSelected ? t('bankCardDeselect') : t('bankCardSelect')}
        >
          {isSelected && (
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="2,6 5,9 10,3"/>
            </svg>
          )}
        </button>

        {/* Show checkbox on hover (css approach via group) */}
        {!isSelected && (
          <button
            className="absolute top-2 left-2 z-10 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.35)' }}
            onClick={e => { e.stopPropagation(); onToggleSelect?.() }}
          />
        )}

        {/* Play button on hover */}
        {!selectionMode && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.75)', backdropFilter: 'blur(8px)', boxShadow: '0 0 20px rgba(139,92,246,0.5)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white" style={{ marginLeft: '2px' }}>
                <polygon points="5,3 19,12 5,21"/>
              </svg>
            </div>
          </div>
        )}

        {/* Duration badge — top right */}
        {item.duration && (
          <div
            className="absolute top-2 right-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white pointer-events-none transition-opacity group-hover:opacity-0"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          >
            {formatDuration(item.duration)}
          </div>
        )}

        {/* Menu button — top right on hover */}
        {!selectionMode && (
          <button
            className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
            style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', backdropFilter: 'blur(4px)' }}
            onClick={e => { e.stopPropagation(); onContextMenu(e, item) }}
            title={t('bankCardOptions')}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.65)')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
        )}

        {/* Used count */}
        {item.used_count > 0 && (
          <div
            className="absolute bottom-8 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold pointer-events-none"
            style={{ background: 'rgba(139,92,246,0.85)', color: '#fff' }}
          >
            {item.used_count}×
          </div>
        )}

        {/* Title at bottom */}
        <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 pointer-events-none">
          <p className="text-[11px] font-semibold text-white truncate leading-tight">{item.title}</p>
        </div>
      </div>

      {/* Tags row */}
      {item.tags.length > 0 && (
        <div className="px-2.5 py-2 flex flex-wrap gap-1" style={{ borderTop: '1px solid rgba(139,92,246,0.08)' }}>
          {item.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}
            >#{tag}</span>
          ))}
          {item.tags.length > 3 && (
            <span className="text-[9px]" style={{ color: '#52525B' }}>+{item.tags.length - 3}</span>
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
  onSelect: (paths: string[], titles?: string[]) => void
  onClose: () => void
  // 'signed-url': just create a signed URL (fast, no download) — for MassPosting
  // 'full': download to local path/blob URL — for Remix/FFmpeg (default)
  resolveMode?: 'full' | 'signed-url'
}

export function BankPicker({ user, mode, onSelect, onClose, resolveMode = 'full' }: BankPickerProps) {
  const t = useT()
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

  async function resolvePaths(its: ContentItem[]): Promise<string[]> {
    const out: string[] = []
    for (let i = 0; i < its.length; i++) {
      const it = its[i]
      setResolving(`${i + 1}/${its.length} — ${it.title}`)
      try {
        if (resolveMode === 'signed-url') {
          // Fast path: just create a signed URL — no full download needed
          const { getSignedUrl } = await import('@/lib/storage')
          const url = await getSignedUrl(it.storage_path ?? it.file_url)
          if (url) out.push(url)
          else if (it.file_url) out.push(it.file_url)
        } else {
          const { resolveContentToLocalPath } = await import('@/lib/storage')
          out.push(await resolveContentToLocalPath(it))
        }
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
      if (paths.length > 0) onSelect(paths, [item.title])
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
    onSelect(paths, its.map(i => i.title))
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
            <h2 className="text-sm font-semibold text-text">{t('bankTitle')}</h2>
            <span className="text-xs text-text2">
              {mode === 'multi' ? t('bankPickerMultiple') : t('bankPickerSingle')}
            </span>
          </div>
          <div className="flex-1" />
          <input
            type="text"
            placeholder={t('bankPickerSearch')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-44 bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder:text-text2 focus:border-accent focus:outline-none"
          />
          {mode === 'multi' && visible.length > 0 && (
            <button
              onClick={() => {
                setSelected(prev => {
                  const allSelected = visible.every(v => prev.has(v.id))
                  const next = new Set(prev)
                  if (allSelected) visible.forEach(v => next.delete(v.id))
                  else             visible.forEach(v => { if (v.file_url || v.storage_path) next.add(v.id) })
                  return next
                })
              }}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text2 hover:text-text transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              title={selectedFolder ? `${t('selectAll')} "${selectedFolder}"` : t('selectAll')}
            >
              {visible.every(v => selected.has(v.id)) ? t('bankPickerDeselect') : t('bankPickerSelectAll')}
            </button>
          )}
          {mode === 'multi' && selected.size > 0 && (
            <Button size="sm" onClick={confirm} disabled={!!resolving}>
              {resolving ? t('bankPickerDownloading') : `${t('confirm')} (${selected.size})`}
            </Button>
          )}
          <button onClick={onClose} className="text-text2 hover:text-text transition-colors text-xl leading-none">✕</button>
        </div>
        {resolving && (
          <div className="px-5 py-2 bg-accent/10 border-b border-accent/30 text-accent text-xs flex items-center gap-2">
            <span className="animate-spin">↻</span><span>📥 {t('bankPickerDownloadingCloud')}: {resolving}</span>
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
              <span className="text-xs text-text flex-1">{t('bankAllItems')}</span>
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
                <p className="text-sm">{t('bankPickerNoVideo')}</p>
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
