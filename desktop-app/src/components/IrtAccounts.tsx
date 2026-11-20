// Studio iRemoTech › « Comptes » : tous les comptes Instagram des iPhones, rangés par iPhone, relus depuis iRemoTech
// (scan des comptes, statut à 6 indicateurs, warm-ups) + profil Instagram (photo, publications, abonnés, abonnements).
// Actions : scanner un iPhone, vérifier le statut, lancer un warm-up iRemoTech — à l'unité ou en lot.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { deviceLabel, isDeviceOn, listJobs, launchAutomation, type IrtDevice, type IrtJob } from '@/lib/iremotech'
import { deviceAccounts, ago, compactNum, fetchProfiles, loadProfileCache, avatarSrc, type IgProfile, type AccountView } from '@/lib/irtAccounts'
import { toast } from '@/lib/ui'

const GOLD = '#E9C46A', INK = '#EDEDEF', MUTED = '#8B8B94', DIM = '#6E6E78'
const EDGE = 'rgba(255,255,255,0.07)', FIELD_BG = '#161618', FIELD_EDGE = 'rgba(255,255,255,0.09)'
const btn: CSSProperties = { height: 32, padding: '0 12px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: '#E4E4E7', whiteSpace: 'nowrap' }
const ghost: CSSProperties = { ...btn, height: 28, padding: '0 10px', fontSize: 12, background: 'transparent' }
const WARMUP_MIN = [5, 7, 10, 15, 20]
const keyOf = (dev: string, u: string) => `${dev}|${u}`
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Filter = 'all' | 'ok' | 'warn' | 'unknown'

export default function IrtAccounts({ apiKey, devices, known, onScanned }: {
  apiKey: string
  devices: IrtDevice[]
  /** cibles déjà connues par iPhone (« @nom » détectés par ScaleFlow) */
  known: Record<string, string[]>
  /** scan iRemoTech terminé → comptes trouvés (pour les ajouter comme cibles de posting) */
  onScanned?: (dev: string, accounts: string[]) => void
}) {
  const [jobs, setJobs] = useState<Record<string, IrtJob[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [profiles, setProfiles] = useState<Record<string, IgProfile>>(() => loadProfileCache())
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [wuMin, setWuMin] = useState(7)
  const [busy, setBusy] = useState<string | null>(null)
  const scannedRef = useRef<Record<string, string | null>>({})

  const refreshDev = async (dev: string) => { const j = await listJobs(apiKey, dev, 100); setJobs(m => ({ ...m, [dev]: j })) }

  // 1. Historique iRemoTech de chaque iPhone (n'utilise pas les téléphones)
  useEffect(() => {
    let alive = true
    void (async () => {
      for (const d of devices) { if (!alive) return; await refreshDev(d.public_id); await sleep(150) }
      if (alive) setLoaded(true)
    })()
    return () => { alive = false }
  }, [apiKey, devices.map(d => d.public_id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(() => Object.fromEntries(devices.map(d => [d.public_id, deviceAccounts(jobs[d.public_id] ?? [], (known[d.public_id] ?? []).filter(c => c.startsWith('@')))])), [devices, jobs, known])

  // 2. Suivi des jobs en cours (toutes les 20 s)
  useEffect(() => {
    const t = setInterval(() => {
      for (const d of devices) {
        const js = jobs[d.public_id] ?? []
        if (js.some(j => j.status === 'queued' || j.status === 'dispatched')) void refreshDev(d.public_id)
      }
    }, 20_000)
    return () => clearInterval(t)
  }, [devices, jobs]) // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Scan terminé → comptes remontés comme cibles de posting
  useEffect(() => {
    for (const d of devices) {
      const v = view[d.public_id]; if (!v) continue
      const prev = scannedRef.current[d.public_id]
      if (prev !== undefined && v.scannedAt && v.scannedAt !== prev) {
        const accs = (jobs[d.public_id] ?? []).find(j => j.type === 'list_accounts' && j.status === 'completed' && j.finished_at === v.scannedAt)?.result?.accounts as string[] | undefined
        if (accs?.length) { onScanned?.(d.public_id, accs); toast(`${deviceLabel(d)} : ${accs.length} compte(s) trouvé(s)`, 'ok') }
      }
      scannedRef.current[d.public_id] = v.scannedAt
    }
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  // 4. Profils Instagram (photo, abonnés…)
  const allUsers = useMemo(() => [...new Set(Object.values(view).flatMap(v => v.accounts.map(a => a.username)))], [view])
  useEffect(() => { if (allUsers.length) void fetchProfiles(allUsers).then(setProfiles) }, [allUsers.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions ──
  const launch = async (dev: string, body: Parameters<typeof launchAutomation>[2], label: string) => {
    const r = await launchAutomation(apiKey, dev, body)
    if (!r.ok) { toast(`${label} : ${r.error}`, 'bad'); return false }
    setJobs(m => ({ ...m, [dev]: [r.job!, ...(m[dev] ?? [])] }))
    return true
  }
  const scan = async (dev: string) => { if (await launch(dev, { type: 'list_accounts' }, 'Scan')) toast('Scan des comptes lancé : ne touche pas l’iPhone pendant ~30 s', 'info') }
  const scanAll = async () => {
    setBusy('scan')
    let n = 0
    for (const d of devices.filter(isDeviceOn)) { if (await launch(d.public_id, { type: 'list_accounts' }, deviceLabel(d))) n++; await sleep(400) }
    setBusy(null); toast(`${n} scan(s) lancé(s)`, n ? 'ok' : 'bad')
  }
  const check = (dev: string, u: string) => launch(dev, { type: 'account_status', account: u }, `@${u}`)
  const warm = (dev: string, u: string) => launch(dev, { type: 'warm_up', account: u, session_duration_s: wuMin * 60 }, `@${u}`)
  const bulk = async (kind: 'check' | 'warm') => {
    setBusy(kind)
    let n = 0
    for (const k of sel) { const [dev, u] = k.split('|'); if (await (kind === 'check' ? check(dev, u) : warm(dev, u))) n++; await sleep(600) }
    setBusy(null); setSel(new Set())
    toast(kind === 'check' ? `${n} vérification(s) lancée(s)` : `${n} warm-up(s) lancé(s) (${wuMin} min)`, n ? 'ok' : 'bad')
  }

  // ── chiffres + filtres ──
  const flat = devices.flatMap(d => (view[d.public_id]?.accounts ?? []).map(a => ({ d, a })))
  const count = (f: (a: AccountView) => boolean) => flat.filter(x => f(x.a)).length
  const stats = { total: flat.length, ok: count(a => a.health.level === 'ok'), warn: count(a => a.health.level === 'warn'), running: count(a => !!a.running) }
  const match = (a: AccountView) => (filter === 'all' || a.health.level === filter) && (!q.trim() || a.username.includes(q.trim().toLowerCase().replace(/^@/, '')) || (profiles[a.username]?.full_name ?? '').toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (k: string) => setSel(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const Tile = ({ n, label, color }: { n: number; label: string; color?: string }) => (
    <div style={{ flex: '1 1 140px', padding: '14px 16px', borderRadius: 10, background: '#111113', border: `1px solid ${EDGE}` }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? INK, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Tile n={stats.total} label="Comptes" />
        <Tile n={stats.ok} label="Sains" color="#4ADE80" />
        <Tile n={stats.warn} label="À surveiller" color="#FBBF24" />
        <Tile n={stats.running} label="En cours (iRemoTech)" color={GOLD} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un compte…" style={{ ...btn, cursor: 'text', flex: '1 1 220px', minWidth: 0, color: INK, outline: 'none' }} />
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, background: '#111113', border: `1px solid ${EDGE}` }}>
          {([['all', 'Tous'], ['ok', 'Sains'], ['warn', 'À surveiller'], ['unknown', 'Non vérifiés']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ height: 28, padding: '0 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, background: filter === k ? 'rgba(255,255,255,0.08)' : 'transparent', color: filter === k ? INK : MUTED }}>{l}</button>
          ))}
        </div>
        <button style={btn} disabled={!!busy || !devices.length} onClick={() => void scanAll()} title="iRemoTech lit les comptes connectés sur chaque iPhone en ligne (~30 s, ne pas toucher les iPhones)">{busy === 'scan' ? 'Lancement…' : '🔄 Scanner tous les iPhones'}</button>
        <button style={btn} disabled={!allUsers.length} onClick={() => void fetchProfiles(allUsers, true).then(setProfiles)} title="Relit photo, publications, abonnés et abonnements">↻ Stats</button>
      </div>

      {!loaded && <div style={{ fontSize: 13, color: MUTED, padding: '8px 2px' }}>Lecture de l’historique iRemoTech…</div>}

      {devices.map(d => {
        const id = d.public_id, v = view[id]
        const accs = (v?.accounts ?? []).filter(match)
        if (loaded && !v?.accounts.length && (q || filter !== 'all')) return null
        return (
          <div key={id} style={{ borderRadius: 12, background: '#0F0F11', border: `1px solid ${EDGE}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: accs.length ? `1px solid ${EDGE}` : 'none', flexWrap: 'wrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: isDeviceOn(d) ? '#22C55E' : '#EF4444', flex: 'none' }} />
              <span style={{ fontSize: 14, fontWeight: 650, color: INK }} data-no-tr>{deviceLabel(d)}</span>
              <span style={{ fontSize: 12, color: MUTED }}>{v?.accounts.length ?? 0} compte{(v?.accounts.length ?? 0) > 1 ? 's' : ''} · {v?.scanning ? 'scan en cours…' : `scanné ${ago(v?.scannedAt)}`}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {!!v?.accounts.length && <button style={ghost} onClick={() => setSel(s => { const n = new Set(s); for (const a of v.accounts) n.add(keyOf(id, a.username)); return n })}>Tout cocher</button>}
                <button style={ghost} disabled={!!v?.scanning || !isDeviceOn(d)} onClick={() => void scan(id)}>{v?.scanning ? 'Scan…' : '🔄 Scanner'}</button>
              </span>
            </div>
            {!v?.accounts.length && loaded && <div style={{ padding: '14px', fontSize: 12.5, color: MUTED }}>Aucun compte connu. « Scanner » : iRemoTech lit les comptes connectés sur cet iPhone.</div>}
            {accs.map(a => {
              const p = profiles[a.username], k = keyOf(id, a.username), on = sel.has(k)
              const pic = avatarSrc(p?.profile_pic, a.username)
              const pill = a.health.level === 'ok' ? { t: 'Sain', c: '#4ADE80', b: 'rgba(74,222,128,0.1)' }
                : a.health.level === 'warn' ? { t: a.health.issues[0] + (a.health.issues.length > 1 ? ` +${a.health.issues.length - 1}` : ''), c: '#FBBF24', b: 'rgba(251,191,36,0.1)' }
                : { t: 'Non vérifié', c: MUTED, b: 'rgba(255,255,255,0.05)' }
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: `1px solid ${EDGE}`, flexWrap: 'wrap', background: on ? 'rgba(233,196,106,0.04)' : 'transparent' }}>
                  <span onClick={() => toggle(k)} style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 5, cursor: 'pointer', background: on ? GOLD : 'transparent', border: on ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.2)', color: '#0A0A0B', fontSize: 11, fontWeight: 700, flex: 'none' }}>{on ? '✓' : ''}</span>
                  <span style={{ width: 38, height: 38, borderRadius: 99, flex: 'none', overflow: 'hidden', background: 'linear-gradient(135deg,#8B5CF6,#EC4899)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 15 }}>
                    {pic ? <img src={pic} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : a.username[0]?.toUpperCase()}
                  </span>
                  <span style={{ minWidth: 150, flex: '1 1 170px' }} data-no-tr>
                    <a href={`https://www.instagram.com/${a.username}/`} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: INK, textDecoration: 'none' }}>@{a.username}{p?.is_verified ? ' ✔' : ''}</a>
                    <span style={{ display: 'block', fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.full_name ?? ' '}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 16, flex: '1 1 220px', fontVariantNumeric: 'tabular-nums' }}>
                    {([[p?.media_count, 'publications'], [p?.followers, 'abonnés'], [p?.following, 'abonnements']] as const).map(([n, l]) => (
                      <span key={l} style={{ display: 'flex', flexDirection: 'column' }}>
                        <b style={{ fontSize: 14, color: INK, fontWeight: 650 }}>{compactNum(n ?? null)}</b>
                        <span style={{ fontSize: 11, color: DIM }}>{l}</span>
                      </span>
                    ))}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px', minWidth: 0 }}>
                    <span title={a.health.issues.join(' · ') || undefined} style={{ alignSelf: 'flex-start', height: 22, padding: '0 9px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 600, color: pill.c, background: pill.b, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.running === 'account_status' ? 'Vérification…' : pill.t}</span>
                    <span style={{ fontSize: 11.5, color: DIM }}>
                      {a.running === 'warm_up' ? '🔥 warm-up en cours…' : a.warmup ? `🔥 ${a.warmup.seconds ? Math.round(a.warmup.seconds / 60) + ' min' : 'warm-up'} ${ago(a.warmup.at)}` : 'aucun warm-up'} · vérifié {ago(a.checkedAt)}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    <button style={ghost} disabled={!!a.running} onClick={() => void check(id, a.username).then(ok => ok && toast(`Vérification de @${a.username} lancée`, 'info'))} title="iRemoTech lit le statut du compte (6 indicateurs Instagram)">Vérifier</button>
                    <button style={ghost} disabled={!!a.running} onClick={() => void warm(id, a.username).then(ok => ok && toast(`Warm-up de ${wuMin} min lancé sur @${a.username}`, 'info'))} title={`Warm-up iRemoTech de ${wuMin} min (jetons iRemoTech)`}>🔥 {wuMin} min</button>
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}

      {sel.size > 0 && (
        <div style={{ position: 'sticky', bottom: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: '#18181B', border: `1px solid ${EDGE}`, boxShadow: '0 10px 30px rgba(0,0,0,.45)', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 13, color: INK }}>{sel.size} compte{sel.size > 1 ? 's' : ''} sélectionné{sel.size > 1 ? 's' : ''}</b>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={btn} disabled={!!busy} onClick={() => void bulk('check')}>{busy === 'check' ? 'Lancement…' : 'Vérifier le statut'}</button>
            <select value={wuMin} onChange={e => setWuMin(Number(e.target.value))} style={{ ...btn, paddingRight: 8 }}>
              {WARMUP_MIN.map(m => <option key={m} value={m}>Warm-up {m} min</option>)}
            </select>
            <button style={{ ...btn, background: GOLD, color: '#0A0A0B', border: 'none', fontWeight: 600 }} disabled={!!busy} onClick={() => void bulk('warm')}>{busy === 'warm' ? 'Lancement…' : '🔥 Lancer les warm-ups'}</button>
            <button style={ghost} onClick={() => setSel(new Set())}>Annuler</button>
          </span>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.5 }}>
        Les scans, statuts et warm-ups sont faits par iRemoTech et relus depuis son historique (partagé avec toute l’équipe). Pendant un job, ne touche pas l’iPhone : iRemoTech le met en pause sinon. Les warm-ups consomment des jetons iRemoTech. Publications / abonnés / abonnements : relus d’Instagram toutes les 6 h.
      </div>
    </div>
  )
}
