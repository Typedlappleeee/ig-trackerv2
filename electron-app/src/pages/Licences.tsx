import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { useLicense } from '@/lib/license'
import { useT, useLang, useTr } from '@/lib/i18n'

interface LicenseKey {
  id: string
  key: string
  user_id: string | null
  created_at: string
  activated_at: string | null
  expires_at: string | null
  is_active: boolean
  plan: string
  blowsome?: boolean
  notes: string | null
  user_email?: string
}

const DURATIONS = [
  { label: '24h',       en: '24h',        days: 1 },
  { label: '7 jours',   en: '7 days',     days: 7 },
  { label: '30 jours',  en: '30 days',    days: 30 },
  { label: '90 jours',  en: '90 days',    days: 90 },
  { label: '1 an',      en: '1 year',     days: 365 },
  { label: 'À vie',     en: 'Lifetime',   days: null },
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
  const tr = useTr()
  const { lang } = useLang()
  const toast = useToast()
  const license = useLicense()
  const [keys, setKeys]       = useState<LicenseKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [genKey, setGenKey]   = useState(generateKey)
  const [duration, setDuration] = useState<number | null>(30)
  const [plan, setPlan]       = useState('standard')
  const [blowsome, setBlowsome] = useState(false)   // add-on VIP Blowsome
  const [notes, setNotes]     = useState('')
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState<Filter>('all')
  const [copied, setCopied]   = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LicenseKey | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Extension de durée (ajout de jours) sur une clé existante.
  const [extendTarget, setExtendTarget] = useState<string | null>(null)  // id de la clé dont le panneau est ouvert
  const [extendingId, setExtendingId]   = useState<string | null>(null)  // id en cours de mise à jour
  const [customDays, setCustomDays]     = useState<string>('')

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
    // On tente avec toutes les colonnes optionnelles (duration_days pour le cumul
    // de durée, blowsome pour l'add-on VIP). Si une migration n'est pas encore
    // passée (colonne absente), on retire la colonne fautive et on réessaie → pas
    // de blocage de la création de clé.
    const row: Record<string, unknown> = { key: genKey, expires_at: expiresAt, plan, notes: notes || null, duration_days: duration, blowsome }
    let error: { message: string } | null = null
    for (let i = 0; i < 3; i++) {
      const res = await supabase.from('license_keys').insert(row)
      error = res.error
      if (!error) break
      const m = error.message.match(/(duration_days|blowsome)/)
      if (m && m[1] in row) { delete row[m[1]]; continue }
      break
    }
    setCreating(false)
    if (error) {
      toast.show({ title: lang === 'en' ? 'Key creation failed' : 'Création de la clé échouée', body: error.message, kind: 'error' })
    } else {
      setGenKey(generateKey())
      setNotes('')
      load()
    }
  }

  // Active/désactive l'add-on Blowsome sur une clé EXISTANTE.
  async function toggleBlowsome(k: LicenseKey) {
    const next = !k.blowsome
    const { error } = await supabase.from('license_keys').update({ blowsome: next }).eq('id', k.id)
    if (error) {
      const msg = /blowsome/.test(error.message)
        ? (lang === 'en' ? 'Run migration 20260722_license_blowsome.sql first.' : 'Lance d\'abord la migration 20260722_license_blowsome.sql.')
        : error.message
      toast.show({ title: lang === 'en' ? 'Update failed' : 'Mise à jour échouée', body: msg, kind: 'error' })
      return
    }
    setKeys(prev => prev.map(x => x.id === k.id ? { ...x, blowsome: next } : x))
    toast.show({ title: next ? tr('Blowsome activé ✦', 'Blowsome enabled ✦') : tr('Blowsome retiré', 'Blowsome removed'), kind: 'ok' })
  }

  async function revokeKey(id: string) {
    const { error } = await supabase.from('license_keys').update({ is_active: false }).eq('id', id)
    if (error) {
      toast.show({ title: lang === 'en' ? 'Revoke failed' : 'Révocation échouée', body: error.message, kind: 'error' })
      return
    }
    load()
  }

  // Ajoute (ou retire, si négatif) des jours à une clé existante. On repart de
  // l'expiration actuelle si elle est dans le futur, sinon de maintenant, pour
  // qu'ajouter des jours à une clé expirée la réactive à partir d'aujourd'hui.
  async function extendKey(k: LicenseKey, days: number) {
    if (!days) return
    if (!k.expires_at) {
      toast.show({ title: lang === 'en' ? 'Lifetime key' : 'Clé à vie', body: lang === 'en' ? 'This key never expires — nothing to add.' : 'Cette clé est déjà à vie — rien à ajouter.', kind: 'info' })
      return
    }
    setExtendingId(k.id)
    const now = Date.now()
    const base = Math.max(now, new Date(k.expires_at).getTime())
    const next = base + days * 86_400_000
    // On ne descend jamais sous « maintenant » (une clé ne peut pas expirer dans le passé par ce biais).
    const newExpiresAt = new Date(Math.max(now, next)).toISOString()
    const { error } = await supabase.from('license_keys')
      .update({ expires_at: newExpiresAt, is_active: true })
      .eq('id', k.id)
    setExtendingId(null)
    if (error) {
      toast.show({ title: lang === 'en' ? 'Update failed' : 'Mise à jour échouée', body: error.message, kind: 'error' })
      return
    }
    setExtendTarget(null)
    setCustomDays('')
    toast.show({
      title: lang === 'en' ? 'Key updated' : 'Clé mise à jour',
      body: (days > 0 ? '+' : '') + `${days} ${lang === 'en' ? 'day(s)' : 'jour(s)'} — ${daysLeft(newExpiresAt, lang)}`,
      kind: 'ok',
    })
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
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title sf-title-grad">Admin — {t('licencesTitle')}</h1>
            <p className="sf-page-sub">{t('licencesSub')}</p>
          </div>
        </div>
        <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
          <span className="sf-status-chip">
            <span className="sf-status-dot" />
            {loading ? t('loading') : `${stats.total} ${lang === 'en' ? 'keys' : 'clés'}`}
          </span>
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
            loading ? (
              <div key={s.label} className="sf-stat-card">
                <div className="sf-skeleton sf-skeleton-line" style={{ width: 36, height: 36, borderRadius: 'var(--r-md)' }} />
                <div className="sf-skeleton sf-skeleton-text" style={{ width: '50%', height: 26, marginTop: 12 }} />
                <div className="sf-skeleton sf-skeleton-text" style={{ width: '70%', marginTop: 8 }} />
              </div>
            ) : (
            <div key={s.label} className="sf-stat-card sf-card-lift">
              <div className="sf-stat-icon" style={{ marginBottom: 10 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={s.color}>
                  {s.icon}
                </svg>
              </div>
              <p className={`text-3xl font-black sf-tabular ${s.color}`}>{s.value}</p>
              <p className="text-[11px] font-semibold text-text2 mt-1 uppercase" style={{ letterSpacing: '0.04em' }}>{s.label}</p>
            </div>
            )
          ))}
        </div>

        {/* Create key */}
        <div className="sf-card p-6 space-y-5 mt-6 sf-anim-slide-up sf-d150">
          <p className="sf-section-label">{t('createKey')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>{lang === 'en' ? 'Generated key' : 'Clé générée'}</label>
              <div className="flex gap-2">
                <input
                  value={genKey}
                  onChange={e => setGenKey(e.target.value.toUpperCase())}
                  className="sf-input flex-1 font-mono tracking-widest text-[13px]"
                />
                <button
                  onClick={() => setGenKey(generateKey())}
                  className="sf-btn sf-btn-secondary sf-btn-icon cursor-pointer"
                  title={lang === 'en' ? 'Regenerate' : 'Régénérer'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>{t('keyDuration')}</label>
              <div className="sf-segment" style={{ flexWrap: 'wrap' }}>
                {DURATIONS.map(d => (
                  <button
                    key={d.label}
                    onClick={() => setDuration(d.days)}
                    className={`sf-segment-item${duration === d.days ? ' is-active' : ''}`}
                  >
                    {tr(d.label, d.en)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>{t('keyPlan')}</label>
              <div className="sf-segment" style={{ flexWrap: 'wrap' }}>
                {['standard', 'pro', 'organisation'].map(p => (
                  <button
                    key={p}
                    onClick={() => setPlan(p)}
                    className={`sf-segment-item capitalize${plan === p ? ' is-active' : ''}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>{tr('Add-on', 'Add-on')}</label>
              <button
                type="button"
                onClick={() => setBlowsome(v => !v)}
                className="w-full flex items-center justify-between cursor-pointer"
                style={{ padding: '10px 13px', borderRadius: 11, background: blowsome ? 'rgba(236,72,153,0.12)' : 'var(--surface-2)', border: `1px solid ${blowsome ? 'rgba(236,72,153,0.4)' : 'var(--border)'}` }}
              >
                <span style={{ textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, background: 'linear-gradient(90deg,#EC4899,#8B5CF6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>✦ Blowsome</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-4)', marginTop: 2 }}>{tr('Débloque l\'onglet Blowsome (agence VIP)', 'Unlocks the Blowsome tab (VIP agency)')}</span>
                </span>
                <span className={`sf-toggle-track ${blowsome ? 'on' : 'off'}`} style={{ flexShrink: 0 }}>
                  <span className="sf-toggle-thumb" />
                </span>
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>{t('keyNotes')}</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={tr('ex: Discord @pseudo', 'e.g. Discord @handle')} />
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
            <div className="sf-segment" style={{ flexWrap: 'wrap' }}>
              {(['all', 'active', 'used', 'expired', 'revoked'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`sf-segment-item capitalize${filter === f ? ' is-active' : ''}`}
                >
                  {f === 'all' ? (lang === 'en' ? 'All' : 'Toutes')
                    : f === 'active' ? t('keyAvailable')
                    : f === 'used' ? t('keyActivated')
                    : f === 'expired' ? t('keyExpired')
                    : t('keyRevoked')}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="sf-card px-5 py-3.5 flex items-center gap-3">
                  <div className="sf-skeleton sf-skeleton-text" style={{ width: 150 }} />
                  <div className="sf-skeleton sf-skeleton-text" style={{ width: 60, height: 18 }} />
                  <div className="sf-skeleton sf-skeleton-text" style={{ width: 70, marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="sf-empty">
              <div className="sf-empty-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m17 5 3 3"/><path d="m14 8 3 3"/>
                </svg>
              </div>
              <p className="sf-empty-title">{t('noKeys')}</p>
              <p className="sf-empty-desc">{lang === 'en' ? 'Generate a license key above to get started.' : 'Génère une clé de licence ci-dessus pour commencer.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(k => (
                <div key={k.id} className="sf-card overflow-hidden">
                <div
                  className={`px-5 py-3.5 flex flex-wrap items-center gap-3 transition-opacity ${!k.is_active ? 'opacity-50' : ''}`}>
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
                  {k.blowsome && (
                    <span className="sf-badge" style={{ background: 'linear-gradient(90deg,rgba(236,72,153,0.18),rgba(139,92,246,0.18))', border: '1px solid rgba(236,72,153,0.4)', color: '#F472B6', fontWeight: 700 }}>✦ Blowsome</span>
                  )}

                  {/* Status */}
                  {!k.is_active ? (
                    <span className="sf-badge sf-badge-danger">{t('keyRevoked')}</span>
                  ) : k.user_id ? (
                    <span className="sf-badge sf-badge-muted">{t('keyActivated')}</span>
                  ) : (
                    <span className="sf-badge sf-badge-ok">{t('keyAvailable')}</span>
                  )}

                  {/* Expiry */}
                  <span className={`text-[13px] font-medium ml-auto ${daysLeftColor(k.expires_at)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
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
                    <button
                      onClick={() => toggleBlowsome(k)}
                      className="sf-btn sf-btn-ghost text-[12px] px-3 py-1.5 cursor-pointer"
                      style={{ color: k.blowsome ? '#F472B6' : 'var(--text-3)' }}
                      title={k.blowsome ? tr('Retirer Blowsome', 'Remove Blowsome') : tr('Ajouter Blowsome', 'Add Blowsome')}
                    >
                      {k.blowsome ? tr('✦ Blowsome ✓', '✦ Blowsome ✓') : tr('✦ Blowsome', '✦ Blowsome')}
                    </button>
                    {k.expires_at && (
                      <button
                        onClick={() => { setExtendTarget(extendTarget === k.id ? null : k.id); setCustomDays('') }}
                        className={`sf-btn sf-btn-ghost text-[12px] px-3 py-1.5 cursor-pointer ${extendTarget === k.id ? 'text-accent' : 'text-text2 hover:text-accent'}`}
                        title={lang === 'en' ? 'Add days' : 'Ajouter des jours'}
                      >
                        {lang === 'en' ? '+ Days' : '+ Jours'}
                      </button>
                    )}
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

                {/* Panneau d'extension de durée */}
                {extendTarget === k.id && (
                  <div className="px-5 py-3.5 flex flex-wrap items-center gap-2 border-t border-border"
                    style={{ background: 'rgba(99,102,241,0.05)' }}>
                    <span className="text-[12px] font-semibold text-text2 mr-1">
                      {lang === 'en' ? 'Add:' : 'Ajouter :'}
                    </span>
                    {[1, 2, 7, 30, 90, 365].map(d => (
                      <button
                        key={d}
                        disabled={extendingId === k.id}
                        onClick={() => extendKey(k, d)}
                        className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-text2 hover:text-white transition-all cursor-pointer disabled:opacity-40"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(99,102,241,0.25)' }}
                      >
                        +{d}{lang === 'en' ? 'd' : 'j'}
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-1">
                      <input
                        type="number"
                        value={customDays}
                        onChange={e => setCustomDays(e.target.value)}
                        placeholder={lang === 'en' ? 'custom' : 'perso'}
                        className="sf-input w-[90px] text-[13px] py-1.5"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                        onKeyDown={e => { if (e.key === 'Enter' && Number(customDays)) extendKey(k, Math.trunc(Number(customDays))) }}
                      />
                      <button
                        disabled={extendingId === k.id || !Number.isFinite(Number(customDays)) || Math.trunc(Number(customDays)) === 0}
                        onClick={() => extendKey(k, Math.trunc(Number(customDays)))}
                        className="sf-btn sf-btn-primary text-[12px] px-3 py-1.5 cursor-pointer disabled:opacity-40"
                      >
                        {extendingId === k.id ? '…' : (lang === 'en' ? 'Apply' : 'Appliquer')}
                      </button>
                    </div>
                    <span className="text-[11px] text-text3 ml-auto">
                      {lang === 'en' ? 'Negative value removes days' : 'Valeur négative pour retirer des jours'}
                    </span>
                  </div>
                )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Credit Codes ──────────────────────────────────────────────────── */}
        <div className="mt-10 space-y-5 sf-reveal">
          <div className="sf-cluster" style={{ gap: 12 }}>
            <div className="sf-page-icon sf-page-icon-sm" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 className="text-[16px] font-black sf-grad-text leading-none">{lang === 'en' ? 'Credit codes' : 'Codes de crédits'}</h2>
              <p className="text-[13px] text-text2 mt-0.5">{lang === 'en' ? 'Generate codes that users can redeem for credits' : 'Génère des codes que les utilisateurs peuvent échanger contre des crédits'}</p>
            </div>
          </div>

          {/* Create form */}
          <div className="sf-card p-6 space-y-5">
            <p className="sf-section-label">{lang === 'en' ? 'New code' : 'Nouveau code'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>Code</p>
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
                <p className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>{lang === 'en' ? 'Amount (credits)' : 'Montant (crédits)'}</p>
                <Input type="number" value={ccAmount} onChange={e => setCcAmount(Number(e.target.value))}
                  min={1} step={1} className={`text-[13px] sf-tabular${!ccAmountValid ? ' is-invalid' : ''}`} />
                {!ccAmountValid && (
                  <p className="sf-field-error">{lang === 'en' ? 'Enter a whole number ≥ 1.' : 'Saisis un nombre entier ≥ 1.'}</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>Notes</p>
                <Input value={ccNotes} onChange={e => setCcNotes(e.target.value)}
                  placeholder={lang === 'en' ? 'Optional…' : 'Optionnel…'} className="text-[13px]" />
              </div>
            </div>
            <Button onClick={createCreditCode} disabled={ccCreating || !ccGenCode.trim() || !ccAmountValid}>
              {ccCreating ? t('loading') : (lang === 'en' ? '+ Create code' : '+ Créer le code')}
            </Button>
            {ccCreateErr && (
              <div className="sf-banner is-danger" role="alert">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{t('error')} : {ccCreateErr}</span>
              </div>
            )}
          </div>

          {/* Code list */}
          <div className="sf-card overflow-hidden">
            {ccLoading ? (
              <div className="divide-y divide-border">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="sf-skeleton sf-skeleton-text" style={{ width: 120 }} />
                    <div className="sf-skeleton sf-skeleton-text" style={{ width: 80, marginLeft: 'auto' }} />
                    <div className="sf-skeleton sf-skeleton-text" style={{ width: 50, height: 18 }} />
                  </div>
                ))}
              </div>
            ) : creditCodes.length === 0 ? (
              <div className="sf-empty">
                <div className="sf-empty-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>
                  </svg>
                </div>
                <p className="sf-empty-title">{lang === 'en' ? 'No codes created.' : 'Aucun code créé.'}</p>
                <p className="sf-empty-desc">{lang === 'en' ? 'Create a credit code above to let users redeem credits.' : 'Crée un code de crédits ci-dessus pour permettre aux utilisateurs de les échanger.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {creditCodes.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                    <code className="flex-1 font-mono text-[13px] text-text">{c.code}</code>
                    <span className="text-[13px] font-bold text-accent" style={{ fontVariantNumeric: 'tabular-nums' }}>+{c.amount} {lang === 'en' ? 'credits' : 'crédits'}</span>
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
