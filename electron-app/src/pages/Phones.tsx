import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { fetchAllPhones, geelarkStatusLabel } from '@/lib/geelark'
import * as poller from '@/lib/phonePoller'
import { Button }  from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

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
  if (!phone.ig_username) return <span className="text-xs text-text2">—</span>
  if (phone.ig_status === 'active') return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-ok animate-pulse flex-shrink-0" />
      <span className="text-[11px] text-ok font-semibold">IG OK</span>
    </span>
  )
  if (phone.ig_status === 'expired') return (
    <span className="inline-flex items-center gap-1" title="Session Instagram expirée — re-login requis">
      <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
      <span className="text-[11px] text-danger font-semibold">Session expirée</span>
    </span>
  )
  if (phone.ig_status === 'error') return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
      <span className="text-[11px] text-danger font-semibold">Erreur</span>
    </span>
  )
  if (phone.ig_status === 'rate_limited') return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-warn flex-shrink-0" />
      <span className="text-[11px] text-warn font-semibold">Limité</span>
    </span>
  )
  if (phone.ig_sessionid) return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
      <span className="text-[11px] text-accent font-semibold">Session</span>
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-text2/40 flex-shrink-0" />
      <span className="text-[11px] text-text2">Public</span>
    </span>
  )
}

// ── Countdown display ────────────────────────────────────────────────────────
function Countdown({ secondsLeft }: { secondsLeft: number }) {
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  return (
    <span className="text-xs text-text2 tabular-nums">
      ↻ {m > 0 ? `${m}m ` : ''}{s.toString().padStart(2, '0')}s
    </span>
  )
}

