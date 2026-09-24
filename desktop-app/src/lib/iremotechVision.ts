// Automatisation iRemoTech par VISION : on lit l'écran (OCR) pour trouver le bon
// container Crane dans le sélecteur « Select Container » et taper dessus, en scrollant
// tout seul si besoin. Bien plus fiable que des coordonnées devinées : on VÉRIFIE
// ce qu'on voit avant de taper, et ça s'adapte au scroll.
import { snapshot, sendAction } from './iremotech'
import { ocrWords } from './ocr'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function imgSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise(res => {
    const i = new Image()
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight })
    i.onerror = () => res({ w: 0, h: 0 })
    i.src = dataUrl
  })
}

export interface VisionHooks { log?: (m: string) => void; shouldStop?: () => boolean }

// Rotation d'IP via le "bouton mode avion" d'iRemoTech : UN SEUL appel (iRemoTech gère
// le pulse avion + la reconnexion côté device). On n'envoie PAS de "OFF" séparé — il
// n'arriverait jamais, le téléphone étant déjà hors-réseau. On attend puis on vérifie
// que le device est bien revenu en ligne (snapshot) avant de continuer.
export async function airplaneReset(key: string, deviceId: string, hooks?: VisionHooks, waitMs = 10000): Promise<void> {
  hooks?.log?.('✈️ Mode avion (bouton iRemoTech) → nouvelle IP…')
  await sendAction(key, deviceId, { type: 'airplane', on: true })
  await sleep(waitMs)
  // Vérifie le retour en ligne (jusqu'à ~15 s de plus).
  for (let i = 0; i < 5; i++) {
    if (hooks?.shouldStop?.()) return
    const s = await snapshot(key, deviceId)
    if (s) { hooks?.log?.('   réseau rétabli ✓'); return }
    hooks?.log?.('   attente reconnexion…')
    await sleep(3000)
  }
  hooks?.log?.('   ⚠ toujours hors-ligne après l’avion (vérifie le comportement du bouton iRemoTech)')
}

// Brique réutilisable : cherche à l'écran un bouton dont le TEXTE matche l'un des
// motifs (ex. /reel/i, /next|suivant/i, /share|partager/i) et tape dessus.
// Réessaie plusieurs fois (l'écran met parfois du temps à charger). true si tapé.
export async function findTapText(
  key: string, deviceId: string, patterns: RegExp[], hooks?: VisionHooks,
  opts?: { tries?: number; label?: string; minY?: number; maxY?: number },
): Promise<boolean> {
  const tries = opts?.tries ?? 5
  const label = opts?.label ?? patterns.map(p => p.source).join('|')
  for (let i = 0; i < tries; i++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (!shot) { await sleep(600); continue }
    const { w: W, h: H } = await imgSize(shot)
    if (!W || !H) { await sleep(500); continue }
    // Texte d'UI (souvent clair) → pas de binarisation, grayscale ×2.
    const words = await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11', '6'] })
    const minY = (opts?.minY ?? 0) * H, maxY = (opts?.maxY ?? 1) * H
    const hit = words.find(o => o.cy >= minY && o.cy <= maxY && patterns.some(p => p.test(o.text)))
    if (hit) {
      hooks?.log?.(`🎯 « ${hit.text} » trouvé → tap (${hit.cx}, ${hit.cy})`)
      await sendAction(key, deviceId, { type: 'tap', x: hit.cx, y: hit.cy })
      return true
    }
    if (i === 0) hooks?.log?.(`🔎 recherche « ${label} »… (lu : ${words.map(w => w.text).filter(Boolean).slice(0, 12).join(', ') || 'rien'})`)
    await sleep(800)
  }
  hooks?.log?.(`❌ bouton « ${label} » introuvable`)
  return false
}

