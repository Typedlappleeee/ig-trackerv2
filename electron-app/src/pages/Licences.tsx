import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'

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
  { label: '7 jours',   days: 7 },
  { label: '30 jours',  days: 30 },
  { label: '90 jours',  days: 90 },
  { label: '1 an',      days: 365 },
  { label: 'À vie',     days: null },
]

function generateKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `${seg()}-${seg()}-${seg()}-${seg()}`
}

function daysLeft(expiresAt: string | null): string {
  if (!expiresAt) return '∞ vie'
  const diff = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
  if (diff < 0)  return 'Expiré'
  if (diff === 0) return 'Expire aujourd\'hui'
  return `${diff}j restants`
}

function daysLeftColor(expiresAt: string | null): string {
  if (!expiresAt) return 'text-purple-400'
  const diff = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
  if (diff < 0)  return 'text-red-400'
  if (diff <= 7) return 'text-orange-400'
  return 'text-green-400'
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

function generateCreditCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `CR-${seg()}-${seg()}`
}

interface Props { user: User }

export function Licences({ user: _user }: Props) {
  const [keys, setKeys]       = useState<LicenseKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [genKey, setGenKey]   = useState(generateKey)
  const [duration, setDuration] = useState<number | null>(30)
  const [plan, setPlan]       = useState('standard')
  const [notes, setNotes]     = useState('')
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState<'all' | 'active' | 'used' | 'expired'>('all')
  const [copied, setCopied]   = useState<string | null>(null)

  // Credit codes
  const [creditCodes, setCreditCodes]   = useState<CreditCode[]>([])
  const [ccLoading, setCcLoading]       = useState(true)
  const [ccCreating, setCcCreating]     = useState(false)
  const [ccGenCode, setCcGenCode]       = useState(generateCreditCode)
  const [ccAmount, setCcAmount]         = useState(500)
  const [ccNotes, setCcNotes]           = useState('')
  const [ccCreateErr, setCcCreateErr]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('license_keys')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      // Fetch emails for activated keys
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

  useEffect(() => { load() }, [load])

  const loadCreditCodes = useCallback(async () => {
    setCcLoading(true)
    const { data } = await supabase
      .from('credit_codes')
      .select('*')
      .order('created_at', { ascending: false })
    setCreditCodes(data ?? [])
    setCcLoading(false)
  }, [])

  useEffect(() => { loadCreditCodes() }, [loadCreditCodes])

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
    } else {
      setCcGenCode(generateCreditCode())
      setCcNotes('')
      loadCreditCodes()
    }
  }

  async function revokeCreditCode(id: string) {
    await supabase.from('credit_codes').update({ is_active: false }).eq('id', id)
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
    if (!error) {
      setGenKey(generateKey())
      setNotes('')
      load()
    }
  }

  async function revokeKey(id: string) {
    await supabase.from('license_keys').update({ is_active: false }).eq('id', id)
    load()
  }

  async function deleteKey(id: string) {
    await supabase.from('license_keys').delete().eq('id', id)
    load()
  }

  function copyKey(k: string) {
    navigator.clipboard.writeText(k)
    setCopied(k)
    setTimeout(() => setCopied(null), 1500)
  }

  const filtered = keys.filter(k => {
    const q = search.toLowerCase()
    const matchSearch = !q || k.key.toLowerCase().includes(q) || (k.user_email ?? '').toLowerCase().includes(q)
    const matchFilter =
      filter === 'all'     ? true :
      filter === 'active'  ? k.is_active && !k.user_id :
      filter === 'used'    ? k.is_active && !!k.user_id :
      (!!k.expires_at && new Date(k.expires_at) < new Date()) || !k.is_active
    return matchSearch && matchFilter
  })

  const stats = {
    total:   keys.length,
    active:  keys.filter(k => k.is_active && !k.user_id).length,
    used:    keys.filter(k => k.is_active && !!k.user_id).length,
    expired: keys.filter(k => !!k.expires_at && new Date(k.expires_at) < new Date()).length,
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Page header */}
      <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-[28px] font-black text-white leading-none">🛡 Admin — Licences</h1>
          <p className="text-[13px] text-text2 mt-0.5">Gère les clés d'accès à ScaleFlow</p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-10 pb-10">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6 mt-8">
          {[
            { label: 'Total',     value: stats.total,   color: 'text-text' },
            { label: 'Dispo',     value: stats.active,  color: 'text-green-400' },
            { label: 'Utilisées', value: stats.used,    color: 'text-blue-400' },
            { label: 'Expirées',  value: stats.expired, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.12)' }}>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[12px] text-text2 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Create key */}
        <div className="rounded-2xl p-6 space-y-5 mt-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <p className="text-[15px] font-bold text-white mb-4">Créer une clé</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[12px] text-text2 uppercase tracking-wide">Clé générée</label>
              <div className="flex gap-2">
                <input
                  value={genKey}
                  onChange={e => setGenKey(e.target.value.toUpperCase())}
                  className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-mono tracking-widest focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                />
                <button onClick={() => setGenKey(generateKey())} className="px-4 py-2.5 rounded-xl text-[13px] text-text2 hover:text-text transition-colors" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  ↺
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[12px] text-text2 uppercase tracking-wide">Durée</label>
              <div className="flex gap-2 flex-wrap">
                {DURATIONS.map(d => (
                  <button
                    key={d.label}
                    onClick={() => setDuration(d.days)}
                    className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-all ${duration === d.days ? 'text-white' : 'text-text2 hover:text-text'}`}
                    style={duration === d.days ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[12px] text-text2 uppercase tracking-wide">Plan</label>
              <div className="flex gap-2">
                {['standard', 'pro', 'lifetime'].map(p => (
                  <button
                    key={p}
                    onClick={() => setPlan(p)}
                    className={`px-4 py-2 rounded-xl text-[13px] font-medium capitalize transition-all ${plan === p ? 'text-white' : 'text-text2 hover:text-text'}`}
                    style={plan === p ? { background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.5)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[12px] text-text2 uppercase tracking-wide">Notes (optionnel)</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex: Discord @pseudo" />
            </div>
          </div>
          <Button onClick={createKey} disabled={creating} className="w-full">
            {creating ? 'Création…' : '+ Créer la clé'}
          </Button>
        </div>

        {/* List */}
        <div className="space-y-4 mt-8">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une clé ou email…"
              className="flex-1 min-w-[200px]"
            />
            {(['all', 'active', 'used', 'expired'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2.5 rounded-xl text-[13px] font-medium capitalize transition-all ${filter === f ? 'text-white' : 'text-text2 hover:text-text'}`}
                style={filter === f ? { background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.4)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                {f === 'all' ? 'Toutes' : f === 'active' ? 'Disponibles' : f === 'used' ? 'Utilisées' : 'Expirées'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[13px] text-text2">Chargement…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-base font-bold text-white mb-2">🔑</p>
              <p className="text-[13px] text-text2">Aucune clé trouvée</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(k => (
                <div key={k.id} className={`rounded-xl px-5 py-4 flex flex-wrap items-center gap-3 transition-opacity ${!k.is_active ? 'opacity-50' : ''}`}
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.1)' }}>
                  {/* Key */}
                  <button
                    onClick={() => copyKey(k.key)}
                    className="font-mono text-[13px] text-text tracking-widest hover:text-accent transition-colors flex items-center gap-1.5"
                    title="Copier"
                  >
                    {k.key}
                    <span className="text-[12px] text-text2">{copied === k.key ? '✓' : '⎘'}</span>
                  </button>

                  {/* Plan badge */}
                  <span className="text-[12px] px-2 py-0.5 rounded-full capitalize font-medium" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                    {k.plan}
                  </span>

                  {/* Status */}
                  {!k.is_active ? (
                    <span className="text-[12px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Révoquée</span>
                  ) : k.user_id ? (
                    <span className="text-[12px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">Activée</span>
                  ) : (
                    <span className="text-[12px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">Disponible</span>
                  )}

                  {/* Expiry */}
                  <span className={`text-[13px] font-medium ml-auto ${daysLeftColor(k.expires_at)}`}>
                    {daysLeft(k.expires_at)}
                  </span>

                  {/* User email */}
                  {k.user_email && (
                    <span className="text-[12px] text-text2 truncate max-w-[160px]">{k.user_email}</span>
                  )}

                  {/* Notes */}
                  {k.notes && <span className="text-[12px] text-text2 italic truncate max-w-[120px]">{k.notes}</span>}

                  {/* Actions */}
                  <div className="flex gap-1">
                    {k.is_active && (
                      <button
                        onClick={() => revokeKey(k.id)}
                        className="text-[12px] px-3 py-1.5 rounded-lg text-orange-400 hover:bg-orange-400/10 transition-colors"
                      >
                        Révoquer
                      </button>
                    )}
                    <button
                      onClick={() => deleteKey(k.id)}
                      className="text-[12px] px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Credit Codes ──────────────────────────────────────────────────── */}
        <div className="mt-10 space-y-6">
          <div>
            <h2 className="text-[22px] font-black text-white leading-none">💎 Codes crédit</h2>
            <p className="text-[13px] text-text2 mt-0.5">Génère des codes que les utilisateurs peuvent échanger contre des crédits</p>
          </div>

          {/* Create form */}
          <div className="rounded-2xl p-6 space-y-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.18)' }}>
            <p className="text-[15px] font-bold text-white mb-4">Nouveau code</p>
            <div className="grid grid-cols-3 gap-5">
              <div className="space-y-2">
                <p className="text-[12px] text-text2 uppercase tracking-wider">Code</p>
                <Input value={ccGenCode} onChange={e => setCcGenCode(e.target.value.toUpperCase())}
                  className="font-mono text-[13px]" />
                <button onClick={() => setCcGenCode(generateCreditCode())}
                  className="text-[12px] text-accent hover:underline">↺ Régénérer</button>
              </div>
              <div className="space-y-2">
                <p className="text-[12px] text-text2 uppercase tracking-wider">Montant (crédits)</p>
                <Input type="number" value={ccAmount} onChange={e => setCcAmount(Number(e.target.value))}
                  min={1} className="text-[13px]" />
              </div>
              <div className="space-y-2">
                <p className="text-[12px] text-text2 uppercase tracking-wider">Notes</p>
                <Input value={ccNotes} onChange={e => setCcNotes(e.target.value)}
                  placeholder="Optionnel…" className="text-[13px]" />
              </div>
            </div>
            <Button onClick={createCreditCode} disabled={ccCreating || !ccGenCode.trim() || ccAmount < 1}>
              {ccCreating ? 'Création…' : '+ Créer le code'}
            </Button>
            {ccCreateErr && (
              <p className="text-[13px] text-red-400 mt-2">Erreur : {ccCreateErr}</p>
            )}
          </div>

          {/* Code list */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {ccLoading ? (
              <div className="p-10 text-center text-[13px] text-text2">Chargement…</div>
            ) : creditCodes.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-2xl mb-3">💎</p>
                <p className="text-[13px] text-text2">Aucun code créé.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {creditCodes.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-4">
                    <code className="flex-1 font-mono text-[13px] text-text">{c.code}</code>
                    <span className="text-[13px] font-bold" style={{ color: '#a78bfa' }}>+{c.amount} crédits</span>
                    {c.used_by ? (
                      <span className="text-[12px] text-text2">Utilisé</span>
                    ) : c.is_active ? (
                      <span className="text-[12px] text-green-400">Disponible</span>
                    ) : (
                      <span className="text-[12px] text-red-400">Révoqué</span>
                    )}
                    {c.notes && <span className="text-[12px] text-text2 italic">{c.notes}</span>}
                    <button
                      onClick={() => { navigator.clipboard.writeText(c.code); setCopied(c.code); setTimeout(() => setCopied(null), 1500) }}
                      className="text-[12px] px-3 py-1.5 rounded-lg transition-colors"
                      style={{ color: copied === c.code ? '#34d399' : '#a78bfa', background: 'rgba(139,92,246,0.1)' }}
                    >
                      {copied === c.code ? '✓' : 'Copier'}
                    </button>
                    {c.is_active && !c.used_by && (
                      <button
                        onClick={() => revokeCreditCode(c.id)}
                        className="text-[12px] px-3 py-1.5 rounded-lg text-orange-400 hover:bg-orange-400/10 transition-colors"
                      >
                        Révoquer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
