import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
import { Button } from '@/components/ui/Button'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import {
  fetchAllPhones, warmupAccount, warmupAccountNative, warmupTikTokNative, updateInstagramProfile, editInstagramProfileNative, editTikTokProfileNative, loginInstagramAccount, stopPhone,
  type GeelarkPhone, type WarmupConfig,
} from '@/lib/geelark'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { BankPicker } from '@/pages/Bank'
import { logActivity } from '@/lib/activityLog'
import { useT, useLang } from '@/lib/i18n'
import { activeRotationUrls, getProxyRotation } from '@/lib/proxyRotation'
import { Toggle } from '@/components/ui/Toggle'

interface WarmupProps { user: User }

type Tab = 'login' | 'massEdit' | 'warmup'

interface PhoneJob {
  phone:  GeelarkPhone
  status: 'idle' | 'running' | 'done' | 'error'
  logs:   string[]
  error?: string
}

interface LoginCred { email: string; password: string; totpSecret: string }

function fileName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

// Flags bug — tant qu'ils sont affichés, les lancements correspondants sont bloqués.
const MASS_EDIT_BUGGED = true
const WARMUP_BUGGED    = true

// Pool de concurrence — limite le nombre de téléphones traités en parallèle.
const MAX_CONCURRENCY = 8
async function pLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

// ── Inline Lucide-style icons ──────────────────────────────────────────────────
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

