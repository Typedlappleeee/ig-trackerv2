// Automatisation iRemoTech par VISION : on lit l'écran (OCR) pour trouver le bon
// container Crane dans le sélecteur « Select Container » et taper dessus, en scrollant
// tout seul si besoin. Bien plus fiable que des coordonnées devinées : on VÉRIFIE
// ce qu'on voit avant de taper, et ça s'adapte au scroll.
import { snapshot, sendAction } from './iremotech'
import { ocrWords, findBlueButton } from './ocr'

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

// Rotation d'IP via le mode avion iRemoTech : ON → attente → OFF, puis on renvoie le
// OFF plusieurs fois en vérifiant la reconnexion (snapshot). Si iRemoTech pilote via
// un canal qui survit à l'avion, le OFF passe ; sinon on le signale clairement.
// Rotation d'IP en opérant le CENTRE DE CONTRÔLE (comme à la main) : on ouvre le CC
// (swipe depuis le coin haut-droit), on tape l'icône avion (ON), on attend 8 s, on
// re-tape l'icône (OFF), on ferme le CC, puis on laisse le réseau revenir. Les taps
// atteignent le device via iRemoTech (dont le contrôle survit à l'avion).
const AIRPLANE_ICON = { x: 0.155, y: 0.30 } // icône avion dans le Centre de contrôle (haut-gauche du bloc connectivité)

// Recalibrage du clic (bouton « Calibrate » de la section SYSTEM d'iRemoTech). À lancer
// au début de chaque automatisation pour que les taps tombent au bon endroit. Best-effort :
// si l'action n'est pas acceptée (nom différent côté API), on log et on continue.
export async function recalibrateTouch(key: string, deviceId: string, hooks?: VisionHooks): Promise<void> {
  hooks?.log?.('🎯 Recalibrage du clic (Calibrate)…')
  // On ne connaît pas le nom exact de l'action côté API iRemoTech → on essaie plusieurs
  // variantes plausibles et on garde la première acceptée. Best-effort (n'échoue jamais).
  const variants = [
    { type: 'recalibrate' }, { type: 'calibrate' }, { type: 'touch_calibrate' },
    { type: 'calibration' }, { type: 'press', name: 'calibrate' },
  ] as unknown as Parameters<typeof sendAction>[2][]
  try {
    for (const a of variants) {
      const ok = await sendAction(key, deviceId, a).catch(() => false)
      if (ok) { hooks?.log?.(`   ✓ recalibrage lancé (${JSON.stringify(a)})`); await sleep(4000); return }
    }
    hooks?.log?.('   ⚠ aucune action « calibrate » acceptée par l’API — on continue (dis-moi le nom exact).')
  } catch (e) {
    hooks?.log?.(`   ⚠ recalibrage ignoré (${e instanceof Error ? e.message : String(e)})`)
  }
}

export async function airplaneReset(key: string, deviceId: string, hooks?: VisionHooks, holdMs = 8000): Promise<void> {
  // Écran connu d'abord.
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1000)
  const shot = await snapshot(key, deviceId)
  const { w: W, h: H } = shot ? await imgSize(shot) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('⚠ écran illisible → mode avion sauté'); return }
  const tapIcon = () => sendAction(key, deviceId, { type: 'tap', x: Math.round(AIRPLANE_ICON.x * W), y: Math.round(AIRPLANE_ICON.y * H) })
  // 1. Ouvrir le Centre de contrôle (swipe du TOUT EN BAS vers le haut, franc et LENT).
  //    Retry : parfois le geste ne « prend » pas depuis le bord → on vérifie que l'accueil
  //    (icônes Instagram/Edits) a bien disparu, sinon on rebalaie.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (hooks?.shouldStop?.()) return
    hooks?.log?.(attempt === 0 ? '✈️ Ouverture du Centre de contrôle (swipe bas→haut)…' : `✈️ CC pas ouvert → nouvel essai (${attempt + 1}/3)…`)
    // Départ collé au bord bas, remontée longue, geste lent (iOS reconnaît mieux le tirage du bord).
    await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * 0.5), y1: Math.round(H) - 1, x2: Math.round(W * 0.5), y2: Math.round(H * 0.15), duration_ms: 950 })
    await sleep(1700)
    // Vérif : si on lit encore une icône d'accueil connue → le CC ne s'est pas ouvert.
    const chk = await snapshot(key, deviceId)
    if (!chk) break // pas de snapshot : on tente la suite quand même
    const w1 = await ocrWords(chk, undefined, { threshold: null, scale: 2, psms: ['11'] })
    const homeStill = w1.some(o => /instagram|edits|r[ée]glages|settings|app\s?store/i.test(o.text))
    if (!homeStill) break // accueil disparu → CC ouvert (ou autre écran) → on continue
    await sendAction(key, deviceId, { type: 'press', name: 'home' }); await sleep(800) // reset avant re-essai
  }
  // 2. Activer l'avion.
  hooks?.log?.('✈️ Mode avion ON…')
  await tapIcon()
  await sleep(holdMs) // 8 s en avion → l'IP tourne
  // 3. Désactiver l'avion (2e tap sur la même icône).
  hooks?.log?.('✈️ Mode avion OFF…')
  await tapIcon()
  await sleep(2000)
  // 4. Fermer le Centre de contrôle.
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(2500)
  // 5. Laisser le réseau revenir (vérif snapshot).
  for (let i = 0; i < 6; i++) {
    if (hooks?.shouldStop?.()) return
    const s = await snapshot(key, deviceId)
    if (s) { hooks?.log?.('   réseau rétabli ✓'); return }
    await sleep(3000)
  }
  hooks?.log?.('   (réseau pas encore confirmé, on continue)')
}

