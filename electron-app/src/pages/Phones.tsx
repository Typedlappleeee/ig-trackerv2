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

// ── Design tokens — "ScaleFlow Noir" ─────────────────────────────────────────
const SERIF = "'Inter', 'Times New Roman', Georgia, serif"
const SANS  = "'Inter', system-ui, sans-serif"
const IVORY = '#E9EAF0'
const MUTED = 'rgba(233,234,240,0.42)'
const FAINT = 'rgba(233,234,240,0.22)'
const HAIR  = 'rgba(233,234,240,0.08)'
const GOLD  = '#6366F1'

// Header de colonne — uppercase 9px hairline éditorial
const TH_STYLE: React.CSSProperties = {
  fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.25em',
  textTransform: 'uppercase', color: FAINT,
  background: 'transparent', borderBottom: `1px solid ${HAIR}`,
}

// Bouton primaire — ivoire → or
const PRIMARY_BTN: React.CSSProperties = {
  fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
  textTransform: 'uppercase', padding: '11px 18px',
  background: IVORY, color: '#0F1014', border: 'none', borderRadius: 0,
  transition: 'background 0.25s',
}
const primaryHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = GOLD },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = IVORY },
}

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
      padding: '3px 9px 2px', borderRadius: 0,
      background: online ? 'rgba(127,217,184,0.07)' : 'rgba(240,160,171,0.07)',
      border: online ? '1px solid rgba(127,217,184,0.35)' : '1px solid rgba(240,160,171,0.35)',
      fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
      color: online ? '#7FD9B8' : '#F0A0AB',
    }}>
      {online
        ? <span className="sf-ping-dot" style={{ background: '#7FD9B8' }} />
        : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(240,160,171,0.45)', display: 'inline-block' }} />
      }
      {online ? t('online') : t('offline')}
    </span>
  )
}

