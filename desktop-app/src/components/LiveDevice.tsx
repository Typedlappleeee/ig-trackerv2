import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IrtDevice, IrtAction, SeqStep } from '@/lib/iremotech'
import { openLiveStream, sendAction, snapshot } from '@/lib/iremotech'

// Contrôle en direct d'un iPhone (Phone Farm) : flux vidéo WebSocket dessiné sur
// un canvas, tap/swipe/texte renvoyés à l'appareil, et enregistrement des actions
// en séquence (macro) rejouable pour poster en masse.
const GOLD = '#E9C46A', INK = '#ECE9F5', MUTED = '#A79FBD'
const PANEL = 'linear-gradient(168deg,#17111F,#120C19)'
const BORDER = '1px solid rgba(216,180,254,0.14)'

export default function LiveDevice({ apiKey, device, onClose, onSaveSequence }: {
  apiKey: string; device: IrtDevice; onClose: () => void
  onSaveSequence: (steps: SeqStep[]) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const natural = useRef<{ w: number; h: number }>({ w: 390, h: 844 })
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const stepsRef = useRef<SeqStep[]>([])
  const lastTs = useRef<number>(0)
  const [stepCount, setStepCount] = useState(0)

  // Enregistre une étape avec le délai écoulé depuis la précédente.
  const record = useCallback((step: Omit<SeqStep, 'delay'>) => {
    if (!recording) return
    const now = Date.now()
    const delay = lastTs.current ? Math.min(now - lastTs.current, 20000) : 400
    lastTs.current = now
    stepsRef.current.push({ delay, ...step })
    setStepCount(stepsRef.current.length)
  }, [recording])

  // Flux live (WebSocket) → canvas. Repli sur snapshots si le WS échoue.
  useEffect(() => {
    let stopped = false
    let pollTimer: number | null = null
    const draw = (bmp: ImageBitmap | HTMLImageElement, w: number, h: number) => {
      const c = canvasRef.current; if (!c) return
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
      natural.current = { w, h }
      const ctx = c.getContext('2d'); if (ctx) ctx.drawImage(bmp, 0, 0, w, h)
    }
    const stopWs = openLiveStream(apiKey, device.public_id, {
      onOpen: () => !stopped && setStatus('live'),
      onFrame: async (blob) => {
        if (stopped) return
        try { const bmp = await createImageBitmap(blob); draw(bmp, bmp.width, bmp.height); bmp.close() } catch { /* skip frame */ }
      },
      onClose: () => {
        if (stopped) return
        // Repli : snapshots réguliers si le WebSocket tombe.
        setStatus('connecting')
        const poll = async () => {
          if (stopped) return
          const url = await snapshot(apiKey, device.public_id)
          if (url) {
            const img = new Image()
            img.onload = () => { draw(img, img.naturalWidth, img.naturalHeight); setStatus('live') }
            img.src = url
          } else setStatus('offline')
          pollTimer = window.setTimeout(poll, 1200)
        }
        poll()
      },
    }, 8)
    return () => { stopped = true; stopWs(); if (pollTimer) clearTimeout(pollTimer) }
  }, [apiKey, device.public_id])

  // Convertit un clic canvas en coordonnées appareil.
  function toDevice(e: React.MouseEvent): { x: number; y: number } {
    const c = canvasRef.current!; const r = c.getBoundingClientRect()
    const x = Math.round((e.clientX - r.left) / r.width * natural.current.w)
    const y = Math.round((e.clientY - r.top) / r.height * natural.current.h)
    return { x, y }
  }

  // Tap + drag (swipe) : on retient le point de départ au mousedown.
  const down = useRef<{ x: number; y: number; t: number } | null>(null)
  function onDown(e: React.MouseEvent) { const p = toDevice(e); down.current = { ...p, t: Date.now() } }
  function onUp(e: React.MouseEvent) {
    const start = down.current; down.current = null; if (!start) return
    const end = toDevice(e); const dist = Math.hypot(end.x - start.x, end.y - start.y)
    if (dist < 12) {
      const a: IrtAction = { type: 'tap', x: end.x, y: end.y }
      sendAction(apiKey, device.public_id, a); record({ action: a })
    } else {
      const a: IrtAction = { type: 'swipe', x1: start.x, y1: start.y, x2: end.x, y2: end.y, duration_ms: Math.min(Date.now() - start.t, 1200) }
      sendAction(apiKey, device.public_id, a); record({ action: a })
    }
  }

  function quick(a: IrtAction) { sendAction(apiKey, device.public_id, a); record({ action: a }) }
  function sendText(asCaption = false) {
    if (!text.trim()) return
    const a: IrtAction = { type: 'text', text }
    sendAction(apiKey, device.public_id, a); record({ action: a, captionVar: asCaption })
    setText('')
  }

  function toggleRec() {
    if (recording) { setRecording(false) } // arrêt : on garde les étapes pour sauvegarde
    else { stepsRef.current = []; lastTs.current = 0; setStepCount(0); setRecording(true) }
  }
  function insertUpload() { if (recording) { stepsRef.current.push({ delay: 800, upload: true }); setStepCount(stepsRef.current.length) } }

  const btn: React.CSSProperties = { height: 32, padding: '0 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.04)', border: BORDER, color: INK }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(4,3,8,0.78)', backdropFilter: 'blur(6px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 16, maxWidth: '100%', maxHeight: '92vh' }}>
        {/* Écran live */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <canvas ref={canvasRef} onMouseDown={onDown} onMouseUp={onUp}
            style={{ width: 300, maxWidth: '40vw', aspectRatio: '390 / 844', borderRadius: 20, background: '#000', border: '2px solid rgba(216,180,254,0.25)', cursor: status === 'live' ? 'pointer' : 'default', boxShadow: '0 30px 70px -30px rgba(168,85,247,0.7)' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn} onClick={() => quick({ type: 'press', name: 'home' })}>⌂ Home</button>
            <button style={btn} onClick={() => quick({ type: 'swipe', x1: 195, y1: 650, x2: 195, y2: 250, duration_ms: 300 })}>↑ Scroll</button>
            <button style={btn} onClick={() => quick({ type: 'swipe', x1: 195, y1: 250, x2: 195, y2: 650, duration_ms: 300 })}>↓ Scroll</button>
          </div>
        </div>

        {/* Panneau contrôle */}
        <div style={{ width: 320, maxWidth: '46vw', display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 16, background: PANEL, border: BORDER, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: status === 'live' ? '#34D399' : status === 'offline' ? '#EF4444' : '#F59E0B' }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.name ?? device.public_id}</span>
            <button style={{ ...btn, height: 28, padding: '0 10px' }} onClick={onClose}>Fermer</button>
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>{status === 'live' ? 'En direct — clique/glisse sur l’écran pour piloter.' : status === 'offline' ? 'Appareil injoignable.' : 'Connexion…'}</div>

          {/* Saisie texte */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>Saisir du texte</span>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Tape ta légende / recherche…"
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: 9, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: BORDER, color: INK, fontSize: 12.5, outline: 'none', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...btn, flex: 1 }} onClick={() => sendText(false)}>Envoyer</button>
              <button style={{ ...btn, flex: 1 }} onClick={() => sendText(true)} title="Marque ce texte comme « légende » : il sera remplacé par la légende choisie au lancement">↳ comme légende</button>
            </div>
          </div>

          {/* Enregistrement de séquence */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: recording ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${recording ? 'rgba(239,68,68,0.35)' : 'rgba(216,180,254,0.12)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: INK }}>{recording ? `Enregistrement… (${stepCount} étapes)` : stepCount > 0 ? `Séquence prête (${stepCount} étapes)` : 'Enregistrer une séquence'}</span>
              <button style={{ ...btn, background: recording ? '#EF4444' : GOLD, color: recording ? '#fff' : '#1a1206', border: 'none' }} onClick={toggleRec}>{recording ? '■ Stop' : '● Rec'}</button>
            </div>
            <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.5, color: MUTED }}>
              Enregistre tes gestes une fois (ouvrir Insta → nouvelle pub → sélectionner la vidéo → légende → publier), puis rejoue-les sur tout le parc avec une vidéo + légende différentes.
            </p>
            {recording && <button style={btn} onClick={insertUpload}>+ Insérer « envoyer la vidéo »</button>}
            {!recording && stepCount > 0 && (
              <button style={{ ...btn, background: GOLD, color: '#1a1206', border: 'none' }} onClick={() => onSaveSequence(stepsRef.current.slice())}>Enregistrer cette séquence</button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