// Brique réutilisable : cherche à l'écran un bouton dont le TEXTE matche l'un des
// motifs (ex. /reel/i, /next|suivant/i, /share|partager/i) et tape dessus.
// Réessaie plusieurs fois (l'écran met parfois du temps à charger). true si tapé.
// Vrai si un texte matchant est présent à l'écran (SANS taper) — pour vérifier qu'on
// est sur le bon écran avant d'agir.
async function hasText(key: string, deviceId: string, patterns: RegExp[], hooks?: VisionHooks, opts?: { cropY?: [number, number]; tries?: number }): Promise<boolean> {
  const tries = opts?.tries ?? 3
  for (let i = 0; i < tries; i++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (shot) {
      const wa = await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'], cropY: opts?.cropY })
      const wb = await ocrWords(shot, undefined, { threshold: null, invert: true, scale: 2, psms: ['11'], cropY: opts?.cropY })
      if ([...wa, ...wb].some(o => patterns.some(p => p.test(o.text)))) return true
    }
    await sleep(700)
  }
  return false
}

export async function findTapText(
  key: string, deviceId: string, patterns: RegExp[], hooks?: VisionHooks,
  opts?: { tries?: number; label?: string; minY?: number; maxY?: number; minX?: number; maxX?: number; cropY?: [number, number] },
): Promise<boolean> {
  const tries = opts?.tries ?? 5
  const label = opts?.label ?? patterns.map(p => p.source).join('|')
  for (let i = 0; i < tries; i++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (!shot) { await sleep(600); continue }
    const { w: W, h: H } = await imgSize(shot)
    if (!W || !H) { await sleep(500); continue }
    // Lecture RECADRÉE sur la zone du bouton (cropY) → texte plus gros, sans le bruit
    // des vignettes ; en DOUBLE POLARITÉ (normale + inversée) → texte de n'importe
    // quelle couleur tant qu'il contraste (ex. « Next » blanc sur bouton bleu).
    const crop = opts?.cropY
    const sc = crop ? 3.5 : 2
    const wa = await ocrWords(shot, undefined, { threshold: null, scale: sc, psms: ['11'], cropY: crop })
    const wb = await ocrWords(shot, undefined, { threshold: null, invert: true, scale: sc, psms: ['11'], cropY: crop })
    const words = [...wa, ...wb]
    const minY = (opts?.minY ?? 0) * H, maxY = (opts?.maxY ?? 1) * H
    const minX = (opts?.minX ?? 0) * W, maxX = (opts?.maxX ?? 1) * W
    const hit = words.find(o => o.cy >= minY && o.cy <= maxY && o.cx >= minX && o.cx <= maxX && patterns.some(p => p.test(o.text)))
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

// Ferme les popups Instagram fréquents qui bloquent le flux (« Not now », « OK »,
// « Skip », notifications, « Add to your story »…). Balayage léger, sans échec.
export async function dismissPopups(key: string, deviceId: string, hooks?: VisionHooks): Promise<void> {
  const found = await findTapText(
    key, deviceId,
    [/^not now$/i, /^plus tard$/i, /^pas maintenant$/i, /^skip$/i, /^ignorer$/i, /^cancel$/i, /^annuler$/i, /^dismiss$/i],
    hooks, { label: 'popup', tries: 1 },
  )
  if (found) { hooks?.log?.('   (popup fermé)'); await sleep(1200) }
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

// Tape l'icône d'une app sur l'écran d'accueil (libellé repéré par OCR). C'est CE geste
// qui déclenche le sélecteur Crane — l'ouverture par open_url ne le déclenche pas.
// Cherche sur jusqu'à 3 pages d'accueil (swipe). true si tapé.
async function tapAppIcon(
  key: string, deviceId: string,
  matcher: (t: string) => boolean, label: string,
  hooks?: VisionHooks,
): Promise<boolean> {
  for (let page = 0; page < 3; page++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (!shot) { await sleep(700); continue }
    const { w: W, h: H } = await imgSize(shot)
    if (!W || !H) { await sleep(500); continue }
    // Libellé blanc sur fond varié → PAS de binarisation (elle effacerait le blanc).
    const words = await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'] })
    const hit = words.find(o => matcher(o.text))
    if (hit) {
      const ty = Math.max(0, hit.cy - Math.round(H * 0.055)) // viser l'icône, bien au-dessus du libellé
      hooks?.log?.(`📸 icône ${label} repérée → tap (${hit.cx}, ${ty})`)
      await sendAction(key, deviceId, { type: 'tap', x: hit.cx, y: ty })
      return true
    }
    hooks?.log?.(`🔎 ${label} pas sur cette page → page suivante`)
    await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * 0.82), y1: Math.round(H * 0.6), x2: Math.round(W * 0.18), y2: Math.round(H * 0.6), duration_ms: 350 })
    await sleep(900)
  }
  return false
}

async function tapInstagramIcon(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  return tapAppIcon(key, deviceId, t => /instagram/i.test(t) || /^[il]nstagram$/i.test(t), 'Instagram', hooks)
}

