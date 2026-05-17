import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { createScheduledPost, fmtScheduledTime } from '@/lib/schedulerService'
import { ScheduleModal } from '@/components/ScheduleModal'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { logActivity } from '@/lib/activityLog'
import { Button }  from '@/components/ui/Button'
import { VideoThumbnail } from '@/pages/Bank'
import { BankPicker } from './Bank'
import { getPostingState, setPostingState, subscribePosting, type TaskLog } from '@/lib/postingStore'
import { playSuccess } from '@/lib/sounds'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'

interface PostingProps { user: User }

const GEELARK = 'https://openapi.geelark.com/open/v1'

async function geelark(bearer: string, path: string, body: unknown) {
  const r = await window.electronAPI!.geelarkRequest({
    method: 'POST', url: `${GEELARK}${path}`,
    headers: { Authorization: `Bearer ${bearer}` }, body,
  })
  return r.data as Record<string, unknown>
}

export function Posting({ user }: PostingProps) {
  const { currentOrg, role, perms }    = useOrg()
  const credits = useCredits()
  const [phones, setPhones]            = useState<Phone[]>([])
  const s                              = getPostingState()
  const [selectedPhones, _setSelPhones]= useState<Set<string>>(s.selectedPhones)
  const [filePath, _setFilePath]       = useState<string | null>(s.filePath)
  const [caption, _setCaption]         = useState(s.caption)
  const [topic, setTopic]              = useState('')
  const [withHashtags, setWithHashtags]= useState(true)
  const [customPrompt, setCustomPrompt]= useState('')
  const [delayBetween, setDelayBetween]= useState(5)
  const [bearer, setBearer]            = useState('')
  const [groqKey, setGroqKey]          = useState('')
  const [groupFilter, setGroup]        = useState('Tous')
  const [groups, setGroups]            = useState<string[]>(['Tous'])
  const [phoneSearch, setPhoneSearch]  = useState('')
  const [posting, _setPosting]         = useState(s.posting)
  const [generating, setGenerating]    = useState(false)
  const [logs, _setLogs]               = useState<TaskLog[]>(s.logs)
  const [progress, _setProgress]       = useState(s.progress)
  const [showLogs, setShowLogs]        = useState(false)
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const logEndRef                      = useRef<HTMLDivElement>(null)

  // Persist-aware setters — update both React state and module-level store
  function setSelPhones(v: Set<string> | ((p: Set<string>) => Set<string>)) {
    _setSelPhones(prev => { const next = typeof v === 'function' ? v(prev) : v; setPostingState({ selectedPhones: next }); return next })
  }
  function setFilePath(v: string | null)           { _setFilePath(v);  setPostingState({ filePath: v }) }
  function setCaption(v: string)                   { _setCaption(v);   setPostingState({ caption: v }) }
  function setPosting(v: boolean)                  { _setPosting(v);   setPostingState({ posting: v }) }
  function setProgress(v: number)                  { _setProgress(v);  setPostingState({ progress: v }) }
  function setLogs(v: TaskLog[] | ((p: TaskLog[]) => TaskLog[])) {
    _setLogs(prev => {
      const next = typeof v === 'function' ? v(prev) : v
      setPostingState({ logs: next })
      return next
    })
  }

  // Re-sync from store when navigating back (e.g. if another component updated store)
  useEffect(() => {
    const unsub = subscribePosting(() => {
      const st = getPostingState()
      _setPosting(st.posting)
      _setProgress(st.progress)
      _setLogs(st.logs)
    })
    return unsub
  }, [])

  // bearer + groq from active connection (org or solo)
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

  function togglePhone(id: string) {
    setSelPhones(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function pickLocalFile() {
    const p = await window.electronAPI?.pickVideoFile()
    if (p) setFilePath(p)
  }

  async function generateCaption() {
    if (!groqKey) { log('❌ Clé Groq manquante — Paramètres', 'error'); return }
    if (!window.electronAPI?.groqRequest) return
    setGenerating(true)
    try {
      const subject = topic.trim() || 'créateur de contenu Instagram lifestyle'
      const systemContent = withHashtags
        ? 'Tu génères des descriptions Instagram virales en français. Hook fort + body engageant + CTA + 10-15 hashtags pertinents. Max 2200 caractères.'
        : 'Tu génères des descriptions Instagram virales en français. Hook fort + body engageant + CTA. Sans hashtags. Max 2200 caractères.'
      const userContent = `Génère une description Instagram${customPrompt.trim() ? ` (${customPrompt.trim()})` : ''} pour : ${subject}. Réponds uniquement avec la description finale, sans préambule.`
      const r = await window.electronAPI.groqRequest({
        apiKey: groqKey,
        model: 'llama-3.3-70b-versatile',
        maxTokens: 300,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user',   content: userContent },
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

  async function schedulePost(scheduledAt: Date) {
    if (!bearer)                  { log('Token GéeLark manquant — Paramètres', 'error'); return }
    if (selectedPhones.size === 0){ log('Sélectionne au moins un téléphone', 'warn'); return }
    if (!filePath)                { log('Sélectionne une vidéo', 'warn'); return }
    setShowScheduleModal(false)

    const phoneList = phones.filter(p => selectedPhones.has(p.id))
    setPosting(true); setLogs([]); setProgress(5)
    try {
      log('📤 Upload de la vidéo vers GéeLark…')
      const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
      if (!up.ok || !up.token) { log(`❌ Upload échoué: ${up.error}`, 'error'); return }
      log(`✅ Vidéo prête (token: ${up.token.slice(0, 12)}…)`, 'ok')
      await createScheduledPost({
        userId: user.id, orgId: currentOrg?.id ?? null,
        createdByName: user.email?.split('@')[0] ?? 'Moi',
        type: 'posting', scheduledAt,
        phones: phoneList.map(p => ({ id: p.id, geelark_id: p.geelark_id, phone_name: p.phone_name, ig_username: p.ig_username })),
        videos: [{ token: up.token, title: filePath.split(/[\\/]/).pop() ?? 'video' }],
        caption, delayMinutes: delayBetween, mode: 'seq', bearerToken: bearer,
      })
      log(`📅 Programmé pour ${fmtScheduledTime(scheduledAt.toISOString())} — ${phoneList.length} téléphone(s)`, 'ok')
    } catch (err: any) {
      log(`❌ Erreur: ${err.message}`, 'error')
    } finally {
      setPosting(false); setProgress(0)
    }
  }

  async function post() {
    if (!bearer)               { log('Token GéeLark manquant — Paramètres', 'error'); return }
    if (selectedPhones.size === 0) { log('Sélectionne au moins un téléphone', 'warn'); return }
    if (!filePath)             { log('Sélectionne une vidéo', 'warn'); return }

    const phoneList = phones.filter(p => selectedPhones.has(p.id))
    const total     = phoneList.length

    const creditCost = total * CREDIT_COSTS.posting
    const creditRes = await checkAndDeductCredits(credits.ownerId, creditCost)
    if (!creditRes.ok) {
      log(`❌ ${creditRes.error ?? 'Crédits insuffisants'} (besoin: ${creditCost} crédits pour ${total} phone${total > 1 ? 's' : ''})`, 'error')
      return
    }
    credits.refresh()
    log(`💳 ${creditCost} crédits débités (${CREDIT_COSTS.posting}/phone × ${total}) — solde: ${creditRes.balance ?? '?'}`)

    playSuccess()
    setPosting(true); setLogs([]); setProgress(0)

    logActivity({
      orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '',
      action: 'posting_launched',
      details: { phones: phoneList.map(p => p.ig_username ?? p.phone_name), count: total, file: filePath?.split(/[\\/]/).pop() },
    })

    try {
      log('📤 Upload de la vidéo vers GéeLark…')
      setProgress(5)
      const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
      if (!up.ok || !up.token) { log(`❌ Upload échoué: ${up.error}`, 'error'); setPosting(false); return }
      const videoToken = up.token
      log(`✅ Vidéo uploadée (token: ${videoToken.slice(0, 12)}…)`, 'ok')
      setProgress(20)

      const geelarkIds = phoneList.map(p => p.geelark_id)
      log(`📱 Démarrage de ${total} téléphone${total > 1 ? 's' : ''}…`)
      const startRes = await geelark(bearer, '/phone/start', { ids: geelarkIds })
      const started  = (startRes['data'] as Record<string, number>)?.['successAmount'] ?? 0
      log(`  ${started} démarré(s)`, started > 0 ? 'ok' : 'warn')
      setProgress(35)

      log('⏳ Attente 30s (boot)…')
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000))
        setProgress(35 + Math.round((i / 30) * 25))
      }

      setProgress(60)
      log('🎬 Création des tâches de post…')
      const taskIds: Record<string, string> = {}

      for (const phone of phoneList) {
        const taskRes = await geelark(bearer, '/rpa/task/instagramPubReels', {
          id:          phone.geelark_id,
          scheduleAt:  Math.floor(Date.now() / 1000),
          description: caption,
          video:       [videoToken],
        })
        if (taskRes['code'] === 0) {
          const tid = (taskRes['data'] as Record<string, unknown>)?.['id'] as string
          taskIds[phone.geelark_id] = tid
          log(`  ✅ Tâche créée pour ${phone.phone_name}`, 'ok')
        } else {
          log(`  ❌ ${phone.phone_name}: ${taskRes['msg'] ?? taskRes['code']}`, 'error')
        }
      }
      setProgress(70)

      if (Object.keys(taskIds).length === 0) {
        log('❌ Aucune tâche créée.', 'error')
      } else {
        log(`⏳ Suivi de ${Object.keys(taskIds).length} tâche(s)…`)
        const pending  = new Set(Object.values(taskIds))
        const deadline = Date.now() + 8 * 60 * 1000
        const STATUS: Record<number, string> = { 1: '⏳ En attente', 2: '🔄 En cours', 3: '✅ Terminé', 4: '❌ Échoué', 7: '🚫 Annulé' }

        let pollCount = 0
        while (pending.size > 0 && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 15000))
          const qRes = await geelark(bearer, '/task/query', { ids: [...pending] })
          pollCount++

          const d = (qRes['data'] as Record<string, unknown>) ?? {}
          let items = (d['items'] ?? d['list'] ?? d['tasks'] ?? d['records']) as Array<Record<string, unknown>> | undefined
          if (!Array.isArray(items)) items = []

          if (pollCount === 1 && items.length === 0) {
            console.log('[posting] /task/query raw response:', JSON.stringify(qRes).slice(0, 800))
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
            }
          }
          const done = Object.keys(taskIds).length - pending.size
          setProgress(70 + Math.round((done / Object.keys(taskIds).length) * 25))
        }
        if (pending.size > 0) log(`⏳ ${pending.size} tâche(s) sans réponse — on continue (posts probablement faits)`, 'warn')
      }

      log('🛑 Arrêt des téléphones…')
      await geelark(bearer, '/phone/stop', { ids: geelarkIds })
      setProgress(100)
      log('🎉 Terminé !', 'ok')

    } catch (e: unknown) {
      log(`❌ Erreur: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }

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
  const fileName = filePath ? filePath.replace(/\\/g, '/').split('/').pop() ?? filePath : null

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left: phone selector */}
      <aside className="w-64 flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: '#07090f' }}>
        {/* Sidebar header */}
        <div className="flex-shrink-0 px-5 pt-6 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold text-white">Comptes</p>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full text-white"
              style={{ background: selectedPhones.size > 0 ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.07)' }}>
              {selectedPhones.size}
            </span>
          </div>
          <select value={groupFilter} onChange={e => setGroup(e.target.value)}
            className="w-full rounded-xl px-4 py-2.5 text-[13px] focus:outline-none mb-2"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <input
            type="text" placeholder="Rechercher…" value={phoneSearch}
            onChange={e => setPhoneSearch(e.target.value)}
            className="w-full rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
          />
        </div>
        <div className="flex-shrink-0 px-5 py-2.5 flex gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
            className="text-[12px] font-semibold text-[#8b5cf6] hover:text-white transition-colors">Tout</button>
          <button onClick={() => setSelPhones(new Set())}
            className="text-[12px] text-text2 hover:text-white transition-colors">Aucun</button>
          <span className="ml-auto text-[12px] text-text2">{visiblePhones.length} tel.</span>
        </div>
        <div className="flex-1 overflow-auto">
          {visiblePhones.map(phone => {
            const checked = selectedPhones.has(phone.id)
            return (
              <button key={phone.id} onClick={() => togglePhone(phone.id)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-all ${
                  checked ? '' : 'hover:bg-white/[0.02]'
                }`}
                style={checked ? { background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(255,255,255,0.04)' } : { borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0 transition-all"
                  style={checked ? { background: 'linear-gradient(135deg,#7c3aed,#ec4899)', color: 'white' } : { background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
                >
                  {phone.ig_username?.[0]?.toUpperCase() ?? phone.phone_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white truncate">{phone.phone_name}</p>
                  {phone.ig_username && <p className="text-[12px] text-[#8b5cf6]/80 truncate">@{phone.ig_username}</p>}
                </div>
                <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                  style={checked ? { background: 'linear-gradient(135deg,#7c3aed,#ec4899)', border: 'none' } : { border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  {checked && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Right: form */}
      <div className="h-full flex flex-col overflow-hidden flex-1">
        {/* Page header */}
        <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-[28px] font-black text-white leading-none">Nouveau post</h1>
            <p className="text-[13px] text-text2 mt-0.5">Poste un Reel sur tes téléphones GéeLark</p>
          </div>
          <button
            onClick={() => { setFilePath(null); setCaption(''); setTopic('') }}
            className="rounded-xl px-5 py-2.5 text-[13px] font-semibold transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
          >
            ↺ Réinitialiser
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-10 pb-10">
          <div className="space-y-6 mt-8">

            {!bearer && (
              <div className="px-5 py-4 rounded-2xl text-[13px] text-warn"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                ❌ Bearer Token GéeLark manquant — configure-le dans Paramètres
              </div>
            )}

            {/* Main posting card */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {/* Media row */}
              <div className="px-6 py-5 flex gap-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {/* 9:16 portrait preview */}
                <div className="w-[110px] flex-shrink-0">
                  <div className="w-[110px] h-[196px] rounded-xl overflow-hidden flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {filePath ? (
                      <VideoThumbnail filePath={filePath} />
                    ) : (
                      <div className="text-center text-text2 text-[13px]">📹<br/>Choisir<br/>une vidéo</div>
                    )}
                  </div>
                </div>
                {/* Right column */}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-3">
                  <div>
                    <p className="text-[12px] text-text2 mb-1">Vidéo sélectionnée</p>
                    <p className="text-[13px] text-white truncate font-medium">{fileName ?? 'Aucune vidéo sélectionnée'}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => setShowBankPicker(true)}>📂 Choisir depuis la banque</Button>
                    <Button variant="secondary" size="sm" onClick={pickLocalFile}>💾 Depuis le PC</Button>
                    {filePath && (
                      <Button variant="secondary" size="sm" onClick={() => setFilePath(null)}>✕ Retirer</Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[15px] font-bold text-white">Description</p>
                  <span className={`text-[12px] font-mono ${caption.length > 2200 ? 'text-danger' : 'text-text2'}`}>
                    {caption.length} / 2200
                  </span>
                </div>
                <textarea
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  rows={5}
                  placeholder="Écris ta description Instagram…"
                  className="w-full rounded-xl px-4 py-3 text-[13px] placeholder:text-text2 resize-y focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                />
                {/* Generate description row */}
                <div className="flex gap-2 mt-3">
                  <Button variant="secondary" size="sm" onClick={generateCaption} loading={generating} disabled={!groqKey}>
                    ✨ Générer
                  </Button>
                  <input
                    type="text"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="sujet / niche…"
                    className="flex-1 rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                  />
                </div>
                <input
                  type="text"
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="Prompt IA (optionnel)"
                  className="mt-2 w-full rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                />
              </div>

              {/* Options */}
              <div className="px-6 py-4 flex items-center gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-base">📅</span>
                <span className="flex-1 text-[13px] text-white">Délai entre comptes</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={delayBetween}
                  onChange={e => setDelayBetween(parseInt(e.target.value) || 0)}
                  className="w-20 rounded-xl px-4 py-2.5 text-[13px] text-center focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                />
                <span className="text-[13px] text-text2">min</span>
              </div>
              <div className="px-6 py-4 flex items-center gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-base">#️⃣</span>
                <span className="flex-1 text-[13px] text-white">Avec hashtags</span>
                <button
                  onClick={() => setWithHashtags(v => !v)}
                  className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                  style={{ background: withHashtags ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.08)' }}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${withHashtags ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Progress + Logs */}
              {(posting || progress > 0) && (
                <div className="px-6 py-5 space-y-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-white">Progression</span>
                    <span className="text-[13px] font-mono text-text2">{progress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-ok' : ''}`}
                      style={{ width: `${progress}%`, background: progress >= 100 ? undefined : 'linear-gradient(90deg,#7c3aed,#ec4899)' }}
                    />
                  </div>
                  <button
                    onClick={() => setShowLogs(v => !v)}
                    className="text-[12px] text-text2 hover:text-white flex items-center gap-1.5 transition-colors"
                  >
                    <span style={{ transform: showLogs ? 'rotate(90deg)' : 'rotate(0deg)' }} className="inline-block transition-transform">▶</span>
                    Journal détaillé ({logs.length})
                  </button>
                  {showLogs && logs.length > 0 && (
                    <div className="rounded-xl p-4 max-h-48 overflow-auto font-mono text-[12px] space-y-1"
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {logs.map((l, i) => (
                        <div key={i} className={`flex gap-2 ${
                          l.level === 'ok' ? 'text-ok' : l.level === 'error' ? 'text-danger' : l.level === 'warn' ? 'text-warn' : 'text-text2'
                        }`}>
                          <span className="text-text2/60 flex-shrink-0">{l.time}</span>
                          <span>{l.message}</span>
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="px-6 py-5 flex gap-3">
                <button
                  onClick={post}
                  disabled={posting || !bearer || selectedPhones.size === 0 || !filePath}
                  className="flex-[2] py-3 rounded-xl text-[13px] font-black text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: posting || !bearer || selectedPhones.size === 0 || !filePath
                      ? 'rgba(255,255,255,0.06)' : 'linear-gradient(130deg,#7c3aed,#ec4899)',
                    boxShadow: posting || !bearer || selectedPhones.size === 0 || !filePath
                      ? 'none' : '0 4px 24px -4px rgba(124,58,237,0.5)',
                  }}>
                  {posting ? `⏳ En cours…` : `⚡ Lancer — ${selectedPhones.size} compte${selectedPhones.size !== 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={() => setShowScheduleModal(true)}
                  disabled={posting || !bearer || selectedPhones.size === 0 || !filePath}
                  className="flex-1 py-3 rounded-xl text-[13px] font-black transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(37,99,235,0.3)', color: '#60a5fa' }}>
                  📅 Programmer
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Bank picker modal */}
      {showBankPicker && (
        <BankPicker
          user={user}
          mode="single"
          onSelect={([path]) => { if (path) setFilePath(path); setShowBankPicker(false) }}
          onClose={() => setShowBankPicker(false)}
        />
      )}

      {/* Schedule modal */}
      {showScheduleModal && (
        <ScheduleModal
          type="posting"
          phonesCount={selectedPhones.size}
          videosCount={filePath ? 1 : 0}
          videoTitle={filePath?.split(/[\\/]/).pop()}
          onConfirm={schedulePost}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
    </div>
  )
}
