import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useOrg } from '@/lib/orgContext'
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
  const [title,        setTitle]        = useState(item?.title   ?? '')
  const [content,      setContent]      = useState(item?.content ?? '')
  const [folder,       setFolder]       = useState<string | null>(item?.folder ?? null)
  const [customFolder, setCustomFolder] = useState('')
  const [showCustom,   setShowCustom]   = useState(false)
  const [tagStr,       setTagStr]       = useState((item?.tags ?? []).join(', '))

  const handleSave = () => {
    const tags = tagStr.split(',').map(s => s.trim()).filter(Boolean)
    const finalFolder = showCustom ? (customFolder.trim() || null) : folder
    onSave(title.trim(), content.trim(), finalFolder, tags)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="sf-card p-6 w-full max-w-lg sf-anim-scale-in"
        style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3 className="text-[15px] font-bold text-text">
            {item ? t('captionBankEdit') : t('captionBankAdd')}
          </h3>
        </div>

        {/* Title */}
        <div className="mb-4">
          <label className="block text-[11px] font-semibold text-text2 uppercase tracking-wider mb-1.5">
            {t('captionBankTitle')}
          </label>
          <input
            autoFocus
            className="sf-input w-full"
            placeholder={t('captionBankTitlePlaceholder')}
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        {/* Content */}
        <div className="mb-4">
          <label className="block text-[11px] font-semibold text-text2 uppercase tracking-wider mb-1.5">
            {t('captionBankContent')}
          </label>
          <textarea
            rows={5}
            className="sf-input w-full resize-y"
            style={{ fontFamily: 'inherit', lineHeight: 1.55 }}
            placeholder={t('captionBankContentPlaceholder')}
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        </div>

        {/* Folder picker */}
        <div className="mb-4">
          <label className="block text-[11px] font-semibold text-text2 uppercase tracking-wider mb-2">
            {t('bankFolders')}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {/* No folder chip */}
            <button
              onClick={() => { setFolder(null); setShowCustom(false) }}
              className={`px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer transition-all ${folder === null && !showCustom ? 'text-accent' : 'text-text2 hover:text-text'}`}
              style={{
                background: folder === null && !showCustom ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${folder === null && !showCustom ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
              }}
            >Sans dossier</button>

            {/* Existing folders */}
            {allFolders.map(f => (
              <button
                key={f}
                onClick={() => { setFolder(f); setShowCustom(false) }}
                className={`px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer transition-all inline-flex items-center gap-1.5 ${folder === f && !showCustom ? 'text-accent' : 'text-text2 hover:text-text'}`}
                style={{
                  background: folder === f && !showCustom ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${folder === f && !showCustom ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>
                {f}
              </button>
            ))}

            {/* New folder button */}
            <button
              onClick={() => { setShowCustom(true); setFolder(null) }}
              className="px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer transition-all text-accent/60 hover:text-accent"
              style={{
                background: showCustom ? 'rgba(99,102,241,0.1)' : 'transparent',
                border: `1px dashed ${showCustom ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.25)'}`,
              }}
            >+ Nouveau</button>
          </div>

          {showCustom && (
            <input
              autoFocus
              className="sf-input w-full mt-2"
              placeholder="Nom du nouveau dossier…"
              value={customFolder}
              onChange={e => setCustomFolder(e.target.value)}
            />
          )}
        </div>

        {/* Tags */}
        <div className="mb-5">
          <label className="block text-[11px] font-semibold text-text2 uppercase tracking-wider mb-1.5">
            {t('bankTagsTitle')}
          </label>
          <input
            className="sf-input w-full"
            placeholder="tag1, tag2"
            value={tagStr}
            onChange={e => setTagStr(e.target.value)}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="sf-btn sf-btn-ghost cursor-pointer"
          >{t('cancel')}</button>
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            className="sf-btn sf-btn-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >{t('save')}</button>
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
  const [hoveredCard,  setHoveredCard]  = useState<string | null>(null)
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)

  // Persisted empty folders
  const [emptyFolders,   setEmptyFolders]   = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sf-caption-folders') ?? '[]') } catch { return [] }
  })
  const [showNewFolder,  setShowNewFolder]  = useState(false)
  const [newFolderInput, setNewFolderInput] = useState('')

  const derivedFolders = [...new Set(items.map(i => i.folder).filter(Boolean))] as string[]
  const allFolders = [...new Set([...derivedFolders, ...emptyFolders])].sort()

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
    <div className="flex h-full bg-bg overflow-hidden anim-page">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-52 flex-shrink-0 border-r border-border flex flex-col bg-surface overflow-hidden">
        {/* Sidebar header */}
        <div className="px-4 pt-5 pb-3 flex-shrink-0 border-b border-border sf-anim-slide-up sf-d50">
          <div className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <p className="text-[11px] font-bold uppercase tracking-wider text-text2">Dossiers</p>
          </div>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto py-2 px-2 anim-stagger">
          {/* All items */}
          <button
            onClick={() => setActiveFolder(null)}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${activeFolder === null ? 'text-text bg-accent/10 border-l-2 border-accent' : 'text-text2 hover:text-text hover:bg-surface2'}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span className="flex-1 text-left">Tout</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${activeFolder === null ? 'text-accent bg-accent/15' : 'text-text2 bg-surface2'}`}>
              {items.length}
            </span>
          </button>

          {/* Folders */}
          {allFolders.map(f => {
            const count = items.filter(i => i.folder === f).length
            const isActive = activeFolder === f
            const isEmpty = count === 0

            return (
              <div
                key={f}
                className="relative"
                onMouseEnter={() => setHoveredFolder(f)}
                onMouseLeave={() => setHoveredFolder(null)}
              >
                <button
                  onClick={() => setActiveFolder(f)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${isActive ? 'text-text bg-accent/10 border-l-2 border-accent' : 'text-text2 hover:text-text hover:bg-surface2'} ${isEmpty ? 'opacity-60' : ''}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span className="flex-1 text-left truncate">{f}</span>
                  {!isEmpty && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isActive ? 'text-accent bg-accent/15' : 'text-text2 bg-surface2'}`}>
                      {count}
                    </span>
                  )}
                </button>

                {/* Delete empty folder */}
                {hoveredFolder === f && isEmpty && (
                  <button
                    onClick={e => { e.stopPropagation(); removeEmptyFolder(f) }}
                    className="absolute top-1/2 right-2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-danger hover:bg-danger/10 cursor-pointer transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            )
          })}

          {/* New folder */}
          <div className="pt-1 px-1">
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
                className="sf-input w-full text-[11px] px-2.5 py-1.5"
              />
            ) : (
              <button
                onClick={() => { setShowNewFolder(true); setTimeout(() => newFolderRef.current?.focus(), 50) }}
                className="w-full px-3 py-1.5 rounded-lg text-[11px] text-accent/60 hover:text-accent transition-all cursor-pointer flex items-center gap-1.5"
                style={{ border: '1px dashed rgba(99,102,241,0.2)' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Nouveau dossier
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex-shrink-0 px-7 py-4 border-b border-border flex items-center gap-3">
          <div className="flex items-center gap-3 flex-1 sf-anim-slide-up sf-d50">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.1))', border: '1px solid rgba(99,102,241,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h1 className="text-[20px] font-black text-text leading-none">Banque de Captions</h1>
            <span className="sf-badge sf-badge-accent sf-anim-scale-spring sf-d200">{items.length}</span>
          </div>

          {/* Search */}
          <div className="relative sf-anim-slide-up sf-d100">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-text2" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className="sf-input pl-8 w-52 text-[13px]"
              placeholder="Rechercher…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {selected.size > 0 && (
            <button
              onClick={() => handleDelete([...selected])}
              disabled={deleting}
              className="sf-btn sf-btn-danger cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 text-[12px] sf-anim-scale-in"
            >
              {deleting ? <Spinner size="sm" /> : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  </svg>
                  Supprimer ({selected.size})
                </>
              )}
            </button>
          )}

          <button
            onClick={() => { setEditItem(undefined); setShowModal(true) }}
            className="sf-btn sf-btn-primary cursor-pointer inline-flex items-center gap-1.5 sf-anim-slide-up sf-d150"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Ajouter
          </button>
        </div>

        {error && (
          <div className="mx-7 mt-3 px-4 py-2.5 rounded-xl bg-danger/7 border border-danger/20 text-danger text-[12px]">
            {error}
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center pt-16">
              <Spinner size="md" />
            </div>
          ) : activeFolder !== null && emptyFolders.includes(activeFolder) && filtered.length === 0 ? (
            <div className="sf-empty flex-col gap-4 h-full">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[14px] font-semibold text-text mb-1">Dossier vide</p>
                <p className="text-[12px] text-text2">Ajoute une caption dans ce dossier</p>
              </div>
              <button
                onClick={() => { setEditItem(undefined); setShowModal(true) }}
                className="sf-btn sf-btn-primary cursor-pointer"
              >+ Ajouter une caption</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sf-empty flex-col gap-4 h-full">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[15px] font-bold text-text mb-1">Aucune caption</p>
                <p className="text-[13px] text-text2">Ajoute ta première caption pour commencer</p>
              </div>
              <button
                onClick={() => { setEditItem(undefined); setShowModal(true) }}
                className="sf-btn sf-btn-primary cursor-pointer"
              >+ Ajouter une caption</button>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {filtered.map(item => {
                const isSelected = selected.has(item.id)
                const isHovered  = hoveredCard === item.id

                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    onMouseEnter={() => setHoveredCard(item.id)}
                    onMouseLeave={() => setHoveredCard(null)}
                    className="sf-card sf-card-lift relative cursor-pointer flex flex-col transition-all anim-scale-in"
                    style={{
                      border: `1px solid ${isSelected ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.12)'}`,
                      ...(isSelected ? { boxShadow: '0 0 0 2px rgba(99,102,241,0.2)' } : {}),
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      className="absolute top-2.5 right-2.5 w-5 h-5 rounded-md flex items-center justify-center transition-all"
                      style={{
                        background: isSelected ? '#6366F1' : isHovered ? 'rgba(0,0,0,0.55)' : 'transparent',
                        border: isSelected ? '1px solid #6366F1' : '1px solid rgba(255,255,255,0.2)',
                        opacity: isSelected || isHovered ? 1 : 0,
                      }}
                    >
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-3.5 pr-10 flex-1">
                      {item.title && (
                        <p className="text-[12px] font-bold text-text mb-1 truncate">{item.title}</p>
                      )}
                      <p className="text-[12px] text-text2 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                        {item.content}
                      </p>
                    </div>

                    {/* Footer */}
                    <div className="px-3.5 py-2.5 border-t border-border/50 flex items-center gap-1.5 flex-wrap">
                      {item.folder && (
                        <span className="sf-badge sf-badge-accent inline-flex items-center gap-1">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>
                          {item.folder}
                        </span>
                      )}
                      {item.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="sf-badge sf-badge-muted">{tag}</span>
                      ))}
                      <div
                        className="ml-auto flex gap-1 transition-opacity"
                        style={{ opacity: isHovered ? 1 : 0 }}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); setEditItem(item); setShowModal(true) }}
                          className="sf-btn sf-btn-ghost text-[10px] px-2 py-1 cursor-pointer"
                        >Modifier</button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete([item.id]) }}
                          className="sf-btn sf-btn-danger text-[10px] px-2 py-1 cursor-pointer"
                        >Suppr.</button>
                      </div>
                    </div>
                  </div>
                )
              })}
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
