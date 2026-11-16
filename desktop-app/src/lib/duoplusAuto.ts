// Automatisation Instagram sur un téléphone DuoPlus, par commandes ADB envoyées via /api/duoplus.
// Chaque commande doit finir en moins de 10 s chez DuoPlus : les opérations longues (téléchargement
// de la vidéo) tournent en tâche de fond sur le téléphone et sont suivies par un fichier témoin.
// Testé sur Instagram 446 / Android 15 (DuoPlus) : partage vers l'éditeur de Reels, légende (accents
// et emojis via le clavier ADB intégré à DuoPlus), lieu, publication.
import { duoCommand } from './duoplus'

export interface UiNode { text: string; desc: string; id: string; cls: string; clickable: boolean; x: number; y: number; w: number; h: number }
export interface AutoCtx { orgId: string | null; phone: string; log: (m: string) => void; shouldStop?: () => boolean }

const IG = 'com.instagram.android'
const ADB_IME = 'com.android.adbkeyboard/.AdbIME'
// ADBKeyBoard (github.com/senzhk/ADBKeyBoard, APK de la branche master, contrôlé le 15/11/2026)
const ADBKB_URL = 'https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk'
const ADBKB_SHA256 = 'e698adea5633135a067b038f9a0cf41baa4de09888713a81593fb2b9682cdc59'
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
export class StopError extends Error { constructor() { super('Arrêté') } }

