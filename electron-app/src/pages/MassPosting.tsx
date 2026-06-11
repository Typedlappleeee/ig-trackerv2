import { useState, useEffect, useRef, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
import { supabase, type Phone, type ContentItem } from '@/lib/supabase'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { logActivity } from '@/lib/activityLog'
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
  const [groupFilter, _setGroupFilter]    = useState(loadLastGroup)
  const setGroupFilter = (g: string) => { _setGroupFilter(g); saveLastGroup(g) }
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
      // Groupe mémorisé disparu (renommé/supprimé) → retour à « Tous »
      if (!grps.includes(loadLastGroup())) setGroupFilter('Tous')
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

  // Resolve the upload path for a selected video.
  // Priority: localPath → file_url (signed URL from BankPicker) → fresh signed URL from storage_path
  async function resolveVideoPath(sv: SelectedVideo): Promise<string | null> {
    if (sv.localPath) return sv.localPath
    if (sv.item.file_url) return sv.item.file_url
    if (sv.item.storage_path) {
      const { getSignedUrl } = await import('@/lib/storage')
      return getSignedUrl(sv.item.storage_path).catch(() => null)
    }
    return null
  }

  async function scheduleMassPost(scheduledAt: Date) {
    if (!bearer)                    { log('Missing GéeLark token — Settings', 'error'); return }
    if (phoneList.length === 0)     { log('Select at least one phone', 'warn'); return }
    if (selectedVideos.length === 0){ log('Select at least one video', 'warn'); return }
    // GéeLark expire les fichiers uploadés après 30 jours — bloque au-delà de 25
    if (scheduledAt.getTime() > Date.now() + 25 * 24 * 60 * 60 * 1000) {
      log('❌ Programmation limitée à 25 jours (les vidéos uploadées chez GéeLark expirent après 30 jours)', 'error')
      return
    }
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

      // Crédits débités à la programmation (remboursés si annulation avant exécution)
      const creditCost = phoneList.length * CREDIT_COSTS.mass_posting
      const creditRes  = await checkAndDeductCredits(credits.ownerId, creditCost)
      if (!creditRes.ok) {
        log(`❌ ${creditRes.error ?? 'Crédits insuffisants'} (requis : ${creditCost} pour ${phoneList.length} téléphone${phoneList.length > 1 ? 's' : ''})`, 'error')
        return
      }
      if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)
      log(`💳 ${creditCost} crédits débités — remboursés si tu annules avant l'exécution`, 'ok')

      // Refund helper: any failure between deduction and creation gives the credits back
      const refundOnFailure = async (reason: string) => {
        const { refundCredits } = await import('@/lib/credits')
        const ok = await refundCredits(credits.ownerId, creditCost)
        log(`❌ ${reason}${ok ? ` — ${creditCost} crédits remboursés` : ''}`, 'error')
        if (ok) credits.refresh()
      }

      log(`📤 Upload de ${videosToSchedule.length} vidéo(s) vers GéeLark…`)
      const tokenMap = new Map<number, string>()
      for (let i = 0; i < videosToSchedule.length; i++) {
        const sv = videosToSchedule[i]
        const filePath = await resolveVideoPath(sv)
        if (!filePath) { await refundOnFailure(`Chemin manquant pour ${sv.item.title}`); return }
        const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
        if (!up.ok || !up.token) { await refundOnFailure(`Upload échoué pour ${sv.item.title}: ${up.error}`); return }
        tokenMap.set(i, up.token)
        log(`✅ Vidéo ${i + 1}/${videosToSchedule.length} prête`, 'ok')
      }
      try {
        await createScheduledPost({
          userId: user.id, orgId: currentOrg?.id ?? null,
          createdByName: user.email?.split('@')[0] ?? 'Moi',
          type: 'mass_posting', scheduledAt,
          phones: phoneList.map(p => ({ id: p.id, geelark_id: p.geelark_id, phone_name: p.phone_name, ig_username: p.ig_username })),
          videos: videosToSchedule.map((v, i) => ({ token: tokenMap.get(i)!, title: v.item.title })),
          caption, delayMinutes: 0, mode, bearerToken: bearer, reelsTrial: postingOpts.reelsTrial,
        })
      } catch (err: any) {
        await refundOnFailure(`Programmation échouée : ${err.message}`)
        return
      }
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

        const fileSource = await resolveVideoPath(sv)
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
              : `📸 ${phoneName} : posting long — vérifiez l’écran`
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
      // Always stop phones on unexpected crash — so they don’t stay on indefinitely
      const stuck = activePhonesRef.current
      if (stuck.length > 0) {
        log(`🛑 Arrêt d’urgence de ${stuck.length} téléphone(s)…`, 'warn')
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


  // Live progress stats
  const totalTasks = assignments.length
  const doneTasks  = [...taskStatuses.values()].filter(s => s.status === 'done').length
  const errorTasks = [...taskStatuses.values()].filter(s => s.status === 'error').length
  const activeTasks = [...taskStatuses.values()].filter(s => s.status === 'uploading' || s.status === 'posting').length
  const progressPct = totalTasks > 0 ? Math.round(((doneTasks + errorTasks) / totalTasks) * 100) : 0
  const canLaunch = !posting && !!bearer && phoneList.length > 0 && selectedVideos.length > 0

  // ── ScaleFlow Noir tokens ──────────────────────────────────────────────────
  const GOLD  = '#6366F1'
  const IVORY = '#E9EAF0'
  const MUTED = 'rgba(233,234,240,0.42)'
  const FAINT = 'rgba(233,234,240,0.22)'
  const HAIR  = 'rgba(233,234,240,0.08)'
  const SERIF = "'Inter', system-ui, sans-serif"

  const STATUS_DOT: Record<string, string> = {
    uploading: '#7FB8D9', posting: '#D9B97F', done: '#7FD9B8', error: '#F0A0AB',
  }

  // Readiness checklist — tells the user exactly what’s missing
  const checklist = [
    { ok: !!bearer,                  label: 'Token GéeLark connecté',  hint: 'Ajoute ton token dans Paramètres → Connexions' },
    { ok: phoneList.length > 0,      label: `Téléphones ciblés${phoneList.length > 0 ? ` — ${phoneList.length}` : ''}`, hint: 'Coche des téléphones dans le panneau de gauche' },
    { ok: selectedVideos.length > 0, label: `Vidéos sélectionnées${selectedVideos.length > 0 ? ` — ${selectedVideos.length}` : ''}`, hint: 'Ajoute des vidéos depuis la banque ou un dossier' },
  ]
  const readyCount = checklist.filter(c => c.ok).length

  function SectionHeader({ num, title, count, action }: { num: string; title: string; count?: number; action?: React.ReactNode }) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '0 2px 12px' }}>
        <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 17, color: GOLD, lineHeight: 1 }}>{num}</span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: IVORY }}>{title}</span>
        {typeof count === 'number' && count > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
        )}
        <div style={{ flex: 1, height: 1, background: HAIR, alignSelf: 'center' }} />
        {action}
      </div>
    )
  }

  return (
    <div className="anim-page h-full flex flex-col overflow-hidden" style={{ background: '#0A0B0E' }}>

      {/* ── Editorial header ─────────────────────────────────────────────────── */}
      <header style={{ flexShrink: 0, padding: '20px 28px 0', borderBottom: `1px solid ${HAIR}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, paddingBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: GOLD, marginBottom: 6 }}>
              Instagram · Publication
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: IVORY, lineHeight: 1 }}>
              Mass <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, color: GOLD }}>Posting</span>
            </h1>
          </div>

          {/* Right: live state + mode */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Mode seq/random */}
            <div style={{ display: 'flex', border: `1px solid ${HAIR}` }}>
              {([{ k: 'seq', label: t('schedulerSequential') }, { k: 'random', label: t('schedulerRandom') }] as const).map(m => (
                <button key={m.k} onClick={() => setMode(m.k)}
                  className="cursor-pointer"
                  style={{
                    padding: '7px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                    background: mode === m.k ? IVORY : 'transparent',
                    color: mode === m.k ? '#0A0B0E' : MUTED,
                    border: 'none', transition: 'all 0.18s',
                  }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Status chip */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px',
              border: `1px solid ${posting ? 'rgba(99,102,241,0.4)' : HAIR}`,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: posting ? GOLD : 'rgba(233,234,240,0.25)',
                animation: posting ? 'pulse-soft 1.6s ease-in-out infinite' : 'none',
              }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: posting ? GOLD : MUTED }}>
                {posting ? t('running') : t('idle')}
              </span>
            </div>
          </div>
        </div>

        {/* Live progress strip (only while posting) */}
        {posting && totalTasks > 0 && (
          <div style={{ paddingBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: MUTED }}>
                <span style={{ color: IVORY, fontWeight: 700 }}>{doneTasks + errorTasks} / {totalTasks} {t('massPostingTasksProgress')}</span>
                {activeTasks > 0 && <span style={{ color: '#D9B97F' }}>{activeTasks} en cours</span>}
                {doneTasks > 0 && <span style={{ color: '#7FD9B8' }}>{doneTasks} ok</span>}
                {errorTasks > 0 && <span style={{ color: '#F0A0AB' }}>{errorTasks} erreur{errorTasks > 1 ? 's' : ''}</span>}
              </div>
              <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 18, color: progressPct >= 100 ? '#7FD9B8' : GOLD, lineHeight: 1 }}>
                {progressPct}%
              </span>
            </div>
            <div style={{ height: 2, background: 'rgba(233,234,240,0.06)' }}>
              <div style={{
                height: '100%', width: `${progressPct}%`, transition: 'width 0.7s ease',
                background: progressPct >= 100 ? '#7FD9B8' : `linear-gradient(90deg, #4F46E5, ${GOLD})`,
              }} />
            </div>
          </div>
        )}
      </header>

      {/* ── 2-column body ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

        {/* ── LEFT: phone targets (01) ─────────────────────────────────────── */}
        <aside style={{ width: 292, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${HAIR}`, background: '#0C0D11' }}>

          {/* Panel header */}
          <div style={{ flexShrink: 0, padding: '16px 16px 12px', borderBottom: `1px solid ${HAIR}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 16, color: GOLD }}>01</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: IVORY }}>{t('massPostingTargets')}</span>
              {selectedPhones.size > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{selectedPhones.size}</span>
              )}
            </div>

            {/* Phones / Groups toggle */}
            <div style={{ display: 'flex', border: `1px solid ${HAIR}`, marginBottom: 10 }}>
              {([{ k: 'phones', l: t('massPostingPhones') }, { k: 'groups', l: t('massPostingGroups') }] as const).map(m => (
                <button key={m.k} onClick={() => setPhonePickMode(m.k)}
                  className="cursor-pointer"
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    background: phonePickMode === m.k ? 'rgba(99,102,241,0.1)' : 'transparent',
                    color: phonePickMode === m.k ? GOLD : FAINT,
                    border: 'none', borderBottom: phonePickMode === m.k ? `1px solid ${GOLD}` : '1px solid transparent',
                    transition: 'all 0.18s',
                  }}>
                  {m.l}
                </button>
              ))}
            </div>

            {phonePickMode === 'phones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groups.length > 1 && (
                  <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                    className="cursor-pointer"
                    style={{
                      width: '100%', height: 30, padding: '0 8px', fontSize: 12,
                      background: 'transparent', color: IVORY,
                      border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none',
                    }}>
                    {groups.map(g => <option key={g} value={g} style={{ background: '#0F1014', color: IVORY }}>{g}</option>)}
                  </select>
                )}
                <input type="text" placeholder={t('massPostingSearchPhone')} value={phoneSearch}
                  onChange={e => setPhoneSearch(e.target.value)}
                  style={{
                    width: '100%', height: 30, padding: '0 2px', fontSize: 12,
                    background: 'transparent', color: IVORY,
                    border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(99,102,241,0.6)' }}
                  onBlur={e => { e.currentTarget.style.borderBottomColor = HAIR }}
                />
                {/* Select all / none */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 2 }}>
                  <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
                    className="cursor-pointer"
                    style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: GOLD, background: 'none', border: 'none', padding: 0 }}>
                    {t('massPostingAllGroup')}
                  </button>
                  <button onClick={() => setSelPhones(new Set())}
                    className="cursor-pointer"
                    style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: FAINT, background: 'none', border: 'none', padding: 0 }}>
                    {t('massPostingNoneGroup')}
                  </button>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>{visiblePhones.length}</span>
                </div>
              </div>
            )}

            {phonePickMode === 'groups' && (
              <div style={{ display: 'flex', gap: 14 }}>
                <button onClick={() => {
                  const realGroups = groups.filter(g => g !== 'Tous')
                  setSelectedGroups(new Set(realGroups))
                  setSelPhones(new Set(phones.filter(p => {
                    if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
                    return Boolean(p.group_name)
                  }).map(p => p.id)))
                }} className="cursor-pointer"
                  style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: GOLD, background: 'none', border: 'none', padding: 0 }}>
                  {t('massPostingAllGroup')}
                </button>
                <button onClick={() => { setSelectedGroups(new Set()); setSelPhones(new Set()) }}
                  className="cursor-pointer"
                  style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: FAINT, background: 'none', border: 'none', padding: 0 }}>
                  {t('massPostingNoneGroup')}
                </button>
              </div>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflow: 'auto', scrollbarWidth: 'thin' }}>
            {phonePickMode === 'phones' && visiblePhones.map(phone => {
              const checked = selectedPhones.has(phone.id)
              const asgn = assignments.find(a => a.phone.id === phone.id)
              const ts = taskStatuses.get(phone.id)
              const initials = (phone.ig_username?.[0] ?? phone.phone_name?.[0] ?? '?').toUpperCase()
              return (
                <button key={phone.id} onClick={() => togglePhone(phone.id)}
                  className="cursor-pointer"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 14px',
                    textAlign: 'left', position: 'relative', border: 'none',
                    borderBottom: `1px solid rgba(233,234,240,0.04)`,
                    background: checked ? 'rgba(99,102,241,0.06)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'rgba(233,234,240,0.03)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = checked ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                  {checked && <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, background: GOLD }} />}

                  {/* Avatar */}
                  <div style={{
                    width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                    border: `1px solid ${checked ? 'rgba(99,102,241,0.45)' : HAIR}`,
                    color: checked ? GOLD : FAINT,
                    background: checked ? 'rgba(99,102,241,0.08)' : 'transparent',
                    transition: 'all 0.15s',
                  }}>
                    {initials}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: checked ? IVORY : 'rgba(233,234,240,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {phone.phone_name}
                    </p>
                    {phone.ig_username && (
                      <p style={{ fontSize: 10, color: checked ? 'rgba(99,102,241,0.7)' : FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{phone.ig_username}</p>
                    )}
                    {ts && ts.status !== 'idle' && ts.status !== 'pending' && (
                      <p style={{ fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, color: STATUS_DOT[ts.status] ?? MUTED }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', display: 'inline-block', background: STATUS_DOT[ts.status] ?? MUTED }} />
                        {STATUS_LABEL[ts.status]}
                      </p>
                    )}
                  </div>

                  {asgn?.video && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>#{asgn.videoIndex + 1}</span>
                  )}

                  {/* Checkbox */}
                  <div style={{
                    width: 14, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: checked ? GOLD : 'transparent',
                    border: checked ? 'none' : `1px solid rgba(233,234,240,0.18)`,
                    transition: 'all 0.15s',
                  }}>
                    {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </button>
              )
            })}

            {phonePickMode === 'groups' && (() => {
              const realGroups = groups.filter(g => g !== 'Tous')
              if (realGroups.length === 0) return (
                <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, marginBottom: 5 }}>{t('massPostingNoGroup')}</p>
                  <p style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>{t('massPostingNoGroupHint')}</p>
                </div>
              )
              return realGroups.map(g => {
                const inGroup = phones.filter(p => {
                  if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
                  return p.group_name === g
                })
                const checked = selectedGroups.has(g)
                const selCount = inGroup.filter(p => selectedPhones.has(p.id)).length
                return (
                  <button key={g} onClick={() => toggleGroup(g)}
                    className="cursor-pointer"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px',
                      textAlign: 'left', position: 'relative', border: 'none',
                      borderBottom: `1px solid rgba(233,234,240,0.04)`,
                      background: checked ? 'rgba(99,102,241,0.06)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'rgba(233,234,240,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = checked ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                    {checked && <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, background: GOLD }} />}
                    <div style={{
                      width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${checked ? 'rgba(99,102,241,0.45)' : HAIR}`,
                      background: checked ? 'rgba(99,102,241,0.08)' : 'transparent',
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={checked ? GOLD : FAINT} strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: checked ? IVORY : 'rgba(233,234,240,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g}</p>
                      <p style={{ fontSize: 10.5, color: checked ? 'rgba(99,102,241,0.7)' : FAINT }}>
                        {checked ? `${selCount}/${inGroup.length} ${t('massPostingSelCount')}` : `${inGroup.length} ${t('massPostingPhoneCount')}`}
                      </p>
                    </div>
                    <div style={{
                      width: 14, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: checked ? GOLD : 'transparent',
                      border: checked ? 'none' : `1px solid rgba(233,234,240,0.18)`,
                    }}>
                      {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  </button>
                )
              })
            })()}
          </div>
        </aside>

        {/* ── RIGHT: main flow ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            <div style={{ padding: '22px 28px 24px', maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 28 }}>

              {/* ── Readiness checklist (only when incomplete and not posting) ── */}
              {!posting && readyCount < 3 && (
                <div style={{ border: `1px solid ${HAIR}` }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: GOLD }}>Préparation</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{readyCount}/3</span>
                  </div>
                  {checklist.map((c, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                      borderBottom: i < checklist.length - 1 ? `1px solid rgba(233,234,240,0.04)` : 'none',
                      opacity: c.ok ? 0.55 : 1,
                    }}>
                      <div style={{
                        width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: c.ok ? 'rgba(127,217,184,0.9)' : 'transparent',
                        border: c.ok ? 'none' : `1px solid rgba(233,234,240,0.2)`,
                        borderRadius: '50%',
                      }}>
                        {c.ok && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: c.ok ? MUTED : IVORY, textDecoration: c.ok ? 'line-through' : 'none' }}>{c.label}</span>
                      {!c.ok && <span style={{ marginLeft: 'auto', fontSize: 11, color: FAINT }}>{c.hint}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* ── 02 — Contenu ─────────────────────────────────────────────── */}
              <section>
                <SectionHeader num="02" title={t('massPostingContent')} count={selectedVideos.length}
                  action={
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setShowBankPicker(true)} className="cursor-pointer"
                        style={{
                          padding: '6px 13px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                          background: GOLD, color: '#fff', border: 'none', transition: 'background 0.18s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#818CF8' }}
                        onMouseLeave={e => { e.currentTarget.style.background = GOLD }}>
                        {t('massPostingFromBank')}
                      </button>
                      <button onClick={openFolderPick} className="cursor-pointer"
                        style={{
                          padding: '6px 13px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                          background: 'transparent', color: MUTED, border: `1px solid ${HAIR}`, transition: 'all 0.18s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = IVORY; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = MUTED; e.currentTarget.style.borderColor = HAIR }}>
                        {t('massPostingFromFolder')}
                      </button>
                      {window.electronAPI?.pickVideoFile && (
                        <button onClick={() => pickLocalFile(-1)} className="cursor-pointer"
                          style={{
                            padding: '6px 13px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                            background: 'transparent', color: MUTED, border: `1px solid ${HAIR}`, transition: 'all 0.18s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = IVORY; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = MUTED; e.currentTarget.style.borderColor = HAIR }}>
                          {t('massPostingFromPC')}
                        </button>
                      )}
                    </div>
                  }
                />

                {addingFolder && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', fontSize: 12, color: GOLD }}>
                    <div className="sf-spinner" style={{ width: 12, height: 12 }} />
                    {t('massPostingAddingFolder')} «{addingFolder}»…
                  </div>
                )}

                {selectedVideos.length === 0 ? (
                  <button onClick={() => setShowBankPicker(true)} className="cursor-pointer"
                    style={{
                      width: '100%', padding: '36px 24px', textAlign: 'center',
                      background: 'transparent', border: `1px dashed rgba(233,234,240,0.14)`,
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(233,234,240,0.14)' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: IVORY, marginBottom: 4 }}>{t('massPostingNoContent')}</p>
                    <p style={{ fontSize: 11.5, color: MUTED }}>{t('massPostingNoContentHint')}</p>
                  </button>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1, background: HAIR, border: `1px solid ${HAIR}` }}>
                    {selectedVideos.map((sv, selIdx) => {
                      const fp = sv.localPath ?? sv.item.file_url
                      return (
                        <div key={sv.item.id} className="group"
                          style={{ position: 'relative', aspectRatio: '9/16', maxHeight: 190, overflow: 'hidden', background: '#0F1014' }}>
                          <VideoThumbnail filePath={fp ?? ''} thumbnailPath={sv.item.thumbnail_path} storagePath={sv.item.storage_path} />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,6,8,0.85) 0%, transparent 45%)', pointerEvents: 'none' }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 7 }}>
                            <p style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 12, color: GOLD, lineHeight: 1, marginBottom: 2 }}>{selIdx + 1}</p>
                            <p style={{ fontSize: 10.5, fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sv.item.title}</p>
                          </div>
                          <button onClick={() => setSelVideos(prev => prev.filter((_, i) => i !== selIdx))}
                            className="cursor-pointer opacity-0 group-hover:opacity-100"
                            style={{
                              position: 'absolute', top: 5, right: 5, width: 20, height: 20,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'rgba(6,6,8,0.85)', border: `1px solid rgba(240,160,171,0.4)`, color: '#F0A0AB',
                              transition: 'opacity 0.15s',
                            }}>
                            <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          </button>
                        </div>
                      )
                    })}
                    <button onClick={() => setShowBankPicker(true)} className="cursor-pointer"
                      style={{
                        aspectRatio: '9/16', maxHeight: 190,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                        background: '#0C0D11', border: 'none', color: FAINT, transition: 'color 0.18s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = GOLD }}
                      onMouseLeave={e => { e.currentTarget.style.color = FAINT }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Ajouter</span>
                    </button>
                  </div>
                )}
              </section>

              {/* ── 03 — Légende ─────────────────────────────────────────────── */}
              <section>
                <SectionHeader num="03" title={t('massPostingDescription')}
                  action={
                    <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: caption.length > 2200 ? '#F0A0AB' : FAINT }}>
                      {caption.length}/2200
                    </span>
                  }
                />
                <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4}
                  placeholder={t('massPostingCaptionPlaceholder')}
                  style={{
                    width: '100%', minHeight: 96, padding: '12px 14px', fontSize: 13, lineHeight: 1.6,
                    background: 'rgba(233,234,240,0.02)', color: IVORY, resize: 'vertical',
                    border: `1px solid ${HAIR}`, outline: 'none', transition: 'border-color 0.2s',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = HAIR }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={generateCaption} disabled={!groqKey || generating} className="cursor-pointer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '7px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      background: 'transparent', color: (!groqKey || generating) ? FAINT : GOLD,
                      border: `1px solid ${(!groqKey || generating) ? HAIR : 'rgba(99,102,241,0.4)'}`,
                      opacity: (!groqKey || generating) ? 0.5 : 1, transition: 'all 0.18s',
                    }}>
                    {generating && <div className="sf-spinner" style={{ width: 11, height: 11 }} />}
                    {generating ? t('massPostingGeneratingAI') : t('massPostingGenerateAI')}
                  </button>
                  <input type="text" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                    placeholder={t('massPostingCustomPrompt')}
                    style={{
                      flex: 1, minWidth: 150, height: 30, padding: '0 2px', fontSize: 12,
                      background: 'transparent', color: IVORY,
                      border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none', transition: 'border-color 0.2s',
                    }}
                    onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(99,102,241,0.6)' }}
                    onBlur={e => { e.currentTarget.style.borderBottomColor = HAIR }}
                  />
                  <button onClick={() => setWithHashtags(v => !v)} title="Inclure les hashtags" className="cursor-pointer"
                    style={{
                      width: 30, height: 30, fontSize: 14, fontWeight: 800,
                      background: withHashtags ? GOLD : 'transparent',
                      color: withHashtags ? '#0A0B0E' : FAINT,
                      border: withHashtags ? 'none' : `1px solid ${HAIR}`, transition: 'all 0.18s',
                    }}>
                    #
                  </button>
                </div>
              </section>

              {/* ── 04 — Options ─────────────────────────────────────────────── */}
              <section>
                <SectionHeader num="04" title={t('massPostingPublishOptions')} />
                <div style={{ border: `1px solid ${HAIR}`, padding: '16px 18px' }}>
                  <PostingOptions opts={postingOpts} onChange={o => { setPostingOpts(o); savePostingOpts(o) }} />
                </div>
              </section>

              {/* ── 05 — Répartition ─────────────────────────────────────────── */}
              {assignments.length > 0 && (
                <section>
                  <SectionHeader num="05" title={t('massPostingAssignments')} count={assignments.length} />
                  <div style={{ border: `1px solid ${HAIR}`, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['#', 'Téléphone', 'Vidéo', 'Statut'].map((h, i) => (
                            <th key={h} style={{
                              padding: '9px 14px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                              color: FAINT, textAlign: i === 3 ? 'right' : 'left',
                              borderBottom: `1px solid ${HAIR}`,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {assignments.map(({ phone, video, videoIndex }, rowIdx) => {
                          const ts = taskStatuses.get(phone.id)
                          const status = ts?.status ?? 'idle'
                          const sc = STATUS_DOT[status]
                          return (
                            <tr key={phone.id}
                              style={{ borderBottom: rowIdx < assignments.length - 1 ? `1px solid rgba(233,234,240,0.04)` : 'none' }}>
                              <td style={{ padding: '9px 14px', fontSize: 11, color: FAINT, fontVariantNumeric: 'tabular-nums', width: 36 }}>{rowIdx + 1}</td>
                              <td style={{ padding: '9px 14px' }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{phone.phone_name}</p>
                                {phone.ig_username && <p style={{ fontSize: 10, color: 'rgba(99,102,241,0.6)' }}>@{phone.ig_username}</p>}
                              </td>
                              <td style={{ padding: '9px 14px' }}>
                                {video ? (
                                  <span style={{ fontSize: 11.5, color: MUTED }}>
                                    <span style={{ fontFamily: SERIF, fontStyle: 'normal', color: GOLD, marginRight: 6 }}>{videoIndex + 1}</span>
                                    {video.item.title.length > 32 ? video.item.title.slice(0, 32) + '…' : video.item.title}
                                  </span>
                                ) : <span style={{ fontSize: 11.5, color: FAINT, fontStyle: 'normal' }}>—</span>}
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                                  color: sc ?? FAINT,
                                }}>
                                  {sc && <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc }} />}
                                  {STATUS_LABEL[status]}
                                </span>
                                {ts?.detail && <p style={{ fontSize: 10, color: FAINT, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{ts.detail}</p>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* ── Journal ──────────────────────────────────────────────────── */}
              {logs.length > 0 && (
                <section>
                  <SectionHeader num="·" title="Journal" count={logs.length}
                    action={!posting ? (
                      <button onClick={() => setLogs([])} className="cursor-pointer"
                        style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: FAINT, background: 'none', border: 'none', padding: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#F0A0AB' }}
                        onMouseLeave={e => { e.currentTarget.style.color = FAINT }}>
                        Effacer
                      </button>
                    ) : undefined}
                  />
                  <div style={{ border: `1px solid ${HAIR}`, background: 'rgba(0,0,0,0.35)', maxHeight: 230, overflow: 'auto', padding: '12px 14px', scrollbarWidth: 'thin' }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {logs.map((l, i) => {
                        const scMatch = l.message.match(/^(.*)\[screenshot\]::(data:image\/[^,]+,[^\s]+)(.*)$/)
                        const msgText = scMatch ? scMatch[1].trim() : l.message
                        const scUrl   = scMatch ? scMatch[2] : null
                        const color = l.level === 'ok' ? '#7FD9B8' : l.level === 'error' ? '#F0A0AB' : l.level === 'warn' ? '#D9B97F' : MUTED
                        return (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.55 }}>
                            <div style={{ display: 'flex', gap: 12 }}>
                              <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: 'rgba(233,234,240,0.18)' }}>{l.time}</span>
                              <span style={{ color }}>{msgText}</span>
                            </div>
                            {scUrl && (
                              <img src={scUrl} alt="screenshot" style={{ maxHeight: 180, border: `1px solid rgba(217,185,127,0.3)`, marginLeft: 40, objectFit: 'contain' }} />
                            )}
                          </div>
                        )
                      })}
                      <div ref={logEndRef} />
                    </div>
                  </div>
                </section>
              )}

            </div>
          </div>

          {/* ── Sticky launch bar ─────────────────────────────────────────────── */}
          <div style={{
            flexShrink: 0, borderTop: `1px solid ${HAIR}`,
            background: 'rgba(6,6,8,0.92)', backdropFilter: 'blur(16px)',
            padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 18,
          }}>
            {/* Summary */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 20, color: phoneList.length > 0 ? GOLD : FAINT, lineHeight: 1 }}>{phoneList.length}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: FAINT }}>{lang === 'en' ? 'phones' : 'téléphones'}</span>
              </div>
              <div style={{ width: 1, height: 18, background: HAIR, alignSelf: 'center' }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 20, color: selectedVideos.length > 0 ? GOLD : FAINT, lineHeight: 1 }}>{selectedVideos.length}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: FAINT }}>{lang === 'en' ? 'videos' : 'vidéos'}</span>
              </div>
              {phoneList.length > 0 && (
                <>
                  <div style={{ width: 1, height: 18, background: HAIR, alignSelf: 'center' }} />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 20, color: 'rgba(233,234,240,0.7)', lineHeight: 1 }}>{phoneList.length * CREDIT_COSTS.mass_posting}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: FAINT }}>{lang === 'en' ? 'credits' : 'crédits'}</span>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
              {posting && (
                <button onClick={stop} className="cursor-pointer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '10px 18px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                    background: 'transparent', color: '#F0A0AB', border: `1px solid rgba(240,160,171,0.4)`,
                    transition: 'all 0.18s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,160,171,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8"/></svg>
                  {t('stop')}
                </button>
              )}
              <button onClick={() => setShowScheduleModal(true)} disabled={!canLaunch}
                title={canLaunch ? undefined
                  : !bearer ? 'Connecte GéeLark dans les Paramètres'
                  : phoneList.length === 0 ? 'Sélectionne au moins un téléphone'
                  : selectedVideos.length === 0 ? 'Sélectionne des vidéos dans la banque'
                  : 'Publication en cours…'}
                className="cursor-pointer"
                style={{
                  padding: '10px 18px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                  background: 'transparent', color: canLaunch ? MUTED : FAINT, border: `1px solid ${HAIR}`,
                  opacity: canLaunch ? 1 : 0.4, transition: 'all 0.18s',
                }}
                onMouseEnter={e => { if (canLaunch) { e.currentTarget.style.color = IVORY; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)' } }}
                onMouseLeave={e => { e.currentTarget.style.color = canLaunch ? MUTED : FAINT; e.currentTarget.style.borderColor = HAIR }}>
                {t('schedule')}
              </button>
              <button onClick={post} disabled={!canLaunch}
                title={canLaunch ? undefined
                  : !bearer ? 'Connecte GéeLark dans les Paramètres'
                  : phoneList.length === 0 ? 'Sélectionne au moins un téléphone'
                  : selectedVideos.length === 0 ? 'Sélectionne des vidéos dans la banque'
                  : 'Publication en cours…'}
                className="cursor-pointer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 26px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
                  background: canLaunch ? GOLD : 'rgba(233,234,240,0.08)',
                  color: canLaunch ? '#fff' : FAINT,
                  border: 'none', opacity: posting ? 0.6 : 1, transition: 'all 0.18s',
                }}
                onMouseEnter={e => { if (canLaunch) e.currentTarget.style.background = '#818CF8' }}
                onMouseLeave={e => { if (canLaunch) e.currentTarget.style.background = GOLD }}>
                {posting ? (
                  <><div className="sf-spinner" style={{ width: 12, height: 12 }} />{t('running')}…</>
                ) : (
                  <><svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><polygon points="2.5 1.5 10.5 6 2.5 10.5"/></svg>{t('launch')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Folder picker modal ───────────────────────────────────────────────── */}
      {showFolderPick && (
        <div tabIndex={-1} ref={el => el?.focus()} onKeyDown={e => { if (e.key === 'Escape') setShowFolderPick(false) }} style={{
          position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(6,6,8,0.88)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, outline: 'none',
        }} onClick={() => setShowFolderPick(false)}>
          <div className="anim-scale-in" onClick={e => e.stopPropagation()}
            style={{ width: 340, background: '#0F1014', border: `1px solid ${HAIR}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: `1px solid ${HAIR}` }}>
              <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: IVORY }}>Choisir un dossier</p>
              <button onClick={() => setShowFolderPick(false)} className="cursor-pointer"
                style={{ background: 'none', border: 'none', color: FAINT, display: 'flex', padding: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {folderLoading ? (
              <div style={{ padding: '48px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div className="sf-spinner" />
                <span style={{ fontSize: 13, color: MUTED }}>Chargement…</span>
              </div>
            ) : bankFolders.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: MUTED }}>Aucun dossier dans la banque</div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {bankFolders.map((f, i) => (
                  <button key={f.name} onClick={() => addFolderVideos(f.name)} className="cursor-pointer"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                      textAlign: 'left', background: 'transparent', border: 'none',
                      borderBottom: i < bankFolders.length - 1 ? `1px solid rgba(233,234,240,0.04)` : 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(233,234,240,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{f.count}</span>
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
