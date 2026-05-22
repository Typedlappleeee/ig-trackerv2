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
      <header className="flex-shrink-0 px-8 pt-7 pb-5 flex items-start justify-between gap-6"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.10)', background: 'rgba(7,7,11,0.95)' }}>

        {/* Left: title + status */}
        <div className="flex items-start gap-4 min-w-0">
          {/* Glow icon */}
          <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center mt-0.5"
            style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.25),rgba(168,85,247,0.12))', border: '1px solid rgba(139,92,246,0.25)', boxShadow: '0 0 20px -6px rgba(139,92,246,0.5)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-[22px] font-black text-white tracking-tight leading-none">Mass Posting</h1>
              {/* Status badge */}
              {posting ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  En cours
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(82,82,91,0.15)', border: '1px solid rgba(82,82,91,0.25)', color: '#71717a' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-text3" />
                  Idle
                </span>
              )}
            </div>
            <p className="text-[13px] text-text2 leading-none flex items-center gap-3">
              <span>{phoneList.length} cible{phoneList.length !== 1 ? 's' : ''}</span>
              <span className="text-text3">·</span>
              <span>{selectedVideos.length} vidéo{selectedVideos.length !== 1 ? 's' : ''}</span>
              {withSessions > 0 && (
                <>
                  <span className="text-text3">·</span>
                  <span className="text-ok">{withSessions} session IG</span>
                </>
              )}
              {posting && totalTasks > 0 && (
                <>
                  <span className="text-text3">·</span>
                  <span className="text-accent font-semibold">{doneTasks}/{totalTasks} terminé{doneTasks !== 1 ? 's' : ''}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Right: mode toggle + action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Assignment mode */}
          <div className="flex rounded-lg p-0.5 gap-0.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {([{ k: 'seq', l: 'Séquentiel' }, { k: 'random', l: 'Aléatoire' }] as const).map(m => (
              <button key={m.k} onClick={() => setMode(m.k)}
                className="px-3 py-2 rounded-md text-[12px] font-semibold transition-all"
                style={mode === m.k
                  ? { background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)' }
                  : { color: '#52525b' }}>
                {m.l}
              </button>
            ))}
          </div>

          {/* Schedule button */}
          <button
            onClick={() => setShowScheduleModal(true)}
            disabled={posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Programmer
          </button>

          {/* Stop button */}
          <button
            onClick={stop}
            disabled={!posting}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all disabled:opacity-25 disabled:cursor-not-allowed"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            Stopper
          </button>

          {/* Launch button */}
          <button
            onClick={post}
            disabled={!canLaunch}
            className="flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-black text-white transition-all active:scale-[0.97] disabled:opacity-35 disabled:cursor-not-allowed"
            style={canLaunch ? {
              background: 'linear-gradient(130deg,#7c3aed 0%,#a855f7 100%)',
              boxShadow: '0 4px 24px -4px rgba(139,92,246,0.6), inset 0 1px 0 rgba(255,255,255,0.12)',
            } : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {posting ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
                En cours…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Lancer
              </>
            )}
          </button>
        </div>
      </header>

      {/* Warning: no bearer */}
      {!bearer && (
        <div className="flex-shrink-0 mx-8 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] text-warn"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Token GéeLark manquant — configure-le dans Paramètres.
        </div>
      )}

      {/* ── Live progress bar (only while posting) ───────────────────────── */}
      {posting && totalTasks > 0 && (
        <div className="flex-shrink-0 mx-8 mt-4 rounded-xl p-4"
          style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.18)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <span className="text-[13px] font-bold text-white">{doneTasks + errorTasks}/{totalTasks}</span>
              <div className="flex items-center gap-2">
                {activeTasks > 0 && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
                    {activeTasks} actif{activeTasks !== 1 ? 's' : ''}
                  </span>
                )}
                {doneTasks > 0 && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                    {doneTasks} ok
                  </span>
                )}
                {errorTasks > 0 && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    {errorTasks} err
                  </span>
                )}
              </div>
            </div>
            <span className="text-[13px] font-mono font-bold text-accent">{progressPct}%</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="sf-progress-bar h-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* ── 3-column body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex min-h-0 mt-0">

        {/* ── COL 1: Videos ────────────────────────────────────────────────── */}
        <aside className="w-72 flex-shrink-0 flex flex-col"
          style={{ borderRight: '1px solid rgba(139,92,246,0.08)', background: 'rgba(14,14,22,0.6)' }}>

          {/* Video panel header */}
          <div className="flex-shrink-0 px-5 pt-5 pb-4"
            style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                <p className="text-[14px] font-bold text-white">Vidéos</p>
              </div>
              <span className="min-w-[22px] h-[22px] flex items-center justify-center text-[11px] font-black rounded-full"
                style={selectedVideos.length > 0
                  ? { background: 'linear-gradient(130deg,#7c3aed,#a855f7)', color: 'white' }
                  : { background: 'rgba(255,255,255,0.07)', color: '#52525b' }}>
                {selectedVideos.length}
              </span>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => pickLocalFile(-1)}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[12px] font-semibold transition-colors hover:bg-white/[0.04]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#a1a1aa' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                PC
              </button>
              <button onClick={() => setShowBankPicker(true)}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[12px] font-semibold transition-colors hover:bg-white/[0.04]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#a1a1aa' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                Banque
              </button>
              <button onClick={openFolderPick}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[12px] font-semibold transition-colors"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                Dossier
              </button>
            </div>
          </div>

          {/* Adding folder loader */}
          {addingFolder && (
            <div className="flex-shrink-0 flex items-center gap-3 px-5 py-2.5"
              style={{ background: 'rgba(139,92,246,0.06)', borderBottom: '1px solid rgba(139,92,246,0.12)' }}>
              <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a78bfa' }} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
              <p className="text-[11px] font-semibold truncate" style={{ color: '#a78bfa' }}>
                Ajout «{addingFolder}»…
              </p>
            </div>
          )}

          {/* Video list */}
          <div className="flex-1 overflow-auto">
            {selectedVideos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-5 py-10 text-center">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                </div>
                <p className="text-[13px] font-bold text-white mb-1">Aucune vidéo</p>
                <p className="text-[12px] text-text3 max-w-[160px] leading-relaxed">Ajoute depuis la banque, un dossier ou ton PC</p>
              </div>
            ) : (
              <div className="py-2">
                {selectedVideos.map((sv, selIdx) => {
                  const fp = sv.localPath ?? sv.item.file_url
                  return (
                    <div key={sv.item.id}
                      className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      {/* Thumbnail */}
                      <div className="w-9 flex-shrink-0 aspect-[9/16] rounded-lg overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <VideoThumbnail filePath={fp ?? ''} thumbnailPath={sv.item.thumbnail_path} storagePath={sv.item.storage_path} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black tracking-widest uppercase mb-0.5"
                          style={{ color: '#7c3aed' }}>#{selIdx + 1}</p>
                        <p className="text-[12px] font-semibold text-white truncate leading-tight">{sv.item.title}</p>
                        {sv.item.folder && (
                          <p className="text-[10px] text-text3 truncate">{sv.item.folder}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setSelVideos(prev => prev.filter((_, i) => i !== selIdx))}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded transition-all text-text3 hover:text-danger flex-shrink-0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ── COL 2: Phones / Groups ───────────────────────────────────────── */}
        <aside className="w-64 flex-shrink-0 flex flex-col"
          style={{ borderRight: '1px solid rgba(139,92,246,0.08)', background: 'rgba(14,14,22,0.6)' }}>

          {/* Phone panel header */}
          <div className="flex-shrink-0 px-5 pt-5 pb-4"
            style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                <p className="text-[14px] font-bold text-white">Cibles</p>
              </div>
              <span className="min-w-[22px] h-[22px] flex items-center justify-center text-[11px] font-black rounded-full"
                style={selectedPhones.size > 0
                  ? { background: 'linear-gradient(130deg,#7c3aed,#a855f7)', color: 'white' }
                  : { background: 'rgba(255,255,255,0.07)', color: '#52525b' }}>
                {selectedPhones.size}
              </span>
            </div>

            {/* Mode toggle: phones / groups */}
            <div className="flex rounded-lg p-0.5 gap-0.5 mb-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {([{ k: 'phones', l: 'Téléphones' }, { k: 'groups', l: 'Groupes' }] as const).map(m => (
                <button key={m.k} onClick={() => setPhonePickMode(m.k)}
                  className="flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all"
                  style={phonePickMode === m.k
                    ? { background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)' }
                    : { color: '#52525b' }}>
                  {m.l}
                </button>
              ))}
            </div>

            {/* Phone filters */}
            {phonePickMode === 'phones' && (
              <div className="space-y-2">
                <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: '#e2e8f0' }}>
                  {groups.map(g => <option key={g} value={g} style={{ background: '#0d1120', color: '#e2d9f3' }}>{g}</option>)}
                </select>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text3 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input type="text" placeholder="Rechercher…" value={phoneSearch}
                    onChange={e => setPhoneSearch(e.target.value)}
                    className="w-full rounded-lg pl-8 pr-3 py-2 text-[12px] placeholder:text-text3 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: '#e2e8f0' }}
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
                }} className="text-[12px] font-semibold text-accent hover:text-white transition-colors">Tout</button>
                <button onClick={() => { setSelectedGroups(new Set()); setSelPhones(new Set()) }}
                  className="text-[12px] text-text3 hover:text-white transition-colors">Aucun</button>
              </div>
            )}
          </div>

          {/* Phones mode: select all/none bar */}
          {phonePickMode === 'phones' && (
            <div className="flex-shrink-0 px-5 py-2 flex gap-4 items-center"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
                className="text-[11px] font-semibold text-accent hover:text-white transition-colors">Tout</button>
              <button onClick={() => setSelPhones(new Set())}
                className="text-[11px] text-text3 hover:text-white transition-colors">Aucun</button>
              <span className="ml-auto text-[11px] text-text3">{visiblePhones.length} disp.</span>
            </div>
          )}

          {/* Phone / group list */}
          <div className="flex-1 overflow-auto">

            {/* Phones mode */}
            {phonePickMode === 'phones' && visiblePhones.map((phone) => {
              const checked = selectedPhones.has(phone.id)
              const asgn = assignments.find(a => a.phone.id === phone.id)
              const ts = taskStatuses.get(phone.id)
              return (
                <button key={phone.id} onClick={() => togglePhone(phone.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-white/[0.02]"
                  style={checked
                    ? { background: 'rgba(139,92,246,0.07)', borderBottom: '1px solid rgba(139,92,246,0.08)' }
                    : { borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0"
                    style={checked
                      ? { background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: 'white' }
                      : { background: 'rgba(255,255,255,0.06)', color: '#52525b' }}>
                    {phone.ig_username?.[0]?.toUpperCase() ?? phone.phone_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-white truncate leading-tight">{phone.phone_name}</p>
                    {phone.ig_username && (
                      <p className="text-[11px] truncate" style={{ color: 'rgba(139,92,246,0.7)' }}>@{phone.ig_username}</p>
                    )}
                    {ts && ts.status !== 'idle' && (
                      <p className={`text-[10px] font-semibold ${STATUS_COLOR[ts.status]}`}>{STATUS_LABEL[ts.status]}</p>
                    )}
                  </div>
                  {asgn?.video && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={{ background: 'rgba(139,92,246,0.12)', color: '#7c3aed' }}>
                      #{asgn.videoIndex + 1}
                    </span>
                  )}
                  <div className="w-4 h-4 rounded-[4px] flex items-center justify-center flex-shrink-0 transition-all"
                    style={checked
                      ? { background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }
                      : { border: '1px solid rgba(255,255,255,0.12)' }}>
                    {checked && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </div>
                </button>
              )
            })}

            {/* Groups mode */}
            {phonePickMode === 'groups' && (() => {
              const realGroups = groups.filter(g => g !== 'Tous')
              if (realGroups.length === 0) return (
                <div className="flex flex-col items-center justify-center h-full px-5 py-10 text-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <p className="text-[13px] font-bold text-white mb-1">Aucun groupe</p>
                  <p className="text-[12px] text-text3">Assigne des groupes à tes téléphones</p>
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
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-white/[0.02]"
                        style={checked
                          ? { background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.08)' }
                          : { borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={checked
                            ? { background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }
                            : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={checked ? 'white' : '#52525b'} strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-white truncate">{g}</p>
                          <p className="text-[11px]" style={{ color: checked ? '#a78bfa' : '#52525b' }}>
                            {checked ? `${selCount}/${inGroup.length} sel.` : `${inGroup.length} téléphone${inGroup.length !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                        <div className="w-4 h-4 rounded-[4px] flex items-center justify-center flex-shrink-0 transition-all"
                          style={checked
                            ? { background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }
                            : { border: '1px solid rgba(255,255,255,0.12)' }}>
                          {checked && (
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </aside>

        {/* ── COL 3: Config + Queue + Logs ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-8 py-7 space-y-5 max-w-4xl">

            {/* Posting options */}
            <PostingOptions opts={postingOpts} onChange={o => { setPostingOpts(o); savePostingOpts(o) }} />

            {/* Caption card */}
            <div className="sf-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <p className="text-[14px] font-bold text-white">Description</p>
                </div>
                <span className={`text-[12px] font-mono ${caption.length > 2200 ? 'text-danger' : 'text-text3'}`}>
                  {caption.length}/2200
                </span>
              </div>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={4}
                placeholder="Description partagée par tous les téléphones (optionnel)…"
                className="w-full rounded-xl px-4 py-3 text-[13px] placeholder:text-text3 resize-y focus:outline-none transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#e2e8f0' }}
              />
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" variant="secondary" onClick={generateCaption} loading={generating} disabled={!groqKey}>
                  ✨ IA
                </Button>
                <input type="text" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="Prompt personnalisé…"
                  className="flex-1 rounded-xl px-3 py-2 text-[12px] placeholder:text-text3 focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#e2e8f0' }}
                />
                <button
                  onClick={() => setWithHashtags(v => !v)}
                  title="Inclure des hashtags"
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all flex-shrink-0"
                  style={withHashtags
                    ? { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#52525b' }}>
                  #
                </button>
              </div>
            </div>

            {/* Assignments — live queue table */}
            <div className="sf-card overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between"
                style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  <p className="text-[14px] font-bold text-white">File d'attente</p>
                </div>
                {assignments.length > 0 && (
                  <span className="text-[12px] text-text3">{assignments.length} tâche{assignments.length !== 1 ? 's' : ''}</span>
                )}
              </div>

              {assignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: 'rgba(139,92,246,0.06)', border: '1px dashed rgba(139,92,246,0.2)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>
                  </div>
                  <p className="text-[14px] font-bold text-white mb-1">File vide</p>
                  <p className="text-[12px] text-text3 max-w-[260px] leading-relaxed">Sélectionne des téléphones et des vidéos — chaque téléphone recevra automatiquement une vidéo (rotation).</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <th className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-text3">#</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-text3">Téléphone</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-text3">Vidéo</th>
                        <th className="text-right px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-text3">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map(({ phone, video, videoIndex }, rowIdx) => {
                        const ts = taskStatuses.get(phone.id)
                        const status = ts?.status ?? 'idle'
                        const statusBg: Record<string, string> = {
                          idle:      'rgba(82,82,91,0.15)',
                          pending:   'rgba(82,82,91,0.15)',
                          uploading: 'rgba(96,165,250,0.12)',
                          posting:   'rgba(245,158,11,0.12)',
                          done:      'rgba(34,197,94,0.12)',
                          error:     'rgba(239,68,68,0.12)',
                        }
                        const statusFg: Record<string, string> = {
                          idle:      '#52525b',
                          pending:   '#71717a',
                          uploading: '#60a5fa',
                          posting:   '#f59e0b',
                          done:      '#22c55e',
                          error:     '#ef4444',
                        }
                        const rowBg = ts?.status === 'done'    ? 'rgba(34,197,94,0.02)'
                                    : ts?.status === 'error'   ? 'rgba(239,68,68,0.02)'
                                    : ts?.status === 'posting' ? 'rgba(245,158,11,0.02)'
                                    : ts?.status === 'uploading' ? 'rgba(96,165,250,0.02)'
                                    : 'transparent'
                        return (
                          <tr key={phone.id}
                            style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td className="px-5 py-3 text-text3 font-mono">{rowIdx + 1}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
                                  style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                                  {phone.ig_username?.[0]?.toUpperCase() ?? phone.phone_name?.[0]?.toUpperCase() ?? '?'}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-white truncate max-w-[120px]">{phone.phone_name}</p>
                                  {phone.ig_username && (
                                    <p className="text-[10px] truncate max-w-[120px]" style={{ color: 'rgba(139,92,246,0.6)' }}>@{phone.ig_username}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              {video ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 flex-shrink-0 aspect-[9/16] rounded overflow-hidden"
                                    style={{ background: 'rgba(255,255,255,0.06)' }}>
                                    <VideoThumbnail filePath={video.localPath ?? video.item.file_url ?? ''} thumbnailPath={video.item.thumbnail_path} storagePath={video.item.storage_path} />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-[10px] font-bold mr-1.5" style={{ color: '#7c3aed' }}>#{videoIndex + 1}</span>
                                    <span className="text-text2 truncate max-w-[120px] inline-block align-middle">{video.item.title}</span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-text3 italic">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="inline-flex flex-col items-end gap-1">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
                                  style={{ background: statusBg[status], color: statusFg[status] }}>
                                  {STATUS_LABEL[status]}
                                </span>
                                {ts?.detail && (
                                  <span className="text-[10px] text-text3 max-w-[120px] truncate">{ts.detail}</span>
                                )}
                                {(status === 'uploading' || status === 'posting') && (
                                  <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                    <div className="sf-progress-bar h-full" style={{ width: status === 'uploading' ? '60%' : '80%' }} />
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

            {/* Log viewer */}
            {logs.length > 0 && (
              <div className="sf-card overflow-hidden">
                <div className="px-5 py-3.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
                  <div className="flex items-center gap-2">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    <p className="text-[13px] font-bold text-white">Journal</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(139,92,246,0.12)', color: '#7c3aed' }}>
                      {logs.length}
                    </span>
                  </div>
                  {!posting && (
                    <button onClick={() => setLogs([])}
                      className="text-[11px] text-text3 hover:text-white transition-colors flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      Effacer
                    </button>
                  )}
                </div>
                <div className="px-5 py-4 max-h-52 overflow-auto"
                  style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <div className="font-mono text-[11px] space-y-1">
                    {logs.map((l, i) => (
                      <div key={i} className="flex gap-3 leading-relaxed">
                        <span className="flex-shrink-0 text-text3 tabular-nums">{l.time}</span>
                        <span className={
                          l.level === 'ok'    ? 'text-ok'     :
                          l.level === 'error' ? 'text-danger'  :
                          l.level === 'warn'  ? 'text-warn'    :
                          'text-text2'
                        }>{l.message}</span>
                      </div>
                    ))}
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
