// Automatisation Instagram par ADB (/shell/execute + uiautomator) sur un téléphone
// GeeLark DÉJÀ démarré. Sert aux blocs du Flow Builder qu'aucun template RPA
// GeeLark ne couvre : changer le @pseudo et la photo de profil.
//
// Porté de electron-app/src/lib/geelark.ts (updateInstagramProfile), qui passe par
// le Centre de comptes Meta. Chaque étape cherche l'élément par texte/resource-id
// dans le dump UI, avec une coordonnée de repli ; le log raconte chaque action pour
// pouvoir recaler le flow quand Instagram change son interface.
import { geelarkFetch, ensurePhoneRunning, sleep, throwIfAborted } from './geelark'
import { heartbeatPhone } from './phoneWatch'
import { usernameIssue } from './igRules'

type Log = (m: string) => void
type Pt = [number, number]

// ── Shell ADB ────────────────────────────────────────────────────────────────
// Le démon shell n'est pas toujours prêt juste après le boot (ou occupé quand
// beaucoup de téléphones tournent) → on retente les erreurs « pas prêt ».
async function shellExec(bearer: string, phoneId: string, cmd: string, maxRetries = 6): Promise<string> {
  const NOT_READY = /not running|not started|unavailable|not ready|phone.*start|starting/i
  heartbeatPhone(phoneId)   // automatisation en cours → le serveur ne coupe pas le téléphone
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    throwIfAborted(phoneId)   // run annulé / délai max du bloc → on s'arrête avant la prochaine action
    const d = await geelarkFetch('/shell/execute', { id: phoneId, cmd }, bearer)
    const code = Number(d['code'] ?? -1)
    if (code === 0) return String(((d['data'] as Record<string, unknown>) ?? {})['output'] ?? '')
    const msg = String(d['msg'] ?? d['message'] ?? code)
    const notReady = NOT_READY.test(msg) || (code >= 10001 && code <= 10099) || code === 42002
    if (notReady && attempt < maxRetries - 1) { await sleep(4000 + attempt * 2000); continue }
    throw new Error(`GeeLark shell : ${msg} (code ${code})`)
  }
  throw new Error('GeeLark shell : téléphone non prêt après plusieurs tentatives')
}

