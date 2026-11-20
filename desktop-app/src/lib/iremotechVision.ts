// Automatisation iRemoTech par VISION : on lit l'écran (OCR) pour trouver le bon
// container Crane dans le sélecteur « Select Container » et taper dessus, en scrollant
// tout seul si besoin. Bien plus fiable que des coordonnées devinées : on VÉRIFIE
// ce qu'on voit avant de taper, et ça s'adapte au scroll.
import { snapshot, sendAction, deviceIp, type IrtAction } from './iremotech'
import { ocrWords, findBlueButton, findBlueDots } from './ocr'
import { isInstagramText, withJoined } from './ocrMatch'
import { parseProfileCounts, saveScreenStats, parseCount } from './irtAccounts'
import { findGalleryThumb, findMatchingCell } from './screenMatch'

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

/** Nouvelle IP : mode avion par l'action NATIVE d'iRemoTech (avion ON → attente → OFF), avec lecture de
 *  l'IP avant/après (`device_ip`). Si l'action native est refusée, repli sur le Centre de contrôle (vision). */
export async function airplaneReset(key: string, deviceId: string, hooks?: VisionHooks, holdMs = 8000): Promise<void> {
  // `device_ip` passe par le raccourci iOS « iRemotech » (souvent null) et chaque appel compte dans la limite
  // de débit : un appel avant, et on ne relit après que si la 1re lecture a marché.
  const before = await deviceIp(key, deviceId)
  if (await sendWithRetry(key, deviceId, { type: 'airplane', on: true }, 2)) {
    hooks?.log?.(`✈️ Mode avion ON (natif)${before ? ` · IP actuelle ${before}` : ''}…`)
    await sleep(holdMs)
    // OFF OBLIGATOIRE : vu en direct, un « off » refusé (429 rate_limited) laissait l'iPhone en mode avion.
    if (!await sendWithRetry(key, deviceId, { type: 'airplane', on: false }, 6)) {
      await sleep(30000)
      if (!await sendWithRetry(key, deviceId, { type: 'airplane', on: false }, 3)) { hooks?.log?.('❌ Mode avion OFF refusé par iRemoTech : l’iPhone est peut-être resté en mode avion !'); return }
    }
    hooks?.log?.('✈️ Mode avion OFF, attente du réseau…')
    await sleep(8000)
    await allowShortcutPrompt(key, deviceId, hooks)
    // réseau mobile revenu ? (« No Service » / « SOS » dans la barre d'état) — jusqu'à ~40 s
    for (let k = 0; k < 8; k++) {
      const scr = await readScreenWords(key, deviceId)
      if (!scr || !scr.words.some(o => o.cy < scr.H * 0.035 && /^(no|sos|searching)$/i.test(o.text))) break
      if (k === 0) hooks?.log?.('   📶 « No Service » : on attend le retour du réseau…')
      await sleep(5000)
    }
    if (!before) { hooks?.log?.('   (IP non lisible par iRemoTech : rotation non vérifiable, on continue)'); return }
    for (let i = 0; i < 4; i++) {
      if (hooks?.shouldStop?.()) return
      const ip = await deviceIp(key, deviceId)
      if (ip) { hooks?.log?.(ip === before ? `   ⚠ même IP qu'avant (${ip}) : l'IP n'a pas changé` : `   nouvelle IP ✓ ${ip}`); return }
      await sleep(5000)
    }
    hooks?.log?.('   (IP pas encore lisible, on continue)')
    return
  }
  hooks?.log?.('✈️ Mode avion natif refusé → Centre de contrôle')
  return airplaneResetByVision(key, deviceId, hooks, holdMs)
}

/** Les alertes iOS (« Stop creating account »…) et l'écran des cookies ignorent un tap simple d'iRemoTech :
 *  deux taps rapprochés passent (vérifié en direct le 20/11/2026). */
async function doubleTap(key: string, deviceId: string, x: number, y: number): Promise<void> {
  await sendAction(key, deviceId, { type: 'tap', x, y })
  await sendAction(key, deviceId, { type: 'tap', x, y })
}

/** Popup iOS « Allow "iRemotech 1.4" to connect to "ifconfig.me"? » (raccourci iRemoTech qui lit l'IP, à autoriser
 *  une fois par iPhone) : elle bloque tous les taps → on tape « Allow » (double tap : alerte iOS). true si traitée. */
export async function allowShortcutPrompt(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  const scr = await readScreenWords(key, deviceId)
  if (!scr || !scr.words.some(o => /ifconfig|iremotech/i.test(o.text) && o.cy < scr.H * 0.45)) return false
  const allow = scr.words.find(o => /^allow$/i.test(o.text) && o.cx > scr.W * 0.5 && o.cy < scr.H * 0.5)
  hooks?.log?.('🔓 Popup « Allow iRemotech to connect to ifconfig.me » → Allow (une seule fois par iPhone)')
  await doubleTap(key, deviceId, allow ? allow.cx : Math.round(0.73 * scr.W), allow ? allow.cy : Math.round(0.35 * scr.H))
  await sleep(1500)
  return true
}

/** Pour PUBLIER, Instagram doit voir la galerie : feuille « Allow Instagram to access your photos and videos » →
 *  Continue, puis alerte iOS → « Allow Full Access » / « Allow Access to All Photos » (double tap : alerte iOS).
 *  (À l'inverse de l'inscription, où l'on refuse.) Autres alertes « would like to… » : caméra / micro → Allow ;
 *  notifications / contacts / localisation / suivi → Don't Allow. Sans effet si rien n'est demandé. */
export async function grantPhotoAccessIfAsked(key: string, deviceId: string, hooks?: VisionHooks): Promise<void> {
  for (let k = 0; k < 4; k++) {
    const scr = await readScreenWords(key, deviceId)
    if (!scr) return
    const has = (re: RegExp, a = 0, b = 1) => scr.words.some(o => re.test(o.text) && o.cy >= a * scr.H && o.cy <= b * scr.H)
    if (has(/^access$/i, 0.3, 0.5) && has(/^videos$/i, 0.3, 0.5) && !has(/^please$/i)) {
      hooks?.log?.('🖼 Accès aux photos demandé → Continue')
      const c = scr.words.find(o => /^continue$/i.test(o.text) && o.cy > 0.8 * scr.H)
      await sendAction(key, deviceId, { type: 'tap', x: c ? c.cx : Math.round(scr.W / 2), y: c ? c.cy : Math.round(0.94 * scr.H) })
      await sleep(2500); continue
    }
    if (has(/^would$/i) && (has(/^photos$/i) || has(/^library\.?$/i))) {
      // ligne « Allow Full Access » / « Allow Access to All Photos », jamais « Limit / Select Photos » ni « Don't Allow »
      const row = scr.words.find(o => /^full$/i.test(o.text))
        ?? scr.words.find(o => /^all$/i.test(o.text) && scr.words.some(p => /^photos$/i.test(p.text) && Math.abs(p.cy - o.cy) < 12))
      const y = row ? row.cy : Math.round(0.79 * scr.H)
      hooks?.log?.('🖼 Alerte iOS → « Allow Full Access » (toutes les photos)')
      await doubleTap(key, deviceId, Math.round(scr.W / 2), y)
      await sleep(2500); continue
    }
    if (has(/^would$/i) && has(/^like$/i)) {
      const allowIt = has(/^(camera|camera\.|microphone|microphone\.)$/i)
      const b = allowIt
        ? scr.words.find(o => /^allow$/i.test(o.text) && o.cx > scr.W * 0.5)
        : scr.words.find(o => /^(don['’]?t|dontallow|ask)$/i.test(o.text))
      hooks?.log?.(`🔔 Alerte iOS (${allowIt ? 'caméra/micro → Allow' : 'permission → Don’t Allow'})`)
      await doubleTap(key, deviceId, b ? b.cx + (allowIt ? 0 : 25) : Math.round(scr.W * (allowIt ? 0.7 : 0.3)), b ? b.cy : Math.round(0.68 * scr.H))
      await sleep(2000); continue
    }
    return
  }
}

/** Action renvoyée jusqu'à acceptation (attente croissante : la limite de débit iRemoTech demande ~20 s). */
async function sendWithRetry(key: string, deviceId: string, action: IrtAction, tries: number): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await sendAction(key, deviceId, action)) return true
    if (i < tries - 1) await sleep(Math.min(20000, 4000 * (i + 1)))
  }
  return false
}

