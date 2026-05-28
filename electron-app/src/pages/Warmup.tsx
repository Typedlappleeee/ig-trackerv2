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
import { useT, useLang } from '@/lib/i18n'

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
  const t = useT()
  const { lang } = useLang()
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
  const [editName,     setEditName]     = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editBio,      setEditBio]      = useState('')
  const [editPicUrl,   setEditPicUrl]   = useState('')
  const [editPicFile,  setEditPicFile]  = useState<string | null>(null)

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
        updateJob(phone.id, { status: 'error', error: 'Missing credentials' })
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

    // editPicFile is a local path — the phone uses curl to download the URL so a
    // local file path won't work. Only URL-based profile pictures are supported.
    const resolvedPicUrl = editPicUrl.trim() || undefined

    const config = {
      profileName:   editName.trim()    || undefined,
      username:      editUsername.trim() || undefined,
      bio:           editBio.trim()     || undefined,
      profilePicUrl: resolvedPicUrl,
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
  const runningCount  = jobs.filter(j => j.status === 'running').length
  const idleCount     = jobs.filter(j => j.status === 'idle').length
  const progress      = jobs.length > 0 ? Math.round((doneCount + errorCount) / jobs.length * 100) : 0
  const selectedPhones = phones.filter(p => selected.has(p.id))

  const onlineCount = phones.filter(isOnline).length

  // ── Guards ────────────────────────────────────────────────────────────────
  if (conns.loading) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-bg anim-page">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-2xl sf-card flex items-center justify-center">
              <div className="animate-spin w-5 h-5 rounded-full border-2 border-accent border-t-transparent" />
            </div>
            <span className="text-[13px] text-text2 font-medium">{t('loading')}</span>
          </div>
        </div>
      </div>
    )
  }

  const isWeb = typeof window !== 'undefined' && (window as any).__IS_WEB

  if (!bearer) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-bg anim-page">
        {/* Header */}
        <div className="flex-shrink-0 px-8 pt-8 pb-6 flex items-center justify-between sf-topbar">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(168,85,247,0.1))', border: '1px solid rgba(139,92,246,0.25)' }}>
              ⚡
            </div>
            <div>
              <h1 className="text-[22px] font-black text-text leading-none">{t('warmupPageTitle')}</h1>
              <p className="text-[12px] text-text2 mt-0.5 font-mono">{t('warmupPageSub')}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 pb-10 pt-8">
          <div className="max-w-lg sf-card rounded-2xl p-6 border border-warn/20" style={{ background: 'rgba(245,158,11,0.05)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>⚠</div>
              <p className="text-[14px] font-bold text-warn">{t('warmupMissingToken')}</p>
            </div>
            <p className="text-[13px] text-text2">{t('warmupMissingTokenDesc')}</p>
          </div>
        </div>
      </div>
    )
  }

  const TABS: { id: Tab; label: string; icon: string; color: string }[] = [
    { id: 'login',    label: 'LOG IN',    icon: '🔑', color: '#8B5CF6' },
    { id: 'massEdit', label: 'MASS EDIT', icon: '✏️',  color: '#A855F7' },
    { id: 'warmup',   label: 'WARMUP',    icon: '🔥', color: '#EC4899' },
  ]

  const jobShowing = running || (jobs.length > 0 && (doneCount + errorCount) === jobs.length)

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg anim-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-8 pb-5 sf-topbar">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(168,85,247,0.1))', border: '1px solid rgba(139,92,246,0.3)' }}>
              <span className="relative z-10">⚡</span>
              {running && <div className="absolute inset-0 animate-ping rounded-xl opacity-20" style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }} />}
            </div>
            <div>
              <h1 className="text-[22px] font-black text-text leading-none">{t('warmupPageTitle')}</h1>
              <p className="text-[12px] text-text3 mt-0.5 font-mono tracking-widest uppercase">{t('warmupPageSub')}</p>
            </div>
          </div>

          {/* Status overview */}
          <div className="flex items-center gap-3">
            <div className="sf-card rounded-xl px-4 py-2.5 flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full ${onlineCount > 0 ? 'sf-live-dot' : ''}`}
                style={{ background: onlineCount > 0 ? '#22C55E' : '#52525B' }} />
              <span className="text-[12px] font-mono text-text2">
                <span className={onlineCount > 0 ? 'text-ok' : 'text-text3'}>{onlineCount}</span>/{phones.length} {t('warmupOnline')}
              </span>
            </div>
            {selected.size > 0 && (
              <div className="rounded-xl px-4 py-2.5 flex items-center gap-2" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-[12px] font-bold text-accent">{selected.size} {t('warmupSelected')}{lang === 'fr' && selected.size !== 1 ? 's' : ''}</span>
              </div>
            )}
            {running && (
              <div className="rounded-xl px-4 py-2.5 flex items-center gap-2.5" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <div className="animate-spin w-3 h-3 rounded-full border-2 border-accent border-t-transparent" />
                <span className="text-[12px] font-mono text-accent">
                  {activeTab === 'login' ? t('warmupLoginRunning') : activeTab === 'massEdit' ? t('warmupMassEditRunning') : t('warmupWarmupRunning')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="pt-6 grid grid-cols-[1fr_440px] gap-5 max-w-6xl">

          {/* ── Left: phone list ─────────────────────────────────────────── */}
          <div>
            <div className="sf-card rounded-2xl overflow-hidden">

              {/* Phone list header */}
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-sm">📱</span>
                  <p className="text-[14px] font-bold text-text">{t('warmupPhoneList')}</p>
                  {phones.length > 0 && (
                    <span className="sf-badge-violet">{phones.length}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={selectAll}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all"
                    style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', color: '#a78bfa' }}>
                    {t('warmupSelectAll')}
                  </button>
                  <button onClick={loadPhones}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all hover:border-accent/40"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.12)', color: '#71717a' }}>
                    {loadingPhones ? '↻' : '⟳'} Sync
                  </button>
                </div>
              </div>

              {/* Search + filter bar */}
              {phones.length > 0 && (
                <div className="px-4 py-3 flex gap-2.5" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
                  <input
                    type="text"
                    placeholder={t('warmupSearchPhone')}
                    value={phoneSearch}
                    onChange={e => setPhoneSearch(e.target.value)}
                    className="sf-search flex-1 min-w-0 rounded-lg px-3.5 py-2 text-[12px] font-mono placeholder:text-text3"
                  />
                  {groups.length > 1 && (
                    <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                      className="sf-search rounded-lg px-3 py-2 text-[12px] font-mono focus:outline-none"
                      style={{ minWidth: '100px' }}>
                      {groups.map(g => <option key={g} value={g} style={{ background: '#0E0E16' }}>{g}</option>)}
                    </select>
                  )}
                  <div className="flex items-center px-2.5 rounded-lg text-[11px] font-mono text-text3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.08)' }}>
                    {visiblePhones.length}/{phones.length}
                  </div>
                </div>
              )}

              {phonesError && (
                <div className="mx-4 my-3 rounded-lg px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}>
                  <span className="text-danger text-sm">⚠</span>
                  <p className="text-[12px] text-danger font-mono">{phonesError}</p>
                </div>
              )}

              {phones.length === 0 && !loadingPhones && !phonesError && (
                <div className="py-12 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.12)' }}>📱</div>
                  <p className="text-[13px] text-text3 font-mono">{t('warmupNoPhone')}</p>
                  <p className="text-[11px] text-text3 text-center max-w-xs">{t('warmupNoPhoneDesc')}</p>
                </div>
              )}

              {loadingPhones && (
                <div className="px-5 py-4 flex items-center gap-3">
                  <div className="animate-spin w-4 h-4 rounded-full border-2 border-accent border-t-transparent" />
                  <span className="text-[12px] font-mono text-text3">{t('warmupScanning')}</span>
                </div>
              )}

              {/* Phone cards */}
              <div className="divide-y" style={{ borderColor: 'rgba(139,92,246,0.06)' }}>
                {visiblePhones.map(phone => {
                  const online = isOnline(phone)
                  const sel    = selected.has(phone.id)
                  const job    = jobs.find(j => j.phone.id === phone.id)
                  return (
                    <button key={phone.id} onClick={() => togglePhone(phone.id)}
                      className="w-full px-5 py-3.5 flex items-center gap-3.5 text-left transition-all"
                      style={{
                        background: sel
                          ? 'linear-gradient(90deg, rgba(139,92,246,0.07), transparent)'
                          : 'transparent',
                      }}>

                      {/* Checkbox */}
                      <div className="w-4.5 h-4.5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          border: `1.5px solid ${sel ? '#8b5cf6' : 'rgba(139,92,246,0.2)'}`,
                          background: sel ? '#8b5cf6' : 'transparent',
                          width: '18px', height: '18px',
                        }}>
                        {sel && <span className="text-[9px] text-white font-black leading-none">✓</span>}
                      </div>

                      {/* Phone info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-text truncate font-mono">{phoneName(phone)}</p>
                        {phone.group?.name && (
                          <p className="text-[11px] text-text3 font-mono mt-0.5">{phone.group.name}</p>
                        )}
                      </div>

                      {/* Job status if running */}
                      {job && job.status !== 'idle' && (
                        <div className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md flex-shrink-0"
                          style={{
                            background: job.status === 'done' ? 'rgba(34,197,94,0.1)' : job.status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(139,92,246,0.1)',
                            color: job.status === 'done' ? '#22C55E' : job.status === 'error' ? '#EF4444' : '#8B5CF6',
                            border: `1px solid ${job.status === 'done' ? 'rgba(34,197,94,0.2)' : job.status === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.2)'}`,
                          }}>
                          {job.status === 'done' ? t('warmupDoneLabel') : job.status === 'error' ? t('warmupErrLabel') : t('warmupRunLabel')}
                        </div>
                      )}

                      {/* Online status */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className={`w-1.5 h-1.5 rounded-full ${online ? 'sf-live-dot' : ''}`}
                          style={{ background: online ? '#22C55E' : '#3f3f46', position: online ? 'relative' : 'static' }} />
                        <span className="text-[11px] font-mono" style={{ color: online ? '#22C55E' : '#52525B' }}>
                          {online ? t('warmupOnlineLabel') : t('warmupOfflineLabel')}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Right: control panel ─────────────────────────────────────── */}
          <div className="space-y-4">

            {/* ── Progress / execution panel ── */}
            {jobShowing && (
              <div className="sf-card rounded-2xl overflow-hidden anim-slide-up">
                {/* Panel header */}
                <div className="px-5 py-4 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: running ? 'rgba(139,92,246,0.04)' : 'transparent' }}>
                  <div className="flex items-center gap-3">
                    {running && (
                      <div className="relative w-7 h-7 flex-shrink-0">
                        <div className="absolute inset-0 rounded-full animate-ping opacity-25" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }} />
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                          style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)' }}>⚙</div>
                      </div>
                    )}
                    <div>
                      <p className="text-[13px] font-bold text-text font-mono">
                        {running
                          ? (activeTab === 'login' ? `[ ${t('warmupLoginRunning')} ]` : activeTab === 'massEdit' ? `[ ${t('warmupMassEditRunning')} ]` : `[ ${t('warmupWarmupRunning')} ]`)
                          : errorCount === 0 ? `[ ${doneCount} ${t('warmupSuccessAll')} ]` : `[ ${doneCount}/${jobs.length} ${t('warmupSuccessPartial')} · ${errorCount} ${t('warmupErrors')} ]`}
                      </p>
                      {running && (
                        <p className="text-[11px] text-text3 font-mono mt-0.5">
                          {doneCount} {t('warmupDoneLabel').toLowerCase()} · {runningCount} {lang === 'en' ? 'active' : 'actif'} · {idleCount} {lang === 'en' ? 'waiting' : 'en attente'}
                        </p>
                      )}
                    </div>
                  </div>
                  {!running && (
                    <button onClick={() => setJobs([])}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-bold font-mono uppercase tracking-wider transition-all"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.15)', color: '#71717a' }}>
                      {t('warmupClose')}
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                {running && (
                  <div className="px-5 pt-3.5 pb-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono text-text3 uppercase tracking-widest">{t('warmupProgression')}</span>
                      <span className="text-[11px] font-mono font-bold text-accent">{progress}%</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(139,92,246,0.1)' }}>
                      <div className="sf-progress-bar h-full rounded-full transition-all duration-700"
                        style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                {/* Terminal-style job list */}
                <div className="px-4 pb-4 pt-3 space-y-1.5 max-h-[45vh] overflow-auto">
                  {jobs.map(job => (
                    <div key={job.phone.id} className="rounded-xl overflow-hidden font-mono"
                      style={{
                        border: `1px solid ${job.status === 'done' ? 'rgba(34,197,94,0.18)' : job.status === 'error' ? 'rgba(239,68,68,0.18)' : job.status === 'running' ? 'rgba(139,92,246,0.22)' : 'rgba(139,92,246,0.08)'}`,
                        background: job.status === 'done' ? 'rgba(34,197,94,0.04)' : job.status === 'error' ? 'rgba(239,68,68,0.04)' : job.status === 'running' ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.02)',
                      }}>
                      <div className="px-3.5 py-2.5 flex items-center gap-2.5">
                        <span className="text-sm flex-shrink-0">
                          {job.status === 'done' ? '✓' : job.status === 'error' ? '✗' : job.status === 'running' ? '⟳' : '○'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-text truncate">{phoneName(job.phone)}</p>
                          {job.error && <p className="text-[11px] text-danger truncate mt-0.5">{job.error}</p>}
                          {!job.error && job.logs.length > 0 && (
                            <p className="text-[11px] text-text3 truncate mt-0.5">
                              {job.logs[job.logs.length - 1]}
                            </p>
                          )}
                        </div>
                        <div className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0 px-1.5 py-0.5 rounded"
                          style={{
                            color: job.status === 'done' ? '#22C55E' : job.status === 'error' ? '#EF4444' : job.status === 'running' ? '#8B5CF6' : '#52525B',
                            background: job.status === 'done' ? 'rgba(34,197,94,0.08)' : job.status === 'error' ? 'rgba(239,68,68,0.08)' : job.status === 'running' ? 'rgba(139,92,246,0.08)' : 'rgba(82,82,91,0.08)',
                          }}>
                          {job.status}
                        </div>
                      </div>

                      {/* Inline log terminal */}
                      {job.status === 'running' && job.logs.length > 1 && (
                        <div className="px-3.5 pb-2.5 pt-0 space-y-0.5 max-h-16 overflow-auto"
                          style={{ borderTop: '1px solid rgba(139,92,246,0.06)', background: 'rgba(0,0,0,0.3)' }}>
                          {job.logs.slice(-4).map((l, i) => (
                            <p key={i} className="text-[10px] font-mono leading-relaxed text-text3">
                              <span className="text-accent/40 mr-1">›</span>{l}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Cancel */}
                {running && (
                  <div className="px-4 pb-4">
                    <button onClick={() => { abortRef.current.abort = true }}
                      className="w-full py-2.5 rounded-xl text-[12px] font-bold font-mono uppercase tracking-wider transition-all"
                      style={{ background: 'rgba(239,68,68,0.06)', color: '#f87171', border: '1px solid rgba(239,68,68,0.18)' }}>
                      ✕ {t('warmupCancelOp')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab navigation ── */}
            <div className="sf-card rounded-2xl p-1 flex gap-1">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all font-mono"
                  style={activeTab === tab.id
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 2px 16px -4px rgba(124,58,237,0.5)' }
                    : { color: 'rgba(139,92,246,0.45)', background: 'transparent' }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* ── LOG IN tab ── */}
            {activeTab === 'login' && (
              <div className="space-y-4 anim-slide-up">
                <div className="sf-card rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                      style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>🔑</div>
                    <div>
                      <p className="text-[13px] font-bold text-text">{t('warmupLoginCredentials')}</p>
                      <p className="text-[11px] text-text3 font-mono">{t('warmupLoginCredsSub')}</p>
                    </div>
                  </div>

                  {selectedPhones.length === 0 ? (
                    <div className="py-10 flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.12)' }}>←</div>
                      <p className="text-[12px] text-text3 font-mono">{t('warmupSelectPhones')}</p>
                    </div>
                  ) : (
                    <div className="divide-y max-h-[360px] overflow-auto" style={{ borderColor: 'rgba(139,92,246,0.06)' }}>
                      {selectedPhones.map(phone => {
                        const cred = loginCreds[phone.id] ?? { email: '', password: '', totpSecret: '' }
                        return (
                          <div key={phone.id} className="px-5 py-4 space-y-2.5">
                            <p className="text-[12px] font-bold text-accent font-mono uppercase tracking-wider">{phoneName(phone)}</p>
                            <input
                              type="email"
                              placeholder={t('warmupEmailPlaceholder')}
                              value={cred.email}
                              onChange={e => setLoginCred(phone.id, 'email', e.target.value)}
                              className="sf-search w-full rounded-lg px-3.5 py-2.5 text-[12px] font-mono"
                            />
                            <input
                              type="password"
                              placeholder={t('warmupPasswordPlaceholder')}
                              value={cred.password}
                              onChange={e => setLoginCred(phone.id, 'password', e.target.value)}
                              className="sf-search w-full rounded-lg px-3.5 py-2.5 text-[12px] font-mono"
                            />
                            <div className="space-y-1">
                              <input
                                type="text"
                                placeholder="Secret 2FA optionnel — ex: JBSWY3DPEHPK3PXP"
                                value={cred.totpSecret}
                                onChange={e => setLoginCred(phone.id, 'totpSecret', e.target.value)}
                                className="w-full rounded-lg px-3.5 py-2.5 text-[12px] font-mono focus:outline-none"
                                style={{
                                  background: cred.totpSecret ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)',
                                  border: `1px solid ${cred.totpSecret ? 'rgba(139,92,246,0.4)' : 'rgba(139,92,246,0.1)'}`,
                                  color: cred.totpSecret ? '#c4b5fd' : '#52525b',
                                }}
                              />
                              {cred.totpSecret && (
                                <p className="text-[10px] font-mono px-1" style={{ color: 'rgba(139,92,246,0.7)' }}>
                                  ✨ {t('warmupTotp2fa')}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Warning */}
                <div className="rounded-xl px-4 py-3 flex items-start gap-2.5"
                  style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <span className="text-warn text-sm flex-shrink-0 mt-0.5">⚠</span>
                  <p className="text-[11px] font-mono leading-relaxed" style={{ color: 'rgba(245,158,11,0.8)' }}>
                    {t('warmupLoginWarning')}
                  </p>
                </div>

                <Button
                  className="w-full py-3 text-[12px] font-bold font-mono uppercase tracking-wider btn-sf-primary"
                  disabled={selectedPhones.length === 0 || running ||
                    selectedPhones.some(p => !loginCreds[p.id]?.email || !loginCreds[p.id]?.password)}
                  loading={running}
                  onClick={launchLogin}
                >
                  🔑 {t('warmupLaunchLogin')} ({selectedPhones.length})
                </Button>
              </div>
            )}

            {/* ── MASS EDIT tab ── */}
            {activeTab === 'massEdit' && (
              <div className="space-y-4 anim-slide-up">
                <div className="sf-card rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                      style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.2)' }}>✏️</div>
                    <div>
                      <p className="text-[13px] font-bold text-text">{t('warmupProfileEdits')}</p>
                      <p className="text-[11px] text-text3 font-mono">{t('warmupProfileEditsSub')}</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-bold block mb-2 text-text3 font-mono">{t('warmupProfileName')}</label>
                      <input type="text" placeholder="Ex: Marie Fitness | Coach Minceur"
                        value={editName} onChange={e => setEditName(e.target.value)}
                        className="sf-search w-full rounded-lg px-3.5 py-2.5 text-[12px] font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-bold block mb-2 text-text3 font-mono">{t('warmupUsername')}</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] font-mono text-accent/60">@</span>
                        <input type="text" placeholder="marie.fitness"
                          value={editUsername.replace(/^@/, '')}
                          onChange={e => setEditUsername(e.target.value.replace(/^@/, ''))}
                          className="sf-search w-full rounded-lg pl-8 pr-3.5 py-2.5 text-[12px] font-mono"
                        />
                      </div>
                      <p className="text-[10px] mt-1.5 text-text3 font-mono">{t('warmupUsernameTaken')}</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-bold block mb-2 text-text3 font-mono">{t('warmupBio')}</label>
                      <textarea rows={3} placeholder="Ex: 🏋️ Certified fitness coach | -10kg in 90 days ↓"
                        value={editBio} onChange={e => setEditBio(e.target.value)}
                        className="sf-search w-full rounded-lg px-3.5 py-2.5 text-[12px] font-mono resize-none"
                      />
                      <p className="text-[10px] mt-1 font-mono"
                        style={{ color: editBio.length > 150 ? '#EF4444' : '#52525B' }}>
                        {editBio.length}/150
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-bold block mb-2 text-text3 font-mono">{t('warmupProfilePic')}</label>
                      <div className="flex gap-2">
                        <input type="text" placeholder="https://… ou laisser vide"
                          value={editPicUrl} onChange={e => { setEditPicUrl(e.target.value); setEditPicFile(null) }}
                          className="sf-search flex-1 rounded-lg px-3.5 py-2.5 text-[12px] font-mono"
                        />
                        {!isWeb && (
                          <button onClick={async () => {
                            const p = await window.electronAPI?.pickAnyFile?.({ filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }] })
                            if (p) { setEditPicFile(p); setEditPicUrl('') }
                          }}
                            className="rounded-lg px-3.5 py-2.5 text-[11px] font-bold font-mono flex-shrink-0 transition-all"
                            style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', color: '#a78bfa' }}>
                            📂
                          </button>
                        )}
                      </div>
                      {editPicFile && (
                        <p className="text-[10px] mt-1.5 font-mono" style={{ color: 'rgba(139,92,246,0.7)' }}>📎 {fileName(editPicFile)}</p>
                      )}
                      <p className="text-[10px] mt-1.5 text-text3 font-mono">{t('warmupDirectLink')}</p>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full py-3 text-[12px] font-bold font-mono uppercase tracking-wider btn-sf-primary"
                  disabled={selectedPhones.length === 0 || running ||
                    (!editName.trim() && !editUsername.trim() && !editBio.trim() && !editPicUrl.trim())}
                  loading={running}
                  onClick={launchMassEdit}
                >
                  ✏️ {t('warmupApplyEdits')} ({selectedPhones.length})
                </Button>
              </div>
            )}

            {/* ── WARMUP tab ── */}
            {activeTab === 'warmup' && (
              <div className="space-y-4 anim-slide-up">
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                  borderRadius: 12, background: 'rgba(239,68,68,0.07)',
                  border: '1px solid rgba(239,68,68,0.22)',
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>🚧</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', margin: 0 }}>{t('warmupBugTitle')}</p>
                    <p style={{ fontSize: 12, color: 'rgba(239,68,68,0.65)', margin: '3px 0 0' }}>{t('warmupBugDesc')}</p>
                  </div>
                </div>
                <div className="sf-card rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                      style={{ background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.2)' }}>🔥</div>
                    <div>
                      <p className="text-[13px] font-bold text-text">{t('warmupConfig')}</p>
                      <p className="text-[11px] text-text3 font-mono">{t('warmupConfigSub')}</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-5">

                    {/* Duration picker */}
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-bold mb-3 text-text3 font-mono">{t('warmupNavDuration')}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 5, 10, 15, 20, 30].map(m => (
                          <button key={m} onClick={() => setBrowseMinutes(m)}
                            className="py-2.5 rounded-xl text-[12px] font-bold font-mono transition-all"
                            style={browseMinutes === m
                              ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 2px 16px -4px rgba(124,58,237,0.5)' }
                              : { background: 'rgba(139,92,246,0.05)', color: 'rgba(139,92,246,0.45)', border: '1px solid rgba(139,92,246,0.12)' }}>
                            {m === 0 ? '—' : `${m}m`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Toggles */}
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-bold mb-3 text-text3 font-mono">{t('warmupEnabledActions')}</p>
                      <div className="space-y-2.5">
                        {([
                          { key: 'like',   labelKey: 'warmupLikeLabel',   value: likePosts,       set: setLikePosts,       icon: '❤️' },
                          { key: 'reels',  labelKey: 'warmupReelsLabel',  value: watchReels,      set: setWatchReels,      icon: '🎬' },
                          { key: 'follow', labelKey: 'warmupFollowLabel', value: followSuggested, set: setFollowSuggested, icon: '➕' },
                        ] as const).map(({ key, labelKey, value, set, icon }) => {
                          const disabled = browseMinutes === 0
                          return (
                            <div key={key}
                              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${disabled ? 'opacity-35' : ''}`}
                              style={{ background: value && !disabled ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${value && !disabled ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.06)'}` }}>
                              <span className="text-base flex-shrink-0">{icon}</span>
                              <span className="text-[12px] font-mono text-text2 flex-1">{t(labelKey)}</span>
                              <div onClick={() => !disabled && set(!value)}
                                className="relative flex-shrink-0 w-8 h-4 rounded-full cursor-pointer transition-all"
                                style={{ background: value && !disabled ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 ${value && !disabled ? 'left-[18px]' : 'left-0.5'}`} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {browseMinutes === 0 && (
                      <div className="rounded-lg px-3.5 py-2.5 flex items-center gap-2"
                        style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}>
                        <span className="text-warn text-sm">⚠</span>
                        <p className="text-[11px] font-mono" style={{ color: 'rgba(245,158,11,0.75)' }}>{t('warmupDurationZero')}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary card */}
                <div className="sf-card rounded-2xl p-4">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-text3 font-mono mb-3">{t('warmupSummary')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: t('warmupPhones'), value: String(selectedPhones.length), color: selectedPhones.length > 0 ? '#8B5CF6' : '#52525B' },
                      { label: t('warmupNavigation'), value: browseMinutes === 0 ? '—' : `${browseMinutes} min`, color: browseMinutes > 0 ? '#22C55E' : '#52525B' },
                      { label: t('warmupActionsLabel'), value: browseMinutes > 0 ? [likePosts && 'Likes', watchReels && 'Reels', followSuggested && 'Follows'].filter(Boolean).join('+') || '—' : '—', color: '#A1A1AA' },
                      { label: t('warmupTotalDuration'), value: `${selectedPhones.length * (browseMinutes + 2)} min`, color: '#F59E0B' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.07)' }}>
                        <p className="text-[9px] font-mono text-text3 uppercase tracking-widest mb-1">{label}</p>
                        <p className="text-[13px] font-bold font-mono" style={{ color }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full py-3 text-[12px] font-bold font-mono uppercase tracking-wider btn-sf-primary"
                  disabled={selectedPhones.length === 0 || running || browseMinutes === 0}
                  loading={running}
                  onClick={launchWarmup}
                >
                  🔥 {t('warmupLaunchBtn')} ({selectedPhones.length})
                </Button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
