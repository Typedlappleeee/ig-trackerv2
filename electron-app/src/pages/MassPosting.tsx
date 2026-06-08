import { useState, useEffect, useRef, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone, type ContentItem } from '@/lib/supabase'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { logActivity } from '@/lib/activityLog'
import { Button }  from '@/components/ui/Button'
import { VideoThumbnail } from '@/pages/Bank'
import { BankPicker } from './Bank'
import { takeScreenshot } from '@/lib/geelark'
import {
  getMassPostingState, setMassPostingState, subscribeMassPosting,
  type TaskLog, type TaskStatus, type SelectedVideo,
  resetMassPosting,
} from '@/lib/massPostingStore'
import { playSuccess } from '@/lib/sounds'
import { useT, useLang } from '@/lib/i18n'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { createScheduledPost, fmtScheduledTime } from '@/lib/schedulerService'
import { ScheduleModal } from '@/components/ScheduleModal'
import { loadPostingOpts, savePostingOpts, buildScheduleTimes, type PostingOpts } from '@/lib/postingOpts'
import { PostingOptions } from '@/components/PostingOptions'

interface MassPostingProps { user: User }


const GEELARK = 'https://openapi.geelark.com/open/v1'

const STATUS_COLOR: Record<TaskStatus['status'], string> = {
  idle:      'text-text2',
  pending:   'text-text2',
  uploading: 'text-blue-400',
  posting:   'text-warn',
  done:      'text-ok',
  error:     'text-danger',
}
// STATUS labels are now built inside the component using t()

const AVATAR_COLORS = [
  ['#7C3AED','#A855F7'], ['#2563EB','#60A5FA'], ['#059669','#34D399'],
  ['#D97706','#FBBF24'], ['#DC2626','#F87171'], ['#7C3AED','#EC4899'],
]
function avatarGradient(name: string) {
  const i = (name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length
  return `linear-gradient(135deg,${AVATAR_COLORS[i][0]},${AVATAR_COLORS[i][1]})`
}

async function geelark(bearer: string, path: string, body: unknown) {
  const url     = `${GEELARK}${path}`
  const headers = { Authorization: `Bearer ${bearer}` }
  if (window.electronAPI?.geelarkRequest) {
    const r = await window.electronAPI.geelarkRequest({ method: 'POST', url, headers, body })
    // r can be undefined on IPC timeout / network error — degrade gracefully
    return (r?.data ?? {}) as Record<string, unknown>
  }
  // Web: route through Vercel proxy
  const res = await fetch('/api/geelark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'POST', url, headers, body }),
  })
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
  const r = await res.json()
  if (!r.ok) throw new Error(r.error ?? 'Network error')
  return r.data as Record<string, unknown>
}

