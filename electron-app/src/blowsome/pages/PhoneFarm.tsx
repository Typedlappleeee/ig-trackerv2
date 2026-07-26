// Blowsome — Phone Farm / iRemoTech. Vrai panneau de contrôle à distance des
// iPhones iRemoTech via leur Device API (proxy /api/iremotech).
// Capture d'écran cliquable → tap aux coordonnées, + actions (texte, scroll, URL…).
import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useOrg } from '@/lib/orgContext'
import { useTr } from '@/lib/i18n'
import { iremotech, openSnapshotStream, extractDevices, loadIremotechKey, saveIremotechKey, loadDeviceMeta, saveDeviceMeta, type IrtDevice, type IrtAction, type IrtAccount, type IrtUsage, type IrtBudget } from '@/lib/iremotech'
import {
  useBlowCSS, Grad, Ico, ICON, GRAD, GOLD, INK, MUTED, FAINT, HAIR,
  BlowCard, BlowPageHeader, BlowBadge, BlowButton, BlowEmpty,
} from '../ui'

type Conn = 'checking' | 'ok' | 'unconfigured' | 'error'

export function BlowPhoneFarm({ user }: { user: User }) {
  useBlowCSS()
  const tr = useTr()
  const { currentOrg } = useOrg()
  const [conn, setConn] = useState<Conn>('checking')
  const [connMsg, setConnMsg] = useState('')
  const [devices, setDevices] = useState<IrtDevice[]>([])
  const [selected, setSelected] = useState<IrtDevice | null>(null)
  const [snap, setSnap] = useState<string | null>(null)
  const [snapLoading, setSnapLoading] = useState(false)
  const [text, setText] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [live, setLive] = useState(false)         // rafraîchissement auto (opt-in, coûte du budget)
  const [offline, setOffline] = useState(false)   // 503 device_offline
  const [snapErr, setSnapErr] = useState('')       // message d'erreur brut d'iRemoTech
  const [reach, setReach] = useState<Record<string, 'on' | 'off'>>({}) // joignabilité par tel
  const [usage, setUsage] = useState<IrtUsage | null>(null)          // budgets du jour (/usage)
  const imgRef = useRef<HTMLImageElement>(null)
  const snapBusy = useRef(false)                  // évite d'empiler les captures
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null)  // début d'un geste (tap/swipe)
  // Config de la clé API par agence.
  const [showKey, setShowKey] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [keyErr, setKeyErr] = useState('')
  // Notes + comptes par téléphone (coffre perso).
  const [notes, setNotes] = useState('')
  const [accounts, setAccounts] = useState<IrtAccount[]>([])
  const [metaSaving, setMetaSaving] = useState(false)
  const [metaSaved, setMetaSaved] = useState(false)
  const [reveal, setReveal] = useState<Set<number>>(new Set())
  const [showMeta, setShowMeta] = useState(false)   // section notes/comptes repliable

  const addLog = (m: string) => setLog(l => [`${new Date().toLocaleTimeString()} · ${m}`, ...l].slice(0, 30))

  const loadDevices = useCallback(async () => {
    setConn('checking'); setConnMsg('')
    const r = await iremotech.listDevices()
    if (r.ok) {
      const list = extractDevices(r.data)
      setDevices(list)
      setConn('ok')
      if (list.length && !selected) setSelected(list[0])
      iremotech.usage().then(u => { if (u.ok && u.data) setUsage(u.data) })
    } else if ((r.error ?? '').includes('Clé iRemoTech absente')) {
      setConn('unconfigured'); setConnMsg(r.error ?? ''); setShowKey(true)
    } else {
      setConn('error'); setConnMsg(r.error ?? tr(`Erreur ${r.status ?? ''}`, `Error ${r.status ?? ''}`))
    }
  }, [selected])

  // Au montage : charge la clé de l'agence puis liste les appareils.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const k = await loadIremotechKey(currentOrg?.id ?? null, user.id)
      if (!alive) return
      setHasKey(!!k)
      if (!k) { setConn('unconfigured'); setShowKey(true); return }
      loadDevices()
    })()
    return () => { alive = false }
  }, [currentOrg?.id, user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveKey = async () => {
    if (!keyInput.trim()) return
    setSavingKey(true); setKeyErr('')
    const r = await saveIremotechKey(currentOrg?.id ?? null, user.id, keyInput.trim())
    setSavingKey(false)
    if (r.ok) {
      setHasKey(true); setShowKey(false); setKeyInput('')
      addLog(tr('✓ clé iRemoTech enregistrée', '✓ iRemoTech key saved'))
      loadDevices()
    } else {
      const missing = /iremotech_config|column|schema cache/i.test(r.error ?? '')
      const hint = missing
        ? tr(" · La colonne de config n'existe pas encore. Lance ce SQL dans Supabase : alter table public.org_config add column if not exists iremotech_config jsonb; alter table public.app_config add column if not exists iremotech_config jsonb;", " · The config column does not exist yet. Run this SQL in Supabase: alter table public.org_config add column if not exists iremotech_config jsonb; alter table public.app_config add column if not exists iremotech_config jsonb;")
        : ''
      setKeyErr(tr(`Échec de l'enregistrement : ${r.error ?? 'erreur inconnue'}${hint}`, `Save failed: ${r.error ?? 'unknown error'}${hint}`))
      addLog(tr(`❌ sauvegarde clé : ${r.error}`, `❌ key save: ${r.error}`))
    }
  }

  const refreshSnapshot = useCallback(async (dev: IrtDevice | null, silent = false) => {
    if (!dev || snapBusy.current) return
    snapBusy.current = true
    if (!silent) setSnapLoading(true)
    const r = await iremotech.snapshot(dev.public_id)
    snapBusy.current = false
    if (!silent) setSnapLoading(false)
    if (r.ok && r.dataUrl) { setSnap(r.dataUrl); setOffline(false); setSnapErr(''); setReach(m => ({ ...m, [dev.public_id]: 'on' })) }
    else if (r.status === 503) {
      // 503 = DeviceOffline (iRemoTech) — inutile de continuer à spammer l'API.
      setOffline(true)
      setLive(false)
      setSnapErr(r.error ?? 'snapshot 503')
      setReach(m => ({ ...m, [dev.public_id]: 'off' }))
      if (!silent) addLog(`⚠️ ${r.error ?? 'snapshot 503'}`)
    } else if (!silent) addLog(tr(`❌ snapshot : ${r.error ?? r.status}`, `❌ snapshot: ${r.error ?? r.status}`))
  }, [])

  useEffect(() => { if (selected) { setSnap(null); setOffline(false); setSnapErr(''); refreshSnapshot(selected) } }, [selected, refreshSnapshot])

  // Écran "live" → flux relayé côté serveur (frames continues, une seule requête).
  // Bien plus fluide qu'un polling et sans saturer le tel. Reconnecte à la fin de
  // la fenêtre serverless ; s'arrête tout seul si le tel passe hors ligne.
  useEffect(() => {
    if (!live || !selected || conn !== 'ok') return
    const dev = selected
    let alive = true
    let stop = () => {}
    const start = () => {
      stop = openSnapshotStream(dev.public_id, {
        onFrame: (u) => { setSnap(u); setOffline(false); setReach(m => ({ ...m, [dev.public_id]: 'on' })) },
        onOffline: () => { setOffline(true); setReach(m => ({ ...m, [dev.public_id]: 'off' })); alive = false; setLive(false) },
        onEnd: () => { if (alive) start() },                     // fenêtre finie → on reprend
        onError: (m) => { alive = false; setLive(false); addLog(tr(`❌ live : ${m}`, `❌ live: ${m}`)) },
      })
    }
    start()
    return () => { alive = false; stop() }
  }, [live, selected, conn])

  const sendAction = async (a: IrtAction, label: string) => {
    if (!selected) return
    const r = await iremotech.action(selected.public_id, a)
    addLog(r.ok ? `✓ ${label}` : tr(`❌ ${label} : ${r.error ?? r.status}`, `❌ ${label}: ${r.error ?? r.status}`))
    if (r.ok && !offline) window.setTimeout(() => refreshSnapshot(selected, true), 350)
  }

  // Convertit une position écran → coordonnées pixel de la capture.
  const toDeviceXY = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return null
    const r = img.getBoundingClientRect()
    return { x: Math.round((clientX - r.left) / r.width * img.naturalWidth), y: Math.round((clientY - r.top) / r.height * img.naturalHeight) }
  }
  // Glisser sur l'écran = SWIPE envoyé au tel ; simple clic = TAP.
  const onSnapDown = (e: React.PointerEvent<HTMLImageElement>) => {
    const p = toDeviceXY(e.clientX, e.clientY); if (!p) return
    gesture.current = { x: p.x, y: p.y, t: Date.now() }
  }
  const onSnapUp = (e: React.PointerEvent<HTMLImageElement>) => {
    const g = gesture.current; gesture.current = null
    const p = toDeviceXY(e.clientX, e.clientY); if (!g || !p) return
    const dx = p.x - g.x, dy = p.y - g.y
    if (Math.abs(dx) + Math.abs(dy) < 24) sendAction({ type: 'tap', x: g.x, y: g.y }, `tap (${g.x}, ${g.y})`)
    else sendAction({ type: 'swipe', x1: g.x, y1: g.y, x2: p.x, y2: p.y, duration_ms: 250 }, `swipe`)
  }
  // Molette sur l'écran = scroll sur le tel (et pas sur la page).
  const onSnapWheel = (e: React.WheelEvent<HTMLImageElement>) => {
    e.preventDefault()
    const p = toDeviceXY(e.clientX, e.clientY); if (!p) return
    const dy = e.deltaY > 0 ? 500 : -500
    sendAction({ type: 'scroll', x: p.x, y: p.y, dy }, `scroll ${dy > 0 ? '↓' : '↑'}`)
  }

  // ── Notes + comptes du téléphone sélectionné ────────────────────────────────
  useEffect(() => {
    if (!selected) { setNotes(''); setAccounts([]); return }
    let alive = true
    loadDeviceMeta(currentOrg?.id ?? null, user.id, selected.public_id).then(m => { if (alive) { setNotes(m.notes); setAccounts(m.accounts); setMetaSaved(false); setReveal(new Set()) } })
    return () => { alive = false }
  }, [selected, user.id])

  const saveMeta = async () => {
    if (!selected) return
    setMetaSaving(true); setMetaSaved(false)
    const r = await saveDeviceMeta(currentOrg?.id ?? null, user.id, selected.public_id, { notes, accounts })
    setMetaSaving(false)
    if (r.ok) { setMetaSaved(true); window.setTimeout(() => setMetaSaved(false), 2000) }
    else addLog(tr(`❌ notes/comptes : ${r.error}`, `❌ notes/accounts: ${r.error}`))
  }
  const addAccount = () => setAccounts(a => [...a, { ig_base: '', ig_modified: '', password: '', a2f: '' }])
  const updateAccount = (i: number, patch: Partial<IrtAccount>) => setAccounts(a => a.map((x, j) => j === i ? { ...x, ...patch } : x))
  const removeAccount = (i: number) => { setAccounts(a => a.filter((_, j) => j !== i)); setReveal(new Set()) }
  const copy = (v: string) => { try { navigator.clipboard?.writeText(v) } catch { /* noop */ } }

  return (
    <div>
      <BlowPageHeader
        title="Phone Farm — iRemoTech"
        subtitle={tr('Pilote tes vrais iPhones à distance (capture, taps, actions)', 'Control your real iPhones remotely (screenshot, taps, actions)')}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <BlowButton variant="ghost" onClick={() => setShowKey(v => !v)} style={{ height: 40 }}><Ico d={ICON.gear} size={15} /> {tr('Clé API', 'API key')}</BlowButton>
            <BlowButton variant="ghost" onClick={loadDevices} style={{ height: 40 }}><Ico d={ICON.spark} size={15} /> {tr('Rafraîchir', 'Refresh')}</BlowButton>
          </div>
        }
      />

      {/* Config de la clé API — par agence (comme le token GeeLark) */}
      {showKey && (
        <BlowCard style={{ padding: 22, marginBottom: 16 }}>
          <BlowBadge tone="gold">✦ {tr('Clé API iRemoTech', 'iRemoTech API key')} {hasKey ? tr('· configurée', '· configured') : tr('· requise', '· required')}</BlowBadge>
          <h3 style={{ margin: '12px 0 6px', fontSize: 17, fontWeight: 800, color: INK }}>{tr('Connecte ton compte iRemoTech', 'Connect your iRemoTech account')}</h3>
          <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: MUTED, maxWidth: 560 }}>
            {tr('Colle ta clé API (créée dans ton dashboard iRemoTech, scopes', 'Paste your API key (created in your iRemoTech dashboard, scopes')} <b>read · control · upload</b>). {tr('Elle est enregistrée', 'It is saved')} <b>{tr('pour ton agence', 'for your agency')}</b> — {tr('chaque agence a la sienne, comme le token GeeLark.', 'each agency has its own, like the GeeLark token.')}
          </p>
          <div style={{ display: 'flex', gap: 8, maxWidth: 620, flexWrap: 'wrap' }}>
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveKey() }}
              placeholder={hasKey ? tr('•••••••• (clé déjà enregistrée — colle pour remplacer)', '•••••••• (key already saved — paste to replace)') : 'irt_live_<key_id>_<secret>'}
              style={{ flex: 1, minWidth: 240, height: 42, padding: '0 14px', borderRadius: 11, outline: 'none', color: INK, fontSize: 13.5, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}` }}
            />
            <BlowButton onClick={saveKey} style={{ height: 42 }}>{savingKey ? tr('Enregistrement…', 'Saving…') : tr('Enregistrer', 'Save')}</BlowButton>
          </div>
          {keyErr && (
            <div style={{ margin: '12px 0 0', padding: '10px 13px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', color: '#FCA5A5', fontSize: 12, lineHeight: 1.5 }}>
              {keyErr}
            </div>
          )}
          <p style={{ margin: '12px 0 0', fontSize: 11.5, color: FAINT }}>
            🔒 {tr("La clé n'est jamais renvoyée au navigateur ni loguée. Elle transite vers l'API via notre relai sécurisé.", 'The key is never returned to the browser or logged. It travels to the API through our secure relay.')}
          </p>
        </BlowCard>
      )}

      {conn === 'error' && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title={tr('Connexion impossible', 'Connection failed')} hint={connMsg || tr('Vérifie la clé API et le réseau.', 'Check the API key and the network.')} icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'checking' && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title={tr('Connexion à iRemoTech…', 'Connecting to iRemoTech…')} icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'ok' && devices.length === 0 && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title={tr('Aucun iPhone', 'No iPhone')} hint={tr('Ton compte iRemoTech ne renvoie aucun appareil. Ajoute/assigne des iPhones côté iRemoTech.', 'Your iRemoTech account returns no device. Add/assign iPhones on the iRemoTech side.')} icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'ok' && devices.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) 1fr', gap: 16, alignItems: 'start' }}>
          {/* Liste des iPhones */}
          <BlowCard style={{ padding: 10 }}>
            <p style={{ margin: '4px 6px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED }}>
              {devices.length} iPhone{devices.length > 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 520, overflowY: 'auto' }} className="blow-scroll">
              {devices.map(d => {
                const on = selected?.public_id === d.public_id
                const rc = reach[d.public_id]                    // joignabilité RÉELLE (dernière capture)
                const isOn = rc === 'on'
                const isOff = rc === 'off'
                const dot = isOn ? '#34D399' : isOff ? '#F87171' : '#94A3B8'
                return (
                  <button key={d.public_id} onClick={() => setSelected(d)} className="blow-tap" style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 11, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: on ? 'linear-gradient(100deg, rgba(168,85,247,0.2), rgba(99,102,241,0.12))' : 'transparent',
                    boxShadow: on ? 'inset 0 0 0 1px rgba(168,85,247,0.35)' : 'none',
                  }}>
                    <span style={{ position: 'relative', width: 30, height: 30, flexShrink: 0, borderRadius: 8, display: 'grid', placeItems: 'center', color: '#fff', background: on ? GRAD : 'var(--surface-3)' }}>
                      <Ico d={ICON.phone} size={15} />
                      <span title={isOn ? tr('joignable', 'reachable') : isOff ? tr('hors ligne (503)', 'offline (503)') : tr('non testé', 'not tested')} style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: 99, background: dot, boxShadow: `0 0 0 2px var(--surface-1)${isOn ? ', 0 0 6px ' + dot : ''}` }} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || d.public_id}</span>
                      <span style={{ display: 'block', fontSize: 10.5, color: FAINT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isOff ? tr('hors ligne', 'offline') : d.public_id}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </BlowCard>

          {/* Diagnostic : budgets du jour (GET /usage) */}
          {usage && (() => {
            const rows: Array<[string, IrtBudget | undefined]> = [
              [tr('Captures', 'Snapshots'), usage.snapshots], [tr('Actions', 'Actions'), usage.actions],
              [tr('Minutes actives', 'Active minutes'), usage.active_minutes], [tr('Uploads', 'Uploads'), usage.uploads],
            ]
            return (
              <BlowCard style={{ padding: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>{tr('Quotas du jour', "Today's quotas")}</span>
                  <button onClick={() => iremotech.usage().then(u => { if (u.ok && u.data) setUsage(u.data) })} className="blow-tap" title={tr('Rafraîchir', 'Refresh')} style={{ fontSize: 11, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>↻</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {rows.map(([label, b]) => b && (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: FAINT, marginBottom: 3 }}>
                        <span>{label}</span><span>{b.remaining} / {b.budget}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${b.budget ? Math.max(2, Math.round((b.remaining / b.budget) * 100)) : 0}%`, borderRadius: 99, background: b.remaining <= 0 ? '#F87171' : GRAD }} />
                      </div>
                    </div>
                  ))}
                </div>
                {typeof usage.max_active_devices === 'number' && (
                  <p style={{ margin: '9px 0 0', fontSize: 10, color: FAINT }}>{tr('Max simultanés :', 'Max concurrent:')} <b style={{ color: MUTED }}>{usage.max_active_devices}</b>{usage.resets_at ? ` · reset ${new Date(usage.resets_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                )}
              </BlowCard>
            )
          })()}

          {/* Contrôle de l'iPhone sélectionné */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 300px) 1fr', gap: 16, alignItems: 'start' }}>
            {/* Écran — tap / swipe / molette envoyés au tel */}
            <BlowCard style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Écran', 'Screen')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setLive(v => !v)} className="blow-tap" style={{ fontSize: 11, fontWeight: 700, color: live ? '#34D399' : 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: live ? '#34D399' : 'var(--text-4)', boxShadow: live ? '0 0 8px #34D399' : 'none' }} /> Live
                  </button>
                  <button onClick={() => refreshSnapshot(selected)} className="blow-tap" style={{ fontSize: 11, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>↻</button>
                </div>
              </div>
              <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: `1px solid ${HAIR}`, background: '#0b0b12', aspectRatio: '9/19.5', display: 'grid', placeItems: 'center' }}>
                {offline ? (
                  <div style={{ textAlign: 'center', padding: 20 }}>
                    <div style={{ fontSize: 30, marginBottom: 8 }}>📴</div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: INK, marginBottom: 6 }}>{tr('iRemoTech ne joint pas ce tel', "iRemoTech can't reach this phone")}</div>
                    <div style={{ fontSize: 10.5, color: FAINT, marginBottom: 10, lineHeight: 1.6, textAlign: 'left' }}>
                      {tr("L'API répond", 'The API returns')} <b style={{ color: '#F87171' }}>device_offline / unreachable</b> : {tr("l'agent iRemoTech sur l'iPhone n'est pas joignable. À vérifier sur le tel :", "the iRemoTech agent on the iPhone is unreachable. To check on the phone:")}
                      <br />• {tr("l'app / l'agent iRemoTech est", 'the iRemoTech app / agent is')} <b>{tr('ouverte et connectée', 'open and connected')}</b> ({tr('relance-la si besoin', 'restart it if needed')})
                      <br />• {tr("l'iPhone est", 'the iPhone is')} <b>{tr('déverrouillé et réveillé', 'unlocked and awake')}</b> ({tr('pas en veille', 'not sleeping')})
                      <br />• {tr('le tel a du', 'the phone has')} <b>{tr('réseau', 'network')}</b> ({tr('Wi-Fi / data actifs', 'Wi-Fi / data on')})
                    </div>
                    {snapErr && <div style={{ fontSize: 9.5, color: FAINT, marginBottom: 12, fontFamily: 'monospace', wordBreak: 'break-word', opacity: 0.8 }}>{snapErr}</div>}
                    <BlowButton variant="ghost" onClick={() => { setOffline(false); refreshSnapshot(selected) }} style={{ height: 32 }}>{tr('Réessayer', 'Retry')}</BlowButton>
                  </div>
                ) : snap ? (
                  <img ref={imgRef} src={snap} alt={tr('écran', 'screen')} draggable={false}
                    onPointerDown={onSnapDown} onPointerUp={onSnapUp} onWheel={onSnapWheel}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }}
                    title={tr('Clic = taper · glisser = swipe · molette = scroll', 'Click = tap · drag = swipe · wheel = scroll')} />
                ) : (
                  <span style={{ fontSize: 12, color: FAINT }}>{snapLoading ? tr('Capture…', 'Capturing…') : tr('Pas de capture', 'No snapshot')}</span>
                )}
              </div>
              <p style={{ margin: '9px 2px 0', fontSize: 10.5, color: FAINT, textAlign: 'center' }}><Grad style={{ fontWeight: 700 }}>{tr('Clic', 'Click')}</Grad> = {tr('taper', 'tap')} · <Grad style={{ fontWeight: 700 }}>{tr('glisser', 'drag')}</Grad> = swipe · <Grad style={{ fontWeight: 700 }}>{tr('molette', 'wheel')}</Grad> = scroll</p>
            </BlowCard>

            {/* Actions + journal */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <BlowCard style={{ padding: 16 }}>
                {/* Actions = catalogue documenté iRemoTech (press/airplane/scroll/open_url/text) */}
                <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Actions', 'Actions')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'press', name: 'home' }, 'home')} style={{ height: 34 }}>⌂ {tr('Accueil', 'Home')}</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'press', name: 'screenshot' }, 'screenshot')} style={{ height: 34 }}>📸 {tr('Capture', 'Screenshot')}</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'scroll', x: 200, y: 500, dy: -600 }, 'scroll ↑')} style={{ height: 34 }}>↑ Scroll</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'scroll', x: 200, y: 500, dy: 600 }, 'scroll ↓')} style={{ height: 34 }}>↓ Scroll</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'airplane', on: true }, tr('avion ON', 'airplane ON'))} style={{ height: 34 }}>✈️ {tr('Avion ON', 'Airplane ON')}</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'airplane', on: false }, tr('avion OFF', 'airplane OFF'))} style={{ height: 34 }}>✈️ {tr('Avion OFF', 'Airplane OFF')}</BlowButton>
                </div>

                <div style={{ height: 1, background: HAIR, margin: '14px 0' }} />
                {/* Ouvrir une app / une URL (open_url) */}
                <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Ouvrir', 'Open')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {([
                    { l: 'Instagram', url: 'https://instagram.com' },
                    { l: 'TikTok', url: 'https://www.tiktok.com' },
                    { l: 'Threads', url: 'https://www.threads.net' },
                  ] as const).map(a => (
                    <BlowButton key={a.l} variant="ghost" onClick={() => sendAction({ type: 'open_url', url: a.url }, `open ${a.l}`)} style={{ height: 34 }}>{a.l}</BlowButton>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={text} onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { sendAction(/^https?:\/\//.test(text) ? { type: 'open_url', url: text } : { type: 'text', text }, text); setText('') } }}
                    placeholder={tr('Taper du texte, ou coller une URL à ouvrir…', 'Type text, or paste a URL to open…')}
                    style={{ flex: 1, height: 38, padding: '0 13px', borderRadius: 11, outline: 'none', color: INK, fontSize: 13, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}` }}
                  />
                  <BlowButton onClick={() => { if (text.trim()) { sendAction(/^https?:\/\//.test(text) ? { type: 'open_url', url: text } : { type: 'text', text }, text); setText('') } }} style={{ height: 38 }}>{tr('Envoyer', 'Send')}</BlowButton>
                </div>
              </BlowCard>

              {/* Notes + comptes du téléphone — section repliable */}
              <BlowCard style={{ padding: 16 }}>
                <button onClick={() => setShowMeta(v => !v)} className="blow-tap" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Notes & comptes', 'Notes & accounts')} {accounts.length > 0 && <span style={{ color: MUTED, fontWeight: 600 }}>· {accounts.length}</span>}</span>
                  <span style={{ fontSize: 13, color: MUTED, transform: showMeta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                </button>

                {showMeta && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <button onClick={saveMeta} className="blow-tap" style={{ fontSize: 11.5, fontWeight: 700, color: metaSaved ? '#34D399' : '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer' }}>
                        {metaSaving ? tr('Enregistrement…', 'Saving…') : metaSaved ? tr('✓ Enregistré', '✓ Saved') : tr('Enregistrer', 'Save')}
                      </button>
                    </div>
                    <textarea
                      value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder={tr('Notes sur ce téléphone (proxy, statut, remarques…)', 'Notes about this phone (proxy, status, remarks…)')}
                      rows={2}
                      style={{ width: '100%', resize: 'vertical', padding: '9px 11px', borderRadius: 10, outline: 'none', color: INK, fontSize: 12.5, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}`, fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0 8px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>{tr('Comptes', 'Accounts')} ({accounts.length})</span>
                      <button onClick={addAccount} className="blow-tap" style={{ fontSize: 11.5, fontWeight: 700, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer' }}>{tr('+ Ajouter un compte', '+ Add an account')}</button>
                    </div>
                    {accounts.length === 0 ? (
                      <p style={{ fontSize: 11.5, color: FAINT, margin: 0 }}>{tr('Aucun compte. Ajoute nom IG de base / nom IG modifié / mot de passe / id A2F.', 'No account. Add base IG name / modified IG name / password / 2FA id.')}</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {accounts.map((acc, i) => {
                          const shown = reveal.has(i)
                          // autoComplete=new-password + data-*ignore : empêche le navigateur / gestionnaire
                          // de mots de passe d'auto-remplir ces champs (login app, clé API…).
                          const field = (v: string, ph: string, on: (val: string) => void, type = 'text') => (
                            <input value={v} onChange={e => on(e.target.value)} placeholder={ph} type={type}
                              autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                              data-lpignore="true" data-1p-ignore data-form-type="other" name={`sf-${ph}-${i}`}
                              style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', borderRadius: 8, outline: 'none', color: INK, fontSize: 12.5, background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIR}` }} />
                          )
                          const copyBtn = (v: string) => (
                            <button onClick={() => copy(v)} className="blow-tap" title={tr('Copier', 'Copy')} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: MUTED, cursor: 'pointer', fontSize: 12 }}>⧉</button>
                          )
                          return (
                            <div key={i} style={{ padding: 10, borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
                              {/* Nom IG de base + supprimer */}
                              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                {field(acc.ig_base ?? acc.username ?? '', tr('Nom IG de base', 'Base IG name'), v => updateAccount(i, { ig_base: v }))}
                                {copyBtn(acc.ig_base ?? acc.username ?? '')}
                                <button onClick={() => removeAccount(i)} className="blow-tap" title={tr('Supprimer', 'Delete')} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: '#F87171', cursor: 'pointer', fontSize: 14 }}>✕</button>
                              </div>
                              {/* Nom IG modifié */}
                              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                {field(acc.ig_modified ?? '', tr('Nom IG modifié', 'Modified IG name'), v => updateAccount(i, { ig_modified: v }))}
                                {copyBtn(acc.ig_modified ?? '')}
                              </div>
                              {/* Mot de passe (masqué + révéler) */}
                              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                {field(acc.password ?? '', tr('Mot de passe', 'Password'), v => updateAccount(i, { password: v }), shown ? 'text' : 'password')}
                                <button onClick={() => setReveal(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })} className="blow-tap" title={shown ? tr('Masquer', 'Hide') : tr('Afficher', 'Show')} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: MUTED, cursor: 'pointer', fontSize: 12 }}>{shown ? '🙈' : '👁'}</button>
                                {copyBtn(acc.password ?? '')}
                              </div>
                              {/* Id A2F (2FA) */}
                              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                {field(acc.a2f ?? acc.auth_id ?? '', tr('Id A2F (2FA)', '2FA id'), v => updateAccount(i, { a2f: v }), shown ? 'text' : 'password')}
                                {copyBtn(acc.a2f ?? acc.auth_id ?? '')}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <p style={{ margin: '10px 0 0', fontSize: 10.5, color: FAINT }}>👥 {tr('Visible par toute ton agence. Pense à cliquer « Enregistrer ».', 'Visible to your whole agency. Remember to click “Save”.')}</p>
                  </div>
                )}
              </BlowCard>

              <BlowCard style={{ padding: 16 }}>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Journal', 'Log')}</p>
                <div className="blow-scroll" style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {log.length === 0
                    ? <span style={{ fontSize: 12, color: FAINT }}>{tr("Aucune action pour l'instant.", 'No action yet.')}</span>
                    : log.map((l, i) => <span key={i} style={{ fontSize: 11.5, color: l.includes('❌') ? '#F87171' : 'var(--text-2)', fontFamily: 'monospace' }}>{l}</span>)}
                </div>
              </BlowCard>

              <p style={{ margin: '2px 2px 0', fontSize: 11.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: GOLD }}>✦</span> {tr("POC iRemoTech — l'automatisation complète (posting/story) se construira sur ces primitives.", 'iRemoTech POC — full automation (posting/story) will be built on these primitives.')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BlowPhoneFarm
