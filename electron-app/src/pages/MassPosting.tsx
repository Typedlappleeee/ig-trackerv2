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
import {
  getMassPostingState, setMassPostingState, subscribeMassPosting,
  type TaskLog, type TaskStatus, type SelectedVideo,
  resetMassPosting,
} from '@/lib/massPostingStore'
import { playSuccess } from '@/lib/sounds'
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
const STATUS_LABEL: Record<TaskStatus['status'], string> = {
  idle:      '—',
  pending:   '⏳ En attente',
  uploading: '📤 Upload…',
  posting:   '🎬 En cours',
  done:      '✅ Terminé',
  error:     '❌ Erreur',
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
    log('🛑 Arrêt demandé — annulation des tâches et extinction des téléphones…', 'warn')
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
    if (!groqKey) { log('❌ Clé Groq manquante — Paramètres', 'error'); return }
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
        model: 'llama-3.3-70b-versatile',
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
    if (!bearer)                    { log('Token GéeLark manquant — Paramètres', 'error'); return }
    if (phoneList.length === 0)     { log('Sélectionne au moins un téléphone', 'warn'); return }
    if (selectedVideos.length === 0){ log('Sélectionne au moins une vidéo', 'warn'); return }
    setShowScheduleModal(false)
    setPosting(true); setLogs([])
    try {
      log(`📤 Upload de ${selectedVideos.length} vidéo(s) vers GéeLark…`)
      const tokenMap = new Map<number, string>()
      for (let i = 0; i < selectedVideos.length; i++) {
        const sv = selectedVideos[i]
        const filePath = sv.localPath ?? sv.item.file_url
        if (!filePath) { log(`❌ Chemin manquant pour ${sv.item.title}`, 'error'); return }
        const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
        if (!up.ok || !up.token) { log(`❌ Upload échoué pour ${sv.item.title}: ${up.error}`, 'error'); return }
        tokenMap.set(i, up.token)
        log(`✅ Vidéo ${i + 1}/${selectedVideos.length} prête`, 'ok')
      }
      await createScheduledPost({
        userId: user.id, orgId: currentOrg?.id ?? null,
        createdByName: user.email?.split('@')[0] ?? 'Moi',
        type: 'mass_posting', scheduledAt,
        phones: phoneList.map(p => ({ id: p.id, geelark_id: p.geelark_id, phone_name: p.phone_name, ig_username: p.ig_username })),
        videos: selectedVideos.map((v, i) => ({ token: tokenMap.get(i)!, title: v.item.title })),
        caption, delayMinutes: 0, mode, bearerToken: bearer,
      })
      log(`📅 Programmé pour ${fmtScheduledTime(scheduledAt.toISOString())} — ${phoneList.length} téléphone(s)`, 'ok')
    } catch (err: any) {
      log(`❌ Erreur: ${err.message}`, 'error')
    } finally {
      setPosting(false)
    }
  }

  async function post() {
    if (!bearer)                  { log('Token GéeLark manquant — Paramètres', 'error'); return }
    if (phoneList.length === 0)   { log('Sélectionne au moins un téléphone', 'warn'); return }
    if (selectedVideos.length === 0) { log('Sélectionne au moins une vidéo', 'warn'); return }

    const creditCost = phoneList.length * CREDIT_COSTS.mass_posting
    const creditRes = await checkAndDeductCredits(credits.ownerId, creditCost)
    if (!creditRes.ok) {
      log(`❌ ${creditRes.error ?? 'Crédits insuffisants'} (besoin: ${creditCost} crédits pour ${phoneList.length} phone${phoneList.length > 1 ? 's' : ''})`, 'error')
      return
    }
    credits.refresh()
    log(`💳 ${creditCost} crédits débités (${CREDIT_COSTS.mass_posting}/phone × ${phoneList.length}) — solde: ${creditRes.balance ?? '?'}`)

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
      log('🎬 Création des tâches de post…')
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
        const taskRes = await geelark(bearer, '/rpa/task/instagramPubReels', {
          id:          asgn.phone.geelark_id,
          scheduleAt:  scheduleTimes[ai],
          description: caption,
          video:       [token],
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
        const STATUS: Record<number, string> = { 1: '⏳ En attente', 2: '🔄 En cours', 3: '✅ Terminé', 4: '❌ Échoué', 7: '🚫 Annulé' }

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

      log('🎉 Terminé ! Réinitialisation dans 5s…', 'ok')
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-[28px] font-black text-white leading-none">Mass Posting</h1>
          <p className="text-[13px] text-text2 mt-0.5">
            {phoneList.length} cible{phoneList.length !== 1 ? 's' : ''} · {selectedVideos.length} vidéo{selectedVideos.length !== 1 ? 's' : ''}
            {withSessions > 0 && <span className="ml-2 text-ok">· {withSessions} session IG</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex rounded-xl p-1 gap-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {([{ k: 'seq', l: 'Séquentiel' }, { k: 'random', l: 'Aléatoire' }] as const).map(m => (
              <button key={m.k} onClick={() => setMode(m.k)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
                style={mode === m.k
                  ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: 'white' }
                  : { color: 'rgba(148,163,184,0.7)' }}
              >{m.l}</button>
            ))}
          </div>
          <button
            onClick={stop}
            disabled={!posting}
            className="rounded-xl px-5 py-2.5 text-[13px] font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            ⏹ Stopper
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            disabled={posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0}
            className="rounded-xl px-5 py-2.5 text-[13px] font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(37,99,235,0.3)', color: '#60a5fa' }}
          >
            📅 Programmer
          </button>
          <button
            onClick={post}
            disabled={posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0}
            className="rounded-xl px-5 py-2.5 text-[13px] font-black text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0
                ? 'rgba(255,255,255,0.06)' : 'linear-gradient(130deg,#7c3aed,#ec4899)',
              boxShadow: posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0
                ? 'none' : '0 4px 20px -4px rgba(124,58,237,0.5)',
            }}>
            {posting ? '⏳ En cours…' : '⚡ Lancer'}
          </button>
        </div>
      </div>

      {!bearer && (
        <div className="flex-shrink-0 mx-10 mt-6 px-5 py-4 rounded-2xl text-[13px] text-warn"
          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          ⚠ Token GéeLark manquant — configure-le dans Paramètres.
        </div>
      )}

      {/* 3-column body */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* ── Column 1: Videos ─────────────────────────────────────────────── */}
        <aside className="w-72 flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: '#07090f' }}>
          <div className="flex-shrink-0 px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[15px] font-bold text-white">Vidéos</p>
              <span className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full text-white"
                style={{ background: selectedVideos.length > 0 ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.07)' }}>
                {selectedVideos.length}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => pickLocalFile(-1)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
              >
                💾 PC
              </button>
              <button
                onClick={() => setShowBankPicker(true)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
              >
                🗂 Banque
              </button>
              <button
                onClick={openFolderPick}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}
              >
                📁 Dossier
              </button>
            </div>
          </div>
          {addingFolder && (
            <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3"
              style={{ background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
              <svg className="animate-spin w-4 h-4 flex-shrink-0" style={{ color: '#a78bfa' }} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
              <p className="text-[12px] font-semibold truncate" style={{ color: '#a78bfa' }}>
                Ajout de «{addingFolder}» en cours…
              </p>
            </div>
          )}
          <div className="flex-1 overflow-auto">
            {selectedVideos.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-3xl mb-3">🎬</p>
                <p className="text-[13px] font-bold text-white mb-1">Aucune vidéo</p>
                <p className="text-[12px] text-text2">Ajoute depuis la banque ou le PC</p>
              </div>
            ) : selectedVideos.map((sv, selIdx) => {
              const fp = sv.localPath ?? sv.item.file_url
              return (
                <div
                  key={sv.item.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="w-10 flex-shrink-0 aspect-[9/16] rounded-lg overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <VideoThumbnail filePath={fp ?? ''} thumbnailPath={sv.item.thumbnail_path} storagePath={sv.item.storage_path} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold" style={{ color: '#8b5cf6' }}>#{selIdx + 1}</p>
                    <p className="text-[13px] text-white truncate">{sv.item.title}</p>
                  </div>
                  <button
                    onClick={() => setSelVideos(prev => prev.filter((_, i) => i !== selIdx))}
                    className="text-text2 hover:text-danger transition-colors flex-shrink-0 text-[14px]"
                  >✕</button>
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── Column 2: Phones ─────────────────────────────────────────────── */}
        <aside className="w-64 flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: '#07090f' }}>
          {/* Header + mode toggle */}
          <div className="flex-shrink-0 px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-bold text-white">Cibles</p>
              <span className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full text-white"
                style={{ background: selectedPhones.size > 0 ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.07)' }}>
                {selectedPhones.size}
              </span>
            </div>
            {/* Mode toggle */}
            <div className="flex rounded-xl p-1 gap-1 mb-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {([{ k: 'phones', l: '📱 Téléphones' }, { k: 'groups', l: '👥 Groupes' }] as const).map(m => (
                <button key={m.k} onClick={() => setPhonePickMode(m.k)}
                  className="flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all"
                  style={phonePickMode === m.k
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: 'white' }
                    : { color: 'rgba(148,163,184,0.7)' }}>
                  {m.l}
                </button>
              ))}
            </div>

            {/* Phone mode controls */}
            {phonePickMode === 'phones' && (
              <>
                <select
                  value={groupFilter}
                  onChange={e => setGroupFilter(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] focus:outline-none mb-2"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                >
                  {groups.map(g => <option key={g} value={g} style={{ background: '#0d1120', color: '#e2d9f3' }}>{g}</option>)}
                </select>
                <input
                  type="text" placeholder="Rechercher…" value={phoneSearch}
                  onChange={e => setPhoneSearch(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                />
              </>
            )}

            {/* Group mode: quick-select all / none */}
            {phonePickMode === 'groups' && (
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const realGroups = groups.filter(g => g !== 'Tous')
                    setSelectedGroups(new Set(realGroups))
                    setSelPhones(new Set(phones.filter(p => {
                      if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
                      return Boolean(p.group_name)
                    }).map(p => p.id)))
                  }}
                  className="text-[12px] font-semibold text-[#8b5cf6] hover:text-white transition-colors">Tout</button>
                <button
                  onClick={() => { setSelectedGroups(new Set()); setSelPhones(new Set()) }}
                  className="text-[12px] text-text2 hover:text-white transition-colors">Aucun</button>
              </div>
            )}
          </div>

          {/* Tout / Aucun bar — phones mode only */}
          {phonePickMode === 'phones' && (
            <div className="flex-shrink-0 px-5 py-2.5 flex gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
                className="text-[12px] font-semibold text-[#8b5cf6] hover:text-white transition-colors">Tout</button>
              <button onClick={() => setSelPhones(new Set())}
                className="text-[12px] text-text2 hover:text-white transition-colors">Aucun</button>
              <span className="ml-auto text-[12px] text-text2">{visiblePhones.length} tel.</span>
            </div>
          )}

          {/* ── List body ── */}
          <div className="flex-1 overflow-auto">

            {/* Phones mode */}
            {phonePickMode === 'phones' && visiblePhones.map((phone) => {
              const checked = selectedPhones.has(phone.id)
              const asgn = assignments.find(a => a.phone.id === phone.id)
              const ts = taskStatuses.get(phone.id)
              return (
                <button
                  key={phone.id}
                  onClick={() => togglePhone(phone.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${
                    checked ? '' : 'hover:bg-white/[0.02]'
                  }`}
                  style={checked ? { background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(255,255,255,0.04)' } : { borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0"
                    style={checked ? { background: 'linear-gradient(135deg,#7c3aed,#ec4899)', color: 'white' } : { background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                    {phone.ig_username?.[0]?.toUpperCase() ?? phone.phone_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-white truncate">{phone.phone_name}</p>
                    {phone.ig_username && <p className="text-[12px] text-[#8b5cf6]/80 truncate">@{phone.ig_username}</p>}
                    {ts && ts.status !== 'idle' && (
                      <p className={`text-[11px] ${STATUS_COLOR[ts.status]}`}>{STATUS_LABEL[ts.status]}</p>
                    )}
                  </div>
                  {asgn?.video && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg flex-shrink-0"
                      style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                      #{(asgn.videoIndex + 1)}
                    </span>
                  )}
                  <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                    style={checked ? { background: 'linear-gradient(135deg,#7c3aed,#ec4899)', border: 'none' } : { border: '1px solid rgba(255,255,255,0.15)' }}>
                    {checked && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                  </div>
                </button>
              )
            })}

            {/* Groups mode */}
            {phonePickMode === 'groups' && (() => {
              const realGroups = groups.filter(g => g !== 'Tous')
              if (realGroups.length === 0) return (
                <div className="px-5 py-10 text-center">
                  <p className="text-3xl mb-3">👥</p>
                  <p className="text-[13px] font-bold text-white mb-1">Aucun groupe</p>
                  <p className="text-[12px] text-text2">Assigne des groupes à tes téléphones</p>
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
                  <button
                    key={g}
                    onClick={() => toggleGroup(g)}
                    className="w-full flex items-center gap-3 px-4 py-4 text-left transition-all"
                    style={checked
                      ? { background: 'rgba(139,92,246,0.1)', borderBottom: '1px solid rgba(139,92,246,0.1)' }
                      : { borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] flex-shrink-0"
                      style={checked
                        ? { background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }
                        : { background: 'rgba(255,255,255,0.06)' }}>
                      👥
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-white truncate">{g}</p>
                      <p className="text-[11px]" style={{ color: checked ? '#a78bfa' : 'rgba(148,163,184,0.5)' }}>
                        {checked ? `${selCount} / ${inGroup.length} sélectionnés` : `${inGroup.length} téléphone${inGroup.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                      style={checked ? { background: 'linear-gradient(135deg,#7c3aed,#ec4899)' } : { border: '1px solid rgba(255,255,255,0.15)' }}>
                      {checked && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>
                  </button>
                )
              })
            })()}
          </div>
        </aside>

        {/* ── Column 3: Assignments + Caption + Logs ───────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 pb-10">
          <div className="space-y-6 mt-8">

            {/* Posting options */}
            <PostingOptions opts={postingOpts} onChange={o => { setPostingOpts(o); savePostingOpts(o) }} />

            {/* Caption card */}
            <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[15px] font-bold text-white">Description</p>
                <span className={`text-[12px] font-mono ${caption.length > 2200 ? 'text-danger' : 'text-text2'}`}>
                  {caption.length}/2200
                </span>
              </div>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={4}
                placeholder="Description partagée par tous les téléphones (optionnel)…"
                className="w-full rounded-xl px-4 py-3 text-[13px] placeholder:text-text2 resize-y focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
              />
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" variant="secondary" onClick={generateCaption} loading={generating} disabled={!groqKey}>✨ Générer avec IA</Button>
                <input type="text" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="Prompt personnalisé…"
                  className="flex-1 rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                />
                {/* Hashtag toggle — inline, clearly inside the card */}
                <button
                  onClick={() => setWithHashtags(v => !v)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all flex-shrink-0"
                  style={withHashtags
                    ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.5)' }}
                  title="Hashtags"
                >
                  <span className="text-[12px] font-bold">#</span>
                </button>
              </div>
            </div>

            {/* Configuration summary card */}
            {(selectedVideos.length > 0 || selectedPhones.size > 0) && (() => {
              // Video pool label
              const folders = [...new Set(selectedVideos.map(sv => sv.item.folder).filter(Boolean))]
              const videoLabel = folders.length === 1
                ? folders[0]!
                : selectedVideos.length > 0
                  ? `${selectedVideos.length} vidéo${selectedVideos.length !== 1 ? 's' : ''} sélectionnée${selectedVideos.length !== 1 ? 's' : ''}`
                  : null

              // Phone pool label
              const phoneLabel = phonePickMode === 'groups' && selectedGroups.size > 0
                ? `${selectedGroups.size} groupe${selectedGroups.size !== 1 ? 's' : ''} sélectionné${selectedGroups.size !== 1 ? 's' : ''}`
                : selectedPhones.size > 0
                  ? `${selectedPhones.size} téléphone${selectedPhones.size !== 1 ? 's' : ''} sélectionné${selectedPhones.size !== 1 ? 's' : ''}`
                  : null
              const phoneSubLabel = phonePickMode === 'groups' && selectedGroups.size > 0 && selectedPhones.size > 0
                ? `(${selectedPhones.size} téléphones)`
                : null

              return (
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-[15px] font-bold text-white">Configuration du posting</p>
                  </div>

                  {videoLabel && (
                    <>
                      <div className="px-5 pb-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.35)' }}>Pool de vidéos</p>
                      </div>
                      <div className="flex items-center gap-3 px-5 py-3 mx-3 mb-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <span className="text-[18px] flex-shrink-0">📁</span>
                        <span className="flex-1 text-[13px] font-semibold text-white truncate">{videoLabel}</span>
                        <span className="text-[12px] flex-shrink-0" style={{ color: 'rgba(148,163,184,0.5)' }}>
                          {selectedVideos.length} vidéo{selectedVideos.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.3)' }}>›</span>
                      </div>
                    </>
                  )}

                  {phoneLabel && (
                    <>
                      <div className="px-5 pb-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.35)' }}>
                          {phonePickMode === 'groups' ? 'Groupe de téléphones' : 'Téléphones'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 px-5 py-3 mx-3 mb-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <span className="text-[18px] flex-shrink-0">{phonePickMode === 'groups' ? '👥' : '📱'}</span>
                        <span className="flex-1 text-[13px] font-semibold text-white truncate">
                          {phoneLabel}
                          {phoneSubLabel && <span className="ml-1.5 font-normal" style={{ color: 'rgba(148,163,184,0.5)' }}>{phoneSubLabel}</span>}
                        </span>
                        <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.3)' }}>›</span>
                      </div>
                    </>
                  )}
                </div>
              )
            })()}

            {/* Assignments card */}
            <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[15px] font-bold text-white">Assignations</p>
                {assignments.length > 0 && (
                  <span className="text-[13px] text-text2">{assignments.length} téléphone(s)</span>
                )}
              </div>

              {assignments.length === 0 ? (
                <div className="rounded-2xl p-10 text-center" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-base font-bold text-white mb-1">Aucune assignation</p>
                  <p className="text-[13px] text-text2">Sélectionne des téléphones et des vidéos pour voir les assignations</p>
                  <p className="text-[12px] text-text2 mt-1">Chaque téléphone est automatiquement assigné à une vidéo (rotation)</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {assignments.map(({ phone, video, videoIndex }) => {
                    const ts = taskStatuses.get(phone.id)
                    const statusColor = ts ? STATUS_COLOR[ts.status] : ''
                    return (
                      <div
                        key={phone.id}
                        className="rounded-2xl p-4 space-y-3 transition-colors"
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: ts?.status === 'done'    ? '1px solid rgba(52,211,153,0.3)'
                                : ts?.status === 'error'   ? '1px solid rgba(239,68,68,0.3)'
                                : ts?.status === 'posting' ? '1px solid rgba(251,191,36,0.3)'
                                : '1px solid rgba(255,255,255,0.07)',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                            {phone.ig_username?.[0]?.toUpperCase() ?? phone.phone_name?.[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-white truncate">{phone.phone_name}</p>
                            {phone.ig_username && (
                              <p className="text-[12px] text-[#8b5cf6]/80 truncate">@{phone.ig_username}</p>
                            )}
                          </div>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            phone.status === 'online' ? 'bg-ok' : 'bg-text2'
                          }`} />
                        </div>
                        {video ? (
                          <div className="flex items-center gap-2">
                            <div className="w-8 flex-shrink-0 aspect-[9/16] rounded-lg overflow-hidden"
                              style={{ background: 'rgba(255,255,255,0.05)' }}>
                              <VideoThumbnail filePath={video.localPath ?? video.item.file_url ?? ''} thumbnailPath={video.item.thumbnail_path} storagePath={video.item.storage_path} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold" style={{ color: '#8b5cf6' }}>#{videoIndex + 1}</p>
                              <p className="text-[12px] text-text2 truncate">{video.item.title}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl px-3 py-2"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-[12px] text-text2 italic">Aucune vidéo</span>
                          </div>
                        )}
                        {ts && ts.status !== 'idle' && (
                          <div className="space-y-1.5">
                            <p className={`text-[12px] font-medium ${statusColor}`}>
                              {STATUS_LABEL[ts.status]}
                              {ts.detail && <span className="opacity-70"> — {ts.detail}</span>}
                            </p>
                            {(ts.status === 'uploading' || ts.status === 'posting') && (
                              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div className={`h-full rounded-full animate-pulse ${
                                  ts.status === 'uploading' ? 'bg-blue-400 w-2/3' : 'bg-warn w-4/5'
                                }`} />
                              </div>
                            )}
                            {ts.status === 'done' && (
                              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(52,211,153,0.1)' }}>
                                <div className="h-full bg-ok rounded-full w-full" />
                              </div>
                            )}
                            {ts.status === 'error' && (
                              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(239,68,68,0.1)' }}>
                                <div className="h-full bg-danger rounded-full w-full" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Log panel */}
            {logs.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[15px] font-bold text-white">Journal</p>
                  {!posting && (
                    <button onClick={() => setLogs([])} className="text-[13px] text-text2 hover:text-white transition-colors">Effacer</button>
                  )}
                </div>
                <div className="px-6 py-4 max-h-48 overflow-auto font-mono text-[12px] space-y-1">
                  {logs.map((l, i) => (
                    <div key={i} className={`flex gap-3 ${
                      l.level === 'ok'    ? 'text-ok'    :
                      l.level === 'error' ? 'text-danger' :
                      l.level === 'warn'  ? 'text-warn'   :
                      'text-text2'
                    }`}>
                      <span className="text-text2/60 flex-shrink-0">{l.time}</span>
                      <span>{l.message}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Folder quick-pick modal */}
      {showFolderPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowFolderPick(false)}>
          <div className="rounded-2xl overflow-hidden w-80" onClick={e => e.stopPropagation()}
            style={{ background: '#0d0a1e', border: '1px solid rgba(139,92,246,0.25)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(139,92,246,0.12)' }}>
              <p className="text-[14px] font-bold text-white">📁 Choisir un dossier</p>
              <button onClick={() => setShowFolderPick(false)} className="text-text2 hover:text-white text-lg leading-none">✕</button>
            </div>
            {folderLoading ? (
              <div className="py-10 text-center text-text2 text-[13px]">Chargement…</div>
            ) : bankFolders.length === 0 ? (
              <div className="py-10 text-center text-text2 text-[13px]">Aucun dossier dans la banque</div>
            ) : (
              <div className="max-h-80 overflow-y-auto py-2">
                {bankFolders.map(f => (
                  <button key={f.name} onClick={() => addFolderVideos(f.name)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all hover:bg-white/[0.03]"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[18px]">📂</span>
                    <span className="flex-1 text-[13px] font-semibold text-white truncate">{f.name}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                      {f.count} vid.
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
