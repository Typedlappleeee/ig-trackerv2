import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { fetchAllPhones, postInstagramStory, stopPhone, type GeelarkPhone } from '@/lib/geelark'
import { BankPicker } from '@/pages/Bank'
import { playSuccess, playError } from '@/lib/sounds'

// ── Types ─────────────────────────────────────────────────────────────────────
type JobStatus = 'idle' | 'running' | 'ok' | 'error'
type Job = { phoneId: string; status: JobStatus; logs: string[] }
type PoolPhoto = { url: string; name: string }
type Distribution = 'rotation' | 'random'

// ── Persistent pool config ────────────────────────────────────────────────────
const LS_PHOTO_POOL = 'sf-story-photo-pool'
const LS_TEXT_POOL  = 'sf-story-text-pool'
const LS_DISTRIB    = 'sf-story-distribution'
// Per-phone link: one link = one account, persisted individually
const lsLinkKey = (id: string) => `sf-story-link-${id}`

function loadPhotoPool(): PoolPhoto[] {
  try { return JSON.parse(localStorage.getItem(LS_PHOTO_POOL) ?? '[]') } catch { return [] }
}
function loadTextPool(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_TEXT_POOL) ?? '[]') } catch { return [] }
}
function loadDistrib(): Distribution {
  return (localStorage.getItem(LS_DISTRIB) as Distribution | null) ?? 'rotation'
}
function loadPhoneLink(id: string): string {
  return localStorage.getItem(lsLinkKey(id)) ?? ''
}
function savePhoneLink(id: string, link: string) {
  if (link.trim()) localStorage.setItem(lsLinkKey(id), link.trim())
  else localStorage.removeItem(lsLinkKey(id))
}

function savePhotoPool(v: PoolPhoto[]) { localStorage.setItem(LS_PHOTO_POOL, JSON.stringify(v)) }
function saveTextPool(v: string[])     { localStorage.setItem(LS_TEXT_POOL,  JSON.stringify(v)) }
function saveDistrib(v: Distribution)  { localStorage.setItem(LS_DISTRIB,    v) }

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────
function shuffleIndices(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconLink = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)
const IconLinkSm = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)
const IconSend = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
  </svg>
)
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconX = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
)
const IconCheck = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
)
const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
    <path d="m6 9 6 6 6-6"/>
  </svg>
)
const IconPhoto = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/>
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
  </svg>
)
const IconText = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)
const IconShuffle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/>
    <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/>
    <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>
  </svg>
)
const IconRotate = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
    <path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>
  </svg>
)
const IconWarn = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4"/><path d="M12 17h.01"/>
  </svg>
)
const IconStop = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="2"/>
  </svg>
)
const IconSave = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>
  </svg>
)
const IconTarget = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
)
const IconPhotoSm = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)
const IconTextSm = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)
const IconNoConnection = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="m19 5 3-3M2 22l3-3"/>
    <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/>
    <path d="m7.5 13.5 1-1M10.5 16.5l1-1"/>
    <path d="M12 6 18 12l2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"/>
  </svg>
)

