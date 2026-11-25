// Automatisation iRemoTech par VISION : on lit l'écran (OCR) pour trouver le bon
// container Crane dans le sélecteur « Select Container » et taper dessus, en scrollant
// tout seul si besoin. Bien plus fiable que des coordonnées devinées : on VÉRIFIE
// ce qu'on voit avant de taper, et ça s'adapte au scroll.
import { snapshot, sendAction, deviceIp, type IrtAction } from './iremotech'
import { ocrWords, findBlueButton, findBlueDots, findWhiteDisks, meanLuma, pixelRgb, findAssistiveTouch, type OcrWord } from './ocr'
import { isInstagramText, withJoined } from './ocrMatch'
import { parseProfileCounts, saveScreenStats, parseCount } from './irtAccounts'
import { askBrain, hasVisionBrain } from './visionBrain'
import { findGalleryThumb, findMatchingCell } from './screenMatch'

// Barre d'onglets d'Instagram : l'ancienne barre pleine largeur (Accueil 0,1 · Reels 0,3 · … · Profil 0,9 W, à 0,962 H)
// ET la nouvelle barre FLOTTANTE arrondie (vue le 23/11/2026 sur STEVIE1 : Accueil 0,18 · Reels 0,35 · Profil 0,85 W,
// à 0,933 H). Positions choisies pour tomber juste dans les deux.
// Profil à 0,82 W : dans la zone de l'icône pour l'ANCIENNE barre pleine largeur (0,8–1) comme pour la barre FLOTTANTE
// étroite (icône à 0,78 W, vue en vrai sur STEVIE10 le 24/11/2026 : à 0,86 le tap tombait au bord et le Profil ne
// s'ouvrait jamais → bascule de compte ratée). Les boucles essaient aussi 0,78 puis 0,86.
export const TAB = { y: 0.945, home: { x: 0.15 }, reels: { x: 0.33 }, profile: { x: 0.82 } }
export const PROFILE_XS = [0.82, 0.78, 0.86]
export const HOME_XS = [0.17, 0.22, 0.12]   // Accueil : barre pleine (≈0,1) ou flottante étroite (≈0,22)

/** Fil d'accueil d'Instagram à l'écran (le « + » du créateur est en haut à gauche) : « Your story » ou l'en-tête
 *  « For you / Following » en haut. Pure. */
export function homeFeedShown(words: { text: string; cy: number }[], H: number): boolean {
  const top = (re: RegExp) => words.some(o => re.test(o.text) && o.cy < H * 0.3)
  return (top(/^your$/i) && top(/^story$/i)) || (top(/^for$/i) && top(/^you$/i) && words.some(o => /^for$/i.test(o.text) && o.cy < H * 0.1)) || words.some(o => /^following$/i.test(o.text) && o.cy < H * 0.1)
}
/** Bouton AssistiveTouch d'iOS sur une zone de taps d'Instagram (haut à gauche : « + », ✕, retour ; ou barre d'onglets) :
 *  glissé sur le bord droit. Vu en vrai sur STEVIE10 : posé sur le « + », chaque tap ouvrait le sélecteur d'apps
 *  (l'app Preview passait au premier plan, plus aucun post possible). true si déplacé. */
export async function clearAssistiveTouch(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  for (let k = 0; k < 2; k++) {
    const shot = await snapRetry(key, deviceId)
    if (!shot) return false
    const { w: W, h: H } = await imgSize(shot)
    const at = await findAssistiveTouch(shot).catch(() => null)
    if (!at) return k > 0
    const inTheWay = (at.cx < W * 0.25 && at.cy < H * 0.16) || at.cy > H * 0.86 || (at.cx > W * 0.75 && at.cy < H * 0.12)
    if (!inTheWay) return k > 0
    if (!k) hooks?.log?.('   bouton AssistiveTouch sur une zone d’Instagram → déplacé sur le bord droit')
    await sendAction(key, deviceId, { type: 'swipe', x1: at.cx, y1: at.cy, x2: W - 30, y2: Math.round(H * 0.42), duration_ms: 700 })
    await sleep(1800)
  }
  return true
}

/** Remise à zéro SÛRE : Instagram fermé complètement puis rouvert → il repart sur le fil d'accueil (testé sur STEVIE1).
 *  Utilisée quand ScaleFlow ne retrouve plus la barre d'onglets (page d'un autre compte, notifications…). */
export async function resetInstagramToHome(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  hooks?.log?.('   ↺ Instagram remis à zéro (fermé puis rouvert sur l’accueil)')
  await forceCloseForegroundApp(key, deviceId, hooks)
  await sendAction(key, deviceId, { type: 'open_app', target: 'instagram' })
  await sleep(6500)
  await dismissIgInfoSheet(key, deviceId, hooks)
  const scr = await readScreenWords(key, deviceId)
  return !!scr && homeFeedShown(scr.words, scr.H)
}

/** Onglet Accueil, VÉRIFIÉ (après le scroll des Reels, sinon le « + » est introuvable et le post suivant échoue). */
export async function goHomeTab(key: string, deviceId: string, W: number, H: number, hooks?: VisionHooks): Promise<boolean> {
  // page sans barre d'onglets (profil d'un autre compte…) : flèche retour d'abord, sinon les taps « Accueil » ouvrent une vidéo
  for (let b = 0; b < 3; b++) {
    const sc = await readScreenWords(key, deviceId)
    if (!sc || !otherPageShown(sc.words, sc.W, sc.H)) break
    hooks?.log?.('   page d’un autre compte → retour avant l’accueil')
    await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.09 * W), y: Math.round(0.068 * H) }); await sleep(1800)
  }
  for (let k = 0; k < HOME_XS.length; k++) {
    await sendAction(key, deviceId, { type: 'tap', x: Math.round(HOME_XS[k] * W), y: Math.round(TAB.y * H) })
    await sleep(1800)
    const scr = await readScreenWords(key, deviceId)
    if (scr && homeFeedShown(scr.words, scr.H)) return true
    if (k + 1 < HOME_XS.length) hooks?.log?.(`   accueil pas encore affiché → autre position (${k + 2}/${HOME_XS.length})`)
  }
  return resetInstagramToHome(key, deviceId, hooks)
}

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
      // ~12 s : avant la fin de l'étalonnage, un tap peut partir ailleurs (vu en vrai : Apple Music au lieu d'Instagram)
      if (ok) { hooks?.log?.(`   ✓ recalibrage lancé (${JSON.stringify(a)})`); await sleep(12000); return }
    }
    hooks?.log?.('   ⚠ aucune action « calibrate » acceptée par l’API — on continue (dis-moi le nom exact).')
  } catch (e) {
    hooks?.log?.(`   ⚠ recalibrage ignoré (${e instanceof Error ? e.message : String(e)})`)
  }
}

/** Nouvelle IP : mode avion par l'action NATIVE d'iRemoTech (avion ON → attente → OFF), avec lecture de
 *  l'IP avant/après (`device_ip`). Si l'action native est refusée, repli sur le Centre de contrôle (vision). */
/** Mode avion encore actif : aucun texte d'opérateur / réseau dans la barre d'état à gauche (hors heure). Pure. */
export function stillAirplane(words: { text: string; cx: number; cy: number }[], W: number, H: number): boolean {
  const left = words.filter(o => o.cy < H * 0.035 && o.cx < W * 0.42 && /[a-z]{2,}/i.test(o.text) && !/^\d/.test(o.text))
  return left.length === 0
}

export async function airplaneReset(key: string, deviceId: string, hooks?: VisionHooks, holdMs = 8000): Promise<void> {
  // `device_ip` passe par le raccourci iOS « iRemotech » (souvent null) et chaque appel compte dans la limite
  // de débit : un appel avant, et on ne relit après que si la 1re lecture a marché.
  // JAMAIS avec Instagram à l'écran (une coupure réseau en pleine session peut déclencher une vérification) :
  // on sort sur l'écran d'accueil d'abord ; Instagram ne sera rouvert qu'APRÈS, sur le compte / container suivant.
  hooks?.log?.('🏠 Sortie d’Instagram (écran d’accueil) avant le mode avion…')
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1800)
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
    // VÉRIFIÉ à l'écran : iRemoTech accepte l'ordre mais le raccourci iOS ne s'exécute pas toujours (vu en vrai :
    // iPhone resté en mode avion → publications en échec). En mode avion, la barre d'état n'affiche AUCUN texte
    // d'opérateur à gauche (seulement ✈) ; on renvoie OFF jusqu'à 3 fois tant que c'est le cas.
    for (let k = 0; k < 3; k++) {
      const scr = await readScreenWords(key, deviceId)
      if (!scr || !stillAirplane(scr.words, scr.W, scr.H)) break
      hooks?.log?.(`   ⚠ toujours en mode avion (barre d’état vide) → OFF renvoyé (${k + 1}/3)`)
      await sendWithRetry(key, deviceId, { type: 'airplane', on: false }, 3)
      await sleep(9000)
    }
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

/** Texte avec accents / emojis / ß…, ou pas : l'action `text` d'iRemoTech ne tape QUE l'ASCII (vu en vrai : « vous êtes
 *  là ou pas ? 🙈 » → « vous tes l ou pas ? ») mais les retours à la ligne passent. Hors ASCII : presse-papiers de
 *  l'iPhone (`clipboard_set`) puis ⌘V (modificateur « gui » chez iRemoTech) → texte exact, lignes comprises. Pure. */
/** Page de partage encore affichée : titre « New reel » / « New post » en haut, ou bouton « Share » en bas à DROITE
 *  (le texte d'aide de la localisation, à gauche et plus haut, contient aussi le mot « share »). Pure. */
export function sharePageShown(words: { text: string; cx: number; cy: number }[], W: number, H: number): boolean {
  const title = words.some(o => /^new$/i.test(o.text) && o.cy < H * 0.08) && words.some(o => /^(reel|post)$/i.test(o.text) && o.cy < H * 0.08)
  const btn = words.some(o => /^(share|partager)$/i.test(o.text) && o.cy > H * 0.9 && o.cx > W * 0.5)
  return title || btn
}
/** Fenêtre « Update on your original audio » affichée après Share (le Reel n'est pas encore parti). Pure. */
export function originalAudioSheet(words: { text: string }[]): boolean {
  const has = (re: RegExp) => words.some(o => re.test(o.text))
  return has(/^original$/i) && has(/^audio$/i) && has(/^(update|turn)$/i)
}
export function needsPaste(text: string): boolean {
  return /[^\x00-\x7F]/.test(text)
}
export async function typeRich(key: string, deviceId: string, text: string): Promise<void> {
  if (!needsPaste(text)) { await sendAction(key, deviceId, { type: 'text', text }); return }
  const ok = await sendAction(key, deviceId, { type: 'clipboard_set', text })
  if (!ok) { await sendAction(key, deviceId, { type: 'text', text }); return } // repli : au moins l'ASCII
  await sleep(700)
  await sendAction(key, deviceId, { type: 'press', modifiers: ['gui'], key: 'v' })
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

/** Feuille Instagram « Allow Instagram to access your camera and microphone » (bouton « Continue » seul). Pure. */
export function cameraSheet(words: { text: string; cy: number }[], H: number): boolean {
  const top = (re: RegExp) => words.some(o => re.test(o.text) && o.cy < H * 0.5)
  return top(/^camera$/i) && top(/^microphone$/i) && top(/^(allow|access)$/i) && !words.some(o => /^would$/i.test(o.text))
    && words.some(o => /^continue$/i.test(o.text) && o.cy > H * 0.7)
}

/** Pour PUBLIER, Instagram doit voir la galerie : feuille « Allow Instagram to access your photos and videos » →
 *  Continue, puis alerte iOS → « Allow Full Access » / « Allow Access to All Photos » (double tap : alerte iOS).
 *  (À l'inverse de l'inscription, où l'on refuse.) Autres alertes « would like to… » : caméra / micro → Allow ;
 *  notifications / contacts / localisation / suivi → Don't Allow. Sans effet si rien n'est demandé. */
export async function grantPhotoAccessIfAsked(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  let relaunched = false
  for (let k = 0; k < 4; k++) {
    const scr = await readScreenWords(key, deviceId)
    if (!scr) return relaunched
    const has = (re: RegExp, a = 0, b = 1) => scr.words.some(o => re.test(o.text) && o.cy >= a * scr.H && o.cy <= b * scr.H)
    // Accès refusé auparavant : « Please allow access to your photos » + lien « Enable library access » → Réglages iOS
    // (Instagram › Photos › All Photos / Full Access) → retour à Instagram (iOS le relance : l'appelant rouvre le créateur).
    if (has(/^please$/i) && has(/^(photos|photos\.)$/i) && has(/^(enable|library)$/i)) {
      hooks?.log?.('🖼 Instagram n’a pas accès aux photos → Réglages iOS › Photos › Accès complet')
      const lnk = scr.words.find(o => /^(enable|library)$/i.test(o.text) && o.cy > scr.H * 0.5)
      await sendAction(key, deviceId, { type: 'tap', x: lnk ? lnk.cx : Math.round(scr.W / 2), y: lnk ? lnk.cy : Math.round(0.615 * scr.H) })
      await sleep(3000)
      if (await settingsGrantAllPhotos(key, deviceId, hooks)) { relaunched = true; await sleep(6000) }
      continue
    }
    if (cameraSheet(scr.words, scr.H)) {
      hooks?.log?.('📷 « Allow Instagram to access your camera and microphone » → Continue')
      const c = scr.words.find(o => /^continue$/i.test(o.text) && o.cy > 0.7 * scr.H)
      await sendAction(key, deviceId, { type: 'tap', x: c ? c.cx : Math.round(scr.W / 2), y: c ? c.cy : Math.round(0.93 * scr.H) })
      await sleep(2500); continue // puis alertes iOS caméra / micro → Allow (règle plus bas)
    }
    if (has(/^access$/i, 0.3, 0.5) && has(/^videos$/i, 0.3, 0.5) && !has(/^please$/i)) {
      hooks?.log?.('🖼 Accès aux photos demandé → Continue')
      const c = scr.words.find(o => /^continue$/i.test(o.text) && o.cy > 0.7 * scr.H)
      // vu en vrai : le tap « Continue » répété 4 fois sans effet → dès le 2e essai, le gros bouton bleu repéré à sa couleur
      const blue = !c && k > 0 ? await findBlueButton(scr.shot, 0.7, 1).catch(() => null) : null
      await sendAction(key, deviceId, { type: 'tap', x: c ? c.cx : blue ? blue.cx : Math.round(scr.W / 2), y: c ? c.cy : blue ? blue.cy : Math.round((k % 2 ? 0.9 : 0.94) * scr.H) })
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
    return relaunched
  }
  return relaunched
}

/** Réglages iOS › Instagram : ligne « Photos » → « All Photos » (iOS 17) / « Full Access » (iOS 18) → retour à
 *  Instagram par le lien « ◀ Instagram » de la barre d'état. true = accès complet coché (Instagram redémarre). */
async function settingsGrantAllPhotos(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  for (let k = 0; k < 4; k++) {
    const scr = await readScreenWords(key, deviceId)
    if (!scr) return false
    const { words, W, H } = scr
    const choice = words.find(o => /^full$/i.test(o.text) && words.some(p => /^access$/i.test(p.text) && Math.abs(p.cy - o.cy) < 12))
      ?? words.find(o => /^all$/i.test(o.text) && words.some(p => /^photos$/i.test(p.text) && Math.abs(p.cy - o.cy) < 12 && p.cx > o.cx))
    if (choice) {
      hooks?.log?.('   ✓ « All Photos » / « Full Access » coché')
      await sendAction(key, deviceId, { type: 'tap', x: choice.cx, y: choice.cy })
      await sleep(1800)
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.075 * W), y: Math.round(0.016 * H) }) // « ◀ Instagram »
      return true
    }
    // page Instagram des Réglages : ligne « Photos » (valeur « None » / « Limited » à droite)
    const row = words.find(o => /^photos$/i.test(o.text) && o.cx < W * 0.5 && o.cy > H * 0.1)
    if (row) { await sendAction(key, deviceId, { type: 'tap', x: row.cx, y: row.cy }); await sleep(2200); continue }
    await sleep(1500)
  }
  hooks?.log?.('   ⚠ Réglages Photos non reconnus')
  return false
}

/** Fenêtres « première fois » d'Instagram avec un seul bouton OK (« Share more », « Find your vibe », « Sharing posts »,
 *  « Video posts are now shared as reels »…) : renvoie le point à taper, ou null. Jamais une alerte de permission. Pure. */
