import { useState, useEffect, useCallback } from 'react'
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
  item, folders, onSave, onClose,
}: {
  item?: CaptionItem
  folders: string[]
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
              list="caption-folders"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              placeholder={t('bankFolderNamePlaceholder')}
              value={folder}
              onChange={e => setFolder(e.target.value)}
            />
            <datalist id="caption-folders">
              {folders.map(f => <option key={f} value={f} />)}
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

  const [items,        setItems]        = useState<CaptionItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [showModal,    setShowModal]    = useState(false)
  const [editItem,     setEditItem]     = useState<CaptionItem | undefined>()
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [deleting,     setDeleting]     = useState(false)
  const [error,        setError]        = useState('')

  const folders = [...new Set(items.map(i => i.folder).filter(Boolean))] as string[]

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let q = supabase
        .from('caption_bank')
        .select('*')
        .order('created_at', { ascending: false })
      if (currentOrg) {
        q = q.eq('org_id', currentOrg.id)
      } else {
        q = q.eq('user_id', user.id).is('org_id', null)
      }
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
      const row: any = {
        user_id: user.id,
        org_id: currentOrg?.id ?? null,
        title: title || content.slice(0, 40),
        content,
        folder,
        tags,
      }
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
    else {
      setSelected(new Set())
      load()
    }
    setDeleting(false)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = items.filter(item => {
    if (activeFolder !== null && item.folder !== activeFolder) return false
    if (!search) return true
    const q = search.toLowerCase()
    return item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q)
  })

  return (
    <div className="flex h-full">
      {/* Sidebar folders */}
      <aside className="w-44 flex-shrink-0 border-r border-border p-3 space-y-1 overflow-y-auto">
        <button
          onClick={() => setActiveFolder(null)}
          className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${activeFolder === null ? 'bg-accent/10 text-accent font-medium' : 'hover:bg-surface2 text-muted'}`}
        >
          {t('bankAllItems')} ({items.length})
        </button>
        {folders.map(f => (
          <button
            key={f}
            onClick={() => setActiveFolder(f)}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${activeFolder === f ? 'bg-accent/10 text-accent font-medium' : 'hover:bg-surface2 text-muted'}`}
          >
            {f} ({items.filter(i => i.folder === f).length})
          </button>
        ))}
      </aside>

      {/* Main area */}
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
                    selected.has(item.id)
                      ? 'border-accent ring-1 ring-accent/30'
                      : 'border-border hover:border-accent/40'
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`absolute top-2 right-2 w-4 h-4 rounded-full border-2 transition-all ${selected.has(item.id) ? 'bg-accent border-accent' : 'border-border group-hover:border-accent/50'}`} />

                  {/* Title */}
                  {item.title && (
                    <p className="text-xs font-semibold text-text mb-1 pr-6 truncate">{item.title}</p>
                  )}

                  {/* Content preview */}
                  <p className="text-xs text-muted line-clamp-4 whitespace-pre-wrap">{item.content}</p>

                  {/* Footer */}
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
          folders={folders}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditItem(undefined) }}
        />
      )}
    </div>
  )
}