export default function StoryLink({ user }: { user: User }) {
  const conns  = useConnections(user)
  const bearer = conns.bearer
  const { role, perms } = useOrg()

  // ── Phones ────────────────────────────────────────────────────────────────
  const [phones, setPhones]           = useState<GeelarkPhone[]>([])
  const [loadingPhones, setLoading]   = useState(false)
  const [phoneSearch, setPhoneSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('Tous')
  const [groups, setGroups]           = useState<string[]>(['Tous'])
  const [selected, setSelected]       = useState<Set<string>>(new Set())

  // ── Pool config (persisted) ───────────────────────────────────────────────
  const [photoPool, setPhotoPool]     = useState<PoolPhoto[]>(loadPhotoPool)
  const [textPool, setTextPool]       = useState<string[]>(loadTextPool)
  const [distribution, setDistrib]    = useState<Distribution>(loadDistrib)
  // Per-phone link map (1 link = 1 account), hydrated from localStorage on demand
  const [phoneLinks, setPhoneLinks]   = useState<Record<string, string>>({})

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [editingText, setEditingText]       = useState('')
  const [running, setRunning]               = useState(false)
  const [jobs, setJobs]                     = useState<Job[]>([])
  const [openLog, setOpenLog]               = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => () => { abortRef.current = true }, [])

  // ── Persist whenever pools change ─────────────────────────────────────────
  useEffect(() => savePhotoPool(photoPool), [photoPool])
  useEffect(() => saveTextPool(textPool),   [textPool])
  useEffect(() => saveDistrib(distribution),  [distribution])

  // ── Per-phone link helpers ────────────────────────────────────────────────
  const getLink = (id: string) => phoneLinks[id] ?? loadPhoneLink(id)
  function setLink(id: string, link: string) {
    setPhoneLinks(prev => ({ ...prev, [id]: link }))
    savePhoneLink(id, link)
  }

  // ── Load phones ───────────────────────────────────────────────────────────
  async function loadPhones() {
    if (!bearer) return
    setLoading(true)
    try {
      const list = await fetchAllPhones(bearer)
      setPhones(list)
      const grps = [...new Set(list.map(p => p.group?.name ?? p.groupName).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
      // Hydrate saved links into state for live preview
      setPhoneLinks(prev => {
        const n = { ...prev }
        list.forEach(p => { if (n[p.id] === undefined) { const v = loadPhoneLink(p.id); if (v) n[p.id] = v } })
        return n
      })
    } catch (_) { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { if (bearer && !conns.loading) loadPhones() }, [bearer, conns.loading])

  const phoneName = (p: GeelarkPhone) => p.serialName ?? p.name ?? p.serialNo ?? p.id.slice(-6)
  const phoneById = (id: string) => phones.find(p => p.id === id)

  const visiblePhones = phones.filter(p => {
    const grp = p.group?.name ?? p.groupName ?? null
    if (role && !canAccessPhoneGroup(role, perms, grp)) return false
    if (groupFilter !== 'Tous' && grp !== groupFilter) return false
    if (phoneSearch && !phoneName(p).toLowerCase().includes(phoneSearch.toLowerCase())) return false
    return true
  })

  function selectAll()  { setSelected(new Set(visiblePhones.map(p => p.id))) }
  function clearAll()   { setSelected(new Set()) }
  function togglePhone(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Assignment preview ────────────────────────────────────────────────────
  // Compute which photo/text each phone gets. Stable during run (frozen on launch).
  const selectedIds = [...selected]

  const buildAssignments = useCallback((ids: string[]) => {
    if (ids.length === 0 || photoPool.length === 0) return []
    const photoIndices = distribution === 'random'
      ? shuffleIndices(photoPool.length)
      : photoPool.map((_, i) => i)
    const textIndices = textPool.length > 0
      ? (distribution === 'random' ? shuffleIndices(textPool.length) : textPool.map((_, i) => i))
      : []
    return ids.map((id, i) => ({
      phoneId: id,
      photo: photoPool[photoIndices[i % photoIndices.length]],
      text:  textIndices.length > 0 ? textPool[textIndices[i % textIndices.length]] : '',
      link:  getLink(id).trim(),   // 1 link = 1 account
    }))
  }, [photoPool, textPool, distribution, phoneLinks])

  const previewAssignments = buildAssignments(selectedIds)

  // Phones selected but still missing their own link
  const missingLinkIds = selectedIds.filter(id => !getLink(id).trim())

  const canRun = !!bearer && selectedIds.length > 0 && photoPool.length > 0 && missingLinkIds.length === 0 && !running

  // ── Run ───────────────────────────────────────────────────────────────────
  async function run() {
    if (!canRun || !bearer) return
    abortRef.current = false
    const assignments = buildAssignments(selectedIds)
    setRunning(true)
    setOpenLog(null)
    setJobs(assignments.map(a => ({ phoneId: a.phoneId, status: 'idle', logs: [] })))

    function addLog(id: string, msg: string) {
      setJobs(prev => prev.map(j => j.phoneId === id ? { ...j, logs: [...j.logs, msg] } : j))
    }
    function setStatus(id: string, status: JobStatus) {
      setJobs(prev => prev.map(j => j.phoneId === id ? { ...j, status } : j))
    }

    let okCount = 0
    for (const asgn of assignments) {
      if (abortRef.current) break
      setStatus(asgn.phoneId, 'running')
      try {
        const res = await postInstagramStory(
          bearer, asgn.phoneId,
          { imageUrl: asgn.photo.url, linkUrl: asgn.link, linkText: asgn.text || undefined },
          m => addLog(asgn.phoneId, m),
        )
        if (res.ok) { setStatus(asgn.phoneId, 'ok'); okCount++ }
        else { setStatus(asgn.phoneId, 'error'); addLog(asgn.phoneId, `[err] ${res.error ?? 'Échec'}`) }
      } catch (e) {
        setStatus(asgn.phoneId, 'error')
        addLog(asgn.phoneId, `[err] ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        try { await stopPhone(bearer, asgn.phoneId) } catch (_) { /* ignore */ }
      }
    }
    if (okCount > 0) playSuccess(); else playError()
    setRunning(false)
  }

  // ── Job status helpers ────────────────────────────────────────────────────
  const jobFor = (id: string) => jobs.find(j => j.phoneId === id)
  const statusColor = (s?: JobStatus) =>
    s === 'ok' ? '#22c55e' : s === 'error' ? '#ef4444' : s === 'running' ? '#a78bfa' : 'rgba(148,163,184,0.28)'

  // ── No connection guard ───────────────────────────────────────────────────
  if (!conns.loading && !bearer) return (
    <div className="sf-page anim-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="sf-empty">
        <div className="sf-empty-icon" style={{ color: 'var(--accent-glow)' }}>
          <IconNoConnection />
        </div>
        <p className="sf-empty-title">GéeLark non connecté</p>
        <p className="sf-empty-desc">
          Ajoute ta clé GéeLark dans les Réglages pour automatiser des stories.
        </p>
      </div>
    </div>
  )

  return (
    <div className="sf-page anim-page">
      {showBankPicker && (
        <BankPicker user={user} mode="multi" resolveMode="signed-url"
          onSelect={(paths, titles) => {
            setPhotoPool(prev => {
              const next = [
                ...prev,
                ...paths.map((url, i) => ({ url, name: titles?.[i] ?? `photo ${prev.length + i + 1}` })),
              ]
              return next
            })
            setShowBankPicker(false)
          }}
          onClose={() => setShowBankPicker(false)}
        />
      )}

      {/* ── Premium Header ───────────────────────────────────────────────────── */}
      <header className="sf-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Icon with pink glow */}
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(236,72,153,0.22), rgba(236,72,153,0.06))',
            border: '1px solid rgba(236,72,153,0.3)',
            color: '#f472b6',
            boxShadow: '0 0 20px -6px rgba(236,72,153,0.55)',
          }}>
            <IconLink />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <h1 className="sf-page-title" style={{
                background: 'linear-gradient(135deg, #FFFFFF 0%, rgba(244,114,182,0.9) 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                StoryLink
              </h1>
              <span className="sf-badge sf-badge-new" style={{ fontSize: 9, letterSpacing: '0.1em' }}>NEW</span>
            </div>
            <p className="sf-page-sub">Configure les pools une fois, publie en 1 clic.</p>
          </div>
        </div>

        {/* Launch button */}
        <button
          onClick={run}
          disabled={!canRun}
          className={`sf-btn sf-btn-lg ${canRun ? 'sf-btn-primary' : 'sf-btn-secondary'}`}
          style={{ cursor: canRun ? 'pointer' : 'not-allowed', gap: 9,
            ...(canRun ? { background: 'linear-gradient(135deg, #7c3aed, #ec4899)', boxShadow: '0 6px 24px -6px rgba(236,72,153,0.5)' } : {})
          }}
        >
          {running ? (
            <>
              <span className="sf-spinner" style={{ width: 14, height: 14 }} />
              En cours…
            </>
          ) : (
            <>
              <IconSend />
              {`Publier${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
            </>
          )}
        </button>
      </header>

      {/* ── Body: 3-column split ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '272px 1fr 304px', minHeight: 0 }}>

        {/* ══ COL 1 — Phone selector ══════════════════════════════════════════ */}
        <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>

          {/* Toolbar */}
          <div style={{ flexShrink: 0, padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="sf-section-label" style={{ margin: 0 }}>Comptes</span>
              {selected.size > 0 && (
                <span className="sf-badge sf-badge-accent" style={{ fontSize: 10 }}>
                  {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {groups.length > 1 && (
              <select
                value={groupFilter}
                onChange={e => setGroupFilter(e.target.value)}
                className="sf-input"
                style={{ height: 32, marginBottom: 8, cursor: 'pointer', fontSize: 12 }}
              >
                {groups.map(g => <option key={g} value={g} style={{ background: '#0C0C15' }}>{g}</option>)}
              </select>
            )}

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-3)' }}>
                <IconSearch />
              </span>
              <input
                value={phoneSearch}
                onChange={e => setPhoneSearch(e.target.value)}
                placeholder="Rechercher…"
                className="sf-input"
                style={{ height: 32, paddingLeft: 32, fontSize: 12 }}
              />
            </div>

            {/* Select / Clear */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={selectAll} className="sf-btn sf-btn-secondary sf-btn-sm" style={{ flex: 1, cursor: 'pointer' }}>
                Tout sélectionner
              </button>
              <button onClick={clearAll} className="sf-btn sf-btn-ghost sf-btn-sm" style={{ flex: 1, cursor: 'pointer' }}>
                Effacer
              </button>
            </div>
          </div>

          {/* Phone list */}
          <div className="sf-scroll" style={{ flex: 1, padding: '6px 8px 10px' }}>
            {loadingPhones ? (
              <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div className="sf-spinner" />
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Chargement…</p>
              </div>
            ) : visiblePhones.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '24px 0', textAlign: 'center' }}>Aucun compte</p>
            ) : visiblePhones.map(p => {
              const sel = selected.has(p.id)
              const grp = p.group?.name ?? p.groupName
              const j = jobFor(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => togglePhone(p.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                    padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                    textAlign: 'left', marginBottom: 2,
                    background: sel ? 'rgba(236,72,153,0.1)' : 'transparent',
                    border: `1px solid ${sel ? 'rgba(236,72,153,0.32)' : 'transparent'}`,
                    transition: 'all 0.14s',
                  }}
                >
                  {/* Checkbox */}
                  <span style={{
                    width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: sel ? 'linear-gradient(135deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.05)',
                    border: sel ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    transition: 'all 0.14s',
                  }}>
                    {sel && <IconCheck />}
                  </span>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 12.5, fontWeight: sel ? 600 : 400,
                      color: sel ? 'var(--text-1)' : 'var(--text-2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {phoneName(p)}
                    </p>
                    {grp && (
                      <p style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{grp}</p>
                    )}
                  </div>

                  {/* Job status dot */}
                  {j && (
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: statusColor(j.status),
                      boxShadow: j.status === 'running' ? '0 0 6px #a78bfa' : 'none',
                    }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ══ COL 2 — Pool config (centre) ════════════════════════════════════ */}
        <div className="sf-scroll" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Photo pool ─────────────────────────────────────────────────── */}
          <div className="sf-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ color: 'var(--accent-glow)' }}><IconPhoto /></span>
                  <span className="sf-section-label" style={{ margin: 0 }}>Pool de photos</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Les images seront distribuées automatiquement entre les comptes.
                </p>
              </div>
              <button
                onClick={() => setShowBankPicker(true)}
                className="sf-btn sf-btn-secondary sf-btn-sm"
                style={{ cursor: 'pointer', flexShrink: 0, marginLeft: 12 }}
              >
                <IconPlus />
                Ajouter depuis la banque
              </button>
            </div>

            {photoPool.length === 0 ? (
              <button
                onClick={() => setShowBankPicker(true)}
                className="sf-empty"
                style={{
                  width: '100%', padding: '28px 0', borderRadius: 10, cursor: 'pointer',
                  border: '2px dashed rgba(139,92,246,0.18)',
                  background: 'rgba(139,92,246,0.03)',
                  color: 'var(--text-3)', fontSize: 13,
                  gap: 8,
                }}
              >
                <span style={{ color: 'var(--accent-glow)', opacity: 0.6 }}><IconPhoto /></span>
                <span>Aucune photo — cliquer pour en ajouter depuis la banque</span>
              </button>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {photoPool.map((ph, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(139,92,246,0.08)',
                    border: '1px solid rgba(139,92,246,0.18)',
                    maxWidth: 220,
                  }}>
                    <span style={{ color: '#a78bfa', flexShrink: 0 }}><IconPhotoSm /></span>
                    <span style={{ fontSize: 12, color: '#c4b5fd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ph.name}
                    </span>
                    <button
                      onClick={() => setPhotoPool(prev => prev.filter((_, j) => j !== i))}
                      aria-label="Retirer la photo"
                      className="sf-btn-icon"
                      style={{
                        flexShrink: 0, width: 18, height: 18, borderRadius: 5, cursor: 'pointer',
                        background: 'rgba(239,68,68,0.12)', border: 'none', color: '#f87171',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <IconX />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setShowBankPicker(true)}
                  className="sf-btn sf-btn-ghost sf-btn-sm"
                  style={{ cursor: 'pointer', border: '1px dashed rgba(139,92,246,0.22)', color: 'var(--accent-glow)' }}
                >
                  <IconPlus />
                  Ajouter
                </button>
              </div>
            )}
          </div>

          {/* ── Text pool ──────────────────────────────────────────────────── */}
          <div className="sf-card" style={{ padding: 18 }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <span style={{ color: 'var(--accent-glow)' }}><IconText /></span>
                <span className="sf-section-label" style={{ margin: 0 }}>Pool de textes sticker</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                Texte affiché sur le sticker lien. Laisse vide pour ne mettre que l'URL.
              </p>
            </div>

            {textPool.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                {textPool.map((txt, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 11px', borderRadius: 20,
                    background: 'rgba(34,211,238,0.07)',
                    border: '1px solid rgba(34,211,238,0.18)',
                  }}>
                    <span style={{ fontSize: 12.5, color: '#67e8f9' }}>{txt}</span>
                    <button
                      onClick={() => setTextPool(prev => prev.filter((_, j) => j !== i))}
                      aria-label="Retirer le texte"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(103,232,249,0.5)', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                    >
                      <IconX />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={editingText}
                onChange={e => setEditingText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && editingText.trim()) {
                    setTextPool(prev => [...prev, editingText.trim()])
                    setEditingText('')
                  }
                }}
                placeholder='Ex: "Regarde ici" puis Entrée…'
                className="sf-input"
                style={{ flex: 1, height: 36 }}
              />
              <button
                onClick={() => { if (editingText.trim()) { setTextPool(prev => [...prev, editingText.trim()]); setEditingText('') } }}
                disabled={!editingText.trim()}
                className="sf-btn sf-btn-secondary"
                style={{ cursor: editingText.trim() ? 'pointer' : 'not-allowed', opacity: editingText.trim() ? 1 : 0.4, color: '#67e8f9', borderColor: 'rgba(34,211,238,0.22)' }}
              >
                Ajouter
              </button>
            </div>
          </div>

          {/* ── Per-phone links status ──────────────────────────────────────── */}
          <div
            className="sf-card"
            style={{
              padding: 18,
              borderColor: missingLinkIds.length > 0 ? 'rgba(245,158,11,0.25)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ color: 'var(--accent-glow)' }}><IconLinkSm /></span>
                  <span className="sf-section-label" style={{ margin: 0 }}>Liens — 1 lien par compte</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Chaque compte a son propre lien, éditable dans l'aperçu et sauvegardé automatiquement.
                </p>
              </div>
              {selectedIds.length > 0 && (
                <span
                  className={`sf-badge ${missingLinkIds.length > 0 ? 'sf-badge-warn' : 'sf-badge-ok'}`}
                  style={{ flexShrink: 0 }}
                >
                  {selectedIds.length - missingLinkIds.length}/{selectedIds.length} liens
                </span>
              )}
            </div>

            {missingLinkIds.length > 0 && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 9,
                background: 'rgba(245,158,11,0.07)',
                border: '1px solid rgba(245,158,11,0.18)',
                display: 'flex', alignItems: 'flex-start', gap: 8,
                color: 'rgba(251,191,36,0.9)', fontSize: 12,
              }}>
                <span style={{ flexShrink: 0, marginTop: 1, color: '#fbbf24' }}><IconWarn /></span>
                <span>
                  {missingLinkIds.length} compte{missingLinkIds.length > 1 ? 's' : ''} sans lien — remplis-{missingLinkIds.length > 1 ? 'les' : 'le'} dans l'aperçu avant de publier.
                </span>
              </div>
            )}
          </div>

          {/* ── Distribution mode ───────────────────────────────────────────── */}
          <div className="sf-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
              <span style={{ color: 'var(--accent-glow)' }}><IconShuffle /></span>
              <span className="sf-section-label" style={{ margin: 0 }}>Distribution</span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {([
                { k: 'rotation' as const, icon: <IconRotate />, label: 'Rotation',   desc: 'A, B, C, A, B, C…' },
                { k: 'random'   as const, icon: <IconShuffle />, label: 'Aléatoire',  desc: 'Mélangé à chaque lancement' },
              ]).map(m => {
                const active = distribution === m.k
                return (
                  <button
                    key={m.k}
                    onClick={() => setDistrib(m.k)}
                    style={{
                      flex: 1, padding: '13px 14px', borderRadius: 11, textAlign: 'left', cursor: 'pointer',
                      background: active ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.025)',
                      border: `1px solid ${active ? 'rgba(139,92,246,0.35)' : 'var(--border)'}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ marginBottom: 7, color: active ? '#c4b5fd' : 'var(--text-3)' }}>{m.icon}</div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: active ? '#c4b5fd' : 'var(--text-2)', marginBottom: 2 }}>{m.label}</p>
                    <p style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{m.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ══ COL 3 — Preview + assignment logs ═══════════════════════════════ */}
        <div style={{ borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>

          {/* Preview header */}
          <div style={{ flexShrink: 0, padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <span className="sf-section-label">Aperçu des assignations</span>
            {selectedIds.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-4)' }}>Sélectionne des comptes</p>
            ) : photoPool.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-4)' }}>Ajoute des photos dans le pool</p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {selectedIds.length} compte{selectedIds.length > 1 ? 's' : ''} · {photoPool.length} photo{photoPool.length > 1 ? 's' : ''}{textPool.length > 0 ? ` · ${textPool.length} texte${textPool.length > 1 ? 's' : ''}` : ''}
              </p>
            )}
          </div>

          {/* Assignment list */}
          <div className="sf-scroll" style={{ flex: 1, padding: '8px 10px' }}>
            {previewAssignments.length === 0 ? (
              <div className="sf-empty" style={{ padding: '48px 24px' }}>
                <div className="sf-empty-icon" style={{ color: 'var(--text-3)' }}>
                  <IconTarget />
                </div>
                <p className="sf-empty-title" style={{ fontSize: 13 }}>Aucune assignation</p>
                <p className="sf-empty-desc" style={{ fontSize: 12 }}>Sélectionne des comptes et ajoute des photos.</p>
              </div>
            ) : previewAssignments.map(a => {
              const p = phoneById(a.phoneId)
              const j = jobFor(a.phoneId)
              const hasLog = j && j.logs.length > 0
              const borderCol = j?.status === 'error' ? 'rgba(239,68,68,0.22)' : j?.status === 'ok' ? 'rgba(34,197,94,0.22)' : 'var(--border)'
              return (
                <div
                  key={a.phoneId}
                  style={{ marginBottom: 7, borderRadius: 10, overflow: 'hidden', border: `1px solid ${borderCol}` }}
                >
                  {/* Phone row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: 'rgba(255,255,255,0.018)' }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: statusColor(j?.status),
                      boxShadow: j?.status === 'running' ? '0 0 6px #a78bfa' : 'none',
                      transition: 'all 0.2s',
                    }} />
                    <span style={{
                      flex: 1, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: j?.status === 'ok' ? '#4ade80' : j?.status === 'error' ? '#f87171' : 'var(--text-1)',
                    }}>
                      {p ? phoneName(p) : a.phoneId.slice(-6)}
                    </span>
                    {hasLog && (
                      <button
                        onClick={() => setOpenLog(openLog === a.phoneId ? null : a.phoneId)}
                        aria-label={openLog === a.phoneId ? 'Masquer les logs' : 'Afficher les logs'}
                        className="sf-btn sf-btn-ghost sf-btn-sm"
                        style={{ padding: '2px 6px', height: 22, cursor: 'pointer', color: 'var(--text-3)' }}
                      >
                        <IconChevron open={openLog === a.phoneId} />
                      </button>
                    )}
                  </div>

                  {/* Details */}
                  <div style={{ padding: '7px 11px 10px', fontSize: 11, lineHeight: 1.65 }}>
                    {/* Photo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(167,139,250,0.75)', marginBottom: 3 }}>
                      <span style={{ flexShrink: 0 }}><IconPhotoSm /></span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.photo.name}</span>
                    </div>

                    {/* Text sticker */}
                    {a.text && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', marginBottom: 3 }}>
                        <span style={{ flexShrink: 0 }}><IconTextSm /></span>
                        <span style={{ fontStyle: 'italic' }}>"{a.text}"</span>
                      </div>
                    )}

                    {/* Per-phone link — editable */}
                    <div style={{ position: 'relative', marginTop: 6 }}>
                      <span style={{
                        position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                        pointerEvents: 'none', color: getLink(a.phoneId).trim() ? '#22d3ee' : 'var(--text-4)',
                      }}>
                        <IconLinkSm />
                      </span>
                      <input
                        value={getLink(a.phoneId)}
                        onChange={e => setLink(a.phoneId, e.target.value)}
                        disabled={running}
                        placeholder="lien de ce compte…"
                        className="sf-input"
                        style={{
                          height: 30, paddingLeft: 26, paddingRight: getLink(a.phoneId).trim() ? 28 : 9,
                          fontSize: 11.5, borderRadius: 8,
                          borderColor: getLink(a.phoneId).trim() ? 'rgba(34,211,238,0.28)' : 'rgba(245,158,11,0.28)',
                        }}
                      />
                      {getLink(a.phoneId).trim() && (
                        <span style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          pointerEvents: 'none', display: 'inline-flex', color: '#22d3ee',
                        }} title="Enregistré" aria-label="Enregistré">
                          <IconSave />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Log panel */}
                  {openLog === a.phoneId && j && j.logs.length > 0 && (
                    <div style={{
                      borderTop: '1px solid var(--border)',
                      padding: '8px 11px',
                      background: 'rgba(7,7,11,0.9)',
                      fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.7,
                      maxHeight: 180, overflowY: 'auto',
                    }}>
                      {j.logs.map((l, i) => (
                        <div key={i} style={{
                          color: l.startsWith('[err]') ? '#f87171' : l.includes('ok') ? '#4ade80' : 'var(--text-2)',
                        }}>
                          {l}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Stop button */}
          {running && (
            <div style={{ flexShrink: 0, padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => { abortRef.current = true; setRunning(false) }}
                className="sf-btn sf-btn-danger"
                style={{ width: '100%', cursor: 'pointer', justifyContent: 'center' }}
              >
                <IconStop />
                Arrêter
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