async function airplaneResetByVision(key: string, deviceId: string, hooks?: VisionHooks, holdMs = 8000): Promise<void> {
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
    const homeStill = w1.some(o => isInstagramText(o.text) || /edits|r[ée]glages|settings|app\s?store/i.test(o.text))
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
type TextPattern = RegExp | ((t: string) => boolean)
const matchText = (p: TextPattern, t: string) => typeof p === 'function' ? p(t) : p.test(t)
async function hasText(key: string, deviceId: string, patterns: TextPattern[], hooks?: VisionHooks, opts?: { cropY?: [number, number]; tries?: number }): Promise<boolean> {
  const tries = opts?.tries ?? 3
  for (let i = 0; i < tries; i++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (shot) {
      const wa = await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'], cropY: opts?.cropY })
      const wb = await ocrWords(shot, undefined, { threshold: null, invert: true, scale: 2, psms: ['11'], cropY: opts?.cropY })
      if (withJoined([...wa, ...wb]).some(o => patterns.some(p => matchText(p, o.text)))) return true
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

// Comme findTapText mais NE TAPE PAS : renvoie la position (px) du 1er mot trouvé dans
// la zone, ou null. Utile quand on veut taper soi-même (double-tap, ré-essais avec vérif).
async function findWordPoint(
  key: string, deviceId: string, patterns: RegExp[], hooks?: VisionHooks,
  opts?: { tries?: number; minY?: number; maxY?: number; minX?: number; maxX?: number; cropY?: [number, number] },
): Promise<{ x: number; y: number } | null> {
  const tries = opts?.tries ?? 2
  for (let i = 0; i < tries; i++) {
    if (hooks?.shouldStop?.()) return null
    const shot = await snapshot(key, deviceId)
    if (!shot) { await sleep(500); continue }
    const { w: W, h: H } = await imgSize(shot)
    if (!W || !H) { await sleep(400); continue }
    const crop = opts?.cropY
    const sc = crop ? 3.5 : 2
    const wa = await ocrWords(shot, undefined, { threshold: null, scale: sc, psms: ['11'], cropY: crop })
    const wb = await ocrWords(shot, undefined, { threshold: null, invert: true, scale: sc, psms: ['11'], cropY: crop })
    const words = [...wa, ...wb]
    const minY = (opts?.minY ?? 0) * H, maxY = (opts?.maxY ?? 1) * H
    const minX = (opts?.minX ?? 0) * W, maxX = (opts?.maxX ?? 1) * W
    const hit = words.find(o => o.cy >= minY && o.cy <= maxY && o.cx >= minX && o.cx <= maxX && patterns.some(p => p.test(o.text)))
    if (hit) return { x: hit.cx, y: hit.cy }
    await sleep(600)
  }
  return null
}

// Ferme les popups Instagram fréquents qui bloquent le flux (« Not now », « OK »,
// « Skip », notifications, « Add to your story »…). Balayage léger, sans échec.
/** Feuilles d'info d'Instagram (« Introducing story-to-story sharing », « New: … ») avec un bouton OK → OK.
 *  true si une feuille a été fermée. */
export async function dismissIgInfoSheet(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  const scr = await readScreenWords(key, deviceId)
  if (!scr) return false
  const has = (re: RegExp) => scr.words.some(o => re.test(o.text))
  // feuille d'info = un bouton « OK » centré dans la moitié basse, sans les boutons d'une alerte de permission iOS
  if (has(/^would$/i) && has(/^like$/i)) return false
  // boutons d'alerte à côté du OK (moitié basse) → ce n'est pas une simple feuille d'info
  if (scr.words.some(o => /^(allow|don['’]?t|cancel|discard)$/i.test(o.text) && o.cy > scr.H * 0.4) && !has(/^introducing$/i)) return false
  const ok = scr.words.find(o => /^ok$/i.test(o.text) && o.cy > scr.H * 0.45 && Math.abs(o.cx - scr.W / 2) < scr.W * 0.2)
  if (!ok) return false
  hooks?.log?.('   feuille d’info Instagram (« Introducing… ») → OK')
  await sendAction(key, deviceId, { type: 'tap', x: ok.cx, y: ok.cy })
  await sleep(1500)
  return true
}

export async function dismissPopups(key: string, deviceId: string, hooks?: VisionHooks): Promise<void> {
  const found = await findTapText(
    key, deviceId,
    [/^not now$/i, /^plus tard$/i, /^pas maintenant$/i, /^skip$/i, /^ignorer$/i, /^cancel$/i, /^annuler$/i, /^dismiss$/i],
    hooks, { label: 'popup', tries: 1 },
  )
  if (found) { hooks?.log?.('   (popup fermé)'); await sleep(1200) }
}

// Cherche le container `target` (ex. "12" ou "Default") dans le sélecteur affiché à
// l'écran et tape dessus, UNE fois (un 2e tap tomberait dans Instagram), puis vérifie que la feuille
// s'est fermée. Jamais de défilement (un balayage sélectionne une ligne). true si tapé.
export async function findAndTapContainer(key: string, deviceId: string, target: string, hooks?: VisionHooks): Promise<boolean> {
  const wanted = target.trim()
  const wantedNum = /^\d+$/.test(wanted) ? parseInt(wanted) : null
  const isDefault = /^default$/i.test(wanted)
  const whitelist = '0123456789Defaultefaul'
  const maxSteps = 4
  let sawSheet = false
  for (let step = 0; step < maxSteps; step++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (!shot) { hooks?.log?.('⚠ snapshot indisponible'); await sleep(700); continue }
    const { w: W, h: H } = await imgSize(shot)
    if (!W || !H) { hooks?.log?.('⚠ image illisible'); await sleep(500); continue }
    const words = await ocrWords(shot, whitelist)
    const rows = pickerRows(words, W, H)
    if (rows.length) sawSheet = true
    hooks?.log?.(`👁 lu : ${rows.map(r => r.text).join(', ') || '(rien)'}`)
    // Cible visible ?
    const hit = rows.find(o => isDefault ? /^default$/i.test(o.text) : o.text === wanted)
    if (hit) {
      // Tap dans la ligne mais À CÔTÉ du libellé : un tap pile sur le chiffre n'était parfois pas pris
      // (vérifié en direct sur le « 4 »). Puis on vérifie que la feuille s'est fermée, sinon on retape.
      for (const [i, fx] of [0.72, 0.3, 0.72].entries()) {
        const x = Math.round(W * fx)
        hooks?.log?.(`🎯 « ${wanted} » → ${i ? 'double ' : ''}tap (${x}, ${hit.cy})`)
        // la feuille Crane est une alerte iOS : un tap simple est parfois ignoré, le double tap passe
        if (i) await doubleTap(key, deviceId, x, hit.cy)
        else await sendAction(key, deviceId, { type: 'tap', x, y: hit.cy })
        await sleep(1800)
        // feuille encore ouverte sur 2 captures espacées (pas une simple animation de fermeture) → on retape
        const stillOpen = async () => { const sh = await snapshot(key, deviceId); return !!sh && pickerRows(await ocrWords(sh, whitelist), W, H).length >= 2 }
        if (!await stillOpen()) return true
        await sleep(1200)
        if (!await stillOpen()) return true
        hooks?.log?.('   le sélecteur est encore ouvert → nouvel essai')
      }
      hooks?.log?.(`❌ « ${wanted} » : le tap n’est pas pris par le sélecteur`)
      await sendAction(key, deviceId, { type: 'press', name: 'home' })
      return false
    }
    // Pas de défilement : dans la feuille Crane, tout balayage SÉLECTIONNE la ligne touchée (vérifié en
    // direct le 20/11/2026) et ouvrirait un mauvais container. La feuille montre tous les containers
    // tant qu'ils tiennent à l'écran ; sinon on s'arrête proprement.
    if (rows.length) { hooks?.log?.(`❌ « ${wanted} » n’est pas dans le sélecteur (containers vus : ${rows.map(r => r.text).join(', ')})`); await sendAction(key, deviceId, { type: 'press', name: 'home' }); return false }
    await sleep(900)
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
    // Libellé BLANC sur fond coloré : on ISOLE le texte quasi-blanc (invert + seuil) → le blanc
    // devient texte noir net, le fond coloré ET l'ombre du libellé disparaissent. 2 seuils (labels
    // + ou - lumineux) + un repli grayscale. Rapide (3 passes) et fiable.
    const words: Awaited<ReturnType<typeof ocrWords>> = []
    for (const th of [95, 140]) {
      words.push(...await ocrWords(shot, undefined, { threshold: th, invert: true, scale: 3, psms: ['11'] }))
    }
    words.push(...await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'] }))
    let hit = withJoined(words).find(o => matcher(o.text))
    // Fond d'écran CLAIR : le libellé blanc se confond avec le fond → passe « texte blanc »
    // (blanc plus clair que son voisinage, ombre comprise), puis en BANDES agrandies.
    if (!hit) {
      words.push(...await ocrWords(shot, undefined, { threshold: null, whiteText: true, scale: 3, psms: ['11'] }))
      hit = withJoined(words).find(o => matcher(o.text))
    }
    for (const band of [[0.04, 0.32], [0.28, 0.56], [0.52, 0.8], [0.76, 0.93]] as [number, number][]) {
      if (hit) break
      words.push(...await ocrWords(shot, undefined, { threshold: null, whiteText: true, scale: 4, psms: ['11'], cropY: band }))
      hit = withJoined(words).find(o => matcher(o.text))
    }
    const lus = [...new Set(words.map(w => w.text).filter(Boolean))].slice(0, 28)
    hooks?.log?.(`👁 accueil (${W}×${H}) lu : ${lus.join(', ') || '(rien)'}`)
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
  // UNIQUEMENT par son NOM (libellé sous l'icône), lu de façon tolérante (« lnstagram »,
  // « Instagrarn », « Insta » « gram »…). Pas de repérage au logo : il tapait parfois ailleurs.
  return tapAppIcon(key, deviceId, isInstagramText, 'Instagram', hooks)
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
// `alreadyIn(capture)` : barre des modes MASQUÉE (Instagram rouvre le dernier mode utilisé ;
// une bulle d'effet la remplace) mais la caméra voulue est reconnue → rien à faire.
const MODE_WORD = /^(post|publication|publier|story|stories|reels?|live|direct|instants?|templates?|mod[eè]les?)$/i
// Ordre de la barre (gauche → droite) : POST STORY INSTANTS REEL LIVE → sens du balayage.
const MODE_ORDER = [/^(post|publication|publier)$/i, /^(story|stories)$/i, /^instants?$/i, /^reels?$/i, /^(live|direct)$/i]
const modeIndex = (t: string) => MODE_ORDER.findIndex(r => r.test(t))
async function selectMode(key: string, deviceId: string, patterns: RegExp[], label: string, hooks?: VisionHooks, alreadyIn?: (shot: string) => Promise<boolean>): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    if (hooks?.shouldStop?.()) return false
    if (await findTapText(key, deviceId, patterns, hooks, { label, minY: 0.72, tries: 2, cropY: [0.78, 1] })) return true
    const shot = await snapshot(key, deviceId)
    const { w: W, h: H } = shot ? await imgSize(shot) : { w: 0, h: 0 }
    if (!shot || !W || !H) { await sleep(600); continue }
    // On ne balaie QUE sur la barre des modes, à la hauteur de ses mots LUS. Ailleurs (aperçu
    // caméra, carrousel ou bulle d'effet), un balayage horizontal CHANGE D'EFFET (« pretty »…).
    const wa = await ocrWords(shot, undefined, { threshold: null, scale: 3, psms: ['11'], cropY: [0.78, 1] })
    const wb = await ocrWords(shot, undefined, { threshold: null, invert: true, scale: 3, psms: ['11'], cropY: [0.78, 1] })
    const bar = [...wa, ...wb].filter(o => MODE_WORD.test(o.text))
    if (!bar.length) {
      if (alreadyIn && await alreadyIn(shot)) { hooks?.log?.(`   ✓ caméra ${label} déjà ouverte (barre des modes masquée)`); return true }
      if (i === 0) { await sleep(1500); continue } // caméra encore en chargement
      hooks?.log?.(`❌ mode ${label} : barre des modes invisible → aucun balayage (il changerait l'effet de la caméra)`)
      return false
    }
    const by = Math.round(bar.reduce((n, o) => n + o.cy, 0) / bar.length)
    // Le mode voulu est à GAUCHE des mots lus (ex. POST quand LIVE est actif) → balayer vers la
    // droite pour le faire apparaître ; à DROITE → vers la gauche ; sinon on alterne.
    const want = modeIndex(label), seen = bar.map(o => modeIndex(o.text)).filter(n => n >= 0)
    let toRight = i >= 3
    if (want >= 0 && seen.length) {
      if (want < Math.min(...seen)) toRight = true
      else if (want > Math.max(...seen)) toRight = false
    }
    const [xa, xb] = toRight ? [0.25, 0.82] : [0.82, 0.25]
    hooks?.log?.(`↔ scroll du bandeau des modes pour trouver ${label}…`)
    await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * xa), y1: by, x2: Math.round(W * xb), y2: by, duration_ms: 350 })
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
  await grantPhotoAccessIfAsked(key, deviceId, hooks)
  // 2. Mode POST : galerie directe, dernière vidéo pré-sélectionnée, pas de caméra (ni effets).
  //    Une vidéo publiée en POST devient un Reel. Si POST est introuvable → caméra REEL.
  if (await selectMode(key, deviceId, [/^post$/i, /^publication$/i, /^publier$/i], 'POST', hooks)) {
    return postViaPostMode(key, deviceId, W, H, A, opts.caption, hooks)
  }
  hooks?.log?.('   POST introuvable → passage par la caméra REEL')
  // 2bis. Passer en mode REEL (bandeau du bas POST STORY INSTANTS REEL LIVE) — scroll si besoin.
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

// Publication par le mode POST : galerie « New post » (la vidéo la plus récente est en 1re case,
// déjà pré-sélectionnée) → Next (haut-droite) → [popup « shared as reels » → OK] → éditeur →
// Next → écran de légende → légende → Share. On n'appuie sur Share QUE si l'écran de légende /
// partage est reconnu (sinon abandon : jamais de post à moitié).
const CAPTION_MARK = [/^caption[.…]*$/i, /^l[ée]gende[.…]*$/i]
async function postViaPostMode(key: string, deviceId: string, W: number, H: number, A: typeof REEL_ANCHORS, caption: string | undefined, hooks?: VisionHooks): Promise<boolean> {
  await sleep(1800) // la galerie se charge
  // a. Vidéo la plus récente : 1re case de la grille, juste sous « Récents » (x = 1/8 de la largeur :
  //    dans la 1re case en 3 comme en 4 colonnes). Sans repère, on garde la pré-sélection d'Instagram.
  // La vidéo la plus récente = 1re vignette portant une DURÉE (« 0:06 ») sous « Récents » : sur un iPhone normal
  // la 1re case est l'APPAREIL PHOTO (la taper ouvrait la caméra).
  const rec = await findWordPoint(key, deviceId, [/^recents?$/i, /^r[ée]cents?$/i], hooks, { minY: 0.25, maxY: 0.85, tries: 2 })
  const gshot = rec ? await snapshot(key, deviceId) : null
  const durs = gshot && rec ? (await ocrWords(gshot, '0123456789:', { threshold: null, scale: 2, psms: ['11'] })).filter(o => /^\d{1,2}:\d{2}$/.test(o.text) && o.cy > rec.y) : []
  const first = durs.sort((a, b) => (Math.abs(a.cy - b.cy) < 20 ? a.cx - b.cx : a.cy - b.cy))[0]
  // la plus récente est dans les 2 premières colonnes (après l'éventuelle case appareil photo) : une durée lue plus à
  // droite = celle de la 1re vignette a été ratée par l'OCR → on ne tape pas (sinon on choisirait une vidéo PLUS ANCIENNE)
  if (first && first.cx <= W * 0.5) {
    const x = Math.max(8, first.cx - Math.round(W / 16)), y = first.cy - Math.round(W / 10)
    hooks?.log?.(`🎞️ Dernière vidéo (1re vignette avec durée ${first.text}) → tap (${x}, ${y})`)
    await sendAction(key, deviceId, { type: 'tap', x, y })
    await sleep(1500)
  } else hooks?.log?.('   1re vignette non lue → vidéo pré-sélectionnée par Instagram (la plus récente)')
  // b. Avancer jusqu'à l'écran de légende : Next en haut-droite (texte) ou en bas-droite (bouton bleu).
  let atCaption = false
  for (let step = 0; step < 6 && !atCaption; step++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (!shot) { await sleep(800); continue }
    const words = withJoined([
      ...await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'] }),
      ...await ocrWords(shot, undefined, { threshold: null, invert: true, scale: 2, psms: ['11'] }),
    ])
    if (words.some(o => CAPTION_MARK.some(p => p.test(o.text)))) { atCaption = true; break }
    // Popup « Video posts are now shared as reels » / « … partagées en tant que reels » → OK
    // (petit « OK » blanc sur bouton BLEU : OCR recadré, sinon le bouton bleu de la popup).
    if (words.some(o => /^reels?[.!]?$/i.test(o.text)) && words.some(o => /^(shared|partag[ée]e?s?)$/i.test(o.text))) {
      hooks?.log?.('   popup « vidéos partagées en reels » → OK')
      // (le bouton OK peut être tout en bas, ~90 % de la hauteur, sur iPhone normal ; lien « Go to settings » juste dessous)
      if (!await findTapText(key, deviceId, [/^ok[.!]?$/i], hooks, { label: 'OK', tries: 1, cropY: [0.25, 0.97] })) {
        const blue = await findBlueButton(shot, 0.25, 0.94, 0.1, 0.9)
        if (blue) await sendAction(key, deviceId, { type: 'tap', x: blue.cx, y: blue.cy })
      }
      await sleep(1500); continue
    }
    let top = await findTapText(key, deviceId, [/^next$/i, /^suivant$/i], hooks, { label: 'Next (haut)', tries: 2, minX: 0.55, cropY: [0, 0.14] })
    // écran « New post » (iPhone normal) : « Next » violet sur noir en haut à droite, souvent illisible → position connue
    if (!top && words.some(o => /^new$/i.test(o.text) && o.cy < H * 0.07) && words.some(o => /^post$/i.test(o.text) && o.cy < H * 0.07)) {
      hooks?.log?.(`   écran « New post » → Next en haut à droite (${Math.round(0.9 * W)}, ${Math.round(0.034 * H)})`)
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.9 * W), y: Math.round(0.034 * H) }); top = true
    }
    if (!top && !await tapButton(key, deviceId, [/^next$/i, /^suivant$/i], A.nextBtn, W, H, hooks, [0.80, 1], 'Next (bas)', 2, [0.5, 1])) return false
    await sleep(step === 0 ? 3000 : 4500) // l'éditeur charge la vidéo
  }
  if (!atCaption) { hooks?.log?.('❌ écran de légende non atteint → rien n’est publié (container suivant)'); return false }
  // c. Légende : tap sur « Write a caption… » → saisie → OK/Done (haut-droite) s'il apparaît.
  if (caption && caption.trim()) {
    hooks?.log?.('✏️ Saisie de la légende…')
    const f = await findWordPoint(key, deviceId, CAPTION_MARK, hooks, { tries: 2 })
    await sendAction(key, deviceId, { type: 'tap', x: f ? f.x : Math.round(A.captionField.x * W), y: f ? f.y : Math.round(A.captionField.y * H) })
    await sleep(1400)
    await sendAction(key, deviceId, { type: 'text', text: caption.trim() })
    await sleep(900)
    if (await findTapText(key, deviceId, [/^ok$/i, /^done$/i, /^termin[ée]$/i], hooks, { label: 'OK légende', tries: 2, minX: 0.55, cropY: [0, 0.14] })) await sleep(1400)
  }
  // d. Partager (bouton bleu en bas).
  if (!await tapButton(key, deviceId, [/^share$/i, /^partager$/i], A.shareBtn, W, H, hooks, [0.80, 1], 'Share', 3, [0, 1])) return false
  hooks?.log?.('📤 Vidéo publiée (POST).')
  await sleep(4000)
  await dismissPopups(key, deviceId, hooks)
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
/** Le container est-il « frais » (écran d'inscription « Join Instagram ») ? Vérifié AVANT d'acheter un
 *  numéro : un container déjà connecté (fil, profil) ne doit jamais faire acheter de numéro. */
export async function isSignupScreen(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  return (await rewindSignup(key, deviceId, hooks)) !== null
}

type SignupStage = 'join' | 'mobile' | 'code' | 'midway' | 'stop'

/** Container resté au milieu d'une inscription ratée (écran du code, mot de passe, date, nom…) : Instagram
 *  y revient même après fermeture. On remonte avec la flèche « < » jusqu'à l'écran du numéro (ou Join).
 *  Renvoie 'join' | 'mobile' quand on peut (re)commencer, null si ce n'est pas un écran d'inscription. */
export async function rewindSignup(key: string, deviceId: string, hooks?: VisionHooks): Promise<'join' | 'mobile' | null> {
  let st = await signupStage(key, deviceId, hooks)
  for (let i = 0; i < 7 && (st === 'code' || st === 'midway' || st === 'stop'); i++) {
    if (hooks?.shouldStop?.()) return null
    if (i === 0) hooks?.log?.(`↩ Inscription restée en cours (${st === 'code' ? 'écran du code' : 'étape intermédiaire'}) → on l’abandonne pour repartir de zéro`)
    if (st === 'stop') {
      // « Do you want to stop creating your account? » → « Stop creating account » = retour propre à Join
      const pt = await findWordPoint(key, deviceId, [/^stop$/i, /^arr[eê]ter$/i], hooks, { tries: 2, minY: 0.45, maxY: 0.7 })
      if (pt) await doubleTap(key, deviceId, Math.round(pt.x + 70), pt.y)
      await sleep(2500); st = await signupStage(key, deviceId, hooks, 2); continue
    }
    const shot = await snapshot(key, deviceId)
    const { w: W, h: H } = shot ? await imgSize(shot) : { w: 0, h: 0 }
    if (!W || !H) break
    await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.065 * W), y: Math.round(0.069 * H) }) // flèche « < »
    await sleep(2200)
    st = await signupStage(key, deviceId, hooks, 2)
  }
  return st === 'join' || st === 'mobile' ? st : null
}

/** Mots lus → étape d'inscription : « join » (Join Instagram / Get started, bas de l'écran) ou « mobile »
 *  (« What's your mobile number? » : inscription commencée puis abandonnée, container toujours vierge). */
export function classifySignup(words: { text: string; cy: number }[], H: number): SignupStage | null {
  if (words.some(o => o.cy > H * 0.45 && /^(started|join|s.?inscrire|commencer)$/i.test(o.text.replace(/[^\p{L}']/gu, '')))) return 'join'
  const has = (re: RegExp) => words.some(o => re.test(o.text.replace(/[^\p{L}]/gu, '')))
  if (has(/^stop$/i) && has(/^creating$/i)) return 'stop'
  if (has(/^mobile$/i) && has(/^(change|changer|modifier|next|suivant)$/i)) return 'mobile'
  // « Enter the confirmation code » / « I didn't get the code »
  if (has(/^code$/i) && (has(/^confirmation$/i) || has(/^didnt$/i))) return 'code'
  // autres écrans du parcours d'inscription (titres)
  if ((has(/^create$/i) && has(/^(password|username)$/i)) || (has(/^whats$/i) && has(/^(birthday|name)$/i)) || (has(/^agree$/i) && has(/^terms$/i))) return 'midway'
  return null
}

export async function signupStage(key: string, deviceId: string, hooks?: VisionHooks, tries = 4): Promise<SignupStage | null> {
  for (let i = 0; i < tries; i++) {
    if (hooks?.shouldStop?.()) return null
    const shot = await snapshot(key, deviceId)
    if (shot) {
      const { h: H } = await imgSize(shot)
      const wa = await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'] })
      const wb = await ocrWords(shot, undefined, { threshold: null, invert: true, scale: 2, psms: ['11'] })
      const st = classifySignup([...wa, ...wb], H)
      if (st) return st
    }
    await sleep(700)
  }
  return null
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
  // Inscription déjà commencée (écran du numéro) : on reprend directement à l'étape 2.
  const stage0 = await rewindSignup(key, deviceId, hooks)
  if (!stage0) {
    hooks?.log?.('❌ Écran « Join Instagram » non détecté (container déjà connecté ?).')
    return { ok: false, stage: 'get_started' }
  }
  if (stage0 === 'mobile') hooks?.log?.('↪ Inscription déjà commencée : on reprend à l’écran du numéro.')
  else hooks?.log?.('🆕 Création de compte : « Get started »…')
  // « started » n'est QUE sur le bouton (« get » traîne dans « who get you » plus haut) ;
  // on restreint aussi à la moitié basse pour ne jamais taper le texte de description.
  // ⚠ Le tap simple sur ce bouton « marche pas » parfois (touch avalé) → on TAPE puis on
  // VÉRIFIE qu'on a avancé (écran mobile/number/Change) ; sinon on ré-appuie (double-tap +
  // ancre) jusqu'à 4 essais. On ne continue que quand l'écran suivant est bien apparu.
  let advanced = stage0 === 'mobile'
  for (let attempt = 0; attempt < 4 && !advanced; attempt++) {
    if (hooks?.shouldStop?.()) return { ok: false, stage: 'get_started' }
    // Position du bouton : OCR du mot, sinon ancre connue (bouton bleu ~80%).
    const btn = await findWordPoint(key, deviceId, [/^started$/i, /^s.?inscrire$/i, /commencer$/i], hooks, { minY: 0.6 })
    const bx = btn ? btn.x : Math.round(0.5 * W)
    const by = btn ? btn.y : Math.round(0.80 * H)
    if (!btn && attempt === 0) hooks?.log?.('   « Get started » non lu → tap position connue (bouton bleu ~80%).')
    hooks?.log?.(`👆 « S'inscrire » (essai ${attempt + 1}) → tap (${bx}, ${by})`)
    // Double-tap franc : un seul tap n'est pas toujours enregistré par ce bouton.
    await sendAction(key, deviceId, { type: 'tap', x: bx, y: by })
    await sleep(220)
    await sendAction(key, deviceId, { type: 'tap', x: bx, y: by })
    await sleep(2600)
    // Avancé ? L'écran suivant (« What's your mobile number? ») porte mobile/number/Change,
    // et le bouton « S'inscrire » a disparu.
    advanced = await hasText(key, deviceId, [/mobile/i, /^number$/i, /^change$/i, /changer/i], hooks, { tries: 2 })
    if (!advanced) hooks?.log?.('   écran pas avancé après « S\'inscrire » → nouvel essai.')
  }
  if (!advanced) {
    hooks?.log?.('❌ « S\'inscrire » : l\'écran n\'a pas avancé après plusieurs essais.')
    return { ok: false, stage: 'get_started' }
  }

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
  // Le champ « Mobile number » DESCEND selon la longueur du texte au-dessus (mention Meta
  // Account) → on le cible par OCR de son placeholder « Mobile » dans la zone du champ
  // (minY 0.30 exclut le titre à ~0.13 ; maxY 0.42 exclut l'erreur rouge « required » à ~0.43).
  // DOUBLE-tap pour bien le focus ; repli position ~0.385 si non lu.
  const numPt = await findWordPoint(key, deviceId, [/mobile/i], hooks, { minY: 0.28, maxY: 0.39, tries: 2 })
  const nx = numPt ? numPt.x : Math.round(0.5 * W)
  const ny = numPt ? numPt.y : Math.round(0.34 * H)
  if (!numPt) hooks?.log?.('   champ numéro non lu → tap position connue (0.5, 0.34).')
  await sendAction(key, deviceId, { type: 'tap', x: nx, y: ny }); await sleep(220)
  await sendAction(key, deviceId, { type: 'tap', x: nx, y: ny })
  await sleep(1000)
  // ancien numéro d'un essai raté : la touche Backspace d'iRemoTech ne fait rien (testé) → bouton ✕ du champ
  if (stage0 === 'mobile') { await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.88 * W), y: ny }); await sleep(700); await sendAction(key, deviceId, { type: 'tap', x: nx, y: ny }); await sleep(700) }
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

// Depuis l'écran « Enter the confirmation code » : revient à l'écran numéro (flèche retour
// haut-gauche), vide l'ancien numéro et saisit le NOUVEAU, puis re-soumet. Sert quand aucun
// code n'arrive sous 60 s → on jette le numéro et on en essaie un autre. true si on est bien
// repassé sur l'écran de code (numéro re-soumis).
export async function resubmitNumberByVision(key: string, deviceId: string, phoneNumber: string, hooks?: VisionHooks): Promise<boolean> {
  const shot0 = await snapshot(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible (ré-saisie numéro)'); return false }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })
  hooks?.log?.('↩ Retour à l’écran numéro pour re-saisir un nouveau numéro…')
  // Flèche retour (haut-gauche).
  await tapFrac(0.06, 0.06); await sleep(2200)
  // Vérifie qu'on est bien revenu sur l'écran numéro.
  if (!await hasText(key, deviceId, [/mobile/i, /^number$/i], hooks, { tries: 4 })) {
    hooks?.log?.('❌ écran numéro non retrouvé après retour')
    return false
  }
  // Champ « Mobile number » (même ciblage que la saisie initiale).
  const numPt = await findWordPoint(key, deviceId, [/mobile/i], hooks, { minY: 0.28, maxY: 0.39, tries: 2 })
  const nx = numPt ? numPt.x : Math.round(0.5 * W)
  const ny = numPt ? numPt.y : Math.round(0.34 * H)
  await sendAction(key, deviceId, { type: 'tap', x: nx, y: ny }); await sleep(220)
  await sendAction(key, deviceId, { type: 'tap', x: nx, y: ny }); await sleep(700)
  // Vide l'ancien numéro puis saisit le nouveau.
  for (let i = 0; i < 24; i++) await sendAction(key, deviceId, { type: 'key', key: 'Backspace' })
  await sleep(400)
  await sendAction(key, deviceId, { type: 'text', text: phoneNumber })
  await sleep(1200)
  // Next (bouton bleu centré) + vérifie qu'on a quitté l'écran numéro (→ écran code).
  let ok = false
  for (let t = 0; t < 3 && !ok; t++) {
    await tapButton(key, deviceId, [/^next$/i, /^suivant$/i], { x: 0.5, y: 0.62 }, W, H, hooks, [0.45, 0.9], t ? `Next numéro (essai ${t + 1})` : 'Next (numéro)', 2, [0, 1])
    await sleep(2600)
    ok = !await hasText(key, deviceId, [/mobile number/i, /required/i], hooks, { cropY: [0.25, 0.55], tries: 1 })
    if (!ok) hooks?.log?.('   ↻ toujours sur l’écran numéro → réessai Next')
  }
  if (ok) hooks?.log?.('✅ Nouveau numéro soumis — en attente du code SMS.')
  return ok
}

// Force l'envoi du code par SMS : Instagram l'envoie souvent par WhatsApp d'abord
// (donc l'API SMS ne reçoit rien). On tape « I didn't get the code » puis, dans la
// feuille, « Send code via SMS ».
export async function requestSmsResendByVision(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  const shot0 = await snapshot(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) return false
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })
  hooks?.log?.('🔁 Pas de code → « I didn\'t get the code » puis « Send code via SMS »…')
  // 1. « I didn't get the code » (bouton clair sous « Next »).
  if (!await findTapText(key, deviceId, [/didn.?t get/i, /get the code/i, /pas re[çc]u/i], hooks, { label: "I didn't get the code", tries: 4, minY: 0.3 })) {
    await tapFrac(0.5, 0.47)
  }
  await sleep(1800)
  // 2. Feuille → « Send code via SMS » (1re option).
  if (!await findTapText(key, deviceId, [/via sms/i, /par sms/i, /send code via sms/i], hooks, { label: 'Send code via SMS', tries: 4 })) {
    await tapFrac(0.5, 0.33)
  }
  await sleep(2500)
  return true
}

// Sur l'écran « Enter the confirmation code » : si IG indique l'envoi par WhatsApp (« we sent via
// WhatsApp to … »), le fournisseur SMS ne reçoit rien → on bascule en SMS via « I didn't get the
// code » → « Get a new code via SMS ». true si la bascule a été tentée.
export async function requestSmsIfWhatsApp(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  if (!await hasText(key, deviceId, [/whatsapp/i], hooks, { tries: 2, cropY: [0.1, 0.45] })) return false
  hooks?.log?.('💬 Code envoyé par WhatsApp → bascule en SMS…')
  return requestSmsResendByVision(key, deviceId, hooks)
}

// ── Fin d'inscription IG : mot de passe → anniversaire → nom → username → I agree ──
const FR_FIRST = ['Camille', 'Léa', 'Manon', 'Chloé', 'Sarah', 'Emma', 'Julie', 'Marie', 'Laura', 'Clara', 'Inès', 'Jade', 'Louise', 'Alice', 'Lucie', 'Anaïs', 'Océane', 'Pauline', 'Justine', 'Élise', 'Margaux', 'Célia', 'Zoé', 'Ambre', 'Lina', 'Nina', 'Romane', 'Eva', 'Lola', 'Maëva']
const FR_LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Michel', 'Garcia', 'Roux', 'Fontaine', 'Girard', 'Bonnet', 'Dupont', 'Lambert', 'Fournier', 'Rousseau', 'Vincent', 'Faure', 'André', 'Mercier', 'Blanc', 'Guerin', 'Boyer', 'Garnier', 'Chevalier']
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
function randomPassword(n = 15): string {
  // Alphanumérique uniquement : les caractères spéciaux cassent la saisie iRemoTech sur le
  // champ mot de passe (et IG n'exige que « 6 lettres/chiffres »).
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnpqrstuvwxyz', D = '23456789'
  const all = U + L + D
  const p = [pick([...U]), pick([...L]), pick([...D])]
  while (p.length < n) p.push(all[Math.floor(Math.random() * all.length)])
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[p[i], p[j]] = [p[j], p[i]] }
  return p.join('')
}
function randomUsername(first: string): string {
  const n = 5 + Math.floor(Math.random() * 4) // 5–8
  const ch = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''; for (let i = 0; i < n; i++) s += ch[Math.floor(Math.random() * ch.length)]
  const base = first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
  return base + s
}

// Ferme COMPLÈTEMENT l'app au premier plan (iPhone Face ID) : ouvre l'App Switcher (swipe lent
// depuis le bas + pause) puis balaie la carte centrale vers le haut pour la quitter, puis accueil.
// iRemoTech n'a pas d'action « kill app » → on le fait au geste (coordonnées à ajuster si besoin).
export async function forceCloseForegroundApp(key: string, deviceId: string, hooks?: VisionHooks): Promise<void> {
  const shot = await snapshot(key, deviceId)
  const { w: W, h: H } = shot ? await imgSize(shot) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('⚠ écran illisible → fermeture app sautée'); return }
  const x = Math.round(0.5 * W)
  hooks?.log?.('🛑 Fermeture complète d’Instagram (App Switcher)…')
  // 1. Ouvrir l'App Switcher : swipe TRÈS LENT depuis le tout en bas jusqu'à ~45 %. Sur Face ID,
  //    une vitesse lente (longue durée) déclenche le switcher ; une vitesse rapide = retour accueil.
  await sendAction(key, deviceId, { type: 'swipe', x1: x, y1: Math.max(0, H - 2), x2: x, y2: Math.round(0.45 * H), duration_ms: 1800 })
  await sleep(1600)
  // 2. Balayer la carte (centrée) vers le HAUT pour quitter l'app.
  await sendAction(key, deviceId, { type: 'swipe', x1: x, y1: Math.round(0.55 * H), x2: x, y2: Math.round(0.05 * H), duration_ms: 500 })
  await sleep(1000)
  // 3. Revenir à l'accueil.
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1200)
}

export interface SignupCreds { username: string; password: string; fullName: string }
export async function completeSignupByVision(key: string, deviceId: string, hooks?: VisionHooks, opts?: { container?: string }): Promise<{ ok: boolean; creds?: SignupCreds; refused?: boolean; captcha?: boolean; ready?: boolean }> {
  const shot0 = await snapshot(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible (inscription)'); return { ok: false } }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })
  const tapNext = async (label: string) => {
    if (!await tapButton(key, deviceId, [/^next$/i, /^suivant$/i], { x: 0.5, y: 0.4 }, W, H, hooks, [0.25, 0.55], label, 3, [0, 1])) await tapFrac(0.5, 0.36)
  }

  // 1. Create a password.
  await hasText(key, deviceId, [/password/i, /mot de passe/i], hooks, { tries: 5 })
  const password = randomPassword(15)
  hooks?.log?.('🔑 Mot de passe…')
  // Champ « Password » : on le localise par son placeholder (zone Y pour éviter le titre) puis on
  // DOUBLE-TAP le centre du champ à cette hauteur ; repli position connue ~0.33. Pas d'icône œil
  // ni de re-focus figé (ça ratait et dé-focusait le champ → saisie perdue).
  // Le libellé « Password » du champ (aligné à gauche), PAS la ligne d'erreur « Password can't be empty » juste
  // dessous (~0,40) ni le texte d'aide au-dessus. Repli : position mesurée du champ (~0,336 sur iPhone 406×720).
  const pwPt = await findWordPoint(key, deviceId, [/^password$/i], hooks, { minY: 0.25, maxY: 0.38, maxX: 0.45, tries: 2 })
  const pwY = pwPt ? pwPt.y : Math.round(0.336 * H)
  const pwX = Math.round(0.5 * W)
  if (!pwPt) hooks?.log?.('   champ mot de passe non lu → tap position connue (0.5, 0.336).')
  // Un tap simple (pas de double tap : sur un champ mot de passe iOS il ouvre le menu Coller/Remplissage auto).
  await sendAction(key, deviceId, { type: 'tap', x: pwX, y: pwY }); await sleep(900)
  await sendAction(key, deviceId, { type: 'text', text: password })
  await sleep(700)
  // Filet : si le champ est resté vide (saisie en bloc refusée), on re-tape le champ et char par char.
  if (await hasText(key, deviceId, [/can.?t be empty/i, /vide/i], hooks, { cropY: [0.2, 0.5], tries: 1 })) {
    hooks?.log?.('   ↻ saisie en bloc refusée → char par char…')
    const err = await findWordPoint(key, deviceId, [/^can.?t$/i], hooks, { minY: 0.3, maxY: 0.5, tries: 1 })
    const fy = err ? err.y - Math.round(0.069 * H) : Math.round(0.336 * H) // le champ est juste au-dessus de l'erreur
    await sendAction(key, deviceId, { type: 'tap', x: pwX, y: fy }); await sleep(900)
    for (const ch of password) { await sendAction(key, deviceId, { type: 'text', text: ch }); await sleep(60) }
  }
  await sleep(700)
  await tapNext('Next (mot de passe)')
  await sleep(3200)
  // GARDE : tant qu'on est encore sur « Create a password » (saisie non prise), on ne continue pas à
  // l'aveugle (vu en vrai : la suite tapait les écrans suivants sur la page mot de passe → faux « créé »).
  const onPasswordPage = () => hasText(key, deviceId, [/^password$/i], hooks, { tries: 1, cropY: [0.08, 0.2] })
  for (let k = 0; k < 3 && await onPasswordPage(); k++) {
    if (hooks?.shouldStop?.()) return { ok: false }
    hooks?.log?.(`   ↻ mot de passe pas pris (essai ${k + 2}) → on retape le champ`)
    const err = await findWordPoint(key, deviceId, [/^can.?t$/i], hooks, { minY: 0.3, maxY: 0.5, tries: 1 })
    const fy = err ? err.y - Math.round(0.069 * H) : Math.round(0.336 * H)
    await sendAction(key, deviceId, { type: 'tap', x: Math.round([0.3, 0.65, 0.5][k] * W), y: fy }); await sleep(1100)
    await sendAction(key, deviceId, { type: 'text', text: password }); await sleep(900)
    await tapNext('Next (mot de passe)')
    await sleep(3200)
  }
  if (await onPasswordPage()) { hooks?.log?.('❌ Mot de passe impossible à saisir : arrêt (compte NON créé)'); return { ok: false } }

  // 2. Birthday : scroll aléatoire des molettes. dy > 0 = swipe vers le BAS (recule dans le
  //    temps). Amplitude modérée, peu de swipes (l'utilisateur : « mauvais sens + trop long »).
  hooks?.log?.('🎂 Anniversaire (scroll aléatoire)…')
  const swipeCol = (fx: number, dy: number) => sendAction(key, deviceId, { type: 'swipe', x1: Math.round(fx * W), y1: Math.round(0.80 * H), x2: Math.round(fx * W), y2: Math.round((0.80 + dy) * H), duration_ms: 400 })
  // Année : assez de recul pour un ÂGE ADULTE (sinon IG grise « Next »).
  for (let i = 0; i < 4; i++) { await swipeCol(0.78, 0.14 + Math.random() * 0.06); await sleep(450) }
  await swipeCol(0.25, (Math.random() < 0.5 ? 1 : -1) * (0.06 + Math.random() * 0.08)); await sleep(450) // mois
  await swipeCol(0.5, (Math.random() < 0.5 ? 1 : -1) * (0.06 + Math.random() * 0.08)); await sleep(700)  // jour
  // Ici « Next » est CENTRÉ (~0.47), pas en bas-droite, et il reste GRISÉ tant que les molettes
  // animent (âge non figé). On laisse d'abord les molettes se poser, puis on tape en VÉRIFIANT
  // qu'on a quitté l'écran anniversaire ; sinon on retape (Next était grisé / tap manqué).
  await sleep(1200)
  let bdayOk = false
  for (let t = 0; t < 4 && !bdayOk; t++) {
    if (hooks?.shouldStop?.()) break
    await tapButton(key, deviceId, [/^next$/i, /^suivant$/i], { x: 0.5, y: 0.47 }, W, H, hooks, [0.30, 0.62], t ? `Next anniversaire (essai ${t + 1})` : 'Next (anniversaire)', 2, [0, 1])
    await sleep(2400)
    bdayOk = !await hasText(key, deviceId, [/birthday/i, /anniversaire/i], hooks, { cropY: [0, 0.35], tries: 1 })
    if (!bdayOk) hooks?.log?.('   ↻ toujours sur l’écran anniversaire → réessai Next')
  }
  if (!bdayOk) hooks?.log?.('   ⚠ anniversaire : Next n’a pas fait avancer après plusieurs essais.')
  await sleep(1500)

  // 3. Full name : nom de femme française aléatoire.
  const first = pick(FR_FIRST), fullName = `${first} ${pick(FR_LAST)}`
  hooks?.log?.(`🧑 Nom : ${fullName}`)
  if (!await findTapText(key, deviceId, [/full name/i, /nom complet/i], hooks, { label: 'champ nom', tries: 3, minY: 0.15, maxY: 0.35 })) await tapFrac(0.5, 0.25)
  await sleep(700)
  await sendAction(key, deviceId, { type: 'text', text: fullName })
  await sleep(600)
  await tapNext('Next (nom)')
  await sleep(3200)

  // 4. Username : effacer la suggestion puis saisir prénom + 5–8 car. aléatoires.
  let username = randomUsername(first)
  hooks?.log?.(`🏷 Username : @${username}`)
  // Le champ est sous le texte d'aide (~30 % de la hauteur, libellé « Username » dedans). L'ancien tap à 24 %
  // tombait sur le texte d'aide, fermait le clavier, et IG gardait sa suggestion (vu en direct).
  const uLbl = await findWordPoint(key, deviceId, [/^username$/i, /^utilisateur$/i], hooks, { minY: 0.2, maxY: 0.45, tries: 2 })
  const uy = uLbl ? uLbl.y + Math.round(0.025 * H) : Math.round(0.305 * H)
  await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.45 * W), y: uy }); await sleep(800)
  for (let i = 0; i < 30; i++) await sendAction(key, deviceId, { type: 'key', key: 'Backspace' }) // vide le champ
  await sleep(500)
  await sendAction(key, deviceId, { type: 'text', text: username })
  await sleep(1200)
  const inField = await readUsernameField(key, deviceId, uy)
  if (inField && !sameUsername(username, inField)) {
    hooks?.log?.(`   ⚠ le champ affiche @${inField} (saisie non prise) → on garde ce nom pour les identifiants`)
    username = inField
  }
  await tapNext('Next (username)')
  await sleep(3200)
  // Éventuel écran/Next intermédiaire.
  await tapButton(key, deviceId, [/^next$/i, /^suivant$/i], { x: 0.5, y: 0.4 }, W, H, hooks, [0.25, 0.55], 'Next (suite)', 1, [0, 1])
  await sleep(2000)

  // 5. Terms → I agree.
  hooks?.log?.('📜 Conditions → « I agree »…')
  if (!await tapButton(key, deviceId, [/i agree/i, /^agree$/i, /j.?accepte/i], { x: 0.5, y: 0.74 }, W, H, hooks, [0.6, 0.9], 'I agree', 4, [0, 1])) await tapFrac(0.5, 0.74)
  await sleep(3000)

  // 6. Écrans de fin : moteur piloté par l'écran (settleToFeed) — chaque écran connu a son action, et on ne
  //    s'arrête que sur le FIL Instagram (prêt à poster) ou sur un refus.
  const end = await settleToFeed(key, deviceId, hooks, opts?.container)
  if (end === 'refused') return { ok: false, creds: { username, password, fullName }, refused: true }
  if (end === 'captcha') return { ok: false, creds: { username, password, fullName }, captcha: true }
  hooks?.log?.(end === 'feed' ? `✅ Compte créé et fil Instagram affiché (prêt à poster) — 🔐 @${username} · ${password}` : `✅ Compte créé — 🔐 @${username} · ${password} (⚠ fil Instagram non confirmé à l’écran)`)
  return { ok: true, creds: { username, password, fullName }, ready: end === 'feed' }
}