// ── Publication d'un Reel entièrement pilotée à la VISION ────────────────────
// Chemin (Instagram EN) validé sur captures : feed → + (haut-gauche) → REEL →
// 1re vignette (dernière vidéo uploadée) → Next → Next → légende → Share.
// Les 2 seuls éléments non-textuels (+ et 1re vignette) sont des ANCRES en
// fractions d'écran (iPhones identiques) ; tout le reste est trouvé par OCR et
// VÉRIFIÉ (si un bouton texte manque, on abandonne proprement — jamais de post raté).
const REEL_ANCHORS = {
  createPlus: { x: 0.07, y: 0.06 },  // bouton + création, haut-gauche du feed
  galleryThumb: { x: 0.09, y: 0.93 }, // vignette galerie en bas-GAUCHE de la caméra
  firstThumb: { x: 0.50, y: 0.40 },  // 1re vignette de la galerie = dernière vidéo
  nextBtn: { x: 0.85, y: 0.93 },     // bouton Next → bas-droite (position fixe, tels identiques)
  shareBtn: { x: 0.85, y: 0.93 },    // bouton Share → bas-droite
  captionField: { x: 0.35, y: 0.57 }, // champ « Add a caption » (milieu-gauche)
  okBtn: { x: 0.92, y: 0.095 },        // bouton « OK » de l'éditeur de légende (haut-droite)
}

// Tape un bouton : cherche son TEXTE (vision) et, à défaut, tape sa position connue
// (ancre). Ne bloque jamais tant que la position est fiable (iPhones identiques).
async function tapButton(
  key: string, deviceId: string, patterns: RegExp[], anchor: { x: number; y: number },
  W: number, H: number, hooks?: VisionHooks, cropY?: [number, number], label?: string, tries = 3,
  blueX?: [number, number],
): Promise<boolean> {
  const lab = label ?? patterns[0].source
  // 1. Vision : lire le texte du bouton (plusieurs essais → tolère un affichage lent).
  //    minX : si le bouton est connu à droite (Next/Share), on ignore les textes de
  //    gauche (ex. « First draft ») pour ne jamais taper à côté.
  const minX = blueX ? blueX[0] : undefined
  if (await findTapText(key, deviceId, patterns, hooks, { label: lab, tries, cropY, minX })) return true
  // 2. Couleur : le bouton d'action Instagram est BLEU (Next/Share) — les outils sont gris.
  const shot = await snapshot(key, deviceId)
  if (shot) {
    const blue = await findBlueButton(shot, cropY ? cropY[0] : 0.6, cropY ? cropY[1] : 1, blueX ? blueX[0] : 0, blueX ? blueX[1] : 1)
    if (blue) {
      hooks?.log?.(`🔵 « ${lab} » : bouton bleu détecté → tap (${blue.cx}, ${blue.cy})`)
      await sendAction(key, deviceId, { type: 'tap', x: blue.cx, y: blue.cy })
      return true
    }
  }
  // 3. Non détecté. Si le bouton est un bouton d'action connu en BAS-DROITE (blueX fourni,
  //    ex. Next/Share), on tape sa POSITION CONNUE en dernier recours : cette position est
  //    sous la rangée d'outils et à droite de « First draft » → aucun risque de mauvais bouton.
  if (blueX) {
    const ax = Math.round(anchor.x * W), ay = Math.round(anchor.y * H)
    hooks?.log?.(`↳ « ${lab} » non lu → tap position connue (${ax}, ${ay})`)
    await sendAction(key, deviceId, { type: 'tap', x: ax, y: ay })
    return true
  }
  // Sinon (bouton sans position fiable) on n'appuie pas à l'aveugle.
  void W; void H
  hooks?.log?.(`❌ « ${lab} » non détecté`)
  return false
}

// Tape un bouton d'action bas-droite (Next/Share) PUIS vérifie qu'on a bien changé
// d'écran : les repères `stillHere` de l'écran courant doivent DISPARAÎTRE. Réessaie
// en décalant légèrement le tap de secours (couvre un petit décalage de calibration).
async function tapAdvance(
  key: string, deviceId: string, patterns: RegExp[], base: { x: number; y: number },
  W: number, H: number, stillHere: RegExp[], hooks?: VisionHooks, label = 'Next', tries = 4,
): Promise<boolean> {
  const dx = [0, 0.03, -0.03, 0.06], dy = [0, -0.01, -0.02, 0]
  for (let t = 0; t < tries; t++) {
    if (hooks?.shouldStop?.()) return false
    const anchor = { x: base.x + dx[t % dx.length], y: base.y + dy[t % dy.length] }
    await tapButton(key, deviceId, patterns, anchor, W, H, hooks, [0.80, 1], t ? `${label} (essai ${t + 1})` : label, 2, [0.5, 1])
    await sleep(2600)
    // Toujours sur le même écran ? (repères encore lisibles → le tap n'a pas fait avancer)
    if (!await hasText(key, deviceId, stillHere, hooks, { cropY: [0.72, 1], tries: 1 })) {
      hooks?.log?.(`   ✓ ${label} : passé à l'écran suivant`)
      return true
    }
    hooks?.log?.(`   ↻ ${label} n'a pas fait avancer → réessai (position ajustée)`)
  }
  hooks?.log?.(`❌ ${label} : impossible d'avancer après ${tries} essais`)
  return false
}