// Bandeau « Proxy rotatif » : quand activé, l'édition/warmup se fait EN SÉRIE
// (1 téléphone à la fois) avec rotation d'IP avant chaque démarrage.
function ProxyRotToggle({ on, setOn }: { on: boolean; setOn: (v: boolean) => void }) {
  const cfg = getProxyRotation()
  const configured = cfg.enabled && cfg.urls.length > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--border-md)' }}>
      <Toggle
        on={on}
        onChange={setOn}
        warn={!configured}
        warnTitle="Rotation non configurée — Réglages → Connexions → Rotation d'IP proxy"
        label="Proxy rotatif"
        hint={on
          ? (configured ? 'Traitement 1 par 1 · nouvelle IP avant chaque téléphone' : '⚠ Aucune URL de rotation — configure-la dans les Réglages')
          : 'Traitement en parallèle · sans rotation d’IP'}
      />
    </div>
  )
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
  const [groupFilter,   _setGroupFilter]  = useState(loadLastGroup)
  const setGroupFilter = (g: string) => { _setGroupFilter(g); saveLastGroup(g) }
  const [groups,        setGroups]        = useState<string[]>(['Tous'])

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('login')

  // ── Avertissement développement ───────────────────────────────────────────

  // ── LOG IN state ──────────────────────────────────────────────────────────
  const [loginCreds, setLoginCreds] = useState<Record<string, LoginCred>>({})
  const [bulkCreds,  setBulkCreds]  = useState('')

  // ── MASS EDIT state ───────────────────────────────────────────────────────
  const [editName,     setEditName]     = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editBio,      setEditBio]      = useState('')
  const [editPicUrl,   setEditPicUrl]   = useState('')
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [editPicFile,  setEditPicFile]  = useState<string | null>(null)

  // ── WARMUP state ──────────────────────────────────────────────────────────
  const [browseMinutes,   setBrowseMinutes]   = useState(() => Number(localStorage.getItem('sf-wu-browse') ?? '15'))
  const [likePosts,       setLikePosts]       = useState(() => localStorage.getItem('sf-wu-like') !== '0')
  const [watchReels,      setWatchReels]      = useState(() => localStorage.getItem('sf-wu-watch') !== '0')
  const [followSuggested, setFollowSuggested] = useState(() => localStorage.getItem('sf-wu-follow') === '1')
  const [warmupKeyword,   setWarmupKeyword]   = useState(() => localStorage.getItem('sf-wu-keyword') ?? '')
  const [warmupPlatform,  setWarmupPlatform]  = useState<'instagram' | 'tiktok'>('instagram')
  const [warmupPlatformChosen, setWarmupPlatformChosen] = useState(false)
  // Engagement TikTok
  const [ttLike,    setTtLike]    = useState(true)
  const [ttFollow,  setTtFollow]  = useState(false)
  const [ttComment, setTtComment] = useState(false)

  // ── Job / execution state ─────────────────────────────────────────────────
  const [jobs,    setJobs]    = useState<PhoneJob[]>([])
  const [running, setRunning] = useState(false)

  // Proxy rotatif : quand coché → traitement EN SÉRIE (1 téléphone à la fois) avec
  // rotation d'IP avant d'allumer chaque téléphone (édition de profil ET warmup).
  const [rotProxy, setRotProxy] = useState(() => localStorage.getItem('sf-warmup-rotproxy') === '1')
  useEffect(() => { localStorage.setItem('sf-warmup-rotproxy', rotProxy ? '1' : '0') }, [rotProxy])

  // Persistance de la config de warmup (perdue avant en changeant d'onglet).
  useEffect(() => { localStorage.setItem('sf-wu-browse', String(browseMinutes)) }, [browseMinutes])
  useEffect(() => { localStorage.setItem('sf-wu-like', likePosts ? '1' : '0') }, [likePosts])
  useEffect(() => { localStorage.setItem('sf-wu-watch', watchReels ? '1' : '0') }, [watchReels])
  useEffect(() => { localStorage.setItem('sf-wu-follow', followSuggested ? '1' : '0') }, [followSuggested])
  useEffect(() => { localStorage.setItem('sf-wu-keyword', warmupKeyword) }, [warmupKeyword])
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
      if (!grps.includes(loadLastGroup())) setGroupFilter('Tous')
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

  function selectAll()   { setSelected(new Set(visiblePhones.map(p => p.id))) }
  function deselectAll() { setSelected(new Set()) }

  function setLoginCred(phoneId: string, field: keyof LoginCred, value: string) {
    setLoginCreds(prev => {
      const existing = prev[phoneId] ?? { email: '', password: '', totpSecret: '' }
      return { ...prev, [phoneId]: { ...existing, [field]: value } }
    })
  }

  function applyBulkCreds() {
    const lines = bulkCreds.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    const targets = phones.filter(p => selected.has(p.id))
    setLoginCreds(prev => {
      const next = { ...prev }
      targets.forEach((phone, i) => {
        const line = lines[i]
        if (!line) return
        const parts = line.split(':')
        const email      = (parts[0] ?? '').trim()
        const totpSecret = parts.length >= 3 ? (parts[parts.length - 1] ?? '').trim() : ''
        const password   = (parts.length >= 3 ? parts.slice(1, -1).join(':') : parts.slice(1).join(':')).trim()
        if (!email || !password) return
        next[phone.id] = { email, password, totpSecret }
      })
      return next
    })
    setBulkCreds('')
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

    await pLimit(targets, MAX_CONCURRENCY, async phone => {
      if (abortRef.current.abort) {
        updateJob(phone.id, { status: 'error', error: 'Annulé' })
        return
      }
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
      addLog(phone.id, 'Extinction du téléphone…')
      await stopPhone(bearer, phone.id)
    })

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
      profileName:   editName.trim()    || undefined,
      username:      editUsername.trim() || undefined,
      bio:           editBio.trim().slice(0, 150) || undefined,
      profilePicUrl: editPicUrl.trim() || undefined,
    }

    // Proxy rotatif : rotation d'IP avant chaque téléphone → série (1 par 1).
    const rotationUrls = rotProxy ? activeRotationUrls() : []
    const concurrency  = rotProxy ? 1 : MAX_CONCURRENCY

    await pLimit(targets, concurrency, async phone => {
      if (abortRef.current.abort) {
        updateJob(phone.id, { status: 'error', error: 'Annulé' })
        return
      }
      updateJob(phone.id, { status: 'running' })
      try {
        const result = warmupPlatform === 'tiktok'
          ? await editTikTokProfileNative(bearer, phone.id, {
              nickName:  config.profileName,
              bio:       config.bio,
              avatarUrl: config.profilePicUrl,
              rotationUrls,
            }, msg => addLog(phone.id, msg))
          : await editInstagramProfileNative(bearer, phone.id, {
              nickname:  config.profileName,
              username:  config.username,
              biography: config.bio,
              avatarUrl: config.profilePicUrl,
              rotationUrls,
            }, msg => addLog(phone.id, msg))
        updateJob(phone.id, result.ok ? { status: 'done' } : { status: 'error', error: result.error })
      } catch (e) {
        updateJob(phone.id, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
      addLog(phone.id, 'Extinction du téléphone…')
      await stopPhone(bearer, phone.id)
    })

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

    // Proxy rotatif : rotation d'IP avant chaque téléphone → série (1 par 1).
    const rotationUrls = rotProxy ? activeRotationUrls() : []
    const concurrency  = rotProxy ? 1 : MAX_CONCURRENCY
    const config: WarmupConfig = { browseMinutes, likePosts, watchReels, followSuggested, keyword: warmupKeyword.trim() || undefined, rotationUrls }

    await pLimit(targets, concurrency, async phone => {
      if (abortRef.current.abort) {
        updateJob(phone.id, { status: 'error', error: 'Annulé' })
        return
      }
      updateJob(phone.id, { status: 'running' })
      const result = warmupPlatform === 'tiktok'
        // TikTok : warmup natif (recherche/parcours) + engagement (like/follow/commentaire IA)
        ? await warmupTikTokNative(bearer, phone.id, { keyword: warmupKeyword, durationMin: browseMinutes, like: ttLike, follow: ttFollow, comment: ttComment, rotationUrls }, msg => addLog(phone.id, msg))
        // Instagram : mot-clé → recherche ADB ; sinon → warmup IA natif général
        : warmupKeyword.trim()
          ? await warmupAccount(bearer, phone.id, config, msg => addLog(phone.id, msg), abortRef.current)
          : await warmupAccountNative(bearer, phone.id, { browseVideo: Math.max(1, Math.min(100, browseMinutes)), rotationUrls }, msg => addLog(phone.id, msg))
      updateJob(phone.id, result.ok ? { status: 'done' } : { status: 'error', error: result.error })
      addLog(phone.id, 'Extinction du téléphone…')
      await stopPhone(bearer, phone.id)
    })

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.28)', color: 'var(--accent)',
            }}>
              <IconBolt size={22} />
            </div>
            <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
              <h1 className="sf-page-title">{t('warmupPageTitle')}</h1>
              <p className="sf-page-sub">{t('warmupPageSub')}</p>
            </div>
          </div>
        </div>
        <div className="sf-page-body">
          <div className="sf-card" style={{ maxWidth: 480, padding: '20px 24px', borderColor: 'rgba(245,158,11,0.22)', background: 'rgba(245,158,11,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--warn)' }}>
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

  const TABS: { id: Tab; label: string; icon: JSX.Element }[] = ([
    { id: 'login',    label: 'Log In',    icon: <IconKey size={13} /> },
    { id: 'massEdit', label: 'Mass Edit', icon: <IconPencil size={13} /> },
    { id: 'warmup',   label: 'Warmup',    icon: <IconFlame size={13} /> },
  ] as { id: Tab; label: string; icon: JSX.Element }[])
    // L'auto-login TikTok n'est pas encore dispo → on masque l'onglet pour TikTok.
    .filter(tab => !(warmupPlatform === 'tiktok' && tab.id === 'login'))

  const jobShowing = running || (jobs.length > 0 && (doneCount + errorCount) === jobs.length)

  return (
    <div className="sf-page anim-page">

      {/* Popup de choix de plateforme — niveau page (Login / Mass Edit / Warmup) */}
      {!warmupPlatformChosen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,11,14,0.8)', backdropFilter: 'blur(8px)', padding: 24 }}>
          <div className="sf-anim-scale-in" style={{
            width: '100%', maxWidth: 500, position: 'relative',
            background: 'linear-gradient(170deg, #16171F, #0F1014)', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 20, overflow: 'hidden',
            boxShadow: '0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            <div aria-hidden style={{ position: 'absolute', top: -70, left: '30%', width: 300, height: 180, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(251,146,60,0.14), transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', padding: '24px 24px 4px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.8)' }}>Warmup</p>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>Quelle plateforme ?</h2>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6, marginBottom: 0 }}>Choisis la plateforme pour cette session.</p>
            </div>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 22 }}>
              {([
                {
                  k: 'instagram', label: 'Instagram', desc: 'Login + Mass Edit + Warmup',
                  grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.5)', accent: '#F472B6',
                  icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="#fff" stroke="none"/></svg>,
                },
                {
                  k: 'tiktok', label: 'TikTok', desc: 'Mass Edit + Warmup (login bientôt)',
                  grad: 'linear-gradient(135deg,#06B6D4,#3B82F6)', glow: 'rgba(34,211,238,0.5)', accent: '#22D3EE',
                  icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff"><path d="M16.5 3c.4 2.4 2 4.1 4.5 4.4v3c-1.7.1-3.2-.4-4.6-1.3v6.2c0 3.6-2.7 5.9-6 5.9-3.2 0-5.6-2.5-5.6-5.5 0-3.4 2.9-5.9 6.4-5.3v3.1c-.4-.1-.9-.2-1.3-.2-1.4 0-2.4 1-2.4 2.4 0 1.4 1 2.4 2.5 2.4 1.6 0 2.6-1.1 2.6-2.9V3h3.9z"/></svg>,
                },
              ] as const).map(p => (
                <button key={p.k}
                  onClick={() => {
                    setWarmupPlatform(p.k); setWarmupPlatformChosen(true)
                    // L'onglet Login n'existe pas pour TikTok → bascule vers Warmup.
                    if (p.k === 'tiktok' && activeTab === 'login') setActiveTab('warmup')
                  }}
                  className="cursor-pointer"
                  style={{
                    padding: 18, borderRadius: 16, textAlign: 'center',
                    background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
                    border: '1px solid rgba(255,255,255,0.09)',
                    transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s, border-color 0.25s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 22px 46px -20px ${p.glow}`; e.currentTarget.style.borderColor = `${p.accent}66` }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.grad, boxShadow: `0 10px 22px -8px ${p.glow}, inset 0 1px 0 rgba(255,255,255,0.3)` }}>{p.icon}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(233,234,240,0.5)', marginTop: 4, lineHeight: 1.45 }}>{p.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sélecteur d'avatar depuis la banque (Mass Edit) */}
      {showAvatarPicker && (
        <BankPicker
          user={user}
          mode="single"
          resolveMode="signed-url"
          onSelect={(paths) => {
            const url = paths?.[0]
            if (url) { setEditPicUrl(url); setEditPicFile(null) }
            setShowAvatarPicker(false)
          }}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="sf-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            background: 'linear-gradient(135deg,#EA580C,#FB923C)',
            boxShadow: '0 10px 24px -8px rgba(251,146,60,0.55), inset 0 1px 0 0 rgba(255,255,255,0.35)',
            position: 'relative', overflow: 'hidden',
          }}>
            <IconBolt size={22} />
            {running && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 13,
                background: 'linear-gradient(135deg,#fff,#FDBA74)',
                opacity: 0.25, animation: 'sf-ping 1.8s cubic-bezier(0,0,0.2,1) infinite',
              }} />
            )}
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title">{t('warmupPageTitle')}</h1>
            <p className="sf-page-sub">{t('warmupPageSub')}</p>
          </div>
        </div>

        {/* Header right: status pills */}
        <div className="sf-anim-slide-up sf-d100" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="sf-card" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10 }}>
            {onlineCount > 0
              ? <span className="sf-ping-dot" />
              : <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3f3f46', display: 'inline-block' }} />}
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: onlineCount > 0 ? 'var(--ok)' : 'var(--text-4)', fontWeight: 700 }}>{onlineCount}</span>
              /{phones.length} {t('warmupOnline')}
            </span>
          </div>
          {selected.size > 0 && (
            <span className="sf-badge sf-badge-accent" style={{ fontSize: 12, padding: '4px 10px', fontVariantNumeric: 'tabular-nums' }}>
              {selected.size} {t('warmupSelected')}{lang === 'fr' && selected.size !== 1 ? 's' : ''}
            </span>
          )}
          {running && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 10,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
            }}>
              <div className="sf-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-l)', fontWeight: 600 }}>
                {activeTab === 'login' ? t('warmupLoginRunning') : activeTab === 'massEdit' ? t('warmupMassEditRunning') : t('warmupWarmupRunning')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="sf-page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 20, maxWidth: 1140 }}>

          {/* ── Left: phone list ──────────────────────────────────────────────── */}
          <div className="sf-anim-slide-up sf-d150">
            <div className="sf-card" style={{ overflow: 'hidden' }}>

              {/* Phone list header */}
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--accent-l)', display: 'flex' }}><IconSmartphone size={15} /></span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{t('warmupPhoneList')}</span>
                  {phones.length > 0 && (
                    <span className="sf-badge sf-badge-accent" style={{ fontVariantNumeric: 'tabular-nums' }}>{phones.length}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={selectAll} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">
                    {t('warmupSelectAll')}
                  </button>
                  <button onClick={deselectAll} disabled={selected.size === 0}
                    className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                    style={selected.size === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
                    Tout désélectionner
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
                    fontSize: 11, fontFamily: 'monospace', color: 'var(--text-4)', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {visiblePhones.length}/{phones.length}
                  </div>
                </div>
              )}

              {/* Error state */}
              {phonesError && (
                <div style={{
                  margin: '10px 14px', padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.18)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ color: 'var(--err)', display: 'flex', flexShrink: 0 }}><IconAlertTriangle size={14} /></span>
                  <p style={{ fontSize: 12, color: 'var(--err)', fontFamily: 'monospace' }}>{phonesError}</p>
                </div>
              )}

              {/* Empty state */}
              {phones.length === 0 && !loadingPhones && !phonesError && (
                <div className="sf-empty">
                  <div className="sf-empty-icon" style={{ color: 'var(--accent-l)' }}><IconSmartphone size={22} /></div>
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

              {/* Phone rows — anim-stagger */}
              <div className="anim-stagger" style={{ borderTop: phones.length > 0 ? '1px solid var(--border)' : 'none' }}>
                {visiblePhones.map(phone => {
                  const online = isOnline(phone)
                  const sel    = selected.has(phone.id)
                  const job    = jobs.find(j => j.phone.id === phone.id)
                  const grp    = phone.group?.name ?? phone.groupName
                  return (
                    <div key={phone.id}
                      className="sf-card-lift cursor-pointer"
                      onClick={() => togglePhone(phone.id)}
                      role="checkbox"
                      aria-checked={sel}
                      tabIndex={0}
                      onKeyDown={e => e.key === ' ' && togglePhone(phone.id)}
                      style={{
                        padding: '11px 16px',
                        display: 'flex', alignItems: 'center', gap: 12,
                        borderBottom: '1px solid var(--border)',
                        background: sel
                          ? 'linear-gradient(90deg,rgba(99,102,241,0.09),transparent)'
                          : 'transparent',
                        transition: 'background 150ms',
                        cursor: 'pointer',
                      }}>

                      {/* Status dot (online indicator) */}
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                        {online
                          ? <span className="sf-ping-dot" />
                          : <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3f3f46', display: 'inline-block' }} />}
                      </div>

                      {/* Checkbox */}
                      <div style={{
                        width: 17, height: 17, borderRadius: 4, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${sel ? 'var(--accent)' : 'rgba(99,102,241,0.25)'}`,
                        background: sel ? 'var(--accent)' : 'transparent',
                        transition: 'all 150ms',
                      }}>
                        {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>}
                      </div>

                      {/* Phone info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {phoneName(phone)}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          {grp && <span className="sf-badge" style={{ fontSize: 10 }}>{grp}</span>}
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: online ? 'var(--ok)' : 'var(--text-4)' }}>
                            {online ? t('warmupOnlineLabel') : t('warmupOfflineLabel')}
                          </span>
                        </div>
                      </div>

                      {/* Job status badge */}
                      {job && job.status !== 'idle' && (
                        <span className={`sf-badge ${job.status === 'done' ? 'sf-badge-ok' : job.status === 'error' ? 'sf-badge-danger' : 'sf-badge-accent'}`}
                          style={{ fontSize: 10, flexShrink: 0 }}>
                          {job.status === 'done' ? t('warmupDoneLabel') : job.status === 'error' ? t('warmupErrLabel') : t('warmupRunLabel')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Right: control panel ──────────────────────────────────────────── */}
          <div className="sf-anim-slide-up sf-d200" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Execution / job panel ── */}
            {jobShowing && (
              <div className="sf-card sf-anim-slide-up" style={{ overflow: 'hidden' }}>

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
                          background: 'linear-gradient(135deg,var(--accent),var(--accent-l))',
                          opacity: 0.22, animation: 'sf-ping 1.8s cubic-bezier(0,0,0.2,1) infinite',
                        }} />
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.35)', color: 'var(--accent-l)',
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
                        <p style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
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
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-l)', fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99,
                        width: `${progress}%`,
                        background: 'var(--ok)',
                        transition: 'width 300ms ease',
                      }} />
                    </div>
                  </div>
                )}

                {/* Job cards */}
                <div className="anim-stagger" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '44vh', overflowY: 'auto' }}>
                  {jobs.map(job => {
                    const borderColor = job.status === 'done' ? 'rgba(52,211,153,0.5)'
                      : job.status === 'error' ? 'rgba(248,113,113,0.5)'
                      : job.status === 'running' ? 'rgba(99,102,241,0.6)'
                      : 'rgba(255,255,255,0.06)'
                    const statusIcon = job.status === 'done'
                      ? <span style={{ color: 'var(--ok)' }}><IconCheckCircle size={14} /></span>
                      : job.status === 'error'
                      ? <span style={{ color: 'var(--err)' }}><IconXCircle size={14} /></span>
                      : job.status === 'running'
                      ? <span style={{ color: 'var(--accent-l)' }}><IconLoader size={14} spinning /></span>
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
                              <p style={{ fontSize: 11, color: 'var(--err)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
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

                        {/* Inline log lines — expand on running */}
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

                {/* Cancel */}
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

            {/* ── Pill tab switcher ── */}
            <div style={{
              display: 'flex', gap: 4, padding: 4,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}>
              {TABS.map(tab => {
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="cursor-pointer"
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      height: 34, borderRadius: 9, fontSize: 12, fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      transition: 'all 160ms',
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? '#fff' : 'var(--text-3)',
                      boxShadow: active ? '0 2px 12px rgba(99,102,241,0.35)' : 'none',
                    }}>
                    {tab.icon} {tab.label}
                  </button>
                )
              })}
            </div>

            {/* ── LOG IN tab ── */}
            {activeTab === 'login' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="sf-anim-slide-up">

                {/* Bulk import */}
                <div className="sf-card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--accent-l)', display: 'flex' }}><IconPaperclip size={13} /></span>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Import en masse</p>
                      <p style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 1 }}>
                        email:password:2fa par ligne — appliqué aux téléphones sélectionnés dans l'ordre
                      </p>
                    </div>
                  </div>
                  <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      rows={4}
                      placeholder={'compte1@mail.com:motdepasse1:SECRET2FA\ncompte2@mail.com:motdepasse2'}
                      value={bulkCreds}
                      onChange={e => setBulkCreds(e.target.value)}
                      className="sf-input sf-textarea"
                      style={{ fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
                    />
                    <button
                      onClick={applyBulkCreds}
                      disabled={!bulkCreds.trim() || selectedPhones.length === 0}
                      className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer"
                      style={{
                        alignSelf: 'flex-end',
                        opacity: !bulkCreds.trim() || selectedPhones.length === 0 ? 0.45 : 1,
                        cursor: !bulkCreds.trim() || selectedPhones.length === 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Appliquer ({Math.min(bulkCreds.split('\n').filter(l => l.trim()).length, selectedPhones.length)})
                    </button>
                  </div>
                </div>

                {/* Credentials per phone */}
                <div className="sf-card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', color: 'var(--accent-l)',
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
                      <div className="sf-empty-icon" style={{ color: 'var(--accent-l)' }}><IconArrowLeft size={18} /></div>
                      <p className="sf-empty-desc">{t('warmupSelectPhones')}</p>
                    </div>
                  ) : (
                    <div className="anim-stagger" style={{ maxHeight: 340, overflowY: 'auto' }}>
                      {selectedPhones.map((phone, idx) => {
                        const cred = loginCreds[phone.id] ?? { email: '', password: '', totpSecret: '' }
                        return (
                          <div key={phone.id} style={{
                            padding: '14px 18px',
                            borderBottom: idx < selectedPhones.length - 1 ? '1px solid var(--border)' : 'none',
                            display: 'flex', flexDirection: 'column', gap: 8,
                          }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-l)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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
                                  color: cred.totpSecret ? 'var(--accent-l)' : undefined,
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
                  style={{ height: 44, fontSize: 13, fontWeight: 600, borderRadius: 10 }}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="sf-anim-slide-up">

                {/* Note : la photo doit être une URL d'image accessible */}
                <p style={{ fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.5, padding: '0 2px' }}>
                  La photo de profil doit être une <b>URL d'image</b> accessible.
                </p>

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
                    <div>
                      <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', marginBottom: 6, fontFamily: 'monospace' }}>
                        {t('warmupProfileName')}
                      </label>
                      <input type="text" placeholder="Ex: Marie Fitness | Coach Minceur"
                        value={editName} onChange={e => setEditName(e.target.value)}
                        className="sf-input" style={{ fontSize: 12 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', marginBottom: 6, fontFamily: 'monospace' }}>
                        {t('warmupUsername')}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontFamily: 'monospace', color: 'var(--accent-l)', opacity: 0.6 }}>@</span>
                        <input type="text" placeholder="marie.fitness"
                          value={editUsername.replace(/^@/, '')}
                          onChange={e => setEditUsername(e.target.value.replace(/^@/, ''))}
                          className="sf-input" style={{ fontSize: 12, paddingLeft: 24 }}
                        />
                      </div>
                      <p style={{ fontSize: 10, marginTop: 4, color: 'var(--text-4)', fontFamily: 'monospace' }}>{t('warmupUsernameTaken')}</p>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', marginBottom: 6, fontFamily: 'monospace' }}>
                        {t('warmupBio')}
                      </label>
                      <textarea rows={3} placeholder="Ex: Certified fitness coach | -10kg in 90 days"
                        value={editBio} onChange={e => setEditBio(e.target.value)}
                        className="sf-input sf-textarea" style={{ fontSize: 12, resize: 'none' }}
                      />
                      <p style={{ fontSize: 10, marginTop: 3, fontFamily: 'monospace', color: editBio.length > 150 ? 'var(--err)' : 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>
                        {editBio.length}/150
                      </p>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', marginBottom: 6, fontFamily: 'monospace' }}>
                        {t('warmupProfilePic')}
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="text" placeholder="Choisir depuis la banque →"
                          value={editPicUrl} onChange={e => { setEditPicUrl(e.target.value); setEditPicFile(null) }}
                          className="sf-input" style={{ flex: 1, fontSize: 12 }}
                        />
                        <button onClick={() => setShowAvatarPicker(true)}
                          className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer"
                          style={{ flexShrink: 0, gap: 5 }}>
                          <IconFolderOpen size={14} /> Banque
                        </button>
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

                <ProxyRotToggle on={rotProxy} setOn={setRotProxy} />

                <Button
                  className="w-full btn-sf-primary cursor-pointer"
                  style={{ height: 44, fontSize: 13, fontWeight: 600, borderRadius: 10 }}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="sf-anim-slide-up">

                {/* Config card */}
                <div className="sf-card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', color: 'var(--accent-l)',
                    }}>
                      <IconFlame size={14} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{t('warmupConfig')}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 1 }}>{t('warmupConfigSub')}</p>
                    </div>
                  </div>

                  <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Bandeau plateforme + bouton changer */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Plateforme :</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                        {warmupPlatform === 'tiktok' ? '🎵 TikTok' : '📸 Instagram'}
                      </span>
                      <button onClick={() => setWarmupPlatformChosen(false)}
                        className="cursor-pointer"
                        style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)', color: 'var(--accent-l)' }}>
                        Changer
                      </button>
                    </div>

                    {/* Engagement TikTok */}
                    {warmupPlatform === 'tiktok' && (
                      <div>
                        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', fontFamily: 'monospace', marginBottom: 10 }}>
                          Engagement (optionnel)
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {([
                            { v: ttLike,    set: setTtLike,    icon: <IconHeart size={15} />,    label: 'J\'aime aléatoires', desc: 'Like des vidéos parcourues' },
                            { v: ttFollow,  set: setTtFollow,  icon: <IconUserPlus size={15} />, label: 'Abonnements aléatoires', desc: 'Suit quelques comptes' },
                            { v: ttComment, set: setTtComment, icon: <IconSparkles size={15} />, label: 'Commentaires IA', desc: 'Commente avec une IA' },
                          ]).map((a, i) => (
                            <button key={i} onClick={() => a.set(!a.v)} className="cursor-pointer"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, textAlign: 'left',
                                background: a.v ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${a.v ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                              }}>
                              <span style={{ color: a.v ? 'var(--accent-l)' : 'var(--text-4)' }}>{a.icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 12.5, fontWeight: 600, color: a.v ? 'var(--text-1)' : 'var(--text-2)' }}>{a.label}</p>
                                <p style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{a.desc}</p>
                              </div>
                              <span style={{ flexShrink: 0, width: 32, height: 18, borderRadius: 99, position: 'relative', background: a.v ? 'var(--accent)' : 'rgba(255,255,255,0.1)' }}>
                                <span style={{ position: 'absolute', top: 2, left: a.v ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Duration picker */}
                    <div>
                      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-4)', fontFamily: 'monospace', marginBottom: 10 }}>
                        {t('warmupNavDuration')}
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[0, 5, 10, 15, 20, 30].map(m => (
                          <button key={m} onClick={() => setBrowseMinutes(m)}
                            className="cursor-pointer"
                            style={{
                              padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                              cursor: 'pointer', border: 'none', transition: 'all 150ms',
                              ...(browseMinutes === m
                                ? { background: 'linear-gradient(140deg,var(--accent),#4F46E5)', color: '#fff', boxShadow: '0 0 18px -4px rgba(99,102,241,0.55)' }
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
                              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                              opacity: disabled ? 0.35 : 1, transition: 'all 150ms',
                              background: value && !disabled ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
                              border: `1px solid ${value && !disabled ? 'rgba(99,102,241,0.2)' : 'var(--border)'}`,
                            }}>
                              <span style={{ display: 'flex', flexShrink: 0, color: value && !disabled ? 'var(--accent-l)' : 'var(--text-4)' }}>{icon}</span>
                              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', fontFamily: 'monospace' }}>{t(labelKey)}</span>
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
                      { label: t('warmupPhones'),        value: String(selectedPhones.length),  color: selectedPhones.length > 0 ? 'var(--accent-l)' : 'var(--text-4)' },
                      { label: t('warmupNavigation'),    value: browseMinutes === 0 ? '—' : `${browseMinutes} min`, color: browseMinutes > 0 ? 'var(--ok)' : 'var(--text-4)' },
                      { label: t('warmupActionsLabel'),  value: browseMinutes > 0 ? [likePosts && 'Likes', watchReels && 'Reels', followSuggested && 'Follows'].filter(Boolean).join(' + ') || '—' : '—', color: 'var(--text-2)' },
                      { label: t('warmupTotalDuration'), value: `${selectedPhones.length * (browseMinutes + 2)} min`, color: 'var(--warn)' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</p>
                        <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <ProxyRotToggle on={rotProxy} setOn={setRotProxy} />

                {/* Launch button — full width, accent, lg */}
                <button
                  className={`sf-btn sf-btn-primary sf-btn-lg cursor-pointer`}
                  style={{
                    width: '100%', justifyContent: 'center', gap: 8, height: 44, fontSize: 13, fontWeight: 700, borderRadius: 10,
                    opacity: selectedPhones.length === 0 || running || browseMinutes === 0 ? 0.45 : 1,
                    cursor: selectedPhones.length === 0 || running || browseMinutes === 0 ? 'not-allowed' : 'pointer',
                  }}
                  disabled={selectedPhones.length === 0 || running || browseMinutes === 0}
                  onClick={launchWarmup}
                >
                  {running
                    ? <><div className="sf-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> {t('warmupWarmupRunning')}</>
                    : <><IconFlame size={15} /> {t('warmupLaunchBtn')} ({selectedPhones.length})</>
                  }
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