// ── Remise à zéro entre deux blocs d'automatisation ─────────────────────────
// Chaque bloc (RPA ou ADB) doit partir d'un Instagram FERMÉ : un bloc précédent a
// pu laisser l'app dans le Centre de comptes, l'éditeur de story, un dialogue, le
// clavier ouvert… et le bloc suivant échouait (« Not logged in », bouton introuvable).
// Best-effort : ne fait jamais échouer le bloc.
export const IG_PKG = 'com.instagram.android'
export async function resetInstagram(bearer: string, phoneId: string, log?: Log): Promise<boolean> {
  try {
    await shellExec(bearer, phoneId, `input keyevent 111; input keyevent 3; am force-stop ${IG_PKG}`, 3)
    await sleep(1500)
    log?.('🧹 Instagram remis à zéro')
    return true
  } catch (e) {
    log?.(`⚠ Remise à zéro d’Instagram impossible : ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

const tap = (b: string, id: string, p: Pt) => shellExec(b, id, `input tap ${p[0]} ${p[1]}`)

// ── Lecture de l'écran (uiautomator) ─────────────────────────────────────────
// Sous charge, `uiautomator dump` renvoie parfois un XML vide/tronqué → on valide
// la racine et on retente (lire l'UI est sans effet de bord).
export function isValidDump(xml: string): boolean { return xml.includes('<hierarchy') && xml.includes('</hierarchy>') }

// Écran illisible après 4 essais → on S'ARRÊTE (avant : XML tronqué → aucun élément
// trouvé → taps à l'aveugle sur des coordonnées de repli).
async function dumpXml(bearer: string, phoneId: string): Promise<string> {
  const f = '/sdcard/sf_dump.xml'
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const xml = await shellExec(bearer, phoneId, `rm -f ${f}; uiautomator dump ${f} >/dev/null 2>&1; cat ${f} 2>/dev/null`)
      if (isValidDump(xml)) return xml
    } catch (e) { if (e instanceof Error && e.name === 'PhoneAbortedError') throw e }
    if (attempt < 3) await sleep(1200 + attempt * 600)
  }
  throw new Error('Écran du téléphone illisible (uiautomator) — rien n’a été touché à l’aveugle')
}

function centerOf(element: string): Pt | null {
  const m = element.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
  return m ? [Math.floor((+m[1] + +m[3]) / 2), Math.floor((+m[2] + +m[4]) / 2)] : null
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function findByText(xml: string, ...texts: string[]): Pt | null {
  for (const t of texts) {
    const m = xml.match(new RegExp(`<[^>]*(?:text|content-desc)="${esc(t)}"[^>]*>`))
    const p = m && centerOf(m[0])
    if (p) return p
  }
  return null
}

function findByResourceId(xml: string, ...ids: string[]): Pt | null {
  for (const id of ids) {
    const m = xml.match(new RegExp(`<[^>]*resource-id="[^"]*${esc(id)}[^"]*"[^>]*>`))
    const p = m && centerOf(m[0])
    if (p) return p
  }
  return null
}

function screenHas(xml: string, re: RegExp): string | null {
  for (const m of xml.matchAll(/(?:text|content-desc)="([^"]+)"/g)) if (re.test(m[1])) return m[1]
  return null
}

// ── Saisie de texte ──────────────────────────────────────────────────────────
// `input text` ignore les accents/emojis et casse sur certains caractères → ASCII
// pur par `input text` échappé, sinon presse-papier + CTRL+V (Unicode-safe).
function escapeForInputText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/ /g, '%s')
}

async function typeIntoFocusedField(bearer: string, phoneId: string, text: string, log: Log): Promise<void> {
  if (/^[\x20-\x7E]*$/.test(text)) {
    await shellExec(bearer, phoneId, `input text "${escapeForInputText(text)}"`)
    return
  }
  try {
    await shellExec(bearer, phoneId, `cmd clipboard set-text '${text.replace(/'/g, `'\\''`)}'`)
    await sleep(300)
    await shellExec(bearer, phoneId, 'input keycombination 113 50') // CTRL+V
  } catch {
    log('   ⚠ Presse-papier indisponible — saisie ASCII de secours')
    const ascii = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7F]/g, '')
    await shellExec(bearer, phoneId, `input text "${escapeForInputText(ascii)}"`)
  }
}

// Focus le champ, vide son contenu, puis tape le nouveau texte.
async function clearAndType(bearer: string, phoneId: string, point: Pt, text: string, log: Log): Promise<void> {
  await tap(bearer, phoneId, point); await sleep(500)
  await tap(bearer, phoneId, point); await sleep(400)
  await shellExec(bearer, phoneId, 'input keycombination 113 29'); await sleep(200) // CTRL+A
  await shellExec(bearer, phoneId, 'input keyevent 67'); await sleep(200)           // DEL
  await shellExec(bearer, phoneId, 'input keyevent 123'); await sleep(100)          // fin du champ
  for (let i = 0; i < 4; i++) { await shellExec(bearer, phoneId, 'input keyevent' + ' 67'.repeat(15)); await sleep(40) }
  await typeIntoFocusedField(bearer, phoneId, text, log)
  await sleep(400)
}

// ── Envoi d'une image dans la galerie du téléphone ───────────────────────────
// Android 13+ ignore le broadcast MEDIA_SCANNER : un fichier poussé à la main
// n'apparaît pas dans la galerie d'Instagram. Le transfert de fichiers GeeLark
// (material center → /phone/file/upload) l'indexe correctement.
const _materialCache = new Map<string, Promise<string | null>>()
function materialId(bearer: string, fileUrl: string, fileName: string): Promise<string | null> {
  const hit = _materialCache.get(fileUrl)
  if (hit) return hit
  const p = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const up = await geelarkFetch('/material/temp/upload', { fileUrl, fileType: 1, fileName }, bearer)
        const fid = ((up['data'] as Record<string, unknown>)?.['fileId']) as string | undefined
        if (Number(up['code']) === 0 && fid) return fid
      } catch { /* retry */ }
      await sleep(1500 + attempt * 1500)
    }
    return null
  })()
  _materialCache.set(fileUrl, p)
  p.then(v => { if (!v) _materialCache.delete(fileUrl) }).catch(() => _materialCache.delete(fileUrl))
  return p
}

