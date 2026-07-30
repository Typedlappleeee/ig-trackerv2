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
  broadcast?: string[]                    // miroir : rejouer chaque action sur TOUS ces tels
  captureRaw?: (x: number, y: number) => void // calibrage guidé : renvoie les coords BRUTES (sans calib) au lieu de taper
  onStatus?: (reachable: boolean) => void
  onLog?: (m: string) => void
}

export function LivePhone({ device, fps = 10, rounded = 22, bezel = true, startDelay = 0, broadcast, captureRaw, onStatus, onLog }: Props) {
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
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    const ctx = c.getContext('2d'); if (ctx) ctx.drawImage(src, 0, 0)
    if (!hasFrame) setHasFrame(true)
    if (reachRef.current !== true) { reachRef.current = true; setOffline(false); onStatus?.(true) }
  }
  const paintBlob = (blob: Blob) => { createImageBitmap(blob).then(b => { draw(b, b.width, b.height); b.close() }).catch(() => {}) }
  const paintUrl = (url: string) => { const im = new Image(); im.onload = () => draw(im, im.naturalWidth, im.naturalHeight); im.src = url }
  const goOffline = () => { if (reachRef.current !== false) { reachRef.current = false; setOffline(true); onStatus?.(false) } }

  // Le WebSocket est PRIORITAIRE et reste ouvert (reconnexion continue). Les
  // captures ne servent que de PONT quand aucune frame WS depuis 1.5s.
  useEffect(() => {
    let alive = true
    let stop = () => {}
    let lastWs = 0
    let reconnect: number | undefined
    setHasFrame(false); setOffline(false); setLive(false); reachRef.current = null

    let firstFrame = true
    const openWs = () => {
      stop = openLiveStream(id, {
        onFrame: (blob) => { if (!alive) return; if (firstFrame) { firstFrame = false; onLog?.(`✓ WebSocket live ${device.name || id}`) } lastWs = Date.now(); if (!live) setLive(true); paintBlob(blob) },
        onClose: (why) => { if (!alive) return; setLive(false); if (firstFrame) onLog?.(`⚠️ WebSocket ${why} (scope "stream" ?) → captures`); reconnect = window.setTimeout(() => { if (alive) openWs() }, 3000) },
      }, fps)
    }
    const bridge = async () => {
      while (alive) {
        if (Date.now() - lastWs > 1500) {
          const s = await iremotech.snapshot(id)
          if (!alive) break
          if (s.ok && s.dataUrl) { if (Date.now() - lastWs > 1200) paintUrl(s.dataUrl) }
          else if (s.status === 503) { goOffline(); await new Promise(r => window.setTimeout(r, 3000)) }
        } else {
          await new Promise(r => window.setTimeout(r, 600))
        }
      }
    }
    const t = window.setTimeout(() => { openWs(); bridge() }, startDelay)
    return () => { alive = false; window.clearTimeout(t); if (reconnect) window.clearTimeout(reconnect); stop() }
  }, [id, fps, startDelay]) // eslint-disable-line react-hooks/exhaustive-deps

  // Géométrie : canvas en object-fit:contain → zone RÉELLE (échelle + décalage).
  // raw=true → coords brutes (calibrage) ; sinon + calibration mémorisée.
  const mapXY = (clientX: number, clientY: number, el: HTMLCanvasElement | null, raw = false) => {
    if (!el) return null
    const nw = el.width, nh = el.height; if (!nw || !nh) return null
    const r = el.getBoundingClientRect()
    const scale = Math.min(r.width / nw, r.height / nh)
    const offX = (r.width - nw * scale) / 2, offY = (r.height - nh * scale) / 2
    const x = (clientX - r.left - offX) / scale, y = (clientY - r.top - offY) / scale
    if (x < 0 || y < 0 || x > nw || y > nh) return null
    if (raw) return { x, y, w: nw, h: nh }
    const c = getCalib(id)
    return { x: Math.round(Math.min(Math.max(x + c.dx, 0), nw)), y: Math.round(Math.min(Math.max(y + c.dy, 0), nh)), w: nw, h: nh }
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
    const targets = (broadcast && broadcast.length) ? Array.from(new Set([id, ...broadcast])) : [id]
    targets.forEach(t => { iremotech.action(t, a) })
    onLog?.(`✓ ${label}${targets.length > 1 ? ` ×${targets.length}` : ''}`)
  }, [id, broadcast, onLog])
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
      if (dt >= 450) act({ type: 'long_press', x: g.x, y: g.y, hold_ms: Math.min(dt, 4000) }, `long_press (${g.x}, ${g.y})`)
      else act({ type: 'tap', x: g.x, y: g.y }, `tap (${g.x}, ${g.y})`)
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
        <span title={live ? 'Flux WebSocket (temps réel)' : 'Captures (WebSocket indisponible)'} style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, fontSize: 8.5, fontWeight: 800, letterSpacing: '.04em', padding: '2px 6px', borderRadius: 99, background: live ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)', color: live ? '#34D399' : '#FBBF24', pointerEvents: 'none' }}>{live ? 'LIVE' : 'SD'}</span>
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
