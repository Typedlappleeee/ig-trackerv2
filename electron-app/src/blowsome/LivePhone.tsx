// Écran d'UN iPhone iRemoTech, réutilisable : flux vidéo temps réel (WebSocket,
// fluide) + repli capture, et interactions (clic = tap, glisser = swipe, molette
// = scroll) envoyées au tel. Rendu sur <canvas> via createImageBitmap (décodage
// hors-thread → flux ultra-lisse). Sert à l'écran principal, au plein écran et
// au multi-écrans. Chaque instance gère son propre flux et sa propre géométrie.
import { useState, useEffect, useRef, useCallback } from 'react'
import { iremotech, openLiveStream, getCalib, type IrtDevice, type IrtAction } from '@/lib/iremotech'
import { INK, FAINT, HAIR } from './ui'

// Anim du retour tactile (cercle qui s'agrandit et disparaît) — injectée une fois.
function ensureRippleStyle() {
  if (typeof document === 'undefined' || document.getElementById('lp-ripple-style')) return
  const s = document.createElement('style'); s.id = 'lp-ripple-style'
  s.textContent = '@keyframes lp-ripple{from{transform:translate(-50%,-50%) scale(.4);opacity:.75}to{transform:translate(-50%,-50%) scale(2.4);opacity:0}}'
  document.head.appendChild(s)
}

interface Props {
  device: IrtDevice
  fps?: number
  rounded?: number                       // rayon des coins de l'écran
  bezel?: boolean                        // cadre "téléphone" autour
  startDelay?: number                    // décale l'ouverture du flux (évite d'ouvrir N flux d'un coup)
  paused?: boolean                        // true = pas de flux WS (image figée) → libère un slot (limite 5)
  broadcast?: string[]                    // miroir : rejouer chaque action sur TOUS ces tels
  captureRaw?: (x: number, y: number) => void // calibrage guidé : renvoie les coords BRUTES (sans calib) au lieu de taper
  onRecord?: (a: IrtAction) => void       // enregistreur de séquence : capte chaque action
  onScreenSize?: (w: number, h: number) => void  // taille réelle de l'écran du tel (pixels)
  onStatus?: (reachable: boolean) => void
  onLog?: (m: string) => void
}

