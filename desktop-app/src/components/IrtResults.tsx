// iRemoTech › Résultats : vue claire, compte par compte, de ce qui a RÉUSSI (ou raté) en automatisation —
// Reels publiés, Story CTA, carrousels, setup, warm-up — sur la période choisie. Données : `post_runs` (irtResults.ts).
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { aggregateResults, loadIrtResults, IRT_ACTIONS, type IrtAction, type IrtResultEntry, type ActionStat } from '@/lib/irtResults'
import { ago } from '@/lib/irtAccounts'
import { lastStatsError, accountHealth, HEALTH_LABEL, type IgStat } from '@/lib/irtStats'

const GOLD = '#E9C46A', INK = '#EDEDEF', MUTED = '#8B8B94', DIM = '#6E6E78', OK = '#4ADE80', BAD = '#F87171'
const EDGE = 'rgba(255,255,255,0.07)', FIELD_BG = '#161618', FIELD_EDGE = 'rgba(255,255,255,0.09)'
const LABEL: Record<IrtAction, string> = { reel: '🎬 Reels', story: '🔗 Story CTA', carousel: '🖼 Carrousels', setup: '🪪 Setup', warmup: '🔥 Warm-up' }
const PERIODS: { k: string; l: string; ms: number }[] = [
  { k: '1', l: 'Aujourd’hui', ms: 0 }, { k: '7', l: '7 jours', ms: 7 * 864e5 }, { k: '30', l: '30 jours', ms: 30 * 864e5 }, { k: '90', l: '90 jours', ms: 90 * 864e5 },
]
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

const fmt = (n: number | null | undefined) => n == null ? '—' : n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString('fr-FR')

