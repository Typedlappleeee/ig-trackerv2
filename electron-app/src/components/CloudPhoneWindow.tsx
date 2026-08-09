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

// Hauteurs indicatives du chrome (barre de titre / barre d'actions) pour borner
// la fenêtre à l'écran. La hauteur du corps, elle, est DÉRIVÉE du vrai ratio du
// téléphone (lu depuis la capture) pour que le conteneur épouse pile la vidéo.
const CP_TITLE = 42
const CP_ACTION = 50

// Catalogue d'apps à installer en 1 clic (ouvre la page dans Aurora Store sur le
// tel). Pas Vinted (choix utilisateur).
const APP_CATALOG: { pkg: string; label: string; icon: string }[] = [
  { pkg: 'com.instagram.android',   label: 'Instagram', icon: '📸' },
  { pkg: 'com.facebook.katana',     label: 'Facebook',  icon: '📘' },
  { pkg: 'com.twitter.android',     label: 'X',         icon: '🐦' },
  { pkg: 'com.instagram.barcelona', label: 'Threads',   icon: '🧵' },
  { pkg: 'com.zhiliaoapp.musically', label: 'TikTok',   icon: '🎵' },
]

export function CloudPhoneWindow({ inst, zIndex, offset, onClose, onFocus }: Props) {
  const [pos, setPos] = useState({ x: 80 + offset * 28, y: 60 + offset * 24 })
  const [winW, setWinW] = useState(392)   // largeur pilote ; la hauteur en découle
  const [maximized, setMaximized] = useState(false)
  const prevBox = useRef<{ x: number; y: number; w: number } | null>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const [phase, setPhase] = useState<Phase>('fetching')
  const [errMsg, setErrMsg] = useState('')
  const [snap, setSnap] = useState<string | null>(null)
  const [fluid, setFluid] = useState(true)
  // Ratio RÉEL du téléphone (hauteur/largeur), lu depuis la 1re capture. Les
  // cloud phones ne font pas tous 9:16 (souvent 9:19.5, 9:20…) : caler le
  // conteneur sur ce vrai ratio évite que ws-scrcpy letterboxe la vidéo en gris.
  const [aspect, setAspect] = useState(16 / 9)
  const [installing, setInstalling] = useState(false)
  const [installMsg, setInstallMsg] = useState('')
  const [showApps, setShowApps] = useState(false)
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
    }, 1200)
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [phase, fluid, inst.id])

  // Dès qu'on a une capture, on lit le vrai ratio du tel (dimensions natives de
  // l'image = résolution de l'écran) et on le mémorise pour caler le conteneur.
  useEffect(() => {
    if (!snap) return
    const im = new Image()
    im.onload = () => { if (im.naturalWidth > 0) setAspect(im.naturalHeight / im.naturalWidth) }
    im.src = snap
  }, [snap])

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

  // Plus aucune réserve de largeur : la barre native de ws-scrcpy est masquée à
  // la source (CSS serveur, cf. selfhost/install.sh) et son fond passé en sombre,
  // donc le conteneur épouse pile le ratio réel du tel → la vidéo remplit tout.
  const toolbarReserve = 0
  // Largeur max pour que la fenêtre (hauteur dérivée) tienne dans l'écran.
  const maxWidthForViewport = () => Math.round((window.innerHeight * 0.94 - CP_TITLE - CP_ACTION) / aspect + toolbarReserve)

  // Redimensionnement par la poignée en bas à droite : on ne pilote QUE la
  // largeur (la hauteur suit le ratio téléphone) → aucun gris possible.
  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation(); onFocus()
    if (maximized) setMaximized(false)
    const start = { w: winW, px: e.clientX }
    const cap = maxWidthForViewport()
    const onMove = (ev: PointerEvent) => {
      setWinW(Math.max(320, Math.min(cap, start.w + (ev.clientX - start.px))))
    }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  // Plein écran : agrandit au max de la hauteur dispo (largeur dérivée).
  const toggleMax = () => {
    if (maximized && prevBox.current) {
      const b = prevBox.current
      setPos({ x: b.x, y: b.y }); setWinW(b.w); setMaximized(false)
    } else {
      prevBox.current = { x: pos.x, y: pos.y, w: winW }
      const w = maxWidthForViewport()
      setPos({ x: Math.max(16, Math.round((window.innerWidth - w) / 2)), y: 14 })
      setWinW(w); setMaximized(true)
    }
  }

  // Hauteur du CORPS = ratio téléphone 9:16 sur la largeur utile (hors barre
  // scrcpy en Fluide). La fenêtre elle-même est en hauteur auto → pas besoin
  // d'estimer la hauteur exacte de la barre d'actions (fini les calculs de
  // chrome approximatifs qui laissaient du gris).
  const bodyH = Math.round((winW - toolbarReserve) * aspect)

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

  const installApk = async () => {
    const url = window.prompt('URL directe de l\'APK à installer (ex: APKMirror) :')
    if (!url || !url.trim()) return
    setInstalling(true); setInstallMsg('Téléchargement + installation…')
    const r = await cloudPhones.install(inst.id, url.trim())
    setInstalling(false)
    setInstallMsg(r.ok ? '✓ Installé' : `Échec : ${r.error ?? 'inconnu'}`)
    window.setTimeout(() => setInstallMsg(''), 4000)
  }

  // Ouvre la page d'une app dans Aurora Store (déjà installé) sur le téléphone :
  // Aurora enregistre le schéma market:// → un simple intent VIEW l'ouvre sur la
  // bonne app, il ne reste qu'à taper « Installer ». Plus fiable que de sourcer
  // l'APK propriétaire côté serveur (miroirs bloqués/périmés).
  const openInStore = async (app: { pkg: string; label: string }) => {
    setInstallMsg(`Ouverture de ${app.label} dans le store…`)
    await cloudPhones.shell(inst.id, `am start -a android.intent.action.VIEW -d "market://details?id=${app.pkg}"`)
    if (!fluid) window.setTimeout(async () => { const r2 = await cloudPhones.screenshot(inst.id); if (r2.ok && r2.data?.dataUrl) setSnap(r2.data.dataUrl) }, 800)
    window.setTimeout(() => setInstallMsg(''), 3000)
  }

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

  const running = /running|up/i.test(inst.state)

  return (
    <div
      onMouseDown={onFocus}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex, width: winW,
        borderRadius: 16, overflow: 'hidden', background: '#0b0c12',
        border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 30px 70px -24px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Barre de titre — déplaçable */}
      <div onPointerDown={onTitleDown} onDoubleClick={toggleMax}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px 0 12px', height: 42, flexShrink: 0, background: 'linear-gradient(135deg,#1c1d2a,#131420)', cursor: 'grab', userSelect: 'none', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(135deg,#818CF8,#6366F1)', display: 'grid', placeItems: 'center', fontSize: 11, flexShrink: 0 }}>📱</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#F0F0F7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.name}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: running ? '#34D399' : '#8a8a9c' }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: running ? '#34D399' : '#6b6b7c', boxShadow: running ? '0 0 5px #34D399' : 'none' }} />
            {running ? 'En ligne' : 'Arrêté'}{inst.adbPort ? ` · :${inst.adbPort}` : ''}
          </span>
        </div>
        <button onClick={toggleMax} title={maximized ? 'Réduire' : 'Plein écran'} style={titleBtn}>{maximized ? '❐' : '⛶'}</button>
        <button onClick={onClose} title="Fermer" style={{ ...titleBtn, color: '#F87171' }}>✕</button>
      </div>

      {/* Corps — ws-scrcpy calcule lui-même la taille de la vidéo en JS à partir
          de CE conteneur (pas de simple CSS statique) : lui masquer sa barre
          d'outils ou forcer width/height en CSS cassait son calcul (vidéo
          minuscule ou étirée). On lui laisse sa mise en page native (barre
          d'outils comprise, comme GeeLark) et on le laisse remplir tout
          l'espace dispo (flex:1) — la vidéo se redimensionne toute seule en JS
          quand ce conteneur change de taille (fenêtre redimensionnable). */}
      <div style={{ height: bodyH, background: '#050609', display: 'grid', placeItems: 'center', position: 'relative' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px 10px', flexShrink: 0, background: 'linear-gradient(0deg,#0b0c12,#0f1019)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <TinyBtn onClick={() => setFluid(v => !v)} active={fluid}>{fluid ? '🎥 Fluide' : '📷 Capture'}</TinyBtn>
            <span style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 9, background: 'rgba(255,255,255,0.04)' }}>
              <TinyBtn onClick={() => quickKey('4')} title="Retour">◁</TinyBtn>
              <TinyBtn onClick={() => quickKey('3')} title="Accueil">○</TinyBtn>
              <TinyBtn onClick={() => quickKey('187')} title="Applis récentes">▢</TinyBtn>
            </span>
            <span style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 9, background: 'rgba(255,255,255,0.04)' }}>
              <TinyBtn onClick={() => quickKey('26')} title="Marche/veille">⏻</TinyBtn>
              <TinyBtn onClick={() => quickKey('25')} title="Volume −">🔉</TinyBtn>
              <TinyBtn onClick={() => quickKey('24')} title="Volume +">🔊</TinyBtn>
            </span>
            <span style={{ flex: 1 }} />
            <TinyBtn onClick={() => setShowApps(v => !v)} active={showApps}>📲 Installer une application</TinyBtn>
            <TinyBtn onClick={installApk} active={installing}>{installing ? '…' : '📦 Depuis un lien APK'}</TinyBtn>
          </div>
          {/* Catalogue : 1 clic ouvre l'app dans Aurora Store sur le tel */}
          {showApps && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {APP_CATALOG.map(app => (
                <TinyBtn key={app.pkg} onClick={() => openInStore(app)}>{app.icon} {app.label}</TinyBtn>
              ))}
            </div>
          )}
          {installMsg && <span style={{ fontSize: 10.5, color: installMsg.startsWith('✓') ? '#34D399' : '#c8c8d8' }}>{installMsg}</span>}
        </div>
      )}

      {/* Poignée de redimensionnement (coin bas-droit) */}
      <div onPointerDown={onResizeDown} title="Redimensionner"
        style={{ position: 'absolute', right: 0, bottom: 0, width: 18, height: 18, cursor: 'nwse-resize', zIndex: 5,
          background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.28) 62%, transparent 62%, transparent 74%, rgba(255,255,255,0.28) 74%)' }} />

      <style>{`@keyframes cp-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const titleBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.06)', color: '#c8c8d8', cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'grid', placeItems: 'center' }

function Step({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ color: done ? '#34D399' : active ? '#E9E9F2' : '#6b6b7c' }}>{label}</span>
      <span style={{ color: done ? '#34D399' : '#6b6b7c' }}>{done ? '✓' : active ? '…' : ''}</span>
    </div>
  )
}
function TinyBtn({ children, onClick, active, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: `1px solid ${active ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.08)'}`, background: active ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)', color: active ? '#34D399' : '#d2d2e0', cursor: 'pointer', transition: 'all .12s' }}>
      {children}
    </button>
  )
}

export default CloudPhoneWindow
