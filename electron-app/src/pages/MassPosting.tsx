import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import type { User } from '@supabase/supabase-js'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
import { igImg, timeAgo } from '@/lib/igimg'
import { supabase, type Phone, type ContentItem } from '@/lib/supabase'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup, filterAccessiblePhones, accessibleGroupNames } from '@/lib/permissions'
import { logActivity } from '@/lib/activityLog'
import { VideoThumbnail } from '@/pages/Bank'
import { BankPicker } from './Bank'
import { takeScreenshot, waitForPhoneConnectivity, rotateAllProxies, getPhonePublicIp, fetchPhoneProxies } from '@/lib/geelark'
import { startRun, updateRun, endRun, setRunPhase, finishRun, findOrphanRun, adoptRun, proxyConflicts, type PhaseStatus } from '@/lib/activeRuns'
import { resolveRotationUrls, useProxyRotation } from '@/lib/proxyRotation'
import { registerStartedPhones, unregisterPhones, setPhoneTaskId } from '@/lib/phoneWatch'
import {
  getMassPostingState, setMassPostingState, subscribeMassPosting,
  type TaskLog, type TaskStatus, type SelectedVideo, type RunPhone,
  resetMassPosting, loadPersistedRun, clearPersistedRun,
} from '@/lib/massPostingStore'
import {
  createMassRun, massRunLog, massRunSetStatus, endMassRun,
  listMassRuns, subscribeMassRuns, hasRunningMassRun, busyPhoneIds,
  claimPhones, releaseClaim, type MassRunLive,
} from '@/lib/massRuns'
import { playSuccess } from '@/lib/sounds'
import { useT, useLang, useTr } from '@/lib/i18n'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { startCreditRun } from '@/lib/withCredits'
import { ACCENT, ACCENT_L, TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR, OK, WARN, ERR, SANS } from '@/lib/theme'
import { useToast } from '@/components/Toast'
import { createScheduledPost, fmtScheduledTime } from '@/lib/schedulerService'
import { ScheduleModal } from '@/components/ScheduleModal'
import { loadPostingOpts, savePostingOpts, buildScheduleTimes, effectiveConcurrency, type PostingOpts } from '@/lib/postingOpts'
import { PostingOptions } from '@/components/PostingOptions'
import { EmptyState } from '@/components/ui/EmptyState'

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

// Anti-double-post : classe le résultat d'une création de tâche GeeLark.
//  'ok'       → tâche créée (code 0).
//  'rejected' → GeeLark a RÉPONDU par une erreur (code numérique ≠ 0) : la tâche
//               n'a PAS été créée → il est sûr de retenter.
//  'unknown'  → réponse vide/perdue (sur desktop, geelark() renvoie {} en cas de
//               timeout IPC/réseau, donc pas de champ `code`). La tâche a PEUT-ÊTRE
//               été créée côté GeeLark → on ne DOIT jamais retenter (sinon double post).
type TaskOutcome = 'ok' | 'rejected' | 'unknown'
function classifyTaskRes(r: Record<string, unknown> | null | undefined): TaskOutcome {
  if (r && r['code'] === 0) return 'ok'
  if (r && typeof r['code'] === 'number') return 'rejected'
  return 'unknown'
}

const LS_MODE = 'sf-mass-posting-mode'

const STATUS_DOT: Record<string, string> = {
  uploading: 'var(--info, #38BDF8)', posting: WARN, done: OK, error: ERR, cancelled: FAINT,
}

// Badge variant map for status
const STATUS_BADGE: Record<string, string> = {
  uploading: 'sf-badge sf-badge-info',
  posting:   'sf-badge sf-badge-warn',
  done:      'sf-badge sf-badge-ok',
  error:     'sf-badge sf-badge-danger',
  cancelled: 'sf-badge sf-badge-muted',
}

// Ligne de téléphone mémoïsée — la liste se re-render toutes les 10s pendant
// le polling ; avec 100+ téléphones, seules les lignes dont le statut change
// doivent repeindre.
const PhoneRow = memo(function PhoneRow({ phone, checked, videoIndex, videoTitle, ts, statusLabel, onToggle }: {
  phone: Phone
  checked: boolean
  videoIndex: number
  videoTitle: string | null
  ts: TaskStatus | undefined
  statusLabel: string
  onToggle: (id: string) => void
}) {
  const tr = useTr()
  const initials = (phone.ig_username?.[0] ?? phone.phone_name?.[0] ?? '?').toUpperCase()
  const isActive = ts && (ts.status === 'uploading' || ts.status === 'posting')
  return (
    <button
      onClick={() => onToggle(phone.id)}
      className="cursor-pointer"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 11,
        padding: '9px 14px', textAlign: 'left', position: 'relative', border: 'none',
        borderBottom: '1px solid rgba(233,234,240,0.04)',
        borderLeft: isActive ? '2px solid var(--accent)' : checked ? '2px solid rgba(99,102,241,0.5)' : '2px solid transparent',
        background: isActive
          ? 'rgba(99,102,241,0.09)'
          : checked ? 'rgba(99,102,241,0.06)' : 'transparent',
        boxShadow: isActive ? 'inset 0 0 18px rgba(99,102,241,0.07)' : 'none',
        transition: 'background 0.15s, box-shadow 0.15s, border-left-color 0.15s',
      }}
      onMouseEnter={e => { if (!checked && !isActive) e.currentTarget.style.background = 'rgba(233,234,240,0.03)' }}
      onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.09)' : checked ? 'rgba(99,102,241,0.06)' : 'transparent' }}
    >
      {/* Avatar — photo de profil si dispo, sinon initiales */}
      {phone.pp_url ? (
        <img src={igImg(phone.pp_url)} alt="" referrerPolicy="no-referrer" style={{
          width: 30, height: 30, flexShrink: 0, borderRadius: 8, objectFit: 'cover',
          border: `1px solid ${checked || isActive ? 'rgba(99,102,241,0.45)' : HAIR}`,
        }} />
      ) : (
        <div style={{
          width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, borderRadius: 8,
          border: `1px solid ${checked || isActive ? 'rgba(99,102,241,0.45)' : HAIR}`,
          color: checked || isActive ? ACCENT : FAINT,
          background: checked || isActive ? 'rgba(99,102,241,0.08)' : 'transparent',
          transition: 'all 0.15s',
        }}>
          {initials}
        </div>
      )}

      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: checked || isActive ? IVORY : 'rgba(233,234,240,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {phone.phone_name}
        </p>
        {phone.ig_username && (
          <p style={{ fontSize: 10, color: checked || isActive ? 'rgba(99,102,241,0.7)' : FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{phone.ig_username}</p>
        )}
        {/* Statut compte + dernier post */}
        {(phone.account_state === 'banned' || phone.account_state === 'shadow' || phone.last_post_at) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            {phone.account_state === 'banned' && (
              <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>⚠ {tr('BANNI','BANNED')}</span>
            )}
            {phone.account_state === 'shadow' && (
              <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>⚠ SHADOW?</span>
            )}
            {phone.last_post_at && (
              <span style={{ fontSize: 9, color: FAINT }}>📅 {timeAgo(phone.last_post_at)}</span>
            )}
          </div>
        )}
        {ts && ts.status !== 'idle' && ts.status !== 'pending' && (
          <span className={STATUS_BADGE[ts.status] ?? 'sf-badge sf-badge-muted'} style={{ marginTop: 3, display: 'inline-flex', fontSize: 9 }}>
            {statusLabel}{ts.detail ? ` · ${ts.detail}` : ''}
          </span>
        )}
      </div>

      {videoIndex >= 0 && (
        <span
          title={videoTitle ?? undefined}
          className="sf-badge sf-badge-accent"
          style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
        >
          #{videoIndex + 1}
        </span>
      )}

      {/* Checkbox */}
      <div style={{
        width: 14, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4,
        background: checked ? ACCENT : 'transparent',
        border: checked ? 'none' : '1px solid rgba(233,234,240,0.18)',
        transition: 'all 0.15s',
      }}>
        {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
    </button>
  )
})