// ── IG Status badge ─────────────────────────────────────────────────────────
function IgStatusBadge({ phone }: { phone: Phone }) {
  const t = useT()
  if (!phone.ig_username) return <span style={{ fontSize: 13, color: 'rgba(233,234,240,0.35)' }}>—</span>

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
    <span style={{ fontSize: 12, color: 'rgba(99,102,241,0.72)', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
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
      if (!r.ok) { setSaving(false); return }  // don’t save invalid session
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
      className="sf-modal-bg"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sf-modal sf-anim-scale-spring" style={{ width: 480, maxWidth: '90vw' }}>
        {/* Header */}
        <div className="sf-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.35)', color: '#6366F1',
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="5.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h2 className="sf-modal-title">{t('phoneSessionTitle')}</h2>
              {phone.ig_username && (
                <p style={{ fontSize: 12, color: '#6366F1', margin: '2px 0 0' }}>@{phone.ig_username}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-icon" style={{ width: 28, height: 28, borderRadius: 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="sf-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Auto-extract via GéeLark shell */}
          {phone.geelark_id && bearer && (
            <div style={{
              background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#E9EAF0', margin: 0 }}>{t('phoneAutoExtract')}</p>
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

          {/* Manual instructions */}
          <div style={{
            background: 'rgba(233,234,240,0.025)', border: '1px solid rgba(233,234,240,0.07)',
            borderRadius: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#E9EAF0', margin: '0 0 4px' }}>{t('phoneManualInstructions')}</p>
            {[
              <>1. Open <span style={{ color: '#6366F1' }}>{t('phoneManualStep1Chrome')}</span> in Chrome</>,
              <>2. Press <span style={{ color: '#6366F1' }}>{t('phoneManualStep2DevTools')}</span> (DevTools)</>,
              <>3. Go to <span style={{ color: '#6366F1' }}>{t('phoneManualStep3Cookies')}</span></>,
              <>4. Find the <span style={{ color: '#6366F1', fontFamily: 'monospace' }}>{t('phoneManualStep4Cookie')}</span> cookie and copy its value</>,
            ].map((step, i) => (
              <p key={i} style={{ fontSize: 11, color: 'rgba(233,234,240,0.52)', margin: 0 }}>{step}</p>
            ))}
          </div>

          {/* Session input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, color: FAINT, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{t('phoneSessionLabel')}</label>
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
                  borderColor: testResult === 'ok' ? '#7FD9B8' : testResult === 'fail' ? '#F0A0AB' : undefined,
                  fontFamily: 'monospace',
                }}
              />
              <span style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 13, pointerEvents: 'none',
              }}>
                {testing ? (
                  <svg style={{ animation: 'spin 1s linear infinite' }} width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5" stroke="#6366F1" strokeWidth="1.5" strokeDasharray="10 20" strokeLinecap="round"/>
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
                {t('phoneSessionTestOkUser')} <span style={{ color: '#6366F1', fontWeight: 600 }}>@{detectedUser}</span>
                {phone.ig_username && phone.ig_username !== detectedUser && (
                  <span style={{ color: '#E5C07B', marginLeft: 4 }}>{t('phoneSessionDifferentUser')} @{phone.ig_username} {t('phoneSessionWillUpdate')}</span>
                )}
              </p>
            )}
            {testResult === 'fail' && <p style={{ fontSize: 11, color: '#F0A0AB', margin: 0 }}>{t('phoneSessionInvalid')}</p>}
            {testResult === 'idle' && value.trim().length > 10 && !testing && (
              <p style={{ fontSize: 11, color: 'rgba(233,234,240,0.52)', margin: 0 }}>{t('phoneSessionAutoTest')}</p>
            )}
          </div>
        </div>

        {/* Footer */}
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
        padding: '7px 12px', fontSize: 13, textAlign: 'left', borderRadius: 0,
        background: 'none', border: 'none', cursor: 'pointer',
        color: danger ? '#F0A0AB' : '#E9EAF0', transition: 'background 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? 'rgba(240,160,171,0.10)' : 'rgba(233,234,240,0.06)' }}
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
        background: '#0F1014', border: '1px solid rgba(233,234,240,0.09)',
        borderRadius: 0, boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        padding: '4px 0', width: 208,
        left, top,
      }}
    >
      <div style={{ padding: '6px 12px 8px', borderBottom: '1px solid rgba(233,234,240,0.055)', marginBottom: 4 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#E9EAF0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phone.phone_name}</p>
        {phone.ig_username && <p style={{ fontSize: 10, color: '#6366F1', margin: '1px 0 0' }}>@{phone.ig_username}</p>}
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
      <span style={{ fontSize: 13, color: 'rgba(99,102,241,0.72)' }}>@</span>
      <input
        ref={ref} value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={onKey} onBlur={save} disabled={saving}
        className="sf-input"
        style={{ width: 112, padding: '2px 6px', fontSize: 13, borderColor: '#6366F1' }}
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
        <span style={{ color: '#6366F1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{phone.ig_username}</span>
      ) : (
        <span style={{ color: 'rgba(233,234,240,0.35)', fontStyle: 'normal' }}>{t('phoneIgCellAdd')}</span>
      )}
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ opacity: 0, flexShrink: 0, transition: 'opacity 0.15s' }} className="edit-pencil">
        <path d="M7.5 1.5l2 2-6 6H1.5v-2l6-6z" stroke="rgba(233,234,240,0.52)" strokeWidth="1.2" strokeLinejoin="round"/>
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
      style={{ width: '100%', padding: '2px 6px', fontSize: 13, borderColor: '#6366F1' }}
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
        <span style={{ color: 'rgba(99,102,241,0.72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phone.remark}</span>
      ) : (
        <span style={{ color: 'rgba(233,234,240,0.25)', fontStyle: 'normal' }}>{t('phoneNoteCellAdd')}</span>
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
    // Trigger an immediate poll if one hasn’t happened recently
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
    const palette = ['#6366F1','#9DB8D9','#7FD9B8','#E5C07B','#F0A0AB','#A9C9C0','#D9C49D','#8FA9C9']
    let h = 0
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
    return palette[Math.abs(h) % palette.length]
  }

  const COLS = '40px 1fr 160px 130px 120px'

  // Découpe éditoriale du titre : mot principal SANS + mot accent SERIF italique
  const headingWords  = t('phonesHeading').split(' ')
  const headingMain   = headingWords.length > 1 ? headingWords.slice(0, -1).join(' ') : headingWords[0]
  const headingAccent = headingWords.length > 1 ? headingWords[headingWords.length - 1] : ''

  // ── small icon action button ──────────────────────────────────────────────
  const ActionBtn = ({
    onClick, title, children, danger,
  }: { onClick: () => void; title: string; children: React.ReactNode; danger?: boolean }) => {
    const [hovered, setHovered] = useState(false)
    return (
      <button
        onClick={onClick}
        title={title}
        className="sf-press"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 28, height: 28, borderRadius: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hovered ? (danger ? 'rgba(240,160,171,0.15)' : 'rgba(99,102,241,0.15)') : 'rgba(233,234,240,0.06)',
          border: '1px solid rgba(233,234,240,0.1)',
          color: hovered ? (danger ? '#F0A0AB' : '#6366F1') : 'rgba(233,234,240,0.52)',
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
        className="anim-page"
        style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', background: '#0A0B0E' }}
        onClick={() => setContextMenu(null)}
      >

        {/* ── Premium Page Header ──────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          padding: '28px 32px 22px',
          borderBottom: `1px solid ${HAIR}`,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16,
        }}>
          {/* Left: micro-label or + titre éditorial */}
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ display: 'block', width: 28, height: 1, background: 'rgba(99,102,241,0.5)' }} />
              <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: 600, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(99,102,241,0.65)' }}>
                GéeLark
              </span>
            </div>
            <h1 style={{ margin: 0, lineHeight: 1.05, letterSpacing: '-0.04em' }}>
              <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 26, color: IVORY }}>
                {headingMain}
              </span>
              {headingAccent && (
                <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 29, color: GOLD, marginLeft: '0.25em' }}>
                  {headingAccent}
                </span>
              )}
            </h1>
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: MUTED, margin: '7px 0 0', lineHeight: 1.5 }}>{t('phonesSubtitle')}</p>
          </div>

          {/* Right: auto-refresh control + sync button */}
          <div className="sf-anim-slide-up sf-d100" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Auto-refresh pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 12px', borderRadius: 0,
              background: 'rgba(233,234,240,0.02)', border: `1px solid ${HAIR}`,
              flexShrink: 0,
            }}>
              <button
                onClick={() => { const next = !autoRefresh; poller.setEnabled(next); setAutoRefresh(next) }}
                style={{
                  position: 'relative', width: 28, height: 15, borderRadius: 0,
                  background: autoRefresh ? '#7FD9B8' : 'rgba(233,234,240,0.2)',
                  flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2.5, width: 10, height: 10,
                  background: IVORY, borderRadius: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  transition: 'left 0.2s', left: autoRefresh ? 15 : 2.5,
                }} />
              </button>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(233,234,240,0.52)', whiteSpace: 'nowrap' }}>{t('phonesAutoLabel')}</span>
              {autoRefresh && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 0, padding: '2px 3px', flexShrink: 0 }}>
                  {INTERVALS.map(({ label, value }) => (
                    <button key={value} onClick={() => changeInterval(value)}
                      style={{
                        padding: '3px 7px', borderRadius: 0, fontSize: 10, border: 'none', cursor: 'pointer',
                        background: intervalSec === value ? IVORY : 'transparent',
                        color: intervalSec === value ? '#0F1014' : 'rgba(233,234,240,0.52)',
                        fontWeight: intervalSec === value ? 700 : 400,
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}>{label}</button>
                  ))}
                </div>
              )}
              {autoRefresh && bearer && <Countdown secondsLeft={countdown} />}
            </div>

            {/* Sync / Add button */}
            <button
              onClick={syncFromGeelark} disabled={!bearer || syncing}
              style={{
                ...PRIMARY_BTN,
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: (!bearer || syncing) ? 'not-allowed' : 'pointer',
                opacity: (!bearer || syncing) ? 0.5 : 1,
              }}
              {...primaryHover}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0, animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                <path d="M13 7.5A5.5 5.5 0 1 1 10 2.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M9.5 1.5l2 1.5L9.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {syncing ? t('phonesSyncing') : t('phonesSyncGeelark')}
            </button>

            {/* Plan limit badge */}
            {phoneLimit !== Infinity && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 0,
                background: phones.length >= phoneLimit ? 'rgba(240,160,171,0.07)' : 'rgba(99,102,241,0.07)',
                border: `1px solid ${phones.length >= phoneLimit ? 'rgba(240,160,171,0.35)' : 'rgba(99,102,241,0.35)'}`,
                color: phones.length >= phoneLimit ? '#F0A0AB' : '#6366F1',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {phones.length} / {phoneLimit}
              </span>
            )}
          </div>
        </div>

        {/* ── Stats bar ─────────────────────────────────────────────────────── */}
        {!loading && phones.length > 0 && (() => {
          const onlinePct = phones.length ? Math.round((onlineCount / phones.length) * 100) : 0
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
              color: '#6366F1', filter: 'all' as const,
            },
            {
              label: t('phoneSummaryOnline'), value: onlineCount,
              sub: `${onlinePct}%`,
              icon: <span className="sf-ping-dot" style={{ background: '#7FD9B8', width: 8, height: 8 }} />,
              color: '#7FD9B8', filter: 'online' as const,
            },
            {
              label: t('phoneSummaryOffline'), value: offlineCount,
              icon: (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <circle cx="4" cy="4" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
              ),
              color: 'rgba(233,234,240,0.5)', filter: 'offline' as const,
            },
            ...(withSession > 0 ? [{
              label: t('phoneSession'), value: withSession,
              icon: (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1.5" y="5.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M4.5 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              ),
              color: '#6366F1', filter: null,
            }] : []),
          ]
          return (
            <div style={{
              flexShrink: 0, padding: '14px 32px 0',
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              {statChips.map((chip, ci) => (
                <button
                  key={chip.label}
                  onClick={() => chip.filter && setFilter(chip.filter)}
                  className={`anim-scale-in sf-d${(ci + 1) * 50}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '6px 12px', borderRadius: 0,
                    background: chip.filter && filter === chip.filter
                      ? 'rgba(99,102,241,0.12)'
                      : 'rgba(233,234,240,0.04)',
                    border: chip.filter && filter === chip.filter
                      ? '1px solid rgba(99,102,241,0.3)'
                      : '1px solid rgba(233,234,240,0.08)',
                    cursor: chip.filter ? 'pointer' : 'default',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ color: chip.color, display: 'flex', alignItems: 'center' }}>{chip.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#E9EAF0', fontVariantNumeric: 'tabular-nums' }}>{chip.value}</span>
                  <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.55)', fontWeight: 500 }}>{chip.label}</span>
                  {chip.sub && <span style={{ fontSize: 10, color: chip.color, fontWeight: 600 }}>{chip.sub}</span>}
                </button>
              ))}
              {lastUpdated && (
                <span style={{
                  fontSize: 11, color: 'rgba(233,234,240,0.35)', marginLeft: 'auto',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M5 2.5v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )
        })()}

        {/* ── Content area (scrolls with the page) ───────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* ── Main area (cards + detail panel) ──────────────────────────── */}
          <div style={{ flex: 1, display: 'flex' }}>

            {/* Cards + toolbar column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

              {/* ── Toolbar ──────────────────────────────────────────────── */}
              <div className="sf-toolbar" style={{ gap: 8 }}>
                {/* Search */}
                <div style={{ flex: 1, position: 'relative', minWidth: 160 }}>
                  <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'rgba(233,234,240,0.35)', pointerEvents: 'none' }}>
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
                    style={{
                      width: '100%', boxSizing: 'border-box', paddingLeft: 34, paddingRight: 14,
                      background: 'transparent', border: 'none', borderRadius: 0,
                      borderBottom: '1px solid rgba(233,234,240,0.18)', boxShadow: 'none',
                    }}
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
                      background: 'transparent', border: `1px solid ${HAIR}`, borderRadius: 0,
                    }}
                  >
                    <option value="all">{t('phonesAllGroups')}</option>
                    {groups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(233,234,240,0.4)', fontSize: 9 }}>▼</span>
                </div>

                {/* Status filter pills */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 2,
                  background: 'rgba(10,10,12,0.8)', border: '1px solid rgba(233,234,240,0.08)',
                  borderRadius: 0, padding: '3px 4px', flexShrink: 0,
                }}>
                  {(['all', 'online', 'offline'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setFilter(v)}
                      style={{
                        padding: '4px 12px', borderRadius: 0, fontSize: 11, fontWeight: 600,
                        border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                        background: filter === v ? IVORY : 'transparent',
                        color: filter === v ? '#0F1014' : 'rgba(233,234,240,0.52)',
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                      }}
                    >
                      {v === 'all' ? t('phonesFilterAll') : v === 'online' ? t('phonesFilterOnline') : t('phonesFilterOffline')}
                    </button>
                  ))}
                </div>

                {/* Refresh button */}
                <button
                  onClick={() => poller.pollNow()}
                  className="sf-btn sf-btn-secondary sf-btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}
                  title="Refresh now"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M11 6.5A4.5 4.5 0 1 1 8.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <path d="M8 1.5l1.5 1.5L8 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t('phonesSync')}
                </button>
              </div>

              {/* ── Alerts ───────────────────────────────────────────────── */}
              {(!bearer || error || pollError) && (
                <div style={{ padding: '12px 28px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!bearer && (
                    <div className="sf-anim-slide-up" style={{
                      padding: '10px 14px', borderRadius: 0,
                      background: 'rgba(229,192,123,0.07)', border: '1px solid rgba(229,192,123,0.18)',
                      color: '#E5C07B', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
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
                      padding: '10px 14px', borderRadius: 0,
                      background: 'rgba(240,160,171,0.07)', border: '1px solid rgba(240,160,171,0.18)',
                      color: '#F0A0AB', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    }}>
                      <span>{error}</span>
                      <button onClick={() => setError(null)} className="sf-press" style={{ background: 'none', border: 'none', color: '#F0A0AB', cursor: 'pointer', opacity: 0.6, padding: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  )}
                  {pollError && (
                    <div className="sf-anim-slide-up" style={{
                      padding: '10px 14px', borderRadius: 0,
                      background: 'rgba(229,192,123,0.07)', border: '1px solid rgba(229,192,123,0.18)',
                      color: '#E5C07B', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    }}>
                      <span>{pollError}</span>
                      <button onClick={() => setPollError(null)} className="sf-press" style={{ background: 'none', border: 'none', color: '#E5C07B', cursor: 'pointer', opacity: 0.6, padding: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Content ───────────────────────────────────────────────── */}
              <div style={{ flex: 1, padding: '16px 28px 28px' }}>

                {loading ? (
                  /* ── Loading skeleton rows ─────────────────────────────── */
                  <div className="sf-table-wrap" style={{ borderRadius: 0, border: `1px solid ${HAIR}`, background: 'rgba(233,234,240,0.02)' }}>
                    <table className="sf-table">
                      <thead>
                        <tr>
                          <th style={{ ...TH_STYLE, width: 44 }}></th>
                          <th style={TH_STYLE}>{t('phonesDetailModel')}</th>
                          <th style={{ ...TH_STYLE, width: 120 }}>{t('phonesDetailGroup')}</th>
                          <th style={{ ...TH_STYLE, width: 160 }}>Instagram</th>
                          <th style={{ ...TH_STYLE, width: 110 }}>{t('phonesIgStatus')}</th>
                          <th style={{ ...TH_STYLE, width: 150 }}>Note</th>
                          <th style={{ ...TH_STYLE, width: 90 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[0,1,2,3,4,5,6,7].map(i => (
                          <tr key={i}>
                            <td style={{ textAlign: 'center' }}><div className="sf-skeleton" style={{ width: 8, height: 8, borderRadius: '50%', margin: '0 auto' }} /></td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div className="sf-skeleton" style={{ width: 30, height: 30, borderRadius: 0, flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                  <div className="sf-skeleton" style={{ height: 11, width: 110, borderRadius: 0 }} />
                                  <div className="sf-skeleton" style={{ height: 8, width: 70, borderRadius: 0 }} />
                                </div>
                              </div>
                            </td>
                            <td><div className="sf-skeleton" style={{ height: 20, width: 65, borderRadius: 0 }} /></td>
                            <td><div className="sf-skeleton" style={{ height: 20, width: 100, borderRadius: 0 }} /></td>
                            <td><div className="sf-skeleton" style={{ height: 20, width: 75, borderRadius: 0 }} /></td>
                            <td><div className="sf-skeleton" style={{ height: 11, width: 90, borderRadius: 0 }} /></td>
                            <td></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                ) : phones.length === 0 ? (
                  /* ── Empty state ────────────────────────────────────────── */
                  <div className="sf-empty sf-reveal">
                    <div className="sf-empty-icon" style={{ width: 64, height: 64, borderRadius: 0 }}>
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#6366F1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="6" y="1" width="16" height="26" rx="3.5"/>
                        <circle cx="14" cy="22" r="1.5" fill="#6366F1" stroke="none"/>
                        <path d="M10 5h8"/>
                      </svg>
                    </div>
                    <p className="sf-empty-title">{t('phonesNoConfigured')}</p>
                    <p className="sf-empty-desc">{t('phonesNoConfiguredDesc')}</p>
                    <button
                      onClick={syncFromGeelark}
                      disabled={!bearer || syncing}
                      style={{
                        ...PRIMARY_BTN,
                        display: 'flex', alignItems: 'center', gap: 8,
                        cursor: (!bearer || syncing) ? 'not-allowed' : 'pointer',
                        opacity: (!bearer || syncing) ? 0.5 : 1,
                      }}
                      {...primaryHover}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M12 7A5 5 0 1 1 9.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        <path d="M9 1l1.5 1.5L9 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {t('phonesSyncGeelark')}
                    </button>
                  </div>

                ) : visible.length === 0 ? (
                  /* ── No search results ──────────────────────────────────── */
                  <div className="sf-empty sf-reveal">
                    <div className="sf-empty-icon">
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#6366F1" strokeWidth="1.6" strokeLinecap="round">
                        <circle cx="9.5" cy="9.5" r="7"/>
                        <path d="M15 15l5 5"/>
                        <path d="M7 9.5h5M9.5 7v5" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <p className="sf-empty-title">{t('phonesNoSearchResults')}</p>
                    <p className="sf-empty-desc">Try adjusting your search or filters.</p>
                  </div>

                ) : (
                  /* ── Phone table list ───────────────────────────────────── */
                  <div className="sf-table-wrap" style={{ borderRadius: 0, border: `1px solid ${HAIR}`, background: 'rgba(233,234,240,0.02)' }}>
                    <table className="sf-table">
                      <thead>
                        <tr>
                          <th style={{ ...TH_STYLE, width: 44 }}></th>
                          <th style={TH_STYLE}>{t('phonesDetailModel')}</th>
                          <th style={{ ...TH_STYLE, width: 120 }}>{t('phonesDetailGroup')}</th>
                          <th style={{ ...TH_STYLE, width: 160 }}>Instagram</th>
                          <th style={{ ...TH_STYLE, width: 110 }}>{t('phonesIgStatus')}</th>
                          <th style={{ ...TH_STYLE, width: 150 }}>Note</th>
                          <th style={{ ...TH_STYLE, width: 90 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((phone, i) => {
                          const col = phoneColor(phone.phone_name)
                          return (
                            <PhoneRow
                              key={phone.id}
                              phone={phone}
                              index={i}
                              isSelected={selectedPhone?.id === phone.id}
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
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {!loading && visible.length > 0 && (
                  <p style={{ fontSize: 11, color: 'rgba(233,234,240,0.3)', marginTop: 16, textAlign: 'center' }}>
                    {visible.length} {t('phonesCountOf')} {phones.length} {phones.length > 1 ? t('phonesPhonesPlural') : t('phonesPhonesSuffix')}
                  </p>
                )}
              </div>
            </div>

            {/* ── Right detail panel ──────────────────────────────────────── */}
            {selectedPhone && (() => {
              const p = selectedPhone
              const col = phoneColor(p.phone_name)
              return (
                <div className="sf-reveal" style={{
                  width: 300, flexShrink: 0,
                  borderLeft: `1px solid ${HAIR}`,
                  background: '#0F1014', overflowY: 'auto',
                }}>
                  {/* Panel header */}
                  <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(233,234,240,0.055)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 42, height: 42, borderRadius: 0, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `${col}14`,
                          border: `1px solid ${col}33`, color: col,
                        }}>
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <rect x="4" y="1" width="10" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
                            <circle cx="9" cy="14" r="0.8" fill="currentColor"/>
                          </svg>
                        </div>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 700, color: '#E9EAF0', margin: 0, lineHeight: 1.2 }}>{p.phone_name}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            <StatusDot status={p.status ?? 'offline'} />
                            {p.group_name && (
                              <span style={{
                                fontSize: 10, padding: '2px 7px', borderRadius: 0, fontWeight: 600,
                                background: 'rgba(99,102,241,0.12)', color: '#6366F1',
                                border: '1px solid rgba(99,102,241,0.22)',
                              }}>
                                {p.group_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedPhone(null)}
                        className="sf-btn sf-btn-ghost sf-btn-icon"
                        style={{ width: 26, height: 26, borderRadius: 0, flexShrink: 0, cursor: 'pointer' }}
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
                            padding: '7px 0', borderRadius: 0, fontSize: 11, fontWeight: 500,
                            background: 'rgba(233,234,240,0.04)', border: '1px solid rgba(233,234,240,0.09)',
                            color: 'rgba(99,102,241,0.72)', cursor: 'pointer', transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.1)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.25)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(233,234,240,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(233,234,240,0.09)' }}
                        >
                          {a.icon}{a.label}
                        </button>
                      ))}
                      <button
                        onClick={e => { e.stopPropagation(); setContextMenu({ phone: p, x: e.clientX, y: e.clientY }) }}
                        className="sf-press"
                        style={{
                          width: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 0, background: 'rgba(233,234,240,0.04)',
                          border: '1px solid rgba(233,234,240,0.09)',
                          color: 'rgba(233,234,240,0.52)', cursor: 'pointer',
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
                  <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(233,234,240,0.055)' }}>
                    <p style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: FAINT, margin: '0 0 12px' }}>{t('phonesInfoSection')}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {[
                        { label: t('phonesDetailModel'),    value: p.phone_name },
                        { label: t('phonesDetailSerial'),   value: p.serial_no ?? '—' },
                        { label: t('phonesDetailGeelarkId'), value: p.geelark_id ?? '—' },
                        { label: t('phonesDetailGroup'),    value: p.group_name ?? '—' },
                        { label: t('phonesDetailLastSync'), value: p.synced_at ? relativeTime(p.synced_at) : '—' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.45)', flexShrink: 0 }}>{row.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 500, color: '#E9EAF0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, textAlign: 'right' }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Instagram section */}
                  {p.ig_username && (
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(233,234,240,0.055)' }}>
                      <p style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: FAINT, margin: '0 0 12px' }}>{t('phonesIgSection')}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: GOLD, fontSize: 13, fontWeight: 700,
                          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.4)',
                        }}>
                          {p.ig_username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#6366F1', margin: 0 }}>@{p.ig_username}</p>
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
                            color: p.ig_status === 'active' ? '#7FD9B8' : (p.ig_status === 'expired' || p.ig_status === 'error') ? '#F0A0AB' : 'rgba(233,234,240,0.52)',
                          }}>
                            {p.ig_status === 'active' ? t('phonesIgStatusActive') : p.ig_status === 'expired' ? t('phonesIgStatusExpired') : p.ig_status === 'error' ? t('phonesIgStatusError') : t('phonesIgNotConfigured')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.45)' }}>{t('phonesIgSession')}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: p.ig_sessionid ? '#7FD9B8' : 'rgba(233,234,240,0.52)' }}>
                            {p.ig_sessionid ? t('phonesIgSessionConfigured') : t('phonesIgNotConfigured')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quick actions */}
                  <div style={{ padding: '16px 18px' }}>
                    <p style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: FAINT, margin: '0 0 10px' }}>{t('phonesQuickActions')}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button onClick={() => setSessionDialog({ phone: p })} className="sf-btn sf-btn-ghost" style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                        borderRadius: 0, fontSize: 12, fontWeight: 500, textAlign: 'left',
                        color: 'rgba(99,102,241,0.72)', cursor: 'pointer',
                        justifyContent: 'flex-start',
                      }}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="5.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        {t('phonesSessionIdAction')}
                      </button>
                      {p.ig_username && (
                        <button onClick={() => { unlinkIg(p.id); setSelectedPhone(null) }} className="sf-btn sf-btn-ghost" style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                          borderRadius: 0, fontSize: 12, fontWeight: 500, textAlign: 'left',
                          color: 'rgba(99,102,241,0.72)', cursor: 'pointer',
                          justifyContent: 'flex-start',
                        }}>
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5C2 4 4 2 6.5 2s4.5 2 4.5 4.5S9 11 6.5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M2 11l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                          {t('phonesUnlinkIgAction')}
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => { deletePhone(p.id); setSelectedPhone(null) }} className="sf-btn sf-btn-ghost" style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                          borderRadius: 0, fontSize: 12, fontWeight: 500, textAlign: 'left',
                          color: '#F0A0AB', cursor: 'pointer',
                          justifyContent: 'flex-start',
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
      </div>
    </>
  )
}

// ── PhoneCard sub-component ───────────────────────────────────────────────────
function PhoneCard({
  phone, index, isSelected, col, phones,
  relativeTime, setSelectedPhone, setContextMenu, setSessionDialog,
  saveIgUsername, saveRemark, unlinkIg, deletePhone, canDelete,
}: {
  phone: Phone; index: number; isSelected: boolean; col: string
  phones: Phone[]
  relativeTime: (iso: string) => string
  setSelectedPhone: (p: Phone | null) => void
  setContextMenu: (v: { phone: Phone; x: number; y: number } | null) => void
  setSessionDialog: (v: { phone: Phone } | null) => void
  saveIgUsername: (id: string, u: string) => Promise<void>
  saveRemark: (id: string, v: string) => Promise<void>
  unlinkIg: (id: string) => Promise<void>
  deletePhone: (id: string) => Promise<void>
  canDelete: boolean
}) {
  const t = useT()
  const online = phone.status === 'online'

  return (
    <div
      className="sf-card anim-scale-in"
      style={{
        padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 12,
        cursor: 'pointer',
        borderColor: isSelected ? 'rgba(99,102,241,0.45)' : undefined,
        boxShadow: isSelected ? '0 0 0 1px rgba(99,102,241,0.2), 0 8px 32px -8px rgba(0,0,0,0.5)' : undefined,
        position: 'relative', overflow: 'hidden',
      }}
      onClick={() => setSelectedPhone(isSelected ? null : phone)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}
    >
      {/* Subtle top highlight when selected */}
      {isSelected && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Card header: icon + name + status */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Phone icon with gradient */}
        <div style={{
          width: 40, height: 40, borderRadius: 0, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${col}14`,
          border: `1px solid ${col}2e`, color: col,
        }}>
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
            <rect x="3.5" y="1" width="10" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="8.5" cy="13.5" r="0.8" fill="currentColor"/>
          </svg>
        </div>

        {/* Name + serial */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 13, fontWeight: 700, color: '#E9EAF0',
            margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}>
            {phone.phone_name}
          </p>
          {(phone.serial_no || phone.geelark_id) && (
            <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(233,234,240,0.35)', margin: '2px 0 0' }}>
              {phone.serial_no ? `SN: ${phone.serial_no}` : `GL: ${phone.geelark_id}`}
            </p>
          )}
        </div>

        {/* Online/offline status */}
        <StatusDot status={phone.status ?? 'offline'} />
      </div>

      {/* Badges row: IG username + group + IG status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {phone.ig_username ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px 3px 5px', borderRadius: 0,
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.2)',
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700, color: GOLD, flexShrink: 0,
            }}>
              {phone.ig_username.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6366F1' }}>@{phone.ig_username}</span>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.3)', fontStyle: 'normal' }}>{t('phoneIgCellAdd')}</span>
        )}

        {phone.group_name && (
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 0, fontWeight: 600,
            background: 'rgba(99,102,241,0.1)', color: '#6366F1',
            border: '1px solid rgba(99,102,241,0.18)',
          }}>
            {phone.group_name}
          </span>
        )}

        <span style={{ marginLeft: 'auto' }}>
          <IgStatusBadge phone={phone} />
        </span>
      </div>

      {/* Remark (if any) */}
      {phone.remark && (
        <p style={{
          fontSize: 11, color: 'rgba(99,102,241,0.55)', margin: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontStyle: 'normal',
        }}>
          {phone.remark}
        </p>
      )}

      {/* Action buttons */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          className="sf-btn sf-btn-secondary sf-btn-sm"
          onClick={() => setSessionDialog({ phone })}
          title={t('phonesRowSessionId')}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1.5" y="5" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          {t('phoneSession')}
        </button>
        <button
          className="sf-btn sf-btn-ghost sf-btn-sm sf-btn-icon"
          onClick={() => setSelectedPhone(isSelected ? null : phone)}
          title={t('phonesRowViewDetails')}
          style={{ width: 30, height: 30, cursor: 'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <ellipse cx="6.5" cy="6.5" rx="5" ry="3" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="6.5" cy="6.5" r="1.5" fill="currentColor"/>
          </svg>
        </button>
        <button
          className="sf-btn sf-btn-ghost sf-btn-sm sf-btn-icon"
          onClick={e => { e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}
          title="More options"
          style={{ width: 30, height: 30, cursor: 'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="2" cy="6.5" r="1" fill="currentColor"/>
            <circle cx="6.5" cy="6.5" r="1" fill="currentColor"/>
            <circle cx="11" cy="6.5" r="1" fill="currentColor"/>
          </svg>
        </button>
        {canDelete && (
          <button
            className="sf-btn sf-btn-ghost sf-btn-sm sf-btn-icon"
            onClick={() => deletePhone(phone.id)}
            title={t('phonesRowDelete')}
            style={{ width: 30, height: 30, color: '#F0A0AB', cursor: 'pointer' }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3.5h9M5 3.5V2h3v1.5M4.5 3.5l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// Keep legacy PhoneRow for compatibility (used by ActionBtn)
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
  const online = phone.status === 'online'

  const cellStyle: React.CSSProperties = {
    padding: '9px 12px',
    background: isSelected ? 'rgba(99,102,241,0.07)' : 'transparent',
    transition: 'background 0.12s',
  }

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setSelectedPhone(isSelected ? null : phone)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}
      style={{ cursor: 'pointer' }}
    >
      {/* Status dot — first td carries the left accent bar */}
      <td style={{
        ...cellStyle,
        width: 44, textAlign: 'center',
        boxShadow: isSelected ? 'inset 3px 0 0 rgba(99,102,241,0.75)' : 'none',
      }}>
        <span style={{
          display: 'inline-block',
          width: 8, height: 8, borderRadius: '50%',
          background: online ? '#7FD9B8' : 'rgba(233,234,240,0.22)',
          boxShadow: online ? '0 0 0 3px rgba(127,217,184,0.15)' : 'none',
          flexShrink: 0,
        }} />
      </td>

      {/* Phone name + serial */}
      <td style={cellStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Colored avatar */}
          <div style={{
            width: 30, height: 30, borderRadius: 0, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${col}14`,
            border: `1px solid ${col}30`, color: col,
            fontSize: 12, fontWeight: 700,
          }}>
            {phone.phone_name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#E9EAF0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              display: 'inline-block',
              fontSize: 10, padding: '2px 8px', borderRadius: 0, fontWeight: 600,
              background: 'rgba(99,102,241,0.1)', color: '#6366F1',
              border: '1px solid rgba(99,102,241,0.18)',
              whiteSpace: 'nowrap',
            }}>{phone.group_name}</span>
          : <span style={{ color: 'rgba(233,234,240,0.2)' }}>—</span>
        }
      </td>

      {/* IG Username — inline editable */}
      <td style={cellStyle} onClick={e => e.stopPropagation()}>
        <IgCell phone={phone} onSave={saveIgUsername} />
      </td>

      {/* IG Status badge */}
      <td style={cellStyle}>
        <IgStatusBadge phone={phone} />
      </td>

      {/* Note — inline editable */}
      <td style={cellStyle} onClick={e => e.stopPropagation()}>
        <NoteCell phone={phone} onSave={saveRemark} />
      </td>

      {/* Actions — visible on hover or selected */}
      <td style={{ ...cellStyle, padding: '9px 10px' }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3,
          opacity: hovered || isSelected ? 1 : 0,
          transition: 'opacity 0.15s',
        }}>
          <ActionBtn onClick={() => setSessionDialog({ phone })} title={t('phonesRowSessionId')}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="5" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </ActionBtn>
          <button
            className="sf-press"
            style={{
              width: 26, height: 26, borderRadius: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(233,234,240,0.06)', border: '1px solid rgba(233,234,240,0.1)',
              color: 'rgba(233,234,240,0.52)', cursor: 'pointer',
            }}
            title="Plus"
            onClick={e => { e.stopPropagation(); setContextMenu({ phone, x: e.clientX, y: e.clientY }) }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="2" cy="6" r="1" fill="currentColor"/>
              <circle cx="6" cy="6" r="1" fill="currentColor"/>
              <circle cx="10" cy="6" r="1" fill="currentColor"/>
            </svg>
          </button>
          {canDelete && (
            <ActionBtn onClick={() => deletePhone(phone.id)} title={t('phonesRowDelete')} danger>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 3h8M4.5 3V2h3v1M4 3l.4 7h3.2L8 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </ActionBtn>
          )}
        </div>
      </td>
    </tr>
  )
}