// Sélectionne un mode dans le bandeau du bas (POST STORY INSTANTS REEL LIVE). Si le
// mode voulu n'est pas visible, scrolle le bandeau HORIZONTALEMENT jusqu'à le trouver.
async function selectMode(key: string, deviceId: string, patterns: RegExp[], label: string, hooks?: VisionHooks): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    if (hooks?.shouldStop?.()) return false
    if (await findTapText(key, deviceId, patterns, hooks, { label, minY: 0.72, tries: 2, cropY: [0.78, 1] })) return true
    const shot = await snapshot(key, deviceId)
    const { w: W, h: H } = shot ? await imgSize(shot) : { w: 0, h: 0 }
    if (!W || !H) { await sleep(600); continue }
    // La barre des modes (POST STORY INSTANTS REEL LIVE) est TOUT EN BAS (~91 % de
    // hauteur). On balaie exactement à ce niveau — plus haut, on scrolle l'aperçu / le
    // carrousel d'effets (rien ne bouge dans la barre des modes).
    hooks?.log?.(`↔ scroll du bandeau des modes pour trouver ${label}…`)
    await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * 0.82), y1: Math.round(H * 0.91), x2: Math.round(W * 0.25), y2: Math.round(H * 0.91), duration_ms: 350 })
    await sleep(900)
  }
  hooks?.log?.(`❌ mode ${label} introuvable`)
  return false
}

export async function postReelByVision(key: string, deviceId: string, opts: { caption?: string; anchors?: typeof REEL_ANCHORS }, hooks?: VisionHooks): Promise<boolean> {
  const A = opts.anchors ?? REEL_ANCHORS
  const shot0 = await snapshot(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible'); return false }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })

  // 0. Ferme un éventuel popup avant de commencer (sinon il bloque le tap du +).
  await dismissPopups(key, deviceId, hooks)
  // 1. Ouvrir le créateur (+ haut-gauche)
  hooks?.log?.('➕ Ouverture du créateur (+)…')
  await tapFrac(A.createPlus.x, A.createPlus.y)
  await sleep(2200)
  // 2. Passer en mode REEL (bandeau du bas POST STORY INSTANTS REEL LIVE) — scroll si besoin.
  if (!await selectMode(key, deviceId, [/reels?/i], 'REEL', hooks)) return false
  await sleep(1600)
  // 3. Ouvrir la galerie : la caméra Reel affiche une vignette en BAS-GAUCHE — c'est ELLE
  //    qu'on tape (pas le centre de l'écran, qui n'est que l'aperçu caméra).
  hooks?.log?.('🖼 Ouverture de la galerie (bas-gauche)…')
  await tapFrac(A.galleryThumb.x, A.galleryThumb.y)
  await sleep(1800)
  // 4. Sélectionner la 1re vignette (= dernière vidéo uploadée)
  hooks?.log?.('🎞️ Sélection de la dernière vidéo…')
  await tapFrac(A.firstThumb.x, A.firstThumb.y)
  await sleep(1800)
  // 4. Next (après sélection) : vision → bouton bleu. Si non détecté → on abandonne ce
  //    container (l'appelant passera au suivant en recommençant le cycle).
  if (!await tapButton(key, deviceId, [/next|suivant/i], A.nextBtn, W, H, hooks, [0.80, 1], 'Next (après sélection)', 3, [0.5, 1])) return false
  hooks?.log?.('   ⏳ chargement de la vidéo dans l’éditeur…')
  await sleep(5000) // laisse l'éditeur charger la vidéo (sinon aperçu gris)
  // 5. Next (écran d'édition) — AUTO-VÉRIFIÉ : on tape puis on contrôle que les outils
  //    d'édition (Overlay / Edit video) ont disparu ; sinon on retape (position ajustée).
  if (!await tapAdvance(key, deviceId, [/next|suivant/i], A.nextBtn, W, H, [/overlay/i, /edit\s?video/i], hooks, 'Next (édition)')) return false
  await sleep(3000)
  // 6. Légende : taper « Add a caption » ouvre un éditeur plein écran → écrire → valider « OK » (haut-droite).
  if (opts.caption && opts.caption.trim()) {
    hooks?.log?.('✏️ Saisie de la légende…')
    await tapFrac(A.captionField.x, A.captionField.y)
    await sleep(1400) // laisse l'éditeur de légende s'ouvrir
    await sendAction(key, deviceId, { type: 'text', text: opts.caption.trim() })
    await sleep(900)
    hooks?.log?.('   validation « OK »…')
    await tapButton(key, deviceId, [/^ok$/i], A.okBtn, W, H, hooks, [0, 0.14], 'OK légende')
    await sleep(1400)
  }
  // 7. Publier : « Share » direct, sinon un « Next » intermédiaire puis « Share ».
  //    Si Share n'est jamais détecté → on abandonne (container suivant).
  if (await findTapText(key, deviceId, [/share|partager/i], hooks, { label: 'Share', tries: 3, cropY: [0.85, 1], minX: 0.5 })) {
    hooks?.log?.('📤 Reel partagé.')
  } else {
    hooks?.log?.('   pas de Share direct → Next intermédiaire puis Share')
    if (!await tapButton(key, deviceId, [/next|suivant/i], A.nextBtn, W, H, hooks, [0.85, 1], 'Next (avant Share)', 3, [0.5, 1])) return false
    await sleep(2600)
    if (!await tapButton(key, deviceId, [/share|partager/i], A.shareBtn, W, H, hooks, [0.85, 1], 'Share', 3, [0.5, 1])) return false
    hooks?.log?.('📤 Reel partagé.')
  }
  await sleep(4000) // laisse le partage se finaliser
  await dismissPopups(key, deviceId, hooks) // ferme une éventuelle fenêtre post-partage (pas toujours là)
  hooks?.log?.('🏠 Retour à l’accueil.')
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1200)
  return true
}

