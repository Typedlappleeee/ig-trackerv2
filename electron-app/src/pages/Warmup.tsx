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
function IconRefresh({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
}
function IconCheckCircle({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
}
function IconXCircle({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} strokeWidth={2.2} aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
}
function IconLoader({ size = 14, spinning = false }: { size?: number; spinning?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} strokeWidth={2.2} aria-hidden="true"
      style={spinning ? { animation: 'spin 0.8s linear infinite' } : undefined}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  )
}
function IconCircle({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...svgBase} aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>
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
      <div className="sf-page anim-page">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div className="sf-card" style={{ width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16 }}>
              <div className="sf-spinner" />
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500 }}>{t('loading')}</span>
          </div>
        </div>
      </div>
    )
  }

  const isWeb = typeof window !== 'undefined' && (window as any).__IS_WEB

  if (!bearer) {
    return (
      <div className="sf-page anim-page">
        <div className="sf-page-header">
          <div className="sf-anim-slide-up sf-d50" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="sf-anim-scale-spring" style={{
              width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.1))',
              border: '1px solid rgba(99,102,241,0.25)', color: '#6366F1',
            }}>
              <IconBolt size={18} />
            </div>
            <div>
              <h1 className="sf-page-title">{t('warmupPageTitle')}</h1>
              <p className="sf-page-sub">{t('warmupPageSub')}</p>
            </div>
          </div>
        </div>
        <div className="sf-page-body">
          <div className="sf-card" style={{ maxWidth: 480, padding: '20px 24px', borderColor: 'rgba(245,158,11,0.22)', background: 'rgba(245,158,11,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--warn)',
              }}>
                <IconAlertTriangle size={15} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--warn)' }}>{t('warmupMissingToken')}</p>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>{t('warmupMissingTokenDesc')}</p>
          </div>
        </div>
      </div>
    )
  }

  const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'login',    label: 'Log In',    icon: <IconKey size={13} /> },
    { id: 'massEdit', label: 'Mass Edit', icon: <IconPencil size={13} /> },
    { id: 'warmup',   label: 'Warmup',    icon: <IconFlame size={13} /> },
  ]

  const jobShowing = running || (jobs.length > 0 && (doneCount + errorCount) === jobs.length)

  return (
    <div className="sf-page anim-page">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="sf-page-header">
        <div className="sf-anim-slide-up sf-d50" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="sf-anim-scale-spring" style={{
            width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.1))',
            border: '1px solid rgba(99,102,241,0.3)', color: '#6366F1', position: 'relative', overflow: 'hidden',
          }}>
            <IconBolt size={18} />
            {running && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 12,
                background: 'linear-gradient(135deg, #6366F1, #818CF8)',
                opacity: 0.2, animation: 'sf-ping 1.8s cubic-bezier(0,0,0.2,1) infinite',
              }} />
            )}
          </div>
          <div>
            <h1 className="sf-page-title">{t('warmupPageTitle')}</h1>
            <p className="sf-page-sub">{t('warmupPageSub')}</p>
          </div>
        </div>

        {/* Status pills */}
        <div className="sf-anim-slide-up sf-d100" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="sf-card" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10 }}>
            <span className={onlineCount > 0 ? 'sf-ping-dot' : undefined}
              style={onlineCount > 0 ? undefined : { width: 7, height: 7, borderRadius: '50%', background: '#3f3f46', display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-3)' }}>
              <span style={{ color: onlineCount > 0 ? 'var(--ok)' : 'var(--text-4)', fontWeight: 700 }}>{onlineCount}</span>
              /{phones.length} {t('warmupOnline')}
            </span>
          </div>
          {selected.size > 0 && (
            <span className="sf-badge sf-badge-accent" style={{ fontSize: 12, padding: '4px 10px' }}>
              {selected.size} {t('warmupSelected')}{lang === 'fr' && selected.size !== 1 ? 's' : ''}
            </span>
          )}
          {running && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 10,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
            }}>
              <div className="sf-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-glow)', fontWeight: 600 }}>
                {activeTab === 'login' ? t('warmupLoginRunning') : activeTab === 'massEdit' ? t('warmupMassEditRunning') : t('warmupWarmupRunning')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="sf-page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 20, maxWidth: 1140 }}>

          {/* ── Left: phone list ──────────────────────────────────────────── */}
          <div className="sf-anim-slide-up sf-d150">
            <div className="sf-card" style={{ overflow: 'hidden' }}>

              {/* Phone list header */}
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--accent-glow)', display: 'flex' }}><IconSmartphone size={15} /></span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{t('warmupPhoneList')}</span>
                  {phones.length > 0 && (
                    <span className="sf-badge sf-badge-accent">{phones.length}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={selectAll} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">
                    {t('warmupSelectAll')}
                  </button>
                  <button onClick={loadPhones} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                    style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={loadingPhones ? { animation: 'spin 0.8s linear infinite', display: 'flex' } : { display: 'flex' }}>
                      <IconRefresh size={13} />
                    </span>
                    Sync
                  </button>
                </div>
              </div>

              {/* Search + filter toolbar */}
              {phones.length > 0 && (
                <div className="sf-toolbar" style={{ padding: '10px 14px', gap: 8 }}>
                  <input
                    type="text"
                    placeholder={t('warmupSearchPhone')}
                    value={phoneSearch}
                    onChange={e => setPhoneSearch(e.target.value)}
                    className="sf-input"
                    style={{ flex: 1, minWidth: 0, height: 32, fontSize: 12 }}
                  />
                  {groups.length > 1 && (
                    <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                      className="sf-input cursor-pointer"
                      style={{ width: 'auto', minWidth: 100, height: 32, fontSize: 12 }}>
                      {groups.map(g => <option key={g} value={g} style={{ background: '#0C0C15' }}>{g}</option>)}
                    </select>
                  )}
                  <div style={{
                    padding: '0 10px', height: 32, display: 'flex', alignItems: 'center',
                    borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                    fontSize: 11, fontFamily: 'monospace', color: 'var(--text-4)', flexShrink: 0,
                  }}>
                    {visiblePhones.length}/{phones.length}
                  </div>
                </div>
              )}

              {/* Error state */}
              {phonesError && (
                <div style={{
                  margin: '10px 14px', padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ color: 'var(--danger)', display: 'flex', flexShrink: 0 }}><IconAlertTriangle size={14} /></span>
                  <p style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'monospace' }}>{phonesError}</p>
                </div>
              )}

              {/* Empty state */}
              {phones.length === 0 && !loadingPhones && !phonesError && (
                <div className="sf-empty">
                  <div className="sf-empty-icon" style={{ color: 'var(--accent-glow)' }}><IconSmartphone size={22} /></div>
                  <p className="sf-empty-title">{t('warmupNoPhone')}</p>
                  <p className="sf-empty-desc">{t('warmupNoPhoneDesc')}</p>
                </div>
              )}

              {/* Loading */}
              {loadingPhones && (
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="sf-spinner" />
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-3)' }}>{t('warmupScanning')}</span>
                </div>
              )}

              {/* Phone rows */}
              <div style={{ borderTop: phones.length > 0 ? '1px solid var(--border)' : 'none' }}>
                {visiblePhones.map(phone => {
                  const online = isOnline(phone)
                  const sel    = selected.has(phone.id)
                  const job    = jobs.find(j => j.phone.id === phone.id)
                  const grp    = phone.group?.name ?? phone.groupName
                  return (
                    <button key={phone.id} onClick={() => togglePhone(phone.id)}
                      className="cursor-pointer"
                      style={{
                        width: '100%', padding: '12px 18px',
                        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                        borderBottom: '1px solid var(--border)', background: sel
                          ? 'linear-gradient(90deg, rgba(99,102,241,0.08), transparent)'
                          : 'transparent',
                        transition: 'background 140ms',
                        border: 'none', borderBottomColor: 'var(--border)', cursor: 'pointer',
                        borderBottomStyle: 'solid', borderBottomWidth: 1,
                      }}>

                      {/* Checkbox */}
                      <div style={{
                        width: 17, height: 17, borderRadius: 4, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${sel ? '#6366F1' : 'rgba(99,102,241,0.25)'}`,
                        background: sel ? '#6366F1' : 'transparent',
                        transition: 'all 140ms',
                      }}>
                        {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>}
                      </div>

                      {/* Phone info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {phoneName(phone)}
                        </p>
                        {grp && (
                          <span className="sf-badge sf-badge-muted" style={{ fontSize: 10, marginTop: 3 }}>{grp}</span>
                        )}
                      </div>

                      {/* Job status badge */}
                      {job && job.status !== 'idle' && (
                        <span className={`sf-badge ${job.status === 'done' ? 'sf-badge-ok' : job.status === 'error' ? 'sf-badge-danger' : 'sf-badge-accent'}`}
                          style={{ fontSize: 10, flexShrink: 0 }}>
                          {job.status === 'done' ? t('warmupDoneLabel') : job.status === 'error' ? t('warmupErrLabel') : t('warmupRunLabel')}
                        </span>
                      )}

                      {/* Online dot */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {online
                          ? <span className="sf-ping-dot" />
                          : <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3f3f46', display: 'inline-block' }} />
                        }
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: online ? 'var(--ok)' : 'var(--text-4)' }}>
                          {online ? t('warmupOnlineLabel') : t('warmupOfflineLabel')}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Right: control panel ──────────────────────────────────────── */}
          <div className="sf-anim-slide-up sf-d200" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Execution / job panel ── */}
            {jobShowing && (
              <div className="sf-card anim-slide-up" style={{ overflow: 'hidden' }}>

                {/* Panel header */}
                <div style={{
                  padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border)',
                  background: running ? 'rgba(99,102,241,0.04)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {running && (
                      <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: '50%',
                          background: 'linear-gradient(135deg,#6366F1,#818CF8)',
                          opacity: 0.22, animation: 'sf-ping 1.8s cubic-bezier(0,0,0.2,1) infinite',
                        }} />
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.35)', color: 'var(--accent-glow)',
                        }}>
                          <IconSettings size={13} />
                        </div>
                      </div>
                    )}
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'monospace' }}>
                        {running
                          ? (activeTab === 'login' ? t('warmupLoginRunning') : activeTab === 'massEdit' ? t('warmupMassEditRunning') : t('warmupWarmupRunning'))
                          : errorCount === 0
                            ? `${doneCount} ${t('warmupSuccessAll')}`
                            : `${doneCount}/${jobs.length} ${t('warmupSuccessPartial')} · ${errorCount} ${t('warmupErrors')}`}
                      </p>
                      {running && (
                        <p style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 2 }}>
                          {doneCount} {t('warmupDoneLabel').toLowerCase()} · {runningCount} {lang === 'en' ? 'active' : 'actif'} · {idleCount} {lang === 'en' ? 'waiting' : 'en attente'}
                        </p>
                      )}
                    </div>
                  </div>
                  {!running && (
                    <button onClick={() => setJobs([])} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">
                      {t('warmupClose')}
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                {running && (
                  <div style={{ padding: '12px 18px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        {t('warmupProgression')}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-glow)' }}>{progress}%</span>
                    </div>
                    <div className="sf-progress">
                      <div className="sf-progress-bar" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                {/* Job cards */}
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '44vh', overflowY: 'auto' }}>
                  {jobs.map(job => {
                    const borderColor = job.status === 'done' ? 'rgba(34,197,94,0.5)'
                      : job.status === 'error' ? 'rgba(239,68,68,0.5)'
                      : job.status === 'running' ? 'rgba(99,102,241,0.6)'
                      : 'rgba(255,255,255,0.06)'
                    const statusIcon = job.status === 'done'
                      ? <span style={{ color: 'var(--ok)' }}><IconCheckCircle size={14} /></span>
                      : job.status === 'error'
                      ? <span style={{ color: 'var(--danger)' }}><IconXCircle size={14} /></span>
                      : job.status === 'running'
                      ? <span style={{ color: 'var(--accent-glow)' }}><IconLoader size={14} spinning /></span>
                      : <span style={{ color: 'var(--text-4)' }}><IconCircle size={14} /></span>
                    return (
                      <div key={job.phone.id} style={{
                        borderRadius: 10, overflow: 'hidden', fontFamily: 'monospace',
                        border: '1px solid var(--border)',
                        borderLeft: `3px solid ${borderColor}`,
                        background: job.status === 'running' ? 'rgba(99,102,241,0.04)' : 'transparent',
                      }}>
                        <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ display: 'flex', flexShrink: 0 }}>{statusIcon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {phoneName(job.phone)}
                            </p>
                            {job.error && (
                              <p style={{ fontSize: 11, color: 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                                {job.error}
                              </p>
                            )}
                            {!job.error && job.logs.length > 0 && (
                              <p style={{ fontSize: 11, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                                {job.logs[job.logs.length - 1]}
                              </p>
                            )}
                          </div>
                          <span className={`sf-badge ${job.status === 'done' ? 'sf-badge-ok' : job.status === 'error' ? 'sf-badge-danger' : job.status === 'running' ? 'sf-badge-accent' : 'sf-badge-muted'}`}
                            style={{ fontSize: 9, flexShrink: 0 }}>
                            {job.status}
                          </span>
                        </div>

                        {/* Inline log lines */}
                        {job.status === 'running' && job.logs.length > 1 && (
                          <div style={{
                            padding: '6px 12px 8px', borderTop: '1px solid var(--border)',
                            background: 'rgba(0,0,0,0.28)', maxHeight: 60, overflowY: 'auto',
                            display: 'flex', flexDirection: 'column', gap: 2,
                          }}>
                            {job.logs.slice(-4).map((l, i) => (
                              <p key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-4)', lineHeight: 1.5 }}>
                                <span style={{ color: 'rgba(99,102,241,0.4)', marginRight: 4 }}>›</span>{l}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Cancel button */}
                {running && (
                  <div style={{ padding: '6px 14px 14px' }}>
                    <button onClick={() => { abortRef.current.abort = true }}
                      className="sf-btn sf-btn-danger cursor-pointer"
                      style={{ width: '100%', justifyContent: 'center', gap: 6, height: 36 }}>
                      <IconClose size={13} /> {t('warmupCancelOp')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab navigation ── */}
            <div className="sf-tabs" style={{ padding: 3 }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`sf-tab cursor-pointer ${activeTab === tab.id ? 'active' : ''}`}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32 }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* ── LOG IN tab ── */}
            {activeTab === 'login' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="anim-slide-up">

                {/* Credentials card */}
                <div className="sf-card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', color: 'var(--accent-glow)',
                    }}>
                      <IconKey size={14} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{t('warmupLoginCredentials')}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 1 }}>{t('warmupLoginCredsSub')}</p>
                    </div>
                  </div>

                  {selectedPhones.length === 0 ? (
                    <div className="sf-empty" style={{ paddingTop: 40, paddingBottom: 40 }}>
                      <div className="sf-empty-icon" style={{ color: 'var(--accent-glow)' }}><IconArrowLeft size={18} /></div>
                      <p className="sf-empty-desc">{t('warmupSelectPhones')}</p>
                    </div>
                  ) : (
                    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                      {selectedPhones.map((phone, idx) => {
                        const cred = loginCreds[phone.id] ?? { email: '', password: '', totpSecret: '' }
                        return (
                          <div key={phone.id} style={{
                            padding: '14px 18px',
                            borderBottom: idx < selectedPhones.length - 1 ? '1px solid var(--border)' : 'none',
                            display: 'flex', flexDirection: 'column', gap: 8,
                          }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-glow)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              {phoneName(phone)}
                            </p>
                            <input
                              type="email"
                              placeholder={t('warmupEmailPlaceholder')}
                              value={cred.email}
                              onChange={e => setLoginCred(phone.id, 'email', e.target.value)}
                              className="sf-input"
                              style={{ fontSize: 12, fontFamily: 'monospace' }}
                            />
                            <input
                              type="password"
                              placeholder={t('warmupPasswordPlaceholder')}
                              value={cred.password}
                              onChange={e => setLoginCred(phone.id, 'password', e.target.value)}
                              className="sf-input"
                              style={{ fontSize: 12, fontFamily: 'monospace' }}
                            />
                            <div>
                              <input
                                type="text"
                                placeholder="Secret 2FA optionnel — ex: JBSWY3DPEHPK3PXP"
                                value={cred.totpSecret}
                                onChange={e => setLoginCred(phone.id, 'totpSecret', e.target.value)}
                                className="sf-input"
                                style={{
                                  fontSize: 12, fontFamily: 'monospace',
                                  borderColor: cred.totpSecret ? 'rgba(99,102,241,0.45)' : undefined,
                                  background: cred.totpSecret ? 'rgba(99,102,241,0.07)' : undefined,
                                  color: cred.totpSecret ? '#818CF8' : undefined,
                                }}
                              />
                              {cred.totpSecret && (
                                <p style={{ fontSize: 10, fontFamily: 'monospace', marginTop: 4, paddingLeft: 2, display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(99,102,241,0.7)' }}>
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
                <div style={{
                  padding: '12px 16px', borderRadius: 10,
                  background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.18)',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <span style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1, display: 'flex' }}><IconAlertTriangle size={14} /></span>
                  <p style={{ fontSize: 11, fontFamily: 'monospace', lineHeight: 1.6, color: 'rgba(245,158,11,0.8)' }}>{t('warmupLoginWarning')}</p>
                </div>

                <Button
                  className="w-full btn-sf-primary cursor-pointer"
                  style={{ height: 40, fontSize: 13, fontWeight: 600 }}
                  disabled={selectedPhones.length === 0 || running ||
                    selectedPhones.some(p => !loginCreds[p.id]?.email || !loginCreds[p.id]?.password)}
                  loading={running}
                  onClick={launchLogin}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <IconKey size={14} /> {t('warmupLaunchLogin')} ({selectedPhones.length})
                  </span>
                </Button>
              </div>
            )}

            {/* ── MASS EDIT tab ── */}
            {activeTab === 'massEdit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="anim-slide-up">

                {/* Bug banner */}
                <div style={{
                  padding: '14px 16px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ flexShrink: 0, color: 'var(--danger)', display: 'inline-flex' }}><IconConstruction size={20} /></span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', margin: 0 }}>Bug rencontré — fonctionnalité indisponible</p>
                    <p style={{ fontSize: 12, color: 'rgba(239,68,68,0.65)', margin: '3px 0 0' }}>Mass Edit est temporairement désactivé en raison d'un bug. Un correctif est en cours.</p>
                  </div>
                </div>

                {/* Profile fields card */}
                <div className="sf-card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.22)', color: '#c084fc',
                    }}>
                      <IconPencil size={14} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{t('warmupProfileEdits')}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 1 }}>{t('warmupProfileEditsSub')}</p>
                    </div>
                  </div>

                  <div className="anim-stagger" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Profile name */}
                    <div>
                      <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', marginBottom: 6, fontFamily: 'monospace' }}>
                        {t('warmupProfileName')}
                      </label>
                      <input type="text" placeholder="Ex: Marie Fitness | Coach Minceur"
                        value={editName} onChange={e => setEditName(e.target.value)}
                        className="sf-input" style={{ fontSize: 12 }}
                      />
                    </div>

                    {/* Username */}
                    <div>
                      <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', marginBottom: 6, fontFamily: 'monospace' }}>
                        {t('warmupUsername')}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontFamily: 'monospace', color: 'var(--accent-glow)', opacity: 0.6 }}>@</span>
                        <input type="text" placeholder="marie.fitness"
                          value={editUsername.replace(/^@/, '')}
                          onChange={e => setEditUsername(e.target.value.replace(/^@/, ''))}
                          className="sf-input" style={{ fontSize: 12, paddingLeft: 24 }}
                        />
                      </div>
                      <p style={{ fontSize: 10, marginTop: 4, color: 'var(--text-4)', fontFamily: 'monospace' }}>{t('warmupUsernameTaken')}</p>
                    </div>

                    {/* Bio */}
                    <div>
                      <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', marginBottom: 6, fontFamily: 'monospace' }}>
                        {t('warmupBio')}
                      </label>
                      <textarea rows={3} placeholder="Ex: Certified fitness coach | -10kg in 90 days"
                        value={editBio} onChange={e => setEditBio(e.target.value)}
                        className="sf-input sf-textarea" style={{ fontSize: 12, resize: 'none' }}
                      />
                      <p style={{ fontSize: 10, marginTop: 3, fontFamily: 'monospace', color: editBio.length > 150 ? 'var(--danger)' : 'var(--text-4)' }}>
                        {editBio.length}/150
                      </p>
                    </div>

                    {/* Profile pic */}
                    <div>
                      <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', marginBottom: 6, fontFamily: 'monospace' }}>
                        {t('warmupProfilePic')}
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="text" placeholder="https://… ou laisser vide"
                          value={editPicUrl} onChange={e => { setEditPicUrl(e.target.value); setEditPicFile(null) }}
                          className="sf-input" style={{ flex: 1, fontSize: 12 }}
                        />
                        {!isWeb && (
                          <button onClick={async () => {
                            const p = await window.electronAPI?.pickAnyFile?.({ filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }] })
                            if (p) { setEditPicFile(p); setEditPicUrl('') }
                          }}
                            aria-label={t('warmupProfilePic')}
                            className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer"
                            style={{ flexShrink: 0, width: 34, padding: 0 }}>
                            <IconFolderOpen size={14} />
                          </button>
                        )}
                      </div>
                      {editPicFile && (
                        <p style={{ fontSize: 10, marginTop: 4, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(99,102,241,0.7)' }}>
                          <IconPaperclip size={11} /> {fileName(editPicFile)}
                        </p>
                      )}
                      <p style={{ fontSize: 10, marginTop: 3, color: 'var(--text-4)', fontFamily: 'monospace' }}>{t('warmupDirectLink')}</p>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full btn-sf-primary cursor-pointer"
                  style={{ height: 40, fontSize: 13, fontWeight: 600 }}
                  disabled={selectedPhones.length === 0 || running ||
                    (!editName.trim() && !editUsername.trim() && !editBio.trim() && !editPicUrl.trim())}
                  loading={running}
                  onClick={launchMassEdit}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <IconPencil size={14} /> {t('warmupApplyEdits')} ({selectedPhones.length})
                  </span>
                </Button>
              </div>
            )}

            {/* ── WARMUP tab ── */}
            {activeTab === 'warmup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="anim-slide-up">

                {/* Bug banner */}
                <div style={{
                  padding: '14px 16px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ flexShrink: 0, color: 'var(--danger)', display: 'inline-flex' }}><IconConstruction size={20} /></span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', margin: 0 }}>{t('warmupBugTitle')}</p>
                    <p style={{ fontSize: 12, color: 'rgba(239,68,68,0.65)', margin: '3px 0 0' }}>{t('warmupBugDesc')}</p>
                  </div>
                </div>

                {/* Warmup config card */}
                <div className="sf-card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(233,234,240,0.12)', border: '1px solid rgba(233,234,240,0.22)', color: '#818CF8',
                    }}>
                      <IconFlame size={14} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{t('warmupConfig')}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 1 }}>{t('warmupConfigSub')}</p>
                    </div>
                  </div>

                  <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Duration picker */}
                    <div>
                      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', fontFamily: 'monospace', marginBottom: 10 }}>
                        {t('warmupNavDuration')}
                      </p>
                      <div className="anim-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[0, 5, 10, 15, 20, 30].map(m => (
                          <button key={m} onClick={() => setBrowseMinutes(m)}
                            className="cursor-pointer"
                            style={{
                              padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                              cursor: 'pointer', border: 'none', transition: 'all 140ms',
                              ...(browseMinutes === m
                                ? { background: 'linear-gradient(140deg, #6366F1, #4F46E5)', color: '#fff', boxShadow: '0 0 18px -4px rgba(99,102,241,0.55)' }
                                : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }),
                            }}>
                            {m === 0 ? '—' : `${m}m`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Action toggles */}
                    <div>
                      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', fontFamily: 'monospace', marginBottom: 10 }}>
                        {t('warmupEnabledActions')}
                      </p>
                      <div className="anim-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {([
                          { key: 'like',   labelKey: 'warmupLikeLabel',   value: likePosts,       set: setLikePosts,       icon: <IconHeart size={15} /> },
                          { key: 'reels',  labelKey: 'warmupReelsLabel',  value: watchReels,      set: setWatchReels,      icon: <IconClapper size={15} /> },
                          { key: 'follow', labelKey: 'warmupFollowLabel', value: followSuggested, set: setFollowSuggested, icon: <IconUserPlus size={15} /> },
                        ] as const).map(({ key, labelKey, value, set, icon }) => {
                          const disabled = browseMinutes === 0
                          return (
                            <div key={key} style={{
                              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8,
                              opacity: disabled ? 0.35 : 1, transition: 'all 140ms',
                              background: value && !disabled ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
                              border: `1px solid ${value && !disabled ? 'rgba(99,102,241,0.2)' : 'var(--border)'}`,
                            }}>
                              <span style={{ display: 'flex', flexShrink: 0, color: value && !disabled ? 'var(--accent-glow)' : 'var(--text-4)' }}>{icon}</span>
                              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', fontFamily: 'monospace' }}>{t(labelKey)}</span>
                              {/* Toggle using sf-toggle-track */}
                              <div
                                onClick={() => !disabled && set(!value)}
                                className={`sf-toggle-track cursor-pointer ${value && !disabled ? 'on' : 'off'}`}
                              >
                                <span className="sf-toggle-thumb" />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Duration zero warning */}
                    {browseMinutes === 0 && (
                      <div style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.18)',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{ color: 'var(--warn)', display: 'flex', flexShrink: 0 }}><IconAlertTriangle size={14} /></span>
                        <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(245,158,11,0.78)' }}>{t('warmupDurationZero')}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary card */}
                <div className="sf-card" style={{ padding: '16px 18px' }}>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', fontFamily: 'monospace', marginBottom: 12 }}>
                    {t('warmupSummary')}
                  </p>
                  <div className="anim-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {[
                      { label: t('warmupPhones'),        value: String(selectedPhones.length),  color: selectedPhones.length > 0 ? 'var(--accent-glow)' : 'var(--text-4)' },
                      { label: t('warmupNavigation'),    value: browseMinutes === 0 ? '—' : `${browseMinutes} min`, color: browseMinutes > 0 ? 'var(--ok)' : 'var(--text-4)' },
                      { label: t('warmupActionsLabel'),  value: browseMinutes > 0 ? [likePosts && 'Likes', watchReels && 'Reels', followSuggested && 'Follows'].filter(Boolean).join(' + ') || '—' : '—', color: 'var(--text-2)' },
                      { label: t('warmupTotalDuration'), value: `${selectedPhones.length * (browseMinutes + 2)} min`, color: 'var(--warn)' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</p>
                        <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full btn-sf-primary cursor-pointer"
                  style={{ height: 40, fontSize: 13, fontWeight: 600 }}
                  disabled={selectedPhones.length === 0 || running || browseMinutes === 0}
                  loading={running}
                  onClick={launchWarmup}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <IconFlame size={14} /> {t('warmupLaunchBtn')} ({selectedPhones.length})
                  </span>
                </Button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
