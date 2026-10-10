import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IrtDevice, IrtAction, SeqStep } from '@/lib/iremotech'
import { openLiveStream, sendAction, snapshot } from '@/lib/iremotech'
import { themeFor } from '@/lib/theme'
import { Btn, TEXTAREA } from '@/lib/ui'

// Contrôle en direct d'un iPhone (Phone Farm) : flux vidéo WebSocket dessiné sur
// un canvas, tap/swipe/texte renvoyés à l'appareil, et enregistrement des actions
// en séquence (macro) rejouable pour poster en masse.
const INK = '#EDEDEF', MUTED = '#8B8B94'
const PANEL = '#111113'
const THEME = themeFor('iremotech')

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

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.6)' }}>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 16, maxWidth: '100%', maxHeight: '92vh' }}>
        {/* Écran live */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <canvas ref={canvasRef} onMouseDown={onDown} onMouseUp={onUp}
            style={{ width: 300, maxWidth: '40vw', aspectRatio: '390 / 844', borderRadius: 20, background: '#000', border: '1px solid rgba(255,255,255,0.1)', cursor: status === 'live' ? 'pointer' : 'default' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Btn theme={THEME} icon="M3 10.5 12 3l9 7.5|M5 10v10h14V10" label="Home" onClick={() => quick({ type: 'press', name: 'home' })} />
            <Btn theme={THEME} icon="M12 19V5|M5 12l7-7 7 7" label="Scroll" onClick={() => quick({ type: 'swipe', x1: 195, y1: 650, x2: 195, y2: 250, duration_ms: 300 })} />
            <Btn theme={THEME} icon="M12 5v14|M19 12l-7 7-7-7" label="Scroll" onClick={() => quick({ type: 'swipe', x1: 195, y1: 250, x2: 195, y2: 650, duration_ms: 300 })} />
          </div>
        </div>

        {/* Panneau contrôle */}
        <div style={{ width: 320, maxWidth: '46vw', display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 10, background: PANEL, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.7)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: status === 'live' ? '#4ADE80' : status === 'offline' ? '#F87171' : '#FBBF24' }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.name ?? device.public_id}</span>
            <Btn theme={THEME} sm label="Fermer" onClick={onClose} />
          </div>
          <div style={{ fontSize: 12, color: MUTED }}>{status === 'live' ? 'En direct — clique/glisse sur l’écran pour piloter.' : status === 'offline' ? 'Appareil injoignable.' : 'Connexion…'}</div>

          {/* Saisie texte */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: MUTED }}>Saisir du texte</span>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Tape ta légende / recherche…"
              style={{ ...TEXTAREA, minHeight: 60 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ flex: 1, display: 'grid' }}><Btn theme={THEME} label="Envoyer" onClick={() => sendText(false)} /></span>
              <span style={{ flex: 1, display: 'grid' }} title="Marque ce texte comme « légende » : il sera remplacé par la légende choisie au lancement"><Btn theme={THEME} label="↳ comme légende" onClick={() => sendText(true)} /></span>
            </div>
          </div>

          {/* Enregistrement de séquence */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 8, background: '#161618', border: `1px solid ${recording ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: INK, fontVariantNumeric: 'tabular-nums' }}>{recording ? `Enregistrement… (${stepCount} étapes)` : stepCount > 0 ? `Séquence prête (${stepCount} étapes)` : 'Enregistrer une séquence'}</span>
              <Btn theme={THEME} tone={recording ? 'danger' : 'primary'} icon={recording ? 'M6 6h12v12H6z' : 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z'} label={recording ? 'Stop' : 'Rec'} onClick={toggleRec} />
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: MUTED }}>
              Enregistre tes gestes une fois (ouvrir Insta → nouvelle pub → sélectionner la vidéo → légende → publier), puis rejoue-les sur tout le parc avec une vidéo + légende différentes.
            </p>
            {recording && <span style={{ display: 'grid' }}><Btn theme={THEME} label="+ Insérer « envoyer la vidéo »" onClick={insertUpload} /></span>}
            {!recording && stepCount > 0 && (
              <span style={{ display: 'grid' }}><Btn theme={THEME} tone="primary" label="Enregistrer cette séquence" onClick={() => onSaveSequence(stepsRef.current.slice())} /></span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
