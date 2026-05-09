import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { fetchAllPhones, geelarkStatusLabel } from '@/lib/geelark'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface PhonesProps {
  user: User
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'online'  ? 'bg-ok'     :
    status === 'error'   ? 'bg-danger'  :
    'bg-text2'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

export function Phones({ user }: PhonesProps) {
  const [phones, setPhones]     = useState<Phone[]>([])
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [filter, setFilter]     = useState<'all' | 'online' | 'offline' | 'error'>('all')
  const [search, setSearch]     = useState('')
  const [bearer, setBearer]     = useState('')

  // ── Load bearer token from config ─────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('app_config')
      .select('bearer_token')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.bearer_token) setBearer(data.bearer_token)
      })
    loadPhones()
  }, [])

  async function loadPhones() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('phones')
      .select('*')
      .eq('user_id', user.id)
      .order('phone_name')
    if (err) setError('Erreur lors du chargement.')
    else setPhones(data ?? [])
    setLoading(false)
  }

  // ── Sync from GéeLark API ──────────────────────────────────────────────────
  const syncFromGeelark = useCallback(async () => {
    if (!bearer) {
      setError('Token GéeLark manquant — configure-le dans Paramètres.')
      return
    }
    setSyncing(true)
    setError(null)
    try {
      const items = await fetchAllPhones(bearer)
      if (items.length === 0) {
        setError('Aucun téléphone trouvé sur ce compte GéeLark.')
        setSyncing(false)
        return
      }

      // Upsert all phones
      const rows = items.map(p => ({
        user_id:    user.id,
        geelark_id: p.id,
        serial_no:  p.serialNo ?? null,
        phone_name: p.name ?? p.serialName ?? p.phoneName ?? p.serialNo ?? p.id ?? 'Phone inconnu',
        group_name: p.groupName ?? null,
        status:     geelarkStatusLabel(p.status),
        remark:     p.remark ?? null,
        synced_at:  new Date().toISOString(),
      }))

      const { error: upsertErr } = await supabase
        .from('phones')
        .upsert(rows, { onConflict: 'user_id,geelark_id' })

      if (upsertErr) throw new Error(upsertErr.message)
      await loadPhones()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de synchronisation.')
    }
    setSyncing(false)
  }, [bearer, user.id])

  // ── Filtered view ─────────────────────────────────────────────────────────
  const visible = phones.filter(p => {
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
    error:   phones.filter(p => p.status === 'error').length,
    views:   phones.reduce((s, p) => s + (p.total_views ?? 0), 0),
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Téléphones</h1>
          <p className="text-text2 text-sm mt-1">Cloud phones GéeLark synchronisés</p>
        </div>
        <Button onClick={syncFromGeelark} loading={syncing} disabled={!bearer}>
          ↺ Synchroniser GéeLark
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {([
          { key: 'all',    label: 'TÉLÉPHONES', color: 'text-accent',  icon: '📱' },
          { key: 'online', label: 'EN LIGNE',   color: 'text-ok',      icon: '✅' },
          { key: 'error',  label: 'ERREUR',     color: 'text-danger',  icon: '🚫' },
          { key: 'views',  label: 'VUES TOTALES', color: 'text-warn',  icon: '👁' },
        ] as const).map(({ key, label, color, icon }) => (
          <button
            key={key}
            onClick={() => key !== 'views' && setFilter(key as typeof filter)}
            className={`
              bg-card border rounded-xl p-4 text-left transition-all
              ${(key !== 'views' && filter === key) ? 'border-accent' : 'border-border hover:border-accent/40'}
            `}
          >
            <div className="flex items-center gap-2 mb-2">
              <span>{icon}</span>
              <span className="text-xs font-semibold text-text2">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>
              {key === 'views' ? counts.views.toLocaleString('fr-FR') : counts[key]}
            </p>
          </button>
        ))}
      </div>

      {/* No token warning */}
      {!bearer && (
        <div className="px-4 py-3 rounded-lg bg-warn/10 border border-warn/20 text-warn text-sm">
          ⚠ Token GéeLark manquant — va dans{' '}
          <span className="font-semibold">Paramètres</span> pour le configurer.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Rechercher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none transition-colors"
        />
        {(['all', 'online', 'offline', 'error'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`
              px-3 py-2 rounded-lg text-xs font-medium transition-all
              ${filter === f ? 'bg-accent/20 text-accent' : 'text-text2 hover:text-text'}
            `}
          >
            {f === 'all' ? 'Tous' : f === 'online' ? 'En ligne' : f === 'offline' ? 'Hors ligne' : 'Erreur'}
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
          <p className="text-sm">Clique sur "Synchroniser GéeLark" pour importer tes phones.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[40px_1fr_140px_120px_100px_100px_80px] gap-0 px-4 py-2 border-b border-border bg-surface">
            {['#', 'Téléphone', 'Groupe', 'Instagram', 'Statut', 'Vues', 'Vidéos'].map(h => (
              <span key={h} className="text-xs font-semibold text-text2 uppercase tracking-wider">{h}</span>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="px-4 py-8 text-center text-text2 text-sm">
              Aucun résultat pour cette recherche.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visible.map((phone, i) => (
                <div
                  key={phone.id}
                  className="grid grid-cols-[40px_1fr_140px_120px_100px_100px_80px] gap-0 px-4 py-3 hover:bg-surface/50 transition-colors items-center"
                >
                  <span className="text-xs text-text2">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">{phone.phone_name}</p>
                    {phone.serial_no && (
                      <p className="text-xs text-text2 font-mono truncate">{phone.serial_no}</p>
                    )}
                  </div>
                  <span className="text-xs text-text2 truncate">{phone.group_name ?? '—'}</span>
                  <span className="text-xs text-accent truncate">{phone.ig_username ? `@${phone.ig_username}` : '—'}</span>
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={phone.status} />
                    <span className="text-xs text-text2 capitalize">{phone.status}</span>
                  </div>
                  <span className="text-xs text-text">
                    {phone.total_views ? phone.total_views.toLocaleString('fr-FR') : '—'}
                  </span>
                  <span className="text-xs text-text">
                    {phone.video_count || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && visible.length > 0 && (
        <p className="text-xs text-text2 text-right">
          {visible.length} téléphone{visible.length > 1 ? 's' : ''} affichés
          {phones.length !== visible.length && ` sur ${phones.length}`}
        </p>
      )}
    </div>
  )
}