export function firstTimeOkTap(words: { text: string; cx: number; cy: number }[], W: number, H: number): { x: number; y: number } | null {
  const t = (o: { text: string }) => o.text.replace(/[^\p{L}]/gu, '')
  if (words.some(o => /^(would|allow|dontallow|notifications|contacts|location|track)$/i.test(t(o)))) return null
  const ok = words.find(o => /^ok[.!]?$/i.test(o.text.trim()) && o.cx > W * 0.3 && o.cx < W * 0.7 && o.cy > H * 0.3 && o.cy < H * 0.95)
  return ok ? { x: ok.cx, y: ok.cy } : null
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
  const shot = await snapRetry(key, deviceId)
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
    const chk = await snapRetry(key, deviceId)
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
    const s = await snapRetry(key, deviceId)
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
    const shot = await snapRetry(key, deviceId)
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
    const shot = await snapRetry(key, deviceId)
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
    const shot = await snapRetry(key, deviceId)
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
/** Interrupteur iOS ACTIF = piste verte visible à gauche du rond blanc. Pure. */
export const iosToggleOn = ([r, g, b]: [number, number, number]) => g > 170 && r < 140 && b < 160

/** Coupe la CORRECTION AUTOMATIQUE du clavier iOS (Réglages › Général › Clavier) : sinon le clavier anglais remplace
 *  les mots français au moment de valider (« Clique ici » → « Clique I I » sur un sticker lien, le 21/11/2026).
 *  Accès par Spotlight (« Keyboard » → résultat Réglages « Keyboards » ; le schéma app-prefs est refusé par iRemoTech).
 *  Vérifié à l'écran ; true = coupée (ou déjà coupée). */
export async function disableAutoCorrect(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  hooks?.log?.('⌨️ Clavier iOS : coupure de la correction et de la majuscule automatiques (une fois par iPhone)…')
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1200)
  const s0 = await snapRetry(key, deviceId)
  const { w: W, h: H } = s0 ? await imgSize(s0) : { w: 0, h: 0 }
  if (!W || !H) return false
  await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W / 2), y1: Math.round(0.42 * H), x2: Math.round(W / 2), y2: Math.round(0.72 * H), duration_ms: 350 })
  await sleep(1800)
  // Spotlight garde la recherche précédente → bouton ⊗ du champ (en bas à droite) avant de taper
  let scr = await readScreenWords(key, deviceId)
  if (scr?.words.some(o => o.cy > H * 0.93 && /[a-z]{3,}/i.test(o.text))) { await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.904 * W), y: Math.round(0.96 * H) }); await sleep(800) }
  // « Keyboard » → résultat Réglages « Keyboards · General » (plus stable que « Auto-Correction », souvent noyé dans le web)
  await sendAction(key, deviceId, { type: 'text', text: 'Keyboard' })
  await sleep(2500)
  scr = await readScreenWords(key, deviceId)
  const hit = scr?.words.find(o => /^keyboards$/i.test(o.text) && o.cy < H * 0.3)
  if (!hit || !scr?.words.some(o => /^general$/i.test(o.text) && o.cy < H * 0.3)) { hooks?.log?.('   ⚠ réglage « Keyboards » introuvable dans Spotlight'); await sendAction(key, deviceId, { type: 'press', name: 'home' }); return false }
  await sendAction(key, deviceId, { type: 'tap', x: hit.cx, y: hit.cy })
  await sleep(2800)
  // Deux interrupteurs à couper : « Auto-Capitalization » (sinon les descriptions en minuscules prennent une majuscule)
  // et « Auto-Correction » (sinon « ici » → « I I »). Vert à gauche du pouce = activé.
  const targets: { re: RegExp; label: string; done: boolean }[] = [
    { re: /^auto-?capitali[sz]ation$/i, label: 'majuscule automatique', done: false },
    { re: /^auto-?correction$/i, label: 'correction automatique', done: false },
  ]
  // Page Keyboards : tout en haut puis un demi-écran plus bas → section « All Keyboards » (les deux interrupteurs)
  // au milieu de l'écran (vu en vrai : en haut de page, « Auto-Capitalization » est à 93 % de la hauteur).
  const swipeV = (y1: number, y2: number) => sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W / 2), y1: Math.round(y1 * H), x2: Math.round(W / 2), y2: Math.round(y2 * H), duration_ms: 350 })
  for (let i = 0; i < 2; i++) { await swipeV(0.3, 0.85); await sleep(700) }
  await swipeV(0.75, 0.4); await sleep(1200)
  for (let k = 0; k < 8 && targets.some(t => !t.done); k++) {
    scr = await readScreenWords(key, deviceId)
    if (!scr) { await sleep(1200); continue }
    let seen = false, tapped = false
    for (const t of targets.filter(x => !x.done)) {
      const row = scr.words.find(o => t.re.test(o.text) && o.cx < W * 0.6 && o.cy > H * 0.1 && o.cy < H * 0.95)
      if (!row) continue
      seen = true
      if (!iosToggleOn(await pixelRgb(scr.shot, Math.round(0.783 * W), row.cy))) { t.done = true; hooks?.log?.(`   ✓ ${t.label} coupée`); continue }
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.84 * W), y: row.cy })
      tapped = true
      await sleep(1200)
    }
    if (tapped) continue // relecture : l'interrupteur doit être passé au gris
    if (!seen || targets.some(t => !t.done)) {
      // ligne(s) plus bas dans la page (Réglages s'ouvre parfois en haut) → défiler la page des Réglages
      // pas encore vu : un coup plus bas, un coup plus haut (la page peut s'ouvrir n'importe où)
      if (k % 2 === 0) await swipeV(0.7, 0.45); else await swipeV(0.35, 0.75)
      await sleep(1200)
    }
  }
  if (targets.every(t => t.done)) {
    // UN seul appui (deux appuis rapprochés ouvrent le sélecteur d'apps)
    await sendAction(key, deviceId, { type: 'press', name: 'home' }); await sleep(1500)
    return true
  }
  hooks?.log?.(`   ⚠ interrupteur non coupé : ${targets.filter(t => !t.done).map(t => t.label).join(', ')}`)
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  return false
}

/** Feuille d'info Instagram à gros bouton bleu « OK » + lien « View settings » / « Manage settings » dessous
 *  (« Introducing story-to-story sharing », « Sharing posts ») : point du OK (6,8 % de la hauteur au-dessus du lien). Pure. */
export function okAboveSettingsLink(words: { text: string; cx: number; cy: number }[], H: number): { y: number } | null {
  const lk = words.find(o => /^(view|manage)$/i.test(o.text) && o.cy > H * 0.5
    && words.some(p => /^settings$/i.test(p.text) && Math.abs(p.cy - o.cy) < 12 && p.cx > o.cx))
  return lk ? { y: lk.cy - Math.round(0.068 * H) } : null
}

/** Écrans Meta « pub » (UE) pendant le posting. Pure : renvoie les taps à faire.
 *  1. « Choose if we process your data for ads » → « Get started » ;
 *  2. « Want to subscribe or continue using our products free of charge with ads? » → ligne « Use free of charge
 *     with ads » (JAMAIS « Subscribe », payant) puis « Continue » ;
 *  3. puis « Agree », puis « OK » (vu en vrai le 24/11/2026). */
export function adsConsentTaps(words: { text: string; cx: number; cy: number }[], W: number, H: number): { x: number; y: number }[] | null {
  const has = (re: RegExp) => words.some(o => re.test(o.text))
  const btn = (re: RegExp, minY = 0.45) => words.find(o => re.test(o.text) && o.cy > H * minY)
  const adsTalk = has(/^ads\??\.?$/i) && (has(/^meta$/i) || has(/^personali[sz]ed$/i) || has(/^consent$/i) || has(/^process$/i))
  if (!adsTalk) return null
  const gs = btn(/^started$/i)
  if (gs && has(/^choose$/i)) return [{ x: Math.round(W / 2), y: gs.cy }]
  if (has(/^subscribe$/i) && has(/^free$/i)) {
    // « Use free of charge with ads » : mot « Use » en début de ligne, à côté de « free »
    const use = words.find(o => /^use$/i.test(o.text) && o.cy > H * 0.35
      && words.some(p => /^free$/i.test(p.text) && Math.abs(p.cy - o.cy) < 14 && p.cx > o.cx))
    const cont = btn(/^continue$/i, 0.8)
    const out: { x: number; y: number }[] = []
    if (use) out.push({ x: Math.round(W * 0.5), y: use.cy })
    out.push({ x: Math.round(W / 2), y: cont ? cont.cy : Math.round(0.925 * H) })
    return out
  }
  const ok = btn(/^(agree|continue|confirm|ok)$/i, 0.6)
  return ok && !has(/^subscribe$/i) ? [{ x: ok.cx, y: ok.cy }] : null
}

/** Coche bleue « ✓ » (OK) de l'éditeur de légende, en haut à droite : repérée à sa couleur (repli 90 % / 7,5 %). */
async function tapCaptionCheck(key: string, deviceId: string, W: number, H: number, shot?: string): Promise<void> {
  const b = shot ? await findBlueButton(shot, 0.035, 0.16, 0.6, 1).catch(() => null) : null
  await sendAction(key, deviceId, { type: 'tap', x: b ? b.cx : Math.round(0.9 * W), y: b ? b.cy : Math.round(0.075 * H) })
}

/** Éditeur de légende ouvert, vu À L'ÉCRAN : titre / puces lus (captionEditorOpen) OU coche bleue en haut à droite
 *  repérée à sa couleur. Testé en vrai sur STEVIE2 le 24/11/2026 : le titre « Caption » (blanc sur bandeau gris) n'est
 *  souvent PAS lu par l'OCR → ScaleFlow croyait l'éditeur fermé, défilait dans les hashtags suggérés puis tapait Share. */
async function captionEditorShown(scr: { words: { text: string; cy: number }[]; H: number; shot: string }): Promise<boolean> {
  if (captionEditorOpen(scr.words, scr.H)) return true
  // coche bleue en haut à droite ET puces « Hashtags / Poll / Prompt » HAUTES (≤ 40 % : dans l'éditeur ; sur la page de
  // partage elles sont vers 60 %). Sans cette 2e condition, la page de partage passait pour l'éditeur (vu en vrai : 15
  // taps « ✓ » de suite, puis « Add location » introuvable).
  const chipsHigh = scr.words.some(o => /^(hashtags|poll|prompt)$/i.test(o.text) && o.cy < scr.H * 0.4)
  if (!chipsHigh) return false
  return !!await findBlueButton(scr.shot, 0.035, 0.12, 0.75, 1).catch(() => null)
}

/** Éditeur plein écran « Caption » encore ouvert : titre « Caption » en haut ET (OK / Done en haut, ou les puces
 *  « Hashtags / Poll / Prompt » sous le texte). Depuis le 24/11/2026 le OK est une coche bleue SANS texte en haut à
 *  droite : sans les puces, ScaleFlow croyait l'éditeur fermé et tapait Share dessous (rien n'était publié). Pure. */
export function captionEditorOpen(words: { text: string; cy: number }[], H: number): boolean {
  // titre « Caption » tout en haut = éditeur (la page de partage s'intitule « New reel / New post »)
  const title = words.some(o => /^(caption|l[ée]gende)$/i.test(o.text) && o.cy < H * 0.12)
  const chips = words.filter(o => /^(hashtags|poll|prompt)$/i.test(o.text) && o.cy < H * 0.45).length >= 1
  // liste des hashtags suggérés (« #rvlifestyle · 814K posts »…) ouverte sous un « #… » en fin de légende
  const suggest = words.filter(o => /^#\w/.test(o.text) && o.cy > H * 0.3).length >= 3 && words.filter(o => /^posts$/i.test(o.text)).length >= 2
  return title || (chips && suggest)
}

/** Feuille « Finish setting up your profile » (ou autre feuille à gros bouton bleu « Continue » + lien « Not now »
 *  dessous) : point du lien « Not now » — JAMAIS « Continue ». Vu en vrai le 24/11/2026 pendant le scroll des Reels
 *  entre deux posts. Pure. */
export function notNowUnderContinue(words: { text: string; cx: number; cy: number }[], H: number): { x: number; y: number } | null {
  const now = words.find(o => /^now$/i.test(o.text) && o.cy > H * 0.3
    && words.some(p => /^not$/i.test(p.text) && Math.abs(p.cy - o.cy) < 14 && p.cx < o.cx))
  const cont = words.find(o => /^continue$/i.test(o.text) && o.cy > H * 0.3)
  const setup = words.some(o => /^finish$/i.test(o.text)) && words.some(o => /^setting$/i.test(o.text)) && words.some(o => /^profile\.?$/i.test(o.text))
  if (!(setup || (cont && now && now.cy > cont.cy))) return null
  if (now) { const n = words.find(p => /^not$/i.test(p.text) && Math.abs(p.cy - now.cy) < 14)!; return { x: Math.round((n.cx + now.cx) / 2), y: now.cy } }
  return cont ? { x: cont.cx, y: cont.cy + Math.round(0.072 * H) } : null // « Not now » ~7 % sous « Continue »
}

export async function dismissIgInfoSheet(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  const scr = await readScreenWords(key, deviceId)
  if (!scr) return false
  const has = (re: RegExp) => scr.words.some(o => re.test(o.text))
  if (cameraSheet(scr.words, scr.H)) return grantPhotoAccessIfAsked(key, deviceId, hooks).then(() => true) // → Continue, puis Allow (caméra / micro)
  // Alerte iOS « Turn On Location Services to Allow … » (autre app, vue en vrai sur STEVIE1) → Cancel (jamais Settings)
  if (has(/^location$/i) && has(/^services$/i) && has(/^cancel$/i) && has(/^settings$/i)) {
    const c = scr.words.find(o => /^cancel$/i.test(o.text))!
    hooks?.log?.('   alerte iOS « Location Services » → Cancel')
    await doubleTap(key, deviceId, c.cx, c.cy); await sleep(1500)
    return true
  }
  // Offre « Meta Verified » (abonnement payant, vue en vrai le 24/11/2026 par-dessus le créateur) → Cancel / Not now,
  // sinon la feuille glissée vers le bas. JAMAIS le bouton d'abonnement.
  if (has(/^verified$/i) && (has(/^meta$/i) || has(/^subscription/i))) {
    const no = scr.words.find(o => /^(cancel|cance!|not|close|dismiss)$/i.test(o.text) && o.cy > scr.H * 0.3)
    hooks?.log?.('   offre « Meta Verified » → fermée (aucun abonnement)')
    if (no) await sendAction(key, deviceId, { type: 'tap', x: no.cx + (/^not$/i.test(no.text) ? 18 : 0), y: no.cy })
    else await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(scr.W / 2), y1: Math.round(scr.H * 0.35), x2: Math.round(scr.W / 2), y2: Math.round(scr.H * 0.95), duration_ms: 300 })
    await sleep(1500)
    return true
  }
  const ads = adsConsentTaps(scr.words, scr.W, scr.H)
  if (ads) {
    // enchaînement Get started → gratuit avec pub + Continue → Agree → OK : on suit jusqu'à revenir sur Instagram
    let taps: { x: number; y: number }[] | null = ads, okAfter = false
    for (let k = 0; k < 6 && taps; k++) {
      hooks?.log?.('   écran Meta « pub » (UE) → version gratuite avec pub, on continue')
      for (const t of taps) { await sendAction(key, deviceId, { type: 'tap', x: t.x, y: t.y }); await sleep(1500) }
      await sleep(2000)
      const nx = await readScreenWords(key, deviceId)
      if (!nx) break
      taps = adsConsentTaps(nx.words, nx.W, nx.H)
      if (!taps) {
        // dernier écran « OK » (souvent sans le mot « ads ») : bouton OK seul dans la moitié basse
        const ok = nx.words.find(o => /^(ok|agree)$/i.test(o.text) && o.cy > nx.H * 0.45) 
        if (ok && !okAfter && !nx.words.some(o => /^subscribe$/i.test(o.text))) { okAfter = true; taps = [{ x: ok.cx, y: ok.cy }] }
      }
    }
    return true
  }
  const nn = notNowUnderContinue(scr.words, scr.H)
  if (nn) {
    hooks?.log?.('   feuille « Finish setting up your profile » → Not now')
    await sendAction(key, deviceId, { type: 'tap', x: nn.x, y: nn.y })
    await sleep(1500)
    return true
  }
  // feuille d'info = un bouton « OK » centré dans la moitié basse, sans les boutons d'une alerte de permission iOS
  // alerte iOS « "Instagram" would like to access the Camera / Microphone » → Allow (via grantPhotoAccessIfAsked)
  if (has(/^would$/i) && has(/^like$/i) && has(/^(camera|camera\.|microphone|microphone\.)$/i)) return grantPhotoAccessIfAsked(key, deviceId, hooks).then(() => true)
  if (has(/^would$/i) && has(/^like$/i)) return false
  // boutons d'alerte à côté du OK (moitié basse) → ce n'est pas une simple feuille d'info
  if (scr.words.some(o => /^(allow|don['’]?t|cancel|discard)$/i.test(o.text) && o.cy > scr.H * 0.4) && !has(/^introducing$/i)) return false
  const ok = scr.words.find(o => /^ok$/i.test(o.text) && o.cy > scr.H * 0.45 && Math.abs(o.cx - scr.W / 2) < scr.W * 0.2)
  // « OK » blanc sur gros bouton bleu souvent illisible : il est juste AU-DESSUS du lien « View settings » / « Manage settings »
  const link = ok ? null : okAboveSettingsLink(scr.words, scr.H)
  if (!ok && !link) return false
  hooks?.log?.('   feuille d’info Instagram (« Introducing… ») → OK')
  await sendAction(key, deviceId, { type: 'tap', x: ok ? ok.cx : Math.round(scr.W / 2), y: ok ? ok.cy : link!.y })
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
    const shot = await snapRetry(key, deviceId)
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
        const stillOpen = async () => { const sh = await snapRetry(key, deviceId); return !!sh && pickerRows(await ocrWords(sh, whitelist), W, H).length >= 2 }
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
/** Bibliothèque d'apps iOS (au-delà de la dernière page d'accueil) : titres de ses dossiers. Pure. */
/** Page des widgets iOS (« Today view », tout à gauche) : widgets Screen Time / Photos / batterie. Pure. */
export function isTodayView(words: { text: string }[]): boolean {
  const t = new Set(words.map(o => o.text.toLowerCase().replace(/[^a-z]/g, '')))
  return (t.has('screen') && t.has('time')) || (t.has('photos') && t.has('appear')) || (t.has('activity') && t.has('website'))
}
export function isAppLibrary(words: { text: string }[]): boolean {
  const n = new Set(words.map(o => o.text.toLowerCase()).filter(t => /^(suggestions|recently|added|utilities|productivity|creativity|social|entertainment|information)$/.test(t)))
  return n.size >= 2
}

async function tapAppIcon(
  key: string, deviceId: string,
  matcher: (t: string) => boolean, label: string,
  hooks?: VisionHooks,
): Promise<boolean> {
  // Sens de défilement : vers la gauche (pages suivantes). Au-delà de la dernière page, iOS affiche la
  // Bibliothèque d'apps (vu en vrai : « home » ne l'en sortait pas) → on repart vers la droite.
  let dir: 'left' | 'right' = 'left'
  for (let page = 0; page < 7; page++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapRetry(key, deviceId)
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
    // Bibliothèque d'apps : reconnue à ses titres de dossiers (le titre « App Library » se lit mal : « Apr »)
    // Page des widgets (à gauche de la 1re page) : on repart vers la gauche (pages d'accueil)
    if (isTodayView(words)) {
      hooks?.log?.('   page des widgets → retour aux pages d’accueil')
      dir = 'left'
      await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * 0.82), y1: Math.round(H * 0.6), x2: Math.round(W * 0.18), y2: Math.round(H * 0.6), duration_ms: 350 })
      await sleep(900); continue
    }
    if (isAppLibrary(words)) {
      hooks?.log?.('   Bibliothèque d’apps → retour aux pages d’accueil')
      dir = 'right'
      await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * 0.18), y1: Math.round(H * 0.6), x2: Math.round(W * 0.82), y2: Math.round(H * 0.6), duration_ms: 350 })
      await sleep(900); continue
    }
    hooks?.log?.(`🔎 ${label} pas sur cette page → page suivante`)
    const [xa, xb] = dir === 'left' ? [0.82, 0.18] : [0.18, 0.82]
    await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * xa), y1: Math.round(H * 0.6), x2: Math.round(W * xb), y2: Math.round(H * 0.6), duration_ms: 350 })
    await sleep(900)
  }
  return false
}

