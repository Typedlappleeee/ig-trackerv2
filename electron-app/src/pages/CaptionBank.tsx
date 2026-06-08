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
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, boxShadow: '0 24px 64px -16px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: '#fff' }}>
          {item ? t('captionBankEdit') : t('captionBankAdd')}
        </h3>

        {/* Title */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('captionBankTitle')}
          </label>
          <input
            autoFocus
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }}
            placeholder={t('captionBankTitlePlaceholder')}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onFocus={e => (e.target.style.borderColor = 'rgba(139,92,246,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(139,92,246,0.15)')}
          />
        </div>

        {/* Content */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('captionBankContent')}
          </label>
          <textarea
            rows={5}
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55, boxSizing: 'border-box' }}
            placeholder={t('captionBankContentPlaceholder')}
            value={content}
            onChange={e => setContent(e.target.value)}
            onFocus={e => (e.target.style.borderColor = 'rgba(139,92,246,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(139,92,246,0.15)')}
          />
        </div>

        {/* Folder picker */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            {t('bankFolders')}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {/* No folder chip */}
            <button
              onClick={() => { setFolder(null); setShowCustom(false) }}
              style={{
                padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: folder === null && !showCustom ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                color: folder === null && !showCustom ? '#c4b5fd' : '#71717a',
                transition: 'all 0.12s',
              }}
            >Sans dossier</button>

            {/* Existing folders */}
            {allFolders.map(f => (
              <button
                key={f}
                onClick={() => { setFolder(f); setShowCustom(false) }}
                style={{
                  padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  background: folder === f && !showCustom ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                  color: folder === f && !showCustom ? '#c4b5fd' : '#a1a1aa',
                  transition: 'all 0.12s', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>
                {f}
              </button>
            ))}

            {/* New folder button */}
            <button
              onClick={() => { setShowCustom(true); setFolder(null) }}
              style={{
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: showCustom ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: showCustom ? '#a78bfa' : 'rgba(139,92,246,0.6)',
                border: `1px dashed ${showCustom ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.25)'}`,
                transition: 'all 0.12s',
              }}
            >+ Nouveau</button>
          </div>

          {showCustom && (
            <input
              autoFocus
              style={{ marginTop: 8, width: '100%', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 10, padding: '7px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Nom du nouveau dossier…"
              value={customFolder}
              onChange={e => setCustomFolder(e.target.value)}
            />
          )}
        </div>

        {/* Tags */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('bankTagsTitle')}
          </label>
          <input
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }}
            placeholder="tag1, tag2"
            value={tagStr}
            onChange={e => setTagStr(e.target.value)}
            onFocus={e => (e.target.style.borderColor = 'rgba(139,92,246,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(139,92,246,0.15)')}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#a1a1aa', fontSize: 13, cursor: 'pointer' }}
          >{t('cancel')}</button>
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: content.trim() ? '#7c3aed' : 'rgba(124,58,237,0.3)', color: content.trim() ? '#fff' : '#52525B', fontSize: 13, fontWeight: 700, cursor: content.trim() ? 'pointer' : 'default' }}
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
    <div style={{ display: 'flex', height: '100%', background: '#07070B', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 200, flexShrink: 0,
        borderRight: '1px solid rgba(139,92,246,0.1)',
        display: 'flex', flexDirection: 'column',
        background: '#07070B',
        overflow: 'hidden',
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '18px 14px 10px', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#52525B' }}>
            Dossiers
          </p>
        </div>

        {/* Folder list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
          {/* All items */}
          <button
            onClick={() => setActiveFolder(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: activeFolder === null ? 'rgba(139,92,246,0.08)' : 'transparent',
              borderLeft: `2px solid ${activeFolder === null ? '#8B5CF6' : 'transparent'}`,
              paddingLeft: activeFolder === null ? 8 : 10,
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { if (activeFolder !== null) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.04)' }}
            onMouseLeave={e => { if (activeFolder !== null) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeFolder === null ? '#A78BFA' : '#52525B'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span style={{ flex: 1, fontSize: 12, fontWeight: activeFolder === null ? 600 : 400, color: activeFolder === null ? '#fff' : '#A1A1AA', textAlign: 'left' }}>
              Tout
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
              background: activeFolder === null ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.06)',
              color: activeFolder === null ? '#A78BFA' : '#52525B',
            }}>{items.length}</span>
          </button>

          {/* Folders */}
          {allFolders.map(f => {
            const count = items.filter(i => i.folder === f).length
            const isActive = activeFolder === f
            const isEmpty = count === 0

            return (
              <div
                key={f}
                style={{ position: 'relative' }}
                onMouseEnter={() => setHoveredFolder(f)}
                onMouseLeave={() => setHoveredFolder(null)}
              >
                <button
                  onClick={() => setActiveFolder(f)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 28px 8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: isActive ? 'rgba(139,92,246,0.08)' : 'transparent',
                    borderLeft: `2px solid ${isActive ? '#8B5CF6' : 'transparent'}`,
                    paddingLeft: isActive ? 8 : 10,
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.04)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#A78BFA' : '#52525B'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span style={{
                    flex: 1, fontSize: 12, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#fff' : isEmpty ? '#52525B' : '#A1A1AA',
                    textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {f}
                  </span>
                  {!isEmpty && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
                      background: isActive ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.06)',
                      color: isActive ? '#A78BFA' : '#52525B',
                    }}>{count}</span>
                  )}
                </button>

                {/* Delete empty folder */}
                {hoveredFolder === f && isEmpty && (
                  <button
                    onClick={e => { e.stopPropagation(); removeEmptyFolder(f) }}
                    style={{
                      position: 'absolute', top: '50%', right: 6, transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: '#F87171', cursor: 'pointer',
                      fontSize: 14, lineHeight: 1, padding: '2px 4px', borderRadius: 4,
                    }}
                  >×</button>
                )}
              </div>
            )
          })}

          {/* New folder */}
          <div style={{ padding: '6px 4px' }}>
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
                  width: '100%', padding: '6px 10px', borderRadius: 8, boxSizing: 'border-box',
                  background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.35)',
                  color: '#e2e8f0', fontSize: 11, outline: 'none',
                }}
              />
            ) : (
              <button
                onClick={() => { setShowNewFolder(true); setTimeout(() => newFolderRef.current?.focus(), 50) }}
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: 8,
                  border: '1px dashed rgba(139,92,246,0.2)', background: 'transparent',
                  color: 'rgba(139,92,246,0.5)', fontSize: 11, cursor: 'pointer',
                  transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 5,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.45)'; (e.currentTarget as HTMLButtonElement).style.color = '#a78bfa' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.2)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(139,92,246,0.5)' }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Nouveau dossier
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div style={{
          flexShrink: 0, padding: '20px 28px 16px',
          borderBottom: '1px solid rgba(139,92,246,0.1)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
              Banque de Captions
            </h1>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
              color: '#A78BFA',
            }}>{items.length}</span>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.15)',
                borderRadius: 10, padding: '7px 12px 7px 32px', fontSize: 13, color: '#fff',
                outline: 'none', width: 220,
              }}
              placeholder="Rechercher…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={e => (e.target.style.borderColor = 'rgba(139,92,246,0.45)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(139,92,246,0.15)')}
            />
          </div>

          {selected.size > 0 && (
            <button
              onClick={() => handleDelete([...selected])}
              disabled={deleting}
              style={{
                padding: '7px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.1)', color: '#F87171', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {deleting ? <Spinner size="sm" /> : `Supprimer (${selected.size})`}
            </button>
          )}

          <button
            onClick={() => { setEditItem(undefined); setShowModal(true) }}
            style={{
              padding: '7px 16px', borderRadius: 10, border: 'none',
              background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Ajouter
          </button>
        </div>

        {error && (
          <div style={{ margin: '8px 28px 0', padding: '8px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171', fontSize: 12 }}>
            {error}
          </div>
        )}

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><Spinner size="md" /></div>
          ) : activeFolder !== null && emptyFolders.includes(activeFolder) && filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, color: '#52525B' }}>
              <div style={{ width: 72, height: 72, borderRadius: 18, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B5CF6' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>
              </div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#A1A1AA' }}>Dossier vide</p>
              <p style={{ margin: 0, fontSize: 12, color: '#52525B' }}>Ajoute une caption dans ce dossier</p>
              <button
                onClick={() => { setEditItem(undefined); setShowModal(true) }}
                style={{ marginTop: 4, padding: '8px 18px', borderRadius: 10, border: 'none', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >+ Ajouter une caption</button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
              <div style={{ width: 72, height: 72, borderRadius: 18, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>Aucune caption</p>
              <p style={{ margin: 0, fontSize: 13, color: '#52525B' }}>Ajoute ta première caption pour commencer</p>
              <button
                onClick={() => { setEditItem(undefined); setShowModal(true) }}
                style={{ marginTop: 4, padding: '8px 18px', borderRadius: 10, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >+ Ajouter une caption</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {filtered.map(item => {
                const isSelected = selected.has(item.id)
                const isHovered  = hoveredCard === item.id

                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    onMouseEnter={() => setHoveredCard(item.id)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={{
                      background: '#0E0E16', borderRadius: 14, cursor: 'pointer',
                      border: `1px solid ${isSelected ? '#8B5CF6' : 'rgba(139,92,246,0.12)'}`,
                      boxShadow: isSelected ? '0 0 0 2px rgba(139,92,246,0.25)' : 'none',
                      transition: 'all 0.15s', position: 'relative',
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      position: 'absolute', top: 10, right: 10,
                      width: 18, height: 18, borderRadius: 6,
                      background: isSelected ? '#8B5CF6' : isHovered ? 'rgba(0,0,0,0.55)' : 'transparent',
                      border: isSelected ? '1px solid #8B5CF6' : '1px solid rgba(255,255,255,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: isSelected || isHovered ? 1 : 0,
                      transition: 'all 0.12s',
                    }}>
                      {isSelected && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>

                    {/* Content */}
                    <div style={{ padding: '14px 38px 14px 14px', flex: 1 }}>
                      {item.title && (
                        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </p>
                      )}
                      <p style={{
                        margin: 0, fontSize: 12, color: '#71717A', lineHeight: 1.55,
                        display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {item.content}
                      </p>
                    </div>

                    {/* Footer */}
                    <div style={{
                      padding: '8px 14px', borderTop: '1px solid rgba(139,92,246,0.08)',
                      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    }}>
                      {item.folder && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'rgba(139,92,246,0.1)', color: '#A78BFA', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>
                          {item.folder}
                        </span>
                      )}
                      {item.tags.slice(0, 2).map(tag => (
                        <span key={tag} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: '#71717A' }}>
                          {tag}
                        </span>
                      ))}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, opacity: isHovered ? 1 : 0, transition: 'opacity 0.12s' }}>
                        <button
                          onClick={e => { e.stopPropagation(); setEditItem(item); setShowModal(true) }}
                          style={{ padding: '2px 8px', borderRadius: 6, border: 'none', background: 'rgba(139,92,246,0.12)', color: '#A78BFA', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                        >Modifier</button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete([item.id]) }}
                          style={{ padding: '2px 8px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#F87171', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
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