export function MassPosting({ user }: MassPostingProps) {
  const t = useT()
  const { lang } = useLang()
  const STATUS_LABEL: Record<string, string> = {
    idle:      '—',
    pending:   t('schedulerStatusPending'),
    uploading: t('uploading') + '…',
    posting:   t('schedulerStatusInProgress'),
    done:      t('schedulerStatusDone'),
    error:     t('schedulerStatusFailed'),
  }
  const { currentOrg, role, perms } = useOrg()
  const credits = useCredits()
  const [phones, setPhones]               = useState<Phone[]>([])
  const ms                                = getMassPostingState()
  const [selectedPhones, _setSelPhones]   = useState<Set<string>>(ms.selectedPhones)
  const [selectedVideos, _setSelVideos]   = useState<SelectedVideo[]>(ms.selectedVideos)
  const [caption, _setCaption]            = useState(ms.caption)
  const [mode, setMode]                   = useState<'seq' | 'random'>('seq')
  const [bearer, setBearer]               = useState('')
  const [groqKey, setGroqKey]             = useState('')
  const [posting, _setPosting]            = useState(ms.posting)
  const [generating, setGenerating]       = useState(false)
  const [withHashtags, setWithHashtags]   = useState(false)
  const [customPrompt, setCustomPrompt]   = useState('')
  const [logs, _setLogs]                  = useState<TaskLog[]>(ms.logs)
  const [taskStatuses, _setTaskStatuses]  = useState<Map<string, TaskStatus>>(ms.taskStatuses)
  const [groupFilter, setGroupFilter]     = useState('Tous')
  const [groups, setGroups]               = useState<string[]>(['Tous'])
  const [phoneSearch, setPhoneSearch]     = useState('')
  const [phonePickMode, setPhonePickMode] = useState<'phones' | 'groups'>('phones')
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [postingOpts, setPostingOpts]       = useState<PostingOpts>(loadPostingOpts)
  const [showFolderPick, setShowFolderPick] = useState(false)
  const [bankFolders, setBankFolders]       = useState<{ name: string; count: number }[]>([])
  const [folderLoading, setFolderLoading]   = useState(false)
  const [addingFolder, setAddingFolder]     = useState<string | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const stopRef                           = useRef(false)
  const activePhonesRef                   = useRef<string[]>([])
  const activeTasksRef                    = useRef<string[]>([])
  const logEndRef                         = useRef<HTMLDivElement>(null)
  // Track when each phone entered 'posting' state (geelark_id → timestamp ms)
  const postingStartRef                   = useRef<Map<string, number>>(new Map())
  // Which phones already triggered a screenshot notification this session
  const notifiedRef                       = useRef<Set<string>>(new Set())

  // Persist-aware setters
  function setSelPhones(v: Set<string> | ((p: Set<string>) => Set<string>)) {
    _setSelPhones(prev => { const next = typeof v === 'function' ? v(prev) : v; setMassPostingState({ selectedPhones: next }); return next })
  }
  function setSelVideos(v: SelectedVideo[] | ((p: SelectedVideo[]) => SelectedVideo[])) {
    _setSelVideos(prev => { const next = typeof v === 'function' ? v(prev) : v; setMassPostingState({ selectedVideos: next }); return next })
  }
  function setCaption(v: string)                                   { _setCaption(v);         setMassPostingState({ caption: v }) }
  function setPosting(v: boolean)                                  { _setPosting(v);         setMassPostingState({ posting: v }) }
  function setLogs(v: TaskLog[] | ((p: TaskLog[]) => TaskLog[])) {
    _setLogs(prev => { const next = typeof v === 'function' ? v(prev) : v; setMassPostingState({ logs: next }); return next })
  }
  function setTaskStatuses(v: Map<string, TaskStatus> | ((p: Map<string, TaskStatus>) => Map<string, TaskStatus>)) {
    _setTaskStatuses(prev => { const next = typeof v === 'function' ? v(prev) : v; setMassPostingState({ taskStatuses: next }); return next })
  }

  useEffect(() => {
    const unsub = subscribeMassPosting(() => {
      const st = getMassPostingState()
      _setPosting(st.posting)
      _setLogs(st.logs)
      _setTaskStatuses(st.taskStatuses)
    })
    return unsub
  }, [])

  // Pull the active connection (org_config when an org is active, app_config otherwise)
  const conns = useConnections(user)
  useEffect(() => { if (conns.bearer) setBearer(conns.bearer) }, [conns.bearer])
  useEffect(() => { if (conns.groq)   setGroqKey(conns.groq) },  [conns.groq])

  useEffect(() => {
    if (!conns.bearer) { setPhones([]); setGroups(['Tous']); return }
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(ph => {
      const ps = ph.data ?? []
      setPhones(ps)
      const grps = [...new Set(ps.map(p => p.group_name).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
    })
  }, [currentOrg?.id, user.id, conns.bearer])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  function log(message: string, level: TaskLog['level'] = 'info') {
    setLogs(prev => [...prev, {
      message, level,
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }])
  }

  function setPhoneStatus(phoneId: string, status: TaskStatus) {
    setTaskStatuses(prev => new Map(prev).set(phoneId, status))
  }

  function togglePhone(id: string) {
    setSelPhones(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function openFolderPick() {
    setFolderLoading(true)
    let q = supabase.from('content_bank').select('folder')
    q = currentOrg ? (q as any).eq('org_id', currentOrg.id) : (q as any).eq('user_id', user.id).is('org_id', null)
    const { data } = await q
    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      const f = (row as { folder?: string | null }).folder
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1)
    }
    setBankFolders([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })))
    setFolderLoading(false)
    setShowFolderPick(true)
  }

  async function addFolderVideos(folderName: string) {
    setShowFolderPick(false)
    setAddingFolder(folderName)
    try {
      let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false })
      q = currentOrg
        ? (q as any).eq('org_id', currentOrg.id).eq('folder', folderName)
        : (q as any).eq('user_id', user.id).is('org_id', null).eq('folder', folderName)
      const { data } = await q
      const items = (data ?? []) as ContentItem[]
      if (!items.length) return
      const { getSignedUrl } = await import('@/lib/storage')
      const newVideos: SelectedVideo[] = []
      for (const item of items) {
        if (!item.storage_path && !item.file_url) continue
        if (selectedVideos.some(sv => sv.item.id === item.id)) continue
        let url: string | null = null
        try {
          url = await getSignedUrl(item.storage_path ?? item.file_url)
        } catch { url = item.file_url }
        newVideos.push({ item: { ...item, file_url: url ?? item.file_url }, localPath: null })
      }
      if (newVideos.length) setSelVideos(prev => [...prev, ...newVideos])
    } finally {
      setAddingFolder(null)
    }
  }

  function toggleGroup(groupName: string) {
    const inGroup = phones.filter(p => {
      if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
      return p.group_name === groupName
    })
    const alreadySelected = selectedGroups.has(groupName)
    setSelectedGroups(prev => {
      const next = new Set(prev)
      if (alreadySelected) next.delete(groupName)
      else next.add(groupName)
      return next
    })
    setSelPhones(prev => {
      const next = new Set(prev)
      if (alreadySelected) inGroup.forEach(p => next.delete(p.id))
      else inGroup.forEach(p => next.add(p.id))
      return next
    })
  }

  async function pickLocalFile(_index: number) {
    const path = await window.electronAPI?.pickVideoFile()
    if (!path) return
    const fake: ContentItem = {
      id:             `local-${Date.now()}`,
      user_id:        user.id,
      org_id:         null,
      folder:         null,
      title:          path.split(/[\\/]/).pop() ?? 'Vidéo locale',
      file_url:       null,
      storage_path:   null,
      thumbnail_path: null,
      thumbnail_url:  null,
      duration:       null,
      tags:           [],
      notes:          '',
      used_count:     0,
      created_at:    new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }
    setSelVideos(prev => [...prev, { item: fake, localPath: path }])
  }

  // Auto-assignment: round-robin (seq) or unique-random (random).
  // In random mode we Fisher-Yates shuffle the video indices first so no two
  // phones ever get the same video before the full list has been cycled once.
  const phoneList = phones.filter(p => selectedPhones.has(p.id))
  const assignments = useMemo(() => {
    if (selectedVideos.length === 0) return phoneList.map(phone => ({ phone, video: null, videoIndex: -1 }))
    if (mode === 'random') {
      const indices = selectedVideos.map((_, i) => i)
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]]
      }
      return phoneList.map((phone, i) => {
        const idx = indices[i % indices.length]
        return { phone, video: selectedVideos[idx], videoIndex: idx }
      })
    }
    return phoneList.map((phone, i) => {
      const idx = i % selectedVideos.length
      return { phone, video: selectedVideos[idx], videoIndex: idx }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneList.map(p => p.id).join(','), selectedVideos.length, mode])

  async function stop() {
    stopRef.current = true
    log('🛑 Stop requested — cancelling tasks and shutting down phones…', 'warn')
    const tasks = activeTasksRef.current
    const phones = activePhonesRef.current
    try {
      if (tasks.length > 0) {
        await geelark(bearer, '/rpa/task/cancel', { ids: tasks })
        log(`  ${tasks.length} tâche(s) annulée(s)`, 'warn')
      }
    } catch (e) {
      log(`  ⚠️ annulation tâches: ${e instanceof Error ? e.message : String(e)}`, 'warn')
    }
    try {
      if (phones.length > 0) {
        await geelark(bearer, '/phone/stop', { ids: phones })
        log(`  ${phones.length} téléphone(s) éteint(s)`, 'warn')
      }
    } catch (e) {
      log(`  ⚠️ extinction téléphones: ${e instanceof Error ? e.message : String(e)}`, 'warn')
    }
    activeTasksRef.current = []
    activePhonesRef.current = []
  }

  async function generateCaption() {
    if (!groqKey) { log('❌ Missing Groq key — Settings', 'error'); return }
    if (!window.electronAPI?.groqRequest) return
    setGenerating(true)
    try {
      const sysPrompt = withHashtags
        ? 'Tu génères des descriptions Instagram virales en français. Hook fort + body engageant + CTA + 10-15 hashtags pertinents. Max 2200 caractères.'
        : 'Tu génères des descriptions Instagram virales en français. Hook fort + body engageant + CTA. Sans hashtags. Max 2200 caractères.'
      const userMsg = customPrompt.trim()
        ? `Génère une description Instagram (${customPrompt.trim()}) générique qui marche pour beaucoup de comptes. Réponds uniquement avec la description finale, sans préambule.`
        : 'Génère une description Instagram virale et générique qui marche pour beaucoup de comptes. Réponds uniquement avec la description finale, sans préambule.'
      const r = await window.electronAPI.groqRequest({
        apiKey: groqKey,
        model: 'llama-3.1-8b-instant',
        maxTokens: 300,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user',   content: userMsg },
        ],
      })
      if (r.ok && r.data) {
        const choice = (r.data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content
        if (choice) setCaption(choice.trim())
      } else {
        log(`❌ Génération échouée: ${r.error}`, 'error')
      }
    } catch (e) {
      log(`❌ ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    setGenerating(false)
  }

  async function scheduleMassPost(scheduledAt: Date) {
    if (!bearer)                    { log('Missing GéeLark token — Settings', 'error'); return }
    if (phoneList.length === 0)     { log('Select at least one phone', 'warn'); return }
    if (selectedVideos.length === 0){ log('Select at least one video', 'warn'); return }
    setShowScheduleModal(false)
    setPosting(true); setLogs([])
    postingStartRef.current.clear()
    notifiedRef.current.clear()
    // Request desktop notification permission upfront (user gesture context)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    try {
      // In sequential mode, only upload the videos that will actually be assigned:
      // phone i gets video at i % videos.length, so only the first min(phones, videos) are used.
      // In random mode, any video could be picked — keep all.
      const videosToSchedule = mode === 'random'
        ? selectedVideos
        : selectedVideos.slice(0, Math.min(phoneList.length, selectedVideos.length))

      log(`📤 Upload de ${videosToSchedule.length} vidéo(s) vers GéeLark…`)
      const tokenMap = new Map<number, string>()
      for (let i = 0; i < videosToSchedule.length; i++) {
        const sv = videosToSchedule[i]
        const filePath = sv.localPath ?? sv.item.file_url
        if (!filePath) { log(`❌ Chemin manquant pour ${sv.item.title}`, 'error'); return }
        const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
        if (!up.ok || !up.token) { log(`❌ Upload échoué pour ${sv.item.title}: ${up.error}`, 'error'); return }
        tokenMap.set(i, up.token)
        log(`✅ Vidéo ${i + 1}/${videosToSchedule.length} prête`, 'ok')
      }
      await createScheduledPost({
        userId: user.id, orgId: currentOrg?.id ?? null,
        createdByName: user.email?.split('@')[0] ?? 'Moi',
        type: 'mass_posting', scheduledAt,
        phones: phoneList.map(p => ({ id: p.id, geelark_id: p.geelark_id, phone_name: p.phone_name, ig_username: p.ig_username })),
        videos: videosToSchedule.map((v, i) => ({ token: tokenMap.get(i)!, title: v.item.title })),
        caption, delayMinutes: 0, mode, bearerToken: bearer, reelsTrial: postingOpts.reelsTrial,
      })
      log(`📅 Programmé pour ${fmtScheduledTime(scheduledAt.toISOString())} — ${phoneList.length} téléphone(s)`, 'ok')
    } catch (err: any) {
      log(`❌ Erreur: ${err.message}`, 'error')
    } finally {
      setPosting(false)
    }
  }

  async function post() {
    if (!bearer)                  { log('Missing GéeLark token — Settings', 'error'); return }
    if (phoneList.length === 0)   { log('Select at least one phone', 'warn'); return }
    if (selectedVideos.length === 0) { log('Select at least one video', 'warn'); return }

    const creditCost = phoneList.length * CREDIT_COSTS.mass_posting
    const creditRes  = await checkAndDeductCredits(credits.ownerId, creditCost)
    if (!creditRes.ok) {
      log(`❌ ${creditRes.error ?? 'Crédits insuffisants'} (requis: ${creditCost} pour ${phoneList.length} téléphone${phoneList.length > 1 ? 's' : ''})`, 'error')
      return
    }
    if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)

    playSuccess()
    setPosting(true)
    setLogs([])
    stopRef.current = false
    const newStatuses = new Map<string, TaskStatus>()
    phoneList.forEach(p => newStatuses.set(p.id, { status: 'pending' }))
    setTaskStatuses(newStatuses)

    logActivity({
      orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '',
      action: 'mass_posting_launched',
      details: { phones: phoneList.map(p => p.ig_username ?? p.phone_name), count: phoneList.length, videos: selectedVideos.length },
    })

    try {
      // ── Step 1: upload only videos actually assigned to a phone ──────────
      const usedIndices = [...new Set(assignments.map(a => a.videoIndex).filter(i => i >= 0))]
      log(`📤 Upload de ${usedIndices.length} vidéo(s) vers GéeLark…`)
      const tokenMap = new Map<number, string>() // videoIndex → token

      for (const vi of usedIndices) {
        const sv = selectedVideos[vi]

        // Mark phones using this video as uploading
        assignments.forEach(a => {
          if (a.videoIndex === vi) setPhoneStatus(a.phone.id, { status: 'uploading' })
        })

        const fileSource = sv.localPath ?? sv.item.file_url
        if (!fileSource) {
          log(`⚠️ Vidéo ${vi + 1} sans source — ignorée`, 'warn')
          continue
        }
        const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath: fileSource })
        if (!up.ok || !up.token) {
          log(`❌ Upload échoué (${sv.item.title}): ${up.error}`, 'error')
          assignments.forEach(a => {
            if (a.videoIndex === vi) setPhoneStatus(a.phone.id, { status: 'error', detail: up.error })
          })
          continue
        }

        tokenMap.set(vi, up.token)
        log(`✅ Vidéo ${vi + 1} uploadée (${sv.item.title.slice(0, 30)}…)`, 'ok')
      }

      // ── Step 2: start phones ──────────────────────────────────────────────
      const geelarkIds = phoneList.map(p => p.geelark_id)
      activePhonesRef.current = geelarkIds
      log(`📱 Démarrage de ${phoneList.length} téléphone(s)…`)
      const startRes = await geelark(bearer, '/phone/start', { ids: geelarkIds })
      const started  = (startRes['data'] as Record<string, number>)?.['successAmount'] ?? 0
      log(`  ${started} démarré(s)`, started > 0 ? 'ok' : 'warn')

      log('⏳ Attente 30s (boot)…')
      await new Promise(r => setTimeout(r, 30000))

      // ── Step 3: create RPA tasks ──────────────────────────────────────────
      log('🎬 Creating post tasks…')
      const taskIds: Record<string, string> = {}
      const scheduleTimes = buildScheduleTimes(assignments.length, postingOpts)
      if (postingOpts.intervalMode !== 'none' && assignments.length > 1) {
        const lastMin = Math.round((scheduleTimes[scheduleTimes.length - 1] - scheduleTimes[0]) / 60)
        log(`⏱ Intervalle activé — dernier post dans ~${lastMin} min`, 'info')
      }

      for (let ai = 0; ai < assignments.length; ai++) {
        const asgn = assignments[ai]
        const token = tokenMap.get(asgn.videoIndex)
        if (!token) {
          log(`  ⚠️ ${asgn.phone.phone_name}: pas de token vidéo`, 'warn')
          setPhoneStatus(asgn.phone.id, { status: 'error', detail: 'no video token' })
          continue
        }
        setPhoneStatus(asgn.phone.id, { status: 'posting' })
        postingStartRef.current.set(asgn.phone.geelark_id, Date.now())
        const taskRes = await geelark(bearer, '/rpa/task/instagramPubReels', {
          id:          asgn.phone.geelark_id,
          scheduleAt:  scheduleTimes[ai],
          description: caption,
          video:       [token],
          ...(postingOpts.reelsTrial ? { shareType: 2 } : {}),
        })
        if (taskRes['code'] === 0) {
          const tid = (taskRes['data'] as Record<string, unknown>)?.['id'] as string
          taskIds[asgn.phone.geelark_id] = tid
          activeTasksRef.current = [...activeTasksRef.current, tid]
          setPhoneStatus(asgn.phone.id, { status: 'posting', taskId: tid })
          log(`  ✅ Tâche créée pour ${asgn.phone.phone_name}`, 'ok')
          // Auto-stop after 5 minutes regardless of task status
          setTimeout(() => {
            if (activePhonesRef.current.includes(asgn.phone.geelark_id)) {
              geelark(bearer, '/phone/stop', { ids: [asgn.phone.geelark_id] })
                .then(() => log(`  ✅ ${asgn.phone.phone_name} — posting fini`, 'ok'))
                .catch(() => {})
              setPhoneStatus(asgn.phone.id, { status: 'done' })
              activePhonesRef.current = activePhonesRef.current.filter(id => id !== asgn.phone.geelark_id)
            }
          }, 5 * 60 * 1000)
        } else {
          log(`  ❌ ${asgn.phone.phone_name}: ${taskRes['msg'] ?? taskRes['code']}`, 'error')
          setPhoneStatus(asgn.phone.id, { status: 'error', detail: String(taskRes['msg'] ?? taskRes['code']) })
        }
      }

      // ── Step 4: poll until done (max 10 min) ─────────────────────────────
      if (Object.keys(taskIds).length > 0) {
        log(`⏳ Suivi de ${Object.keys(taskIds).length} tâche(s)…`)
        const pending = new Set(Object.values(taskIds))
        const deadline = Date.now() + 6 * 60 * 1000
        const STATUS: Record<number, string> = { 1: '⏳ Pending', 2: '🔄 In progress', 3: '✅ Done', 4: '❌ Failed', 7: '🚫 Cancelled' }

        // Keywords that indicate a login / verification popup on the phone screen
        const ALERT_KEYWORDS = [
          'log in', 'login', 'sign in', 'password', 'mot de passe', 'connexion',
          'verify', 'verification', 'vérification', 'suspicious', 'unusual',
          'confirm', 'phone number', 'email address', 'enter code', 'code envoyé',
          'we detected', 'challenge', '2-step', 'deux étapes',
        ]
        function containsAlertKeyword(text: string): string | null {
          const lower = text.toLowerCase()
          return ALERT_KEYWORDS.find(k => lower.includes(k)) ?? null
        }
        async function checkPhoneScreen(geelarkId: string, phoneName: string) {
          if (notifiedRef.current.has(geelarkId)) return
          try {
            const dataUrl = await takeScreenshot(bearer, geelarkId)
            if (!dataUrl) return
            // OCR if available (Electron), otherwise just notify based on timeout
            let keyword: string | null = null
            if (window.electronAPI?.runTesseractOcr) {
              const base64 = dataUrl.split(',')[1]
              const ocr = await window.electronAPI.runTesseractOcr({ imageBase64: base64, lang: 'eng+fra' })
              if (ocr.ok) keyword = containsAlertKeyword(ocr.text ?? '')
            }
            const needsAttention = keyword != null
            const msg = needsAttention
              ? `🔐 ${phoneName} : fenêtre "${keyword}" détectée — intervention requise`
              : `📸 ${phoneName} : posting long — vérifiez l'écran`
            log(msg + ` [screenshot]::${dataUrl}`, needsAttention ? 'warn' : 'warn')
            notifiedRef.current.add(geelarkId)
            // Desktop notification (works in Electron + browser with permission)
            if (Notification.permission === 'granted') {
              new Notification('ScaleFlow — Intervention requise', {
                body: needsAttention
                  ? `${phoneName} : fenêtre de connexion/vérification détectée`
                  : `${phoneName} prend du temps — ouvrez ScaleFlow pour vérifier`,
                icon: '/sf-logo.svg',
              })
            }
          } catch { /* ignore screenshot errors */ }
        }

        let pollCount = 0
        while (pending.size > 0 && Date.now() < deadline) {
          if (stopRef.current) { log('⏹ Polling interrompu (stop)', 'warn'); break }
          await new Promise(r => setTimeout(r, 10000))
          if (stopRef.current) { log('⏹ Polling interrompu (stop)', 'warn'); break }
          let qRes: Record<string, unknown>
          try {
            qRes = await geelark(bearer, '/task/query', { ids: [...pending] })
          } catch (pollErr) {
            log(`⚠️ Poll /task/query raté: ${pollErr instanceof Error ? pollErr.message : String(pollErr)} — on réessaie…`, 'warn')
            continue
          }
          pollCount++

          // RPA tasks may live under different response keys depending on the GéeLark API version
          const d = (qRes['data'] as Record<string, unknown>) ?? qRes
          let items = (d['items'] ?? d['list'] ?? d['tasks'] ?? d['records']) as Array<Record<string, unknown>> | undefined
          if (!Array.isArray(items)) items = []

          // First poll diagnostic: log raw shape so we can fix it if items is empty
          if (pollCount === 1 && items.length === 0) {
            console.log('[mass-posting] /task/query raw response:', JSON.stringify(qRes).slice(0, 800))
            log(`ℹ️ Réponse /task/query (debug): clés=${Object.keys(d).join(',') || '(vide)'}`, 'warn')
          }

          for (const item of items) {
            const tid    = (item['id'] ?? item['taskId']) as string
            const status = Number(item['status'])
            const phone  = phoneList.find(p => taskIds[p.geelark_id] === tid)
            const name   = phone?.phone_name ?? tid
            if ([3, 4, 7].includes(status)) {
              pending.delete(tid)
              postingStartRef.current.delete(phone?.geelark_id ?? '')
              const level = status === 3 ? 'ok' : 'error'
              const fail  = item['failDesc'] ? ` — ${item['failDesc']}` : ''
              log(`${STATUS[status] ?? status} ${name}${fail}`, level)
              if (phone) {
                setPhoneStatus(phone.id, {
                  status: status === 3 ? 'done' : 'error',
                  detail: item['failDesc'] as string | undefined,
                })
                // Power off this phone immediately now that its task is finished
                geelark(bearer, '/phone/stop', { ids: [phone.geelark_id] })
                  .then(() => log(`  💤 ${phone.phone_name} éteint`, 'ok'))
                  .catch(e => log(`  ⚠️ extinction ${phone.phone_name}: ${e instanceof Error ? e.message : String(e)}`, 'warn'))
                activePhonesRef.current = activePhonesRef.current.filter(id => id !== phone.geelark_id)
                activeTasksRef.current  = activeTasksRef.current.filter(id => id !== tid)
              }
            }
          }

          // Every 12 polls (~2 min): screenshot phones still running to detect login/verification popups
          if (pollCount % 12 === 0) {
            for (const [geelarkId, startedAt] of postingStartRef.current) {
              if (Date.now() - startedAt > 90_000) {  // only after 1.5 min
                const ph = phoneList.find(p => p.geelark_id === geelarkId)
                if (ph) checkPhoneScreen(geelarkId, ph.phone_name).catch(() => {})
              }
            }
          }
        }
        if (pending.size > 0) {
          log(`⏳ ${pending.size} tâche(s) sans réponse — on continue (les posts sont probablement faits)`, 'warn')
          // Mark remaining as done so UI reflects completion (the post almost certainly succeeded)
          for (const tid of pending) {
            const phone = phoneList.find(p => taskIds[p.geelark_id] === tid)
            if (phone) setPhoneStatus(phone.id, { status: 'done' })
          }
        }
      }

      // ── Step 5: stop any phones still running (timeout / no-response) ────
      const remaining = activePhonesRef.current
      if (remaining.length > 0) {
        log(`🛑 Arrêt des ${remaining.length} téléphone(s) restant(s)…`)
        await geelark(bearer, '/phone/stop', { ids: remaining })
      }

      // Mark every phone as done
      for (const p of phoneList) setPhoneStatus(p.id, { status: 'done' })

      log('🎉 Done! Resetting in 5s…', 'ok')
      await new Promise(r => setTimeout(r, 5000))
      resetMassPosting()
      setSelPhones(new Set())
      setSelVideos([])

    } catch (e: unknown) {
      log(`❌ Erreur: ${e instanceof Error ? e.message : String(e)}`, 'error')
      // Always stop phones on unexpected crash — so they don't stay on indefinitely
      const stuck = activePhonesRef.current
      if (stuck.length > 0) {
        log(`🛑 Arrêt d'urgence de ${stuck.length} téléphone(s)…`, 'warn')
        geelark(bearer, '/phone/stop', { ids: stuck }).catch(() => {})
      }
    }

    activePhonesRef.current = []
    activeTasksRef.current = []
    setPosting(false)
  }

  const visiblePhones = phones.filter(p => {
    if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
    if (groupFilter !== 'Tous' && p.group_name !== groupFilter) return false
    if (phoneSearch) {
      const q = phoneSearch.toLowerCase()
      return p.phone_name?.toLowerCase().includes(q) || p.ig_username?.toLowerCase().includes(q)
    }
    return true
  })

  const withSessions = phones.filter(p => p.ig_sessionid).length

  // Live progress stats
  const totalTasks = assignments.length
  const doneTasks  = [...taskStatuses.values()].filter(s => s.status === 'done').length
  const errorTasks = [...taskStatuses.values()].filter(s => s.status === 'error').length
  const activeTasks = [...taskStatuses.values()].filter(s => s.status === 'uploading' || s.status === 'posting').length
  const progressPct = totalTasks > 0 ? Math.round(((doneTasks + errorTasks) / totalTasks) * 100) : 0
  const canLaunch = !posting && !!bearer && phoneList.length > 0 && selectedVideos.length > 0

  return (
    <div className="anim-page h-full flex flex-col overflow-hidden bg-bg">

      {/* ── Premium page header ──────────────────────────────────────────────── */}
      <header className="flex-shrink-0 px-7 pt-5 pb-4 flex items-center justify-between gap-4 border-b border-border bg-bg/95 backdrop-blur-sm">

        {/* Left: icon + title */}
        <div className="flex items-center gap-4 min-w-0">
          {/* Zap icon with gradient glow */}
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 rounded-[14px] blur-xl opacity-60"
              style={{ background: 'linear-gradient(135deg, #ec4899, #f59e0b)' }} />
            <div className="relative w-11 h-11 rounded-[14px] flex items-center justify-center border border-white/10"
              style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.2), rgba(245,158,11,0.15))' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#zapGrad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <defs>
                  <linearGradient id="zapGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f472b6" />
                    <stop offset="100%" stopColor="#fbbf24" />
                  </linearGradient>
                </defs>
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-black tracking-tight text-text" style={{ letterSpacing: '-0.03em' }}>
                Mass Posting
              </h1>
              {posting ? (
                <span className="sf-badge sf-badge-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  {t('running')}
                </span>
              ) : (
                <span className="sf-badge sf-badge-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-text3" />
                  {t('idle')}
                </span>
              )}
              {/* Credit cost badge */}
              {phoneList.length > 0 && (
                <span className="sf-badge sf-badge-warn text-[10px]">
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M6 3.5v1.8l1.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  {phoneList.length * CREDIT_COSTS.mass_posting} cr
                </span>
              )}
            </div>
            <p className="text-text3 text-xs mt-0.5 flex items-center gap-1.5">
              <span>{phoneList.length} {lang === 'en' ? `target${phoneList.length !== 1 ? 's' : ''}` : `cible${phoneList.length !== 1 ? 's' : ''}`}</span>
              <span className="text-border">·</span>
              <span>{selectedVideos.length} {lang === 'en' ? `video${selectedVideos.length !== 1 ? 's' : ''}` : `vidéo${selectedVideos.length !== 1 ? 's' : ''}`}</span>
              {posting && totalTasks > 0 && (
                <><span className="text-border">·</span><span className="text-accent">{doneTasks}/{totalTasks} {lang === 'en' ? 'done' : `terminé${doneTasks !== 1 ? 's' : ''}`}</span></>
              )}
            </p>
          </div>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Assignment mode toggle */}
          <div className="sf-tabs">
            {([{ k: 'seq', label: t('schedulerSequential') }, { k: 'random', label: t('schedulerRandom') }] as const).map(m => (
              <button key={m.k} onClick={() => setMode(m.k)}
                className={`sf-tab cursor-pointer ${mode === m.k ? 'active' : ''}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Stop button */}
          <button onClick={stop} disabled={!posting}
            className="sf-btn sf-btn-danger sf-btn-sm cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1.5"/></svg>
            {t('stop')}
          </button>

          {/* Schedule button */}
          <button onClick={() => setShowScheduleModal(true)}
            disabled={posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0}
            className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            {t('schedule')}
          </button>

          {/* Launch button */}
          <button onClick={post} disabled={!canLaunch}
            className="sf-btn sf-btn-primary cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed relative overflow-hidden"
            style={canLaunch ? { background: 'linear-gradient(130deg,#6D28D9,#7C3AED,#A855F7)', boxShadow: '0 4px 24px -4px rgba(124,58,237,0.65), inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}>
            {canLaunch && (
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.08) 50%,transparent 60%)', backgroundSize: '200% 100%', animation: 'progressShimmer 3s linear infinite' }} />
            )}
            {posting ? (
              <><div className="sf-spinner w-3.5 h-3.5" />{t('running')}…</>
            ) : (
              <><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="2.5 1.5 10.5 6 2.5 10.5"/></svg>{t('launch')}</>
            )}
          </button>
        </div>
      </header>

      {/* Warning: no bearer */}
      {!bearer && (
        <div className="flex-shrink-0 mx-6 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl sf-card border-warn/20 bg-warn/5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-warn/10">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5L11.5 10.5H1.5L6.5 1.5Z" stroke="#F59E0B" strokeWidth="1.4" strokeLinejoin="round"/><path d="M6.5 5v3" stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round"/><circle cx="6.5" cy="9" r="0.6" fill="#F59E0B"/></svg>
          </div>
          <p className="text-warn text-xs font-semibold">{t('massPostingMissingToken')}</p>
        </div>
      )}

      {/* Live progress banner */}
      {posting && totalTasks > 0 && (
        <div className="flex-shrink-0 mx-6 mt-4 sf-card rounded-xl p-4 border-accent/25"
          style={{ boxShadow: '0 0 28px -6px rgba(124,58,237,0.3)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
              <span className="text-sm font-bold text-text">{doneTasks + errorTasks} / {totalTasks} {t('massPostingTasksProgress')}</span>
              <div className="flex items-center gap-1.5">
                {activeTasks > 0 && (
                  <span className="sf-badge sf-badge-warn text-[10px]">
                    {activeTasks} {t('massPostingActiveCount')}{lang === 'fr' && activeTasks !== 1 ? 's' : ''}
                  </span>
                )}
                {doneTasks > 0 && (
                  <span className="sf-badge sf-badge-ok text-[10px]">{doneTasks} ok</span>
                )}
                {errorTasks > 0 && (
                  <span className="sf-badge sf-badge-danger text-[10px]">{errorTasks} err</span>
                )}
              </div>
            </div>
            <span className="text-sm font-black font-mono tabular-nums"
              style={{ color: progressPct >= 100 ? 'var(--ok, #22c55e)' : '#a78bfa' }}>
              {progressPct}%
            </span>
          </div>
          <div className="sf-progress">
            <div className={`sf-progress-bar transition-all duration-700 ${progressPct >= 100 ? 'bg-ok' : ''}`}
              style={{ width: `${progressPct}%`, ...(progressPct >= 100 ? { background: '#22c55e', animation: 'none' } : {}) }} />
          </div>
        </div>
      )}

      {/* ── 2-column body ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex min-h-0 mt-0">

        {/* ── LEFT SIDEBAR: Phone selection (280px) ────────────────────────── */}
        <aside className="w-[280px] flex-shrink-0 flex flex-col border-r border-border bg-surface">

          {/* Sidebar header */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/15">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2.5" y="1" width="8" height="11" rx="1.5" stroke="#A78BFA" strokeWidth="1.2"/><circle cx="6.5" cy="9.5" r="0.8" fill="#A78BFA"/></svg>
                </div>
                <span className="text-[13px] font-bold text-text">{t('massPostingTargets')}</span>
              </div>
              {selectedPhones.size > 0 && (
                <span className="sf-badge sf-badge-accent font-black">{selectedPhones.size}</span>
              )}
            </div>

            {/* Phones / Groups toggle */}
            <div className="sf-tabs mb-3 w-full">
              {([{ k: 'phones', l: t('massPostingPhones') }, { k: 'groups', l: t('massPostingGroups') }] as const).map(m => (
                <button key={m.k} onClick={() => setPhonePickMode(m.k)}
                  className={`sf-tab cursor-pointer flex-1 ${phonePickMode === m.k ? 'active' : ''}`}>
                  {m.l}
                </button>
              ))}
            </div>

            {/* Phones mode filters */}
            {phonePickMode === 'phones' && (
              <div className="space-y-2">
                {groups.length > 1 && (
                  <div className="relative">
                    <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                      className="sf-input appearance-none pr-7 cursor-pointer text-xs h-8">
                      {groups.map(g => <option key={g} value={g} style={{ background: '#0C0C15', color: '#fff' }}>{g}</option>)}
                    </select>
                    <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                )}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5" cy="5" r="3.5" stroke="rgba(139,92,246,0.4)" strokeWidth="1.2"/><path d="M7.5 7.5L10 10" stroke="rgba(139,92,246,0.4)" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  <input type="text" placeholder={t('massPostingSearchPhone')} value={phoneSearch}
                    onChange={e => setPhoneSearch(e.target.value)}
                    className="sf-input pl-8 text-xs h-8"
                  />
                </div>
              </div>
            )}

            {/* Groups mode: all/none buttons */}
            {phonePickMode === 'groups' && (
              <div className="flex gap-3">
                <button onClick={() => {
                  const realGroups = groups.filter(g => g !== 'Tous')
                  setSelectedGroups(new Set(realGroups))
                  setSelPhones(new Set(phones.filter(p => {
                    if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
                    return Boolean(p.group_name)
                  }).map(p => p.id)))
                }} className="text-xs font-bold text-accent hover:text-text transition-colors cursor-pointer">{t('massPostingAllGroup')}</button>
                <button onClick={() => { setSelectedGroups(new Set()); setSelPhones(new Set()) }}
                  className="text-xs text-text3 hover:text-text transition-colors cursor-pointer">{t('massPostingNoneGroup')}</button>
              </div>
            )}
          </div>

          {/* Select all / Deselect bar (phones mode) */}
          {phonePickMode === 'phones' && (
            <div className="flex-shrink-0 flex items-center mx-3 my-2 rounded-lg overflow-hidden border border-border">
              <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
                className="flex-1 py-1.5 text-[11px] font-bold text-accent hover:bg-accent/8 transition-colors cursor-pointer">
                {t('massPostingAllGroup')}
              </button>
              <div className="w-px h-5 bg-border" />
              <button onClick={() => setSelPhones(new Set())}
                className="flex-1 py-1.5 text-[11px] text-text2 hover:text-text hover:bg-surface2 transition-colors cursor-pointer">
                {t('massPostingNoneGroup')}
              </button>
              <div className="w-px h-5 bg-border" />
              <span className="px-3 text-[11px] font-medium text-text3">{visiblePhones.length}</span>
            </div>
          )}

          {/* Phone / Group list */}
          <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
            {/* Phones mode */}
            {phonePickMode === 'phones' && visiblePhones.map(phone => {
              const checked = selectedPhones.has(phone.id)
              const asgn = assignments.find(a => a.phone.id === phone.id)
              const ts = taskStatuses.get(phone.id)
              const initials = (phone.ig_username?.[0] ?? phone.phone_name?.[0] ?? '?').toUpperCase()
              const statusDotColor: Record<string, string> = { uploading: '#60a5fa', posting: '#f59e0b', done: '#22c55e', error: '#ef4444' }
              return (
                <button key={phone.id} onClick={() => togglePhone(phone.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all cursor-pointer relative hover:bg-surface2"
                  style={{
                    borderBottom: '1px solid var(--border, rgba(255,255,255,0.055))',
                    background: checked ? 'rgba(124,58,237,0.07)' : undefined,
                  }}>
                  {/* Active indicator */}
                  {checked && <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />}

                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-black flex-shrink-0 text-white"
                    style={{ background: checked ? avatarGradient(phone.phone_name ?? '') : 'rgba(255,255,255,0.05)', boxShadow: checked ? '0 2px 8px -2px rgba(124,58,237,0.4)' : undefined }}>
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold truncate ${checked ? 'text-text' : 'text-text2'}`}>{phone.phone_name}</p>
                    {phone.ig_username && (
                      <p className="text-[10px] truncate" style={{ color: checked ? '#A78BFA' : 'rgba(139,92,246,0.4)' }}>@{phone.ig_username}</p>
                    )}
                    {ts && ts.status !== 'idle' && ts.status !== 'pending' && (
                      <p className="text-[10px] font-semibold flex items-center gap-1 mt-0.5"
                        style={{ color: statusDotColor[ts.status] ?? 'rgba(113,113,122,0.8)' }}>
                        <span className="w-1 h-1 rounded-full inline-block" style={{ background: statusDotColor[ts.status] ?? 'rgba(113,113,122,0.8)' }} />
                        {STATUS_LABEL[ts.status]}
                      </p>
                    )}
                  </div>

                  {/* Video index badge */}
                  {asgn?.video && (
                    <span className="sf-badge sf-badge-accent text-[10px] flex-shrink-0">#{asgn.videoIndex + 1}</span>
                  )}

                  {/* Checkbox */}
                  <div className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                    style={checked
                      ? { background: 'linear-gradient(135deg,#7C3AED,#A855F7)', boxShadow: '0 0 8px rgba(139,92,246,0.4)' }
                      : { border: '1px solid rgba(255,255,255,0.12)' }}>
                    {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </button>
              )
            })}

            {/* Groups mode */}
            {phonePickMode === 'groups' && (() => {
              const realGroups = groups.filter(g => g !== 'Tous')
              if (realGroups.length === 0) return (
                <div className="sf-empty py-12">
                  <div className="sf-empty-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <p className="sf-empty-title text-sm">{t('massPostingNoGroup')}</p>
                  <p className="sf-empty-desc text-xs">{t('massPostingNoGroupHint')}</p>
                </div>
              )
              return (
                <div className="py-1">
                  {realGroups.map(g => {
                    const inGroup = phones.filter(p => {
                      if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
                      return p.group_name === g
                    })
                    const checked = selectedGroups.has(g)
                    const selCount = inGroup.filter(p => selectedPhones.has(p.id)).length
                    return (
                      <button key={g} onClick={() => toggleGroup(g)}
                        className="w-full flex items-center gap-3 px-3 py-3 text-left transition-all cursor-pointer relative hover:bg-surface2"
                        style={{
                          borderBottom: '1px solid var(--border, rgba(255,255,255,0.055))',
                          background: checked ? 'rgba(124,58,237,0.07)' : undefined,
                        }}>
                        {checked && <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />}
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                          style={checked
                            ? { background: 'linear-gradient(135deg,#7C3AED,#A855F7)', boxShadow: '0 2px 8px -2px rgba(124,58,237,0.5)' }
                            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={checked ? 'white' : '#52525b'} strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold truncate ${checked ? 'text-text' : 'text-text2'}`}>{g}</p>
                          <p className="text-[11px]" style={{ color: checked ? '#a78bfa' : 'rgba(82,82,91,0.7)' }}>
                            {checked ? `${selCount}/${inGroup.length} ${t('massPostingSelCount')}` : `${inGroup.length} ${t('massPostingPhoneCount')}`}
                          </p>
                        </div>
                        <div className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0"
                          style={checked
                            ? { background: 'linear-gradient(135deg,#7C3AED,#A855F7)' }
                            : { border: '1px solid rgba(255,255,255,0.1)' }}>
                          {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Selection count footer */}
          {selectedPhones.size > 0 && (
            <div className="flex-shrink-0 px-4 py-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-text3">{t('massPostingSelCount')}</span>
              <span className="sf-badge sf-badge-accent font-black text-sm">{selectedPhones.size}</span>
            </div>
          )}
        </aside>

        {/* ── RIGHT MAIN AREA ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-bg" style={{ scrollbarWidth: 'thin' }}>
          <div className="px-6 py-5 space-y-4 max-w-4xl">

            {/* ── Video selection section ─────────────────────────────────── */}
            <div className="sf-card overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/15">
                    <svg width="12" height="12" viewBox="0 0 13 13" fill="none"><rect x="1" y="2" width="9" height="7" rx="1.5" stroke="#A78BFA" strokeWidth="1.2"/><path d="M10 5.5L12 4v5L10 7.5V5.5Z" stroke="#A78BFA" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                  </div>
                  <span className="text-[13px] font-bold text-text">{t('massPostingContent')}</span>
                </div>
                {selectedVideos.length > 0 && (
                  <span className="sf-badge sf-badge-accent font-black">{selectedVideos.length}</span>
                )}
              </div>

              {/* Add buttons row */}
              <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
                <button onClick={() => setShowBankPicker(true)}
                  className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="0.5" y="0.5" width="4" height="4" rx="1" fill="white" opacity=".8"/><rect x="6.5" y="0.5" width="4" height="4" rx="1" fill="white" opacity=".6"/><rect x="0.5" y="6.5" width="4" height="4" rx="1" fill="white" opacity=".6"/><rect x="6.5" y="6.5" width="4" height="4" rx="1" fill="white" opacity=".4"/></svg>
                  {t('massPostingFromBank')}
                </button>
                <button onClick={() => pickLocalFile(-1)}
                  className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 7V1M3 3.5L5.5 1L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 8v1.5C1 10.3 1.7 11 2.5 11h6c.8 0 1.5-.7 1.5-1.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  {t('massPostingFromPC')}
                </button>
                <button onClick={openFolderPick}
                  className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 8.5V4A1 1 0 0 1 2 3h2.5L5.5 4.5H9A1 1 0 0 1 10 5.5V8.5A1 1 0 0 1 9 9.5H2A1 1 0 0 1 1 8.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
                  {t('massPostingFromFolder')}
                </button>
                {addingFolder && (
                  <span className="flex items-center gap-1.5 text-xs text-accent">
                    <div className="sf-spinner w-3 h-3" />
                    {t('massPostingAddingFolder')} «{addingFolder}»…
                  </span>
                )}
              </div>

              {/* Video grid */}
              {selectedVideos.length === 0 ? (
                <div className="sf-empty py-10">
                  <div className="sf-empty-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="1.4"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                  </div>
                  <p className="sf-empty-title">{t('massPostingNoContent')}</p>
                  <p className="sf-empty-desc">{t('massPostingNoContentHint')}</p>
                  <p className="text-[10px] text-text3 mt-1">{t('massPostingFormats').split('\n').map((line, i) => <span key={i}>{line}{i === 0 ? <br /> : ''}</span>)}</p>
                </div>
              ) : (
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {selectedVideos.map((sv, selIdx) => {
                    const fp = sv.localPath ?? sv.item.file_url
                    return (
                      <div key={sv.item.id}
                        className="group relative rounded-xl overflow-hidden border border-border bg-surface2 flex flex-col transition-all hover:border-accent/25 hover:-translate-y-0.5"
                        style={{ aspectRatio: '9/16', maxHeight: 180 }}>
                        {/* Thumbnail */}
                        <div className="flex-1 overflow-hidden">
                          <VideoThumbnail filePath={fp ?? ''} thumbnailPath={sv.item.thumbnail_path} storagePath={sv.item.storage_path} />
                        </div>
                        {/* Overlay info */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <p className="text-[9px] font-black text-accent/80 tracking-wider mb-0.5">#{selIdx + 1}</p>
                          <p className="text-[10px] font-semibold text-white truncate leading-tight">{sv.item.title}</p>
                        </div>
                        {/* Remove button */}
                        <button onClick={() => setSelVideos(prev => prev.filter((_, i) => i !== selIdx))}
                          className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer bg-danger/20 hover:bg-danger/40 border border-danger/30 text-danger">
                          <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                        {/* Index badge */}
                        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white bg-black/50 border border-white/10">
                          {selIdx + 1}
                        </div>
                      </div>
                    )
                  })}
                  {/* Add more card */}
                  <button onClick={() => setShowBankPicker(true)}
                    className="rounded-xl border border-dashed border-border hover:border-accent/40 bg-surface/50 hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 text-text3 hover:text-accent"
                    style={{ aspectRatio: '9/16', maxHeight: 180 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    <span className="text-[10px] font-semibold">Ajouter</span>
                  </button>
                </div>
              )}
            </div>

            {/* ── Options card ─────────────────────────────────────────────── */}
            <div className="sf-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-border">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/15">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="2" stroke="#A78BFA" strokeWidth="1.2"/><path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11" stroke="#A78BFA" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </div>
                <span className="text-[13px] font-bold text-text">{t('massPostingPublishOptions')}</span>
              </div>
              <div className="px-5 py-4">
                <PostingOptions opts={postingOpts} onChange={o => { setPostingOpts(o); savePostingOpts(o) }} />
              </div>
            </div>

            {/* ── Description card ─────────────────────────────────────────── */}
            <div className="sf-card overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/15">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 2h10M1 5h7M1 8h8M1 11h5" stroke="#A78BFA" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </div>
                  <span className="text-[13px] font-bold text-text">{t('massPostingDescription')}</span>
                </div>
                <span className={`text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-lg sf-badge ${caption.length > 2200 ? 'sf-badge-danger' : 'sf-badge-muted'}`}>
                  {caption.length}/2200
                </span>
              </div>
              <div className="p-5 space-y-3">
                <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4}
                  placeholder={t('massPostingCaptionPlaceholder')}
                  className="sf-input sf-textarea w-full text-[13px] leading-relaxed"
                  style={{ height: 'auto', minHeight: 96 }}
                />
                <div className="flex gap-2 flex-wrap">
                  <button onClick={generateCaption} disabled={!groqKey || generating}
                    className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer disabled:opacity-40">
                    {generating
                      ? <div className="sf-spinner w-3 h-3" />
                      : <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L6.8 4.2H10.2L7.5 6.1L8.5 9.5L5.5 7.5L2.5 9.5L3.5 6.1L0.8 4.2H4.2L5.5 1Z" fill="#A78BFA"/></svg>
                    }
                    {generating ? t('massPostingGeneratingAI') : t('massPostingGenerateAI')}
                  </button>
                  <input type="text" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                    placeholder={t('massPostingCustomPrompt')}
                    className="sf-input flex-1 text-xs h-8 min-w-[140px]"
                  />
                  <button onClick={() => setWithHashtags(v => !v)}
                    className={`sf-btn sf-btn-sm cursor-pointer font-black text-base px-3 ${withHashtags ? 'sf-btn-primary' : 'sf-btn-secondary'}`}
                    title="Inclure les hashtags"
                    style={withHashtags ? { boxShadow: '0 0 10px rgba(139,92,246,0.3)' } : {}}>
                    #
                  </button>
                </div>
              </div>
            </div>

            {/* ── Assignments table ─────────────────────────────────────────── */}
            <div className="sf-card overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/15">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3h10M1 6h10M1 9h10" stroke="#A78BFA" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </div>
                  <span className="text-[13px] font-bold text-text">{t('massPostingAssignments')}</span>
                </div>
                {assignments.length > 0 && (
                  <span className="sf-badge sf-badge-accent">
                    {assignments.length} {assignments.length !== 1 ? t('massPostingAssignmentCountPlural') : t('massPostingAssignmentCount')}
                  </span>
                )}
              </div>

              {assignments.length === 0 ? (
                <div className="sf-empty">
                  <div className="sf-empty-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="1.4"><path d="M9 17H5a2 2 0 0 0-2 2"/><path d="M11 17h8a2 2 0 0 1 2 2"/><rect x="1" y="3" width="22" height="12" rx="2"/></svg>
                  </div>
                  <p className="sf-empty-title">{t('massPostingAssignments')}</p>
                  <p className="sf-empty-desc">{t('massPostingNoAssignment')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        {['#', 'Téléphone', 'Vidéo', 'Statut'].map((h, i) => (
                          <th key={h} className={i === 3 ? 'text-right' : i === 0 ? 'text-left' : 'text-left'}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map(({ phone, video, videoIndex }, rowIdx) => {
                        const ts = taskStatuses.get(phone.id)
                        const status = ts?.status ?? 'idle'
                        const statusBadgeClass: Record<string, string> = {
                          idle:      'sf-badge-muted',
                          pending:   'sf-badge-muted',
                          uploading: 'sf-badge-info',
                          posting:   'sf-badge-warn',
                          done:      'sf-badge-ok',
                          error:     'sf-badge-danger',
                        }
                        return (
                          <tr key={phone.id}>
                            <td className="font-mono text-[11px] text-text3 w-10">{rowIdx + 1}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-black flex-shrink-0 text-white"
                                  style={{ background: avatarGradient(phone.phone_name ?? '') }}>
                                  {(phone.ig_username?.[0] ?? phone.phone_name?.[0] ?? '?').toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-text text-xs truncate max-w-[110px]">{phone.phone_name}</p>
                                  {phone.ig_username && <p className="text-[10px] truncate max-w-[110px] text-accent/60">@{phone.ig_username}</p>}
                                </div>
                              </div>
                            </td>
                            <td>
                              {video ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-5 flex-shrink-0 rounded overflow-hidden bg-accent/8" style={{ aspectRatio: '9/16' }}>
                                    <VideoThumbnail filePath={video.localPath ?? video.item.file_url ?? ''} thumbnailPath={video.item.thumbnail_path} storagePath={video.item.storage_path} />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-[10px] font-bold text-accent">#{videoIndex + 1} </span>
                                    <span className="text-text2 truncate max-w-[100px] inline-block align-middle text-[11px]">{video.item.title}</span>
                                  </div>
                                </div>
                              ) : <span className="text-text3 italic text-xs">—</span>}
                            </td>
                            <td className="text-right">
                              <div className="inline-flex flex-col items-end gap-1">
                                <span className={`sf-badge ${statusBadgeClass[status]}`}>
                                  {STATUS_LABEL[status]}
                                </span>
                                {ts?.detail && <span className="text-[10px] text-text3 max-w-[110px] truncate">{ts.detail}</span>}
                                {(status === 'uploading' || status === 'posting') && (
                                  <div className="sf-progress w-14">
                                    <div className="sf-progress-bar" style={{ width: status === 'uploading' ? '55%' : '75%' }} />
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Action / readiness bar ────────────────────────────────────── */}
            <div className="sf-card p-4 flex items-center gap-4 flex-wrap">
              {/* Phones stat */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all"
                  style={phoneList.length > 0
                    ? { background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2.5" y="1" width="8" height="11" rx="1.5" stroke={phoneList.length > 0 ? '#A78BFA' : 'rgba(82,82,91,0.5)'} strokeWidth="1.2"/></svg>
                </div>
                <div>
                  <p className="text-lg font-black leading-none" style={{ color: phoneList.length > 0 ? '#fff' : 'rgba(82,82,91,0.7)' }}>{phoneList.length}</p>
                  <p className="text-[10px] text-text3">cibles sélectionnées</p>
                </div>
              </div>

              <div className="sf-divider-v h-8" />

              {/* Videos stat */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all"
                  style={selectedVideos.length > 0
                    ? { background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="3" width="9" height="7" rx="1.5" stroke={selectedVideos.length > 0 ? '#A78BFA' : 'rgba(82,82,91,0.5)'} strokeWidth="1.2"/><path d="M10 5.5L12 4v5L10 7.5V5.5Z" stroke={selectedVideos.length > 0 ? '#A78BFA' : 'rgba(82,82,91,0.5)'} strokeWidth="1.2" strokeLinejoin="round"/></svg>
                </div>
                <div>
                  <p className="text-lg font-black leading-none" style={{ color: selectedVideos.length > 0 ? '#fff' : 'rgba(82,82,91,0.7)' }}>{selectedVideos.length}</p>
                  <p className="text-[10px] text-text3">vidéos sélectionnées</p>
                </div>
              </div>

              <div className="sf-divider-v h-8 hidden sm:block" />

              {/* Status indicator */}
              <div className="flex items-center gap-2 ml-auto">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: canLaunch ? '#22C55E' : 'rgba(82,82,91,0.5)' }} />
                <p className="text-xs font-semibold" style={{ color: canLaunch ? '#E2E8F0' : 'rgba(82,82,91,0.6)' }}>
                  {posting ? 'Publication en cours…' : canLaunch ? 'Prêt à lancer' : 'Vérifie tes paramètres puis lance la publication'}
                </p>
              </div>
            </div>

            {/* ── Log viewer ───────────────────────────────────────────────── */}
            {logs.length > 0 && (
              <div className="sf-card overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-3.5 pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/15">
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 2h9M1 5h6M1 8h7" stroke="#A78BFA" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    </div>
                    <span className="text-[12px] font-bold text-text">Journal</span>
                    <span className="sf-badge sf-badge-accent text-[10px]">{logs.length}</span>
                  </div>
                  {!posting && (
                    <button onClick={() => setLogs([])}
                      className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer text-text3 hover:text-text">
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1 2h7M3.5 2V1.5h2V2M2.5 2l.5 6h3l.5-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Effacer
                    </button>
                  )}
                </div>
                <div className="p-4 max-h-56 overflow-auto bg-black/30" style={{ scrollbarWidth: 'thin' }}>
                  <div className="font-mono text-[11px] space-y-1">
                    {logs.map((l, i) => {
                      // Messages with an embedded screenshot: "text [screenshot]::data:image/..."
                      const scMatch = l.message.match(/^(.*)\[screenshot\]::(data:image\/[^,]+,[^\s]+)(.*)$/)
                      const msgText = scMatch ? scMatch[1].trim() : l.message
                      const scUrl   = scMatch ? scMatch[2] : null
                      return (
                        <div key={i} className="flex flex-col gap-1 leading-relaxed">
                          <div className="flex gap-3">
                            <span className="flex-shrink-0 tabular-nums text-text3/50">{l.time}</span>
                            <span className={l.level === 'ok' ? 'text-ok' : l.level === 'error' ? 'text-danger' : l.level === 'warn' ? 'text-warn' : 'text-text2'}>{msgText}</span>
                          </div>
                          {scUrl && (
                            <img src={scUrl} alt="screenshot" style={{ maxHeight: 180, borderRadius: 6, border: '1px solid rgba(245,158,11,0.3)', marginLeft: 40, objectFit: 'contain' }} />
                          )}
                        </div>
                      )
                    })}
                    <div ref={logEndRef} />
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Folder picker modal ───────────────────────────────────────────────── */}
      {showFolderPick && (
        <div className="sf-modal-bg" onClick={() => setShowFolderPick(false)}>
          <div className="sf-modal w-80 anim-scale-in" onClick={e => e.stopPropagation()}>
            <div className="sf-modal-header">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <p className="sf-modal-title">Choisir un dossier</p>
              </div>
              <button onClick={() => setShowFolderPick(false)}
                className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {folderLoading ? (
              <div className="py-12 flex items-center justify-center gap-3">
                <div className="sf-spinner" />
                <span className="text-sm text-text3">Chargement…</span>
              </div>
            ) : bankFolders.length === 0 ? (
              <div className="py-12 text-center text-sm text-text3">Aucun dossier dans la banque</div>
            ) : (
              <div className="max-h-80 overflow-y-auto py-1">
                {bankFolders.map(f => (
                  <button key={f.name} onClick={() => addFolderVideos(f.name)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all hover:bg-surface2 cursor-pointer border-b border-border last:border-b-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    <span className="flex-1 text-sm font-semibold text-text truncate">{f.name}</span>
                    <span className="sf-badge sf-badge-accent text-[10px]">{f.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bank picker modal */}
      {showBankPicker && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths) => {
            const newVideos: SelectedVideo[] = paths
              .filter(p => !selectedVideos.some(sv => (sv.localPath ?? sv.item.file_url) === p))
              .map(p => ({
                item: {
                  id:             `bank-${p}`,
                  user_id:        user.id,
                  org_id:         null,
                  folder:         null,
                  title:          p.replace(/\\/g, '/').split('/').pop() ?? p,
                  file_url:       p,
                  storage_path:   null,
                  thumbnail_path: null,
                  thumbnail_url:  null,
                  duration:       null,
                  tags:           [],
                  notes:          '',
                  used_count:     0,
                  created_at:     new Date().toISOString(),
                  updated_at:     new Date().toISOString(),
                },
                localPath: null,
              }))
            setSelVideos(prev => [...prev, ...newVideos])
            setShowBankPicker(false)
          }}
          onClose={() => setShowBankPicker(false)}
        />
      )}

      {showScheduleModal && (
        <ScheduleModal
          type="mass_posting"
          phonesCount={phoneList.length}
          videosCount={selectedVideos.length}
          videoTitle={selectedVideos.length === 1 ? selectedVideos[0].item.title : `${selectedVideos.length} vidéos`}
          onConfirm={scheduleMassPost}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
    </div>
  )
}