async function tapInstagramIcon(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  // UNIQUEMENT par son NOM (libellé sous l'icône), lu de façon tolérante (« lnstagram »,
  // « Instagrarn », « Insta » « gram »…). Pas de repérage au logo : il tapait parfois ailleurs.
  // Puis VÉRIFIÉ : si une autre app s'est ouverte (vu en vrai : Apple Music), retour à l'accueil et nouvel essai.
  for (let k = 0; k < 2; k++) {
    if (!await tapAppIcon(key, deviceId, isInstagramText, 'Instagram', hooks)) return false
    await sleep(3200)
    let scr = await readScreenWords(key, deviceId)
    if (scr && otherAppOpened(scr.words)) { await sleep(2500); scr = await readScreenWords(key, deviceId) } // Instagram encore en chargement ?
    if (!scr || !otherAppOpened(scr.words)) return true
    hooks?.log?.('   ⚠ une autre app s’est ouverte à la place d’Instagram → retour à l’accueil, nouvel essai')
    await sendAction(key, deviceId, { type: 'press', name: 'home' })
    await sleep(1800)
    await recalibrateTouch(key, deviceId, hooks) // un tap décalé (étalonnage iRemoTech) est la cause la plus probable
  }
  return false
}
/** Une autre app qu'Instagram est ouverte (Apple Music, Réglages, Photos…) : pas d'indice d'Instagram ni du
 *  sélecteur Crane, et des mots typiques d'autres apps. Pure. */
export function otherAppOpened(words: { text: string }[]): boolean {
  const t = new Set(words.map(o => o.text.toLowerCase().replace(/[^a-z]/g, '')))
  // indices d'Instagram (fil, profil, inscription, connexion) ou du sélecteur de containers Crane
  // mots propres à Instagram / Crane uniquement (« you », « story »… existent aussi dans Apple Music : piège vu en vrai)
  const ig = ['instagram', 'following', 'reels', 'followers', 'default', 'container', 'suggested'].some(w => t.has(w))
  if (ig) return false
  // une autre app : Apple Music (« What's New in Apple Music »), Réglages, Photos…
  return ['music', 'apple', 'listen', 'radio', 'browse', 'songs', 'albums', 'playlists', 'settings', 'general', 'memories', 'wifi', 'automix'].some(w => t.has(w))
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
  const shot = await snapRetry(key, deviceId)
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
    const shot = await snapRetry(key, deviceId)
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
      // une feuille couvre le créateur (« Meta Verified… », accès aux photos…) : on la ferme puis on relit
      if (i === 1 && (await dismissIgInfoSheet(key, deviceId, hooks) || await grantPhotoAccessIfAsked(key, deviceId, hooks))) { await sleep(1500); continue }
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

/** Feuille « Create » (Reel / Edits / Post / Story / Instants / Highlights / Live) : ce que le + ouvre depuis
 *  l'onglet PROFIL (depuis le fil, il ouvre directement la galerie « New post »). Pure. */
export function createSheetShown(words: { text: string; cy: number }[], H: number): boolean {
  const rows = new Set(words.filter(o => o.cy > H * 0.3 && /^(reel|edits|post|story|instants|highlights|live)$/i.test(o.text)).map(o => o.text.toLowerCase()))
  return rows.size >= 3 && words.some(o => /^create$/i.test(o.text) && o.cy > H * 0.25 && o.cy < H * 0.6)
}

/** Tape le + (haut-gauche) et ramène sur le bon écran. Vu en vrai (22/11/2026) : le + ouvre selon le cas la galerie
 *  « New post », la feuille « Create » (Reel / Edits / Post / Story…, sur le profil ET maintenant sur le fil) ou
 *  DIRECTEMENT le dernier mode utilisé (galerie « Add to story » après une Story).
 *  - feuille « Create » → ligne « Post » (galerie « New post » avec la barre POST / STORY / REEL : chemin testé) ;
 *  - galerie « Add to story » alors qu'on veut un post → croix ✕ (caméra avec la barre des modes, gérée ensuite).
 *  Renvoie 'story-gallery' si la galerie « Add to story » est ouverte (Story : on choisit le média tout de suite). */
async function tapCreatePlus(key: string, deviceId: string, W: number, H: number, pt: { x: number; y: number }, hooks?: VisionHooks, want: 'post' | 'story' = 'post'): Promise<'story-gallery' | 'post-gallery' | 'other'> {
  const plus = () => sendAction(key, deviceId, { type: 'tap', x: Math.round(pt.x * W), y: Math.round(pt.y * H) })
  const home = () => sendAction(key, deviceId, { type: 'tap', x: Math.round(TAB.home.x * W), y: Math.round(TAB.y * H) })
  // Hors profil (fil d'actualité) : le fil garde sa position de défilement (vu en vrai : bannière « Start Survey »,
  // Reels) et le + du haut n'est plus visible → Accueil, puis 2e tap séparé qui remonte le fil tout en haut.
  const before = await readScreenWords(key, deviceId)
  if (before && want === 'post' && newPostGallery(before.words, before.H)) return 'post-gallery' // déjà dans la galerie « New post »
  // Jamais dans le créateur / la caméra (en bas à gauche il y a la vignette de la galerie, pas l'onglet Accueil).
  const inCreator = !!before?.words.some(o => /^(post|story|reel|reels|instants|recents|live)$/i.test(o.text) && o.cy > before.H * 0.85)
    || !!before?.words.some(o => /^(recents|collage|yours)$/i.test(o.text))
    || (!!before && sharePageShown(before.words, before.W, before.H)) // page de partage : en bas à gauche = « Save draft »
  if (before && !inCreator && !isProfileScreen(before.words, before.H)) { await home(); await sleep(1800); await home(); await sleep(2500) }
  await plus()
  await sleep(2200)
  for (let k = 0; k < 3; k++) {
    const scr = await readScreenWords(key, deviceId)
    if (!scr) return 'other'
    if (createSheetShown(scr.words, scr.H)) {
      const row = scr.words.find(o => /^post$/i.test(o.text) && o.cy > scr.H * 0.3)
      hooks?.log?.('   feuille « Create » → « Post » (galerie New post)')
      await sendAction(key, deviceId, { type: 'tap', x: row ? row.cx + 20 : Math.round(0.2 * scr.W), y: row ? row.cy : Math.round(0.623 * scr.H) })
      await sleep(2500); continue
    }
    if (storyGalleryPick(scr.words, scr.W, scr.H)) {
      if (want === 'story') return 'story-gallery'
      hooks?.log?.('   galerie « Add to story » rouverte (dernier mode utilisé) → ✕, retour à la caméra et sa barre des modes')
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.084 * scr.W), y: Math.round(0.08 * scr.H) })
      await sleep(2200); continue
    }
    // Galerie « New post » ouverte par la ligne « Post » : déjà en mode POST, SANS barre des modes en bas (vu en vrai).
    return newPostGallery(scr.words, scr.H) ? 'post-gallery' : 'other'
  }
  return 'other'
}
/** Galerie « New post » (titre en haut). Pure. */
export function newPostGallery(words: { text: string; cy: number }[], H: number): boolean {
  return words.some(o => /^new$/i.test(o.text) && o.cy < H * 0.08) && words.some(o => /^post$/i.test(o.text) && o.cy < H * 0.08)
}

export async function postReelByVision(key: string, deviceId: string, opts: { caption?: string; location?: LocTarget; stay?: boolean; anchors?: typeof REEL_ANCHORS }, hooks?: VisionHooks): Promise<boolean> {
  const A = opts.anchors ?? REEL_ANCHORS
  const shot0 = await snapRetry(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible'); return false }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })

  // 0. Ferme un éventuel popup avant de commencer (sinon il bloque le tap du +) ; bouton AssistiveTouch hors du chemin.
  await dismissPopups(key, deviceId, hooks)
  await dismissIgInfoSheet(key, deviceId, hooks)
  await clearAssistiveTouch(key, deviceId, hooks)
  // 1. Ouvrir le créateur (+ haut-gauche)
  hooks?.log?.('➕ Ouverture du créateur (+)…')
  const landing = await tapCreatePlus(key, deviceId, W, H, A.createPlus, hooks)
  if (await grantPhotoAccessIfAsked(key, deviceId, hooks)) {
    hooks?.log?.('   Instagram relancé après l’accès aux photos → on rouvre le créateur')
    await dismissPopups(key, deviceId, hooks)
    await tapFrac(A.createPlus.x, A.createPlus.y)
    await sleep(2200)
  }
  // 2. Mode POST : galerie directe, dernière vidéo pré-sélectionnée, pas de caméra (ni effets).
  //    Une vidéo publiée en POST devient un Reel. Si POST est introuvable → caméra REEL.
  if (landing === 'post-gallery' || await selectMode(key, deviceId, [/^post$/i, /^publication$/i, /^publier$/i], 'POST', hooks)) {
    return postViaPostMode(key, deviceId, W, H, A, opts.caption, hooks, opts.location, opts.stay)
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
    await typeRich(key, deviceId, opts.caption.trim())
    await sleep(900)
    hooks?.log?.('   validation « OK »…')
    await tapButton(key, deviceId, [/^ok$/i], A.okBtn, W, H, hooks, [0, 0.14], 'OK légende')
    await sleep(1400)
    for (let k = 0; k < 3; k++) { // OK = coche bleue sans texte : éditeur encore ouvert → ✓ haut-droite, vérifié
      const ce = await readScreenWords(key, deviceId)
      if (!ce || !await captionEditorShown(ce)) break
      hooks?.log?.('   éditeur de légende encore ouvert → ✓ (haut-droite)')
      await tapCaptionCheck(key, deviceId, W, H, ce.shot); await sleep(1500)
    }
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
  // Vérifié : toujours sur la page de partage (Share + Tag people / Add location…) = rien n'est parti.
  {
    const sp = await readScreenWords(key, deviceId)
    if (sp && sp.words.some(o => /^(share|partager)$/i.test(o.text) && o.cy > sp.H * 0.8) && sp.words.some(o => /^(tag|location|audience|rename|draft)$/i.test(o.text))) {
      hooks?.log?.('❌ Share sans effet (toujours sur la page de partage) → non publié'); return false
    }
  }
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
async function postViaPostMode(key: string, deviceId: string, W: number, H: number, A: typeof REEL_ANCHORS, caption: string | undefined, hooks?: VisionHooks, location?: LocTarget, stay?: boolean): Promise<boolean> {
  await sleep(1800) // la galerie se charge
  // a. Vidéo la plus récente : 1re case de la grille, juste sous « Récents » (x = 1/8 de la largeur :
  //    dans la 1re case en 3 comme en 4 colonnes). Sans repère, on garde la pré-sélection d'Instagram.
  // La vidéo la plus récente = 1re vignette portant une DURÉE (« 0:06 ») sous « Récents » : sur un iPhone normal
  // la 1re case est l'APPAREIL PHOTO (la taper ouvrait la caméra).
  // La plus récente = la case juste APRÈS l'appareil photo (1re case), choisie par POSITION et toujours tapée :
  // la pré-sélection d'Instagram reprend parfois une ANCIENNE vidéo (vu en vrai le 22/11/2026 : 0:06 au lieu de 0:14).
  const rec = await findWordPoint(key, deviceId, [/^recents?$/i, /^r[ée]cents?$/i], hooks, { minY: 0.25, maxY: 0.85, tries: 3 })
  if (!rec) { hooks?.log?.('❌ grille « Recents » introuvable → rien n’est publié'); return false }
  const gridTop = rec.y + Math.round(0.076 * W)
  const gshot = await snapRetry(key, deviceId)
  const cw = W / GRID_COLS
  const camera = gshot ? (await meanLuma(gshot, 0.03, (gridTop + cw * 0.15) / H, 0.22, (gridTop + cw * 0.85) / H)) < 60 : true
  const cell = camera ? 1 : 0
  const pt = gridCellPoint(cell, gridTop, W)
  hooks?.log?.(`🎞️ Vidéo la plus récente (${camera ? 'case après l’appareil photo' : '1re case'}) → tap (${pt.x}, ${pt.y})`)
  await sendAction(key, deviceId, { type: 'tap', x: pt.x, y: pt.y })
  await sleep(1800)
  return finishPostFromGallery(key, deviceId, W, H, A, caption, hooks, 'Vidéo publiée (POST)', false, location, stay)
}

/** Éditeur photo : musique présente ? Le bouton « Audio » (1er de la barre d'outils) affiche la POCHETTE du morceau
 *  une fois une musique ajoutée → son libellé « Audio » disparaît (Text / Overlay / Filter restent). Pure. */
export function editorHasMusic(words: { text: string; cy: number }[], H: number): boolean {
  const tools = words.filter(o => o.cy > H * 0.8 && o.cy < H * 0.9)
  return tools.some(o => /^(overlay|filter|text)$/i.test(o.text)) && !tools.some(o => /^audio$/i.test(o.text))
}

/** Ajoute une musique dans l'éditeur photo : la « Suggested audio » d'Instagram (pastille en haut → + → Add),
 *  sinon bouton Audio → un des 1ers morceaux « For you » → flèche →. Vérifié à l'écran. */
async function addSuggestedMusic(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (hooks?.shouldStop?.()) return false
    const scr = await readScreenWords(key, deviceId)
    if (!scr) return false
    const { words, W, H } = scr
    if (editorHasMusic(words, H)) { hooks?.log?.('   ✓ musique présente'); return true }
    const sugg = words.find(o => /^suggested$/i.test(o.text) && o.cy < H * 0.15)
    if (sugg) {
      hooks?.log?.('🎵 Musique suggérée par Instagram → +')
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.754 * W), y: Math.max(Math.round(0.06 * H), sugg.cy - Math.round(0.011 * H)) })
    } else {
      const au = words.find(o => /^audio$/i.test(o.text) && o.cy > H * 0.8 && o.cy < H * 0.9)
      if (!au) { hooks?.log?.('   ⚠ bouton Audio introuvable'); return false }
      hooks?.log?.('🎵 Pas de suggestion → Audio › « For you »')
      await sendAction(key, deviceId, { type: 'tap', x: au.cx, y: au.cy - Math.round(0.016 * H) })
      await sleep(3500)
      const list = await readScreenWords(key, deviceId)
      // lignes de morceaux = sous-titres « Artiste · 30K reels · 1:55 » ; on prend l'un des 3 premiers (varie entre comptes)
      const rows = (list?.words ?? []).filter(o => /^reels?$/i.test(o.text) && o.cy > H * 0.2).sort((a, b) => a.cy - b.cy)
        .filter((o, i, a) => i === 0 || o.cy - a[i - 1].cy > 20)
      const row = rows[Math.floor(Math.random() * Math.min(3, rows.length))]
      const y = row ? row.cy - Math.round(0.032 * H) : Math.round(0.305 * H)
      hooks?.log?.(`   morceau ${row ? rows.indexOf(row) + 1 : 1} de la liste → aperçu`)
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.4 * W), y })
      await sleep(3000)
      hooks?.log?.('   ✓ choisir ce morceau (→)')
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.9 * W), y: Math.round(0.946 * H) })
      await sleep(3000)
      continue
    }
    await sleep(3000)
    // feuille de découpe : « Cancel … Add » → Add (haut-droite de la feuille)
    const sh = await readScreenWords(key, deviceId)
    const add = sh?.words.find(o => /^(add|ajouter|done|ok)$/i.test(o.text) && o.cx > W * 0.6 && o.cy > H * 0.3 && o.cy < H * 0.7)
    hooks?.log?.('   ✓ « Add »')
    await sendAction(key, deviceId, { type: 'tap', x: add ? add.cx : Math.round(0.897 * W), y: add ? add.cy : Math.round(0.457 * H) })
    await sleep(2500)
  }
  const fin = await readScreenWords(key, deviceId)
  const ok = !!fin && editorHasMusic(fin.words, fin.H)
  hooks?.log?.(ok ? '   ✓ musique ajoutée' : '❌ musique non ajoutée')
  return ok
}

