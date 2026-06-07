import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { useT, useLang } from '@/lib/i18n'
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
  const t = useT()
  const online = status === 'online'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px', borderRadius: 20,
      background: online ? 'rgba(34,197,94,0.10)' : 'rgba(148,163,184,0.07)',
      border: online ? '1px solid rgba(34,197,94,0.22)' : '1px solid rgba(148,163,184,0.13)',
      fontSize: 11, fontWeight: 600,
      color: online ? '#22C55E' : 'rgba(148,163,184,0.52)',
    }}>
      {online
        ? <span className="sf-ping-dot" style={{ background: '#22C55E' }} />
        : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(148,163,184,0.25)', display: 'inline-block' }} />
      }
      {online ? t('online') : t('offline')}
    </span>
  )
}

// ── IG Status badge ─────────────────────────────────────────────────────────
function IgStatusBadge({ phone }: { phone: Phone }) {
  const t = useT()
  if (!phone.ig_username) return <span style={{ fontSize: 13, color: 'rgba(148,163,184,0.35)' }}>—</span>

  if (phone.ig_status === 'active')
    return <span className="sf-badge sf-badge-ok">{t('phoneOk')}</span>
  if (phone.ig_status === 'expired')
    return <span className="sf-badge sf-badge-danger">{t('phoneExpired')}</span>
  if (phone.ig_status === 'error')
    return <span className="sf-badge sf-badge-danger">{t('phoneError')}</span>
  if (phone.ig_status === 'rate_limited')
    return <span className="sf-badge sf-badge-warn">{t('phoneRateLimited')}</span>
  if (phone.ig_sessionid)
    return <span className="sf-badge sf-badge-accent">{t('phoneSession')}</span>
  return <span className="sf-badge sf-badge-muted">{t('phonePublic')}</span>
}

