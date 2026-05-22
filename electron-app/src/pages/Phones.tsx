import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { fetchAllPhones, geelarkStatusLabel, extractInstagramSessionId } from '@/lib/geelark'
import * as poller from '@/lib/phonePoller'
import { Button }  from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useLicense, effectivePlan } from '@/lib/license'
import { PLAN_MAX_PHONES } from '@/lib/credits'

interface PhonesProps { user: User }

const INTERVALS = [
  { label: '30 s',  value: 30  },
  { label: '1 min', value: 60  },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
]

// ── GéeLark status dot ──────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${status === 'online' ? 'bg-ok' : 'bg-text2'}`} />
  )
}

// ── IG Status badge ─────────────────────────────────────────────────────────
function IgStatusBadge({ phone }: { phone: Phone }) {
  if (!phone.ig_username) return <span className="text-[13px] text-text2">—</span>
  if (phone.ig_status === 'active') return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-ok animate-pulse flex-shrink-0" />
      <span className="text-[12px] text-ok font-semibold">IG OK</span>
    </span>
  )
  if (phone.ig_status === 'expired') return (
    <span className="inline-flex items-center gap-1" title="Session Instagram expirée — re-login requis">
      <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
      <span className="text-[12px] text-danger font-semibold">Session expirée</span>
    </span>
  )
  if (phone.ig_status === 'error') return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
      <span className="text-[12px] text-danger font-semibold">Erreur</span>
    </span>
  )
  if (phone.ig_status === 'rate_limited') return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-warn flex-shrink-0" />
      <span className="text-[12px] text-warn font-semibold">Limité</span>
    </span>
  )
  if (phone.ig_sessionid) return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
      <span className="text-[12px] text-accent font-semibold">Session</span>
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-text2/40 flex-shrink-0" />
      <span className="text-[12px] text-text2">Public</span>
    </span>
  )
}

// ── Countdown display ────────────────────────────────────────────────────────
function Countdown({ secondsLeft }: { secondsLeft: number }) {
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  return (
    <span className="text-[13px] text-text2 tabular-nums">
      ↻ {m > 0 ? `${m}m ` : ''}{s.toString().padStart(2, '0')}s
    </span>
  )
}