// Fin commune Vidéo / Carrousel : galerie « New post » (médias choisis) → Next → éditeur → Next → légende → Share.
async function finishPostFromGallery(key: string, deviceId: string, W: number, H: number, A: typeof REEL_ANCHORS, caption: string | undefined, hooks: VisionHooks | undefined, doneLabel: string, music = false, location?: LocTarget, stay = false): Promise<boolean> {
  // b. Avancer jusqu'à l'écran de légende : Next en haut-droite (texte) ou en bas-droite (bouton bleu).
  let atCaption = false
  for (let step = 0; step < 11 && !atCaption; step++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapRetry(key, deviceId)
    if (!shot) { await sleep(800); continue }
    const words = withJoined([
      ...await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'] }),
      ...await ocrWords(shot, undefined, { threshold: null, invert: true, scale: 2, psms: ['11'] }),
    ])
    // Feuille « Sharing posts » (1re publication : compte public, réutilisation) → gros bouton bleu OK
    if (words.some(o => /^sharing$/i.test(o.text)) && words.some(o => /^posts?$/i.test(o.text) && o.cy > H * 0.3)) {
      hooks?.log?.('   feuille « Sharing posts » → OK')
      // OK = gros bouton bleu JUSTE AU-DESSUS du lien bleu « Manage settings » (le lien fausse le centre du bleu)
      const ok = words.find(o => /^ok$/i.test(o.text) && o.cy > H * 0.6)
      const manage = words.find(o => /^manage$/i.test(o.text) && o.cy > H * 0.6)
      const blue = ok || manage ? null : await findBlueButton(shot, 0.7, 0.88, 0.05, 0.95)
      const y = ok ? ok.cy : manage ? manage.cy - Math.round(0.067 * H) : blue ? blue.cy : Math.round(0.85 * H)
      await sendAction(key, deviceId, { type: 'tap', x: ok ? ok.cx : Math.round(W / 2), y })
      await sleep(1800); continue
    }
    // Page « Reels and Remix controls » ouverte par erreur (lien « Manage settings ») → croix en haut à gauche
    if (words.some(o => /^remix$/i.test(o.text) && o.cy < H * 0.1) && words.some(o => /^controls$/i.test(o.text) && o.cy < H * 0.1)) {
      hooks?.log?.('   réglages « Reels and Remix » ouverts par erreur → fermeture (✕)')
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.08 * W), y: Math.round(0.064 * H) })
      await sleep(1800); continue
    }
    if (words.some(o => CAPTION_MARK.some(p => p.test(o.text)))) { atCaption = true; break }
    // Fenêtre « première fois » à un seul OK (« Find your vibe »…) qui masque l'éditeur
    const first = !words.some(o => /^reels?[.!]?$/i.test(o.text)) ? firstTimeOkTap(words, W, H) : null
    if (first) {
      hooks?.log?.('   fenêtre d’information Instagram → OK')
      await sendAction(key, deviceId, { type: 'tap', x: first.x, y: first.y })
      await sleep(1500); continue
    }
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
    // Éditeur vidéo (« Edit video » + Audio / Text / Captions en bas) : bouton « Next → » bleu en bas à droite
    const inEditor = words.some(o => /^edit$/i.test(o.text) && o.cy > H * 0.85) && words.some(o => /^(audio|captions|overlay|voice)$/i.test(o.text) && o.cy > H * 0.75)
    if (inEditor) {
      // Musique obligatoire (post photo) : ajoutée et vérifiée AVANT de quitter l'éditeur, sinon rien n'est publié
      if (music && !editorHasMusic(words, H)) {
        if (!await addSuggestedMusic(key, deviceId, hooks)) { hooks?.log?.('❌ pas de musique → rien n’est publié (container suivant)'); return false }
        continue
      }
      const blue = await findBlueButton(shot, 0.86, 0.99, 0.55, 1)
      const nx = blue ? blue.cx : Math.round(0.82 * W), ny = blue ? blue.cy : Math.round(0.925 * H)
      hooks?.log?.(`   éditeur vidéo → « Next → » (${nx}, ${ny})`)
      await sendAction(key, deviceId, { type: 'tap', x: nx, y: ny })
      await sleep(3500)
      const after = await snapRetry(key, deviceId)
      const still = after ? (await ocrWords(after, undefined, { threshold: null, scale: 2, psms: ['11'], cropY: [0.85, 1] })).some(o => /^edit$/i.test(o.text)) : false
      if (still) { hooks?.log?.('   éditeur toujours affiché → double tap'); await doubleTap(key, deviceId, nx, ny); await sleep(3500) }
      continue
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
    await typeRich(key, deviceId, caption.trim())
    await sleep(900)
    if (await findTapText(key, deviceId, [/^ok$/i, /^done$/i, /^termin[ée]$/i], hooks, { label: 'OK légende', tries: 2, minX: 0.55, cropY: [0, 0.14] })) await sleep(1400)
    // Éditeur « Caption » encore ouvert (un hashtag en fin de texte ouvre des suggestions, vu en vrai) → OK, vérifié.
    for (let k = 0; k < 3; k++) {
      const ce = await readScreenWords(key, deviceId)
      if (!ce || !await captionEditorShown(ce)) break
      hooks?.log?.('   éditeur de légende encore ouvert → ✓ (haut-droite)')
      await tapCaptionCheck(key, deviceId, W, H, ce.shot)
      await sleep(1500)
    }
  }
  // c bis. Localisation (ville du marché du compte) — jamais bloquante : sans elle, on publie quand même.
  if (location && !await addLocationByVision(key, deviceId, location, hooks)) {
    hooks?.log?.('   📍 2e essai de localisation…')
    await addLocationByVision(key, deviceId, location, hooks)
  }
  // d. Partager (bouton bleu en bas), puis VÉRIFIÉ : la page de partage (Share + Tag people / Add location…) doit
  //    avoir disparu. Sinon on retape, et au bout de 3 essais : non publié (plus jamais annoncé à tort).
  // Toujours sur la page de partage = titre « New reel / New post » en haut OU bouton « Share » en bas à droite.
  // (Le petit texte « People you share this content with… » sous la localisation contient aussi « share » : ignoré.)
  const onSharePage = async () => {
    const sp = await readScreenWords(key, deviceId)
    if (!sp) return true // illisible : on ne conclut pas à un succès
    return sharePageShown(sp.words, sp.W, sp.H)
  }
  // Éditeur de légende encore ouvert par-dessus (souvent avec la liste des hashtags suggérés après un « #… » final) :
  // on le ferme par la coche bleue en haut à droite avant de taper Share (vu en vrai le 24/11/2026).
  const closeCaptionEditor = async () => {
    for (let j = 0; j < 2; j++) {
      const ce = await readScreenWords(key, deviceId)
      if (!ce || !await captionEditorShown(ce)) return
      hooks?.log?.('   éditeur de légende encore ouvert → ✓ (haut-droite)')
      await tapCaptionCheck(key, deviceId, W, H, ce.shot) // jamais Share ici : la liste des hashtags suggérés est dessous
      await sleep(1800)
    }
  }
  await closeCaptionEditor()
  let shared = false
  for (let k = 0; k < 3 && !shared; k++) {
    if (k) hooks?.log?.(`   toujours sur la page de partage → nouveau tap sur Share (${k + 1}/3)`)
    if (k) await closeCaptionEditor()
    if (!await tapButton(key, deviceId, [/^share$/i, /^partager$/i], A.shareBtn, W, H, hooks, [0.9, 1], 'Share', 3, [0.5, 1])) return false
    await sleep(4000)
    // Fenêtre « Update on your original audio » (vue en vrai le 22/11/2026) : le Reel attend → bouton bleu « Share »
    // de la fenêtre (choix par défaut d'Instagram).
    for (let j = 0; j < 2; j++) {
      const sh = await readScreenWords(key, deviceId)
      if (!sh || !originalAudioSheet(sh.words)) break
      const blue = await findBlueButton(sh.shot, 0.75, 0.97)
      hooks?.log?.('   fenêtre « Update on your original audio » → Share')
      await sendAction(key, deviceId, { type: 'tap', x: blue ? blue.cx : Math.round(W / 2), y: blue ? blue.cy : Math.round(0.886 * H) })
      await sleep(4000)
    }
    const after = await readScreenWords(key, deviceId)
    shared = !!after && !originalAudioSheet(after.words) && !await captionEditorShown(after) && !await onSharePage()
  }
  if (!shared) { hooks?.log?.('❌ Share sans effet (toujours sur la page de partage) → non publié'); return false }
  hooks?.log?.(`📤 ${doneLabel}.`)
  // Bandeau « Posting… » en haut du fil : on ne quitte pas Instagram tant que l'envoi n'est pas fini (max ~90 s)
  for (let k = 0; k < 15; k++) {
    if (hooks?.shouldStop?.()) break
    const scr = await readScreenWords(key, deviceId)
    if (!scr || !scr.words.some(o => /^(posting|publication|envoi|uploading)[.…]*$/i.test(o.text) && o.cy < scr.H * 0.5)) break
    if (k === 0) hooks?.log?.('   ⏳ envoi en cours (« Posting… »)…')
    await sleep(5000)
  }
  await dismissPopups(key, deviceId, hooks)
  if (stay) {
    // session : le compte reposte juste après → on reste dans Instagram (onglet Accueil), le scroll part d'ici
    await sendAction(key, deviceId, { type: 'tap', x: Math.round(TAB.home.x * W), y: Math.round(TAB.y * H) })
    await sleep(1200)
    return true
  }
  hooks?.log?.('🏠 Retour à l’accueil.')
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1200)
  return true
}

// ── Localisation (page de partage) : « Add location » → recherche « Ville, Pays » → la BONNE ligne → Add ─────────
// Relevé en vrai le 22/11/2026 (NOJB) : 1re fois, fenêtre « Content tagged with a location will appear on the map »
// → OK ; feuille « Locations » avec « Search » (jamais « Turn on Location Services ») ; la 1re ligne n'est pas
// forcément la ville (« Paris » → « Paris Las Vegas ») ; une ligne tapée ouvre « Map preview » → bouton « Add ».
export type LocTarget = { q: string; city: RegExp; region: RegExp; label: string; first?: RegExp }

/** Ligne de résultat = nom de la ville ET pays / État sur la même ligne, sous le champ de recherche, et la ligne
 *  COMMENCE par la ville (vu en vrai : « Miami, Florida » donnait d'abord « West Miami, Florida »). Pure. */
export function locationRow(words: { text: string; cx: number; cy: number }[], loc: { city: RegExp; region: RegExp; first?: RegExp }, belowY: number): { x: number; y: number } | null {
  const cities = words.filter(o => o.cy > belowY && loc.city.test(o.text)).sort((a, b) => a.cy - b.cy)
  const ok: { x: number; y: number; plain: boolean }[] = []
  for (const c of cities) {
    const line = words.filter(o => Math.abs(o.cy - c.cy) < 12).sort((a, b) => a.cx - b.cx)
    const ri = line.findIndex(o => o !== c && o.cx > c.cx && loc.region.test(o.text.replace(/[,.]$/, '')))
    if (ri < 0) continue
    if (!(loc.first ?? loc.city).test(line[0].text)) continue // un mot avant la ville (« West », « North »…) : autre lieu
    // « Frankfurt, Germany » (rien après le pays) = la ville ; « Frankfurt Germany Temple » = un lieu (vu en vrai)
    ok.push({ x: c.cx, y: c.cy, plain: ri === line.length - 1 })
  }
  const best = ok.find(o => o.plain) ?? ok[0]
  return best ? { x: best.x, y: best.y } : null
}

/** Lieu DÉJÀ posé sur la page de partage : ligne avec la ville ou le pays sous « Tag people », et plus de ligne « Add
 *  location ». Pure. */
export function locationAlreadySet(words: { text: string; cx: number; cy: number }[], loc: { city: RegExp; region: RegExp }, H: number): boolean {
  const addLoc = words.some(o => /^location$/i.test(o.text) && words.some(a => /^add$/i.test(a.text) && Math.abs(a.cy - o.cy) < 12 && a.cx < o.cx))
  if (addLoc) return false
  const isPlace = (o: { text: string }) => loc.city.test(o.text) || loc.region.test(o.text.replace(/[,.]$/, ''))
  // repère 1 : juste sous « Tag people »
  const tag = words.find(o => /^tag$/i.test(o.text) && words.some(p => /^people$/i.test(p.text) && Math.abs(p.cy - o.cy) < 12))
  if (tag && words.some(o => o.cy > tag.cy && o.cy < tag.cy + H * 0.12 && isPlace(o))) return true
  // repère 2 : juste AU-DESSUS du texte « People you share this content with can see the location… » (page défilée :
  // « Tag people » n'est plus à l'écran — vu en vrai : 2e essai « Add location introuvable » alors que le lieu était posé)
  const note = words.find(o => /^people$/i.test(o.text) && words.some(p => /^share$/i.test(p.text) && Math.abs(p.cy - o.cy) < 12 && p.cx > o.cx))
  return !!note && words.some(o => o.cy < note.cy && o.cy > note.cy - H * 0.1 && isPlace(o))
}

/** Alerte iOS « Allow “Instagram” to use your location? » (Allow Once / While Using / Don't Allow) : on refuse
 *  toujours (la recherche de ville marche sans la position). true si traitée. */
export function locationAlertDontAllow(words: { text: string; cx: number; cy: number }[]): { x: number; y: number } | null {
  const t = (o: { text: string }) => o.text.toLowerCase().replace(/[^a-z']/g, '')
  if (!words.some(o => t(o) === 'location' || t(o) === 'locationservices') || !words.some(o => /^(allow|once|while)$/.test(t(o)))) return null
  const d = words.find(o => /^(don't|dont)$/.test(t(o)))
  return d ? { x: d.cx + 25, y: d.cy } : null
}
/** Ajoute la localisation sur la page de partage. true si posée et vérifiée ; sinon referme proprement (Cancel) et
 *  renvoie false : la publication continue SANS localisation (jamais bloquée pour ça). */
export async function addLocationByVision(key: string, deviceId: string, loc: LocTarget, hooks?: VisionHooks): Promise<boolean> {
  const s0 = await readScreenWords(key, deviceId)
  if (!s0) return false
  const { W, H } = s0
  const tap = (x: number, y: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(x), y: Math.round(y) })
  if (locationAlreadySet(s0.words, loc, H)) { hooks?.log?.(`   ✓ localisation déjà posée (${loc.label})`); return true }
  hooks?.log?.(`📍 Localisation : ${loc.label}…`)
  // 1. ligne « Add location » (sous « Tag people », souvent hors écran → on fait défiler la page de partage)
  let row: { x: number; y: number } | null = null
  let closeTries = 0
  for (let k = 0; k < 3 && !row; k++) {
    const scr = k || closeTries ? await readScreenWords(key, deviceId) : s0
    const lw = scr?.words.find(o => /^location$/i.test(o.text) && o.cy > H * 0.25 && o.cy < H * 0.9 && scr.words.some(a => /^add$/i.test(a.text) && Math.abs(a.cy - o.cy) < 12 && a.cx < o.cx))
    if (lw) { row = { x: lw.cx, y: lw.cy }; break }
    // « Add location » pas lu, mais « Tag people » visible : la ligne du lieu est juste en dessous (≈ 7,5 % de la hauteur)
    const tg = scr?.words.find(o => /^tag$/i.test(o.text) && o.cy > H * 0.25 && o.cy < H * 0.82 && scr.words.some(p => /^people$/i.test(p.text) && Math.abs(p.cy - o.cy) < 12))
    if (tg && scr && !locationAlreadySet(scr.words, loc, H) && !(await captionEditorShown(scr))) { hooks?.log?.('   « Add location » non lu → ligne sous « Tag people »'); row = { x: Math.round(0.35 * W), y: Math.round(tg.cy + 0.075 * H) }; break }
    // éditeur de légende encore ouvert (liste des hashtags suggérés) : JAMAIS de défilement ici → coche ✓ d'abord
    if (scr && await captionEditorShown(scr)) {
      hooks?.log?.('   éditeur de légende encore ouvert → ✓ (haut-droite)')
      await tapCaptionCheck(key, deviceId, W, H, scr.shot); await sleep(1600); k--; if (++closeTries > 3) break; continue
    }
    await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W / 2), y1: Math.round(0.78 * H), x2: Math.round(W / 2), y2: Math.round(0.42 * H), duration_ms: 500 })
    await sleep(1200)
  }
  if (!row) { hooks?.log?.('   ⚠ ligne « Add location » introuvable → publication sans localisation'); return false }
  await tap(row.x, row.y)
  await sleep(2800)
  // Fermeture SÛRE de la feuille de lieu : « Cancel » (anciennes versions) OU croix ✕ en haut à droite, à la hauteur du
  // titre « Locations » ; sinon on la glisse vers le bas. VÉRIFIÉE (vu en vrai le 24/11/2026 : la feuille restait
  // ouverte, champ vide, et bloquait toute la session).
  const cancel = async () => {
    for (let k = 0; k < 3; k++) {
      const c = await readScreenWords(key, deviceId)
      if (!c) { await sleep(800); continue }
      const title = c.words.find(o => /^locations?$/i.test(o.text) && o.cy < H * 0.25)
      const cw = c.words.find(o => /^cancel$/i.test(o.text) && o.cy < H * 0.2)
      const search = c.words.some(o => o.text.replace(/[^a-z]/gi, '').toLowerCase() === 'search' && o.cy < H * 0.45)
      const mapPreview = c.words.some(o => /^preview$/i.test(o.text)) && c.words.some(o => /^map$/i.test(o.text))
      if (!title && !cw && !search && !mapPreview) return // plus de feuille : page de partage (la miniature dit « Preview » : ignorée)
      if (cw) await tap(cw.cx, cw.cy)
      else if (title && k < 2) await tap(0.9 * W, title.cy)          // croix ✕ alignée sur le titre
      else await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W / 2), y1: Math.round(0.2 * H), x2: Math.round(W / 2), y2: Math.round(0.9 * H), duration_ms: 300 })
      await sleep(1600)
    }
  }
  // 2. fenêtre « … will appear on the map » (1re fois) → OK, puis champ « Search »
  let search: { x: number; y: number } | null = null
  let sheetOpen = false
  for (let k = 0; k < 5 && !search; k++) {
    const scr = await readScreenWords(key, deviceId)
    if (!scr) { await sleep(800); continue }
    const la = locationAlertDontAllow(scr.words)
    if (la) { hooks?.log?.('   alerte iOS « utiliser votre position » → Don’t Allow'); await doubleTap(key, deviceId, Math.round(la.x), Math.round(la.y)); await sleep(1800); continue }
    if (scr.words.some(o => /^map$/i.test(o.text)) && scr.words.some(o => /^tagged$/i.test(o.text))) {
      const ok = firstTimeOkTap(scr.words, W, H)
      const blue = ok ? null : await findBlueButton(scr.shot, 0.75, 0.97)
      hooks?.log?.('   fenêtre « location … on the map » → OK')
      await tap(ok ? ok.x : blue ? blue.cx : W / 2, ok ? ok.y : blue ? blue.cy : 0.888 * H)
      await sleep(1800); continue
    }
    // « Search » peut être lu avec le curseur collé (« |Search ») → mot nettoyé
    if (scr.words.some(o => /^locations$/i.test(o.text) && o.cy < H * 0.1)) sheetOpen = true
    const sw = scr.words.find(o => o.text.replace(/[^a-z]/gi, '').toLowerCase() === 'search' && o.cy < H * 0.45)
    if (sw) search = { x: sw.cx, y: sw.cy }
    else {
      // autre fenêtre « première fois » avec un OK au centre → OK
      const ok = firstTimeOkTap(scr.words, W, H)
      if (ok) { hooks?.log?.('   fenêtre Instagram → OK'); await tap(ok.x, ok.y); await sleep(1800) } else await sleep(1000)
    }
  }
  // feuille « Locations » ouverte mais « Search » mal lu (curseur, bulle Paste/AutoFill) → position connue du champ
  if (!search && sheetOpen) search = { x: 0.3 * W, y: 0.314 * H }
  if (!search) { hooks?.log?.('   ⚠ recherche de lieu introuvable → publication sans localisation'); await cancel(); return false }
  await tap(search.x, search.y)
  await sleep(1200)
  await typeRich(key, deviceId, loc.q)
  // la saisie se fait lettre par lettre (vu en vrai : « Miami, Fl… » encore en cours) et la liste montre d'abord les
  // anciennes suggestions → on attend que le dernier mot de la recherche soit dans le champ, puis que la liste suive
  const lastWord = loc.q.split(/[\s,]+/).filter(Boolean).pop()!.toLowerCase()
  const waitTyped = async (): Promise<'done' | 'partial' | 'empty'> => {
    let seen = false
    for (let k = 0; k < 10; k++) {
      await sleep(1000)
      const f = await readScreenWords(key, deviceId)
      const row = f?.words.filter(o => Math.abs(o.cy - search!.y) < 18 && !/^search$/i.test(o.text.replace(/[^a-z]/gi, ''))) ?? []
      if (row.some(o => o.text.toLowerCase().replace(/[^a-zäöüß]/g, '') === lastWord.replace(/[^a-zäöüß]/g, ''))) return 'done'
      if (row.some(o => /[a-z]{2,}/i.test(o.text))) seen = true
    }
    return seen ? 'partial' : 'empty'
  }
  // champ resté VIDE après 10 s (la saisie n'a pas pris) → on retape le champ et la ville, une seule fois.
  // (Vérifier trop tôt retapait pendant la frappe : « Stuttgart, GermanyStuttgart… » → aucun résultat, vu le 24/11/2026.)
  if (await waitTyped() === 'empty') {
    hooks?.log?.('   champ de recherche resté vide → nouvelle saisie')
    await tap(search.x, search.y); await sleep(1200)
    await typeRich(key, deviceId, loc.q)
    await waitTyped()
  }
  await sleep(1300)
  // 3. la bonne ligne (ville + pays/État, commençant par la ville), jamais la 1re au hasard
  let pt: { x: number; y: number } | null = null
  for (let k = 0; k < 3 && !pt; k++) {
    const scr = await readScreenWords(key, deviceId)
    const la = scr ? locationAlertDontAllow(scr.words) : null
    if (la) { hooks?.log?.('   alerte iOS « utiliser votre position » → Don’t Allow'); await doubleTap(key, deviceId, Math.round(la.x), Math.round(la.y)); await sleep(1800); continue }
    if (scr) pt = locationRow(scr.words, loc, search.y + 15)
    if (!pt) await sleep(1500)
  }
  if (!pt) { hooks?.log?.(`   ⚠ « ${loc.label} » absent des résultats → publication sans localisation`); await cancel(); return false }
  await tap(pt.x, pt.y)
  // 4. « Map preview » → bouton « Add » (bleu, en bas) — la feuille met un peu de temps à monter
  for (let k = 0; k < 4; k++) {
    await sleep(k ? 1200 : 1000)
    const mp = await readScreenWords(key, deviceId)
    if (!mp?.words.some(o => /^preview$/i.test(o.text))) continue
    const addW = mp.words.find(o => /^add$/i.test(o.text) && o.cy > H * 0.85)
    const blue = addW ? null : await findBlueButton(mp.shot, 0.85, 1)
    await tap(addW ? addW.cx : blue ? blue.cx : W / 2, addW ? addW.cy : blue ? blue.cy : 0.942 * H)
    break
  }
  // 5. vérifié : retour sur la page de partage, la ligne du lieu remplace « Add location » (relu jusqu'à 4 fois)
  let set = false
  for (let k = 0; k < 5 && !set; k++) {
    await sleep(k ? 1200 : 800)
    const v = await readScreenWords(key, deviceId)
    set = !!v && (locationAlreadySet(v.words, loc, H) || (sharePageShown(v.words, W, H) && v.words.some(o => loc.region.test(o.text.replace(/[,.]$/, '')) || loc.city.test(o.text)) && !v.words.some(o => /^(locations|search)$/i.test(o.text))))
  }
  if (set) { hooks?.log?.(`   ✓ localisation : ${loc.label}`); return true }
  hooks?.log?.('   ⚠ localisation non confirmée → publication sans');
  await cancel()
  return false
}

