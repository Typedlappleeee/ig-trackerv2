import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useOrg } from '@/lib/orgContext'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface CaptionBankProps { user: User }

export interface CaptionItem {
  id:         string
  user_id:    string
  org_id:     string | null
  title:      string
  content:    string
  folder:     string | null
  tags:       string[]
  used_count: number
  created_at: string
  updated_at: string
}

// ── Add / Edit modal ─────────────────────────────────────────────────────────
function CaptionModal({
  item, allFolders, onSave, onClose,
}: {
  item?: CaptionItem
  allFolders: string[]
  onSave: (title: string, content: string, folder: string | null, tags: string[]) => void
  onClose: () => void
}) {
  const t = useT()
  const [title,   setTitle]   = useState(item?.title   ?? '')
  const [content, setContent] = useState(item?.content ?? '')
  const [folder,  setFolder]  = useState<string>(item?.folder ?? '')
  const [tagStr,  setTagStr]  = useState((item?.tags ?? []).join(', '))

  const handleSave = () => {
    const tags = tagStr.split(',').map(s => s.trim()).filter(Boolean)
    onSave(title.trim(), content.trim(), folder.trim() || null, tags)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-5 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text">
          {item ? t('captionBankEdit') : t('captionBankAdd')}
        </h3>

        <div className="space-y-1">
          <label className="text-xs text-muted">{t('captionBankTitle')}</label>
          <input
            autoFocus
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            placeholder={t('captionBankTitlePlaceholder')}
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted">{t('captionBankContent')}</label>
          <textarea
            rows={5}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none resize-y"
            placeholder={t('captionBankContentPlaceholder')}
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted">{t('bankFolders')}</label>
            <input
              list="caption-folders-dl"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              placeholder={t('bankFolderNamePlaceholder')}
              value={folder}
              onChange={e => setFolder(e.target.value)}
            />
            <datalist id="caption-folders-dl">
              {allFolders.map(f => <option key={f} value={f} />)}
            </datalist>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">{t('bankTagsTitle')}</label>
            <input
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              placeholder="tag1, tag2"
              value={tagStr}
              onChange={e => setTagStr(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button size="sm" onClick={handleSave} disabled={!content.trim()}>{t('save')}</Button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export function CaptionBank({ user }: CaptionBankProps) {
  const t = useT()
  const { currentOrg } = useOrg()
  const newFolderRef = useRef<HTMLInputElement>(null)

  const [items,        setItems]        = useState<CaptionItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [showModal,    setShowModal]    = useState(false)
  const [editItem,     setEditItem]     = useState<CaptionItem | undefined>()
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [deleting,     setDeleting]     = useState(false)
  const [error,        setError]        = useState('')

  // Persisted empty folders (folders with no captions yet)
  const [emptyFolders,   setEmptyFolders]   = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sf-caption-folders') ?? '[]') } catch { return [] }
  })
  const [showNewFolder,  setShowNewFolder]  = useState(false)
  const [newFolderInput, setNewFolderInput] = useState('')
  const [hoveredFolder,  setHoveredFolder]  = useState<string | null>(null)

  // Folders derived from items
  const derivedFolders = [...new Set(items.map(i => i.folder).filter(Boolean))] as string[]

  // All folders = derived + empty ones not yet populated
  const allFolders = [...new Set([...derivedFolders, ...emptyFolders])].sort()

  // When items change, clean up emptyFolders that now have items
  useEffect(() => {
    const occupied = new Set(items.map(i => i.folder).filter(Boolean))
    const stillEmpty = emptyFolders.filter(f => !occupied.has(f))
    if (stillEmpty.length !== emptyFolders.length) {
      setEmptyFolders(stillEmpty)
      localStorage.setItem('sf-caption-folders', JSON.stringify(stillEmpty))
    }
  }, [items])

  const persistEmptyFolders = (next: string[]) => {
    setEmptyFolders(next)
    localStorage.setItem('sf-caption-folders', JSON.stringify(next))
  }

  const addEmptyFolder = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || allFolders.includes(trimmed)) return
    persistEmptyFolders([...emptyFolders, trimmed])
    setActiveFolder(trimmed)
  }

  const removeEmptyFolder = (name: string) => {
    persistEmptyFolders(emptyFolders.filter(f => f !== name))
    if (activeFolder === name) setActiveFolder(null)
  }

  const commitNewFolder = () => {
    addEmptyFolder(newFolderInput)
    setNewFolderInput('')
    setShowNewFolder(false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let q = supabase.from('caption_bank').select('*').order('created_at', { ascending: false })
      if (currentOrg) q = q.eq('org_id', currentOrg.id)
      else q = q.eq('user_id', user.id).is('org_id', null)
      const { data, error: err } = await q
      if (err) throw err
      setItems(data ?? [])
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [currentOrg, user.id])

  useEffect(() => { load() }, [load])

  const handleSave = async (title: string, content: string, folder: string | null, tags: string[]) => {
    if (editItem) {
      const { error: err } = await supabase
        .from('caption_bank')
        .update({ title, content, folder, tags, updated_at: new Date().toISOString() })
        .eq('id', editItem.id)
      if (err) { setError(err.message); return }
    } else {
      const row: any = { user_id: user.id, org_id: currentOrg?.id ?? null, title: title || content.slice(0, 40), content, folder, tags }
      const { error: err } = await supabase.from('caption_bank').insert(row)
      if (err) { setError(err.message); return }
    }
    setEditItem(undefined)
    load()
  }

  const handleDelete = async (ids: string[]) => {
    setDeleting(true)
    const { error: err } = await supabase.from('caption_bank').delete().in('id', ids)
    if (err) setError(err.message)
    else { setSelected(new Set()); load() }
    setDeleting(false)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const filtered = items.filter(item => {
    if (activeFolder !== null && item.folder !== activeFolder) return false
    if (!search) return true
    const q = search.toLowerCase()
    return item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q)
  })

  return (
    <div className="flex h-full">

      {/* ── Sidebar ── */}
      <aside style={{
        width: 180, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)',
        padding: '10px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {/* All items */}
        <button
          onClick={() => setActiveFolder(null)}
          style={{
            width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 8,
            border: 'none', cursor: 'pointer', fontSize: 12,
            background: activeFolder === null ? 'rgba(139,92,246,0.15)' : 'transparent',
            color: activeFolder === null ? '#c4b5fd' : 'rgba(148,163,184,0.6)',
            fontWeight: activeFolder === null ? 600 : 400,
            transition: 'all 0.12s',
          }}
        >
          💬 Tout ({items.length})
        </button>

        {/* Folder list */}
        {allFolders.map(f => {
          const count = items.filter(i => i.folder === f).length
          const isActive = activeFolder === f
          const isEmpty  = count === 0

          return (
            <div
              key={f}
              style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
              onMouseEnter={() => setHoveredFolder(f)}
              onMouseLeave={() => setHoveredFolder(null)}
            >
              <button
                onClick={() => setActiveFolder(f)}
                style={{
                  flex: 1, textAlign: 'left', padding: '6px 28px 6px 10px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', fontSize: 12, minWidth: 0,
                  background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: isActive ? '#c4b5fd' : isEmpty ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.6)',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.12s',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                📁 {f}{!isEmpty && ` (${count})`}
              </button>

              {/* Delete button — only on empty folders or on hover */}
              {hoveredFolder === f && (isEmpty || isActive) && (
                <button
                  onClick={e => { e.stopPropagation(); isEmpty ? removeEmptyFolder(f) : undefined }}
                  title={isEmpty ? 'Supprimer le dossier' : undefined}
                  style={{
                    position: 'absolute', right: 4,
                    background: 'none', border: 'none',
                    color: isEmpty ? 'rgba(248,113,113,0.7)' : 'rgba(148,163,184,0.3)',
                    cursor: isEmpty ? 'pointer' : 'default',
                    fontSize: 14, lineHeight: 1, padding: '2px 3px', borderRadius: 4,
                  }}
                >
                  {isEmpty ? '×' : ''}
                </button>
              )}
            </div>
          )
        })}

        {/* New folder input / button */}
        <div style={{ marginTop: 6 }}>
          {showNewFolder ? (
            <input
              ref={newFolderRef}
              autoFocus
              value={newFolderInput}
              onChange={e => setNewFolderInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitNewFolder()
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderInput('') }
              }}
              onBlur={() => { if (newFolderInput.trim()) commitNewFolder(); else setShowNewFolder(false) }}
              placeholder="Nom du dossier…"
              style={{
                width: '100%', padding: '5px 8px', borderRadius: 7,
                background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.35)',
                color: '#e2e8f0', fontSize: 11, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <button
              onClick={() => { setShowNewFolder(true); setTimeout(() => newFolderRef.current?.focus(), 50) }}
              style={{
                width: '100%', padding: '5px 10px', borderRadius: 8,
                border: '1px dashed rgba(139,92,246,0.25)', background: 'transparent',
                color: 'rgba(139,92,246,0.6)', fontSize: 11, cursor: 'pointer',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.5)'; (e.currentTarget as HTMLButtonElement).style.color = '#a78bfa' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.25)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(139,92,246,0.6)' }}
            >
              + Nouveau dossier
            </button>
          )}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <input
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder={t('captionBankSearch')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {selected.size > 0 && (
            <Button variant="secondary" size="sm" onClick={() => handleDelete([...selected])} disabled={deleting}>
              {deleting ? <Spinner size="sm" /> : t('bankDeleteSelected')} ({selected.size})
            </Button>
          )}
          <Button size="sm" onClick={() => { setEditItem(undefined); setShowModal(true) }}>
            + {t('captionBankAdd')}
          </Button>
        </div>

        {error && (
          <div className="mx-3 mt-2 p-2 rounded-lg bg-red-500/10 text-red-400 text-xs">{error}</div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center pt-12"><Spinner size="md" /></div>
          ) : activeFolder !== null && emptyFolders.includes(activeFolder) && filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
              <span className="text-4xl">📁</span>
              <p className="text-sm">Dossier vide</p>
              <Button size="sm" onClick={() => { setEditItem(undefined); setShowModal(true) }}>
                + Ajouter une caption
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
              <span className="text-4xl">💬</span>
              <p className="text-sm">{t('captionBankEmpty')}</p>
              <Button size="sm" onClick={() => { setEditItem(undefined); setShowModal(true) }}>
                + {t('captionBankAdd')}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(item => (
                <div
                  key={item.id}
                  onClick={() => toggleSelect(item.id)}
                  className={`group relative bg-surface border rounded-xl p-4 cursor-pointer transition-all ${
                    selected.has(item.id) ? 'border-accent ring-1 ring-accent/30' : 'border-border hover:border-accent/40'
                  }`}
                >
                  <div className={`absolute top-2 right-2 w-4 h-4 rounded-full border-2 transition-all ${selected.has(item.id) ? 'bg-accent border-accent' : 'border-border group-hover:border-accent/50'}`} />

                  {item.title && <p className="text-xs font-semibold text-text mb-1 pr-6 truncate">{item.title}</p>}
                  <p className="text-xs text-muted line-clamp-4 whitespace-pre-wrap">{item.content}</p>

                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50">
                    {item.folder && (
                      <span className="text-[10px] bg-surface2 text-muted px-1.5 py-0.5 rounded">{item.folder}</span>
                    )}
                    {item.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">{tag}</span>
                    ))}
                    <div className="ml-auto flex gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); setEditItem(item); setShowModal(true) }}
                        className="text-[10px] text-muted hover:text-text px-1.5 py-0.5 rounded hover:bg-surface2 transition-colors"
                      >
                        {t('editPost')}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete([item.id]) }}
                        className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <CaptionModal
          item={editItem}
          allFolders={allFolders}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditItem(undefined) }}
        />
      )}
    </div>
  )
}
