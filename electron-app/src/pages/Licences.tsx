import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { useLicense } from '@/lib/license'
import { useT, useLang } from '@/lib/i18n'

interface LicenseKey {
  id: string
  key: string
  user_id: string | null
  created_at: string
  activated_at: string | null
  expires_at: string | null
  is_active: boolean
  plan: string
  notes: string | null
  user_email?: string
}

const DURATIONS = [
  { label: '24h',       days: 1 },
  { label: '7 jours',   days: 7 },
  { label: '30 jours',  days: 30 },
  { label: '90 jours',  days: 90 },
  { label: '1 an',      days: 365 },
  { label: 'À vie',     days: null },
]

// Cryptographically secure 4-char hex segment (2 random bytes → 4 hex chars)
function hexSegment(): string {
  const bytes = new Uint8Array(2)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function generateKey(): string {
  return `${hexSegment()}-${hexSegment()}-${hexSegment()}-${hexSegment()}`
}

function generateCreditCode(): string {
  return `CR-${hexSegment()}-${hexSegment()}`
}

function daysLeft(expiresAt: string | null, lang: string = 'fr'): string {
  if (!expiresAt) return lang === 'en' ? '∞ lifetime' : '∞ vie'
  const diff = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
  if (diff < 0)  return lang === 'en' ? 'Expired' : 'Expiré'
  if (diff === 0) return lang === 'en' ? 'Expires today' : "Expire aujourd’hui"
  return lang === 'en' ? `${diff}d left` : `${diff}j restants`
}

function daysLeftColor(expiresAt: string | null): string {
  if (!expiresAt) return 'text-purple-400'
  const diff = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
  if (diff < 0)  return 'text-danger'
  if (diff <= 7) return 'text-warn'
  return 'text-ok'
}

interface CreditCode {
  id: string
  code: string
  amount: number
  used_by: string | null
  used_at: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

interface Props { user: User }

type Filter = 'all' | 'active' | 'used' | 'expired' | 'revoked'

export function Licences({ user: _user }: Props) {
  const t = useT()
  const { lang } = useLang()
  const toast = useToast()
  const license = useLicense()
  const [keys, setKeys]       = useState<LicenseKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [genKey, setGenKey]   = useState(generateKey)
  const [duration, setDuration] = useState<number | null>(30)
  const [plan, setPlan]       = useState('standard')
  const [notes, setNotes]     = useState('')
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState<Filter>('all')
  const [copied, setCopied]   = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LicenseKey | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Credit codes
  const [creditCodes, setCreditCodes]   = useState<CreditCode[]>([])
  const [ccLoading, setCcLoading]       = useState(true)
  const [ccCreating, setCcCreating]     = useState(false)
  const [ccGenCode, setCcGenCode]       = useState(generateCreditCode)
  const [ccAmount, setCcAmount]         = useState(500)
  const [ccNotes, setCcNotes]           = useState('')
  const [ccCreateErr, setCcCreateErr]   = useState<string | null>(null)

  const isSuperAdmin = license.isSuperAdmin

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('license_keys')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      const userIds = [...new Set(data.filter(k => k.user_id).map(k => k.user_id!))]
      let emailMap: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds)
        profiles?.forEach(p => { emailMap[p.id] = p.email })
      }
      setKeys(data.map(k => ({ ...k, user_email: k.user_id ? emailMap[k.user_id] : undefined })))
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (isSuperAdmin) load() }, [load, isSuperAdmin])

  const loadCreditCodes = useCallback(async () => {
    setCcLoading(true)
    const { data } = await supabase
      .from('credit_codes')
      .select('*')
      .order('created_at', { ascending: false })
    setCreditCodes(data ?? [])
    setCcLoading(false)
  }, [])

  useEffect(() => { if (isSuperAdmin) loadCreditCodes() }, [loadCreditCodes, isSuperAdmin])

  async function createCreditCode() {
    setCcCreating(true)
    setCcCreateErr(null)
    const { error } = await supabase.from('credit_codes').insert({
      code: ccGenCode,
      amount: ccAmount,
      notes: ccNotes || null,
      created_by: _user.id,
    })
    setCcCreating(false)
    if (error) {
      setCcCreateErr(error.message)
      toast.show({ title: lang === 'en' ? 'Code creation failed' : 'Création du code échouée', body: error.message, kind: 'error' })
    } else {
      setCcGenCode(generateCreditCode())
      setCcNotes('')
      loadCreditCodes()
    }
  }

  async function revokeCreditCode(id: string) {
    const { error } = await supabase.from('credit_codes').update({ is_active: false }).eq('id', id)
    if (error) {
      toast.show({ title: lang === 'en' ? 'Revoke failed' : 'Révocation échouée', body: error.message, kind: 'error' })
      return
    }
    loadCreditCodes()
  }

  async function createKey() {
    setCreating(true)
    const expiresAt = duration !== null
      ? new Date(Date.now() + duration * 86_400_000).toISOString()
      : null
    const { error } = await supabase.from('license_keys').insert({
      key: genKey,
      expires_at: expiresAt,
      plan,
      notes: notes || null,
    })
    setCreating(false)
    if (error) {
      toast.show({ title: lang === 'en' ? 'Key creation failed' : 'Création de la clé échouée', body: error.message, kind: 'error' })
    } else {
      setGenKey(generateKey())
      setNotes('')
      load()
    }
  }

  async function revokeKey(id: string) {
    const { error } = await supabase.from('license_keys').update({ is_active: false }).eq('id', id)
    if (error) {
      toast.show({ title: lang === 'en' ? 'Revoke failed' : 'Révocation échouée', body: error.message, kind: 'error' })
      return
    }
    load()
  }

  async function confirmDeleteKey() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('license_keys').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
    if (error) {
      toast.show({ title: lang === 'en' ? 'Delete failed' : 'Suppression échouée', body: error.message, kind: 'error' })
      return
    }
    load()
  }

  function copyKey(k: string) {
    navigator.clipboard.writeText(k)
    setCopied(k)
    setTimeout(() => setCopied(null), 1500)
  }

  // Super-admin guard — this page is admin-only
  if (!isSuperAdmin) return null

  const isExpired = (k: LicenseKey) => !!k.expires_at && new Date(k.expires_at) < new Date()

  const filtered = keys.filter(k => {
    const q = search.toLowerCase()
    const matchSearch = !q || k.key.toLowerCase().includes(q) || (k.user_email ?? '').toLowerCase().includes(q)
    const matchFilter =
      filter === 'all'     ? true :
      filter === 'active'  ? k.is_active && !k.user_id :
      filter === 'used'    ? k.is_active && !!k.user_id :
      filter === 'expired' ? isExpired(k) :
      /* revoked */          !k.is_active
    return matchSearch && matchFilter
  })

  const stats = {
    total:   keys.length,
    active:  keys.filter(k => k.is_active && !k.user_id).length,
    used:    keys.filter(k => k.is_active && !!k.user_id).length,
    expired: keys.filter(isExpired).length,
  }

  const ccAmountValid = Number.isInteger(ccAmount) && ccAmount >= 1

  return (
    <div className="sf-page anim-page">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="sf-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div className="sf-anim-scale-spring" style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.28)',
            color: '#6366F1',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title" style={{ fontSize: 22, letterSpacing: '-0.03em' }}>
              Admin — {t('licencesTitle')}
            </h1>
            <p className="sf-page-sub">{t('licencesSub')}</p>
          </div>
        </div>
      </div>

      {/* ── Content (scrolls with the page) ─────────────────────────────────── */}
      <div className="flex-1 px-8 pb-10">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 anim-stagger">
          {[
            { label: t('totalKeys'),     value: stats.total,   color: 'text-text',   icon: <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/> },
            { label: t('availableKeys'), value: stats.active,  color: 'text-ok',     icon: <><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></> },
            { label: lang === 'en' ? 'Used' : 'Utilisées', value: stats.used, color: 'text-accent',  icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
            { label: t('expiredKeys'),   value: stats.expired, color: 'text-danger',  icon: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></> },
          ].map(s => (
            <div key={s.label} className="sf-card p-5 text-center">
              <div className="flex justify-center mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={s.color}>
                  {s.icon}
                </svg>
              </div>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[12px] text-text2 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Create key */}
        <div className="sf-card p-6 space-y-5 mt-6 sf-anim-slide-up sf-d150">
          <div className="flex items-center gap-2 mb-1">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <p className="text-[15px] font-bold text-text">{t('createKey')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[12px] text-text2 uppercase tracking-wide">{lang === 'en' ? 'Generated key' : 'Clé générée'}</label>
              <div className="flex gap-2">
                <input
                  value={genKey}
                  onChange={e => setGenKey(e.target.value.toUpperCase())}
                  className="sf-input flex-1 font-mono tracking-widest text-[13px]"
                />
                <button
                  onClick={() => setGenKey(generateKey())}
                  className="sf-btn sf-btn-ghost cursor-pointer px-3"
                  title={lang === 'en' ? 'Regenerate' : 'Régénérer'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[12px] text-text2 uppercase tracking-wide">{t('keyDuration')}</label>
              <div className="flex gap-2 flex-wrap">
                {DURATIONS.map(d => (
                  <button
                    key={d.label}
                    onClick={() => setDuration(d.days)}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer ${duration === d.days ? 'text-white' : 'text-text2 hover:text-text'}`}
                    style={duration === d.days ? { background: 'linear-gradient(130deg,#6366F1,#6366F1)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[12px] text-text2 uppercase tracking-wide">{t('keyPlan')}</label>
              <div className="flex gap-2">
                {['standard', 'pro', 'organisation'].map(p => (
                  <button
                    key={p}
                    onClick={() => setPlan(p)}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium capitalize transition-all cursor-pointer ${plan === p ? 'text-white' : 'text-text2 hover:text-text'}`}
                    style={plan === p ? { background: 'rgba(99,102,241,0.3)', border: '1px solid rgba(99,102,241,0.5)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[12px] text-text2 uppercase tracking-wide">{t('keyNotes')}</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex: Discord @pseudo" />
            </div>
          </div>
          <Button onClick={createKey} disabled={creating || !genKey.trim()} className="w-full">
            {creating ? t('loading') : t('createKeyBtn')}
          </Button>
        </div>

        {/* List */}
        <div className="space-y-4 mt-6 sf-anim-slide-up sf-d200">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('searchKeyOrEmail')}
              className="flex-1 min-w-[200px]"
            />
            {(['all', 'active', 'used', 'expired', 'revoked'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium capitalize transition-all cursor-pointer ${filter === f ? 'text-white' : 'text-text2 hover:text-text'}`}
                style={filter === f ? { background: 'rgba(99,102,241,0.3)', border: '1px solid rgba(99,102,241,0.4)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                {f === 'all' ? (lang === 'en' ? 'All' : 'Toutes')
                  : f === 'active' ? t('keyAvailable')
                  : f === 'used' ? t('keyActivated')
                  : f === 'expired' ? t('keyExpired')
                  : t('keyRevoked')}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="sf-card p-10 text-center">
              <div className="sf-spinner mx-auto" />
              <p className="text-[13px] text-text2 mt-3">{t('loading')}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sf-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m17 5 3 3"/><path d="m14 8 3 3"/>
              </svg>
              <p>{t('noKeys')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(k => (
                <div key={k.id}
                  className={`sf-card px-5 py-3.5 flex flex-wrap items-center gap-3 transition-opacity ${!k.is_active ? 'opacity-50' : ''}`}>
                  {/* Key */}
                  <button
                    onClick={() => copyKey(k.key)}
                    className="font-mono text-[13px] text-text tracking-widest hover:text-accent transition-colors flex items-center gap-1.5 cursor-pointer"
                    title={lang === 'en' ? 'Copy' : 'Copier'}
                  >
                    {k.key}
                    {copied === k.key ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-ok">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-text2">
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                      </svg>
                    )}
                  </button>

                  {/* Plan badge */}
                  <span className="sf-badge sf-badge-accent capitalize">{k.plan}</span>

                  {/* Status */}
                  {!k.is_active ? (
                    <span className="sf-badge sf-badge-danger">{t('keyRevoked')}</span>
                  ) : k.user_id ? (
                    <span className="sf-badge sf-badge-muted">{t('keyActivated')}</span>
                  ) : (
                    <span className="sf-badge sf-badge-ok">{t('keyAvailable')}</span>
                  )}

                  {/* Expiry */}
                  <span className={`text-[13px] font-medium ml-auto ${daysLeftColor(k.expires_at)}`}>
                    {daysLeft(k.expires_at, lang)}
                  </span>

                  {/* User email */}
                  {k.user_email && (
                    <span className="text-[12px] text-text2 truncate max-w-[160px]">{k.user_email}</span>
                  )}

                  {/* Notes */}
                  {k.notes && <span className="text-[12px] text-text3 italic truncate max-w-[120px]">{k.notes}</span>}

                  {/* Actions */}
                  <div className="flex gap-1">
                    {k.is_active && (
                      <button
                        onClick={() => revokeKey(k.id)}
                        className="sf-btn sf-btn-ghost text-[12px] px-3 py-1.5 text-warn hover:bg-warn/10 cursor-pointer"
                      >
                        {t('revoke')}
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(k)}
                      className="sf-btn sf-btn-ghost text-[12px] px-3 py-1.5 text-danger hover:bg-danger/10 cursor-pointer"
                    >
                      {t('delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Credit Codes ──────────────────────────────────────────────────── */}
        <div className="mt-10 space-y-5 sf-reveal">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(6,182,212,0.1))', border: '1px solid rgba(99,102,241,0.2)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>
              </svg>
            </div>
            <div>
              <h2 className="text-[18px] font-black text-text leading-none">{lang === 'en' ? 'Credit codes' : 'Codes de crédits'}</h2>
              <p className="text-[13px] text-text2 mt-0.5">{lang === 'en' ? 'Generate codes that users can redeem for credits' : 'Génère des codes que les utilisateurs peuvent échanger contre des crédits'}</p>
            </div>
          </div>

          {/* Create form */}
          <div className="sf-card p-6 space-y-5">
            <p className="text-[15px] font-bold text-text mb-1">{lang === 'en' ? 'New code' : 'Nouveau code'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="space-y-2">
                <p className="text-[12px] text-text2 uppercase tracking-wider">Code</p>
                <Input value={ccGenCode} onChange={e => setCcGenCode(e.target.value.toUpperCase())}
                  className="font-mono text-[13px]" />
                <button onClick={() => setCcGenCode(generateCreditCode())}
                  className="text-[12px] text-accent hover:underline cursor-pointer flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
                  </svg>
                  {lang === 'en' ? 'Regenerate' : 'Régénérer'}
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-[12px] text-text2 uppercase tracking-wider">{lang === 'en' ? 'Amount (credits)' : 'Montant (crédits)'}</p>
                <Input type="number" value={ccAmount} onChange={e => setCcAmount(Number(e.target.value))}
                  min={1} step={1} className="text-[13px]" />
                {!ccAmountValid && (
                  <p className="text-[12px] text-danger">{lang === 'en' ? 'Enter a whole number ≥ 1.' : 'Saisis un nombre entier ≥ 1.'}</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-[12px] text-text2 uppercase tracking-wider">Notes</p>
                <Input value={ccNotes} onChange={e => setCcNotes(e.target.value)}
                  placeholder={lang === 'en' ? 'Optional…' : 'Optionnel…'} className="text-[13px]" />
              </div>
            </div>
            <Button onClick={createCreditCode} disabled={ccCreating || !ccGenCode.trim() || !ccAmountValid}>
              {ccCreating ? t('loading') : (lang === 'en' ? '+ Create code' : '+ Créer le code')}
            </Button>
            {ccCreateErr && (
              <p className="text-[13px] text-danger mt-2">{t('error')} : {ccCreateErr}</p>
            )}
          </div>

          {/* Code list */}
          <div className="sf-card overflow-hidden">
            {ccLoading ? (
              <div className="p-10 text-center">
                <div className="sf-spinner mx-auto" />
                <p className="text-[13px] text-text2 mt-3">{t('loading')}</p>
              </div>
            ) : creditCodes.length === 0 ? (
              <div className="sf-empty">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>
                </svg>
                <p>{lang === 'en' ? 'No codes created.' : 'Aucun code créé.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {creditCodes.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                    <code className="flex-1 font-mono text-[13px] text-text">{c.code}</code>
                    <span className="text-[13px] font-bold text-accent">+{c.amount} {lang === 'en' ? 'credits' : 'crédits'}</span>
                    {c.used_by ? (
                      <span className="sf-badge sf-badge-muted">{lang === 'en' ? 'Used' : 'Utilisé'}</span>
                    ) : c.is_active ? (
                      <span className="sf-badge sf-badge-ok">{t('keyAvailable')}</span>
                    ) : (
                      <span className="sf-badge sf-badge-danger">{t('keyRevoked')}</span>
                    )}
                    {c.notes && <span className="text-[12px] text-text2 italic">{c.notes}</span>}
                    <button
                      onClick={() => { navigator.clipboard.writeText(c.code); setCopied(c.code); setTimeout(() => setCopied(null), 1500) }}
                      className="sf-btn sf-btn-ghost text-[12px] px-3 py-1.5 cursor-pointer"
                      style={{ color: copied === c.code ? 'var(--ok)' : 'var(--accent)' }}
                    >
                      {copied === c.code ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : t('copy')}
                    </button>
                    {c.is_active && !c.used_by && (
                      <button
                        onClick={() => revokeCreditCode(c.id)}
                        className="sf-btn sf-btn-ghost text-[12px] px-3 py-1.5 text-warn hover:bg-warn/10 cursor-pointer"
                      >
                        {t('revoke')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={lang === 'en' ? 'Delete this license key?' : 'Supprimer cette clé de licence ?'}
        message={deleteTarget ? (lang === 'en'
          ? `"${deleteTarget.key}" will be permanently deleted. This cannot be undone.`
          : `« ${deleteTarget.key} » sera définitivement supprimée. Cette action est irréversible.`) : undefined}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        danger
        busy={deleting}
        onConfirm={confirmDeleteKey}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
