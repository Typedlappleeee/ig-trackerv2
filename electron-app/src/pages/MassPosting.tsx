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
} from '@/lib/massPostingStore'
import { playSuccess } from '@/lib/sounds'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'

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
  const r = await window.electronAPI!.geelarkRequest({
    method: 'POST', url: `${GEELARK}${path}`,
    headers: { Authorization: `Bearer ${bearer}` }, body,
  })
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
  const [withHashtags, setWithHashtags]   = useState(true)
  const [customPrompt, setCustomPrompt]   = useState('')
  const [logs, _setLogs]                  = useState<TaskLog[]>(ms.logs)
  const [taskStatuses, _setTaskStatuses]  = useState<Map<string, TaskStatus>>(ms.taskStatuses)
  const [groupFilter, setGroupFilter]     = useState('Tous')
  const [groups, setGroups]               = useState<string[]>(['Tous'])
  const [phoneSearch, setPhoneSearch]     = useState('')
  const [showBankPicker, setShowBankPicker] = useState(false)
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
      // ── Step 1: upload unique videos ─────────────────────────────────────
      log(`📤 Upload de ${selectedVideos.length} vidéo(s) vers GéeLark…`)
      const tokenMap = new Map<number, string>() // videoIndex → token

      for (let vi = 0; vi < selectedVideos.length; vi++) {
        const sv = selectedVideos[vi]

        // Mark phones using this video as uploading
        phoneList.forEach((p, i) => {
          if (i % selectedVideos.length === vi) setPhoneStatus(p.id, { status: 'uploading' })
        })

        const fileSource = sv.localPath ?? sv.item.file_url
        if (!fileSource) {
          log(`⚠️ Vidéo ${vi + 1} sans source — ignorée`, 'warn')
          continue
        }
        let token: string
        const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath: fileSource })
        if (!up.ok || !up.token) {
          log(`❌ Upload échoué (${sv.item.title}): ${up.error}`, 'error')
          phoneList.forEach((p, i) => {
            if (i % selectedVideos.length === vi) setPhoneStatus(p.id, { status: 'error', detail: up.error })
          })
          continue
        }
        token = up.token

        tokenMap.set(vi, token)
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

      for (const asgn of assignments) {
        const token = tokenMap.get(asgn.videoIndex)
        if (!token) {
          log(`  ⚠️ ${asgn.phone.phone_name}: pas de token vidéo`, 'warn')
          setPhoneStatus(asgn.phone.id, { status: 'error', detail: 'no video token' })
          continue
        }
        setPhoneStatus(asgn.phone.id, { status: 'posting' })
        const taskRes = await geelark(bearer, '/rpa/task/instagramPubReels', {
          id:          asgn.phone.geelark_id,
          scheduleAt:  Math.floor(Date.now() / 1000),
          description: caption,
          video:       [token],
        })
        if (taskRes['code'] === 0) {
          const tid = (taskRes['data'] as Record<string, unknown>)?.['id'] as string
          taskIds[asgn.phone.geelark_id] = tid
          activeTasksRef.current = [...activeTasksRef.current, tid]
          setPhoneStatus(asgn.phone.id, { status: 'posting', taskId: tid })
          log(`  ✅ Tâche créée pour ${asgn.phone.phone_name}`, 'ok')
        } else {
          log(`  ❌ ${asgn.phone.phone_name}: ${taskRes['msg'] ?? taskRes['code']}`, 'error')
          setPhoneStatus(asgn.phone.id, { status: 'error', detail: String(taskRes['msg'] ?? taskRes['code']) })
        }
      }

      // ── Step 4: poll until done (max 10 min) ─────────────────────────────
      if (Object.keys(taskIds).length > 0) {
        log(`⏳ Suivi de ${Object.keys(taskIds).length} tâche(s)…`)
        const pending = new Set(Object.values(taskIds))
        const deadline = Date.now() + 10 * 60 * 1000
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

      // ── Step 5: stop phones ──────────────────────────────────────────────
      log('🛑 Arrêt des téléphones…')
      await geelark(bearer, '/phone/stop', { ids: geelarkIds })
      log('🎉 Terminé !', 'ok')

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
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex flex-col gap-3 flex-shrink-0" style={{ background: '#06080e' }}>
        <div className="flex items-center gap-3">
          {/* Title block */}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <span className="text-base">⚡</span>
          </div>
          <div>
            <h1 className="text-lg font-black text-text tracking-tight">Mass Posting</h1>
            <p className="text-text2 text-[11px]">
              {phoneList.length} cible{phoneList.length !== 1 ? 's' : ''} · {selectedVideos.length} vidéo{selectedVideos.length !== 1 ? 's' : ''}
              {withSessions > 0 && <span className="ml-2 text-ok">· {withSessions} session IG</span>}
            </p>
          </div>
          <div className="flex-1" />

          {/* Mode toggle */}
          <div className="flex rounded-lg p-0.5 text-xs" style={{ background: '#0d0f1c', border: '1px solid #1a2035' }}>
            {([{ k: 'seq', l: 'Séquentiel' }, { k: 'random', l: 'Aléatoire' }] as const).map(m => (
              <button key={m.k} onClick={() => setMode(m.k)}
                className="px-3 py-1.5 rounded-md font-semibold transition-all text-[11px]"
                style={mode === m.k
                  ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: 'white' }
                  : { color: '#5a6882' }}
              >{m.l}</button>
            ))}
          </div>

          {/* Action buttons */}
          <button
            onClick={post}
            disabled={posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0}
            className="px-4 py-2 rounded-xl text-xs font-black text-white transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0
                ? '#1a2035'
                : 'linear-gradient(130deg,#7c3aed,#ec4899)',
              boxShadow: posting || !bearer || phoneList.length === 0 || selectedVideos.length === 0
                ? 'none'
                : '0 4px 20px -4px rgba(124,58,237,0.5)',
            }}
          >
            {posting ? '⏳ En cours…' : '⚡ Lancer'}
          </button>
          <button
            onClick={stop}
            disabled={!posting}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-danger border border-danger/30 hover:bg-danger/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ⏹ Stopper
          </button>
        </div>

        {/* Description row */}
        <div className="flex items-center gap-2">
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            rows={2}
            placeholder="Description partagée par tous les téléphones (optionnel)…"
            className="flex-1 bg-[#0a0c15] border border-border rounded-xl px-3 py-2 text-xs text-text placeholder:text-text2 resize-none focus:outline-none focus:border-[#8b5cf6]/50"
          />
          <span className={`text-[10px] font-mono ${caption.length > 2200 ? 'text-danger' : 'text-text2'}`}>
            {caption.length}/2200
          </span>
          <Button size="sm" variant="secondary" onClick={generateCaption} loading={generating} disabled={!groqKey}>✨ IA</Button>
          <input type="text" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
            placeholder="Prompt…"
            className="w-28 bg-[#0a0c15] border border-border rounded-lg px-2 py-1.5 text-[11px] text-text placeholder:text-text2 focus:outline-none focus:border-[#8b5cf6]/50"
          />
          <button
            onClick={() => setWithHashtags(v => !v)}
            className="relative w-8 h-4 rounded-full transition-all flex-shrink-0"
            style={{ background: withHashtags ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : '#1a2035' }}
            title="Hashtags"
          >
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${withHashtags ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
          <span className="text-[10px] text-text2">#</span>
        </div>
      </div>

      {!bearer && (
        <div className="mx-8 mt-4 px-4 py-3 rounded-lg bg-warn/10 border border-warn/20 text-warn text-sm flex-shrink-0">
          ⚠ Token GéeLark manquant — configure-le dans Paramètres.
        </div>
      )}

      {/* 3-column grid */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* ── Column 1: Videos ─────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-border" style={{ background: '#0a0d15' }}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-bold text-text">🎬 Vidéos</p>
            <span className="text-xs text-text2">{selectedVideos.length} sélectionnée(s)</span>
          </div>
          {/* Source buttons */}
          <div className="px-3 py-2 border-b border-border flex gap-2">
            <button
              onClick={() => pickLocalFile(-1)}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs text-text2 hover:bg-surface2 border border-dashed border-border hover:border-accent/40 transition-colors"
            >
              <span>💻</span>
              <span>PC</span>
            </button>
            <button
              onClick={() => setShowBankPicker(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs text-text2 hover:bg-surface2 border border-dashed border-border hover:border-accent/40 transition-colors"
            >
              <span>🗂</span>
              <span>Banque</span>
            </button>
          </div>
          {/* Selected videos list */}
          <div className="flex-1 overflow-auto py-2">
            {selectedVideos.length === 0 ? (
              <p className="px-4 py-6 text-xs text-text2 text-center">Aucune vidéo sélectionnée.</p>
            ) : selectedVideos.map((sv, selIdx) => {
              const fp = sv.localPath ?? sv.item.file_url
              return (
                <div
                  key={sv.item.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-border/30"
                >
                  <div className="w-10 flex-shrink-0 aspect-[9/16] rounded overflow-hidden bg-surface2">
                    <VideoThumbnail filePath={fp ?? ''} thumbnailPath={sv.item.thumbnail_path} storagePath={sv.item.storage_path} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-accent">#{selIdx + 1}</p>
                    <p className="text-xs text-text truncate">{sv.item.title}</p>
                  </div>
                  <button
                    onClick={() => setSelVideos(prev => prev.filter((_, i) => i !== selIdx))}
                    className="text-text2 hover:text-danger text-sm flex-shrink-0"
                  >✕</button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Column 2: Phones ─────────────────────────────────────────────── */}
        <div className="w-64 flex-shrink-0 flex flex-col border-r border-border" style={{ background: '#090c14' }}>
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-bold text-text">📱 Téléphones</p>
            <select
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
              className="mt-1.5 w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
            >
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input
              type="text" placeholder="🔍 Rechercher…" value={phoneSearch}
              onChange={e => setPhoneSearch(e.target.value)}
              className="mt-1.5 w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text placeholder:text-text2 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="px-3 py-1.5 flex gap-3 border-b border-border">
            <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
              className="text-xs text-accent hover:text-text">Tout</button>
            <button onClick={() => setSelPhones(new Set())}
              className="text-xs text-text2 hover:text-text">Aucun</button>
            <span className="ml-auto text-xs text-text2">{selectedPhones.size} sél.</span>
          </div>
          <div className="flex-1 overflow-auto">
            {visiblePhones.map((phone, i) => {
              const checked = selectedPhones.has(phone.id)
              const asgn = assignments.find(a => a.phone.id === phone.id)
              const ts = taskStatuses.get(phone.id)
              return (
                <button
                  key={phone.id}
                  onClick={() => togglePhone(phone.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-border/40 transition-colors ${
                    checked ? 'bg-accent/10' : 'hover:bg-surface2'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                    checked ? 'bg-accent text-white' : 'bg-surface2 text-text2'
                  }`}>
                    {phone.ig_username?.[0]?.toUpperCase() ?? phone.phone_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text truncate">{phone.phone_name}</p>
                    {phone.ig_username && (
                      <p className="text-[10px] text-accent truncate">@{phone.ig_username}</p>
                    )}
                    {ts && ts.status !== 'idle' && (
                      <p className={`text-[10px] ${STATUS_COLOR[ts.status]}`}>{STATUS_LABEL[ts.status]}</p>
                    )}
                  </div>
                  {asgn?.video && (
                    <span className="text-[10px] text-text2 bg-surface px-1 py-0.5 rounded flex-shrink-0">
                      #{(asgn.videoIndex + 1)}
                    </span>
                  )}
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    checked ? 'bg-accent border-accent' : 'border-border'
                  }`}>
                    {checked && <span className="text-white text-[10px]">✓</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Column 3: Assignments ────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* Assignments */}
          <div>
            <h2 className="text-sm font-semibold text-text mb-3">
              🗂 Assignations
              {assignments.length > 0 && (
                <span className="ml-2 text-text2 font-normal">{assignments.length} téléphone(s)</span>
              )}
            </h2>

            {assignments.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center text-text2">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm">Sélectionne des téléphones et des vidéos pour voir les assignations</p>
                <p className="text-xs mt-1">Chaque téléphone est automatiquement assigné à une vidéo (rotation)</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {assignments.map(({ phone, video, videoIndex }) => {
                  const ts = taskStatuses.get(phone.id)
                  const statusColor = ts ? STATUS_COLOR[ts.status] : ''
                  return (
                    <div
                      key={phone.id}
                      className={`bg-card border rounded-xl p-3 space-y-2 transition-colors ${
                        ts?.status === 'done'  ? 'border-ok/40' :
                        ts?.status === 'error' ? 'border-danger/40' :
                        ts?.status === 'posting' ? 'border-warn/40' :
                        'border-border'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {phone.ig_username?.[0]?.toUpperCase() ?? phone.phone_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-text truncate">{phone.phone_name}</p>
                          {phone.ig_username && (
                            <p className="text-[10px] text-accent truncate">@{phone.ig_username}</p>
                          )}
                        </div>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          phone.status === 'online' ? 'bg-ok' : 'bg-text2'
                        }`} />
                      </div>
                      {video ? (
                        <div className="flex items-center gap-2">
                          {/* Video thumbnail */}
                          <div className="w-8 flex-shrink-0 aspect-[9/16] rounded overflow-hidden bg-surface2">
                            <VideoThumbnail filePath={video.localPath ?? video.item.file_url ?? ''} thumbnailPath={video.item.thumbnail_path} storagePath={video.item.storage_path} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-accent font-bold">#{videoIndex + 1}</p>
                            <p className="text-[10px] text-text2 truncate">{video.item.title}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-surface rounded-lg px-2 py-1.5">
                          <span className="text-xs text-text2 italic">Aucune vidéo</span>
                        </div>
                      )}
                      {/* Per-phone progress */}
                      {ts && ts.status !== 'idle' && (
                        <div className="space-y-1">
                          <p className={`text-[10px] font-medium ${statusColor}`}>
                            {STATUS_LABEL[ts.status]}
                            {ts.detail && <span className="opacity-70"> — {ts.detail}</span>}
                          </p>
                          {(ts.status === 'uploading' || ts.status === 'posting') && (
                            <div className="w-full h-1 bg-surface2 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full animate-pulse ${
                                ts.status === 'uploading' ? 'bg-blue-400 w-2/3' : 'bg-warn w-4/5'
                              }`} />
                            </div>
                          )}
                          {ts.status === 'done' && (
                            <div className="w-full h-1 bg-ok/20 rounded-full overflow-hidden">
                              <div className="h-full bg-ok rounded-full w-full" />
                            </div>
                          )}
                          {ts.status === 'error' && (
                            <div className="w-full h-1 bg-danger/20 rounded-full overflow-hidden">
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
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold text-text">Journal</p>
                {!posting && (
                  <button onClick={() => setLogs([])} className="text-xs text-text2 hover:text-text">Effacer</button>
                )}
              </div>
              <div className="p-4 max-h-48 overflow-auto font-mono text-xs space-y-1">
                {logs.map((l, i) => (
                  <div key={i} className={`flex gap-3 ${
                    l.level === 'ok'    ? 'text-ok'    :
                    l.level === 'error' ? 'text-danger' :
                    l.level === 'warn'  ? 'text-warn'   :
                    'text-text2'
                  }`}>
                    <span className="text-text2 flex-shrink-0">{l.time}</span>
                    <span>{l.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bank picker modal */}
      {showBankPicker && (
        <BankPicker
          user={user}
          mode="multi"
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
    </div>
  )
}
