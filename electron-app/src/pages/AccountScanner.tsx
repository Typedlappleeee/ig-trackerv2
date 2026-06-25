import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { fetchIgStats, invalidateIgCache } from '@/lib/instagram'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/Toast'
import { ACCENT, HAIR, SANS, TEXT_1, TEXT_2, TEXT_3, BG_1, BG_2, OK, WARN, ERR } from '@/lib/theme'

interface AccountScannerProps { user: User }

// Résultat d'analyse d'un compte
type Health = 'healthy' | 'inactive' | 'unreachable' | 'unchecked'

interface ScanResult {
  health:      Health
  followers?:  number
  following?:  number
  posts?:      number
  checkedAt?:  string
}

interface AccountRow {
  id:         string
  username:   string
  group:      string
  result:     ScanResult
}

const HEALTH_META: Record<Health, { label: string; color: string; bg: string }> = {
  healthy:     { label: 'Sain',         color: OK,   bg: 'rgba(52,211,153,0.12)' },
  inactive:    { label: 'Inactif',      color: WARN, bg: 'rgba(251,191,36,0.12)' },
  unreachable: { label: 'Injoignable',  color: ERR,  bg: 'rgba(248,113,113,0.12)' },
  unchecked:   { label: 'Non analysé',  color: TEXT_3 as string, bg: 'rgba(233,234,240,0.05)' },
}

