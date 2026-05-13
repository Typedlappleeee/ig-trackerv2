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
    const { error } = await supabase.from('credit_codes').insert({
      code: ccGenCode,
      amount: ccAmount,
      notes: ccNotes || null,
    })
    setCcCreating(false)
    if (!error) {
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
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-text">🛡 Admin — Licences</h1>
        <p className="text-xs text-text2 mt-0.5">Gère les clés d'accès à ScaleFlow</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',    value: stats.total,   color: 'text-text' },
          { label: 'Dispo',    value: stats.active,  color: 'text-green-400' },
          { label: 'Utilisées', value: stats.used,   color: 'text-blue-400' },
          { label: 'Expirées', value: stats.expired, color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-text2 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Create key */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
        <p className="text-sm font-semibold text-text">Créer une clé</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-text2 uppercase tracking-wide">Clé générée</label>
            <div className="flex gap-2">
              <input
                value={genKey}
                onChange={e => setGenKey(e.target.value.toUpperCase())}
                className="flex-1 bg-[#0d0a1a] border border-border rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-text focus:outline-none focus:border-accent"
              />
              <button onClick={() => setGenKey(generateKey())} className="px-3 py-2 rounded-lg text-xs text-text2 hover:text-text transition-colors" style={{ background: 'rgba(255,255,255,0.05)' }}>
                ↺
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-text2 uppercase tracking-wide">Durée</label>
            <div className="flex gap-1 flex-wrap">
              {DURATIONS.map(d => (
                <button
                  key={d.label}
                  onClick={() => setDuration(d.days)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${duration === d.days ? 'text-white' : 'text-text2 hover:text-text'}`}
                  style={duration === d.days ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)' } : { background: 'rgba(255,255,255,0.05)' }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-text2 uppercase tracking-wide">Plan</label>
            <div className="flex gap-1">
              {['standard', 'pro', 'lifetime'].map(p => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${plan === p ? 'text-white' : 'text-text2 hover:text-text'}`}
                  style={plan === p ? { background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.5)' } : { background: 'rgba(255,255,255,0.05)' }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-text2 uppercase tracking-wide">Notes (optionnel)</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex: Discord @pseudo" />
          </div>
        </div>
        <Button onClick={createKey} disabled={creating} className="w-full">
          {creating ? 'Création…' : '+ Créer la clé'}
        </Button>
      </div>

      {/* List */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter === f ? 'text-white' : 'text-text2 hover:text-text'}`}
              style={filter === f ? { background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.4)' } : { background: 'rgba(255,255,255,0.05)' }}
            >
              {f === 'all' ? 'Toutes' : f === 'active' ? 'Disponibles' : f === 'used' ? 'Utilisées' : 'Expirées'}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-text2 text-sm text-center py-8">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="text-text2 text-sm text-center py-8">Aucune clé trouvée</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(k => (
              <div key={k.id} className={`rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 transition-opacity ${!k.is_active ? 'opacity-50' : ''}`}
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.1)' }}>
                {/* Key */}
                <button
                  onClick={() => copyKey(k.key)}
                  className="font-mono text-sm text-text tracking-widest hover:text-accent transition-colors flex items-center gap-1.5"
                  title="Copier"
                >
                  {k.key}
                  <span className="text-[10px] text-text2">{copied === k.key ? '✓' : '⎘'}</span>
                </button>

                {/* Plan badge */}
                <span className="text-[10px] px-2 py-0.5 rounded-full capitalize font-medium" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                  {k.plan}
                </span>

                {/* Status */}
                {!k.is_active ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Révoquée</span>
                ) : k.user_id ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">Activée</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">Disponible</span>
                )}

                {/* Expiry */}
                <span className={`text-[11px] font-medium ml-auto ${daysLeftColor(k.expires_at)}`}>
                  {daysLeft(k.expires_at)}
                </span>

                {/* User email */}
                {k.user_email && (
                  <span className="text-[11px] text-text2 truncate max-w-[160px]">{k.user_email}</span>
                )}

                {/* Notes */}
                {k.notes && <span className="text-[11px] text-text2 italic truncate max-w-[120px]">{k.notes}</span>}

                {/* Actions */}
                <div className="flex gap-1">
                  {k.is_active && (
                    <button
                      onClick={() => revokeKey(k.id)}
                      className="text-[10px] px-2 py-1 rounded-lg text-orange-400 hover:bg-orange-400/10 transition-colors"
                    >
                      Révoquer
                    </button>
                  )}
                  <button
                    onClick={() => deleteKey(k.id)}
                    className="text-[10px] px-2 py-1 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
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
      <div className="space-y-4 pt-4 border-t border-border">
        <div>
          <h2 className="text-base font-bold text-text">💎 Codes crédit</h2>
          <p className="text-xs text-text2 mt-0.5">Génère des codes que les utilisateurs peuvent échanger contre des crédits</p>
        </div>

        {/* Create form */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.18)' }}>
          <p className="text-xs font-black text-text uppercase tracking-wider">Nouveau code</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-text2 uppercase tracking-wider">Code</p>
              <Input value={ccGenCode} onChange={e => setCcGenCode(e.target.value.toUpperCase())}
                className="font-mono text-sm" />
              <button onClick={() => setCcGenCode(generateCreditCode())}
                className="text-[10px] text-accent hover:underline">↺ Régénérer</button>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-text2 uppercase tracking-wider">Montant (crédits)</p>
              <Input type="number" value={ccAmount} onChange={e => setCcAmount(Number(e.target.value))}
                min={1} className="text-sm" />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-text2 uppercase tracking-wider">Notes</p>
              <Input value={ccNotes} onChange={e => setCcNotes(e.target.value)}
                placeholder="Optionnel…" className="text-sm" />
            </div>
          </div>
          <Button onClick={createCreditCode} disabled={ccCreating || !ccGenCode.trim() || ccAmount < 1}>
            {ccCreating ? 'Création…' : '+ Créer le code'}
          </Button>
        </div>

        {/* Code list */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {ccLoading ? (
            <div className="p-8 text-center text-text2 text-sm">Chargement…</div>
          ) : creditCodes.length === 0 ? (
            <div className="p-8 text-center text-text2 text-sm">Aucun code créé.</div>
          ) : (
            <div className="divide-y divide-border">
              {creditCodes.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <code className="flex-1 font-mono text-xs text-text">{c.code}</code>
                  <span className="text-xs font-bold" style={{ color: '#a78bfa' }}>+{c.amount} crédits</span>
                  {c.used_by ? (
                    <span className="text-[10px] text-text2">Utilisé</span>
                  ) : c.is_active ? (
                    <span className="text-[10px] text-green-400">Disponible</span>
                  ) : (
                    <span className="text-[10px] text-red-400">Révoqué</span>
                  )}
                  {c.notes && <span className="text-[10px] text-text2 italic">{c.notes}</span>}
                  <button
                    onClick={() => { navigator.clipboard.writeText(c.code); setCopied(c.code); setTimeout(() => setCopied(null), 1500) }}
                    className="text-[10px] px-2 py-1 rounded-lg transition-colors"
                    style={{ color: copied === c.code ? '#34d399' : '#a78bfa', background: 'rgba(139,92,246,0.1)' }}
                  >
                    {copied === c.code ? '✓' : 'Copier'}
                  </button>
                  {c.is_active && !c.used_by && (
                    <button
                      onClick={() => revokeCreditCode(c.id)}
                      className="text-[10px] px-2 py-1 rounded-lg text-orange-400 hover:bg-orange-400/10 transition-colors"
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
  )
}
