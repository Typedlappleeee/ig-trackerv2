// Fenêtre flottante d'UN téléphone cloud (façon GeeLark) : titre déplaçable,
// écran de connexion (fetching/starting/connecting) puis écran fluide ou
// capture, + actions rapides. Plusieurs fenêtres peuvent être ouvertes en même
// temps, chacune indépendante.
import { useState, useRef, useEffect, useCallback } from 'react'
import { cloudPhones, getCloudAgent, type CpInstance } from '@/lib/cloudPhones'

interface Props {
  inst: CpInstance
  zIndex: number
  offset: number          // décale chaque nouvelle fenêtre pour ne pas les empiler pile dessus
  onClose: () => void
  onFocus: () => void
}

type Phase = 'fetching' | 'starting' | 'connecting' | 'ready' | 'error'

export function CloudPhoneWindow({ inst, zIndex, offset, onClose, onFocus }: Props) {
  const [pos, setPos] = useState({ x: 80 + offset * 28, y: 70 + offset * 24 })
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const [phase, setPhase] = useState<Phase>('fetching')
  const [errMsg, setErrMsg] = useState('')
  const [snap, setSnap] = useState<string | null>(null)
  const [fluid, setFluid] = useState(true)
  const imgRef = useRef<HTMLImageElement>(null)
  const pollRef = useRef<number | null>(null)

  // Séquence de connexion : imite l'écran GeeLark ("Fetching data" → "Starting"
  // → "Connecting"), mais avec de VRAIES vérifications (démarre le conteneur si
  // besoin, attend qu'une capture réponde) plutôt qu'une barre décorative.
  const connect = useCallback(async () => {
    setPhase('fetching'); setErrMsg('')
    if (!/running|up/i.test(inst.state)) {
      setPhase('starting')
      const r = await cloudPhones.start(inst.id)
      if (!r.ok) { setPhase('error'); setErrMsg(r.error ?? 'démarrage impossible'); return }
    }
    setPhase('connecting')
    // Attend que le tel réponde à une capture (ADB prêt) — jusqu'à ~40s.
    for (let i = 0; i < 20; i++) {
      const r = await cloudPhones.screenshot(inst.id)
      if (r.ok && r.data?.dataUrl) { setSnap(r.data.dataUrl); setPhase('ready'); return }
      await new Promise(res => setTimeout(res, 2000))
    }
    setPhase('error'); setErrMsg('le tel ne répond pas (boot Android en cours ? réessaie dans une minute)')
  }, [inst.id, inst.state])

  useEffect(() => { connect() }, [connect])

  // Capture en secours (mode non-fluide) : rafraîchit toutes les 2s.
  useEffect(() => {
    if (phase !== 'ready' || fluid) return
    pollRef.current = window.setInterval(async () => {
      const r = await cloudPhones.screenshot(inst.id)
      if (r.ok && r.data?.dataUrl) setSnap(r.data.dataUrl)
    }, 2000)
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [phase, fluid, inst.id])

  // Déplacement de la fenêtre par la barre de titre.
  const onTitleDown = (e: React.PointerEvent) => {
    onFocus()
    dragRef.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current; if (!d) return
      setPos({ x: Math.max(0, d.x + (ev.clientX - d.px)), y: Math.max(0, d.y + (ev.clientY - d.py)) })
    }
    const onUp = () => { dragRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  const onScreenClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return
    const r = img.getBoundingClientRect()
    const x = Math.round((e.clientX - r.left) / r.width * img.naturalWidth)
    const y = Math.round((e.clientY - r.top) / r.height * img.naturalHeight)
    await cloudPhones.shell(inst.id, `input tap ${x} ${y}`)
    if (!fluid) window.setTimeout(async () => { const r2 = await cloudPhones.screenshot(inst.id); if (r2.ok && r2.data?.dataUrl) setSnap(r2.data.dataUrl) }, 350)
  }
  const quickKey = async (key: string) => { await cloudPhones.shell(inst.id, `input keyevent ${key}`) }

  const { url: agentUrl, token: agentToken } = getCloudAgent()
  // ws-scrcpy sert son SPA à la racine (chemins d'assets absolus) — on ne peut
  // pas la monter sous un préfixe /live/ sans casser le chargement des assets
  // (écran noir). Le token protège la page d'accueil (query, jamais tronqué par
  // Chrome contrairement à des identifiants dans l'URL) ; le flux direct vers CE
  // téléphone se fait via le hash `#!action=stream&udid=...` propre à ws-scrcpy.
  const serial = inst.serial || (inst.adbPort ? `127.0.0.1:${inst.adbPort}` : null)
  // `player=mse` : décodage H264 via MediaSource Extensions, supporté nativement
  // par Chrome/Edge (pas besoin du décodeur logiciel broadway, plus fluide).
  // `ws` : l'URL du tunnel ADB-sur-WebSocket que ws-scrcpy ouvre en interne pour
  // parler au scrcpy-server sur le téléphone — ws-scrcpy la construit d'habitude
  // lui-même après une étape de sélection d'appareil (jamais exposée par un
  // simple lien direct) ; on la reconstruit à la main :
  // wss://<host>/?action=proxy-adb&remote=tcp:8886&udid=<serial>
  // (8886 = SERVER_PORT, le port local du scrcpy-server côté téléphone).
  const fluidSrc = agentUrl && agentToken && serial
    ? (() => {
        const host = new URL(agentUrl).host
        const wsProto = agentUrl.startsWith('https') ? 'wss' : 'ws'
        // Le tunnel WS passe aussi par le chemin "/" côté Caddy → il lui faut
        // le même ?token= que la page, sinon la passerelle le bloque en 401.
        const wsParam = `${wsProto}://${host}/?action=proxy-adb&remote=tcp:8886&udid=${encodeURIComponent(serial)}&token=${encodeURIComponent(agentToken)}`
        return `${agentUrl}/?token=${encodeURIComponent(agentToken)}#!action=stream&udid=${encodeURIComponent(serial)}&player=mse&ws=${encodeURIComponent(wsParam)}`
      })()
    : null

  return (
    <div
      onMouseDown={onFocus}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex, width: 300,
        borderRadius: 14, overflow: 'hidden', background: '#0d0e14',
        border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Barre de titre — déplaçable */}
      <div onPointerDown={onTitleDown} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'linear-gradient(135deg,#1b1c28,#14151d)', cursor: 'grab', userSelect: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: 'linear-gradient(135deg,#818CF8,#6366F1)', display: 'grid', placeItems: 'center', fontSize: 10, flexShrink: 0 }}>📱</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#E9E9F2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.name}</span>
        <button onClick={onClose} style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: '#9a9ab0', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>✕</button>
      </div>

      {/* Corps */}
      <div style={{ background: '#08090d', aspectRatio: '9/16', display: 'grid', placeItems: 'center', position: 'relative' }}>
        {phase !== 'ready' && phase !== 'error' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ width: 40, height: 40, margin: '0 auto 16px', borderRadius: '50%', border: '3px solid rgba(129,140,248,0.25)', borderTopColor: '#818CF8', animation: 'cp-spin 0.9s linear infinite' }} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#E9E9F2', marginBottom: 12 }}>Connecting to cloud phone</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10.5, color: '#8a8a9c', textAlign: 'left' }}>
              <Step label="Fetching data" done={phase !== 'fetching'} active={phase === 'fetching'} />
              <Step label="Starting" done={phase === 'connecting'} active={phase === 'starting'} />
              <Step label="Connecting" done={false} active={phase === 'connecting'} />
            </div>
          </div>
        )}
        {phase === 'error' && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 11.5, color: '#F87171', marginBottom: 12, lineHeight: 1.5 }}>{errMsg}</div>
            <button onClick={connect} style={{ fontSize: 11.5, fontWeight: 700, color: '#D8B4FE', background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.3)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Réessayer</button>
          </div>
        )}
        {phase === 'ready' && (
          fluid && fluidSrc ? (
            <iframe title={inst.name} src={fluidSrc} style={{ width: '100%', height: '100%', border: 'none' }} allow="clipboard-read; clipboard-write" />
          ) : snap ? (
            <img ref={imgRef} src={snap} alt="écran" draggable={false} onClick={onScreenClick}
              style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair' }} />
          ) : (
            <span style={{ fontSize: 11.5, color: '#6b6b7c' }}>…</span>
          )
        )}
      </div>

      {/* Barre d'actions */}
      {phase === 'ready' && (
        <div style={{ display: 'flex', gap: 5, padding: 8, background: '#0d0e14', flexWrap: 'wrap' }}>
          <TinyBtn onClick={() => setFluid(v => !v)} active={fluid}>{fluid ? '🎥 Fluide' : '📷 Capture'}</TinyBtn>
          <TinyBtn onClick={() => quickKey('3')}>⌂</TinyBtn>
          <TinyBtn onClick={() => quickKey('4')}>←</TinyBtn>
          <TinyBtn onClick={() => quickKey('187')}>▢</TinyBtn>
        </div>
      )}
      <style>{`@keyframes cp-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Step({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ color: done ? '#34D399' : active ? '#E9E9F2' : '#6b6b7c' }}>{label}</span>
      <span style={{ color: done ? '#34D399' : '#6b6b7c' }}>{done ? '✓' : active ? '…' : ''}</span>
    </div>
  )
}
function TinyBtn({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} style={{ fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 7, border: `1px solid ${active ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.08)'}`, background: active ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)', color: active ? '#34D399' : '#c8c8d8', cursor: 'pointer' }}>
      {children}
    </button>
  )
}

export default CloudPhoneWindow