// ── Mise en place du compte ouvert : photo de profil + bio, via Profil › Edit profile ─────────────────────────────
// Écrans relevés en vrai le 22/11/2026 (NOJB) : bouton « Edit profile » sous les compteurs ; en haut la photo
// (tap → feuille « Choose from library / Import from Facebook / Take photo ») ; galerie « Cancel · Library · Done »,
// grille 4 colonnes sous « Recents », 1re case = appareil photo, la photo la plus récente déjà sélectionnée ;
// ligne « Bio » → éditeur « Bio » avec « Done » en haut à droite.
async function openEditProfile(key: string, deviceId: string, W: number, H: number, hooks?: VisionHooks): Promise<boolean> {
  const tap = (x: number, y: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(x), y: Math.round(y) })
  for (let k = 0; k < 3; k++) {
    const scr = await readScreenWords(key, deviceId)
    if (scr?.words.some(o => /^edit$/i.test(o.text) && o.cy < H * 0.08) && scr.words.some(o => /^profile$/i.test(o.text) && o.cy < H * 0.08)) return true
    const e = scr?.words.find(o => /^edit$/i.test(o.text) && o.cy < H * 0.6 && scr.words.some(p => /^profile$/i.test(p.text) && Math.abs(p.cy - o.cy) < 12 && p.cx > o.cx))
    if (e) { await tap(e.cx + 20, e.cy); await sleep(3500); continue }
    await tap(PROFILE_XS[k % PROFILE_XS.length] * W, TAB.y * H) // onglet Profil (plusieurs positions : barre flottante ou pleine)
    await sleep(2500)
  }
  const v = await readScreenWords(key, deviceId)
  return !!v?.words.some(o => /^bio$/i.test(o.text))
}

/** Photo de profil = la photo la plus récente de la pellicule (injectée juste avant). Depuis « Edit profile ». */
async function setPfpOnEditProfile(key: string, deviceId: string, W: number, H: number, hooks?: VisionHooks): Promise<boolean> {
  const tap = (x: number, y: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(x), y: Math.round(y) })
  hooks?.log?.('🖼 Photo de profil : Edit picture › Choose from library…')
  await tap(0.36 * W, 0.215 * H) // la photo actuelle (en haut à gauche)
  await sleep(2200)
  const sh = await readScreenWords(key, deviceId)
  const choose = sh?.words.find(o => /^choose$/i.test(o.text) && o.cy > H * 0.4)
  if (!choose) { hooks?.log?.('   ⚠ « Choose from library » introuvable'); await tap(0.5 * W, 0.12 * H); await sleep(1200); return false }
  await tap(choose.cx + 30, choose.cy)
  await sleep(3000)
  const lib = await readScreenWords(key, deviceId)
  const rec = lib?.words.find(o => /^recents?$/i.test(o.text))
  if (!lib || !rec) { hooks?.log?.('   ⚠ galerie « Library » non reconnue'); return false }
  const cw = W / 4
  await tap(cw * 1.5, rec.cy + 0.076 * W + cw * 0.45) // photo la plus récente (case après l'appareil photo)
  await sleep(1500)
  const done = (await readScreenWords(key, deviceId))?.words.find(o => /^done$/i.test(o.text) && o.cy < H * 0.1)
  await tap(done ? done.cx : 0.9 * W, done ? done.cy : 0.056 * H)
  await sleep(4500)
  // éventuelle feuille après la photo (partage au fil, etc.) : on ne publie rien → « Not now / Cancel »
  for (let k = 0; k < 2; k++) {
    const x = await readScreenWords(key, deviceId)
    const nn = x?.words.find(o => /^(not|cancel|skip)$/i.test(o.text) && o.cy > H * 0.3)
    if (!x || x.words.some(o => /^bio$/i.test(o.text)) || !nn) break
    await tap(nn.cx + 15, nn.cy); await sleep(2000)
  }
  // vérifiée : la photo n'est plus l'avatar gris par défaut (rose du générateur)
  const v = await snapRetry(key, deviceId)
  const [r, g, b] = v ? await pixelRgb(v, Math.round(0.36 * W), Math.round(0.2 * H), 6) : [128, 128, 128]
  const grey = Math.abs(r - g) < 12 && Math.abs(g - b) < 12
  hooks?.log?.(grey ? '   ⚠ photo de profil non confirmée (toujours grise)' : '   ✓ photo de profil changée')
  return !grey
}

/** Bio : ligne « Bio » › éditeur › texte remplacé (⌘A puis saisie/collage) › Done, vérifiée. Depuis « Edit profile ». */
async function setBioOnEditProfile(key: string, deviceId: string, W: number, H: number, bio: string, hooks?: VisionHooks): Promise<boolean> {
  const tap = (x: number, y: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(x), y: Math.round(y) })
  hooks?.log?.('✏️ Bio…')
  const scr = await readScreenWords(key, deviceId)
  const b = scr?.words.find(o => /^bio$/i.test(o.text) && o.cx < W * 0.3 && o.cy > H * 0.3 && o.cy < H * 0.8)
  if (!b) { hooks?.log?.('   ⚠ ligne « Bio » introuvable'); return false }
  await tap(W * 0.5, b.cy)
  await sleep(2500)
  await tap(W * 0.5, H * 0.16)
  await sleep(600)
  await sendAction(key, deviceId, { type: 'press', modifiers: ['gui'], key: 'a' })
  await sleep(500)
  await typeRich(key, deviceId, bio)
  await sleep(1500)
  const done = (await readScreenWords(key, deviceId))?.words.find(o => /^done$/i.test(o.text) && o.cy < H * 0.1)
  await tap(done ? done.cx : 0.9 * W, done ? done.cy : 0.064 * H)
  await sleep(3000)
  const v = await readScreenWords(key, deviceId)
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9äöüßéèàçùêâîôû]/g, '')
  const first = norm(bio.split('\n')[0]).slice(0, 6)
  const ok = !!v && v.words.some(o => /^bio$/i.test(o.text)) && (!first || v.words.some(o => norm(o.text).includes(first)))
  hooks?.log?.(ok ? '   ✓ bio enregistrée' : '   ⚠ bio non confirmée à l’écran')
  return ok
}

/** Mise en place du compte ouvert : photo de profil (la plus récente de la pellicule) et/ou bio. */
export async function setupProfileByVision(key: string, deviceId: string, opts: { bio?: string; pfp?: boolean }, hooks?: VisionHooks): Promise<{ pfp: boolean | null; bio: boolean | null }> {
  const s0 = await readScreenWords(key, deviceId)
  if (!s0) return { pfp: null, bio: null }
  const { W, H } = s0
  if (!await openEditProfile(key, deviceId, W, H, hooks)) { hooks?.log?.('❌ page « Edit profile » non atteinte'); return { pfp: opts.pfp ? false : null, bio: opts.bio ? false : null } }
  const pfp = opts.pfp ? await setPfpOnEditProfile(key, deviceId, W, H, hooks) : null
  const bio = opts.bio ? await setBioOnEditProfile(key, deviceId, W, H, opts.bio, hooks) : null
  await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.06 * W), y: Math.round(0.056 * H) }) // retour au profil
  await sleep(1500)
  return { pfp, bio }
}

// ── Carrousel photo (post feed à plusieurs photos) ──────────────────────────────
// Galerie « New post » (mode POST) : grille de 4 colonnes sous « Recents » ; sur un iPhone la 1re case peut être
// l'appareil photo. Les photos sont injectées dans l'ordre INVERSE du carrousel (la 1re du carrousel en dernier =
// la plus récente, pré-cochée n°1 par Instagram), donc la photo k du carrousel est dans la case (départ + k).
// Bouton « Select » (sélection multiple) → chaque case cochée porte une pastille blanche numérotée.
export const CAROUSEL_MAX = 6 // 2 rangées visibles sans défiler la grille (défiler la grille déplace l'aperçu)
const GRID_COLS = 4

/** Case de la grille sous un point (pure). -1 hors grille. */
export function gridCellAt(x: number, y: number, gridTop: number, W: number, cols = GRID_COLS): number {
  const cw = W / cols
  if (y < gridTop || x < 0 || x >= W) return -1
  return Math.floor((y - gridTop) / cw) * cols + Math.min(cols - 1, Math.floor(x / cw))
}
/** Point à taper pour une case (haut de la case : le bas de la 2e rangée passe sous la barre des modes). Pure. */
export function gridCellPoint(idx: number, gridTop: number, W: number, cols = GRID_COLS): { x: number; y: number } {
  const cw = W / cols
  return { x: Math.round((idx % cols) * cw + cw * 0.42), y: Math.round(gridTop + Math.floor(idx / cols) * cw + cw * 0.4) }
}
/** Cases cochées d'après les pastilles blanches (pastille en haut à droite de sa case). Pure. */
export function checkedCells(disks: { cx: number; cy: number }[], gridTop: number, W: number, cols = GRID_COLS): number[] {
  const cw = W / cols
  // la pastille est dans le quart haut-droit de sa case : on recentre avant de chercher la case
  return [...new Set(disks.map(d => gridCellAt(d.cx - cw * 0.3, d.cy + cw * 0.3, gridTop, W, cols)).filter(i => i >= 0))].sort((a, b) => a - b)
}

async function readGrid(key: string, deviceId: string, hooks?: VisionHooks) {
  const scr = await readScreenWords(key, deviceId)
  if (!scr) return null
  const { words, W, H, shot } = scr
  const rec = words.find(o => /^r[ée]cents?$/i.test(o.text) && o.cy > H * 0.25 && o.cy < H * 0.85)
  if (!rec) return { scr, rec: null, gridTop: 0, checked: [] as number[] }
  const gridTop = Math.round(rec.cy + 0.076 * W)
  const disks = await findWhiteDisks(shot, gridTop / H, Math.min(1, (gridTop + 2 * (W / GRID_COLS)) / H))
  void hooks
  return { scr, rec, gridTop, checked: checkedCells(disks, gridTop, W) }
}

/** Coche `count` photos consécutives (la plus récente d'abord) en sélection multiple. Chaque tap est vérifié
 *  (pastille blanche) avant le suivant : un tap raté est refait UNE fois, jamais en double (re-taper = décocher). */
async function selectCarouselPhotos(key: string, deviceId: string, count: number, hooks?: VisionHooks): Promise<boolean> {
  let g = await readGrid(key, deviceId, hooks)
  for (let k = 0; k < 4 && (!g || !g.rec); k++) { await sleep(1200); g = await readGrid(key, deviceId, hooks) }
  if (!g || !g.rec) { hooks?.log?.('❌ galerie « New post » non reconnue (« Recents » introuvable)'); return false }
  // 1. Sélection multiple : « Select » à droite de « Recents » (devient « Cancel » une fois active)
  // État lu à la COULEUR du bouton (pastille BLANCHE « Cancel » = sélection active, sombre « Select » = inactive) :
  // l'OCR rate souvent « Cancel » (icône collée) → re-taper « Select » désactivait la sélection.
  const multiOn = async (gg: NonNullable<typeof g>) => {
    if (gg.scr.words.some(o => /cancel|annuler/i.test(o.text) && Math.abs(o.cy - gg.rec!.cy) < 25 && o.cx > gg.scr.W * 0.55)) return true
    const { W, H, shot } = gg.scr, ry = gg.rec!.cy
    return (await meanLuma(shot, 0.76, (ry - 0.006 * H) / H, 0.93, (ry + 0.006 * H) / H)) > 150 && W > 0
  }
  for (let k = 0; k < 4; k++) {
    const { words, W, H } = g!.scr
    const ry = g!.rec!.cy
    const cancel = await multiOn(g!)
    const ok = firstTimeOkTap(words, W, H)
    if (ok && words.some(o => /^share$/i.test(o.text)) && words.some(o => /^more$/i.test(o.text))) {
      hooks?.log?.('   fenêtre « Share more » → OK')
      await sendAction(key, deviceId, { type: 'tap', x: ok.x, y: ok.y }); await sleep(1500)
    } else if (cancel) break
    else {
      const sel = words.find(o => /^(select|s[ée]lectionner)$/i.test(o.text) && Math.abs(o.cy - ry) < 25 && o.cx > W * 0.55)
      hooks?.log?.('☑ Sélection multiple (« Select »)…')
      await sendAction(key, deviceId, { type: 'tap', x: sel ? sel.cx : Math.round(0.84 * W), y: sel ? sel.cy : ry })
      await sleep(1600)
      // 1re fois : fenêtre « Share more » (masque « Recents ») → OK
      const pop = await readScreenWords(key, deviceId)
      const pok = pop && pop.words.some(o => /^more$/i.test(o.text)) ? firstTimeOkTap(pop.words, pop.W, pop.H) : null
      if (pok) { hooks?.log?.('   fenêtre « Share more » → OK'); await sendAction(key, deviceId, { type: 'tap', x: pok.x, y: pok.y }); await sleep(1500) }
    }
    g = await readGrid(key, deviceId, hooks)
    if (!g || !g.rec) { hooks?.log?.('❌ galerie perdue après « Select »'); return false }
  }
  const { W, shot } = g!.scr
  if (!await multiOn(g!)) { hooks?.log?.('❌ sélection multiple non activée'); return false }
  // 2. Case de départ = celle pré-cochée (la plus récente). Sinon 1re case photo (après l'appareil photo, case sombre).
  let checked = g!.checked
  if (checked.length > 1) {
    hooks?.log?.(`   ${checked.length} cases déjà cochées → on repart d’une sélection propre`)
    for (const i of [...checked].reverse()) { const p = gridCellPoint(i, g!.gridTop, W); await sendAction(key, deviceId, { type: 'tap', x: p.x, y: p.y }); await sleep(900) }
    g = await readGrid(key, deviceId, hooks); checked = g?.checked ?? []
    if (checked.length) { hooks?.log?.('❌ impossible de décocher la sélection précédente'); return false }
  }
  let start = checked[0]
  if (start === undefined) {
    const cw = W / GRID_COLS, H = g!.scr.H
    const camera = (await meanLuma(shot, 0.04, (g!.gridTop + cw * 0.1) / H, 0.21, (g!.gridTop + cw * 0.9) / H)) < 60
    start = camera ? 1 : 0
    hooks?.log?.(`   aucune case pré-cochée → départ case ${start + 1}${camera ? ' (1re = appareil photo)' : ''}`)
  }
  if (start + count > 2 * GRID_COLS) { hooks?.log?.(`❌ ${count} photos ne tiennent pas dans les 2 rangées visibles`); return false }
  // 3. Cocher les cases dans l'ordre, chacune vérifiée
  for (let i = 0; i < count; i++) {
    const idx = start + i
    if (checked.includes(idx)) continue
    if (hooks?.shouldStop?.()) return false
    let done = false
    for (let t = 0; t < 2 && !done; t++) {
      const p = gridCellPoint(idx, g!.gridTop, W)
      hooks?.log?.(`🖼 Photo ${i + 1}/${count} → case ${idx + 1}${t ? ' (2e essai)' : ''}`)
      await sendAction(key, deviceId, { type: 'tap', x: p.x, y: p.y })
      await sleep(1100)
      const g2 = await readGrid(key, deviceId, hooks)
      if (!g2 || !g2.rec) { hooks?.log?.('❌ galerie perdue pendant la sélection'); return false }
      g = g2; checked = g2.checked
      done = checked.includes(idx)
    }
    if (!done) { hooks?.log?.(`❌ case ${idx + 1} non cochée`); return false }
  }
  const want = Array.from({ length: count }, (_, i) => start + i)
  if (checked.length !== count || !want.every(i => checked.includes(i))) { hooks?.log?.(`❌ sélection inattendue (cases ${checked.map(i => i + 1).join(', ') || 'aucune'})`); return false }
  hooks?.log?.(`   ✓ ${count} photos cochées dans l’ordre`)
  return true
}