// ── Session ID dialog ────────────────────────────────────────────────────────
function SessionDialog({
  phone,
  bearer,
  onClose,
  onSaved,
}: {
  phone: Phone
  bearer: string
  onClose: () => void
  onSaved: (id: string, sessionid: string, detectedUsername?: string) => void
}) {
  const [value, setValue]               = useState(phone.ig_sessionid ?? '')
  const [testing, setTesting]           = useState(false)
  const [testResult, setTestResult]     = useState<'idle' | 'ok' | 'fail'>('idle')
  const [detectedUser, setDetectedUser] = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [extracting, setExtracting]     = useState(false)
  const [extractLogs, setExtractLogs]   = useState<string[]>([])
  const [extractError, setExtractError] = useState<string | null>(null)
  const inputRef      = useRef<HTMLInputElement>(null)
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortCtrlRef  = useRef<AbortController | null>(null)
  const logsEndRef    = useRef<HTMLDivElement | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function runTest(sessionid: string): Promise<{ ok: boolean; username?: string }> {
    if (!sessionid.trim()) return { ok: false }
    setTesting(true); setTestResult('idle'); setDetectedUser(null)
    try {
      const r = await window.electronAPI?.fetchInstagramBySession({
        username:  phone.ig_username ?? '',
        sessionid: sessionid.trim(),
      })
      if (r?.ok) {
        setTestResult('ok')
        if (r.username) setDetectedUser(r.username)
        setTesting(false)
        return { ok: true, username: r.username }
      } else {
        setTestResult('fail')
      }
    } catch {
      setTestResult('fail')
    }
    setTesting(false)
    return { ok: false }
  }

  async function extractFromPhone() {
    if (!bearer || !phone.geelark_id) {
      setExtractError('Téléphone non lié à GéeLark ou token manquant')
      return
    }
    const ctrl = new AbortController()
    abortCtrlRef.current = ctrl
    setExtracting(true); setExtractLogs([]); setExtractError(null)
    const logs: string[] = []
    const addLog = (msg: string) => {
      logs.push(msg)
      setExtractLogs([...logs])
      // Auto-scroll after state update
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
    }
    try {
      const sessionid = await extractInstagramSessionId(
        bearer,
        phone.geelark_id,
        addLog,
        ctrl.signal,
      )
      if (sessionid) {
        setValue(sessionid)
        handleChange(sessionid)
        setExtractError(null)
      } else if (!ctrl.signal.aborted) {
        setExtractError('sessionid non trouvé — voir les logs ci-dessus')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== 'Annulé') setExtractError(msg)
    }
    abortCtrlRef.current = null
    setExtracting(false)
  }

  function cancelExtract() {
    abortCtrlRef.current?.abort()
  }

  // Auto-test 800ms after the user stops typing
  function handleChange(v: string) {
    setValue(v)
    setTestResult('idle')
    setDetectedUser(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length > 10) {
      debounceRef.current = setTimeout(() => runTest(v), 800)
    }
  }

  async function save() {
    if (!value.trim()) return
    setSaving(true)
    // Test first if not already validated
    let username = detectedUser ?? undefined
    if (testResult !== 'ok') {
      const r = await runTest(value)
      if (!r.ok) { setSaving(false); return }  // don't save invalid session
      username = r.username
    }
    const { error } = await supabase
      .from('phones')
      .update({ ig_sessionid: value.trim() || null })
      .eq('id', phone.id)
    if (!error) onSaved(phone.id, value.trim(), username)
    setSaving(false)
    onClose()
  }

  const busy = testing || saving

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border border-border rounded-xl p-6 w-[480px] shadow-2xl space-y-4">
        <div>
          <h2 className="text-lg font-bold text-text">Session ID Instagram</h2>
          {phone.ig_username && (
            <p className="text-sm text-accent mt-0.5">@{phone.ig_username}</p>
          )}
        </div>

        {/* Auto-extract via GéeLark shell */}
        {phone.geelark_id && bearer && (
          <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-text">🤖 Extraction automatique</p>
                <p className="text-[10px] text-text2">Récupère le sessionid directement depuis le téléphone GéeLark (max 3 min)</p>
              </div>
              <div className="flex gap-2">
                {extracting && (
                  <Button size="sm" variant="secondary" onClick={cancelExtract}>
                    🛑 Annuler
                  </Button>
                )}
                <Button size="sm" onClick={extractFromPhone} loading={extracting} disabled={extracting}>
                  {extracting ? 'Extraction…' : '⚡ Extraire'}
                </Button>
              </div>
            </div>
            {extractLogs.length > 0 && (
              <div className="bg-bg rounded p-2 max-h-40 overflow-auto space-y-0.5">
                {extractLogs.map((l, i) => (
                  <p key={i} className={`text-[10px] font-mono ${l.startsWith('✅') ? 'text-ok' : l.startsWith('❌') || l.startsWith('🛑') ? 'text-danger' : l.startsWith('⚠️') ? 'text-warn' : 'text-text2'}`}>{l}</p>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
            {extractError && <p className="text-[11px] text-danger">{extractError}</p>}
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg px-4 py-3 text-xs text-text2 space-y-1">
          <p className="font-semibold text-text">Ou manuellement :</p>
          <p>1. Ouvre <span className="text-accent">instagram.com</span> dans Chrome</p>
          <p>2. Appuie sur <span className="text-accent">F12</span> (DevTools)</p>
          <p>3. Va dans <span className="text-accent">Application → Cookies → instagram.com</span></p>
          <p>4. Trouve le cookie <span className="text-accent font-mono">sessionid</span> et copie sa valeur</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-text2">Session ID</label>
          <div className="relative">
            <input
              ref={inputRef}
              type="password"
              value={value}
              onChange={e => handleChange(e.target.value)}
              placeholder="Colle ton sessionid ici…"
              className={`w-full bg-surface border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text2 focus:outline-none font-mono pr-8 transition-colors ${
                testResult === 'ok'   ? 'border-ok' :
                testResult === 'fail' ? 'border-danger' :
                'border-border focus:border-accent'
              }`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">
              {testing          ? <span className="animate-spin inline-block text-accent">↻</span> :
               testResult === 'ok'   ? <span className="text-ok">✓</span> :
               testResult === 'fail' ? <span className="text-danger">✗</span> : null}
            </span>
          </div>
          {testResult === 'ok' && detectedUser && (
            <p className="text-xs text-text2">
              Compte : <span className="text-accent font-semibold">@{detectedUser}</span>
              {phone.ig_username && phone.ig_username !== detectedUser && (
                <span className="ml-1 text-warn">· différent de @{phone.ig_username} — sera mis à jour</span>
              )}
            </p>
          )}
          {testResult === 'fail' && <p className="text-xs text-danger">❌ Session invalide ou expirée — vérifie que tu as copié la bonne valeur.</p>}
          {testResult === 'idle' && value.trim().length > 10 && !testing && (
            <p className="text-xs text-text2">Test automatique en cours…</p>
          )}
        </div>

        <div className="flex items-center gap-3 justify-end pt-2">
          <button onClick={onClose} disabled={busy} className="text-sm text-text2 hover:text-text px-3 py-1.5 rounded transition-colors disabled:opacity-40">
            Annuler
          </button>
          <Button size="sm" onClick={save} loading={busy} disabled={!value.trim()}>
            {testing ? '🔍 Vérification…' : saving ? '💾 Sauvegarde…' : testResult === 'ok' ? '💾 Sauvegarder' : '🔍 Tester & Sauvegarder'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Context menu ─────────────────────────────────────────────────────────────
function ContextMenu({
  phone, x, y, onClose, onSession, onUnlink, onDelete, canDelete,
}: {
  phone: Phone; x: number; y: number; onClose: () => void
  onSession: () => void; onUnlink: () => void; onDelete: () => void; canDelete: boolean
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onClick); window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 210)
  const top  = Math.min(y, window.innerHeight - 230)

  const item = (icon: string, label: string, onClick: () => void, danger = false) => (
    <button
      onClick={() => { onClick(); onClose() }}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded transition-colors ${
        danger ? 'hover:bg-danger/10 text-danger' : 'hover:bg-surface2 text-text'
      }`}
    >
      <span className="w-4 text-center">{icon}</span>
      <span>{label}</span>
    </button>
  )

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-card border border-border rounded-xl shadow-2xl py-1 w-52"
      style={{ left, top }}
    >
      <div className="px-3 py-1.5 border-b border-border mb-1">
        <p className="text-xs font-semibold text-text truncate">{phone.phone_name}</p>
        {phone.ig_username && <p className="text-[10px] text-accent">@{phone.ig_username}</p>}
      </div>
      {item('🔑', 'Session ID', onSession)}
      {phone.ig_username && item('✂️', 'Délier Instagram', onUnlink)}
      {canDelete && <><div className="border-t border-border my-1" />{item('🗑', 'Supprimer', onDelete, true)}</>}
    </div>
  )
}

// ── Inline Instagram username edit ─────────────────────────────────────────────
function IgCell({ phone, onSave }: { phone: Phone; onSave: (id: string, u: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(phone.ig_username ?? '')
  const [saving, setSaving]   = useState(false)
  const ref                   = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setValue(phone.ig_username ?? '') }, [phone.ig_username])

  async function save() {
    setSaving(true)
    await onSave(phone.id, value.replace(/^@/, '').trim())
    setSaving(false)
    setEditing(false)
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  save()
    if (e.key === 'Escape') { setValue(phone.ig_username ?? ''); setEditing(false) }
  }

  if (editing) return (
    <div className="flex items-center gap-1">
      <span className="text-[13px] text-text2">@</span>
      <input
        ref={ref} value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={onKey} onBlur={save} disabled={saving}
        className="w-28 bg-surface border border-accent rounded px-1 py-0.5 text-[13px] text-text focus:outline-none"
      />
    </div>
  )

  return (
    <button onClick={() => setEditing(true)} className="text-[13px] text-left group flex items-center gap-1.5 min-w-0" title="Cliquer pour éditer">
      {phone.ig_username ? (
        <span className="text-accent truncate">@{phone.ig_username}</span>
      ) : (
        <span className="text-text2 italic">+ ajouter</span>
      )}
      <span className="opacity-0 group-hover:opacity-40 text-text2 text-[11px] flex-shrink-0">✎</span>
    </button>
  )
}

// ── Inline note (remark) edit ─────────────────────────────────────────────────
function NoteCell({ phone, onSave }: { phone: Phone; onSave: (id: string, v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(phone.remark ?? '')
  const [saving, setSaving]   = useState(false)
  const ref                   = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setValue(phone.remark ?? '') }, [phone.remark])

  async function save() {
    setSaving(true)
    await onSave(phone.id, value)
    setSaving(false)
    setEditing(false)
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  save()
    if (e.key === 'Escape') { setValue(phone.remark ?? ''); setEditing(false) }
  }

  if (editing) return (
    <input
      ref={ref} value={value} onChange={e => setValue(e.target.value)}
      onKeyDown={onKey} onBlur={save} disabled={saving}
      className="w-full bg-surface border border-accent rounded px-1 py-0.5 text-[13px] text-text focus:outline-none"
      placeholder="Note…"
    />
  )

  return (
    <button onClick={() => setEditing(true)} className="text-[13px] text-left group flex items-center gap-1.5 min-w-0 w-full" title="Cliquer pour éditer">
      {phone.remark ? (
        <span className="text-text2 truncate">{phone.remark}</span>
      ) : (
        <span className="text-text2/40 italic">+ note</span>
      )}
      <span className="opacity-0 group-hover:opacity-40 text-text2 text-[11px] flex-shrink-0">✎</span>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function Phones({ user }: PhonesProps) {
  const { currentOrg, role, perms } = useOrg()
  const conns = useConnections(user)
  const license = useLicense()
  const [phones, setPhones]           = useState<Phone[]>([])
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [filter, setFilter]           = useState<'all' | 'online' | 'offline'>('all')
  const [search, setSearch]           = useState('')
  // Interval + autoRefresh: read from the singleton (which persists in localStorage)
  const [intervalSec, setIntervalSec] = useState(poller.getIntervalSec)
  const [autoRefresh, setAutoRefresh] = useState(poller.getEnabled)
  const [countdown, setCountdown]     = useState(poller.getIntervalSec())
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [pollError, setPollError]     = useState<string | null>(null)

  const [contextMenu, setContextMenu]   = useState<{ phone: Phone; x: number; y: number } | null>(null)
  const [sessionDialog, setSessionDialog] = useState<{ phone: Phone } | null>(null)
  const [selectedPhone, setSelectedPhone] = useState<Phone | null>(null)
  const [groupFilter, setGroupFilter]     = useState<string>('all')

  // Use the reactive bearer from connections (org-aware), not the poller snapshot.
  // The poller singleton is updated async in App.tsx; reading from it here causes
  // a race: loadPhones fires with the new currentOrg but the old bearer.
  const bearer = conns.bearer

  const phonesRef      = useRef<Phone[]>([])
  const lastPollMsRef  = useRef(poller.getLastPollMs() || Date.now())
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastDbSyncRef  = useRef<Date | null>(null)
  const lastIgSyncRef  = useRef<Date | null>(null)

  useEffect(() => { phonesRef.current = phones }, [phones])

  // ── Subscribe to the global poller for live status updates ─────────────────
  useEffect(() => {
    return poller.subscribe(statusMap => {
      const now = new Date()
      setLastUpdated(now)
      lastPollMsRef.current = now.getTime()
      setCountdown(poller.getIntervalSec())
      setPhones(prev => {
        const next = prev.map(p => {
          const s = statusMap.get(p.geelark_id)
          return s !== undefined ? { ...p, status: s } : p
        })
        phonesRef.current = next
        return next
      })
      // Persist status to DB every 5 min
      const sinceDb = lastDbSyncRef.current
        ? (now.getTime() - lastDbSyncRef.current.getTime()) / 1000 : Infinity
      if (sinceDb >= 300) {
        lastDbSyncRef.current = now
        statusMap.forEach((status, geelark_id) => {
          supabase.from('phones').update({ status, synced_at: now.toISOString() })
            .eq('user_id', user.id).eq('geelark_id', geelark_id).then(() => {})
        })
      }
    })
  }, [user.id])

  // ── Countdown ticker (purely cosmetic — based on elapsed time) ─────────────
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (!autoRefresh) { setCountdown(0); return }
    const sec = poller.getIntervalSec()
    countdownRef.current = setInterval(() => {
      const elapsed  = (Date.now() - lastPollMsRef.current) / 1000
      const remaining = Math.max(0, sec - Math.floor(elapsed))
      setCountdown(remaining)
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [autoRefresh, intervalSec])

  useEffect(() => {
    // Wait until connections have resolved for the current org before loading.
    // Without this guard, switching org triggers loadPhones with bearer=null
    // (connections still loading) then again when bearer arrives — causing a
    // blank flash and, worse, a race where the old bearer could be read.
    if (conns.loading) return
    loadPhones()
  }, [currentOrg?.id, bearer, conns.loading])

  async function loadPhones() {
    if (!bearer) { setPhones([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data, error: err } = await q
    if (err) setError('Erreur lors du chargement.')
    else {
      setPhones(data ?? [])
    }
    setLoading(false)
    // Trigger an immediate poll if one hasn't happened recently
    poller.pollNow()
  }

  // ── Periodic IG stats refresh (every 5 min, only when Phones is mounted) ───
  useEffect(() => {
    const interval = setInterval(async () => {
      const sinceIg = lastIgSyncRef.current
        ? (Date.now() - lastIgSyncRef.current.getTime()) / 1000 : Infinity
      if (sinceIg < 290) return
      if (!window.electronAPI?.fetchInstagramBySession) return
      lastIgSyncRef.current = new Date()
      const withSession = phonesRef.current.filter(p => p.ig_username && p.ig_sessionid)
      for (const phone of withSession) {
        try {
          const r = await window.electronAPI.fetchInstagramBySession({
            username: phone.ig_username!, sessionid: phone.ig_sessionid!,
          })
          if (r.ok) {
            await supabase.from('phones').update({
              followers: r.followers ?? 0, following: r.following ?? 0,
              total_views: r.total_views ?? 0, posts: r.posts ?? 0,
              bio: r.bio ?? null, ig_status: 'active',
            }).eq('id', phone.id)
            setPhones(prev => prev.map(p =>
              p.id === phone.id ? { ...p,
                followers: r.followers ?? 0, following: r.following ?? 0,
                total_views: r.total_views ?? 0, posts: r.posts ?? 0,
                bio: r.bio ?? null, ig_status: 'active' } : p
            ))
          } else {
            await supabase.from('phones').update({ ig_status: 'error' }).eq('id', phone.id)
            setPhones(prev => prev.map(p =>
              p.id === phone.id ? { ...p, ig_status: 'error' } : p
            ))
          }
        } catch { /* silent */ }
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [user.id])

  function changeInterval(sec: number) {
    setIntervalSec(sec)
    poller.setIntervalSec(sec)
    lastPollMsRef.current = Date.now()
    setCountdown(sec)
  }

  // ── Full sync from GéeLark ─────────────────────────────────────────────
  const syncFromGeelark = useCallback(async () => {
    if (!bearer) { setError('Token GéeLark manquant — configure-le dans Paramètres.'); return }
    setSyncing(true); setError(null)
    try {
      const items = await fetchAllPhones(bearer)
      if (items.length === 0) { setError('Aucun téléphone trouvé.'); setSyncing(false); return }
      if (items.length > phoneLimit) {
        setError(`Limite du plan atteinte : ${phoneLimit} téléphones max (${effectivePlan(license) ?? 'standard'}). Passez au plan supérieur pour en ajouter plus.`)
        setSyncing(false)
        return
      }

      const rows = items.map(p => ({
        user_id:    user.id,                        // always the current authenticated user (RLS requires it)
        org_id:     currentOrg?.id ?? null,
        geelark_id: p.id,
        serial_no:  p.serialNo ?? null,
        phone_name: p.serialName ?? p.name ?? p.serialNo ?? p.id ?? 'Phone inconnu',
        group_name: p.group?.name ?? p.groupName ?? null,
        status:     geelarkStatusLabel(p.status),
        remark:     p.remark ?? null,
        synced_at:  new Date().toISOString(),
      }))
      // Conflict strategy: always fetch by (user_id + geelark_id) globally to avoid
      // duplicate key violations when a phone exists under a different org_id.
      const currentGeelarkIds = new Set(rows.map(r => r.geelark_id))

      if (currentOrg) {
        // Fetch ALL phones for this user (any org_id) that match the current GéeLark set
        const { data: existingAll } = await supabase
          .from('phones').select('id,geelark_id')
          .eq('user_id', user.id)
          .in('geelark_id', [...currentGeelarkIds])
        const existingMap = new Map((existingAll ?? []).map((p: { id: string; geelark_id: string }) => [p.geelark_id, p.id]))

        // Delete phones removed from GéeLark (only those already in this org)
        const { data: orgPhones } = await supabase
          .from('phones').select('id,geelark_id').eq('org_id', currentOrg.id)
        const toDelete = (orgPhones ?? []).filter((p: { geelark_id: string }) => !currentGeelarkIds.has(p.geelark_id))
        if (toDelete.length > 0) {
          await supabase.from('phones').delete().in('id', toDelete.map((p: { id: string }) => p.id))
        }

        const toInsert = rows.filter(r => !existingMap.has(r.geelark_id))
        const toUpdate = rows.filter(r =>  existingMap.has(r.geelark_id))

        if (toInsert.length > 0) {
          const { error } = await supabase.from('phones').insert(toInsert)
          if (error) throw new Error(error.message)
        }
        for (const row of toUpdate) {
          const id = existingMap.get(row.geelark_id)!
          const { error } = await supabase.from('phones').update(row).eq('id', id)
          if (error) throw new Error(error.message)
        }
      } else {
        // Solo mode — delete phones no longer in GéeLark then upsert the rest
        await supabase.from('phones')
          .delete()
          .eq('user_id', user.id)
          .is('org_id', null)
          .not('geelark_id', 'in', `(${[...currentGeelarkIds].join(',')})`)

        const { error: upsertErr } = await supabase
          .from('phones').upsert(rows, { onConflict: 'user_id,geelark_id' })
        if (upsertErr) throw new Error(upsertErr.message)
      }
      lastDbSyncRef.current = new Date()
      await loadPhones()
      setLastUpdated(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de synchronisation.')
    }
    setSyncing(false)
  }, [bearer, user.id, currentOrg?.id])

  // ── Save ig_username ─────────────────────────────────────────────────────
  async function saveIgUsername(id: string, username: string) {
    const { error: err } = await supabase
      .from('phones').update({ ig_username: username || null }).eq('id', id)
    if (!err)
      setPhones(prev => prev.map(p => p.id === id ? { ...p, ig_username: username || null } : p))
  }

  async function saveRemark(id: string, remark: string) {
    const val = remark.trim() || null
    setPhones(prev => prev.map(p => p.id === id ? { ...p, remark: val } : p))
    await supabase.from('phones').update({ remark: val }).eq('id', id)
  }

  // ── Unlink Instagram ─────────────────────────────────────────────────────
  async function unlinkIg(id: string) {
    const { error: err } = await supabase
      .from('phones').update({ ig_username: null, ig_sessionid: null, ig_status: null }).eq('id', id)
    if (!err)
      setPhones(prev => prev.map(p => p.id === id ? { ...p, ig_username: null, ig_sessionid: null, ig_status: null } : p))
  }

  // ── Delete phone — owner/admin only in org mode ──────────────────────────
  const canDelete = !currentOrg || role === 'owner' || role === 'admin'

  async function deletePhone(id: string) {
    if (!canDelete) return
    if (!confirm('Supprimer ce téléphone ?')) return
    const { error: err } = await supabase.from('phones').delete().eq('id', id)
    if (!err) setPhones(prev => prev.filter(p => p.id !== id))
  }

  // ── Session saved → update username + immediately fetch IG stats ────────
  async function onSessionSaved(id: string, sessionid: string, detectedUsername?: string) {
    const updates: Partial<Phone> = { ig_sessionid: sessionid || null }
    if (detectedUsername) {
      updates.ig_username = detectedUsername
      await supabase.from('phones').update({ ig_username: detectedUsername }).eq('id', id)
    }
    setPhones(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))

    // Immediately fetch IG stats now that we have a session
    const username = detectedUsername ?? phonesRef.current.find(p => p.id === id)?.ig_username
    if (sessionid && username && window.electronAPI?.fetchInstagramBySession) {
      try {
        const r = await window.electronAPI.fetchInstagramBySession({ username, sessionid })
        if (r.ok) {
          const statUpdates = {
            ig_username:  r.username  ?? username,
            followers:    r.followers  ?? 0,
            following:    r.following  ?? 0,
            total_views:  r.total_views ?? 0,
            posts:        r.posts       ?? 0,
            bio:          r.bio         ?? '',
            ig_status:    'active',
          }
          await supabase.from('phones').update(statUpdates).eq('id', id)
          setPhones(prev => prev.map(p => p.id === id ? { ...p, ...statUpdates } : p))
        }
      } catch { /* silent — stats will refresh on next poll */ }
    }
  }

  const phoneLimit = PLAN_MAX_PHONES[effectivePlan(license) ?? ''] ?? Infinity

  // ── Filtered view ─────────────────────────────────────────────────────────
  const visible = phones.filter(p => {
    if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
    if (filter !== 'all' && p.status !== filter) return false
    if (groupFilter !== 'all' && p.group_name !== groupFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        p.phone_name.toLowerCase().includes(q) ||
        (p.group_name ?? '').toLowerCase().includes(q) ||
        (p.serial_no ?? '').toLowerCase().includes(q) ||
        (p.remark ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const onlineCount  = phones.filter(p => p.status === 'online').length
  const offlineCount = phones.filter(p => p.status === 'offline').length
  const groupCount   = new Set(phones.map(p => p.group_name).filter(Boolean)).size
  const igCount      = phones.filter(p => p.ig_username).length
  const groups       = Array.from(new Set(phones.map(p => p.group_name).filter(Boolean))) as string[]

  function relativeTime(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60)        return 'il y a < 1 min'
    if (diff < 3600)      return `il y a ${Math.floor(diff / 60)} min`
    if (diff < 86400)     return `il y a ${Math.floor(diff / 3600)}h`
    if (diff < 86400 * 7) return `il y a ${Math.floor(diff / 86400)}j`
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  function phoneColor(name: string): string {
    const palette = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']
    let h = 0
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
    return palette[Math.abs(h) % palette.length]
  }

  const COLS = '36px 1fr 130px 160px 90px 130px 110px'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {sessionDialog && (
        <SessionDialog
          phone={sessionDialog.phone}
          bearer={bearer}
          onClose={() => setSessionDialog(null)}
          onSaved={onSessionSaved}
        />
      )}
      {contextMenu && (
        <ContextMenu
          phone={contextMenu.phone} x={contextMenu.x} y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onSession={() => setSessionDialog({ phone: contextMenu.phone })}
          onUnlink={() => unlinkIg(contextMenu.phone.id)}
          onDelete={() => deletePhone(contextMenu.phone.id)}
          canDelete={canDelete}
        />
      )}

      <div className="h-full flex flex-col overflow-hidden" onClick={() => setContextMenu(null)}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-8 pt-7 pb-5 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-[26px] font-black text-white leading-none">Téléphones</h1>
            <p className="text-[13px] mt-1" style={{ color: 'rgba(148,163,184,0.55)' }}>
              Gérez et surveillez tous vos téléphones connectés
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-refresh */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
              <button
                onClick={() => { const next = !autoRefresh; poller.setEnabled(next); setAutoRefresh(next) }}
                className={`relative w-7 h-3.5 rounded-full transition-colors flex-shrink-0 ${autoRefresh ? 'bg-ok' : 'bg-surface2'}`}
              >
                <span className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-all ${autoRefresh ? 'left-[16px]' : 'left-0.5'}`} />
              </button>
              <span className="text-[11px] font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>Auto</span>
              {autoRefresh && (
                <div className="flex items-center gap-1">
                  {INTERVALS.map(({ label, value }) => (
                    <button key={value} onClick={() => changeInterval(value)}
                      className={`px-2 py-0.5 rounded-md text-[10px] transition-all ${
                        intervalSec === value ? 'bg-accent/25 text-accent font-semibold' : 'text-text2 hover:text-text'
                      }`}>{label}</button>
                  ))}
                </div>
              )}
              {autoRefresh && bearer && <Countdown secondsLeft={countdown} />}
            </div>
            <button
              onClick={syncFromGeelark} disabled={!bearer || syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
              <span className={syncing ? 'animate-spin inline-block' : ''}>🔄</span>
              Sync GéeLark
            </button>
          </div>
        </div>

        {/* ── 6 Stat cards ─────────────────────────────────────────────────── */}
        {(() => {
          const onlinePct  = phones.length ? Math.round((onlineCount  / phones.length) * 100) : 0
          const offlinePct = phones.length ? Math.round((offlineCount / phones.length) * 100) : 0
          const syncPct    = onlinePct

          // Génère un chemin SVG dont le niveau correspond au pourcentage réel
          const Sparkline = ({ color, pct }: { color: string; pct: number }) => {
            const W = 72, H = 26
            const nPts = 9
            // baseY inversé : 100% → haut (y=2), 0% → bas (y=H-2)
            const baseY = H - 2 - (pct / 100) * (H - 4)
            const amp = Math.min(pct, 100 - pct) * 0.06 * H + 1.5 // wobble réduit aux extrêmes
            const ys = Array.from({ length: nPts }, (_, i) =>
              Math.max(1, Math.min(H - 1, baseY + Math.sin(i * 1.8 + pct * 0.07) * amp))
            )
            const linePts = ys.map((y, i) => `${i === 0 ? 'M' : 'L'}${((i / (nPts - 1)) * W).toFixed(1)},${y.toFixed(1)}`).join(' ')
            const fillPts = linePts + ` L${W},${H} L0,${H}Z`
            const gid = `sg${color.replace('#', '')}`
            return (
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" className="opacity-85">
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
                    <stop offset="100%" stopColor={color} stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d={fillPts} fill={`url(#${gid})`}/>
                <path d={linePts} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )
          }

          const RingIcon = ({ pct, color }: { pct: number; color: string }) => {
            const r = 16, circ = 2 * Math.PI * r
            const dash = (pct / 100) * circ
            return (
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r={r} stroke={`${color}22`} strokeWidth="4" fill="none"/>
                <circle cx="22" cy="22" r={r} stroke={color} strokeWidth="4" fill="none"
                  strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25}
                  strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }}/>
                <text x="22" y="27" textAnchor="middle" fontSize="9" fontWeight="800" fill={color}>✓</text>
              </svg>
            )
          }

          const PhoneIcon = ({ color }: { color: string }) => (
            <div className="relative flex items-center justify-center w-10 h-10">
              <div className="absolute inset-0 rounded-xl opacity-20 blur-sm" style={{ background: color }} />
              <span className="relative text-[22px]">📱</span>
            </div>
          )

          const PeopleIcon = ({ color }: { color: string }) => (
            <svg width="40" height="32" viewBox="0 0 40 32" fill="none" opacity="0.7">
              <circle cx="14" cy="10" r="5" fill={color} opacity="0.6"/>
              <path d="M4 28 C4 20 24 20 24 28" fill={color} opacity="0.5"/>
              <circle cx="26" cy="10" r="4" fill={color} opacity="0.4"/>
              <path d="M18 28 C20 22 36 22 36 28" fill={color} opacity="0.3"/>
            </svg>
          )

          const GridIcon = ({ color }: { color: string }) => (
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" opacity="0.7">
              <rect x="2"  y="2"  width="14" height="14" rx="3" fill={color} opacity="0.6"/>
              <rect x="20" y="2"  width="14" height="14" rx="3" fill={color} opacity="0.4"/>
              <rect x="2"  y="20" width="14" height="14" rx="3" fill={color} opacity="0.4"/>
              <rect x="20" y="20" width="14" height="14" rx="3" fill={color} opacity="0.25"/>
            </svg>
          )

          const cards: { label: string; value: string; sub: string; color: string; f: 'all'|'online'|'offline'|null; deco: React.ReactNode }[] = [
            { label: 'TOTAL',           value: String(phones.length), sub: 'téléphones',    color: '#818cf8', f: 'all',    deco: <PhoneIcon color="#818cf8" /> },
            { label: 'EN LIGNE',        value: String(onlineCount),   sub: `${onlinePct}%`, color: '#00ccaa', f: 'online', deco: <Sparkline color="#00ccaa" pct={onlinePct} /> },
            { label: 'HORS LIGNE',      value: String(offlineCount),  sub: `${offlinePct}%`,color: '#f87171', f: 'offline',deco: <Sparkline color="#f87171" pct={offlinePct} /> },
            { label: 'COMPTES ACTIFS',  value: String(igCount),       sub: 'Instagram',     color: '#e1306c', f: null,     deco: <PeopleIcon color="#e1306c" /> },
            { label: 'GROUPES',         value: String(groupCount),    sub: 'groupes actifs',color: '#f59e0b', f: null,     deco: <GridIcon color="#f59e0b" /> },
            { label: 'SYNCHRONISATION', value: `${syncPct}%`,         sub: lastUpdated ? `màj ${lastUpdated.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}` : 'À jour', color: '#10b981', f: null, deco: <RingIcon pct={syncPct} color="#10b981" /> },
          ]

          return (
            <div className="flex-shrink-0 px-8 pt-5 pb-4 grid grid-cols-6 gap-3">
              {cards.map(card => (
                <button key={card.label}
                  onClick={() => { if (card.f) setFilter(card.f) }}
                  className={`rounded-2xl p-4 text-left transition-all overflow-hidden relative ${card.f ? 'hover:brightness-110' : 'cursor-default'}`}
                  style={{
                    background: (card.f && filter === card.f) ? `${card.color}12` : 'rgba(255,255,255,0.03)',
                    border: (card.f && filter === card.f) ? `1px solid ${card.color}35` : '1px solid rgba(255,255,255,0.07)',
                  }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(148,163,184,0.45)' }}>{card.label}</p>
                      <p className="text-[26px] font-black leading-none" style={{ color: card.color }}>{card.value}</p>
                      <p className="text-[10px] mt-1.5" style={{ color: 'rgba(148,163,184,0.4)' }}>{card.sub}</p>
                    </div>
                    <div className="flex-shrink-0 flex items-center justify-center ml-2 mt-1">
                      {card.deco}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        })()}

        {/* ── Main area: table + right panel ───────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">

          {/* Scrollable table area */}
          <div className="flex-1 overflow-y-auto px-8 pb-8 min-w-0">

            {/* Warnings */}
            {!bearer && (
              <div className="px-4 py-3 rounded-xl mb-4" style={{ background: 'rgba(255,170,42,0.08)', border: '1px solid rgba(255,170,42,0.2)', color: '#ffaa2a' }}>
                <span className="text-[13px]">⚠ Token GéeLark manquant — configure-le dans Paramètres.</span>
              </div>
            )}
            {error && (
              <div className="px-4 py-3 rounded-xl mb-4 flex justify-between items-center" style={{ background: 'rgba(255,92,110,0.08)', border: '1px solid rgba(255,92,110,0.2)', color: '#ff5c6e' }}>
                <span className="text-[13px]">{error}</span>
                <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 ml-3">✕</button>
              </div>
            )}
            {pollError && (
              <div className="px-4 py-3 rounded-xl mb-4 flex justify-between items-center" style={{ background: 'rgba(255,170,42,0.08)', border: '1px solid rgba(255,170,42,0.2)', color: '#ffaa2a' }}>
                <span className="text-[13px]">⚠ {pollError}</span>
                <button onClick={() => setPollError(null)} className="opacity-60 hover:opacity-100 ml-3">✕</button>
              </div>
            )}

            {/* Search + filters row */}
            <div className="flex items-center gap-2 mb-4 mt-1">
              <div className="flex-1 relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] opacity-35">🔍</span>
                <input type="text" placeholder="Rechercher téléphone, compte, proxy, groupe…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-xl pl-9 pr-4 py-2.5 text-[13px] focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                />
              </div>
              {/* Group dropdown */}
              <div className="relative flex-shrink-0">
                <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                  className="appearance-none rounded-xl px-3 py-2.5 pr-7 text-[12px] font-medium focus:outline-none cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.75)' }}>
                  <option value="all">Tous les groupes</option>
                  {groups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] opacity-40 pointer-events-none">▼</span>
              </div>
              {/* Status dropdown */}
              <div className="relative flex-shrink-0">
                <select value={filter} onChange={e => setFilter(e.target.value as 'all'|'online'|'offline')}
                  className="appearance-none rounded-xl px-3 py-2.5 pr-7 text-[12px] font-medium focus:outline-none cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.75)' }}>
                  <option value="all">Tous les statuts</option>
                  <option value="online">En ligne</option>
                  <option value="offline">Hors ligne</option>
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] opacity-40 pointer-events-none">▼</span>
              </div>
              <button className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-medium flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.7)' }}>
                <span className="text-[11px]">⚡</span> Filtres
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            ) : phones.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
                <p className="text-4xl mb-4">📱</p>
                <p className="text-base font-bold text-white mb-2">Aucun téléphone synchronisé</p>
                <p className="text-[13px] text-text2">Clique sur "Sync GéeLark" pour importer tes téléphones.</p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {/* Header */}
                <div className="grid items-center px-4 py-3 text-[10px] font-semibold uppercase tracking-wider select-none"
                  style={{
                    gridTemplateColumns: COLS,
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    background: 'rgba(255,255,255,0.02)',
                    color: 'rgba(148,163,184,0.45)',
                  }}>
                  <span>#</span>
                  <span>Téléphone</span>
                  <span>Groupe</span>
                  <span>Compte Instagram</span>
                  <span>Statut</span>
                  <span>Dernière activité</span>
                  <span>Actions</span>
                </div>

                {visible.length === 0 ? (
                  <p className="px-5 py-10 text-center text-[13px] text-text2">Aucun résultat.</p>
                ) : (
                  <div>
                    {visible.map((phone, i) => {
                      const col = phoneColor(phone.phone_name)
                      const isSelected = selectedPhone?.id === phone.id
                      return (
                        <div key={phone.id}
                          className="grid items-center px-4 py-3 cursor-pointer group transition-colors"
                          style={{
                            gridTemplateColumns: COLS,
                            background: isSelected ? 'rgba(139,92,246,0.07)' : undefined,
                            borderBottom: i < visible.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          }}
                          onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.022)' }}
                          onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(139,92,246,0.07)' : '' }}
                          onClick={() => setSelectedPhone(isSelected ? null : phone)}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}>

                          {/* # */}
                          <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.3)' }}>{i + 1}</span>

                          {/* Téléphone */}
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-[18px]"
                              style={{ background: `linear-gradient(135deg, ${col}22 0%, ${col}11 100%)`, border: `1px solid ${col}33` }}>
                              📱
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-white truncate leading-tight">{phone.phone_name}</p>
                              <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: 'rgba(148,163,184,0.35)' }}>
                                {phone.serial_no ? `ID: ${phone.serial_no}` : phone.geelark_id ? `GL: ${phone.geelark_id}` : '—'}
                              </p>
                            </div>
                          </div>

                          {/* Groupe */}
                          <div className="min-w-0 pr-2">
                            {phone.group_name ? (
                              <>
                                <p className="text-[12px] truncate font-medium" style={{ color: 'rgba(196,181,253,0.8)' }}>{phone.group_name}</p>
                                <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.35)' }}>
                                  {phones.filter(p2 => p2.group_name === phone.group_name).length} tél.
                                </p>
                              </>
                            ) : (
                              <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.3)' }}>—</span>
                            )}
                          </div>

                          {/* Compte Instagram */}
                          <div className="min-w-0 pr-2">
                            {phone.ig_username ? (
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold"
                                  style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }}>
                                  {phone.ig_username.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[12px] text-accent truncate">@{phone.ig_username}</p>
                                  {phone.followers ? (
                                    <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.4)' }}>
                                      {phone.followers >= 1000 ? `${(phone.followers/1000).toFixed(1)}K` : phone.followers} abonnés
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.3)' }}>—</span>
                            )}
                          </div>

                          {/* Statut */}
                          <div>
                            {phone.status === 'online' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                                style={{ background: 'rgba(0,204,170,0.12)', color: '#00ccaa', border: '1px solid rgba(0,204,170,0.2)' }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
                                En ligne
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                                style={{ background: 'rgba(90,104,130,0.12)', color: '#5a6882', border: '1px solid rgba(90,104,130,0.2)' }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#5a6882' }} />
                                Hors ligne
                              </span>
                            )}
                          </div>

                          {/* Dernière activité */}
                          <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>
                            {phone.synced_at ? relativeTime(phone.synced_at) : '—'}
                          </span>

                          {/* Actions */}
                          <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                            <button onClick={() => poller.pollNow()}
                              className="opacity-0 group-hover:opacity-55 hover:!opacity-100 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 text-[13px]"
                              title="Actualiser">🔄</button>
                            <button onClick={() => setSelectedPhone(isSelected ? null : phone)}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 text-[13px] ${isSelected ? 'opacity-100 text-accent' : 'opacity-0 group-hover:opacity-55 hover:!opacity-100'}`}
                              title="Voir les détails">👁</button>
                            <button onClick={e => setContextMenu({ phone, x: e.clientX, y: e.clientY })}
                              className="opacity-0 group-hover:opacity-55 hover:!opacity-100 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 text-text2 text-base"
                              title="Plus d'options">⋮</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {!loading && visible.length > 0 && (
              <p className="text-[11px] mt-3" style={{ color: 'rgba(148,163,184,0.3)' }}>
                Afficher 1 à {visible.length} sur {phones.length} téléphone{phones.length > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* ── Right detail panel ──────────────────────────────────────────── */}
          {selectedPhone && (() => {
            const p = selectedPhone
            const col = phoneColor(p.phone_name)
            return (
              <div className="w-[320px] flex-shrink-0 border-l overflow-y-auto"
                style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(10,10,20,0.6)' }}>

                {/* Panel header */}
                <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-[20px]"
                        style={{ background: `linear-gradient(135deg, ${col}22 0%, ${col}11 100%)`, border: `1px solid ${col}33` }}>
                        📱
                      </div>
                      <div>
                        <p className="text-[14px] font-bold text-white leading-tight">{p.phone_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {p.status === 'online' ? (
                            <span className="text-[11px] font-semibold" style={{ color: '#00ccaa' }}>● En ligne</span>
                          ) : (
                            <span className="text-[11px] font-semibold" style={{ color: '#5a6882' }}>● Hors ligne</span>
                          )}
                          {p.group_name && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                              style={{ background: 'rgba(139,92,246,0.12)', color: 'rgba(167,139,250,0.8)', border: '1px solid rgba(139,92,246,0.2)' }}>
                              {p.group_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setSelectedPhone(null)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-text2 hover:text-text hover:bg-white/10 transition-all text-[13px] flex-shrink-0 mt-0.5">
                      ✕
                    </button>
                  </div>
                  {/* Quick action buttons */}
                  <div className="flex items-center gap-1.5">
                    {[{ icon: '↗', label: 'Ouvrir' }, { icon: '🔄', label: 'Redémarrer' }, { icon: '⟳', label: 'Sync' }].map(a => (
                      <button key={a.label}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:brightness-110"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.8)' }}>
                        <span>{a.icon}</span><span>{a.label}</span>
                      </button>
                    ))}
                    <button
                      onClick={e => { e.stopPropagation(); setContextMenu({ phone: p, x: e.clientX, y: e.clientY }) }}
                      className="w-8 py-1.5 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 text-text2 text-base"
                      style={{ border: '1px solid rgba(255,255,255,0.09)' }}>⋮</button>
                  </div>
                </div>

                {/* Informations */}
                <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(148,163,184,0.45)' }}>Informations</p>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Modèle',       value: p.phone_name },
                      { label: 'Serial',       value: p.serial_no ?? '—' },
                      { label: 'GéeLark ID',   value: p.geelark_id ?? '—' },
                      { label: 'Groupe',       value: p.group_name ?? '—' },
                      { label: 'Dernier sync', value: p.synced_at ? relativeTime(p.synced_at) : '—' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between gap-2">
                        <span className="text-[12px] flex-shrink-0" style={{ color: 'rgba(148,163,184,0.5)' }}>{row.label}</span>
                        <span className="text-[12px] font-medium text-text truncate text-right max-w-[170px]">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compte Instagram */}
                {p.ig_username && (
                  <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(148,163,184,0.45)' }}>Compte Instagram</p>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[12px] font-bold"
                        style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }}>
                        {p.ig_username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-accent">@{p.ig_username}</p>
                        {(p.followers || p.following) ? (
                          <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.5)' }}>
                            {p.followers ? `${p.followers >= 1000 ? `${(p.followers/1000).toFixed(1)}K` : p.followers} abonnés` : ''}
                            {p.followers && p.following ? ' · ' : ''}
                            {p.following ? `${p.following} suivi(s)` : ''}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.5)' }}>Statut</span>
                        <span className={`text-[12px] font-semibold ${p.ig_status === 'active' ? 'text-ok' : p.ig_status === 'expired' || p.ig_status === 'error' ? 'text-danger' : 'text-text2'}`}>
                          {p.ig_status === 'active' ? 'Actif' : p.ig_status === 'expired' ? 'Expiré' : p.ig_status === 'error' ? 'Erreur' : 'Non configuré'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.5)' }}>Session</span>
                        <span className={`text-[12px] font-semibold ${p.ig_sessionid ? 'text-ok' : 'text-text2'}`}>
                          {p.ig_sessionid ? 'Configurée ✓' : 'Non configurée'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions rapides */}
                <div className="px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'rgba(148,163,184,0.45)' }}>Actions rapides</p>
                  <div className="space-y-1">
                    <button onClick={() => setSessionDialog({ phone: p })}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-left transition-all hover:bg-white/[0.06]"
                      style={{ color: 'rgba(148,163,184,0.8)' }}>
                      <span>🔑</span> Session ID Instagram
                    </button>
                    {p.ig_username && (
                      <button onClick={() => { unlinkIg(p.id); setSelectedPhone(null) }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-left transition-all hover:bg-white/[0.06]"
                        style={{ color: 'rgba(148,163,184,0.8)' }}>
                        <span>✂️</span> Délier Instagram
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => { deletePhone(p.id); setSelectedPhone(null) }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-left transition-all hover:bg-danger/10 text-danger">
                        <span>🗑</span> Supprimer
                      </button>
                    )}
                  </div>
                </div>

              </div>
            )
          })()}
        </div>
      </div>
    </>
  )
}