// ── Moteur « écran → action » de fin d'inscription ──────────────────────────────
export type EndAction =
  | { kind: 'refused' } | { kind: 'captcha' } | { kind: 'feed' } | { kind: 'reopen'; why: string } | { kind: 'review' } | { kind: 'unfollowAll' }
  | { kind: 'tap'; x: number; y: number; label: string; double?: boolean }

/** Décide quoi faire selon les mots lus à l'écran (pure, testée). null = écran inconnu / transition. */
export function decideEndScreen(raw: { text: string; cx: number; cy: number; x?: number; w?: number; h?: number }[], W: number, H: number): EndAction | null {
  const words = withJoined(raw.map(o => ({ ...o, text: o.text.replace(/[^\p{L}\p{N}'’]/gu, '') })).filter(o => o.text))
  const find = (re: RegExp, minY = 0, maxY = 1) => words.find(o => re.test(o.text) && o.cy >= minY * H && o.cy <= maxY * H)
  const has = (re: RegExp, minY = 0, maxY = 1) => !!find(re, minY, maxY)
  // 1. Refus d'Instagram / retour à Join
  if (has(/^couldn['’]?t$/i) && (has(/^create$/i) || has(/^sign$/i))) return { kind: 'refused' }
  if (has(/^(started|getstarted)$/i, 0.6) && has(/^join$/i, 0.45)) return { kind: 'refused' }
  // 1b. Vérification humaine (« Confirm you're human to use your profile », captcha) → on ne la résout PAS :
  //     on passe au container suivant (règle du propriétaire)
  if (has(/^human$/i) && (has(/^confirm$/i) || has(/^you['’]?re$/i)) || has(/^(captcha|robot)$/i)) return { kind: 'captcha' }
  // 2. Alerte iOS de permission (« Would Like to Access Your Contacts / Send You Notifications / Use Your
  //    Location », suivi publicitaire) → « Don't Allow » / « Ask App Not to Track » (double tap : alerte iOS)
  if (has(/^would$/i) && has(/^like$/i) || has(/^track$/i) && has(/^ask$/i)) {
    const b = find(/^(don['’]?t|dontallow|ask|askapp)$/i, 0.3, 0.95)
    if (b) return { kind: 'tap', x: b.cx + 25, y: b.cy, label: 'Don’t Allow', double: true }
  }
  // 3. Cookies → « Allow all cookies » (double tap)
  if (has(/^cookies\??$/i, 0.05, 0.35)) { const b = find(/^(allow|allowall)$/i, 0.8); if (b) return { kind: 'tap', x: b.cx + 40, y: b.cy, label: 'Allow all cookies', double: true } }
  // 3a. Feuille « Allow Instagram to access your photos and videos » (par-dessus la galerie) → Continue
  //     (puis l'alerte iOS « Would Like to Access Your Photos » → Don't Allow, règle 2)
  // (« Continue » blanc sur bleu est souvent illisible → position du bouton en bas, ~94 %)
  if (has(/^access$/i, 0.3, 0.5) && has(/^videos$/i, 0.3, 0.5) && !has(/^please$/i)) { const b = find(/^continue$/i, 0.8); return { kind: 'tap', x: b ? b.cx : Math.round(W / 2), y: b ? b.cy : Math.round(0.94 * H), label: 'Continue (photos)' } }
  // 3b. Galerie photo ouverte par « Add profile picture » (en-tête « Cancel · Library · Done ») → Cancel
  if (has(/^library$/i, 0, 0.08) || (has(/^cancel$/i, 0, 0.08) && has(/^(photos|recents|library)$/i))) { const b = find(/^cancel$/i, 0, 0.08); if (b) return { kind: 'tap', x: b.cx, y: b.cy, label: 'Cancel (galerie)' } }
  // 4. « Review the settings for your new profile » (Turn on Notifications/Contacts/Location) → faire défiler
  //    jusqu'en bas puis le bouton bleu « Next » (jamais les « Turn on »), sans quitter l'app
  if ((has(/^review$/i) && has(/^settings$/i)) || (has(/^location$/i) && has(/^contacts$/i) && has(/^turn$/i))) {
    if (!has(/^(notnow|not)$/i, 0.6)) return { kind: 'review' }
  }
  // 5. Fil d'accueil : rangée des stories (« Your story ») → prêt à poster
  if (has(/^(your|yourstory)$/i, 0.08, 0.35) && has(/^story$/i, 0.08, 0.35) || has(/^yourstory$/i, 0.08, 0.35)) return { kind: 'feed' }
  // 6. « Save your login info? » → Save (évite de redemander la connexion)
  if (has(/^login$/i) && has(/^save$/i, 0.45)) { const b = find(/^save$/i, 0.45)!; return { kind: 'tap', x: b.cx, y: b.cy, label: 'Save (login)' } }
  // 7. Passer : Skip / Not now / Plus tard
  // « Follow 5 or more people » SANS Skip en haut : « Unselect all accounts to skip this step » → tout décocher
  const followTitle = has(/^follow$/i, 0.1, 0.3) && has(/^(people|more)$/i, 0.1, 0.3)
  if ((has(/^unselect$/i, 0.85) || followTitle) && !words.some(o => /^skip$/i.test(o.text) && o.cy <= 0.1 * H)) return { kind: 'unfollowAll' }
  // en bas OU en haut à droite (écran « Create a profile that shows your vibe » : Skip en haut à droite)
  const skipRe = /^(skip|notnow|ignorer|plustard|pasmaintenant|later|maybelater)$/i
  const skip = (has(/^unselect$/i) ? undefined : find(skipRe, 0.45)) ?? words.find(o => skipRe.test(o.text) && o.cy <= 0.1 * H && o.cx >= 0.6 * W)
  if (skip) return { kind: 'tap', x: skip.cx, y: skip.cy, label: skip.text }
  // 8. I agree (conditions)
  const agree = find(/^(iagree|agree|jaccepte|accepter)$/i, 0.5)
  if (agree) return { kind: 'tap', x: agree.cx, y: agree.cy, label: 'I agree' }
  // 9. Avancer : Next / Continue / Done
  const next = find(/^(next|suivant|continue|continuer|done|ok)$/i, 0.55)
  if (next) return { kind: 'tap', x: next.cx, y: next.cy, label: next.text }
  return null
}

/** Capture d'écran avec réessais (iRemoTech refuse parfois une capture rapprochée : limite de débit). */
async function snapRetry(key: string, deviceId: string): Promise<string | null> {
  let shot: string | null = null
  for (let k = 0; k < 4 && !shot; k++) { if (k) await sleep(1500 * k); shot = await snapshot(key, deviceId) }
  return shot
}

async function readScreenWords(key: string, deviceId: string): Promise<{ words: Awaited<ReturnType<typeof ocrWords>>; W: number; H: number } | null> {
  const shot = await snapRetry(key, deviceId)
  if (!shot) return null
  const { w: W, h: H } = await imgSize(shot)
  if (!W || !H) return null
  const wa = await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'] })
  const wb = await ocrWords(shot, undefined, { threshold: null, invert: true, scale: 2, psms: ['11'] })
  return { words: [...wa, ...wb], W, H }
}

/** Fait défiler les écrans de fin jusqu'au fil Instagram. 'feed' = prêt à poster, 'refused' = refus, 'unknown'. */
export async function settleToFeed(key: string, deviceId: string, hooks?: VisionHooks, container?: string): Promise<'feed' | 'refused' | 'captcha' | 'unknown'> {
  hooks?.log?.('⏭ Écrans de fin : lecture de l’écran → action, jusqu’au fil Instagram…')
  let idle = 0, reopened = false, last = '', unfollowRounds = 0
  let same = 0
  for (let step = 0; step < 28; step++) {
    if (hooks?.shouldStop?.()) return 'unknown'
    await sleep(1500)
    const scr = await readScreenWords(key, deviceId)
    if (!scr) { idle++; continue }
    const act = decideEndScreen(scr.words, scr.W, scr.H)
    if (act?.kind === 'refused') { hooks?.log?.('⛔ Instagram refuse la création (« We couldn’t create an account for you ») : anti-robot (IP, numéro ou créations trop rapprochées)'); await findTapText(key, deviceId, [/^ok$/i], hooks, { label: 'OK', tries: 1, minY: 0.4, maxY: 0.75 }); return 'refused' }
    if (act?.kind === 'feed') { hooks?.log?.('🏠 Fil Instagram affiché ✓'); return 'feed' }
    if (act?.kind === 'captcha') { hooks?.log?.('🤖 Vérification humaine demandée par Instagram → on passe au container suivant (non résolue)'); return 'captcha' }
    if (act?.kind === 'unfollowAll') {
      if (++unfollowRounds > 3) { hooks?.log?.('   ⚠ « Follow 5 » : impossible de tout décocher'); break }
      // décoche tout ce qui est visible, vérifie, défile une fois, revérifie ; puis le bouton du bas (« Next »)
      let scrolled = false
      for (let k = 0; k < 6; k++) {
        const sh = await snapshot(key, deviceId)
        const dots = sh ? await findBlueDots(sh, 0.84, 0.97, 0.33, 0.84) : []
        if (dots.length) {
          hooks?.log?.(`   ☐ « Follow 5 » : ${dots.length} compte(s) coché(s) → décoche`)
          for (const d of dots) { await sendAction(key, deviceId, { type: 'tap', x: d.cx, y: d.cy }); await sleep(700) }
          await sleep(800); continue
        }
        if (!scrolled) {
          hooks?.log?.('   ↓ « Follow 5 » : défilement de la liste pour trouver d’autres comptes cochés')
          await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(0.5 * scr.W), y1: Math.round(0.78 * scr.H), x2: Math.round(0.5 * scr.W), y2: Math.round(0.42 * scr.H), duration_ms: 500 })
          scrolled = true; await sleep(1200); continue
        }
        break
      }
      const sh = await snapshot(key, deviceId)
      const btn = sh ? await findBlueButton(sh, 0.84, 0.97, 0.1, 0.8) : null
      const bx = btn ? btn.cx : Math.round(scr.W / 2), by = btn ? btn.cy : Math.round(0.895 * scr.H)
      hooks?.log?.(`   👆 « Follow 5 » : plus rien de coché → bouton du bas (Next) (${bx}, ${by})`)
      await sendAction(key, deviceId, { type: 'tap', x: bx, y: by })
      idle = 0; await sleep(2500); continue
    }
    if (act?.kind === 'review') {
      hooks?.log?.('   ⚙ « Review the settings » → défilement jusqu’en bas puis « Next »')
      for (let k = 0; k < 2; k++) { await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(0.93 * scr.W), y1: Math.round(0.86 * scr.H), x2: Math.round(0.93 * scr.W), y2: Math.round(0.2 * scr.H), duration_ms: 500 }); await sleep(1200) }
      const sh = await snapshot(key, deviceId)
      const blue = sh ? await findBlueButton(sh, 0.85, 0.99, 0, 1) : null
      const bx = blue ? blue.cx : Math.round(scr.W / 2), by = blue ? blue.cy : Math.round(0.95 * scr.H)
      hooks?.log?.(`   👆 Next (bas de page) → tap (${bx}, ${by})`)
      await sendAction(key, deviceId, { type: 'tap', x: bx, y: by })
      idle = 0; await sleep(2500); continue
    }
    if (act?.kind === 'reopen' && !reopened) {
      hooks?.log?.(`   ⚙ écran « ${act.why} » → fermer Instagram puis rouvrir le MÊME container`)
      await forceCloseForegroundApp(key, deviceId, hooks)
      if (container) await selectContainerByVision(key, deviceId, container, hooks)
      await sleep(5000); reopened = true; idle = 0; continue
    }
    if (act?.kind === 'tap') {
      // même bouton tapé 3 fois sans effet → on bascule en double tap (alerte iOS qui ignore le tap simple)
      const sig = `${act.label}@${Math.round(act.y / 20)}`
      same = sig === last ? same + 1 : 0; last = sig
      const dbl = act.double || same >= 1
      hooks?.log?.(`   👆 ${act.label} → ${dbl ? 'double ' : ''}tap (${act.x}, ${act.y})`)
      if (dbl) await doubleTap(key, deviceId, act.x, act.y)
      else await sendAction(key, deviceId, { type: 'tap', x: act.x, y: act.y })
      if (same >= 5) { hooks?.log?.('   ⚠ écran bloqué sur le même bouton'); break }
      idle = 0; await sleep(1500); continue
    }
    // Écran inconnu avec un bouton bleu : 1er passage → « Skip » juste dessous ; si l'écran n'a pas bougé →
    // le bouton bleu lui-même (Next / Continue mal lu). On ne quitte JAMAIS le container ici.
    const shot = await snapshot(key, deviceId)
    const blue = shot ? await findBlueButton(shot, 0.6, 0.97, 0.1, 0.8) : null
    if (blue) {
      if (idle % 2 === 0) {
        const belowY = Math.min(scr.H - 6, blue.cy + Math.round(0.075 * scr.H))
        hooks?.log?.(`   ⏭ bouton bleu en ${blue.cy} → d’abord « Skip » dessous (${blue.cx}, ${belowY})`)
        await sendAction(key, deviceId, { type: 'tap', x: blue.cx, y: belowY })
      } else {
        hooks?.log?.(`   👆 écran inchangé → bouton bleu (${blue.cx}, ${blue.cy})`)
        await sendAction(key, deviceId, { type: 'tap', x: blue.cx, y: blue.cy })
      }
    } else if (idle >= 3) {
      // rien de lisible : on tente « Retour » du système (sans fermer l'app)
      hooks?.log?.('   … écran sans bouton reconnu, on attend')
    }
    idle++
    if (idle >= 10) break
  }
  return 'unknown'
}

/** Le nom lu par l'OCR est-il le nom tapé (au bruit de lecture près : 5↔s, 0↔o, 1↔l…) ? */
export function sameUsername(typed: string, read: string): boolean {
  const n = (v: string) => v.toLowerCase().replace(/5/g, 's').replace(/0/g, 'o').replace(/[1i|]/g, 'l').replace(/8/g, 'b').replace(/6/g, 'g').replace(/2/g, 'z')
  const a = n(typed), b = n(read)
  if (a === b) return true
  // distance d'édition ≤ 2 (un caractère mal lu / manqué)
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length] <= 2
}

/** Valeur lue dans le champ Username (mot type identifiant sur la ligne du champ), null si illisible. */
async function readUsernameField(key: string, deviceId: string, fieldY: number): Promise<string | null> {
  const shot = await snapshot(key, deviceId)
  if (!shot) return null
  const { h: H } = await imgSize(shot)
  const words = await ocrWords(shot)
  // il faut être sur l'écran « Create a username » (libellé du champ présent), sinon on ne lit rien
  if (!words.some(o => /^username$/i.test(o.text))) return null
  const w = words.filter(o => Math.abs(o.cy - fieldY) < H * 0.06 && /^[a-z0-9._]{4,30}$/i.test(o.text) && !/^(username|password|create|next|add|change)$/i.test(o.text))
  return w.length ? w.sort((a, b) => b.text.length - a.text.length)[0].text.toLowerCase() : null
}

/** Écran « Allow the use of cookies by Instagram? » → « Allow all cookies ». true si l'écran a disparu. */
export async function acceptCookiesIfShown(key: string, deviceId: string, hooks?: VisionHooks, container?: string): Promise<boolean> {
  const onCookies = () => hasText(key, deviceId, [/^cookies\??$/i], hooks, { tries: 1, cropY: [0.05, 0.35] })
  if (!await onCookies()) return true
  for (let round = 0; round < 3; round++) {
    hooks?.log?.(round ? `🍪 Cookies toujours affichés → redémarrage d’Instagram (${round}/2)` : '🍪 Écran des cookies → « Allow all cookies »')
    if (round) {
      // écran figé (même à la main) : on ferme Instagram et on rouvre le container
      await forceCloseForegroundApp(key, deviceId, hooks)
      if (!container || !await selectContainerByVision(key, deviceId, container, hooks)) break
      await sleep(6000)
      if (!await onCookies()) return true
    }
    for (let i = 0; i < 2; i++) {
      const pt = await findWordPoint(key, deviceId, [/^allow$/i, /^autoriser$/i], hooks, { tries: 2, minY: 0.8 })
      if (!pt) break
      await doubleTap(key, deviceId, pt.x, pt.y)
      await sleep(3000)
      if (!await onCookies()) { hooks?.log?.('   cookies acceptés ✓'); return true }
    }
  }
  hooks?.log?.('   ⚠ l’écran des cookies ne répond pas : à valider plus tard à la main')
  return false
}

// ── Warm-up piloté à la VISION (activité humaine sur les Reels) ────────────────
// Après selectContainerByVision (IG ouvert), on va sur l'onglet Reels puis, pendant
// une durée tirée au hasard, on défile : on regarde chaque reel un temps aléatoire
// (parfois un « glance » court), on like selon un taux, on commente selon un taux.
// Comportement aléatoire à chaque session → reste humain.
export interface WarmupOpts {
  minMs: number            // durée mini de la session (ms)
  maxMs: number            // durée maxi de la session (ms)
  likeRate: number         // 0..1 : proba de liker un reel
  commentRate?: number     // 0..1 : proba de commenter un reel
  comments?: string[]      // pool de commentaires (tirés au hasard)
  glanceRate?: number      // 0..1 : proba de « glance » (regard court) — défaut 0.25
}
export interface WarmupResult { ok: boolean; reels: number; likes: number; comments: number }

const REELS_TAB = { x: 0.70, y: 0.965 } // onglet Reels dans la barre du bas (5 icônes)
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export async function warmupByVision(key: string, deviceId: string, opts: WarmupOpts, hooks?: VisionHooks): Promise<WarmupResult> {
  const shot0 = await snapshot(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible (warm-up)'); return { ok: false, reels: 0, likes: 0, comments: 0 } }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })
  const glanceRate = opts.glanceRate ?? 0.25

  // 0. Fermer un éventuel popup, puis ouvrir l'onglet Reels.
  await dismissPopups(key, deviceId, hooks)
  hooks?.log?.('🔥 Warm-up : ouverture des Reels…')
  await tapFrac(REELS_TAB.x, REELS_TAB.y)
  await sleep(2800)

  const duration = Math.round(rnd(opts.minMs, opts.maxMs))
  const endAt = Date.now() + duration
  hooks?.log?.(`   session ~${Math.round(duration / 1000)}s (like ${Math.round(opts.likeRate * 100)}%${opts.commentRate ? `, comment ${Math.round(opts.commentRate * 100)}%` : ''})`)
  let reels = 0, likes = 0, comments = 0

  while (Date.now() < endAt) {
    if (hooks?.shouldStop?.()) break
    // Regarder le reel : dwell aléatoire (glance court OU visionnage plus long).
    const glance = Math.random() < glanceRate
    await sleep(Math.round(glance ? rnd(800, 2200) : rnd(3500, 9000)))
    reels++
    if (hooks?.shouldStop?.()) break

    // Like (double-tap au centre) selon le taux.
    if (Math.random() < opts.likeRate) {
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.5 * W), y: Math.round(0.45 * H) })
      await sleep(150)
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.5 * W), y: Math.round(0.45 * H) })
      likes++
      hooks?.log?.(`   ❤️ like (${likes})`)
      await sleep(Math.round(rnd(600, 1400)))
    }

    // Commentaire (best-effort) selon le taux.
    if (opts.commentRate && opts.comments && opts.comments.length && Math.random() < opts.commentRate) {
      const text = opts.comments[Math.floor(Math.random() * opts.comments.length)]
      const ok = await tryComment(key, deviceId, text, W, H, hooks)
      if (ok) { comments++; hooks?.log?.(`   💬 commenté : "${text}"`) }
    }

    // Reel suivant : swipe vers le haut.
    await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(0.5 * W), y1: Math.round(0.80 * H), x2: Math.round(0.5 * W), y2: Math.round(0.20 * H), duration_ms: 350 })
    await sleep(Math.round(rnd(500, 1300)))
  }

  hooks?.log?.(`🏁 Warm-up terminé : ${reels} reels · ${likes} likes · ${comments} comments.`)
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1000)
  return { ok: true, reels, likes, comments }
}

// Poste un commentaire sur le reel courant (best-effort) : ouvre les commentaires
// (icône bulle, droite), tape le champ, écrit, poste, puis referme.
async function tryComment(key: string, deviceId: string, text: string, W: number, H: number, hooks?: VisionHooks): Promise<boolean> {
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })
  try {
    await tapFrac(0.92, 0.55)   // icône commentaire (colonne d'actions à droite)
    await sleep(1800)
    await tapFrac(0.5, 0.92)    // champ « Add a comment… » en bas
    await sleep(1000)
    await sendAction(key, deviceId, { type: 'text', text })
    await sleep(800)
    // Bouton d'envoi (flèche/Post) à droite du champ, sinon on abandonne proprement.
    if (!await tapButton(key, deviceId, [/^post$/i, /^send$/i, /publier/i, /envoyer/i], { x: 0.92, y: 0.92 }, W, H, hooks, [0.85, 1], 'Post commentaire', 2, [0.6, 1])) {
      await sendAction(key, deviceId, { type: 'press', name: 'back' }); return false
    }
    await sleep(900)
    await sendAction(key, deviceId, { type: 'press', name: 'back' }) // referme la feuille commentaires
    await sleep(700)
    return true
  } catch { return false }
}

// ── Publication d'une STORY pilotée à la VISION (base — flow lien à compléter) ──
// Chemin (Instagram EN) d'après captures : (+ créateur) → mode STORY → galerie
// (vignette bas-gauche) → 1re vidéo (dernière uploadée) → Done (haut-droite) →
// icône sticker (droite) → [sticker lien + partage — à venir].
const STORY_ANCHORS = {
  galleryThumb: { x: 0.09, y: 0.93 }, // vignette galerie en bas-gauche du story camera (repli si non repérée)
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
  await grantPhotoAccessIfAsked(key, deviceId, hooks)
  // 2. Mode STORY (bandeau du bas). Barre masquée (Instagram a rouvert la caméra Story, une
  //    bulle d'effet la remplace) + vignette de galerie en bas-gauche → déjà sur la caméra.
  //    (Si c'était la caméra Reel, l'écran « Add link » n'apparaîtrait jamais → abandon sans post.)
  const inStoryCamera = async (s: string) => !!await findGalleryThumb(s)
  if (!await selectMode(key, deviceId, [/story|stories/i], 'STORY', hooks, inStoryCamera)) return false
  await sleep(1600)
  // 3. Ouvrir la galerie : la VIGNETTE en bas-gauche = dernier média de la pellicule, donc la
  //    vidéo qu'on vient d'envoyer. Repérée à l'image (bordure blanche) ; son aperçu sert
  //    ensuite à retrouver CE média dans la galerie.
  hooks?.log?.('🖼️ Ouverture de la galerie (vignette en bas à gauche)…')
  const camShot = await snapshot(key, deviceId)
  const thumb = camShot ? await findGalleryThumb(camShot) : null
  const tx = thumb ? thumb.cx : Math.round(A.galleryThumb.x * W), ty = thumb ? thumb.cy : Math.round(A.galleryThumb.y * H)
  hooks?.log?.(thumb ? `   vignette repérée → tap (${tx}, ${ty})` : `   vignette non repérée → position connue (${tx}, ${ty})`)
  // Galerie ouverte = la vignette a disparu (ou, sans repère, un titre de galerie est lu).
  const galleryOpen = async () => {
    if (!thumb) return hasText(key, deviceId, [/^recents?$/i, /^r[ée]cents?$/i, /^select$/i, /^s[ée]lectionner$/i, /^gallery$/i, /^galerie$/i, /^pellicule$/i], hooks, { cropY: [0, 0.5], tries: 2 })
    const s = await snapshot(key, deviceId)
    const t2 = s ? await findGalleryThumb(s) : null
    return !t2 || Math.abs(t2.cx - thumb.cx) > thumb.size || Math.abs(t2.cy - thumb.cy) > thumb.size
  }
  let opened = false
  for (let attempt = 0; attempt < 3 && !opened; attempt++) {
    if (hooks?.shouldStop?.()) return false
    if (attempt < 2) await sendAction(key, deviceId, { type: 'tap', x: tx, y: ty })
    else {
      // Dernier recours : balayage VERTICAL vers le haut (ouvre la pellicule, sans toucher aux effets).
      hooks?.log?.('   ↑ balayage vers le haut pour ouvrir la pellicule…')
      await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * 0.5), y1: Math.round(H * 0.6), x2: Math.round(W * 0.5), y2: Math.round(H * 0.2), duration_ms: 400 })
    }
    await sleep(1800)
    opened = await galleryOpen()
    if (!opened) hooks?.log?.(`   galerie pas encore ouverte (essai ${attempt + 1}/3)`)
  }
  if (!opened) { hooks?.log?.('❌ galerie non ouverte → container suivant'); return false }
  // 4. La vidéo la plus récente : la case de la galerie qui montre le même média que la vignette
  //    (repli : 1re case, position connue).
  hooks?.log?.('🎞️ Sélection de la vidéo la plus récente…')
  let cell: { cx: number; cy: number } | null = null
  for (let i = 0; i < 2 && thumb && !cell; i++) {
    if (i) await sleep(1200) // vignettes de la galerie encore en chargement
    const g = await snapshot(key, deviceId)
    cell = g ? await findMatchingCell(g, thumb.sig) : null
  }
  if (cell) {
    hooks?.log?.(`🎞️ vidéo la plus récente repérée (case ${cell.cx}, ${cell.cy}) → tap`)
    await sendAction(key, deviceId, { type: 'tap', x: cell.cx, y: cell.cy })
  } else {
    hooks?.log?.('   vidéo non reconnue dans la galerie → 1re case (position connue)')
    await tapFrac(A.firstThumb.x, A.firstThumb.y)
  }
  await sleep(3500) // laisse le média se charger (le « Done » apparaît ensuite)
  await dismissIgInfoSheet(key, deviceId, hooks) // « Introducing story-to-story sharing » (iPhone normal)
  // 5. Done (haut-droite) — si absent, on saute juste l'étape et on continue (des fois il n'y en a pas).
  //    Zone [0,04 ; 0,16] : la barre d'état (souvent bleue) était prise pour le bouton.
  if (!await tapButton(key, deviceId, [/^done$|terminé/i], A.doneBtn, W, H, hooks, [0.04, 0.16], 'Done', 6)) hooks?.log?.('   (pas de Done → on continue)')
  await sleep(2600)
  await dismissIgInfoSheet(key, deviceId, hooks)
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
    const ig = withJoined([...wa, ...wb]).find(o => isInstagramText(o.text))
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

