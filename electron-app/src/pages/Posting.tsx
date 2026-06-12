import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
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
import { CREDIT_COSTS, useCredits } from '@/lib/credits'
import { startCreditRun } from '@/lib/withCredits'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ACCENT_L, OK, ERR, WARN } from '@/lib/theme'
import { useToast } from '@/components/Toast'

interface PostingProps { user: User }

const GEELARK = 'https://openapi.geelark.com/open/v1'

async function geelark(bearer: string, path: string, body: unknown) {
  const r = await window.electronAPI!.geelarkRequest({
    method: 'POST', url: `${GEELARK}${path}`,
    headers: { Authorization: `Bearer ${bearer}` }, body,
  })
  // r peut être undefined/null sur timeout IPC → ne jamais déréférencer à l'aveugle
  return (r?.data ?? {}) as Record<string, unknown>
}

/** Statut d'un téléphone pendant le run — affiché en direct dans la carte de progression */
type PhoneRunStatus = { status: 'pending' | 'posting' | 'done' | 'error'; detail?: string }

// Avatar color palette — deterministic by name
const AVATAR_COLORS = [
  ['#6366F1','#A855F7'], ['#2563EB','#60A5FA'], ['#059669','#34D399'],
  ['#D97706','#FBBF24'], ['#DC2626','#F87171'], ['#6366F1','#818CF8'],
]
function avatarGradient(name: string) {
  const i = (name?.charCodeAt(0) || 0) % AVATAR_COLORS.length
  return `linear-gradient(135deg,${AVATAR_COLORS[i][0]},${AVATAR_COLORS[i][1]})`
}

