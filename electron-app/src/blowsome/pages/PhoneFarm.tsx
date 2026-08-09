// Blowsome — Phone Farm / iRemoTech. Vrai panneau de contrôle à distance des
// iPhones iRemoTech via leur Device API (proxy /api/iremotech).
// Capture d'écran cliquable → tap aux coordonnées, + actions (texte, scroll, URL…).
import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useOrg } from '@/lib/orgContext'
import { useTr } from '@/lib/i18n'
import { iremotech, openLiveStream, extractDevices, loadIremotechKey, saveIremotechKey, loadDeviceMeta, saveDeviceMeta, getCalib, setCalib, loadSequences, saveSequence, deleteSequence, replaySequence, type IrtDevice, type IrtAction, type IrtAccount, type IrtUsage, type IrtBudget, type SeqStep, type IrtSequence } from '@/lib/iremotech'
import { LivePhone } from '../LivePhone'
import { BankPicker } from '@/pages/Bank'
import { postIgReel, getIgCoords, setIgCoords, resetIgCoords, IG_COORD_LABELS, type IgReelCoords, type IgEntry } from '@/lib/igReelFlow'
import {
  useBlowCSS, Grad, Ico, ICON, GRAD, INK, MUTED, FAINT, HAIR,
  BlowCard, BlowPageHeader, BlowBadge, BlowButton, BlowEmpty,
} from '../ui'

type Conn = 'checking' | 'ok' | 'unconfigured' | 'error'