/** Post feed CARROUSEL : `count` photos les plus récentes (injectées juste avant, dans l'ordre inverse) → légende → Share. */
export async function postCarouselByVision(key: string, deviceId: string, opts: { count: number; caption?: string; music?: boolean; location?: LocTarget; stay?: boolean; anchors?: typeof REEL_ANCHORS }, hooks?: VisionHooks): Promise<boolean> {
  const A = opts.anchors ?? REEL_ANCHORS
  const count = Math.max(1, Math.min(CAROUSEL_MAX, Math.round(opts.count)))
  const shot0 = await snapRetry(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible'); return false }
  let landing: Awaited<ReturnType<typeof tapCreatePlus>> = 'other'
  for (let k = 0; k < 2; k++) {
    await dismissPopups(key, deviceId, hooks)
    await dismissIgInfoSheet(key, deviceId, hooks)
    await clearAssistiveTouch(key, deviceId, hooks)
    hooks?.log?.(`➕ Ouverture du créateur (+) — carrousel de ${count} photo(s)…`)
    landing = await tapCreatePlus(key, deviceId, W, H, A.createPlus, hooks)
    if (!await grantPhotoAccessIfAsked(key, deviceId, hooks)) break
    hooks?.log?.('   Instagram relancé après l’accès aux photos → on rouvre le créateur')
  }
  if (landing !== 'post-gallery' && !await selectMode(key, deviceId, [/^post$/i, /^publication$/i, /^publier$/i], 'POST', hooks)) return false
  await sleep(1800)
  if (count > 1) { if (!await selectCarouselPhotos(key, deviceId, count, hooks)) return false }
  else hooks?.log?.('🖼 1 photo : la plus récente, pré-sélectionnée par Instagram')
  return finishPostFromGallery(key, deviceId, W, H, A, opts.caption, hooks, count > 1 ? `Carrousel de ${count} photos publié` : 'Photo publiée', opts.music !== false, opts.location, opts.stay)
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
    const shot = await snapRetry(key, deviceId)
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
  // un profil connecté n'est jamais l'inscription (« Follow some accounts to get started » contient « started »)
  if (isProfileScreen(words, H)) return null
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
    const shot = await snapRetry(key, deviceId)
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
  const shot0 = await snapRetry(key, deviceId)
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
  const shot0 = await snapRetry(key, deviceId)
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
  const shot0 = await snapRetry(key, deviceId)
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
  const shot0 = await snapRetry(key, deviceId)
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
  // capture réessayée (limite de débit d'iRemoTech avec plusieurs iPhones) ; à défaut, taille connue des iPhones
  // iRemoTech (406 × 720) — avant, l'étape était SAUTÉE et Instagram rouvrait sur l'ancien écran (vu sur STEVIE1)
  const shot = await snapRetry(key, deviceId)
  let { w: W, h: H } = shot ? await imgSize(shot) : { w: 0, h: 0 }
  if (!W || !H) { W = 406; H = 720; hooks?.log?.('   (écran non capturé → fermeture faite à l’aveugle)') }
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
  const shot0 = await snapRetry(key, deviceId)
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

async function readScreenWords(key: string, deviceId: string): Promise<{ words: Awaited<ReturnType<typeof ocrWords>>; W: number; H: number; shot: string } | null> {
  const shot = await snapRetry(key, deviceId)
  if (!shot) return null
  const { w: W, h: H } = await imgSize(shot)
  if (!W || !H) return null
  const wa = await ocrWords(shot, undefined, { threshold: null, scale: 2, psms: ['11'] })
  const wb = await ocrWords(shot, undefined, { threshold: null, invert: true, scale: 2, psms: ['11'] })
  return { words: [...wa, ...wb], W, H, shot }
}

/** Fait défiler les écrans de fin jusqu'au fil Instagram. 'feed' = prêt à poster, 'refused' = refus, 'unknown'. */
export async function settleToFeed(key: string, deviceId: string, hooks?: VisionHooks, container?: string): Promise<'feed' | 'refused' | 'captcha' | 'unknown'> {
  hooks?.log?.('⏭ Écrans de fin : lecture de l’écran → action, jusqu’au fil Instagram…')
  let idle = 0, reopened = false, last = '', unfollowRounds = 0
  const brainLog: string[] = []
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
        const sh = await snapRetry(key, deviceId)
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
      const sh = await snapRetry(key, deviceId)
      const btn = sh ? await findBlueButton(sh, 0.84, 0.97, 0.1, 0.8) : null
      const bx = btn ? btn.cx : Math.round(scr.W / 2), by = btn ? btn.cy : Math.round(0.895 * scr.H)
      hooks?.log?.(`   👆 « Follow 5 » : plus rien de coché → bouton du bas (Next) (${bx}, ${by})`)
      await sendAction(key, deviceId, { type: 'tap', x: bx, y: by })
      idle = 0; await sleep(2500); continue
    }
    if (act?.kind === 'review') {
      hooks?.log?.('   ⚙ « Review the settings » → défilement jusqu’en bas puis « Next »')
      for (let k = 0; k < 2; k++) { await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(0.93 * scr.W), y1: Math.round(0.86 * scr.H), x2: Math.round(0.93 * scr.W), y2: Math.round(0.2 * scr.H), duration_ms: 500 }); await sleep(1200) }
      const sh = await snapRetry(key, deviceId)
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
    // Écran inconnu → d'abord le cerveau vision (il lit l'écran et choisit un bouton sûr)
    if (hasVisionBrain() && idle < 6) {
      const b = await askBrain(scr.shot, scr.words, scr.W, scr.H, 'Finish Instagram\'s new-account onboarding and reach the home feed ("For you" / "Your story"). Skip every optional step (profile photo, find friends, follow people, notifications, contacts, sync).', brainLog)
      if (b) {
        hooks?.log?.(`   🧠 IA : ${b.kind === 'tap' ? `tap « ${b.label} »` : b.kind}${b.reason ? ` — ${b.reason}` : ''}`)
        if (b.kind === 'stop') return /human|captcha|robot|verif/i.test(b.reason) ? 'captcha' : 'unknown'
        if (b.kind === 'done') return 'feed'
        if (b.kind === 'wait') { idle++; await sleep(2500); continue }
        if (b.kind === 'back') await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.07 * scr.W), y: Math.round(0.065 * scr.H) })
        else await sendAction(key, deviceId, { type: 'tap', x: b.x, y: b.y })
        brainLog.push(b.kind === 'tap' ? `tap "${b.label}"` : b.kind)
        idle++; await sleep(1800); continue
      }
    }
    // Écran inconnu avec un bouton bleu : 1er passage → « Skip » juste dessous ; si l'écran n'a pas bougé →
    // le bouton bleu lui-même (Next / Continue mal lu). On ne quitte JAMAIS le container ici.
    const shot = await snapRetry(key, deviceId)
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
  const shot = await snapRetry(key, deviceId)
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
  keepApp?: boolean        // true : reste dans Instagram à la fin (retour au fil) — scroll entre deux posts d'une session
}
export interface WarmupResult { ok: boolean; reels: number; likes: number; comments: number }

const REELS_TAB = { x: TAB.reels.x, y: TAB.y } // onglet Reels = 2e icône de la barre du bas (Accueil · Reels · Messages · Recherche · Profil), vu le 22/11/2026
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export async function warmupByVision(key: string, deviceId: string, opts: WarmupOpts, hooks?: VisionHooks): Promise<WarmupResult> {
  const shot0 = await snapRetry(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible (warm-up)'); return { ok: false, reels: 0, likes: 0, comments: 0 } }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })
  const glanceRate = opts.glanceRate ?? 0.25

  // 0. Fermer un éventuel popup, puis ouvrir l'onglet Reels.
  await dismissPopups(key, deviceId, hooks)
  // on part du fil d'accueil (barre d'onglets visible) : sinon le tap « Reels » tombe sur autre chose (vu en vrai)
  { const s0 = await readScreenWords(key, deviceId); if (s0 && !homeFeedShown(s0.words, s0.H) && !isProfileScreen(s0.words, s0.H)) await goHomeTab(key, deviceId, W, H, hooks) }
  hooks?.log?.('🔥 Warm-up : ouverture des Reels…')
  await tapFrac(REELS_TAB.x, REELS_TAB.y)
  await sleep(2800)

  const duration = Math.round(rnd(opts.minMs, opts.maxMs))
  const endAt = Date.now() + duration
  hooks?.log?.(`   session ~${Math.round(duration / 1000)}s (like ${Math.round(opts.likeRate * 100)}%${opts.commentRate ? `, comment ${Math.round(opts.commentRate * 100)}%` : ''})`)
  let reels = 0, likes = 0, comments = 0

  while (Date.now() < endAt) {
    if (hooks?.shouldStop?.()) break
    // Toutes les 3 vidéos : une feuille Instagram (« Finish setting up your profile »…) a-t-elle recouvert les Reels ?
    // Sinon le double-tap « like » ou le swipe tomberait dedans et la suite (post suivant) serait bloquée.
    if (reels % 3 === 0 && await dismissIgInfoSheet(key, deviceId, hooks)) continue
    // … ou un tap a ouvert le profil d'un autre compte (vu en vrai sur STEVIE1) → retour aux Reels
    if (reels % 3 === 1) {
      const sc = await readScreenWords(key, deviceId)
      if (sc && otherPageShown(sc.words, sc.W, sc.H)) {
        hooks?.log?.('   profil d’un autre compte ouvert pendant le scroll → retour')
        await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.09 * sc.W), y: Math.round(0.068 * sc.H) }); await sleep(1800)
        reels++; continue
      }
    }
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
  await dismissIgInfoSheet(key, deviceId, hooks)
  if (opts.keepApp) {
    // session de posts : on reste dans Instagram, onglet Accueil VÉRIFIÉ (le « + » du post suivant est sur le fil)
    if (!await goHomeTab(key, deviceId, W, H, hooks)) hooks?.log?.('   ⚠ fil d’accueil non reconnu après le scroll')
  } else {
    await sendAction(key, deviceId, { type: 'press', name: 'home' })
    await sleep(1000)
  }
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
  stickerTo: { x: 0.76, y: 0.80 },    // cible : bas-droite, juste AU-DESSUS des boutons du bas (« Your story »…)
  shareArrow: { x: 0.87, y: 0.93 },   // flèche bleue de partage (bas-droite)
  shareSheet: { x: 0.5, y: 0.93 },    // bouton « Share » de la feuille de partage (bas, pleine largeur)
}

export async function postStoryByVision(key: string, deviceId: string, opts: { caption?: string; link?: string; anchors?: typeof STORY_ANCHORS }, hooks?: VisionHooks): Promise<boolean> {
  const A = opts.anchors ?? STORY_ANCHORS
  const shot0 = await snapRetry(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) { hooks?.log?.('❌ écran illisible'); return false }
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })

  await dismissPopups(key, deviceId, hooks)
  await dismissIgInfoSheet(key, deviceId, hooks) // « Stories archive », « Introducing… » : bouton OK au milieu
  await clearAssistiveTouch(key, deviceId, hooks)
  // 1. Ouvrir le créateur (+ haut-gauche) — même point d'entrée que le Reel.
  hooks?.log?.('➕ Ouverture du créateur (+)…')
  const landing = await tapCreatePlus(key, deviceId, W, H, REEL_ANCHORS.createPlus, hooks, 'story')
  await grantPhotoAccessIfAsked(key, deviceId, hooks)
  // 2. Mode STORY (bandeau du bas) — inutile si le + a rouvert directement la galerie « Add to story ». Barre masquée (Instagram a rouvert la caméra Story, une
  //    bulle d'effet la remplace) + vignette de galerie en bas-gauche → déjà sur la caméra.
  //    (Si c'était la caméra Reel, l'écran « Add link » n'apparaîtrait jamais → abandon sans post.)
  const inStoryCamera = async (s: string) => !!await findGalleryThumb(s)
  if (landing !== 'story-gallery') {
    if (!await selectMode(key, deviceId, [/story|stories/i], 'STORY', hooks, inStoryCamera)) return false
    await sleep(1600)
  }
  // 2bis. Galerie « Add to story » ouverte DIRECTEMENT (depuis la galerie POST, iPhone normal) : 3 colonnes sous « Recents »,
  //       1re case = appareil photo → le média le plus récent est la case juste après. Pas de caméra ni de vignette.
  const sg = await readScreenWords(key, deviceId)
  const sgPick = sg ? storyGalleryPick(sg.words, sg.W, sg.H) : null
  if (sg && sgPick) {
    const cw = sg.W / 3
    const camera = (await meanLuma(sg.shot, 0.04, (sgPick.gridTop + cw * 0.15) / sg.H, 0.29, (sgPick.gridTop + cw * 1.5) / sg.H)) < 60
    const x = Math.round(camera ? cw * 1.5 : cw * 0.5), y = sgPick.y
    hooks?.log?.(`🖼️ Galerie « Add to story » → média le plus récent (${camera ? '2e case, après l’appareil photo' : '1re case'}) → tap (${x}, ${y})`)
    await sendAction(key, deviceId, { type: 'tap', x, y })
    return finishStoryFromEditor(key, deviceId, W, H, A, opts, hooks)
  }
  // 3. Ouvrir la galerie : la VIGNETTE en bas-gauche = dernier média de la pellicule, donc la
  //    vidéo qu'on vient d'envoyer. Repérée à l'image (bordure blanche) ; son aperçu sert
  //    ensuite à retrouver CE média dans la galerie.
  hooks?.log?.('🖼️ Ouverture de la galerie (vignette en bas à gauche)…')
  const camShot = await snapRetry(key, deviceId)
  const thumb = camShot ? await findGalleryThumb(camShot) : null
  const tx = thumb ? thumb.cx : Math.round(A.galleryThumb.x * W), ty = thumb ? thumb.cy : Math.round(A.galleryThumb.y * H)
  hooks?.log?.(thumb ? `   vignette repérée → tap (${tx}, ${ty})` : `   vignette non repérée → position connue (${tx}, ${ty})`)
  // Galerie ouverte = la vignette a disparu (ou, sans repère, un titre de galerie est lu).
  const galleryOpen = async () => {
    if (!thumb) return hasText(key, deviceId, [/^recents?$/i, /^r[ée]cents?$/i, /^select$/i, /^s[ée]lectionner$/i, /^gallery$/i, /^galerie$/i, /^pellicule$/i], hooks, { cropY: [0, 0.5], tries: 2 })
    const s = await snapRetry(key, deviceId)
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
  // Galerie « Add to story » reconnue → POSITION (case après l'appareil photo) : la vignette de la caméra montre parfois
  // le dernier média UTILISÉ, pas le dernier ajouté (testé le 21/11/2026 : elle montrait une ancienne photo).
  const sg2 = await readScreenWords(key, deviceId)
  const pick2 = sg2 ? storyGalleryPick(sg2.words, sg2.W, sg2.H) : null
  if (sg2 && pick2) {
    const cw = sg2.W / 3
    const camera = (await meanLuma(sg2.shot, 0.04, (pick2.gridTop + cw * 0.15) / sg2.H, 0.29, (pick2.gridTop + cw * 1.5) / sg2.H)) < 60
    const x = Math.round(camera ? cw * 1.5 : cw * 0.5)
    hooks?.log?.(`🖼️ Galerie « Add to story » → média le plus récent (${camera ? '2e case' : '1re case'}) → tap (${x}, ${pick2.y})`)
    await sendAction(key, deviceId, { type: 'tap', x, y: pick2.y })
    return finishStoryFromEditor(key, deviceId, W, H, A, opts, hooks)
  }
  let cell: { cx: number; cy: number } | null = null
  for (let i = 0; i < 2 && thumb && !cell; i++) {
    if (i) await sleep(1200) // vignettes de la galerie encore en chargement
    const g = await snapRetry(key, deviceId)
    cell = g ? await findMatchingCell(g, thumb.sig) : null
  }
  if (cell) {
    hooks?.log?.(`🎞️ vidéo la plus récente repérée (case ${cell.cx}, ${cell.cy}) → tap`)
    await sendAction(key, deviceId, { type: 'tap', x: cell.cx, y: cell.cy })
  } else {
    hooks?.log?.('   vidéo non reconnue dans la galerie → 1re case (position connue)')
    await tapFrac(A.firstThumb.x, A.firstThumb.y)
  }
  return finishStoryFromEditor(key, deviceId, W, H, A, opts, hooks)
}

/** Galerie « Add to story » (titre en haut, raccourcis Add Yours / Music / Collage, « Recents ») : y du centre de la
 *  1re rangée de cases (cases hautes : ~1,76 × la largeur d'une colonne) et haut de la grille. null sinon. Pure. */