/** Lignes du sélecteur Crane : noms (chiffres ou « Default ») CENTRÉS horizontalement, sous la barre d'état.
 *  Les icônes de l'écran d'accueil derrière la feuille (« 40 »…) sont décentrées et écartées. */
export function pickerRows<T extends { text: string; cx: number; cy: number }>(words: T[], W: number, H: number): T[] {
  return words.filter(o => o.text && (/^\d{1,3}$/.test(o.text) || /^default$/i.test(o.text)) && o.cy > H * 0.13 && Math.abs(o.cx - W / 2) < W * 0.12)
}

/** Noms de containers lus à l'écran (chiffres ou « Default »), triés : Default puis 1, 2, 3… */
export function sortContainerNames(names: Iterable<string>): string[] {
  const l = [...new Set([...names].map(n => /^default$/i.test(n) ? 'Default' : String(parseInt(n, 10))).filter(n => n === 'Default' || /^\d{1,3}$/.test(n)))]
  return l.sort((a, b) => a === 'Default' ? -1 : b === 'Default' ? 1 : Number(a) - Number(b))
}

/** DÉTECTION des containers Crane d'un iPhone : ouvre le sélecteur (tap sur l'icône Instagram), lit tous
 *  les noms visibles SANS faire défiler (un balayage ouvrirait un container), puis referme (accueil).
 *  null = sélecteur introuvable. */
