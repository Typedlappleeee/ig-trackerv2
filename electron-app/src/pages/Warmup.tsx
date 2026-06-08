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

// ── Inline Lucide-style icons (no emoji UI icons) ──────────────────────────────
const svgBase = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.85,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}
function IconBolt({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>
}
function IconKey({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>
}
function IconPencil({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
}
function IconFlame({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
}
function IconSmartphone({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
}
function IconAlertTriangle({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
}
function IconHeart({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
}
function IconClapper({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>
}
function IconUserPlus({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
}
function IconSettings({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
}
function IconClose({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} strokeWidth={2.2} aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
}
function IconSparkles({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg>
}
function IconArrowLeft({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
}
function IconFolderOpen({ size = 15 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>
}
function IconPaperclip({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
}
function IconConstruction({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/><path d="M10 14 2.3 6.3"/><path d="m14 6 7.7 7.7"/><path d="m8 6 8 8"/></svg>
}

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
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(168,85,247,0.1))', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }}>
              <IconBolt size={18} />
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
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-warn"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}><IconAlertTriangle size={15} /></div>
              <p className="text-[14px] font-bold text-warn">{t('warmupMissingToken')}</p>
            </div>
            <p className="text-[13px] text-text2">{t('warmupMissingTokenDesc')}</p>
          </div>
        </div>
      </div>
    )
  }

  const TABS: { id: Tab; label: string; icon: JSX.Element; color: string }[] = [
    { id: 'login',    label: 'LOG IN',    icon: <IconKey size={14} />,    color: '#8B5CF6' },
    { id: 'massEdit', label: 'MASS EDIT', icon: <IconPencil size={14} />, color: '#A855F7' },
    { id: 'warmup',   label: 'WARMUP',    icon: <IconFlame size={14} />,  color: '#EC4899' },
  ]

  const jobShowing = running || (jobs.length > 0 && (doneCount + errorCount) === jobs.length)

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg anim-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-8 pb-5 sf-topbar">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(168,85,247,0.1))', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
              <span className="relative z-10"><IconBolt size={18} /></span>
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
                  <span className="text-accent flex items-center"><IconSmartphone size={15} /></span>
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
                    className="rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all hover:border-accent/40 flex items-center gap-1.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.12)', color: '#71717a' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" {...svgBase} aria-hidden="true" style={loadingPhones ? { animation: 'spin 0.8s linear infinite' } : undefined}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                    Sync
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
                  <span className="text-danger flex items-center flex-shrink-0"><IconAlertTriangle size={14} /></span>
                  <p className="text-[12px] text-danger font-mono">{phonesError}</p>
                </div>
              )}

              {phones.length === 0 && !loadingPhones && !phonesError && (
                <div className="py-12 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-accent" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.12)' }}><IconSmartphone size={22} /></div>
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
                        {sel && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>}
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
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-accent"
                          style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)' }}><IconSettings size={14} /></div>
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
                        <span className="flex items-center flex-shrink-0">
                          {job.status === 'done'
                            ? <svg width="14" height="14" viewBox="0 0 24 24" {...svgBase} strokeWidth={2.2} aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
                            : job.status === 'error'
                            ? <svg width="14" height="14" viewBox="0 0 24 24" {...svgBase} strokeWidth={2.2} aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            : job.status === 'running'
                            ? <svg width="14" height="14" viewBox="0 0 24 24" {...svgBase} strokeWidth={2.2} aria-hidden="true" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>}
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
                      className="w-full py-2.5 rounded-xl text-[12px] font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                      style={{ background: 'rgba(239,68,68,0.06)', color: '#f87171', border: '1px solid rgba(239,68,68,0.18)' }}>
                      <IconClose size={13} /> {t('warmupCancelOp')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab navigation ── */}
            <div className="sf-card rounded-2xl p-1 flex gap-1">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all font-mono flex items-center justify-center gap-1.5"
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
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-accent"
                      style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}><IconKey size={15} /></div>
                    <div>
                      <p className="text-[13px] font-bold text-text">{t('warmupLoginCredentials')}</p>
                      <p className="text-[11px] text-text3 font-mono">{t('warmupLoginCredsSub')}</p>
                    </div>
                  </div>

                  {selectedPhones.length === 0 ? (
                    <div className="py-10 flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-accent" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.12)' }}><IconArrowLeft size={18} /></div>
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
                                <p className="text-[10px] font-mono px-1 flex items-center gap-1" style={{ color: 'rgba(139,92,246,0.7)' }}>
                                  <IconSparkles size={11} /> {t('warmupTotp2fa')}
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
                  <span className="text-warn flex-shrink-0 mt-0.5 flex items-center"><IconAlertTriangle size={14} /></span>
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
                  <span className="inline-flex items-center gap-1.5"><IconKey size={14} /> {t('warmupLaunchLogin')} ({selectedPhones.length})</span>
                </Button>
              </div>
            )}

            {/* ── MASS EDIT tab ── */}
            {activeTab === 'massEdit' && (
              <div className="space-y-4 anim-slide-up">
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                  borderRadius: 12, background: 'rgba(239,68,68,0.07)',
                  border: '1px solid rgba(239,68,68,0.22)',
                }}>
                  <span style={{ flexShrink: 0, color: '#EF4444', display: 'inline-flex' }}><IconConstruction size={20} /></span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', margin: 0 }}>Bug rencontré — fonctionnalité indisponible</p>
                    <p style={{ fontSize: 12, color: 'rgba(239,68,68,0.65)', margin: '3px 0 0' }}>Mass Edit est temporairement désactivé en raison d'un bug. Un correctif est en cours.</p>
                  </div>
                </div>
                <div className="sf-card rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.2)', color: '#c084fc' }}><IconPencil size={15} /></div>
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
                            aria-label={t('warmupProfilePic')}
                            className="rounded-lg px-3.5 py-2.5 text-[11px] font-bold font-mono flex-shrink-0 transition-all flex items-center"
                            style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', color: '#a78bfa' }}>
                            <IconFolderOpen size={15} />
                          </button>
                        )}
                      </div>
                      {editPicFile && (
                        <p className="text-[10px] mt-1.5 font-mono flex items-center gap-1" style={{ color: 'rgba(139,92,246,0.7)' }}><IconPaperclip size={11} /> {fileName(editPicFile)}</p>
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
                  <span className="inline-flex items-center gap-1.5"><IconPencil size={14} /> {t('warmupApplyEdits')} ({selectedPhones.length})</span>
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
                  <span style={{ flexShrink: 0, color: '#EF4444', display: 'inline-flex' }}><IconConstruction size={20} /></span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', margin: 0 }}>{t('warmupBugTitle')}</p>
                    <p style={{ fontSize: 12, color: 'rgba(239,68,68,0.65)', margin: '3px 0 0' }}>{t('warmupBugDesc')}</p>
                  </div>
                </div>
                <div className="sf-card rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.2)', color: '#ec4899' }}><IconFlame size={15} /></div>
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
                          { key: 'like',   labelKey: 'warmupLikeLabel',   value: likePosts,       set: setLikePosts,       icon: <IconHeart size={16} /> },
                          { key: 'reels',  labelKey: 'warmupReelsLabel',  value: watchReels,      set: setWatchReels,      icon: <IconClapper size={16} /> },
                          { key: 'follow', labelKey: 'warmupFollowLabel', value: followSuggested, set: setFollowSuggested, icon: <IconUserPlus size={16} /> },
                        ] as const).map(({ key, labelKey, value, set, icon }) => {
                          const disabled = browseMinutes === 0
                          return (
                            <div key={key}
                              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${disabled ? 'opacity-35' : ''}`}
                              style={{ background: value && !disabled ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${value && !disabled ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.06)'}` }}>
                              <span className="flex items-center flex-shrink-0" style={{ color: value && !disabled ? '#c4b5fd' : '#71717a' }}>{icon}</span>
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
                        <span className="text-warn flex items-center flex-shrink-0"><IconAlertTriangle size={14} /></span>
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
                  <span className="inline-flex items-center gap-1.5"><IconFlame size={14} /> {t('warmupLaunchBtn')} ({selectedPhones.length})</span>
                </Button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