export function storyGalleryPick(words: { text: string; cx: number; cy: number }[], W: number, H: number): { y: number; gridTop: number } | null {
  const top = (re: RegExp) => words.some(o => re.test(o.text) && o.cy < H * 0.12)
  const title = top(/^add$/i) && top(/^story$/i)
  const shortcuts = words.some(o => /^(collage|music)$/i.test(o.text) && o.cy < H * 0.35)
  const rec = words.find(o => /^r[ée]cents?$/i.test(o.text) && o.cy > H * 0.15 && o.cy < H * 0.5)
  if (!rec || !(title || shortcuts)) return null
  const cw = W / 3, gridTop = Math.round(rec.cy + 0.067 * W)
  return { y: Math.round(gridTop + cw * 0.88), gridTop }
}

/** Écran « Add link » du sticker lien (et non le tiroir des stickers). Pure. */
export function addLinkScreen(words: { text: string }[]): boolean {
  const has = (re: RegExp) => words.some(o => re.test(o.text))
  if (has(/^(giphy|stickers)$/i) || has(/^searching/i)) return false
  return has(/^url:?$/i) || has(/^customize$/i)
}
/** Sticker « Link » dans le tiroir après la recherche « link » : le mot lu (sous « Stickers », au-dessus de « GIPHY »),
 *  sinon la puce juste sous l'intitulé « Stickers » (+5,8 % de la hauteur). Pure. */
export function linkStickerPoint(words: { text: string; cx: number; cy: number }[], W: number, H: number): { x: number; y: number } | null {
  const st = words.find(o => /^stickers$/i.test(o.text) && o.cy < H * 0.4)
  const gi = words.find(o => /^giphy$/i.test(o.text) && o.cy < H * 0.5)
  const lo = st ? st.cy + 5 : H * 0.15, hi = gi ? gi.cy - 5 : H * 0.35
  const w = words.find(o => /^link$/i.test(o.text) && o.cy > lo && o.cy < hi)
  if (w) return { x: w.cx, y: w.cy }
  if (st) return { x: Math.round(W * 0.52), y: Math.round(st.cy + 0.058 * H) }
  return null
}

/** Texte affiché par le sticker lien sans texte perso : le domaine (sans www). Pure. */
export function stickerDomain(link?: string): string {
  if (!link) return ''
  try { return new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).hostname.replace(/^www\./i, '') } catch { return '' }
}
const normTok = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, '')
/** Boîte du texte du sticker lien dans l'éditeur de Story (ligne qui contient le plus de mots du libellé),
 *  hors en-tête et barre du bas. Pure. */
export function findStickerBox(words: { text: string; x: number; w: number; cx: number; cy: number }[], label: string, W: number, H: number): { x0: number; x1: number; cx: number; cy: number } | null {
  const toks = label.split(/\s+/).map(normTok).filter(t => t.length > 0)
  if (!toks.length) return null
  const hits = words.filter(o => {
    const t = normTok(o.text)
    if (!t || o.cy < H * 0.1 || o.cy > H * 0.93) return false
    return toks.some(k => t === k || (k.length >= 4 && t.length >= 4 && (t.includes(k) || k.includes(t))))
  })
  if (!hits.length) return null
  let best: typeof hits = []
  for (const h of hits) {
    const line = hits.filter(o => Math.abs(o.cy - h.cy) < H * 0.025)
    const n = new Set(line.map(o => normTok(o.text))).size
    if (n > new Set(best.map(o => normTok(o.text))).size) best = line
  }
  // le libellé d'une seule lettre/mot court peut traîner ailleurs : au moins la moitié des mots requise
  if (new Set(best.map(o => normTok(o.text))).size < Math.ceil(toks.length / 2)) return null
  const x0 = Math.min(...best.map(o => o.x)), x1 = Math.max(...best.map(o => o.x + o.w))
  const cy = best.reduce((a, o) => a + o.cy, 0) / best.length
  return { x0, x1, cx: (x0 + x1) / 2, cy }
}
/** Sticker dans le coin bas-droite (bord droit du texte ≥ 86 % de la largeur, hauteur 70–88 %). Pure. */
export function stickerInCorner(box: { x1: number; cy: number }, W: number, H: number): boolean {
  return box.x1 >= W * 0.86 && box.cy >= H * 0.7 && box.cy <= H * 0.88
}
/** Glissement qui amène le bord droit du texte à 92 % de la largeur et le sticker à 80 % de la hauteur
 *  (au-dessus des boutons « Your story »…, loin de la corbeille centrale). Pure. */
export function stickerDrag(box: { x1: number; cx: number; cy: number }, W: number, H: number): { x1: number; y1: number; x2: number; y2: number } {
  const dx = W * 0.92 - box.x1, dy = H * 0.8 - box.cy
  const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)))
  return { x1: Math.round(box.cx), y1: Math.round(box.cy), x2: clamp(box.cx + dx, W * 0.1, W * 0.95), y2: clamp(box.cy + dy, H * 0.15, H * 0.86) }
}

// Suite commune de la Story, une fois le média choisi : éditeur → stickers → lien → partage.
async function finishStoryFromEditor(key: string, deviceId: string, W: number, H: number, A: typeof STORY_ANCHORS, opts: { caption?: string; link?: string }, hooks?: VisionHooks): Promise<boolean> {
  const tapFrac = (fx: number, fy: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(fx * W), y: Math.round(fy * H) })
  await sleep(3500) // laisse le média se charger (le « Done » apparaît ensuite)
  await dismissIgInfoSheet(key, deviceId, hooks) // « Introducing story-to-story sharing » (iPhone normal)
  // 5. Done (haut-droite) — si absent, on saute juste l'étape et on continue (des fois il n'y en a pas).
  //    Zone [0,04 ; 0,16] : la barre d'état (souvent bleue) était prise pour le bouton.
  if (!await tapButton(key, deviceId, [/^done$|terminé/i], A.doneBtn, W, H, hooks, [0.04, 0.16], 'Done', 6)) hooks?.log?.('   (pas de Done → on continue)')
  await sleep(2600)
  await dismissIgInfoSheet(key, deviceId, hooks)
  // 6. Icône sticker (colonne de droite) → tiroir des stickers. VÉRIFIÉ avant d'écrire quoi que ce soit : sur
  //    certaines stories (photo) la colonne est décalée et le tap ouvrait l'outil Texte (« link » écrit en texte).
  if (!opts.link || !opts.link.trim()) { hooks?.log?.('⚠ Aucun lien fourni pour la story.'); return false }
  hooks?.log?.('🔖 Ouverture des stickers…')
  let tray = false
  // (0,22 = icône MUSIQUE juste sous le sticker sur iPhone normal → essayée en dernier)
  for (const fy of [A.stickerIcon.y, 0.10, 0.28, 0.22]) {
    await dismissIgInfoSheet(key, deviceId, hooks) // « Introducing story-to-story sharing » peut arriver en retard
    await tapFrac(A.stickerIcon.x, fy)
    await sleep(1700)
    if (await hasText(key, deviceId, [/^search$/i, /^rechercher$/i, /^giphy$/i], hooks, { tries: 2, cropY: [0, 0.35] })) { tray = true; break }
    // feuille MUSIQUE ouverte par erreur (« For you / Trending ») → tap sur l'aperçu en haut pour la fermer
    if (await hasText(key, deviceId, [/^trending$/i, /^saved$/i], hooks, { tries: 1, cropY: [0.4, 0.75] })) {
      hooks?.log?.('   feuille Musique ouverte par erreur → fermée, icône suivante')
      await tapFrac(0.5, 0.2); await sleep(1500); continue
    }
    // outil Texte ouvert par erreur (« Classic / Modern », « Done ») → on le referme SANS rien écrire
    if (await hasText(key, deviceId, [/^(classic|modern|signature|typewriter)$/i], hooks, { tries: 1, cropY: [0.6, 1] })) {
      hooks?.log?.('   outil Texte ouvert par erreur → fermé sans écrire, icône suivante')
      await tapFrac(A.doneBtn.x, 0.06); await sleep(1500)
    } else hooks?.log?.('   tiroir des stickers pas ouvert → icône suivante')
  }
  if (!tray) { hooks?.log?.('❌ tiroir des stickers introuvable → rien n’est publié'); return false }

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
  // VÉRIF : écran « Add link » = « URL » ou « Customize sticker text », et PLUS le tiroir (« Stickers » / « GIPHY »).
  // ⚠ « Cancel » seul ne prouve rien : il est aussi à côté de la recherche du tiroir (le 21/11/2026 l'URL a été
  // tapée dans la recherche et la Story est partie SANS lien).
  const onAddLink = async () => {
    const scr = await readScreenWords(key, deviceId)
    if (!scr) return false
    return addLinkScreen(scr.words)
  }
  let linkOk = false
  for (let t = 0; t < 3 && !linkOk; t++) {
    if (hooks?.shouldStop?.()) return false
    const scr = await readScreenWords(key, deviceId)
    const pt = scr ? linkStickerPoint(scr.words, scr.W, scr.H) : null
    if (pt) {
      hooks?.log?.(`🔗 sticker « Link » → tap (${pt.x}, ${pt.y})${t ? ` (essai ${t + 1})` : ''}`)
      await sendAction(key, deviceId, { type: 'tap', x: pt.x, y: pt.y })
    } else {
      hooks?.log?.('   « Link » non lu → position connue')
      await tapFrac(0.52, 0.265)
    }
    await sleep(2000)
    linkOk = await onAddLink()
    if (!linkOk) { await sleep(1200); linkOk = await onAddLink() }
  }
  if (!linkOk) {
    hooks?.log?.('❌ écran « Add link » non atteint → rien n’est publié (container suivant)')
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
      await typeRich(key, deviceId, opts.caption.trim())
      await sleep(800)
    }
  }
  // 11. Done de « Add link » : on a DÉJÀ vérifié l'écran (8b) et le bouton est toujours
  //     en haut-droite → on tape sa position directement (fiable, sans OCR capricieux).
  hooks?.log?.('✅ Validation « Done » (haut-droite)…')
  await tapFrac(A.linkDone.x, A.linkDone.y)
  await sleep(2200)
  // 12. Glisser le sticker (placé au CENTRE par défaut) dans le coin BAS-DROITE — swipe continu
  //     (doigt qui reste appuyé). On lit où il est (texte du sticker), on vise son bord droit à
  //     ~92 % de la largeur, puis on relit : jusqu'à 3 essais tant qu'il n'est pas dans le coin.
  const stickerLabel = (opts.caption && opts.caption.trim()) || stickerDomain(opts.link)
  // Le texte du sticker (noir sur pastille blanche) n'est lu qu'en mode « bloc » (psm 6) sur des bandes
  // horizontales — le mode épars (psm 11) plein écran ne le voit pas (vérifié sur captures réelles).
  const readSticker = async () => {
    const shot = await snapRetry(key, deviceId)
    if (!shot) return null
    const words: OcrWord[] = []
    for (const band of [[0.12, 0.4], [0.3, 0.62], [0.55, 0.92]] as [number, number][]) words.push(...await ocrWords(shot, undefined, { threshold: null, scale: 3, psms: ['6'], cropY: band }))
    return findStickerBox(words, stickerLabel, W, H)
  }
  let placed = false
  for (let attempt = 0; attempt < 3 && !placed; attempt++) {
    const box = await readSticker()
    if (box && stickerInCorner(box, W, H)) { placed = true; break }
    const mv = box ? stickerDrag(box, W, H) : { x1: Math.round(0.5 * W), y1: Math.round(0.45 * H), x2: Math.round(A.stickerTo.x * W), y2: Math.round(A.stickerTo.y * H) }
    hooks?.log?.(box ? `✋ Sticker lu en (${Math.round(box.cx)}, ${Math.round(box.cy)}) → coin bas-droite${attempt ? ` (essai ${attempt + 1}/3)` : ''}…` : '✋ Sticker non lu → glissement depuis le centre vers le bas-droite…')
    await sendAction(key, deviceId, { type: 'swipe', ...mv, duration_ms: 1400 })
    await sleep(1800)
  }
  if (!placed) { const box = await readSticker(); placed = !!box && stickerInCorner(box, W, H) }
  hooks?.log?.(placed ? '📍 Sticker lien en bas à droite.' : '   (position du sticker non confirmée par la lecture — on continue)')
  // 13. Flèche bleue (bas-droite) → ouvre la feuille de partage.
  const shot2 = await snapRetry(key, deviceId)
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
    const s = await snapRetry(key, deviceId)
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
  let shot = await snapRetry(key, deviceId)
  const { w: W, h: H } = shot ? await imgSize(shot) : { w: 0, h: 0 }
  if (!W || !H) { return }
  const cx = Math.round(W * 0.5)
  // 1) Ouvre l'app switcher : swipe LENT depuis le tout bas jusqu'au milieu (Face ID).
  await sendAction(key, deviceId, { type: 'swipe', x1: cx, y1: Math.round(H * 0.995), x2: cx, y2: Math.round(H * 0.45), duration_ms: 1400 })
  await sleep(2000)
  // 2) Repère la carte « Instagram » par son nom (double polarité) → balaie CELLE-LÀ.
  shot = await snapRetry(key, deviceId)
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
    const shot = await snapRetry(key, deviceId)
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

/** Noms du sélecteur Crane, seulement s'il y a la ligne « Default » (toujours présente dans le vrai sélecteur).
 *  Sans elle, ce sont des chiffres d'Instagram (compteurs du profil, « 1 » d'une photo, pastilles…) : un iPhone
 *  normal était alors pris pour un jailbreak avec de faux containers. Pure. */
export function cranePickerNames(names: string[]): string[] {
  return names.some(n => /^default$/i.test(n)) ? sortContainerNames(names) : []
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
    const shot = await snapRetry(key, deviceId)
    if (!shot) continue
    const { w: W, h: H } = await imgSize(shot)
    const rows = pickerRows(await ocrWords(shot, '0123456789Defaultefaul'), W, H)
    for (const r of cranePickerNames(rows.map(o => o.text))) found.add(r)
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
  // ligne secondaire sous un compte (« • 1 notification », « 2 new messages », « New posts ») : jamais un compte
  const SUBLINE = /notification|likes?and|follows?and|commentsand|andmore$|messages?$|newposts?$|unread/
  for (const o of [...words].sort((a, b) => a.cy - b.cy)) {
    const t = o.text.toLowerCase().replace(/[^a-z0-9._]/g, '')
    if (t.length < 3 || t.length > 30 || !/[a-z]/.test(t) || ACCOUNT_STOP.test(t) || SUBLINE.test(t)) continue
    if (o.cy < H * 0.25 || o.cy >= top || o.cx > W * 0.75) continue
    if (out.some(x => o.cy - x.y > 8 && o.cy - x.y < 30)) continue // juste sous un compte déjà lu = sa ligne secondaire
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
  // 1. action iRemoTech « open_app » : ouvre Instagram où que soit son icône (aucun tap sur l'accueil). Vérifiée.
  if (await sendAction(key, deviceId, { type: 'open_app', target: 'instagram' })) {
    await sleep(4000)
    const scr = await readScreenWords(key, deviceId)
    if (scr && !otherAppOpened(scr.words) && !isAppLibrary(scr.words) && !isTodayView(scr.words) && !scr.words.some(o => /^(weather|stocks|wallet)$/i.test(o.text))) {
      hooks?.log?.('📲 Instagram ouvert (open_app)')
      await grantPhotoAccessIfAsked(key, deviceId, hooks)
      return 'app'
    }
    hooks?.log?.('   open_app sans effet → icône de l’accueil')
    await sendAction(key, deviceId, { type: 'press', name: 'home' }); await sleep(1500)
  }
  // 2. secours : icône trouvée à son nom sur les pages d'accueil
  if (!await tapInstagramIcon(key, deviceId, hooks)) { hooks?.log?.('❌ Icône Instagram introuvable sur l’accueil.'); return null }
  await sleep(3500)
  await grantPhotoAccessIfAsked(key, deviceId, hooks) // alerte « accès aux photos » restée d'une tentative précédente
  const shot = await snapRetry(key, deviceId)
  if (!shot) return 'app'
  const { w: W, h: H } = await imgSize(shot)
  // sélecteur Crane = « Default » + au moins un autre container (les compteurs « 0 posts / 0 followers » du profil ne comptent pas)
  const rows = pickerRows(await ocrWords(shot, '0123456789Defaultefaul'), W, H)
  return rows.length >= 2 && rows.some(o => /^default$/i.test(o.text)) ? 'picker' : 'app'
}

/** Ouvre la feuille de bascule de comptes (onglet Profil → nom en haut). Renvoie les mots lus, ou null. */
/** Écran de blocage d'un compte : vérification humaine, ou retour à « Join Instagram » (compte déconnecté). */
async function accountBlockedScreen(key: string, deviceId: string): Promise<string | null> {
  const scr = await readScreenWords(key, deviceId)
  if (!scr) return null
  const act = decideEndScreen(scr.words, scr.W, scr.H)
  if (act?.kind === 'captcha') return 'Instagram demande une vérification humaine (« Confirm you’re human »)'
  if (classifySignup(scr.words, scr.H) === 'join') return 'Instagram est revenu sur « Join Instagram » (compte déconnecté)'
  return null
}

/** Quelques pas pilotés par le cerveau vision (écran inconnu). 'done' / 'stop' / 'none' (pas de cerveau ou pas sûr). */
export async function brainNavigate(key: string, deviceId: string, goal: string, hooks?: VisionHooks, maxSteps = 4, o: { allowPhotos?: boolean } = {}): Promise<'done' | 'stop' | 'none'> {
  if (!hasVisionBrain()) return 'none'
  const history: string[] = []
  for (let k = 0; k < maxSteps; k++) {
    if (hooks?.shouldStop?.()) return 'none'
    const scr = await readScreenWords(key, deviceId)
    if (!scr) return 'none'
    const act = await askBrain(scr.shot, scr.words, scr.W, scr.H, goal, history, o)
    if (!act) return k ? 'done' : 'none'
    hooks?.log?.(`   🧠 IA : ${act.kind === 'tap' ? `tap « ${act.label} »` : act.kind}${act.reason ? ` — ${act.reason}` : ''}`)
    if (act.kind === 'done') return 'done'
    if (act.kind === 'stop') return 'stop'
    if (act.kind === 'wait') { await sleep(3000); continue }
    if (act.kind === 'back') await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.07 * scr.W), y: Math.round(0.065 * scr.H) })
    else await sendAction(key, deviceId, { type: 'tap', x: act.x, y: act.y })
    history.push(act.kind === 'tap' ? `tap "${act.label}"` : act.kind)
    await sleep(2200)
  }
  return 'done'
}

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
    // Profil d'un AUTRE compte / sous-page sans barre d'onglets (ouvert par erreur pendant le scroll, vu en vrai sur
    // STEVIE1 : grille de @saraklavier, chaque tap « Profil » ouvrait une vidéo) → flèche retour en haut à gauche
    if (otherPageShown(words, W, H)) {
      hooks?.log?.('   page d’un autre compte (sans barre d’onglets) → retour')
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.09 * W), y: Math.round(0.068 * H) }); await sleep(1800); continue
    }
    return
  }
}

