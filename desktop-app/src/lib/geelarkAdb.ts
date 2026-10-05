// Automatisation Instagram par ADB (/shell/execute + uiautomator) sur un téléphone
// GeeLark DÉJÀ démarré. Sert aux blocs du Flow Builder qu'aucun template RPA
// GeeLark ne couvre : changer le @pseudo et la photo de profil.
//
// Porté de electron-app/src/lib/geelark.ts (updateInstagramProfile), qui passe par
// le Centre de comptes Meta. Chaque étape cherche l'élément par texte/resource-id
// dans le dump UI, avec une coordonnée de repli ; le log raconte chaque action pour
// pouvoir recaler le flow quand Instagram change son interface.
import { geelarkFetch, ensurePhoneRunning, sleep } from './geelark'
import { heartbeatPhone } from './phoneWatch'

type Log = (m: string) => void
type Pt = [number, number]

// ── Shell ADB ────────────────────────────────────────────────────────────────
// Le démon shell n'est pas toujours prêt juste après le boot (ou occupé quand
// beaucoup de téléphones tournent) → on retente les erreurs « pas prêt ».
async function shellExec(bearer: string, phoneId: string, cmd: string, maxRetries = 6): Promise<string> {
  const NOT_READY = /not running|not started|unavailable|not ready|phone.*start|starting/i
  heartbeatPhone(phoneId)   // automatisation en cours → le serveur ne coupe pas le téléphone
  for (let attempt = 0; attempt < maxRetries; attempt++) {
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

const tap = (b: string, id: string, p: Pt) => shellExec(b, id, `input tap ${p[0]} ${p[1]}`)

// ── Lecture de l'écran (uiautomator) ─────────────────────────────────────────
// Sous charge, `uiautomator dump` renvoie parfois un XML vide/tronqué → on valide
// la racine et on retente (lire l'UI est sans effet de bord).
async function dumpXml(bearer: string, phoneId: string): Promise<string> {
  const f = '/sdcard/sf_dump.xml'
  let last = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      last = await shellExec(bearer, phoneId, `rm -f ${f}; uiautomator dump ${f} >/dev/null 2>&1; cat ${f} 2>/dev/null`)
      if (last.includes('<hierarchy') && last.includes('</hierarchy>')) return last
    } catch { /* retry */ }
    if (attempt < 2) await sleep(1200)
  }
  return last
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

const ACCOUNT_CENTER = ['Accounts Center', 'Account Center', 'Centre de comptes', 'Meta Accounts Center', 'Meta Account Center']

async function openAccountCenterEditor(bearer: string, phoneId: string, s: Screen, log: Log): Promise<string> {
  log('📲 Ouverture d\'Instagram…')
  await shellExec(bearer, phoneId, 'am force-stop com.instagram.android'); await sleep(1200)
  await shellExec(bearer, phoneId, 'am start -n com.instagram.android/.activity.MainTabActivity'); await sleep(8000)

  let xml = await dumpXml(bearer, phoneId)
  if (screenHas(xml, /^(Log in|Se connecter|Create new account|Créer un compte)$/i)) {
    throw new Error('Compte non connecté sur ce téléphone — ajoute un bloc « Connexion » avant')
  }
  await tap(bearer, phoneId,
    findByText(xml, 'Profile', 'Profil') ??
    findByResourceId(xml, 'profile_tab', 'tab_avatar', 'navigation_profile', 'ig_bottom_bar_profile', 'tab_icon_profile') ??
    [Math.floor(s.sw * 0.92), Math.floor(s.sh * 0.965)])
  await sleep(4000)

  log('☰ Menu…')
  xml = await dumpXml(bearer, phoneId)
  await tap(bearer, phoneId,
    findByResourceId(xml, 'action_bar_overflow_button', 'hamburger_button', 'options_list_button', 'header_options_button') ??
    findByText(xml, 'Options', 'Menu') ??
    [Math.floor(s.sw * 0.95), Math.floor(s.sh * 0.055)])
  await sleep(2500)

  log('🏛 Centre de comptes…')
  xml = await dumpXml(bearer, phoneId)
  let ac = findByText(xml, ...ACCOUNT_CENTER) ?? findByResourceId(xml, 'account_center_row', 'accounts_center')
  if (!ac) {
    const settings = findByText(xml, 'Settings and privacy', 'Paramètres et confidentialité', 'Settings', 'Paramètres')
    if (settings) {
      await tap(bearer, phoneId, settings); await sleep(3000)
      xml = await dumpXml(bearer, phoneId)
      ac = findByText(xml, ...ACCOUNT_CENTER)
      if (!ac) {
        await shellExec(bearer, phoneId, `input swipe ${s.cx} ${Math.floor(s.sh * 0.7)} ${s.cx} ${Math.floor(s.sh * 0.3)} 600`)
        await sleep(1000)
        xml = await dumpXml(bearer, phoneId)
        ac = findByText(xml, ...ACCOUNT_CENTER)
      }
    }
  }
  if (!ac) throw new Error('Centre de comptes introuvable')
  await tap(bearer, phoneId, ac); await sleep(4000)

  log('👤 Profil…')
  xml = await dumpXml(bearer, phoneId)
  const details = findByText(xml, 'Profiles', 'Profils', 'Profile and personal details', 'Profil et informations personnelles', 'Profile details')
  if (details) { await tap(bearer, phoneId, details); await sleep(3000); xml = await dumpXml(bearer, phoneId) }
  await tap(bearer, phoneId,
    findByText(xml, 'Instagram') ??
    findByResourceId(xml, 'account_item', 'profile_account_row', 'account_row', 'instagram_account') ??
    [s.cx, Math.floor(s.sh * 0.33)])
  await sleep(3500)
  return dumpXml(bearer, phoneId)
}

// Enregistre le champ (Terminé/Save en haut à droite) puis revient à la liste.
async function saveField(bearer: string, phoneId: string, s: Screen, log: Log): Promise<string> {
  await shellExec(bearer, phoneId, 'input keyevent 4'); await sleep(600)  // ferme le clavier
  const xml = await dumpXml(bearer, phoneId)
  log('   💾 Enregistrement…')
  await tap(bearer, phoneId,
    findByText(xml, 'Done', 'Terminé', 'Save', 'Enregistrer', 'Sauvegarder') ??
    findByResourceId(xml, 'save_button', 'action_done', 'done_button', 'submit_button') ??
    [Math.floor(s.sw * 0.9), Math.floor(s.sh * 0.055)])
  await sleep(3000)
  return dumpXml(bearer, phoneId)
}

// Messages d'Instagram quand le pseudo est refusé (pris, invalide, trop de changements).
const USERNAME_REFUSED = /not available|isn't available|is not available|n'est pas disponible|already taken|déjà pris|can't change|ne pouvez pas|try again later|réessayez plus tard|only use letters|uniquement des lettres/i

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

// ── Bloc : changer le @pseudo ────────────────────────────────────────────────
// `current` : pseudo actuel connu (sert de repère pour trouver la bonne ligne).
export async function changeUsernameOnPhone(
  bearer: string, phoneId: string, username: string, log: Log, current?: string,
): Promise<{ ok: boolean; error?: string }> {
  const handle = username.trim().replace(/^@/, '')
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return { ok: false, error: `Pseudo invalide « ${handle} » (lettres, chiffres, . et _ ; 30 max)` }
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log)
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }
    const s = await prepareScreen(bearer, phoneId)
    let xml = await openAccountCenterEditor(bearer, phoneId, s, log)
    log(`📝 Pseudo → @${handle}`)
    let row = findUsernameRow(xml, current)
    if (!row) {   // la ligne peut être sous le pli
      await shellExec(bearer, phoneId, `input swipe ${s.cx} ${Math.floor(s.sh * 0.7)} ${s.cx} ${Math.floor(s.sh * 0.4)} 500`)
      await sleep(1200)
      xml = await dumpXml(bearer, phoneId)
      row = findUsernameRow(xml, current)
    }
    if (!row) return { ok: false, error: 'Ligne « Nom d\'utilisateur » introuvable — rien n\'a été modifié' }
    await tap(bearer, phoneId, row)
    await sleep(2500)
    xml = await dumpXml(bearer, phoneId)
    // Garde-fou : si c'est l'éditeur du NOM qui s'est ouvert, on ressort sans rien toucher.
    if (!isUsernameEditor(xml) || isNameEditor(xml)) {
      await shellExec(bearer, phoneId, 'input keyevent 4')
      return { ok: false, error: 'L\'écran ouvert n\'est pas celui du nom d\'utilisateur — rien n\'a été modifié' }
    }
    const field = findByResourceId(xml, 'username_field', 'handle_field', 'username') ?? findEditText(xml)
    if (!field) return { ok: false, error: 'Champ du nom d\'utilisateur introuvable' }
    await clearAndType(bearer, phoneId, field, handle, log)
    await sleep(2500)  // Instagram vérifie la disponibilité pendant la frappe
    const refusedBefore = screenHas(await dumpXml(bearer, phoneId), USERNAME_REFUSED)
    if (refusedBefore) return { ok: false, error: `Instagram refuse « @${handle} » : ${refusedBefore}` }
    const after = await saveField(bearer, phoneId, s, log)
    const refused = screenHas(after, USERNAME_REFUSED)
    if (refused) return { ok: false, error: `Instagram refuse « @${handle} » : ${refused}` }
    log('   ✅ Nom d\'utilisateur changé')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Bloc : photo de profil ───────────────────────────────────────────────────
