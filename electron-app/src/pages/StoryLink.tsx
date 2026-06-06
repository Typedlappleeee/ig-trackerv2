import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { fetchAllPhones, postInstagramStory, stopPhone, type GeelarkPhone } from '@/lib/geelark'
import { BankPicker } from '@/pages/Bank'
import { playSuccess, playError } from '@/lib/sounds'

type StoryCfg = { imageUrl: string; imageName: string; linkUrl: string; linkText: string }
type JobStatus = 'idle' | 'running' | 'ok' | 'error'
type Job = { phoneId: string; status: JobStatus; logs: string[] }

const emptyCfg = (): StoryCfg => ({ imageUrl: '', imageName: '', linkUrl: '', linkText: '' })

// ── Per-phone link persistence (localStorage) ─────────────────────────────────
const lsKey = (id: string) => `sf-story-link-${id}`

function loadSavedLink(id: string): { linkUrl: string; linkText: string } | null {
  try {
    const raw = localStorage.getItem(lsKey(id))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function persistLink(id: string, linkUrl: string, linkText: string) {
  try {
    if (!linkUrl.trim() && !linkText.trim()) localStorage.removeItem(lsKey(id))
    else localStorage.setItem(lsKey(id), JSON.stringify({ linkUrl, linkText }))
  } catch { /* ignore */ }
}

export default function StoryLink({ user }: { user: User }) {
  const conns  = useConnections(user)
  const bearer = conns.bearer
  const { role, perms } = useOrg()

  const [phones, setPhones]               = useState<GeelarkPhone[]>([])
  const [loadingPhones, setLoadingPhones] = useState(false)
  const [phoneSearch, setPhoneSearch]     = useState('')
  const [groupFilter, setGroupFilter]     = useState('Tous')
  const [groups, setGroups]               = useState<string[]>(['Tous'])
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [pickMode, setPickMode]           = useState<'phones' | 'groups'>('phones')

  const [configs, setConfigs]             = useState<Record<string, StoryCfg>>({})
  const [bankTarget, setBankTarget]       = useState<string | 'all' | null>(null)

  const [running, setRunning]             = useState(false)
  const [jobs, setJobs]                   = useState<Job[]>([])
  const [openLog, setOpenLog]             = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => () => { abortRef.current = true }, [])

  // ── Load phones ───────────────────────────────────────────────────────────
  async function loadPhones() {
    if (!bearer) return
    setLoadingPhones(true)
    try {
      const list = await fetchAllPhones(bearer)
      setPhones(list)
      const grps = [...new Set(list.map(p => p.group?.name ?? p.groupName).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
    } catch (_) { /* ignore */ }
    setLoadingPhones(false)
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

  function cfgWithSaved(id: string, existing?: StoryCfg): StoryCfg {
    if (existing) return existing
    const saved = loadSavedLink(id)
    return { ...emptyCfg(), ...(saved ?? {}) }
  }

  function togglePhone(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id) }
      else { n.add(id); setConfigs(c => ({ ...c, [id]: cfgWithSaved(id, c[id]) })) }
      return n
    })
  }
  function selectAllVisible() {
    setSelected(new Set(visiblePhones.map(p => p.id)))
    setConfigs(c => {
      const n = { ...c }
      visiblePhones.forEach(p => { if (!n[p.id]) n[p.id] = cfgWithSaved(p.id) })
      return n
    })
  }
  function clearSelection() { setSelected(new Set()) }

  // Phones belonging to a group (respecting permissions)
  function phonesInGroup(g: string) {
    return phones.filter(p => {
      const grp = p.group?.name ?? p.groupName ?? null
      if (role && !canAccessPhoneGroup(role, perms, grp)) return false
      return grp === g
    })
  }
  // Toggle an entire group's phones in/out of the selection
  function toggleGroup(g: string) {
    const inGroup = phonesInGroup(g)
    const allSelected = inGroup.length > 0 && inGroup.every(p => selected.has(p.id))
    setSelected(prev => {
      const n = new Set(prev)
      if (allSelected) inGroup.forEach(p => n.delete(p.id))
      else inGroup.forEach(p => n.add(p.id))
      return n
    })
    if (!allSelected) {
      setConfigs(c => {
        const n = { ...c }
        inGroup.forEach(p => { if (!n[p.id]) n[p.id] = cfgWithSaved(p.id, c[p.id]) })
        return n
      })
    }
  }

  function setCfg(id: string, patch: Partial<StoryCfg>) {
    setConfigs(c => {
      const updated = { ...(c[id] ?? emptyCfg()), ...patch }
      if ('linkUrl' in patch || 'linkText' in patch) {
        persistLink(id, updated.linkUrl, updated.linkText)
      }
      return { ...c, [id]: updated }
    })
  }
  // Apply the first selected phone's config to all others
  function applyToAll() {
    const ids = [...selected]
    if (ids.length < 2) return
    const src = configs[ids[0]] ?? emptyCfg()
    setConfigs(c => {
      const n = { ...c }
      ids.forEach(id => { n[id] = { ...src } })
      return n
    })
  }

  // ── Run ───────────────────────────────────────────────────────────────────
  const selectedIds = [...selected]
  const readyIds = selectedIds.filter(id => {
    const cfg = configs[id]
    return cfg && cfg.imageUrl.trim() && cfg.linkUrl.trim()
  })
  const canRun = !!bearer && readyIds.length > 0 && !running

  function addLog(id: string, msg: string) {
    setJobs(prev => prev.map(j => j.phoneId === id ? { ...j, logs: [...j.logs, msg] } : j))
  }
  function setJobStatus(id: string, status: JobStatus) {
    setJobs(prev => prev.map(j => j.phoneId === id ? { ...j, status } : j))
  }

  async function run() {
    if (!canRun || !bearer) return
    abortRef.current = false
    setRunning(true)
    setJobs(readyIds.map(id => ({ phoneId: id, status: 'idle', logs: [] })))
    setOpenLog(readyIds[0] ?? null)

    let okCount = 0
    for (const id of readyIds) {
      if (abortRef.current) break
      const cfg = configs[id]!
      setJobStatus(id, 'running')
      try {
        const res = await postInstagramStory(
          bearer, id,
          { imageUrl: cfg.imageUrl.trim(), linkUrl: cfg.linkUrl.trim(), linkText: cfg.linkText.trim() || undefined },
          m => addLog(id, m),
        )
        if (res.ok) { setJobStatus(id, 'ok'); okCount++ }
        else { setJobStatus(id, 'error'); addLog(id, `❌ ${res.error ?? 'Échec'}`) }
      } catch (e) {
        setJobStatus(id, 'error'); addLog(id, `❌ ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        try { await stopPhone(bearer, id) } catch (_) { /* ignore */ }
      }
    }
    if (okCount > 0) playSuccess(); else playError()
    setRunning(false)
  }

  function stop() { abortRef.current = true; setRunning(false) }

  // ── Styles ────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 42, padding: '0 13px', borderRadius: 10, fontSize: 13.5,
    background: 'rgba(14,14,22,0.8)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#e8e6f0', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
  }
  const focusOn  = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)' }
  const focusOff = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 9, display: 'block' }

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!conns.loading && !bearer) {
    return (
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <p style={{ fontSize: 36, marginBottom: 14 }}>🔌</p>
          <h2 style={{ fontSize: 19, fontWeight: 700, color: '#e8e6f0', marginBottom: 8 }}>GéeLark non connecté</h2>
          <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.6)', lineHeight: 1.6 }}>
            Ajoute ta clé GéeLark dans les Réglages pour automatiser des stories.
          </p>
        </div>
      </div>
    )
  }

  const jobFor = (id: string) => jobs.find(j => j.phoneId === id)
  const statusDot = (s: JobStatus) => s === 'ok' ? '#22c55e' : s === 'error' ? '#ef4444' : s === 'running' ? '#a78bfa' : 'rgba(148,163,184,0.3)'

  return (
    <div style={{ minHeight: '100%', padding: '32px 36px 80px' }}>
      {bankTarget && (
        <BankPicker
          user={user}
          mode="single"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const url = paths[0]; const name = titles?.[0] ?? 'image banque'
            if (url) {
              if (bankTarget === 'all') {
                setConfigs(c => {
                  const n = { ...c }
                  selectedIds.forEach(id => { n[id] = { ...(n[id] ?? emptyCfg()), imageUrl: url, imageName: name } })
                  return n
                })
              } else {
                setCfg(bankTarget, { imageUrl: url, imageName: name })
              }
            }
            setBankTarget(null)
          }}
          onClose={() => setBankTarget(null)}
        />
      )}

      <div style={{ maxWidth: 1240, margin: '0 auto', animation: 'page-fade-in 0.4s ease both' }}>

        {/* Header */}
        <div style={{ position: 'relative', marginBottom: 26 }}>
          <div style={{ position: 'absolute', top: -50, left: 0, width: 360, height: 150, background: 'radial-gradient(ellipse, rgba(236,72,153,0.13) 0%, transparent 70%)', filter: 'blur(45px)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(236,72,153,0.22), rgba(236,72,153,0.06))',
              border: '1px solid rgba(236,72,153,0.25)', color: '#f472b6',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.025em', color: '#f2f0ff' }}>Story</h1>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.28)' }}>BETA</span>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.62)', marginTop: 5 }}>
                Publie une story avec sticker lien sur plusieurs comptes — image et lien configurables par téléphone.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', gap: 24 }}>

          {/* ── Left: phone selection ──────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Comptes</label>

            {/* Téléphones / Groupes toggle */}
            <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 11, marginBottom: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {([{ k: 'phones', l: 'Téléphones' }, { k: 'groups', l: 'Groupes' }] as const).map(m => (
                <button key={m.k} onClick={() => setPickMode(m.k)} className="sf-press"
                  style={{
                    flex: 1, height: 32, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: pickMode === m.k ? 'rgba(139,92,246,0.2)' : 'transparent',
                    color: pickMode === m.k ? '#c4b5fd' : 'rgba(148,163,184,0.6)',
                    transition: 'all 0.15s',
                  }}>{m.l}</button>
              ))}
            </div>

            {pickMode === 'phones' ? (
              <>
                {/* Group filter + search */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                    style={{ ...inputStyle, width: 'auto', flex: '0 0 110px', cursor: 'pointer' }}>
                    {groups.map(g => <option key={g} value={g} style={{ background: '#0E0E16' }}>{g}</option>)}
                  </select>
                  <input value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
                    placeholder="Rechercher…" style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
                </div>

                {/* Select all / clear */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={selectAllVisible} className="sf-press"
                    style={{ flex: 1, height: 34, borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
                    Tout sélectionner
                  </button>
                  <button onClick={clearSelection} className="sf-press"
                    style={{ flex: 1, height: 34, borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.6)' }}>
                    Effacer
                  </button>
                </div>

                {/* Phone list */}
                <div style={{ maxHeight: 480, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: 8, background: 'rgba(13,13,20,0.5)' }}>
                  {loadingPhones ? (
                    <p style={{ fontSize: 12.5, color: 'rgba(148,163,184,0.5)', padding: 14, textAlign: 'center' }}>Chargement…</p>
                  ) : visiblePhones.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: 'rgba(148,163,184,0.5)', padding: 14, textAlign: 'center' }}>Aucun compte</p>
                  ) : visiblePhones.map(p => {
                    const sel = selected.has(p.id)
                    const grp = p.group?.name ?? p.groupName
                    const j = jobFor(p.id)
                    return (
                      <button key={p.id} onClick={() => togglePhone(p.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                          background: sel ? 'rgba(236,72,153,0.13)' : 'transparent',
                          border: `1px solid ${sel ? 'rgba(236,72,153,0.38)' : 'transparent'}`,
                          transition: 'all 0.15s',
                        }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: sel ? 'linear-gradient(135deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.05)',
                          border: sel ? 'none' : '1px solid rgba(255,255,255,0.12)',
                        }}>
                          {sel && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13.5, fontWeight: sel ? 600 : 400, color: sel ? '#fff' : 'rgba(226,232,240,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneName(p)}</p>
                          {grp && <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginTop: 1 }}>{grp}</p>}
                        </div>
                        {loadSavedLink(p.id) && !j && (
                          <span title="Lien enregistré" style={{ fontSize: 10, color: 'rgba(34,211,238,0.7)', flexShrink: 0 }}>🔗</span>
                        )}
                        {j && <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: statusDot(j.status), boxShadow: j.status === 'running' ? '0 0 6px #a78bfa' : 'none' }} />}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              /* Groups mode — select whole groups at once */
              <div style={{ maxHeight: 560, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: 8, background: 'rgba(13,13,20,0.5)' }}>
                {groups.filter(g => g !== 'Tous').length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'rgba(148,163,184,0.5)', padding: 14, textAlign: 'center' }}>Aucun groupe</p>
                ) : groups.filter(g => g !== 'Tous').map(g => {
                  const inGroup = phonesInGroup(g)
                  const selCount = inGroup.filter(p => selected.has(p.id)).length
                  const allSel = inGroup.length > 0 && selCount === inGroup.length
                  return (
                    <button key={g} onClick={() => toggleGroup(g)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        background: selCount > 0 ? 'rgba(236,72,153,0.12)' : 'transparent',
                        border: `1px solid ${selCount > 0 ? 'rgba(236,72,153,0.35)' : 'transparent'}`,
                        transition: 'all 0.15s',
                      }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: allSel ? 'linear-gradient(135deg,#7c3aed,#ec4899)' : selCount > 0 ? 'rgba(236,72,153,0.4)' : 'rgba(255,255,255,0.05)',
                        border: selCount > 0 ? 'none' : '1px solid rgba(255,255,255,0.12)',
                      }}>
                        {allSel && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                        {!allSel && selCount > 0 && <span style={{ width: 8, height: 2, background: '#fff', borderRadius: 1 }} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: selCount > 0 ? 600 : 400, color: selCount > 0 ? '#fff' : 'rgba(226,232,240,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g}</p>
                        <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginTop: 1 }}>{selCount}/{inGroup.length} compte{inGroup.length > 1 ? 's' : ''}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', marginTop: 10 }}>
              {selected.size} sélectionné{selected.size > 1 ? 's' : ''} · {readyIds.length} prêt{readyIds.length > 1 ? 's' : ''}
            </p>
          </div>

          {/* ── Right: per-phone config ────────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Configuration par téléphone</label>
              {selected.size >= 2 && (
                <button onClick={applyToAll} className="sf-press"
                  style={{ height: 30, padding: '0 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', color: '#67e8f9' }}>
                  ⎘ Appliquer le 1ᵉʳ à tous
                </button>
              )}
            </div>

            {selectedIds.length === 0 ? (
              <div style={{ padding: '60px 24px', textAlign: 'center', borderRadius: 14, border: '1px dashed rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.5)' }}>
                <p style={{ fontSize: 26, marginBottom: 10 }}>👈</p>
                <p style={{ fontSize: 14 }}>Sélectionne un ou plusieurs comptes pour configurer leur story.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {selectedIds.map(id => {
                  const p = phoneById(id)
                  const cfg = configs[id] ?? emptyCfg()
                  const j = jobFor(id)
                  const isReady = cfg.imageUrl.trim() && cfg.linkUrl.trim()
                  return (
                    <div key={id} style={{
                      borderRadius: 14, padding: 16,
                      background: 'rgba(14,14,22,0.7)',
                      border: `1px solid ${j?.status === 'error' ? 'rgba(239,68,68,0.3)' : j?.status === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                      {/* Phone title + status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: j ? statusDot(j.status) : (isReady ? '#22c55e' : 'rgba(148,163,184,0.3)') }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#e8e6f0' }}>{p ? phoneName(p) : id}</span>
                        {j?.status === 'running' && <span style={{ fontSize: 11, color: '#a78bfa' }}>en cours…</span>}
                        {j?.status === 'ok' && <span style={{ fontSize: 11, color: '#4ade80' }}>✓ publié</span>}
                        {j && (j.logs.length > 0) && (
                          <button onClick={() => setOpenLog(openLog === id ? null : id)}
                            style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(148,163,184,0.6)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                            {openLog === id ? 'masquer' : 'journal'}
                          </button>
                        )}
                      </div>

                      {/* Config fields */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {/* Image */}
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                          <button onClick={() => setBankTarget(id)} className="sf-press"
                            style={{ flexShrink: 0, height: 42, padding: '0 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(139,92,246,0.13)', border: '1px solid rgba(139,92,246,0.28)', color: '#c4b5fd' }}>
                            📁 Image
                          </button>
                          <input value={cfg.imageUrl} onChange={e => setCfg(id, { imageUrl: e.target.value, imageName: '' })}
                            placeholder="…ou URL d'image" style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
                        </div>
                        {cfg.imageName && <p style={{ gridColumn: '1 / -1', fontSize: 11.5, color: '#4ade80', marginTop: -4 }}>✓ {cfg.imageName}</p>}

                        {/* Link */}
                        <div style={{ position: 'relative' }}>
                          <input value={cfg.linkUrl} onChange={e => setCfg(id, { linkUrl: e.target.value })}
                            placeholder="https://lien.com" style={{ ...inputStyle, paddingRight: cfg.linkUrl ? 72 : 13 }} onFocus={focusOn} onBlur={focusOff} />
                          {cfg.linkUrl && (
                            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 5, pointerEvents: 'none' }}>
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(34,211,238,0.8)', letterSpacing: '0.05em' }}>ENREG.</span>
                              <span style={{ fontSize: 11 }}>💾</span>
                            </span>
                          )}
                        </div>
                        {/* Sticker text */}
                        <input value={cfg.linkText} onChange={e => setCfg(id, { linkText: e.target.value })}
                          placeholder="Texte du sticker (optionnel)" style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
                      </div>

                      {/* Per-phone log */}
                      {openLog === id && j && (
                        <div style={{ marginTop: 12, borderRadius: 10, padding: 12, background: 'rgba(8,8,14,0.9)', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, lineHeight: 1.7, maxHeight: 200, overflowY: 'auto' }}>
                          {j.logs.length === 0 ? <span style={{ color: 'rgba(148,163,184,0.4)' }}>—</span> :
                            j.logs.map((l, i) => <div key={i} style={{ color: 'rgba(226,232,240,0.75)' }}>{l}</div>)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Run / Stop */}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={run} disabled={!canRun} className="sf-press"
                style={{
                  flex: 1, height: 50, borderRadius: 13, fontSize: 15, fontWeight: 700, cursor: canRun ? 'pointer' : 'not-allowed',
                  background: canRun ? 'linear-gradient(135deg, #7c3aed, #ec4899)' : 'rgba(255,255,255,0.05)',
                  border: 'none', color: canRun ? '#fff' : 'rgba(148,163,184,0.4)',
                  boxShadow: canRun ? '0 8px 24px -8px rgba(236,72,153,0.5)' : 'none', transition: 'all 0.2s',
                }}>
                {running ? '⏳ Publication en cours…' : `🚀 Publier ${readyIds.length > 0 ? `(${readyIds.length})` : ''}`}
              </button>
              {running && (
                <button onClick={stop} className="sf-press"
                  style={{ flexShrink: 0, height: 50, padding: '0 22px', borderRadius: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                  Arrêter
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Fragility notice */}
        <div style={{ marginTop: 26, padding: '14px 18px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <p style={{ fontSize: 12.5, color: 'rgba(251,191,36,0.85)', lineHeight: 1.6 }}>
            <strong>Fonction expérimentale.</strong> L'automation pilote l'app Instagram directement (pas d'API officielle pour les stories). Les comptes sont traités l'un après l'autre ; le journal de chaque téléphone indique où ça bloque si l'interface Instagram change.
          </p>
        </div>
      </div>
    </div>
  )
}
