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

  // Extra config state (UI only — wired into postingOpts or ignored by logic)
  const [videoRandom,    setVideoRandom]    = useState(true)
  const [avoidRecent,    setAvoidRecent]    = useState(true)
  const [limitPerVideo,  setLimitPerVideo]  = useState(1)
  const [minDuration,    setMinDuration]    = useState(5)
  const [maxDuration,    setMaxDuration]    = useState(60)
  const [intervalRandom, setIntervalRandom] = useState(true)
  const [publishOptimal, setPublishOptimal] = useState(false)
  const [ignoreErrors,   setIgnoreErrors]   = useState(true)
  const [maxConsecFails, setMaxConsecFails] = useState(5)
  const [randomDescs,    setRandomDescs]    = useState(false)
  const [cycleDelay,     setCycleDelay]     = useState(10)
  const [limitPerDay,    setLimitPerDay]    = useState(3)
  const [pauseAfterN,    setPauseAfterN]    = useState(10)
  const [pauseDurMin,    setPauseDurMin]    = useState(5)
  const [dragOver,       setDragOver]       = useState(false)

  // Computed stats
  const doneCount  = [...taskStatuses.values()].filter(t => t.status === 'done').length
  const errorCount = [...taskStatuses.values()].filter(t => t.status === 'error').length
  const inProgCount = [...taskStatuses.values()].filter(t => t.status === 'posting' || t.status === 'uploading').length
  const totalTasks = phoneList.length
  const progress   = totalTasks > 0 ? Math.round((doneCount + errorCount) / totalTasks * 100) : 0

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => /\.(mp4|mov|avi|mkv|webm)$/i.test(f.name))
    for (const file of files) {
      const fake: import('@/lib/supabase').ContentItem = {
        id: `local-${Date.now()}-${Math.random()}`, user_id: user.id, org_id: null, folder: null,
        title: file.name, file_url: URL.createObjectURL(file), storage_path: null,
        thumbnail_path: null, thumbnail_url: null, duration: null, tags: [], notes: '',
        used_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      setSelVideos(prev => [...prev, { item: fake, localPath: (file as any).path ?? null }])
    }
  }

  const canLaunch = !posting && !!bearer && phoneList.length > 0 && selectedVideos.length > 0

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#07070B' }}>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-6 pb-5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>
            <h1 className="text-[22px] font-black text-white leading-none">Mass Posting</h1>
            <p className="text-[12px] mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>Diffusez plusieurs vidéos sur plusieurs comptes automatiquement</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(196,181,253,0.7)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 16v-4m0-4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Mode d'emploi
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(196,181,253,0.7)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2"/><polyline points="17 21 17 13 7 13 7 21" stroke="currentColor" strokeWidth="2"/><polyline points="7 3 7 8 15 8" stroke="currentColor" strokeWidth="2"/></svg>
            Enregistrer comme modèle
          </button>
          {posting && (
            <button onClick={stop}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              ⏹ Stopper
            </button>
          )}
          <button onClick={() => setShowScheduleModal(true)}
            disabled={posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }}>
            📅 Programmer
          </button>
          <button onClick={post} disabled={!canLaunch}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[14px] font-black text-white transition-all active:scale-[0.97] disabled:opacity-40"
            style={{ background: canLaunch ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.06)', boxShadow: canLaunch ? '0 4px 20px rgba(124,58,237,0.4)' : 'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M5 3l14 9-14 9V3z"/></svg>
            {posting ? 'En cours…' : 'Lancer le posting'}
          </button>
        </div>
      </div>

      {/* ── Stats bar ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-stretch" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(14,14,22,0.6)' }}>
        {[
          { icon: '🎬', value: `${selectedVideos.length} / ${selectedVideos.length}`, label: 'VIDÉOS SÉLECTIONNÉES' },
          { icon: '📱', value: String(selectedPhones.size), label: 'CIBLES SÉLECTIONNÉES' },
          { icon: '📋', value: String(totalTasks), label: 'DANS LA FILE' },
          { icon: '⏱', value: totalTasks > 0 ? `${Math.ceil(totalTasks * (postingOpts.intervalMin ?? 30) / 60)}min` : '--:--:--', label: 'DURÉE ESTIMÉE' },
          { icon: null, value: `${progress}%`, label: 'PROGRESSION GLOBALE', progress: true },
        ].map((s, i) => (
          <div key={i} className={`flex-1 px-6 py-4 flex items-center gap-3 ${i < 4 ? 'border-r' : ''}`}
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {s.icon && <span className="text-[20px] opacity-60">{s.icon}</span>}
            {s.progress && (
              <div className="w-8 h-8 flex-shrink-0 relative">
                <svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="3"/><circle cx="16" cy="16" r="12" fill="none" stroke="#7c3aed" strokeWidth="3" strokeDasharray={`${progress * 0.754} 75.4`} strokeLinecap="round" transform="rotate(-90 16 16)"/></svg>
              </div>
            )}
            <div>
              <p className="text-[20px] font-black text-white leading-none">{s.value}</p>
              <p className="text-[10px] font-bold tracking-widest mt-0.5" style={{ color: 'rgba(148,163,184,0.45)' }}>{s.label}</p>
              {s.progress && progress > 0 && (
                <div className="w-full h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: 'rgba(139,92,246,0.15)', minWidth: 80 }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {!bearer && (
        <div className="flex-shrink-0 mx-6 mt-4 px-4 py-3 rounded-xl text-[13px] text-warn flex items-center gap-2"
          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <span>⚠</span> Token GéeLark manquant — configure-le dans Paramètres.
        </div>
      )}

      {/* ── 4-column body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* ═══ COL 1: SÉLECTION DES VIDÉOS ══════════════════════════════════ */}
          <div className="w-[280px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black px-2 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>1</span>
                <p className="text-[13px] font-bold text-white">SÉLECTION DES VIDÉOS</p>
              </div>
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: selectedVideos.length > 0 ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', color: selectedVideos.length > 0 ? '#a78bfa' : 'rgba(148,163,184,0.4)' }}>
                {selectedVideos.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {/* Drag & drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => pickLocalFile(-1)}
                className="rounded-xl flex flex-col items-center justify-center gap-2 py-7 cursor-pointer transition-all"
                style={{ border: `2px dashed ${dragOver ? '#7c3aed' : 'rgba(139,92,246,0.25)'}`, background: dragOver ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.02)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <p className="text-[13px] font-bold text-white text-center">Glissez vos vidéos ici</p>
                <p className="text-[11px] text-center" style={{ color: '#a78bfa' }}>ou <span className="underline">cliquez pour parcourir</span></p>
                <p className="text-[10px] text-center" style={{ color: 'rgba(148,163,184,0.35)' }}>Formats acceptés : MP4, MOV, AVI · Taille max : 2GB</p>
              </div>

              {/* Source buttons */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                {[
                  { icon: '🗂', label: 'Banque de vidéos', count: selectedVideos.filter(v => !v.localPath).length, onClick: () => setShowBankPicker(true) },
                  { icon: '📁', label: 'Dossier', count: 0, onClick: openFolderPick },
                  { icon: '⭐', label: 'Favoris', count: 0, onClick: () => {} },
                ].map((src, i) => (
                  <button key={i} onClick={src.onClick}
                    className="w-full flex items-center gap-3 px-4 py-2.5 transition-all hover:bg-white/[0.03]"
                    style={{ borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <span className="text-[15px]">{src.icon}</span>
                    <span className="flex-1 text-[13px] font-semibold text-white text-left">{src.label}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.5)' }}>{src.count}</span>
                  </button>
                ))}
              </div>

              {addingFolder && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a78bfa' }} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
                  <p className="text-[11px] font-semibold truncate" style={{ color: '#a78bfa' }}>Ajout «{addingFolder}»…</p>
                </div>
              )}

              {/* Video params */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="#a78bfa" strokeWidth="2"/></svg>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(196,181,253,0.5)' }}>Paramètres vidéos</p>
                </div>
                {[
                  { label: 'Utiliser les vidéos aléatoirement', val: videoRandom, set: setVideoRandom },
                  { label: 'Éviter les vidéos récemment utilisées ℹ', val: avoidRecent, set: setAvoidRecent },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[12px] text-white">{row.label}</span>
                    <button onClick={() => row.set(v => !v)} className="w-9 h-5 rounded-full relative flex-shrink-0 transition-all"
                      style={{ background: row.val ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.1)' }}>
                      <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${row.val ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="text-[12px] text-white">Limiter à</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={99} value={limitPerVideo} onChange={e => setLimitPerVideo(Number(e.target.value))}
                      className="w-12 rounded-lg px-2 py-1 text-[12px] font-bold text-center text-white focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                    <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>utilisation(s) / vidéo</span>
                  </div>
                </div>
                {[
                  { label: 'Durée min.', val: minDuration, set: setMinDuration, unit: 'sec' },
                  { label: 'Durée max.', val: maxDuration, set: setMaxDuration, unit: 'sec' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: i === 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <span className="text-[12px] text-white">{row.label}</span>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} max={999} value={row.val} onChange={e => row.set(Number(e.target.value))}
                        className="w-16 rounded-lg px-2 py-1 text-[12px] font-bold text-center text-white focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                      <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>{row.unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Conseil */}
              {selectedVideos.length === 0 && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0"><circle cx="12" cy="12" r="10" stroke="#818cf8" strokeWidth="2"/><path d="M12 16v-4m0-4h.01" stroke="#818cf8" strokeWidth="2" strokeLinecap="round"/></svg>
                  <p className="text-[11px] leading-relaxed" style={{ color: '#818cf8' }}>
                    <span className="font-bold">Conseil :</span> Ajoutez plusieurs vidéos pour maximiser la variété et éviter la détection.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ═══ COL 2: CIBLES ═════════════════════════════════════════════════ */}
          <div className="w-[260px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black px-2 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>2</span>
                <p className="text-[13px] font-bold text-white">CIBLES</p>
              </div>
            </div>

            <div className="flex-shrink-0 px-4 pt-3 pb-2 space-y-2">
              {/* Tab toggle */}
              <div className="flex rounded-xl p-1 gap-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {([{ k: 'phones', l: 'Téléphones' }, { k: 'groups', l: 'Groupes' }] as const).map(m => (
                  <button key={m.k} onClick={() => setPhonePickMode(m.k)}
                    className="flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all"
                    style={phonePickMode === m.k ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: 'white' } : { color: 'rgba(148,163,184,0.7)' }}>
                    {m.l}
                  </button>
                ))}
              </div>
              {phonePickMode === 'phones' && (
                <>
                  <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
                    {groups.map(g => <option key={g} value={g} style={{ background: '#0d1120', color: '#e2d9f3' }}>{g}</option>)}
                  </select>
                  <div className="relative">
                    <svg width="13" height="13" className="absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="rgba(148,163,184,0.4)" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="rgba(148,163,184,0.4)" strokeWidth="2" strokeLinecap="round"/></svg>
                    <input type="text" placeholder="Rechercher..." value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
                      className="w-full rounded-xl pl-8 pr-3 py-2 text-[12px] placeholder:text-text2 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }} />
                  </div>
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
            {/* Phones header row */}
            {phonePickMode === 'phones' && (
              <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.4)' }}>
                  TÉLÉPHONES ({visiblePhones.length})
                </p>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.4)' }}>ÉTAT</p>
              </div>
            )}
            {phonePickMode === 'groups' && (
              <div className="flex gap-4 px-4 pb-2">
                <button onClick={() => { const rg = groups.filter(g => g !== 'Tous'); setSelectedGroups(new Set(rg)); setSelPhones(new Set(phones.filter(p => { if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false; return Boolean(p.group_name) }).map(p => p.id))) }}
                  className="text-[12px] font-semibold" style={{ color: '#8b5cf6' }}>Tout</button>
                <button onClick={() => { setSelectedGroups(new Set()); setSelPhones(new Set()) }}
                  className="text-[12px]" style={{ color: 'rgba(148,163,184,0.5)' }}>Aucun</button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {phonePickMode === 'phones' && visiblePhones.map(phone => {
              const checked = selectedPhones.has(phone.id)
              const ts = taskStatuses.get(phone.id)
              return (
                <button key={phone.id} onClick={() => togglePhone(phone.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: checked ? 'rgba(139,92,246,0.06)' : 'transparent', borderLeft: checked ? '2px solid #7c3aed' : '2px solid transparent' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
                    style={checked ? { background: 'linear-gradient(135deg,#7c3aed,#ec4899)', color: 'white' } : { background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                    {phone.ig_username?.[0]?.toUpperCase() ?? phone.phone_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-white truncate">{phone.phone_name}</p>
                    {phone.ig_username && <p className="text-[10px] truncate" style={{ color: 'rgba(139,92,246,0.7)' }}>@{phone.ig_username}</p>}
                  </div>
                  {ts && ts.status !== 'idle' ? (
                    <span className="text-[10px] font-semibold flex-shrink-0"
                      style={{ color: ts.status === 'done' ? '#34d399' : ts.status === 'error' ? '#f87171' : ts.status === 'posting' ? '#fbbf24' : '#a78bfa' }}>
                      {STATUS_LABEL[ts.status]}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: phone.status === 'online' ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)', color: phone.status === 'online' ? '#34d399' : 'rgba(148,163,184,0.4)' }}>
                      {phone.status === 'online' ? 'En ligne' : 'Hors ligne'}
                    </span>
                  )}
                </button>
              )
            })}
            {phonePickMode === 'groups' && (() => {
              const realGroups = groups.filter(g => g !== 'Tous')
              if (!realGroups.length) return (
                <div className="px-4 py-8 text-center">
                  <p className="text-2xl mb-2">👥</p>
                  <p className="text-[12px] font-bold text-white">Aucun groupe</p>
                </div>
              )
              return realGroups.map(g => {
                const inGroup = phones.filter(p => { if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false; return p.group_name === g })
                const checked = selectedGroups.has(g)
                const selCount = inGroup.filter(p => selectedPhones.has(p.id)).length
                return (
                  <button key={g} onClick={() => toggleGroup(g)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: checked ? 'rgba(139,92,246,0.06)' : 'transparent', borderLeft: checked ? '2px solid #7c3aed' : '2px solid transparent' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px] flex-shrink-0"
                      style={checked ? { background: 'linear-gradient(135deg,#7c3aed,#ec4899)' } : { background: 'rgba(255,255,255,0.06)' }}>👥</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-white truncate">{g}</p>
                      <p className="text-[10px]" style={{ color: checked ? '#a78bfa' : 'rgba(148,163,184,0.4)' }}>
                        {checked ? `${selCount}/${inGroup.length} sélectionnés` : `${inGroup.length} tél.`}
                      </p>
                    </div>
                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={checked ? { background: 'linear-gradient(135deg,#7c3aed,#ec4899)' } : { border: '1px solid rgba(255,255,255,0.15)' }}>
                      {checked && <span className="text-white text-[8px] font-bold">✓</span>}
                    </div>
                  </button>
                )
              })
            })()}
          </div>

          {/* Tout sélectionner bar */}
          {phonePickMode === 'phones' && (
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
                className="text-[13px] font-semibold px-4 py-2 rounded-xl transition-all"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                Tout sélectionner
              </button>
              <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.5)' }}>{selectedPhones.size} sélectionné(s)</span>
            </div>
          )}
        </div>

        {/* ═══ COL 3: CONFIGURATION DU POSTING ══════════════════════════════ */}
        <div className="w-[310px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex-shrink-0 flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>3</span>
            <p className="text-[13px] font-bold text-white">CONFIGURATION DU POSTING</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Comportement */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(148,163,184,0.4)' }}>Comportement</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { k: 'seq',      l: 'Séquentiel', desc: 'Publie vidéo par vidéo sur chaque compte' },
                  { k: 'random',   l: 'Aléatoire',  desc: 'Publie aléatoirement sur les comptes disponibles' },
                  { k: 'advanced', l: 'Avancé',      desc: 'Options avancées de distribution' },
                ] as const).map(b => (
                  <button key={b.k} onClick={() => setMode(b.k === 'advanced' ? 'seq' : b.k)}
                    className="rounded-xl p-3 text-left transition-all"
                    style={{
                      background: (b.k === 'advanced' ? false : mode === b.k) ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${(b.k === 'advanced' ? false : mode === b.k) ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                    {(b.k === 'advanced' ? false : mode === b.k) && (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center mb-2" style={{ background: 'rgba(99,102,241,0.8)' }}>
                        <span className="text-white text-[8px] font-black">✓</span>
                      </div>
                    )}
                    {b.k === 'advanced' && <span className="text-[15px] mb-1 block">⚙</span>}
                    {b.k !== 'advanced' && !(mode === b.k) && <div className="w-4 h-4 rounded-full mb-2" style={{ border: '1px solid rgba(255,255,255,0.2)' }} />}
                    <p className="text-[11px] font-bold text-white leading-tight">{b.l}</p>
                    <p className="text-[10px] mt-1 leading-tight" style={{ color: 'rgba(148,163,184,0.45)' }}>{b.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Intervalle entre posts */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <p className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.4)' }}>Intervalle entre posts</p>
              <div className="px-4 py-3 flex items-center gap-2">
                <span className="text-[12px] text-white">Entre chaque post</span>
                <input type="number" min={0} value={postingOpts.intervalMin ?? 30}
                  onChange={e => { const o = { ...postingOpts, intervalMin: Number(e.target.value) }; setPostingOpts(o); savePostingOpts(o) }}
                  className="w-14 rounded-lg px-2 py-1 text-[12px] font-bold text-white text-center focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.5)' }}>à</span>
                <input type="number" min={0} value={postingOpts.intervalMax ?? 90}
                  onChange={e => { const o = { ...postingOpts, intervalMax: Number(e.target.value) }; setPostingOpts(o); savePostingOpts(o) }}
                  className="w-14 rounded-lg px-2 py-1 text-[12px] font-bold text-white text-center focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.5)' }}>secondes</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-[12px] text-white">Intervalle aléatoire :</span>
                <button onClick={() => setIntervalRandom(v => !v)} className="w-9 h-5 rounded-full relative transition-all"
                  style={{ background: intervalRandom ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.1)' }}>
                  <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${intervalRandom ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>
            </div>

            {/* Paramètres avancés */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <p className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.4)' }}>Paramètres avancés</p>
              {[
                { label: 'Publier aux heures optimales', val: publishOptimal, set: setPublishOptimal },
                { label: 'Ignorer comptes en erreur', val: ignoreErrors, set: setIgnoreErrors },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="text-[12px] text-white">{row.label}</span>
                  <button onClick={() => row.set(v => !v)} className="w-9 h-5 rounded-full relative transition-all"
                    style={{ background: row.val ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.1)' }}>
                    <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${row.val ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-[12px] text-white">Arrêter si échec consécutif :</span>
                <input type="number" min={1} value={maxConsecFails} onChange={e => setMaxConsecFails(Number(e.target.value))}
                  className="w-12 rounded-lg px-2 py-1 text-[12px] font-bold text-white text-center focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
              </div>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-[12px] text-white">Utiliser descriptions aléatoires ℹ</span>
                <button onClick={() => setRandomDescs(v => !v)} className="w-9 h-5 rounded-full relative transition-all"
                  style={{ background: randomDescs ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.1)' }}>
                  <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${randomDescs ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[12px] text-white">Ajouter un délai après chaque cycle ℹ</span>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={cycleDelay} onChange={e => setCycleDelay(Number(e.target.value))}
                    className="w-12 rounded-lg px-2 py-1 text-[12px] font-bold text-white text-center focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                  <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>minutes</span>
                </div>
              </div>
            </div>

            {/* Options supplémentaires */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <p className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.4)' }}>Options supplémentaires</p>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-[12px] text-white">Limits par compte / jour</span>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} value={limitPerDay} onChange={e => setLimitPerDay(Number(e.target.value))}
                    className="w-12 rounded-lg px-2 py-1 text-[12px] font-bold text-white text-center focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                  <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>posts</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[12px] text-white">Pause après :</span>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} value={pauseAfterN} onChange={e => setPauseAfterN(Number(e.target.value))}
                    className="w-12 rounded-lg px-2 py-1 text-[12px] font-bold text-white text-center focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                  <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>posts pendant</span>
                  <input type="number" min={1} value={pauseDurMin} onChange={e => setPauseDurMin(Number(e.target.value))}
                    className="w-12 rounded-lg px-2 py-1 text-[12px] font-bold text-white text-center focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                  <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>min</span>
                </div>
              </div>
            </div>

            {/* Caption */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.4)' }}>Description</p>
                <span className={`text-[11px] font-mono ${caption.length > 2200 ? 'text-red-400' : ''}`} style={{ color: caption.length > 2200 ? '#f87171' : 'rgba(148,163,184,0.4)' }}>{caption.length}/2200</span>
              </div>
              <div className="px-4 py-3">
                <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3}
                  placeholder="Description partagée (optionnel)…"
                  className="w-full rounded-xl px-3 py-2.5 text-[12px] placeholder:text-text2 resize-none focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }} />
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" variant="secondary" onClick={generateCaption} loading={generating} disabled={!groqKey}>✨ IA</Button>
                  <input type="text" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="Prompt…"
                    className="flex-1 rounded-xl px-3 py-2 text-[12px] placeholder:text-text2 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }} />
                  <button onClick={() => setWithHashtags(v => !v)}
                    className="px-3 py-2 rounded-xl transition-all text-[12px] font-bold flex-shrink-0"
                    style={withHashtags ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.5)' }}>
                    #
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ COL 4: FILE D'ATTENTE + APERÇU + STATS ════════════════════════ */}
        <div className="w-[300px] flex-shrink-0 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black px-2 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>4</span>
              <p className="text-[13px] font-bold text-white">FILE D'ATTENTE</p>
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.4)' }}>{selectedVideos.length}</span>
            </div>
            <button onClick={() => setSelVideos([])} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)' }}>
              Vider
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Queue */}
            <div className="rounded-xl min-h-[120px] flex flex-col" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              {selectedVideos.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-8 gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="rgba(148,163,184,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-bold text-white">Aucune vidéo dans la file</p>
                    <p className="text-[11px] mt-1" style={{ color: 'rgba(148,163,184,0.4)' }}>Les vidéos ajoutées à la file apparaîtront ici</p>
                  </div>
                  <button onClick={() => setShowBankPicker(true)}
                    className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
                    style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }}>
                    Ajouter des vidéos
                  </button>
                </div>
              ) : (
                <div className="py-2">
                  {selectedVideos.map((sv, i) => (
                    <div key={sv.item.id} className="flex items-center gap-2.5 px-3 py-2" style={{ borderBottom: i < selectedVideos.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <span className="text-[10px] font-black w-4 text-center flex-shrink-0" style={{ color: '#a78bfa' }}>{i + 1}</span>
                      <div className="w-7 flex-shrink-0 aspect-[9/16] rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <VideoThumbnail filePath={sv.localPath ?? sv.item.file_url ?? ''} thumbnailPath={sv.item.thumbnail_path} storagePath={sv.item.storage_path} />
                      </div>
                      <p className="flex-1 text-[11px] text-white truncate">{sv.item.title}</p>
                      <button onClick={() => setSelVideos(p => p.filter((_, j) => j !== i))} className="text-[11px] transition-colors flex-shrink-0" style={{ color: 'rgba(148,163,184,0.3)' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Aperçu du posting */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <p className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.4)' }}>APERÇU DU POSTING</p>
              <div className="px-4 py-4 flex items-center gap-4">
                {/* Donut chart */}
                <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
                    {totalTasks > 0 && doneCount > 0 && (
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#34d399" strokeWidth="8"
                        strokeDasharray={`${(doneCount / totalTasks) * 201} 201`} strokeLinecap="round" transform="rotate(-90 40 40)"/>
                    )}
                    {totalTasks > 0 && errorCount > 0 && (
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#f87171" strokeWidth="8"
                        strokeDasharray={`${(errorCount / totalTasks) * 201} 201`}
                        strokeDashoffset={`${-(doneCount / totalTasks) * 201}`} strokeLinecap="round" transform="rotate(-90 40 40)"/>
                    )}
                    {totalTasks > 0 && inProgCount > 0 && (
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#fbbf24" strokeWidth="8"
                        strokeDasharray={`${(inProgCount / totalTasks) * 201} 201`}
                        strokeDashoffset={`${-((doneCount + errorCount) / totalTasks) * 201}`} strokeLinecap="round" transform="rotate(-90 40 40)"/>
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-[16px] font-black text-white leading-none">{progress}%</p>
                    <p className="text-[8px] font-bold" style={{ color: 'rgba(148,163,184,0.4)' }}>PROGRESSION</p>
                  </div>
                </div>
                <div className="flex-1 space-y-1.5">
                  {[
                    { label: 'Postes réussis', val: doneCount, color: '#34d399' },
                    { label: 'En cours', val: inProgCount, color: '#fbbf24' },
                    { label: 'En échec', val: errorCount, color: '#f87171' },
                    { label: 'Restants', val: Math.max(0, totalTasks - doneCount - errorCount - inProgCount), color: '#a78bfa' },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                        <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.6)' }}>{r.label}</span>
                      </div>
                      <span className="text-[12px] font-bold text-white">{r.val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {[
                  { label: 'TEMPS RESTANT', val: totalTasks > 0 && posting ? `${Math.ceil((totalTasks - doneCount - errorCount) * (postingOpts.intervalMin ?? 30) / 60)}min` : '--:--:--' },
                  { label: 'DÉBUT', val: posting ? new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-' },
                  { label: 'FIN ESTIMÉE', val: '-' },
                ].map((s, i) => (
                  <div key={i} className={`flex-1 px-3 py-3 text-center ${i < 2 ? 'border-r' : ''}`} style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <p className="text-[13px] font-black text-white">{s.val}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: 'rgba(148,163,184,0.35)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Statistiques */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.4)' }}>STATISTIQUES</p>
                <select className="text-[11px] rounded-lg px-2 py-1 focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(196,181,253,0.7)' }}>
                  <option>Aujourd'hui</option>
                  <option>7 jours</option>
                  <option>30 jours</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(255,255,255,0.05)' }}>
                {[
                  { label: 'Total posts', val: doneCount, color: '#a78bfa' },
                  { label: 'Taux de réussite', val: totalTasks > 0 ? `${Math.round(doneCount / Math.max(1, doneCount + errorCount) * 100)}%` : '0%', color: '#34d399' },
                  { label: 'Vidéos utilisées', val: selectedVideos.length, color: '#60a5fa' },
                  { label: 'Comptes actifs', val: selectedPhones.size, color: '#fbbf24' },
                ].map(s => (
                  <div key={s.label} className="px-3 py-3" style={{ background: '#0E0E16' }}>
                    <p className="text-[16px] font-black" style={{ color: s.color }}>{s.val}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.45)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        </div>{/* end 4-column row */}

        {/* ── ACTIVITÉ EN TEMPS RÉEL ──────────────────────────────────────────── */}
        <div className="flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', height: 180 }}>
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: posting ? '#34d399' : 'rgba(148,163,184,0.3)', boxShadow: posting ? '0 0 6px #34d399' : 'none' }} />
                <p className="text-[12px] font-bold text-white uppercase tracking-wider">ACTIVITÉ EN TEMPS RÉEL</p>
              </div>
              {logs.length > 0 && !posting && (
                <button onClick={() => setLogs([])} className="text-[11px] transition-colors" style={{ color: 'rgba(148,163,184,0.4)' }}>Effacer</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 opacity-30">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="rgba(148,163,184,0.5)" strokeWidth="1.5"/><polyline points="22,6 12,13 2,6" stroke="rgba(148,163,184,0.5)" strokeWidth="1.5"/></svg>
                  <p className="text-[12px] font-semibold text-white">Aucune activité pour le moment</p>
                  <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>Les actions en cours s'afficheront ici en temps réel</p>
                </div>
              ) : (
                <div className="space-y-1 font-mono text-[11px]">
                  {logs.map((l, i) => (
                    <div key={i} className={`flex gap-3 ${l.level === 'ok' ? 'text-green-400' : l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-400' : 'text-text2'}`}>
                      <span className="flex-shrink-0 opacity-40">{l.time}</span>
                      <span>{l.message}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>

      </div>{/* end flex-col wrapper */}

      {/* ── PostingOptions hidden (still saves opts) ──────────────────────── */}
      <div className="hidden"><PostingOptions opts={postingOpts} onChange={o => { setPostingOpts(o); savePostingOpts(o) }} /></div>


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
