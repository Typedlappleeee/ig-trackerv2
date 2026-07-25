// Blowsome — Phone Farm / iRemoTech. Vrai panneau de contrôle à distance des
// iPhones iRemoTech via leur Device API (proxy /api/iremotech).
// Capture d'écran cliquable → tap aux coordonnées, + actions (texte, scroll, URL…).
import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useOrg } from '@/lib/orgContext'
import { iremotech, extractDevices, loadIremotechKey, saveIremotechKey, loadDeviceMeta, saveDeviceMeta, type IrtDevice, type IrtAction, type IrtAccount } from '@/lib/iremotech'
import {
  useBlowCSS, Grad, Ico, ICON, GRAD, GOLD, INK, MUTED, FAINT, HAIR,
  BlowCard, BlowPageHeader, BlowBadge, BlowButton, BlowEmpty,
} from '../ui'

type Conn = 'checking' | 'ok' | 'unconfigured' | 'error'

export function BlowPhoneFarm({ user }: { user: User }) {
  useBlowCSS()
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
    } else if ((r.error ?? '').includes('Clé iRemoTech absente')) {
      setConn('unconfigured'); setConnMsg(r.error ?? ''); setShowKey(true)
    } else {
      setConn('error'); setConnMsg(r.error ?? `Erreur ${r.status ?? ''}`)
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
      addLog('✓ clé iRemoTech enregistrée')
      loadDevices()
    } else {
      const missing = /iremotech_config|column|schema cache/i.test(r.error ?? '')
      const hint = missing
        ? " · La colonne de config n'existe pas encore. Lance ce SQL dans Supabase : alter table public.org_config add column if not exists iremotech_config jsonb; alter table public.app_config add column if not exists iremotech_config jsonb;"
        : ''
      setKeyErr(`Échec de l'enregistrement : ${r.error ?? 'erreur inconnue'}${hint}`)
      addLog(`❌ sauvegarde clé : ${r.error}`)
    }
  }

  const refreshSnapshot = useCallback(async (dev: IrtDevice | null, silent = false) => {
    if (!dev || snapBusy.current) return
    snapBusy.current = true
    if (!silent) setSnapLoading(true)
    const r = await iremotech.snapshot(dev.public_id)
    snapBusy.current = false
    if (!silent) setSnapLoading(false)
    if (r.ok && r.dataUrl) { setSnap(r.dataUrl); setOffline(false); setSnapErr('') }
    else if (r.status === 503) {
      // 503 = DeviceOffline (iRemoTech) — inutile de continuer à spammer l'API.
      setOffline(true)
      setLive(false)
      setSnapErr(r.error ?? 'snapshot 503')
      if (!silent) addLog(`⚠️ ${r.error ?? 'snapshot 503'}`)
    } else if (!silent) addLog(`❌ snapshot : ${r.error ?? r.status}`)
  }, [])

  useEffect(() => { if (selected) { setSnap(null); setOffline(false); setSnapErr(''); refreshSnapshot(selected) } }, [selected, refreshSnapshot])

  // Rafraîchissement auto (écran "live") → contrôle bien plus fluide.
  useEffect(() => {
    if (!live || !selected || conn !== 'ok') return
    const id = window.setInterval(() => refreshSnapshot(selected, true), 2000)
    return () => window.clearInterval(id)
  }, [live, selected, conn, refreshSnapshot])

  const sendAction = async (a: IrtAction, label: string) => {
    if (!selected) return
    const r = await iremotech.action(selected.public_id, a)
    addLog(r.ok ? `✓ ${label}` : `❌ ${label} : ${r.error ?? r.status}`)
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
    else addLog(`❌ notes/comptes : ${r.error}`)
  }
  const addAccount = () => setAccounts(a => [...a, { username: '', password: '' }])
  const updateAccount = (i: number, patch: Partial<IrtAccount>) => setAccounts(a => a.map((x, j) => j === i ? { ...x, ...patch } : x))
  const removeAccount = (i: number) => { setAccounts(a => a.filter((_, j) => j !== i)); setReveal(new Set()) }
  const copy = (v: string) => { try { navigator.clipboard?.writeText(v) } catch { /* noop */ } }

  return (
    <div>
      <BlowPageHeader
        title="Phone Farm — iRemoTech"
        subtitle="Pilote tes vrais iPhones à distance (capture, taps, actions)"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <BlowButton variant="ghost" onClick={() => setShowKey(v => !v)} style={{ height: 40 }}><Ico d={ICON.gear} size={15} /> Clé API</BlowButton>
            <BlowButton variant="ghost" onClick={loadDevices} style={{ height: 40 }}><Ico d={ICON.spark} size={15} /> Rafraîchir</BlowButton>
          </div>
        }
      />

      {/* Config de la clé API — par agence (comme le token GeeLark) */}
      {showKey && (
        <BlowCard style={{ padding: 22, marginBottom: 16 }}>
          <BlowBadge tone="gold">✦ Clé API iRemoTech {hasKey ? '· configurée' : '· requise'}</BlowBadge>
          <h3 style={{ margin: '12px 0 6px', fontSize: 17, fontWeight: 800, color: INK }}>Connecte ton compte iRemoTech</h3>
          <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: MUTED, maxWidth: 560 }}>
            Colle ta clé API (créée dans ton dashboard iRemoTech, scopes <b>read · control · upload</b>). Elle est enregistrée <b>pour ton agence</b> — chaque agence a la sienne, comme le token GeeLark.
          </p>
          <div style={{ display: 'flex', gap: 8, maxWidth: 620, flexWrap: 'wrap' }}>
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveKey() }}
              placeholder={hasKey ? '•••••••• (clé déjà enregistrée — colle pour remplacer)' : 'irt_live_<key_id>_<secret>'}
              style={{ flex: 1, minWidth: 240, height: 42, padding: '0 14px', borderRadius: 11, outline: 'none', color: INK, fontSize: 13.5, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}` }}
            />
            <BlowButton onClick={saveKey} style={{ height: 42 }}>{savingKey ? 'Enregistrement…' : 'Enregistrer'}</BlowButton>
          </div>
          {keyErr && (
            <div style={{ margin: '12px 0 0', padding: '10px 13px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', color: '#FCA5A5', fontSize: 12, lineHeight: 1.5 }}>
              {keyErr}
            </div>
          )}
          <p style={{ margin: '12px 0 0', fontSize: 11.5, color: FAINT }}>
            🔒 La clé n'est jamais renvoyée au navigateur ni loguée. Elle transite vers l'API via notre relai sécurisé.
          </p>
        </BlowCard>
      )}

      {conn === 'error' && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title="Connexion impossible" hint={connMsg || 'Vérifie la clé API et le réseau.'} icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'checking' && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title="Connexion à iRemoTech…" icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'ok' && devices.length === 0 && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title="Aucun iPhone" hint="Ton compte iRemoTech ne renvoie aucun appareil. Ajoute/assigne des iPhones côté iRemoTech." icon={<Ico d={ICON.phone} size={20} />} />
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
                return (
                  <button key={d.public_id} onClick={() => setSelected(d)} className="blow-tap" style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 11, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: on ? 'linear-gradient(100deg, rgba(168,85,247,0.2), rgba(99,102,241,0.12))' : 'transparent',
                    boxShadow: on ? 'inset 0 0 0 1px rgba(168,85,247,0.35)' : 'none',
                  }}>
                    <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, display: 'grid', placeItems: 'center', color: '#fff', background: on ? GRAD : 'var(--surface-3)' }}>
                      <Ico d={ICON.phone} size={15} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || d.public_id}</span>
                      <span style={{ display: 'block', fontSize: 10.5, color: FAINT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.public_id}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </BlowCard>

          {/* Contrôle de l'iPhone sélectionné */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 300px) 1fr', gap: 16, alignItems: 'start' }}>
            {/* Écran — tap / swipe / molette envoyés au tel */}
            <BlowCard style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Écran</span>
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
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: INK, marginBottom: 4 }}>Le téléphone ne répond pas (503)</div>
                    <div style={{ fontSize: 10.5, color: FAINT, marginBottom: 10, lineHeight: 1.5 }}>iRemoTech renvoie « device offline » sur cet ID. Vérifie que c'est bien le bon appareil et qu'il est réveillé, puis réessaie.</div>
                    {snapErr && <div style={{ fontSize: 9.5, color: FAINT, marginBottom: 12, fontFamily: 'monospace', wordBreak: 'break-word', opacity: 0.8 }}>{snapErr}</div>}
                    <BlowButton variant="ghost" onClick={() => { setOffline(false); refreshSnapshot(selected) }} style={{ height: 32 }}>Réessayer</BlowButton>
                  </div>
                ) : snap ? (
                  <img ref={imgRef} src={snap} alt="écran" draggable={false}
                    onPointerDown={onSnapDown} onPointerUp={onSnapUp} onWheel={onSnapWheel}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }}
                    title="Clic = taper · glisser = swipe · molette = scroll" />
                ) : (
                  <span style={{ fontSize: 12, color: FAINT }}>{snapLoading ? 'Capture…' : 'Pas de capture'}</span>
                )}
              </div>
              <p style={{ margin: '9px 2px 0', fontSize: 10.5, color: FAINT, textAlign: 'center' }}><Grad style={{ fontWeight: 700 }}>Clic</Grad> = taper · <Grad style={{ fontWeight: 700 }}>glisser</Grad> = swipe · <Grad style={{ fontWeight: 700 }}>molette</Grad> = scroll</p>
            </BlowCard>

            {/* Actions + journal */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <BlowCard style={{ padding: 16 }}>
                {/* Actions = catalogue documenté iRemoTech (press/airplane/scroll/open_url/text) */}
                <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 800, color: INK }}>Actions</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'press', name: 'home' }, 'home')} style={{ height: 34 }}>⌂ Accueil</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'press', name: 'screenshot' }, 'screenshot')} style={{ height: 34 }}>📸 Capture</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'scroll', x: 200, y: 500, dy: -600 }, 'scroll ↑')} style={{ height: 34 }}>↑ Scroll</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'scroll', x: 200, y: 500, dy: 600 }, 'scroll ↓')} style={{ height: 34 }}>↓ Scroll</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'airplane', on: true }, 'avion ON')} style={{ height: 34 }}>✈️ Avion ON</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'airplane', on: false }, 'avion OFF')} style={{ height: 34 }}>✈️ Avion OFF</BlowButton>
                </div>

                <div style={{ height: 1, background: HAIR, margin: '14px 0' }} />
                {/* Ouvrir une app / une URL (open_url) */}
                <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: INK }}>Ouvrir</p>
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
                    placeholder="Taper du texte, ou coller une URL à ouvrir…"
                    style={{ flex: 1, height: 38, padding: '0 13px', borderRadius: 11, outline: 'none', color: INK, fontSize: 13, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}` }}
                  />
                  <BlowButton onClick={() => { if (text.trim()) { sendAction(/^https?:\/\//.test(text) ? { type: 'open_url', url: text } : { type: 'text', text }, text); setText('') } }} style={{ height: 38 }}>Envoyer</BlowButton>
                </div>
              </BlowCard>

              {/* Notes + comptes du téléphone — section repliable */}
              <BlowCard style={{ padding: 16 }}>
                <button onClick={() => setShowMeta(v => !v)} className="blow-tap" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Notes & comptes {accounts.length > 0 && <span style={{ color: MUTED, fontWeight: 600 }}>· {accounts.length}</span>}</span>
                  <span style={{ fontSize: 13, color: MUTED, transform: showMeta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                </button>

                {showMeta && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <button onClick={saveMeta} className="blow-tap" style={{ fontSize: 11.5, fontWeight: 700, color: metaSaved ? '#34D399' : '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer' }}>
                        {metaSaving ? 'Enregistrement…' : metaSaved ? '✓ Enregistré' : 'Enregistrer'}
                      </button>
                    </div>
                    <textarea
                      value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Notes sur ce téléphone (proxy, statut, remarques…)"
                      rows={2}
                      style={{ width: '100%', resize: 'vertical', padding: '9px 11px', borderRadius: 10, outline: 'none', color: INK, fontSize: 12.5, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}`, fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0 8px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>Comptes ({accounts.length})</span>
                      <button onClick={addAccount} className="blow-tap" style={{ fontSize: 11.5, fontWeight: 700, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer' }}>+ Ajouter un compte</button>
                    </div>
                    {accounts.length === 0 ? (
                      <p style={{ fontSize: 11.5, color: FAINT, margin: 0 }}>Aucun compte. Ajoute login / mot de passe / id auth.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {accounts.map((acc, i) => {
                          const shown = reveal.has(i)
                          const field = (v: string, ph: string, on: (val: string) => void, type = 'text') => (
                            <input value={v} onChange={e => on(e.target.value)} placeholder={ph} type={type}
                              style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', borderRadius: 8, outline: 'none', color: INK, fontSize: 12.5, background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIR}` }} />
                          )
                          return (
                            <div key={i} style={{ padding: 10, borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
                              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                {field(acc.username, 'Login', v => updateAccount(i, { username: v }))}
                                <button onClick={() => copy(acc.username)} className="blow-tap" title="Copier" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: MUTED, cursor: 'pointer', fontSize: 12 }}>⧉</button>
                                <button onClick={() => removeAccount(i)} className="blow-tap" title="Supprimer" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: '#F87171', cursor: 'pointer', fontSize: 14 }}>✕</button>
                              </div>
                              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                {field(acc.password, 'Mot de passe', v => updateAccount(i, { password: v }), shown ? 'text' : 'password')}
                                <button onClick={() => setReveal(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })} className="blow-tap" title={shown ? 'Masquer' : 'Afficher'} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: MUTED, cursor: 'pointer', fontSize: 12 }}>{shown ? '🙈' : '👁'}</button>
                                <button onClick={() => copy(acc.password)} className="blow-tap" title="Copier" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: MUTED, cursor: 'pointer', fontSize: 12 }}>⧉</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <p style={{ margin: '10px 0 0', fontSize: 10.5, color: FAINT }}>👥 Visible par toute ton agence. Pense à cliquer « Enregistrer ».</p>
                  </div>
                )}
              </BlowCard>

              <BlowCard style={{ padding: 16 }}>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 800, color: INK }}>Journal</p>
                <div className="blow-scroll" style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {log.length === 0
                    ? <span style={{ fontSize: 12, color: FAINT }}>Aucune action pour l'instant.</span>
                    : log.map((l, i) => <span key={i} style={{ fontSize: 11.5, color: l.includes('❌') ? '#F87171' : 'var(--text-2)', fontFamily: 'monospace' }}>{l}</span>)}
                </div>
              </BlowCard>

              <p style={{ margin: '2px 2px 0', fontSize: 11.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: GOLD }}>✦</span> POC iRemoTech — l'automatisation complète (posting/story) se construira sur ces primitives.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BlowPhoneFarm