export async function detectContainersByVision(key: string, deviceId: string, hooks?: VisionHooks): Promise<string[] | null> {
  hooks?.log?.('🏠 Retour à l’écran d’accueil…')
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1200)
  hooks?.log?.('📲 Ouverture du sélecteur de containers (icône Instagram)…')
  if (!await tapInstagramIcon(key, deviceId, hooks)) { hooks?.log?.('❌ Icône Instagram introuvable sur l’accueil (mets-la sur la 1re page).'); return null }
  await sleep(2800)
  const found = new Set<string>()
  let overflow = false
  for (let k = 0; k < 3 && !found.size; k++) {
    if (k) await sleep(1500)
    const shot = await snapshot(key, deviceId)
    if (!shot) continue
    const { w: W, h: H } = await imgSize(shot)
    const rows = pickerRows(await ocrWords(shot, '0123456789Defaultefaul'), W, H)
    for (const r of sortContainerNames(rows.map(o => o.text))) found.add(r)
    // feuille qui monte jusqu'en haut de l'écran = plus de containers qu'il n'en tient à l'écran
    if (rows.length && Math.min(...rows.map(o => o.cy)) < H * 0.2) overflow = true
  }
  if (!found.size) { hooks?.log?.('❌ Sélecteur « Select Container » non détecté (Crane installé ? Instagram en plusieurs containers ?)'); await sendAction(key, deviceId, { type: 'press', name: 'home' }); return null }
  if (overflow) hooks?.log?.('⚠ Le sélecteur déborde de l’écran : les containers du bas ne sont pas lisibles sans le faire défiler (ce qui en ouvrirait un). Ajoute-les à la main si besoin.')
  const list = sortContainerNames(found)
  hooks?.log?.(`✅ ${list.length} container(s) détecté(s) : ${list.join(', ')}`)
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  return list
}

