// Fenêtre flottante d'UN téléphone cloud (façon GeeLark) : titre déplaçable,
// écran de connexion (fetching/starting/connecting) puis flux fluide (ws-scrcpy)
// ou capture, + une barre latérale d'actions à droite (ping, upload, apps, son,
// photo, rotation, power…). Plusieurs fenêtres indépendantes en même temps.
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
type Panel = null | 'apps' | 'upload' | 'sound' | 'more'

// Hauteur indicative de la barre de titre (pour borner la fenêtre à l'écran) et
// largeur de la barre latérale d'actions. La hauteur du corps, elle, est DÉRIVÉE
// du vrai ratio du téléphone (lu depuis la capture) → le conteneur épouse pile
// la vidéo, aucun gris.
const CP_TITLE = 54
const CP_RAIL = 54

// Catalogue d'apps à installer en 1 clic (ouvre la page dans Aurora Store sur le
// tel). Pas Vinted (choix utilisateur).
const APP_CATALOG: { pkg: string; label: string; icon: string }[] = [
  { pkg: 'com.instagram.android',    label: 'Instagram', icon: '📸' },
  { pkg: 'com.zhiliaoapp.musically', label: 'TikTok',    icon: '🎵' },
  { pkg: 'com.instagram.barcelona',  label: 'Threads',   icon: '🧵' },
  { pkg: 'com.snapchat.android',     label: 'Snapchat',  icon: '👻' },
  { pkg: 'com.facebook.katana',      label: 'Facebook',  icon: '📘' },
  { pkg: 'com.twitter.android',      label: 'X',         icon: '🐦' },
]

