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

export async function airplaneReset(key: string, deviceId: string, hooks?: VisionHooks, holdMs = 8000): Promise<void> {
  // Écran connu d'abord.
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1000)
  const shot = await snapshot(key, deviceId)
  const { w: W, h: H } = shot ? await imgSize(shot) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('⚠ écran illisible → mode avion sauté'); return }
  const tapIcon = () => sendAction(key, deviceId, { type: 'tap', x: Math.round(AIRPLANE_ICON.x * W), y: Math.round(AIRPLANE_ICON.y * H) })
  // 1. Ouvrir le Centre de contrôle (swipe du TOUT EN BAS vers le haut, franc).
  hooks?.log?.('✈️ Ouverture du Centre de contrôle (swipe bas→haut)…')
  await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * 0.5), y1: Math.round(H * 0.999), x2: Math.round(W * 0.5), y2: Math.round(H * 0.22), duration_ms: 750 })
  await sleep(1800)
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
  opts?: { tries?: number; label?: string; minY?: number; maxY?: number; cropY?: [number, number] },
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
  createPlus: { x: 0.07, y: 0.06 },  // bouton + création, haut-gauche du feed
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
): Promise<boolean> {
  const lab = label ?? patterns[0].source
  // 1. Vision : lire le texte du bouton (plusieurs essais → tolère un affichage lent).
  if (await findTapText(key, deviceId, patterns, hooks, { label: lab, tries, cropY })) return true
  // 2. Couleur : le bouton d'action Instagram est BLEU (Next/Share) — les outils sont gris.
  const shot = await snapshot(key, deviceId)
  if (shot) {
    const blue = await findBlueButton(shot, cropY ? cropY[0] : 0.6, cropY ? cropY[1] : 1)
    if (blue) {
      hooks?.log?.(`🔵 « ${lab} » : bouton bleu détecté → tap (${blue.cx}, ${blue.cy})`)
      await sendAction(key, deviceId, { type: 'tap', x: blue.cx, y: blue.cy })
      return true
    }
  }
  // 3. Non détecté : on N'APPUIE PAS à l'aveugle (risque de taper le mauvais bouton).
  //    On renvoie false — l'appelant décide (sauter l'étape OU passer au container suivant).
  void anchor; void W; void H
  hooks?.log?.(`❌ « ${lab} » non détecté`)
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
    hooks?.log?.(`↔ scroll du bandeau des modes pour trouver ${label}…`)
    await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * 0.82), y1: Math.round(H * 0.87), x2: Math.round(W * 0.25), y2: Math.round(H * 0.87), duration_ms: 350 })
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
  // 3. Sélectionner la 1re vignette (= dernière vidéo uploadée)
  hooks?.log?.('🎞️ Sélection de la dernière vidéo…')
  await tapFrac(A.firstThumb.x, A.firstThumb.y)
  await sleep(1800)
  // 4. Next (après sélection) : vision → bouton bleu. Si non détecté → on abandonne ce
  //    container (l'appelant passera au suivant en recommençant le cycle).
  if (!await tapButton(key, deviceId, [/next|suivant/i], A.nextBtn, W, H, hooks, [0.80, 1], 'Next (après sélection)')) return false
  hooks?.log?.('   ⏳ chargement de la vidéo dans l’éditeur…')
  await sleep(5000) // laisse l'éditeur charger la vidéo (sinon aperçu gris)
  // 5. Next (écran d'édition).
  if (!await tapButton(key, deviceId, [/next|suivant/i], A.nextBtn, W, H, hooks, [0.80, 1], 'Next (édition)')) return false
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
  if (await findTapText(key, deviceId, [/share|partager/i], hooks, { label: 'Share', tries: 3, cropY: [0.85, 1] })) {
    hooks?.log?.('📤 Reel partagé.')
  } else {
    hooks?.log?.('   pas de Share direct → Next intermédiaire puis Share')
    if (!await tapButton(key, deviceId, [/next|suivant/i], A.nextBtn, W, H, hooks, [0.85, 1], 'Next (avant Share)')) return false
    await sleep(2600)
    if (!await tapButton(key, deviceId, [/share|partager/i], A.shareBtn, W, H, hooks, [0.85, 1], 'Share')) return false
    hooks?.log?.('📤 Reel partagé.')
  }
  await sleep(4000) // laisse le partage se finaliser
  await dismissPopups(key, deviceId, hooks) // ferme une éventuelle fenêtre post-partage (pas toujours là)
  hooks?.log?.('🏠 Retour à l’accueil.')
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1200)
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
  linkDone: { x: 0.83, y: 0.145 },     // « Done » de « Add link » (haut-droite)
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