export function LivePhone({ device, fps = 10, rounded = 22, bezel = true, startDelay = 0, paused = false, broadcast, captureRaw, onRecord, onScreenSize, onStatus, onLog }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasFrame, setHasFrame] = useState(false)
  const [offline, setOffline] = useState(false)
  const [live, setLive] = useState(false)   // true = flux WebSocket actif (fluide)
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null)
  const scrollAcc = useRef(0)
  const scrollPt = useRef<{ x: number; y: number } | null>(null)
  const scrollTimer = useRef<number | null>(null)
  const reachRef = useRef<boolean | null>(null)   // évite d'appeler onStatus/re-render à CHAQUE frame
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  const rippleId = useRef(0)
  const id = device.public_id
  useEffect(() => { ensureRippleStyle() }, [])
  useEffect(() => () => { if (scrollTimer.current != null) window.clearTimeout(scrollTimer.current) }, [])

  // Dessine une frame sur le canvas (buffer = taille native → object-fit:contain
  // gère le letterbox). Ne notifie le parent QUE si la joignabilité change.
  const draw = (src: CanvasImageSource, w: number, h: number) => {
    const c = canvasRef.current; if (!c || !w || !h) return
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; onScreenSize?.(w, h) }
    const ctx = c.getContext('2d'); if (ctx) ctx.drawImage(src, 0, 0)
    if (!hasFrame) setHasFrame(true)
    if (reachRef.current !== true) { reachRef.current = true; setOffline(false); onStatus?.(true) }
  }
  // Frame-dropping : on ne décode QU'UNE frame à la fois et on ne garde que la
  // PLUS RÉCENTE (les périmées sont jetées) → jamais de retard accumulé, toujours
  // l'image la plus fraîche, comme le fait iRemoTech côté serveur.
  const pendingFrame = useRef<Blob | null>(null)
  const decoding = useRef(false)
  const drainFrames = () => {
    const blob = pendingFrame.current; pendingFrame.current = null
    if (!blob) { decoding.current = false; return }
    decoding.current = true
    createImageBitmap(blob).then(b => { draw(b, b.width, b.height); b.close() }).catch(() => {}).finally(drainFrames)
  }
  const paintBlob = (blob: Blob) => { pendingFrame.current = blob; if (!decoding.current) drainFrames() }
  // Les coordonnées d'action doivent être dans l'espace pixel du SNAPSHOT (doc
  // iRemoTech). Le flux WebSocket peut être d'une AUTRE résolution → on mémorise
  // la taille du snapshot comme référence, sinon les taps tombent à côté.
  const refDims = useRef<{ w: number; h: number } | null>(null)
  const paintUrl = (url: string) => {
    const im = new Image()
    im.onload = () => {
      if (!refDims.current || refDims.current.w !== im.naturalWidth) {
        refDims.current = { w: im.naturalWidth, h: im.naturalHeight }
        onScreenSize?.(im.naturalWidth, im.naturalHeight)
      }
      draw(im, im.naturalWidth, im.naturalHeight)
    }
    im.src = url
  }
  const goOffline = () => { if (reachRef.current !== false) { reachRef.current = false; setOffline(true); onStatus?.(false) } }

  // Le WebSocket est PRIORITAIRE et reste ouvert (reconnexion continue). Les
  // captures ne servent QUE de secours quand le WS est DÉCONNECTÉ — surtout PAS
  // quand l'écran est statique (iRemoTech n'envoie une frame QUE sur changement) :
  // sinon on tirerait des captures en boucle et le quota exploserait.
  useEffect(() => {
    let alive = true
    let stop = () => {}
    let wsOk = false          // WS réellement connecté (open, pas juste "pas de frame")
    let wsDownSince = Date.now()   // depuis quand le WS est down (0 = jamais monté)
    let reconnect: number | undefined
    let retries = 0           // backoff exponentiel des reconnexions
    let logged = false        // ne logge l'échec qu'UNE fois par panne
    setLive(false); reachRef.current = null

    // En PAUSE (ex. tel non survolé en multi) : pas de flux WS → on libère un slot
    // (limite de 5 tels simultanés). On montre juste une image figée.
    if (paused) {
      ;(async () => {
        const s = await iremotech.snapshot(id)
        if (!alive) return
        if (s.ok && s.dataUrl) paintUrl(s.dataUrl)
        else if (s.status === 503) goOffline()
      })()
      return () => { alive = false }
    }
    setHasFrame(false); setOffline(false)

    let firstFrame = true
    const openWs = () => {
      if (reconnect) { window.clearTimeout(reconnect); reconnect = undefined }
      stop = openLiveStream(id, {
        // LIVE = WS CONNECTÉ (même si l'écran est statique = 0 frame).
        onOpen: () => { if (!alive) return; wsOk = true; retries = 0; logged = false; setLive(true) },
        onFrame: (blob) => { if (!alive) return; if (firstFrame) { firstFrame = false; onLog?.(`✓ WebSocket live ${device.name || id}`) } wsOk = true; retries = 0; setLive(true); paintBlob(blob) },
        onClose: (why) => {
          if (!alive) return
          wsOk = false; wsDownSince = Date.now(); setLive(false)
          if (!logged) { logged = true; onLog?.(`⚠️ WebSocket ${why} → captures (reconnexion…)`) }
          const delay = Math.min(1500 * 2 ** retries, 20000)   // 1.5s, 3s, 6s, 12s… max 20s
          retries++
          if (reconnect) window.clearTimeout(reconnect)
          reconnect = window.setTimeout(() => { if (alive) openWs() }, delay)
        },
      }, fps)
    }

    // Une SEULE capture d'amorçage → image initiale immédiate (le WS ne pousse
    // ensuite que sur changement).
    const prime = async () => {
      const s = await iremotech.snapshot(id)
      if (!alive) return
      if (s.ok && s.dataUrl) paintUrl(s.dataUrl)
      else if (s.status === 503) goOffline()
    }
    // Secours : captures UNIQUEMENT si le WS est down depuis >6s (vraie panne). Et
    // à cadence LENTE (1 toutes les ~1,8 s) → préserve le quota. WS connecté OU
    // reconnexion → 0 capture.
    const SNAP_EVERY = 1800
    const bridge = async () => {
      while (alive) {
        if (!wsOk && Date.now() - wsDownSince > 6000) {
          const s = await iremotech.snapshot(id)
          if (!alive) break
          if (s.ok && s.dataUrl) { if (!wsOk) paintUrl(s.dataUrl); await new Promise(r => window.setTimeout(r, SNAP_EVERY)) }
          else if (s.status === 503) { goOffline(); await new Promise(r => window.setTimeout(r, 4000)) }
          else await new Promise(r => window.setTimeout(r, SNAP_EVERY))
        } else {
          await new Promise(r => window.setTimeout(r, 1000))   // WS ok / reconnexion → aucune capture
        }
      }
    }
    const t = window.setTimeout(() => {
      prime(); openWs()
      // On ne lance le secours captures qu'après avoir laissé le WS se connecter →
      // si le WS marche, ZÉRO capture (quota préservé).
      window.setTimeout(() => { if (alive) bridge() }, 2000)
    }, startDelay)
    return () => { alive = false; window.clearTimeout(t); if (reconnect) window.clearTimeout(reconnect); stop() }
  }, [id, fps, startDelay, paused]) // eslint-disable-line react-hooks/exhaustive-deps

  // Géométrie : canvas en object-fit:contain → zone RÉELLE (échelle + décalage).
  // raw=true → coords brutes (calibrage) ; sinon + calibration mémorisée.
  const mapXY = (clientX: number, clientY: number, el: HTMLCanvasElement | null, raw = false) => {
    if (!el) return null
    const nw = el.width, nh = el.height; if (!nw || !nh) return null
    const r = el.getBoundingClientRect()
    const scale = Math.min(r.width / nw, r.height / nh)
    const offX = (r.width - nw * scale) / 2, offY = (r.height - nh * scale) / 2
    const cx = (clientX - r.left - offX) / scale, cy = (clientY - r.top - offY) / scale
    if (cx < 0 || cy < 0 || cx > nw || cy > nh) return null
    // On passe par une FRACTION puis on projette dans l'espace SNAPSHOT (référence
    // de l'API) — le flux WS peut avoir une autre résolution que le snapshot.
    const ref = refDims.current ?? { w: nw, h: nh }
    const x = (cx / nw) * ref.w, y = (cy / nh) * ref.h
    if (raw) return { x, y, w: ref.w, h: ref.h }
    const c = getCalib(id)
    return { x: Math.round(Math.min(Math.max(x + c.dx, 0), ref.w)), y: Math.round(Math.min(Math.max(y + c.dy, 0), ref.h)), w: ref.w, h: ref.h }
  }
  const baseXY = (e: React.PointerEvent<HTMLCanvasElement>) => mapXY(e.clientX, e.clientY, e.currentTarget, true)
  const toXY = (e: React.PointerEvent<HTMLCanvasElement>) => mapXY(e.clientX, e.clientY, e.currentTarget, false)
  // Retour tactile instantané : petit cercle à l'endroit cliqué (feedback immédiat
  // → tu sais que le tap a pris, tu ne re-tapes pas → pas d'empilement/délai).
  const ripple = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100
    const rid = ++rippleId.current
    setRipples(rs => [...rs, { id: rid, x, y }])
    window.setTimeout(() => setRipples(rs => rs.filter(z => z.id !== rid)), 480)
  }
  const act = useCallback(async (a: IrtAction, label: string) => {
    onRecord?.(a)   // enregistreur de séquence (RPA maison)
    const targets = (broadcast && broadcast.length) ? Array.from(new Set([id, ...broadcast])) : [id]
    targets.forEach(t => { iremotech.action(t, a) })
    onLog?.(`✓ ${label}${targets.length > 1 ? ` ×${targets.length}` : ''}`)
  }, [id, broadcast, onRecord, onLog])
  const actRef = useRef(act); actRef.current = act

  // Molette → scroll sur le TEL. On DOIT attacher un listener NON-PASSIF (le
  // onWheel React est passif → preventDefault ignoré → c'est la PAGE qui scrolle).
  // On accumule les crans et on envoie une action toutes les ~90 ms.
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const onWheelNative = (ev: WheelEvent) => {
      ev.preventDefault()
      const p = mapXY(ev.clientX, ev.clientY, c, false); if (!p) return
      scrollAcc.current += ev.deltaY; scrollPt.current = { x: p.x, y: p.y }
      if (scrollTimer.current == null) {
        scrollTimer.current = window.setTimeout(() => {
          scrollTimer.current = null
          const pt = scrollPt.current
          const dy = Math.max(-2500, Math.min(2500, Math.round(scrollAcc.current * 6)))  // amplifie pour un scroll franc
          scrollAcc.current = 0
          if (dy !== 0 && pt) actRef.current({ type: 'scroll', x: pt.x, y: pt.y, dy }, 'scroll')
        }, 90)
      }
    }
    c.addEventListener('wheel', onWheelNative, { passive: false })
    return () => c.removeEventListener('wheel', onWheelNative)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (captureRaw) { ripple(e); return }   // mode calibrage : capture au relâchement
    ripple(e)                                // feedback immédiat
    const p = toXY(e); if (p) { gesture.current = { ...p, t: Date.now() }; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ } }
  }
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (captureRaw) { const b = baseXY(e); if (b) captureRaw(Math.round(b.x), Math.round(b.y)); return }
    const g = gesture.current; gesture.current = null; const p = toXY(e); if (!g || !p) return
    const dist = Math.abs(p.x - g.x) + Math.abs(p.y - g.y)
    const dt = Date.now() - g.t
    if (dist < 24) {
      // On logue aussi la position en % → sert à recaler les points du flow IG.
      const ref = refDims.current ?? { w: canvasRef.current?.width || 1, h: canvasRef.current?.height || 1 }
      const pc = `${Math.round((g.x / ref.w) * 100)}% ${Math.round((g.y / ref.h) * 100)}%`
      if (dt >= 450) act({ type: 'long_press', x: g.x, y: g.y, hold_ms: Math.min(dt, 4000) }, `long_press (${g.x}, ${g.y}) · ${pc}`)
      else act({ type: 'tap', x: g.x, y: g.y }, `tap (${g.x}, ${g.y}) · ${pc}`)
    } else {
      const dur = Math.min(Math.max(dt, 60), 2500)
      if (dt >= 350) act({ type: 'drag', x1: g.x, y1: g.y, x2: p.x, y2: p.y, duration_ms: dur }, 'drag')
      else act({ type: 'swipe', x1: g.x, y1: g.y, x2: p.x, y2: p.y, duration_ms: dur }, 'swipe')
    }
  }
  const screen = (
    <div style={{ position: 'relative', borderRadius: rounded, overflow: 'hidden', border: `1px solid ${HAIR}`, background: '#0b0b12', aspectRatio: '9/19.5', display: 'grid', placeItems: 'center', width: '100%' }}>
      <canvas ref={canvasRef}
        onPointerDown={onDown} onPointerUp={onUp}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair', touchAction: 'none', userSelect: 'none', display: !offline && hasFrame ? 'block' : 'none' }} />
      {/* Retours tactiles */}
      {ripples.map(rp => (
        <span key={rp.id} style={{ position: 'absolute', left: `${rp.x}%`, top: `${rp.y}%`, width: 26, height: 26, borderRadius: '50%', border: '2px solid #A5B4FC', pointerEvents: 'none', zIndex: 3, animation: 'lp-ripple .48s ease-out forwards' }} />
      ))}
      {!offline && hasFrame && (
        paused ? (
          <span title="En pause (survole pour le flux live)" style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, fontSize: 8.5, fontWeight: 800, letterSpacing: '.04em', padding: '2px 6px', borderRadius: 99, background: 'rgba(148,163,184,0.22)', color: '#cbd5e1', pointerEvents: 'none' }}>❚❚</span>
        ) : (
          <span title={live ? 'Flux WebSocket (temps réel)' : 'Captures (WebSocket indisponible)'} style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, fontSize: 8.5, fontWeight: 800, letterSpacing: '.04em', padding: '2px 6px', borderRadius: 99, background: live ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)', color: live ? '#34D399' : '#FBBF24', pointerEvents: 'none' }}>{live ? 'LIVE' : 'SD'}</span>
        )
      )}
      {offline ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>📴</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: INK }}>{device.name || id}</div>
          <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>hors ligne</div>
        </div>
      ) : !hasFrame ? (
        <span style={{ fontSize: 11.5, color: FAINT }}>…</span>
      ) : null}
    </div>
  )

  if (!bezel) return screen
  return (
    <div style={{ padding: 8, borderRadius: rounded + 8, background: 'linear-gradient(160deg,#1b1b27,#0d0d15)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 50px -30px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
      <div style={{ width: 46, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.14)', margin: '0 auto 7px', pointerEvents: 'none' }} />
      {screen}
    </div>
  )
}

export default LivePhone