async function pushImageToGallery(bearer: string, phoneId: string, imageUrl: string, log: Log): Promise<{ ok: boolean; error?: string }> {
  const fileName = `sf_pfp_${Date.now()}.jpg`
  const fileId = await materialId(bearer, imageUrl, fileName)
  if (!fileId) return { ok: false, error: 'Envoi de l\'image vers GeeLark impossible' }
  let taskId: string | undefined
  for (let attempt = 0; attempt < 3 && !taskId; attempt++) {
    const push = await geelarkFetch('/phone/file/upload', { id: phoneId, fileId, path: '/sdcard/DCIM/Camera' }, bearer)
    taskId = ((push['data'] as Record<string, unknown>)?.['taskId']) as string | undefined
    if (!taskId) {
      if (attempt === 2) return { ok: false, error: `Transfert vers le téléphone : ${push['msg'] ?? push['code']}` }
      await sleep(3000)
    }
  }
  log('   📥 Transfert de la photo vers le téléphone…')
  for (let i = 0; i < 45; i++) {
    await sleep(2000)
    let status = ''
    try {
      const st = await geelarkFetch('/phone/file/uploadStatus', { taskId }, bearer)
      status = String((st['data'] as Record<string, unknown>)?.['status'] ?? '')
    } catch { continue }
    if (status === 'success') { log('   ✅ Photo dans la galerie'); return { ok: true } }
    if (status === 'failed') return { ok: false, error: 'Transfert de la photo : échec GeeLark' }
  }
  return { ok: false, error: 'Transfert de la photo : délai dépassé' }
}

// ── Fenêtres parasites, attentes, clavier ────────────────────────────────────
// Boutons qui FERMENT une fenêtre sans rien valider (notifications, enregistrer la
// connexion, autorisation d'accès aux photos…). Jamais « OK / Annuler » génériques.
const DISMISS = [
  'Not now', 'Not Now', 'Plus tard', 'Pas maintenant', 'Skip', 'Ignorer', 'Dismiss',
  'Allow', 'Autoriser', 'Allow all', 'Tout autoriser', 'Allow access to all photos', 'Autoriser l’accès à toutes les photos',
  'While using the app', 'Lors de l’utilisation de l’application', 'Pendant l’utilisation de l’appli',
]
/** Bouton de fermeture d'une fenêtre parasite à l'écran, s'il y en a une. */
export function findDialogDismiss(xml: string): Pt | null {
  return findByText(xml, ...DISMISS) ?? findByResourceId(xml, 'permission_allow_button', 'permission_allow_all_button', 'permission_allow_foreground_only_button')
}

/** Lit l'écran en fermant jusqu'à 3 fenêtres parasites. */
async function readScreen(bearer: string, phoneId: string): Promise<string> {
  let xml = await dumpXml(bearer, phoneId)
  for (let n = 0; n < 3; n++) {
    const d = findDialogDismiss(xml)
    if (!d) break
    await tap(bearer, phoneId, d); await sleep(1500)
    xml = await dumpXml(bearer, phoneId)
  }
  return xml
}

/** Attend (max `ms`) un écran qui vérifie `ok` ; renvoie le dernier écran lu et si c'est réussi. */
async function waitForScreen(bearer: string, phoneId: string, ok: (xml: string) => boolean, ms: number): Promise<{ xml: string; ok: boolean }> {
  const end = Date.now() + ms
  let xml = await readScreen(bearer, phoneId)
  while (!ok(xml) && Date.now() < end) {
    await sleep(1500)
    xml = await readScreen(bearer, phoneId)
  }
  return { xml, ok: ok(xml) }
}