// ── iPhone NON jailbreaké : plusieurs comptes dans Instagram (pas de containers) ────────────────────────
// Profil → tap sur le nom en haut → feuille « liste des comptes · Add Instagram account · Go to Accounts Center ».
// Une cible « @username » (au lieu d'un nom de container) = basculer sur ce compte via cette feuille.
const ACCOUNT_STOP = /^(add|instagram|account|accounts|go|to|center|meta|switch|log|into|existing|create|new|profile)$/i

/** Ligne « Add Instagram account » de la feuille (et pas les boutons « Add photo / Add bio » du profil). */
function addAccountRowY(words: { text: string; cx: number; cy: number }[]): number | null {
  const add = words.filter(o => /^add$/i.test(o.text)).find(a => words.some(o => /^instagram$/i.test(o.text) && Math.abs(o.cy - a.cy) < 12))
  if (add) return add.cy
  const go = words.find(o => /^go$/i.test(o.text) && words.some(m => /^(meta|accounts)$/i.test(m.text) && Math.abs(m.cy - o.cy) < 12))
  return go ? go.cy - 70 : null
}

/** Noms de comptes lus dans la feuille de bascule (pure, testée) : identifiants alignés à gauche, sous le haut de la feuille. */
export function sheetUsernames(words: { text: string; cx: number; cy: number }[], W: number, H: number): string[] {
  const top = addAccountRowY(words) // la liste est au-dessus de « Add Instagram account »
  if (top == null) return [] // pas la feuille des comptes
  const out: { u: string; y: number }[] = []
  for (const o of words) {
    const t = o.text.toLowerCase().replace(/[^a-z0-9._]/g, '')
    if (t.length < 3 || t.length > 30 || !/[a-z]/.test(t) || ACCOUNT_STOP.test(t)) continue
    if (o.cy < H * 0.25 || o.cy >= top || o.cx > W * 0.75) continue
    // même compte lu deux fois (lecture « minuscules/chiffres » d'abord, puis lecture normale : 5↔S, 0↔O…)
    if (!out.some(x => sameUsername(x.u, t) || Math.abs(x.y - o.cy) < 12)) out.push({ u: t, y: o.cy })
  }
  return out.sort((a, b) => a.y - b.y).map(x => x.u)
}

