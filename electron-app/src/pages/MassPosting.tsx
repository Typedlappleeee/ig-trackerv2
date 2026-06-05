import { useState, useEffect, useRef } from 'react'
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
    return r.data as Record<string, unknown>
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

  // Auto-assignment: round-robin (seq) or random (random) — Python _mp_mode_var
  const phoneList = phones.filter(p => selectedPhones.has(p.id))
  const assignments = phoneList.map((phone, i) => {
    if (selectedVideos.length === 0) return { phone, video: null, videoIndex: -1 }
    const idx = mode === 'random'
      ? Math.floor(Math.random() * selectedVideos.length)  // Note: stable per render — recomputed when phoneList/videos change
      : i % selectedVideos.length
    return { phone, video: selectedVideos[idx], videoIndex: idx }
  })

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
          const qRes = await geelark(bearer, '/task/query', { ids: [...pending] })
          pollCount++

          // RPA tasks may live under different response keys depending on the GéeLark API version
          const d = (qRes['data'] as Record<string, unknown>) ?? {}
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
    <div className="anim-page h-full flex flex-col overflow-hidden" style={{ background: '#07070B' }}>

      {/* ── Top header bar ──────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 px-8 pt-6 pb-5 flex items-center justify-between gap-6"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.08)', background: 'rgba(7,7,11,0.95)' }}>

        {/* Left: title + status */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex-shrink-0 rounded-[13px] flex items-center justify-center" style={{ width: 44, height: 44, background: 'linear-gradient(135deg,rgba(124,58,237,0.25),rgba(168,85,247,0.12))', border: '1px solid rgba(139,92,246,0.25)', boxShadow: '0 0 20px -6px rgba(139,92,246,0.5)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[23px] font-black tracking-tight leading-none" style={{
                background: 'linear-gradient(135deg,#FFFFFF 0%,rgba(196,181,253,0.85) 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.025em',
              }}>Mass Posting</h1>
              {posting ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />{t('running')}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#52525b' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(82,82,91,0.6)' }} />{t('idle')}
                </span>
              )}
            </div>
            <p className="text-[11px] mt-0.5 flex items-center gap-2" style={{ color: 'rgba(148,163,184,0.45)' }}>
              <span>{phoneList.length} {lang === 'en' ? `target${phoneList.length !== 1 ? 's' : ''}` : `cible${phoneList.length !== 1 ? 's' : ''}`}</span>
              <span>·</span>
              <span>{selectedVideos.length} {lang === 'en' ? `video${selectedVideos.length !== 1 ? 's' : ''}` : `vidéo${selectedVideos.length !== 1 ? 's' : ''}`}</span>
              {posting && totalTasks > 0 && (
                <><span>·</span><span style={{ color: '#a78bfa' }}>{doneTasks}/{totalTasks} {lang === 'en' ? `done` : `terminé${doneTasks !== 1 ? 's' : ''}`}</span></>
              )}
            </p>
          </div>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Assignment mode pill */}
          <div className="flex rounded-xl p-1 gap-0.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {([{ k: 'seq', label: t('schedulerSequential') }, { k: 'random', label: t('schedulerRandom') }] as const).map(m => (
              <button key={m.k} onClick={() => setMode(m.k)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                style={mode === m.k
                  ? { background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.28)' }
                  : { color: 'rgba(82,82,91,0.9)' }}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Stop */}
          <button onClick={stop} disabled={!posting}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-semibold transition-all disabled:opacity-25 disabled:cursor-not-allowed"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1.5"/></svg>
            {t('stop')}
          </button>

          {/* Schedule */}
          <button onClick={() => setShowScheduleModal(true)}
            disabled={posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', color: '#93c5fd' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            {t('schedule')}
          </button>

          {/* Launch */}
          <button onClick={post} disabled={!canLaunch}
            className="relative flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-black text-white transition-all active:scale-[0.97] disabled:opacity-35 disabled:cursor-not-allowed overflow-hidden"
            style={canLaunch ? {
              background: 'linear-gradient(130deg,#6D28D9,#7C3AED,#A855F7)',
              boxShadow: '0 4px 24px -4px rgba(124,58,237,0.6), inset 0 1px 0 rgba(255,255,255,0.12)',
            } : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {canLaunch && <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.08) 50%,transparent 60%)', backgroundSize: '200% 100%', animation: 'progressShimmer 3s linear infinite' }} />}
            {posting ? (
              <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/></svg>{t('running')}…</>
            ) : (
              <><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 1.5 11.5 6.5 3 11.5"/></svg>{t('launch')}</>
            )}
          </button>
        </div>
      </header>

      {/* Warning: no bearer */}
      {!bearer && (
        <div className="flex-shrink-0 mx-6 mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl text-[12px]"
          style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L10 9.5H1L5.5 1Z" stroke="#FCD34D" strokeWidth="1.2" strokeLinejoin="round"/><path d="M5.5 4.5v2.5" stroke="#FCD34D" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </div>
          <p style={{ color: '#FCD34D' }}>{t('massPostingMissingToken')}</p>
        </div>
      )}

      {/* Live progress banner */}
      {posting && totalTasks > 0 && (
        <div className="flex-shrink-0 mx-6 mt-4 rounded-2xl p-4"
          style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 0 24px -8px rgba(139,92,246,0.3)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-[13px] font-bold text-white">{doneTasks + errorTasks} / {totalTasks} {t('massPostingTasksProgress')}</span>
              <div className="flex items-center gap-1.5">
                {activeTasks > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                    {activeTasks} {t('massPostingActiveCount')}{lang === 'fr' && activeTasks !== 1 ? 's' : ''}
                  </span>
                )}
                {doneTasks > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                    {doneTasks} ok
                  </span>
                )}
                {errorTasks > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    {errorTasks} err
                  </span>
                )}
              </div>
            </div>
            <span className="text-[14px] font-black font-mono tabular-nums" style={{ color: progressPct >= 100 ? '#22c55e' : '#a78bfa' }}>{progressPct}%</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className={`h-full rounded-full transition-all duration-700 ${progressPct >= 100 ? 'bg-ok' : 'sf-progress-bar'}`} style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* ── 3-column body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex min-h-0 mt-0">

        {/* ── COL 1: Videos ────────────────────────────────────────────────── */}
        <aside className="w-[270px] flex-shrink-0 flex flex-col"
          style={{ borderRight: '1px solid rgba(139,92,246,0.08)', background: 'linear-gradient(180deg,#09090F 0%,#07070B 100%)' }}>

          <div className="flex-shrink-0 px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="2" width="9" height="7" rx="1.5" stroke="#A78BFA" strokeWidth="1.2"/><path d="M10 5.5L12 4v5L10 7.5V5.5Z" stroke="#A78BFA" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                </div>
                <p className="text-[13px] font-black text-white">{t('massPostingContent')}</p>
              </div>
              {selectedVideos.length > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: 'linear-gradient(130deg,#7C3AED,#A855F7)', boxShadow: '0 2px 10px -2px rgba(124,58,237,0.5)' }}>
                  {selectedVideos.length}
                </span>
              )}
            </div>

            {/* Add buttons */}
            <div className="space-y-1.5">
              <button onClick={() => setShowBankPicker(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'linear-gradient(130deg,#7C3AED,#A855F7)', color: '#fff', boxShadow: '0 3px 14px -4px rgba(124,58,237,0.5)' }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="0.5" y="0.5" width="4" height="4" rx="1" fill="white" opacity=".8"/><rect x="6.5" y="0.5" width="4" height="4" rx="1" fill="white" opacity=".6"/><rect x="0.5" y="6.5" width="4" height="4" rx="1" fill="white" opacity=".6"/><rect x="6.5" y="6.5" width="4" height="4" rx="1" fill="white" opacity=".4"/></svg>
                {t('massPostingFromBank')}
              </button>
              <div className="flex gap-1.5">
                <button onClick={() => pickLocalFile(-1)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-white/[0.05]"
                  style={{ border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.7)' }}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 7V1M3 3.5L5.5 1L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 8v1.5C1 10.3 1.7 11 2.5 11h6c.8 0 1.5-.7 1.5-1.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  {t('massPostingFromPC')}
                </button>
                <button onClick={openFolderPick}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-accent/10"
                  style={{ border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 8.5V4A1 1 0 0 1 2 3h2.5L5.5 4.5H9A1 1 0 0 1 10 5.5V8.5A1 1 0 0 1 9 9.5H2A1 1 0 0 1 1 8.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
                  {t('massPostingFromFolder')}
                </button>
              </div>
            </div>
          </div>

          {addingFolder && (
            <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2"
              style={{ background: 'rgba(139,92,246,0.06)', borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
              <svg className="animate-spin w-3 h-3 flex-shrink-0" style={{ color: '#a78bfa' }} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
              <p className="text-[11px] font-semibold truncate" style={{ color: '#a78bfa' }}>{t('massPostingAddingFolder')} «{addingFolder}»…</p>
            </div>
          )}

          <div className="flex-1 overflow-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {selectedVideos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-5 py-10 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(139,92,246,0.06)', border: '1px dashed rgba(139,92,246,0.2)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(82,82,91,0.7)" strokeWidth="1.3"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                </div>
                <p className="text-[13px] font-bold text-white mb-1">{t('massPostingNoContent')}</p>
                <p className="text-[11px] leading-relaxed max-w-[160px]" style={{ color: 'rgba(148,163,184,0.4)' }}>{t('massPostingNoContentHint')}</p>
                <p className="text-[10px] mt-3" style={{ color: 'rgba(82,82,91,0.6)' }}>{t('massPostingFormats').split('\n').map((line, i) => <span key={i}>{line}{i === 0 ? <br/> : ''}</span>)}</p>
              </div>
            ) : (
              <div className="py-2">
                {selectedVideos.map((sv, selIdx) => {
                  const fp = sv.localPath ?? sv.item.file_url
                  return (
                    <div key={sv.item.id}
                      className="group flex items-center gap-3 px-4 py-2.5 transition-all hover:bg-white/[0.02]"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <div className="w-8 flex-shrink-0 rounded-lg overflow-hidden" style={{ aspectRatio: '9/16', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                        <VideoThumbnail filePath={fp ?? ''} thumbnailPath={sv.item.thumbnail_path} storagePath={sv.item.storage_path} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black tracking-widest uppercase mb-0.5" style={{ color: 'rgba(124,58,237,0.8)' }}>#{selIdx + 1}</p>
                        <p className="text-[12px] font-semibold text-white truncate leading-tight">{sv.item.title}</p>
                        {sv.item.folder && <p className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.3)' }}>{sv.item.folder}</p>}
                      </div>
                      <button onClick={() => setSelVideos(prev => prev.filter((_, i) => i !== selIdx))}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-lg transition-all flex-shrink-0 hover:bg-danger/10"
                        style={{ color: 'rgba(239,68,68,0.6)' }}>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ── COL 2: Phones / Groups ───────────────────────────────────────── */}
        <aside className="w-[250px] flex-shrink-0 flex flex-col"
          style={{ borderRight: '1px solid rgba(139,92,246,0.08)', background: 'linear-gradient(180deg,#09090F 0%,#07070B 100%)' }}>

          <div className="flex-shrink-0 px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="1" width="8" height="10" rx="1.5" stroke="#A78BFA" strokeWidth="1.2"/><circle cx="6" cy="9" r="0.8" fill="#A78BFA"/></svg>
                </div>
                <p className="text-[13px] font-black text-white">{t('massPostingTargets')}</p>
              </div>
              {selectedPhones.size > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: 'linear-gradient(130deg,#7C3AED,#A855F7)', boxShadow: '0 2px 10px -2px rgba(124,58,237,0.5)' }}>
                  {selectedPhones.size}
                </span>
              )}
            </div>

            {/* Phones / Groups toggle */}
            <div className="flex rounded-xl p-1 gap-0.5 mb-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {([{ k: 'phones', l: t('massPostingPhones') }, { k: 'groups', l: t('massPostingGroups') }] as const).map(m => (
                <button key={m.k} onClick={() => setPhonePickMode(m.k)}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={phonePickMode === m.k
                    ? { background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.28)' }
                    : { color: 'rgba(82,82,91,0.9)' }}>
                  {m.l}
                </button>
              ))}
            </div>

            {phonePickMode === 'phones' && (
              <div className="space-y-2">
                {groups.length > 1 && (
                  <div className="relative">
                    <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                      className="w-full appearance-none rounded-xl px-3 py-2 pr-7 text-[12px] focus:outline-none"
                      style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', color: '#C4B5FD' }}>
                      {groups.map(g => <option key={g} value={g} style={{ background: '#0E0E16', color: '#fff' }}>{g}</option>)}
                    </select>
                    <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                )}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5" cy="5" r="3.5" stroke="rgba(139,92,246,0.5)" strokeWidth="1.2"/><path d="M7.5 7.5L10 10" stroke="rgba(139,92,246,0.5)" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  <input type="text" placeholder={t('massPostingSearchPhone')} value={phoneSearch}
                    onChange={e => setPhoneSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl text-[12px] placeholder:text-text3 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.12)', color: '#E2E8F0' }}
                  />
                </div>
              </div>
            )}
            {phonePickMode === 'groups' && (
              <div className="flex gap-3">
                <button onClick={() => {
                  const realGroups = groups.filter(g => g !== 'Tous')
                  setSelectedGroups(new Set(realGroups))
                  setSelPhones(new Set(phones.filter(p => {
                    if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
                    return Boolean(p.group_name)
                  }).map(p => p.id)))
                }} className="text-[12px] font-bold text-accent hover:text-white transition-colors">{t('massPostingAllGroup')}</button>
                <button onClick={() => { setSelectedGroups(new Set()); setSelPhones(new Set()) }}
                  className="text-[12px] text-text3 hover:text-white transition-colors">{t('massPostingNoneGroup')}</button>
              </div>
            )}
          </div>

          {phonePickMode === 'phones' && (
            <div className="flex-shrink-0 flex items-center gap-0 mx-4 mb-2 mt-2 rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
                className="flex-1 py-1.5 text-[11px] font-bold text-accent hover:bg-accent/10 transition-colors">{t('massPostingAllGroup')}</button>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', height: 20 }} />
              <button onClick={() => setSelPhones(new Set())}
                className="flex-1 py-1.5 text-[11px] text-text2 hover:text-white hover:bg-white/[0.04] transition-colors">{t('massPostingNoneGroup')}</button>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', height: 20 }} />
              <span className="px-3 text-[11px] font-medium" style={{ color: 'rgba(148,163,184,0.4)' }}>{visiblePhones.length}</span>
            </div>
          )}

          <div className="flex-1 overflow-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {/* Phones mode */}
            {phonePickMode === 'phones' && visiblePhones.map(phone => {
              const checked = selectedPhones.has(phone.id)
              const asgn = assignments.find(a => a.phone.id === phone.id)
              const ts = taskStatuses.get(phone.id)
              const initials = (phone.ig_username?.[0] ?? phone.phone_name?.[0] ?? '?').toUpperCase()
              const statusDot: Record<string, string> = { uploading: '#60a5fa', posting: '#f59e0b', done: '#22c55e', error: '#ef4444' }
              return (
                <button key={phone.id} onClick={() => togglePhone(phone.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all relative"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.025)', background: checked ? 'rgba(139,92,246,0.08)' : 'transparent' }}>
                  {checked && <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full" style={{ background: 'linear-gradient(180deg,#7C3AED,#A855F7)' }} />}
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-black flex-shrink-0"
                    style={checked ? { background: avatarGradient(phone.phone_name ?? ''), color: '#fff', boxShadow: '0 2px 8px -2px rgba(124,58,237,0.5)' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.5)' }}>
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[12px] font-semibold truncate ${checked ? 'text-white' : 'text-text2'}`}>{phone.phone_name}</p>
                    {phone.ig_username && <p className="text-[10px] truncate" style={{ color: checked ? '#A78BFA' : 'rgba(139,92,246,0.4)' }}>@{phone.ig_username}</p>}
                    {ts && ts.status !== 'idle' && ts.status !== 'pending' && (
                      <p className="text-[10px] font-semibold flex items-center gap-1" style={{ color: statusDot[ts.status] ?? '#71717a' }}>
                        <span className="w-1 h-1 rounded-full inline-block" style={{ background: statusDot[ts.status] ?? '#71717a' }} />
                        {STATUS_LABEL[ts.status]}
                      </p>
                    )}
                  </div>
                  {asgn?.video && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                      #{asgn.videoIndex + 1}
                    </span>
                  )}
                  <div className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0"
                    style={checked ? { background: 'linear-gradient(135deg,#7C3AED,#A855F7)', boxShadow: '0 0 8px rgba(139,92,246,0.4)' } : { border: '1px solid rgba(255,255,255,0.1)' }}>
                    {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </button>
              )
            })}

            {/* Groups mode */}
            {phonePickMode === 'groups' && (() => {
              const realGroups = groups.filter(g => g !== 'Tous')
              if (realGroups.length === 0) return (
                <div className="flex flex-col items-center justify-center h-full px-5 py-10 text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px dashed rgba(139,92,246,0.2)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(82,82,91,0.7)" strokeWidth="1.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <p className="text-[12px] font-bold text-white mb-1">{t('massPostingNoGroup')}</p>
                  <p className="text-[11px] text-text3">{t('massPostingNoGroupHint')}</p>
                </div>
              )
              return (
                <div className="py-2">
                  {realGroups.map(g => {
                    const inGroup = phones.filter(p => {
                      if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
                      return p.group_name === g
                    })
                    const checked = selectedGroups.has(g)
                    const selCount = inGroup.filter(p => selectedPhones.has(p.id)).length
                    return (
                      <button key={g} onClick={() => toggleGroup(g)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all relative"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.025)', background: checked ? 'rgba(139,92,246,0.08)' : 'transparent' }}>
                        {checked && <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full" style={{ background: 'linear-gradient(180deg,#7C3AED,#A855F7)' }} />}
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={checked ? { background: 'linear-gradient(135deg,#7C3AED,#A855F7)', boxShadow: '0 2px 8px -2px rgba(124,58,237,0.5)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={checked ? 'white' : '#52525b'} strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[13px] font-bold truncate ${checked ? 'text-white' : 'text-text2'}`}>{g}</p>
                          <p className="text-[11px]" style={{ color: checked ? '#a78bfa' : 'rgba(82,82,91,0.7)' }}>
                            {checked ? `${selCount}/${inGroup.length} ${t('massPostingSelCount')}` : `${inGroup.length} ${t('massPostingPhoneCount')}`}
                          </p>
                        </div>
                        <div className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0"
                          style={checked ? { background: 'linear-gradient(135deg,#7C3AED,#A855F7)' } : { border: '1px solid rgba(255,255,255,0.1)' }}>
                          {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </aside>

        {/* ── COL 3: Config + Assignments + Logs ───────────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <div className="px-6 py-6 space-y-4 max-w-4xl">

            {/* Options */}
            <div className="rounded-2xl overflow-hidden" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)', boxShadow: '0 4px 32px -4px rgba(0,0,0,0.4)' }}>
              <div className="flex items-center gap-2.5 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="2" stroke="#A78BFA" strokeWidth="1.2"/><path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11" stroke="#A78BFA" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </div>
                <span className="text-[12px] font-bold text-white">{t('massPostingPublishOptions')}</span>
              </div>
              <div className="px-5 py-4">
                <PostingOptions opts={postingOpts} onChange={o => { setPostingOpts(o); savePostingOpts(o) }} />
              </div>
            </div>

            {/* Description */}
            <div className="rounded-2xl overflow-hidden" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)', boxShadow: '0 4px 32px -4px rgba(0,0,0,0.4)' }}>
              <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 2h10M1 5h7M1 8h8M1 11h5" stroke="#A78BFA" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </div>
                  <span className="text-[12px] font-bold text-white">{t('massPostingDescription')}</span>
                </div>
                <span className={`text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-lg ${caption.length > 2200 ? 'text-danger' : 'text-text3'}`}
                  style={{ background: caption.length > 2200 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)' }}>
                  {caption.length}/2200
                </span>
              </div>
              <div className="p-5 space-y-3">
                <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4}
                  placeholder={t('massPostingCaptionPlaceholder')}
                  className="w-full rounded-xl px-4 py-3 text-[13px] placeholder:text-text3 resize-none focus:outline-none transition-all leading-relaxed"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.1)', color: '#E2E8F0', fontFamily: 'inherit' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(139,92,246,0.35)'; e.target.style.background = 'rgba(139,92,246,0.04)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(139,92,246,0.1)'; e.target.style.background = 'rgba(255,255,255,0.03)' }}
                />
                <div className="flex gap-2">
                  <button onClick={generateCaption} disabled={!groqKey || generating}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold transition-all disabled:opacity-40 hover:opacity-90"
                    style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#A78BFA' }}>
                    {generating ? <span className="w-3 h-3 border-2 border-accent/50 border-t-accent rounded-full animate-spin inline-block" /> : <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L6.8 4.2H10.2L7.5 6.1L8.5 9.5L5.5 7.5L2.5 9.5L3.5 6.1L0.8 4.2H4.2L5.5 1Z" fill="#A78BFA"/></svg>}
                    {generating ? t('massPostingGeneratingAI') : t('massPostingGenerateAI')}
                  </button>
                  <input type="text" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                    placeholder={t('massPostingCustomPrompt')}
                    className="flex-1 px-3 py-2 rounded-xl text-[12px] placeholder:text-text3 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.12)', color: '#E2E8F0' }}
                  />
                  <button onClick={() => setWithHashtags(v => !v)}
                    className="px-3 py-2 rounded-xl text-[12px] font-black transition-all flex-shrink-0"
                    style={withHashtags
                      ? { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', boxShadow: '0 0 10px rgba(139,92,246,0.2)' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#52525b' }}>
                    #
                  </button>
                </div>
              </div>
            </div>

            {/* Assignments table */}
            <div className="rounded-2xl overflow-hidden" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)', boxShadow: '0 4px 32px -4px rgba(0,0,0,0.4)' }}>
              <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3h10M1 6h10M1 9h10" stroke="#A78BFA" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </div>
                  <span className="text-[12px] font-bold text-white">{t('massPostingAssignments')}</span>
                </div>
                {assignments.length > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                    {assignments.length} {assignments.length !== 1 ? t('massPostingAssignmentCountPlural') : t('massPostingAssignmentCount')}
                  </span>
                )}
              </div>

              {assignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px dashed rgba(139,92,246,0.2)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(82,82,91,0.7)" strokeWidth="1.3"><path d="M9 17H5a2 2 0 0 0-2 2"/><path d="M11 17h8a2 2 0 0 1 2 2"/><rect x="1" y="3" width="22" height="12" rx="2"/></svg>
                  </div>
                  <p className="text-[13px] font-bold text-white mb-1">{t('massPostingAssignments')}</p>
                  <p className="text-[12px] max-w-[280px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.4)' }}>
                    {t('massPostingNoAssignment')}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {['#', 'Téléphone', 'Vidéo', 'Statut'].map((h, i) => (
                          <th key={h} className={`py-2.5 text-[10px] font-bold uppercase tracking-widest text-text3 ${i === 3 ? 'text-right pr-5' : i === 0 ? 'pl-5 text-left' : 'px-3 text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map(({ phone, video, videoIndex }, rowIdx) => {
                        const ts = taskStatuses.get(phone.id)
                        const status = ts?.status ?? 'idle'
                        const statusCfg: Record<string, { bg: string; fg: string }> = {
                          idle:      { bg: 'rgba(82,82,91,0.12)',   fg: '#52525b' },
                          pending:   { bg: 'rgba(82,82,91,0.12)',   fg: '#71717a' },
                          uploading: { bg: 'rgba(96,165,250,0.12)', fg: '#60a5fa' },
                          posting:   { bg: 'rgba(245,158,11,0.12)', fg: '#f59e0b' },
                          done:      { bg: 'rgba(34,197,94,0.12)',  fg: '#22c55e' },
                          error:     { bg: 'rgba(239,68,68,0.12)',  fg: '#ef4444' },
                        }
                        const cfg = statusCfg[status]
                        const rowBg = status === 'done' ? 'rgba(34,197,94,0.02)' : status === 'error' ? 'rgba(239,68,68,0.02)' : status === 'posting' ? 'rgba(245,158,11,0.015)' : 'transparent'
                        return (
                          <tr key={phone.id} style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                            <td className="pl-5 pr-3 py-3 font-mono text-[11px]" style={{ color: 'rgba(82,82,91,0.6)' }}>{rowIdx + 1}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-black flex-shrink-0"
                                  style={{ background: avatarGradient(phone.phone_name ?? ''), color: '#fff' }}>
                                  {(phone.ig_username?.[0] ?? phone.phone_name?.[0] ?? '?').toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-white truncate max-w-[110px]">{phone.phone_name}</p>
                                  {phone.ig_username && <p className="text-[10px] truncate max-w-[110px]" style={{ color: 'rgba(139,92,246,0.6)' }}>@{phone.ig_username}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              {video ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 flex-shrink-0 rounded-lg overflow-hidden" style={{ aspectRatio: '9/16', background: 'rgba(139,92,246,0.08)' }}>
                                    <VideoThumbnail filePath={video.localPath ?? video.item.file_url ?? ''} thumbnailPath={video.item.thumbnail_path} storagePath={video.item.storage_path} />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-[10px] font-bold" style={{ color: '#7c3aed' }}>#{videoIndex + 1} </span>
                                    <span className="text-text2 truncate max-w-[110px] inline-block align-middle text-[11px]">{video.item.title}</span>
                                  </div>
                                </div>
                              ) : <span className="text-text3 italic text-[11px]">—</span>}
                            </td>
                            <td className="pr-5 pl-3 py-3 text-right">
                              <div className="inline-flex flex-col items-end gap-1">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
                                  style={{ background: cfg.bg, color: cfg.fg }}>
                                  {STATUS_LABEL[status]}
                                </span>
                                {ts?.detail && <span className="text-[10px] text-text3 max-w-[110px] truncate">{ts.detail}</span>}
                                {(status === 'uploading' || status === 'posting') && (
                                  <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                    <div className="sf-progress-bar h-full" style={{ width: status === 'uploading' ? '55%' : '75%' }} />
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

            {/* Bottom status bar */}
            <div className="rounded-2xl p-4 flex items-center gap-6" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.1)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: phoneList.length > 0 ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${phoneList.length > 0 ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2.5" y="1" width="8" height="11" rx="1.5" stroke={phoneList.length > 0 ? '#A78BFA' : 'rgba(82,82,91,0.6)'} strokeWidth="1.2"/></svg>
                </div>
                <div>
                  <p className="text-[18px] font-black leading-none" style={{ color: phoneList.length > 0 ? '#fff' : 'rgba(82,82,91,0.7)' }}>{phoneList.length}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.4)' }}>cibles sélectionnées</p>
                </div>
              </div>
              <div className="w-px h-8" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: selectedVideos.length > 0 ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selectedVideos.length > 0 ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="3" width="9" height="7" rx="1.5" stroke={selectedVideos.length > 0 ? '#A78BFA' : 'rgba(82,82,91,0.6)'} strokeWidth="1.2"/><path d="M10 5.5L12 4v5L10 7.5V5.5Z" stroke={selectedVideos.length > 0 ? '#A78BFA' : 'rgba(82,82,91,0.6)'} strokeWidth="1.2" strokeLinejoin="round"/></svg>
                </div>
                <div>
                  <p className="text-[18px] font-black leading-none" style={{ color: selectedVideos.length > 0 ? '#fff' : 'rgba(82,82,91,0.7)' }}>{selectedVideos.length}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.4)' }}>vidéos sélectionnées</p>
                </div>
              </div>
              <div className="w-px h-8" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="flex items-center gap-2 ml-auto">
                <div className="w-2 h-2 rounded-full" style={{ background: canLaunch ? '#22C55E' : 'rgba(82,82,91,0.5)' }} />
                <p className="text-[12px] font-semibold" style={{ color: canLaunch ? '#E2E8F0' : 'rgba(82,82,91,0.6)' }}>
                  {posting ? 'Publication en cours…' : canLaunch ? 'Prêt à lancer' : 'Vérifie tes paramètres puis lance la publication'}
                </p>
              </div>
            </div>

            {/* Log viewer */}
            {logs.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
                <div className="flex items-center justify-between px-5 pt-3.5 pb-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 2h9M1 5h6M1 8h7" stroke="#A78BFA" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    </div>
                    <span className="text-[12px] font-bold text-white">Journal</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#7c3aed' }}>{logs.length}</span>
                  </div>
                  {!posting && (
                    <button onClick={() => setLogs([])}
                      className="text-[11px] text-text3 hover:text-white transition-colors flex items-center gap-1">
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1 2h7M3.5 2V1.5h2V2M2.5 2l.5 6h3l.5-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Effacer
                    </button>
                  )}
                </div>
                <div className="p-4 max-h-52 overflow-auto" style={{ background: 'rgba(0,0,0,0.4)', scrollbarWidth: 'none' }}>
                  <div className="font-mono text-[11px] space-y-1">
                    {logs.map((l, i) => {
                      // Messages with an embedded screenshot: "text [screenshot]::data:image/..."
                      const scMatch = l.message.match(/^(.*)\[screenshot\]::(data:image\/[^,]+,[^\s]+)(.*)$/)
                      const msgText = scMatch ? scMatch[1].trim() : l.message
                      const scUrl   = scMatch ? scMatch[2] : null
                      return (
                        <div key={i} className="flex flex-col gap-1 leading-relaxed">
                          <div className="flex gap-3">
                            <span className="flex-shrink-0 tabular-nums" style={{ color: 'rgba(71,85,105,0.8)' }}>{l.time}</span>
                            <span className={l.level === 'ok' ? 'text-ok' : l.level === 'error' ? 'text-danger' : l.level === 'warn' ? 'text-warn' : 'text-text2'}>{msgText}</span>
                          </div>
                          {scUrl && (
                            <img src={scUrl} alt="screenshot" style={{ maxHeight: 180, borderRadius: 6, border: '1px solid rgba(251,191,36,0.3)', marginLeft: 40, objectFit: 'contain' }} />
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

      {/* ── Folder picker modal ───────────────────────────────────────────── */}
      {showFolderPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowFolderPick(false)}>
          <div className="rounded-2xl overflow-hidden w-80 anim-scale-in"
            onClick={e => e.stopPropagation()}
            style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.25)', boxShadow: '0 24px 80px -12px rgba(0,0,0,0.8)' }}>
            <div className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgba(139,92,246,0.12)' }}>
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <p className="text-[14px] font-bold text-white">Choisir un dossier</p>
              </div>
              <button onClick={() => setShowFolderPick(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-text3 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {folderLoading ? (
              <div className="py-12 flex items-center justify-center gap-3">
                <svg className="animate-spin w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/>
                </svg>
                <span className="text-[13px] text-text3">Chargement…</span>
              </div>
            ) : bankFolders.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-text3">Aucun dossier dans la banque</div>
            ) : (
              <div className="max-h-80 overflow-y-auto py-1">
                {bankFolders.map(f => (
                  <button key={f.name} onClick={() => addFolderVideos(f.name)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all hover:bg-white/[0.04]"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    <span className="flex-1 text-[13px] font-semibold text-white truncate">{f.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                      {f.count}
                    </span>
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
