import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import {
  fetchAllPhones, warmupAccount, updateInstagramProfile, loginInstagramAccount, stopPhone,
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

interface LoginCred { email: string; password: string; totpSecret: string }

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
      const existing = prev[phoneId] ?? { email: '', password: '', totpSecret: '' }
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

  // ── Launch LOG IN (parallel) ──────────────────────────────────────────────
  async function launchLogin() {
    if (!bearer || !selected.size) return
    const targets = phones.filter(p => selected.has(p.id))
    logActivity({
      orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '',
      action: 'login_launched',
      details: { phones: targets.map(p => p.serialName ?? p.name ?? p.id), count: targets.length },
    })
    initJobs(targets)

    await Promise.all(targets.map(async phone => {
      const cred = loginCreds[phone.id]
      if (!cred?.email || !cred?.password) {
        updateJob(phone.id, { status: 'error', error: 'Identifiants manquants' })
        return
      }
      updateJob(phone.id, { status: 'running' })
      const result = await loginInstagramAccount(
        bearer, phone.id, cred.email, cred.password,
        msg => addLog(phone.id, msg),
        abortRef.current,
        cred.totpSecret || undefined,
      )
      updateJob(phone.id, result.ok ? { status: 'done' } : { status: 'error', error: result.error })
      addLog(phone.id, '💤 Extinction du téléphone…')
      await stopPhone(bearer, phone.id)
    }))

    setRunning(false)
  }

  // ── Launch MASS EDIT (parallel) ───────────────────────────────────────────
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

    await Promise.all(targets.map(async phone => {
      updateJob(phone.id, { status: 'running' })
      try {
        await updateInstagramProfile(bearer, phone.id, config, msg => addLog(phone.id, msg))
        updateJob(phone.id, { status: 'done' })
      } catch (e) {
        updateJob(phone.id, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
      addLog(phone.id, '💤 Extinction du téléphone…')
      await stopPhone(bearer, phone.id)
    }))

    setRunning(false)
  }

  // ── Launch WARMUP (parallel) ──────────────────────────────────────────────
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

    await Promise.all(targets.map(async phone => {
      updateJob(phone.id, { status: 'running' })
      const result = await warmupAccount(bearer, phone.id, config, msg => addLog(phone.id, msg), abortRef.current)
      updateJob(phone.id, result.ok ? { status: 'done' } : { status: 'error', error: result.error })
      addLog(phone.id, '💤 Extinction du téléphone…')
      await stopPhone(bearer, phone.id)
    }))

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
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 rounded-full border-2 border-accent border-t-transparent" />
            <span className="text-[13px] text-text2">Chargement…</span>
          </div>
        </div>
      </div>
    )
  }

  const isWeb = typeof window !== 'undefined' && (window as any).__IS_WEB

  if (!bearer) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-[28px] font-black text-white leading-none">Automatisation</h1>
            <p className="text-[13px] text-text2 mt-0.5">Log in · Édition de profil en masse · Warmup</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-10 pb-10 pt-8">
          <div className="max-w-lg rounded-2xl p-6" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <p className="text-[15px] font-bold text-warn mb-2">⚠ Token GéeLark manquant</p>
            <p className="text-[13px] text-text2">Configure ton token dans <strong className="text-white">Paramètres → Connexions</strong>.</p>
          </div>
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
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-[28px] font-black text-white leading-none">Automatisation Instagram</h1>
          <p className="text-[13px] text-text2 mt-0.5">Log in · Édition de profil en masse · Warmup</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 pb-10">
        <div className="pt-8 grid grid-cols-[1fr_420px] gap-6 max-w-5xl">

          {/* ── Left: phone selector ─────────────────────────────────────── */}
          <div>
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[15px] font-bold text-white">📱 Téléphones GéeLark</p>
                <div className="flex items-center gap-2">
                  {selected.size > 0 && (
                    <span className="text-[12px] px-3 py-1 rounded-full font-bold"
                      style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }}>
                      {selected.size} sélectionné(s)
                    </span>
                  )}
                  <button onClick={selectAll} className="rounded-xl px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
                    Tout sélectionner
                  </button>
                  <button onClick={loadPhones} className="rounded-xl px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
                    {loadingPhones ? '↻' : '⟳'} Rafraîchir
                  </button>
                </div>
              </div>

              {phones.length > 0 && (
                <div className="px-5 py-3 flex gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <input type="text" placeholder="🔍 Rechercher…" value={phoneSearch}
                    onChange={e => setPhoneSearch(e.target.value)}
                    className="flex-1 min-w-0 rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                  />
                  {groups.length > 1 && (
                    <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                      className="rounded-xl px-4 py-2.5 text-[13px] focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
                      {groups.map(g => <option key={g} value={g} style={{ background: '#0c0e1a' }}>{g}</option>)}
                    </select>
                  )}
                  <span className="text-[12px] self-center flex-shrink-0 text-text2">
                    {visiblePhones.length}/{phones.length}
                  </span>
                </div>
              )}

              {phonesError && <p className="px-5 py-3 text-[13px] text-danger">{phonesError}</p>}
              {phones.length === 0 && !loadingPhones && !phonesError && (
                <p className="px-5 py-6 text-[13px] text-text2">
                  Aucun téléphone trouvé. Vérifie ton token GéeLark.
                </p>
              )}
              {loadingPhones && (
                <div className="px-5 py-4 flex items-center gap-2">
                  <div className="animate-spin w-4 h-4 rounded-full border-2 border-accent border-t-transparent" />
                  <span className="text-[13px] text-text2">Chargement…</span>
                </div>
              )}

              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {visiblePhones.map(phone => {
                  const online = isOnline(phone)
                  const sel    = selected.has(phone.id)
                  return (
                    <button key={phone.id} onClick={() => togglePhone(phone.id)}
                      className="w-full px-5 py-3.5 flex items-center gap-3 transition-colors text-left"
                      style={{ background: sel ? 'rgba(139,92,246,0.08)' : 'transparent' }}>
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                        style={{ border: `2px solid ${sel ? '#8b5cf6' : 'rgba(255,255,255,0.15)'}`, background: sel ? '#8b5cf6' : 'transparent' }}>
                        {sel && <span className="text-[10px] text-white font-black">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">{phoneName(phone)}</p>
                        {phone.group?.name && (
                          <p className="text-[12px] text-text2">{phone.group.name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: online ? '#34d399' : '#6b7280' }} />
                        <span className="text-[12px]" style={{ color: online ? '#34d399' : '#6b7280' }}>
                          {online ? 'En ligne' : 'Hors ligne'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Right: progress panel (when running/done) or tab config ─── */}
          <div className="space-y-5">

            {/* ── Inline progress panel ──────────────────────────────────── */}
            {(running || (jobs.length > 0 && (doneCount + errorCount) === jobs.length)) && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {/* Header */}
                <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-3">
                    {running && (
                      <div className="relative w-6 h-6 flex-shrink-0">
                        <div className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }} />
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-sm"
                          style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)' }}>⚙️</div>
                      </div>
                    )}
                    <div>
                      <p className="text-[14px] font-bold text-white">
                        {running
                          ? (activeTab === 'login' ? 'Connexion en cours…' : activeTab === 'massEdit' ? 'Mass Edit en cours…' : 'Warmup en cours…')
                          : (errorCount === 0 ? `✅ ${doneCount} téléphone(s) terminé(s)` : `⚠️ ${doneCount}/${jobs.length} réussis`)}
                      </p>
                      {running && (
                        <p className="text-[12px] text-text2 mt-0.5">
                          {doneCount} terminé · {jobs.filter(j => j.status === 'running').length} en cours · {jobs.filter(j => j.status === 'idle').length} en attente
                        </p>
                      )}
                    </div>
                  </div>
                  {!running && (
                    <button onClick={() => setJobs([])}
                      className="rounded-xl px-4 py-2 text-[12px] font-semibold"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
                      Fermer
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                {running && (
                  <div className="px-5 pt-4">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(139,92,246,0.12)' }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }} />
                    </div>
                    <p className="text-[12px] mt-1 text-right text-text2">{progress}%</p>
                  </div>
                )}

                {/* Job list */}
                <div className="px-4 pb-4 pt-2 space-y-2 max-h-[50vh] overflow-auto">
                  {jobs.map(job => (
                    <div key={job.phone.id} className="rounded-xl overflow-hidden"
                      style={{ border: `1px solid ${job.status === 'done' ? 'rgba(52,211,153,0.2)' : job.status === 'error' ? 'rgba(239,68,68,0.2)' : job.status === 'running' ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                      <div className="px-4 py-3 flex items-center gap-3"
                        style={{ background: job.status === 'done' ? 'rgba(52,211,153,0.05)' : job.status === 'error' ? 'rgba(239,68,68,0.05)' : job.status === 'running' ? 'rgba(139,92,246,0.08)' : 'transparent' }}>
                        <span className="text-base flex-shrink-0">
                          {job.status === 'done' ? '✅' : job.status === 'error' ? '❌' : job.status === 'running' ? '⚙️' : '⏳'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate">{phoneName(job.phone)}</p>
                          {job.error && <p className="text-[12px] text-danger truncate">{job.error}</p>}
                          {!job.error && job.logs.length > 0 && (
                            <p className="text-[12px] text-text2 truncate">
                              {job.logs[job.logs.length - 1]}
                            </p>
                          )}
                        </div>
                      </div>
                      {job.status === 'running' && job.logs.length > 1 && (
                        <div className="px-4 py-2 space-y-0.5 max-h-20 overflow-auto" style={{ background: 'rgba(0,0,0,0.25)' }}>
                          {job.logs.slice(-5).map((l, i) => (
                            <p key={i} className="text-[11px] font-mono leading-relaxed text-text2">{l}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Cancel button */}
                {running && (
                  <div className="px-4 pb-4">
                    <button onClick={() => { abortRef.current.abort = true }}
                      className="w-full py-2.5 rounded-xl text-[13px] font-semibold"
                      style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                      ✕ Annuler
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab selector */}
            <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all"
                  style={activeTab === tab.id
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                    : { color: 'rgba(196,181,253,0.5)' }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* ── LOG IN ── */}
            {activeTab === 'login' && (
              <div className="space-y-5">
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[15px] font-bold text-white">🔑 Identifiants Instagram</p>
                    <p className="text-[12px] text-text2 mt-0.5">
                      Saisis email + mot de passe pour chaque téléphone sélectionné
                    </p>
                  </div>

                  {selectedPhones.length === 0 ? (
                    <p className="px-5 py-8 text-[13px] text-center text-text2">
                      ← Sélectionne des téléphones à gauche
                    </p>
                  ) : (
                    <div className="divide-y max-h-[400px] overflow-auto" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      {selectedPhones.map(phone => {
                        const cred = loginCreds[phone.id] ?? { email: '', password: '', totpSecret: '' }
                        return (
                          <div key={phone.id} className="px-5 py-4 space-y-3">
                            <p className="text-[13px] font-bold text-white">{phoneName(phone)}</p>
                            <input
                              type="email"
                              placeholder="Email Instagram"
                              value={cred.email}
                              onChange={e => setLoginCred(phone.id, 'email', e.target.value)}
                              className="w-full rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                            />
                            <input
                              type="password"
                              placeholder="Mot de passe"
                              value={cred.password}
                              onChange={e => setLoginCred(phone.id, 'password', e.target.value)}
                              className="w-full rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                            />
                            <div className="space-y-1">
                              <input
                                type="text"
                                placeholder="Secret 2FA (optionnel) — ex: JBSWY3DPEHPK3PXP"
                                value={cred.totpSecret}
                                onChange={e => setLoginCred(phone.id, 'totpSecret', e.target.value)}
                                className="w-full rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none font-mono"
                                style={{
                                  background: cred.totpSecret ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.03)',
                                  border: `1px solid ${cred.totpSecret ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                                  color: '#c4b5fd',
                                }}
                              />
                              {cred.totpSecret && (
                                <p className="text-[11px] px-1" style={{ color: 'rgba(139,92,246,0.7)' }}>
                                  ✨ Code 2FA sera généré automatiquement si Instagram le demande
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl px-4 py-3 text-[12px]"
                  style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', color: 'rgba(251,191,36,0.8)' }}>
                  ⚠ Le téléphone démarre et saisit les identifiants automatiquement. Si 2FA est activé, renseigne le secret TOTP — le code sera généré et saisi automatiquement.
                </div>

                <Button
                  className="w-full py-3 text-[13px] font-bold"
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
              <div className="space-y-5">
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[15px] font-bold text-white">✏️ Modifications de profil</p>
                    <p className="text-[12px] text-text2 mt-0.5">
                      Appliquées à tous les téléphones sélectionnés · Laisse vide pour ne pas modifier
                    </p>
                  </div>
                  <div className="p-5 space-y-5">
                    <div>
                      <label className="text-[12px] uppercase tracking-wider font-bold block mb-2 text-text2">Nom de profil</label>
                      <input type="text" placeholder="Ex: Marie Fitness | Coach Minceur"
                        value={editName} onChange={e => setEditName(e.target.value)}
                        className="w-full rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                      />
                    </div>
                    <div>
                      <label className="text-[12px] uppercase tracking-wider font-bold block mb-2 text-text2">Bio</label>
                      <textarea rows={3} placeholder="Ex: 🏋️ Coach fitness certifiée | -10kg en 90 jours ↓"
                        value={editBio} onChange={e => setEditBio(e.target.value)}
                        className="w-full rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none resize-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                      />
                      <p className="text-[12px] mt-1 text-text2"
                        style={{ color: editBio.length > 150 ? '#f87171' : undefined }}>
                        {editBio.length}/150 caractères
                      </p>
                    </div>
                    <div>
                      <label className="text-[12px] uppercase tracking-wider font-bold block mb-2 text-text2">Photo de profil — URL</label>
                      <div className="flex gap-2">
                        <input type="text" placeholder="https://… ou laisser vide"
                          value={editPicUrl} onChange={e => { setEditPicUrl(e.target.value); setEditPicFile(null) }}
                          className="flex-1 rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                        />
                        {!isWeb && (
                          <button onClick={async () => {
                            const p = await window.electronAPI?.pickAnyFile?.({ filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }] })
                            if (p) { setEditPicFile(p); setEditPicUrl('') }
                          }}
                            className="rounded-xl px-4 py-2.5 text-[13px] font-semibold flex-shrink-0"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
                            📂 Fichier
                          </button>
                        )}
                      </div>
                      {editPicFile && (
                        <p className="text-[12px] mt-1 text-accent/70 truncate">📎 {fileName(editPicFile)}</p>
                      )}
                      <p className="text-[12px] mt-1 text-text2">
                        Le téléphone télécharge l'image via curl — utilise un lien direct
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full py-3 text-[13px] font-bold"
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
              <div className="space-y-5">
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[15px] font-bold text-white">⚙️ Actions de Warmup</p>
                  </div>
                  <div className="p-5 space-y-6">
                    <div>
                      <p className="text-[12px] uppercase tracking-wider font-bold mb-3 text-text2">Durée de navigation</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 5, 10, 15, 20, 30].map(m => (
                          <button key={m} onClick={() => setBrowseMinutes(m)}
                            className="py-2.5 rounded-xl text-[13px] font-bold"
                            style={browseMinutes === m
                              ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                              : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            {m === 0 ? 'Aucune' : `${m} min`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
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
                              style={{ background: value && !disabled ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${value && !disabled ? 'left-4' : 'left-0.5'}`} />
                            </div>
                            <span className="text-[13px] text-white/80">{label}</span>
                          </label>
                        )
                      })}
                    </div>

                    {browseMinutes === 0 && (
                      <p className="text-[12px] text-warn/70">⚠ Durée = 0 : aucune navigation ne sera effectuée</p>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-2xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[12px] uppercase tracking-wider font-bold text-text2">Résumé</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-text2">Téléphones</span>
                      <span className="text-white font-bold">{selectedPhones.length}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-text2">Navigation</span>
                      <span className="text-white">{browseMinutes === 0 ? '—' : `${browseMinutes} min`}</span>
                    </div>
                    {browseMinutes > 0 && (
                      <div className="flex justify-between text-[13px]">
                        <span className="text-text2">Actions</span>
                        <span className="text-white text-right">
                          {[likePosts && 'Likes', watchReels && 'Reels', followSuggested && 'Follows'].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-[13px]">
                      <span className="text-text2">Durée totale ~</span>
                      <span className="text-white font-bold">{selectedPhones.length * (browseMinutes + 2)} min</span>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full py-3 text-[13px] font-bold"
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
