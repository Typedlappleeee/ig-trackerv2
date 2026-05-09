import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { fetchAllPhones, geelarkStatusLabel } from '@/lib/geelark'
import { fetchIgStats } from '@/lib/instagram'
import { Button }  from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface PhonesProps {
  user: User
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'online' ? 'bg-ok' : 'bg-text2'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

// Inline edit for the Instagram username cell
function IgCell({ phone, onSave }: { phone: Phone; onSave: (id: string, username: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(phone.ig_username ?? '')
  const [saving, setSaving]   = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function save() {
    setSaving(true)
    await onSave(phone.id, value.replace(/^@/, '').trim())
    setSaving(false)
    setEditing(false)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') { setValue(phone.ig_username ?? ''); setEditing(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-text2">@</span>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKey}
          onBlur={save}
          disabled={saving}
          className="w-24 bg-surface border border-accent rounded px-1 py-0.5 text-xs text-text focus:outline-none"
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-left group flex items-center gap-1"
      title="Cliquer pour éditer"
    >
      {phone.ig_username
        ? <span className="text-accent">@{phone.ig_username}</span>
        : <span className="text-text2 italic">+ ajouter</span>
      }
      <span className="opacity-0 group-hover:opacity-40 text-text2 text-[10px]">✎</span>
    </button>
  )
}

export function Phones({ user }: PhonesProps) {
  const [phones, setPhones]       = useState<Phone[]>([])
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [filter, setFilter]       = useState<'all' | 'online' | 'offline'>('all')
  const [search, setSearch]       = useState('')
  const [bearer, setBearer]       = useState('')

  useEffect(() => {
    supabase
      .from('app_config')
      .select('bearer_token')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => { if (data?.bearer_token) setBearer(data.bearer_token) })
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

  // ── Sync phones from GéeLark ───────────────────────────────────────────────
  const syncFromGeelark = useCallback(async () => {
    if (!bearer) { setError('Token GéeLark manquant — configure-le dans Paramètres.'); return }
    setSyncing(true); setError(null)
    try {
      const items = await fetchAllPhones(bearer)
      if (items.length === 0) {
        setError('Aucun téléphone trouvé sur ce compte GéeLark.'); setSyncing(false); return
      }
      // Preserve existing ig_username / stats during upsert — only update GéeLark fields
      const rows = items.map(p => ({
        user_id:    user.id,
        geelark_id: p.id,
        serial_no:  p.serialNo ?? null,
        phone_name: p.serialName ?? p.name ?? p.serialNo ?? p.id ?? 'Phone inconnu',
        group_name: p.group?.name ?? p.groupName ?? null,
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

  // ── Save ig_username inline ────────────────────────────────────────────────
  async function saveIgUsername(id: string, username: string) {
    const { error: err } = await supabase
      .from('phones')
      .update({ ig_username: username || null })
      .eq('id', id)
    if (!err) {
      setPhones(prev => prev.map(p => p.id === id ? { ...p, ig_username: username || null } : p))
    }
  }

  // ── Refresh Instagram stats for all linked accounts ────────────────────────
  async function refreshIgStats() {
    const linked = phones.filter(p => p.ig_username)
    if (linked.length === 0) { setError('Aucun compte Instagram lié — clique sur "+ ajouter" dans la colonne Instagram.'); return }
    setRefreshing(true); setError(null)
    let done = 0
    for (const phone of linked) {
      setRefreshProgress(`${phone.ig_username} (${done + 1}/${linked.length})…`)
      const stats = await fetchIgStats(phone.ig_username!)
      if (stats) {
        await supabase
          .from('phones')
          .update({
            followers:   stats.followers,
            total_views: stats.total_views,
            video_count: stats.posts,
          })
          .eq('id', phone.id)
        setPhones(prev => prev.map(p =>
          p.id === phone.id
            ? { ...p, followers: stats.followers, total_views: stats.total_views, video_count: stats.posts }
            : p
        ))
      }
      done++
      // Small delay to avoid Instagram rate limiting
      if (done < linked.length) await new Promise(r => setTimeout(r, 1500))
    }
    setRefreshProgress('')
    setRefreshing(false)
  }

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
    views:   phones.reduce((s, p) => s + (p.total_views ?? 0), 0),
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Téléphones</h1>
          <p className="text-text2 text-sm mt-1">Cloud phones GéeLark synchronisés</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="secondary"
            onClick={refreshIgStats}
            loading={refreshing}
            disabled={syncing}
          >
            {refreshing ? refreshProgress || '…' : '📊 Stats Instagram'}
          </Button>
          <Button onClick={syncFromGeelark} loading={syncing} disabled={!bearer || refreshing}>
            ↺ Synchroniser GéeLark
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {([
          { key: 'all',     label: 'TÉLÉPHONES',   color: '#4f9eff', icon: '📱' },
          { key: 'online',  label: 'EN LIGNE',      color: '#00ccaa', icon: '✅' },
          { key: 'offline', label: 'HORS LIGNE',    color: '#5a6882', icon: '📴' },
          { key: 'views',   label: 'VUES TOTALES',  color: '#ffaa2a', icon: '👁' },
        ] as const).map(({ key, label, color, icon }) => (
          <button
            key={key}
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

      {/* Warnings / errors */}
      {!bearer && (
        <div className="px-4 py-3 rounded-lg bg-warn/10 border border-warn/20 text-warn text-sm">
          ⚠ Token GéeLark manquant — configure-le dans <span className="font-semibold">Paramètres</span>.
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
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
        {(['all', 'online', 'offline'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
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
          <p className="text-sm">Clique sur "Synchroniser GéeLark" pour importer tes phones.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[36px_1fr_130px_150px_90px_90px_70px_80px] px-4 py-2 border-b border-border bg-surface">
            {['#', 'Téléphone', 'Groupe', 'Instagram', 'Statut', 'Followers', 'Vues', 'Vidéos'].map(h => (
              <span key={h} className="text-xs font-semibold text-text2 uppercase tracking-wider">{h}</span>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-text2 text-sm">Aucun résultat.</p>
          ) : (
            <div className="divide-y divide-border">
              {visible.map((phone, i) => (
                <div
                  key={phone.id}
                  className="grid grid-cols-[36px_1fr_130px_150px_90px_90px_70px_80px] px-4 py-3 hover:bg-surface/50 transition-colors items-center"
                >
                  <span className="text-xs text-text2">{i + 1}</span>

                  {/* Phone name + serial */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">{phone.phone_name}</p>
                    {phone.serial_no && (
                      <p className="text-[10px] text-text2 font-mono truncate">{phone.serial_no}</p>
                    )}
                  </div>

                  <span className="text-xs text-text2 truncate">{phone.group_name ?? '—'}</span>

                  {/* Instagram — inline editable */}
                  <IgCell phone={phone} onSave={saveIgUsername} />

                  {/* Status */}
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={phone.status} />
                    <span className="text-xs text-text2 capitalize">{phone.status}</span>
                  </div>

                  <span className="text-xs text-text">
                    {phone.followers ? phone.followers.toLocaleString('fr-FR') : '—'}
                  </span>
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
          {visible.length} téléphone{visible.length > 1 ? 's' : ''}{phones.length !== visible.length && ` sur ${phones.length}`}
          {counts.views > 0 && ` · ${counts.views.toLocaleString('fr-FR')} vues au total`}
        </p>
      )}
    </div>
  )
}