// Style des boutons-flèches de calibration.
const calibBtn: React.CSSProperties = { display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#D8B4FE', cursor: 'pointer', fontSize: 13, fontWeight: 700 }

export function BlowPhoneFarm({ user }: { user: User }) {
  useBlowCSS()
  const tr = useTr()
  const { currentOrg } = useOrg()
  const [conn, setConn] = useState<Conn>('checking')
  const [connMsg, setConnMsg] = useState('')
  const [devices, setDevices] = useState<IrtDevice[]>([])
  const [selected, setSelected] = useState<IrtDevice | null>(null)
  const [snap, setSnap] = useState<string | null>(null)
  const [snapLoading, setSnapLoading] = useState(false)
  const [text, setText] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [live, setLive] = useState(true)          // flux temps réel ON par défaut (démarre direct)
  const [offline, setOffline] = useState(false)   // 503 device_offline
  const [snapErr, setSnapErr] = useState('')       // message d'erreur brut d'iRemoTech
  const [reach, setReach] = useState<Record<string, 'on' | 'off'>>({}) // joignabilité par tel
  const [usage, setUsage] = useState<IrtUsage | null>(null)          // budgets du jour (/usage)
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
  const [metaErr, setMetaErr] = useState('')       // erreur de sauvegarde notes/comptes (visible)
  const [reveal, setReveal] = useState<Set<number>>(new Set())
  const [showMeta, setShowMeta] = useState(false)   // section notes/comptes repliable
  const [showLog, setShowLog] = useState(false)     // Journal caché par défaut (raccourci Ctrl/Cmd+J)
  const [fs, setFs] = useState(false)               // plein écran du tel sélectionné
  const [multi, setMulti] = useState(false)         // multi-écrans (grille de tous les tels)
  const [calibMode, setCalibMode] = useState(false) // mode calibration du curseur
  const [calibStep, setCalibStep] = useState<'idle' | 'target' | 'observe'>('idle') // calibrage guidé
  const calibTarget = useRef<{ x: number; y: number } | null>(null)
  const [heroKey, setHeroKey] = useState(0)         // ↻ = reconnecte le flux principal
  const [broadcast, setBroadcast] = useState(false) // miroir : action sur 1 tel = sur tous
  const [hoverId, setHoverId] = useState<string | null>(null) // tel survolé en multi (priorité flux)
  // ── Poster un Reel (flow Instagram codé en dur) ──
  const [screenSize, setScreenSize] = useState({ w: 1170, h: 2532 })  // taille réelle du tel
  const [postVideo, setPostVideo] = useState<{ url: string; name: string } | null>(null)
  const [postCaption, setPostCaption] = useState('')
  const [postAll, setPostAll] = useState(false)
  const [postPick, setPostPick] = useState(false)
  const [postMsg, setPostMsg] = useState('')
  const [postBusy, setPostBusy] = useState(false)
  const postStop = useRef(false)
  const [igEntry, setIgEntry] = useState<IgEntry>('camera')    // point d'entrée dans Instagram
  const [tuneCoords, setTuneCoords] = useState(false)          // réglage des points de tap
  const [coords, setCoordsState] = useState<IgReelCoords>(() => getIgCoords())

  const runPostReel = async () => {
    if (!selected || !postVideo || postBusy) return
    setPostBusy(true); postStop.current = false
    const targets = postAll ? devices.map(d => d.public_id) : [selected.public_id]
    for (let i = 0; i < targets.length; i++) {
      if (postStop.current) break
      const dev = targets[i]
      const who = devices.find(d => d.public_id === dev)?.name ?? dev
      const r = await postIgReel(dev, {
        videoUrl: postVideo.url, videoName: postVideo.name, caption: postCaption,
        screen: screenSize, coords, entry: igEntry,
      }, {
        onStep: (label, s, t) => setPostMsg(`${who} · ${label} (${s + 1}/${t})`),
        shouldStop: () => postStop.current,
      })
      addLog(r.ok ? tr(`✓ Reel posté sur ${who}`, `✓ Reel posted on ${who}`) : `❌ ${who} : ${r.error}`)
    }
    setPostBusy(false)
    setPostMsg(postStop.current ? tr('Arrêté', 'Stopped') : tr(`✓ Terminé (${targets.length})`, `✓ Done (${targets.length})`))
    window.setTimeout(() => setPostMsg(''), 4000)
  }
  // ── Séquences / RPA maison ──
  const [showSeq, setShowSeq] = useState(false)        // panneau séquences repliable
  const [recording, setRecording] = useState(false)
  const recSteps = useRef<SeqStep[]>([])
  const recLast = useRef(0)
  const [recCount, setRecCount] = useState(0)
  const [sequences, setSequences] = useState<IrtSequence[]>([])
  const [replaySeq, setReplaySeq] = useState<IrtSequence | null>(null)  // séquence en cours de config de rejeu
  const [replayVideo, setReplayVideo] = useState<{ url: string; name: string } | null>(null)
  const [replayCaption, setReplayCaption] = useState('')
  const [replayAll, setReplayAll] = useState(false)     // rejouer sur tous les tels
  const [replayPickVideo, setReplayPickVideo] = useState(false)
  const [replayMsg, setReplayMsg] = useState('')
  const replayStop = useRef(false)

  // Charge les séquences enregistrées.
  useEffect(() => { loadSequences(currentOrg?.id ?? null, user.id).then(setSequences) }, [currentOrg?.id, user.id])

  // Enregistre une étape pendant l'enregistrement. delay = temps depuis la précédente
  // (ou un délai fixe pour les insertions manuelles depuis le menu).
  const recordStep = (step: Omit<SeqStep, 'delay'>, fixedDelay?: number) => {
    if (!recording) return
    const now = Date.now()
    const delay = fixedDelay != null ? fixedDelay : (recLast.current ? Math.min(now - recLast.current, 15000) : 400)
    recLast.current = now
    recSteps.current.push({ delay, ...step })
    setRecCount(recSteps.current.length)
  }
  // Insère une action "toute prête" (sans coordonnées) dans la séquence.
  const insertAction = (a: IrtAction) => recordStep({ action: a }, 1000)
  const insertWait = (sec: number) => recordStep({}, sec * 1000)   // pure pause
  const startRec = () => { recSteps.current = []; recLast.current = 0; setRecCount(0); setRecording(true); setLive(true) }
  const stopRecSave = async () => {
    setRecording(false)
    const steps = recSteps.current
    if (!steps.length) return
    const name = window.prompt(tr('Nom de la séquence (ex: Post Reel IG)', 'Sequence name (e.g. Post IG Reel)'), tr('Post Reel', 'Reel post'))
    if (!name) return
    const r = await saveSequence(currentOrg?.id ?? null, user.id, name.trim(), steps)
    if (r.ok) { addLog(tr(`✓ séquence "${name}" enregistrée (${steps.length} étapes)`, `✓ sequence "${name}" saved (${steps.length} steps)`)); loadSequences(currentOrg?.id ?? null, user.id).then(setSequences) }
    else addLog(`❌ séquence : ${r.error}`)
  }
  const runReplay = async () => {
    if (!replaySeq || !selected) return
    replayStop.current = false
    const targets = replayAll ? devices.map(d => d.public_id) : [selected.public_id]
    setReplayMsg(tr('Rejeu…', 'Replaying…'))
    await replaySequence(targets, replaySeq.steps,
      { videoUrl: replayVideo?.url, videoName: replayVideo?.name, caption: replayCaption },
      { onStep: (i, t) => setReplayMsg(tr(`Étape ${i + 1}/${t}`, `Step ${i + 1}/${t}`)), shouldStop: () => replayStop.current })
    setReplayMsg(replayStop.current ? tr('Arrêté', 'Stopped') : tr(`✓ Terminé sur ${targets.length} tel(s)`, `✓ Done on ${targets.length} phone(s)`))
    window.setTimeout(() => setReplayMsg(''), 3000)
  }
  const [uploadPick, setUploadPick] = useState(false) // sélecteur banque pour envoyer sur le tel
  const [uploadMsg, setUploadMsg] = useState('')       // état de l'upload vers le tel

  // Envoie un média de la BANQUE vers le tel sélectionné (URL signée → proxy).
  const uploadFromBank = async (urls: string[], titles?: string[]) => {
    setUploadPick(false)
    if (!selected || !urls.length) return
    recordStep({ upload: true })   // dans une séquence : étape "envoyer la vidéo" (variable au rejeu)
    for (let i = 0; i < urls.length; i++) {
      const name = (titles?.[i] || `media_${i}`).replace(/[^\w.\-]+/g, '_')
      setUploadMsg(tr(`Envoi ${i + 1}/${urls.length}…`, `Sending ${i + 1}/${urls.length}…`))
      const r = await iremotech.uploadMedia(selected.public_id, urls[i], name)
      addLog(r.ok ? `✓ upload ${name}` : `❌ upload ${name} : ${r.error ?? r.status}`)
    }
    setUploadMsg(tr('✓ Envoyé sur le tel', '✓ Sent to the phone')); window.setTimeout(() => setUploadMsg(''), 2500)
  }
  // Envoie un fichier du PC vers le tel (base64 ≤ ~4 Mo — limite corps serverless).
  const uploadFromPC = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f || !selected) return
    if (f.size > 4 * 1024 * 1024) { setUploadMsg(tr('Fichier > 4 Mo : passe par la banque.', 'File > 4 MB: use the bank instead.')); window.setTimeout(() => setUploadMsg(''), 3500); return }
    recordStep({ upload: true })
    setUploadMsg(tr('Lecture du fichier…', 'Reading file…'))
    const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(f) })
    setUploadMsg(tr('Envoi sur le tel…', 'Sending to the phone…'))
    const r = await iremotech.uploadMediaData(selected.public_id, b64, f.name.replace(/[^\w.\-]+/g, '_'))
    addLog(r.ok ? `✓ upload ${f.name}` : `❌ upload ${f.name} : ${r.error ?? r.status}`)
    setUploadMsg(r.ok ? tr('✓ Envoyé sur le tel', '✓ Sent to the phone') : tr('❌ Échec', '❌ Failed')); window.setTimeout(() => setUploadMsg(''), 2800)
  }
  const [calib, setCalibState] = useState({ dx: 0, dy: 0 })  // décalage du tel sélectionné

  // Ouvre un tel en PLEIN ÉCRAN dans un NOUVEL ONGLET (deep-link via hash).
  const openInNewTab = (dev: IrtDevice) => {
    window.open(`${location.origin}${location.pathname}#pf-fs=${encodeURIComponent(dev.public_id)}`, '_blank', 'noopener')
  }

  const addLog = (m: string) => setLog(l => [`${new Date().toLocaleTimeString()} · ${m}`, ...l].slice(0, 30))

  // Raccourci Ctrl/Cmd+J → affiche/masque le Journal (caché par défaut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault(); setShowLog(v => !v)
      }
      if (e.key === 'Escape') { setFs(false); setMulti(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const loadDevices = useCallback(async () => {
    setConn('checking'); setConnMsg('')
    const r = await iremotech.listDevices()
    if (r.ok) {
      const list = extractDevices(r.data)
      setDevices(list)
      setConn('ok')
      if (list.length && !selected) setSelected(list[0])
      iremotech.usage().then(u => { if (u.ok && u.data) setUsage(u.data) })
    } else if ((r.error ?? '').includes('Clé iRemoTech absente')) {
      setConn('unconfigured'); setConnMsg(r.error ?? ''); setShowKey(true)
    } else if (r.status === 401 || r.status === 403) {
      // Clé présente mais refusée par iRemoTech (révoquée / incomplète / mauvaise).
      setConn('unconfigured'); setShowKey(true)
      setConnMsg(tr('Clé API invalide ou révoquée — recolle ta clé iRemoTech complète.', 'Invalid or revoked API key — paste your full iRemoTech key again.'))
    } else {
      setConn('error'); setConnMsg(r.error ?? tr(`Erreur ${r.status ?? ''}`, `Error ${r.status ?? ''}`))
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
      addLog(tr('✓ clé iRemoTech enregistrée', '✓ iRemoTech key saved'))
      loadDevices()
    } else {
      const missing = /iremotech_config|column|schema cache/i.test(r.error ?? '')
      const hint = missing
        ? tr(" · La colonne de config n'existe pas encore. Lance ce SQL dans Supabase : alter table public.org_config add column if not exists iremotech_config jsonb; alter table public.app_config add column if not exists iremotech_config jsonb;", " · The config column does not exist yet. Run this SQL in Supabase: alter table public.org_config add column if not exists iremotech_config jsonb; alter table public.app_config add column if not exists iremotech_config jsonb;")
        : ''
      setKeyErr(tr(`Échec de l'enregistrement : ${r.error ?? 'erreur inconnue'}${hint}`, `Save failed: ${r.error ?? 'unknown error'}${hint}`))
      addLog(tr(`❌ sauvegarde clé : ${r.error}`, `❌ key save: ${r.error}`))
    }
  }

  const refreshSnapshot = useCallback(async (dev: IrtDevice | null, silent = false) => {
    if (!dev || snapBusy.current) return
    snapBusy.current = true
    if (!silent) setSnapLoading(true)
    const r = await iremotech.snapshot(dev.public_id)
    snapBusy.current = false
    if (!silent) setSnapLoading(false)
    if (r.ok && r.dataUrl) { setSnap(r.dataUrl); setOffline(false); setSnapErr(''); setReach(m => ({ ...m, [dev.public_id]: 'on' })) }
    else if (r.status === 503) {
      // 503 = DeviceOffline (iRemoTech) — inutile de continuer à spammer l'API.
      setOffline(true)
      setLive(false)
      setSnapErr(r.error ?? 'snapshot 503')
      setReach(m => ({ ...m, [dev.public_id]: 'off' }))
      if (!silent) addLog(`⚠️ ${r.error ?? 'snapshot 503'}`)
    } else { setSnapErr(String(r.error ?? `snapshot ${r.status ?? '?'}`)); if (!silent) addLog(tr(`❌ snapshot : ${r.error ?? r.status}`, `❌ snapshot: ${r.error ?? r.status}`)) }
  }, [])

  // Sélection d'un tel → on (ré)arme le live. Pas de snapshot one-shot en plus :
  // le flux fournit déjà l'image (évite un appel superflu = économie de rate-limit).
  useEffect(() => { if (selected) { setOffline(false); setCalibState(getCalib(selected.public_id)) } }, [selected])

  // Ajuste la calibration du tel sélectionné (et mémorise).
  const nudgeCalib = (ddx: number, ddy: number) => {
    if (!selected) return
    setCalibState(c => { const n = { dx: c.dx + ddx, dy: c.dy + ddy }; setCalib(selected.public_id, n); return n })
  }
  const resetCalib = () => { if (!selected) return; const n = { dx: 0, dy: 0 }; setCalibState(n); setCalib(selected.public_id, n) }

  // Calibrage GUIDÉ : 1) tu cliques la cible → on tape dessus ; 2) tu cliques où
  // le point a réellement atterri → on calcule le décalage tout seul.
  const onCaptureRaw = (rawX: number, rawY: number) => {
    if (!selected) return
    if (calibStep === 'target') {
      calibTarget.current = { x: rawX, y: rawY }
      const tx = Math.round(rawX + calib.dx), ty = Math.round(rawY + calib.dy)
      iremotech.action(selected.public_id, { type: 'tap', x: tx, y: ty })  // tap à l'endroit visé
      setCalibStep('observe')
    } else if (calibStep === 'observe') {
      const t = calibTarget.current; calibTarget.current = null
      if (t) {
        const n = { dx: Math.round(calib.dx + (t.x - rawX)), dy: Math.round(calib.dy + (t.y - rawY)) }
        setCalibState(n); setCalib(selected.public_id, n)
        addLog(tr(`🎯 Calibré : dx ${n.dx}, dy ${n.dy}`, `🎯 Calibrated: dx ${n.dx}, dy ${n.dy}`))
      }
      setCalibStep('idle')
    }
  }

  // Deep-link « nouvel onglet » : #pf-fs=<deviceId> → ouvre ce tel en plein écran.
  useEffect(() => {
    const m = /pf-fs=([^&]+)/.exec(window.location.hash)
    if (!m || !devices.length) return
    const d = devices.find(x => x.public_id === decodeURIComponent(m[1]))
    if (d) { setSelected(d); setFs(true) }
  }, [devices])

  // L'écran principal est rendu par <LivePhone> (flux fluide + repli capture).
  // Il nous remonte l'état de joignabilité → on met à jour hors-ligne + la pastille.
  const onHeroStatus = useCallback((reachable: boolean) => {
    setOffline(!reachable)
    if (selected) setReach(m => ({ ...m, [selected.public_id]: reachable ? 'on' : 'off' }))
  }, [selected])

  const sendAction = async (a: IrtAction, label: string) => {
    if (!selected) return
    recordStep({ action: a })   // capture pour la séquence (si enregistrement)
    const r = await iremotech.action(selected.public_id, a)
    addLog(r.ok ? `✓ ${label}` : tr(`❌ ${label} : ${r.error ?? r.status}`, `❌ ${label}: ${r.error ?? r.status}`))
    // Le flux live montre déjà le résultat → pas de snapshot en plus.
  }

  // Convertit une position écran → coordonnées pixel de la capture. IMPORTANT :
  // l'image est en objectFit:contain (bandes possibles), donc on calcule la zone
  // RÉELLE de l'image dans l'élément (échelle + décalage) — sinon le clic est
  // décalé (c'est la "calibration"). Renvoie null si le clic est hors image.
  const toDeviceXY = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return null
    const r = img.getBoundingClientRect()
    const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight)
    const offX = (r.width - img.naturalWidth * scale) / 2, offY = (r.height - img.naturalHeight * scale) / 2
    const x = (clientX - r.left - offX) / scale, y = (clientY - r.top - offY) / scale
    if (x < 0 || y < 0 || x > img.naturalWidth || y > img.naturalHeight) return null
    // + décalage de calibration (borné à l'image)
    const cx = Math.min(Math.max(x + calib.dx, 0), img.naturalWidth)
    const cy = Math.min(Math.max(y + calib.dy, 0), img.naturalHeight)
    return { x: Math.round(cx), y: Math.round(cy) }
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
    setMetaSaving(true); setMetaSaved(false); setMetaErr('')
    const r = await saveDeviceMeta(currentOrg?.id ?? null, user.id, selected.public_id, { notes, accounts })
    setMetaSaving(false)
    if (r.ok) { setMetaSaved(true); window.setTimeout(() => setMetaSaved(false), 2000) }
    else {
      // Cas fréquent : la table n'a pas encore été créée (migration non lancée).
      const missing = /iremotech_device_meta|relation|does not exist|schema cache|column/i.test(r.error ?? '')
      const hint = missing
        ? tr(' · Lance la migration 20260728_iremotech_device_meta.sql dans Supabase.', ' · Run migration 20260728_iremotech_device_meta.sql in Supabase.')
        : ''
      setMetaErr(`${tr('Échec de la sauvegarde', 'Save failed')} : ${r.error ?? tr('erreur inconnue', 'unknown error')}${hint}`)
      addLog(tr(`❌ notes/comptes : ${r.error}`, `❌ notes/accounts: ${r.error}`))
    }
  }
  const addAccount = () => setAccounts(a => [...a, { ig_base: '', ig_modified: '', password: '', a2f: '' }])
  const updateAccount = (i: number, patch: Partial<IrtAccount>) => setAccounts(a => a.map((x, j) => j === i ? { ...x, ...patch } : x))
  const removeAccount = (i: number) => { setAccounts(a => a.filter((_, j) => j !== i)); setReveal(new Set()) }
  const copy = (v: string) => { try { navigator.clipboard?.writeText(v) } catch { /* noop */ } }

  return (
    <div>
      <BlowPageHeader
        title="Phone Farm — iRemoTech"
        subtitle={tr('Pilote tes vrais iPhones à distance (capture, taps, actions)', 'Control your real iPhones remotely (screenshot, taps, actions)')}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <BlowButton variant="ghost" onClick={() => setShowKey(v => !v)} style={{ height: 40 }}><Ico d={ICON.gear} size={15} /> {tr('Clé API', 'API key')}</BlowButton>
            <BlowButton variant="ghost" onClick={loadDevices} style={{ height: 40 }}><Ico d={ICON.spark} size={15} /> {tr('Rafraîchir', 'Refresh')}</BlowButton>
          </div>
        }
      />

      {/* Config de la clé API — par agence (comme le token GeeLark) */}
      {showKey && (
        <BlowCard style={{ padding: 22, marginBottom: 16 }}>
          <BlowBadge tone="gold">✦ {tr('Clé API iRemoTech', 'iRemoTech API key')} {hasKey ? tr('· configurée', '· configured') : tr('· requise', '· required')}</BlowBadge>
          <h3 style={{ margin: '12px 0 6px', fontSize: 17, fontWeight: 800, color: INK }}>{tr('Connecte ton compte iRemoTech', 'Connect your iRemoTech account')}</h3>
          <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: MUTED, maxWidth: 560 }}>
            {tr('Colle ta clé API (créée dans ton dashboard iRemoTech, scopes', 'Paste your API key (created in your iRemoTech dashboard, scopes')} <b>read · control · upload</b>). {tr('Elle est enregistrée', 'It is saved')} <b>{tr('pour ton agence', 'for your agency')}</b> — {tr('chaque agence a la sienne, comme le token GeeLark.', 'each agency has its own, like the GeeLark token.')}
          </p>
          <div style={{ display: 'flex', gap: 8, maxWidth: 620, flexWrap: 'wrap' }}>
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveKey() }}
              placeholder={hasKey ? tr('•••••••• (clé déjà enregistrée — colle pour remplacer)', '•••••••• (key already saved — paste to replace)') : 'irt_live_<key_id>_<secret>'}
              style={{ flex: 1, minWidth: 240, height: 42, padding: '0 14px', borderRadius: 11, outline: 'none', color: INK, fontSize: 13.5, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}` }}
            />
            <BlowButton onClick={saveKey} style={{ height: 42 }}>{savingKey ? tr('Enregistrement…', 'Saving…') : tr('Enregistrer', 'Save')}</BlowButton>
          </div>
          {keyErr && (
            <div style={{ margin: '12px 0 0', padding: '10px 13px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', color: '#FCA5A5', fontSize: 12, lineHeight: 1.5 }}>
              {keyErr}
            </div>
          )}
          <p style={{ margin: '12px 0 0', fontSize: 11.5, color: FAINT }}>
            🔒 {tr("La clé n'est jamais renvoyée au navigateur ni loguée. Elle transite vers l'API via notre relai sécurisé.", 'The key is never returned to the browser or logged. It travels to the API through our secure relay.')}
          </p>
        </BlowCard>
      )}

      {conn === 'error' && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title={tr('Connexion impossible', 'Connection failed')} hint={connMsg || tr('Vérifie la clé API et le réseau.', 'Check the API key and the network.')} icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'checking' && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title={tr('Connexion à iRemoTech…', 'Connecting to iRemoTech…')} icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'ok' && devices.length === 0 && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title={tr('Aucun iPhone', 'No iPhone')} hint={tr('Ton compte iRemoTech ne renvoie aucun appareil. Ajoute/assigne des iPhones côté iRemoTech.', 'Your iRemoTech account returns no device. Add/assign iPhones on the iRemoTech side.')} icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'ok' && devices.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          {/* Région 1 — rail : liste des iPhones + quotas du jour */}
          <div style={{ flex: '0 1 230px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Liste des iPhones */}
          <BlowCard style={{ padding: 10 }}>
            <p style={{ margin: '4px 6px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED }}>
              {devices.length} iPhone{devices.length > 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 520, overflowY: 'auto' }} className="blow-scroll">
              {devices.map(d => {
                const on = selected?.public_id === d.public_id
                const rc = reach[d.public_id]                    // joignabilité RÉELLE (dernière capture)
                const isOn = rc === 'on'
                const isOff = rc === 'off'
                const dot = isOn ? '#34D399' : isOff ? '#F87171' : '#94A3B8'
                return (
                  <button key={d.public_id} onClick={() => setSelected(d)} className="blow-tap" style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 11, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: on ? 'linear-gradient(100deg, rgba(168,85,247,0.2), rgba(99,102,241,0.12))' : 'transparent',
                    boxShadow: on ? 'inset 0 0 0 1px rgba(168,85,247,0.35)' : 'none',
                  }}>
                    <span style={{ position: 'relative', width: 30, height: 30, flexShrink: 0, borderRadius: 8, display: 'grid', placeItems: 'center', color: '#fff', background: on ? GRAD : 'var(--surface-3)' }}>
                      <Ico d={ICON.phone} size={15} />
                      <span title={isOn ? tr('joignable', 'reachable') : isOff ? tr('hors ligne (503)', 'offline (503)') : tr('non testé', 'not tested')} style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: 99, background: dot, boxShadow: `0 0 0 2px var(--surface-1)${isOn ? ', 0 0 6px ' + dot : ''}` }} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || d.public_id}</span>
                      <span style={{ display: 'block', fontSize: 10.5, color: FAINT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isOff ? tr('hors ligne', 'offline') : d.public_id}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </BlowCard>

          {/* Diagnostic : budgets du jour (GET /usage) */}
          {usage && (() => {
            const rows: Array<[string, IrtBudget | undefined]> = [
              [tr('Captures', 'Snapshots'), usage.snapshots], [tr('Actions', 'Actions'), usage.actions],
              [tr('Minutes actives', 'Active minutes'), usage.active_minutes], [tr('Uploads', 'Uploads'), usage.uploads],
            ]
            return (
              <BlowCard style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>{tr('Quotas du jour', "Today's quotas")}</span>
                  <button onClick={() => iremotech.usage().then(u => { if (u.ok && u.data) setUsage(u.data) })} className="blow-tap" title={tr('Rafraîchir', 'Refresh')} style={{ fontSize: 11, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>↻</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {rows.map(([label, b]) => b && (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: FAINT, marginBottom: 3 }}>
                        <span>{label}</span><span>{b.remaining} / {b.budget}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${b.budget ? Math.max(2, Math.round((b.remaining / b.budget) * 100)) : 0}%`, borderRadius: 99, background: b.remaining <= 0 ? '#F87171' : GRAD }} />
                      </div>
                    </div>
                  ))}
                </div>
                {typeof usage.max_active_devices === 'number' && (
                  <p style={{ margin: '9px 0 0', fontSize: 10, color: FAINT }}>{tr('Max simultanés :', 'Max concurrent:')} <b style={{ color: MUTED }}>{usage.max_active_devices}</b>{usage.resets_at ? ` · reset ${new Date(usage.resets_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                )}
              </BlowCard>
            )
          })()}
          </div>

          {/* Région 2 — écran façon téléphone (hero) */}
          <div style={{ flex: '0 1 300px', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
            {/* Écran — tap / swipe / molette envoyés au tel */}
            <BlowCard style={{ padding: 14, width: '100%', maxWidth: 320 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Écran', 'Screen')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: offline ? '#F87171' : '#34D399', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: offline ? '#F87171' : '#34D399', boxShadow: offline ? 'none' : '0 0 8px #34D399' }} /> {offline ? tr('Hors ligne', 'Offline') : 'Live'}
                  </span>
                  <button onClick={() => { setOffline(false); setHeroKey(k => k + 1) }} className="blow-tap" title={tr('Reconnecter', 'Reconnect')} style={{ fontSize: 11, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>↻</button>
                  <button onClick={() => setFs(true)} className="blow-tap" title={tr('Plein écran', 'Fullscreen')} style={{ fontSize: 13, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>⛶</button>
                  <button onClick={() => selected && openInNewTab(selected)} className="blow-tap" title={tr('Ouvrir dans un nouvel onglet', 'Open in a new tab')} style={{ fontSize: 12, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>↗</button>
                  <button onClick={() => setMulti(true)} className="blow-tap" title={tr('Multi-écrans', 'Multi-view')} style={{ fontSize: 13, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>▦</button>
                  <button onClick={() => setCalibMode(v => !v)} className="blow-tap" title={tr('Calibrer le curseur', 'Calibrate the cursor')} style={{ fontSize: 13, color: calibMode ? '#34D399' : '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>🎯</button>
                </div>
              </div>

              {calibMode && (
                <div style={{ marginBottom: 10, padding: 10, borderRadius: 11, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)' }}>
                  <p style={{ margin: '0 0 8px', fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{tr('Le tap tombe à côté ? Ajuste jusqu\'à ce que ce soit calé — c\'est mémorisé pour ce tel.', 'Taps landing off? Nudge until it lines up — saved for this phone.')}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 28px)', gridTemplateRows: 'repeat(3, 28px)', gap: 3 }}>
                      <span /><button onClick={() => nudgeCalib(0, -10)} className="blow-tap" style={calibBtn}>↑</button><span />
                      <button onClick={() => nudgeCalib(-10, 0)} className="blow-tap" style={calibBtn}>←</button>
                      <button onClick={resetCalib} className="blow-tap" title={tr('Réinitialiser', 'Reset')} style={{ ...calibBtn, fontSize: 12 }}>⟳</button>
                      <button onClick={() => nudgeCalib(10, 0)} className="blow-tap" style={calibBtn}>→</button>
                      <span /><button onClick={() => nudgeCalib(0, 10)} className="blow-tap" style={calibBtn}>↓</button><span />
                    </div>
                    <div style={{ fontSize: 11, color: FAINT, fontFamily: 'monospace' }}>dx {calib.dx > 0 ? '+' : ''}{calib.dx} · dy {calib.dy > 0 ? '+' : ''}{calib.dy}</div>
                  </div>
                  {/* Calibrage guidé (semi-auto) */}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${HAIR}` }}>
                    {calibStep === 'idle' ? (
                      <button onClick={() => setCalibStep('target')} className="blow-tap" style={{ fontSize: 11.5, fontWeight: 700, color: '#34D399', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>🎯 {tr('Calibrage guidé', 'Guided calibration')}</button>
                    ) : (
                      <div style={{ fontSize: 11, color: '#34D399', lineHeight: 1.5 }}>
                        {calibStep === 'target'
                          ? tr('① Clique sur l\'écran là où tu VEUX taper (une icône précise).', '① Click on the screen where you WANT to tap (a precise icon).')
                          : tr('② Regarde où le point a réellement atterri, puis clique dessus.', '② See where it actually landed, then click there.')}
                        <button onClick={() => { setCalibStep('idle'); calibTarget.current = null }} className="blow-tap" style={{ marginLeft: 8, fontSize: 10.5, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{tr('annuler', 'cancel')}</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* On coupe le flux principal quand un modal (plein écran / multi) est
                  ouvert → libère le slot (max_active_devices) et évite un double flux
                  sur le même tel, pour que le plein écran / multi passe bien en WebSocket. */}
              {selected && !fs && !multi && <LivePhone key={`${selected.public_id}-${heroKey}`} device={selected} fps={30} rounded={26} captureRaw={calibStep !== 'idle' ? onCaptureRaw : undefined} onRecord={recording ? (a => recordStep({ action: a })) : undefined} onScreenSize={(w, h) => setScreenSize({ w, h })} onStatus={onHeroStatus} onLog={addLog} />}
              {selected && (fs || multi) && <div style={{ aspectRatio: '9/19.5', width: '100%', maxWidth: 300, margin: '0 auto', borderRadius: 34, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, display: 'grid', placeItems: 'center', color: FAINT, fontSize: 11.5 }}>{tr('Ouvert en grand', 'Open in the big view')}</div>}
              <p style={{ margin: '9px 2px 0', fontSize: 10.5, color: FAINT, textAlign: 'center' }}><Grad style={{ fontWeight: 700 }}>{tr('Clic', 'Click')}</Grad> = {tr('taper', 'tap')} · <Grad style={{ fontWeight: 700 }}>{tr('glisser', 'drag')}</Grad> = swipe · <Grad style={{ fontWeight: 700 }}>{tr('molette', 'wheel')}</Grad> = scroll</p>
            </BlowCard>
          </div>

          {/* Région 3 — dock des contrôles (actions · notes · journal) */}
          <div style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Actions masquées quand le tel est injoignable (rien à piloter) */}
              {!offline && (
              <BlowCard style={{ padding: 16 }}>
                {/* Actions = catalogue documenté iRemoTech (press/airplane/scroll/open_url/text) */}
                <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Actions', 'Actions')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'press', name: 'home' }, 'home')} style={{ height: 34 }}>⌂ {tr('Accueil', 'Home')}</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'press', name: 'screenshot' }, 'screenshot')} style={{ height: 34 }}>📸 {tr('Capture', 'Screenshot')}</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'scroll', x: 200, y: 500, dy: -600 }, 'scroll ↑')} style={{ height: 34 }}>↑ Scroll</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'scroll', x: 200, y: 500, dy: 600 }, 'scroll ↓')} style={{ height: 34 }}>↓ Scroll</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'airplane', on: true }, tr('avion ON', 'airplane ON'))} style={{ height: 34 }}>✈️ {tr('Avion ON', 'Airplane ON')}</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'airplane', on: false }, tr('avion OFF', 'airplane OFF'))} style={{ height: 34 }}>✈️ {tr('Avion OFF', 'Airplane OFF')}</BlowButton>
                </div>

                <div style={{ height: 1, background: HAIR, margin: '14px 0' }} />
                {/* Ouvrir une app / une URL (open_url) */}
                <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Ouvrir', 'Open')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {([
                    { l: 'Instagram', url: 'instagram://app' },
                    { l: tr('Créer un post', 'Create post'), url: 'instagram://camera' },
                    { l: tr('Créer une story', 'Create story'), url: 'instagram://story-camera' },
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
                    placeholder={tr('Taper du texte, ou coller une URL à ouvrir…', 'Type text, or paste a URL to open…')}
                    style={{ flex: 1, height: 38, padding: '0 13px', borderRadius: 11, outline: 'none', color: INK, fontSize: 13, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}` }}
                  />
                  <BlowButton onClick={() => { if (text.trim()) { sendAction(/^https?:\/\//.test(text) ? { type: 'open_url', url: text } : { type: 'text', text }, text); setText('') } }} style={{ height: 38 }}>{tr('Envoyer', 'Send')}</BlowButton>
                </div>

                <div style={{ height: 1, background: HAIR, margin: '14px 0' }} />
                {/* Upload d'un média vers le tel (banque OU fichier PC) */}
                <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Envoyer un média sur le tel', 'Send media to the phone')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <BlowButton variant="ghost" onClick={() => setUploadPick(true)} style={{ height: 34 }}>🗂 {tr('Depuis la banque', 'From the bank')}</BlowButton>
                  <label className="blow-tap" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px', borderRadius: 11, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.045)', color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    💻 {tr('Depuis le PC', 'From the PC')}
                    <input type="file" accept="image/*,video/*" onChange={uploadFromPC} style={{ display: 'none' }} />
                  </label>
                  {uploadMsg && <span style={{ fontSize: 11, color: uploadMsg.includes('❌') ? '#F87171' : '#34D399' }}>{uploadMsg}</span>}
                </div>
                <p style={{ margin: '7px 0 0', fontSize: 10, color: FAINT }}>{tr('PC : ≤ 4 Mo (sinon passe par la banque). Le média arrive dans la pellicule du tel.', 'PC: ≤ 4 MB (otherwise use the bank). Media lands in the phone camera roll.')}</p>
              </BlowCard>
              )}

              {/* Notes + comptes du téléphone — section repliable */}
              <BlowCard style={{ padding: 16 }}>
                <button onClick={() => setShowMeta(v => !v)} className="blow-tap" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Notes & comptes', 'Notes & accounts')} {accounts.length > 0 && <span style={{ color: MUTED, fontWeight: 600 }}>· {accounts.length}</span>}</span>
                  <span style={{ fontSize: 13, color: MUTED, transform: showMeta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                </button>

                {showMeta && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <button onClick={saveMeta} className="blow-tap" style={{ fontSize: 11.5, fontWeight: 700, color: metaSaved ? '#34D399' : '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer' }}>
                        {metaSaving ? tr('Enregistrement…', 'Saving…') : metaSaved ? tr('✓ Enregistré', '✓ Saved') : tr('Enregistrer', 'Save')}
                      </button>
                    </div>
                    {metaErr && (
                      <div style={{ margin: '0 0 10px', padding: '9px 11px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', color: '#FCA5A5', fontSize: 11.5, lineHeight: 1.5 }}>
                        {metaErr}
                      </div>
                    )}
                    <textarea
                      value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder={tr('Notes sur ce téléphone (proxy, statut, remarques…)', 'Notes about this phone (proxy, status, remarks…)')}
                      rows={2}
                      style={{ width: '100%', resize: 'vertical', padding: '9px 11px', borderRadius: 10, outline: 'none', color: INK, fontSize: 12.5, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}`, fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0 8px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>{tr('Comptes', 'Accounts')} ({accounts.length})</span>
                      <button onClick={addAccount} className="blow-tap" style={{ fontSize: 11.5, fontWeight: 700, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer' }}>{tr('+ Ajouter un compte', '+ Add an account')}</button>
                    </div>
                    {accounts.length === 0 ? (
                      <p style={{ fontSize: 11.5, color: FAINT, margin: 0 }}>{tr('Aucun compte. Ajoute nom IG de base / nom IG modifié / mot de passe / id A2F.', 'No account. Add base IG name / modified IG name / password / 2FA id.')}</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {accounts.map((acc, i) => {
                          const shown = reveal.has(i)
                          // autoComplete=new-password + data-*ignore : empêche le navigateur / gestionnaire
                          // de mots de passe d'auto-remplir ces champs (login app, clé API…).
                          const field = (v: string, ph: string, on: (val: string) => void, type = 'text') => (
                            <input value={v} onChange={e => on(e.target.value)} placeholder={ph} type={type}
                              autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                              data-lpignore="true" data-1p-ignore data-form-type="other" name={`sf-${ph}-${i}`}
                              style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', borderRadius: 8, outline: 'none', color: INK, fontSize: 12.5, background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIR}` }} />
                          )
                          const copyBtn = (v: string) => (
                            <button onClick={() => copy(v)} className="blow-tap" title={tr('Copier', 'Copy')} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: MUTED, cursor: 'pointer', fontSize: 12 }}>⧉</button>
                          )
                          return (
                            <div key={i} style={{ padding: 10, borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
                              {/* Nom IG de base + supprimer */}
                              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                {field(acc.ig_base ?? acc.username ?? '', tr('Nom IG de base', 'Base IG name'), v => updateAccount(i, { ig_base: v }))}
                                {copyBtn(acc.ig_base ?? acc.username ?? '')}
                                <button onClick={() => removeAccount(i)} className="blow-tap" title={tr('Supprimer', 'Delete')} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: '#F87171', cursor: 'pointer', fontSize: 14 }}>✕</button>
                              </div>
                              {/* Nom IG modifié */}
                              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                {field(acc.ig_modified ?? '', tr('Nom IG modifié', 'Modified IG name'), v => updateAccount(i, { ig_modified: v }))}
                                {copyBtn(acc.ig_modified ?? '')}
                              </div>
                              {/* Mot de passe (masqué + révéler) */}
                              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                {field(acc.password ?? '', tr('Mot de passe', 'Password'), v => updateAccount(i, { password: v }), shown ? 'text' : 'password')}
                                <button onClick={() => setReveal(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })} className="blow-tap" title={shown ? tr('Masquer', 'Hide') : tr('Afficher', 'Show')} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: MUTED, cursor: 'pointer', fontSize: 12 }}>{shown ? '🙈' : '👁'}</button>
                                {copyBtn(acc.password ?? '')}
                              </div>
                              {/* Id A2F (2FA) */}
                              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                {field(acc.a2f ?? acc.auth_id ?? '', tr('Id A2F (2FA)', '2FA id'), v => updateAccount(i, { a2f: v }), shown ? 'text' : 'password')}
                                {copyBtn(acc.a2f ?? acc.auth_id ?? '')}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <p style={{ margin: '10px 0 0', fontSize: 10.5, color: FAINT }}>👥 {tr('Visible par toute ton agence. Pense à cliquer « Enregistrer ».', 'Visible to your whole agency. Remember to click “Save”.')}</p>
                  </div>
                )}
              </BlowCard>

              {/* Poster un Reel : vidéo + description → ça poste (flow IG intégré) */}
              <BlowCard style={{ padding: 16 }}>
                <p style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 800, color: INK }}>📱 {tr('Poster un Reel', 'Post a Reel')}</p>
                <p style={{ margin: '0 0 11px', fontSize: 10.5, color: FAINT }}>{tr('Choisis la vidéo et la description — ScaleFlow fait tout le reste.', 'Pick the video and caption — ScaleFlow does the rest.')}</p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 9 }}>
                  <BlowButton variant="ghost" onClick={() => setPostPick(true)} style={{ height: 34 }}>🗂 {postVideo ? tr('Vidéo ✓', 'Video ✓') : tr('Choisir la vidéo', 'Pick the video')}</BlowButton>
                  {postVideo && <span style={{ fontSize: 10.5, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{postVideo.name}</span>}
                </div>

                <textarea value={postCaption} onChange={e => setPostCaption(e.target.value)} rows={3}
                  placeholder={tr('Ta description… #hashtags', 'Your caption… #hashtags')}
                  style={{ width: '100%', resize: 'vertical', padding: '9px 11px', borderRadius: 10, outline: 'none', color: INK, fontSize: 12.5, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}`, fontFamily: 'inherit', marginBottom: 9 }} />

                {/* Point d'entrée : deep link direct (saute le « + ») ou via l'app */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {([
                    { v: 'camera' as IgEntry, l: tr('Création directe', 'Direct create'), t: 'instagram://camera' },
                    { v: 'app' as IgEntry, l: tr('Via l\'app (+)', 'Via app (+)'), t: 'instagram://app → tap +' },
                  ]).map(o => (
                    <button key={o.v} onClick={() => setIgEntry(o.v)} title={o.t} className="blow-tap"
                      style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', color: igEntry === o.v ? '#34D399' : MUTED, background: igEntry === o.v ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${igEntry === o.v ? 'rgba(52,211,153,0.35)' : HAIR}` }}>
                      {o.l}
                    </button>
                  ))}
                </div>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: MUTED, cursor: 'pointer', marginBottom: 10 }}>
                  <input type="checkbox" checked={postAll} onChange={e => setPostAll(e.target.checked)} />
                  {tr(`Sur TOUS mes tels (${devices.length})`, `On ALL my phones (${devices.length})`)}
                </label>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <BlowButton onClick={runPostReel} style={{ height: 38, flex: 1, opacity: (!postVideo || postBusy) ? 0.55 : 1 }}>
                    {postBusy ? tr('Publication…', 'Posting…') : `🚀 ${tr('POSTER', 'POST')}${postAll ? ` (${devices.length})` : ''}`}
                  </BlowButton>
                  {postBusy && <button onClick={() => { postStop.current = true }} className="blow-tap" style={{ fontSize: 12, fontWeight: 700, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer' }}>{tr('stop', 'stop')}</button>}
                </div>
                {postMsg && <div style={{ marginTop: 8, fontSize: 11.5, color: postMsg.includes('❌') ? '#F87171' : '#34D399' }}>{postMsg}</div>}

                {/* Réglage fin des points de tap (si un bouton tombe à côté) */}
                <button onClick={() => setTuneCoords(v => !v)} className="blow-tap" style={{ marginTop: 10, fontSize: 10.5, color: FAINT, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  ⚙ {tr('Un bouton tombe à côté ? Régler les positions', 'A button misses? Adjust positions')} {tuneCoords ? '▴' : '▾'}
                </button>
                {tuneCoords && (
                  <div style={{ marginTop: 9, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}` }}>
                    <p style={{ margin: '0 0 8px', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
                      {tr('Position en % de l\'écran. Astuce : clique sur l\'écran du tel à l\'endroit du bouton, le Journal (Ctrl+J) affiche les coordonnées.', 'Position in % of the screen. Tip: tap the phone screen on the button — the Log (Ctrl+J) shows the coordinates.')}
                    </p>
                    {(Object.keys(IG_COORD_LABELS) as (keyof IgReelCoords)[]).map(k => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <span style={{ flex: 1, fontSize: 11, color: MUTED }}>{IG_COORD_LABELS[k]}</span>
                        {(['x', 'y'] as const).map(axis => (
                          <input key={axis} type="number" min={0} max={100} value={Math.round(coords[k][axis] * 100)}
                            onChange={e => { const v = Math.min(Math.max(Number(e.target.value) || 0, 0), 100) / 100; const next = { ...coords, [k]: { ...coords[k], [axis]: v } }; setCoordsState(next); setIgCoords(next) }}
                            title={axis.toUpperCase()}
                            style={{ width: 52, height: 26, padding: '0 7px', borderRadius: 7, outline: 'none', color: INK, fontSize: 11, background: 'rgba(255,255,255,0.05)', border: `1px solid ${HAIR}` }} />
                        ))}
                      </div>
                    ))}
                    <button onClick={() => { resetIgCoords(); setCoordsState(getIgCoords()) }} className="blow-tap" style={{ marginTop: 6, fontSize: 10.5, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }}>↺ {tr('Valeurs par défaut', 'Reset to defaults')}</button>
                  </div>
                )}
              </BlowCard>

              {/* Séquences / RPA maison : enregistre un flow, rejoue-le sur tous les tels */}
              <BlowCard style={{ padding: 16 }}>
                <button onClick={() => setShowSeq(v => !v)} className="blow-tap" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>🤖 {tr('Séquences / RPA', 'Sequences / RPA')} {sequences.length > 0 && <span style={{ color: MUTED, fontWeight: 600 }}>· {sequences.length}</span>}</span>
                  <span style={{ fontSize: 13, color: MUTED, transform: showSeq ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                </button>
                {showSeq && (
                  <div style={{ marginTop: 12 }}>
                    {/* Enregistrement */}
                    {!recording ? (
                      <button onClick={startRec} className="blow-tap" style={{ fontSize: 12, fontWeight: 700, color: '#F87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer', width: '100%' }}>● {tr('Enregistrer une séquence', 'Record a sequence')}</button>
                    ) : (
                      <div style={{ padding: 10, borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#F87171', marginBottom: 8 }}>⏺ {tr('Enregistrement…', 'Recording…')} · {recCount} {tr('étapes', 'steps')}</div>
                        <p style={{ margin: '0 0 8px', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>{tr('Fais ton posting sur le tel. Aux moments clés :', 'Do your posting on the phone. At key moments:')}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                          <button onClick={() => recordStep({ upload: true })} className="blow-tap" style={{ fontSize: 11, fontWeight: 700, color: '#A5B4FC', background: 'rgba(129,140,248,0.12)', border: `1px solid ${HAIR}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>＋ {tr('Envoyer la vidéo', 'Upload the video')}</button>
                          <button onClick={() => recordStep({ action: { type: 'text', text: '' }, captionVar: true })} className="blow-tap" style={{ fontSize: 11, fontWeight: 700, color: '#A5B4FC', background: 'rgba(129,140,248,0.12)', border: `1px solid ${HAIR}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>＋ {tr('Insérer la description', 'Insert the caption')}</button>
                        </div>
                        {/* Menu d'actions toutes prêtes (sans coordonnées) */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                          {([
                            { l: '⌂ ' + tr('Accueil', 'Home'), a: { type: 'press', name: 'home' } as IrtAction },
                            { l: '📱 ' + tr('Ouvrir Insta', 'Open IG'), a: { type: 'open_url', url: 'instagram://app' } as IrtAction },
                            { l: '📸 ' + tr('Capture', 'Screenshot'), a: { type: 'press', name: 'screenshot' } as IrtAction },
                            { l: '✈️ ON', a: { type: 'airplane', on: true } as IrtAction },
                            { l: '✈️ OFF', a: { type: 'airplane', on: false } as IrtAction },
                          ]).map(x => (
                            <button key={x.l} onClick={() => insertAction(x.a)} className="blow-tap" style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, background: 'rgba(255,255,255,0.05)', border: `1px solid ${HAIR}`, borderRadius: 8, padding: '4px 9px', cursor: 'pointer' }}>{x.l}</button>
                          ))}
                          {[1, 2, 3, 5].map(s => (
                            <button key={s} onClick={() => insertWait(s)} className="blow-tap" style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, background: 'rgba(255,255,255,0.05)', border: `1px solid ${HAIR}`, borderRadius: 8, padding: '4px 9px', cursor: 'pointer' }}>⏱ {s}s</button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <BlowButton onClick={stopRecSave} style={{ height: 32, flex: 1 }}>{tr('Arrêter & enregistrer', 'Stop & save')}</BlowButton>
                          <button onClick={() => { setRecording(false); recSteps.current = [] }} className="blow-tap" style={{ fontSize: 11.5, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{tr('annuler', 'cancel')}</button>
                        </div>
                      </div>
                    )}

                    {/* Séquences enregistrées */}
                    {!recording && sequences.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                        {sequences.map(sq => (
                          <div key={sq.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}` }}>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sq.name} <span style={{ color: FAINT, fontWeight: 500 }}>· {sq.steps.length}</span></span>
                            <button onClick={() => { setReplaySeq(sq); setReplayVideo(null); setReplayCaption(''); setReplayAll(false) }} className="blow-tap" style={{ fontSize: 11.5, fontWeight: 700, color: '#34D399', background: 'none', border: 'none', cursor: 'pointer' }}>▶ {tr('Rejouer', 'Replay')}</button>
                            <button onClick={() => { if (sq.id) { deleteSequence(sq.id); setSequences(s => s.filter(x => x.id !== sq.id)) } }} className="blow-tap" title={tr('Supprimer', 'Delete')} style={{ fontSize: 13, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Config de rejeu */}
                    {replaySeq && (
                      <div style={{ marginTop: 12, padding: 11, borderRadius: 10, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.3)' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: INK, marginBottom: 8 }}>▶ {tr('Rejouer', 'Replay')} : {replaySeq.name}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                          <BlowButton variant="ghost" onClick={() => setReplayPickVideo(true)} style={{ height: 30 }}>🗂 {replayVideo ? tr('Vidéo ✓', 'Video ✓') : tr('Choisir la vidéo', 'Pick the video')}</BlowButton>
                          {replayVideo && <span style={{ fontSize: 10.5, color: FAINT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{replayVideo.name}</span>}
                        </div>
                        <textarea value={replayCaption} onChange={e => setReplayCaption(e.target.value)} placeholder={tr('Description (remplace l\'étape « description »)', 'Caption (replaces the “caption” step)')} rows={2}
                          style={{ width: '100%', resize: 'vertical', padding: '8px 10px', borderRadius: 9, outline: 'none', color: INK, fontSize: 12, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}`, fontFamily: 'inherit', marginBottom: 8 }} />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: MUTED, cursor: 'pointer', marginBottom: 8 }}>
                          <input type="checkbox" checked={replayAll} onChange={e => setReplayAll(e.target.checked)} /> {tr(`Sur TOUS les tels (${devices.length})`, `On ALL phones (${devices.length})`)}
                        </label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <BlowButton onClick={() => { if (!replayMsg || replayMsg.startsWith('✓')) runReplay() }} style={{ height: 32, flex: 1 }}>{tr('Lancer', 'Run')} {replayAll ? `(${devices.length})` : tr('(ce tel)', '(this phone)')}</BlowButton>
                          {replayMsg ? <button onClick={() => { replayStop.current = true }} className="blow-tap" style={{ fontSize: 11.5, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{tr('stop', 'stop')}</button> : <button onClick={() => setReplaySeq(null)} className="blow-tap" style={{ fontSize: 11.5, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{tr('fermer', 'close')}</button>}
                        </div>
                        {replayMsg && <div style={{ marginTop: 6, fontSize: 11, color: '#34D399' }}>{replayMsg}</div>}
                      </div>
                    )}
                  </div>
                )}
              </BlowCard>

              {showLog && (
                <BlowCard style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: INK }}>{tr('Journal', 'Log')}</p>
                    <span style={{ fontSize: 10.5, color: FAINT }}>Ctrl/Cmd + J</span>
                  </div>
                  <div className="blow-scroll" style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {log.length === 0
                      ? <span style={{ fontSize: 12, color: FAINT }}>{tr("Aucune action pour l'instant.", 'No action yet.')}</span>
                      : log.map((l, i) => <span key={i} style={{ fontSize: 11.5, color: l.includes('❌') ? '#F87171' : 'var(--text-2)', fontFamily: 'monospace' }}>{l}</span>)}
                  </div>
                </BlowCard>
              )}
            </div>
        </div>
      )}

      {/* Sélecteur banque → envoyer sur le tel */}
      {uploadPick && (
        <BankPicker user={user} mode="multi" resolveMode="signed-url"
          onSelect={(paths, titles) => uploadFromBank(paths, titles)}
          onClose={() => setUploadPick(false)} />
      )}

      {/* Sélecteur banque → vidéo du Reel à poster */}
      {postPick && (
        <BankPicker user={user} mode="single" resolveMode="signed-url"
          onSelect={(paths, titles) => { setPostPick(false); if (paths[0]) setPostVideo({ url: paths[0], name: (titles?.[0] || 'video.mp4').replace(/[^\w.\-]+/g, '_') }) }}
          onClose={() => setPostPick(false)} />
      )}

      {/* Sélecteur banque → vidéo pour le rejeu d'une séquence */}
      {replayPickVideo && (
        <BankPicker user={user} mode="single" resolveMode="signed-url"
          onSelect={(paths, titles) => { setReplayPickVideo(false); if (paths[0]) setReplayVideo({ url: paths[0], name: (titles?.[0] || 'video.mp4').replace(/[^\w.\-]+/g, '_') }) }}
          onClose={() => setReplayPickVideo(false)} />
      )}

      {/* Plein écran d'un tel (interactif) */}
      {fs && selected && (
        <div onClick={() => setFs(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5,5,10,0.92)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>{selected.name || selected.public_id}</span>
            <button onClick={() => setFs(false)} className="blow-tap" style={{ fontSize: 13, fontWeight: 700, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer' }}>✕ {tr('Fermer', 'Close')}</button>
          </div>
          <div onClick={e => e.stopPropagation()} style={{ height: '80vh', aspectRatio: '9/19.5', maxWidth: '95vw' }}>
            <LivePhone device={selected} fps={30} onLog={addLog} />
          </div>
          <span style={{ fontSize: 11, color: FAINT }}>{tr('Clic = taper · glisser = swipe · molette = scroll · Échap = fermer', 'Click = tap · drag = swipe · wheel = scroll · Esc = close')}</span>
        </div>
      )}

      {/* Multi-écrans : tous les tels en direct */}
      {multi && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5,5,10,0.95)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>{tr('Multi-écrans', 'Multi-view')} · {devices.length}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Miroir : une action sur un tel se répercute sur TOUS */}
              <button onClick={() => setBroadcast(v => !v)} className="blow-tap" title={tr('Reproduit chaque action sur tous les tels', 'Repeats every action on all phones')}
                style={{ fontSize: 12, fontWeight: 800, color: broadcast ? '#34D399' : '#D8B4FE', background: broadcast ? 'rgba(52,211,153,0.14)' : 'none', border: `1px solid ${broadcast ? 'rgba(52,211,153,0.4)' : HAIR}`, borderRadius: 8, padding: '5px 11px', cursor: 'pointer' }}>
                🔁 {tr('Miroir', 'Mirror')}{broadcast ? tr(' ON', ' ON') : ''}
              </button>
              <button onClick={() => setMulti(false)} className="blow-tap" style={{ fontSize: 13, fontWeight: 700, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer' }}>✕ {tr('Fermer', 'Close')}</button>
            </div>
          </div>
          {broadcast && <p style={{ margin: '0 0 10px', fontSize: 11, color: '#34D399' }}>🔁 {tr('Miroir actif : ce que tu fais sur un tel se répète sur les', 'Mirror on: what you do on one phone repeats on all')} {devices.length} {tr('tels.', 'phones.')}</p>}
          <div className="blow-scroll" style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14, alignContent: 'start' }}>
            {devices.map((d, i) => {
              // Priorité flux : seul le tel SURVOLÉ (ou le 1er par défaut) est en
              // live → respecte la limite de 5 tels simultanés. Le miroir force tout.
              const livePhone = hoverId ? hoverId === d.public_id : i === 0
              return (
              <div key={d.public_id} onMouseEnter={() => setHoverId(d.public_id)}
                style={{ display: 'flex', flexDirection: 'column', gap: 6, outline: broadcast ? '1px solid rgba(52,211,153,0.3)' : (livePhone ? '1px solid rgba(129,140,248,0.4)' : 'none'), outlineOffset: 3, borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || d.public_id}</span>
                  <button onClick={() => { setSelected(d); setMulti(false); setFs(true) }} className="blow-tap" title={tr('Plein écran', 'Fullscreen')} style={{ fontSize: 12, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer' }}>⛶</button>
                </div>
                <LivePhone device={d} fps={12} bezel={false} paused={!livePhone} broadcast={broadcast ? devices.map(x => x.public_id) : undefined} onLog={addLog} />
              </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default BlowPhoneFarm
