import { useState, useEffect, useCallback, useRef, memo } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { useT, useLang } from '@/lib/i18n'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { fetchAllPhones, geelarkStatusLabel, extractInstagramSessionId, stopPhones } from '@/lib/geelark'
import * as poller from '@/lib/phonePoller'
import { Button }  from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { ACCENT, HAIR, SANS, TEXT_1, TEXT_3 } from '@/lib/theme'
import { useLicense, effectivePlan } from '@/lib/license'
import { PLAN_MAX_PHONES } from '@/lib/credits'

interface PhonesProps { user: User }

type SortKey = 'name' | 'status' | 'group'
type SortDir = 'asc' | 'desc'

const INTERVALS = [
  { label: '30 s',  value: 30  },
  { label: '1 min', value: 60  },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
]

// ── Status dot ───────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const t = useT()
  const online  = status === 'online'
  const warming = status === 'warming'

  const dotColor  = online ? 'var(--ok)' : warming ? 'var(--warn)' : 'rgba(233,234,240,0.28)'
  const glowColor = online ? 'rgba(52,211,153,0.28)' : warming ? 'rgba(251,191,36,0.28)' : 'transparent'
  const label     = online ? t('online') : warming ? 'warming' : t('offline')
  const badgeCls  = online ? 'sf-badge sf-badge-ok' : warming ? 'sf-badge sf-badge-warn' : 'sf-badge sf-badge-muted'

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: dotColor,
        boxShadow: online || warming ? `0 0 0 3px ${glowColor}` : 'none',
        display: 'inline-block',
        animation: online ? 'sf-ping 2s ease infinite' : 'none',
      }} />
      <span className={badgeCls}>{label}</span>
    </div>
  )
}

// ── IG Status badge ──────────────────────────────────────────────────────────
function IgStatusBadge({ phone }: { phone: Phone }) {
  const t = useT()
  if (!phone.ig_username) return <span style={{ fontSize: 13, color: 'rgba(233,234,240,0.25)' }}>—</span>

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

// ── Countdown chip ───────────────────────────────────────────────────────────
const CountdownTicker = memo(function CountdownTicker({ enabled }: { enabled: boolean }) {
  const [secondsLeft, setSecondsLeft] = useState(() => poller.getIntervalSec())

  useEffect(() => {
    if (!enabled) return
    const compute = () => {
      const sec  = poller.getIntervalSec()
      const last = poller.getLastPollMs() || Date.now()
      setSecondsLeft(Math.max(0, sec - Math.floor((Date.now() - last) / 1000)))
    }
    compute()
    const id = setInterval(compute, 1000)
    return () => clearInterval(id)
  }, [enabled])

  if (!enabled) return null
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 99,
      background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
      fontSize: 11, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace',
      color: 'rgba(99,102,241,0.85)',
    }}>
      {/* Clock icon */}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M5 2.5v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {m > 0 ? `${m}m ` : ''}{s.toString().padStart(2, '0')}s
    </span>
  )
})