/** Profil d'un autre compte ou sous-page (flèche « < » en haut à gauche, pas le fil ni mon profil) : boutons
 *  Follow / Message, ou compteurs de vues « 65.7K » de la grille des Reels, sans « Edit profile ». Pure. */
export function otherPageShown(words: { text: string; cx: number; cy: number }[], W: number, H: number): boolean {
  if (homeFeedShown(words, H) || words.some(o => /^edit$/i.test(o.text) && words.some(p => /^profile$/i.test(p.text) && Math.abs(p.cy - o.cy) < 12))) return false
  // SEUL signe retenu (les taps « retour » ailleurs ouvraient d'autres choses) : la GRILLE d'un profil — compteurs de vues
  // dans la colonne de gauche ET dans celle de droite, et un nom de compte en haut.
  const nums = words.filter(o => /^\d[\d.,]*[KkMm]?$/.test(o.text) && o.cy > H * 0.2)
  const left = nums.filter(o => o.cx < W * 0.4).length, right = nums.filter(o => o.cx > W * 0.6).length
  return left >= 2 && right >= 2 && words.some(o => o.cy < H * 0.1 && /^[a-z0-9._]{4,}$/.test(o.text))
}

/** Écran sans règle et sans barre d'onglets lisible → le cerveau vision ramène sur l'écran principal d'Instagram. */
async function brainBackToTabs(key: string, deviceId: string, hooks?: VisionHooks): Promise<void> {
  await brainNavigate(key, deviceId, 'Get back to Instagram\'s main screen where the bottom tab bar (Home, Reels, Messages, Search, Profile) is visible. Close popups, sheets, editors and drafts WITHOUT posting, saving or changing anything (Cancel / Not now / Discard / close X / back arrow).', hooks, 4)
}

/** Onglet Profil d'Instagram : 2 des 3 compteurs (posts / followers / following) en haut, ou « Edit profile » et
 *  « Share profile ». Un seul mot (« posts » d'une popup « Video posts are now shared… ») ne suffit pas. Pure. */
export function isProfileScreen(words: { text: string; cy: number }[], H: number): boolean {
  const top = new Set(words.filter(o => o.cy < H * 0.35).map(o => o.text.toLowerCase().replace(/[^a-z]/g, '')).filter(t => /^(posts?|followers?|following)$/.test(t)).map(t => t.replace(/s$/, '')))
  if (top.size >= 2) return true
  const has = (re: RegExp) => words.some(o => re.test(o.text) && o.cy < H * 0.6)
  return has(/^edit$/i) && has(/^share$/i) && has(/^profile$/i)
}

async function openAccountSheet(key: string, deviceId: string, hooks?: VisionHooks): Promise<{ words: Awaited<ReturnType<typeof ocrWords>>; W: number; H: number } | null> {
  const isSheet = (scr: { words: { text: string; cx: number; cy: number }[]; H: number } | null) => !!scr && (addAccountRowY(scr.words) ?? 0) > scr.H * 0.4
  // « followers » ET « following » en haut (le mot « posts » seul trompait : popup « Video posts are now shared… »)
  // 2 des 3 compteurs (« followers » est parfois illisible, vu en vrai) ou les boutons « Edit profile » + « Share profile »
  const isProfile = (scr: { words: { text: string; cy: number }[]; H: number } | null) => !!scr && isProfileScreen(scr.words, scr.H)
  let scr = await readScreenWords(key, deviceId)
  if (!scr) return null
  if (isSheet(scr)) return scr // Instagram rouvert là où on l'avait laissé : la feuille est déjà ouverte
  if (decideEndScreen(scr.words, scr.W, scr.H)?.kind === 'captcha') { hooks?.log?.('🤖 Instagram demande une vérification humaine sur le compte actif : rien n’est tapé'); return null }
  const { W, H } = scr
  // 1. onglet Profil (vérifié : « followers / following » à l'écran), jusqu'à 3 taps ; d'abord retour à un écran
  //    avec la barre d'onglets (Instagram rouvre là où on l'a laissé : créateur, Reel plein écran, popup…)
  for (let k = 0; k < 3 && !isProfile(scr); k++) {
    if (k === 0) await backToTabs(key, deviceId, hooks)
    else if (k === 1 && hasVisionBrain()) await brainBackToTabs(key, deviceId, hooks)
    else hooks?.log?.('   onglet Profil pas ouvert → nouveau tap')
    const px = Math.round(PROFILE_XS[k % PROFILE_XS.length] * W), py = Math.round(TAB.y * H)
    if (k) await doubleTap(key, deviceId, px, py) // tap simple parfois ignoré ; double tap sans risque sur cet onglet
    else await sendAction(key, deviceId, { type: 'tap', x: px, y: py })
    await sleep(2500); scr = await readScreenWords(key, deviceId)
    if (isSheet(scr)) return scr
  }
  if (!isProfile(scr)) {
    // profil peut-être ouvert mais pas reconnu (bannière, popup, mise en page différente — vu sur STEVIE1/4) :
    // un dernier essai sur le nom du compte en haut, sans risque (au pire rien ne s'ouvre)
    hooks?.log?.('   profil non reconnu → essai direct sur le nom du compte en haut')
    await sendAction(key, deviceId, { type: 'tap', x: Math.round(0.5 * W), y: Math.round(0.068 * H) })
    await sleep(2200); scr = await readScreenWords(key, deviceId)
    if (isSheet(scr)) return scr
    // dernier recours : Instagram remis à zéro (fil d'accueil), puis onglet Profil
    await resetInstagramToHome(key, deviceId, hooks)
    for (let k = 0; k < PROFILE_XS.length && !isProfile(scr); k++) {
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(PROFILE_XS[k] * W), y: Math.round(TAB.y * H) })
      await sleep(2500); scr = await readScreenWords(key, deviceId)
      if (isSheet(scr)) return scr
    }
    if (!isProfile(scr)) return null
  }
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
      await sendAction(key, deviceId, { type: 'tap', x: Math.round(TAB.home.x * scr.W), y: Math.round(TAB.y * scr.H) }) // accueil d'Instagram
      await sleep(1500)
      return true
    }
    const x = Math.round(0.45 * scr.W) // dans la ligne, à côté du texte (un tap pile sur les lettres est parfois ignoré)
    // SÉCURITÉ : la liste doit être ouverte JUSTE avant de taper (vu en vrai : la liste refermée, le tap tombait sur
    // les comptes suggérés du profil et ouvrait un inconnu — un « Follow » aurait pu partir)
    const fresh = await readScreenWords(key, deviceId)
    if (!fresh || addAccountRowY(fresh.words) == null) { hooks?.log?.('   liste des comptes refermée → pas de tap, on la rouvre'); continue }
    hooks?.log?.(`   tap sur @${u} (ligne y=${row.cy}, coches y=${dots.map(d => d.cy).join('/') || 'aucune'})`)
    if (k) await doubleTap(key, deviceId, x, row.cy); else await sendAction(key, deviceId, { type: 'tap', x, y: row.cy })
    await sleep(4500) // Instagram recharge le profil du compte
    // vérifié d'abord par le NOM en haut du profil (plus fiable que la coche bleue avec la nouvelle barre d'Instagram)
    const after = await readScreenWords(key, deviceId)
    if (after && isProfileScreen(after.words, after.H)) {
      const shotA = await snapRetry(key, deviceId)
      const exactA = shotA ? await ocrWords(shotA, 'abcdefghijklmnopqrstuvwxyz0123456789._', { threshold: null, scale: 3, psms: ['11'], cropY: [0, 0.12] }) : []
      const head = profileHeaderUsername([...exactA, ...after.words], after.W, after.H, [u])
      if (head && sameUsername(u, head)) {
        hooks?.log?.(`   ✓ compte actif : @${u} (nom du profil)`)
        await sendAction(key, deviceId, { type: 'tap', x: Math.round(TAB.home.x * after.W), y: Math.round(TAB.y * after.H) }) // accueil d'Instagram
        await sleep(1500)
        return true
      }
    }
    // Compte bloqué par Instagram juste après la bascule (vu en vrai) : on n'y touche pas, compte suivant
    const blocked = await accountBlockedScreen(key, deviceId)
    if (blocked) { hooks?.log?.(`🤖 @${u} : ${blocked} → compte passé (à régler à la main)`); return false }
  }
  hooks?.log?.(`❌ bascule sur @${u} non confirmée`)
  return false
}

// ─── Vérification à l'écran : qu'y a-t-il VRAIMENT dans un container ? ──────────────────────────────────
// La liste « Comptes créés » ne dit que ce que ScaleFlow a créé ; un compte peut avoir été déconnecté
// (boucle, à la main) ou ajouté hors ScaleFlow. On ouvre donc le container et on lit l'écran.

/** Identifiant affiché en haut de l'onglet Profil (« aliceha2nbx ⌄ ») : le plus long mot plausible du bandeau
 *  du haut, recalé sur un identifiant connu s'il y ressemble (OCR : 5↔s, 0↔o, chevron lu « v »). Pure. */
export function profileHeaderUsername(words: { text: string; cx: number; cy: number }[], W: number, H: number, known: string[] = []): string | null {
  const cands = words
    .filter(o => o.cy < H * 0.11 && o.cy > H * 0.03 && o.cx > W * 0.15 && o.cx < W * 0.85)
    .map(o => o.text.toLowerCase().replace(/[^a-z0-9._]/g, ''))
    .filter(t => t.length >= 3 && t.length <= 31 && /[a-z]/.test(t))
    .sort((a, b) => b.length - a.length)
  for (const t of cands) {
    const k = known.find(k => sameUsername(k, t) || (t.endsWith('v') && sameUsername(k, t.slice(0, -1))))
    if (k) return k
  }
  return cands[0] ?? null
}

export type ContainerState = { state: 'empty' | 'account' | 'blocked' | 'unknown'; username?: string }

/** Ouvre le container et dit ce qu'il contient : 'empty' (écran d'inscription : Join, numéro, ou inscription
 *  restée en cours), 'account' + identifiant (onglet Profil lu), 'blocked' (vérification humaine), 'unknown'.
 *  Ne touche à rien d'autre (aucun achat, aucune déconnexion). */
export async function containerAccountByVision(key: string, deviceId: string, container: string, known: string[] = [], hooks?: VisionHooks): Promise<ContainerState> {
  if (!await selectContainerByVision(key, deviceId, container, hooks)) return { state: 'unknown' }
  await sleep(3000)
  await dismissPopups(key, deviceId, hooks)
  const st = await signupStage(key, deviceId, hooks, 2)
  if (st) return { state: 'empty' }
  const blocked = await accountBlockedScreen(key, deviceId)
  if (blocked) return { state: blocked.includes('Join') ? 'empty' : 'blocked' }
  const shot0 = await snapRetry(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) return { state: 'unknown' }
  // Instagram finit parfois de charger le fil après le changement de container : jusqu'à 3 taps sur Profil
  for (let k = 0; k < 3; k++) {
    await sendAction(key, deviceId, { type: 'tap', x: Math.round(TAB.profile.x * W), y: Math.round(TAB.y * H) }) // onglet Profil
    await sleep(2500 + k * 1500)
    const shot = await snapRetry(key, deviceId)
    if (!shot) continue
    const prof = await readScreenWords(key, deviceId)
    const onProfile = !!prof?.words.some(o => /^(posts?|followers?|following)$/i.test(o.text))
    if (!onProfile) continue
    const exact = await ocrWords(shot, 'abcdefghijklmnopqrstuvwxyz0123456789._', { threshold: null, scale: 3, psms: ['11'], cropY: [0, 0.12] })
    const u = profileHeaderUsername([...exact, ...(prof?.words ?? [])], W, H, known)
    if (u) return { state: 'account', username: u }
  }
  return { state: 'unknown' }
}

// ─── Boucle de création : déconnexion du compte du container → « Create new account » ──────────────────
// Écrans relevés en vrai (21/11/2026) : Profil › ☰ → « Settings and activity » ; tout en bas, section « Login » :
// « Add profile » (bleu) et « Log out » (rouge) ; puis alerte « Log out of your account? » → « Log out » / « Cancel ».

/** Écran lu pendant la déconnexion → étape. Pure. */
export function logoutStage(words: { text: string; cx: number; cy: number }[], H: number):
  | { kind: 'dialog'; tap: { x: number; y: number } }
  | { kind: 'settings_logout'; tap: { x: number; y: number } }
  | { kind: 'settings' }
  | { kind: 'save_login'; tap: { x: number; y: number } }
  | { kind: 'logged_out'; tap?: { x: number; y: number } }
  | null {
  const t = (o: { text: string }) => o.text.replace(/[^\p{L}?]/gu, '')
  const has = (re: RegExp) => words.some(o => re.test(t(o)))
  const logOuts = words.filter(o => /^log$/i.test(t(o)) && words.some(p => /^out$/i.test(t(p)) && Math.abs(p.cy - o.cy) < 12 && p.cx > o.cx && p.cx - o.cx < 70))
  // Alerte « Log out of your account? » : le bouton « Log out » est la ligne « Log out » SOUS le titre, au-dessus de « Cancel »
  const title = words.find(o => /^account\??$/i.test(t(o)) && words.some(p => /^your$/i.test(t(p)) && Math.abs(p.cy - o.cy) < 12))
  const cancel = words.find(o => /^cancel$/i.test(t(o)))
  if (title && cancel) {
    const btn = logOuts.find(o => o.cy > title.cy + 15 && o.cy < cancel.cy - 10)
    return { kind: 'dialog', tap: btn ? { x: btn.cx + 15, y: btn.cy } : { x: cancel.cx, y: Math.round(cancel.cy - 0.058 * H) } }
  }
  // « Save your login info? » → Not now
  if (has(/^save$/i) && has(/^(login|info\??)$/i)) {
    const nn = words.find(o => /^not$/i.test(t(o)))
    if (nn) return { kind: 'save_login', tap: { x: nn.cx + 15, y: nn.cy } }
  }
  // Déconnecté : écran de connexion (« Create new account » / « Log in » / « Use another profile ») ou Join
  if (has(/^create$/i) && has(/^new$/i) && has(/^account$/i)) {
    const nw = words.find(o => /^new$/i.test(t(o)) && o.cy > H * 0.5) ?? words.find(o => /^new$/i.test(t(o)))!
    return { kind: 'logged_out', tap: { x: nw.cx, y: nw.cy } }
  }
  if (words.some(o => o.cy > H * 0.45 && /^(started|join)$/i.test(t(o)))) return { kind: 'logged_out' }
  if (has(/^settings$/i) && has(/^activity$/i)) {
    const lo = logOuts.find(o => o.cy > H * 0.3)
    return lo ? { kind: 'settings_logout', tap: { x: lo.cx + 15, y: lo.cy } } : { kind: 'settings' }
  }
  return null
}

/** Déconnecte le compte du container ouvert puis lance « Create new account » → écran d'inscription
 *  (Join / numéro). true si l'écran d'inscription est atteint. Jamais d'« Add profile » (le compte resterait
 *  connecté). */
export async function logoutToSignupByVision(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  const shot0 = await snapRetry(key, deviceId)
  const { w: W, h: H } = shot0 ? await imgSize(shot0) : { w: 0, h: 0 }
  if (!W || !H) return false
  const tap = (x: number, y: number) => sendAction(key, deviceId, { type: 'tap', x: Math.round(x), y: Math.round(y) })
  hooks?.log?.('🚪 Déconnexion du compte du container (Profil › ☰ › Log out)…')
  await dismissPopups(key, deviceId, hooks)
  await tap(TAB.profile.x * W, TAB.y * H) // onglet Profil
  await sleep(2500)
  let scrolls = 0, menuTaps = 0, logoutTapped = false
  for (let step = 0; step < 24; step++) {
    if (hooks?.shouldStop?.()) return false
    const scr = await readScreenWords(key, deviceId)
    if (!scr) { await sleep(800); continue }
    const st = logoutStage(scr.words, scr.H)
    if (st?.kind === 'logged_out') {
      if (st.tap) { hooks?.log?.('   déconnecté → « Create new account »'); await tap(st.tap.x, st.tap.y); await sleep(3500) }
      const ok = await isSignupScreen(key, deviceId, hooks)
      hooks?.log?.(ok ? '   ✓ écran d’inscription atteint' : '❌ écran d’inscription introuvable après la déconnexion')
      return ok
    }
    if (st?.kind === 'dialog') { hooks?.log?.('   alerte « Log out of your account? » → Log out'); await tap(st.tap.x, st.tap.y); logoutTapped = true; await sleep(4000); continue }
    if (st?.kind === 'save_login') { hooks?.log?.('   « Save your login info? » → Not now'); await tap(st.tap.x, st.tap.y); await sleep(2500); continue }
    if (st?.kind === 'settings_logout') { hooks?.log?.('   « Log out » (bas des réglages) → tap'); await tap(st.tap.x, st.tap.y); await sleep(2500); continue }
    if (st?.kind === 'settings') {
      if (scrolls++ > 12) break
      await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W / 2), y1: Math.round(0.86 * H), x2: Math.round(W / 2), y2: Math.round(0.17 * H), duration_ms: 250 })
      await sleep(900); continue
    }
    if (logoutTapped) { await sleep(2000); continue } // Instagram recharge après « Log out »
    // Profil (ou autre écran d'Instagram) → menu ☰ en haut à droite
    if (menuTaps++ > 3) break
    if (menuTaps > 1) { await tap(TAB.profile.x * W, TAB.y * H); await sleep(2000) }
    await tap(0.917 * W, 0.069 * H)
    await sleep(3000)
  }
  hooks?.log?.('❌ déconnexion non aboutie')
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