/** Instagram ouvert à neuf depuis l'accueil. 'picker' = iPhone jailbreaké (sélecteur Crane), 'app' = Instagram direct. */
async function openInstagramApp(key: string, deviceId: string, hooks?: VisionHooks): Promise<'app' | 'picker' | null> {
  await allowShortcutPrompt(key, deviceId, hooks)
  await grantPhotoAccessIfAsked(key, deviceId, hooks) // alertes iOS restées à l'écran (elles bloquent tous les taps)
  await sendAction(key, deviceId, { type: 'press', name: 'home' }); await sleep(1500)
  if (!await tapInstagramIcon(key, deviceId, hooks)) { hooks?.log?.('❌ Icône Instagram introuvable sur l’accueil.'); return null }
  await sleep(3500)
  await grantPhotoAccessIfAsked(key, deviceId, hooks) // alerte « accès aux photos » restée d'une tentative précédente
  const shot = await snapshot(key, deviceId)
  if (!shot) return 'app'
  const { w: W, h: H } = await imgSize(shot)
  // sélecteur Crane = « Default » + au moins un autre container (les compteurs « 0 posts / 0 followers » du profil ne comptent pas)
  const rows = pickerRows(await ocrWords(shot, '0123456789Defaultefaul'), W, H)
  return rows.length >= 2 && rows.some(o => /^default$/i.test(o.text)) ? 'picker' : 'app'
}

/** Ouvre la feuille de bascule de comptes (onglet Profil → nom en haut). Renvoie les mots lus, ou null. */
/** Ramène Instagram sur un écran avec la barre d'onglets (il rouvre là où on l'a laissé : créateur, Reel plein écran…). */
async function backToTabs(key: string, deviceId: string, hooks?: VisionHooks): Promise<void> {
  for (let k = 0; k < 4; k++) {
    const scr = await readScreenWords(key, deviceId)
    if (!scr) return
    const { words, W, H } = scr
    const top = (re: RegExp) => words.some(o => re.test(o.text) && o.cy < H * 0.12)
    if (words.some(o => /^shared$/i.test(o.text)) && words.some(o => /^reels$/i.test(o.text))) {
      // popup « Video posts are now shared as reels » → OK (bas de la feuille, au-dessus de « Go to settings »)
      const ok = words.find(o => /^ok$/i.test(o.text) && o.cy > H * 0.6)
      hooks?.log?.('   popup « vidéos partagées en reels » → OK')
      await sendAction(key, deviceId, { type: 'tap', x: ok ? ok.cx : Math.round(W / 2), y: ok ? ok.cy : Math.round(0.9 * H) }); await sleep(1800); continue
    }
    const discard = words.find(o => /^discard$/i.test(o.text) && o.cy > H * 0.3)
    if (discard) { hooks?.log?.('   « Discard » (brouillon abandonné)'); await sendAction(key, deviceId, { type: 'tap', x: discard.cx, y: discard.cy }); await sleep(1800); continue }
    const editor = (words.some(o => /^edit$/i.test(o.text) && o.cy > H * 0.9) && words.some(o => /^video$/i.test(o.text) && o.cy > H * 0.9))
      || (top(/^suggested$/i) && top(/^audio$/i)) // éditeur de Reel / Story (« Suggested audio » en haut)
    if (await dismissIgInfoSheet(key, deviceId, hooks)) continue
    // outil Texte d'une story (« Classic / Modern », « Done » en haut) → Done
    if (words.some(o => /^(classic|modern|signature)$/i.test(o.text) && o.cy > H * 0.7) && top(/^done$/i)) {
      const d = words.find(o => /^done$/i.test(o.text) && o.cy < H * 0.12)!
      hooks?.log?.('   outil Texte de story → Done')
      await sendAction(key, deviceId, { type: 'tap', x: d.cx, y: d.cy }); await sleep(1500); continue
    }
    // page « Locations » ouverte par erreur → Cancel
    if (top(/^locations$/i) && top(/^cancel$/i)) {
      const c = words.find(o => /^cancel$/i.test(o.text) && o.cy < H * 0.12)!
      hooks?.log?.('   page « Locations » → Cancel')
      await sendAction(key, deviceId, { type: 'tap', x: c.cx, y: c.cy }); await sleep(1500); continue
    }
    if (editor || top(/^new$/i) && top(/^(reel|post)$/i) || top(/^story$/i) && words.some(o => /^(post|instants|live)$/i.test(o.text) && o.cy > H * 0.9)) {
      hooks?.log?.('   créateur ouvert → ✕ en haut à gauche')
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.09 * W), y: Math.round(0.08 * H) }); await sleep(1800); continue
    }
    if (top(/^(controls|settings)$/i)) {
      hooks?.log?.('   page de réglages ouverte par erreur → ✕')
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.08 * W), y: Math.round(0.064 * H) }); await sleep(1800); continue
    }
    if (top(/^reels$/i) && top(/^friends$/i)) {
      hooks?.log?.('   Reel plein écran → retour')
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.08 * W), y: Math.round(0.068 * H) }); await sleep(1800); continue
    }
    return
  }
}