// ── Session ID dialog ─────────────────────────────────────────────────────────
function SessionDialog({
  phone, bearer, onClose, onSaved,
}: {
  phone: Phone; bearer: string
  onClose: () => void
  onSaved: (id: string, sessionid: string, detectedUsername?: string) => void
}) {
  const t = useT()
  const [value, setValue]               = useState(phone.ig_sessionid ?? '')
  const [testing, setTesting]           = useState(false)
  const [testResult, setTestResult]     = useState<'idle' | 'ok' | 'fail'>('idle')
  const [detectedUser, setDetectedUser] = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [saveError, setSaveError]       = useState<string | null>(null)
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
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
    }
    try {
      const sessionid = await extractInstagramSessionId(bearer, phone.geelark_id, addLog, ctrl.signal)
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

  function cancelExtract() { abortCtrlRef.current?.abort() }

  function handleChange(v: string) {
    setValue(v)
    setTestResult('idle')
    setDetectedUser(null)
    setSaveError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length > 10) {
      debounceRef.current = setTimeout(() => runTest(v), 400)
    }
  }

  async function save() {
    if (!value.trim()) return
    setSaving(true); setSaveError(null)
    let username = detectedUser ?? undefined
    if (testResult !== 'ok') {
      const r = await runTest(value)
      if (!r.ok) { setSaving(false); return }
      username = r.username
    }
    const { error } = await supabase.from('phones').update({ ig_sessionid: value.trim() || null }).eq('id', phone.id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    onSaved(phone.id, value.trim(), username)
    onClose()
  }

  const busy = testing || saving

  return (
    <div className="sf-modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sf-modal sf-anim-scale-spring" style={{ width: 480, maxWidth: '90vw' }}>
        <div className="sf-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.35)', color: ACCENT,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="5.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h2 className="sf-modal-title">{t('phoneSessionTitle')}</h2>
              {phone.ig_username && <p style={{ fontSize: 12, color: ACCENT, margin: '2px 0 0' }}>@{phone.ig_username}</p>}
            </div>
          </div>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-icon" style={{ width: 28, height: 28, borderRadius: 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="sf-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {phone.geelark_id && bearer && (
            <div style={{
              background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: TEXT_1, margin: 0 }}>{t('phoneAutoExtract')}</p>
                  <p style={{ fontSize: 10, color: 'rgba(233,234,240,0.52)', margin: '2px 0 0' }}>{t('phoneAutoExtractDesc')}</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {extracting && (
                    <button className="sf-btn sf-btn-secondary sf-btn-sm" onClick={cancelExtract} style={{ cursor: 'pointer' }}>
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
                  background: 'rgba(0,0,0,0.35)', borderRadius: 0, padding: '8px 10px',
                  maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2,
                  border: '1px solid rgba(233,234,240,0.06)',
                }}>
                  {extractLogs.map((l, i) => (
                    <p key={i} style={{
                      fontSize: 10, fontFamily: 'monospace', margin: 0,
                      color: l.startsWith('✅') ? '#7FD9B8' : l.startsWith('❌') || l.startsWith('🛑') ? '#F0A0AB' : l.startsWith('⚠️') ? '#E5C07B' : 'rgba(233,234,240,0.52)',
                    }}>{l}</p>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
              {extractError && (
                <p style={{ fontSize: 11, color: '#F0A0AB', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M6 3.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <circle cx="6" cy="8.5" r="0.6" fill="currentColor"/>
                  </svg>
                  {extractError}
                </p>
              )}
            </div>
          )}

          <div style={{
            background: 'rgba(233,234,240,0.025)', border: '1px solid rgba(233,234,240,0.07)',
            borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: TEXT_1, margin: '0 0 4px' }}>{t('phoneManualInstructions')}</p>
            {[
              <>1. Open <span style={{ color: ACCENT }}>{t('phoneManualStep1Chrome')}</span> in Chrome</>,
              <>2. Press <span style={{ color: ACCENT }}>{t('phoneManualStep2DevTools')}</span> (DevTools)</>,
              <>3. Go to <span style={{ color: ACCENT }}>{t('phoneManualStep3Cookies')}</span></>,
              <>4. Find the <span style={{ color: ACCENT, fontFamily: 'monospace' }}>{t('phoneManualStep4Cookie')}</span> cookie and copy its value</>,
            ].map((step, i) => (
              <p key={i} style={{ fontSize: 11, color: 'rgba(233,234,240,0.52)', margin: 0 }}>{step}</p>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, color: TEXT_3, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{t('phoneSessionLabel')}</label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type="password"
                value={value}
                onChange={e => handleChange(e.target.value)}
                placeholder={t('phoneSessionPlaceholder')}
                className="sf-input"
                style={{
                  width: '100%', boxSizing: 'border-box', paddingRight: 36,
                  borderColor: testResult === 'ok' ? '#7FD9B8' : testResult === 'fail' ? '#F0A0AB' : undefined,
                  fontFamily: 'monospace',
                }}
              />
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, pointerEvents: 'none' }}>
                {testing ? (
                  <svg style={{ animation: 'spin 1s linear infinite' }} width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="10 20" strokeLinecap="round"/>
                  </svg>
                ) : testResult === 'ok' ? (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 7l3 3 6-6" stroke="#7FD9B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : testResult === 'fail' ? (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 2l9 9M11 2L2 11" stroke="#F0A0AB" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                ) : null}
              </span>
            </div>
            {testResult === 'ok' && detectedUser && (
              <p style={{ fontSize: 11, color: 'rgba(233,234,240,0.52)', margin: 0 }}>
                {t('phoneSessionTestOkUser')} <span style={{ color: ACCENT, fontWeight: 600 }}>@{detectedUser}</span>
                {phone.ig_username && phone.ig_username !== detectedUser && (
                  <span style={{ color: '#E5C07B', marginLeft: 4 }}>{t('phoneSessionDifferentUser')} @{phone.ig_username} {t('phoneSessionWillUpdate')}</span>
                )}
              </p>
            )}
            {testResult === 'fail' && <p style={{ fontSize: 11, color: '#F0A0AB', margin: 0 }}>{t('phoneSessionInvalid')}</p>}
            {testResult === 'idle' && value.trim().length > 10 && !testing && (
              <p style={{ fontSize: 11, color: 'rgba(233,234,240,0.52)', margin: 0 }}>{t('phoneSessionAutoTest')}</p>
            )}
            {saveError && (
              <p style={{ fontSize: 11, color: '#F0A0AB', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M6 3.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  <circle cx="6" cy="8.5" r="0.6" fill="currentColor"/>
                </svg>
                {saveError}
              </p>
            )}
          </div>
        </div>

        <div className="sf-modal-footer">
          <button onClick={onClose} disabled={busy} className="sf-btn sf-btn-ghost" style={{ cursor: 'pointer' }}>
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

// ── Context menu ──────────────────────────────────────────────────────────────
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
        padding: '7px 12px', fontSize: 13, textAlign: 'left', borderRadius: 0,
        background: 'none', border: 'none', cursor: 'pointer',
        color: danger ? '#F0A0AB' : TEXT_1, transition: 'background 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? 'rgba(240,160,171,0.10)' : 'rgba(233,234,240,0.06)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
    >
      <span style={{ width: 16, display: 'flex', justifyContent: 'center' }}>{icon}</span>
      <span>{label}</span>
    </button>
  )

  return (
    <div ref={menuRef} style={{
      position: 'fixed', zIndex: 50,
      background: '#0F1014', border: '1px solid rgba(233,234,240,0.09)',
      borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      padding: '4px 0', width: 208, left, top,
    }}>
      <div style={{ padding: '6px 12px 8px', borderBottom: '1px solid rgba(233,234,240,0.055)', marginBottom: 4 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: TEXT_1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phone.phone_name}</p>
        {phone.ig_username && <p style={{ fontSize: 10, color: ACCENT, margin: '1px 0 0' }}>@{phone.ig_username}</p>}
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
          <div style={{ borderTop: '1px solid rgba(233,234,240,0.055)', margin: '4px 0' }} />
          {item(
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2h3v1.5M4.5 3.5l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
            t('phoneCtxDelete'), onDelete, true
          )}
        </>
      )}
    </div>
  )
}

// ── Inline IG username edit ───────────────────────────────────────────────────
function IgCell({ phone, onSave }: { phone: Phone; onSave: (id: string, u: string) => Promise<void> }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(phone.ig_username ?? '')
  const [saving, setSaving]   = useState(false)
  const ref                   = useRef<HTMLInputElement>(null)
  const savedRef              = useRef(false)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setValue(phone.ig_username ?? '') }, [phone.ig_username])

  async function save() {
    if (savedRef.current) return
    savedRef.current = true
    setSaving(true)
    await onSave(phone.id, value.replace(/^@/, '').trim())
    setSaving(false)
    setEditing(false)
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  save()
    if (e.key === 'Escape') { savedRef.current = true; setValue(phone.ig_username ?? ''); setEditing(false) }
  }

  if (editing) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 13, color: 'rgba(99,102,241,0.72)' }}>@</span>
      <input
        ref={ref} value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={onKey} onBlur={save} disabled={saving}
        className="sf-input"
        style={{ width: 112, padding: '2px 6px', fontSize: 13, borderColor: ACCENT }}
      />
    </div>
  )

  return (
    <button
      onClick={() => { savedRef.current = false; setEditing(true) }}
      style={{ fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', minWidth: 0, padding: 0 }}
      title={t('phoneClickToEdit')}
    >
      {phone.ig_username ? (
        <span style={{ color: ACCENT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{phone.ig_username}</span>
      ) : (
        <span style={{ color: 'rgba(233,234,240,0.35)', fontStyle: 'normal' }}>{t('phoneIgCellAdd')}</span>
      )}
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
        <path d="M7.5 1.5l2 2-6 6H1.5v-2l6-6z" stroke="rgba(233,234,240,0.52)" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

// ── Detail panel : Lien OnlyFans / sticker ────────────────────────────────────
function PanelLinkField({ phone, onSave }: { phone: Phone; onSave: (id: string, link: string) => Promise<void> }) {
  // DB d'abord, sinon valeur héritée de l'onglet Story (localStorage)
  const initial = phone.link ?? localStorage.getItem(`sf-story-link-${phone.id}`) ?? ''
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const dirty = (value.trim()) !== initial.trim()

  // Resync when switching to another phone
  useEffect(() => {
    setValue(phone.link ?? localStorage.getItem(`sf-story-link-${phone.id}`) ?? '')
    setSaved(false)
  }, [phone.id, phone.link])

  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    await onSave(phone.id, value)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(233,234,240,0.055)' }}>
      <p style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_3, margin: '0 0 10px' }}>
        Lien OnlyFans
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="url"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          onBlur={save}
          placeholder="https://onlyfans.com/…"
          className="sf-input"
          style={{ flex: 1, minWidth: 0, padding: '7px 10px', fontSize: 12 }}
        />
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="sf-btn sf-btn-ghost sf-btn-sm"
          style={{
            flexShrink: 0, cursor: dirty && !saving ? 'pointer' : 'default',
            opacity: dirty || saved ? 1 : 0.4,
            color: saved ? 'var(--ok)' : ACCENT,
          }}
        >
          {saving ? '…' : saved ? '✓' : '↵'}
        </button>
      </div>
      <p style={{ fontSize: 10, color: 'rgba(233,234,240,0.35)', margin: '7px 0 0' }}>
        Utilisé par les Stories et les tâches automatiques.
      </p>
    </div>
  )
}

// ── Inline note edit ──────────────────────────────────────────────────────────
function NoteCell({ phone, onSave }: { phone: Phone; onSave: (id: string, v: string) => Promise<void> }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(phone.remark ?? '')
  const [saving, setSaving]   = useState(false)
  const ref                   = useRef<HTMLInputElement>(null)
  const savedRef              = useRef(false)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setValue(phone.remark ?? '') }, [phone.remark])

  async function save() {
    if (savedRef.current) return
    savedRef.current = true
    setSaving(true)
    await onSave(phone.id, value)
    setSaving(false)
    setEditing(false)
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  save()
    if (e.key === 'Escape') { savedRef.current = true; setValue(phone.remark ?? ''); setEditing(false) }
  }

  if (editing) return (
    <input
      ref={ref} value={value} onChange={e => setValue(e.target.value)}
      onKeyDown={onKey} onBlur={save} disabled={saving}
      className="sf-input"
      style={{ width: '100%', padding: '2px 6px', fontSize: 13, borderColor: ACCENT }}
      placeholder={t('phoneNoteCellPlaceholder')}
    />
  )

  return (
    <button
      onClick={() => { savedRef.current = false; setEditing(true) }}
      style={{ fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', minWidth: 0, width: '100%', padding: 0 }}
      title={t('phoneClickToEdit')}
    >
      {phone.remark ? (
        <span style={{ color: 'rgba(99,102,241,0.72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phone.remark}</span>
      ) : (
        <span style={{ color: 'rgba(233,234,240,0.25)', fontStyle: 'normal' }}>{t('phoneNoteCellAdd')}</span>
      )}
    </button>
  )
}

// ── Link cell (OnlyFans / story link) ────────────────────────────────────────
function LinkCell({ phone, onSave }: { phone: Phone; onSave: (id: string, v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(phone.link ?? '')
  const [saving, setSaving]   = useState(false)
  const ref                   = useRef<HTMLInputElement>(null)
  const savedRef              = useRef(false)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setValue(phone.link ?? '') }, [phone.link])

  async function save() {
    if (savedRef.current) return
    savedRef.current = true
    setSaving(true)
    await onSave(phone.id, value)
    setSaving(false)
    setEditing(false)
    savedRef.current = false
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  save()
    if (e.key === 'Escape') { savedRef.current = true; setValue(phone.link ?? ''); setEditing(false); savedRef.current = false }
  }

  if (editing) return (
    <input
      ref={ref} value={value} onChange={e => setValue(e.target.value)}
      onKeyDown={onKey} onBlur={save} disabled={saving}
      className="sf-input"
      placeholder="https://onlyfans.com/…"
      style={{ width: '100%', padding: '2px 6px', fontSize: 12, borderColor: ACCENT }}
    />
  )
  return (
    <button
      onClick={() => { savedRef.current = false; setEditing(true) }}
      style={{
        width: '100%', textAlign: 'left', background: 'none', border: 'none',
        cursor: 'pointer', padding: '2px 4px', borderRadius: 5, fontFamily: SANS, fontStyle: 'italic',
      }}
    >
      {phone.link ? (
        <span style={{ fontSize: 11, color: '#22d3ee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 200 }}>
          {phone.link}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.25)', fontStyle: 'normal' }}>— Ajouter un lien</span>
      )}
    </button>
  )
}

// ── Phone card row ────────────────────────────────────────────────────────────
const PhoneRow = memo(function PhoneRow({
  phone, isSelected, checked, col, canDelete, index,
  setSelectedPhone, setContextMenu, setSessionDialog,
  saveIgUsername, saveRemark, saveLink, requestDelete, toggleSelect,
}: {
  phone: Phone; isSelected: boolean; checked: boolean; col: string; index: number
  canDelete: boolean
  setSelectedPhone: (p: Phone | null) => void
  setContextMenu: (v: { phone: Phone; x: number; y: number } | null) => void
  setSessionDialog: (v: { phone: Phone } | null) => void
  saveIgUsername: (id: string, u: string) => Promise<void>
  saveRemark: (id: string, v: string) => Promise<void>
  saveLink: (id: string, v: string) => Promise<void>
  requestDelete: (p: Phone) => void
  toggleSelect: (id: string) => void
}) {
  const t = useT()
  const online  = phone.status === 'online'
  const warming = phone.status === 'warming'
  const dotColor = online ? 'var(--ok)' : warming ? 'var(--warn)' : 'rgba(233,234,240,0.22)'

  const TH: React.CSSProperties = {
    fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: TEXT_3,
    background: 'transparent', borderBottom: `1px solid ${HAIR}`,
  }

  const cellStyle: React.CSSProperties = {
    padding: '10px 12px',
    background: isSelected ? 'rgba(99,102,241,0.07)' : 'transparent',
    transition: 'background 0.12s',
  }

  return (
    <tr
      onClick={() => setSelectedPhone(isSelected ? null : phone)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}
      style={{ cursor: 'pointer' }}
    >
      {/* Checkbox */}
      <td
        style={{
          ...cellStyle, width: 36, textAlign: 'center',
          boxShadow: isSelected ? 'inset 3px 0 0 rgba(99,102,241,0.75)' : 'none',
        }}
        onClick={e => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleSelect(phone.id)}
          style={{ cursor: 'pointer', accentColor: ACCENT, width: 14, height: 14 }}
        />
      </td>

      {/* Status dot */}
      <td style={{ ...cellStyle, width: 44, textAlign: 'center' }}>
        <span style={{
          display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
          background: dotColor,
          boxShadow: online ? '0 0 0 3px rgba(52,211,153,0.2)' : warming ? '0 0 0 3px rgba(251,191,36,0.2)' : 'none',
          flexShrink: 0,
        }} />
      </td>

      {/* Phone name + serial */}
      <td style={cellStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${col}14`, border: `1px solid ${col}30`, color: col,
            fontSize: 12, fontWeight: 700,
          }}>
            {phone.phone_name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {phone.phone_name}
            </p>
            {phone.serial_no && (
              <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(233,234,240,0.3)', margin: '1px 0 0' }}>
                {phone.serial_no}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Group */}
      <td style={cellStyle}>
        {phone.group_name
          ? <span style={{
              display: 'inline-block', fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
              background: 'rgba(99,102,241,0.1)', color: ACCENT,
              border: '1px solid rgba(99,102,241,0.18)', whiteSpace: 'nowrap',
            }}>{phone.group_name}</span>
          : <span style={{ color: 'rgba(233,234,240,0.2)' }}>—</span>
        }
      </td>

      {/* Lien OnlyFans / Story */}
      <td style={cellStyle} onClick={e => e.stopPropagation()}>
        <LinkCell phone={phone} onSave={saveLink} />
      </td>

      {/* Note */}
      <td style={cellStyle} onClick={e => e.stopPropagation()}>
        <NoteCell phone={phone} onSave={saveRemark} />
      </td>

      {/* Actions */}
      <td style={{ ...cellStyle, padding: '10px 10px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
          <button
            onClick={() => setSessionDialog({ phone })}
            title={t('phonesRowSessionId')}
            className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm"
            style={{ cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="5" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm"
            title="More"
            style={{ cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="2" cy="6" r="1" fill="currentColor"/>
              <circle cx="6" cy="6" r="1" fill="currentColor"/>
              <circle cx="10" cy="6" r="1" fill="currentColor"/>
            </svg>
          </button>
          {canDelete && (
            <button
              onClick={() => requestDelete(phone)}
              title={t('phonesRowDelete')}
              className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm"
              style={{ cursor: 'pointer', color: 'var(--err)' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 3h8M4.5 3V2h3v1M4 3l.4 7h3.2L8 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
})

// ── Phone card (grid view) ────────────────────────────────────────────────────
const PhoneCard = memo(function PhoneCard({
  phone, isSelected, checked, col, canDelete,
  setSelectedPhone, setContextMenu, setSessionDialog, requestDelete, toggleSelect, saveLink,
}: {
  phone: Phone; isSelected: boolean; checked: boolean; col: string; canDelete: boolean
  setSelectedPhone: (p: Phone | null) => void
  setContextMenu: (v: { phone: Phone; x: number; y: number } | null) => void
  setSessionDialog: (v: { phone: Phone } | null) => void
  requestDelete: (p: Phone) => void
  toggleSelect: (id: string) => void
  saveLink: (id: string, v: string) => Promise<void>
}) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const online  = phone.status === 'online'
  const warming = phone.status === 'warming'
  const dotColor = online ? 'var(--ok)' : warming ? 'var(--warn)' : 'rgba(233,234,240,0.28)'
  const fmt = (n?: number) => !n ? '0' : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)

  return (
    <div
      onClick={() => setSelectedPhone(isSelected ? null : phone)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', borderRadius: 16, padding: 16, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 14,
        background: isSelected ? 'rgba(99,102,241,0.08)' : hover ? 'rgba(233,234,240,0.035)' : 'rgba(233,234,240,0.02)',
        border: `1px solid ${isSelected ? 'rgba(99,102,241,0.45)' : hover ? 'rgba(99,102,241,0.2)' : HAIR}`,
        boxShadow: isSelected ? '0 8px 28px -10px rgba(99,102,241,0.5)' : hover ? '0 10px 30px -14px rgba(0,0,0,0.6)' : 'none',
        transform: hover && !isSelected ? 'translateY(-2px)' : 'none',
        transition: 'all 0.18s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {/* Top accent line */}
      <span style={{
        position: 'absolute', top: 0, left: 16, right: 16, height: 2, borderRadius: 2,
        background: `linear-gradient(90deg, ${col}, transparent)`,
        opacity: isSelected || hover ? 0.9 : 0.35, transition: 'opacity 0.18s',
      }} />

      {/* Header: checkbox + status badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <input
          type="checkbox" checked={checked}
          onClick={e => e.stopPropagation()}
          onChange={() => toggleSelect(phone.id)}
          style={{ cursor: 'pointer', accentColor: ACCENT, width: 15, height: 15 }}
        />
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 9px', borderRadius: 99, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          background: online ? 'rgba(52,211,153,0.12)' : warming ? 'rgba(251,191,36,0.12)' : 'rgba(233,234,240,0.05)',
          color: online ? 'var(--ok)' : warming ? 'var(--warn)' : 'rgba(233,234,240,0.45)',
          border: `1px solid ${online ? 'rgba(52,211,153,0.25)' : warming ? 'rgba(251,191,36,0.25)' : 'rgba(233,234,240,0.08)'}`,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: dotColor,
            boxShadow: online ? '0 0 0 3px rgba(52,211,153,0.2)' : warming ? '0 0 0 3px rgba(251,191,36,0.2)' : 'none',
            animation: online ? 'sf-ping 2s ease infinite' : 'none',
          }} />
          {online ? t('online') : warming ? 'warming' : t('offline')}
        </span>
      </div>

      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, ${col}26, ${col}10)`,
          border: `1px solid ${col}40`, color: col, fontSize: 18, fontWeight: 700,
        }}>
          {phone.phone_name.charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: TEXT_1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {phone.phone_name}
          </p>
          {phone.serial_no && (
            <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(233,234,240,0.3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {phone.serial_no}
            </p>
          )}
        </div>
      </div>

      {/* Group badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 22 }}>
        {phone.group_name ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 9px',
            borderRadius: 99, fontWeight: 600, background: 'rgba(99,102,241,0.1)', color: ACCENT,
            border: '1px solid rgba(99,102,241,0.18)', whiteSpace: 'nowrap', maxWidth: '100%',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M1.5 3.5h3l1 1.5h5v4.5a1 1 0 0 1-1 1H1.5a1 1 0 0 1-1-1V3.5z" stroke="currentColor" strokeWidth="1.1"/>
            </svg>
            {phone.group_name}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.25)' }}>{t('phonesDetailGroup')} —</span>
        )}
      </div>

      {/* Lien OnlyFans / story */}
      <div style={{
        borderRadius: 11, padding: '10px 12px',
        background: phone.link ? 'rgba(34,211,238,0.05)' : 'rgba(233,234,240,0.02)',
        border: `1px solid ${phone.link ? 'rgba(34,211,238,0.2)' : HAIR}`,
      }} onClick={e => e.stopPropagation()}>
        <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(233,234,240,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
          Lien OnlyFans
        </p>
        <LinkCell phone={phone} onSave={saveLink} />
      </div>

      {/* Footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setSessionDialog({ phone })}
          className="sf-btn sf-btn-ghost sf-btn-sm"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer' }}
          title={t('phonesRowSessionId')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="5" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          {t('phoneSession')}
        </button>
        <button
          className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm"
          style={{ cursor: 'pointer' }} title="More"
          onClick={e => { e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="2" cy="6.5" r="1" fill="currentColor"/><circle cx="6.5" cy="6.5" r="1" fill="currentColor"/><circle cx="11" cy="6.5" r="1" fill="currentColor"/></svg>
        </button>
        {canDelete && (
          <button
            onClick={() => requestDelete(phone)}
            className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm"
            style={{ cursor: 'pointer', color: 'var(--err)' }} title={t('phonesRowDelete')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M4.5 3V2h3v1M4 3l.4 7h3.2L8 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>
    </div>
  )
})

// ────────────────────────────────────────────────────────────────────────────

export function Phones({ user }: PhonesProps) {
  const t = useT()
  const { lang } = useLang()
  const toast = useToast()
  const { currentOrg, role, perms } = useOrg()
  const conns = useConnections(user)
  const license = useLicense()

  const [phones, setPhones]           = useState<Phone[]>([])
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [filter, setFilter]           = useState<'all' | 'online' | 'offline'>('all')
  const [search, setSearch]           = useState('')
  const [intervalSec, setIntervalSec] = useState(poller.getIntervalSec)
  const [autoRefresh, setAutoRefresh] = useState(poller.getEnabled)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [pollError, setPollError]     = useState<string | null>(null)

  const [contextMenu, setContextMenu]     = useState<{ phone: Phone; x: number; y: number } | null>(null)
  const [sessionDialog, setSessionDialog] = useState<{ phone: Phone } | null>(null)
  const [selectedPhone, setSelectedPhone] = useState<Phone | null>(null)
  const [groupFilter, setGroupFilter]     = useState<string>('all')

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() =>
    (localStorage.getItem('sf-phones-view') as 'table' | 'grid') || 'table')

  const changeViewMode = (m: 'table' | 'grid') => { setViewMode(m); localStorage.setItem('sf-phones-view', m) }

  const [confirmDelete, setConfirmDelete]     = useState<Phone | null>(null)
  const [deleteBusy, setDeleteBusy]           = useState(false)
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkBusy, setBulkBusy]               = useState(false)

  const fr = useCallback((frs: string, en: string) => (lang === 'fr' ? frs : en), [lang])
  const bearer = conns.bearer

  const phonesRef     = useRef<Phone[]>([])
  const lastDbSyncRef = useRef<Date | null>(null)

  useEffect(() => { phonesRef.current = phones }, [phones])

  useEffect(() => {
    return poller.subscribe(statusMap => {
      const now = new Date()
      setLastUpdated(now)
      setPhones(prev => {
        const next = prev.map(p => {
          const s = statusMap.get(p.geelark_id)
          return s !== undefined ? { ...p, status: s } : p
        })
        phonesRef.current = next
        return next
      })
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

  const loadPhones = useCallback(async () => {
    setError(null)
    if (!bearer) { setPhones([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data, error: err } = await q
    if (err) setError('Error loading phones.')
    else setPhones(data ?? [])
    setLoading(false)
    poller.pollNow()
  }, [bearer, currentOrg, user.id])

  useEffect(() => {
    if (conns.loading) return
    loadPhones()
  }, [conns.loading, loadPhones])

  function changeInterval(sec: number) {
    setIntervalSec(sec)
    poller.setIntervalSec(sec)
  }

  const phoneLimit = PLAN_MAX_PHONES[effectivePlan(license) ?? ''] ?? Infinity

  const syncFromGeelark = useCallback(async () => {
    if (!bearer) { setError(t('phoneMissingToken')); return }
    setSyncing(true); setError(null)
    try {
      let items = await fetchAllPhones(bearer)
      if (items.length === 0) { setError(t('noPhones')); setSyncing(false); return }
      if (items.length > phoneLimit) {
        toast.show({
          kind: 'warn',
          title: fr('Limite du plan atteinte', 'Plan limit reached'),
          body: fr(
            `${items.length} téléphones trouvés — seuls les ${phoneLimit} premiers ont été importés (plan ${effectivePlan(license) ?? 'standard'}).`,
            `${items.length} phones found — only the first ${phoneLimit} were imported (${effectivePlan(license) ?? 'standard'} plan).`,
          ),
          duration: 7000,
        })
        items = items.slice(0, phoneLimit)
      }

      const rows = items.map(p => ({
        user_id:    user.id,
        org_id:     currentOrg?.id ?? null,
        geelark_id: p.id,
        serial_no:  p.serialNo ?? null,
        phone_name: p.serialName ?? p.name ?? p.serialNo ?? p.id ?? 'Phone inconnu',
        group_name: p.group?.name ?? p.groupName ?? null,
        status:     geelarkStatusLabel(p.status),
        remark:     p.remark ?? null,
        synced_at:  new Date().toISOString(),
      }))
      const currentGeelarkIds = new Set(rows.map(r => r.geelark_id))

      if (currentOrg) {
        const { data: orgPhones } = await supabase.from('phones').select('id,geelark_id').eq('org_id', currentOrg.id)
        const toDelete = (orgPhones ?? []).filter((p: { geelark_id: string }) => !currentGeelarkIds.has(p.geelark_id))
        if (toDelete.length > 0) {
          await supabase.from('phones').delete().in('id', toDelete.map((p: { id: string }) => p.id))
        }
        const { error } = await supabase.rpc('sync_geelark_phones', { p_rows: rows, p_org_id: currentOrg.id })
        if (error) throw new Error(error.message)
      } else {
        await supabase.from('phones')
          .delete().eq('user_id', user.id).is('org_id', null)
          .not('geelark_id', 'in', `(${[...currentGeelarkIds].join(',')})`)
        const { error: upsertErr } = await supabase.rpc('sync_geelark_phones', { p_rows: rows, p_org_id: null })
        if (upsertErr) throw new Error(upsertErr.message)
      }
      lastDbSyncRef.current = new Date()
      await loadPhones()
      setLastUpdated(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync error.')
    }
    setSyncing(false)
  }, [bearer, user.id, currentOrg, phoneLimit, license, t, toast, fr, loadPhones])

  const saveIgUsername = useCallback(async (id: string, username: string) => {
    const clean = username.replace(/^@+/, '').trim() || null
    const { error: err } = await supabase.from('phones').update({ ig_username: clean }).eq('id', id)
    if (err) {
      toast.show({ kind: 'error', title: fr(`Échec de l'enregistrement Instagram`, 'Failed to save Instagram username'), body: err.message })
      return
    }
    setPhones(prev => prev.map(p => p.id === id ? { ...p, ig_username: clean } : p))
  }, [toast, fr])

  const saveRemark = useCallback(async (id: string, remark: string) => {
    const val = remark.trim() || null
    setPhones(prev => prev.map(p => p.id === id ? { ...p, remark: val } : p))
    const { error: err } = await supabase.from('phones').update({ remark: val }).eq('id', id)
    if (err) {
      toast.show({ kind: 'error', title: fr(`Échec de l'enregistrement de la note`, 'Failed to save note'), body: err.message })
    }
  }, [toast, fr])

  // Lien OnlyFans / sticker — source de vérité utilisée par Story & Tâches auto.
  const saveLink = useCallback(async (id: string, link: string) => {
    const val = link.trim() || null
    setPhones(prev => prev.map(p => p.id === id ? { ...p, link: val } : p))
    setSelectedPhone(prev => (prev && prev.id === id ? { ...prev, link: val } : prev))
    // Garde le localStorage de l'onglet Story synchronisé
    if (val) localStorage.setItem(`sf-story-link-${id}`, val)
    else localStorage.removeItem(`sf-story-link-${id}`)
    const { error: err } = await supabase.from('phones').update({ link: val }).eq('id', id)
    // Colonne absente (migration 20260622c non appliquée) → on garde le localStorage,
    // sans alarmer l'utilisateur : Story/Tâches retombent dessus.
    if (err && !(/link/i.test(err.message) && /column|schema|cache/i.test(err.message))) {
      toast.show({ kind: 'error', title: fr('Échec de l\'enregistrement du lien', 'Failed to save link'), body: err.message })
    }
  }, [toast, fr])

  const unlinkIg = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('phones').update({ ig_username: null, ig_sessionid: null, ig_status: null }).eq('id', id)
    if (err) {
      toast.show({ kind: 'error', title: fr('Échec du déliage Instagram', 'Failed to unlink Instagram'), body: err.message })
      return
    }
    setPhones(prev => prev.map(p => p.id === id ? { ...p, ig_username: null, ig_sessionid: null, ig_status: null } : p))
  }, [toast, fr])

  const canDelete = !currentOrg || role === 'owner' || role === 'admin'

  const requestDelete = useCallback((phone: Phone) => { setConfirmDelete(phone) }, [])

  async function doDeletePhone() {
    if (!confirmDelete || !canDelete) return
    setDeleteBusy(true)
    const { error: err } = await supabase.from('phones').delete().eq('id', confirmDelete.id)
    if (err) {
      toast.show({ kind: 'error', title: fr('Échec de la suppression', 'Failed to delete phone'), body: err.message })
    } else {
      const id = confirmDelete.id
      setPhones(prev => prev.filter(p => p.id !== id))
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
      setSelectedPhone(prev => (prev?.id === id ? null : prev))
    }
    setDeleteBusy(false)
    setConfirmDelete(null)
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  async function bulkDelete() {
    if (!canDelete || selectedIds.size === 0) return
    setBulkBusy(true)
    const ids = [...selectedIds]
    const { error: err } = await supabase.from('phones').delete().in('id', ids)
    if (err) {
      toast.show({ kind: 'error', title: fr('Échec de la suppression', 'Failed to delete phones'), body: err.message })
    } else {
      setPhones(prev => prev.filter(p => !selectedIds.has(p.id)))
      setSelectedPhone(prev => (prev && selectedIds.has(prev.id) ? null : prev))
      setSelectedIds(new Set())
      toast.show({ kind: 'ok', title: fr(`${ids.length} téléphone(s) supprimé(s)`, `${ids.length} phone(s) deleted`) })
    }
    setBulkBusy(false)
    setConfirmBulkDelete(false)
  }

  async function bulkUnlinkIg() {
    if (selectedIds.size === 0) return
    setBulkBusy(true)
    const ids = [...selectedIds]
    const { error: err } = await supabase
      .from('phones').update({ ig_username: null, ig_sessionid: null, ig_status: null }).in('id', ids)
    if (err) {
      toast.show({ kind: 'error', title: fr('Échec du déliage Instagram', 'Failed to unlink Instagram'), body: err.message })
    } else {
      setPhones(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, ig_username: null, ig_sessionid: null, ig_status: null } : p))
      toast.show({ kind: 'ok', title: fr(`Instagram délié sur ${ids.length} téléphone(s)`, `Instagram unlinked on ${ids.length} phone(s)`) })
      setSelectedIds(new Set())
    }
    setBulkBusy(false)
  }

  async function stopSelectedPhones() {
    if (!bearer || selectedIds.size === 0) return
    setBulkBusy(true)
    // Map selected row ids → GéeLark phone ids
    const geelarkIds = phones
      .filter(p => selectedIds.has(p.id) && p.geelark_id)
      .map(p => p.geelark_id as string)
    try {
      const n = await stopPhones(bearer, geelarkIds)
      toast.show({ kind: 'ok', title: fr(`${n || geelarkIds.length} téléphone(s) éteint(s)`, `${n || geelarkIds.length} phone(s) stopped`) })
      setSelectedIds(new Set())
      poller.pollNow()
    } catch (e) {
      toast.show({ kind: 'error', title: fr('Échec de l\'extinction', 'Failed to stop phones'), body: e instanceof Error ? e.message : String(e) })
    }
    setBulkBusy(false)
  }

  async function stopAllOnlinePhones() {
    if (!bearer) return
    const onlineIds = phones
      .filter(p => (p.status === 'online' || p.status === 'warming') && p.geelark_id)
      .map(p => p.geelark_id as string)
    if (onlineIds.length === 0) {
      toast.show({ kind: 'info', title: fr('Aucun téléphone allumé', 'No phones running') })
      return
    }
    setBulkBusy(true)
    try {
      const n = await stopPhones(bearer, onlineIds)
      toast.show({ kind: 'ok', title: fr(`${n || onlineIds.length} téléphone(s) éteint(s)`, `${n || onlineIds.length} phone(s) stopped`) })
      poller.pollNow()
    } catch (e) {
      toast.show({ kind: 'error', title: fr('Échec de l\'extinction', 'Failed to stop phones'), body: e instanceof Error ? e.message : String(e) })
    }
    setBulkBusy(false)
  }

  async function bulkChangeGroup(group: string) {
    if (selectedIds.size === 0) return
    setBulkBusy(true)
    const ids = [...selectedIds]
    const { error: err } = await supabase.from('phones').update({ group_name: group }).in('id', ids)
    if (err) {
      toast.show({ kind: 'error', title: fr('Échec du changement de groupe', 'Failed to change group'), body: err.message })
    } else {
      setPhones(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, group_name: group } : p))
      toast.show({ kind: 'ok', title: fr(`${ids.length} téléphone(s) déplacé(s) vers « ${group} »`, `${ids.length} phone(s) moved to "${group}"`) })
      setSelectedIds(new Set())
    }
    setBulkBusy(false)
  }

  async function onSessionSaved(id: string, sessionid: string, detectedUsername?: string) {
    const updates: Partial<Phone> = { ig_sessionid: sessionid || null }
    if (detectedUsername) {
      updates.ig_username = detectedUsername
      await supabase.from('phones').update({ ig_username: detectedUsername }).eq('id', id)
    }
    setPhones(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))

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
            video_count:  r.posts       ?? 0,
            bio:          r.bio         ?? '',
            ig_status:    'active',
          }
          await supabase.from('phones').update(statUpdates).eq('id', id)
          setPhones(prev => prev.map(p => p.id === id ? { ...p, ...statUpdates } : p))
        }
      } catch { /* silent */ }
    }
  }

  useEffect(() => {
    if (!selectedPhone) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (sessionDialog || contextMenu || confirmDelete || confirmBulkDelete) return
      setSelectedPhone(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPhone, sessionDialog, contextMenu, confirmDelete, confirmBulkDelete])

  // ── Filtering + sorting ────────────────────────────────────────────────────
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

  const sortedVisible = sortKey
    ? [...visible].sort((a, b) => {
        let cmp = 0
        if (sortKey === 'name')        cmp = a.phone_name.localeCompare(b.phone_name)
        else if (sortKey === 'status') cmp = (a.status ?? '').localeCompare(b.status ?? '')
        else                           cmp = (a.group_name ?? '').localeCompare(b.group_name ?? '')
        return sortDir === 'asc' ? cmp : -cmp
      })
    : visible

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const allVisibleSelected = sortedVisible.length > 0 && sortedVisible.every(p => selectedIds.has(p.id))
  function toggleSelectAll() {
    if (allVisibleSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(sortedVisible.map(p => p.id)))
  }

  const onlineCount  = phones.filter(p => p.status === 'online').length
  const offlineCount = phones.filter(p => p.status === 'offline').length
  const groups       = Array.from(new Set(phones.map(p => p.group_name).filter(Boolean))) as string[]

  function relativeTime(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    const isFr = lang === 'fr'
    if (diff < 60)        return isFr ? `à l'instant` : '< 1 min ago'
    if (diff < 3600)      { const m = Math.floor(diff / 60);    return isFr ? `il y a ${m} min` : `${m} min ago` }
    if (diff < 86400)     { const h = Math.floor(diff / 3600);  return isFr ? `il y a ${h} h`   : `${h}h ago` }
    if (diff < 86400 * 7) { const d = Math.floor(diff / 86400); return isFr ? `il y a ${d} j`   : `${d}d ago` }
    return new Date(iso).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })
  }

  function phoneColor(name: string): string {
    const palette = [ACCENT,'#9DB8D9','#7FD9B8','#E5C07B','#F0A0AB','#A9C9C0','#D9C49D','#8FA9C9']
    let h = 0
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
    return palette[Math.abs(h) % palette.length]
  }

  function exportCsv() {
    const header = lang === 'fr'
      ? ['Nom', 'Instagram', 'Followers', 'Statut', 'Groupe']
      : ['Name', 'Instagram', 'Followers', 'Status', 'Group']
    const rows = [
      header,
      ...sortedVisible.map(p => [
        p.phone_name, p.ig_username ? `@${p.ig_username}` : '',
        String(p.followers ?? 0), p.status ?? '', p.group_name ?? '',
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `phones-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.show({ kind: 'ok', title: fr(`Export CSV — ${sortedVisible.length} ligne(s)`, `CSV export — ${sortedVisible.length} row(s)`) })
  }

  // Sortable TH helper
  const TH_BASE: React.CSSProperties = {
    fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: TEXT_3,
    background: 'transparent', borderBottom: `1px solid ${HAIR}`,
  }
  const sortTh = (label: React.ReactNode, key: SortKey, style?: React.CSSProperties, title?: string) => (
    <th
      style={{ ...TH_BASE, ...style, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => toggleSort(key)}
      title={title ?? fr('Cliquer pour trier', 'Click to sort')}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ opacity: sortKey === key ? 1 : 0.28, flexShrink: 0 }}>
          {sortDir === 'asc' || sortKey !== key
            ? <path d="M4 1.5L6.5 5.5H1.5L4 1.5Z" fill="currentColor"/>
            : <path d="M4 6.5L1.5 2.5H6.5L4 6.5Z" fill="currentColor"/>
          }
        </svg>
      </span>
    </th>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {sessionDialog && (
        <SessionDialog
          phone={sessionDialog.phone} bearer={bearer}
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
          onDelete={() => requestDelete(contextMenu.phone)}
          canDelete={canDelete}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={t('phoneDeleteConfirm')}
        message={confirmDelete ? fr(
          `« ${confirmDelete.phone_name} » sera définitivement supprimé.`,
          `"${confirmDelete.phone_name}" will be permanently deleted.`,
        ) : undefined}
        confirmLabel={fr('Supprimer', 'Delete')}
        cancelLabel={t('cancel')}
        danger busy={deleteBusy}
        onConfirm={doDeletePhone}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title={fr(`Supprimer ${selectedIds.size} téléphone(s) ?`, `Delete ${selectedIds.size} phone(s)?`)}
        message={fr(
          'Ces téléphones seront définitivement supprimés de la liste.',
          'These phones will be permanently removed from the list.',
        )}
        confirmLabel={fr('Supprimer', 'Delete')}
        cancelLabel={t('cancel')}
        danger busy={bulkBusy}
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      <div className="sf-page anim-page" onClick={() => setContextMenu(null)}>

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="sf-page-header">
          {/* Left: icon + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <div className="sf-anim-scale-spring" style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', color: ACCENT,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="2" width="12" height="20" rx="3"/>
                <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </div>
            <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
              <h1 className="sf-page-title">{t('phonesHeading')}</h1>
              <p className="sf-page-sub">{t('phonesSubtitle')}</p>
            </div>
          </div>

          {/* Right: auto-refresh + sync */}
          <div className="sf-anim-slide-up sf-d100" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>

            {/* Auto-refresh toggle pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', borderRadius: 8,
              background: 'rgba(233,234,240,0.02)', border: `1px solid ${HAIR}`,
            }}>
              <button
                onClick={() => { const next = !autoRefresh; poller.setEnabled(next); setAutoRefresh(next) }}
                style={{
                  position: 'relative', width: 28, height: 15, borderRadius: 99,
                  background: autoRefresh ? 'var(--ok)' : 'rgba(233,234,240,0.2)',
                  border: 'none', cursor: 'pointer', padding: 0, transition: 'background 0.2s', flexShrink: 0,
                }}
                aria-label={fr(`Activer/désactiver l'actualisation automatique`, 'Toggle auto-refresh')}
              >
                <span style={{
                  position: 'absolute', top: 2.5, width: 10, height: 10,
                  background: 'var(--ivory)', borderRadius: 99, boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  transition: 'left 0.2s', left: autoRefresh ? 15 : 2.5,
                }} />
              </button>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(233,234,240,0.52)', whiteSpace: 'nowrap' }}>{t('phonesAutoLabel')}</span>
              {autoRefresh && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '2px 3px' }}>
                  {INTERVALS.map(({ label, value }) => (
                    <button key={value} onClick={() => changeInterval(value)}
                      style={{
                        padding: '3px 7px', borderRadius: 5, fontSize: 10, border: 'none', cursor: 'pointer',
                        background: intervalSec === value ? 'var(--ivory)' : 'transparent',
                        color: intervalSec === value ? '#0F1014' : 'rgba(233,234,240,0.52)',
                        fontWeight: intervalSec === value ? 700 : 400,
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}>{label}</button>
                  ))}
                </div>
              )}
              <CountdownTicker enabled={autoRefresh && !!bearer} />
            </div>

            {/* Stop all running phones — safety against runaway billing */}
            {onlineCount > 0 && (
              <button
                onClick={stopAllOnlinePhones} disabled={!bearer || bulkBusy}
                className="sf-btn sf-btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: (!bearer || bulkBusy) ? 'not-allowed' : 'pointer', opacity: (!bearer || bulkBusy) ? 0.5 : 1, borderColor: 'rgba(248,113,113,0.4)', color: '#f87171' }}
                title={fr('Éteindre tous les téléphones allumés', 'Power off all running phones')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
                </svg>
                {fr(`Éteindre tout (${onlineCount})`, `Stop all (${onlineCount})`)}
              </button>
            )}

            {/* Sync button */}
            <button
              onClick={syncFromGeelark} disabled={!bearer || syncing}
              className="sf-btn sf-btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: (!bearer || syncing) ? 'not-allowed' : 'pointer', opacity: (!bearer || syncing) ? 0.5 : 1 }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0, animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                <path d="M13 7.5A5.5 5.5 0 1 1 10 2.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M9.5 1.5l2 1.5L9.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {syncing ? t('phonesSyncing') : t('phonesSyncGeelark')}
            </button>

            {/* Plan limit badge */}
            {phoneLimit !== Infinity && (
              <span className={phones.length >= phoneLimit ? 'sf-badge sf-badge-red' : 'sf-badge sf-badge-violet'}>
                {phones.length} / {phoneLimit}
              </span>
            )}
          </div>
        </div>

        {/* ── Page body ───────────────────────────────────────────────────── */}
        <div className="sf-page-body">

          {/* ── Stats chips ──────────────────────────────────────────────── */}
          {!loading && phones.length > 0 && (() => {
            const onlinePct  = phones.length ? Math.round((onlineCount / phones.length) * 100) : 0
            const withSession = phones.filter(p => p.ig_sessionid).length
            const statChips = [
              {
                label: t('phoneSummaryTotal'), value: phones.length,
                icon: (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <rect x="3.5" y="0.5" width="7" height="13" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                    <circle cx="7" cy="11" r="0.7" fill="currentColor"/>
                  </svg>
                ),
                color: ACCENT, sub: undefined as string | undefined,
              },
              {
                label: t('phoneSummaryOnline'), value: onlineCount, sub: `${onlinePct}%`,
                icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />,
                color: 'var(--ok)',
              },
              {
                label: t('phoneSummaryOffline'), value: offlineCount,
                icon: <span style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid rgba(233,234,240,0.4)', display: 'inline-block' }} />,
                color: 'rgba(233,234,240,0.5)', sub: undefined as string | undefined,
              },
              ...(withSession > 0 ? [{
                label: t('phoneSession'), value: withSession,
                icon: (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <rect x="1.5" y="5.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M4.5 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                ),
                color: ACCENT, sub: undefined as string | undefined,
              }] : []),
            ]
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                <div className="anim-stagger" style={{ display: 'contents' }}>
                  {statChips.map(chip => (
                    <div key={chip.label} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '6px 12px', borderRadius: 8,
                      background: 'rgba(233,234,240,0.04)', border: '1px solid rgba(233,234,240,0.08)',
                    }}>
                      <span style={{ color: chip.color, display: 'flex', alignItems: 'center' }}>{chip.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_1, fontVariantNumeric: 'tabular-nums' }}>{chip.value}</span>
                      <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.55)', fontWeight: 500 }}>{chip.label}</span>
                      {chip.sub && <span style={{ fontSize: 10, color: chip.color, fontWeight: 600 }}>{chip.sub}</span>}
                    </div>
                  ))}
                </div>
                {lastUpdated && (
                  <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.35)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M5 2.5v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {lastUpdated.toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )
          })()}

          {/* ── Alerts ──────────────────────────────────────────────────── */}
          {(!bearer || error || pollError) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {!bearer && (
                <div className="sf-anim-slide-up" style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)',
                  color: 'var(--warn)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
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
                <div className="sf-anim-slide-up" style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)',
                  color: 'var(--err)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <span>{error}</span>
                  <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7, padding: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </button>
                </div>
              )}
              {pollError && (
                <div className="sf-anim-slide-up" style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)',
                  color: 'var(--warn)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <span>{pollError}</span>
                  <button onClick={() => setPollError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7, padding: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Main area: toolbar + table + detail panel ──────────────── */}
          <div style={{ flex: 1, display: 'flex', gap: 0 }}>

            {/* Table column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

              {/* ── Toolbar ──────────────────────────────────────────── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                marginBottom: 12,
              }}>
                {/* Search input */}
                <div style={{ flex: 1, position: 'relative', minWidth: 180 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(233,234,240,0.35)', pointerEvents: 'none' }}>
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
                    style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 34, paddingRight: search ? 30 : 12 }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      title={fr('Effacer la recherche', 'Clear search')}
                      style={{
                        position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                        width: 20, height: 20, borderRadius: 6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(233,234,240,0.06)', border: 'none',
                        color: 'rgba(233,234,240,0.52)', cursor: 'pointer',
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                    </button>
                  )}
                </div>

                {/* Group filter — pill tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(10,10,12,0.8)', border: `1px solid ${HAIR}`, borderRadius: 8, padding: '3px 4px', flexShrink: 0 }}>
                  <button
                    onClick={() => setGroupFilter('all')}
                    className={`sf-btn sf-btn-ghost sf-btn-sm${groupFilter === 'all' ? '' : ''}`}
                    style={{
                      background: groupFilter === 'all' ? 'rgba(99,102,241,0.18)' : 'transparent',
                      color: groupFilter === 'all' ? 'var(--accent-l)' : 'rgba(233,234,240,0.52)',
                      border: groupFilter === 'all' ? '1px solid rgba(99,102,241,0.28)' : '1px solid transparent',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {t('phonesAllGroups')}
                  </button>
                  {groups.map(g => (
                    <button
                      key={g}
                      onClick={() => setGroupFilter(g)}
                      className="sf-btn sf-btn-ghost sf-btn-sm"
                      style={{
                        background: groupFilter === g ? 'rgba(99,102,241,0.18)' : 'transparent',
                        color: groupFilter === g ? 'var(--accent-l)' : 'rgba(233,234,240,0.52)',
                        border: groupFilter === g ? '1px solid rgba(99,102,241,0.28)' : '1px solid transparent',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>

                {/* Status filter pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(10,10,12,0.8)', border: `1px solid ${HAIR}`, borderRadius: 8, padding: '3px 4px', flexShrink: 0 }}>
                  {(['all', 'online', 'offline'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setFilter(v)}
                      style={{
                        padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                        background: filter === v ? 'var(--ivory)' : 'transparent',
                        color: filter === v ? '#0F1014' : 'rgba(233,234,240,0.52)',
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}
                    >
                      {v === 'all' ? t('phonesFilterAll') : v === 'online' ? t('phonesFilterOnline') : t('phonesFilterOffline')}
                    </button>
                  ))}
                </div>

                {/* View mode toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(10,10,12,0.8)', border: `1px solid ${HAIR}`, borderRadius: 8, padding: '3px 4px', flexShrink: 0 }}>
                  {([
                    { mode: 'table' as const, title: fr('Vue tableau', 'Table view'), icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 5.5h11M1.5 8.5h11M5 5.5V12" stroke="currentColor" strokeWidth="1.3"/></svg> },
                    { mode: 'grid' as const,  title: fr('Vue grille', 'Grid view'),  icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="8" y="1.5" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="1.5" y="8" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="8" y="8" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/></svg> },
                  ]).map(({ mode, title, icon }) => (
                    <button
                      key={mode}
                      onClick={() => changeViewMode(mode)}
                      title={title}
                      style={{
                        width: 30, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                        background: viewMode === mode ? 'rgba(99,102,241,0.18)' : 'transparent',
                        color: viewMode === mode ? 'var(--accent-l)' : 'rgba(233,234,240,0.45)',
                      }}
                    >{icon}</button>
                  ))}
                </div>

                {/* CSV export */}
                <button
                  onClick={exportCsv} disabled={sortedVisible.length === 0}
                  className="sf-btn sf-btn-secondary sf-btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: sortedVisible.length === 0 ? 'not-allowed' : 'pointer', opacity: sortedVisible.length === 0 ? 0.5 : 1 }}
                  title={fr('Exporter la liste filtrée en CSV', 'Export filtered list as CSV')}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 1v7M3.5 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M1.5 9.5v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  CSV
                </button>

                {/* Refresh now */}
                <button
                  onClick={() => poller.pollNow()}
                  className="sf-btn sf-btn-secondary sf-btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  title={fr('Actualiser maintenant', 'Refresh now')}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M11 6.5A4.5 4.5 0 1 1 8.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <path d="M8 1.5l1.5 1.5L8 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t('phonesSync')}
                </button>
              </div>

              {/* ── Content ──────────────────────────────────────────── */}
              {loading ? (
                /* Loading skeleton */
                <div className="sf-table-wrap" style={{ borderRadius: 12, border: `1px solid ${HAIR}`, background: 'rgba(233,234,240,0.02)' }}>
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th style={{ ...TH_BASE, width: 36 }}></th>
                        <th style={{ ...TH_BASE, width: 44 }}></th>
                        <th style={TH_BASE}>{t('phonesDetailModel')}</th>
                        <th style={{ ...TH_BASE, width: 120 }}>{t('phonesDetailGroup')}</th>
                        <th style={{ ...TH_BASE, width: 200 }}>Lien OnlyFans</th>
                        <th style={{ ...TH_BASE, width: 150 }}>Note</th>
                        <th style={{ ...TH_BASE, width: 90 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[0,1,2,3,4,5].map(i => (
                        <tr key={i}>
                          <td></td>
                          <td style={{ textAlign: 'center' }}><div className="sf-skeleton" style={{ width: 9, height: 9, borderRadius: '50%', margin: '0 auto' }} /></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div className="sf-skeleton" style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0 }} />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <div className="sf-skeleton" style={{ height: 11, width: 110, borderRadius: 4 }} />
                                <div className="sf-skeleton" style={{ height: 8, width: 70, borderRadius: 4 }} />
                              </div>
                            </div>
                          </td>
                          <td><div className="sf-skeleton" style={{ height: 20, width: 65, borderRadius: 99 }} /></td>
                          <td><div className="sf-skeleton" style={{ height: 20, width: 100, borderRadius: 4 }} /></td>
                          <td><div className="sf-skeleton" style={{ height: 20, width: 72, borderRadius: 99 }} /></td>
                          <td><div className="sf-skeleton" style={{ height: 11, width: 90, borderRadius: 4 }} /></td>
                          <td></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              ) : phones.length === 0 ? (
                /* Empty state — no phones at all */
                <div className="sf-empty sf-reveal">
                  <div className="sf-empty-icon" style={{ width: 64, height: 64, borderRadius: 20 }}>
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="1" width="16" height="26" rx="3.5"/>
                      <circle cx="14" cy="22" r="1.5" fill={ACCENT} stroke="none"/>
                      <path d="M10 5h8"/>
                    </svg>
                  </div>
                  <p className="sf-empty-title">{t('phonesNoConfigured')}</p>
                  <p className="sf-empty-desc">{t('phonesNoConfiguredDesc')}</p>
                  <button
                    onClick={syncFromGeelark}
                    disabled={!bearer || syncing}
                    className="sf-btn sf-btn-primary sf-btn-lg"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: (!bearer || syncing) ? 'not-allowed' : 'pointer', opacity: (!bearer || syncing) ? 0.5 : 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M12 7A5 5 0 1 1 9.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      <path d="M9 1l1.5 1.5L9 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {t('phonesSyncGeelark')}
                  </button>
                </div>

              ) : visible.length === 0 ? (
                /* No search results */
                <div className="sf-empty sf-reveal">
                  <div className="sf-empty-icon">
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round">
                      <circle cx="9.5" cy="9.5" r="7"/>
                      <path d="M15 15l5 5"/>
                      <path d="M7 9.5h5M9.5 7v5" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <p className="sf-empty-title">{t('phonesNoSearchResults')}</p>
                  <p className="sf-empty-desc">{fr(`Essayez d'ajuster votre recherche ou vos filtres.`, 'Try adjusting your search or filters.')}</p>
                  <button
                    onClick={() => { setSearch(''); setFilter('all'); setGroupFilter('all') }}
                    className="sf-btn sf-btn-secondary"
                  >
                    {fr('Réinitialiser les filtres', 'Reset filters')}
                  </button>
                </div>

              ) : viewMode === 'grid' ? (
                /* Phone grid */
                <div className="anim-stagger" style={{
                  display: 'grid', gap: 12,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))',
                }}>
                  {sortedVisible.map(phone => (
                    <PhoneCard
                      key={phone.id}
                      phone={phone}
                      isSelected={selectedPhone?.id === phone.id}
                      checked={selectedIds.has(phone.id)}
                      col={phoneColor(phone.phone_name)}
                      canDelete={canDelete}
                      setSelectedPhone={setSelectedPhone}
                      setContextMenu={setContextMenu}
                      setSessionDialog={setSessionDialog}
                      requestDelete={requestDelete}
                      toggleSelect={toggleSelect}
                      saveLink={saveLink}
                    />
                  ))}
                </div>

              ) : (
                /* Phone table */
                <div className="sf-table-wrap" style={{ borderRadius: 12, border: `1px solid ${HAIR}`, background: 'rgba(233,234,240,0.02)' }}>
                  <table className="sf-table">
                    <thead>
                      <tr>
                        {/* Select all */}
                        <th style={{ ...TH_BASE, width: 36, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAll}
                            title={fr('Tout sélectionner', 'Select all')}
                            style={{ cursor: 'pointer', accentColor: ACCENT, width: 14, height: 14 }}
                          />
                        </th>
                        {/* Status sort */}
                        {sortTh('', 'status', { width: 44 }, fr('Trier par statut', 'Sort by status'))}
                        {/* Name sort */}
                        {sortTh(t('phonesDetailModel'), 'name')}
                        {/* Group sort */}
                        {sortTh(t('phonesDetailGroup'), 'group', { width: 120 })}
                        <th style={{ ...TH_BASE, width: 200 }}>Lien OnlyFans</th>
                        <th style={{ ...TH_BASE, width: 150 }}>Note</th>
                        <th style={{ ...TH_BASE, width: 100 }}></th>
                      </tr>
                    </thead>
                    <tbody className="anim-stagger">
                      {sortedVisible.map((phone, index) => (
                        <PhoneRow
                          key={phone.id}
                          phone={phone}
                          index={index}
                          isSelected={selectedPhone?.id === phone.id}
                          checked={selectedIds.has(phone.id)}
                          col={phoneColor(phone.phone_name)}
                          canDelete={canDelete}
                          setSelectedPhone={setSelectedPhone}
                          setContextMenu={setContextMenu}
                          setSessionDialog={setSessionDialog}
                          saveIgUsername={saveIgUsername}
                          saveRemark={saveRemark}
                          saveLink={saveLink}
                          requestDelete={requestDelete}
                          toggleSelect={toggleSelect}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!loading && visible.length > 0 && (
                <p style={{ fontSize: 11, color: 'rgba(233,234,240,0.3)', marginTop: 14, textAlign: 'center' }}>
                  {visible.length} {t('phonesCountOf')} {phones.length} {phones.length > 1 ? t('phonesPhonesPlural') : t('phonesPhonesSuffix')}
                </p>
              )}
            </div>

            {/* ── Right detail panel ──────────────────────────────────── */}
            {selectedPhone && (() => {
              const p   = selectedPhone
              const col = phoneColor(p.phone_name)
              return (
                <div className="sf-reveal" style={{
                  width: 300, flexShrink: 0,
                  borderLeft: `1px solid ${HAIR}`,
                  background: '#0F1014', overflowY: 'auto',
                  marginLeft: 16,
                  // Sticky so the panel stays in view no matter where you clicked in a
                  // long list — no need to scroll back up to the top to see it / delete.
                  // Scroll container is .sf-page-body; top:16 pins it near the top and the
                  // maxHeight keeps it within the visible fold (panel scrolls internally).
                  position: 'sticky', top: 16, alignSelf: 'flex-start',
                  maxHeight: 'calc(100vh - 160px)', borderRadius: 12,
                }}>
                  {/* Panel header */}
                  <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(233,234,240,0.055)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `${col}14`, border: `1px solid ${col}33`, color: col,
                        }}>
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <rect x="4" y="1" width="10" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
                            <circle cx="9" cy="14" r="0.8" fill="currentColor"/>
                          </svg>
                        </div>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 700, color: TEXT_1, margin: 0, lineHeight: 1.2 }}>{p.phone_name}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            <StatusDot status={p.status ?? 'offline'} />
                            {p.group_name && (
                              <span className="sf-badge sf-badge-violet">{p.group_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedPhone(null)}
                        className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm"
                        style={{ cursor: 'pointer', flexShrink: 0 }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>

                    {/* Quick action buttons */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        {
                          label: t('phoneSession'),
                          icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="5" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
                          action: () => setSessionDialog({ phone: p }),
                        },
                        {
                          label: t('phonesSync'),
                          icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10.5 6A4.5 4.5 0 1 1 8 2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M7.5 1l1.5 1.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                          action: () => poller.pollNow(),
                        },
                      ].map(a => (
                        <button key={a.label} onClick={a.action}
                          className="sf-btn sf-btn-ghost sf-btn-sm"
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer' }}
                        >
                          {a.icon}{a.label}
                        </button>
                      ))}
                      <button
                        onClick={e => { e.stopPropagation(); setContextMenu({ phone: p, x: e.clientX, y: e.clientY }) }}
                        className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm"
                        style={{ cursor: 'pointer' }}
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
                  <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(233,234,240,0.055)' }}>
                    <p style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_3, margin: '0 0 12px' }}>{t('phonesInfoSection')}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {[
                        { label: t('phonesDetailModel'),     value: p.phone_name },
                        { label: t('phonesDetailSerial'),    value: p.serial_no ?? '—' },
                        { label: t('phonesDetailGeelarkId'), value: p.geelark_id ?? '—' },
                        { label: t('phonesDetailGroup'),     value: p.group_name ?? '—' },
                        { label: t('phonesDetailLastSync'),  value: p.synced_at ? relativeTime(p.synced_at) : '—' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.45)', flexShrink: 0 }}>{row.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 500, color: TEXT_1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, textAlign: 'right' }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lien OnlyFans */}
                  <PanelLinkField phone={p} onSave={saveLink} />

                  {/* Instagram section */}
                  {p.ig_username && (
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(233,234,240,0.055)' }}>
                      <p style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_3, margin: '0 0 12px' }}>{t('phonesIgSection')}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: ACCENT, fontSize: 13, fontWeight: 700,
                          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.4)',
                        }}>
                          {p.ig_username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: ACCENT, margin: 0 }}>@{p.ig_username}</p>
                          {(p.followers || p.following) ? (
                            <p style={{ fontSize: 10, color: 'rgba(233,234,240,0.45)', margin: '2px 0 0' }}>
                              {p.followers ? `${p.followers >= 1000 ? `${(p.followers / 1000).toFixed(1)}K` : p.followers} ${t('phonesIgFollowers')}` : ''}
                              {p.followers && p.following ? ' · ' : ''}
                              {p.following ? `${p.following} ${t('phonesIgFollowing')}` : ''}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.45)' }}>{t('phonesIgStatus')}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: p.ig_status === 'active' ? 'var(--ok)' : (p.ig_status === 'expired' || p.ig_status === 'error') ? 'var(--err)' : 'rgba(233,234,240,0.52)',
                          }}>
                            {p.ig_status === 'active' ? t('phonesIgStatusActive') : p.ig_status === 'expired' ? t('phonesIgStatusExpired') : p.ig_status === 'error' ? t('phonesIgStatusError') : t('phonesIgNotConfigured')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.45)' }}>{t('phonesIgSession')}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: p.ig_sessionid ? 'var(--ok)' : 'rgba(233,234,240,0.52)' }}>
                            {p.ig_sessionid ? t('phonesIgSessionConfigured') : t('phonesIgNotConfigured')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quick actions */}
                  <div style={{ padding: '16px 18px' }}>
                    <p style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_3, margin: '0 0 10px' }}>{t('phonesQuickActions')}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button onClick={() => setSessionDialog({ phone: p })} className="sf-btn sf-btn-ghost" style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                        borderRadius: 8, fontSize: 12, fontWeight: 500, textAlign: 'left',
                        color: ACCENT, cursor: 'pointer', justifyContent: 'flex-start',
                      }}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="5.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        {t('phonesSessionIdAction')}
                      </button>
                      {p.ig_username && (
                        <button onClick={() => { unlinkIg(p.id); setSelectedPhone(null) }} className="sf-btn sf-btn-ghost" style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                          borderRadius: 8, fontSize: 12, fontWeight: 500, textAlign: 'left',
                          color: ACCENT, cursor: 'pointer', justifyContent: 'flex-start',
                        }}>
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5C2 4 4 2 6.5 2s4.5 2 4.5 4.5S9 11 6.5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M2 11l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                          {t('phonesUnlinkIgAction')}
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => requestDelete(p)} className="sf-btn sf-btn-ghost" style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                          borderRadius: 8, fontSize: 12, fontWeight: 500, textAlign: 'left',
                          color: 'var(--err)', cursor: 'pointer', justifyContent: 'flex-start',
                        }}>
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

        {/* ── Floating bulk-action bar ──────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div className="sf-anim-slide-up" style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 40, display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 14,
            background: 'var(--surface-2)', border: '1px solid rgba(99,102,241,0.35)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 24px -8px rgba(99,102,241,0.4)',
            whiteSpace: 'nowrap',
          }}>
            {/* Count pill */}
            <span className="sf-badge sf-badge-violet" style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px' }}>
              {selectedIds.size} {fr('sélectionné(s)', 'selected')}
            </span>

            <div style={{ width: 1, height: 20, background: HAIR }} />

            {/* Stop / power off selected */}
            <button
              onClick={stopSelectedPhones}
              disabled={bulkBusy}
              className="sf-btn sf-btn-secondary sf-btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: bulkBusy ? 'wait' : 'pointer' }}
              title={fr('Éteindre les téléphones sélectionnés', 'Power off selected phones')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
              </svg>
              {fr('Éteindre', 'Power off')}
            </button>

            {/* Delete bulk */}
            {canDelete && (
              <button
                onClick={() => setConfirmBulkDelete(true)}
                disabled={bulkBusy}
                className="sf-btn sf-btn-danger sf-btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: bulkBusy ? 'wait' : 'pointer' }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 3h8M4.5 3V2h3v1M4 3l.4 7h3.2L8 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {fr(`Supprimer ${selectedIds.size}`, `Delete ${selectedIds.size}`)}
              </button>
            )}

            {/* Unlink IG bulk */}
            <button
              onClick={bulkUnlinkIg}
              disabled={bulkBusy}
              className="sf-btn sf-btn-secondary sf-btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: bulkBusy ? 'wait' : 'pointer' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6C2 3.8 3.8 2 6 2s4 1.8 4 4-2 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M2 10l3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {fr('Délier IG', 'Unlink IG')}
            </button>

            {/* Change group */}
            {groups.length > 0 && (
              <select
                value=""
                disabled={bulkBusy}
                onChange={e => { if (e.target.value) bulkChangeGroup(e.target.value) }}
                className="sf-input"
                style={{
                  fontSize: 12, fontWeight: 500, padding: '5px 10px', height: 28,
                  background: 'rgba(233,234,240,0.04)', border: `1px solid ${HAIR}`,
                  borderRadius: 8, cursor: bulkBusy ? 'wait' : 'pointer', color: TEXT_1,
                }}
              >
                <option value="">{fr('Changer de groupe…', 'Change group…')}</option>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}

            {/* Deselect all */}
            <button
              onClick={() => setSelectedIds(new Set())}
              title={fr('Annuler la sélection', 'Clear selection')}
              className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm"
              style={{ cursor: 'pointer' }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </>
  )
}