// ── Countdown display ────────────────────────────────────────────────────────
function Countdown({ secondsLeft }: { secondsLeft: number }) {
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  return (
    <span style={{ fontSize: 12, color: 'rgba(196,181,253,0.72)', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}>
        <path d="M9 5A4 4 0 1 1 6.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M6 1l1.5 1.5L6 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {m > 0 ? `${m}m ` : ''}{s.toString().padStart(2, '0')}s
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
  const t = useT()
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
      setExtractError('Phone not linked to GéeLark or missing token')
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
        setExtractError('sessionid not found — see logs above')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== 'Cancelled') setExtractError(msg)
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

  const inputBorderColor = testResult === 'ok' ? '#22C55E' : testResult === 'fail' ? '#EF4444' : 'rgba(255,255,255,0.09)'

  return (
    <div
      className="sf-modal-bg"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sf-modal sf-anim-scale-spring" style={{ width: 480, maxWidth: '90vw' }}>
        {/* Header */}
        <div className="sf-modal-header">
          <div>
            <h2 className="sf-modal-title">{t('phoneSessionTitle')}</h2>
            {phone.ig_username && (
              <p style={{ fontSize: 12, color: '#8B5CF6', margin: '4px 0 0' }}>@{phone.ig_username}</p>
            )}
          </div>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-icon" style={{ width: 28, height: 28, borderRadius: 8 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="sf-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Auto-extract via GéeLark shell */}
          {phone.geelark_id && bearer && (
            <div style={{
              background: '#111120', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 11, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#F2F0FF', margin: 0 }}>{t('phoneAutoExtract')}</p>
                  <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.52)', margin: '2px 0 0' }}>{t('phoneAutoExtractDesc')}</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {extracting && (
                    <button className="sf-btn sf-btn-secondary sf-btn-sm" onClick={cancelExtract}>
                      {t('phoneCancelExtract')}
                    </button>
                  )}
                  <Button size="sm" onClick={extractFromPhone} loading={extracting} disabled={extracting}>
                    {extracting ? t('phoneExtractingBtn') : t('phoneExtractBtn')}
                  </Button>
                </div>
              </div>
              {extractLogs.length > 0 && (
                <div style={{
                  background: '#07070C', borderRadius: 8, padding: 8,
                  maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {extractLogs.map((l, i) => (
                    <p key={i} style={{
                      fontSize: 10, fontFamily: 'monospace', margin: 0,
                      color: l.startsWith('✅') ? '#22C55E' : l.startsWith('❌') || l.startsWith('🛑') ? '#EF4444' : l.startsWith('⚠️') ? '#F59E0B' : 'rgba(148,163,184,0.52)',
                    }}>{l}</p>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
              {extractError && <p style={{ fontSize: 11, color: '#EF4444', margin: 0 }}>{extractError}</p>}
            </div>
          )}

          {/* Manual instructions */}
          <div style={{
            background: '#111120', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 11, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#F2F0FF', margin: 0 }}>{t('phoneManualInstructions')}</p>
            {[
              <>1. Open <span style={{ color: '#8B5CF6' }}>{t('phoneManualStep1Chrome')}</span> in Chrome</>,
              <>2. Press <span style={{ color: '#8B5CF6' }}>{t('phoneManualStep2DevTools')}</span> (DevTools)</>,
              <>3. Go to <span style={{ color: '#8B5CF6' }}>{t('phoneManualStep3Cookies')}</span></>,
              <>4. Find the <span style={{ color: '#8B5CF6', fontFamily: 'monospace' }}>{t('phoneManualStep4Cookie')}</span> cookie and copy its value</>,
            ].map((step, i) => (
              <p key={i} style={{ fontSize: 11, color: 'rgba(148,163,184,0.52)', margin: 0 }}>{step}</p>
            ))}
          </div>

          {/* Session input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'rgba(196,181,253,0.72)' }}>{t('phoneSessionLabel')}</label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type="password"
                value={value}
                onChange={e => handleChange(e.target.value)}
                placeholder={t('phoneSessionPlaceholder')}
                className="sf-input"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  paddingRight: 36,
                  borderColor: testResult === 'ok' ? '#22C55E' : testResult === 'fail' ? '#EF4444' : undefined,
                  fontFamily: 'monospace',
                }}
              />
              <span style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 13, pointerEvents: 'none',
              }}>
                {testing ? (
                  <svg style={{ animation: 'spin 1s linear infinite' }} width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5" stroke="#8B5CF6" strokeWidth="1.5" strokeDasharray="10 20" strokeLinecap="round"/>
                  </svg>
                ) : testResult === 'ok' ? (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 7l3 3 6-6" stroke="#22C55E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : testResult === 'fail' ? (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 2l9 9M11 2L2 11" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                ) : null}
              </span>
            </div>
            {testResult === 'ok' && detectedUser && (
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.52)', margin: 0 }}>
                {t('phoneSessionTestOkUser')} <span style={{ color: '#8B5CF6', fontWeight: 600 }}>@{detectedUser}</span>
                {phone.ig_username && phone.ig_username !== detectedUser && (
                  <span style={{ color: '#F59E0B', marginLeft: 4 }}>{t('phoneSessionDifferentUser')} @{phone.ig_username} {t('phoneSessionWillUpdate')}</span>
                )}
              </p>
            )}
            {testResult === 'fail' && <p style={{ fontSize: 11, color: '#EF4444', margin: 0 }}>{t('phoneSessionInvalid')}</p>}
            {testResult === 'idle' && value.trim().length > 10 && !testing && (
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.52)', margin: 0 }}>{t('phoneSessionAutoTest')}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sf-modal-footer">
          <button onClick={onClose} disabled={busy} className="sf-btn sf-btn-ghost">
            {t('cancel')}
          </button>
          <Button size="sm" onClick={save} loading={busy} disabled={!value.trim()}>
            {testing ? t('phoneSessionVerifying') : saving ? t('phoneSessionSaving') : testResult === 'ok' ? t('phoneSessionSave') : t('phoneSessionTestAndSave')}
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
  const t = useT()
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

  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button
      onClick={() => { onClick(); onClose() }}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', fontSize: 13, textAlign: 'left', borderRadius: 6,
        background: 'none', border: 'none', cursor: 'pointer',
        color: danger ? '#EF4444' : '#F2F0FF', transition: 'background 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
    >
      <span style={{ width: 16, display: 'flex', justifyContent: 'center' }}>{icon}</span>
      <span>{label}</span>
    </button>
  )

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed', zIndex: 50,
        background: '#0C0C15', border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 11, boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        padding: '4px 0', width: 208,
        left, top,
      }}
    >
      <div style={{ padding: '6px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.055)', marginBottom: 4 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#F2F0FF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phone.phone_name}</p>
        {phone.ig_username && <p style={{ fontSize: 10, color: '#8B5CF6', margin: '1px 0 0' }}>@{phone.ig_username}</p>}
      </div>
      {item(
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="5.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
        t('phoneCtxSessionId'), onSession
      )}
      {phone.ig_username && item(
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5C2 4 4 2 6.5 2s4.5 2 4.5 4.5S9 11 6.5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M2 11l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
        t('phoneCtxUnlink'), onUnlink
      )}
      {canDelete && (
        <>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.055)', margin: '4px 0' }} />
          {item(
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2h3v1.5M4.5 3.5l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
            t('phoneCtxDelete'), onDelete, true
          )}
        </>
      )}
    </div>
  )
}

// ── Inline Instagram username edit ─────────────────────────────────────────────
function IgCell({ phone, onSave }: { phone: Phone; onSave: (id: string, u: string) => Promise<void> }) {
  const t = useT()
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 13, color: 'rgba(196,181,253,0.72)' }}>@</span>
      <input
        ref={ref} value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={onKey} onBlur={save} disabled={saving}
        className="sf-input"
        style={{ width: 112, padding: '2px 6px', fontSize: 13, borderColor: '#8B5CF6' }}
      />
    </div>
  )

  return (
    <button
      onClick={() => setEditing(true)}
      style={{ fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', minWidth: 0, padding: 0 }}
      title={t('phoneClickToEdit')}
    >
      {phone.ig_username ? (
        <span style={{ color: '#8B5CF6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{phone.ig_username}</span>
      ) : (
        <span style={{ color: 'rgba(148,163,184,0.35)', fontStyle: 'italic' }}>{t('phoneIgCellAdd')}</span>
      )}
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ opacity: 0, flexShrink: 0, transition: 'opacity 0.15s' }} className="edit-pencil">
        <path d="M7.5 1.5l2 2-6 6H1.5v-2l6-6z" stroke="rgba(148,163,184,0.52)" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

// ── Inline note (remark) edit ─────────────────────────────────────────────────
function NoteCell({ phone, onSave }: { phone: Phone; onSave: (id: string, v: string) => Promise<void> }) {
  const t = useT()
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
      className="sf-input"
      style={{ width: '100%', padding: '2px 6px', fontSize: 13, borderColor: '#8B5CF6' }}
      placeholder={t('phoneNoteCellPlaceholder')}
    />
  )

  return (
    <button
      onClick={() => setEditing(true)}
      style={{ fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', minWidth: 0, width: '100%', padding: 0 }}
      title={t('phoneClickToEdit')}
    >
      {phone.remark ? (
        <span style={{ color: 'rgba(196,181,253,0.72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phone.remark}</span>
      ) : (
        <span style={{ color: 'rgba(148,163,184,0.25)', fontStyle: 'italic' }}>{t('phoneNoteCellAdd')}</span>
      )}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function Phones({ user }: PhonesProps) {
  const t = useT()
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
    if (err) setError('Error loading phones.')
    else {
      setPhones(data ?? [])
    }
    setLoading(false)
    // Trigger an immediate poll if one hasn't happened recently
    poller.pollNow()
  }

  // ── Periodic IG stats refresh (every 5 min, only when Phones is mounted) ───
  const igFailCountRef = useRef(0)
  const igBackoffUntilRef = useRef(0)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!window.electronAPI?.fetchInstagramBySession) return
      if (Date.now() < igBackoffUntilRef.current) return
      const sinceIg = lastIgSyncRef.current
        ? (Date.now() - lastIgSyncRef.current.getTime()) / 1000 : Infinity
      if (sinceIg < 290) return
      lastIgSyncRef.current = new Date()
      const withSession = phonesRef.current.filter(p => p.ig_username && p.ig_sessionid)
      for (const phone of withSession) {
        try {
          const r = await window.electronAPI.fetchInstagramBySession({
            username: phone.ig_username!, sessionid: phone.ig_sessionid!,
          })
          if (r.ok) {
            igFailCountRef.current = 0
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
            igFailCountRef.current++
            if (igFailCountRef.current >= 3) {
              // Back off 30 min after 3 consecutive failures to avoid hammering the API
              igBackoffUntilRef.current = Date.now() + 30 * 60 * 1000
              igFailCountRef.current = 0
              break
            }
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
    if (!bearer) { setError(t('phoneMissingToken')); return }
    setSyncing(true); setError(null)
    try {
      const items = await fetchAllPhones(bearer)
      if (items.length === 0) { setError(t('noPhones')); setSyncing(false); return }
      if (items.length > phoneLimit) {
        setError(`Plan limit reached: ${phoneLimit} phones max (${effectivePlan(license) ?? 'standard'}). Upgrade your plan to add more.`)
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
        // Delete phones removed from GéeLark (only those already in this org)
        const { data: orgPhones } = await supabase
          .from('phones').select('id,geelark_id').eq('org_id', currentOrg.id)
        const toDelete = (orgPhones ?? []).filter((p: { geelark_id: string }) => !currentGeelarkIds.has(p.geelark_id))
        if (toDelete.length > 0) {
          await supabase.from('phones').delete().in('id', toDelete.map((p: { id: string }) => p.id))
        }

        const { error } = await supabase.rpc('sync_geelark_phones', {
          p_rows:   rows,
          p_org_id: currentOrg.id,
        })
        if (error) throw new Error(error.message)
      } else {
        // Solo mode — delete phones no longer in GéeLark then upsert the rest
        await supabase.from('phones')
          .delete()
          .eq('user_id', user.id)
          .is('org_id', null)
          .not('geelark_id', 'in', `(${[...currentGeelarkIds].join(',')})`)

        const { error: upsertErr } = await supabase.rpc('sync_geelark_phones', {
          p_rows:   rows,
          p_org_id: null,
        })
        if (upsertErr) throw new Error(upsertErr.message)
      }
      lastDbSyncRef.current = new Date()
      await loadPhones()
      setLastUpdated(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync error.')
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
    if (!confirm(t('phoneDeleteConfirm'))) return
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
  const groups       = Array.from(new Set(phones.map(p => p.group_name).filter(Boolean))) as string[]

  function relativeTime(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60)        return '< 1 min ago'
    if (diff < 3600)      return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  function phoneColor(name: string): string {
    const palette = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']
    let h = 0
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
    return palette[Math.abs(h) % palette.length]
  }

  const COLS = '40px 1fr 160px 130px 120px'

  // ── small icon action button ──────────────────────────────────────────────
  const ActionBtn = ({
    onClick, title, children, danger,
  }: { onClick: () => void; title: string; children: React.ReactNode; danger?: boolean }) => {
    const [hovered, setHovered] = useState(false)
    return (
      <button
        onClick={onClick}
        title={title}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 28, height: 28, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hovered ? (danger ? 'rgba(239,68,68,0.15)' : 'rgba(124,58,237,0.15)') : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: hovered ? (danger ? '#EF4444' : '#A78BFA') : 'rgba(148,163,184,0.52)',
          cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
        }}
      >
        {children}
      </button>
    )
  }

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

      <div
        className="sf-anim-slide-up"
        style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#07070C' }}
        onClick={() => setContextMenu(null)}
      >

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, padding: '20px 32px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.055)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(139,92,246,0.06))',
              border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 23, fontWeight: 900, margin: 0, letterSpacing: '-0.025em', lineHeight: 1.1,
              background: 'linear-gradient(135deg,#FFFFFF 0%,rgba(196,181,253,0.85) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t('phonesHeading')}</h1>
              <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.6)', margin: '4px 0 0', lineHeight: 1.4 }}>{t('phonesSubtitle')}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Auto-refresh control */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 8,
              background: '#0C0C15', border: '1px solid rgba(139,92,246,0.22)',
              flexShrink: 0,
            }}>
              <button
                onClick={() => { const next = !autoRefresh; poller.setEnabled(next); setAutoRefresh(next) }}
                style={{
                  position: 'relative', width: 28, height: 15, borderRadius: 9,
                  background: autoRefresh ? '#22C55E' : 'rgba(148,163,184,0.2)',
                  flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2.5, width: 10, height: 10,
                  background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  transition: 'left 0.2s', left: autoRefresh ? 15 : 2.5,
                }} />
              </button>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(148,163,184,0.52)', whiteSpace: 'nowrap' }}>{t('phonesAutoLabel')}</span>
              {autoRefresh && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 14, padding: '2px 3px', flexShrink: 0 }}>
                  {INTERVALS.map(({ label, value }) => (
                    <button key={value} onClick={() => changeInterval(value)}
                      style={{
                        padding: '3px 7px', borderRadius: 12, fontSize: 10, border: 'none', cursor: 'pointer',
                        background: intervalSec === value ? '#7C3AED' : 'transparent',
                        color: intervalSec === value ? '#fff' : 'rgba(148,163,184,0.52)',
                        fontWeight: intervalSec === value ? 700 : 400,
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}>{label}</button>
                  ))}
                </div>
              )}
              {autoRefresh && bearer && <Countdown secondsLeft={countdown} />}
            </div>

            {/* Sync button */}
            <button
              onClick={syncFromGeelark} disabled={!bearer || syncing}
              className="sf-btn sf-btn-primary sf-btn-sm"
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                cursor: (!bearer || syncing) ? 'not-allowed' : 'pointer',
                opacity: (!bearer || syncing) ? 0.5 : 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                <path d="M12 7A5 5 0 1 1 9.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M9 1l1.5 1.5L9 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('phonesSyncGeelark')}
            </button>
          </div>
        </div>

        {/* ── Main scrollable area (cards + table scroll together) ─────────── */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* ── Summary cards ─────────────────────────────────────────────────── */}
        {(() => {
          const onlinePct = phones.length ? Math.round((onlineCount / phones.length) * 100) : 0

          const summaryCards = [
            {
              label: t('phoneSummaryTotal'), value: phones.length, sub: t('phoneSummaryPhonesSub'),
              color: '#8B5CF6', f: 'all' as const,
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="5" y="1" width="10" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="10" cy="15.5" r="1" fill="currentColor"/>
                </svg>
              ),
            },
            {
              label: t('phoneSummaryOnline'), value: onlineCount, sub: `${onlinePct}% ${t('phoneSummaryActivePct')}`,
              color: '#22C55E', f: 'online' as const,
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="3" fill="currentColor"/>
                  <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/>
                </svg>
              ),
            },
            {
              label: t('phoneSummaryOffline'), value: offlineCount, sub: `${100 - onlinePct}% ${t('phoneSummaryInactivePct')}`,
              color: 'rgba(148,163,184,0.52)', f: 'offline' as const,
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ),
            },
          ]

          const staggerClasses = ['sf-d50', 'sf-d100', 'sf-d150']
          return (
            <div style={{
              padding: '16px 32px 12px',
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
            }}>
              {summaryCards.map((card, ci) => (
                <button
                  key={card.label}
                  onClick={() => { if (card.f) setFilter(card.f) }}
                  className={`sf-stat-card sf-anim-slide-up ${staggerClasses[ci]}`}
                  style={{
                    background: (card.f && filter === card.f) ? `rgba(124,58,237,0.08)` : '#0C0C15',
                    border: (card.f && filter === card.f) ? '1px solid rgba(139,92,246,0.22)' : '1px solid rgba(255,255,255,0.055)',
                    borderRadius: 11, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    cursor: card.f ? 'pointer' : 'default',
                    transition: 'all 0.15s', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(124,58,237,0.08)',
                    color: card.color,
                  }}>
                    {card.icon}
                  </div>
                  <div>
                    <p className="sf-anim-count-up" style={{ fontSize: 26, fontWeight: 800, color: '#F2F0FF', margin: 0, lineHeight: 1, letterSpacing: '-0.04em' }}>{card.value}</p>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(148,163,184,0.52)', margin: '4px 0 0' }}>{card.label}</p>
                  </div>
                </button>
              ))}
            </div>
          )
        })()}

        {/* ── Main area ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex' }}>

          {/* Table area */}
          <div style={{ flex: 1, padding: '4px 32px 32px', minWidth: 0 }}>

            {/* Alerts */}
            {!bearer && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                color: '#F59E0B', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M7.5 1L14 13.5H1L7.5 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                  <path d="M7.5 6v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <circle cx="7.5" cy="11" r="0.7" fill="currentColor"/>
                </svg>
                {t('phoneMissingToken')}
              </div>
            )}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#EF4444', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <span>{error}</span>
                <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', opacity: 0.6, padding: 0, fontSize: 14 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                </button>
              </div>
            )}
            {pollError && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                color: '#F59E0B', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <span>{pollError}</span>
                <button onClick={() => setPollError(null)} style={{ background: 'none', border: 'none', color: '#F59E0B', cursor: 'pointer', opacity: 0.6, padding: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                </button>
              </div>
            )}

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              {/* Search */}
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'rgba(148,163,184,0.35)', pointerEvents: 'none' }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder={t('phonesSearchPlaceholder')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="sf-input"
                  style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 34, paddingRight: 14 }}
                />
              </div>

              {/* Group filter */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <select
                  value={groupFilter}
                  onChange={e => setGroupFilter(e.target.value)}
                  className="sf-input"
                  style={{
                    appearance: 'none', paddingRight: 28, paddingLeft: 12,
                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  <option value="all">{t('phonesAllGroups')}</option>
                  {groups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(148,163,184,0.4)', fontSize: 9 }}>▼</span>
              </div>

              {/* Status filter — pill selector */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 2,
                background: '#0C0C15', border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 20, padding: '3px 4px', flexShrink: 0,
              }}>
                {(['all', 'online', 'offline'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setFilter(v)}
                    style={{
                      padding: '4px 11px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      background: filter === v ? '#7C3AED' : 'transparent',
                      color: filter === v ? '#fff' : 'rgba(148,163,184,0.52)',
                    }}
                  >
                    {v === 'all' ? t('phonesFilterAll') : v === 'online' ? t('phonesFilterOnline') : t('phonesFilterOffline')}
                  </button>
                ))}
              </div>

              {/* Sync button */}
              <button
                onClick={syncFromGeelark}
                disabled={!bearer || syncing}
                className="sf-btn sf-btn-primary sf-btn-sm"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  cursor: (!bearer || syncing) ? 'not-allowed' : 'pointer',
                  opacity: (!bearer || syncing) ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                  <path d="M11 6.5A4.5 4.5 0 1 1 8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M8 1.5l1.5 1.5L8 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {syncing ? t('phonesSyncing') : t('phonesSync')}
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Stat card skeletons */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 4 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="sf-skeleton" style={{ height: 72, borderRadius: 11 }} />
                  ))}
                </div>
                {/* Table row skeletons */}
                <div style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 11, overflow: 'hidden' }}>
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div className="sf-skeleton" style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="sf-skeleton" style={{ height: 11, width: `${55 + i * 7}%`, borderRadius: 4 }} />
                        <div className="sf-skeleton" style={{ height: 9, width: '35%', borderRadius: 4 }} />
                      </div>
                      <div className="sf-skeleton" style={{ height: 22, width: 70, borderRadius: 20 }} />
                      <div className="sf-skeleton" style={{ height: 22, width: 58, borderRadius: 20 }} />
                    </div>
                  ))}
                </div>
              </div>
            ) : phones.length === 0 ? (
              /* Empty state */
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '72px 32px', textAlign: 'center',
                background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15,
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16, marginBottom: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(139,92,246,0.22)',
                  color: '#8B5CF6',
                }}>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <rect x="6" y="1" width="16" height="26" rx="3.5" stroke="currentColor" strokeWidth="1.8"/>
                    <circle cx="14" cy="22" r="1.5" fill="currentColor"/>
                    <path d="M10 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#F2F0FF', margin: '0 0 8px' }}>{t('phonesNoConfigured')}</p>
                <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.52)', margin: '0 0 24px', maxWidth: 320 }}>
                  {t('phonesNoConfiguredDesc')}
                </p>
                <button
                  onClick={syncFromGeelark}
                  disabled={!bearer || syncing}
                  className="sf-btn sf-btn-primary"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    cursor: (!bearer || syncing) ? 'not-allowed' : 'pointer',
                    opacity: (!bearer || syncing) ? 0.5 : 1,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M12 7A5 5 0 1 1 9.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M9 1l1.5 1.5L9 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t('phonesSyncGeelark')}
                </button>
              </div>
            ) : (
              <div style={{
                background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)',
                borderRadius: 11, overflow: 'hidden',
              }}>
                {/* Table header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: COLS,
                  alignItems: 'center', padding: '10px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.055)',
                  background: 'rgba(255,255,255,0.018)',
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'rgba(148,163,184,0.45)',
                  userSelect: 'none',
                }}>
                  <span>{t('phonesTableNum')}</span>
                  <span>{t('phonesTablePhone')}</span>
                  <span>{t('phonesTableGroup')}</span>
                  <span>{t('phonesTableGeelark')}</span>
                  <span>{t('phonesTableActions')}</span>
                </div>

                {visible.length === 0 ? (
                  <p style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'rgba(148,163,184,0.52)', margin: 0 }}>
                    {t('phonesNoSearchResults')}
                  </p>
                ) : (
                  visible.map((phone, i) => {
                    const col = phoneColor(phone.phone_name)
                    const isSelected = selectedPhone?.id === phone.id
                    return (
                      <PhoneRow
                        key={phone.id}
                        phone={phone}
                        index={i}
                        isSelected={isSelected}
                        isLast={i === visible.length - 1}
                        col={col}
                        phones={phones}
                        COLS={COLS}
                        relativeTime={relativeTime}
                        setSelectedPhone={setSelectedPhone}
                        setContextMenu={setContextMenu}
                        setSessionDialog={setSessionDialog}
                        saveIgUsername={saveIgUsername}
                        saveRemark={saveRemark}
                        unlinkIg={unlinkIg}
                        deletePhone={deletePhone}
                        canDelete={canDelete}
                        ActionBtn={ActionBtn}
                      />
                    )
                  })
                )}
              </div>
            )}

            {!loading && visible.length > 0 && (
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.3)', marginTop: 10 }}>
                {visible.length} {t('phonesCountOf')} {phones.length} {phones.length > 1 ? t('phonesPhonesPlural') : t('phonesPhonesSuffix')}
                {lastUpdated && (
                  <span> · {t('phonesUpdatedAt')} {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </p>
            )}
          </div>

          {/* ── Right detail panel ──────────────────────────────────────────── */}
          {selectedPhone && (() => {
            const p = selectedPhone
            const col = phoneColor(p.phone_name)
            return (
              <div style={{
                width: 300, flexShrink: 0,
                borderLeft: '1px solid rgba(255,255,255,0.055)',
                background: '#0C0C15', overflowY: 'auto',
              }}>
                {/* Panel header */}
                <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `linear-gradient(135deg, ${col}22, ${col}11)`,
                        border: `1px solid ${col}33`, color: col,
                      }}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <rect x="4" y="1" width="10" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
                          <circle cx="9" cy="14" r="0.8" fill="currentColor"/>
                        </svg>
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#F2F0FF', margin: 0, lineHeight: 1.2 }}>{p.phone_name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <StatusDot status={p.status ?? 'offline'} />
                          {p.group_name && (
                            <span style={{
                              fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                              background: 'rgba(139,92,246,0.12)', color: '#A78BFA',
                              border: '1px solid rgba(139,92,246,0.22)',
                            }}>
                              {p.group_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedPhone(null)}
                      style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)',
                        color: 'rgba(148,163,184,0.52)', cursor: 'pointer',
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                  {/* Quick actions */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { label: t('phoneSession'), icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="5" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>, action: () => setSessionDialog({ phone: p }) },
                      { label: t('phonesSync'), icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10.5 6A4.5 4.5 0 1 1 8 2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M7.5 1l1.5 1.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>, action: () => poller.pollNow() },
                    ].map(a => (
                      <button key={a.label} onClick={a.action}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                          padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 500,
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                          color: 'rgba(196,181,253,0.72)', cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {a.icon}{a.label}
                      </button>
                    ))}
                    <button
                      onClick={e => { e.stopPropagation(); setContextMenu({ phone: p, x: e.clientX, y: e.clientY }) }}
                      style={{
                        width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 7, background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        color: 'rgba(148,163,184,0.52)', cursor: 'pointer',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <circle cx="6.5" cy="2" r="1" fill="currentColor"/>
                        <circle cx="6.5" cy="6.5" r="1" fill="currentColor"/>
                        <circle cx="6.5" cy="11" r="1" fill="currentColor"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Info rows */}
                <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(148,163,184,0.35)', margin: '0 0 10px' }}>{t('phonesInfoSection')}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { label: t('phonesDetailModel'),    value: p.phone_name },
                      { label: t('phonesDetailSerial'),   value: p.serial_no ?? '—' },
                      { label: t('phonesDetailGeelarkId'), value: p.geelark_id ?? '—' },
                      { label: t('phonesDetailGroup'),    value: p.group_name ?? '—' },
                      { label: t('phonesDetailLastSync'), value: p.synced_at ? relativeTime(p.synced_at) : '—' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)', flexShrink: 0 }}>{row.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: '#F2F0FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, textAlign: 'right' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Instagram section */}
                {p.ig_username && (
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(148,163,184,0.35)', margin: '0 0 10px' }}>{t('phonesIgSection')}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 13, fontWeight: 700,
                        background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)',
                      }}>
                        {p.ig_username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#8B5CF6', margin: 0 }}>@{p.ig_username}</p>
                        {(p.followers || p.following) ? (
                          <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.45)', margin: '2px 0 0' }}>
                            {p.followers ? `${p.followers >= 1000 ? `${(p.followers / 1000).toFixed(1)}K` : p.followers} ${t('phonesIgFollowers')}` : ''}
                            {p.followers && p.following ? ' · ' : ''}
                            {p.following ? `${p.following} ${t('phonesIgFollowing')}` : ''}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)' }}>{t('phonesIgStatus')}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: p.ig_status === 'active' ? '#22C55E' : (p.ig_status === 'expired' || p.ig_status === 'error') ? '#EF4444' : 'rgba(148,163,184,0.52)',
                        }}>
                          {p.ig_status === 'active' ? t('phonesIgStatusActive') : p.ig_status === 'expired' ? t('phonesIgStatusExpired') : p.ig_status === 'error' ? t('phonesIgStatusError') : t('phonesIgNotConfigured')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)' }}>{t('phonesIgSession')}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: p.ig_sessionid ? '#22C55E' : 'rgba(148,163,184,0.52)' }}>
                          {p.ig_sessionid ? t('phonesIgSessionConfigured') : t('phonesIgNotConfigured')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions rapides */}
                <div style={{ padding: '14px 18px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(148,163,184,0.35)', margin: '0 0 8px' }}>{t('phonesQuickActions')}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button onClick={() => setSessionDialog({ phone: p })} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                      borderRadius: 7, fontSize: 12, fontWeight: 500, textAlign: 'left',
                      background: 'none', border: 'none', color: 'rgba(196,181,253,0.72)', cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="5.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                      {t('phonesSessionIdAction')}
                    </button>
                    {p.ig_username && (
                      <button onClick={() => { unlinkIg(p.id); setSelectedPhone(null) }} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                        borderRadius: 7, fontSize: 12, fontWeight: 500, textAlign: 'left',
                        background: 'none', border: 'none', color: 'rgba(196,181,253,0.72)', cursor: 'pointer',
                        transition: 'background 0.12s',
                      }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5C2 4 4 2 6.5 2s4.5 2 4.5 4.5S9 11 6.5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M2 11l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        {t('phonesUnlinkIgAction')}
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => { deletePhone(p.id); setSelectedPhone(null) }} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                        borderRadius: 7, fontSize: 12, fontWeight: 500, textAlign: 'left',
                        background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer',
                        transition: 'background 0.12s',
                      }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2h3v1.5M4.5 3.5l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        {t('phonesDeleteAction')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
      </div>{/* end scrollable wrapper */}
    </>
  )
}

