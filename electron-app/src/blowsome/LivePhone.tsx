// Écran d'UN iPhone iRemoTech, réutilisable : flux vidéo temps réel (WebSocket,
// fluide) + repli capture, et interactions (clic = tap, glisser = swipe, molette
// = scroll) envoyées au tel. Sert à l'écran principal, au plein écran et au
// multi-écrans. Chaque instance gère son propre flux et sa propre géométrie.
import { useState, useEffect, useRef, useCallback } from 'react'
import { iremotech, openLiveStream, getCalib, type IrtDevice, type IrtAction } from '@/lib/iremotech'
import { INK, FAINT, HAIR } from './ui'

interface Props {
  device: IrtDevice
  fps?: number
  rounded?: number                       // rayon des coins de l'écran
  bezel?: boolean                        // cadre "téléphone" autour
  startDelay?: number                    // décale l'ouverture du flux (évite d'ouvrir N flux d'un coup)
  onStatus?: (reachable: boolean) => void
  onLog?: (m: string) => void
}

export function LivePhone({ device, fps = 10, rounded = 22, bezel = true, startDelay = 0, onStatus, onLog }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [hasFrame, setHasFrame] = useState(false)
  const [offline, setOffline] = useState(false)
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null)
  const id = device.public_id

  // Rendu IMPÉRATIF : on écrit direct dans l'<img> (pas de re-render React par
  // frame → bien plus fluide).
  const [live, setLive] = useState(false)   // true = flux WebSocket actif (fluide)
  const paint = (url: string) => { const img = imgRef.current; if (img) img.src = url; setHasFrame(true); setOffline(false); onStatus?.(true) }

  // Stratégie : le WebSocket est PRIORITAIRE et reste ouvert (reconnexion continue
  // avec backoff). Les captures ne servent que de PONT quand aucune frame WS n'est
  // arrivée récemment → dès que le WS livre, les captures s'arrêtent (fluide).
  useEffect(() => {
    let alive = true
    let stop = () => {}
    let lastWs = 0            // horodatage de la dernière frame WebSocket
    let reconnect: number | undefined
    setHasFrame(false); setOffline(false); setLive(false)

    let firstFrame = true
    const openWs = () => {
      stop = openLiveStream(id, {
        onFrame: (url) => { if (!alive) return; if (firstFrame) { firstFrame = false; onLog?.(`✓ WebSocket live ${device.name || id}`) } lastWs = Date.now(); setLive(true); paint(url) },
        onClose: (why) => { if (!alive) return; setLive(false); if (firstFrame) onLog?.(`⚠️ WebSocket ${why} (scope "stream" ?) → captures`); reconnect = window.setTimeout(() => { if (alive) openWs() }, 3000) },
      }, fps)
    }

    // Pont captures : ne tire une capture que si le WS n'a rien donné depuis 1.5s.
    const bridge = async () => {
      while (alive) {
        if (Date.now() - lastWs > 1500) {
          const s = await iremotech.snapshot(id)
          if (!alive) break
          if (s.ok && s.dataUrl) { if (Date.now() - lastWs > 1200) paint(s.dataUrl) }  // n'écrase pas une frame WS fraîche
          else if (s.status === 503) { setOffline(true); onStatus?.(false); await new Promise(r => window.setTimeout(r, 3000)) }
        } else {
          await new Promise(r => window.setTimeout(r, 600))   // WS actif → on dort (limiteur libre pour les taps)
        }
      }
    }

    const t = window.setTimeout(() => { openWs(); bridge() }, startDelay)   // décalage (multi-écrans)
    return () => { alive = false; window.clearTimeout(t); if (reconnect) window.clearTimeout(reconnect); stop() }
  }, [id, fps, startDelay, onStatus])

  // Géométrie : l'image est en objectFit:contain → on calcule sa zone RÉELLE
  // (échelle + décalage) pour que le clic tombe pile au bon endroit (calibration).
  const toXY = (e: React.PointerEvent<HTMLImageElement> | React.WheelEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (!img.naturalWidth) return null
    const r = img.getBoundingClientRect()
    const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight)
    const offX = (r.width - img.naturalWidth * scale) / 2, offY = (r.height - img.naturalHeight * scale) / 2
    const x = (e.clientX - r.left - offX) / scale, y = (e.clientY - r.top - offY) / scale
    if (x < 0 || y < 0 || x > img.naturalWidth || y > img.naturalHeight) return null
    const c = getCalib(id)   // décalage de calibration mémorisé pour ce tel
    return { x: Math.round(Math.min(Math.max(x + c.dx, 0), img.naturalWidth)), y: Math.round(Math.min(Math.max(y + c.dy, 0), img.naturalHeight)) }
  }
  const act = useCallback(async (a: IrtAction, label: string) => {
    const r = await iremotech.action(id, a)
    onLog?.(r.ok ? `✓ ${label}` : `❌ ${label} : ${r.error ?? r.status}`)
  }, [id, onLog])

  const onDown = (e: React.PointerEvent<HTMLImageElement>) => { const p = toXY(e); if (p) { gesture.current = { ...p, t: Date.now() }; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ } } }
  const onUp = (e: React.PointerEvent<HTMLImageElement>) => {
    const g = gesture.current; gesture.current = null; const p = toXY(e); if (!g || !p) return
    const dist = Math.abs(p.x - g.x) + Math.abs(p.y - g.y)
    const dt = Date.now() - g.t   // durée du maintien (ms)
    if (dist < 24) {
      // Pas de mouvement : appui court = tap, appui maintenu = long_press.
      if (dt >= 450) act({ type: 'long_press', x: g.x, y: g.y, hold_ms: Math.min(dt, 4000) }, `long_press (${g.x}, ${g.y})`)
      else act({ type: 'tap', x: g.x, y: g.y }, `tap (${g.x}, ${g.y})`)
    } else {
      // Mouvement : on rejoue le geste sur la VRAIE durée du maintien → swipe rapide
      // (flick) ou drag lent contrôlé selon combien de temps tu es resté appuyé.
      const dur = Math.min(Math.max(dt, 60), 2500)
      if (dt >= 350) act({ type: 'drag', x1: g.x, y1: g.y, x2: p.x, y2: p.y, duration_ms: dur }, 'drag')
      else act({ type: 'swipe', x1: g.x, y1: g.y, x2: p.x, y2: p.y, duration_ms: dur }, 'swipe')
    }
  }
  const onWheel = (e: React.WheelEvent<HTMLImageElement>) => {
    e.preventDefault(); const p = toXY(e); if (!p) return
    act({ type: 'scroll', x: p.x, y: p.y, dy: e.deltaY > 0 ? 500 : -500 }, 'scroll')
  }

  const screen = (
    <div style={{ position: 'relative', borderRadius: rounded, overflow: 'hidden', border: `1px solid ${HAIR}`, background: '#0b0b12', aspectRatio: '9/19.5', display: 'grid', placeItems: 'center', width: '100%' }}>
      {/* L'img est toujours montée (ref dispo pour l'écriture impérative) ; masquée tant qu'aucune frame. */}
      <img ref={imgRef} alt={device.name || id} draggable={false}
        onPointerDown={onDown} onPointerUp={onUp} onWheel={onWheel}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair', touchAction: 'none', userSelect: 'none', display: !offline && hasFrame ? 'block' : 'none' }} />
      {/* Indicateur : WS temps réel (vert) vs captures de secours (ambre) */}
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