// Cherche le container `target` (ex. "12" ou "Default") dans le sélecteur affiché à
// l'écran et tape dessus. Scrolle haut/bas jusqu'à le trouver. true si tapé.
export async function findAndTapContainer(key: string, deviceId: string, target: string, hooks?: VisionHooks): Promise<boolean> {
  const wanted = target.trim()
  const wantedNum = /^\d+$/.test(wanted) ? parseInt(wanted) : null
  const isDefault = /^default$/i.test(wanted)
  const whitelist = '0123456789Defaultefaul'
  const maxSteps = 12
  let lastDir = 0
  let sawSheet = false
  for (let step = 0; step < maxSteps; step++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (!shot) { hooks?.log?.('⚠ snapshot indisponible'); await sleep(700); continue }
    const { w: W, h: H } = await imgSize(shot)
    if (!W || !H) { hooks?.log?.('⚠ image illisible'); await sleep(500); continue }
    const words = await ocrWords(shot, whitelist)
    // Libellés plausibles de container : chiffres purs ou "Default", dans la moitié basse.
    // On exclut seulement la barre d'état tout en haut (< 13 %) — sinon un sélecteur
    // haut à l'écran perdait ses 1res lignes (« Default », « 6 »).
    const rows = words.filter(o => o.text && (/^\d{1,3}$/.test(o.text) || /^default$/i.test(o.text)) && o.cy > H * 0.13)
    if (rows.length) sawSheet = true
    hooks?.log?.(`👁 lu : ${rows.map(r => r.text).join(', ') || '(rien)'}`)
    // Cible visible ?
    const hit = rows.find(o => isDefault ? /^default$/i.test(o.text) : o.text === wanted)
    if (hit) {
      hooks?.log?.(`🎯 « ${wanted} » trouvé → double-tap (${hit.cx}, ${hit.cy})`)
      await sendAction(key, deviceId, { type: 'tap', x: hit.cx, y: hit.cy })
      await sleep(180)
      await sendAction(key, deviceId, { type: 'tap', x: hit.cx, y: hit.cy })
      return true
    }
    // Sens de scroll à partir des numéros lus.
    const nums = rows.map(r => (/^\d+$/.test(r.text) ? parseInt(r.text) : NaN)).filter(n => !isNaN(n))
    let dir = 1 // 1 = révéler vers le bas (numéros plus grands) ; -1 = vers le haut
    if (isDefault) dir = -1
    else if (wantedNum != null && nums.length) {
      const minV = Math.min(...nums), maxV = Math.max(...nums)
      if (wantedNum < minV) dir = -1
      else if (wantedNum > maxV) dir = 1
      else dir = lastDir || 1 // dans la plage mais OCR raté → même sens
    }
    lastDir = dir
    const x = Math.round(W * 0.5)
    const y1 = dir > 0 ? Math.round(H * 0.72) : Math.round(H * 0.45)
    const y2 = dir > 0 ? Math.round(H * 0.45) : Math.round(H * 0.72)
    hooks?.log?.(`↕ scroll ${dir > 0 ? 'bas' : 'haut'}…`)
    await sendAction(key, deviceId, { type: 'swipe', x1: x, y1, x2: x, y2, duration_ms: 450 })
    await sleep(750)
  }
  hooks?.log?.(sawSheet ? `❌ « ${wanted} » introuvable après ${maxSteps} essais` : '❌ sélecteur « Select Container » non détecté à l’écran')
  return false
}

// Tape l'icône Instagram sur l'écran d'accueil (repérée par OCR). C'est CE geste qui
// déclenche le sélecteur Crane — l'ouverture par open_url ne le déclenche pas.
// Cherche sur jusqu'à 3 pages d'accueil (swipe). true si tapé.
async function tapInstagramIcon(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  for (let page = 0; page < 3; page++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (!shot) { await sleep(700); continue }
    const { w: W, h: H } = await imgSize(shot)
    if (!W || !H) { await sleep(500); continue }
    // Libellé blanc sur fond varié → PAS de binarisation (elle effacerait le blanc).
    const words = await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'] })
    const ig = words.find(o => /instagram/i.test(o.text) || /^[il]nstagram$/i.test(o.text))
    if (ig) {
      const ty = Math.max(0, ig.cy - Math.round(H * 0.055)) // viser l'icône, bien au-dessus du libellé
      hooks?.log?.(`📸 icône Instagram repérée → tap (${ig.cx}, ${ty})`)
      await sendAction(key, deviceId, { type: 'tap', x: ig.cx, y: ty })
      return true
    }
    hooks?.log?.('🔎 Instagram pas sur cette page → page suivante')
    await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * 0.82), y1: Math.round(H * 0.6), x2: Math.round(W * 0.18), y2: Math.round(H * 0.6), duration_ms: 350 })
    await sleep(900)
  }
  return false
}