// ── Session ID dialog ────────────────────────────────────────────────────────
function SessionDialog({
  phone,
  onClose,
  onSaved,
}: {
  phone: Phone
  onClose: () => void
  onSaved: (id: string, sessionid: string, detectedUsername?: string) => void
}) {
  const [value, setValue]               = useState(phone.ig_sessionid ?? '')
  const [testing, setTesting]           = useState(false)
  const [testResult, setTestResult]     = useState<'idle' | 'ok' | 'fail'>('idle')
  const [detectedUser, setDetectedUser] = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const inputRef    = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

        <div className="bg-surface border border-border rounded-lg px-4 py-3 text-xs text-text2 space-y-1">
          <p className="font-semibold text-text">Comment trouver ton Session ID :</p>
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
  phone, x, y, onClose, onSession, onUnlink, onDelete,
}: {
  phone: Phone; x: number; y: number; onClose: () => void
  onSession: () => void; onUnlink: () => void; onDelete: () => void
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
      <div className="border-t border-border my-1" />
      {item('🗑', 'Supprimer', onDelete, true)}
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
      <span className="text-xs text-text2">@</span>
      <input
        ref={ref} value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={onKey} onBlur={save} disabled={saving}
        className="w-28 bg-surface border border-accent rounded px-1 py-0.5 text-xs text-text focus:outline-none"
      />
    </div>
  )

  return (
    <button onClick={() => setEditing(true)} className="text-xs text-left group flex items-center gap-1.5 min-w-0" title="Cliquer pour éditer">
      {phone.ig_username ? (
        <span className="text-accent truncate">@{phone.ig_username}</span>
      ) : (
        <span className="text-text2 italic">+ ajouter</span>
      )}
      <span className="opacity-0 group-hover:opacity-40 text-text2 text-[10px] flex-shrink-0">✎</span>
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
      className="w-full bg-surface border border-accent rounded px-1 py-0.5 text-xs text-text focus:outline-none"
      placeholder="Note…"
    />
  )

  return (
    <button onClick={() => setEditing(true)} className="text-xs text-left group flex items-center gap-1.5 min-w-0 w-full" title="Cliquer pour éditer">
      {phone.remark ? (
        <span className="text-text2 truncate">{phone.remark}</span>
      ) : (
        <span className="text-text2/40 italic">+ note</span>
      )}
      <span className="opacity-0 group-hover:opacity-40 text-text2 text-[10px] flex-shrink-0">✎</span>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
export function Phones({ user }: PhonesProps) {
  const { currentOrg, role, perms } = useOrg()
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

  const bearer = poller.getBearer()

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
    loadPhones()
  }, [currentOrg?.id, bearer])

  async function loadPhones() {
    // No bearer in the active scope = nothing to show. Phones rows might still
    // exist in DB (cached from a previous sync) but they belong to whoever's
    // GéeLark account WAS configured — surfacing them here is misleading.
    if (!bearer) { setPhones([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data, error: err } = await q
    if (err) setError('Erreur lors du chargement.')
    else setPhones(data ?? [])
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
      // Conflict strategy:
      // - Solo → use the real UNIQUE(user_id, geelark_id) constraint
      // - Org  → PostgREST can't use partial indexes, so do it manually:
      //          fetch existing rows, then batch-update + insert new ones
      if (currentOrg) {
        const { data: existing } = await supabase
          .from('phones').select('id,geelark_id').eq('org_id', currentOrg.id)
        const existingMap = new Map((existing ?? []).map((p: { id: string; geelark_id: string }) => [p.geelark_id, p.id]))

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

  // ── Delete phone ─────────────────────────────────────────────────────────
  async function deletePhone(id: string) {
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

  // ── Filtered view ─────────────────────────────────────────────────────────
  const visible = phones.filter(p => {
    // Per-member phone-group restriction (org mode only)
    if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
    if (filter !== 'all' && p.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        p.phone_name.toLowerCase().includes(q) ||
        (p.ig_username ?? '').toLowerCase().includes(q) ||
        (p.group_name ?? '').toLowerCase().includes(q) ||
        (p.serial_no ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const counts = {
    all:     phones.length,
    online:  phones.filter(p => p.status === 'online').length,
    offline: phones.filter(p => p.status === 'offline').length,
    views:   phones.reduce((s, p) => s + (p.total_views ?? 0), 0),
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-6" onClick={() => setContextMenu(null)}>

      {/* Modals */}
      {sessionDialog && (
        <SessionDialog
          phone={sessionDialog.phone}
          onClose={() => setSessionDialog(null)}
          onSaved={onSessionSaved}
        />
      )}
      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          phone={contextMenu.phone} x={contextMenu.x} y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onSession={() => setSessionDialog({ phone: contextMenu.phone })}
          onUnlink={() => unlinkIg(contextMenu.phone.id)}
          onDelete={() => deletePhone(contextMenu.phone.id)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Téléphones</h1>
          <p className="text-text2 text-sm mt-1">
            Cloud phones GéeLark · Stats IG auto toutes les 5 min (comptes avec session)
            {lastUpdated && (
              <span className="ml-3 text-text2">
                · màj {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <Button size="sm"
          onClick={syncFromGeelark} loading={syncing}
          disabled={!bearer}
          title="Importe / met à jour les téléphones depuis ton compte GéeLark">
          🔄 Sync GéeLark
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {([
          { key: 'all',     label: 'TÉLÉPHONES',  color: '#4f9eff', icon: '📱' },
          { key: 'online',  label: 'EN LIGNE',     color: '#00ccaa', icon: '✅' },
          { key: 'offline', label: 'HORS LIGNE',   color: '#5a6882', icon: '📴' },
          { key: 'views',   label: 'VUES TOTALES', color: '#ffaa2a', icon: '👁' },
        ] as const).map(({ key, label, color, icon }) => (
          <button key={key}
            onClick={() => key !== 'views' && setFilter(key as typeof filter)}
            className={`bg-card border rounded-xl p-4 text-left transition-all ${
              key !== 'views' && filter === key ? 'border-accent' : 'border-border hover:border-accent/40'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span>{icon}</span>
              <span className="text-xs font-semibold text-text2">{label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color }}>
              {key === 'views' ? counts.views.toLocaleString('fr-FR') : counts[key]}
            </p>
          </button>
        ))}
      </div>

      {/* Auto-refresh controls */}
      <div className="flex items-center gap-4 px-4 py-3 bg-card border border-border rounded-xl">
        <span className="text-xs font-medium text-text">Auto-statut</span>

        <button
          onClick={() => { const next = !autoRefresh; poller.setEnabled(next); setAutoRefresh(next) }}
          className={`relative w-8 h-4 rounded-full transition-colors ${autoRefresh ? 'bg-accent' : 'bg-surface2'}`}
        >
          <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${autoRefresh ? 'left-[18px]' : 'left-0.5'}`} />
        </button>

        <div className="flex items-center gap-1">
          {INTERVALS.map(({ label, value }) => (
            <button key={value}
              onClick={() => changeInterval(value)}
              disabled={!autoRefresh}
              className={`px-2.5 py-1 rounded text-xs transition-all disabled:opacity-40 ${
                intervalSec === value ? 'bg-accent/20 text-accent' : 'text-text2 hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {autoRefresh && bearer && (
          <>
            <div className="ml-auto"><Countdown secondsLeft={countdown} /></div>
            <span className="flex items-center gap-1.5 text-xs text-ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />Live
            </span>
          </>
        )}
      </div>

      {/* Warnings */}
      {!bearer && (
        <div className="px-4 py-3 rounded-lg bg-warn/10 border border-warn/20 text-warn text-sm">
          ⚠ Token GéeLark manquant — configure-le dans <span className="font-semibold">Paramètres</span>.
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 ml-3">✕</button>
        </div>
      )}
      {pollError && (
        <div className="px-4 py-2 rounded-lg bg-warn/10 border border-warn/20 text-warn text-xs flex justify-between">
          <span>⚠ {pollError}</span>
          <button onClick={() => setPollError(null)} className="opacity-60 hover:opacity-100 ml-3">✕</button>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex items-center gap-3">
        <input type="text" placeholder="🔍 Rechercher…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none transition-colors"
        />
        {(['all', 'online', 'offline'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              filter === f ? 'bg-accent/20 text-accent' : 'text-text2 hover:text-text'
            }`}
          >
            {f === 'all' ? 'Tous' : f === 'online' ? 'En ligne' : 'Hors ligne'}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : phones.length === 0 ? (
        <div className="text-center py-16 text-text2 space-y-3">
          <p className="text-4xl">📱</p>
          <p className="font-medium">Aucun téléphone synchronisé</p>
          <p className="text-sm">Clique sur "Sync GéeLark" pour importer tes phones.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[28px_1fr_100px_150px_120px_80px_90px_70px_110px_36px] px-4 py-2 border-b border-border bg-surface">
            {['#', 'Téléphone', 'Groupe', 'Instagram', 'Status IG', 'En ligne', 'Followers', 'Vues', 'Note', ''].map(h => (
              <span key={h} className="text-xs font-semibold text-text2 uppercase tracking-wider">{h}</span>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-text2 text-sm">Aucun résultat.</p>
          ) : (
            <div className="divide-y divide-border">
              {visible.map((phone, i) => (
                <div key={phone.id}
                  className="grid grid-cols-[28px_1fr_100px_150px_120px_80px_90px_70px_110px_36px] px-4 py-3 hover:bg-surface/50 transition-colors items-center cursor-default"
                  onContextMenu={e => {
                    e.preventDefault(); e.stopPropagation()
                    setContextMenu({ phone, x: e.clientX, y: e.clientY })
                  }}
                >
                  <span className="text-xs text-text2">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">{phone.phone_name}</p>
                    {phone.serial_no && (
                      <p className="text-[10px] text-text2 font-mono truncate">{phone.serial_no}</p>
                    )}
                  </div>
                  <span className="text-xs text-text2 truncate">{phone.group_name ?? '—'}</span>
                  <IgCell phone={phone} onSave={saveIgUsername} />
                  <IgStatusBadge phone={phone} />
                  <div className="flex items-center gap-1.5" title={phone.status === 'online' ? 'Téléphone en ligne' : 'Téléphone hors ligne'}>
                    <StatusDot status={phone.status} />
                  </div>
                  <span className="text-xs text-text">
                    {phone.followers ? phone.followers.toLocaleString('fr-FR') : '—'}
                  </span>
                  <span className="text-xs text-text">
                    {phone.total_views ? phone.total_views.toLocaleString('fr-FR') : '—'}
                  </span>
                  <NoteCell phone={phone} onSave={saveRemark} />
                  {/* ⋮ button */}
                  <button
                    onClick={e => { e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-text2 hover:bg-surface2 hover:text-text transition-colors text-lg leading-none"
                    title="Plus d'options"
                  >
                    ⋮
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && visible.length > 0 && (
        <p className="text-xs text-text2 text-right">
          {visible.length} téléphone{visible.length > 1 ? 's' : ''}
          {phones.length !== visible.length && ` sur ${phones.length}`}
          {counts.views > 0 && ` · ${counts.views.toLocaleString('fr-FR')} vues`}
          {' · '}Clic droit ou ⋮ pour plus d'options
        </p>
      )}
    </div>
  )
}