// imageUrl : URL lisible par GeeLark (URL signée Supabase de la banque).
export async function changeProfilePicOnPhone(
  bearer: string, phoneId: string, imageUrl: string, log: Log,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log)
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }
    log('🖼 Envoi de la photo…')
    const pushed = await pushImageToGallery(bearer, phoneId, imageUrl, log)
    if (!pushed.ok) return pushed
    const s = await prepareScreen(bearer, phoneId)
    let xml = await openAccountCenterEditor(bearer, phoneId, s, log)
    log('🖼 Changement de la photo de profil…')
    await tap(bearer, phoneId,
      findByText(xml, 'Profile picture', 'Photo de profil', 'Profile photo', 'Photo de profil ou avatar') ??
      findByResourceId(xml, 'profile_picture_row', 'profile_photo_row', 'avatar_row') ??
      [s.cx, Math.floor(s.sh * 0.42)])
    await sleep(3000)
    xml = await dumpXml(bearer, phoneId)
    const gallery = findByText(xml, 'Choose from library', 'Choisir dans la bibliothèque', 'Choose from Gallery', 'Gallery', 'Galerie', 'Photo library', 'Choose from your photos', 'Choisir dans vos photos') ??
      findByResourceId(xml, 'gallery_option', 'choose_library', 'library_option', 'choose_from_library')
    await tap(bearer, phoneId, gallery ?? [s.cx, Math.floor(s.sh * 0.55)])
    await sleep(4000)
    log('   📷 Sélection de la photo la plus récente…')
    await tap(bearer, phoneId, [Math.floor(s.sw * 0.17), Math.floor(s.sh * 0.28)])
    await sleep(2500)
    // Recadrage puis confirmation : jusqu'à 2 écrans « Suivant / Terminé ».
    for (let step = 0; step < 2; step++) {
      xml = await dumpXml(bearer, phoneId)
      const next = findByText(xml, 'Next', 'Suivant', 'Done', 'Terminé', 'Save', 'Enregistrer', 'OK') ??
        findByResourceId(xml, 'action_next', 'next_button', 'done_button', 'save_button')
      if (!next) break
      await tap(bearer, phoneId, next)
      await sleep(4000)
    }
    log('   ✅ Photo de profil changée')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