async function keyboardShown(bearer: string, phoneId: string): Promise<boolean> {
  try { return /mInputShown=true/.test(await shellExec(bearer, phoneId, 'dumpsys input_method | grep -m1 mInputShown', 2)) } catch { return false }
}

// ── Navigation : profil → menu → Centre de comptes → écran d'édition ─────────
interface Screen { sw: number; sh: number; cx: number }

async function prepareScreen(bearer: string, phoneId: string): Promise<Screen> {
  await shellExec(bearer, phoneId, 'input keyevent 224'); await sleep(800)   // réveil
  const out = await shellExec(bearer, phoneId, 'wm size')
  const m = out.match(/(\d+)x(\d+)/)
  const sw = m ? +m[1] : 1080, sh = m ? +m[2] : 2340
  await shellExec(bearer, phoneId, `input swipe ${Math.floor(sw / 2)} ${Math.floor(sh * 0.75)} ${Math.floor(sw / 2)} ${Math.floor(sh * 0.35)} 400`) // déverrouille
  await sleep(1200)
  return { sw, sh, cx: Math.floor(sw / 2) }
}

export const ACCOUNT_CENTER = ['Accounts Center', 'Account Center', 'Accounts Centre', 'Centre de comptes', 'Espace Comptes', 'Espace comptes', 'Centre des comptes', 'Meta Accounts Center', 'Meta Account Center']
const SETTINGS = ['Settings and activity', 'Paramètres et activité', 'Settings and privacy', 'Paramètres et confidentialité', 'Settings', 'Paramètres']
const LOGIN_SCREEN = /^(Log in|Se connecter|Create new account|Créer un compte|Log into another account|Se connecter à un autre compte)$/i
// Instagram redemande le mot de passe / une vérification avant d'enregistrer.
export const PASSWORD_PROMPT = /^(Re-enter your password|Saisissez à nouveau votre mot de passe|Enter your password|Entrez votre mot de passe|Confirm it['’]s you|Confirmez qu['’]il s['’]agit bien de vous|Check your email|Vérifiez votre e-mail|Enter confirmation code|Entrez le code de confirmation)$/i

/** Ligne du BON compte Instagram dans « Profils » : celle du @ actuel si connu, sinon la 1re. */
export function findAccountRow(xml: string, current?: string): Pt | null {
  const cur = current?.trim().replace(/^@/, '')
  return (cur ? findByTextRe(xml, new RegExp(`^@?${esc(cur)}$`, 'i')) ?? findByTextRe(xml, new RegExp(`^@?${esc(cur)}[,\\s]`, 'i')) : null) ??
    findByText(xml, 'Instagram') ??
    findByResourceId(xml, 'account_item', 'profile_account_row', 'account_row', 'instagram_account')
}

async function openProfileTab(bearer: string, phoneId: string, s: Screen, log: Log): Promise<string> {
  log('📲 Ouverture d\'Instagram…')
  await shellExec(bearer, phoneId, `am force-stop ${IG_PKG}`); await sleep(1200)
  await shellExec(bearer, phoneId, `monkey -p ${IG_PKG} -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1`)
  const home = await waitForScreen(bearer, phoneId, x => !!(findByText(x, 'Profile', 'Profil') ?? findByResourceId(x, 'profile_tab', 'tab_avatar') ?? findByTextRe(x, LOGIN_SCREEN)), 20_000)
  let xml = home.xml
  if (findByTextRe(xml, LOGIN_SCREEN)) throw new Error('Compte non connecté sur ce téléphone — ajoute un bloc « Connexion » avant')
  // Onglet Profil : en bas à droite (position stable depuis des années) si son libellé n'est pas lisible.
  await tap(bearer, phoneId,
    findByText(xml, 'Profile', 'Profil') ??
    findByResourceId(xml, 'profile_tab', 'tab_avatar', 'navigation_profile', 'ig_bottom_bar_profile', 'tab_icon_profile') ??
    [Math.floor(s.sw * 0.92), Math.floor(s.sh * 0.965)])
  await sleep(3500)
  xml = await readScreen(bearer, phoneId)
  return xml
}

async function openAccountCenterEditor(bearer: string, phoneId: string, s: Screen, log: Log, current?: string): Promise<string> {
  let xml = await openProfileTab(bearer, phoneId, s, log)

  log('☰ Menu…')
  await tap(bearer, phoneId,
    findByResourceId(xml, 'action_bar_overflow_button', 'hamburger_button', 'options_list_button', 'header_options_button') ??
    findByText(xml, 'Options', 'Menu') ??
    [Math.floor(s.sw * 0.95), Math.floor(s.sh * 0.055)])
  await sleep(2500)

  log('🏛 Centre de comptes…')
  xml = await readScreen(bearer, phoneId)
  let ac = findByText(xml, ...ACCOUNT_CENTER) ?? findByTextRe(xml, /^(Accounts? Cent(er|re)|Espace Comptes|Centre de(s)? comptes)\b/i) ?? findByResourceId(xml, 'account_center_row', 'accounts_center')
  if (!ac) {
    const settings = findByText(xml, ...SETTINGS)
    if (settings) {
      await tap(bearer, phoneId, settings); await sleep(3000)
      for (let n = 0; n < 2 && !ac; n++) {
        xml = await readScreen(bearer, phoneId)
        ac = findByText(xml, ...ACCOUNT_CENTER) ?? findByTextRe(xml, /^(Accounts? Cent(er|re)|Espace Comptes|Centre de(s)? comptes)\b/i)
        if (!ac) { await shellExec(bearer, phoneId, `input swipe ${s.cx} ${Math.floor(s.sh * 0.7)} ${s.cx} ${Math.floor(s.sh * 0.3)} 600`); await sleep(1000) }
      }
    }
  }
  if (!ac) throw new Error('Centre de comptes introuvable — rien n’a été modifié')
  await tap(bearer, phoneId, ac); await sleep(4000)

  log('👤 Profil…')
  xml = await readScreen(bearer, phoneId)
  const details = findByText(xml, 'Profiles', 'Profils', 'Profile and personal details', 'Profil et informations personnelles', 'Profile details')
  if (details) { await tap(bearer, phoneId, details); await sleep(3000); xml = await readScreen(bearer, phoneId) }
  const acc = findAccountRow(xml, current)
  if (!acc) throw new Error('Compte Instagram introuvable dans le Centre de comptes — rien n’a été modifié')
  await tap(bearer, phoneId, acc)
  await sleep(3500)
  return readScreen(bearer, phoneId)
}

// Enregistre le champ (Terminé / Enregistrer en haut à droite). Avant : RETOUR systématique
// « pour fermer le clavier » — sans clavier affiché, ça QUITTAIT l'éditeur (modif perdue)
// puis un tap à l'aveugle faisait croire au succès.
const SAVE_TEXTS = ['Done', 'Terminé', 'Save', 'Enregistrer', 'Sauvegarder']
const SAVE_IDS = ['save_button', 'action_done', 'done_button', 'submit_button', 'action_bar_button_action']
async function saveField(bearer: string, phoneId: string, log: Log): Promise<string> {
  let xml = await dumpXml(bearer, phoneId)
  let btn = findByText(xml, ...SAVE_TEXTS) ?? findByResourceId(xml, ...SAVE_IDS)
  if (!btn && await keyboardShown(bearer, phoneId)) {
    await shellExec(bearer, phoneId, 'input keyevent 111'); await sleep(700)   // ÉCHAP : ferme le clavier sans quitter l'écran
    xml = await dumpXml(bearer, phoneId)
    btn = findByText(xml, ...SAVE_TEXTS) ?? findByResourceId(xml, ...SAVE_IDS)
  }
  if (!btn) throw new Error('Bouton « Terminé / Enregistrer » introuvable — rien n’a été enregistré')
  log('   💾 Enregistrement…')
  await tap(bearer, phoneId, btn)
  await sleep(3000)
  return dumpXml(bearer, phoneId)
}

// Messages d'Instagram quand le pseudo est refusé (pris, invalide, trop de changements).
// Apostrophes droites ET typographiques (Instagram FR écrit « n’est pas disponible »).
export const USERNAME_REFUSED = /not available|isn['’]t available|is not available|n['’]est pas disponible|already taken|déjà pris|can['’]t change|ne pouvez pas|try again later|réessayez plus tard|only use letters|uniquement des lettres|isn['’]t allowed|n['’]est pas autorisé/i

// Libellé de la ligne / de l'écran « pseudo ». Ancré au DÉBUT du texte : la ligne
// peut être « Username » seule ou « Username, lea_123 » (content-desc groupé), mais
// jamais « Name » / « Nom » (le nom affiché, une ligne au-dessus).
const USERNAME_LABEL = /^(Username|Nom d['’]utilisateur|Pseudo|Nombre de usuario)\b/i
const NAME_LABEL = /^(Name|Nom|Nombre)$/i

/** Centre du 1er nœud dont le text/content-desc vérifie `re`. */
export function findByTextRe(xml: string, re: RegExp): Pt | null {
  for (const m of xml.matchAll(/<node\b[^>]*>/g)) {
    const el = m[0]
    const t = el.match(/\btext="([^"]*)"/)?.[1] ?? ''
    const d = el.match(/\bcontent-desc="([^"]*)"/)?.[1] ?? ''
    if ((t && re.test(t)) || (d && re.test(d))) { const p = centerOf(el); if (p) return p }
  }
  return null
}

/** Centre du 1er champ de saisie (EditText) à l'écran. */
export function findEditText(xml: string): Pt | null {
  const m = xml.match(/<node\b[^>]*class="android\.widget\.EditText"[^>]*>/)
  return m ? centerOf(m[0]) : null
}

/**
 * Ligne « pseudo » de l'écran Profil du Centre de comptes. Jamais de coordonnée
 * au hasard : taper à côté ouvrirait le NOM affiché (bug « le pseudo modifie le nom »).
 */
export function findUsernameRow(xml: string, current?: string): Pt | null {
  const cur = current?.trim().replace(/^@/, '')
  return findByTextRe(xml, USERNAME_LABEL) ??
    (cur ? findByTextRe(xml, new RegExp(`^@?${esc(cur)}$`, 'i')) : null) ??
    findByResourceId(xml, 'username_row', 'handle_row')
}

/** L'écran ouvert est-il bien l'éditeur du pseudo (et pas celui du nom) ? */
export function isUsernameEditor(xml: string): boolean {
  return !!findByTextRe(xml, USERNAME_LABEL) || !!findByResourceId(xml, 'username_field', 'handle_field')
}
export function isNameEditor(xml: string): boolean {
  return !!findByTextRe(xml, NAME_LABEL) && !isUsernameEditor(xml)
}

/** Le pseudo `handle` est-il affiché à l'écran (Centre de comptes ou en-tête du profil) ? */
export function screenShowsHandle(xml: string, handle: string): boolean {
  const h = esc(handle.replace(/^@/, ''))
  return !!findByTextRe(xml, new RegExp(`^@?${h}$`, 'i')) || !!findByTextRe(xml, new RegExp(`^(Username|Nom d['’]utilisateur|Pseudo),\\s*@?${h}$`, 'i'))
}

/** 1re vignette de la grille de la galerie (la photo la plus récente), hors tuile « appareil photo ». */
export function findFirstGalleryThumb(xml: string, sw: number): Pt | null {
  const cells: { x: number; y: number; p: Pt }[] = []
  for (const m of xml.matchAll(/<node\b[^>]*>/g)) {
    const el = m[0]
    const b = el.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    if (!b) continue
    const [x1, y1, x2, y2] = b.slice(1).map(Number)
    const w = x2 - x1, h = y2 - y1
    if (w < sw * 0.15 || w > sw * 0.45 || Math.abs(w - h) > w * 0.25) continue   // case carrée de la grille
    const desc = (el.match(/\bcontent-desc="([^"]*)"/)?.[1] ?? '') + ' ' + (el.match(/\bresource-id="([^"]*)"/)?.[1] ?? '')
    if (/camera|appareil photo|capture/i.test(desc)) continue
    const rid = el.match(/\bresource-id="([^"]*)"/)?.[1] ?? ''
    const isCell = /gallery|grid|thumbnail|media_picker|media_item/i.test(rid) || /class="android\.widget\.(ImageView|FrameLayout)"/.test(el) && /clickable="true"/.test(el)
    if (!isCell) continue
    cells.push({ x: x1, y: y1, p: [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)] })
  }
  cells.sort((a, b) => a.y - b.y || a.x - b.x)
  return cells[0]?.p ?? null
}

// ── Bloc : changer le @pseudo ────────────────────────────────────────────────
// `current` : pseudo actuel connu (choisit le bon compte et trouve la bonne ligne).
// Succès = le NOUVEAU pseudo est relu à l'écran après l'enregistrement.
export async function changeUsernameOnPhone(
  bearer: string, phoneId: string, username: string, log: Log, current?: string,
): Promise<{ ok: boolean; error?: string }> {
  const handle = username.trim().replace(/^@/, '')
  const invalid = usernameIssue(handle)
  if (invalid) return { ok: false, error: invalid }
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log)
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }
    const s = await prepareScreen(bearer, phoneId)
    let xml = await openAccountCenterEditor(bearer, phoneId, s, log, current)
    log(`📝 Pseudo → @${handle}`)
    let row = findUsernameRow(xml, current)
    if (!row) {   // la ligne peut être sous le pli
      await shellExec(bearer, phoneId, `input swipe ${s.cx} ${Math.floor(s.sh * 0.7)} ${s.cx} ${Math.floor(s.sh * 0.4)} 500`)
      await sleep(1200)
      xml = await readScreen(bearer, phoneId)
      row = findUsernameRow(xml, current)
    }
    if (!row) return { ok: false, error: 'Ligne « Nom d\'utilisateur » introuvable — rien n\'a été modifié' }
    await tap(bearer, phoneId, row)
    await sleep(2500)
    xml = await readScreen(bearer, phoneId)
    // Garde-fou : si c'est l'éditeur du NOM qui s'est ouvert, on ressort sans rien toucher.
    if (!isUsernameEditor(xml) || isNameEditor(xml)) {
      await shellExec(bearer, phoneId, 'input keyevent 4')
      return { ok: false, error: 'L\'écran ouvert n\'est pas celui du nom d\'utilisateur — rien n\'a été modifié' }
    }
    const field = findByResourceId(xml, 'username_field', 'handle_field') ?? findEditText(xml)
    if (!field) return { ok: false, error: 'Champ du nom d\'utilisateur introuvable' }
    await clearAndType(bearer, phoneId, field, handle, log)
    await sleep(2500)  // Instagram vérifie la disponibilité pendant la frappe
    const refusedBefore = screenHas(await dumpXml(bearer, phoneId), USERNAME_REFUSED)
    if (refusedBefore) return { ok: false, error: `Instagram refuse « @${handle} » : ${refusedBefore}` }
    const after = await saveField(bearer, phoneId, log)
    const refused = screenHas(after, USERNAME_REFUSED)
    if (refused) return { ok: false, error: `Instagram refuse « @${handle} » : ${refused}` }
    if (findByTextRe(after, PASSWORD_PROMPT)) return { ok: false, error: 'Instagram demande le mot de passe / une vérification pour changer le pseudo — à faire une fois à la main' }

    // Vérification : le nouveau pseudo doit apparaître (Centre de comptes), sinon on
    // relit l'en-tête du profil Instagram.
    log('   🔎 Vérification…')
    let seen = (await waitForScreen(bearer, phoneId, x => screenShowsHandle(x, handle), 8000)).ok
    if (!seen) {
      xml = await openProfileTab(bearer, phoneId, s, log)
      seen = screenShowsHandle(xml, handle) || (await waitForScreen(bearer, phoneId, x => screenShowsHandle(x, handle), 6000)).ok
    }
    if (!seen) return { ok: false, error: `Changement non confirmé : @${handle} n’apparaît pas sur le profil après l’enregistrement` }
    log('   ✅ Nom d\'utilisateur changé (vérifié)')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Bloc : photo de profil ───────────────────────────────────────────────────