const unesc = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** Éléments d'un dump uiautomator (texte, description, id sans le préfixe du paquet, centre). */
export function parseUi(xml: string): UiNode[] {
  const out: UiNode[] = []
  for (const m of xml.matchAll(/<node ([^>]*?)\/?>/g)) {
    const a: Record<string, string> = {}
    for (const p of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) a[p[1]] = p[2]
    const b = (a.bounds || '').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
    if (!b) continue
    const [x0, y0, x1, y1] = b.slice(1).map(Number)
    out.push({ text: unesc(a.text || ''), desc: unesc(a['content-desc'] || ''), id: (a['resource-id'] || '').replace(/^[\w.]+:id\//, ''), cls: a.class || '', clickable: a.clickable === 'true', x: Math.round((x0 + x1) / 2), y: Math.round((y0 + y1) / 2), w: x1 - x0, h: y1 - y0 })
  }
  return out
}
export interface Want { id?: string; text?: RegExp; desc?: RegExp }
export const findNode = (ui: UiNode[], w: Want) => ui.find(n => (n.w > 0 && n.h > 0) && (!w.id || n.id === w.id) && (!w.text || w.text.test(n.text)) && (!w.desc || w.desc.test(n.desc)))
// Texte collé dans une commande shell, entre apostrophes.
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const CHUNK = 7000
const unb64 = (s: string) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u }
const b64 = (s: string) => { const u = new TextEncoder().encode(s); let bin = ''; for (const c of u) bin += String.fromCharCode(c); return btoa(bin) }

export class Phone {
  constructor(private c: AutoCtx) {}
  private check() { if (this.c.shouldStop?.()) throw new StopError() }
  /** Une commande shell (réessayée sur les ratés passagers de DuoPlus). */
  async sh(cmd: string, tries = 3): Promise<string> {
    let last: unknown = null
    for (let k = 0; k < tries; k++) {
      this.check()
      try { return (await duoCommand(this.c.orgId, this.c.phone, /&\s*$/.test(cmd) ? `${cmd} true` : `${cmd}; true`)).output }
      catch (e) { last = e; await sleep(1200 * (k + 1)) }
    }
    throw last instanceof Error ? last : new Error(String(last))
  }
  /** Écran courant. DuoPlus coupe la sortie d'une commande vers 10 000 caractères : le dump (allégé des
   *  attributs inutiles) est relu par morceaux de 7 000 octets en base64. */
  async ui(): Promise<UiNode[]> {
    const n = Number((await this.sh(`uiautomator dump /sdcard/sf_ui.xml >/dev/null 2>&1; sed -E 's/ (index|package|checkable|checked|enabled|focusable|focused|scrollable|long-clickable|password|selected)="[^"]*"//g' /sdcard/sf_ui.xml > /sdcard/sf_ui2.xml; stat -c %s /sdcard/sf_ui2.xml`)).trim().split(/\s+/).pop())
    if (!n) return []
    const parts: Uint8Array[] = []
    for (let k = 0; k < n; k += CHUNK) parts.push(unb64((await this.sh(`dd if=/sdcard/sf_ui2.xml bs=1000 skip=${k / 1000} count=${CHUNK / 1000} 2>/dev/null | base64 -w0`)).trim()))
    const all = new Uint8Array(parts.reduce((t, x) => t + x.length, 0)); let o = 0
    for (const x of parts) { all.set(x, o); o += x.length }
    return parseUi(new TextDecoder().decode(all.subarray(0, n)))
  }
  async tap(x: number, y: number) { await this.sh(`input tap ${x} ${y}`) }
  async tapNode(n: UiNode) { await this.tap(n.x, n.y) }
  async key(code: number) { await this.sh(`input keyevent ${code}`) }
  /** Attend qu'un des éléments voulus apparaisse ; écarte au passage les fenêtres connues (permissions, « Pas maintenant »…). */
  async waitFor(wants: Want[], ms = 30000, dismiss = true): Promise<{ node: UiNode; index: number; ui: UiNode[] }> {
    const end = Date.now() + ms
    for (;;) {
      const ui = await this.ui()
      for (let i = 0; i < wants.length; i++) { const node = findNode(ui, wants[i]); if (node) return { node, index: i, ui } }
      if (dismiss) {
        const pop = findNode(ui, { text: /^(Allow|While using the app|Only this time|Not now|Not Now|Got it|Dismiss)$/ }) ?? findNode(ui, { desc: /^(Dismiss|Not now)$/ })
        if (pop) { this.c.log(`  fenêtre « ${pop.text || pop.desc} » écartée`); await this.tapNode(pop); await sleep(1200); continue }
      }
      if (Date.now() > end) throw new Error(`écran attendu introuvable (${wants.map(w => w.id || w.text?.source || w.desc?.source).join(' / ')})`)
      await sleep(1500)
    }
  }
  /** Tape `text` dans le champ `at` (touché ici). Texte simple (lettres, chiffres, ponctuation ASCII) :
   *  saisie native Android. Accents / emojis : clavier ADB de DuoPlus, choisi AVANT de toucher le champ
   *  (sinon le clavier déjà affiché garde la main), puis retour au clavier Google. */
  async type(text: string, at: { x: number; y: number }) {
    if (/^[\x20-\x7e]*$/.test(text) && !/[`"\\$]/.test(text)) {
      await this.tap(at.x, at.y); await sleep(500)
      for (const part of text.match(/.{1,200}/g) ?? []) await this.sh(`input text ${shq(part.replace(/ /g, '%s'))}`)
      return
    }
    await this.ensureAdbKeyboard()
    await this.sh(`ime set ${ADB_IME} >/dev/null`)
    await sleep(500)
    await this.tap(at.x, at.y); await sleep(700)
    // par morceaux : une commande trop longue dépasserait la limite de DuoPlus
    const parts = Array.from(text)
    for (let i = 0; i < parts.length; i += 300) { await this.sh(`am broadcast -a ADB_INPUT_B64 --es msg ${b64(parts.slice(i, i + 300).join(''))} >/dev/null`); await sleep(300) }
    await this.sh('ime reset >/dev/null 2>&1 || ime set com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME >/dev/null')
  }
  /** Clavier ADB : intégré (caché) sur certaines images DuoPlus, absent sur d'autres → installé depuis
   *  le dépôt ADBKeyBoard, après contrôle de l'empreinte SHA-256 du fichier. */
  private kbReady = false
  async ensureAdbKeyboard() {
    if (this.kbReady) return
    const on = await this.sh(`pm unhide com.android.adbkeyboard >/dev/null 2>&1; pm enable com.android.adbkeyboard >/dev/null 2>&1; ime enable ${ADB_IME} 2>&1`)
    if (/Unknown input method/i.test(on)) {
      this.c.log('  installation du clavier ADB sur le téléphone')
      const apk = '/data/local/tmp/sf_adbkb.apk', mark = '/data/local/tmp/sf_adbkb.done'
      await this.sh(`rm -f ${mark}; (curl -sSL -m 90 -o ${apk} ${ADBKB_URL}; chmod 644 ${apk}; echo $? > ${mark}) >/dev/null 2>&1 &`)
      for (let k = 0; k < 30 && !/\d/.test(await this.sh(`cat ${mark} 2>/dev/null`)); k++) await sleep(3000)
      const sum = await this.sh(`sha256sum ${apk} 2>/dev/null`)
      if (!sum.includes(ADBKB_SHA256)) throw new Error('clavier ADB : fichier téléchargé non conforme (empreinte)')
      await this.sh(`rm -f ${mark}; (cat ${apk} | pm install -r -S $(stat -c %s ${apk}) > ${mark} 2>&1) >/dev/null 2>&1 &`)
      for (let k = 0; k < 20 && !/Success|Failure/.test(await this.sh(`cat ${mark} 2>/dev/null`)); k++) await sleep(2000)
      const again = await this.sh(`ime enable ${ADB_IME} 2>&1`)
      if (/Unknown input method/i.test(again)) throw new Error('clavier ADB : installation impossible')
    }
    this.kbReady = true
  }
  async hideKeyboard() { const s = await this.sh('dumpsys input_method | grep -m1 mInputShown'); if (/mInputShown=true/.test(s)) { await this.key(111); await sleep(600) } }
}

/** Attend la fin du démarrage d'Android (téléphone tout juste allumé). */
export async function waitBoot(p: Phone, log: (m: string) => void, ms = 180_000) {
  const end = Date.now() + ms
  for (let k = 0; ; k++) {
    let out = ''
    try { out = await p.sh('getprop sys.boot_completed', 1) } catch { /* pas encore joignable */ }
    if (/1/.test(out)) return
    if (Date.now() > end) throw new Error('le téléphone n’a pas fini de démarrer')
    if (k === 0) log('  attente du démarrage du téléphone…')
    await sleep(5000)
  }
}
/** Télécharge une vidéo sur le téléphone (tâche de fond) et la range dans la galerie. Renvoie son id MediaStore. */
export async function pushVideo(p: Phone, url: string, log: (m: string) => void, maxMs = 12 * 60_000): Promise<{ id: string; path: string }> {
  const tag = `sf_${Date.now().toString(36)}`, path = `/sdcard/DCIM/Camera/VID_${tag}.mp4`, mark = `/sdcard/${tag}.done`
  await p.sh(`mkdir -p /sdcard/DCIM/Camera; (curl -sSL --retry 3 -m ${Math.round(maxMs / 1000)} -o ${path}.part ${shq(url)} && mv ${path}.part ${path}; echo $? > ${mark}) >/dev/null 2>&1 &`)
  log('  téléchargement de la vidéo sur le téléphone…')
  const end = Date.now() + maxMs
  for (;;) {
    await sleep(4000)
    const s = (await p.sh(`cat ${mark} 2>/dev/null; echo "|"; ls -l ${path}.part ${path} 2>/dev/null | awk '{print $5}'`)).trim()
    const [code, size] = s.split('|').map(x => x.trim())
    if (code !== '') { if (code !== '0') throw new Error(`téléchargement de la vidéo raté (code ${code})`); break }
    if (Date.now() > end) throw new Error('téléchargement de la vidéo trop long')
    if (size) log(`  … ${Math.round(Number(size.split('\n').pop()) / 1e6 * 10) / 10} Mo`)
  }
  await p.sh(`rm -f ${mark}; am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${path} >/dev/null`)
  for (let k = 0; k < 10; k++) {
    await sleep(1500)
    const row = await p.sh(`content query --uri content://media/external/video/media --projection _id --where "_data LIKE '%${tag}%'"`)
    const id = row.match(/_id=(\d+)/)?.[1]
    if (id) return { id, path }
  }
  throw new Error('la vidéo n’apparaît pas dans la galerie du téléphone')
}

export interface ReelOpts { videoUrl: string; caption: string; location?: string; dryRun?: boolean }
/** Publie un Reel : vidéo → éditeur Reels d'Instagram (partage) → Suivant → légende → lieu → Partager. */
export async function postReel(c: AutoCtx, o: ReelOpts): Promise<{ posted: boolean; note?: string }> {
  const p = new Phone(c), log = c.log
  await waitBoot(p, log)
  // vidéos laissées par les publications précédentes (Instagram les a déjà envoyées)
  await p.sh(`rm -f /sdcard/DCIM/Camera/VID_sf_*.mp4 /sdcard/DCIM/Camera/VID_sf_*.part; content delete --uri content://media/external/video/media --where "_data LIKE '%VID_sf_%'" >/dev/null 2>&1`)
  const v = await pushVideo(p, o.videoUrl, log)
  let confirmed = false
  try {
    await p.sh(`pm grant ${IG} android.permission.CAMERA >/dev/null 2>&1; pm grant ${IG} android.permission.RECORD_AUDIO >/dev/null 2>&1; pm grant ${IG} android.permission.READ_MEDIA_VIDEO >/dev/null 2>&1`)
    // Instagram ignore le partage s'il démarre à froid : on l'ouvre d'abord et on attend le fil
    log('  ouverture d’Instagram')
    await p.sh(`monkey -p ${IG} -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1`)
    const home = await p.waitFor([{ id: 'feed_tab' }, { text: /^(Log in|Create new account|Get started|Join Instagram)$/ }], 60000)
    if (home.index === 1) throw new Error('Instagram n’est connecté à aucun compte sur ce téléphone')
    let r: { node: UiNode; index: number; ui: UiNode[] } | null = null
    for (let k = 0; k < 2 && !r; k++) {
      log(k ? '  nouvel essai d’ouverture de l’éditeur' : '  ouverture de l’éditeur Reels')
      await p.sh(`am start -a android.intent.action.SEND -t video/mp4 --eu android.intent.extra.STREAM content://media/external/video/media/${v.id} --grant-read-uri-permission -n ${IG}/com.instagram.share.handleractivity.ShareHandlerActivity >/dev/null`)
      try { r = await p.waitFor([{ id: 'clips_right_action_button' }], 30000) } catch { if (k) throw new Error('l’éditeur Reels d’Instagram ne s’est pas ouvert') }
    }
    if (!r) throw new Error('l’éditeur Reels d’Instagram ne s’est pas ouvert')
    await sleep(1500)
    await p.tapNode(r.node)                                                   // Suivant
    r = await p.waitFor([{ id: 'caption_input_text_view' }], 45000)
    if (o.caption.trim()) {
      log('  légende')
      await p.type(o.caption.trim(), r.node); await sleep(600)
      await p.hideKeyboard()
      const got = findNode(await p.ui(), { id: 'caption_input_text_view' })?.text ?? ''
      const want = o.caption.trim().replace(/\s+/g, ' ').slice(0, 20)
      if (!got.replace(/\s+/g, ' ').includes(want)) throw new Error(`la légende n’a pas été écrite correctement (lu : « ${got.slice(0, 40)} »)`)
      log('  légende vérifiée')
    }
    if (o.location?.trim()) {
      try {
        log(`  lieu : ${o.location.trim()}`)
        const ui = await p.ui()
        const row = findNode(ui, { id: 'metadata_location_first_row' }) ?? findNode(ui, { id: 'location_label' })
        if (!row) throw new Error('bouton « Ajouter un lieu » introuvable')
        await p.tapNode(row)
        const s = await p.waitFor([{ id: 'row_search_edit_text' }], 20000)
        await p.type(o.location.trim(), s.node)
        const first = await p.waitFor([{ id: 'row_venue_title' }], 20000, false)
        await p.hideKeyboard()
        const again = await p.ui(), venue = findNode(again, { id: 'row_venue_title' }) ?? first.node
        await p.tap(Math.min(venue.x, 540), venue.y); await sleep(1500)
        const ok = await p.waitFor([{ id: 'checked_location_row_button' }, { id: 'venue_name' }], 10000, false)
        if (ok.index === 0) { const add = findNode(await p.ui(), { id: 'add_location_button' }); if (add) await p.tapNode(add) }
        await p.waitFor([{ id: 'venue_name' }], 15000, false)
      } catch (e) {
        log(`  lieu non ajouté (${e instanceof Error ? e.message : String(e)}) : publication sans lieu`)
        const back = findNode(await p.ui(), { id: 'action_bar_button_back' })
        if (back && !findNode(await p.ui(), { id: 'share_button' })) { await p.tapNode(back); await sleep(1500) }
      }
    }
    const share = await p.waitFor([{ id: 'share_button' }], 20000)
    if (o.dryRun) {
      log('  test : tout est prêt, publication annulée')
      await p.sh(`am force-stop ${IG}`); confirmed = true
      return { posted: false, note: 'test réussi (rien publié)' }
    }
    log('  publication…')
    await p.tapNode(share.node)
    // l'envoi se suit dans le fil : « Posted! » quand c'est en ligne
    const end = Date.now() + 5 * 60_000
    while (Date.now() < end) {
      await sleep(5000)
      const ui = await p.ui()
      const st = findNode(ui, { id: 'row_pending_media_status_textview' })
      if (st && /posted|shared|way to go|publié/i.test(st.text)) { confirmed = true; return { posted: true } }
      if (st && /fail|couldn.t|échou|try again/i.test(st.text)) throw new Error(`Instagram : ${st.text}`)
      if (!st && findNode(ui, { id: 'feed_tab' }) && !findNode(ui, { id: 'row_pending_container' })) { confirmed = true; return { posted: true, note: 'envoyé (pas de message de confirmation lu)' } }
    }
    return { posted: true, note: 'envoyé, Instagram finit l’envoi' }
  } finally {
    // tant que l'envoi n'est pas confirmé, la vidéo reste (Instagram peut encore la lire) : effacée au prochain passage
    if (confirmed) await p.sh(`rm -f ${v.path}; content delete --uri content://media/external/video/media/${v.id} >/dev/null 2>&1`).catch(() => undefined)
  }
}

/* ── Création de compte Instagram (téléphone déconnecté d'Instagram) ──────────────────────────────
   Machine à écrans : à chaque tour on lit l'écran, on reconnaît l'étape par son titre et on la remplit.
   Le numéro (SMSPool, US) n'est acheté qu'une fois l'écran « What's your mobile number? » atteint, et
   il est annulé (remboursé par SMSPool) si le code n'arrive pas. Ordre testé jusqu'au numéro ; les
   étapes suivantes sont reconnues par leur titre (Instagram change parfois l'ordre). */
export interface SignupProfile { fullName: string; username?: string; password: string; birth: { y: number; m: number; d: number } }
export interface NumberSource {
  buy: () => Promise<{ id: string; phone: string }>          // phone = chiffres avec indicatif (ex. 1XXXXXXXXXX)
  waitCode: (id: string) => Promise<string | null>
  cancel: (id: string) => Promise<void>
}
export interface SignupResult { username: string; password: string; phone: string; check?: string }
const has = (ui: UiNode[], re: RegExp) => ui.some(n => re.test(n.text) || re.test(n.desc))
const button = (ui: UiNode[], re: RegExp) => ui.find(n => n.w > 0 && (re.test(n.desc) || re.test(n.text)) && (n.clickable || /Button/.test(n.cls))) ?? ui.find(n => n.w > 0 && (re.test(n.text) || re.test(n.desc)))
const field = (ui: UiNode[]) => ui.find(n => /EditText/.test(n.cls) && n.w > 0)
export const screenSummary = (ui: UiNode[]) => ui.map(n => n.text || n.desc).filter(Boolean).slice(0, 12).join(' | ').slice(0, 300)

async function fill(p: Phone, ui: UiNode[], value: string) {
  const f = field(ui)
  if (!f) throw new Error('champ de saisie introuvable')
  await p.tapNode(f); await sleep(500)
  await p.sh('input keyevent KEYCODE_MOVE_END; for i in $(seq 1 40); do input keyevent 67; done')   // vide le champ
  await p.type(value, f); await sleep(500)
}
const titleOf = (ui: UiNode[]) => (ui.find(n => /\?$|^(Enter the confirmation code|Create a password|Create a username|Agree to)/i.test(n.text))?.text ?? screenSummary(ui)).slice(0, 80)
/** « Next » puis attente que l'écran change (sinon on réessaie, puis on abandonne). */
async function next(p: Phone, ui: UiNode[], log: (m: string) => void) {
  const before = titleOf(ui)
  for (let k = 0; k < 3; k++) {
    await p.hideKeyboard()
    const b = button(await p.ui(), /^(Next|Continue|Suivant)$/)
    if (!b) throw new Error('bouton « Next » introuvable')
    await p.tapNode(b)
    for (let t = 0; t < 18; t++) { await sleep(2500); const now = await p.ui(); if (titleOf(now) !== before || has(now, /isn't valid|not valid|may be incorrect|try again|something went wrong/i)) return }
    log(`  « Next » sans effet sur « ${before} », nouvel essai`)
  }
  throw new Error(`Instagram ne passe pas l’étape « ${before} » : blocage anti-robot d’Instagram (le plus souvent : l’IP du téléphone n’est pas dans le pays du numéro)`)
}
// Date de naissance : sélecteur Android à molettes (mois / jour / année). Seule l'année compte (l'âge).
async function setBirthday(p: Phone, b: SignupProfile['birth'], log: (m: string) => void) {
  let ui = await p.ui()
  const open = button(ui, /^Birthday/i) ?? field(ui)
  if (open) { await p.tapNode(open); await sleep(2000); ui = await p.ui() }
  const year = ui.filter(n => n.id === 'numberpicker_input').find(n => Number(n.text) > 1900)
  if (!year) { log('  sélecteur de date inconnu : date proposée par Instagram gardée'); return }
  await p.tapNode(year); await sleep(400)
  await p.sh(`input keyevent KEYCODE_MOVE_END; for i in $(seq 1 6); do input keyevent 67; done; input text ${b.y}; input keyevent 66`)
  await sleep(600); await p.hideKeyboard()
  const ok = (await p.ui()).find(n => n.id === 'button1') ?? button(await p.ui(), /^(Set|OK|Done)$/i)
  if (ok) { await p.tapNode(ok); await sleep(1500) }
}

/** Numéro au format international sans « + » : SMSPool renvoie les numéros US sur 10 chiffres,
 *  sans l'indicatif 1 (ex. 9472998384 → 19472998384). */
export function intlPhone(raw: string, dial = '1'): string {
  const d = String(raw).replace(/\D/g, '')
  return d.length === 10 && dial === '1' ? `1${d}` : d.startsWith(dial) ? d : `${dial}${d}`
}

export async function createAccount(c: AutoCtx, prof: SignupProfile, nums: NumberSource): Promise<SignupResult> {
  const p = new Phone(c), log = c.log
  await waitBoot(p, log)
  await p.sh(`pm grant ${IG} android.permission.POST_NOTIFICATIONS >/dev/null 2>&1; am force-stop ${IG}; monkey -p ${IG} -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1`)
  await sleep(8000)
  let order: { id: string; phone: string } | null = null, gotCode = false, username = prof.username || '', stuck = 0, lastKey = ''
  const done = new Set<string>()
  const end = Date.now() + 20 * 60_000
  try {
    while (Date.now() < end) {
      const ui = await p.ui()
      const key = screenSummary(ui)
      stuck = key === lastKey ? stuck + 1 : 0; lastKey = key
      if (stuck >= 6) throw new Error(`bloqué sur l’écran : ${key}`)
      if (findNode(ui, { id: 'feed_tab' }) || findNode(ui, { desc: /^Profile$/ })) { log('  compte créé, fil d’accueil ouvert'); return { username, password: prof.password, phone: order?.phone ?? '' } }
      // vérification « Confirm you're human » (code image) : le compte existe ; on ne la contourne pas, la VA la fait à la main
      const human = ui.find(n => /confirm you.re human/i.test(n.text || n.desc))
      if (human) {
        const who = (human.text || human.desc).match(/profile,\s*([\w.]+)/i)?.[1]
        if (who) username = who
        log('  compte créé : Instagram demande une vérification humaine (code image) à faire à la main dans DuoPlus')
        return { username, password: prof.password, phone: order?.phone ?? '', check: 'Vérification humaine à faire à la main (fenêtre DuoPlus du téléphone)' }
      }
      if (has(ui, /^Do you need help\?$/)) { const x = button(ui, /^Close$/); if (x) { await p.tapNode(x); await sleep(1500); continue } }
      if (has(ui, /^Join Instagram$/) || button(ui, /^Get started$/)) { const b = button(ui, /^(Get started|Create new account)$/); if (b) { log('  inscription'); await p.tapNode(b); await sleep(4000); continue } }
      if (has(ui, /what's your mobile number/i)) {
        if (done.has('number')) throw new Error('Instagram redemande le numéro (refusé ?)')
        if (!order) { order = await nums.buy(); log(`  numéro acheté : +${order.phone}`) }
        await fill(p, ui, `+${order.phone}`); done.add('number'); await next(p, await p.ui(), log)
        if (has(await p.ui(), /may be incorrect|isn't valid|not a valid|enter a valid/i)) throw new Error(`Instagram refuse le numéro +${order.phone}`)
        continue
      }
      if (has(ui, /enter the confirmation code/i)) {
        if (!order) throw new Error('code demandé sans numéro')
        if (done.has('code')) { if (has(ui, /isn't valid|not valid/i)) throw new Error('code refusé par Instagram'); await sleep(3000); continue }
        // code envoyé par WhatsApp : SMSPool ne le recevra jamais → « I didn't get the code » → par SMS
        if (has(ui, /whatsapp/i)) {
          log('  code envoyé par WhatsApp : demande d’un SMS')
          const no = button(ui, /didn.t get the code|didn.t receive/i)
          if (no) { await p.tapNode(no); await sleep(2500); const sms = button(await p.ui(), /via SMS|by SMS|text message|Send code/i); if (sms) { await p.tapNode(sms); await sleep(2500) } }
        }
        log('  attente du SMS…')
        const code = await nums.waitCode(order.id)
        if (!code) throw new Error('le SMS n’est pas arrivé')
        gotCode = true
        const digits = code.match(/\d{4,8}/)?.[0] ?? code
        const u2 = await p.ui()
        if (!has(u2, /enter the confirmation code/i)) continue
        await fill(p, u2, digits); done.add('code')
        await sleep(3000)                                                       // Instagram valide souvent tout seul
        if (has(await p.ui(), /enter the confirmation code/i)) await next(p, await p.ui(), log)
        continue
      }
      if (has(ui, /create a password/i)) { log('  mot de passe'); await fill(p, ui, prof.password); await next(p, await p.ui(), log); continue }
      if (has(ui, /save your login info/i)) { const b = button(ui, /^(Save|Not now)$/); if (b) await p.tapNode(b); await sleep(2500); continue }
      if (has(ui, /what's your birthday/i)) { log('  date de naissance'); await setBirthday(p, prof.birth, log); await next(p, await p.ui(), log); continue }
      if (has(ui, /what's your name/i)) { log('  nom'); await fill(p, ui, prof.fullName); await next(p, await p.ui(), log); continue }
      if (has(ui, /create a username/i)) {
        if (prof.username) await fill(p, ui, prof.username)
        await sleep(2500)
        const u2 = await p.ui()
        if (has(u2, /not available|isn't available|taken/i)) { await fill(p, u2, `${prof.username || 'user'}${Math.floor(Math.random() * 9000 + 1000)}`); await sleep(2500) }
        username = (field(await p.ui())?.text || username).trim()
        log(`  pseudo : ${username}`); await next(p, await p.ui(), log); continue
      }
      if (has(ui, /agree to instagram's terms|terms and policies/i)) { log('  conditions acceptées'); const b = button(ui, /^I agree$/); if (b) await p.tapNode(b); await sleep(8000); continue }
      if (has(ui, /try another number|can't use this number|this number isn't|couldn't send|try again later/i)) throw new Error(`Instagram refuse : ${screenSummary(ui)}`)
      // écrans facultatifs après la création : on passe
      const skip = button(ui, /^(Skip|Not now|Not Now|Maybe later|Done)$/)
      if (skip) { await p.tapNode(skip); await sleep(3000); continue }
      await sleep(3000)
    }
    throw new Error('création trop longue (20 min)')
  } catch (e) {
    if (order && !gotCode) { try { await nums.cancel(order.id); log('  numéro annulé (SMSPool rembourse)') } catch { /* déjà clos */ } }
    throw e
  }
}