// ── Publication d'un Reel entièrement pilotée à la VISION ────────────────────
// Chemin (Instagram EN) validé sur captures : feed → + (haut-gauche) → REEL →
// 1re vignette (dernière vidéo uploadée) → Next → Next → légende → Share.
// Les 2 seuls éléments non-textuels (+ et 1re vignette) sont des ANCRES en
// fractions d'écran (iPhones identiques) ; tout le reste est trouvé par OCR et
// VÉRIFIÉ (si un bouton texte manque, on abandonne proprement — jamais de post raté).
const REEL_ANCHORS = {
  createPlus: { x: 0.07, y: 0.075 }, // bouton + création, haut-gauche du feed
  firstThumb: { x: 0.50, y: 0.40 },  // 1re vignette de la galerie = dernière vidéo
}

export async function postReelByVision(key: string, deviceId: string, opts: { caption?: string; anchors?: typeof REEL_ANCHORS }, hooks?: VisionHooks): Promise<boolean> {
  const A = opts.anchors ?? REEL_ANCHORS
  const shot0 = await snapshot(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible'); return false }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })

  // 1. Ouvrir le créateur (+ haut-gauche)
  hooks?.log?.('➕ Ouverture du créateur (+)…')
  await tapFrac(A.createPlus.x, A.createPlus.y)
  await sleep(2200)
  // 2. Passer en mode REEL (barre du bas POST STORY REEL LIVE)
  if (!await findTapText(key, deviceId, [/^reels?$/i], hooks, { label: 'REEL', minY: 0.78 })) return false
  await sleep(1600)
  // 3. Sélectionner la 1re vignette (= dernière vidéo uploadée)
  hooks?.log?.('🎞️ Sélection de la dernière vidéo…')
  await tapFrac(A.firstThumb.x, A.firstThumb.y)
  await sleep(1300)
  // 4. Next (apparaît une fois la vidéo sélectionnée) — si absent = vignette ratée → abandon
  if (!await findTapText(key, deviceId, [/^next$|suivant/i], hooks, { label: 'Next (après sélection)', minY: 0.75 })) return false
  await sleep(2600)
  // 5. Next (écran d'édition)
  if (!await findTapText(key, deviceId, [/^next$|suivant/i], hooks, { label: 'Next (édition)', minY: 0.75 })) return false
  await sleep(2600)
  // 6. Légende (facultatif) puis Share
  if (opts.caption && opts.caption.trim()) {
    hooks?.log?.('✏️ Saisie de la légende…')
    if (await findTapText(key, deviceId, [/caption|légende|write/i], hooks, { label: 'champ légende', maxY: 0.55 })) {
      await sleep(1000)
      await sendAction(key, deviceId, { type: 'text', text: opts.caption.trim() })
      await sleep(900)
      // Certaines versions ouvrent un éditeur plein écran avec OK/Done → on le valide si présent.
      await findTapText(key, deviceId, [/^ok$|^done$|^ok next$|terminé/i], hooks, { label: 'OK légende', tries: 2 })
      await sleep(700)
    }
  }
  if (!await findTapText(key, deviceId, [/^share$|partager/i], hooks, { label: 'Share', minY: 0.45 })) return false
  hooks?.log?.('📤 Reel partagé.')
  await sleep(3500)
  return true
}

// Ouvre Instagram (via l'icône → déclenche le sélecteur Crane) puis sélectionne le container.
export async function selectContainerByVision(key: string, deviceId: string, target: string, hooks?: VisionHooks): Promise<boolean> {
  hooks?.log?.('🏠 Retour à l’écran d’accueil…')
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1200)
  hooks?.log?.('📲 Recherche de l’icône Instagram…')
  const opened = await tapInstagramIcon(key, deviceId, hooks)
  if (!opened) { hooks?.log?.('❌ Icône Instagram introuvable sur l’accueil (mets-la sur la 1re page).'); return false }
  await sleep(2800) // laisse le sélecteur Crane apparaître
  return findAndTapContainer(key, deviceId, target, hooks)
}