export function MassPosting({ user }: MassPostingProps) {
  const t = useT()
  const tr = useTr()
  const { lang } = useLang()
  const STATUS_LABEL: Record<string, string> = {
    idle:      '—',
    pending:   t('schedulerStatusPending'),
    uploading: t('uploading') + '…',
    posting:   t('schedulerStatusInProgress'),
    done:      t('schedulerStatusDone'),
    error:     t('schedulerStatusFailed'),
    cancelled: tr('Annulé', 'Cancelled'),
  }
  const { currentOrg, role, perms } = useOrg()
  const credits = useCredits()
  const [phones, setPhones]               = useState<Phone[]>([])
  const ms                                = getMassPostingState()
  const [selectedPhones, _setSelPhones]   = useState<Set<string>>(ms.selectedPhones)
  const [selectedVideos, _setSelVideos]   = useState<SelectedVideo[]>(ms.selectedVideos)
  const [caption, _setCaption]            = useState(ms.caption)
  const [mode, _setMode]                  = useState<'seq' | 'random'>(() => localStorage.getItem(LS_MODE) === 'random' ? 'random' : 'seq')
  const setMode = (m: 'seq' | 'random') => { _setMode(m); localStorage.setItem(LS_MODE, m) }
  // Plateforme pilotée par le wrapper Publish (popup + remount). Lecture seule ici.
  const platform: 'instagram' | 'tiktok' = localStorage.getItem('sf-mp-platform') === 'tiktok' ? 'tiktok' : 'instagram'
  const [bearer, setBearer]               = useState('')
  const [groqKey, setGroqKey]             = useState('')
  const [posting, _setPosting]            = useState(ms.posting)
  const [generating, setGenerating]       = useState(false)
  const [withHashtags, setWithHashtags]   = useState(false)
  const [customPrompt, setCustomPrompt]   = useState('')
  const [logs, _setLogs]                  = useState<TaskLog[]>(ms.logs)
  const [taskStatuses, _setTaskStatuses]  = useState<Map<string, TaskStatus>>(ms.taskStatuses)
  // Runs parallèles : liste des runs vivants + run affiché dans le panneau.
  const [massRunsList, setMassRunsList]   = useState<MassRunLive[]>(() => listMassRuns())
  const [focusedRunId, setFocusedRunId]   = useState<string | null>(null)
  const [anyRunning, setAnyRunning]       = useState(false)
  const [groupFilter, _setGroupFilter]    = useState(loadLastGroup)
  const setGroupFilter = (g: string) => { _setGroupFilter(g); saveLastGroup(g) }
  const [groups, setGroups]               = useState<string[]>(['Tous'])
  const [phoneSearch, setPhoneSearch]     = useState('')
  const [hideBanned, setHideBanned]       = useState(() => localStorage.getItem('sf-hide-banned') !== '0')
  useEffect(() => { localStorage.setItem('sf-hide-banned', hideBanned ? '1' : '0') }, [hideBanned])
  const [phonePickMode, setPhonePickMode] = useState<'phones' | 'groups'>('phones')
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [postingOpts, setPostingOpts]       = useState<PostingOpts>(loadPostingOpts)
  const [showFolderPick, setShowFolderPick] = useState(false)
  const [bankFolders, setBankFolders]       = useState<{ name: string; count: number }[]>([])
  const [folderLoading, setFolderLoading]   = useState(false)
  const [addingFolder, setAddingFolder]     = useState<string | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [randomSeed, setRandomSeed]               = useState(0)
  const stopRef                           = useRef(false)
  const runActiveRef                      = useRef(false)  // ce session pilote un run
  const activePhonesRef                   = useRef<string[]>([])
  const activeTasksRef                    = useRef<string[]>([])
  const logEndRef                         = useRef<HTMLDivElement>(null)
  // Track when each phone entered 'posting' state (geelark_id → timestamp ms)
  const postingStartRef                   = useRef<Map<string, number>>(new Map())
  // Which phones already triggered a screenshot notification this session
  const notifiedRef                       = useRef<Set<string>>(new Set())
  // Auto-stop timers (5 min par téléphone) — clear sur Stop et à l'unmount
  const autoStopTimersRef                 = useRef<number[]>([])

  // Clear ghost timers if the page unmounts mid-run
  useEffect(() => () => {
    autoStopTimersRef.current.forEach(id => clearTimeout(id))
    autoStopTimersRef.current = []
  }, [])

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

  // Le panneau reflète le run « focalisé » (dernier lancé par défaut). Quand des
  // runs parallèles tournent, on affiche celui sélectionné ; sinon on retombe sur
  // le store singleton (reprise après refresh du dernier run).
  useEffect(() => {
    const recompute = () => {
      const list = listMassRuns()
      setMassRunsList(list)
      setAnyRunning(list.some(r => r.running) || (list.length === 0 && getMassPostingState().posting))
      if (list.length) {
        const focused = list.find(r => r.id === focusedRunId) ?? list[0]
        _setPosting(focused.running)
        _setLogs(focused.logs.slice())
        _setTaskStatuses(new Map(focused.statuses))
      } else {
        const st = getMassPostingState()
        _setPosting(st.posting)
        _setLogs(st.logs)
        _setTaskStatuses(st.taskStatuses)
      }
    }
    const un1 = subscribeMassRuns(recompute)
    const un2 = subscribeMassPosting(recompute)
    recompute()
    return () => { un1(); un2() }
  }, [focusedRunId])

  // ⚠️ Le posting tourne dans le navigateur : un refresh/fermeture l'interrompt.
  // Tant qu'un run est en cours, on demande confirmation avant de quitter.
  useEffect(() => {
    if (!anyRunning) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = tr('Un posting est en cours. Si tu quittes ou rafraîchis, il sera interrompu.', 'A posting is in progress. If you leave or refresh, it will be interrupted.')
      return e.returnValue
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [anyRunning])

  // Pull the active connection (org_config when an org is active, app_config otherwise)
  const conns = useConnections(user)
  useProxyRotation(user)  // charge la config de rotation d'IP dans le cache
  useEffect(() => { if (conns.bearer) setBearer(conns.bearer) }, [conns.bearer])
  useEffect(() => { if (conns.groq)   setGroqKey(conns.groq) },  [conns.groq])

  useEffect(() => {
    if (!conns.bearer) { setPhones([]); setGroups(['Tous']); return }
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(ph => {
      // 🔒 Filtre À LA SOURCE : un membre ne récupère QUE les téléphones des groupes
      // auxquels il a accès → impossible de voir/poster sur un autre groupe, quoi
      // qu'il arrive (le filtre de groupe et le sélecteur en dérivent).
      const ps = filterAccessiblePhones(ph.data ?? [], role, perms)
      setPhones(ps)
      const grps = accessibleGroupNames(ps, role, perms)
      setGroups(['Tous', ...grps])
      // Groupe mémorisé disparu (renommé/supprimé/interdit) → retour à « Tous »
      if (!grps.includes(loadLastGroup())) setGroupFilter('Tous')
    })
  }, [currentOrg?.id, user.id, conns.bearer, role, perms])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  function log(message: string, level: TaskLog['level'] = 'info') {
    setLogs(prev => [...prev, {
      message, level,
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }])
  }

  function setPhoneStatus(phoneId: string, status: TaskStatus) {
    setTaskStatuses(prev => new Map(prev).set(phoneId, status))
    // Miroir vers le registre global (widget + Historique) : détail par téléphone.
    if (activeRunIdRef.current) {
      const s = status.status
      const phase: PhaseStatus = s === 'done' ? 'done'
        : (s === 'error' || s === 'cancelled') ? 'error'
        : s === 'idle' ? 'idle' : 'running'
      setRunPhase(activeRunIdRef.current, phoneId, phase)
    }
  }

  // ── Reprise du suivi après un refresh ────────────────────────────────────────
  // Les Reels partis chez GeeLark continuent de se publier côté serveur même si
  // on refresh. Au retour sur l'app, on reprend le SUIVI : on relit l'état, on
  // repoll les tâches (LECTURE SEULE — jamais de re-post) et on éteint les tél
  // une fois fini. Se déclenche une seule fois, si un run était en cours.
  const resumedRef = useRef(false)
  useEffect(() => {
    // On ne reprend QUE si le module est "frais" (posting=false en mémoire = après
    // un refresh). En navigation interne, la boucle d'origine tourne encore
    // (store.posting=true) → surtout pas de 2ᵉ poll.
    if (resumedRef.current || runActiveRef.current || !bearer) return
    if (getMassPostingState().posting) return
    const persisted = loadPersistedRun()
    if (!persisted) return
    const age = Date.now() - (persisted.startedAt || 0)
    // Fenêtre de reprise : 24 h. Au-delà, on oublie (token média probablement
    // périmé, run considéré terminé). La reprise ne repost jamais là où c'est
    // déjà posté (les tels avec taskId sont exclus) → une reprise tardive est
    // sans risque : au pire une relance échoue proprement.
    if (age > 24 * 60 * 60_000) { clearPersistedRun(); return }
    resumedRef.current = true

    // Adopte le run du registre global (carte « En cours ») laissé orphelin par
    // le refresh : on reprend son pilotage → il continue d'avancer puis se clôt,
    // au lieu de rester figé « En cours » à l'infini.
    const orphan = findOrphanRun('mass')
    if (orphan) { activeRunIdRef.current = orphan.id; adoptRun(orphan.id) }

    // Rehydrate l'état visible.
    const statuses = new Map<string, TaskStatus>(persisted.taskStatuses)
    setMassPostingState({ posting: true, logs: persisted.logs, taskStatuses: statuses, runPhones: persisted.runPhones, startedAt: persisted.startedAt })
    stopRef.current = false
    log(tr('🔄 Reprise du suivi du posting en cours (relancé avant refresh)…', '🔄 Resuming tracking of the in-progress posting (relaunched before refresh)…'), 'info')

    ;(async () => {
      const STATUS_B: Record<number, string> = { 3: tr('Publié', 'Published'), 4: tr('Échec', 'Failed'), 7: tr('Annulé', 'Cancelled') }
      const byTask = new Map<string, RunPhone>()
      for (const rp of persisted.runPhones) {
        const st = statuses.get(rp.phoneId)
        if (st?.taskId && (st.status === 'posting' || st.status === 'pending' || st.status === 'uploading')) {
          byTask.set(st.taskId, rp)
        }
      }

      // ── Reprise d'EXÉCUTION : téléphones JAMAIS PARTIS (boucle interrompue avant
      // eux) dont le média est déjà hébergé (token persisté) → on les RELANCE.
      // Anti-double : on ne relance QUE les tél qui n'ont jamais atteint l'étape de
      // création. Dès que le statut est 'posting' (même sans taskId enregistré : cas
      // d'un crash pile après l'envoi à GeeLark, où la tâche a peut-être été créée),
      // on NE relance PAS → on se contente de suivre. Crédits déjà débités → 0 débit.
      const toLaunch = persisted.runPhones.filter(rp => {
        const st = statuses.get(rp.phoneId)
        const attempted = st?.status === 'posting' || st?.status === 'uploading' || Boolean(st?.taskId)
        const finalized = st?.status === 'done' || st?.status === 'error' || st?.status === 'cancelled'
        return Boolean(rp.token) && !attempted && !finalized
      })
      if (toLaunch.length && !stopRef.current) {
        log(tr(`↻ Reprise : ${toLaunch.length} téléphone(s) pas encore parti(s) — relance de la publication…`, `↻ Resume: ${toLaunch.length} phone(s) not yet started — relaunching the post…`), 'info')
        const ids = toLaunch.map(rp => rp.geelarkId)
        activePhonesRef.current = [...new Set([...activePhonesRef.current, ...ids])]
        try { await geelark(bearer, '/phone/start', { ids }) } catch { /* watchdog serveur */ }
        registerStartedPhones(ids, { orgId: currentOrg?.id ?? null, userId: user.id }, { reason: 'mass_posting' })
        log(tr('Attente du boot (~30s)…', 'Waiting for boot (~30s)…'))
        await new Promise(r => setTimeout(r, 30000))

        if (persisted.platform === 'tiktok') {
          // TikTok : un seul /task/add pour tous les téléphones restants.
          const list = toLaunch.map(rp => ({ scheduleAt: Math.floor(Date.now() / 1000), envId: rp.geelarkId, video: rp.token!, videoDesc: rp.caption ?? '' }))
          try {
            const taskRes = await geelark(bearer, '/task/add', { taskType: 1, list })
            const tids = ((taskRes['data'] as Record<string, unknown>)?.['taskIds'] ?? []) as string[]
            if (taskRes['code'] === 0 && Array.isArray(tids) && tids.length) {
              toLaunch.forEach((rp, i) => {
                const tid = tids[i]
                if (!tid) { setPhoneStatus(rp.phoneId, { status: 'error', detail: 'no task id' }); return }
                byTask.set(tid, rp); setPhoneTaskId(rp.geelarkId, tid); setPhoneStatus(rp.phoneId, { status: 'posting', taskId: tid })
                log(tr(`  Tâche TikTok recréée pour ${rp.phoneName}`, `  TikTok task recreated for ${rp.phoneName}`), 'ok')
              })
            } else {
              toLaunch.forEach(rp => setPhoneStatus(rp.phoneId, { status: 'error', detail: String(taskRes['msg'] ?? tr('reprise refusée', 'resume rejected')) }))
            }
          } catch { toLaunch.forEach(rp => setPhoneStatus(rp.phoneId, { status: 'error', detail: tr('reprise échouée', 'resume failed') })) }
        } else {
          // Instagram : une tâche instagramPubReels par téléphone (espacée + retry).
          for (const rp of toLaunch) {
            if (stopRef.current) break
            setPhoneStatus(rp.phoneId, { status: 'posting' })
            postingStartRef.current.set(rp.geelarkId, Date.now())
            await waitForPhoneConnectivity(bearer, rp.geelarkId, m => log(`  ${rp.phoneName}: ${m.trim()}`))
            let taskRes: Record<string, unknown> | null = null
            let outcome: TaskOutcome = 'unknown'
            for (let attempt = 0; attempt < 3; attempt++) {
              taskRes = await geelark(bearer, '/rpa/task/instagramPubReels', {
                id: rp.geelarkId, scheduleAt: Math.floor(Date.now() / 1000),
                description: rp.caption ?? '', video: [rp.token!], ...(persisted.reelsTrial ? { shareType: 2 } : {}),
              })
              outcome = classifyTaskRes(taskRes)
              if (outcome === 'ok') break
              if (outcome === 'unknown') break  // réponse perdue → tâche peut-être créée → pas de retry (anti-double)
              if (attempt < 2) { log(tr(`  ${rp.phoneName} : ${taskRes['msg'] ?? 'publication refusée'} — nouvel essai…`, `  ${rp.phoneName}: ${taskRes['msg'] ?? 'post rejected'} — retrying…`), 'warn'); await new Promise(r => setTimeout(r, 3000 * (attempt + 1))) }
            }
            if (outcome === 'ok') {
              const tid = (taskRes!['data'] as Record<string, unknown>)?.['id'] as string
              byTask.set(tid, rp); setPhoneTaskId(rp.geelarkId, tid); setPhoneStatus(rp.phoneId, { status: 'posting', taskId: tid })
              log(tr(`  Tâche recréée pour ${rp.phoneName}`, `  Task recreated for ${rp.phoneName}`), 'ok')
            } else if (outcome === 'unknown') {
              log(tr(`  ${rp.phoneName} : réponse GeeLark perdue (réseau) — on ne recrée pas (anti-double)`, `  ${rp.phoneName}: GeeLark response lost (network) — not recreating (anti-duplicate)`), 'warn')
              setPhoneStatus(rp.phoneId, { status: 'posting', detail: tr('non confirmé (réseau)', 'unconfirmed (network)') })
            } else {
              setPhoneStatus(rp.phoneId, { status: 'error', detail: String(taskRes?.['msg'] ?? tr('échec reprise', 'resume failed')) })
            }
            await new Promise(r => setTimeout(r, 500))
          }
        }
      }

      // On laisse le temps aux tâches (anciennes + relancées) de se terminer.
      const deadline = Date.now() + 12 * 60_000
      while (byTask.size > 0 && Date.now() < deadline && !stopRef.current) {
        await new Promise(r => setTimeout(r, 12000))
        if (stopRef.current) break
        let qRes: Record<string, unknown>
        try { qRes = await geelark(bearer, '/task/query', { ids: [...byTask.keys()] }) } catch { continue }
        const d = (qRes['data'] as Record<string, unknown>) ?? qRes
        let items = (d['items'] ?? d['list'] ?? d['tasks'] ?? d['records']) as Array<Record<string, unknown>> | undefined
        if (!Array.isArray(items)) items = []
        for (const item of items) {
          const tid = (item['id'] ?? item['taskId']) as string
          const status = Number(item['status'])
          if (![3, 4, 7].includes(status)) continue
          const rp = byTask.get(tid)
          if (!rp) continue
          byTask.delete(tid)
          const fail = item['failDesc'] ? ` — ${item['failDesc']}` : ''
          log(`${STATUS_B[status] ?? status} ${rp.phoneName}${fail}`, status === 3 ? 'ok' : 'error')
          setPhoneStatus(rp.phoneId, { status: status === 3 ? 'done' : 'error', detail: item['failDesc'] as string | undefined })
        }
      }
      // Ce qui reste non confirmé → publié (non confirmé), et on éteint les tél du run.
      for (const rp of byTask.values()) setPhoneStatus(rp.phoneId, { status: 'done', detail: tr('non confirmé', 'unconfirmed') })
      const gids = persisted.runPhones.map(p => p.geelarkId)
      if (gids.length) { try { await geelark(bearer, '/phone/stop', { ids: gids }) } catch { /* watchdog serveur */ } unregisterPhones(gids).catch(() => {}) }
      setPosting(false)
      // Clôture la carte « En cours » adoptée (statut déduit du détail par tél).
      if (activeRunIdRef.current) { finishRun(activeRunIdRef.current); activeRunIdRef.current = null }
      clearPersistedRun()
      log(tr('✅ Suivi terminé (reprise après refresh)', '✅ Tracking finished (resumed after refresh)'), 'ok')
    })()
  }, [bearer])

  // Stable pour React.memo(PhoneRow) — ne dépend que de setters fonctionnels
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const togglePhone = useCallback((id: string) => {
    setSelPhones(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  async function openFolderPick() {
    setFolderLoading(true)
    // Pagination : sans ça, au-delà de 1000 vidéos, des dossiers manquent.
    const counts = new Map<string, number>()
    const PAGE = 1000
    let from = 0
    while (true) {
      let q = supabase.from('content_bank').select('folder').range(from, from + PAGE - 1)
      q = currentOrg ? (q as any).eq('org_id', currentOrg.id) : (q as any).eq('user_id', user.id).is('org_id', null)
      const { data, error } = await q
      if (error) break
      const rows = data ?? []
      for (const row of rows) {
        const f = (row as { folder?: string | null }).folder
        if (f) counts.set(f, (counts.get(f) ?? 0) + 1)
      }
      if (rows.length < PAGE) break
      from += PAGE
    }
    setBankFolders([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })))
    setFolderLoading(false)
    setShowFolderPick(true)
  }

  async function addFolderVideos(folderName: string) {
    setShowFolderPick(false)
    setAddingFolder(folderName)
    try {
      // Pagination : un dossier peut contenir > 1000 vidéos.
      const PAGE = 1000
      let from = 0
      const items: ContentItem[] = []
      while (true) {
        let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false }).range(from, from + PAGE - 1)
        q = currentOrg
          ? (q as any).eq('org_id', currentOrg.id).eq('folder', folderName)
          : (q as any).eq('user_id', user.id).is('org_id', null).eq('folder', folderName)
        const { data, error } = await q
        if (error) break
        const rows = (data ?? []) as ContentItem[]
        items.push(...rows)
        if (rows.length < PAGE) break
        from += PAGE
      }
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
      title:          path.split(/[\\/]/).pop() ?? tr('Vidéo locale', 'Local video'),
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

  const phoneList = phones.filter(p => selectedPhones.has(p.id))
  const assignments = useMemo(() => {
    if (selectedVideos.length === 0) return phoneList.map(phone => ({ phone, video: null, videoIndex: -1 }))
    if (mode === 'random') {
      // Re-shuffle at the start of each cycle so that phones N+1…2N get a
      // different order than phones 1…N (avoids the repeating-pattern problem
      // when there are more phones than videos).
      function shuffle(arr: number[]): number[] {
        const a = [...arr]
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]]
        }
        return a
      }
      const base = selectedVideos.map((_, i) => i)
      const result: { phone: Phone; video: SelectedVideo; videoIndex: number }[] = []
      let cycle: number[] = []
      for (let i = 0; i < phoneList.length; i++) {
        if (i % selectedVideos.length === 0) cycle = shuffle(base)
        const idx = cycle[i % selectedVideos.length]
        result.push({ phone: phoneList[i], video: selectedVideos[idx], videoIndex: idx })
      }
      return result
    }
    return phoneList.map((phone, i) => {
      const idx = i % selectedVideos.length
      return { phone, video: selectedVideos[idx], videoIndex: idx }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneList.map(p => p.id).join(','), selectedVideos.map(v => v.item.id).join(','), mode, randomSeed])

  // Lookup O(1) par téléphone — évite un `assignments.find(...)` O(n) DANS le .map
  // de la liste (rendu O(n²) = liste qui rame à des centaines de téléphones).
  const assignmentByPhone = useMemo(() => new Map(assignments.map(a => [a.phone.id, a])), [assignments])

  // Arrête le run affiché dans le panneau (chaque run porte sa propre annulation).
  // Repli sur l'ancien chemin singleton si c'est une reprise après refresh (aucun
  // run vivant en mémoire).
  async function stopFocused() {
    const list = listMassRuns()
    const focused = list.find(r => r.id === focusedRunId) ?? list.find(r => r.running) ?? list[0]
    if (focused) { focused.cancel(); return }
    await stopLegacy()
  }

  async function stopLegacy() {
    // Guard : un seul appel simultané, évite les "Stop requested" en boucle
    // quand plusieurs timers auto-stop se déclenchent en même temps.
    if (stopRef.current) return
    stopRef.current = true
    // Clear les auto-stop de 5 min — sinon ils re-déclenchent stop()
    autoStopTimersRef.current.forEach(id => clearTimeout(id))
    autoStopTimersRef.current = []
    log(tr('Stop — annulation des tâches et extinction des téléphones…', 'Stop — cancelling tasks and shutting down phones…'), 'warn')
    const tasks = activeTasksRef.current
    const phones = activePhonesRef.current
    try {
      if (tasks.length > 0) {
        await geelark(bearer, '/rpa/task/cancel', { ids: tasks })
        log(tr(`  ${tasks.length} tâche(s) annulée(s)`, `  ${tasks.length} task(s) cancelled`), 'warn')
      }
    } catch (e) {
      log(tr(`  Impossible d'annuler certaines tâches`, `  Could not cancel some tasks`), 'warn')
    }
    try {
      if (phones.length > 0) {
        await geelark(bearer, '/phone/stop', { ids: phones })
        unregisterPhones(phones).catch(() => {})
        log(tr(`  ${phones.length} téléphone(s) éteint(s)`, `  ${phones.length} phone(s) shut down`), 'warn')
      }
    } catch (e) {
      log(tr(`  Impossible d'éteindre certains téléphones`, `  Could not shut down some phones`), 'warn')
    }
    activeTasksRef.current = []
    activePhonesRef.current = []
    // Marque tous les téléphones sans statut final comme "cancelled" (arrêt manuel)
    // — sinon ceux qui étaient en "uploading" restent bloqués indéfiniment.
    const current = getMassPostingState().taskStatuses
    for (const [phoneId, st] of current.entries()) {
      if (st.status !== 'done' && st.status !== 'error') {
        setPhoneStatus(phoneId, { status: 'cancelled' })
      }
    }
    // Clôture IMMÉDIATE du suivi global → pas de fausse alerte « même proxy »
    // sur un posting relancé juste après l'annulation.
    if (activeRunIdRef.current) { endRun(activeRunIdRef.current); activeRunIdRef.current = null }
    log(tr('Arrêté.', 'Stopped.'), 'warn')
  }

  async function generateCaption() {
    if (!groqKey) { log(tr('Clé Groq manquante — ajoute-la dans les Paramètres', 'Groq key missing — add it in Settings'), 'error'); return }
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
        log(tr('La génération de la description a échoué. Réessaie.', 'Caption generation failed. Try again.'), 'error')
      }
    } catch (e) {
      log(tr('La génération de la description a échoué.', 'Caption generation failed.'), 'error')
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
    if (!bearer)                    { log(tr('Connexion GéeLark manquante — ajoute ton token dans les Paramètres', 'GeeLark connection missing — add your token in Settings'), 'error'); return }
    if (phoneList.length === 0)     { log(tr('Sélectionne au moins un téléphone', 'Select at least one phone'), 'warn'); return }
    if (selectedVideos.length === 0){ log(tr('Sélectionne au moins une vidéo', 'Select at least one video'), 'warn'); return }
    // GéeLark expire les fichiers uploadés après 30 jours — bloque au-delà de 25
    if (scheduledAt.getTime() > Date.now() + 25 * 24 * 60 * 60 * 1000) {
      log(tr('Programmation limitée à 25 jours (les vidéos uploadées chez GéeLark expirent après 30 jours)', 'Scheduling limited to 25 days (videos uploaded to GeeLark expire after 30 days)'), 'error')
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
      // Assignation EXPLICITE et FIGÉE (comme le posting direct) : téléphone i →
      // vidéo (i % nb vidéos) en séquentiel, ou aléatoire. On calcule le mapping
      // MAINTENANT et on stocke UNE entrée de vidéo par téléphone → l'exécution
      // (serveur ou client) ne peut plus se tromper d'ordre (elle lit videos[i]).
      const V = selectedVideos.length
      const perPhoneIdx = phoneList.map((_, i) => mode === 'random' ? Math.floor(Math.random() * V) : i % V)
      const distinctIdx = [...new Set(perPhoneIdx)]

      // Crédits débités à la programmation (remboursés si annulation avant exécution)
      const creditCost = phoneList.length * CREDIT_COSTS.mass_posting
      const creditRes  = await checkAndDeductCredits(credits.ownerId, creditCost)
      if (!creditRes.ok) {
        log(tr(`${creditRes.error ?? 'Crédits insuffisants'} (requis : ${creditCost} pour ${phoneList.length} téléphone${phoneList.length > 1 ? 's' : ''})`, `${creditRes.error ?? 'Insufficient credits'} (required: ${creditCost} for ${phoneList.length} phone${phoneList.length > 1 ? 's' : ''})`), 'error')
        return
      }
      if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)
      log(tr(`${creditCost} crédits débités — remboursés si tu annules avant l'exécution`, `${creditCost} credits charged — refunded if you cancel before execution`), 'ok')

      // Refund helper: any failure between deduction and creation gives the credits back
      const refundOnFailure = async (reason: string) => {
        const { refundCredits } = await import('@/lib/credits')
        const ok = await refundCredits(credits.ownerId, creditCost)
        log(`${reason}${ok ? tr(` — ${creditCost} crédits remboursés`, ` — ${creditCost} credits refunded`) : ''}`, 'error')
        if (ok) credits.refresh()
      }

      // Upload chaque vidéo DISTINCTE une seule fois (dédup).
      log(tr(`Upload de ${distinctIdx.length} vidéo(s) vers GéeLark…`, `Uploading ${distinctIdx.length} video(s) to GeeLark…`))
      const tokenByIdx = new Map<number, string>()
      for (let k = 0; k < distinctIdx.length; k++) {
        const vi = distinctIdx[k]
        const sv = selectedVideos[vi]
        const filePath = await resolveVideoPath(sv)
        if (!filePath) { await refundOnFailure(tr(`Fichier introuvable pour « ${sv.item.title} »`, `File not found for “${sv.item.title}”`)); return }
        const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
        if (!up.ok || !up.token) { await refundOnFailure(tr(`Échec de l'envoi de « ${sv.item.title} » vers GéeLark`, `Failed to upload “${sv.item.title}” to GeeLark`)); return }
        tokenByIdx.set(vi, up.token)
        log(tr(`Vidéo ${k + 1}/${distinctIdx.length} prête`, `Video ${k + 1}/${distinctIdx.length} ready`), 'ok')
      }
      try {
        await createScheduledPost({
          userId: user.id, orgId: currentOrg?.id ?? null,
          createdByName: user.email?.split('@')[0] ?? tr('Moi', 'Me'),
          type: 'mass_posting', scheduledAt,
          phones: phoneList.map(p => ({ id: p.id, geelark_id: p.geelark_id, phone_name: p.phone_name, ig_username: p.ig_username })),
          // UNE entrée par téléphone : videos[i] = la vidéo du téléphone i (mapping
          // figé). Légende : description de banque de la vidéo, sinon légende globale.
          videos: perPhoneIdx.map(vi => {
            const sv = selectedVideos[vi]
            return { token: tokenByIdx.get(vi)!, title: sv.item.title, desc: (sv.caption?.trim() || caption.trim() || undefined) }
          }),
          // On force 'seq' : le mapping téléphone→vidéo est déjà figé dans l'ordre
          // ci-dessus (videos[i] = tél i), donc l'exécution fait juste i → videos[i].
          caption, delayMinutes: 0, mode: 'seq', bearerToken: bearer, reelsTrial: postingOpts.reelsTrial,
          platform,
        })
      } catch (err: any) {
        await refundOnFailure(tr('La programmation a échoué.', 'Scheduling failed.'))
        return
      }

      // Usage unique : à la PROGRAMMATION, on retire de la banque les vidéos
      // programmées → les prochaines programmations puisent dans ce qui reste.
      if (postingOpts.deleteAfterPost) {
        const toDelete = distinctIdx.map(vi => selectedVideos[vi]).filter(sv => sv?.item?.storage_path && !String(sv.item.id).startsWith('local-') && !String(sv.item.id).startsWith('bank-'))
        if (toDelete.length) {
          try {
            const ids = toDelete.map(sv => sv.item.id)
            const base = supabase.from('content_bank').delete().in('id', ids)
            await (currentOrg ? (base as any).eq('org_id', currentOrg.id) : (base as any).eq('user_id', user.id).is('org_id', null))
            const { deleteStorageObjects } = await import('@/lib/storage')
            deleteStorageObjects(toDelete.flatMap(sv => [sv.item.storage_path, sv.item.thumbnail_path])).catch(() => {})
            const deletedIds = new Set(ids)
            setSelVideos(prev => prev.filter(sv => !deletedIds.has(sv.item.id)))
            log(tr(`🗑️ ${toDelete.length} vidéo(s) retirée(s) de la banque (usage unique)`, `🗑️ ${toDelete.length} video(s) removed from the bank (single use)`), 'ok')
          } catch { log(tr('Impossible de retirer certaines vidéos de la banque', 'Could not remove some videos from the bank'), 'warn') }
        }
      }

      // Post « maintenant » (≤ 2 min) vs vraiment programmé plus tard.
      const soon = scheduledAt.getTime() <= Date.now() + 2 * 60_000
      if (soon) {
        log(tr(`✅ Envoyé au serveur — ${phoneList.length} téléphone(s) postent d'ici ~1 min. Tu peux fermer ton PC.`, `✅ Sent to the server — ${phoneList.length} phone(s) will post within ~1 min. You can turn off your PC.`), 'ok')
        toast.show({ title: tr('Posting lancé côté serveur', 'Posting launched server-side'), body: tr('Les publications partent dans ~1 min. Tu peux fermer ton PC — suis l\'avancement dans Historique.', 'Posts go out in ~1 min. You can turn off your PC — track progress in History.'), kind: 'ok' })
      } else {
        log(tr(`Programmé pour ${fmtScheduledTime(scheduledAt.toISOString())} — ${phoneList.length} téléphone(s)`, `Scheduled for ${fmtScheduledTime(scheduledAt.toISOString())} — ${phoneList.length} phone(s)`), 'ok')
      }
    } catch (err: any) {
      log(tr('Une erreur est survenue pendant la programmation.', 'An error occurred during scheduling.'), 'error')
    } finally {
      setPosting(false)
    }
  }

  async function post() {
    // ⚠️ Ces gardes s'exécutent AVANT la création du run : elles utilisent `toast`
    // (et non `log`, qui est masqué plus bas par un shadow par-run → TDZ si appelé
    // ici). Feedback utilisateur via toast, pas de journal (aucun run encore).
    if (!bearer)                  { toast.show({ title: tr('GéeLark non connecté', 'GeeLark not connected'), body: tr('Ajoute ton token dans les Paramètres', 'Add your token in Settings'), kind: 'error' }); return }
    if (phoneList.length === 0)   { toast.show({ title: tr('Aucun téléphone', 'No phone'), body: tr('Sélectionne au moins un téléphone', 'Select at least one phone'), kind: 'warn' }); return }
    if (selectedVideos.length === 0) { toast.show({ title: tr('Aucune vidéo', 'No video'), body: tr('Sélectionne au moins une vidéo', 'Select at least one video'), kind: 'warn' }); return }

    // ⛔ Anti-doublon : un téléphone déjà en cours dans un autre run ne doit PAS
    // repartir ici — sinon il posterait 2× ET serait débité 2× (runs parallèles).
    const busy = busyPhoneIds()
    const clashPhones = phoneList.filter(p => busy.has(p.id))
    if (clashPhones.length > 0) {
      const names = clashPhones.map(p => p.ig_username ? `@${p.ig_username}` : (p.phone_name ?? p.id.slice(-6)))
      toast.show({
        title: tr(`${clashPhones.length} téléphone(s) déjà en cours`, `${clashPhones.length} phone(s) already running`),
        body: tr(`${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''} — déjà dans un posting actif. Attends qu'il finisse ou désélectionne-les.`, `${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''} — already in an active posting. Wait for it to finish or deselect them.`),
        kind: 'warn',
      })
      return
    }

    // Réservation SYNCHRONE des téléphones AVANT tout await (débit crédits) : ferme
    // la fenêtre TOCTOU où un double-clic sur « Lancer » passerait deux fois la garde
    // anti-doublon pendant le débit → double-post + double-débit.
    const runId = `mass-${Date.now()}-${phoneList.length}`
    claimPhones(runId, phoneList.map(p => p.id))

    // Légende à poster pour une vidéo donnée : sa description de banque si elle
    // en a une, sinon la légende globale saisie. Corrige le cas où chaque vidéo
    // a sa propre description mais toutes recevaient la même légende globale.
    const capFor = (v: SelectedVideo | null) => (v?.caption && v.caption.trim()) || caption

    // Débit upfront via le cycle de vie unifié — chaque téléphone en échec
    // sera remboursé au settle() en fin de run.
    const creditCost = phoneList.length * CREDIT_COSTS.mass_posting
    const run = await startCreditRun(credits.ownerId, CREDIT_COSTS.mass_posting, phoneList.length)
    if (!run.ok) {
      releaseClaim(runId)  // libère la réservation si le débit échoue
      toast.show({ title: tr('Crédits insuffisants', 'Insufficient credits'), body: tr(`${run.error} — ${creditCost} crédits requis, solde : ${credits.balance}`, `${run.error} — ${creditCost} credits required, balance: ${credits.balance}`), kind: 'error' })
      return
    }
    if (typeof run.balance === 'number') credits.setBalance(run.balance)

    playSuccess()
    runActiveRef.current = true  // ce session pilote le run (pas une reprise)

    // ── Isolation PAR RUN — permet plusieurs postings en parallèle ───────────
    // Tout l'état vivant de CE run (logs, statut par téléphone, refs d'annulation)
    // est local à `post()`. Les shadows ci-dessous masquent les refs/fonctions de
    // composant partagées pour TOUT le corps de la fonction (y compris armAutoStop,
    // la boucle de polling, checkPhoneScreen imbriqués) → aucun run ne piétine un
    // autre. La logique de crédits/upload/poll reste inchangée.
    // (runId est déjà déclaré plus haut pour la réservation synchrone.)
    const runLabel = `Mass posting · ${phoneList.length} ${tr('compte', 'account')}${phoneList.length > 1 ? 's' : ''}`
    const stopRef           = { current: false }
    const activeTasksRef    = { current: [] as string[] }
    const activePhonesRef   = { current: [] as string[] }
    const postingStartRef   = { current: new Map<string, number>() }
    const notifiedRef       = { current: new Set<string>() }
    const autoStopTimersRef = { current: [] as number[] }
    const activeRunIdRef    = { current: runId as string | null }
    const log = (message: string, level: TaskLog['level'] = 'info') => massRunLog(runId, message, level)
    // ⚠️ Miroir vers le store PERSISTANT (massPostingStore) : la reprise après
    // refresh lit `persisted.taskStatuses` pour savoir quels téléphones ont déjà
    // démarré. Sans ce miroir, elle voit un état vide et RELANCE tous les tél munis
    // d'un token → DOUBLE-POST sur les comptes déjà publiés. Le run live reste piloté
    // par massRuns ; ceci ne sert QU'À la persistance de reprise.
    const setPhoneStatus = (phoneId: string, status: TaskStatus) => {
      massRunSetStatus(runId, phoneId, status)
      const s = status.status
      const phase: PhaseStatus = s === 'done' ? 'done'
        : (s === 'error' || s === 'cancelled') ? 'error'
        : s === 'idle' ? 'idle' : 'running'
      setRunPhase(runId, phoneId, phase)
      setMassPostingState({ taskStatuses: new Map(getMassPostingState().taskStatuses).set(phoneId, status) })
    }
    const setTaskStatuses = (map: Map<string, TaskStatus>) => {
      map.forEach((st, id) => massRunSetStatus(runId, id, st))
      const merged = new Map(getMassPostingState().taskStatuses)
      map.forEach((st, id) => merged.set(id, st))
      setMassPostingState({ taskStatuses: merged })
    }

    // Annulation propre de CE run uniquement (bouton Stop du run).
    let live: MassRunLive
    const cancelRun = async () => {
      if (stopRef.current) return
      stopRef.current = true
      autoStopTimersRef.current.forEach(id => window.clearTimeout(id))
      autoStopTimersRef.current = []
      log(tr('Stop — annulation des tâches et extinction des téléphones…', 'Stop — cancelling tasks and shutting down phones…'), 'warn')
      const tasks = [...activeTasksRef.current]
      const phs   = [...activePhonesRef.current]
      try { if (tasks.length) { await geelark(bearer, '/rpa/task/cancel', { ids: tasks }); log(tr(`  ${tasks.length} tâche(s) annulée(s)`, `  ${tasks.length} task(s) cancelled`), 'warn') } }
      catch { log(tr('  Impossible d\'annuler certaines tâches', '  Could not cancel some tasks'), 'warn') }
      try { if (phs.length) { await geelark(bearer, '/phone/stop', { ids: phs }); unregisterPhones(phs).catch(() => {}); log(tr(`  ${phs.length} téléphone(s) éteint(s)`, `  ${phs.length} phone(s) shut down`), 'warn') } }
      catch { log(tr('  Impossible d\'éteindre certains téléphones', '  Could not shut down some phones'), 'warn') }
      activeTasksRef.current = []
      activePhonesRef.current = []
      for (const [phoneId, st] of live.statuses.entries()) {
        if (st.status !== 'done' && st.status !== 'error') setPhoneStatus(phoneId, { status: 'cancelled' })
      }
      if (activeRunIdRef.current) endRun(activeRunIdRef.current)
      log(tr('Arrêté.', 'Stopped.'), 'warn')
    }
    live = createMassRun(runId, runLabel, phoneList.length, () => { void cancelRun() })
    setFocusedRunId(runId)  // affiche ce nouveau run dans le panneau

    setPosting(true)
    // Mémorise le run pour reprendre le suivi après un éventuel refresh (dernier run).
    setMassPostingState({ startedAt: Date.now(), runPhones: phoneList.map(p => ({ phoneId: p.id, geelarkId: p.geelark_id, phoneName: p.phone_name })) })
    setLastRun(null)
    log(tr(`${creditCost} crédits débités — les échecs seront remboursés en fin de run`, `${creditCost} credits charged — failures will be refunded at the end of the run`), 'info')
    const newStatuses = new Map<string, TaskStatus>()
    phoneList.forEach(p => newStatuses.set(p.id, { status: 'pending' }))
    setTaskStatuses(newStatuses)

    logActivity({
      orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '',
      action: 'mass_posting_launched',
      details: { phones: phoneList.map(p => p.ig_username ?? p.phone_name), count: phoneList.length, videos: selectedVideos.length },
    })

    // ── Suivi global + alerte même-proxy ────────────────────────────────────
    ;(async () => {
      let proxyKeys: string[] = []
      try {
        const pm = await fetchPhoneProxies(bearer)
        proxyKeys = [...new Set(phoneList.map(p => {
          const px = pm.get(p.geelark_id); return px?.server ? `${px.server}:${px.port ?? ''}` : ''
        }).filter(Boolean))]
      } catch { /* best-effort */ }
      const clash = proxyConflicts(proxyKeys, runId)
      if (clash.length) {
        log(tr(`⚠️ Un autre posting tourne déjà sur ${clash.length} proxy(s) utilisé(s) ici — mêmes IP en parallèle = risque de ban.`, `⚠️ Another posting is already running on ${clash.length} proxy(s) used here — same IPs in parallel = ban risk.`), 'warn')
        toast.show({ title: tr('⚠️ Même proxy déjà utilisé', '⚠️ Same proxy already in use'), body: tr('Un autre posting tourne sur le même proxy — mêmes IP en parallèle, risque de ban.', 'Another posting is running on the same proxy — same IPs in parallel, ban risk.'), kind: 'warn' })
      }
      startRun({
        id: runId, type: 'mass', label: `Mass posting · ${phoneList.length} ${tr('compte', 'account')}${phoneList.length > 1 ? 's' : ''}`,
        proxyKeys, done: 0, total: assignments.length, page: 'posting',
        phones: phoneList.map(p => ({ id: p.id, name: p.ig_username ? `@${p.ig_username}` : (p.phone_name ?? p.id.slice(-6)), status: 'idle' as PhaseStatus })),
      })
    })()

    // Snapshot des statuts finaux (avant resetMassPosting) — le finally l'utilise
    // pour calculer le remboursement. Sinon il relit le store DÉJÀ vidé par le
    // reset → 0 publié → rembourse TOUT (bug : « 78 crédits remboursés » alors que
    // 37 tél ont posté).
    let finalStatusSnapshot: Map<string, TaskStatus> | null = null

    try {
      // ── Step 1: upload only videos actually assigned to a phone ──────────
      const usedIndices = [...new Set(assignments.map(a => a.videoIndex).filter(i => i >= 0))]
      log(tr(`Upload de ${usedIndices.length} vidéo(s) vers GéeLark…`, `Uploading ${usedIndices.length} video(s) to GeeLark…`))
      const tokenMap = new Map<number, string>() // videoIndex → token

      for (const vi of usedIndices) {
        const sv = selectedVideos[vi]

        // Mark phones using this video as uploading
        assignments.forEach(a => {
          if (a.videoIndex === vi) setPhoneStatus(a.phone.id, { status: 'uploading' })
        })

        const fileSource = await resolveVideoPath(sv)
        if (!fileSource) {
          log(tr(`Vidéo ${vi + 1} sans source — ignorée`, `Video ${vi + 1} has no source — skipped`), 'warn')
          continue
        }
        // Retry sur l'upload : un timeout/throttle transitoire ne doit pas
        // condamner tous les tels qui utilisent cette vidéo.
        let up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath: fileSource })
        for (let attempt = 0; (!up.ok || !up.token) && attempt < 2; attempt++) {
          log(tr(`Envoi de la vidéo ${vi + 1} raté — nouvel essai…`, `Upload of video ${vi + 1} failed — retrying…`), 'warn')
          await new Promise(r => setTimeout(r, 2500 * (attempt + 1)))
          up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath: fileSource })
        }
        if (!up.ok || !up.token) {
          log(tr(`Échec de l'envoi de « ${sv.item.title} » vers GéeLark`, `Failed to upload “${sv.item.title}” to GeeLark`), 'error')
          assignments.forEach(a => {
            if (a.videoIndex === vi) setPhoneStatus(a.phone.id, { status: 'error', detail: up.error })
          })
          continue
        }

        tokenMap.set(vi, up.token)
        log(tr(`Vidéo ${vi + 1} uploadée (${sv.item.title.slice(0, 30)}…)`, `Video ${vi + 1} uploaded (${sv.item.title.slice(0, 30)}…)`), 'ok')
      }

      // Persiste le média + légende PAR téléphone (+ options) : après un refresh,
      // la reprise pourra RELANCER les téléphones jamais partis sans ré-upload ni
      // nouveau débit (crédits déjà pris ici, tâches déjà envoyées exclues).
      setMassPostingState({
        platform, reelsTrial: postingOpts.reelsTrial,
        runPhones: assignments.map(a => ({
          phoneId: a.phone.id, geelarkId: a.phone.geelark_id, phoneName: a.phone.phone_name,
          token: tokenMap.get(a.videoIndex), caption: capFor(a.video),
        })),
      })

      // ── Concurrence limitée (proxys rotatifs) : postage par lots ──────────
      // Allumer tous les téléphones d'un coup fait tomber la co sur proxy rotatif.
      // On limite le nombre de téléphones allumés/postant EN MÊME TEMPS ; chaque
      // lot est démarré → posté → éteint avant le suivant, avec délai optionnel.
      // Rotation d'IP : UNIQUEMENT si "Proxy rotatif" est coché ET des URLs sont
      // configurées. Sinon rien ne change (pas de série forcée).
      const rotationUrls  = postingOpts.rotatingProxy ? resolveRotationUrls(postingOpts.rotateProxyUrls) : []
      // En proxy rotatif : autant de téléphones en parallèle qu'il y a de proxies.
      const _concurrency  = effectiveConcurrency(postingOpts, assignments.length, rotationUrls.length)
      if (platform === 'instagram' && _concurrency < assignments.length) {
        const batches: (typeof assignments)[] = []
        for (let i = 0; i < assignments.length; i += _concurrency) batches.push(assignments.slice(i, i + _concurrency))
        log(tr(`Concurrence : ${_concurrency} téléphone(s) à la fois — ${batches.length} lot(s)${postingOpts.rotatingProxy ? ' · proxy rotatif' : ''}`, `Concurrency: ${_concurrency} phone(s) at a time — ${batches.length} batch(es)${postingOpts.rotatingProxy ? ' · rotating proxy' : ''}`), 'info')

        const STATUS_B: Record<number, string> = { 1: tr('En attente', 'Pending'), 2: tr('En cours', 'In progress'), 3: tr('Publié', 'Published'), 4: tr('Échec', 'Failed'), 7: tr('Annulé', 'Cancelled') }
        const pollBatch = async (ids: Record<string, string>) => {
          const list = Object.values(ids)
          if (!list.length) return
          const pending = new Set(list)
          // 5 min de poll : + boot (~1 min) reste sous le garde-fou 7 min du lot.
          const deadline = Date.now() + 5 * 60 * 1000
          while (pending.size > 0 && Date.now() < deadline) {
            if (stopRef.current) break
            await new Promise(r => setTimeout(r, 7000))
            if (stopRef.current) break
            let qRes: Record<string, unknown>
            try { qRes = await geelark(bearer, '/task/query', { ids: [...pending] }) } catch { continue }
            const d = (qRes['data'] as Record<string, unknown>) ?? qRes
            let items = (d['items'] ?? d['list'] ?? d['tasks'] ?? d['records']) as Array<Record<string, unknown>> | undefined
            if (!Array.isArray(items)) items = []
            for (const item of items) {
              const tid = (item['id'] ?? item['taskId']) as string
              const status = Number(item['status'])
              if (![3, 4, 7].includes(status)) continue
              pending.delete(tid)
              const phone = phoneList.find(p => ids[p.geelark_id] === tid)
              postingStartRef.current.delete(phone?.geelark_id ?? '')
              const fail = item['failDesc'] ? ` — ${item['failDesc']}` : ''
              log(`${STATUS_B[status] ?? status} ${phone?.phone_name ?? tid}${fail}`, status === 3 ? 'ok' : 'error')
              if (phone) {
                setPhoneStatus(phone.id, { status: status === 3 ? 'done' : 'error', detail: item['failDesc'] as string | undefined })
                activeTasksRef.current = activeTasksRef.current.filter(id => id !== tid)
              }
            }
          }
          if (pending.size > 0 && !stopRef.current) {
            for (const tid of pending) {
              const phone = phoneList.find(p => ids[p.geelark_id] === tid)
              if (phone) setPhoneStatus(phone.id, { status: 'done', detail: tr('non confirmé', 'unconfirmed') })
            }
          }
        }

        for (let bi = 0; bi < batches.length; bi++) {
          if (stopRef.current) { log(tr('Run interrompu (stop)', 'Run interrupted (stop)'), 'warn'); break }
          const batch = batches[bi]
          const ids = batch.map(a => a.phone.geelark_id)
          // Rotation d'IP AVANT d'allumer le(s) téléphone(s) du lot → ils démarrent
          // directement sur la nouvelle IP (ils ne touchent jamais l'ancienne).
          if (rotationUrls.length > 0) {
            log(tr(`Lot ${bi + 1}/${batches.length} — rotation IP avant démarrage…`, `Batch ${bi + 1}/${batches.length} — IP rotation before start…`))
            await rotateAllProxies(rotationUrls, m => log(`  ${m.trim()}`))
          }
          log(tr(`Lot ${bi + 1}/${batches.length} — démarrage de ${batch.length} téléphone(s)…`, `Batch ${bi + 1}/${batches.length} — starting ${batch.length} phone(s)…`))
          activePhonesRef.current = [...new Set([...activePhonesRef.current, ...ids])]
          const startRes = await geelark(bearer, '/phone/start', { ids })
          // Backstop serveur (PC fermé) : 8 min → laisse le garde-fou client 7 min
          // agir d'abord, le serveur ne rattrape que si le client meurt vraiment.
          registerStartedPhones(ids, { orgId: currentOrg?.id ?? null, userId: user.id }, { reason: 'mass_posting', stopAt: new Date(Date.now() + 8 * 60_000) })
          const started = (startRes['data'] as Record<string, number>)?.['successAmount'] ?? 0
          if (started === 0) {
            batch.forEach(a => setPhoneStatus(a.phone.id, { status: 'error', detail: tr('démarrage échoué', 'start failed') }))
            activePhonesRef.current = activePhonesRef.current.filter(id => !ids.includes(id))
            continue
          }
          // 🛡️ GARDE-FOU DUR : quoi qu'il arrive (boucle bloquée sur un await, onglet
          // mis en arrière-plan par le navigateur, réseau qui pend), les téléphones de
          // CE lot sont éteints au bout de 7 min. C'est le filet qui manquait sur le
          // chemin proxy rotatif (l'ancien armAutoStop n'existait que sur le chemin
          // standard) → des tél restaient allumés indéfiniment.
          const batchSafety = window.setTimeout(() => {
            geelark(bearer, '/phone/stop', { ids }).catch(() => {})
            unregisterPhones(ids).catch(() => {})
            activePhonesRef.current = activePhonesRef.current.filter(id => !ids.includes(id))
            log(tr(`⏱ Garde-fou 7 min — extinction forcée du lot ${bi + 1}/${batches.length}`, `⏱ 7 min safeguard — forced shutdown of batch ${bi + 1}/${batches.length}`), 'warn')
          }, 7 * 60_000)
          autoStopTimersRef.current.push(batchSafety)
          if (stopRef.current) { window.clearTimeout(batchSafety); break }
          // Boot réduit : la vérif de connectivité par téléphone (plus bas) sert de
          // filet — on repart dès que le tél répond, pas besoin d'un 30s fixe.
          log(tr('Attente du boot (~20s)…', 'Waiting for boot (~20s)…'))
          await new Promise(r => setTimeout(r, 20000))
          if (stopRef.current) break

          const batchTaskIds: Record<string, string> = {}
          for (const asgn of batch) {
            if (stopRef.current) break
            const token = tokenMap.get(asgn.videoIndex)
            if (!token) { log(tr(`  ${asgn.phone.phone_name} : la vidéo n'a pas pu être préparée`, `  ${asgn.phone.phone_name}: video could not be prepared`), 'warn'); setPhoneStatus(asgn.phone.id, { status: 'error', detail: tr('vidéo non préparée', 'video not prepared') }); continue }
            // La rotation d'IP a déjà eu lieu AVANT le démarrage du lot (le tél a
            // booté sur l'IP fraîche). On vérifie juste que la connexion est là.
            // (PRÉ-check seulement — jamais de retry, pour ne pas risquer un double post).
            await waitForPhoneConnectivity(bearer, asgn.phone.geelark_id, m => log(`  ${asgn.phone.phone_name}: ${m.trim()}`))
            if (rotationUrls.length > 0) {
              const ip = await getPhonePublicIp(bearer, asgn.phone.geelark_id)
              if (ip) log(`  ${asgn.phone.phone_name}: 🌍 IP ${ip}`, 'ok')
            }
            setPhoneStatus(asgn.phone.id, { status: 'posting' })
            postingStartRef.current.set(asgn.phone.geelark_id, Date.now())
            let taskRes: Record<string, unknown> | null = null
            for (let attempt = 0; attempt < 3; attempt++) {
              taskRes = await geelark(bearer, '/rpa/task/instagramPubReels', {
                id: asgn.phone.geelark_id, scheduleAt: Math.floor(Date.now() / 1000),
                description: capFor(asgn.video), video: [token], ...(postingOpts.reelsTrial ? { shareType: 2 } : {}),
              })
              if (taskRes['code'] === 0) break
              if (attempt < 2) { log(tr(`  ${asgn.phone.phone_name} : ${taskRes['msg'] ?? 'publication refusée'} — nouvel essai…`, `  ${asgn.phone.phone_name}: ${taskRes['msg'] ?? 'post rejected'} — retrying…`), 'warn'); await new Promise(r => setTimeout(r, 3000 * (attempt + 1))) }
            }
            if (taskRes && taskRes['code'] === 0) {
              const tid = (taskRes['data'] as Record<string, unknown>)?.['id'] as string
              batchTaskIds[asgn.phone.geelark_id] = tid
              activeTasksRef.current = [...activeTasksRef.current, tid]
              setPhoneTaskId(asgn.phone.geelark_id, tid)
              setPhoneStatus(asgn.phone.id, { status: 'posting', taskId: tid })
              log(tr(`  Tâche créée pour ${asgn.phone.phone_name}`, `  Task created for ${asgn.phone.phone_name}`), 'ok')
            } else {
              log(tr(`  ${asgn.phone.phone_name} : ${taskRes?.['msg'] ?? 'la publication a échoué'}`, `  ${asgn.phone.phone_name}: ${taskRes?.['msg'] ?? 'the post failed'}`), 'error')
              setPhoneStatus(asgn.phone.id, { status: 'error', detail: String(taskRes?.['msg'] ?? taskRes?.['code'] ?? tr('échec', 'failed')) })
            }
            await new Promise(r => setTimeout(r, 500))
          }

          await pollBatch(batchTaskIds)

          // Lot terminé normalement → on désarme le garde-fou 7 min de ce lot.
          window.clearTimeout(batchSafety)
          autoStopTimersRef.current = autoStopTimersRef.current.filter(t => t !== batchSafety)
          // Éteint les téléphones de ce lot (libère le proxy avant le suivant).
          const strag = ids.filter(id => activePhonesRef.current.includes(id))
          if (strag.length) {
            try { await geelark(bearer, '/phone/stop', { ids: strag }) } catch { /* watchdog serveur */ }
            unregisterPhones(strag).catch(() => {})
            activePhonesRef.current = activePhonesRef.current.filter(id => !strag.includes(id))
          }

          // Réconciliation : le lot est éteint → un tél encore "en cours" (le poll
          // n'a pas confirmé à temps, ex. GeeLark a fermé le tél à 5 min) est
          // marqué "publié (non confirmé)" au lieu de rester bloqué. Sauf si stop.
          if (!stopRef.current) {
            const cur = live.statuses
            for (const asgn of batch) {
              const st = cur.get(asgn.phone.id)?.status
              if (st === 'posting' || st === 'pending' || st === 'uploading') {
                setPhoneStatus(asgn.phone.id, { status: 'done', detail: tr('non confirmé', 'unconfirmed') })
                activeTasksRef.current = activeTasksRef.current.filter(id => id !== batchTaskIds[asgn.phone.geelark_id])
              }
            }
          }
        }
      } else {
      // ── Step 2: start phones ──────────────────────────────────────────────
      if (stopRef.current) { log(tr('Run interrompu avant le démarrage des téléphones', 'Run interrupted before starting phones'), 'warn'); return }
      const geelarkIds = phoneList.map(p => p.geelark_id)
      activePhonesRef.current = geelarkIds
      log(tr(`Démarrage de ${phoneList.length} téléphone(s)…`, `Starting ${phoneList.length} phone(s)…`))
      const startRes = await geelark(bearer, '/phone/start', { ids: geelarkIds })
      const started  = (startRes['data'] as Record<string, number>)?.['successAmount'] ?? 0
      log(tr(`  ${started} démarré(s)`, `  ${started} started`), started > 0 ? 'ok' : 'warn')
      // Filet de sécurité serveur : si ScaleFlow se ferme, le watchdog éteint ces
      // téléphones après 5 min (ils ont été démarrés par l'automation, pas à la main).
      registerStartedPhones(geelarkIds, { orgId: currentOrg?.id ?? null, userId: user.id }, { reason: 'mass_posting' })

      // Aucun téléphone démarré → inutile de continuer : abort + refund total
      if (started === 0) {
        run.abort()
        const cur = live.statuses
        for (const p of phoneList) {
          if (cur.get(p.id)?.status !== 'error') setPhoneStatus(p.id, { status: 'error', detail: tr('démarrage échoué', 'start failed') })
        }
        log(tr('Aucun téléphone démarré — run annulé', 'No phone started — run cancelled'), 'error')
        return
      }

      if (stopRef.current) { log(tr('Run interrompu avant le boot', 'Run interrupted before boot'), 'warn'); return }
      log(tr('Attente 30s (boot)…', 'Waiting 30s (boot)…'))
      await new Promise(r => setTimeout(r, 30000))
      if (stopRef.current) { log(tr('Run interrompu après le boot', 'Run interrupted after boot'), 'warn'); return }

      // ── Step 3: create RPA tasks ──────────────────────────────────────────
      log(tr('Préparation des publications…', 'Preparing posts…'))
      const taskIds: Record<string, string> = {}
      const scheduleTimes = buildScheduleTimes(assignments.length, postingOpts)
      if (postingOpts.intervalMode !== 'none' && assignments.length > 1) {
        const lastMin = Math.round((scheduleTimes[scheduleTimes.length - 1] - scheduleTimes[0]) / 60)
        log(tr(`Intervalle activé — dernier post dans ~${lastMin} min`, `Interval enabled — last post in ~${lastMin} min`), 'info')
      }

      // Programme l'auto-stop d'un téléphone (4m30) — partagé IG/TikTok.
      const armAutoStop = (geelarkId: string, phoneId: string, phoneName: string) => {
        const timerId = window.setTimeout(() => {
          autoStopTimersRef.current = autoStopTimersRef.current.filter(id => id !== timerId)
          if (activePhonesRef.current.includes(geelarkId)) {
            geelark(bearer, '/phone/stop', { ids: [geelarkId] })
              .then(() => log(tr(`  ${phoneName} — posting fini`, `  ${phoneName} — posting done`), 'ok'))
              .catch(() => {})
            unregisterPhones([geelarkId])
            setPhoneStatus(phoneId, { status: 'done' })
            activePhonesRef.current = activePhonesRef.current.filter(id => id !== geelarkId)
          }
        }, 270_000)
        autoStopTimersRef.current.push(timerId)
      }

      if (platform === 'tiktok') {
        // ── TikTok : un seul appel /task/add (taskType:1) qui batch tous les comptes ──
        const list: Array<{ scheduleAt: number; envId: string; video: string; videoDesc: string; ai: number }> = []
        for (let ai = 0; ai < assignments.length; ai++) {
          const asgn = assignments[ai]
          const token = tokenMap.get(asgn.videoIndex)
          if (!token) {
            log(tr(`  ${asgn.phone.phone_name} : la vidéo n'a pas pu être préparée`, `  ${asgn.phone.phone_name}: video could not be prepared`), 'warn')
            setPhoneStatus(asgn.phone.id, { status: 'error', detail: tr('vidéo non préparée', 'video not prepared') })
            continue
          }
          setPhoneStatus(asgn.phone.id, { status: 'posting' })
          postingStartRef.current.set(asgn.phone.geelark_id, Date.now())
          list.push({ scheduleAt: scheduleTimes[ai], envId: asgn.phone.geelark_id, video: token, videoDesc: capFor(asgn.video), ai })
        }
        if (list.length > 0) {
          const taskRes = await geelark(bearer, '/task/add', {
            taskType: 1,
            list: list.map(({ scheduleAt, envId, video, videoDesc }) => ({ scheduleAt, envId, video, videoDesc })),
          })
          // /task/add renvoie data.taskIds (tableau, dans l'ordre de la liste envoyée)
          const ids = ((taskRes['data'] as Record<string, unknown>)?.['taskIds'] ?? []) as string[]
          if (taskRes['code'] === 0 && Array.isArray(ids) && ids.length > 0) {
            list.forEach((item, idx) => {
              const asgn = assignments[item.ai]
              const tid = ids[idx]
              if (!tid) { setPhoneStatus(asgn.phone.id, { status: 'error', detail: 'no task id' }); return }
              taskIds[asgn.phone.geelark_id] = tid
              activeTasksRef.current = [...activeTasksRef.current, tid]
              setPhoneTaskId(asgn.phone.geelark_id, tid)  // watchdog ↔ webhook
              setPhoneStatus(asgn.phone.id, { status: 'posting', taskId: tid })
              log(tr(`  Tâche TikTok créée pour ${asgn.phone.phone_name}`, `  TikTok task created for ${asgn.phone.phone_name}`), 'ok')
              armAutoStop(asgn.phone.geelark_id, asgn.phone.id, asgn.phone.phone_name)
            })
          } else {
            log(tr(`  TikTok a refusé la publication${typeof taskRes['msg'] === 'string' ? ` — ${taskRes['msg']}` : ''}`, `  TikTok rejected the post${typeof taskRes['msg'] === 'string' ? ` — ${taskRes['msg']}` : ''}`), 'error')
            list.forEach(item => setPhoneStatus(assignments[item.ai].phone.id, { status: 'error', detail: String(taskRes['msg'] ?? taskRes['code']) }))
          }
        }
      } else {
        // ── Instagram : une tâche RPA instagramPubReels par téléphone ──
        // Petit espacement entre chaque création + retry/backoff sur les codes
        // transitoires GéeLark (throttle/lock) — évite le « ça marche sur certains
        // tels, plus du tout sur d'autres » quand on lance beaucoup de tels d'un coup.
        for (let ai = 0; ai < assignments.length; ai++) {
          if (stopRef.current) { log(tr('Création des tâches interrompue (stop)', 'Task creation interrupted (stop)'), 'warn'); break }
          const asgn = assignments[ai]
          const token = tokenMap.get(asgn.videoIndex)
          if (!token) {
            log(tr(`  ${asgn.phone.phone_name} : la vidéo n'a pas pu être préparée`, `  ${asgn.phone.phone_name}: video could not be prepared`), 'warn')
            setPhoneStatus(asgn.phone.id, { status: 'error', detail: tr('vidéo non préparée', 'video not prepared') })
            continue
          }
          setPhoneStatus(asgn.phone.id, { status: 'posting' })
          postingStartRef.current.set(asgn.phone.geelark_id, Date.now())

          let taskRes: Record<string, unknown> | null = null
          let outcome: TaskOutcome = 'unknown'
          for (let attempt = 0; attempt < 3; attempt++) {
            taskRes = await geelark(bearer, '/rpa/task/instagramPubReels', {
              id:          asgn.phone.geelark_id,
              scheduleAt:  scheduleTimes[ai],
              description: capFor(asgn.video),
              video:       [token],
              ...(postingOpts.reelsTrial ? { shareType: 2 } : {}),
            })
            outcome = classifyTaskRes(taskRes)
            if (outcome === 'ok') break
            // Réponse perdue (réseau/timeout) : la tâche a PEUT-ÊTRE été créée →
            // on NE retente PAS (sinon double post). On la traite comme « en vol non
            // confirmée » plus bas.
            if (outcome === 'unknown') break
            // 'rejected' = GeeLark a bien refusé (tâche non créée) → retry sûr.
            if (attempt < 2) {
              log(tr(`  ${asgn.phone.phone_name} : ${taskRes['msg'] ?? 'publication refusée'} — nouvel essai…`, `  ${asgn.phone.phone_name}: ${taskRes['msg'] ?? 'post rejected'} — retrying…`), 'warn')
              await new Promise(r => setTimeout(r, 3000 * (attempt + 1)))
            }
          }
          if (outcome === 'ok') {
            const tid = (taskRes!['data'] as Record<string, unknown>)?.['id'] as string
            taskIds[asgn.phone.geelark_id] = tid
            activeTasksRef.current = [...activeTasksRef.current, tid]
            setPhoneTaskId(asgn.phone.geelark_id, tid)  // watchdog ↔ webhook
            setPhoneStatus(asgn.phone.id, { status: 'posting', taskId: tid })
            log(tr(`  Tâche créée pour ${asgn.phone.phone_name}`, `  Task created for ${asgn.phone.phone_name}`), 'ok')
            armAutoStop(asgn.phone.geelark_id, asgn.phone.id, asgn.phone.phone_name)
          } else if (outcome === 'unknown') {
            // Ambiguë : pas de taskId à suivre, mais la publication est peut-être
            // partie. On la laisse « posting (non confirmé) » SANS taskId → elle ne
            // sera JAMAIS relancée (ni par le retry, ni par la reprise) → zéro double.
            // On arme quand même l'auto-stop pour éteindre le tél et clore l'UI.
            log(tr(`  ${asgn.phone.phone_name} : réponse GeeLark perdue (réseau) — publication peut-être partie, on ne retente pas (anti-double)`, `  ${asgn.phone.phone_name}: GeeLark response lost (network) — post may have gone out, not retrying (anti-duplicate)`), 'warn')
            setPhoneStatus(asgn.phone.id, { status: 'posting', detail: tr('non confirmé (réseau)', 'unconfirmed (network)') })
            armAutoStop(asgn.phone.geelark_id, asgn.phone.id, asgn.phone.phone_name)
          } else {
            log(tr(`  ${asgn.phone.phone_name}: ${taskRes?.['msg'] ?? taskRes?.['code'] ?? 'échec'}`, `  ${asgn.phone.phone_name}: ${taskRes?.['msg'] ?? taskRes?.['code'] ?? 'failed'}`), 'error')
            setPhoneStatus(asgn.phone.id, { status: 'error', detail: String(taskRes?.['msg'] ?? taskRes?.['code'] ?? tr('échec', 'failed')) })
          }
          // Espacement entre tels pour ne pas saturer l'API (sauf le dernier).
          if (ai < assignments.length - 1) await new Promise(r => setTimeout(r, 500))
        }
      }

      // ── Step 4: poll until done (max 10 min) ─────────────────────────────
      if (Object.keys(taskIds).length > 0) {
        log(tr(`Suivi de ${Object.keys(taskIds).length} tâche(s)…`, `Tracking ${Object.keys(taskIds).length} task(s)…`))
        const pending = new Set(Object.values(taskIds))
        const deadline = Date.now() + 6 * 60 * 1000
        const STATUS: Record<number, string> = { 1: tr('En attente', 'Pending'), 2: tr('En cours', 'In progress'), 3: tr('Publié', 'Published'), 4: tr('Échec', 'Failed'), 7: tr('Annulé', 'Cancelled') }

        // Phrases spécifiques d'un popup login/vérification — des mots isolés
        // ('confirm', 'login') matchaient l'UI normale d'Instagram (faux positifs).
        const ALERT_KEYWORDS = [
          'log in to instagram', 'log into another account', 'sign in to instagram',
          'enter your password', 'forgot password', 'mot de passe oublié', 'saisis ton mot de passe',
          'confirm your identity', 'confirme ton identité',
          'suspicious login', 'suspicious activity', 'connexion suspecte', 'activité suspecte',
          'unusual login', 'unusual activity', 'activité inhabituelle',
          'verify your account', 'verify your identity', 'vérifie ton compte',
          'verification code', 'code de vérification', 'enter the code', 'entre le code',
          'we detected', 'nous avons détecté', 'challenge_required',
          '2-step verification', 'two-factor authentication', 'validation en deux étapes',
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
              ? tr(`${phoneName} : fenêtre "${keyword}" détectée — intervention requise`, `${phoneName}: "${keyword}" window detected — action required`)
              : tr(`${phoneName} : posting long — vérifiez l'écran`, `${phoneName}: posting is taking long — check the screen`)
            log(msg + ` [screenshot]::${dataUrl}`, needsAttention ? 'warn' : 'warn')
            notifiedRef.current.add(geelarkId)
            // Desktop notification (works in Electron + browser with permission)
            if (Notification.permission === 'granted') {
              new Notification(tr('ScaleFlow — Intervention requise', 'ScaleFlow — Action required'), {
                body: needsAttention
                  ? tr(`${phoneName} : fenêtre de connexion/vérification détectée`, `${phoneName}: login/verification window detected`)
                  : tr(`${phoneName} prend du temps — ouvrez ScaleFlow pour vérifier`, `${phoneName} is taking a while — open ScaleFlow to check`),
                icon: '/sf-logo.svg',
              })
            }
          } catch { /* ignore screenshot errors */ }
        }

        let pollCount = 0
        while (pending.size > 0 && Date.now() < deadline) {
          if (stopRef.current) { log(tr('Polling interrompu (stop)', 'Polling interrupted (stop)'), 'warn'); break }
          await new Promise(r => setTimeout(r, 10000))
          if (stopRef.current) { log(tr('Polling interrompu (stop)', 'Polling interrupted (stop)'), 'warn'); break }
          let qRes: Record<string, unknown>
          try {
            qRes = await geelark(bearer, '/task/query', { ids: [...pending] })
          } catch (pollErr) {
            log(tr('Vérification du statut échouée — nouvelle tentative…', 'Status check failed — retrying…'), 'warn')
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
              log(`${STATUS[status] ?? status} ${name}${fail}`, level)  // STATUS values already localized via tr
              if (phone) {
                setPhoneStatus(phone.id, {
                  status: status === 3 ? 'done' : 'error',
                  detail: item['failDesc'] as string | undefined,
                })
                // Power off this phone immediately now that its task is finished
                geelark(bearer, '/phone/stop', { ids: [phone.geelark_id] })
                  .then(() => log(tr(`  ${phone.phone_name} éteint`, `  ${phone.phone_name} shut down`), 'ok'))
                  .catch(() => log(tr(`  Extinction de ${phone.phone_name} échouée`, `  Failed to shut down ${phone.phone_name}`), 'warn'))
                unregisterPhones([phone.geelark_id])
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
        if (pending.size > 0 && !stopRef.current) {
          log(tr(`${pending.size} tâche(s) sans réponse après le délai — marquées « non confirmé »`, `${pending.size} task(s) unanswered after timeout — marked “unconfirmed”`), 'warn')
          // Le post a probablement abouti, mais GéeLark n'a pas confirmé :
          // statut visuel distinct plutôt qu'un done silencieux.
          for (const tid of pending) {
            const phone = phoneList.find(p => taskIds[p.geelark_id] === tid)
            if (phone) setPhoneStatus(phone.id, { status: 'done', detail: tr('non confirmé', 'unconfirmed') })
          }
        }
      }

      // ── Step 5: stop any phones still running (timeout / no-response) ────
      const remaining = activePhonesRef.current
      if (remaining.length > 0) {
        log(tr(`Arrêt des ${remaining.length} téléphone(s) restant(s)…`, `Stopping the ${remaining.length} remaining phone(s)…`))
        let stopOk = false
        try {
          const r = await geelark(bearer, '/phone/stop', { ids: remaining })
          stopOk = r?.['code'] === 0
        } catch { /* le finally / watchdog serveur prendra le relais */ }
        if (stopOk) {
          unregisterPhones(remaining).catch(() => {})
          activePhonesRef.current = []  // déjà coupés → évite un double-stop dans le finally
        }
        // Si l'arrêt a échoué : on GARDE activePhonesRef → le finally retente,
        // et on GARDE la ligne watchdog → le cron serveur rattrape.
      }
      } // fin du mode standard (else de la concurrence limitée)

      // Marque comme "done" uniquement les téléphones sans statut final — MAIS
      // jamais si le run a été STOPPÉ : dans ce cas cancelRun a (ou va) marquer les
      // téléphones actifs en "cancelled", et les repasser en "done" ici fausserait
      // l'historique/les stats (comptes annulés comptés comme publiés) ET le
      // remboursement (sous-remboursement). On préserve aussi 'cancelled'.
      if (!stopRef.current) {
        const currentStatuses = live.statuses
        for (const p of phoneList) {
          const existing = currentStatuses.get(p.id)?.status
          if (existing !== 'done' && existing !== 'error' && existing !== 'cancelled') {
            setPhoneStatus(p.id, { status: 'done' })
          }
        }
      }

      // Read final counts from sync store (not stale React closure)
      const finalStatuses = live.statuses
      finalStatusSnapshot = finalStatuses   // conservé pour le calcul du remboursement (finally)
      const okN = [...finalStatuses.values()].filter(s => s.status === 'done').length
      const errN = [...finalStatuses.values()].filter(s => s.status === 'error').length
      setLastRun({ ok: okN, err: errN, total: assignments.length })
      // Mémorise les téléphones en échec pour permettre un « Relancer les échecs ».
      setFailedPhoneIds(phoneList.filter(p => finalStatuses.get(p.id)?.status !== 'done').map(p => p.id))

      // Usage unique : retire de la banque les vidéos réellement publiées (au moins
      // un téléphone en succès), pour ne jamais reposter la même. Bank uniquement
      // (pas les fichiers locaux), et seulement si un post a réussi.
      if (postingOpts.deleteAfterPost) {
        const postedIdx = new Set<number>()
        for (const a of assignments) {
          if (a.videoIndex >= 0 && finalStatuses.get(a.phone.id)?.status === 'done') postedIdx.add(a.videoIndex)
        }
        const toDelete = [...postedIdx]
          .map(i => selectedVideos[i])
          .filter(sv => sv && sv.item.storage_path && !String(sv.item.id).startsWith('local-'))
        if (toDelete.length) {
          try {
            const ids = toDelete.map(sv => sv.item.id)
            const base = supabase.from('content_bank').delete().in('id', ids)
            await (currentOrg ? (base as any).eq('org_id', currentOrg.id) : (base as any).eq('user_id', user.id).is('org_id', null))
            const { deleteStorageObjects } = await import('@/lib/storage')
            deleteStorageObjects(toDelete.flatMap(sv => [sv.item.storage_path, sv.item.thumbnail_path])).catch(() => {})
            // Retire aussi de la sélection courante pour ne pas les re-proposer.
            const deletedIds = new Set(ids)
            setSelVideos(prev => prev.filter(sv => !deletedIds.has(sv.item.id)))
            log(tr(`🗑️ ${toDelete.length} vidéo(s) retirée(s) de la banque (usage unique)`, `🗑️ ${toDelete.length} video(s) removed from the bank (single use)`), 'ok')
          } catch (e) {
            log(tr('Impossible de retirer certaines vidéos de la banque', 'Could not remove some videos from the bank'), 'warn')
          }
        }
      }

      toast.show({ title: errN === 0 ? tr('Mass posting terminé ✓', 'Mass posting done ✓') : tr('Mass posting terminé avec erreurs', 'Mass posting finished with errors'), body: tr(`${okN}/${assignments.length} réussi${okN > 1 ? 's' : ''}${errN ? ` · ${errN} échec${errN > 1 ? 's' : ''}` : ''}`, `${okN}/${assignments.length} succeeded${errN ? ` · ${errN} failed` : ''}`), kind: errN === 0 ? 'ok' : 'error' })
      import('@/lib/notify').then(({ sendNotification }) => sendNotification({
        userId: user.id, orgId: currentOrg?.id ?? null,
        event: errN > 0 ? 'post_failed' : 'batch_done',
        subject: errN === 0 ? tr('✅ Mass posting terminé', '✅ Mass posting done') : tr('⚠️ Mass posting terminé avec erreurs', '⚠️ Mass posting finished with errors'),
        message: tr(`${okN}/${assignments.length} compte(s) publiés avec succès${errN ? ` · ${errN} échec(s)` : ''}.`, `${okN}/${assignments.length} account(s) published successfully${errN ? ` · ${errN} failure(s)` : ''}.`),
      })).catch(() => {})

      // Historique + compteur Hub : on enregistre TOUJOURS le run (même 0 succès)
      // pour que l'Historique soit fiable. (table post_runs, fire-and-forget)
      if (assignments.length > 0) {
        // Détail par compte pour l'historique cliquable (réussis / échoués + raison).
        const phoneResults = phoneList.map(p => {
          const st = finalStatuses.get(p.id)
          const ok = st?.status === 'done'
          return { name: p.ig_username ?? p.phone_name, ok, ...(ok ? {} : { error: st?.detail || tr('Échec', 'Failed') }) }
        })
        const base = {
          user_id:   user.id,
          org_id:    currentOrg?.id ?? null,
          type:      platform === 'tiktok' ? 'tiktok' : 'mass_posting',
          ok_count:  okN,
          err_count: errN,
          total:     assignments.length,
        }
        supabase.from('post_runs').insert({ ...base, phone_results: phoneResults })
          .then(({ error }) => {
            // Colonne phone_results absente (migration non appliquée) → insert sans.
            if (error && /phone_results/i.test(error.message)) {
              supabase.from('post_runs').insert(base).then(() => {}, () => {})
            }
          }, () => {})
      }

      // Dashboard Rapports : marque chaque compte publié comme "posté aujourd'hui"
      // (détection gratuite et immédiate, sans API — fiable pour le posting direct).
      ;(async () => {
        try {
          const day = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
          const orgId = currentOrg?.id ?? null
          const donePhones = phoneList.filter(p =>
            finalStatuses.get(p.id)?.status === 'done' && p.ig_username)
          for (const p of donePhones) {
            const row = {
              user_id: orgId ? null : user.id, org_id: orgId,
              phone_id: p.id, ig_username: p.ig_username, va: p.group_name || null, day,
              posted: true, posted_via: 'scaleflow', posted_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            let q = supabase.from('account_daily').select('id').eq('phone_id', p.id).eq('day', day)
            q = orgId ? q.eq('org_id', orgId) : q.eq('user_id', user.id)
            const { data: ex } = await q.maybeSingle()
            if (ex?.id) await supabase.from('account_daily').update(row).eq('id', ex.id)
            else await supabase.from('account_daily').insert(row)
          }
        } catch (e) { console.error('[MassPosting] account_daily write failed', e) }
      })()
      log(tr('Terminé ! Ce run se ferme dans 5s — tu peux en lancer d\'autres en parallèle.', 'Done! This run closes in 5s — you can launch more in parallel.'), 'ok')
      await new Promise(r => setTimeout(r, 5000))

    } catch (e: unknown) {
      log(tr('Une erreur est survenue pendant le posting.', 'An error occurred during posting.'), 'error')
    } finally {
      // Remboursement des crédits : quoi qu'il arrive (crash, sortie anticipée,
      // aucun téléphone démarré, Stop utilisateur), chaque téléphone qui n'a PAS
      // publié est remboursé. settle() est idempotent → sûr même appelé une fois.
      try {
        // Utilise le snapshot pris AVANT resetMassPosting ; fallback sur le store
        // vivant si on a crashé avant de l'avoir capturé.
        const fin = finalStatusSnapshot ?? live.statuses
        const okCount = phoneList.filter(p => fin.get(p.id)?.status === 'done').length
        const failedCount = phoneList.length - okCount
        if (failedCount > 0) run.markFailed(failedCount)
        const { refunded } = await run.settle()
        if (refunded > 0) {
          log(tr(`${refunded} crédit(s) remboursé(s) — ${failedCount} téléphone(s) non publié(s)`, `${refunded} credit(s) refunded — ${failedCount} phone(s) not published`), 'info')
          credits.refresh()
        }
      } catch { /* best-effort — jamais bloquer l'extinction des téléphones */ }

      // Filet de sécurité DUR : quoi qu'il arrive (crash, throttle, tâche jamais
      // confirmée par GéeLark, sortie anticipée), on éteint TOUS les tels encore
      // marqués actifs. C'est ce qui règle « les tels restent allumés ».
      const stuck = [...new Set(activePhonesRef.current.filter(Boolean))]
      if (stuck.length > 0) {
        log(tr(`Extinction de sécurité de ${stuck.length} téléphone(s)…`, `Safety shutdown of ${stuck.length} phone(s)…`), 'warn')
        let stopOk = false
        try {
          const r = await geelark(bearer, '/phone/stop', { ids: stuck })
          stopOk = r?.['code'] === 0
        } catch { /* réseau — on garde le watchdog serveur */ }
        // On ne retire du watchdog serveur QUE si l'extinction a réussi. Sinon on
        // LAISSE la ligne phone_power_watch : le cron serveur rattrapera le tel
        // (double sécurité — c'est la garantie « les tels ne restent pas allumés »).
        if (stopOk) unregisterPhones(stuck).catch(() => {})
        else log(tr('  Extinction non confirmée — le garde-fou serveur prendra le relais (≤ 5 min)', '  Shutdown not confirmed — the server safeguard will take over (≤ 5 min)'), 'warn')
      }
      // Purge les timers d'auto-stop encore en attente (les tels sont déjà coupés).
      autoStopTimersRef.current.forEach(id => window.clearTimeout(id))
      autoStopTimersRef.current = []
      activePhonesRef.current = []
      activeTasksRef.current = []
      // Clôture le suivi global.
      if (activeRunIdRef.current) {
        const fin = live.statuses
        const errN = [...fin.values()].filter(s => s.status === 'error').length
        endRun(activeRunIdRef.current, errN > 0 ? 'error' : 'done')
        activeRunIdRef.current = null
      }
      // Ferme CE run (garde la carte ~10s pour le bilan). Le flag singleton et la
      // persistance de reprise ne sont remis à zéro que si plus AUCUN run ne tourne
      // (sinon on effacerait la reprise d'un run parallèle encore actif).
      endMassRun(runId)
      if (!hasRunningMassRun()) { setPosting(false); resetMassPosting() }
    }
  }

  const visiblePhones = phones.filter(p => {
    if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
    if (groupFilter !== 'Tous' && p.group_name !== groupFilter) return false
    // Exclut les comptes détectés comme bloqués (évite de payer 2 cr pour un compte mort).
    if (hideBanned && p.account_state === 'banned') return false
    if (phoneSearch) {
      const q = phoneSearch.toLowerCase()
      return p.phone_name?.toLowerCase().includes(q) || p.ig_username?.toLowerCase().includes(q)
    }
    return true
  })
  const bannedCount = phones.filter(p => p.account_state === 'banned').length


  // Live progress stats
  const totalTasks     = assignments.length
  const doneTasks      = [...taskStatuses.values()].filter(s => s.status === 'done').length
  const errorTasks     = [...taskStatuses.values()].filter(s => s.status === 'error').length
  const cancelledTasks = [...taskStatuses.values()].filter(s => s.status === 'cancelled').length
  const activeTasks    = [...taskStatuses.values()].filter(s => s.status === 'uploading' || s.status === 'posting').length
  const progressPct    = totalTasks > 0 ? Math.round(((doneTasks + errorTasks + cancelledTasks) / totalTasks) * 100) : 0
  const toast = useToast()
  const [lastRun, setLastRun] = useState<{ ok: number; err: number; total: number } | null>(null)
  const [failedPhoneIds, setFailedPhoneIds] = useState<string[]>([])
  const [pendingRetry, setPendingRetry]     = useState(false)

  // Suivi global (widget « postings en cours »).
  const activeRunIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeRunIdRef.current && posting) {
      updateRun(activeRunIdRef.current, { done: doneTasks + errorTasks + cancelledTasks })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneTasks, errorTasks, cancelledTasks, posting])

  // Relance un run en ne (re)sélectionnant que les téléphones en échec.
  function retryFailed() {
    if (failedPhoneIds.length === 0 || posting) return
    setSelPhones(new Set(failedPhoneIds))
    setLastRun(null)
    setFailedPhoneIds([])
    setPendingRetry(true)  // post() est déclenché par l'effet une fois la sélection à jour
  }
  useEffect(() => {
    if (pendingRetry && !posting) {
      setPendingRetry(false)
      post()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRetry, phoneList])
  // Plus de verrou global : on peut lancer plusieurs postings en parallèle.
  const canLaunch = !!bearer && phoneList.length > 0 && selectedVideos.length > 0
  const launchCost = phoneList.length * CREDIT_COSTS.mass_posting

  // Readiness checklist — tells the user exactly what's missing
  const checklist = [
    { ok: !!bearer,                  label: tr('Token GéeLark connecté', 'GeeLark token connected'),  hint: tr('Ajoute ton token dans Paramètres → Connexions', 'Add your token in Settings → Connections') },
    { ok: phoneList.length > 0,      label: tr(`Téléphones ciblés${phoneList.length > 0 ? ` — ${phoneList.length}` : ''}`, `Phones targeted${phoneList.length > 0 ? ` — ${phoneList.length}` : ''}`), hint: tr('Coche des téléphones dans le panneau de gauche', 'Check some phones in the left panel') },
    { ok: selectedVideos.length > 0, label: tr(`Vidéos sélectionnées${selectedVideos.length > 0 ? ` — ${selectedVideos.length}` : ''}`, `Videos selected${selectedVideos.length > 0 ? ` — ${selectedVideos.length}` : ''}`), hint: tr('Ajoute des vidéos depuis la banque ou un dossier', 'Add videos from the bank or a folder') },
    {
      ok:    launchCost > 0 && credits.balance >= launchCost,
      label: tr(`Crédits suffisants${launchCost > 0 ? ` — ${launchCost} requis` : ''}`, `Enough credits${launchCost > 0 ? ` — ${launchCost} required` : ''}`),
      hint:  launchCost > 0 ? tr(`Solde actuel : ${credits.balance}`, `Current balance: ${credits.balance}`) : tr('Sélectionne des téléphones pour estimer le coût', 'Select phones to estimate the cost'),
    },
  ]
  const readyCount = checklist.filter(c => c.ok).length

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="anim-page h-full flex flex-col overflow-hidden" style={{ background: 'var(--surface)' }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <header style={{ flexShrink: 0, background: 'var(--surface-2)' }}>
        <div className="sf-page-header">

          {/* Left: icon + title */}
          <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
            <div className="sf-page-icon sf-anim-scale-spring">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 22-7z"/>
              </svg>
            </div>

            <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
              <h1 className="sf-page-title sf-title-grad">Mass Posting</h1>
              <p className="sf-page-sub">
                {tr('Instagram · Publication', 'Instagram · Post')}
                {launchCost > 0 && (
                  <span style={{ marginLeft: 10, color: 'var(--accent-l)', fontWeight: 700 }}>
                    · {launchCost} {tr('crédits', 'credits')}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Right: controls */}
          <div className="sf-page-header-actions sf-anim-slide-up sf-d100">

            {/* Mode toggle */}
            <div className="sf-segment" role="tablist" aria-label={tr('Mode de répartition', 'Distribution mode')}>
              {([{ k: 'seq', label: t('schedulerSequential') }, { k: 'random', label: t('schedulerRandom') }] as const).map(m => (
                <button key={m.k} onClick={() => setMode(m.k)}
                  className={`sf-segment-item${mode === m.k ? ' is-active' : ''}`}
                  role="tab" aria-selected={mode === m.k}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10.5 }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Reshuffle — random mode only */}
            {mode === 'random' && (
              <button
                title={tr("Regénérer l'assignation aléatoire", 'Regenerate random assignment')}
                onClick={() => setRandomSeed(s => s + 1)}
                className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9"/>
                  <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/>
                  <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
              </button>
            )}

            {/* Status chip */}
            <div className={`sf-status-chip ${posting ? 'is-accent' : 'is-idle'}`}>
              {posting
                ? <span className="sf-status-dot" style={{ color: 'var(--accent)' }} />
                : <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: 'var(--text-4)' }} />}
              <span style={{ letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {posting ? t('running') : t('idle')}
              </span>
            </div>
          </div>
        </div>

        <div style={{ padding: '2px 28px 0' }}>
        {/* Last run recap */}
        {!posting && lastRun && (
          <div className={`sf-banner ${lastRun.err === 0 ? 'is-accent' : 'is-warn'}`} style={{
            marginBottom: 14,
            ...(lastRun.err === 0 ? { background: 'var(--ok-dim)', borderColor: 'rgba(34,197,94,0.22)', color: 'var(--ok)' } : {}),
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: lastRun.err === 0 ? 'var(--ok)' : 'var(--warn)' }}>
              {lastRun.err === 0 ? '✓' : '!'} {tr(`Dernier run : ${lastRun.ok}/${lastRun.total} réussi${lastRun.ok > 1 ? 's' : ''}${lastRun.err > 0 ? ` · ${lastRun.err} échec${lastRun.err > 1 ? 's' : ''}` : ''}`, `Last run: ${lastRun.ok}/${lastRun.total} succeeded${lastRun.err > 0 ? ` · ${lastRun.err} failed` : ''}`)}
            </span>
            {failedPhoneIds.length > 0 && (
              <button onClick={retryFailed} className="sf-btn sf-btn-primary sf-btn-sm" style={{ marginLeft: 'auto' }}>
                {tr(`↻ Relancer les ${failedPhoneIds.length} échec${failedPhoneIds.length > 1 ? 's' : ''}`, `↻ Retry the ${failedPhoneIds.length} failure${failedPhoneIds.length > 1 ? 's' : ''}`)}
              </button>
            )}
            <button onClick={() => setLastRun(null)} className="sf-btn sf-btn-ghost sf-btn-sm" style={{ marginLeft: failedPhoneIds.length > 0 ? 0 : 'auto' }}>
              {tr('Masquer', 'Hide')}
            </button>
          </div>
        )}

        {/* Sélecteur de run — plusieurs postings en parallèle. Clique pour voir
            les logs/l'avancement de chacun. */}
        {massRunsList.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 12 }}>
            {massRunsList.map(r => {
              const done = [...r.statuses.values()].filter(s => s.status === 'done' || s.status === 'error' || s.status === 'cancelled').length
              const active = (focusedRunId ?? massRunsList[0]?.id) === r.id
              return (
                <button key={r.id} onClick={() => setFocusedRunId(r.id)} className="cursor-pointer" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: active ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  color: active ? '#c7cbff' : 'var(--text-3)',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.running ? 'var(--accent)' : OK, boxShadow: r.running ? '0 0 6px var(--accent-l)' : 'none' }} />
                  {r.label.replace('Mass posting · ', '')} · {done}/{r.total}
                </button>
              )
            })}
          </div>
        )}

        {/* Live progress strip */}
        {posting && totalTasks > 0 && (
          <div style={{ paddingBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, flexWrap: 'wrap' }}>
                <span style={{ color: IVORY, fontWeight: 700 }}>{doneTasks + errorTasks} / {totalTasks} {t('massPostingTasksProgress')}</span>
                {activeTasks > 0 && <span className="sf-badge sf-badge-warn" style={{ fontSize: 9 }}>{activeTasks} {tr('en cours', 'running')}</span>}
                {doneTasks > 0 && <span className="sf-badge sf-badge-ok" style={{ fontSize: 9 }}>{doneTasks} ok</span>}
                {errorTasks > 0 && <span className="sf-badge sf-badge-danger" style={{ fontSize: 9 }}>{errorTasks} {tr('erreur', 'error')}{errorTasks > 1 ? 's' : ''}</span>}
              </div>
              <span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 18, color: progressPct >= 100 ? OK : 'var(--accent)', lineHeight: 1, fontWeight: 800 }}>
                {progressPct}%
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ height: 4, background: 'rgba(233,234,240,0.06)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progressPct}%`, transition: 'width 0.7s ease', borderRadius: 99,
                background: progressPct >= 100 ? 'var(--ok)' : 'linear-gradient(90deg, #4F46E5, var(--accent))',
                boxShadow: progressPct > 0 ? '0 0 10px -2px rgba(99,102,241,0.7)' : 'none',
              }} />
            </div>
          </div>
        )}
        </div>
      </header>

      {/* ── 2-column body ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

        {/* ── LEFT: phone targets ───────────────────────────────────────────── */}
        <aside style={{
          width: 292, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid rgba(233,234,240,0.07)',
          background: 'var(--surface-2)',
        }}>
          {/* Panel header */}
          <div style={{ flexShrink: 0, padding: '16px 16px 12px', borderBottom: '1px solid rgba(233,234,240,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 7, fontFamily: SANS, fontStyle: 'normal', fontSize: 11.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#818CF8,#8B5CF6)', boxShadow: '0 6px 14px -7px rgba(139,92,246,0.65), inset 0 1px 0 rgba(255,255,255,0.32)' }}>01</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: IVORY }}>{t('massPostingTargets')}</span>
              {selectedPhones.size > 0 && (
                <span className="sf-badge sf-badge-accent" style={{ marginLeft: 'auto', fontSize: 10 }}>{selectedPhones.size}</span>
              )}
            </div>

            {/* Phones / Groups toggle */}
            <div style={{ display: 'flex', border: '1px solid rgba(233,234,240,0.08)', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
              {([{ k: 'phones', l: t('massPostingPhones') }, { k: 'groups', l: t('massPostingGroups') }] as const).map(m => (
                <button key={m.k} onClick={() => setPhonePickMode(m.k)}
                  className="cursor-pointer"
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    background: phonePickMode === m.k ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: phonePickMode === m.k ? 'var(--accent)' : FAINT,
                    border: 'none',
                    borderBottom: phonePickMode === m.k ? '2px solid var(--accent)' : '2px solid transparent',
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
                    className="cursor-pointer sf-input"
                    style={{ height: 30, padding: '0 8px', fontSize: 12 }}>
                    {groups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
                <input
                  type="text"
                  placeholder={t('massPostingSearchPhone')}
                  value={phoneSearch}
                  onChange={e => setPhoneSearch(e.target.value)}
                  className="sf-input"
                  style={{ height: 30, fontSize: 12, padding: '0 8px' }}
                />
                {/* Select all / none */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 2 }}>
                  <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
                    className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                    style={{ fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 6px', color: 'var(--accent)' }}>
                    {t('massPostingAllGroup')}
                  </button>
                  <button onClick={() => setSelPhones(new Set())}
                    className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                    style={{ fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 6px', color: FAINT }}>
                    {t('massPostingNoneGroup')}
                  </button>
                  {bannedCount > 0 && (
                    <button onClick={() => setHideBanned(v => !v)}
                      className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                      title={tr('Masquer les comptes détectés comme bloqués', 'Hide accounts detected as blocked')}
                      style={{ fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 6px', color: hideBanned ? 'var(--danger)' : FAINT }}>
                      {hideBanned ? '✓ ' : ''}{tr('Bannis masqués', 'Banned hidden')} ({bannedCount})
                    </button>
                  )}
                  <span style={{ marginLeft: bannedCount > 0 ? 0 : 'auto', fontSize: 10.5, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>{visiblePhones.length}</span>
                </div>
              </div>
            )}

            {phonePickMode === 'groups' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => {
                  const realGroups = groups.filter(g => g !== 'Tous')
                  setSelectedGroups(new Set(realGroups))
                  setSelPhones(new Set(phones.filter(p => {
                    if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
                    return Boolean(p.group_name)
                  }).map(p => p.id)))
                }}
                  className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                  style={{ fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                  {t('massPostingAllGroup')}
                </button>
                <button onClick={() => { setSelectedGroups(new Set()); setSelPhones(new Set()) }}
                  className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                  style={{ fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', color: FAINT }}>
                  {t('massPostingNoneGroup')}
                </button>
              </div>
            )}
          </div>

          {/* Phone list */}
          <div className="anim-stagger" style={{ flex: 1, overflow: 'auto', scrollbarWidth: 'thin' }}>
            {phonePickMode === 'phones' && visiblePhones.map(phone => {
              const checked = selectedPhones.has(phone.id)
              const asgn = assignmentByPhone.get(phone.id)
              const ts = taskStatuses.get(phone.id)
              const isActive = ts && (ts.status === 'uploading' || ts.status === 'posting')
              const initials = (phone.ig_username?.[0] ?? phone.phone_name?.[0] ?? '?').toUpperCase()
              return (
                <button key={phone.id} onClick={() => togglePhone(phone.id)}
                  className="cursor-pointer"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                    padding: '9px 14px', textAlign: 'left', position: 'relative', border: 'none',
                    borderBottom: '1px solid rgba(233,234,240,0.04)',
                    borderLeft: isActive ? '2px solid var(--accent)' : checked ? '2px solid rgba(99,102,241,0.5)' : '2px solid transparent',
                    background: isActive ? 'rgba(99,102,241,0.09)' : checked ? 'rgba(99,102,241,0.06)' : 'transparent',
                    boxShadow: isActive ? 'inset 0 0 18px rgba(99,102,241,0.07)' : 'none',
                    transition: 'background 0.15s, box-shadow 0.15s, border-left-color 0.15s',
                  }}
                  onMouseEnter={e => { if (!checked && !isActive) e.currentTarget.style.background = 'rgba(233,234,240,0.03)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.09)' : checked ? 'rgba(99,102,241,0.06)' : 'transparent' }}>

                  {/* Avatar */}
                  <div style={{
                    width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, borderRadius: 8,
                    border: `1px solid ${checked || isActive ? 'rgba(99,102,241,0.45)' : HAIR}`,
                    color: checked || isActive ? 'var(--accent)' : FAINT,
                    background: checked || isActive ? 'rgba(99,102,241,0.08)' : 'transparent',
                    transition: 'all 0.15s',
                  }}>
                    {initials}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: checked || isActive ? IVORY : 'rgba(233,234,240,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {phone.phone_name}
                    </p>
                    {phone.ig_username && (
                      <p style={{ fontSize: 10, color: checked || isActive ? 'rgba(99,102,241,0.7)' : FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{phone.ig_username}</p>
                    )}
                    {ts && ts.status !== 'idle' && ts.status !== 'pending' && (
                      <span className={STATUS_BADGE[ts.status] ?? 'sf-badge sf-badge-muted'} style={{ marginTop: 3, display: 'inline-flex', fontSize: 9 }}>
                        {STATUS_LABEL[ts.status]}
                      </span>
                    )}
                  </div>

                  {asgn?.video && (
                    <span className="sf-badge sf-badge-accent" style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      #{asgn.videoIndex + 1}
                    </span>
                  )}

                  {/* Checkbox */}
                  <div style={{
                    width: 14, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 4,
                    background: checked ? 'var(--accent)' : 'transparent',
                    border: checked ? 'none' : '1px solid rgba(233,234,240,0.18)',
                    transition: 'all 0.15s',
                  }}>
                    {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </button>
              )
            })}

            {/* État vide de la colonne téléphones : distingue « pas de token » de « aucun téléphone ». */}
            {phonePickMode === 'phones' && visiblePhones.length === 0 && (
              !bearer ? (
                <EmptyState
                  compact
                  title={tr('GéeLark non connecté', 'GeeLark not connected')}
                  description={tr('Ajoute ton token GéeLark pour importer tes téléphones.', 'Add your GeeLark token to import your phones.')}
                  action={{ label: tr('Configurer dans les Réglages', 'Configure in Settings'), onClick: () => window.dispatchEvent(new CustomEvent('sf:navigate', { detail: { page: 'settings', tab: 'connexions' } })) }}
                />
              ) : (
                <EmptyState
                  compact
                  title={tr('Aucun téléphone', 'No phone')}
                  description={tr("Synchronise tes cloud phones GéeLark depuis l'onglet Téléphones.", 'Sync your GeeLark cloud phones from the Phones tab.')}
                  action={{ label: tr('Aller aux Téléphones', 'Go to Phones'), onClick: () => window.dispatchEvent(new CustomEvent('sf:navigate', { detail: { page: 'phones' } })) }}
                />
              )
            )}

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
                      width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                      padding: '11px 14px', textAlign: 'left', position: 'relative', border: 'none',
                      borderBottom: '1px solid rgba(233,234,240,0.04)',
                      borderLeft: checked ? '2px solid rgba(99,102,241,0.5)' : '2px solid transparent',
                      background: checked ? 'rgba(99,102,241,0.06)' : 'transparent',
                      transition: 'background 0.15s, border-left-color 0.15s',
                    }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'rgba(233,234,240,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = checked ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                    <div style={{
                      width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 8,
                      border: `1px solid ${checked ? 'rgba(99,102,241,0.45)' : HAIR}`,
                      background: checked ? 'rgba(99,102,241,0.08)' : 'transparent',
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={checked ? 'var(--accent)' : FAINT} strokeWidth="1.8">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: checked ? IVORY : 'rgba(233,234,240,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g}</p>
                      <p style={{ fontSize: 10.5, color: checked ? 'rgba(99,102,241,0.7)' : FAINT }}>
                        {checked ? `${selCount}/${inGroup.length} ${t('massPostingSelCount')}` : `${inGroup.length} ${t('massPostingPhoneCount')}`}
                      </p>
                    </div>
                    <div style={{
                      width: 14, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 4,
                      background: checked ? 'var(--accent)' : 'transparent',
                      border: checked ? 'none' : '1px solid rgba(233,234,240,0.18)',
                    }}>
                      {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  </button>
                )
              })
            })()}
          </div>
        </aside>

        {/* ── RIGHT: main content flow ──────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--surface)' }}>
          <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            <div style={{ padding: '24px 28px 32px', maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── Readiness checklist ──────────────────────────────────────── */}
              {!posting && readyCount < 3 && (
                <div className="sf-card sf-anim-slide-up">
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(233,234,240,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>{tr('Préparation', 'Setup')}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{readyCount}/4</span>
                  </div>
                  {checklist.map((c, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                      borderBottom: i < checklist.length - 1 ? '1px solid rgba(233,234,240,0.04)' : 'none',
                      opacity: c.ok ? 0.5 : 1,
                      transition: 'opacity 0.2s',
                    }}>
                      <div style={{
                        width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: c.ok ? 'rgba(52,211,153,0.9)' : 'transparent',
                        border: c.ok ? 'none' : '1px solid rgba(233,234,240,0.2)',
                        borderRadius: '50%',
                        transition: 'all 0.2s',
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
              <section className="sf-anim-slide-up sf-d50">
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 7, fontFamily: SANS, fontStyle: 'normal', fontSize: 11.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#818CF8,#8B5CF6)', boxShadow: '0 6px 14px -7px rgba(139,92,246,0.65), inset 0 1px 0 rgba(255,255,255,0.32)' }}>02</span>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: IVORY }}>{t('massPostingContent')}</span>
                  {selectedVideos.length > 0 && (
                    <span className="sf-badge sf-badge-accent" style={{ fontSize: 9 }}>{selectedVideos.length}</span>
                  )}
                  <div style={{ flex: 1, height: 1, background: 'rgba(233,234,240,0.07)' }} />
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowBankPicker(true)} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer">
                      {t('massPostingFromBank')}
                    </button>
                    <button onClick={openFolderPick} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">
                      {t('massPostingFromFolder')}
                    </button>
                    {window.electronAPI?.pickVideoFile && (
                      <button onClick={() => pickLocalFile(-1)} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">
                        {t('massPostingFromPC')}
                      </button>
                    )}
                  </div>
                </div>

                {addingFolder && (
                  <div className="sf-banner is-accent" style={{ marginBottom: 10, fontSize: 12 }}>
                    <div className="sf-spinner" style={{ width: 12, height: 12 }} />
                    {t('massPostingAddingFolder')} «{addingFolder}»…
                  </div>
                )}

                <div className="sf-card" style={{ padding: 0, overflow: 'hidden' }}>
                  {selectedVideos.length === 0 ? (
                    <button onClick={() => setShowBankPicker(true)} className="cursor-pointer"
                      style={{
                        width: '100%', padding: '42px 24px', textAlign: 'center',
                        background: 'transparent', border: 'none',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.04)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px dashed rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--accent-l)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="2" width="20" height="20" rx="4"/>
                          <path d="M10 9.5L14.5 12 10 14.5V9.5z" fill="currentColor" stroke="none"/>
                        </svg>
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: IVORY, marginBottom: 4 }}>{t('massPostingNoContent')}</p>
                      <p style={{ fontSize: 11.5, color: MUTED }}>{t('massPostingNoContentHint')}</p>
                    </button>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1, background: 'rgba(233,234,240,0.04)' }}>
                      {selectedVideos.map((sv, selIdx) => {
                        const fp = sv.localPath ?? sv.item.file_url
                        return (
                          <div key={sv.item.id} className="group"
                            style={{ position: 'relative', aspectRatio: '9/16', maxHeight: 190, overflow: 'hidden', background: 'var(--surface-2)' }}>
                            <VideoThumbnail filePath={fp ?? ''} thumbnailPath={sv.item.thumbnail_path} storagePath={sv.item.storage_path} />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,6,8,0.9) 0%, transparent 50%)', pointerEvents: 'none' }} />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 7 }}>
                              <p style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 13, color: 'var(--accent)', lineHeight: 1, marginBottom: 2, fontWeight: 800 }}>{selIdx + 1}</p>
                              <p style={{ fontSize: 10, fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sv.item.title}</p>
                            </div>
                            <button onClick={() => setSelVideos(prev => prev.filter((_, i) => i !== selIdx))}
                              className="cursor-pointer opacity-0 group-hover:opacity-100"
                              style={{
                                position: 'absolute', top: 5, right: 5, width: 20, height: 20,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(6,6,8,0.9)', borderRadius: 4,
                                border: '1px solid rgba(248,113,113,0.4)', color: ERR,
                                transition: 'opacity 0.15s',
                              }}>
                              <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </button>
                          </div>
                        )
                      })}
                      {/* Add more tile */}
                      <button onClick={() => setShowBankPicker(true)} className="cursor-pointer"
                        style={{
                          aspectRatio: '9/16', maxHeight: 190,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                          background: 'transparent', border: 'none', color: FAINT, transition: 'color 0.18s, background 0.18s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(99,102,241,0.05)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = FAINT; e.currentTarget.style.background = 'transparent' }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{tr('Ajouter', 'Add')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* ── 03 — Légende ─────────────────────────────────────────────── */}
              <section className="sf-anim-slide-up sf-d100">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 7, fontFamily: SANS, fontStyle: 'normal', fontSize: 11.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#818CF8,#8B5CF6)', boxShadow: '0 6px 14px -7px rgba(139,92,246,0.65), inset 0 1px 0 rgba(255,255,255,0.32)' }}>03</span>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: IVORY }}>{t('massPostingDescription')}</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(233,234,240,0.07)' }} />
                  <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: caption.length > 2200 ? 'var(--err)' : FAINT }}>
                    {caption.length}/2200
                  </span>
                </div>

                <div className="sf-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <textarea
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    rows={4}
                    placeholder={t('massPostingCaptionPlaceholder')}
                    style={{
                      width: '100%', minHeight: 96, padding: '14px 16px', fontSize: 13, lineHeight: 1.65,
                      background: 'transparent', color: IVORY, resize: 'vertical',
                      border: 'none', outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid rgba(233,234,240,0.07)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      onClick={generateCaption}
                      disabled={!groqKey || generating}
                      className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        color: (!groqKey || generating) ? FAINT : 'var(--accent)',
                        opacity: (!groqKey || generating) ? 0.5 : 1,
                      }}>
                      {generating && <div className="sf-spinner" style={{ width: 11, height: 11 }} />}
                      {generating ? t('massPostingGeneratingAI') : t('massPostingGenerateAI')}
                    </button>
                    <input
                      type="text"
                      value={customPrompt}
                      onChange={e => setCustomPrompt(e.target.value)}
                      placeholder={t('massPostingCustomPrompt')}
                      style={{
                        flex: 1, minWidth: 150, height: 28, padding: '0 8px', fontSize: 12,
                        background: 'rgba(255,255,255,0.04)', color: IVORY, borderRadius: 6,
                        border: '1px solid rgba(233,234,240,0.1)', outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(233,234,240,0.1)' }}
                    />
                    <button
                      onClick={() => setWithHashtags(v => !v)}
                      title="Inclure les hashtags"
                      className="sf-btn sf-btn-sm cursor-pointer"
                      style={{
                        width: 30, height: 28, fontSize: 14, fontWeight: 800, padding: 0,
                        background: withHashtags ? 'var(--accent)' : 'rgba(255,255,255,0.04)',
                        color: withHashtags ? '#fff' : FAINT,
                        border: withHashtags ? 'none' : '1px solid rgba(233,234,240,0.1)',
                        borderRadius: 6, transition: 'all 0.18s',
                      }}>
                      #
                    </button>
                  </div>
                </div>
              </section>

              {/* ── 04 — Options de publication ──────────────────────────────── */}
              <section className="sf-anim-slide-up sf-d150">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 7, fontFamily: SANS, fontStyle: 'normal', fontSize: 11.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#818CF8,#8B5CF6)', boxShadow: '0 6px 14px -7px rgba(139,92,246,0.65), inset 0 1px 0 rgba(255,255,255,0.32)' }}>04</span>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: IVORY }}>{t('massPostingPublishOptions')}</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(233,234,240,0.07)' }} />
                </div>
                <div className="sf-card" style={{ padding: '16px 18px' }}>
                  <PostingOptions opts={postingOpts} onChange={o => { setPostingOpts(o); savePostingOpts(o) }} />
                </div>
              </section>

              {/* ── 05 — Répartition ─────────────────────────────────────────── */}
              {assignments.length > 0 && (
                <section className="sf-anim-slide-up">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 7, fontFamily: SANS, fontStyle: 'normal', fontSize: 11.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#818CF8,#8B5CF6)', boxShadow: '0 6px 14px -7px rgba(139,92,246,0.65), inset 0 1px 0 rgba(255,255,255,0.32)' }}>05</span>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: IVORY }}>{t('massPostingAssignments')}</span>
                    <span className="sf-badge sf-badge-accent" style={{ fontSize: 9 }}>{assignments.length}</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(233,234,240,0.07)' }} />
                  </div>
                  <div className="sf-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                          {['#', tr('Téléphone', 'Phone'), tr('Vidéo', 'Video'), tr('Statut', 'Status')].map((h, i) => (
                            <th key={h} style={{
                              padding: '9px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                              color: FAINT, textAlign: i === 3 ? 'right' : 'left',
                              borderBottom: '1px solid rgba(233,234,240,0.07)',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {assignments.map(({ phone, video, videoIndex }, rowIdx) => {
                          const ts = taskStatuses.get(phone.id)
                          const status = ts?.status ?? 'idle'
                          const isRowActive = status === 'uploading' || status === 'posting'
                          return (
                            <tr key={phone.id}
                              style={{
                                borderBottom: rowIdx < assignments.length - 1 ? '1px solid rgba(233,234,240,0.04)' : 'none',
                                background: isRowActive ? 'rgba(99,102,241,0.06)' : 'transparent',
                                borderLeft: isRowActive ? '2px solid var(--accent)' : '2px solid transparent',
                                transition: 'background 0.2s, border-left-color 0.2s',
                              }}>
                              <td style={{ padding: '9px 14px', fontSize: 11, color: FAINT, fontVariantNumeric: 'tabular-nums', width: 36 }}>{rowIdx + 1}</td>
                              <td style={{ padding: '9px 14px' }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{phone.phone_name}</p>
                                {phone.ig_username && <p style={{ fontSize: 10, color: 'rgba(99,102,241,0.6)' }}>@{phone.ig_username}</p>}
                              </td>
                              <td style={{ padding: '9px 14px' }}>
                                {video ? (
                                  <span style={{ fontSize: 11.5, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="sf-badge sf-badge-accent" style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>{videoIndex + 1}</span>
                                    {video.item.title.length > 32 ? video.item.title.slice(0, 32) + '…' : video.item.title}
                                  </span>
                                ) : <span style={{ fontSize: 11.5, color: FAINT }}>—</span>}
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                                <span className={STATUS_BADGE[status] ?? 'sf-badge sf-badge-muted'} style={{ fontSize: 9, display: 'inline-flex' }}>
                                  {STATUS_LABEL[status]}
                                </span>
                                {ts?.detail && <p style={{ fontSize: 10, color: FAINT, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>{ts.detail}</p>}
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
                <section className="sf-anim-slide-up">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 7, fontSize: 12, fontWeight: 800, color: 'var(--accent-l)', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.22)' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: IVORY }}>{tr('Journal', 'Log')}</span>
                    <span className="sf-badge sf-badge-muted" style={{ fontSize: 9 }}>{logs.length}</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(233,234,240,0.07)' }} />
                    {!posting && (
                      <button onClick={() => setLogs([])} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                        style={{ fontSize: 10, color: FAINT }}
                        onMouseEnter={e => { e.currentTarget.style.color = ERR }}
                        onMouseLeave={e => { e.currentTarget.style.color = FAINT }}>
                        {tr('Effacer', 'Clear')}
                      </button>
                    )}
                  </div>
                  <div className="sf-card" style={{ background: 'rgba(0,0,0,0.4)', maxHeight: 230, overflow: 'auto', padding: '12px 14px', scrollbarWidth: 'thin' }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {logs.map((l, i) => {
                        const scMatch = l.message.match(/^(.*)\[screenshot\]::(data:image\/[^,]+,[^\s]+)(.*)$/)
                        const msgText = scMatch ? scMatch[1].trim() : l.message
                        const scUrl   = scMatch ? scMatch[2] : null
                        const color = l.level === 'ok' ? OK : l.level === 'error' ? ERR : l.level === 'warn' ? WARN : MUTED
                        return (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.55 }}>
                            <div style={{ display: 'flex', gap: 12 }}>
                              <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: 'rgba(233,234,240,0.18)' }}>{l.time}</span>
                              <span style={{ color }}>{msgText}</span>
                            </div>
                            {scUrl && (
                              <img src={scUrl} alt="screenshot" style={{ maxHeight: 180, border: '1px solid rgba(217,185,127,0.3)', borderRadius: 6, marginLeft: 40, objectFit: 'contain' }} />
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

          {/* ── Sticky launch bar ────────────────────────────────────────────── */}
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid rgba(233,234,240,0.07)',
            background: 'rgba(14,14,22,0.95)',
            backdropFilter: 'blur(20px)',
            padding: '12px 28px',
            display: 'flex', alignItems: 'center', gap: 18,
          }}>
            {/* Summary stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 22, color: phoneList.length > 0 ? 'var(--accent)' : FAINT, lineHeight: 1, fontWeight: 800 }}>{phoneList.length}</span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: FAINT }}>{lang === 'en' ? 'phones' : 'téléphones'}</span>
              </div>
              <div style={{ width: 1, height: 20, background: 'rgba(233,234,240,0.08)' }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 22, color: selectedVideos.length > 0 ? 'var(--accent)' : FAINT, lineHeight: 1, fontWeight: 800 }}>{selectedVideos.length}</span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: FAINT }}>{lang === 'en' ? 'videos' : 'vidéos'}</span>
              </div>
              {phoneList.length > 0 && (
                <>
                  <div style={{ width: 1, height: 20, background: 'rgba(233,234,240,0.08)' }} />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 22, color: 'var(--accent-l)', lineHeight: 1, fontWeight: 800 }}>{phoneList.length * CREDIT_COSTS.mass_posting}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: FAINT }}>{lang === 'en' ? 'credits' : 'crédits'}</span>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
              {posting && (
                <button onClick={stopFocused} className="sf-btn sf-btn-danger cursor-pointer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1"/></svg>
                  {t('stop')}
                </button>
              )}
              <button
                onClick={() => setShowScheduleModal(true)}
                disabled={!canLaunch}
                title={canLaunch ? undefined
                  : !bearer ? tr('Connecte GéeLark dans les Paramètres', 'Connect GeeLark in Settings')
                  : phoneList.length === 0 ? tr('Sélectionne au moins un téléphone', 'Select at least one phone')
                  : selectedVideos.length === 0 ? tr('Sélectionne des vidéos dans la banque', 'Select videos from the bank')
                  : tr('Publication en cours…', 'Posting in progress…')}
                className="sf-btn sf-btn-secondary cursor-pointer"
                style={{ opacity: canLaunch ? 1 : 0.4 }}>
                {t('schedule')}
              </button>
              <button
                onClick={post}
                disabled={!canLaunch}
                title={canLaunch ? tr('Poste maintenant (garde l\'app ouverte). Tu peux en lancer plusieurs en parallèle. Pour PC éteint : utilise Programmer.', 'Post now (keep the app open). You can launch several in parallel. For PC off: use Schedule.')
                  : !bearer ? tr('Connecte GéeLark dans les Paramètres', 'Connect GeeLark in Settings')
                  : phoneList.length === 0 ? tr('Sélectionne au moins un téléphone', 'Select at least one phone')
                  : tr('Sélectionne des vidéos dans la banque', 'Select videos from the bank')}
                className="sf-btn sf-btn-lg cursor-pointer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', color: '#fff',
                  background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                  boxShadow: canLaunch ? '0 12px 28px -10px rgba(99,102,241,0.7), inset 0 1px 0 0 rgba(255,255,255,0.3)' : 'none',
                  opacity: !canLaunch ? 0.4 : 1,
                }}>
                {/* On peut toujours lancer un nouveau run (parallèle) : le bouton reste
                    « Lancer », même si un autre run tourne. L'avancement est dans le
                    panneau + le widget « en cours ». */}
                {anyRunning ? (
                  <><svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><polygon points="2.5 1.5 10.5 6 2.5 10.5"/></svg>{t('launch')} +</>
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
        <div
          tabIndex={-1}
          ref={el => el?.focus()}
          onKeyDown={e => { if (e.key === 'Escape') setShowFolderPick(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(6,6,8,0.85)', backdropFilter: 'blur(14px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, outline: 'none',
          }}
          onClick={() => setShowFolderPick(false)}>
          <div className="sf-card sf-anim-scale-spring" onClick={e => e.stopPropagation()}
            style={{ width: 340, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid rgba(233,234,240,0.07)' }}>
              <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: IVORY }}>{tr('Choisir un dossier', 'Choose a folder')}</p>
              <button onClick={() => setShowFolderPick(false)} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {folderLoading ? (
              <div style={{ padding: '8px 0' }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px' }}>
                    <div className="sf-skeleton" style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0 }} />
                    <div className="sf-skeleton sf-skeleton-text" style={{ width: `${70 - i * 8}%` }} />
                    <div className="sf-skeleton" style={{ width: 22, height: 15, borderRadius: 6, flexShrink: 0, marginLeft: 'auto' }} />
                  </div>
                ))}
              </div>
            ) : bankFolders.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: MUTED }}>{tr('Aucun dossier dans la banque', 'No folder in the bank')}</div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {bankFolders.map((f, i) => (
                  <button key={f.name} onClick={() => addFolderVideos(f.name)} className="cursor-pointer"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                      textAlign: 'left', background: 'transparent', border: 'none',
                      borderBottom: i < bankFolders.length - 1 ? '1px solid rgba(233,234,240,0.04)' : 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                    <span className="sf-badge sf-badge-accent" style={{ fontSize: 9 }}>{f.count}</span>
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
          onSelect={(paths, _titles, descriptions, items) => {
            // Si la 1ʳᵉ vidéo choisie a une description et que la légende est
            // vide, on pré-remplit la légende avec (anti-écrasement du texte saisi).
            const firstDesc = descriptions?.find(d => d && d.trim())
            if (firstDesc && !caption.trim()) setCaption(firstDesc.trim())
            // On zippe chaque chemin avec SON item de banque RÉEL (id + storage_path)
            // et sa description — index aligné — pour que l'usage unique puisse
            // supprimer la vraie ligne de banque, et garder la légende par vidéo.
            const newVideos: SelectedVideo[] = paths
              .map((p, i) => ({ p, desc: (descriptions?.[i] ?? '').trim(), real: items?.[i] }))
              .filter(({ p }) => !selectedVideos.some(sv => (sv.localPath ?? sv.item.file_url) === p))
              .map(({ p, desc, real }) => ({
                item: real
                  // Vrai item de banque : on garde son id + storage_path (pour la
                  // suppression usage unique) et on force file_url = URL signée.
                  ? { ...real, file_url: p, description: (real.description ?? desc) || undefined, notes: real.notes || desc }
                  // Fallback (BankPicker ancien sans items) : item synthétique.
                  : {
                    id: `bank-${p}`, user_id: user.id, org_id: null, folder: null,
                    title: p.replace(/\\/g, '/').split('/').pop() ?? p,
                    file_url: p, storage_path: null, thumbnail_path: null, thumbnail_url: null,
                    duration: null, tags: [], notes: desc, description: desc || undefined,
                    used_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                  },
                localPath: null,
                caption:   (desc || real?.description || '').trim() || null,
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
          videoTitle={selectedVideos.length === 1 ? selectedVideos[0].item.title : tr(`${selectedVideos.length} vidéos`, `${selectedVideos.length} videos`)}
          onConfirm={scheduleMassPost}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
    </div>
  )
}