export default function IrtResults({ scope, igstats = {}, accounts = [], onRefreshStats }: {
  scope: { userId: string; orgId: string | null }
  igstats?: Record<string, IgStat>
  accounts?: { name: string; device: string; phone: string }[]
  onRefreshStats?: () => Promise<number>
}) {
  const [statsBusy, setStatsBusy] = useState(false)
  const [statsErr, setStatsErr] = useState<string | null>(null)
  const [period, setPeriod] = useState(() => { try { return localStorage.getItem('sf-irt-res-period') ?? '7' } catch { return '7' } })
  const [phone, setPhone] = useState('')
  const [q, setQ] = useState('')
  const [entries, setEntries] = useState<IrtResultEntry[] | null>(null)
  const [tick, setTick] = useState(0)
  const since = period === '1' ? startOfToday() : Date.now() - (PERIODS.find(p => p.k === period)?.ms ?? 7 * 864e5)
  useEffect(() => {
    let alive = true
    void loadIrtResults(scope, since).then(e => { if (alive) setEntries(e) }, () => { if (alive) setEntries([]) })
    const t = setInterval(() => setTick(n => n + 1), 30_000) // relu toutes les 30 s (lancements en cours)
    return () => { alive = false; clearInterval(t) }
  }, [scope.orgId, scope.userId, period, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => aggregateResults(entries ?? [], since), [entries]) // eslint-disable-line react-hooks/exhaustive-deps
  const phones = useMemo(() => [...new Set(all.map(a => a.phone))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })), [all])
  const rows = all.filter(a => (!phone || a.phone === phone) && (!q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase())))
  const used = IRT_ACTIONS.filter(k => all.some(a => a.by[k].ok + a.by[k].err > 0))
  const cols = used.length ? used : (['reel', 'story'] as IrtAction[])
  const tot = (k: IrtAction) => rows.reduce((n, a) => n + a.by[k].ok, 0)
  const totErr = (k: IrtAction) => rows.reduce((n, a) => n + a.by[k].err, 0)
  const setP = (k: string) => { setPeriod(k); try { localStorage.setItem('sf-irt-res-period', k) } catch { /* noop */ } }

  const card: CSSProperties = { padding: '12px 14px', borderRadius: 10, border: `1px solid ${EDGE}`, background: '#0E0E10', minWidth: 130 }
  const field: CSSProperties = { height: 32, padding: '0 10px', borderRadius: 8, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: INK, fontSize: 13 }
  const cell = (s: ActionStat) => {
    if (!s.ok && !s.err) return <span style={{ color: DIM }}>—</span>
    return (
      <span title={s.err && s.lastError ? `Dernier échec : ${s.lastError}` : undefined} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {s.ok > 0 && <b style={{ color: OK }}>✓ {s.ok}</b>}{s.ok > 0 && s.err > 0 && ' '}
          {s.err > 0 && <span style={{ color: BAD }}>✗ {s.err}</span>}
        </span>
        {s.lastOk && <span style={{ fontSize: 11, color: DIM }}>{ago(new Date(s.lastOk).toISOString())}</span>}
      </span>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 8, border: `1px solid ${EDGE}`, background: '#0E0E10' }}>
          {PERIODS.map(p => <button key={p.k} onClick={() => setP(p.k)} style={{ height: 26, padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, background: period === p.k ? 'rgba(255,255,255,0.09)' : 'transparent', color: period === p.k ? INK : MUTED }}>{p.l}</button>)}
        </div>
        <select value={phone} onChange={e => setPhone(e.target.value)} style={field}>
          <option value="">Tous les iPhones</option>
          {phones.map(p => <option key={p} value={p} data-no-tr>{p}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un compte…" style={{ ...field, width: 200 }} />
        <button onClick={() => setTick(n => n + 1)} style={{ ...field, cursor: 'pointer' }}>↻ Actualiser</button>
      </div>

      <IgStatsTable igstats={igstats} accounts={accounts.filter(a => (!phone || a.phone === phone) && (!q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase())))}
        ctaDone={new Set(aggregateResults(entries ?? [], Date.now() - 864e5).filter(a => a.by.story.ok > 0).map(a => `${a.device}::${a.name.toLowerCase()}`))}
        sfReels={new Map(aggregateResults(entries ?? [], Date.now() - 864e5).map(a => [`${a.device}::${a.name.toLowerCase()}`, a.by.reel.ok + a.by.carousel.ok] as [string, number]))}
        busy={statsBusy} error={statsErr} onRefresh={onRefreshStats ? async () => { setStatsBusy(true); setStatsErr(null); try { await onRefreshStats(); setStatsErr(lastStatsError) } finally { setStatsBusy(false) } } : undefined} />

      <div style={{ fontSize: 14, fontWeight: 600, color: INK, margin: '18px 0 10px' }}>🤖 Automatisations ScaleFlow</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={card}><div style={{ fontSize: 22, fontWeight: 600, color: INK }}>{rows.length}</div><div style={{ fontSize: 12, color: MUTED }}>compte(s) actifs</div></div>
        {cols.map(k => (
          <div key={k} style={card}>
            <div style={{ fontSize: 22, fontWeight: 600, color: OK, fontVariantNumeric: 'tabular-nums' }}>{tot(k)}{totErr(k) > 0 && <span style={{ fontSize: 13, color: BAD, fontWeight: 500 }}> · ✗ {totErr(k)}</span>}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{LABEL[k]} réussi(e)s</div>
          </div>
        ))}
      </div>

      {entries === null ? <div style={{ color: MUTED, fontSize: 13 }}>Chargement…</div>
        : !rows.length ? <div style={{ padding: 18, borderRadius: 10, border: `1px solid ${EDGE}`, color: MUTED, fontSize: 13 }}>Aucun résultat sur cette période. Les résultats s’enregistrent à chaque lancement (Posting, Story CTA, carrousel, setup, warm-up) depuis cette mise à jour.</div>
        : (
          <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${EDGE}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: INK }}>
              <thead>
                <tr style={{ background: '#111113', color: MUTED, textAlign: 'left' }}>
                  <th style={{ padding: '9px 12px', fontWeight: 500 }}>Compte</th>
                  <th style={{ padding: '9px 12px', fontWeight: 500 }}>iPhone</th>
                  {cols.map(k => <th key={k} style={{ padding: '9px 12px', fontWeight: 500 }}>{LABEL[k]}</th>)}
                  <th style={{ padding: '9px 12px', fontWeight: 500 }}>Dernière activité</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(a => {
                  const storyToday = (a.by.story.lastOk ?? 0) >= startOfToday()
                  return (
                    <tr key={a.key} style={{ borderTop: `1px solid ${EDGE}` }}>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <span data-no-tr style={{ fontWeight: 500 }}>{a.name}</span>
                        {storyToday && <span style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'rgba(74,222,128,0.1)', color: OK }}>Story aujourd’hui</span>}
                      </td>
                      <td data-no-tr style={{ padding: '9px 12px', color: MUTED, whiteSpace: 'nowrap' }}>{a.phone}</td>
                      {cols.map(k => <td key={k} style={{ padding: '9px 12px' }}>{cell(a.by[k])}</td>)}
                      <td style={{ padding: '9px 12px', color: MUTED, whiteSpace: 'nowrap' }}>{ago(new Date(a.last).toISOString())}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      <div style={{ marginTop: 10, fontSize: 12, color: DIM }}>✓ = réussi · ✗ = raté (survole pour la raison) · <span style={{ color: GOLD }}>partagé avec toute l’agence</span></div>
    </div>
  )
}