// ── PhoneRow sub-component (keeps hover state local) ─────────────────────────
function PhoneRow({
  phone, index, isSelected, isLast, col, phones, COLS,
  relativeTime, setSelectedPhone, setContextMenu, setSessionDialog,
  saveIgUsername, saveRemark, unlinkIg, deletePhone, canDelete, ActionBtn,
}: {
  phone: Phone; index: number; isSelected: boolean; isLast: boolean; col: string
  phones: Phone[]; COLS: string
  relativeTime: (iso: string) => string
  setSelectedPhone: (p: Phone | null) => void
  setContextMenu: (v: { phone: Phone; x: number; y: number } | null) => void
  setSessionDialog: (v: { phone: Phone } | null) => void
  saveIgUsername: (id: string, u: string) => Promise<void>
  saveRemark: (id: string, v: string) => Promise<void>
  unlinkIg: (id: string) => Promise<void>
  deletePhone: (id: string) => Promise<void>
  canDelete: boolean
  ActionBtn: React.ComponentType<{ onClick: () => void; title: string; children: React.ReactNode; danger?: boolean }>
}) {
  const t = useT()
  const [hovered, setHovered] = useState(false)

  const rowBg = isSelected
    ? 'rgba(124,58,237,0.07)'
    : hovered
    ? 'rgba(139,92,246,0.03)'
    : 'transparent'

  const cellStyle: React.CSSProperties = {
    transition: 'background 0.12s',
  }

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: COLS,
        alignItems: 'center', padding: '11px 16px',
        background: rowBg,
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
        borderLeft: (isSelected || hovered) ? '3px solid #7C3AED' : '3px solid transparent',
        transition: 'background 0.15s, border-color 0.15s',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setSelectedPhone(isSelected ? null : phone)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}
    >
      {/* # */}
      <span style={{ ...cellStyle, fontSize: 11, color: 'rgba(148,163,184,0.3)', fontVariantNumeric: 'tabular-nums' }}>{index + 1}</span>

      {/* Téléphone */}
      <div style={{ ...cellStyle, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, paddingRight: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, ${col}22, ${col}0d)`,
          border: `1px solid ${col}2e`, color: col,
        }}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="3" y="1" width="9" height="13" rx="2" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="7.5" cy="11.5" r="0.7" fill="currentColor"/>
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#F2F0FF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            {phone.phone_name}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            {phone.group_name && (
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                background: 'rgba(139,92,246,0.10)', color: '#A78BFA',
                border: '1px solid rgba(139,92,246,0.18)', whiteSpace: 'nowrap',
              }}>
                {phone.group_name}
              </span>
            )}
            <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(148,163,184,0.35)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {phone.serial_no ? `SN: ${phone.serial_no}` : phone.geelark_id ? `GL: ${phone.geelark_id}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Groupe */}
      <div style={{ ...cellStyle, minWidth: 0, paddingRight: 8 }}>
        {phone.group_name ? (
          <>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(196,181,253,0.72)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phone.group_name}</p>
            <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)', margin: 0 }}>
              {phones.filter(p2 => p2.group_name === phone.group_name).length} ph.
            </p>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.25)' }}>—</span>
        )}
      </div>

      {/* GéeLark status */}
      <div style={cellStyle}><StatusDot status={phone.status ?? 'offline'} /></div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
        <button className="sf-btn sf-btn-ghost sf-btn-sm sf-btn-icon" onClick={() => poller.pollNow()} title={t('phonesRowRefresh')} style={{ width: 28, height: 28 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M11 6.5A4.5 4.5 0 1 1 8.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M8 1.5l1.5 1.5L8 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="sf-btn sf-btn-ghost sf-btn-sm sf-btn-icon" onClick={() => setSelectedPhone(isSelected ? null : phone)} title={t('phonesRowViewDetails')} style={{ width: 28, height: 28 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <ellipse cx="6.5" cy="6.5" rx="5" ry="3" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="6.5" cy="6.5" r="1.5" fill="currentColor"/>
          </svg>
        </button>
        <button className="sf-btn sf-btn-ghost sf-btn-sm sf-btn-icon" onClick={() => setSessionDialog({ phone })} title={t('phonesRowSessionId')} style={{ width: 28, height: 28 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1.5" y="5.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M4.5 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
        {canDelete && (
          <button className="sf-btn sf-btn-ghost sf-btn-sm sf-btn-icon" onClick={() => deletePhone(phone.id)} title={t('phonesRowDelete')} style={{ width: 28, height: 28, color: '#EF4444' }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3.5h9M5 3.5V2h3v1.5M4.5 3.5l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