// SVG icons
const IconPhone = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>
  </svg>
)
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const IconCheck = () => (
  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
    <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IconVideo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>
  </svg>
)
const IconUpload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>
  </svg>
)
const IconGrid = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <rect x="1" y="1" width="4" height="4" rx="1" fill="white" opacity=".8"/>
    <rect x="7" y="1" width="4" height="4" rx="1" fill="white" opacity=".6"/>
    <rect x="1" y="7" width="4" height="4" rx="1" fill="white" opacity=".6"/>
    <rect x="7" y="7" width="4" height="4" rx="1" fill="white" opacity=".4"/>
  </svg>
)
const IconX = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)
const IconStar = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
  </svg>
)
const IconCalendar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
)
const IconSend = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/>
  </svg>
)
const IconReset = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
  </svg>
)
const IconChevronDown = ({ rotated }: { rotated?: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
    style={{ transform: rotated ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
    <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IconChevronRight = ({ rotated }: { rotated?: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
    style={{ transform: rotated ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
    <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IconWarning = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4"/><path d="M12 17h.01"/>
  </svg>
)
const IconSparkle = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M5.5 1L6.8 4.2H10.2L7.5 6.1L8.5 9.5L5.5 7.5L2.5 9.5L3.5 6.1L0.8 4.2H4.2L5.5 1Z" fill="#6366F1"/>
  </svg>
)
const IconSettings2 = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
)

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
  const toast = useToast()
  const [groqKey, setGroqKey]          = useState('')
  const [groupFilter, _setGroup]       = useState(loadLastGroup)
  const setGroup = (g: string) => { _setGroup(g); saveLastGroup(g) }
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
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [stopping, setStopping]        = useState(false)
  const [phoneRun, setPhoneRun]        = useState<Map<string, PhoneRunStatus>>(new Map())
  const [lastRun, setLastRun]          = useState<{ ok: number; err: number; total: number } | null>(null)
  const logEndRef                      = useRef<HTMLDivElement>(null)
  const stopRef                        = useRef(false)
  const activePhonesRef                = useRef<string[]>([])   // geelark_ids démarrés
  const activeTasksRef                 = useRef<string[]>([])   // tâches RPA créées

  function setPhoneRunStatus(id: string, st: PhoneRunStatus) {
    setPhoneRun(prev => { const next = new Map(prev); next.set(id, st); return next })
  }

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
      // Groupe mémorisé disparu (renommé/supprimé) → retour à « Tous »
      if (!grps.includes(loadLastGroup())) setGroup('Tous')
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
    if (posting)                  return
    if (!bearer)                  { log('Missing GéeLark token — Settings', 'error'); return }
    if (selectedPhones.size === 0){ log('Select at least one phone', 'warn'); return }
    if (!filePath)                { log('Select a video', 'warn'); return }
    if (caption.length > 2200)    { log('❌ Description trop longue (max 2200 caractères)', 'error'); return }
    // GéeLark expire les fichiers uploadés après 30 jours — bloque au-delà de 25
    if (scheduledAt.getTime() > Date.now() + 25 * 24 * 60 * 60 * 1000) {
      log('❌ Programmation limitée à 25 jours (les vidéos uploadées chez GéeLark expirent après 30 jours)', 'error')
      return
    }
    setShowScheduleModal(false)

    const phoneList = phones.filter(p => selectedPhones.has(p.id))
    // Verrou AVANT le débit (anti double-clic), rollback si échec du débit
    setPosting(true); setLogs([]); setProgress(5)

    // Crédits débités à la programmation (remboursés si annulation avant exécution)
    const run = await startCreditRun(credits.ownerId, CREDIT_COSTS.posting, 1)
    if (!run.ok) {
      log(`❌ ${run.error}`, 'error')
      setPosting(false); setProgress(0)
      return
    }
    if (typeof run.balance === 'number') credits.setBalance(run.balance)
    log(`💳 ${CREDIT_COSTS.posting} crédit débité — remboursé si tu annules avant l'exécution`, 'ok')

    try {
      log('📤 Uploading video to GéeLark…')
      const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
      if (!up.ok || !up.token) { run.markFailed(1); log(`❌ Upload failed: ${up.error}`, 'error'); return }
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
      toast.show({ title: 'Publication programmée 📅', body: fmtScheduledTime(scheduledAt.toISOString()), kind: 'ok' })
    } catch (err: any) {
      run.markFailed(1)
      log(`❌ Erreur: ${err.message}`, 'error')
    } finally {
      const { refunded } = await run.settle()
      if (refunded > 0) { log(`💳 ${refunded} crédit(s) remboursé(s)`, 'ok'); credits.refresh() }
      setPosting(false); setProgress(0)
    }
  }

  /** Arrêt d'urgence : annule les tâches RPA et éteint les téléphones démarrés */
  async function stopRun() {
    stopRef.current = true
    setStopping(true)
    log('🛑 Stop demandé — annulation des tâches et extinction des téléphones…', 'warn')
    try {
      if (activeTasksRef.current.length > 0) {
        await geelark(bearer, '/rpa/task/cancel', { ids: activeTasksRef.current })
        log(`  ${activeTasksRef.current.length} tâche(s) annulée(s)`, 'warn')
      }
    } catch (e) {
      log(`  ⚠️ annulation tâches: ${e instanceof Error ? e.message : String(e)}`, 'warn')
    }
    try {
      if (activePhonesRef.current.length > 0) {
        await geelark(bearer, '/phone/stop', { ids: activePhonesRef.current })
        log(`  ${activePhonesRef.current.length} téléphone(s) éteint(s)`, 'warn')
      }
    } catch (e) {
      log(`  ⚠️ extinction téléphones: ${e instanceof Error ? e.message : String(e)}`, 'warn')
    }
    activeTasksRef.current = []
    activePhonesRef.current = []
    setStopping(false)
  }

  async function post() {
    if (posting)               return
    if (!bearer)               { log('Missing GéeLark token — Settings', 'error'); return }
    if (selectedPhones.size === 0) { log('Select at least one phone', 'warn'); return }
    if (!filePath)             { log('Select a video', 'warn'); return }
    if (caption.length > 2200) { log('❌ Description trop longue (max 2200 caractères)', 'error'); return }

    const phoneList = phones.filter(p => selectedPhones.has(p.id))
    const total     = phoneList.length

    // Verrou AVANT le débit de crédits (anti double-clic), rollback si échec
    setPosting(true); setLogs([]); setProgress(0); setLastRun(null)
    stopRef.current = false
    activePhonesRef.current = []
    activeTasksRef.current  = []
    setPhoneRun(new Map(phoneList.map(p => [p.id, { status: 'pending' as const }])))

    const run = await startCreditRun(credits.ownerId, CREDIT_COSTS.posting, total)
    if (!run.ok) {
      log(`❌ ${run.error} (requis: ${total * CREDIT_COSTS.posting} pour ${total} téléphone${total > 1 ? 's' : ''})`, 'error')
      setPosting(false)
      return
    }
    if (typeof run.balance === 'number') credits.setBalance(run.balance)

    playSuccess()

    // Compteurs réels — pilotent le toast final et le remboursement
    let okN = 0
    let errN = 0
    const markPhoneFailed = (phone: Phone, detail?: string) => {
      errN++
      run.markFailed(1)
      setPhoneRunStatus(phone.id, { status: 'error', detail })
    }

    logActivity({
      orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '',
      action: 'posting_launched',
      details: { phones: phoneList.map(p => p.ig_username ?? p.phone_name), count: total, file: filePath?.split(/[\\/]/).pop() },
    })

    try {
      log('📤 Uploading video to GéeLark…')
      setProgress(5)
      const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
      if (!up.ok || !up.token) {
        // Échec d'upload : rien n'a été publié → tout est remboursé au settle()
        log(`❌ Upload failed: ${up.error}`, 'error')
        phoneList.forEach(p => markPhoneFailed(p, 'Upload échoué'))
        setProgress(0)
        return
      }
      const videoToken = up.token
      log(`✅ Video uploaded (token: ${videoToken.slice(0, 12)}…)`, 'ok')
      setProgress(20)

      if (stopRef.current) { phoneList.forEach(p => markPhoneFailed(p, 'Stoppé')); setProgress(0); return }

      const geelarkIds = phoneList.map(p => p.geelark_id)
      log(`📱 Starting ${total} phone${total > 1 ? 's' : ''}…`)
      const startRes = await geelark(bearer, '/phone/start', { ids: geelarkIds })
      activePhonesRef.current = [...geelarkIds]
      const started  = (startRes['data'] as Record<string, number>)?.['successAmount'] ?? 0
      log(`  ${started} started`, started > 0 ? 'ok' : 'warn')
      setProgress(35)

      log('⏳ Attente 30s (boot)…')
      for (let i = 0; i < 30; i++) {
        if (stopRef.current) break
        await new Promise(r => setTimeout(r, 1000))
        setProgress(35 + Math.round((i / 30) * 25))
      }
      if (stopRef.current) {
        phoneList.forEach(p => markPhoneFailed(p, 'Stoppé'))
        log('⏹ Run interrompu pendant le boot', 'warn')
        return
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
        if (stopRef.current) { markPhoneFailed(phone, 'Stoppé'); continue }
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
          activeTasksRef.current = [...activeTasksRef.current, tid]
          setPhoneRunStatus(phone.id, { status: 'posting' })
          log(`  ✅ Task created for ${phone.phone_name}`, 'ok')
        } else {
          markPhoneFailed(phone, String(taskRes['msg'] ?? taskRes['code']))
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
        while (pending.size > 0 && Date.now() < deadline && !stopRef.current) {
          await new Promise(r => setTimeout(r, 15000))
          if (stopRef.current) { log('⏹ Polling interrompu (stop)', 'warn'); break }
          let qRes: Record<string, unknown>
          try {
            qRes = await geelark(bearer, '/task/query', { ids: [...pending] })
          } catch (pollErr) {
            log(`⚠️ Poll /task/query raté: ${pollErr instanceof Error ? pollErr.message : String(pollErr)} — on réessaie…`, 'warn')
            continue
          }
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
              activeTasksRef.current = activeTasksRef.current.filter(id => id !== tid)
              const level = status === 3 ? 'ok' : 'error'
              const fail  = item['failDesc'] ? ` — ${item['failDesc']}` : ''
              log(`${STATUS[status] ?? status} ${name}${fail}`, level)
              if (phone) {
                if (status === 3) { okN++; setPhoneRunStatus(phone.id, { status: 'done' }) }
                else markPhoneFailed(phone, (item['failDesc'] as string | undefined) ?? STATUS[status])
              }
            }
          }
          const done = Object.keys(taskIds).length - pending.size
          setProgress(70 + Math.round((done / Object.keys(taskIds).length) * 25))
        }
        if (pending.size > 0 && stopRef.current) {
          // Stop utilisateur : les tâches restantes sont annulées → remboursées
          for (const tid of pending) {
            const phone = phoneList.find(p => taskIds[p.geelark_id] === tid)
            if (phone) markPhoneFailed(phone, 'Stoppé')
          }
        } else if (pending.size > 0) {
          log(`⏳ ${pending.size} task(s) with no response — continuing (posts likely done)`, 'warn')
          // Sans réponse = probablement publié → compté comme réussi, pas remboursé
          for (const tid of pending) {
            const phone = phoneList.find(p => taskIds[p.geelark_id] === tid)
            if (phone) { okN++; setPhoneRunStatus(phone.id, { status: 'done' }) }
          }
        }
      }

      if (!stopRef.current) {
        log('🛑 Stopping phones…')
        await geelark(bearer, '/phone/stop', { ids: geelarkIds })
        activePhonesRef.current = []
      }
      setProgress(100)
      log(errN === 0 ? '🎉 Done!' : `🏁 Terminé — ${errN} échec${errN > 1 ? 's' : ''}`, errN === 0 ? 'ok' : 'warn')
      setLastRun({ ok: total - errN, err: errN, total })
      toast.show({
        title: errN === 0 ? 'Publication terminée ✓' : 'Publication terminée avec erreurs',
        body: `${total - errN}/${total} réussie${total - errN > 1 ? 's' : ''}${errN ? ` · ${errN} échec${errN > 1 ? 's' : ''}` : ''}`,
        kind: errN === 0 ? 'ok' : 'error',
      })

    } catch (e: unknown) {
      log(`❌ Erreur: ${e instanceof Error ? e.message : String(e)}`, 'error')
      // Arrêt d'urgence : ne jamais laisser des téléphones cloud allumés (facturation)
      const stuck = activePhonesRef.current
      if (stuck.length > 0) {
        log(`🛑 Arrêt d'urgence de ${stuck.length} téléphone(s)…`, 'warn')
        geelark(bearer, '/phone/stop', { ids: stuck }).catch(() => {})
        activePhonesRef.current = []
      }
      // Tout ce qui n'a pas abouti est remboursé
      const remaining = total - okN - errN
      if (remaining > 0) { run.markFailed(remaining); errN += remaining }
      phoneList.forEach(p => {
        const st = phoneRun.get(p.id)
        if (!st || st.status === 'pending' || st.status === 'posting') setPhoneRunStatus(p.id, { status: 'error', detail: 'Erreur fatale' })
      })
      setProgress(0)
      setLastRun({ ok: okN, err: errN, total })
    } finally {
      const { refunded } = await run.settle()
      if (refunded > 0) { log(`💳 ${refunded} crédit(s) remboursé(s)`, 'ok'); credits.refresh() }
      activePhonesRef.current = []
      activeTasksRef.current  = []
      setPosting(false)
    }
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
    <div className="sf-page anim-page" style={{ flexDirection: 'row', overflow: 'hidden' }}>

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Phone selector
      ══════════════════════════════════════════════════════════════════════ */}
      <aside className="flex-shrink-0 flex flex-col" style={{
        width: 268,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}>

        {/* Panel header */}
        <div className="flex-shrink-0 px-4 pt-5 pb-3 sf-anim-slide-up sf-d50" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--accent-glow)' }}>
                <IconPhone />
              </div>
              <span className="text-[13px] font-bold text-text">{t('postingAccountsLabel')}</span>
            </div>
            {selectedPhones.size > 0 && (
              <span className="sf-badge sf-badge-accent anim-scale-in">
                {selectedPhones.size}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-text3">
              <IconSearch />
            </span>
            <input
              type="text"
              placeholder={t('search') + '…'}
              value={phoneSearch}
              onChange={e => setPhoneSearch(e.target.value)}
              className="sf-input pl-9 text-[12px]"
              style={{ height: 32 }}
            />
          </div>

          {/* Group filter */}
          {groups.length > 1 && (
            <div className="relative">
              <select
                value={groupFilter}
                onChange={e => setGroup(e.target.value)}
                className="sf-input text-[12px] appearance-none pr-7"
                style={{ height: 32, color: groupFilter !== 'Tous' ? 'var(--accent-glow)' : undefined }}
              >
                {groups.map(g => (
                  <option key={g} value={g} style={{ background: 'var(--surface-2)', color: '#fff' }}>{g}</option>
                ))}
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text3">
                <IconChevronDown />
              </span>
            </div>
          )}
        </div>

        {/* Select all / none bar */}
        <div className="flex-shrink-0 flex items-center px-3 py-1.5 gap-1 sf-anim-slide-up sf-d100" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
            className="sf-btn sf-btn-ghost sf-btn-sm flex-1 text-[11px] font-semibold"
            style={{ height: 26, color: 'var(--accent-glow)' }}
          >
            {t('selectAll')}
          </button>
          <div className="sf-divider-v" style={{ height: 16 }} />
          <button
            onClick={() => setSelPhones(new Set())}
            className="sf-btn sf-btn-ghost sf-btn-sm flex-1 text-[11px]"
            style={{ height: 26 }}
          >
            {t('deselect')}
          </button>
          <div className="sf-divider-v" style={{ height: 16 }} />
          <span className="text-[11px] px-2 tabular-nums text-text3">{visiblePhones.length}</span>
        </div>

        {/* Phone list */}
        <div className="flex-1 overflow-y-auto sf-scroll">
          {visiblePhones.length === 0 ? (
            <div className="sf-empty py-12 sf-reveal">
              <div className="sf-empty-icon">
                <IconPhone />
              </div>
              <p className="sf-empty-desc text-[12px]">{t('noPhones')}</p>
            </div>
          ) : (
            <div className="py-1">
              {visiblePhones.map(phone => {
                const checked = selectedPhones.has(phone.id)
                const initials = (phone.ig_username?.[0] ?? phone.phone_name?.[0] ?? '?').toUpperCase()
                return (
                  <button
                    key={phone.id}
                    onClick={() => togglePhone(phone.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left relative transition-all"
                    style={{
                      background: checked ? 'rgba(99,102,241,0.10)' : 'transparent',
                      borderLeft: checked ? '2px solid var(--accent-lt)' : '2px solid transparent',
                    }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-black flex-shrink-0"
                      style={checked
                        ? { background: avatarGradient(phone.phone_name ?? ''), color: '#fff', boxShadow: '0 2px 10px -3px rgba(99,102,241,0.6)' }
                        : { background: 'var(--surface-2)', color: 'var(--text-3)' }
                      }
                    >
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className={`text-[12px] font-semibold truncate ${checked ? 'text-text' : 'text-text2'}`}>
                        {phone.phone_name}
                      </p>
                      {phone.ig_username && (
                        <p className="text-[10.5px] truncate" style={{ color: checked ? 'var(--accent-glow)' : 'var(--text-3)' }}>
                          @{phone.ig_username}
                        </p>
                      )}
                    </div>

                    {/* Checkbox */}
                    <div
                      className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                      style={checked
                        ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-lt))', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }
                        : { border: '1px solid var(--border-md)' }
                      }
                    >
                      {checked && <IconCheck />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer summary */}
        <div className="flex-shrink-0 p-3 sf-anim-slide-up sf-d150" style={{ borderTop: '1px solid var(--border)' }}>
          <div
            className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
            style={{
              background: selectedPhones.size > 0 ? 'var(--accent-dim)' : 'var(--surface-2)',
              border: `1px solid ${selectedPhones.size > 0 ? 'var(--border-accent)' : 'var(--border)'}`,
              transition: 'all 0.2s ease',
            }}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: selectedPhones.size > 0 ? 'var(--ok)' : 'var(--text-3)' }}
            />
            <p className="text-[12px] font-semibold truncate"
              style={{ color: selectedPhones.size > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
              {selectedPhones.size > 0
                ? `${selectedPhones.size} ${selectedPhones.size !== 1 ? t('postingAccountsSelected') : t('postingAccountSelected')}`
                : t('postingNoneSelected')}
            </p>
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT PANEL — Form
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'var(--base)' }}>

        {/* Page header */}
        <div className="sf-page-header">
          <div className="flex items-center gap-3 sf-anim-slide-up sf-d50">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.22) 0%, rgba(99,102,241,0.08) 100%)',
                border: '1px solid var(--border-accent)',
                color: 'var(--accent-glow)',
              }}>
              <IconSend />
            </div>
            <div>
              <h1 className="sf-page-title">{t('newPost')}</h1>
              <p className="sf-page-sub">Reel Instagram · GéeLark Cloud</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sf-anim-slide-up sf-d100">
            {/* Credit pill */}
            {credits.balance !== null && (
              <div className="sf-badge sf-badge-muted gap-1.5">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="5" cy="5" r="4" stroke="var(--accent-glow)" strokeWidth="1.2"/>
                  <path d="M5 3v2l1.5 1" stroke="var(--accent-glow)" strokeWidth="1" strokeLinecap="round"/>
                </svg>
                <span className="text-text2">{credits.balance} cr</span>
              </div>
            )}
            <button
              onClick={() => { setFilePath(null); setCaption(''); setTopic('') }}
              className="sf-btn sf-btn-ghost sf-btn-sm gap-1.5 text-[12px]"
            >
              <IconReset />
              {t('reset')}
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto sf-scroll">
          <div className="px-7 py-5 space-y-4 max-w-2xl anim-stagger">

            {/* Warning banner */}
            {!bearer && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl text-[12.5px]"
                style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.12)', color: '#FCD34D' }}>
                  <IconWarning />
                </div>
                <p style={{ color: '#FCD34D' }}>
                  {t('bearerMissingWarning')} <strong>{t('navSettings')}</strong>
                </p>
              </div>
            )}

            {/* ── VIDEO CARD ─────────────────────────────────────────────── */}
            <div className="sf-card sf-spotlight overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent-glow)' }}>
                  <IconVideo />
                </div>
                <span className="text-[13px] font-semibold text-text">{t('fileLabel')}</span>
                {filePath && (
                  <span className="sf-badge sf-badge-ok ml-auto">{t('readyToPost')}</span>
                )}
              </div>

              <div className="p-5">
                {filePath ? (
                  /* File selected state */
                  <div className="flex items-center gap-4">
                    {/* Thumbnail */}
                    <div className="relative flex-shrink-0 rounded-xl overflow-hidden"
                      style={{ width: 80, height: 142, background: '#000', border: '1.5px solid var(--border-accent)', boxShadow: '0 0 20px -5px rgba(99,102,241,0.4)' }}>
                      <VideoThumbnail filePath={filePath} />
                      {/* notch */}
                      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>
                        Fichier sélectionné
                      </p>
                      <p className="text-[14px] font-semibold text-text truncate mb-3" title={fileName ?? ''}>
                        {fileName}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setShowBankPicker(true)}
                          className="sf-btn sf-btn-secondary sf-btn-sm gap-1.5 text-[12px]"
                        >
                          <IconGrid />
                          {t('postFromBank')}
                        </button>
                        <button
                          onClick={pickLocalFile}
                          className="sf-btn sf-btn-ghost sf-btn-sm gap-1.5 text-[12px]"
                        >
                          <IconUpload />
                          {t('localFile')}
                        </button>
                        <button
                          onClick={() => setFilePath(null)}
                          className="sf-btn sf-btn-danger sf-btn-sm sf-btn-icon"
                          title="Retirer la vidéo"
                        >
                          <IconX />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Empty dropzone */
                  <div className="flex flex-col items-center justify-center py-10 px-6 rounded-xl text-center"
                    style={{ border: '1.5px dashed rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.03)' }}>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                      style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--accent-glow)' }}>
                      <IconVideo />
                    </div>
                    <p className="text-[13.5px] font-semibold text-text mb-1">{t('noVideoSelected')}</p>
                    <p className="text-[12px] text-text3 mb-5">Format 9:16 recommandé · Reel Instagram</p>
                    <div className="flex gap-2.5 flex-wrap justify-center">
                      <button
                        onClick={() => setShowBankPicker(true)}
                        className="sf-btn sf-btn-primary sf-btn-sm gap-1.5 text-[12.5px] px-4"
                        style={{ height: 34 }}
                      >
                        <IconGrid />
                        {t('postFromBank')}
                      </button>
                      <button
                        onClick={pickLocalFile}
                        className="sf-btn sf-btn-secondary sf-btn-sm gap-1.5 text-[12.5px] px-4"
                        style={{ height: 34 }}
                      >
                        <IconUpload />
                        {t('localFile')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── CAPTION CARD ───────────────────────────────────────────── */}
            <div className="sf-card overflow-hidden">
              {/* Card header */}
              <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent-glow)' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 2h10M1 5h7M1 8h8M1 11h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <span className="text-[13px] font-semibold text-text">{t('postingDescriptionLabel')}</span>
                </div>
                <span
                  className={`text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-lg sf-badge ${caption.length > 2200 ? 'sf-badge-danger' : 'sf-badge-muted'}`}
                >
                  {caption.length}/2200
                </span>
              </div>

              <div className="p-5 space-y-3">
                <textarea
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  rows={5}
                  placeholder={t('postingCaptionPlaceholder')}
                  className="sf-input sf-textarea w-full text-[13px] leading-relaxed"
                  style={{ resize: 'vertical', height: 'auto' }}
                />

                {/* AI Generation accordion */}
                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    border: `1px solid ${aiExpanded ? 'rgba(99,102,241,0.35)' : 'var(--border-md)'}`,
                    background: aiExpanded ? 'rgba(99,102,241,0.05)' : 'var(--surface-2)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <button
                    onClick={() => setAiExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 transition-all hover:bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{
                          background: aiExpanded ? 'rgba(99,102,241,0.25)' : 'var(--accent-dim)',
                          boxShadow: aiExpanded ? '0 0 10px rgba(99,102,241,0.3)' : 'none',
                        }}>
                        <IconSparkle />
                      </div>
                      <span className="text-[12.5px] font-semibold" style={{ color: 'var(--accent-glow)' }}>
                        {t('generateWithAI')}
                      </span>
                      {!groqKey && (
                        <span className="sf-badge sf-badge-warn text-[10px]">
                          {t('postingGroqRequired')}
                        </span>
                      )}
                    </div>
                    <span className="text-text3">
                      <IconChevronDown rotated={aiExpanded} />
                    </span>
                  </button>

                  {aiExpanded && (
                    <div className="px-4 pb-4 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                      <div className="pt-3 flex gap-2">
                        <input
                          type="text"
                          value={topic}
                          onChange={e => setTopic(e.target.value)}
                          placeholder={t('topicPlaceholder')}
                          className="sf-input text-[12px] flex-1"
                          style={{ height: 34 }}
                        />
                        <button
                          onClick={generateCaption}
                          disabled={!groqKey || generating}
                          className="sf-btn sf-btn-primary sf-btn-sm gap-1.5 text-[12px] disabled:opacity-40"
                          style={{ minWidth: 90, height: 34 }}
                        >
                          {generating ? (
                            <>
                              <span className="sf-spinner" style={{ width: 12, height: 12 }} />
                              {t('generatingEllipsis')}
                            </>
                          ) : (
                            <>
                              <IconStar />
                              {t('generateBtn2')}
                            </>
                          )}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={customPrompt}
                        onChange={e => setCustomPrompt(e.target.value)}
                        placeholder={t('additionalInstructions')}
                        className="sf-input text-[12px]"
                        style={{ height: 34 }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── OPTIONS CARD ───────────────────────────────────────────── */}
            <div className="sf-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent-glow)' }}>
                  <IconSettings2 />
                </div>
                <span className="text-[13px] font-semibold text-text">{t('postingOptionsLabel')}</span>
              </div>

              <div className="px-5 py-4 space-y-0 divide-y divide-white/[0.04]">
                <PostingOptions opts={postingOpts} onChange={setPostingOpts} />

                {/* Hashtags toggle */}
                <div className="flex items-center gap-3 py-3.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[13px] font-black"
                    style={{
                      background: withHashtags ? 'var(--accent-dim)' : 'var(--surface-2)',
                      color: withHashtags ? 'var(--accent-glow)' : 'var(--text-3)',
                      border: `1px solid ${withHashtags ? 'var(--border-accent)' : 'var(--border)'}`,
                    }}
                  >
                    #
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-text">{t('withHashtags')}</p>
                    <p className="text-[11px] text-text3">{t('withHashtagsDesc')}</p>
                  </div>
                  <button
                    onClick={() => setWithHashtags(v => !v)}
                    className="relative w-11 h-6 rounded-full flex-shrink-0 transition-all"
                    style={{
                      background: withHashtags ? 'linear-gradient(130deg, var(--accent), var(--accent-lt))' : 'var(--surface-3)',
                      border: `1px solid ${withHashtags ? 'var(--border-accent)' : 'var(--border-md)'}`,
                      boxShadow: withHashtags ? '0 0 12px rgba(99,102,241,0.4)' : 'none',
                    }}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-200 ${withHashtags ? 'translate-x-5' : 'translate-x-0.5'}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* ── PROGRESS CARD ──────────────────────────────────────────── */}
            {(posting || progress > 0) && (
              <div
                className="sf-card overflow-hidden anim-scale-in"
                style={{ borderColor: posting ? 'rgba(99,102,241,0.35)' : 'var(--border)', boxShadow: posting ? '0 0 30px -8px rgba(99,102,241,0.25)' : 'none' }}
              >
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {posting && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-accent animate-pulse" />
                      )}
                      <span className="text-[13px] font-semibold text-text">
                        {posting ? t('publishingProgress') : t('publishingDone')}
                      </span>
                      {!posting && progress >= 100 && (
                        <span className="sf-badge sf-badge-ok">{t('publishingDone')}</span>
                      )}
                    </div>
                    <span
                      className="text-[15px] font-black font-mono tabular-nums"
                      style={{ color: progress >= 100 ? 'var(--ok)' : 'var(--accent-glow)' }}
                    >
                      {progress}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="sf-progress">
                    <div
                      className={`sf-progress-bar ${progress >= 100 ? '' : ''}`}
                      style={{
                        width: `${progress}%`,
                        background: progress >= 100
                          ? 'var(--ok)'
                          : 'linear-gradient(90deg, var(--accent), var(--accent-glow))',
                        transition: 'width 0.7s ease',
                      }}
                    />
                  </div>

                  {/* Logs toggle */}
                  <button
                    onClick={() => setShowLogs(v => !v)}
                    className="sf-btn sf-btn-ghost sf-btn-sm gap-1.5 text-[11.5px]"
                    style={{ color: 'var(--text-3)', height: 28 }}
                  >
                    <span style={{ color: 'var(--text-3)' }}>
                      <IconChevronRight rotated={showLogs} />
                    </span>
                    {t('logs')} ({logs.length})
                  </button>

                  {showLogs && logs.length > 0 && (
                    <div
                      className="rounded-xl p-3 max-h-52 overflow-auto font-mono text-[11px] space-y-1"
                      style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid var(--border)' }}
                    >
                      {logs.map((l, i) => (
                        <div
                          key={i}
                          className={`flex gap-2 ${l.level === 'ok' ? 'text-ok' : l.level === 'error' ? 'text-danger' : l.level === 'warn' ? 'text-warn' : 'text-text2'}`}
                        >
                          <span className="flex-shrink-0 text-text3 tabular-nums">{l.time}</span>
                          <span className="break-all">{l.message}</span>
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ACTION BAR ─────────────────────────────────────────────── */}
            <div className="flex gap-3 pb-6 pt-1">
              {/* Post now */}
              <button
                onClick={post}
                disabled={!canPost}
                title={canPost ? undefined
                  : !bearer ? 'Connecte GéeLark dans les Paramètres'
                  : selectedPhones.size === 0 ? 'Sélectionne au moins un téléphone'
                  : !filePath ? 'Choisis une vidéo à publier'
                  : 'Publication en cours…'}
                className="flex-[2] py-3.5 rounded-2xl text-[14px] font-bold text-white transition-all active:scale-[0.99] disabled:cursor-not-allowed relative overflow-hidden"
                style={canPost ? {
                  background: 'linear-gradient(130deg, #4F46E5, #6366F1, #A855F7)',
                  boxShadow: '0 6px 28px -6px rgba(99,102,241,0.65), 0 0 0 1px rgba(168,85,247,0.3)',
                } : {
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  opacity: 0.5,
                }}
              >
                {/* Shimmer when active */}
                {canPost && (
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.07) 50%, transparent 60%)',
                    backgroundSize: '200% 100%',
                    animation: 'progressShimmer 3s linear infinite',
                  }} />
                )}
                {posting ? (
                  <span className="flex items-center justify-center gap-2.5">
                    <span className="sf-spinner" style={{ width: 16, height: 16 }} />
                    {t('publishingProgress')}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <IconSend />
                    {t('launchPost')} · {selectedPhones.size} {selectedPhones.size !== 1 ? t('postingAccountsSelected') : t('postingAccountSelected')}
                  </span>
                )}
              </button>

              {/* Schedule */}
              <button
                onClick={() => setShowScheduleModal(true)}
                disabled={!canPost}
                title={canPost ? undefined
                  : !bearer ? 'Connecte GéeLark dans les Paramètres'
                  : selectedPhones.size === 0 ? 'Sélectionne au moins un téléphone'
                  : !filePath ? 'Choisis une vidéo à publier'
                  : 'Publication en cours…'}
                className="sf-btn sf-btn-secondary flex-1 gap-2 text-[13px] font-semibold rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ height: 'auto', paddingTop: '0.875rem', paddingBottom: '0.875rem' }}
              >
                <IconCalendar />
                {t('scheduleBtn')}
              </button>
            </div>

            {/* Coût en crédits — visible AVANT de lancer */}
            {selectedPhones.size > 0 && (
              <p style={{ margin: '-12px 0 18px', fontSize: 11.5, color: 'rgba(233,234,240,0.42)', textAlign: 'center' }}>
                💎 Coût : <strong style={{ color: '#818CF8' }}>{selectedPhones.size * CREDIT_COSTS.posting} crédit{selectedPhones.size * CREDIT_COSTS.posting > 1 ? 's' : ''}</strong>
                {' '}· solde : {credits.balance}
              </p>
            )}

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
