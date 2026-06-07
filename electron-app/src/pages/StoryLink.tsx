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
const LS_LINK       = 'sf-story-link-global'
const LS_DISTRIB    = 'sf-story-distribution'

function loadPhotoPool(): PoolPhoto[] {
  try { return JSON.parse(localStorage.getItem(LS_PHOTO_POOL) ?? '[]') } catch { return [] }
}
function loadTextPool(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_TEXT_POOL) ?? '[]') } catch { return [] }
}
function loadGlobalLink(): string {
  return localStorage.getItem(LS_LINK) ?? ''
}
function loadDistrib(): Distribution {
  return (localStorage.getItem(LS_DISTRIB) as Distribution | null) ?? 'rotation'
}

function savePhotoPool(v: PoolPhoto[]) { localStorage.setItem(LS_PHOTO_POOL, JSON.stringify(v)) }
function saveTextPool(v: string[])     { localStorage.setItem(LS_TEXT_POOL,  JSON.stringify(v)) }
function saveGlobalLink(v: string)     { localStorage.setItem(LS_LINK,       v) }
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
  const [globalLink, setGlobalLink]   = useState(loadGlobalLink)
  const [distribution, setDistrib]    = useState<Distribution>(loadDistrib)

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
  useEffect(() => saveGlobalLink(globalLink), [globalLink])
  useEffect(() => saveDistrib(distribution),  [distribution])

  // ── Load phones ───────────────────────────────────────────────────────────
  async function loadPhones() {
    if (!bearer) return
    setLoading(true)
    try {
      const list = await fetchAllPhones(bearer)
      setPhones(list)
      const grps = [...new Set(list.map(p => p.group?.name ?? p.groupName).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
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
      link:  globalLink.trim(),
    }))
  }, [photoPool, textPool, globalLink, distribution])

  const previewAssignments = buildAssignments(selectedIds)

  const canRun = !!bearer && selectedIds.length > 0 && photoPool.length > 0 && globalLink.trim() !== '' && !running

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
        else { setStatus(asgn.phoneId, 'error'); addLog(asgn.phoneId, `❌ ${res.error ?? 'Échec'}`) }
      } catch (e) {
        setStatus(asgn.phoneId, 'error')
        addLog(asgn.phoneId, `❌ ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        try { await stopPhone(bearer, asgn.phoneId) } catch (_) { /* ignore */ }
      }
    }
    if (okCount > 0) playSuccess(); else playError()
    setRunning(false)
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    borderRadius: 14, padding: 16,
    background: 'rgba(14,14,22,0.7)',
    border: '1px solid rgba(255,255,255,0.07)',
  }
  const inputS: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px', borderRadius: 9, fontSize: 13,
    background: 'rgba(14,14,22,0.8)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#e8e6f0', outline: 'none',
  }
  const label: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
    color: 'rgba(167,139,250,0.7)', marginBottom: 9, display: 'block',
  }

  if (!conns.loading && !bearer) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <p style={{ fontSize: 36, marginBottom: 14 }}>🔌</p>
        <h2 style={{ fontSize: 19, fontWeight: 700, color: '#e8e6f0', marginBottom: 8 }}>GéeLark non connecté</h2>
        <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.6)', lineHeight: 1.6 }}>
          Ajoute ta clé GéeLark dans les Réglages pour automatiser des stories.
        </p>
      </div>
    </div>
  )

  const jobFor = (id: string) => jobs.find(j => j.phoneId === id)
  const dot = (s?: JobStatus) =>
    s === 'ok' ? '#22c55e' : s === 'error' ? '#ef4444' : s === 'running' ? '#a78bfa' : 'rgba(148,163,184,0.28)'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#07070B' }}>
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

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '18px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.055)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          {/* Gradient glow */}
          <div style={{ position: 'absolute', width: 200, height: 80, background: 'radial-gradient(ellipse, rgba(236,72,153,0.18) 0%, transparent 70%)', filter: 'blur(30px)', pointerEvents: 'none', transform: 'translateY(-50%)' }} />
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0, position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(236,72,153,0.22), rgba(236,72,153,0.06))',
            border: '1px solid rgba(236,72,153,0.28)', color: '#f472b6',
            boxShadow: '0 0 20px -6px rgba(236,72,153,0.5)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <h1 style={{ fontSize: 23, fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.1, margin: 0,
                background: 'linear-gradient(135deg,#FFFFFF 0%,rgba(244,114,182,0.85) 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Story</h1>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 5, background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.28)' }}>BETA</span>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', marginTop: 3 }}>
              Configure les pools une fois, lance en 1 clic.
            </p>
          </div>
        </div>

        {/* Launch button — top right for easy access */}
        <button onClick={run} disabled={!canRun}
          style={{
            height: 46, padding: '0 26px', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: canRun ? 'pointer' : 'not-allowed',
            background: canRun ? 'linear-gradient(135deg, #7c3aed, #ec4899)' : 'rgba(255,255,255,0.05)',
            border: 'none', color: canRun ? '#fff' : 'rgba(148,163,184,0.35)',
            boxShadow: canRun ? '0 6px 24px -6px rgba(236,72,153,0.55)' : 'none', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', gap: 9,
          }}>
          {running
            ? <><svg style={{ animation: 'spin 1s linear infinite' }} width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40" strokeDashoffset="10"/></svg>En cours…</>
            : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>{`Publier${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}</>
          }
        </button>
      </div>

      {/* ── Body: 3 columns ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '280px 1fr 300px', gap: 0, minHeight: 0 }}>

        {/* ══ COL 1: Phones ══════════════════════════════════════════════════ */}
        <div style={{ borderRight: '1px solid rgba(255,255,255,0.055)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'linear-gradient(180deg,#08080F 0%,#07070B 100%)' }}>

          <div style={{ flexShrink: 0, padding: '14px 16px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={label}>Comptes</span>
              {selected.size > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: 'linear-gradient(135deg,#7c3aed,#ec4899)', color: '#fff' }}>
                  {selected.size}
                </span>
              )}
            </div>

            {groups.length > 1 && (
              <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                style={{ ...inputS, height: 34, marginBottom: 7, cursor: 'pointer', fontSize: 12 }}>
                {groups.map(g => <option key={g} value={g} style={{ background: '#0E0E16' }}>{g}</option>)}
              </select>
            )}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="5" cy="5" r="3.5" stroke="rgba(139,92,246,0.5)" strokeWidth="1.3"/>
                <path d="M7.5 7.5L10 10" stroke="rgba(139,92,246,0.5)" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
                placeholder="Rechercher…" style={{ ...inputS, height: 34, paddingLeft: 28, fontSize: 12 }} />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={selectAll} style={{ flex: 1, height: 30, borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(139,92,246,0.13)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
                Tout sélectionner
              </button>
              <button onClick={clearAll} style={{ flex: 1, height: 30, borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.55)' }}>
                Effacer
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px' }}>
            {loadingPhones ? (
              <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)', padding: 20, textAlign: 'center' }}>Chargement…</p>
            ) : visiblePhones.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)', padding: 20, textAlign: 'center' }}>Aucun compte</p>
            ) : visiblePhones.map(p => {
              const sel = selected.has(p.id)
              const grp = p.group?.name ?? p.groupName
              const j = jobFor(p.id)
              return (
                <button key={p.id} onClick={() => togglePhone(p.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px',
                    borderRadius: 9, cursor: 'pointer', textAlign: 'left', marginBottom: 3,
                    background: sel ? 'rgba(236,72,153,0.12)' : 'transparent',
                    border: `1px solid ${sel ? 'rgba(236,72,153,0.35)' : 'transparent'}`,
                    transition: 'all 0.14s',
                  }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: sel ? 'linear-gradient(135deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.06)',
                    border: sel ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  }}>
                    {sel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? '#fff' : 'rgba(226,232,240,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneName(p)}</p>
                    {grp && <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)', marginTop: 1 }}>{grp}</p>}
                  </div>
                  {j ? (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dot(j.status), boxShadow: j.status === 'running' ? '0 0 6px #a78bfa' : 'none' }} />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* ══ COL 2: Pool config (centre) ════════════════════════════════════ */}
        <div style={{ overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* ── Photo pool ── */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
              <div>
                <span style={label}>📸 Pool de photos</span>
                <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', marginTop: -5 }}>
                  Les images seront distribuées automatiquement entre les téléphones.
                </p>
              </div>
              <button onClick={() => setShowBankPicker(true)}
                style={{ flexShrink: 0, height: 33, padding: '0 14px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(139,92,246,0.13)', border: '1px solid rgba(139,92,246,0.28)', color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Ajouter depuis la banque
              </button>
            </div>

            {photoPool.length === 0 ? (
              <button onClick={() => setShowBankPicker(true)}
                style={{ width: '100%', padding: '28px 0', borderRadius: 10, border: '2px dashed rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.04)', cursor: 'pointer', color: 'rgba(148,163,184,0.45)', fontSize: 13 }}>
                Aucune photo — cliquer pour en ajouter depuis la banque
              </button>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {photoPool.map((ph, i) => (
                  <div key={i} style={{
                    position: 'relative', borderRadius: 9, overflow: 'hidden',
                    background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                    maxWidth: 220,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span style={{ fontSize: 12, color: '#c4b5fd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ph.name}</span>
                    <button onClick={() => setPhotoPool(prev => prev.filter((_, j) => j !== i))}
                      style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, background: 'rgba(239,68,68,0.15)', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✕</button>
                  </div>
                ))}
                <button onClick={() => setShowBankPicker(true)}
                  style={{ height: 36, padding: '0 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'rgba(139,92,246,0.07)', border: '1px dashed rgba(139,92,246,0.22)', color: 'rgba(167,139,250,0.6)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Ajouter
                </button>
              </div>
            )}
          </div>

          {/* ── Text pool ── */}
          <div style={card}>
            <div style={{ marginBottom: 13 }}>
              <span style={label}>💬 Pool de textes sticker</span>
              <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', marginTop: -5 }}>
                Texte affiché sur le sticker lien. Laisse vide pour ne mettre que l'URL.
              </p>
            </div>

            {textPool.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                {textPool.map((txt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 20, background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)' }}>
                    <span style={{ fontSize: 12.5, color: '#67e8f9' }}>{txt}</span>
                    <button onClick={() => setTextPool(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(103,232,249,0.5)', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <input value={editingText} onChange={e => setEditingText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && editingText.trim()) {
                    setTextPool(prev => [...prev, editingText.trim()])
                    setEditingText('')
                  }
                }}
                placeholder='Ex: "Regarde ici 👆" puis Entrée…'
                style={{ ...inputS, flex: 1, height: 38 }} />
              <button
                onClick={() => { if (editingText.trim()) { setTextPool(prev => [...prev, editingText.trim()]); setEditingText('') } }}
                disabled={!editingText.trim()}
                style={{ flexShrink: 0, height: 38, padding: '0 14px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'rgba(34,211,238,0.13)', border: '1px solid rgba(34,211,238,0.25)', color: '#67e8f9', opacity: editingText.trim() ? 1 : 0.4 }}>
                Ajouter
              </button>
            </div>
          </div>

          {/* ── Global link ── */}
          <div style={card}>
            <div style={{ marginBottom: 12 }}>
              <span style={label}>🔗 Lien du sticker (global)</span>
              <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', marginTop: -5 }}>
                Même lien pour tous les comptes. Enregistré automatiquement.
              </p>
            </div>
            <div style={{ position: 'relative' }}>
              <input value={globalLink} onChange={e => setGlobalLink(e.target.value)}
                placeholder="https://example.com/landing"
                style={{ ...inputS, paddingRight: globalLink ? 75 : 12, borderColor: globalLink ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.08)' }} />
              {globalLink && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none' }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(34,211,238,0.8)' }}>ENREG. 💾</span>
                </span>
              )}
            </div>
          </div>

          {/* ── Distribution mode ── */}
          <div style={card}>
            <span style={label}>🔀 Distribution</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { k: 'rotation' as const, icon: '🔁', l: 'Rotation',  desc: 'A, B, C, A, B, C…' },
                { k: 'random'   as const, icon: '🎲', l: 'Aléatoire', desc: 'mélangé à chaque lancement' },
              ]).map(m => (
                <button key={m.k} onClick={() => setDistrib(m.k)}
                  style={{
                    flex: 1, padding: '12px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                    background: distribution === m.k ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.03)',
                    outline: distribution === m.k ? '1px solid rgba(139,92,246,0.35)' : '1px solid rgba(255,255,255,0.06)',
                  }}>
                  <div style={{ fontSize: 17, marginBottom: 5 }}>{m.icon}</div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: distribution === m.k ? '#c4b5fd' : 'rgba(226,232,240,0.6)' }}>{m.l}</p>
                  <p style={{ fontSize: 10.5, color: 'rgba(148,163,184,0.4)', marginTop: 2 }}>{m.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ══ COL 3: Preview + logs ══════════════════════════════════════════ */}
        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.055)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'linear-gradient(180deg,#08080F 0%,#07070B 100%)' }}>

          <div style={{ flexShrink: 0, padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
            <span style={label}>Aperçu des assignations</span>
            {selectedIds.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)' }}>Sélectionne des téléphones</p>
            ) : photoPool.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)' }}>Ajoute des photos dans le pool</p>
            ) : (
              <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)' }}>
                {selectedIds.length} compte{selectedIds.length > 1 ? 's' : ''} · {photoPool.length} photo{photoPool.length > 1 ? 's' : ''}{textPool.length > 0 ? ` · ${textPool.length} texte${textPool.length > 1 ? 's' : ''}` : ''}
              </p>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            {previewAssignments.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(148,163,184,0.3)', fontSize: 12 }}>
                <p style={{ fontSize: 28, marginBottom: 10 }}>🎯</p>
                <p>Sélectionne des comptes<br/>et ajoute des photos</p>
              </div>
            ) : previewAssignments.map(a => {
              const p = phoneById(a.phoneId)
              const j = jobFor(a.phoneId)
              const hasLog = j && j.logs.length > 0
              return (
                <div key={a.phoneId} style={{ marginBottom: 7, borderRadius: 10, overflow: 'hidden', border: `1px solid ${j?.status === 'error' ? 'rgba(239,68,68,0.2)' : j?.status === 'ok' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.055)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'rgba(255,255,255,0.025)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dot(j?.status), boxShadow: j?.status === 'running' ? '0 0 6px #a78bfa' : 'none' }} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: j?.status === 'ok' ? '#4ade80' : j?.status === 'error' ? '#f87171' : '#e8e6f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p ? phoneName(p) : a.phoneId.slice(-6)}
                    </span>
                    {hasLog && (
                      <button onClick={() => setOpenLog(openLog === a.phoneId ? null : a.phoneId)}
                        style={{ fontSize: 10, color: 'rgba(148,163,184,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 4, flexShrink: 0 }}>
                        {openLog === a.phoneId ? '▲' : '▼'}
                      </button>
                    )}
                  </div>

                  <div style={{ padding: '7px 12px 9px', fontSize: 11, lineHeight: 1.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(167,139,250,0.7)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{a.photo.name}</span>
                    </div>
                    {a.link && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(34,211,238,0.65)', marginTop: 2 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{a.link.replace('https://', '')}</span>
                      </div>
                    )}
                    {a.text && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(148,163,184,0.5)', marginTop: 2 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <span style={{ fontStyle: 'italic' }}>"{a.text}"</span>
                      </div>
                    )}
                  </div>

                  {openLog === a.phoneId && j && j.logs.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '8px 12px', background: 'rgba(8,8,14,0.8)', fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.7, maxHeight: 180, overflowY: 'auto' }}>
                      {j.logs.map((l, i) => (
                        <div key={i} style={{ color: l.startsWith('❌') ? '#f87171' : l.startsWith('✅') ? '#4ade80' : 'rgba(226,232,240,0.6)' }}>{l}</div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Stop button */}
          {running && (
            <div style={{ flexShrink: 0, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <button onClick={() => { abortRef.current = true; setRunning(false) }}
                style={{ width: '100%', height: 38, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)', color: '#f87171' }}>
                ⏹ Arrêter
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