// imageUrl : URL lisible par GeeLark (URL signée Supabase de la banque).
// Succès = la photo choisie a été recadrée/validée ET on est revenu sur l'écran du profil.
export async function changeProfilePicOnPhone(
  bearer: string, phoneId: string, imageUrl: string, log: Log, current?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log)
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }
    // Accès aux photos accordé d'avance (sinon fenêtre d'autorisation Android 13+).
    await shellExec(bearer, phoneId, ['READ_MEDIA_IMAGES', 'READ_MEDIA_VISUAL_USER_SELECTED', 'READ_EXTERNAL_STORAGE']
      .map(p => `pm grant ${IG_PKG} android.permission.${p} 2>/dev/null`).join('; ') + '; true', 2).catch(() => '')
    log('🖼 Envoi de la photo…')
    const pushed = await pushImageToGallery(bearer, phoneId, imageUrl, log)
    if (!pushed.ok) return pushed
    const s = await prepareScreen(bearer, phoneId)
    let xml = await openAccountCenterEditor(bearer, phoneId, s, log, current)
    log('🖼 Changement de la photo de profil…')
    const row = findByText(xml, 'Profile picture', 'Photo de profil', 'Profile photo', 'Photo de profil ou avatar', 'Edit profile picture', 'Modifier la photo de profil') ??
      findByTextRe(xml, /^(Profile (picture|photo)|Photo de profil)\b/i) ??
      findByResourceId(xml, 'profile_picture_row', 'profile_photo_row', 'avatar_row')
    if (!row) return { ok: false, error: 'Ligne « Photo de profil » introuvable — rien n’a été modifié' }
    await tap(bearer, phoneId, row)
    await sleep(3000)
    xml = await readScreen(bearer, phoneId)
    const gallery = findByText(xml, 'Choose from library', 'Choisir dans la bibliothèque', 'Choose from Gallery', 'Gallery', 'Galerie', 'Photo library', 'Choose from your photos', 'Choisir dans vos photos', 'New profile picture', 'Nouvelle photo de profil') ??
      findByResourceId(xml, 'gallery_option', 'choose_library', 'library_option', 'choose_from_library')
    if (gallery) { await tap(bearer, phoneId, gallery); await sleep(4000) }
    log('   📷 Sélection de la photo la plus récente…')
    const grid = await waitForScreen(bearer, phoneId, x => !!findFirstGalleryThumb(x, s.sw), 10_000)
    const thumb = findFirstGalleryThumb(grid.xml, s.sw)
    if (!thumb) return { ok: false, error: 'Galerie photo introuvable — rien n’a été modifié' }
    await tap(bearer, phoneId, thumb)
    await sleep(2500)
    // Recadrage puis confirmation : jusqu'à 3 écrans « Suivant / Terminé ».
    let confirmed = 0
    for (let step = 0; step < 3; step++) {
      xml = await readScreen(bearer, phoneId)
      const next = findByText(xml, 'Next', 'Suivant', 'Done', 'Terminé', 'Save', 'Enregistrer', 'Share', 'Partager') ??
        findByResourceId(xml, 'action_next', 'next_button', 'done_button', 'save_button')
      if (!next) break
      await tap(bearer, phoneId, next); confirmed++
      await sleep(4000)
    }
    if (confirmed === 0) return { ok: false, error: 'Écran de validation de la photo introuvable — photo non changée' }
    // Retour attendu sur l'écran du profil (Centre de comptes ou profil Instagram), plus de recadrage.
    const back = await waitForScreen(bearer, phoneId, x =>
      !findByText(x, 'Next', 'Suivant') && !!(findByTextRe(x, /^(Profile (picture|photo)|Photo de profil|Name|Nom|Username|Nom d['’]utilisateur|Edit profile|Modifier le profil)\b/i)), 20_000)
    if (!back.ok) return { ok: false, error: 'Changement de photo non confirmé (l’écran du profil n’est pas revenu)' }
    log('   ✅ Photo de profil changée')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
