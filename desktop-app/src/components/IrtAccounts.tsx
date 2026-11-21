// Studio iRemoTech › « Comptes » : tous les comptes Instagram des iPhones, rangés par iPhone, relus depuis iRemoTech
// (scan des comptes, statut à 6 indicateurs, warm-ups) + profil Instagram (photo, publications, abonnés, abonnements).
// Actions : scanner un iPhone, vérifier le statut, lancer un warm-up iRemoTech — à l'unité ou en lot.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { deviceLabel, isDeviceOn, listJobs, launchAutomation, type IrtDevice, type IrtJob } from '@/lib/iremotech'
import { switchAccountByVision } from '@/lib/iremotechVision'
import { deviceAccounts, ago, compactNum, fetchProfiles, loadProfileCache, avatarSrc, type IgProfile, type AccountView } from '@/lib/irtAccounts'
import { toast } from '@/lib/ui'
import { loadCreatedAccounts } from '@/lib/irtCreatedAccounts'

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
  const [devFilter, setDevFilter] = useState('all')
  const [grouped, setGrouped] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showEmpty, setShowEmpty] = useState(false)
  const scannedRef = useRef<Record<string, string | null>>({})
  const creds = useMemo(() => Object.fromEntries(loadCreatedAccounts().filter(a => a.username && a.password).map(a => [a.username!.toLowerCase(), a])), [])

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
  useEffect(() => { if (allUsers.length) void fetchProfiles(allUsers, false, apiKey).then(setProfiles) }, [allUsers.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // Chiffres relus sur l'iPhone : bascule sur chaque compte (profil affiché → publications / abonnés / abonnements)
  const readOnPhone = async (d: IrtDevice) => {
    const accs = view[d.public_id]?.accounts ?? []
    if (!accs.length) return
    setBusy('read:' + d.public_id)
    toast(`Lecture des stats sur ${deviceLabel(d)} (${accs.length} compte(s), ~30 s chacun) — ne touche pas l’iPhone`, 'info')
    let n = 0
    for (const a of accs) { if (await switchAccountByVision(apiKey, d.public_id, a.username)) n++; setProfiles(loadProfileCache()) }
    setBusy(null); toast(`${deviceLabel(d)} : stats relues pour ${n}/${accs.length} compte(s)`, n ? 'ok' : 'bad')
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
  const qq = q.trim().toLowerCase().replace(/^@/, '')
  const match = (a: AccountView) => (filter === 'all' || a.health.level === filter) && (!qq || a.username.includes(qq) || (profiles[a.username]?.full_name ?? '').toLowerCase().includes(qq))
  const toggle = (k: string) => setSel(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const withAccounts = devices.filter(d => (view[d.public_id]?.accounts.length ?? 0) > 0)
  const empty = devices.filter(d => !(view[d.public_id]?.accounts.length))
  const shown = (devFilter === 'all' ? withAccounts : withAccounts.filter(d => d.public_id === devFilter))
  const rows = shown.flatMap(d => (view[d.public_id]?.accounts ?? []).filter(match).map(a => ({ d, a })))
  const allShownKeys = rows.map(r => keyOf(r.d.public_id, r.a.username))
  const allChecked = allShownKeys.length > 0 && allShownKeys.every(k => sel.has(k))

  // colonne iPhone seulement en vue liste (en vue « Par iPhone », le nom est dans l'en-tête du groupe)
  const COLS = grouped ? '28px minmax(200px,1.8fr) 78px 78px 88px minmax(150px,1.1fr) minmax(130px,1fr) 150px' : '28px minmax(180px,1.6fr) minmax(110px,1fr) 78px 78px 88px minmax(150px,1.1fr) minmax(130px,1fr) 150px'
  const cell: CSSProperties = { display: 'flex', alignItems: 'center', minWidth: 0 }
  const th: CSSProperties = { fontSize: 11, fontWeight: 500, color: DIM, textTransform: 'uppercase', letterSpacing: '.04em' }
  const Num = ({ n }: { n: number | null | undefined }) => <span style={{ fontSize: 13.5, fontWeight: 600, color: n == null ? DIM : INK, fontVariantNumeric: 'tabular-nums' }}>{compactNum(n ?? null)}</span>

  const Row = ({ d, a }: { d: IrtDevice; a: AccountView }) => {
    const id = d.public_id, p = profiles[a.username], k = keyOf(id, a.username), on = sel.has(k)
    const pic = avatarSrc(p?.profile_pic, a.username)
    const pill = a.running === 'account_status' ? { t: 'Vérification…', c: GOLD, b: 'rgba(233,196,106,0.1)' }
      : a.health.level === 'ok' ? { t: 'Sain', c: '#4ADE80', b: 'rgba(74,222,128,0.1)' }
      : a.health.level === 'warn' ? { t: a.health.issues[0] + (a.health.issues.length > 1 ? ` +${a.health.issues.length - 1}` : ''), c: '#FBBF24', b: 'rgba(251,191,36,0.1)' }
      : { t: 'Non vérifié', c: MUTED, b: 'rgba(255,255,255,0.05)' }
    const cr = creds[a.username]
    return (
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '8px 14px', borderTop: `1px solid ${EDGE}`, background: on ? 'rgba(233,196,106,0.05)' : 'transparent' }}>
        <span style={cell}><span onClick={() => toggle(k)} style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 5, cursor: 'pointer', background: on ? GOLD : 'transparent', border: on ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.2)', color: '#0A0A0B', fontSize: 11, fontWeight: 700 }}>{on ? '✓' : ''}</span></span>
        <span style={{ ...cell, gap: 10 }} data-no-tr>
          <span style={{ width: 32, height: 32, borderRadius: 99, flex: 'none', overflow: 'hidden', background: 'linear-gradient(135deg,#8B5CF6,#EC4899)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>
            {pic ? <img src={pic} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : a.username[0]?.toUpperCase()}
          </span>
          <span style={{ minWidth: 0 }}>
            <a href={`https://www.instagram.com/${a.username}/`} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: INK, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{a.username}</a>
            {cr?.password
              ? <span onClick={() => { try { navigator.clipboard.writeText(`${a.username}:${cr.password}${cr.twofa ? ':' + cr.twofa : ''}`); toast('Identifiants copiés', 'ok') } catch { /* noop */ } }} title="Copier identifiant:mot de passe" style={{ display: 'block', fontSize: 11, color: DIM, fontFamily: "'JetBrains Mono',monospace", cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔑 {cr.password}</span>
              : <span style={{ display: 'block', fontSize: 11.5, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.full_name ?? ' '}</span>}
          </span>
        </span>
        {!grouped && <span style={{ ...cell, fontSize: 12.5, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-no-tr>{deviceLabel(d)}</span>}
        <span style={cell}><Num n={p?.media_count} /></span>
        <span style={cell}><Num n={p?.followers} /></span>
        <span style={cell}><Num n={p?.following} /></span>
        <span style={{ ...cell, gap: 6 }}>
          {a.health.level === 'warn' && <span title={a.health.issues.join(' · ')} style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 99, background: '#EF4444', color: '#fff', fontSize: 11, fontWeight: 800 }}>!</span>}
          <span title={a.health.issues.join(' · ') || undefined} style={{ height: 22, padding: '0 9px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 600, color: a.health.level === 'warn' ? '#F87171' : pill.c, background: a.health.level === 'warn' ? 'rgba(239,68,68,0.1)' : pill.b, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pill.t}</span>
        </span>
        <span style={{ ...cell, fontSize: 11.5, color: DIM, flexDirection: 'column', alignItems: 'flex-start' }}>
          <span>{a.running === 'warm_up' ? '🔥 warm-up en cours…' : a.warmup ? `🔥 ${a.warmup.seconds ? Math.round(a.warmup.seconds / 60) + ' min' : 'warm-up'} ${ago(a.warmup.at)}` : 'aucun warm-up'}</span>
          <span>vérifié {ago(a.checkedAt)}</span>
        </span>
        <span style={{ ...cell, gap: 6, justifyContent: 'flex-end' }}>
          <button style={ghost} disabled={!!a.running} onClick={() => void check(id, a.username).then(ok => ok && toast(`Vérification de @${a.username} lancée`, 'info'))} title="iRemoTech lit le statut du compte (6 indicateurs Instagram)">Vérifier</button>
          <button style={ghost} disabled={!!a.running} onClick={() => void warm(id, a.username).then(ok => ok && toast(`Warm-up de ${wuMin} min lancé sur @${a.username}`, 'info'))} title={`Warm-up iRemoTech de ${wuMin} min (jetons iRemoTech)`}>🔥 {wuMin}′</button>
        </span>
      </div>
    )
  }

  const GroupHead = ({ d }: { d: IrtDevice }) => {
    const id = d.public_id, v = view[id], closed = collapsed.has(id)
    const n = (v?.accounts ?? []).filter(match).length
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: `1px solid ${EDGE}`, background: '#0C0C0E', flexWrap: 'wrap' }}>
        <button onClick={() => setCollapsed(c => { const x = new Set(c); if (x.has(id)) x.delete(id); else x.add(id); return x })} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 12, width: 16, padding: 0 }}>{closed ? '▸' : '▾'}</button>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: isDeviceOn(d) ? '#22C55E' : '#EF4444' }} />
        <span style={{ fontSize: 13, fontWeight: 650, color: INK }} data-no-tr>{deviceLabel(d)}</span>
        <span style={{ fontSize: 12, color: DIM }}>{n} compte{n > 1 ? 's' : ''} · {v?.scanning ? 'scan en cours…' : `scanné ${ago(v?.scannedAt)}`}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button style={ghost} onClick={() => setSel(s => { const x = new Set(s); for (const a of v?.accounts ?? []) x.add(keyOf(id, a.username)); return x })}>Tout cocher</button>
          <button style={ghost} disabled={!!busy || !isDeviceOn(d)} onClick={() => void readOnPhone(d)} title="Ouvre chaque compte sur l’iPhone et lit publications, abonnés et abonnements à l’écran">{busy === 'read:' + id ? 'Lecture…' : '📊 Relire'}</button>
          <button style={ghost} disabled={!!v?.scanning || !isDeviceOn(d)} onClick={() => void scan(id)}>{v?.scanning ? 'Scan…' : '🔄 Scanner'}</button>
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '4px 2px' }}>
        {([[stats.total, 'comptes', INK], [stats.ok, 'sains', '#4ADE80'], [stats.warn, 'à surveiller', '#FBBF24'], [stats.running, 'en cours', GOLD], [withAccounts.length, 'iPhones', INK]] as const).map(([n, l, c]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><b style={{ fontSize: 22, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{n}</b><span style={{ fontSize: 12.5, color: MUTED }}>{l}</span></span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un compte…" style={{ ...btn, cursor: 'text', flex: '1 1 200px', minWidth: 0, color: INK, outline: 'none' }} />
        <select value={devFilter} onChange={e => setDevFilter(e.target.value)} style={{ ...btn, maxWidth: 220 }}>
          <option value="all">Tous les iPhones ({withAccounts.length})</option>
          {withAccounts.map(d => <option key={d.public_id} value={d.public_id}>{deviceLabel(d)} · {view[d.public_id]?.accounts.length ?? 0}</option>)}
        </select>
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, background: '#111113', border: `1px solid ${EDGE}` }}>
          {([['all', 'Tous'], ['ok', 'Sains'], ['warn', 'À surveiller'], ['unknown', 'Non vérifiés']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ height: 28, padding: '0 11px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, background: filter === k ? 'rgba(255,255,255,0.08)' : 'transparent', color: filter === k ? INK : MUTED }}>{l}</button>
          ))}
        </div>
        <button style={{ ...btn, background: grouped ? 'rgba(255,255,255,0.08)' : FIELD_BG }} onClick={() => setGrouped(g => !g)} title="Regrouper les comptes par iPhone">{grouped ? '▾ Par iPhone' : '☰ Liste'}</button>
        <button style={btn} disabled={!!busy || !devices.length} onClick={() => void scanAll()} title="iRemoTech lit les comptes connectés sur chaque iPhone en ligne (~30 s, ne pas toucher les iPhones)">{busy === 'scan' ? 'Lancement…' : '🔄 Tout scanner'}</button>
      </div>

      <div style={{ borderRadius: 12, background: '#0F0F11', border: `1px solid ${EDGE}`, overflowX: 'auto' }}>
        <div style={{ minWidth: 980 }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '10px 14px' }}>
            <span style={cell}><span onClick={() => setSel(s => { const x = new Set(s); if (allChecked) allShownKeys.forEach(k => x.delete(k)); else allShownKeys.forEach(k => x.add(k)); return x })} title="Tout cocher / décocher" style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 5, cursor: 'pointer', background: allChecked ? GOLD : 'transparent', border: allChecked ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.2)', color: '#0A0A0B', fontSize: 11, fontWeight: 700 }}>{allChecked ? '✓' : ''}</span></span>
            <span style={th}>Compte</span>{!grouped && <span style={th}>iPhone</span>}<span style={th}>Posts</span><span style={th}>Abonnés</span><span style={th}>Abonnem.</span><span style={th}>Statut</span><span style={th}>Activité</span><span />
          </div>
          {!loaded && !rows.length && <div style={{ padding: 16, fontSize: 13, color: MUTED, borderTop: `1px solid ${EDGE}` }}>Lecture de l’historique iRemoTech…</div>}
          {loaded && !rows.length && <div style={{ padding: 16, fontSize: 13, color: MUTED, borderTop: `1px solid ${EDGE}` }}>{flat.length ? 'Aucun compte ne correspond.' : 'Aucun compte connu : « 🔄 Tout scanner » lit les comptes connectés sur tes iPhones.'}</div>}
          {grouped
            ? shown.map(d => {
              const accs = (view[d.public_id]?.accounts ?? []).filter(match)
              if (!accs.length) return null
              return <div key={d.public_id}><GroupHead d={d} />{!collapsed.has(d.public_id) && accs.map(a => <Row key={a.username} d={d} a={a} />)}</div>
            })
            : rows.map(({ d, a }) => <Row key={keyOf(d.public_id, a.username)} d={d} a={a} />)}
        </div>
      </div>

      {loaded && empty.length > 0 && (
        <div style={{ borderRadius: 12, background: '#0F0F11', border: `1px solid ${EDGE}` }}>
          <button onClick={() => setShowEmpty(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 12.5, textAlign: 'left' }}>
            <span>{showEmpty ? '▾' : '▸'}</span> {empty.length} iPhone{empty.length > 1 ? 's' : ''} sans compte connu
            <span style={{ marginLeft: 'auto', color: DIM }}>« Scanner » pour les lire</span>
          </button>
          {showEmpty && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 12px' }}>
              {empty.map(d => {
                const v = view[d.public_id]
                return <button key={d.public_id} style={ghost} disabled={!!v?.scanning || !isDeviceOn(d)} onClick={() => void scan(d.public_id)} data-no-tr>{v?.scanning ? '⏳ ' : '🔄 '}{deviceLabel(d)}</button>
              })}
            </div>
          )}
        </div>
      )}

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
        Comptes, statuts et warm-ups : relus depuis l’historique iRemoTech (partagé avec l’équipe). Pendant un job, ne touche pas l’iPhone. Les warm-ups consomment des jetons iRemoTech. Posts / abonnés / abonnements : lus sur l’écran de l’iPhone à chaque passage sur le compte (bouton « 📊 Relire »).
      </div>
    </div>
  )
}
