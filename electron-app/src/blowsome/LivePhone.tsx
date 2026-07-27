// Écran d'UN iPhone iRemoTech, réutilisable : flux vidéo temps réel (WebSocket,
// fluide) + repli capture, et interactions (clic = tap, glisser = swipe, molette
// = scroll) envoyées au tel. Sert à l'écran principal, au plein écran et au
// multi-écrans. Chaque instance gère son propre flux et sa propre géométrie.
import { useState, useEffect, useRef, useCallback } from 'react'
import { iremotech, openLiveStream, type IrtDevice, type IrtAction } from '@/lib/iremotech'
import { INK, FAINT, HAIR } from './ui'

interface Props {
  device: IrtDevice
  fps?: number
  rounded?: number                       // rayon des coins de l'écran
  bezel?: boolean                        // cadre "téléphone" autour
  onStatus?: (reachable: boolean) => void
  onLog?: (m: string) => void
}

export function LivePhone({ device, fps = 10, rounded = 22, bezel = true, onStatus, onLog }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const gesture = useRef<{ x: number; y: number } | null>(null)
  const id = device.public_id

  // Flux : WebSocket temps réel ; si ça ferme, on teste une capture (503 = hors
  // ligne → on arrête), sinon on affiche la capture et on retente le WS.
  useEffect(() => {
    let alive = true
    let stop = () => {}
    let tries = 0
    const start = () => {
      stop = openLiveStream(id, {
        onFrame: (url) => { if (!alive) return; setSrc(url); setOffline(false); onStatus?.(true); tries = 0 },
        onClose: async () => {
          if (!alive) return
          const snap = await iremotech.snapshot(id)
          if (!alive) return
          if (snap.ok && snap.dataUrl) { setSrc(snap.dataUrl); setOffline(false); onStatus?.(true) }
          else if (snap.status === 503) { setOffline(true); onStatus?.(false); return }  // hors ligne → stop
          if (tries++ < 3) window.setTimeout(() => { if (alive) start() }, 1200) // reconnexion douce
        },
      }, fps)
    }
    setSrc(null); setOffline(false)
    start()
    return () => { alive = false; stop() }
  }, [id, fps, onStatus])

  // Géométrie : on lit la boîte de l'IMG cliquée (marche pour n'importe quelle taille).
  const toXY = (e: React.PointerEvent<HTMLImageElement> | React.WheelEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (!img.naturalWidth) return null
    const r = img.getBoundingClientRect()
    return { x: Math.round((e.clientX - r.left) / r.width * img.naturalWidth), y: Math.round((e.clientY - r.top) / r.height * img.naturalHeight) }
  }
  const act = useCallback(async (a: IrtAction, label: string) => {
    const r = await iremotech.action(id, a)
    onLog?.(r.ok ? `✓ ${label}` : `❌ ${label} : ${r.error ?? r.status}`)
  }, [id, onLog])

  const onDown = (e: React.PointerEvent<HTMLImageElement>) => { const p = toXY(e); if (p) gesture.current = p }
  const onUp = (e: React.PointerEvent<HTMLImageElement>) => {
    const g = gesture.current; gesture.current = null; const p = toXY(e); if (!g || !p) return
    if (Math.abs(p.x - g.x) + Math.abs(p.y - g.y) < 24) act({ type: 'tap', x: g.x, y: g.y }, `tap (${g.x}, ${g.y})`)
    else act({ type: 'swipe', x1: g.x, y1: g.y, x2: p.x, y2: p.y, duration_ms: 250 }, 'swipe')
  }
  const onWheel = (e: React.WheelEvent<HTMLImageElement>) => {
    e.preventDefault(); const p = toXY(e); if (!p) return
    act({ type: 'scroll', x: p.x, y: p.y, dy: e.deltaY > 0 ? 500 : -500 }, 'scroll')
  }

  const screen = (
    <div style={{ position: 'relative', borderRadius: rounded, overflow: 'hidden', border: `1px solid ${HAIR}`, background: '#0b0b12', aspectRatio: '9/19.5', display: 'grid', placeItems: 'center', width: '100%', height: '100%' }}>
      {offline ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>📴</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: INK }}>{device.name || id}</div>
          <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>hors ligne</div>
        </div>
      ) : src ? (
        <img src={src} alt={device.name || id} draggable={false}
          onPointerDown={onDown} onPointerUp={onUp} onWheel={onWheel}
          style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }} />
      ) : (
        <span style={{ fontSize: 11.5, color: FAINT }}>…</span>
      )}
    </div>
  )

  if (!bezel) return screen
  return (
    <div style={{ padding: 8, borderRadius: rounded + 8, background: 'linear-gradient(160deg,#1b1b27,#0d0d15)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 50px -30px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.05)', height: '100%' }}>
      <div style={{ width: 46, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.14)', margin: '0 auto 7px', pointerEvents: 'none' }} />
      {screen}
    </div>
  )
}

export default LivePhone