// Délai entre deux requêtes IG — Instagram rate-limite vite en non-authentifié.
const SCAN_DELAY_MS = 2500
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function AccountScanner({ user }: AccountScannerProps) {
  const { currentOrg } = useOrg()
  const conns = useConnections(user)
  const toast = useToast()

  const scopeKey = currentOrg?.id ?? user.id
  const cacheKey = `sf-scanner-results-${scopeKey}`
  const lastScanKey = `sf-scanner-lastscan-${scopeKey}`

  const [phones, setPhones]   = useState<Phone[]>([])
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<Record<string, ScanResult>>(() => {
    try { return JSON.parse(localStorage.getItem(cacheKey) ?? '{}') } catch { return {} }
  })
  const [lastScan, setLastScan] = useState<string | null>(() => localStorage.getItem(lastScanKey))
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [query, setQuery]       = useState('')
  const [filter, setFilter]     = useState<'all' | Health>('all')
  const abortRef = useRef(false)

  // ── Chargement des téléphones (scopé org) ──────────────────────────────────
  const loadPhones = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('phones').select('*').order('group_name').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await q
    setPhones((data ?? []).filter(p => p.ig_username))
    setLoading(false)
  }, [currentOrg, user.id])

  useEffect(() => { loadPhones() }, [loadPhones])

  // Persiste résultats + dernier scan
  useEffect(() => { localStorage.setItem(cacheKey, JSON.stringify(results)) }, [results, cacheKey])

  // ── Lignes consolidées ──────────────────────────────────────────────────────
  const rows: AccountRow[] = useMemo(() => phones.map(p => ({
    id:       p.id,
    username: (p.ig_username ?? '').replace(/^@/, ''),
    group:    p.group_name ?? '(sans groupe)',
    result:   results[p.id] ?? { health: 'unchecked' },
  })), [phones, results])

  // ── Stats globales ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const s = { total: rows.length, healthy: 0, inactive: 0, unreachable: 0, unchecked: 0 }
    for (const r of rows) s[r.result.health]++
    return s
  }, [rows])

  // ── Filtrage + recherche ─────────────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    const ql = query.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.result.health !== filter) return false
      if (ql && !r.username.toLowerCase().includes(ql) && !r.group.toLowerCase().includes(ql)) return false
      return true
    })
  }, [rows, query, filter])

  // Groupé par groupe GeeLark
  const grouped = useMemo(() => {
    const m = new Map<string, AccountRow[]>()
    for (const r of visibleRows) {
      if (!m.has(r.group)) m.set(r.group, [])
      m.get(r.group)!.push(r)
    }
    return [...m.entries()]
  }, [visibleRows])

  // ── Analyse d'un compte ──────────────────────────────────────────────────────
  async function analyzeOne(username: string): Promise<ScanResult> {
    invalidateIgCache(username)
    let stats = await fetchIgStats(username, { force: true })
    // Un null peut être un rate-limit ponctuel → on retente une fois après pause.
    if (!stats) {
      await sleep(SCAN_DELAY_MS)
      stats = await fetchIgStats(username, { force: true })
    }
    if (!stats) return { health: 'unreachable', checkedAt: new Date().toISOString() }
    return {
      health:    stats.posts === 0 ? 'inactive' : 'healthy',
      followers: stats.followers,
      following: stats.following,
      posts:     stats.posts,
      checkedAt: new Date().toISOString(),
    }
  }

  // ── Scan complet ─────────────────────────────────────────────────────────────
  async function runFullScan() {
    if (!conns.bearer && !window.electronAPI) {
      toast.show({ title: 'Analyse dispo uniquement sur l\'app desktop', kind: 'warn' })
      return
    }
    abortRef.current = false
    setScanning(true)
    const targets = rows
    setProgress({ done: 0, total: targets.length })
    for (let i = 0; i < targets.length; i++) {
      if (abortRef.current) break
      const row = targets[i]
      const res = await analyzeOne(row.username)
      setResults(prev => ({ ...prev, [row.id]: res }))
      setProgress({ done: i + 1, total: targets.length })
      if (i < targets.length - 1) await sleep(SCAN_DELAY_MS)
    }
    const now = new Date().toISOString()
    localStorage.setItem(lastScanKey, now)
    setLastScan(now)
    setScanning(false)
    if (!abortRef.current) toast.show({ title: 'Analyse terminée ✓', kind: 'ok' })
  }

  // Analyse d'un seul compte (clic sur la ligne)
  async function rescanRow(row: AccountRow) {
    setResults(prev => ({ ...prev, [row.id]: { ...prev[row.id], health: 'unchecked' } }))
    const res = await analyzeOne(row.username)
    setResults(prev => ({ ...prev, [row.id]: res }))
  }

  function stopScan() { abortRef.current = true; setScanning(false) }

  const lastScanLabel = lastScan
    ? new Date(lastScan).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{ fontFamily: SANS, color: TEXT_1, maxWidth: 1100, margin: '0 auto', padding: '24px 20px 60px' }}>

      {/* ── En-tête ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Scanner de comptes
          </h1>
          <p style={{ fontSize: 13, color: TEXT_2, margin: '4px 0 0' }}>
            Analyse l'état de tes comptes Instagram — sains, inactifs ou injoignables.
            {lastScanLabel && <> · Dernier scan : <strong style={{ color: TEXT_1 }}>{lastScanLabel}</strong></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {scanning ? (
            <Button variant="ghost" onClick={stopScan}>■ Arrêter ({progress.done}/{progress.total})</Button>
          ) : (
            <Button onClick={runFullScan} disabled={loading || rows.length === 0}>
              ⟳ Analyser ({rows.length})
            </Button>
          )}
        </div>
      </div>

      {/* ── Barre de progression ──────────────────────────────────────────── */}
      {scanning && (
        <div style={{ height: 4, borderRadius: 4, background: HAIR, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{
            height: '100%', borderRadius: 4, background: ACCENT,
            width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
            transition: 'width 0.3s',
          }} />
        </div>
      )}

      {/* ── Cartes de stats ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total" value={stats.total} color={TEXT_1} sub="comptes" onClick={() => setFilter('all')} active={filter === 'all'} />
        <StatCard label="Sains" value={stats.healthy} color={OK} sub={pct(stats.healthy, stats.total)} onClick={() => setFilter('healthy')} active={filter === 'healthy'} />
        <StatCard label="Inactifs" value={stats.inactive} color={WARN} sub="0 publication" onClick={() => setFilter('inactive')} active={filter === 'inactive'} />
        <StatCard label="Injoignables" value={stats.unreachable} color={ERR} sub="à vérifier" onClick={() => setFilter('unreachable')} active={filter === 'unreachable'} />
      </div>

      {/* ── Recherche ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher @handle ou groupe…"
          style={{
            flex: 1, padding: '9px 14px', borderRadius: 10, fontSize: 13,
            background: BG_2, border: `1px solid ${HAIR}`, color: TEXT_1, outline: 'none',
          }}
        />
        {filter !== 'all' && (
          <button onClick={() => setFilter('all')} style={chipStyle(true)}>
            {HEALTH_META[filter].label} ✕
          </button>
        )}
      </div>

      {/* ── Note honnêteté ────────────────────────────────────────────────── */}
      <div style={{
        fontSize: 11.5, color: TEXT_2, background: 'rgba(251,191,36,0.06)',
        border: `1px solid rgba(251,191,36,0.15)`, borderRadius: 8, padding: '8px 12px', marginBottom: 16,
      }}>
        ⚠️ « Injoignable » = Instagram n'a pas répondu (compte banni/supprimé/privé OU simple rate-limit temporaire).
        Le scan est volontairement lent ({SCAN_DELAY_MS / 1000}s/compte) pour limiter les faux positifs. Relance un compte douteux en cliquant dessus.
      </div>

      {/* ── Liste groupée ─────────────────────────────────────────────────── */}
      {loading ? (
        <p style={{ color: TEXT_2, fontSize: 13 }}>Chargement…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: TEXT_2, fontSize: 13 }}>Aucun compte Instagram associé à tes téléphones. Renseigne les @handles dans l'onglet Téléphones.</p>
      ) : grouped.length === 0 ? (
        <p style={{ color: TEXT_2, fontSize: 13 }}>Aucun compte ne correspond au filtre.</p>
      ) : (
        grouped.map(([group, groupRows]) => (
          <div key={group} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group}</span>
              <span style={{ fontSize: 11, color: TEXT_3 }}>{groupRows.length}</span>
              <span style={{ flex: 1, height: 1, background: HAIR }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groupRows.map(row => <AccountRowItem key={row.id} row={row} onClick={() => rescanRow(row)} />)}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────
function pct(n: number, total: number): string {
  if (!total) return '—'
  return `${Math.round((n / total) * 100)}%`
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: active ? 'rgba(99,102,241,0.15)' : BG_2,
    border: `1px solid ${active ? 'rgba(99,102,241,0.35)' : HAIR}`,
    color: active ? ACCENT : TEXT_2,
  }
}

function StatCard({ label, value, color, sub, onClick, active }: {
  label: string; value: number; color: string; sub: string; onClick: () => void; active: boolean
}) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', cursor: 'pointer', padding: '14px 16px', borderRadius: 12,
      background: BG_1, border: `1px solid ${active ? color : HAIR}`,
      transition: 'border 0.15s', outline: 'none',
    }}>
      <div style={{ fontSize: 11, color: TEXT_2, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, marginTop: 4, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: TEXT_3, marginTop: 4 }}>{sub}</div>
    </button>
  )
}

function AccountRowItem({ row, onClick }: { row: AccountRow; onClick: () => void }) {
  const meta = HEALTH_META[row.result.health]
  const checking = row.result.health === 'unchecked' && !!row.result.checkedAt === false
  return (
    <div
      onClick={onClick}
      title="Cliquer pour ré-analyser ce compte"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
        background: BG_2, border: `1px solid ${HAIR}`, cursor: 'pointer',
        borderLeft: `3px solid ${meta.color}`,
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 600, color: TEXT_1, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        @{row.username}
      </span>
      {row.result.health !== 'unchecked' && (
        <span style={{ fontSize: 12, color: TEXT_2, whiteSpace: 'nowrap' }}>
          {(row.result.followers ?? 0).toLocaleString('fr-FR')} abonnés · {row.result.posts ?? 0} pub.
        </span>
      )}
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6,
        color: meta.color, background: meta.bg, whiteSpace: 'nowrap',
      }}>
        {checking ? '…' : meta.label}
      </span>
    </div>
  )
}
