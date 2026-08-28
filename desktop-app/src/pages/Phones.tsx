import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Empty, Icon, Kpi, Panel, StatusDot } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { fmtNumber, scopeInfra } from '@/lib/data'
import { deriveHealth } from '@/lib/health'

// ── Type Phone (sous-ensemble réel de la table `phones`, aligné sur
//    electron-app/src/lib/supabase.ts). Lecture seule pour cette passe. ──────────
interface Phone {
  id: string
  phone_name: string
  ig_username: string | null
  ig_status: string | null
  group_name: string | null
  status: string
  total_views: number | null
  pp_url: string | null
  last_post_at: string | null
  account_state: string | null
  geelark_id: string | null
}

// La santé est dérivée honnêtement dans src/lib/health.ts (partagé avec l'écran Santé).

const STATUS_LABEL: Record<string, string> = {
  online: 'En ligne', warming: 'Warmup', limited: 'Limité', offline: 'Hors ligne', error: 'Erreur',
}
// La fabrique StatusDot attend 'warmup' pour l'animation (la DB stocke 'warming').
function dotKind(status: string): string {
  return status === 'warming' ? 'warmup' : status
}

function fmtViews(n: number | null): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} K`
  return String(n)
}

const COLS = '30px minmax(0,1.4fr) 110px 96px 210px'


// ── Case à cocher (portée du prototype) ────────────────────────────────────────
function Check({ on, mid, onClick }: { on: boolean; mid?: boolean; onClick: () => void }) {
  return (
    <span
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 15, height: 15, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
        background: on || mid ? '#7C3AED' : 'transparent',
        border: on || mid ? 'none' : '1px solid rgba(255,255,255,0.18)',
        color: '#fff', fontSize: 9, fontWeight: 900, transition: 'all .14s ease',
      }}
    >{mid ? '–' : on ? '✓' : ''}</span>
  )
}

const TH: CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#52525B',
}

export default function Phones({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const { currentOrg, role, perms } = org
  const [phones, setPhones] = useState<Phone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'on' | 'off' | 'risk'>('all')
  const [group, setGroup] = useState('Tous')
  const [sel, setSel] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    // 🔒 Membre restreint à des groupes → on ne charge que ceux-là (même règle que data.ts).
    const restrictedGroups = (role && role !== 'owner' && role !== 'admin' && perms?.phone_groups?.mode === 'allow')
      ? (perms.phone_groups.list ?? [])
      : null
    let query = supabase
      .from('phones')
      .select('id,phone_name,ig_username,ig_status,group_name,status,total_views,pp_url,last_post_at,account_state,geelark_id')
      .order('phone_name')
    query = currentOrg
      ? query.eq('org_id', currentOrg.id)
      : query.eq('user_id', user.id).is('org_id', null)
    query = scopeInfra(query, infra)
    if (restrictedGroups) query = query.in('group_name', restrictedGroups)
    const { data, error: err } = await query
    if (err) { setError('Erreur de chargement des appareils.'); setPhones([]) }
    else setPhones((data ?? []) as Phone[])
    setLoading(false)
  }, [currentOrg?.id, user.id, role, perms, infra])

  useEffect(() => { load() }, [load])

  // Rows enrichies d'un score de santé dérivé (déterministe).
  const rows = useMemo(() => phones.map(p => ({ ...p, health: deriveHealth(p) })), [phones])

  const groups = useMemo(() => {
    const s = new Set<string>()
    rows.forEach(p => { if (p.group_name) s.add(p.group_name) })
    return ['Tous', ...[...s].sort((a, b) => a.localeCompare(b))]
  }, [rows])

  const ql = q.trim().toLowerCase()
  const shown = useMemo(() => rows.filter(p =>
    (filter === 'all'
      || (filter === 'on' && p.status === 'online')
      || (filter === 'off' && p.status === 'offline')
      || (filter === 'risk' && p.health < 70))
    && (group === 'Tous' || p.group_name === group)
    && (!ql || p.phone_name.toLowerCase().includes(ql) || (p.ig_username ?? '').toLowerCase().includes(ql))
  ), [rows, filter, group, ql])

  const selSet = sel
  const allOn = shown.length > 0 && shown.every(p => selSet.has(p.id))
  const someOn = !allOn && shown.some(p => selSet.has(p.id))

  const toggle = (id: string) => setSel(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const toggleAll = () => setSel(allOn ? new Set() : new Set(shown.map(p => p.id)))

  // KPI (valeurs réelles)
  const total = rows.length
  const online = rows.filter(p => p.status === 'online').length
  const offline = rows.filter(p => p.status === 'offline').length
  const atRisk = rows.filter(p => p.health < 70).length

  const el = '…'
  const isCloud = infra === 'cloud'
  const title = isCloud ? 'Mes appareils' : 'Téléphones GeeLark'
  const sub = isCloud
    ? 'Tes appareils cloud : statut, vues et actions. Le détail de santé par compte est dans « Santé des comptes ».'
    : 'Tes cloud phones GeeLark : statut, vues et actions. Le détail de santé par compte est dans « Santé des comptes ».'

  const FILTERS: { k: typeof filter; l: string; n: number }[] = [
    { k: 'all', l: 'Tous', n: total },
    { k: 'on', l: 'En ligne', n: online },
    { k: 'off', l: 'Hors ligne', n: offline },
    { k: 'risk', l: 'À risque', n: atRisk },
  ]

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 22,
            fontWeight: 700, letterSpacing: '-0.025em', color: '#F4F4F6',
          }}>{title}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, color: '#71717A', maxWidth: 620 }}>{sub}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Btn label="Sync GeeLark" theme={theme} icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8|M3 22v-6h6|M21 12a9 9 0 0 1-15 6.7L3 16" onClick={load} />
          <Btn label="Créer un appareil" theme={theme} tone="primary" icon="M12 5v14|M5 12h14" />
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi theme={theme} label="Total" value={loading ? el : fmtNumber(total)} />
        <Kpi theme={theme} label="En ligne" value={loading ? el : fmtNumber(online)} color="#34D399" />
        <Kpi theme={theme} label="Hors ligne" value={loading ? el : fmtNumber(offline)} color="#A1A1AA" />
        <Kpi theme={theme} label="À risque" value={loading ? el : fmtNumber(atRisk)}
          color={atRisk > 0 ? '#F87171' : undefined}
          hint={loading ? undefined : (atRisk > 0 ? 'santé sous 70 · action requise' : 'tout va bien')}
          hintColor={atRisk > 0 ? '#F87171' : '#34D399'} />
      </div>

      <Panel theme={theme}>
        {/* Barre d'outils : recherche + groupe + pills */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px',
          borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap',
        }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 30,
            padding: '0 11px', borderRadius: 8, flex: 1, minWidth: 180, maxWidth: 280,
            border: `1px solid ${q ? theme.selEdge : 'rgba(255,255,255,0.07)'}`,
            background: 'rgba(255,255,255,0.02)', transition: 'border-color .16s ease',
          }}>
            <span style={{ display: 'flex', color: q ? theme.accentSoft : '#52525B' }}>
              <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M20 20l-4.35-4.35" size={13} sw={2} />
            </span>
            <input
              type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer…"
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', color: '#F4F4F6', fontSize: 12 }}
            />
          </span>

          {/* Groupe */}
          <select
            value={group} onChange={e => setGroup(e.target.value)}
            style={{
              height: 30, padding: '0 8px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${group !== 'Tous' ? theme.selEdge : 'rgba(255,255,255,0.07)'}`,
              background: '#101015', color: group !== 'Tous' ? theme.accentText : '#A1A1AA',
              fontSize: 11.5, fontWeight: 700, outline: 'none',
            }}
          >
            {groups.map(g => <option key={g} value={g} style={{ background: '#16161C', color: '#E4E4E7' }}>{g === 'Tous' ? 'Tous les groupes' : g}</option>)}
          </select>

          {/* Pills */}
          <span style={{
            display: 'flex', gap: 2, padding: 2, borderRadius: 8,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {FILTERS.map(f => {
              const on = filter === f.k
              return (
                <button key={f.k} onClick={() => setFilter(f.k)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, height: 24,
                  padding: '0 9px', border: 'none', borderRadius: 6, cursor: 'pointer',
                  background: on ? `rgba(${theme.tone},0.16)` : 'transparent',
                  color: on ? theme.accentText : '#71717A',
                  fontSize: 11, fontWeight: 700, transition: 'all .14s ease',
                }}>
                  {f.l}
                  <span style={{ opacity: 0.55, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{f.n}</span>
                </button>
              )
            })}
          </span>

          <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#52525B' }}>
            {loading ? el : `${shown.length} / ${total}`}
          </span>
        </div>

        {/* En-tête de table */}
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center',
          padding: '9px 15px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span><Check on={allOn} mid={someOn} onClick={toggleAll} /></span>
          <span style={TH}>Compte</span>
          <span style={TH}>Groupe</span>
          <span style={TH}>Statut</span>
          <span style={{ ...TH, textAlign: 'right' }} />
        </div>

        {/* Corps */}
        {loading ? (
          <div style={{ padding: '48px 15px', textAlign: 'center', fontSize: 13, color: '#52525B' }}>{el}</div>
        ) : error ? (
          <div style={{ padding: '40px 15px', textAlign: 'center', fontSize: 12.5, color: '#F87171' }}>{error}</div>
        ) : total === 0 ? (
          <Empty
            icon="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01"
            title="Aucun appareil"
            text={isCloud
              ? 'Aucun appareil pour le moment. Crée ton premier appareil cloud pour commencer.'
              : 'Aucun téléphone pour le moment. Connecte GeeLark et synchronise pour importer tes cloud phones.'}
            action={<Btn label={isCloud ? 'Créer un appareil' : 'Sync GeeLark'} theme={theme} tone="primary" onClick={isCloud ? undefined : load} />}
          />
        ) : shown.length === 0 ? (
          <Empty
            icon="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M8 12h8"
            title="Aucun résultat"
            text="Aucun appareil ne correspond à ce filtre."
            action={<Btn label="Réinitialiser" theme={theme} sm onClick={() => { setQ(''); setFilter('all'); setGroup('Tous') }} />}
          />
        ) : (
          <div>
            {shown.map((p, i) => {
              const on = selSet.has(p.id)
              return (
                <div
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center',
                    padding: '9px 15px', fontSize: 12, cursor: 'pointer',
                    borderBottom: i < shown.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none',
                    background: on ? `rgba(${theme.tone},0.06)` : 'transparent',
                    transition: 'background .14s ease',
                  }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = on ? `rgba(${theme.tone},0.06)` : 'transparent' }}
                >
                  <span><Check on={on} onClick={() => toggle(p.id)} /></span>

                  {/* Compte : avatar + @compte + nom d'appareil en mono */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    {p.pp_url ? (
                      <img src={p.pp_url} alt="" referrerPolicy="no-referrer" style={{
                        width: 24, height: 24, borderRadius: 6, objectFit: 'cover', flexShrink: 0,
                        border: '1px solid rgba(255,255,255,0.08)',
                      }} />
                    ) : (
                      <span style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: 'linear-gradient(140deg,#3F3F46,#27272A)',
                        border: '1px solid rgba(255,255,255,0.07)', fontSize: 10, fontWeight: 800, color: '#D4D4D8',
                      }}>{(p.ig_username || p.phone_name || '?').charAt(0).toUpperCase()}</span>
                    )}
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#F4F4F6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.ig_username ? `@${p.ig_username}` : <span style={{ color: '#71717A' }}>Sans compte</span>}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#52525B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.phone_name}
                      </span>
                    </span>
                  </span>

                  {/* Groupe */}
                  <span style={{ fontSize: 11.5, color: '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.group_name ?? <span style={{ color: '#3F3F46' }}>—</span>}
                  </span>

                  {/* Statut */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StatusDot kind={dotKind(p.status)} />
                    <span style={{ fontSize: 11.5, color: '#A1A1AA' }}>{STATUS_LABEL[p.status] ?? p.status}</span>
                  </span>

                  {/* Actions : GeeLark sert à l'automatisation — pas de démarrage manuel. */}
                  <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 5 }} onClick={e => e.stopPropagation()}>
                    <Btn theme={theme} sm tone="quiet" icon="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M4 12h2|M18 12h2|M12 4v2|M12 18v2" label="Réglages" />
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {/* Barre d'actions groupées */}
      {sel.size > 0 && (
        <div style={{
          position: 'sticky', bottom: 14, marginTop: 14, display: 'flex',
          alignItems: 'center', gap: 10, padding: '9px 10px 9px 14px', borderRadius: 10,
          background: '#16161C', border: `1px solid rgba(${theme.tone},0.3)`,
          boxShadow: '0 18px 44px -16px rgba(0,0,0,0.9)', flexWrap: 'wrap',
          animation: 'aPop .22s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: theme.accentText }}>{sel.size}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#A1A1AA' }}>sélectionné{sel.size > 1 ? 's' : ''}</span>
          </span>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
          <Btn label="Publier" theme={theme} sm tone="primary" icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" />
          <Btn label="Chauffer" theme={theme} sm icon="M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z" />
          <Btn label="Groupe" theme={theme} sm icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" />
          <span style={{ marginLeft: 'auto' }}>
            <Btn label="Tout désélectionner" theme={theme} sm tone="quiet" onClick={() => setSel(new Set())} />
          </span>
        </div>
      )}
    </div>
  )
}