async function openAccountSheet(key: string, deviceId: string, hooks?: VisionHooks): Promise<{ words: Awaited<ReturnType<typeof ocrWords>>; W: number; H: number } | null> {
  const isSheet = (scr: { words: { text: string; cx: number; cy: number }[]; H: number } | null) => !!scr && (addAccountRowY(scr.words) ?? 0) > scr.H * 0.4
  // « followers » ET « following » en haut (le mot « posts » seul trompait : popup « Video posts are now shared… »)
  const isProfile = (scr: { words: { text: string; cy: number }[]; H: number } | null) => !!scr && scr.words.some(o => /^followers$/i.test(o.text) && o.cy < scr.H * 0.35) && scr.words.some(o => /^following$/i.test(o.text) && o.cy < scr.H * 0.35)
  let scr = await readScreenWords(key, deviceId)
  if (!scr) return null
  if (isSheet(scr)) return scr // Instagram rouvert là où on l'avait laissé : la feuille est déjà ouverte
  const { W, H } = scr
  // 1. onglet Profil (vérifié : « followers / following » à l'écran), jusqu'à 3 taps ; d'abord retour à un écran
  //    avec la barre d'onglets (Instagram rouvre là où on l'a laissé : créateur, Reel plein écran, popup…)
  for (let k = 0; k < 3 && !isProfile(scr); k++) {
    if (k === 0) await backToTabs(key, deviceId, hooks)
    else hooks?.log?.('   onglet Profil pas ouvert → nouveau tap')
    const px = Math.round(0.9 * W), py = Math.round(0.963 * H)
    if (k) await doubleTap(key, deviceId, px, py) // tap simple parfois ignoré ; double tap sans risque sur cet onglet
    else await sendAction(key, deviceId, { type: 'tap', x: px, y: py })
    await sleep(2500); scr = await readScreenWords(key, deviceId)
    if (isSheet(scr)) return scr
  }
  if (!isProfile(scr)) return null
  // 2. nom du compte en haut (avec ⌄) → feuille des comptes, jusqu'à 3 taps
  for (let k = 0; k < 3; k++) {
    if (k) hooks?.log?.('   liste des comptes pas ouverte → nouveau tap')
    await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.5 * W), y: Math.round(0.068 * H) })
    await sleep(2200); scr = await readScreenWords(key, deviceId)
    if (isSheet(scr)) return scr
  }
  return null
}

async function closeAccountSheet(key: string, deviceId: string, W: number, H: number): Promise<void> {
  await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.5 * W), y: Math.round(0.15 * H) }) // zone grisée au-dessus
  await sleep(1200)
}

/** DÉTECTION des comptes Instagram d'un iPhone non jailbreaké. null = feuille introuvable. */
export async function detectAccountsByVision(key: string, deviceId: string, hooks?: VisionHooks): Promise<string[] | null> {
  hooks?.log?.('📲 Ouverture d’Instagram…')
  const mode = await openInstagramApp(key, deviceId, hooks)
  if (mode !== 'app') { if (mode === 'picker') await sendAction(key, deviceId, { type: 'press', name: 'home' }); return null }
  hooks?.log?.('👤 Profil → liste des comptes…')
  const scr = await openAccountSheet(key, deviceId, hooks)
  if (!scr) { hooks?.log?.('❌ Liste des comptes introuvable (onglet Profil → nom en haut).'); return null }
  // lecture « minuscules / chiffres / . _ » en premier : bien plus juste sur les identifiants (lucielr5c0 et non lucielrScO)
  const shot = await snapRetry(key, deviceId)
  const exact = shot ? await ocrWords(shot, 'abcdefghijklmnopqrstuvwxyz0123456789._', { threshold: null, scale: 2, psms: ['11'] }) : []
  const list = sheetUsernames([...exact, ...scr.words], scr.W, scr.H)
  await closeAccountSheet(key, deviceId, scr.W, scr.H)
  hooks?.log?.(list.length ? `✅ ${list.length} compte(s) détecté(s) : ${list.map(u => '@' + u).join(', ')}` : '❌ Aucun compte lu dans la liste')
  return list.length ? list : null
}

/** Bascule sur @username (iPhone non jailbreaké) et vérifie que c'est bien lui qui est actif : dans la feuille des
 *  comptes, le compte actif porte la coche bleue (le gros nom en haut, grisé, n'est pas lisible par l'OCR). */
export async function switchAccountByVision(key: string, deviceId: string, username: string, hooks?: VisionHooks): Promise<boolean> {
  const u = username.replace(/^@/, '').toLowerCase()
  hooks?.log?.(`👤 Bascule sur @${u}…`)
  if (await openInstagramApp(key, deviceId, hooks) !== 'app') { hooks?.log?.('❌ Instagram ne s’ouvre pas directement (iPhone jailbreaké ?)'); return false }
  for (let k = 0; k < 3; k++) {
    const scr = await openAccountSheet(key, deviceId, hooks)
    if (!scr) { hooks?.log?.('❌ Liste des comptes introuvable'); return false }
    const shot = await snapRetry(key, deviceId)
    const exact = shot ? await ocrWords(shot, 'abcdefghijklmnopqrstuvwxyz0123456789._', { threshold: null, scale: 2, psms: ['11'] }) : []
    const all = [...exact, ...scr.words]
    const top = addAccountRowY(all) ?? scr.H
    const row = all.find(o => o.cy > scr.H * 0.25 && o.cy < top && sameUsername(u, o.text.toLowerCase().replace(/[^a-z0-9._]/g, '')))
    if (!row) { hooks?.log?.(`❌ @${u} n’est pas dans la liste des comptes de cet iPhone (lu : ${sheetUsernames(all, scr.W, scr.H).map(x => '@' + x).join(', ') || 'rien'})`); await closeAccountSheet(key, deviceId, scr.W, scr.H); return false }
    const dots = shot ? await findBlueDots(shot, 0.8, 0.95, 0.25, 0.95) : []
    if (dots.some(d => Math.abs(d.cy - row.cy) < 20)) {
      hooks?.log?.(`   ✓ compte actif : @${u}`)
      await closeAccountSheet(key, deviceId, scr.W, scr.H)
      // on est sur le profil : publications / abonnés / abonnements lus à l'écran → onglet « Comptes Instagram »
      let counts = null as { media_count: number | null; followers: number | null; following: number | null } | null
      for (let k = 0; k < 3; k++) { // la feuille finit de se fermer → jusqu'à 3 lectures, on fusionne
        if (k) await sleep(1200)
        const prof = await readScreenWords(key, deviceId)
        // Lecture zoomée de la seule bande des chiffres (au-dessus de « posts / followers / following ») : un « 0 » isolé
        // est illisible sur l'écran entier. 3 nombres lus → attribués de gauche à droite.
        let c = prof ? parseProfileCounts(prof.words) : null
        // chaque compteur lu DANS SA PROPRE BOÎTE (au-dessus de son libellé), zoomé, chiffres seulement
        if (prof) {
          const ps = await snapRetry(key, deviceId)
          const box = async (re: RegExp) => {
            const lab = prof.words.find(o => re.test(o.text))
            if (!ps || !lab) return null
            const W = prof.W, H = prof.H
            const crop = { cropY: [Math.max(0, (lab.cy - 36) / H), Math.min(1, (lab.cy - 7) / H)] as [number, number], cropX: [Math.max(0, (lab.x - 12) / W), Math.min(1, (lab.x + lab.w + 12) / W)] as [number, number] }
            // vote sur 3 lectures (binarisé, gris, plus gros) : un chiffre isolé est parfois mal lu par l'une d'elles
            const votes: number[] = []
            for (const o of [{ scale: 4, psms: ['7'] }, { scale: 4, threshold: null, psms: ['7'] }, { scale: 6, psms: ['8'] }]) {
              const v = (await ocrWords(ps, '0123456789.,KMkm', { ...o, ...crop })).map(w => parseCount(w.text)).find(x => x != null)
              if (v != null) votes.push(v)
            }
            if (!votes.length) return null
            const tally = new Map<number, number>(); for (const v of votes) tally.set(v, (tally.get(v) ?? 0) + 1)
            return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]
          }
          const z = { media_count: await box(/^(posts?|publications?)$/i), followers: await box(/^(followers?|abonnés?)$/i), following: await box(/^(following|abonnements?)$/i) }
          c = { media_count: z.media_count ?? c?.media_count ?? null, followers: z.followers ?? c?.followers ?? null, following: z.following ?? c?.following ?? null }
        }
        if (c) counts = { media_count: counts?.media_count ?? c.media_count, followers: counts?.followers ?? c.followers, following: counts?.following ?? c.following }
        if (counts && counts.media_count != null && counts.followers != null && counts.following != null) break
      }
      if (counts) { saveScreenStats(u, counts); hooks?.log?.(`   📊 ${counts.media_count ?? '?'} publications · ${counts.followers ?? '?'} abonnés · ${counts.following ?? '?'} abonnements`) }
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.1 * scr.W), y: Math.round(0.963 * scr.H) }) // accueil d'Instagram
      await sleep(1500)
      return true
    }
    const x = Math.round(0.45 * scr.W) // dans la ligne, à côté du texte (un tap pile sur les lettres est parfois ignoré)
    hooks?.log?.(`   tap sur @${u} (ligne y=${row.cy}, coches y=${dots.map(d => d.cy).join('/') || 'aucune'})`)
    if (k) await doubleTap(key, deviceId, x, row.cy); else await sendAction(key, deviceId, { type: 'tap', x, y: row.cy })
    await sleep(4500) // Instagram recharge le profil du compte → on rouvre la feuille pour vérifier la coche
  }
  hooks?.log?.(`❌ bascule sur @${u} non confirmée`)
  return false
}

/** Ouvre une cible de posting : « @username » (compte d'un iPhone non jailbreaké) ou nom de container Crane. */
export async function openTargetByVision(key: string, deviceId: string, target: string, hooks?: VisionHooks): Promise<boolean> {
  return target.startsWith('@') ? switchAccountByVision(key, deviceId, target, hooks) : selectContainerByVision(key, deviceId, target, hooks)
}

// Ouvre Instagram (via l'icône → déclenche le sélecteur Crane) puis sélectionne le container.
export async function selectContainerByVision(key: string, deviceId: string, target: string, hooks?: VisionHooks): Promise<boolean> {
  await allowShortcutPrompt(key, deviceId, hooks)
  // 2 essais : vu en direct, un « home » ignoré laissait Instagram ouvert → le mot « Instagram » de l'app était
  // pris pour l'icône, et le sélecteur ne s'ouvrait jamais. On ferme alors l'app et on recommence.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) { hooks?.log?.('   ↻ sélecteur pas ouvert → fermeture d’Instagram et nouvel essai'); await forceCloseForegroundApp(key, deviceId, hooks) }
    hooks?.log?.('🏠 Retour à l’écran d’accueil…')
    await sendAction(key, deviceId, { type: 'press', name: 'home' })
    await sleep(1500)
    hooks?.log?.('📲 Recherche de l’icône Instagram…')
    const opened = await tapInstagramIcon(key, deviceId, hooks)
    if (!opened) { hooks?.log?.('❌ Icône Instagram introuvable sur l’accueil (mets-la sur la 1re page).'); continue }
    await sleep(2800) // laisse le sélecteur Crane apparaître
    if (await findAndTapContainer(key, deviceId, target, hooks)) return true
  }
  return false
}
