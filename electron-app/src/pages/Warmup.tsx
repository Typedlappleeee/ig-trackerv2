import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import {
  fetchAllPhones, warmupAccount, updateInstagramProfile, loginInstagramAccount,
  type GeelarkPhone, type WarmupConfig,
} from '@/lib/geelark'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { logActivity } from '@/lib/activityLog'

interface WarmupProps { user: User }

type Tab = 'login' | 'massEdit' | 'warmup'

interface PhoneJob {
  phone:  GeelarkPhone
  status: 'idle' | 'running' | 'done' | 'error'
  logs:   string[]
  error?: string
}

interface LoginCred { email: string; password: string }

function fileName(p: string) { return p.split(/[\\/]/).pop() ?? p }

export function Warmup({ user }: WarmupProps) {
  const conns  = useConnections(user)
  const bearer = conns.bearer
  const { currentOrg, role, perms } = useOrg()

  // ── Shared phone state ────────────────────────────────────────────────────
  const [phones,        setPhones]        = useState<GeelarkPhone[]>([])
  const [selected,      setSelected]      = useState<Set<string>>(new Set())
  const [loadingPhones, setLoadingPhones] = useState(false)
  const [phonesError,   setPhonesError]   = useState<string | null>(null)
  const [phoneSearch,   setPhoneSearch]   = useState('')
  const [groupFilter,   setGroupFilter]   = useState('Tous')
  const [groups,        setGroups]        = useState<string[]>(['Tous'])

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('login')

  // ── LOG IN state ──────────────────────────────────────────────────────────
  const [loginCreds, setLoginCreds] = useState<Record<string, LoginCred>>({})

  // ── MASS EDIT state ───────────────────────────────────────────────────────
  const [editName,    setEditName]    = useState('')
  const [editBio,     setEditBio]     = useState('')
  const [editPicUrl,  setEditPicUrl]  = useState('')
  const [editPicFile, setEditPicFile] = useState<string | null>(null)

  // ── WARMUP state ──────────────────────────────────────────────────────────
  const [browseMinutes,   setBrowseMinutes]   = useState(15)
  const [likePosts,       setLikePosts]       = useState(true)
  const [watchReels,      setWatchReels]      = useState(true)
  const [followSuggested, setFollowSuggested] = useState(false)

  // ── Job / execution state ─────────────────────────────────────────────────
  const [jobs,    setJobs]    = useState<PhoneJob[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef<{ abort: boolean }>({ abort: false })

  useEffect(() => { return () => { abortRef.current.abort = true } }, [])

  // ── Load phones ───────────────────────────────────────────────────────────
  async function loadPhones() {
    if (!bearer) return
    setLoadingPhones(true); setPhonesError(null)
    try {
      const list = await fetchAllPhones(bearer)
      setPhones(list)
      const grps = [...new Set(list.map(p => p.group?.name ?? p.groupName).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
    } catch (e) { setPhonesError(e instanceof Error ? e.message : String(e)) }
    setLoadingPhones(false)
  }

  useEffect(() => { if (bearer && !conns.loading) loadPhones() }, [bearer, conns.loading])

  const visiblePhones = phones.filter(p => {
    const grp = p.group?.name ?? p.groupName ?? null
    if (role && !canAccessPhoneGroup(role, perms, grp)) return false
    if (groupFilter !== 'Tous' && grp !== groupFilter) return false
    if (phoneSearch) {
      const q    = phoneSearch.toLowerCase()
      const name = (p.serialName ?? p.name ?? p.serialNo ?? '').toLowerCase()
      return name.includes(q)
    }
    return true
  })

  function togglePhone(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function selectAll() { setSelected(new Set(visiblePhones.map(p => p.id))) }

  function setLoginCred(phoneId: string, field: keyof LoginCred, value: string) {
    setLoginCreds(prev => {
      const existing = prev[phoneId] ?? { email: '', password: '' }
      return { ...prev, [phoneId]: { ...existing, [field]: value } }
    })
  }

  // ── Job helpers ───────────────────────────────────────────────────────────
  function updateJob(id: string, patch: Partial<PhoneJob>) {
    setJobs(prev => prev.map(j => j.phone.id === id ? { ...j, ...patch } : j))
  }
  function addLog(id: string, msg: string) {
    setJobs(prev => prev.map(j => j.phone.id === id ? { ...j, logs: [...j.logs, msg] } : j))
  }

  function initJobs(phoneList: GeelarkPhone[]) {
    setJobs(phoneList.map(phone => ({ phone, status: 'idle', logs: [] })))
    setRunning(true)
    abortRef.current = { abort: false }
  }

  // ── Launch LOG IN ─────────────────────────────────────────────────────────
  async function launchLogin() {
    if (!bearer || !selected.size) return
    const targets = phones.filter(p => selected.has(p.id))
    logActivity({
      orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '',
      action: 'login_launched',
      details: { phones: targets.map(p => p.serialName ?? p.name ?? p.id), count: targets.length },
    })
    initJobs(targets)

    for (const phone of targets) {
      if (abortRef.current.abort) break
      const cred = loginCreds[phone.id]
      if (!cred?.email || !cred?.password) {
        updateJob(phone.id, { status: 'error', error: 'Identifiants manquants' })
        continue
      }
      updateJob(phone.id, { status: 'running' })
      const result = await loginInstagramAccount(
        bearer, phone.id, cred.email, cred.password,
        msg => addLog(phone.id, msg),
        abortRef.current,
      )
      updateJob(phone.id, result.ok ? { status: 'done' } : { status: 'error', error: result.error })
    }

    setRunning(false)
  }

  // ── Launch MASS EDIT ──────────────────────────────────────────────────────
  async function launchMassEdit() {
    if (!bearer || !selected.size) return
    const targets = phones.filter(p => selected.has(p.id))
    logActivity({
      orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '',
      action: 'mass_edit_launched',
      details: { phones: targets.map(p => p.serialName ?? p.name ?? p.id), count: targets.length },
    })
    initJobs(targets)

    const config = {
      profileName:   editName.trim()   || undefined,
      bio:           editBio.trim()    || undefined,
      profilePicUrl: editPicUrl.trim() || undefined,
    }

    for (const phone of targets) {
      if (abortRef.current.abort) break
      updateJob(phone.id, { status: 'running' })
      try {
        await updateInstagramProfile(bearer, phone.id, config, msg => addLog(phone.id, msg))
        updateJob(phone.id, { status: 'done' })
      } catch (e) {
        updateJob(phone.id, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }

    setRunning(false)
  }

  // ── Launch WARMUP ─────────────────────────────────────────────────────────
  async function launchWarmup() {
    if (!bearer || !selected.size) return
    const targets = phones.filter(p => selected.has(p.id))
    logActivity({
      orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '',
      action: 'warmup_launched',
      details: { phones: targets.map(p => p.serialName ?? p.name ?? p.id), count: targets.length },
    })
    initJobs(targets)

    const config: WarmupConfig = { browseMinutes, likePosts, watchReels, followSuggested }

    for (const phone of targets) {
      if (abortRef.current.abort) break
      updateJob(phone.id, { status: 'running' })
      const result = await warmupAccount(bearer, phone.id, config, msg => addLog(phone.id, msg), abortRef.current)
      updateJob(phone.id, result.ok ? { status: 'done' } : { status: 'error', error: result.error })
    }

    setRunning(false)
  }

  const phoneName = (p: GeelarkPhone) => p.serialName ?? p.name ?? p.serialNo ?? p.id.slice(-6)
  const isOnline  = (p: GeelarkPhone) => p.status === 1 || p.status === 2

  const doneCount     = jobs.filter(j => j.status === 'done').length
  const errorCount    = jobs.filter(j => j.status === 'error').length
  const progress      = jobs.length > 0 ? Math.round((doneCount + errorCount) / jobs.length * 100) : 0
  const selectedPhones = phones.filter(p => selected.has(p.id))

  // ── Guards ────────────────────────────────────────────────────────────────
  if (conns.loading) {
    return (
      <div className="p-8 flex items-center gap-3">
        <div className="animate-spin w-5 h-5 rounded-full border-2 border-accent border-t-transparent" />
        <span className="text-sm text-text2">Chargement…</span>
      </div>
    )
  }

  if (!window.electronAPI?.geelarkRequest) {
    return (
      <div className="p-8 max-w-lg">
        <div className="rounded-xl p-5 space-y-2" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)' }}>
          <p className="font-semibold" style={{ color: '#fbbf24' }}>⚠ Application desktop requise</p>
          <p className="text-sm text-text2">
            Log In / Mass Edit / Warmup utilisent GéeLark via l'IPC Electron.
            Cette fonctionnalité n'est disponible que dans l'application desktop <strong className="text-text">ScaleFlow</strong>.
          </p>
        </div>
      </div>
    )
  }

  if (!bearer) {
    return (
      <div className="p-8 max-w-lg">
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-5 space-y-2">
          <p className="text-warn font-semibold">⚠ Token GéeLark manquant</p>
          <p className="text-sm text-text2">Configure ton token dans <strong className="text-text">Paramètres → Connexions</strong>.</p>
        </div>
      </div>
    )
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'login',    label: 'LOG IN',    icon: '🔑' },
    { id: 'massEdit', label: 'MASS EDIT', icon: '✏️' },
    { id: 'warmup',   label: 'WARMUP',    icon: '🔥' },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: '#06040f' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.6)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}>
            🤖
          </div>
          <div>
            <h1 className="text-sm font-black text-white">Automatisation Instagram</h1>
            <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>
              Log in · Édition de profil en masse · Warmup
            </p>
          </div>
        </div>
      </div>

      {/* Running modal */}
      {running && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(3,1,8,0.92)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: 'rgba(12,8,28,0.98)', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 0 60px rgba(124,58,237,0.2)' }}>
            <div className="px-6 py-4 flex items-center gap-3"
              style={{ borderBottom: '1px solid rgba(139,92,246,0.15)', background: 'linear-gradient(135deg,rgba(124,58,237,0.12),rgba(236,72,153,0.06))' }}>
              <div className="relative w-10 h-10 flex-shrink-0">
                <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }} />
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                  style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                  ⚙️
                </div>
              </div>
              <div>
                <p className="text-sm font-black text-white">
                  {activeTab === 'login' ? 'Connexion en cours…' : activeTab === 'massEdit' ? 'Mass Edit en cours…' : 'Warmup en cours…'}
                </p>
                <p className="text-[11px]" style={{ color: 'rgba(196,181,253,0.5)' }}>
                  {doneCount} / {jobs.length} téléphone(s) · {progress}%
                </p>
              </div>
            </div>

            <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-auto">
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(139,92,246,0.12)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }} />
              </div>

              {jobs.map(job => (
                <div key={job.phone.id} className="rounded-xl overflow-hidden"
                  style={{ border: `1px solid ${job.status === 'done' ? 'rgba(52,211,153,0.2)' : job.status === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.15)'}` }}>
                  <div className="px-4 py-2.5 flex items-center gap-3"
                    style={{ background: job.status === 'done' ? 'rgba(52,211,153,0.06)' : job.status === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(139,92,246,0.06)' }}>
                    <span className="text-base flex-shrink-0">
                      {job.status === 'done' ? '✅' : job.status === 'error' ? '❌' : job.status === 'running' ? '⚙️' : '⏳'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{phoneName(job.phone)}</p>
                      {job.error && <p className="text-[10px] text-danger">{job.error}</p>}
                      {job.logs.length > 0 && (
                        <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.5)' }}>
                          {job.logs[job.logs.length - 1]}
                        </p>
                      )}
                    </div>
                  </div>
                  {job.status === 'running' && job.logs.length > 1 && (
                    <div className="px-4 py-2 space-y-0.5 max-h-24 overflow-auto" style={{ background: 'rgba(0,0,0,0.3)' }}>
                      {job.logs.slice(-6).map((l, i) => (
                        <p key={i} className="text-[10px] font-mono" style={{ color: 'rgba(196,181,253,0.4)' }}>{l}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <button onClick={() => { abortRef.current.abort = true; setRunning(false) }}
                className="w-full py-2 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                ✕ Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Done modal */}
      {!running && jobs.length > 0 && (doneCount + errorCount) === jobs.length && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(3,1,8,0.88)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: 'rgba(12,8,28,0.98)', border: `1px solid ${errorCount === 0 ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}` }}>
            <div className="px-6 py-5 space-y-4">
              <div className="text-center space-y-2">
                <div className="text-4xl">{errorCount === 0 ? '🎉' : '⚠️'}</div>
                <p className="text-lg font-black text-white">
                  {errorCount === 0 ? `${doneCount} téléphone(s) traité(s) !` : `${doneCount} / ${jobs.length} réussis`}
                </p>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-auto">
                {jobs.map(job => (
                  <div key={job.phone.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: job.status === 'done' ? 'rgba(52,211,153,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${job.status === 'done' ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
                    <span>{job.status === 'done' ? '✅' : '❌'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{phoneName(job.phone)}</p>
                      {job.error && <p className="text-[10px] text-danger">{job.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={() => setJobs([])} className="w-full">Fermer</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="p-6 grid grid-cols-[1fr_400px] gap-6 max-w-5xl">

          {/* ── Left: phone selector ─────────────────────────────────────── */}
          <div>
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
              <div className="px-5 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.04)' }}>
                <p className="text-xs font-black text-white">📱 Téléphones GéeLark</p>
                <div className="flex items-center gap-2">
                  {selected.size > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }}>
                      {selected.size} sélectionné(s)
                    </span>
                  )}
                  <button onClick={selectAll} className="text-[10px] px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>
                    Tout sélectionner
                  </button>
                  <button onClick={loadPhones} className="text-[10px] px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>
                    {loadingPhones ? '↻' : '⟳'} Rafraîchir
                  </button>
                </div>
              </div>

              {phones.length > 0 && (
                <div className="px-4 py-2.5 flex gap-2 border-b" style={{ borderColor: 'rgba(139,92,246,0.1)' }}>
                  <input type="text" placeholder="🔍 Rechercher…" value={phoneSearch}
                    onChange={e => setPhoneSearch(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent border rounded px-2 py-1 text-xs text-white placeholder:text-text2 focus:outline-none"
                    style={{ borderColor: 'rgba(139,92,246,0.25)' }}
                  />
                  {groups.length > 1 && (
                    <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                      className="bg-transparent border rounded px-2 py-1 text-xs text-white focus:outline-none"
                      style={{ borderColor: 'rgba(139,92,246,0.25)' }}>
                      {groups.map(g => <option key={g} value={g} style={{ background: '#0c0e1a' }}>{g}</option>)}
                    </select>
                  )}
                  <span className="text-[10px] self-center flex-shrink-0" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    {visiblePhones.length}/{phones.length}
                  </span>
                </div>
              )}

              {phonesError && <p className="px-5 py-3 text-xs text-danger">{phonesError}</p>}
              {phones.length === 0 && !loadingPhones && !phonesError && (
                <p className="px-5 py-4 text-xs" style={{ color: 'rgba(196,181,253,0.4)' }}>
                  Aucun téléphone trouvé. Vérifie ton token GéeLark.
                </p>
              )}
              {loadingPhones && (
                <div className="px-5 py-4 flex items-center gap-2">
                  <div className="animate-spin w-4 h-4 rounded-full border-2 border-accent border-t-transparent" />
                  <span className="text-xs text-text2">Chargement…</span>
                </div>
              )}

              <div className="divide-y divide-purple-900/20">
                {visiblePhones.map(phone => {
                  const online = isOnline(phone)
                  const sel    = selected.has(phone.id)
                  return (
                    <button key={phone.id} onClick={() => togglePhone(phone.id)}
                      className="w-full px-5 py-3 flex items-center gap-3 transition-colors text-left"
                      style={{ background: sel ? 'rgba(139,92,246,0.08)' : 'transparent' }}>
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                        style={{ border: `2px solid ${sel ? '#8b5cf6' : 'rgba(139,92,246,0.3)'}`, background: sel ? '#8b5cf6' : 'transparent' }}>
                        {sel && <span className="text-[9px] text-white font-black">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{phoneName(phone)}</p>
                        {phone.group?.name && (
                          <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>{phone.group.name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: online ? '#34d399' : '#6b7280' }} />
                        <span className="text-[10px]" style={{ color: online ? '#34d399' : '#6b7280' }}>
                          {online ? 'En ligne' : 'Hors ligne'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Right: tab-based config ──────────────────────────────────── */}
          <div className="space-y-4">

            {/* Tab selector */}
            <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black transition-all"
                  style={activeTab === tab.id
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                    : { color: 'rgba(196,181,253,0.5)' }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* ── LOG IN ── */}
            {activeTab === 'login' && (
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
                  <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.04)' }}>
                    <p className="text-xs font-black text-white">🔑 Identifiants Instagram</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.4)' }}>
                      Saisis email + mot de passe pour chaque téléphone sélectionné
                    </p>
                  </div>

                  {selectedPhones.length === 0 ? (
                    <p className="px-5 py-6 text-xs text-center" style={{ color: 'rgba(196,181,253,0.3)' }}>
                      ← Sélectionne des téléphones à gauche
                    </p>
                  ) : (
                    <div className="divide-y divide-purple-900/20 max-h-[400px] overflow-auto">
                      {selectedPhones.map(phone => {
                        const cred = loginCreds[phone.id] ?? { email: '', password: '' }
                        return (
                          <div key={phone.id} className="px-4 py-3 space-y-2">
                            <p className="text-[11px] font-bold text-white">{phoneName(phone)}</p>
                            <input
                              type="email"
                              placeholder="Email Instagram"
                              value={cred.email}
                              onChange={e => setLoginCred(phone.id, 'email', e.target.value)}
                              className="w-full rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)' }}
                            />
                            <input
                              type="password"
                              placeholder="Mot de passe"
                              value={cred.password}
                              onChange={e => setLoginCred(phone.id, 'password', e.target.value)}
                              className="w-full rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)' }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl p-3 text-[10px]"
                  style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', color: 'rgba(251,191,36,0.7)' }}>
                  ⚠ Le téléphone démarre, ouvre Instagram et saisit les identifiants automatiquement.
                  En cas de 2FA ou challenge de sécurité, tu devras intervenir manuellement sur le téléphone.
                </div>

                <Button
                  className="w-full py-3 text-sm font-black"
                  disabled={selectedPhones.length === 0 || running ||
                    selectedPhones.some(p => !loginCreds[p.id]?.email || !loginCreds[p.id]?.password)}
                  loading={running}
                  onClick={launchLogin}
                >
                  🔑 Se connecter ({selectedPhones.length} téléphone{selectedPhones.length !== 1 ? 's' : ''})
                </Button>
              </div>
            )}

            {/* ── MASS EDIT ── */}
            {activeTab === 'massEdit' && (
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
                  <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.04)' }}>
                    <p className="text-xs font-black text-white">✏️ Modifications de profil</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.4)' }}>
                      Appliquées à tous les téléphones sélectionnés · Laisse vide pour ne pas modifier
                    </p>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-bold block mb-1.5"
                        style={{ color: 'rgba(196,181,253,0.4)' }}>Nom de profil</label>
                      <input type="text" placeholder="Ex: Marie Fitness | Coach Minceur"
                        value={editName} onChange={e => setEditName(e.target.value)}
                        className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)' }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-bold block mb-1.5"
                        style={{ color: 'rgba(196,181,253,0.4)' }}>Bio</label>
                      <textarea rows={3} placeholder="Ex: 🏋️ Coach fitness certifiée | -10kg en 90 jours ↓"
                        value={editBio} onChange={e => setEditBio(e.target.value)}
                        className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none resize-none"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)' }}
                      />
                      <p className="text-[10px] mt-1"
                        style={{ color: editBio.length > 150 ? '#f87171' : 'rgba(196,181,253,0.3)' }}>
                        {editBio.length}/150 caractères
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-bold block mb-1.5"
                        style={{ color: 'rgba(196,181,253,0.4)' }}>Photo de profil — URL</label>
                      <div className="flex gap-2">
                        <input type="text" placeholder="https://… ou laisser vide"
                          value={editPicUrl} onChange={e => { setEditPicUrl(e.target.value); setEditPicFile(null) }}
                          className="flex-1 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)' }}
                        />
                        <button onClick={async () => {
                          const p = await window.electronAPI?.pickAnyFile?.({ filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }] })
                          if (p) { setEditPicFile(p); setEditPicUrl('') }
                        }}
                          className="px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0"
                          style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                          📂 Fichier
                        </button>
                      </div>
                      {editPicFile && (
                        <p className="text-[10px] mt-1 text-accent/70 truncate">📎 {fileName(editPicFile)}</p>
                      )}
                      <p className="text-[10px] mt-1" style={{ color: 'rgba(196,181,253,0.3)' }}>
                        Le téléphone télécharge l'image via curl — utilise un lien direct
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full py-3 text-sm font-black"
                  disabled={selectedPhones.length === 0 || running ||
                    (!editName.trim() && !editBio.trim() && !editPicUrl.trim())}
                  loading={running}
                  onClick={launchMassEdit}
                >
                  ✏️ Appliquer ({selectedPhones.length} téléphone{selectedPhones.length !== 1 ? 's' : ''})
                </Button>
              </div>
            )}

            {/* ── WARMUP ── */}
            {activeTab === 'warmup' && (
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
                  <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.04)' }}>
                    <p className="text-xs font-black text-white">⚙️ Actions de Warmup</p>
                  </div>
                  <div className="p-5 space-y-5">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold mb-3"
                        style={{ color: 'rgba(196,181,253,0.4)' }}>Durée de navigation</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 5, 10, 15, 20, 30].map(m => (
                          <button key={m} onClick={() => setBrowseMinutes(m)}
                            className="py-2 rounded-xl text-xs font-bold"
                            style={browseMinutes === m
                              ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                              : { background: 'rgba(139,92,246,0.06)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(139,92,246,0.12)' }}>
                            {m === 0 ? 'Aucune' : `${m} min`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {([
                        { key: 'like',   label: '❤️ Liker des posts',            value: likePosts,       set: setLikePosts       },
                        { key: 'reels',  label: '🎬 Regarder des Reels',         value: watchReels,      set: setWatchReels      },
                        { key: 'follow', label: '➕ Follow des comptes suggérés', value: followSuggested, set: setFollowSuggested },
                      ] as const).map(({ key, label, value, set }) => {
                        const disabled = browseMinutes === 0
                        return (
                          <label key={key} className={`flex items-center gap-3 cursor-pointer ${disabled ? 'opacity-40' : ''}`}>
                            <div onClick={() => !disabled && set(!value)}
                              className="relative flex-shrink-0 w-9 h-5 rounded-full transition-all"
                              style={{ background: value && !disabled ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${value && !disabled ? 'left-4' : 'left-0.5'}`} />
                            </div>
                            <span className="text-xs text-white/80">{label}</span>
                          </label>
                        )
                      })}
                    </div>

                    {browseMinutes === 0 && (
                      <p className="text-[10px] text-warn/70">⚠ Durée = 0 : aucune navigation ne sera effectuée</p>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(196,181,253,0.4)' }}>Résumé</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span style={{ color: 'rgba(196,181,253,0.5)' }}>Téléphones</span>
                      <span className="text-white font-bold">{selectedPhones.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'rgba(196,181,253,0.5)' }}>Navigation</span>
                      <span className="text-white">{browseMinutes === 0 ? '—' : `${browseMinutes} min`}</span>
                    </div>
                    {browseMinutes > 0 && (
                      <div className="flex justify-between">
                        <span style={{ color: 'rgba(196,181,253,0.5)' }}>Actions</span>
                        <span className="text-white text-right">
                          {[likePosts && 'Likes', watchReels && 'Reels', followSuggested && 'Follows'].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span style={{ color: 'rgba(196,181,253,0.5)' }}>Durée totale ~</span>
                      <span className="text-white font-bold">{selectedPhones.length * (browseMinutes + 2)} min</span>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full py-3 text-sm font-black"
                  disabled={selectedPhones.length === 0 || running || browseMinutes === 0}
                  loading={running}
                  onClick={launchWarmup}
                >
                  🔥 Lancer le warmup ({selectedPhones.length} téléphone{selectedPhones.length !== 1 ? 's' : ''})
                </Button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
