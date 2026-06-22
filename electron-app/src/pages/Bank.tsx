import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { createPortal } from 'react-dom'
import { zipSync } from 'fflate'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { useT, useLang } from '@/lib/i18n'
import { useOrg } from '@/lib/orgContext'
import { canAccessBankFolder } from '@/lib/permissions'
import { uploadVideoFromPath, uploadVideoFromBlob, deleteStorageObjects, type UploadScope } from '@/lib/storage'
import { logActivity } from '@/lib/activityLog'
import { Button }  from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { DriveConnectionsModal } from '@/components/DriveConnections'

interface BankProps { user: User }

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
const IconFolder       = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></SfIcon>
const IconFolderOpen   = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M6 14l1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6A2 2 0 0 1 18.45 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></SfIcon>
const IconClapperboard = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></SfIcon>
const IconImage        = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></SfIcon>
const IconAlertTriangle= (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></SfIcon>
const IconLibrary      = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></SfIcon>
const IconSearch       = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></SfIcon>
const IconGrid         = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></SfIcon>
const IconList         = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></SfIcon>
const IconPlus         = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></SfIcon>
const IconRefresh      = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></SfIcon>
const IconTrash        = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></SfIcon>
const IconDownload     = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></SfIcon>
const IconMove         = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></SfIcon>
const IconPencil       = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></SfIcon>
const IconTag          = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></SfIcon>
const IconUpload       = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></SfIcon>
const IconUsers        = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></SfIcon>
const IconUser         = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></SfIcon>
const IconPlay         = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p} fill="white" stroke="none"><polygon points="5,3 19,12 5,21"/></SfIcon>
const IconMoreVert     = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p} fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></SfIcon>
const IconDotsVertical = IconMoreVert

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
    <div className="sf-modal-bg" onClick={onClose}>
      <div className="sf-modal w-80 anim-scale-in" onClick={e => e.stopPropagation()}>
        <div className="sf-modal-header">
          <h3 className="sf-modal-title">{t('bankRenameVideo')}</h3>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer" aria-label={t('cancel')}>
            <IconX size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <input
            autoFocus
            className="sf-input w-full"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onSave(item.id, val.trim()); onClose() } if (e.key === 'Escape') onClose() }}
          />
          <div className="flex gap-2 justify-end">
            <button className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer" onClick={onClose}>{t('cancel')}</button>
            <button className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer" onClick={() => { onSave(item.id, val.trim()); onClose() }} disabled={!val.trim()}>{t('save')}</button>
          </div>
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
    <div className="sf-modal-bg" onClick={onClose}>
      <div className="sf-modal w-72 anim-scale-in" onClick={e => e.stopPropagation()}>
        <div className="sf-modal-header">
          <h3 className="sf-modal-title">{t('bankMoveTo')}</h3>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer" aria-label={t('cancel')}>
            <IconX size={15} />
          </button>
        </div>
        <div className="p-3 space-y-1 max-h-72 overflow-y-auto">
          <button
            onClick={() => { onSave(item.id, null); onClose() }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${!item.folder ? 'bg-accent/10 text-accent' : 'hover:bg-surface2 text-text'}`}
          >
            {t('bankAllNoFolder')}
          </button>
          {folders.map(f => (
            <button
              key={f}
              onClick={() => { onSave(item.id, f); onClose() }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 cursor-pointer ${item.folder === f ? 'bg-accent/10 text-accent' : 'hover:bg-surface2 text-text'}`}
            >
              <IconFolder size={14} className="flex-shrink-0" /> {f}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-border">
          <button className="sf-btn sf-btn-secondary w-full cursor-pointer" onClick={onClose}>{t('cancel')}</button>
        </div>
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
    <div className="sf-modal-bg" onClick={onClose}>
      <div className="sf-modal w-80 anim-scale-in" onClick={e => e.stopPropagation()}>
        <div className="sf-modal-header">
          <h3 className="sf-modal-title">{t('bankTagsTitle')}</h3>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer" aria-label={t('cancel')}>
            <IconX size={15} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <input
            autoFocus
            placeholder={t('bankTagsPlaceholder')}
            className="sf-input w-full"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          />
          <p className="text-[11px] text-text3">{t('bankTagsSeparate')}</p>
          <div className="flex gap-2 justify-end">
            <button className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer" onClick={onClose}>{t('cancel')}</button>
            <button className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer" onClick={() => {
              const tags = val.split(',').map(tag => tag.trim()).filter(Boolean)
              onSave(item.id, tags); onClose()
            }}>{t('save')}</button>
          </div>
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
    <div className="sf-modal-bg" onClick={onClose}>
      <div className="sf-modal w-96 anim-scale-in" onClick={e => e.stopPropagation()}>
        <div className="sf-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366F1' }}>
              <IconUpload size={16} />
            </div>
            <h3 className="sf-modal-title">{t('bankAddMedia')}</h3>
          </div>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer" aria-label={t('cancel')}>
            <IconX size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drag-drop zone — dashed border upload area */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 py-10 transition-all cursor-default"
            style={{
              borderColor: dragOver ? 'rgba(99,102,241,0.7)' : 'rgba(99,102,241,0.3)',
              background: dragOver ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.02)',
            }}
          >
            <span className={dragOver ? 'text-accent' : 'text-text3'}>
              {dragOver ? <IconFolderOpen size={44} /> : <IconClapperboard size={44} />}
            </span>
            <div className="text-center">
              <p className="text-sm font-semibold text-text">{t('bankDragFiles')}</p>
              <p className="text-xs text-text2 mt-0.5">{t('bankMediaTypes')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text3">{t('bankOr')}</span>
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
            className="sf-btn sf-btn-primary w-full cursor-pointer"
          >
            <IconPlus size={14} />
            {t('bankChoosePC')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Bank({ user }: BankProps) {
  const t = useT()
  const toast = useToast()
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
  const [showDriveModal, setShowDriveModal] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [newFolderName, setNewFolderName]   = useState('')
  const [showNewFolder, setShowNewFolder]   = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [sqlCopied, setSqlCopied]           = useState(false)
  // Type filter (Python: Tous/Vidéo/Photo/GIF/Audio)
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'photo' | 'gif' | 'audio'>('all')
  // Sort order
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'name' | 'duration'>('date-desc')
  // Delete confirmations (single item / bulk selection)
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<ContentItem | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  // Bulk ZIP download progress
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null)
  // Empty folders — now stored in Supabase (sentinel rows) so all org members see them
  const [emptyFolders, setEmptyFolders] = useState<string[]>([])
  // Drive-sourced folders — show a Drive icon in the sidebar
  const [driveFolders, setDriveFolders] = useState<Set<string>>(new Set())

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

  async function performDeleteSelected() {
    if (!selectedIds.size) return
    setDeleteBusy(true)
    const ids = [...selectedIds]
    const toDelete = items.filter(i => ids.includes(i.id))
    let q = scopeQ(supabase.from('content_bank').delete().in('id', ids))
    const { error: err } = await q
    setDeleteBusy(false)
    setConfirmBulkDelete(false)
    if (err) {
      toast.show({ title: 'Suppression échouée', body: err.message, kind: 'error' })
      return
    }
    deleteStorageObjects(toDelete.flatMap(i => [i.storage_path, i.thumbnail_path]))
    setItems(prev => prev.filter(i => !ids.includes(i.id)))
    exitSelection()
    toast.show({ title: `${ids.length} média${ids.length > 1 ? 's' : ''} supprimé${ids.length > 1 ? 's' : ''}`, kind: 'ok' })
  }

  async function moveSelected(folder: string | null) {
    if (!selectedIds.size) return
    const ids = [...selectedIds]
    const { error: err } = await supabase.from('content_bank').update({ folder }).in('id', ids)
    if (err) {
      toast.show({ title: 'Déplacement échoué', body: err.message, kind: 'error' })
      return
    }
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
      if (rows.length < PAGE) break
      from += PAGE
    }
    {
      // Sentinel rows : __sf_folder__ (normal) ou __sf_drive_folder__ (Drive).
      const isSentinel = (i: ContentItem) =>
        (i.notes === '__sf_folder__' || i.notes === '__sf_drive_folder__') && !i.storage_path && !i.file_url
      const sentinelFolders = allRows.filter(isSentinel).map(i => i.title).filter(Boolean)

      // Dossiers Drive = sentinel Drive + items avec source 'drive'
      const driveSet = new Set<string>()
      allRows.filter(isSentinel).filter(i => i.notes === '__sf_drive_folder__').forEach(i => { if (i.folder) driveSet.add(i.folder) })
      allRows.filter(i => (i as any).source === 'drive' && i.folder).forEach(i => { driveSet.add(i.folder!) })
      setDriveFolders(driveSet)

      let rows = allRows.filter(i => !isSentinel(i))

      // Migrate legacy localStorage folders to Supabase (one-time, per org)
      const lsKey = `bank-empty-folders-${user.id}`
      const lsFolders: string[] = (() => { try { return JSON.parse(localStorage.getItem(lsKey) ?? '[]') } catch { return [] } })()
      const existingFolderNames = new Set([
        ...rows.map(i => (i as any).folder).filter(Boolean),
        ...sentinelFolders,
      ])
      const toMigrate = lsFolders.filter(f => !existingFolderNames.has(f))
      if (toMigrate.length > 0) {
        await Promise.all(toMigrate.map(name =>
          supabase.from('content_bank').insert({
            user_id: user.id, org_id: isPersonal ? null : (currentOrg?.id ?? null),
            title: name, file_url: null, storage_path: null, thumbnail_path: null,
            folder: name, duration: null, tags: [], notes: '__sf_folder__',
          })
        ))
        localStorage.removeItem(lsKey)
      } else if (lsFolders.length > 0) {
        localStorage.removeItem(lsKey)
      }

      // In org mode, filter out folders the member is not allowed to see
      if (role) rows = rows.filter(i => canAccessBankFolder(role, perms, i.folder ?? null))
      setItems(rows)
      setEmptyFolders(sentinelFolders)
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

    // Fallback if the storage_path columns or folder column don’t exist yet
    if (res.error && /storage_path|thumbnail_path|folder/i.test(res.error.message) && /column|cache/i.test(res.error.message)) {
      setNeedsMigration(true)
      res = await supabase.from('content_bank').insert({
        user_id: user.id, org_id: isPersonal ? null : (currentOrg?.id ?? null), title: opts.title, file_url: null,
        duration: null, tags: [], notes: '',
      }).select().single()
    }

    if (res.error) {
      setError("Erreur lors de l’ajout : " + res.error.message)
      await deleteStorageObjects([opts.storagePath, opts.thumbnailPath])
      return
    }
    if (res.data) setItems(prev => [res.data, ...prev])
  }

  function uploadProgressLabels(phase: string): string {
    const labels: Record<string, string> = {
      'reading':          'Lecture du fichier…',
      'uploading-video':  'Envoi du fichier…',
      'thumbnail':        'Génération de la miniature…',
      'uploading-thumb':  'Envoi de la miniature…',
    }
    return labels[phase] ?? ''
  }

  // Upload via Electron file picker (we only have an absolute path → must read via IPC).
  async function addFromPath(filePath: string) {
    const title = nameWithoutExt(filePath)
    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }

    setAdding(true); setUploadStatus(`Lecture de ${basename(filePath)}…`)
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

    setAdding(true); setUploadStatus(file.name)
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
    setUploadStatus(`Migration de ${item.title}…`)
    try {
      const { storagePath, thumbnailPath } = await uploadVideoFromPath(item.file_url, scope, phase => {
        const labels: Record<string, string> = {
          'reading':          'Lecture du fichier local…',
          'uploading-video':  'Envoi du fichier…',
          'thumbnail':        'Génération de la miniature…',
          'uploading-thumb':  'Envoi de la miniature…',
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
    const api = window.electronAPI
    if (!api) return
    // Use pickAnyFile to support both videos and images; fall back to pickVideoFile
    const picker = api.pickAnyFile ?? api.pickVideoFile
    if (!picker) return
    const p = await (api.pickAnyFile
      ? api.pickAnyFile({ filters: [{ name: 'Médias', extensions: ['mp4','mov','avi','mkv','webm','m4v','jpg','jpeg','png','webp','gif','bmp','heic'] }] })
      : api.pickVideoFile())
    if (!p) return
    // blob: URL from web mode — get the File object from in-memory store
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

  async function performDeleteItem(item: ContentItem) {
    setDeleteBusy(true)
    let q = scopeQ(supabase.from('content_bank').delete().eq('id', item.id))
    const { error: err } = await q
    setDeleteBusy(false)
    setConfirmDeleteItem(null)
    if (err) {
      toast.show({ title: 'Suppression échouée', body: err.message, kind: 'error' })
      return
    }
    setItems(prev => prev.filter(i => i.id !== item.id))
    deleteStorageObjects([item.storage_path, item.thumbnail_path])
    logActivity({ orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '', action: 'bank_delete', details: { title: item.title, folder: item.folder } })
    toast.show({ title: 'Média supprimé', kind: 'ok' })
  }

  async function renameItemSave(id: string, newTitle: string) {
    if (!newTitle) return
    const { error: err } = await supabase.from('content_bank').update({ title: newTitle }).eq('id', id)
    if (err) {
      toast.show({ title: 'Renommage échoué', body: err.message, kind: 'error' })
      return
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, title: newTitle } : i))
  }

  async function moveItemSave(id: string, folder: string | null) {
    const { error: err } = await supabase.from('content_bank').update({ folder }).eq('id', id)
    if (err) {
      toast.show({ title: 'Déplacement échoué', body: err.message, kind: 'error' })
      return
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, folder: folder as unknown as string } : i))
  }

  async function saveTagsSave(id: string, newTags: string[]) {
    const { error: err } = await supabase.from('content_bank').update({ tags: newTags }).eq('id', id)
    if (err) {
      toast.show({ title: 'Mise à jour des tags échouée', body: err.message, kind: 'error' })
      return
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, tags: newTags } : i))
  }

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    if (!emptyFolders.includes(name)) {
      // Store in Supabase so all org members can see the empty folder
      await supabase.from('content_bank').insert({
        user_id: user.id, org_id: isPersonal ? null : (currentOrg?.id ?? null),
        title: name, file_url: null, storage_path: null, thumbnail_path: null,
        folder: name, duration: null, tags: [], notes: '__sf_folder__',
      })
      setEmptyFolders(prev => [...prev, name])
    }
    setNewFolderName('')
    setShowNewFolder(false)
    setSelectedFolder(name)
  }

  async function renameFolder(oldName: string, newName: string) {
    if (!newName || newName === oldName) return
    // Rename all items in the folder
    await scopeQ(supabase.from('content_bank').update({ folder: newName }).eq('folder', oldName))
    // Also rename the sentinel row (title = folder name, folder = folder name)
    await scopeQ(supabase.from('content_bank')
      .update({ title: newName, folder: newName })
      .eq('notes', '__sf_folder__').eq('folder', oldName))
    setItems(prev => prev.map(i => (i as unknown as {folder:string}).folder === oldName ? { ...i, folder: newName as unknown as string } : i))
    setEmptyFolders(prev => prev.map(f => f === oldName ? newName : f))
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
    // Delete the sentinel row for this folder from Supabase
    await scopeQ(supabase.from('content_bank').delete().eq('notes', '__sf_folder__').eq('folder', name))
    setEmptyFolders(prev => prev.filter(f => f !== name))
    if (selectedFolder === name) setSelectedFolder(null)
    setFolderModal(null)
  }

  async function mergeFolderTo(fromFolder: string, toFolder: string | null) {
    await scopeQ(supabase.from('content_bank').update({ folder: toFolder }).eq('folder', fromFolder))
    // Delete sentinel of the merged folder
    await scopeQ(supabase.from('content_bank').delete().eq('notes', '__sf_folder__').eq('folder', fromFolder))
    setItems(prev => prev.map(i => (i as unknown as {folder?:string}).folder === fromFolder ? { ...i, folder: toFolder as unknown as string } : i))
    setEmptyFolders(prev => prev.filter(f => f !== fromFolder))
    if (selectedFolder === fromFolder) setSelectedFolder(toFolder)
    setFolderModal(null)
  }

  // Derived data — folders come from items + empty (newly-created) folders
  const folders = useMemo(() => [...new Set([
    ...items.map(i => (i as unknown as {folder?: string | null}).folder).filter((f): f is string => Boolean(f)),
    ...emptyFolders,
  ])].sort(), [items, emptyFolders])

  function inferType(filePath: string | null): 'video' | 'photo' | 'gif' | 'audio' {
    if (!filePath) return 'video'
    const ext = filePath.toLowerCase().split('.').pop() ?? ''
    if (['gif'].includes(ext)) return 'gif'
    if (['jpg','jpeg','png','webp','heic','bmp'].includes(ext)) return 'photo'
    if (['mp3','wav','m4a','aac','flac','ogg'].includes(ext)) return 'audio'
    return 'video'
  }

  const visible = useMemo(() => items.filter(item => {
    const folder = (item as unknown as {folder?: string | null}).folder
    const folderMatch = selectedFolder === null ? true : folder === selectedFolder
    if (!folderMatch) return false
    if (typeFilter !== 'all' && inferType(item.storage_path ?? item.file_url) !== typeFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return item.title.toLowerCase().includes(q) || item.notes.toLowerCase().includes(q) || item.tags.some(t => t.toLowerCase().includes(q))
  }), [items, selectedFolder, typeFilter, search])

  // Pagination — reset when filters/folder change
  const PAGE_SIZE = 60
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [selectedFolder, typeFilter, search])
  const visiblePage = useMemo(() => visible.slice(0, visibleCount), [visible, visibleCount])

  const openCtx = useCallback((e: React.MouseEvent, item: ContentItem) => {
    e.preventDefault()
    setCtxMenu({ item, x: e.clientX, y: e.clientY })
  }, [])

  // View mode state (grid / list)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  return (
    <div
      ref={dropRef}
      className={`h-full flex flex-col overflow-y-auto overflow-x-hidden anim-page transition-colors ${dragging ? 'ring-2 ring-inset ring-accent/40' : ''}`}
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
              border: '2px dashed rgba(99,102,241,0.6)',
              boxShadow: '0 0 60px -10px rgba(99,102,241,0.4)',
              backdropFilter: 'blur(24px)',
            }}
          >
            <div className="text-accent">
              <IconUpload size={48} />
            </div>
            <p className="text-[15px] font-bold text-text">{t('bankDropFiles')}</p>
            <p className="text-[12px] text-text3">{t('bankMediaTypes')}</p>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <header className="flex-shrink-0 px-8 pt-6 pb-5 flex items-center justify-between gap-4" style={{ borderBottom: '1px solid rgba(99,102,241,0.1)' }}>
        {/* Icon + title */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="sf-anim-scale-spring"
            style={{
              width: 46, height: 46, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.28)',
              color: '#6366F1',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/>
            </svg>
          </div>
          <div className="min-w-0 sf-anim-slide-up sf-d50">
            <div className="flex items-center gap-2.5">
              <h1 className="sf-page-title" style={{ fontSize: 22, letterSpacing: '-0.03em' }}>{t('bankTitle')}</h1>
              <span className="sf-badge sf-badge-accent text-[11px]">{items.length}</span>
            </div>
            <p className="sf-page-sub">{t('bankSubtitle')}</p>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-shrink-0 sf-anim-slide-up sf-d100">
          {/* Personal / Org toggle — only when in an org */}
          {currentOrg && (
            <div className="sf-tabs">
              <button
                onClick={() => { setPersonalMode(false); setSelectedFolder(null) }}
                className={`sf-tab cursor-pointer flex items-center gap-1.5 ${!personalMode ? 'active' : ''}`}
              >
                <IconUsers size={11} />
                Orga
              </button>
              <button
                onClick={() => { setPersonalMode(true); setSelectedFolder(null) }}
                className={`sf-tab cursor-pointer flex items-center gap-1.5 ${personalMode ? 'active' : ''}`}
              >
                <IconUser size={11} />
                Perso
              </button>
            </div>
          )}

          {/* View toggle */}
          <div className="sf-tabs">
            <button
              onClick={() => setViewMode('grid')}
              className={`sf-tab sf-press cursor-pointer ${viewMode === 'grid' ? 'active' : ''}`}
              title={t('bankGridView')}
            >
              <IconGrid size={13} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`sf-tab sf-press cursor-pointer ${viewMode === 'list' ? 'active' : ''}`}
              title={t('bankListView')}
            >
              <IconList size={13} />
            </button>
          </div>

          <button
            onClick={loadItems}
            className="sf-btn sf-btn-ghost sf-btn-icon cursor-pointer"
            title={t('refresh')}
          >
            <IconRefresh size={14} />
          </button>

          <button
            onClick={() => setShowDriveModal(true)}
            className="sf-btn sf-btn-ghost cursor-pointer"
            title={t('bankDriveTitle')}
          >
            <SfIcon size={14}><path d="M7.71 3.5 1.15 15l3.42 6 6.56-11.5zM22.85 15 16.29 3.5H9.43L16 15zM5.43 16.5 2 22.5h13.14l3.43-6z"/></SfIcon>
            {t('bankDrive')}
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="sf-btn sf-btn-primary cursor-pointer"
          >
            <IconPlus size={13} />
            {t('add')}
          </button>
        </div>
      </header>

      {/* ── Toolbar ── */}
      <div className="sf-toolbar px-8 sf-anim-slide-up sf-d150">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-text3">
            <IconSearch size={13} />
          </span>
          <input
            type="text"
            placeholder={t('bankSearchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="sf-input w-full pl-9 pr-4"
          />
        </div>

        <div className="w-px h-5 bg-border flex-shrink-0" />

        {/* Select-all */}
        <button
          onClick={() => setSelectedIds(prev => prev.size === visible.length ? new Set() : new Set(visible.map(i => i.id)))}
          className="flex items-center gap-1.5 text-[12px] font-medium transition-colors px-2 py-1 rounded cursor-pointer"
          style={{ color: selectedIds.size === visible.length && visible.length > 0 ? 'var(--accent-lt)' : 'var(--text-3)' }}
          title={t('bankSelectAll')}
        >
          <div
            className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
            style={selectedIds.size === visible.length && visible.length > 0
              ? { background: 'var(--accent)', border: '1px solid var(--accent)' }
              : { background: 'transparent', border: '1px solid var(--border-md)' }}
          >
            {selectedIds.size > 0 && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="2,6 5,9 10,3"/></svg>}
          </div>
          <span className="hidden sm:inline">{t('bankSelectAllLabel')}</span>
        </button>

        <div className="w-px h-5 bg-border flex-shrink-0" />

        {/* Sort/filter bar — sf-btn-ghost tab pills */}
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
              className={`sf-btn sf-btn-ghost sf-btn-sm cursor-pointer px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                typeFilter === tf.k
                  ? 'text-accent'
                  : 'text-text3 hover:text-text2'
              }`}
              style={typeFilter === tf.k ? {
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.35)',
              } : {}}
            >{tf.l}</button>
          ))}
        </div>

        <div className="flex-1" />

        <span className="text-[12px] text-text3 flex-shrink-0">
          {visible.length} item{visible.length !== 1 ? 's' : ''}
        </span>

        {adding && (
          <div className="flex items-center gap-2 text-[12px] text-accent flex-shrink-0">
            <span className="sf-spinner" />
            {t('bankUploading')}
          </div>
        )}
      </div>

      {/* ── Body: sidebar + main (page scrolls, sidebar stays sticky) ── */}
      <div className="flex flex-1">

        {/* ── Folder sidebar — sticky while the page scrolls ── */}
        <aside
          className="w-52 flex-shrink-0 flex flex-col overflow-hidden"
          style={{ borderRight: '1px solid var(--border)', position: 'sticky', top: 0, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 54px)' }}
        >
          {/* Sidebar header */}
          <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-text3">{t('bankFolders')}</span>
            <button
              onClick={() => setShowNewFolder(v => !v)}
              className="w-5 h-5 rounded flex items-center justify-center transition-colors text-text3 hover:text-accent cursor-pointer sf-press"
              title={t('bankNewFolderTitle')}
            >
              <IconPlus size={12} />
            </button>
          </div>

          {/* New folder input */}
          {showNewFolder && (
            <div className="px-3 py-2 flex gap-1.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <input
                autoFocus
                placeholder={t('bankFolderNamePlaceholder')}
                className="sf-input flex-1 text-[12px]"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createFolder()
                  if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
                }}
              />
              <button
                onClick={createFolder}
                className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer"
              >OK</button>
            </div>
          )}

          {/* Folder list */}
          <div className="flex-1 overflow-y-auto py-1 anim-stagger">
            {/* All items */}
            <button
              onClick={() => setSelectedFolder(null)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all group cursor-pointer"
              style={selectedFolder === null
                ? { background: 'rgba(99,102,241,0.1)', borderLeft: '2px solid var(--accent)', paddingLeft: '10px' }
                : { borderLeft: '2px solid transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={selectedFolder === null ? 'var(--accent-lt)' : 'var(--text-3)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <span className="text-[13px] font-medium flex-1" style={{ color: selectedFolder === null ? 'var(--text-1)' : 'var(--text-2)' }}>
                {t('bankAllItems')}
              </span>
              <span className="sf-badge sf-badge-accent text-[10px] flex-shrink-0">{items.length}</span>
            </button>

            {folders.map(f => (
              <FolderRow
                key={f}
                name={f}
                count={items.filter(i => (i as unknown as {folder?: string}).folder === f).length}
                active={selectedFolder === f}
                isDrive={driveFolders.has(f)}
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

          {/* ── Selection toolbar (shown when items are selected) ── */}
          {selectionMode && (
            <div
              className="flex-shrink-0 px-6 py-2.5 flex items-center gap-2.5"
              style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid rgba(99,102,241,0.2)' }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0 bg-accent" style={{ boxShadow: '0 0 8px rgba(99,102,241,0.8)' }} />
              <span className="text-[13px] font-bold text-accent">{selectedIds.size} {t('bankSelected')}</span>

              <button
                onClick={() => setSelectedIds(prev => prev.size === visible.length ? new Set() : new Set(visible.map(i => i.id)))}
                className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
              >
                {selectedIds.size === visible.length ? t('bankDeselectAll') : t('selectAll')}
              </button>

              <button
                onClick={() => setShowBulkMove(true)}
                className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer flex items-center gap-1.5"
              >
                <IconMove size={11} />
                {t('bankMoveSelected')} ({selectedIds.size})
              </button>

              <button
                onClick={async () => {
                  if (zipProgress) return
                  const sel = items.filter(i => selectedIds.has(i.id))
                  if (!sel.length) return
                  if (sel.length <= 5) {
                    sel.forEach((it, i) => setTimeout(() => downloadItem(it), i * 600))
                  } else {
                    // More than 5 → bundle into a ZIP.
                    // Pool séquentiel de 3 téléchargements — évite de tout charger en RAM d'un coup.
                    const files: Record<string, Uint8Array> = {}
                    const seen = new Set<string>()
                    let failed = 0
                    let nextIdx = 0
                    let done = 0
                    setZipProgress({ done: 0, total: sel.length })
                    const worker = async () => {
                      while (nextIdx < sel.length) {
                        const it = sel[nextIdx++]
                        let buf: ArrayBuffer | null = null
                        if (it.storage_path) {
                          const { data } = await supabase.storage.from(DOWNLOAD_BUCKET).download(it.storage_path)
                          if (data) buf = await data.arrayBuffer()
                        } else if (it.file_url) {
                          try { buf = await (await fetch(it.file_url)).arrayBuffer() } catch (_) { /* compté ci-dessous */ }
                        }
                        done++
                        setZipProgress({ done, total: sel.length })
                        if (!buf) { failed++; continue }
                        let name = getDownloadName(it)
                        // Deduplicate filenames
                        if (seen.has(name)) {
                          const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '.mp4'
                          const base = name.slice(0, name.lastIndexOf('.') || name.length)
                          let n = 2
                          while (seen.has(`${base}_${n}${ext}`)) n++
                          name = `${base}_${n}${ext}`
                        }
                        seen.add(name)
                        files[name] = new Uint8Array(buf)
                      }
                    }
                    try {
                      await Promise.all([worker(), worker(), worker()])
                    } finally {
                      setZipProgress(null)
                    }
                    if (!Object.keys(files).length) {
                      toast.show({ title: 'Téléchargement impossible', body: 'Aucune vidéo n\u2019a pu être récupérée.', kind: 'error' })
                      return
                    }
                    if (failed > 0) toast.show({ title: 'ZIP incomplet', body: `${failed} vidéo${failed > 1 ? 's' : ''} n\u2019a pas pu être incluse dans le ZIP.`, kind: 'warn' })
                    const zipped = zipSync(files, { level: 0 })
                    const blob = new Blob([zipped], { type: 'application/zip' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = `banque_${Date.now()}.zip`
                    document.body.appendChild(a); a.click()
                    document.body.removeChild(a)
                    setTimeout(() => URL.revokeObjectURL(url), 15000)
                  }
                }}
                className="sf-btn sf-btn-sm cursor-pointer flex items-center gap-1.5"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)', opacity: zipProgress ? 0.7 : 1 }}
                disabled={!!zipProgress}
              >
                {zipProgress ? <span className="sf-spinner" /> : <IconDownload size={11} />}
                {zipProgress
                  ? `ZIP ${zipProgress.done}/${zipProgress.total}…`
                  : selectedIds.size > 5 ? `ZIP (${selectedIds.size})` : `Télécharger (${selectedIds.size})`}
              </button>

              <button
                onClick={() => setConfirmBulkDelete(true)}
                className="sf-btn sf-btn-danger sf-btn-sm cursor-pointer flex items-center gap-1.5"
              >
                <IconTrash size={11} />
                {t('bankDeleteSelected')} ({selectedIds.size})
              </button>

              <div className="flex-1" />

              <button
                onClick={exitSelection}
                className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer flex items-center gap-1.5"
              >
                <IconX size={12} /> {t('bankCancelSelection')}
              </button>
            </div>
          )}

          {/* ── Notices ── */}
          {needsMigration && (
            <div
              className="mx-6 mt-4 rounded-xl p-4 flex items-start gap-3 flex-shrink-0"
              style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)' }}
            >
              <span className="flex-shrink-0 mt-0.5 text-warn"><IconAlertTriangle size={16} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-warn">Migration requise — colonne "folder" manquante</p>
                <p className="text-[11px] mt-0.5 text-text2">Colle ce SQL dans Supabase → SQL Editor → Run :</p>
                <code className="text-[11px] font-mono block mt-1 text-text2">{MIGRATION_SQL.trim()}</code>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(MIGRATION_SQL); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000) }}
                className="sf-btn sf-btn-sm cursor-pointer flex-shrink-0"
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
              <span className="text-danger flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </span>
              <span className="text-[13px] flex-1 text-danger">{error}</span>
              <button onClick={() => setError(null)} aria-label={t('cancel')} className="text-danger hover:opacity-70 transition-opacity cursor-pointer"><IconX size={14} /></button>
            </div>
          )}

          {uploadStatus && (
            <div
              className="mx-6 mt-4 px-4 py-3 rounded-xl flex items-center gap-3 flex-shrink-0"
              style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              <span className="sf-spinner flex-shrink-0" />
              <span className="text-[13px] text-accent">{uploadStatus}</span>
            </div>
          )}

          {/* ── Scrollable content ── */}
          <div className="flex-1 px-6 py-5">
            {loading ? (
              <div className="flex justify-center py-20"><Spinner size="lg" /></div>

            ) : items.length === 0 ? (
              /* Empty state — upload CTA centered */
              <div className="flex flex-col items-center justify-center py-24 gap-6">
                <div
                  className="w-24 h-24 rounded-3xl flex items-center justify-center sf-anim-scale-spring"
                  style={{
                    background: 'rgba(99,102,241,0.08)',
                    border: '2px dashed rgba(99,102,241,0.3)',
                    color: 'var(--accent)',
                    boxShadow: '0 0 40px -10px rgba(99,102,241,0.3)',
                  }}
                >
                  <IconUpload size={36} />
                </div>
                <div className="text-center max-w-sm">
                  <p className="text-[17px] font-bold text-text">{t('bankEmptyTitle')}</p>
                  <p className="text-[13px] text-text2 mt-1.5 leading-relaxed">{t('bankEmptyDesc')}</p>
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="sf-btn sf-btn-primary sf-btn-lg cursor-pointer"
                >
                  <IconPlus size={14} />
                  {t('bankAddMediaBtn')}
                </button>
              </div>

            ) : visible.length === 0 ? (
              /* Empty state — no search results */
              <div className="sf-empty py-20">
                <div className="sf-empty-icon sf-anim-scale-spring">
                  <IconSearch size={28} />
                </div>
                <p className="sf-empty-title">{t('bankNoResults')}</p>
                <p className="sf-empty-desc">{t('bankNoResultsHint')}</p>
              </div>

            ) : viewMode === 'grid' ? (
              /* ── Grid view ── */
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 anim-stagger">
                  {visiblePage.map(item => (
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
                {visibleCount < visible.length && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                      className="sf-btn sf-btn-secondary cursor-pointer"
                    >
                      Voir plus ({visible.length - visibleCount} restants)
                    </button>
                  </div>
                )}
              </div>

            ) : (
              /* ── List view ── */
              <div>
              <div className="sf-card overflow-hidden">
                {/* List header */}
                <div
                  className="grid gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-text3"
                  style={{ gridTemplateColumns: '40px 1fr 80px 100px 32px', borderBottom: '1px solid var(--border)' }}
                >
                  <span />
                  <span>{t('bankColName')}</span>
                  <span>{t('bankColDuration')}</span>
                  <span>{t('bankColTags')}</span>
                  <span />
                </div>
                {visiblePage.map((item, idx) => (
                  <div
                    key={item.id}
                    className="grid gap-3 px-4 py-2.5 items-center group cursor-default transition-colors"
                    style={{
                      gridTemplateColumns: '40px 1fr 80px 100px 32px',
                      borderBottom: idx < visible.length - 1 ? '1px solid var(--border)' : 'none',
                      background: selectedIds.has(item.id) ? 'rgba(99,102,241,0.06)' : undefined,
                    }}
                    onMouseEnter={e => { if (!selectedIds.has(item.id)) e.currentTarget.style.background = 'rgba(99,102,241,0.04)' }}
                    onMouseLeave={e => { if (!selectedIds.has(item.id)) e.currentTarget.style.background = 'transparent' }}
                    onContextMenu={e => !selectionMode && openCtx(e, item)}
                  >
                    {/* Thumbnail */}
                    <div
                      className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer relative"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      onClick={() => selectionMode ? toggleSelection(item.id) : (item.file_url || item.storage_path) && setPlayingItem(item)}
                    >
                      <VideoThumbnail filePath={item.file_url} thumbnailPath={item.thumbnail_path} storagePath={item.storage_path} />
                      {/* Checkbox overlay when selected */}
                      {isSelected(item) && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.7)' }}>
                          <IconCheck size={12} className="text-white" />
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-text truncate">{item.title}</p>
                      {item.notes && <p className="text-[11px] truncate mt-0.5 text-text3">{item.notes}</p>}
                    </div>

                    {/* Duration */}
                    <span className="text-[12px] text-text3">
                      {item.duration ? formatDuration(item.duration) : '—'}
                    </span>

                    {/* Tags */}
                    <div className="flex gap-1 overflow-hidden">
                      {item.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="sf-badge sf-badge-accent text-[10px]">#{tag}</span>
                      ))}
                    </div>

                    {/* Actions */}
                    <button
                      className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-accent cursor-pointer"
                      style={{ background: 'rgba(99,102,241,0.1)' }}
                      onClick={e => { e.stopPropagation(); openCtx(e, item) }}
                    >
                      <IconMoreVert size={12} />
                    </button>
                  </div>
                ))}
              </div>
              {visibleCount < visible.length && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    className="sf-btn sf-btn-secondary cursor-pointer"
                  >
                    Voir plus ({visible.length - visibleCount} restants)
                  </button>
                </div>
              )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Premium context menu ── */}
      {ctxMenu && (
        <div
          className="fixed z-[60] rounded-xl py-1.5 min-w-[188px] shadow-2xl anim-scale-in"
          style={{
            left: ctxMenu.x,
            top: ctxMenu.y,
            background: 'var(--surface)',
            border: '1px solid rgba(99,102,241,0.22)',
            boxShadow: '0 16px 48px -8px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.5)',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {[
            {
              icon: <IconPencil size={12} />,
              label: t('bankCtxRename'),
              action: () => { setRenameItem(ctxMenu.item); setCtxMenu(null) }
            },
            {
              icon: <IconMove size={12} />,
              label: t('bankCtxMoveTo'),
              action: () => { setMoveItem(ctxMenu.item); setCtxMenu(null) }
            },
            {
              icon: <IconTag size={12} />,
              label: t('bankCtxEditTags'),
              action: () => { setTagsItem(ctxMenu.item); setCtxMenu(null) }
            },
            {
              icon: <IconDownload size={12} />,
              label: 'Télécharger',
              action: async () => {
                const it = ctxMenu.item
                setCtxMenu(null)
                await downloadItem(it)
              }
            },
            ...(ctxMenu.item.file_url && !ctxMenu.item.storage_path ? [{
              icon: <IconUpload size={12} />,
              label: t('bankCtxUpload'),
              action: () => { reuploadItem(ctxMenu.item); setCtxMenu(null) }
            }] : []),
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="w-full text-left px-3.5 py-2 text-[13px] flex items-center gap-2.5 transition-colors cursor-pointer text-text2 hover:bg-accent/10 hover:text-text"
            >
              <span className="text-accent">{icon}</span>
              {label}
            </button>
          ))}
          <div className="h-px bg-border mx-2 my-1" />
          <button
            onClick={() => { setConfirmDeleteItem(ctxMenu.item); setCtxMenu(null) }}
            className="w-full text-left px-3.5 py-2 text-[13px] flex items-center gap-2.5 transition-colors cursor-pointer text-danger hover:bg-danger/10"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <IconTrash size={12} />
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
        <div className="sf-modal-bg" onClick={() => setFolderModal(null)}>
          <div className="sf-modal w-80 anim-scale-in" onClick={e => e.stopPropagation()}>
            {folderModal.mode === 'delete' ? (<>
              <div className="sf-modal-header">
                <h3 className="sf-modal-title">{t('bankDeleteFolderTitle')} <span className="text-accent">"{folderModal.name}"</span></h3>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-[12px] text-text2">
                  {items.filter(i => (i as unknown as {folder?:string}).folder === folderModal.name).length} {t('bankVideosInFolder')}
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => deleteFolder(folderModal.name, false)}
                    className="sf-btn sf-btn-secondary w-full cursor-pointer"
                  >
                    {t('bankDeleteFolderKeep')}
                  </button>
                  <button
                    onClick={() => deleteFolder(folderModal.name, true)}
                    className="sf-btn sf-btn-danger w-full cursor-pointer"
                  >
                    {t('bankDeleteFolderAll')}
                  </button>
                  <button
                    onClick={() => setFolderModal(null)}
                    className="sf-btn sf-btn-ghost w-full cursor-pointer"
                  >{t('cancel')}</button>
                </div>
              </div>
            </>) : (<>
              <div className="sf-modal-header">
                <h3 className="sf-modal-title">{t('bankMoveVideosFrom')} <span className="text-accent">"{folderModal.name}"</span> {t('bankMoveVideosTo')}</h3>
              </div>
              <div className="p-3 flex flex-col gap-1 max-h-56 overflow-auto">
                <button
                  onClick={() => mergeFolderTo(folderModal.name, null)}
                  className="text-left px-3 py-2 rounded-lg text-[13px] transition-colors cursor-pointer text-text2 hover:bg-accent/10 hover:text-text"
                >
                  {t('bankRootNoFolder')}
                </button>
                {folders.filter(f => f !== folderModal.name).map(f => (
                  <button
                    key={f}
                    onClick={() => mergeFolderTo(folderModal.name, f)}
                    className="text-left px-3 py-2 rounded-lg text-[13px] transition-colors cursor-pointer text-text2 hover:bg-accent/10 hover:text-text"
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="p-3 border-t border-border">
                <button
                  onClick={() => setFolderModal(null)}
                  className="sf-btn sf-btn-ghost w-full cursor-pointer"
                >{t('cancel')}</button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* ── Bulk move modal ── */}
      {showBulkMove && (
        <div className="sf-modal-bg" onClick={() => setShowBulkMove(false)}>
          <div className="sf-modal w-72 anim-scale-in" onClick={e => e.stopPropagation()}>
            <div className="sf-modal-header">
              <h3 className="sf-modal-title">
                {t('bankMoveSelected')} {selectedIds.size} video{selectedIds.size > 1 ? 's' : ''} {t('bankVideosBulkTo')}
              </h3>
            </div>
            <div className="p-3 flex flex-col gap-1 max-h-64 overflow-auto">
              <button
                onClick={() => moveSelected(null)}
                className="text-left px-3 py-2 rounded-lg text-[13px] transition-colors cursor-pointer text-text2 hover:bg-accent/10 hover:text-text"
              >
                {t('bankRootNoFolder')}
              </button>
              {folders.map(f => (
                <button
                  key={f}
                  onClick={() => moveSelected(f)}
                  className="text-left px-3 py-2 rounded-lg text-[13px] transition-colors cursor-pointer text-text2 hover:bg-accent/10 hover:text-text"
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-border">
              <button
                onClick={() => setShowBulkMove(false)}
                className="sf-btn sf-btn-ghost w-full cursor-pointer"
              >{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showAddModal && (
        <AddMediaModal
          onFiles={async files => { for (const f of files) await addFromFile(f) }}
          onElectronPick={(window.electronAPI?.pickAnyFile || window.electronAPI?.pickVideoFile) ? pickFile : undefined}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {showDriveModal && (
        <DriveConnectionsModal
          user={user}
          orgId={isPersonal ? null : (currentOrg?.id ?? null)}
          folders={folders}
          serviceEmail="scaleflow@starify-agencies.iam.gserviceaccount.com"
          onClose={() => setShowDriveModal(false)}
          onSynced={() => loadItems()}
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

      {/* ── ConfirmDialog — single item delete ── */}
      <ConfirmDialog
        open={!!confirmDeleteItem}
        title={t('bankCtxDelete')}
        message={confirmDeleteItem ? `« ${confirmDeleteItem.title} » sera définitivement supprimé.` : ''}
        confirmLabel={t('bankCtxDelete')}
        danger
        busy={deleteBusy}
        onConfirm={() => { if (confirmDeleteItem) performDeleteItem(confirmDeleteItem) }}
        onCancel={() => setConfirmDeleteItem(null)}
      />

      {/* ── ConfirmDialog — bulk delete ── */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`${t('bankDeleteSelected')} (${selectedIds.size})`}
        message={`${selectedIds.size} éléments seront définitivement supprimés.`}
        confirmLabel={t('bankDeleteSelected')}
        danger
        busy={deleteBusy}
        onConfirm={performDeleteSelected}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  )

  function isSelected(item: ContentItem) { return selectedIds.has(item.id) }
}

// ── Folder row with inline rename ────────────────────────────────────────────
function FolderRow({ name, count, active, isDrive, onClick, onRename, onDelete, onMerge, onDropItem }: {
  name: string
  count: number
  active: boolean
  isDrive?: boolean
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
          className="sf-input flex-1 text-[12px]"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onRename(val.trim()); setEditing(false) }
            if (e.key === 'Escape') { setVal(name); setEditing(false) }
          }}
        />
        <button
          onClick={() => { onRename(val.trim()); setEditing(false) }}
          aria-label={t('save')}
          className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer"
        ><IconCheck size={13} /></button>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all group"
      style={
        dragOver
          ? { background: 'rgba(99,102,241,0.15)', borderLeft: '2px solid var(--accent)', paddingLeft: '10px' }
          : active
          ? { background: 'rgba(99,102,241,0.08)', borderLeft: '2px solid var(--accent)', paddingLeft: '10px' }
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
      <span style={{ color: active || dragOver ? 'var(--accent-lt)' : 'var(--text-3)' }} className="flex-shrink-0">
        {isDrive && !dragOver
          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M7.71 3.5 1.15 15l3.42 6 6.56-11.5zM22.85 15 16.29 3.5H9.43L16 15zM5.43 16.5 2 22.5h13.14l3.43-6z"/></svg>
          : dragOver ? <IconFolderOpen size={13} /> : <IconFolder size={13} />
        }
      </span>
      <span
        className="text-[12px] font-medium flex-1 truncate"
        style={{ color: active ? 'var(--text-1)' : 'var(--text-2)' }}
      >{name}</span>

      {showActions ? (
        <div className="flex gap-0.5 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setEditing(true) }}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors text-text3 hover:text-accent cursor-pointer sf-press"
            title={t('bankFolderRename')}
          >
            <IconPencil size={10} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onMerge() }}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors text-text3 hover:text-accent cursor-pointer sf-press"
            title={t('bankFolderMergeTo')}
          >
            <IconMove size={10} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors text-text3 hover:text-danger cursor-pointer sf-press"
            title={t('bankFolderDelete')}
          >
            <IconTrash size={10} />
          </button>
        </div>
      ) : (
        <span className="sf-badge sf-badge-muted text-[10px] flex-shrink-0">{count}</span>
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
  const [failed,      setFailed]      = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [thumbUrl,    setThumbUrl]    = useState<string | null>(null)
  const [videoSrc,    setVideoSrc]    = useState<string | null>(null)
  const [retryKey,    setRetryKey]    = useState(0)
  const [tryAsImage,  setTryAsImage]  = useState(false)

  useEffect(() => {
    let cancelled = false
    setThumbUrl(null); setVideoSrc(null); setFailed(false); setLoading(true); setTryAsImage(false)
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

  // Retry once on URL expiry; then try rendering as <img> (handles PNG stored with .mp4 ext);
  // only give up after both retries fail.
  const handleError = () => {
    if (retryKey === 0) setRetryKey(1)
    else if (!tryAsImage) setTryAsImage(true)
    else setFailed(true)
  }

  if (failed) return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-surface2 gap-1 text-text2/50">
      <IconAlertTriangle size={24} />
      <span className="text-[10px]">{t('bankVideoUnableLoad')}</span>
    </div>
  )

  // 1. JPEG thumbnail
  if (thumbnailPath) {
    if (loading || !thumbUrl) return <div className="w-full h-full flex items-center justify-center bg-surface2 text-text2/40 animate-pulse"><IconClapperboard size={36} /></div>
    return (
      <img src={thumbUrl} alt=""
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        onError={handleError} />
    )
  }

  // 2. Cloud asset (image or video)
  if (storagePath) {
    if (loading || !videoSrc) return <div className="w-full h-full flex items-center justify-center bg-surface2 text-text2/40 animate-pulse"><IconClapperboard size={36} /></div>
    // isImagePath covers normal uploads; tryAsImage covers PNG stored with wrong extension
    if (isImagePath(storagePath) || tryAsImage) {
      return (
        <img src={videoSrc} alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={tryAsImage ? () => setFailed(true) : handleError} />
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
    return <div className="w-full h-full flex items-center justify-center bg-surface2 text-text2/40"><IconClapperboard size={36} /></div>
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
  const [cloudUrl,    setCloudUrl]    = useState<string | null>(null)
  const [urlError,    setUrlError]    = useState(false)
  const [retryKey,    setRetryKey]    = useState(0)
  const [tryAsImage,  setTryAsImage]  = useState(false)

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
    else if (!tryAsImage) setTryAsImage(true)
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

  return createPortal(
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
          aria-label={t('cancel')}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer sf-press"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
        ><IconX size={16} /></button>

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
            <IconAlertTriangle size={30} />
            <span className="text-sm">{t('bankVideoUnableLoad')}</span>
          </div>
        )}

        {/* Image or video fills the container */}
        {localUrl && ((isImagePath(item.storage_path ?? item.file_url) || tryAsImage) ? (
          <img
            key={localUrl + '-img'}
            src={localUrl}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onError={() => setUrlError(true)}
          />
        ) : (
          <video
            key={localUrl}
            ref={videoRef}
            src={localUrl}
            controls
            autoPlay
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onError={handleVideoError}
          />
        ))}
      </div>
    </div>,
    document.body
  )
}

// ── Video card ───────────────────────────────────────────────────────────────
const VideoCard = memo(function VideoCard({ item, onContextMenu, onPlay, selectionMode, isSelected, onToggleSelect }: {
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
        background: 'var(--surface)',
        border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
        boxShadow: isSelected ? '0 0 0 2px rgba(99,102,241,0.25)' : undefined,
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

        {/* Hover tint */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ background: 'rgba(99,102,241,0.06)' }} />

        {/* Checkbox — top-left */}
        <button
          className="absolute top-2 left-2 z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer"
          style={isSelected
            ? { background: 'var(--accent)', border: '1px solid var(--accent)', opacity: 1 }
            : { background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.3)', opacity: 0 }
          }
          onClick={e => { e.stopPropagation(); onToggleSelect?.() }}
          title={isSelected ? t('bankCardDeselect') : t('bankCardSelect')}
        >
          {isSelected && <IconCheck size={9} className="text-white" strokeWidth={2.5} />}
        </button>

        {/* Show checkbox on hover (css approach via group) */}
        {!isSelected && (
          <button
            className="absolute top-2 left-2 z-10 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.35)' }}
            onClick={e => { e.stopPropagation(); onToggleSelect?.() }}
          />
        )}

        {/* Play button on hover */}
        {!selectionMode && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.75)', backdropFilter: 'blur(8px)', boxShadow: '0 0 20px rgba(99,102,241,0.5)' }}
            >
              <IconPlay size={16} />
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
            className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', backdropFilter: 'blur(4px)' }}
            onClick={e => { e.stopPropagation(); onContextMenu(e, item) }}
            title={t('bankCardOptions')}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.65)')}
          >
            <IconMoreVert size={12} />
          </button>
        )}

        {/* Used count */}
        {item.used_count > 0 && (
          <div
            className="absolute bottom-8 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold pointer-events-none"
            style={{ background: 'rgba(99,102,241,0.85)', color: '#fff' }}
          >
            {item.used_count}×
          </div>
        )}

        {/* Title at bottom */}
        <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 pointer-events-none">
          <p className="text-[11px] font-semibold text-white truncate leading-tight">{item.title}</p>
        </div>
      </div>

      {/* Footer: title + ⋮ menu button */}
      {!selectionMode && (
        <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="flex-1 text-[11px] font-medium text-text2 truncate">{item.title}</p>
          <button
            className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-text2 hover:text-text hover:bg-surface2 transition-colors"
            onClick={e => { e.stopPropagation(); onContextMenu(e, item) }}
            title="Options"
          >
            <IconMoreVert size={13} />
          </button>
        </div>
      )}

      {/* Tags row */}
      {item.tags.length > 0 && (
        <div className="px-2.5 py-1.5 flex flex-wrap gap-1" style={{ borderTop: '1px solid var(--border)' }}>
          {item.tags.slice(0, 3).map(tag => (
            <span key={tag} className="sf-badge sf-badge-accent text-[9px]">#{tag}</span>
          ))}
          {item.tags.length > 3 && (
            <span className="text-[9px] text-text3">+{item.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
})

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
      rows = rows.filter(i => !(i.notes === '__sf_folder__' && !i.storage_path && !i.file_url))
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
    <div className="sf-modal-bg" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl w-[880px] max-w-[95vw] h-[80vh] flex flex-col overflow-hidden anim-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sf-modal-header px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-accent"><IconLibrary size={20} /></span>
            <h2 className="sf-modal-title">{t('bankTitle')}</h2>
            <span className="text-xs text-text2">
              {mode === 'multi' ? t('bankPickerMultiple') : t('bankPickerSingle')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-text3">
                <IconSearch size={12} />
              </span>
              <input
                type="text"
                placeholder={t('bankPickerSearch')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="sf-input sf-input-sm pl-8 w-44"
              />
            </div>
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
                className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                title={selectedFolder ? `${t('selectAll')} "${selectedFolder}"` : t('selectAll')}
              >
                {visible.every(v => selected.has(v.id)) ? t('bankPickerDeselect') : t('bankPickerSelectAll')}
              </button>
            )}
            {mode === 'multi' && selected.size > 0 && (
              <button className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer" onClick={confirm} disabled={!!resolving}>
                {resolving ? t('bankPickerDownloading') : `${t('confirm')} (${selected.size})`}
              </button>
            )}
            <button onClick={onClose} aria-label={t('cancel')} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer"><IconX size={16} /></button>
          </div>
        </div>

        {resolving && (
          <div className="px-5 py-2 border-b border-accent/30 text-accent text-xs flex items-center gap-2" style={{ background: 'rgba(99,102,241,0.08)' }}>
            <span className="sf-spinner flex-shrink-0" />
            <span>{t('bankPickerDownloadingCloud')}: {resolving}</span>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-44 flex-shrink-0 border-r border-border overflow-auto py-1">
            <button
              onClick={() => setSelectedFolder(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${
                selectedFolder === null ? 'bg-surface2 border-l-2 border-accent pl-[10px]' : 'hover:bg-surface2'
              }`}
            >
              <span className="text-text2"><IconClapperboard size={14} /></span>
              <span className="text-xs text-text flex-1">{t('bankAllItems')}</span>
              <span className="text-[10px] text-text2">{items.length}</span>
            </button>
            {folders.map(f => (
              <button
                key={f}
                onClick={() => setSelectedFolder(f)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${
                  selectedFolder === f ? 'bg-surface2 border-l-2 border-accent pl-[10px]' : 'hover:bg-surface2'
                }`}
              >
                <span className="text-text2"><IconFolder size={14} /></span>
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
              <div className="sf-empty py-16">
                <div className="sf-empty-icon"><IconClapperboard size={30} /></div>
                <p className="sf-empty-desc">{t('bankPickerNoVideo')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                {visible.map(item => {
                  const isItemSelected = selected.has(item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item)}
                      className={`text-left rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                        isItemSelected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-accent/40'
                      } ${!item.file_url && !item.storage_path ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!item.file_url && !item.storage_path}
                    >
                      <div className="relative aspect-[9/16] bg-surface2">
                        <VideoThumbnail filePath={item.file_url ?? ''} thumbnailPath={item.thumbnail_path} storagePath={item.storage_path} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                        {isItemSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent flex items-center justify-center text-bg">
                            <IconCheck size={14} strokeWidth={2.5} />
                          </div>
                        )}
                        {mode === 'multi' && !isItemSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white/50 bg-black/30" />
                        )}
                        <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-0.5">
                          {item.notes && (
                            <p className="text-[9px] text-white/60 truncate">{item.notes}</p>
                          )}
                          <p className="text-[11px] font-semibold text-white truncate">{item.title}</p>
                        </div>
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
