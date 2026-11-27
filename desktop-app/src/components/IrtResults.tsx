// iRemoTech › Résultats : vue claire, compte par compte, de ce qui a RÉUSSI (ou raté) en automatisation —
// Reels publiés, Story CTA, carrousels, setup, warm-up — sur la période choisie. Données : `post_runs` (irtResults.ts).
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { aggregateResults, loadIrtResults, IRT_ACTIONS, type IrtAction, type IrtResultEntry, type ActionStat } from '@/lib/irtResults'
import { ago } from '@/lib/irtAccounts'
import type { IgStat } from '@/lib/irtStats'

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
        busy={statsBusy} onRefresh={onRefreshStats ? async () => { setStatsBusy(true); try { await onRefreshStats() } finally { setStatsBusy(false) } } : undefined} />

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
function IgStatsTable({ igstats, accounts, busy, onRefresh }: { igstats: Record<string, IgStat>; accounts: { name: string; device: string; phone: string }[]; busy: boolean; onRefresh?: () => void }) {
  const rows = accounts.map(a => ({ ...a, s: igstats[a.name.replace(/^@/, '').toLowerCase()] as IgStat | undefined }))
    .sort((x, y) => (y.s?.viral48?.[0]?.views ?? 0) - (x.s?.viral48?.[0]?.views ?? 0) || (y.s?.views24 ?? 0) - (x.s?.views24 ?? 0) || x.phone.localeCompare(y.phone, 'fr', { numeric: true }))
  const viral = rows.filter(r => r.s?.viral48?.length).length
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
      {!rows.length ? <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${EDGE}`, color: MUTED, fontSize: 13 }}>Aucun compte iRemoTech détecté.</div> : (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${EDGE}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: INK }}>
            <thead><tr style={{ background: '#111113', color: MUTED, textAlign: 'left' }}>
              <th style={th}>Compte</th><th style={th}>iPhone</th><th style={th}>Abonnés</th><th style={th}>Abonnements</th><th style={th}>Reels 24 h</th><th style={th}>Vues 24 h</th><th style={th}>Story CTA</th><th style={th}>🚀 ≥ 5 000 vues (48 h)</th><th style={th}>Relu</th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const s = r.s, v = s?.viral48?.[0]
                return (
                  <tr key={r.device + r.name} style={{ borderTop: `1px solid ${EDGE}`, background: v ? 'rgba(244,114,182,0.07)' : undefined }}>
                    <td style={td}><a data-no-tr href={`https://www.instagram.com/${r.name.replace(/^@/, '')}/`} target="_blank" rel="noreferrer" style={{ color: INK, fontWeight: 500, textDecoration: 'none' }}>{r.name}</a>{s?.missing && <span style={{ marginLeft: 6, fontSize: 11, color: BAD }}>introuvable</span>}</td>
                    <td data-no-tr style={{ ...td, color: MUTED }}>{r.phone}</td>
                    <td style={td}>{fmt(s?.followers)}</td>
                    <td style={td}>{fmt(s?.following)}</td>
                    <td style={td}>{s ? <b style={{ color: s.reels24 ? OK : DIM }}>{s.reels24 ?? 0}</b> : '—'}</td>
                    <td style={td}>{s ? fmt(s.views24) : '—'}</td>
                    <td style={td}>{!s ? '—' : s.storyLink ? <span style={{ color: OK }}>🔗 en ligne</span> : s.story ? <span style={{ color: GOLD }}>Story sans lien</span> : <span style={{ color: DIM }}>aucune</span>}</td>
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