/** Stats Instagram du jour (HikerAPI) de tous les comptes iRemoTech : Reels > 5 000 vues en 48 h EN HAUT et surlignés. */
type StatFilter = 'nocta' | 'cta' | 'noreel' | 'reel' | 'viral' | 'stale' | 'flag'
type StatSort = 'viral' | 'views24' | 'followers' | 'reels24' | 'phone' | 'name'
const FILTERS: { k: StatFilter; l: string }[] = [
  { k: 'nocta', l: '❌ Story CTA pas faite' }, { k: 'cta', l: '🔗 Story CTA faite' },
  { k: 'noreel', l: '⏳ 0 Reel aujourd’hui' }, { k: 'reel', l: '🎬 Reels postés aujourd’hui' },
  { k: 'viral', l: '🚀 ≥ 5 000 vues (48 h)' }, { k: 'flag', l: '⚠ Compte à surveiller (flag possible)' }, { k: 'stale', l: '❔ Pas relus / introuvables' },
]
const SORTS: { k: StatSort; l: string }[] = [
  { k: 'viral', l: 'Tri : 🚀 viraux d’abord' }, { k: 'views24', l: 'Tri : vues 24 h' }, { k: 'followers', l: 'Tri : abonnés' },
  { k: 'reels24', l: 'Tri : Reels 24 h' }, { k: 'phone', l: 'Tri : iPhone' }, { k: 'name', l: 'Tri : compte' },
]
const lsGet = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d } catch { return d } }
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* noop */ } }