// ── Création de compte Instagram pilotée à la VISION (début du flow) ────────────
// Écrans (Instagram EN) : « Join Instagram » → Get started → « What's your mobile
// number? » → Change (pays) → recherche « United » → United Kingdom → (si numéro
// fourni) saisie du numéro + Next. Le numéro viendra d'une API SIM (5sim) branchée
// plus tard : tant qu'aucun numéro n'est fourni, on s'arrête après le choix du pays.
export interface CreateAccountOpts {
  phoneNumber?: string        // numéro fourni par l'API SIM (sans indicatif si UK déjà sélectionné)
  searchTerm?: string         // terme tapé dans la recherche pays (défaut « United »)
  countryLabel?: RegExp       // mot distinctif du pays à cocher (défaut /kingdom/i)
  countryY?: number           // fraction de hauteur du pays dans les résultats (fallback si OCR rate)
}
export async function createInstagramAccountByVision(
  key: string, deviceId: string, opts: CreateAccountOpts, hooks?: VisionHooks,
): Promise<{ ok: boolean; stage: string }> {
  const searchTerm = opts.searchTerm ?? 'United'
  const countryLabel = opts.countryLabel ?? /kingdom/i
  const shot0 = await snapshot(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible'); return { ok: false, stage: 'snapshot' } }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })

  // 1. Écran « Join Instagram » → bouton bleu « Get started ».
  // NB : l'OCR renvoie les mots SÉPARÉS → on matche un mot distinctif isolé (« started »),
  // pas la chaîne « get started » (qui ne matcherait aucun mot seul).
  hooks?.log?.('🆕 Création de compte : « Get started »…')
  // On vérifie d'abord qu'on est bien sur l'écran « Join Instagram » (mot « Instagram »
  // OU le bouton), sinon inutile de taper à l'aveugle.
  const onJoin = await hasText(key, deviceId, [/instagram/i, /^started$/i], hooks, { tries: 5 })
  if (!onJoin) {
    hooks?.log?.('❌ Écran « Join Instagram » non détecté (container déjà connecté ?).')
    return { ok: false, stage: 'get_started' }
  }
  // « started » n'est QUE sur le bouton (« get » traîne dans « who get you » plus haut) ;
  // on restreint aussi à la moitié basse pour ne jamais taper le texte de description.
  if (!await findTapText(key, deviceId, [/^started$/i, /^s.?inscrire$/i, /commencer/i], hooks, { label: 'Get started', tries: 3, minY: 0.6 })) {
    hooks?.log?.('   « Get started » non lu → tap position connue (bouton bleu ~80%).')
    await tapFrac(0.5, 0.80)
  }
  await sleep(2800)

  // 2. Écran « What's your mobile number? » → lien bleu « Change » (choix du pays).
  await hasText(key, deviceId, [/mobile/i, /^number$/i], hooks, { tries: 4 })
  hooks?.log?.('🌍 Ouverture du choix de pays : « Change »…')
  if (!await findTapText(key, deviceId, [/^change$/i, /^changer$/i], hooks, { label: 'Change', tries: 5, minY: 0.08, maxY: 0.5 })) {
    hooks?.log?.('❌ « Change » introuvable')
    return { ok: false, stage: 'change' }
  }
  await sleep(2200)

  // 3. Écran « Select a country » → barre de recherche → taper le terme.
  hooks?.log?.(`🔎 Recherche du pays « ${searchTerm} »…`)
  // Barre de recherche : DOUBLE-tap de sa position (sous le titre « Select a country »,
  // ~18% de hauteur) — un simple tap posait le curseur sans focus le champ.
  await tapFrac(0.5, 0.18); await sleep(200); await tapFrac(0.5, 0.18)
  await sleep(1200)
  await sendAction(key, deviceId, { type: 'text', text: searchTerm })
  await sleep(1900)

  // 4. Cocher le pays (mot distinctif : « Kingdom » / « States »).
  hooks?.log?.('🌍 Sélection du pays…')
  if (!await findTapText(key, deviceId, [countryLabel], hooks, { label: 'pays', tries: 5, maxY: 0.7 })) {
    // Repli : les résultats de « United » sont ordonnés (Arab Emirates, Kingdom, States).
    const fy = opts.countryY ?? 0.29
    hooks?.log?.(`   pays non lu → tap position connue (0.4, ${fy}).`)
    await tapFrac(0.4, fy)
  }
  await sleep(2200)

  // 5. Saisie du numéro si l'API SIM l'a fourni ; sinon on s'arrête (prêt pour le numéro).
  if (!opts.phoneNumber) {
    hooks?.log?.('⏸ Pays réglé sur UK. En attente d’un numéro (API SIM) pour continuer.')
    return { ok: true, stage: 'ready_for_number' }
  }
  hooks?.log?.('📱 Saisie du numéro de mobile…')
  // Champ de saisie : PAS d'OCR (« number » traîne dans le titre) → DOUBLE-tap direct de
  // la position connue du champ (~31%) pour bien le focus.
  await tapFrac(0.5, 0.31); await sleep(200); await tapFrac(0.5, 0.31)
  await sleep(1000)
  await sendAction(key, deviceId, { type: 'text', text: opts.phoneNumber })
  await sleep(1200)
  // Bouton bleu « Next » (centré, au-dessus de « Sign up with email »).
  if (!await tapButton(key, deviceId, [/^next$/i, /^suivant$/i], { x: 0.5, y: 0.62 }, W, H, hooks, [0.45, 0.9], 'Next (numéro)', 3, [0, 1])) {
    hooks?.log?.('❌ « Next » (numéro) non détecté')
    return { ok: false, stage: 'next_number' }
  }
  hooks?.log?.('✅ Numéro soumis — en attente du code SMS.')
  return { ok: true, stage: 'number_submitted' }
}

// Saisit le code SMS reçu (écran « Enter the confirmation code ») puis valide.
export async function enterSmsCodeByVision(key: string, deviceId: string, code: string, hooks?: VisionHooks): Promise<boolean> {
  const shot0 = await snapshot(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible (code)'); return false }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })
  hooks?.log?.(`🔢 Saisie du code SMS (${code})…`)
  // Vérifie qu'on est bien sur l'écran de code (best-effort).
  await hasText(key, deviceId, [/confirmation/i, /^code$/i, /^enter$/i], hooks, { tries: 4 })
  // Champ de code : PAS d'OCR (« code » traîne dans le titre) → DOUBLE-tap direct de la
  // position connue du champ (~30%). Ajuste-moi ce chiffre si besoin sur capture.
  await tapFrac(0.5, 0.30); await sleep(200); await tapFrac(0.5, 0.30)
  await sleep(900)
  await sendAction(key, deviceId, { type: 'text', text: code })
  await sleep(1300)
  // Bouton bleu « Next » / « Confirm ».
  if (!await tapButton(key, deviceId, [/^next$/i, /^suivant$/i, /confirm/i, /^done$/i], { x: 0.5, y: 0.62 }, W, H, hooks, [0.4, 0.95], 'Valider code', 3, [0, 1])) {
    hooks?.log?.('⚠ bouton de validation du code non détecté')
    return false
  }
  hooks?.log?.('✅ Code soumis.')
  return true
}

// ── Publication d'une STORY pilotée à la VISION (base — flow lien à compléter) ──
// Chemin (Instagram EN) d'après captures : (+ créateur) → mode STORY → galerie
// (vignette bas-gauche) → 1re vidéo (dernière uploadée) → Done (haut-droite) →
// icône sticker (droite) → [sticker lien + partage — à venir].
const STORY_ANCHORS = {
  galleryThumb: { x: 0.09, y: 0.95 }, // vignette galerie en bas-gauche du story camera
  firstThumb: { x: 0.50, y: 0.40 },   // 1re vidéo de la galerie (dernière uploadée)
  doneBtn: { x: 0.87, y: 0.12 },      // « Done » haut-droite (après sélection vidéo)
  stickerIcon: { x: 0.91, y: 0.16 },  // icône « sticker » (tout à droite, 2e du haut sous Aa)
  searchBar: { x: 0.5, y: 0.18 },     // barre de recherche du tiroir stickers
  urlField: { x: 0.5, y: 0.21 },      // champ URL de « Add link »
  customText: { x: 0.5, y: 0.35 },    // « Customize sticker text »
  linkDone: { x: 0.88, y: 0.10 },      // « Done » de « Add link » (haut-droite, ligne du titre)
  stickerFrom: { x: 0.5, y: 0.43 },   // position initiale du sticker lien
  stickerTo: { x: 0.72, y: 0.68 },    // cible : bas-droite, mais AU-DESSUS de la zone légende/boutons
  shareArrow: { x: 0.87, y: 0.93 },   // flèche bleue de partage (bas-droite)
  shareSheet: { x: 0.5, y: 0.93 },    // bouton « Share » de la feuille de partage (bas, pleine largeur)
}

export async function postStoryByVision(key: string, deviceId: string, opts: { caption?: string; link?: string; anchors?: typeof STORY_ANCHORS }, hooks?: VisionHooks): Promise<boolean> {
  const A = opts.anchors ?? STORY_ANCHORS
  const shot0 = await snapshot(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible'); return false }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })

  await dismissPopups(key, deviceId, hooks)
  // 1. Ouvrir le créateur (+ haut-gauche) — même point d'entrée que le Reel.
  hooks?.log?.('➕ Ouverture du créateur (+)…')
  await tapFrac(REEL_ANCHORS.createPlus.x, REEL_ANCHORS.createPlus.y)
  await sleep(2200)
  // 2. Mode STORY (bandeau du bas).
  if (!await selectMode(key, deviceId, [/story|stories/i], 'STORY', hooks)) return false
  await sleep(1600)
  // 3. Ouvrir la galerie (vignette bas-gauche du story camera).
  hooks?.log?.('🖼️ Ouverture de la galerie…')
  await tapFrac(A.galleryThumb.x, A.galleryThumb.y)
  await sleep(1800)
  // 4. Sélectionner la 1re vidéo/photo (dernière uploadée).
  hooks?.log?.('🎞️ Sélection du dernier média…')
  await tapFrac(A.firstThumb.x, A.firstThumb.y)
  await sleep(3500) // laisse le média se charger (le « Done » apparaît ensuite)
  // 5. Done (haut-droite) — si absent, on saute juste l'étape et on continue (des fois il n'y en a pas).
  if (!await tapButton(key, deviceId, [/^done$|terminé/i], A.doneBtn, W, H, hooks, [0, 0.16], 'Done', 6)) hooks?.log?.('   (pas de Done → on continue)')
  await sleep(2600)
  // 6. Icône sticker (côté droit) → ouvre le tiroir des stickers.
  hooks?.log?.('🔖 Ouverture des stickers…')
  await tapFrac(A.stickerIcon.x, A.stickerIcon.y)
  await sleep(1600)
  if (!opts.link || !opts.link.trim()) { hooks?.log?.('⚠ Aucun lien fourni pour la story.'); return false }

  // 7. Recherche → « link ».
  if (!await findTapText(key, deviceId, [/search|rechercher/i], hooks, { label: 'Search', maxY: 0.3, tries: 3 })) {
    await tapFrac(A.searchBar.x, A.searchBar.y) // repli : tap la barre de recherche
  }
  await sleep(1000)
  await sendAction(key, deviceId, { type: 'text', text: 'link' })
  await sleep(1400)
  // 8. Sticker « Link » : OCR recadré serré sur la ligne « Stickers » (exclut GIPHY),
  //    sinon POSITION connue (après recherche « link » le bouton est toujours au même
  //    endroit) → ne bloque plus.
  if (!await findTapText(key, deviceId, [/^link$/i], hooks, { label: 'sticker Link', cropY: [0.16, 0.30], tries: 4 })) {
    hooks?.log?.('   « Link » non lu → position connue (centre de la ligne Stickers)')
    await tapFrac(0.45, 0.235)
  }
  await sleep(1600)
  // 8b. VÉRIF : on doit être sur l'écran « Add link » (marqueurs mono-mot : URL / Customize /
  //     Cancel). Sinon (le sticker Link a raté) on n'écrit PAS l'URL.
  if (!await hasText(key, deviceId, [/^url$/i, /customize/i, /^cancel$/i], hooks, { cropY: [0, 0.4], tries: 4 })) {
    hooks?.log?.('❌ écran « Add link » non atteint → on abandonne le container')
    return false
  }
  // 9. Saisir l'URL — le champ URL est déjà focus à l'ouverture, on tape directement.
  hooks?.log?.('🔗 Saisie de l’URL…')
  await sendAction(key, deviceId, { type: 'text', text: opts.link.trim() })
  await sleep(900)
  // 10. Texte du sticker (facultatif) via « Customize sticker text ».
  if (opts.caption && opts.caption.trim()) {
    if (await findTapText(key, deviceId, [/customize|sticker text/i], hooks, { label: 'Customize sticker text', tries: 3 })) {
      await sleep(1200)
      await sendAction(key, deviceId, { type: 'text', text: opts.caption.trim() })
      await sleep(800)
    }
  }
  // 11. Done de « Add link » : on a DÉJÀ vérifié l'écran (8b) et le bouton est toujours
  //     en haut-droite → on tape sa position directement (fiable, sans OCR capricieux).
  hooks?.log?.('✅ Validation « Done » (haut-droite)…')
  await tapFrac(A.linkDone.x, A.linkDone.y)
  await sleep(2200)
  // 12. Glisser le sticker (placé au CENTRE par défaut) vers le bas-droite — un seul
  //     swipe continu (doigt qui reste appuyé), depuis le milieu de l'écran.
  hooks?.log?.('✋ Glissement du sticker (centre → bas-droite)…')
  const fromX = Math.round(0.5 * W), fromY = Math.round(0.45 * H)
  const toX = Math.round(A.stickerTo.x * W), toY = Math.round(A.stickerTo.y * H)
  await sendAction(key, deviceId, { type: 'swipe', x1: fromX, y1: fromY, x2: toX, y2: toY, duration_ms: 1400 })
  await sleep(1800)
  // 13. Flèche bleue (bas-droite) → ouvre la feuille de partage.
  const shot2 = await snapshot(key, deviceId)
  let arrowTapped = false
  if (shot2) {
    const blue = await findBlueButton(shot2, 0.85, 1)
    if (blue) { hooks?.log?.(`🔵 flèche de partage → tap (${blue.cx}, ${blue.cy})`); await sendAction(key, deviceId, { type: 'tap', x: blue.cx, y: blue.cy }); arrowTapped = true }
  }
  if (!arrowTapped) { hooks?.log?.('   flèche bleue non lue → position connue'); await tapFrac(A.shareArrow.x, A.shareArrow.y) }
  await sleep(2200)
  // 14. Bouton « Share » de la feuille (bas, bleu, pleine largeur).
  if (!await tapButton(key, deviceId, [/^share$|partager/i], A.shareSheet, W, H, hooks, [0.80, 1], 'Share (feuille)')) return false
  hooks?.log?.('📤 Story partagée.')
  await sleep(3500)
  // Parfois une feuille « Also share to » apparaît après le partage → taper « Done ».
  if (await findTapText(key, deviceId, [/^done$/i], hooks, { label: 'Done (Also share to)', cropY: [0.82, 1], tries: 3 })) {
    hooks?.log?.('   feuille « Also share to » → Done')
    await sleep(1800)
  } else {
    // Repli : le « Done » est un gros bouton bleu en bas.
    const s = await snapshot(key, deviceId)
    if (s) { const blue = await findBlueButton(s, 0.82, 1); if (blue) { hooks?.log?.('   « Done » (bouton bleu bas) → tap'); await sendAction(key, deviceId, { type: 'tap', x: blue.cx, y: blue.cy }); await sleep(1800) } }
  }
  await dismissPopups(key, deviceId, hooks) // autre popup éventuel
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1200)
  return true
}

// Ferme Instagram via le multitâche : accueil → ouvre l'app switcher → REPÈRE la carte
// « Instagram » (par son nom, OCR) et balaie CELLE-LÀ vers le haut → accueil. Ne ferme
// jamais une autre appli. Force Crane à re-proposer le container au prochain lancement.
export async function closeInstagram(key: string, deviceId: string, hooks?: VisionHooks): Promise<void> {
  hooks?.log?.('🚪 Fermeture d’Instagram…')
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1300)
  let shot = await snapshot(key, deviceId)
  const { w: W, h: H } = shot ? await imgSize(shot) : { w: 0, h: 0 }
  if (!W || !H) { return }
  const cx = Math.round(W * 0.5)
  // 1) Ouvre l'app switcher : swipe LENT depuis le tout bas jusqu'au milieu (Face ID).
  await sendAction(key, deviceId, { type: 'swipe', x1: cx, y1: Math.round(H * 0.995), x2: cx, y2: Math.round(H * 0.45), duration_ms: 1400 })
  await sleep(2000)
  // 2) Repère la carte « Instagram » par son nom (double polarité) → balaie CELLE-LÀ.
  shot = await snapshot(key, deviceId)
  let swx = cx // repli : carte centrale (IG est normalement la plus récente)
  if (shot) {
    const wa = await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'] })
    const wb = await ocrWords(shot, undefined, { threshold: null, invert: true, scale: 2, psms: ['11'] })
    const ig = [...wa, ...wb].find(o => /instagram/i.test(o.text) || /^[il]nstagram$/i.test(o.text))
    if (ig) { swx = ig.cx; hooks?.log?.(`   carte Instagram repérée (x=${swx}) → balayage`) }
    else hooks?.log?.('   nom « Instagram » non lu → carte centrale (la plus récente)')
  }
  await sendAction(key, deviceId, { type: 'swipe', x1: swx, y1: Math.round(H * 0.55), x2: swx, y2: Math.round(H * 0.08), duration_ms: 400 })
  await sleep(1200)
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(900)
}

// Échauffement « Edits » avant chaque cycle : ouvre l'app Edits (même conteneur que
// l'IG à publier, via le sélecteur Crane), tape le 1er projet (le plus récent, en haut
// à gauche) puis revient à l'accueil. Best-effort : ne bloque JAMAIS le posting si Edits
// échoue — on log et on continue vers Instagram.
const EDITS_FIRST_PROJECT = { x: 0.20, y: 0.23 } // vignette du 1er projet (haut-gauche)
export async function warmupEditsByVision(key: string, deviceId: string, target: string, hooks?: VisionHooks): Promise<boolean> {
  try {
    hooks?.log?.('🎬 Échauffement Edits…')
    await sendAction(key, deviceId, { type: 'press', name: 'home' })
    await sleep(1200)
    hooks?.log?.('📲 Recherche de l’icône Edits…')
    const opened = await tapAppIcon(key, deviceId, t => /^edits$/i.test(t) || /^[el]dits$/i.test(t), 'Edits', hooks)
    if (!opened) { hooks?.log?.('⚠ icône Edits introuvable — on passe directement à Instagram.'); return false }
    await sleep(2800) // laisse le sélecteur Crane apparaître
    const inContainer = await findAndTapContainer(key, deviceId, target, hooks)
    if (!inContainer) { hooks?.log?.('⚠ conteneur Edits non sélectionné — on passe à Instagram.'); await sendAction(key, deviceId, { type: 'press', name: 'home' }); return false }
    await sleep(3500) // laisse la liste des projets s’afficher
    const shot = await snapshot(key, deviceId)
    const { w: W, h: H } = shot ? await imgSize(shot) : { w: 0, h: 0 }
    if (W && H) {
      const x = Math.round(W * EDITS_FIRST_PROJECT.x), y = Math.round(H * EDITS_FIRST_PROJECT.y)
      hooks?.log?.(`🖼 ouverture du 1er projet Edits → tap (${x}, ${y})`)
      await sendAction(key, deviceId, { type: 'tap', x, y })
      await sleep(2500)
    }
    hooks?.log?.('🏠 Retour à l’accueil (fin échauffement Edits).')
    await sendAction(key, deviceId, { type: 'press', name: 'home' })
    await sleep(1200)
    return true
  } catch (e) {
    hooks?.log?.(`⚠ échauffement Edits ignoré (${e instanceof Error ? e.message : String(e)}).`)
    try { await sendAction(key, deviceId, { type: 'press', name: 'home' }) } catch { /* noop */ }
    return false
  }
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