export function CloudPhoneWindow({ inst, zIndex, offset, onClose, onFocus }: Props) {
  const [pos, setPos] = useState({ x: 80 + offset * 28, y: 60 + offset * 24 })
  const [winW, setWinW] = useState(340)   // largeur de la VIDÉO ; la hauteur en découle
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
  const [panel, setPanel] = useState<Panel>(null)
  const [ping, setPing] = useState<number | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [rotation, setRotation] = useState(0)
  const [uploadUrl, setUploadUrl] = useState('')
  const [appsTab, setAppsTab] = useState<'store' | 'apk'>('store')
  const [apkUrl, setApkUrl] = useState('')
  const [busyMsg, setBusyMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const pollRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Capture en secours (mode non-fluide) : rafraîchit toutes les 1,2s.
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

  // Ping du téléphone : on chronomètre un aller-retour d'une commande ADB triviale
  // toutes les ~4s → indicateur de latence live (agent + ADB compris).
  useEffect(() => {
    if (phase !== 'ready') return
    let alive = true
    const tick = async () => {
      const t0 = Date.now()
      const r = await cloudPhones.shell(inst.id, 'true', 8000)
      if (!alive) return
      setPing(r.ok ? Date.now() - t0 : null)
    }
    tick()
    const id = window.setInterval(tick, 4000)
    return () => { alive = false; window.clearInterval(id) }
  }, [phase, inst.id])

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

  // Largeur vidéo max pour que la fenêtre (hauteur dérivée du ratio) tienne dans l'écran.
  const maxWidthForViewport = () => Math.round((window.innerHeight * 0.94 - CP_TITLE) / aspect)

  // Redimensionnement par la poignée en bas à droite : on ne pilote QUE la
  // largeur vidéo (la hauteur suit le ratio téléphone) → aucun gris possible.
  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation(); onFocus()
    if (maximized) setMaximized(false)
    const start = { w: winW, px: e.clientX }
    const cap = maxWidthForViewport()
    const onMove = (ev: PointerEvent) => {
      setWinW(Math.max(280, Math.min(cap, start.w + (ev.clientX - start.px))))
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
      setPos({ x: Math.max(16, Math.round((window.innerWidth - w - CP_RAIL) / 2)), y: 14 })
      setWinW(w); setMaximized(true)
    }
  }

  // Hauteur du CORPS = ratio téléphone réel appliqué à la largeur vidéo.
  const bodyH = Math.round(winW * aspect)

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

  const flash = (msg: string, ms = 3500) => { setBusyMsg(msg); if (ms) window.setTimeout(() => setBusyMsg(m => (m === msg ? '' : m)), ms) }

  // Ouvre/ferme un panneau (et rafraîchit la liste des apps installées à l'ouverture).
  const togglePanel = async (p: Exclude<Panel, null>) => {
    const next = panel === p ? null : p
    setPanel(next)
    if (next === 'apps') {
      const r = await cloudPhones.shell(inst.id, 'pm list packages', 15000)
      if (r.ok && r.data?.output) {
        const set = new Set<string>()
        r.data.output.split('\n').forEach(l => { const m = l.trim().replace(/^package:/, ''); if (m) set.add(m) })
        setInstalled(set)
      }
    }
  }

  // Ouvre la page d'une app dans Aurora Store (déjà installé) sur le téléphone.
  const openInStore = async (app: { pkg: string; label: string }) => {
    flash(`Ouverture de ${app.label} dans le store…`)
    await cloudPhones.shell(inst.id, `am start -a android.intent.action.VIEW -d "market://details?id=${app.pkg}"`)
    setPanel(null)
  }
  // Lance une app déjà installée.
  const launchApp = async (app: { pkg: string; label: string }) => {
    flash(`Ouverture de ${app.label}…`)
    await cloudPhones.shell(inst.id, `monkey -p ${app.pkg} -c android.intent.category.LAUNCHER 1`)
    setPanel(null)
  }

  const installApk = async () => {
    const url = apkUrl.trim()
    if (!/^https?:\/\//i.test(url)) { flash('Colle une URL http(s) directe vers l\'APK'); return }
    flash('Téléchargement + installation de l\'APK…', 0)
    const r = await cloudPhones.install(inst.id, url)
    if (r.ok) { flash('✓ APK installé'); setApkUrl('') } else flash(`Échec : ${r.error ?? 'inconnu'}`)
  }

  // Envoie une vidéo (par URL directe) dans /sdcard/Movies du tel + indexation.
  const sendVideo = async () => {
    const url = uploadUrl.trim()
    if (!/^https?:\/\//i.test(url)) { flash('Colle une URL http(s) directe vers la vidéo'); return }
    flash('Envoi de la vidéo sur le téléphone…', 0)
    const r = await cloudPhones.pushVideo(inst.id, url)
    if (r.ok) { flash('✓ Vidéo envoyée (visible dans la galerie)'); setUploadUrl(''); setPanel(null) }
    else flash(`Échec : ${r.error ?? 'inconnu'}`)
  }

  // Upload d'un FICHIER local : glisser-déposer / sélection. Le fichier part EN
  // DIRECT vers l'agent (pas par le proxy serverless, trop limité en taille) —
  // XHR pour avoir la progression. Nécessite l'agent à jour (route pushfile+CORS).
  const uploadFile = async (file: File | null | undefined) => {
    if (!file) return
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name)) { flash('Ce n\'est pas une vidéo'); return }
    const { url: aUrl, token } = getCloudAgent()
    if (!aUrl || !token) { flash('Agent non configuré'); return }
    setPanel('upload')
    const done = await new Promise<{ ok: boolean; err?: string }>((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${aUrl}/instances/${encodeURIComponent(inst.id)}/pushfile`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.upload.onprogress = e => { if (e.lengthComputable) flash(`Envoi… ${Math.round(e.loaded / e.total * 100)}%`, 0) }
      xhr.onload = () => { let err: string | undefined; try { err = JSON.parse(xhr.responseText)?.error } catch { /* non-JSON */ } resolve({ ok: xhr.status >= 200 && xhr.status < 300, err }) }
      xhr.onerror = () => resolve({ ok: false, err: 'agent injoignable (CORS ? agent pas à jour ?)' })
      xhr.send(file)
    })
    if (done.ok) { flash('✓ Vidéo envoyée (visible dans la galerie)'); setPanel(null) }
    else flash(`Échec : ${done.err ?? 'inconnu'}`)
  }

  // Enregistre une capture PNG de l'écran sur le PC.
  const savePhoto = async () => {
    flash('Capture…', 0)
    const r = await cloudPhones.screenshot(inst.id)
    if (r.ok && r.data?.dataUrl) {
      const a = document.createElement('a')
      a.href = r.data.dataUrl; a.download = `${inst.name}-${Date.now()}.png`
      document.body.appendChild(a); a.click(); a.remove()
      flash('✓ Capture enregistrée')
    } else flash('Échec de la capture')
  }

  // Bascule portrait/paysage (désactive l'auto-rotation puis force l'orientation).
  const toggleRotation = async () => {
    const next = rotation === 0 ? 1 : 0
    await cloudPhones.shell(inst.id, 'settings put system accelerometer_rotation 0')
    await cloudPhones.shell(inst.id, `settings put system user_rotation ${next}`)
    setRotation(next)
    flash(next === 0 ? 'Portrait' : 'Paysage')
  }

  const restart = async () => {
    if (!window.confirm('Redémarrer le téléphone ?')) return
    setPanel(null); flash('Redémarrage…', 0)
    await cloudPhones.shell(inst.id, 'reboot', 10000).catch(() => {})
    window.setTimeout(connect, 4000)
  }

  const { url: agentUrl, token: agentToken } = getCloudAgent()
  const serial = inst.serial || (inst.adbPort ? `127.0.0.1:${inst.adbPort}` : null)
  // `player=mse` : décodage H264 via MediaSource Extensions (natif Chrome/Edge).
  // `ws` : tunnel ADB-sur-WebSocket reconstruit à la main (ws-scrcpy le construit
  // d'ordinaire après une étape de sélection d'appareil, jamais exposée par un
  // lien direct). Le token protège la page ET le tunnel (même ?token= côté Caddy).
  const fluidSrc = agentUrl && agentToken && serial
    ? (() => {
        const host = new URL(agentUrl).host
        const wsProto = agentUrl.startsWith('https') ? 'wss' : 'ws'
        const wsParam = `${wsProto}://${host}/?action=proxy-adb&remote=tcp:8886&udid=${encodeURIComponent(serial)}&token=${encodeURIComponent(agentToken)}`
        return `${agentUrl}/?token=${encodeURIComponent(agentToken)}#!action=stream&udid=${encodeURIComponent(serial)}&player=mse&ws=${encodeURIComponent(wsParam)}`
      })()
    : null

  const running = /running|up/i.test(inst.state)
  const pingColor = ping == null ? '#6b6b7c' : ping < 200 ? '#34D399' : ping < 500 ? '#FBBF24' : '#F87171'
  const pingLabel = ping == null ? '—' : `${ping}`

  return (
    <div
      onMouseDown={onFocus}
      onDragOver={e => { if (Array.from(e.dataTransfer?.types || []).includes('Files')) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); if (phase === 'ready') uploadFile(e.dataTransfer?.files?.[0]) }}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex, width: winW + CP_RAIL,
        borderRadius: 16, overflow: 'hidden', background: '#0b0c12',
        border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 30px 70px -24px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Barre de titre — déplaçable */}
      <div onPointerDown={onTitleDown} onDoubleClick={toggleMax}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px 0 12px', height: CP_TITLE, flexShrink: 0, background: 'linear-gradient(135deg,#1c1d2a,#131420)', cursor: 'grab', userSelect: 'none', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.2 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#F0F0F7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.name}</span>
          <span style={{ fontSize: 9.5, color: '#8a8a9c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.id}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: running ? '#34D399' : '#8a8a9c' }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: running ? '#34D399' : '#6b6b7c', boxShadow: running ? '0 0 6px #34D399' : 'none' }} />
            {running ? 'En ligne' : 'Arrêté'}
          </span>
        </div>
        <button onClick={toggleMax} title={maximized ? 'Réduire' : 'Plein écran'} style={titleBtn}>{maximized ? '❐' : '⛶'}</button>
        <button onClick={onClose} title="Fermer" style={{ ...titleBtn, color: '#F87171' }}>✕</button>
      </div>

      {/* Corps : vidéo (gauche) + barre latérale d'actions (droite) */}
      <div style={{ display: 'flex', position: 'relative' }}>
        <div style={{ width: winW, height: bodyH, background: '#050609', display: 'grid', placeItems: 'center', position: 'relative', flexShrink: 0 }}>
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

        {/* Barre latérale d'actions (droite) — façon GeeLark */}
        <div style={{ width: CP_RAIL, height: bodyH, flexShrink: 0, background: 'linear-gradient(180deg,#12131d,#0d0e16)', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', overflowY: 'auto' }}>
          {/* Ping / connexion en haut */}
          <div title="Latence du téléphone" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: pingColor, boxShadow: `0 0 6px ${pingColor}` }} />
            <span style={{ fontSize: 8.5, fontWeight: 800, color: pingColor, lineHeight: 1 }}>{pingLabel}</span>
            <span style={{ fontSize: 7, color: '#6b6b7c', lineHeight: 1 }}>ms</span>
          </div>
          <RailBtn icon="📤" label="Upload" active={panel === 'upload'} onClick={() => togglePanel('upload')} disabled={phase !== 'ready'} />
          <RailBtn icon="📲" label="Apps"   active={panel === 'apps'}   onClick={() => togglePanel('apps')}   disabled={phase !== 'ready'} />
          <RailBtn icon="🔊" label="Son"    active={panel === 'sound'}  onClick={() => togglePanel('sound')}  disabled={phase !== 'ready'} />
          <RailBtn icon="📸" label="Photo"  onClick={savePhoto}      disabled={phase !== 'ready'} />
          <RailBtn icon="🔄" label="Rotate" onClick={toggleRotation} disabled={phase !== 'ready'} />
          <RailBtn icon="⏻"  label="Power"  onClick={() => quickKey('26')} disabled={phase !== 'ready'} />
          <RailBtn icon="⋯"  label="Plus"   active={panel === 'more'} onClick={() => togglePanel('more')} disabled={phase !== 'ready'} />
        </div>

        {/* Panneaux flottants (ancrés à gauche de la barre latérale) */}
        {panel && phase === 'ready' && (
          <div style={{ position: 'absolute', top: 8, right: CP_RAIL + 8, width: 232, maxHeight: bodyH - 16, overflowY: 'auto', background: 'rgba(17,18,26,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, boxShadow: '0 20px 50px -18px rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: 12, zIndex: 10 }}>
            {panel === 'upload' && (
              <>
                <PanelTitle>📤 Envoyer une vidéo</PanelTitle>
                <div onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); uploadFile(e.dataTransfer?.files?.[0]) }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '18px 12px', marginBottom: 8, borderRadius: 10, border: '1.5px dashed rgba(129,140,248,0.5)', background: 'rgba(129,140,248,0.07)', cursor: 'pointer', textAlign: 'center' }}>
                  <span style={{ fontSize: 22 }}>🎬</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#C7D2FE' }}>Glisse une vidéo ici</span>
                  <span style={{ fontSize: 10, color: '#8a8a9c' }}>ou clique pour choisir un fichier</span>
                </div>
                <div style={{ fontSize: 9.5, color: '#6b6b7c', textAlign: 'center', margin: '2px 0 8px' }}>ou colle une URL directe</div>
                <input value={uploadUrl} onChange={e => setUploadUrl(e.target.value)} placeholder="https://…/video.mp4"
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.35)', color: '#E9E9F2', marginBottom: 8 }} />
                <button onClick={sendVideo} style={primaryBtn}>Envoyer l'URL</button>
              </>
            )}
            {panel === 'apps' && (
              <>
                <PanelTitle>📲 Applications</PanelTitle>
                {/* Deux choix : installer depuis le tel (store) ou pousser un APK */}
                <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 9, background: 'rgba(0,0,0,0.3)', marginBottom: 10 }}>
                  <button onClick={() => setAppsTab('store')} style={{ ...tabBtn, ...(appsTab === 'store' ? tabBtnOn : {}) }}>📱 Depuis le tel</button>
                  <button onClick={() => setAppsTab('apk')} style={{ ...tabBtn, ...(appsTab === 'apk' ? tabBtnOn : {}) }}>📦 APK</button>
                </div>
                {appsTab === 'store' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {APP_CATALOG.map(app => {
                      const isIn = installed.has(app.pkg)
                      return (
                        <div key={app.pkg} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 9, background: 'rgba(255,255,255,0.04)' }}>
                          <span style={{ fontSize: 16 }}>{app.icon}</span>
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#E9E9F2' }}>{app.label}</span>
                          {isIn
                            ? <button onClick={() => launchApp(app)} style={ghostBtn}>Ouvrir</button>
                            : <button onClick={() => openInStore(app)} style={miniPrimary}>Installer</button>}
                        </div>
                      )
                    })}
                  </div>
                )}
                {appsTab === 'apk' && (
                  <>
                    <p style={{ fontSize: 10.5, color: '#8a8a9c', margin: '0 0 8px', lineHeight: 1.5 }}>Installe un APK sur le téléphone depuis une URL directe (APKMirror, APKPure…).</p>
                    <input value={apkUrl} onChange={e => setApkUrl(e.target.value)} placeholder="https://…/app.apk"
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.35)', color: '#E9E9F2', marginBottom: 8 }} />
                    <button onClick={installApk} style={primaryBtn}>Installer l'APK</button>
                  </>
                )}
              </>
            )}
            {panel === 'sound' && (
              <>
                <PanelTitle>🔊 Son</PanelTitle>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => quickKey('25')} style={softBtn}>🔉 Baisser</button>
                  <button onClick={() => quickKey('24')} style={softBtn}>🔊 Monter</button>
                  <button onClick={() => quickKey('164')} style={softBtn}>🔇 Muet</button>
                </div>
              </>
            )}
            {panel === 'more' && (
              <>
                <PanelTitle>⋯ Plus</PanelTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={() => { setFluid(v => !v); setPanel(null) }} style={ghostBtnWide}>{fluid ? '📷 Passer en mode capture' : '🎥 Passer en mode fluide'}</button>
                  <button onClick={() => quickKey('3')} style={ghostBtnWide}>🏠 Accueil</button>
                  <button onClick={restart} style={{ ...ghostBtnWide, color: '#F87171', borderColor: 'rgba(248,113,113,0.3)' }}>♻️ Redémarrer le téléphone</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bandeau de statut (messages d'action) */}
      {busyMsg && (
        <div style={{ padding: '6px 12px', fontSize: 10.5, fontWeight: 600, color: busyMsg.startsWith('✓') ? '#34D399' : busyMsg.startsWith('Échec') ? '#F87171' : '#c8c8d8', background: 'linear-gradient(0deg,#0b0c12,#0f1019)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>{busyMsg}</div>
      )}

      {/* Input fichier caché (déclenché par la zone de drop) */}
      <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }}
        onChange={e => { uploadFile(e.target.files?.[0]); e.target.value = '' }} />

      {/* Overlay de glisser-déposer (sur toute la fenêtre) */}
      {dragOver && phase === 'ready' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(11,12,18,0.86)', border: '2.5px dashed #818CF8', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none' }}>
          <span style={{ fontSize: 40 }}>🎬</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#C7D2FE' }}>Déposez la vidéo</span>
          <span style={{ fontSize: 11, color: '#8a8a9c' }}>elle sera envoyée sur {inst.name}</span>
        </div>
      )}

      {/* Poignée de redimensionnement (coin bas-droit) */}
      <div onPointerDown={onResizeDown} title="Redimensionner"
        style={{ position: 'absolute', right: 0, bottom: 0, width: 18, height: 18, cursor: 'nwse-resize', zIndex: 15,
          background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.28) 62%, transparent 62%, transparent 74%, rgba(255,255,255,0.28) 74%)' }} />

      <style>{`@keyframes cp-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const titleBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.06)', color: '#c8c8d8', cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'grid', placeItems: 'center' }
const primaryBtn: React.CSSProperties = { width: '100%', fontSize: 11.5, fontWeight: 800, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#818CF8,#6366F1)', color: '#fff', cursor: 'pointer' }
const miniPrimary: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, padding: '5px 10px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#818CF8,#6366F1)', color: '#fff', cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#d2d2e0', cursor: 'pointer' }
const ghostBtnWide: React.CSSProperties = { ...ghostBtn, width: '100%', textAlign: 'center', padding: '7px 10px' }
const softBtn: React.CSSProperties = { flex: 1, fontSize: 10.5, fontWeight: 700, padding: '8px 4px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#d2d2e0', cursor: 'pointer' }
const tabBtn: React.CSSProperties = { flex: 1, fontSize: 10.5, fontWeight: 800, padding: '6px 6px', borderRadius: 7, border: 'none', background: 'transparent', color: '#8a8a9c', cursor: 'pointer' }
const tabBtnOn: React.CSSProperties = { background: 'rgba(129,140,248,0.18)', color: '#C7D2FE' }

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 800, color: '#F0F0F7', marginBottom: 8 }}>{children}</div>
}

function RailBtn({ icon, label, onClick, active, disabled }: { icon: string; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label}
      style={{ width: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 0', borderRadius: 9,
        border: `1px solid ${active ? 'rgba(129,140,248,0.4)' : 'transparent'}`, background: active ? 'rgba(129,140,248,0.15)' : 'transparent',
        color: disabled ? '#4b4b58' : active ? '#C7D2FE' : '#c8c8d8', cursor: disabled ? 'default' : 'pointer', transition: 'all .12s' }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 8, fontWeight: 700, lineHeight: 1 }}>{label}</span>
    </button>
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

export default CloudPhoneWindow