function IgStatsTable({ igstats, accounts, busy, error, onRefresh, ctaDone, sfReels }: { igstats: Record<string, IgStat>; accounts: { name: string; device: string; phone: string }[]; busy: boolean; error?: string | null; onRefresh?: () => void; ctaDone?: Set<string>; sfReels?: Map<string, number> }) {
  const [filters, setFilters] = useState<StatFilter[]>(() => lsGet('sf-irt-stat-filters', []))
  const [sort, setSort] = useState<StatSort>(() => lsGet('sf-irt-stat-sort', 'viral'))
  const toggle = (k: StatFilter) => setFilters(f => { const n = f.includes(k) ? f.filter(x => x !== k) : [...f, k]; lsSet('sf-irt-stat-filters', n); return n })
  // CTA faite ces 24 h = Story avec lien vue par HikerAPI OU Story CTA publiée par ScaleFlow ces 24 h
  const all = accounts.map(a => {
    const s = igstats[a.name.replace(/^@/, '').toLowerCase()] as IgStat | undefined
    const k = `${a.device}::${a.name.toLowerCase()}`
    const cta = !!s?.storyLink || !!ctaDone?.has(k)
    // Reels du jour = le plus grand de HikerAPI (vu sur Instagram) et des publications réussies par ScaleFlow ces 24 h
    const reels = Math.max(s?.reels24 ?? 0, sfReels?.get(k) ?? 0)
    const health = accountHealth(s)
    return { ...a, s, cta, reels, health }
  })
  const pass = (r: typeof all[number], k: StatFilter) =>
    k === 'nocta' ? !r.cta : k === 'cta' ? r.cta : k === 'noreel' ? !r.s?.missing && !r.reels : k === 'reel' ? r.reels > 0
      : k === 'viral' ? !!r.s?.viral48?.length : k === 'flag' ? ['banned', 'private', 'drop', 'low'].includes(r.health) : !r.s || !!r.s.missing
  const cmp = (x: typeof all[number], y: typeof all[number]) =>
    sort === 'views24' ? (y.s?.views24 ?? -1) - (x.s?.views24 ?? -1)
      : sort === 'followers' ? (y.s?.followers ?? -1) - (x.s?.followers ?? -1)
      : sort === 'reels24' ? y.reels - x.reels
      : sort === 'name' ? x.name.localeCompare(y.name, 'fr')
      : sort === 'phone' ? x.phone.localeCompare(y.phone, 'fr', { numeric: true }) || x.name.localeCompare(y.name, 'fr')
      : (y.s?.viral48?.[0]?.views ?? 0) - (x.s?.viral48?.[0]?.views ?? 0) || (y.s?.views24 ?? 0) - (x.s?.views24 ?? 0) || x.phone.localeCompare(y.phone, 'fr', { numeric: true })
  const rows = all.filter(r => filters.every(k => pass(r, k))).sort(cmp)
  const viral = all.filter(r => r.s?.viral48?.length).length
  const last = Object.values(igstats).reduce((m, s) => Math.max(m, Date.parse(s.at) || 0), 0)
  const th: CSSProperties = { padding: '9px 12px', fontWeight: 500 }
  const td: CSSProperties = { padding: '9px 12px', whiteSpace: 'nowrap' }
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '4px 0 10px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>📈 Stats Instagram (24 h)</div>
        {viral > 0 && <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: 'rgba(244,114,182,0.12)', color: '#F472B6' }}>🚀 {viral} compte(s) avec un Reel ≥ 5 000 vues en 48 h</span>}
        <span style={{ fontSize: 12, color: DIM }}>{last ? `relues ${ago(new Date(last).toISOString())} · automatiquement chaque jour et à chaque détection des comptes` : 'pas encore relues'}</span>
        {onRefresh && <button onClick={onRefresh} disabled={busy} style={{ marginLeft: 'auto', height: 30, padding: '0 12px', borderRadius: 8, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: INK, fontSize: 12.5, cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Lecture…' : '↻ Relire les stats maintenant'}</button>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 10px' }}>
        {FILTERS.map(f => {
          const on = filters.includes(f.k), n = all.filter(r => pass(r, f.k)).length
          return <button key={f.k} onClick={() => toggle(f.k)} style={{ height: 28, padding: '0 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, background: on ? 'rgba(233,196,106,0.14)' : FIELD_BG, color: on ? GOLD : MUTED, border: `1px solid ${on ? 'rgba(233,196,106,0.45)' : FIELD_EDGE}` }}>{f.l} <span style={{ opacity: 0.7 }}>{n}</span></button>
        })}
        {filters.length > 0 && <button onClick={() => { setFilters([]); lsSet('sf-irt-stat-filters', []) }} style={{ height: 28, padding: '0 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, background: 'transparent', color: DIM, border: 'none' }}>✕ Effacer les filtres</button>}
        <select value={sort} onChange={e => { const v = e.target.value as StatSort; setSort(v); lsSet('sf-irt-stat-sort', v) }} style={{ marginLeft: 'auto', height: 28, padding: '0 8px', borderRadius: 7, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: INK, fontSize: 12.5 }}>
          {SORTS.map(o => <option key={o.k} value={o.k}>{o.l}</option>)}
        </select>
        <span style={{ fontSize: 12, color: DIM }}>{rows.length}/{all.length} compte(s)</span>
      </div>
      {error && <div style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)', color: BAD, fontSize: 12.5 }}>⚠ Stats non relues : <span data-no-tr>{error}</span>{/HIKERAPI_KEY/.test(error) ? ' — ajoute la clé HikerAPI (HIKERAPI_KEY) dans les variables d’environnement Vercel, puis redéploie.' : ''}</div>}
      {!rows.length ? <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${EDGE}`, color: MUTED, fontSize: 13 }}>{all.length ? 'Aucun compte ne correspond à ces filtres.' : 'Aucun compte iRemoTech détecté.'}</div> : (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${EDGE}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: INK }}>
            <thead><tr style={{ background: '#111113', color: MUTED, textAlign: 'left' }}>
              <th style={th}>Compte</th><th style={th}>iPhone</th><th style={th} title="Indicatif : Instagram ne publie pas l’état « flag » d’un compte. Introuvable = suspendu / banni / renommé ; portée en chute = derniers Reels à moins d’un quart des précédents.">État</th><th style={th}>Abonnés</th><th style={th}>Abonnements</th><th style={th}>Reels 24 h</th><th style={th}>Vues 24 h</th><th style={th}>Story CTA</th><th style={th}>🚀 ≥ 5 000 vues (48 h)</th><th style={th}>Relu</th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const s = r.s, v = s?.viral48?.[0]
                return (
                  <tr key={r.device + r.name} style={{ borderTop: `1px solid ${EDGE}`, background: v ? 'rgba(244,114,182,0.07)' : undefined }}>
                    <td style={td}><a data-no-tr href={`https://www.instagram.com/${r.name.replace(/^@/, '')}/`} target="_blank" rel="noreferrer" style={{ color: INK, fontWeight: 500, textDecoration: 'none' }}>{r.name}</a>{s?.missing && <span style={{ marginLeft: 6, fontSize: 11, color: BAD }}>introuvable</span>}</td>
                    <td data-no-tr style={{ ...td, color: MUTED }}>{r.phone}</td>
                    <td style={{ ...td, color: r.health === 'banned' ? BAD : r.health === 'drop' || r.health === 'private' ? '#FB923C' : r.health === 'low' ? GOLD : r.health === 'ok' ? OK : DIM }}>{HEALTH_LABEL[r.health]}</td>
                    <td style={td}>{fmt(s?.followers)}</td>
                    <td style={td}>{fmt(s?.following)}</td>
                    <td style={td}><b style={{ color: r.reels ? OK : DIM }}>{r.reels}</b></td>
                    <td style={td}>{s ? fmt(s.views24) : '—'}</td>
                    <td style={td}>{s?.storyLink ? <span style={{ color: OK }}>🔗 en ligne</span> : r.cta ? <span style={{ color: OK }}>✓ publiée (ScaleFlow)</span> : s?.story ? <span style={{ color: GOLD }}>Story sans lien</span> : s ? <span style={{ color: BAD }}>✗ pas faite</span> : <span style={{ color: DIM }}>—</span>}</td>
                    <td style={td}>{v ? <a href={`https://www.instagram.com/reel/${v.code}/`} target="_blank" rel="noreferrer" style={{ color: '#F472B6', fontWeight: 700, textDecoration: 'none' }}>🚀 {fmt(v.views)}{(s?.viral48?.length ?? 0) > 1 ? ` (+${(s?.viral48?.length ?? 1) - 1})` : ''}</a> : <span style={{ color: DIM }}>—</span>}</td>
                    <td style={{ ...td, color: DIM }}>{s ? ago(s.at) : 'jamais'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
