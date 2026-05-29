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
import { loadPostingOpts, savePostingOpts, buildScheduleTimes, type PostingOpts } from '@/lib/postingOpts'
import { PostingOptions } from '@/components/PostingOptions'
import { playSuccess } from '@/lib/sounds'
import { useT, useLang } from '@/lib/i18n'
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

// Avatar color palette — deterministic by name
const AVATAR_COLORS = [
  ['#7C3AED','#A855F7'], ['#2563EB','#60A5FA'], ['#059669','#34D399'],
  ['#D97706','#FBBF24'], ['#DC2626','#F87171'], ['#7C3AED','#EC4899'],
]
function avatarGradient(name: string) {
  const i = (name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length
  return `linear-gradient(135deg,${AVATAR_COLORS[i][0]},${AVATAR_COLORS[i][1]})`
}

export function Posting({ user }: PostingProps) {
  const t = useT()
  const { lang } = useLang()
  const { currentOrg, role, perms }    = useOrg()
  const credits = useCredits()
  const [phones, setPhones]            = useState<Phone[]>([])
  const s                              = getPostingState()
  const [selectedPhones, _setSelPhones]= useState<Set<string>>(s.selectedPhones)
  const [filePath, _setFilePath]       = useState<string | null>(s.filePath)
  const [caption, _setCaption]         = useState(s.caption)
  const [topic, setTopic]              = useState('')
  const [withHashtags, setWithHashtags]= useState(false)
  const [customPrompt, setCustomPrompt]= useState('')
  const [postingOpts, setPostingOpts]  = useState<PostingOpts>(loadPostingOpts)
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
  const [aiExpanded, setAiExpanded]    = useState(false)
  const logEndRef                      = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const unsub = subscribePosting(() => {
      const st = getPostingState()
      _setPosting(st.posting)
      _setProgress(st.progress)
      _setLogs(st.logs)
    })
    return unsub
  }, [])

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
    if (!groqKey) { log('❌ Missing Groq key — Settings', 'error'); return }
    if (!window.electronAPI?.groqRequest) return
    setGenerating(true)
    try {
      const subject = topic.trim() || 'lifestyle Instagram content creator'
      const systemContent = withHashtags
        ? 'Tu génères des descriptions Instagram virales en français. Hook fort + body engageant + CTA + 10-15 hashtags pertinents. Max 2200 caractères.'
        : 'Tu génères des descriptions Instagram virales en français. Hook fort + body engageant + CTA. Sans hashtags. Max 2200 caractères.'
      const userContent = `Génère une description Instagram${customPrompt.trim() ? ` (${customPrompt.trim()})` : ''} pour : ${subject}. Réponds uniquement avec la description finale, sans préambule.`
      const r = await window.electronAPI.groqRequest({
        apiKey: groqKey,
        model: 'llama-3.1-8b-instant',
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
        log(`❌ Generation failed: ${r.error}`, 'error')
      }
    } catch (e) {
      log(`❌ ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    setGenerating(false)
  }

  async function schedulePost(scheduledAt: Date) {
    if (!bearer)                  { log('Missing GéeLark token — Settings', 'error'); return }
    if (selectedPhones.size === 0){ log('Select at least one phone', 'warn'); return }
    if (!filePath)                { log('Select a video', 'warn'); return }
    setShowScheduleModal(false)

    const phoneList = phones.filter(p => selectedPhones.has(p.id))
    setPosting(true); setLogs([]); setProgress(5)
    try {
      log('📤 Uploading video to GéeLark…')
      const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
      if (!up.ok || !up.token) { log(`❌ Upload failed: ${up.error}`, 'error'); return }
      log(`✅ Video ready (token: ${up.token.slice(0, 12)}…)`, 'ok')
      await createScheduledPost({
        userId: user.id, orgId: currentOrg?.id ?? null,
        createdByName: user.email?.split('@')[0] ?? 'Moi',
        type: 'posting', scheduledAt,
        phones: phoneList.map(p => ({ id: p.id, geelark_id: p.geelark_id, phone_name: p.phone_name, ig_username: p.ig_username })),
        videos: [{ token: up.token, title: filePath.split(/[\\/]/).pop() ?? 'video' }],
        caption, delayMinutes: postingOpts.intervalMode !== 'none' ? postingOpts.intervalMin : 0, mode: 'seq', bearerToken: bearer, reelsTrial: postingOpts.reelsTrial,
      })
      log(`📅 Scheduled for ${fmtScheduledTime(scheduledAt.toISOString())} — ${phoneList.length} phone(s)`, 'ok')
    } catch (err: any) {
      log(`❌ Erreur: ${err.message}`, 'error')
    } finally {
      setPosting(false); setProgress(0)
    }
  }

  async function post() {
    if (!bearer)               { log('Missing GéeLark token — Settings', 'error'); return }
    if (selectedPhones.size === 0) { log('Select at least one phone', 'warn'); return }
    if (!filePath)             { log('Select a video', 'warn'); return }

    const phoneList = phones.filter(p => selectedPhones.has(p.id))
    const total     = phoneList.length



    playSuccess()
    setPosting(true); setLogs([]); setProgress(0)

    logActivity({
      orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '',
      action: 'posting_launched',
      details: { phones: phoneList.map(p => p.ig_username ?? p.phone_name), count: total, file: filePath?.split(/[\\/]/).pop() },
    })

    try {
      log('📤 Uploading video to GéeLark…')
      setProgress(5)
      const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
      if (!up.ok || !up.token) { log(`❌ Upload failed: ${up.error}`, 'error'); setPosting(false); return }
      const videoToken = up.token
      log(`✅ Video uploaded (token: ${videoToken.slice(0, 12)}…)`, 'ok')
      setProgress(20)

      const geelarkIds = phoneList.map(p => p.geelark_id)
      log(`📱 Starting ${total} phone${total > 1 ? 's' : ''}…`)
      const startRes = await geelark(bearer, '/phone/start', { ids: geelarkIds })
      const started  = (startRes['data'] as Record<string, number>)?.['successAmount'] ?? 0
      log(`  ${started} started`, started > 0 ? 'ok' : 'warn')
      setProgress(35)

      log('⏳ Attente 30s (boot)…')
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000))
        setProgress(35 + Math.round((i / 30) * 25))
      }

      setProgress(60)
      log('🎬 Creating post tasks…')
      const taskIds: Record<string, string> = {}
      const scheduleTimes = buildScheduleTimes(phoneList.length, postingOpts)
      if (postingOpts.intervalMode !== 'none' && phoneList.length > 1) {
        const lastMin = Math.round((scheduleTimes[scheduleTimes.length - 1] - scheduleTimes[0]) / 60)
        log(`⏱ Interval enabled — last post in ~${lastMin} min`, 'info')
      }

      for (let pi = 0; pi < phoneList.length; pi++) {
        const phone = phoneList[pi]
        const taskRes = await geelark(bearer, '/rpa/task/instagramPubReels', {
          id:          phone.geelark_id,
          scheduleAt:  scheduleTimes[pi],
          description: caption,
          video:       [videoToken],
          ...(postingOpts.reelsTrial ? { shareType: 2 } : {}),
        })
        if (taskRes['code'] === 0) {
          const tid = (taskRes['data'] as Record<string, unknown>)?.['id'] as string
          taskIds[phone.geelark_id] = tid
          log(`  ✅ Task created for ${phone.phone_name}`, 'ok')
        } else {
          log(`  ❌ ${phone.phone_name}: ${taskRes['msg'] ?? taskRes['code']}`, 'error')
        }
      }
      setProgress(70)

      if (Object.keys(taskIds).length === 0) {
        log('❌ No tasks created.', 'error')
      } else {
        log(`⏳ Tracking ${Object.keys(taskIds).length} task(s)…`)
        const pending  = new Set(Object.values(taskIds))
        const deadline = Date.now() + 8 * 60 * 1000
        const STATUS: Record<number, string> = { 1: '⏳ Pending', 2: '🔄 In progress', 3: '✅ Done', 4: '❌ Failed', 7: '🚫 Cancelled' }

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
            log(`ℹ️ /task/query response (debug): keys=${Object.keys(d).join(',') || '(empty)'}`, 'warn')
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
        if (pending.size > 0) log(`⏳ ${pending.size} task(s) with no response — continuing (posts likely done)`, 'warn')
      }

      log('🛑 Stopping phones…')
      await geelark(bearer, '/phone/stop', { ids: geelarkIds })
      setProgress(100)
      log('🎉 Done!', 'ok')

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
  const canPost = !posting && !!bearer && selectedPhones.size > 0 && !!filePath

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────────────────── */}
      <aside className="w-[260px] flex-shrink-0 flex flex-col" style={{
        background: 'linear-gradient(180deg, #09090F 0%, #07070B 100%)',
        borderRight: '1px solid rgba(139,92,246,0.1)',
      }}>

        {/* Sidebar header */}
        <div className="flex-shrink-0 px-4 pt-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="1" width="5" height="5" rx="1.5" fill="#A78BFA"/>
                  <rect x="8" y="1" width="5" height="5" rx="1.5" fill="#A78BFA" opacity=".5"/>
                  <rect x="1" y="8" width="5" height="5" rx="1.5" fill="#A78BFA" opacity=".5"/>
                  <rect x="8" y="8" width="5" height="5" rx="1.5" fill="#A78BFA" opacity=".3"/>
                </svg>
              </div>
              <span className="text-[13px] font-black text-white tracking-tight">{t('postingAccountsLabel')}</span>
            </div>
            {selectedPhones.size > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white"
                style={{ background: 'linear-gradient(130deg,#7C3AED,#A855F7)', boxShadow: '0 2px 10px -2px rgba(124,58,237,0.5)' }}>
                {selectedPhones.size}
              </span>
            )}
          </div>

          {/* Group select */}
          {groups.length > 1 && (
            <div className="relative mb-2.5">
              <select value={groupFilter} onChange={e => setGroup(e.target.value)}
                className="w-full appearance-none rounded-xl px-3 py-2 pr-7 text-[12px] focus:outline-none transition-all"
                style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', color: '#C4B5FD' }}>
                {groups.map(g => <option key={g} value={g} style={{ background: '#0E0E16', color: '#fff' }}>{g}</option>)}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3.5L5 6.5L8 3.5" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="5" cy="5" r="3.5" stroke="rgba(139,92,246,0.5)" strokeWidth="1.3"/>
              <path d="M7.5 7.5L10 10" stroke="rgba(139,92,246,0.5)" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input type="text" placeholder={t('search') + '…'} value={phoneSearch}
              onChange={e => setPhoneSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-xl text-[12px] placeholder:text-text3 focus:outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.12)', color: '#E2E8F0' }}
            />
          </div>
        </div>

        {/* Select all / none */}
        <div className="flex-shrink-0 flex items-center gap-0 mx-4 mb-2 rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
            className="flex-1 py-1.5 text-[11px] font-bold text-accent hover:bg-accent/10 transition-colors">
            {t('selectAll')}
          </button>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', height: 20 }} />
          <button onClick={() => setSelPhones(new Set())}
            className="flex-1 py-1.5 text-[11px] text-text2 hover:text-white hover:bg-white/[0.04] transition-colors">
            {t('deselect')}
          </button>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', height: 20 }} />
          <span className="px-3 text-[11px] font-medium" style={{ color: 'rgba(148,163,184,0.4)' }}>
            {visiblePhones.length}
          </span>
        </div>

        {/* Phone list */}
        <div className="flex-1 overflow-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {visiblePhones.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="7" y="2" width="14" height="24" rx="3" stroke="rgba(139,92,246,0.3)" strokeWidth="1.5"/>
                <circle cx="14" cy="22" r="1.5" fill="rgba(139,92,246,0.3)"/>
              </svg>
              <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.3)' }}>{t('noPhones')}</p>
            </div>
          ) : visiblePhones.map(phone => {
            const checked = selectedPhones.has(phone.id)
            const initials = (phone.ig_username?.[0] ?? phone.phone_name?.[0] ?? '?').toUpperCase()
            return (
              <button key={phone.id} onClick={() => togglePhone(phone.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all relative"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.025)',
                  background: checked ? 'rgba(139,92,246,0.09)' : 'transparent',
                }}>

                {/* Left accent bar */}
                {checked && (
                  <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                    style={{ background: 'linear-gradient(180deg,#7C3AED,#A855F7)' }} />
                )}

                {/* Avatar */}
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-black flex-shrink-0 transition-all"
                  style={checked
                    ? { background: avatarGradient(phone.phone_name ?? ''), color: '#fff', boxShadow: '0 2px 8px -2px rgba(124,58,237,0.5)' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.6)' }}>
                  {initials}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] font-semibold truncate transition-colors ${checked ? 'text-white' : 'text-text2'}`}>
                    {phone.phone_name}
                  </p>
                  {phone.ig_username && (
                    <p className="text-[10px] truncate" style={{ color: checked ? '#A78BFA' : 'rgba(139,92,246,0.4)' }}>
                      @{phone.ig_username}
                    </p>
                  )}
                </div>

                {/* Checkbox */}
                <div className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                  style={checked
                    ? { background: 'linear-gradient(135deg,#7C3AED,#A855F7)', boxShadow: '0 0 8px rgba(139,92,246,0.4)' }
                    : { border: '1px solid rgba(255,255,255,0.1)' }}>
                  {checked && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Sidebar footer */}
        <div className="flex-shrink-0 p-4 mt-auto" style={{ borderTop: '1px solid rgba(139,92,246,0.08)' }}>
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-3"
            style={{ background: selectedPhones.size > 0 ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selectedPhones.size > 0 ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: selectedPhones.size > 0 ? '#22C55E' : 'rgba(148,163,184,0.2)' }} />
            <p className="text-[12px] font-semibold" style={{ color: selectedPhones.size > 0 ? '#E2E8F0' : 'rgba(148,163,184,0.4)' }}>
              {selectedPhones.size > 0
                ? `${selectedPhones.size} ${selectedPhones.size !== 1 ? t('postingAccountsSelected') : t('postingAccountSelected')}`
                : t('postingNoneSelected')}
            </p>
          </div>
        </div>
      </aside>

      {/* ── MAIN FORM ──────────────────────────────────────────────────────────── */}
      <div className="h-full flex flex-col overflow-hidden flex-1" style={{ background: '#07070B' }}>

        {/* Page header */}
        <div className="flex-shrink-0 px-8 pt-6 pb-5 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
          <div>
            <h1 className="text-[22px] font-black tracking-tight leading-none" style={{
              background: 'linear-gradient(135deg, #FFFFFF 0%, rgba(196,181,253,0.85) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{t('newPost')}</h1>
            <p className="text-[12px] mt-1" style={{ color: 'rgba(148,163,184,0.5)' }}>
              Reel Instagram · GéeLark Cloud
            </p>
          </div>
          <button onClick={() => { setFilePath(null); setCaption(''); setTopic('') }}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-medium transition-all hover:bg-white/[0.04]"
            style={{ border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.6)' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M9.5 2A5 5 0 1 0 10 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M9.5 0V2.5H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t('reset')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <div className="px-8 py-6 space-y-4">

            {/* Warning */}
            {!bearer && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl text-[12px]"
                style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <span style={{ fontSize: 12 }}>⚠</span>
                </div>
                <p style={{ color: '#FCD34D' }}>{t('bearerMissingWarning')} <strong>{t('navSettings')}</strong></p>
              </div>
            )}

            {/* ── VIDEO SECTION ─────────────────────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{
              background: '#0E0E16',
              border: '1px solid rgba(139,92,246,0.12)',
              boxShadow: '0 4px 32px -4px rgba(0,0,0,0.5)',
            }}>
              <div className="flex gap-5 p-5">
                {/* Phone frame preview */}
                <div className="flex-shrink-0 relative" style={{ width: 90 }}>
                  <div className="relative rounded-2xl overflow-hidden" style={{
                    width: 90, height: 160,
                    background: filePath ? '#000' : 'linear-gradient(145deg, #111118, #0D0D14)',
                    border: `1.5px solid ${filePath ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    boxShadow: filePath ? '0 0 20px -4px rgba(139,92,246,0.35), inset 0 0 0 1px rgba(255,255,255,0.05)' : 'inset 0 0 0 1px rgba(255,255,255,0.03)',
                  }}>
                    {filePath ? (
                      <VideoThumbnail filePath={filePath} />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2 5C2 3.9 2.9 3 4 3H9.5L12 5.5V11c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V5z" stroke="rgba(139,92,246,0.6)" strokeWidth="1.2" fill="rgba(139,92,246,0.1)"/>
                            <path d="M5.5 5.5v3l3-1.5-3-1.5z" fill="rgba(139,92,246,0.6)"/>
                          </svg>
                        </div>
                        <p className="text-[9px] text-center leading-tight" style={{ color: 'rgba(148,163,184,0.3)' }}>9:16<br/>Reel</p>
                      </div>
                    )}
                    {/* Phone frame top notch */}
                    <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
                  </div>
                  {/* Glow effect when video selected */}
                  {filePath && (
                    <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: '0 0 30px -8px rgba(139,92,246,0.4)' }} />
                  )}
                </div>

                {/* File info + pickers */}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest font-bold mb-1.5" style={{ color: 'rgba(139,92,246,0.6)' }}>{t('fileLabel')}</p>
                    <p className="text-[13px] font-semibold leading-snug" style={{ color: fileName ? '#E2E8F0' : 'rgba(148,163,184,0.3)' }}>
                      {fileName ?? t('noVideoSelected')}
                    </p>
                    {filePath && (
                      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(34,197,94,0.7)' }}>{t('readyToPost')}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button onClick={() => setShowBankPicker(true)}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[12px] font-bold transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{ background: 'linear-gradient(130deg,#7C3AED,#A855F7)', color: '#fff', boxShadow: '0 4px 16px -4px rgba(124,58,237,0.5)' }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="1" y="1" width="4" height="4" rx="1" fill="white" opacity=".8"/>
                        <rect x="7" y="1" width="4" height="4" rx="1" fill="white" opacity=".6"/>
                        <rect x="1" y="7" width="4" height="4" rx="1" fill="white" opacity=".6"/>
                        <rect x="7" y="7" width="4" height="4" rx="1" fill="white" opacity=".4"/>
                      </svg>
                      {t('postFromBank')}
                    </button>
                    <div className="flex gap-2">
                      <button onClick={pickLocalFile}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-white/[0.06]"
                        style={{ border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.7)' }}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M5.5 7V1M3 3.5L5.5 1L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M1 8v1.5C1 10.3 1.7 11 2.5 11h6c.8 0 1.5-.7 1.5-1.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        {t('localFile')}
                      </button>
                      {filePath && (
                        <button onClick={() => setFilePath(null)}
                          className="px-3 py-2 rounded-xl text-[12px] transition-all hover:bg-danger/10"
                          style={{ border: '1px solid rgba(239,68,68,0.2)', color: 'rgba(239,68,68,0.7)' }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── DESCRIPTION SECTION ───────────────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{
              background: '#0E0E16',
              border: '1px solid rgba(139,92,246,0.12)',
              boxShadow: '0 4px 32px -4px rgba(0,0,0,0.5)',
            }}>
              <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 2h10M1 5h7M1 8h8M1 11h5" stroke="#A78BFA" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <span className="text-[12px] font-bold text-white">{t('postingDescriptionLabel')}</span>
                </div>
                <span className={`text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-lg ${caption.length > 2200 ? 'text-danger' : 'text-text3'}`}
                  style={{ background: caption.length > 2200 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)' }}>
                  {caption.length}/2200
                </span>
              </div>

              <div className="p-5 space-y-3">
                <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5}
                  placeholder={t('postingCaptionPlaceholder')}
                  className="w-full rounded-xl px-4 py-3 text-[13px] placeholder:text-text3 resize-none focus:outline-none transition-all leading-relaxed"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.1)', color: '#E2E8F0',
                    fontFamily: 'inherit' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(139,92,246,0.35)'; e.target.style.background = 'rgba(139,92,246,0.04)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(139,92,246,0.1)'; e.target.style.background = 'rgba(255,255,255,0.03)' }}
                />

                {/* AI Generation */}
                <div className="rounded-xl overflow-hidden" style={{
                  border: `1px solid ${aiExpanded ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.12)'}`,
                  background: aiExpanded ? 'rgba(139,92,246,0.05)' : 'rgba(139,92,246,0.03)',
                  transition: 'all 0.2s ease',
                }}>
                  {/* AI header toggle */}
                  <button onClick={() => setAiExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 transition-all hover:bg-accent/5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.2)', boxShadow: aiExpanded ? '0 0 10px rgba(139,92,246,0.3)' : 'none' }}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M5.5 1L6.8 4.2H10.2L7.5 6.1L8.5 9.5L5.5 7.5L2.5 9.5L3.5 6.1L0.8 4.2H4.2L5.5 1Z" fill="#A78BFA"/>
                        </svg>
                      </div>
                      <span className="text-[12px] font-bold" style={{ color: '#C4B5FD' }}>{t('generateWithAI')}</span>
                      {!groqKey && <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)' }}>{t('postingGroqRequired')}</span>}
                    </div>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                      style={{ transform: aiExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'rgba(139,92,246,0.5)' }}>
                      <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* AI controls (expanded) */}
                  {aiExpanded && (
                    <div className="px-4 pb-4 space-y-2.5" style={{ borderTop: '1px solid rgba(139,92,246,0.1)' }}>
                      <div className="pt-3 flex gap-2">
                        <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
                          placeholder={t('topicPlaceholder')}
                          className="flex-1 px-3 py-2 rounded-xl text-[12px] placeholder:text-text3 focus:outline-none transition-all"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.15)', color: '#E2E8F0' }}
                        />
                        <button onClick={generateCaption} disabled={!groqKey || generating}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-all disabled:opacity-40 hover:opacity-90 active:scale-95"
                          style={{ background: 'linear-gradient(130deg,#7C3AED,#A855F7)', color: '#fff', boxShadow: '0 2px 12px -3px rgba(124,58,237,0.5)', minWidth: 90 }}>
                          {generating ? (
                            <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> {t('generatingEllipsis')}</>
                          ) : (
                            <><span style={{ fontSize: 11 }}>✨</span> {t('generateBtn2')}</>
                          )}
                        </button>
                      </div>
                      <input type="text" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                        placeholder={t('additionalInstructions')}
                        className="w-full px-3 py-2 rounded-xl text-[12px] placeholder:text-text3 focus:outline-none transition-all"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.12)', color: '#E2E8F0' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── OPTIONS SECTION ───────────────────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{
              background: '#0E0E16',
              border: '1px solid rgba(139,92,246,0.12)',
              boxShadow: '0 4px 32px -4px rgba(0,0,0,0.5)',
            }}>
              <div className="flex items-center gap-2.5 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="2" stroke="#A78BFA" strokeWidth="1.2"/>
                    <path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.5 2.5l1 1M8.5 8.5l1 1M2.5 9.5l1-1M8.5 3.5l1-1" stroke="#A78BFA" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className="text-[12px] font-bold text-white">{t('postingOptionsLabel')}</span>
              </div>

              <div className="px-5 py-4 space-y-0 divide-y" style={{ '--tw-divide-opacity': '0.03' } as any}>
                <PostingOptions opts={postingOpts} onChange={setPostingOpts} />

                {/* Hashtags toggle */}
                <div className="flex items-center gap-3 py-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: withHashtags ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 11 }}>#</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white font-medium">{t('withHashtags')}</p>
                    <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.4)' }}>{t('withHashtagsDesc')}</p>
                  </div>
                  <button onClick={() => setWithHashtags(v => !v)}
                    className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
                    style={{ background: withHashtags ? 'linear-gradient(130deg,#7C3AED,#A855F7)' : 'rgba(255,255,255,0.07)', boxShadow: withHashtags ? '0 0 12px rgba(139,92,246,0.4)' : 'none' }}>
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-200 ${withHashtags ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── PROGRESS / LOGS ───────────────────────────────────────────── */}
            {(posting || progress > 0) && (
              <div className="rounded-2xl overflow-hidden" style={{
                background: '#0E0E16',
                border: '1px solid rgba(139,92,246,0.15)',
                boxShadow: posting ? '0 0 30px -8px rgba(139,92,246,0.3)' : 'none',
              }}>
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {posting && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
                      <span className="text-[13px] font-bold text-white">{posting ? t('publishingProgress') : t('publishingDone')}</span>
                    </div>
                    <span className="text-[14px] font-black font-mono tabular-nums" style={{ color: progress >= 100 ? '#22C55E' : '#A78BFA' }}>
                      {progress}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className={`h-full rounded-full transition-all duration-700 ${progress >= 100 ? 'bg-ok' : 'sf-progress-bar'}`}
                      style={{ width: `${progress}%` }} />
                  </div>

                  {/* Logs toggle */}
                  <button onClick={() => setShowLogs(v => !v)}
                    className="flex items-center gap-1.5 text-[11px] transition-colors hover:text-white"
                    style={{ color: 'rgba(148,163,184,0.5)' }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                      style={{ transform: showLogs ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                      <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {t('logs')} ({logs.length})
                  </button>

                  {showLogs && logs.length > 0 && (
                    <div className="rounded-xl p-3 max-h-48 overflow-auto font-mono text-[11px] space-y-1"
                      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(139,92,246,0.1)' }}>
                      {logs.map((l, i) => (
                        <div key={i} className={`flex gap-2 ${l.level === 'ok' ? 'text-ok' : l.level === 'error' ? 'text-danger' : l.level === 'warn' ? 'text-warn' : 'text-text2'}`}>
                          <span className="flex-shrink-0" style={{ color: 'rgba(71,85,105,0.8)' }}>{l.time}</span>
                          <span>{l.message}</span>
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ACTION BUTTONS ────────────────────────────────────────────── */}
            <div className="pb-2 pt-1 flex gap-3">
              <button onClick={post} disabled={!canPost}
                className="flex-[2] py-3.5 rounded-2xl text-[14px] font-black text-white transition-all active:scale-[0.99] disabled:cursor-not-allowed relative overflow-hidden"
                style={canPost ? {
                  background: 'linear-gradient(130deg,#6D28D9,#7C3AED,#A855F7)',
                  boxShadow: '0 6px 30px -6px rgba(124,58,237,0.65), 0 0 0 1px rgba(168,85,247,0.3)',
                } : {
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  opacity: 0.5,
                }}>
                {/* Shimmer overlay */}
                {canPost && (
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)',
                    backgroundSize: '200% 100%',
                    animation: 'progressShimmer 3s linear infinite',
                  }} />
                )}
                {posting ? (
                  <span className="flex items-center justify-center gap-2.5">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    {t('publishingProgress')}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                      <path d="M7.5 1L9.5 6H14.5L10.5 9L12 14L7.5 11L3 14L4.5 9L0.5 6H5.5L7.5 1Z" fill="white"/>
                    </svg>
                    {t('launchPost')} {selectedPhones.size} {selectedPhones.size !== 1 ? t('postingAccountsSelected') : t('postingAccountSelected')}
                  </span>
                )}
              </button>

              <button onClick={() => setShowScheduleModal(true)} disabled={!canPost}
                className="flex-1 py-3.5 rounded-2xl text-[13px] font-bold transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#93C5FD' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="2" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M4 1v2M9 1v2M1 5h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M4 8h1M6.5 8h1M4 10h1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {t('scheduleBtn')}
              </button>
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
