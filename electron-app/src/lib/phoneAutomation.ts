// Moteur d'automatisation « par élément » pour les cloud phones maison.
//
// Principe (le même qu'Appium/uiautomator, en plus léger) : au lieu de taper des
// coordonnées fixes (fragile), on lit l'ARBRE UI de l'écran (`uiautomator dump`),
// on trouve l'élément par son texte / resource-id / description, et on tape SON
// centre. Résultat : résistant aux changements de layout et indépendant de la
// résolution.
//
// N'utilise que `cloudPhones.shell` (déjà dispo sur l'agent) → aucune modif
// serveur. La saisie de texte passe par ADBKeyBoard (doit être installé + clavier
// par défaut) pour gérer accents/emoji proprement.
import { cloudPhones } from './cloudPhones'

export interface UiNode {
  cls: string; text: string; id: string; desc: string; clickable: boolean
  x: number; y: number; w: number; h: number; cx: number; cy: number
}
// Critère de recherche d'un élément. Combinables (ET logique).
export interface Matcher {
  text?: string        // texte exact (insensible à la casse)
  contains?: string    // texte OU description qui contient
  id?: string          // resource-id (suffixe suffit, ex: 'creation_next_button')
  desc?: string        // content-desc exact
  clickable?: boolean  // seulement les éléments cliquables
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Récupère l'arbre UI courant de l'écran, parsé en liste de nœuds.
export async function dumpUi(id: string): Promise<UiNode[]> {
  await cloudPhones.shell(id, 'uiautomator dump /sdcard/sf-ui.xml >/dev/null 2>&1', 30000)
  const r = await cloudPhones.shell(id, 'cat /sdcard/sf-ui.xml', 15000)
  return parseNodes(r.ok ? (r.data?.output ?? '') : '')
}

// Parse le XML uiautomator en nœuds exploitables (avec centre pré-calculé).
export function parseNodes(xml: string): UiNode[] {
  const out: UiNode[] = []
  if (!xml || xml.indexOf('<node') < 0) return out
  let doc: Document
  try { doc = new DOMParser().parseFromString(xml, 'text/xml') } catch { return out }
  const nodes = doc.getElementsByTagName('node')
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const m = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(n.getAttribute('bounds') || '')
    if (!m) continue
    const x1 = +m[1], y1 = +m[2], x2 = +m[3], y2 = +m[4]
    out.push({
      cls: n.getAttribute('class') || '',
      text: n.getAttribute('text') || '',
      id: n.getAttribute('resource-id') || '',
      desc: n.getAttribute('content-desc') || '',
      clickable: n.getAttribute('clickable') === 'true',
      x: x1, y: y1, w: x2 - x1, h: y2 - y1,
      cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2),
    })
  }
  return out
}

const norm = (s: string) => s.toLowerCase().trim()

// Cœur du sélecteur visuel : à partir d'un POINT cliqué (coords écran du tel) et
// de l'arbre UI courant, renvoie le MEILLEUR sélecteur d'élément (pas une
// coordonnée !). On prend le plus petit nœud sous le doigt, et on choisit le
// critère le plus stable dispo : texte > description > resource-id. C'est ce qui
// rend un flow enregistré robuste (il retrouve le bouton par son sens au rejeu).
// resource-id génériques (conteneurs plein écran) à NE PAS utiliser comme cible :
// ils ne désignent pas un bouton et cassent le rejeu.
const GENERIC_IDS = new Set([
  'action_bar_root', 'content', 'container', 'root', 'decor_content_parent', 'list',
  'recycler_view', 'main_content', 'coordinator', 'drawer_layout', 'fragment_container', 'navigation_bar_background',
])
export function matcherAt(nodes: UiNode[], x: number, y: number): { matcher: Matcher; label: string } | null {
  const inside = nodes.filter(n => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h)
  if (!inside.length) return null
  const byArea = inside.slice().sort((a, b) => (a.w * a.h) - (b.w * b.h))  // plus petit d'abord (plus précis)
  const withText = byArea.find(n => n.text.trim())
  if (withText) return { matcher: { text: withText.text.trim() }, label: `texte « ${withText.text.trim()} »` }
  const withDesc = byArea.find(n => n.desc.trim())
  if (withDesc) return { matcher: { desc: withDesc.desc.trim() }, label: `desc « ${withDesc.desc.trim()} »` }
  // id : on ignore les conteneurs génériques, et on préfère un élément cliquable.
  const idOk = (n: UiNode) => { const s = n.id.split('/').pop() || ''; return !!s && !GENERIC_IDS.has(s) }
  const withId = byArea.find(n => idOk(n) && n.clickable) || byArea.find(idOk)
  if (withId) { const short = withId.id.split('/').pop() || withId.id; return { matcher: { id: short }, label: `id « ${short} »` } }
  return null
}

// Trouve le 1er nœud correspondant au critère.
export function find(nodes: UiNode[], m: Matcher): UiNode | null {
  return nodes.find(n => {
    if (m.text != null && norm(n.text) !== norm(m.text)) return false
    if (m.contains != null && !`${n.text} ${n.desc}`.toLowerCase().includes(m.contains.toLowerCase())) return false
    if (m.id != null && !n.id.endsWith(m.id)) return false
    if (m.desc != null && norm(n.desc) !== norm(m.desc)) return false
    if (m.clickable && !n.clickable) return false
    return true
  }) || null
}

// Attend qu'un élément apparaisse (re-dump toutes les 0,8 s), jusqu'à timeout.
export async function waitFor(id: string, m: Matcher, timeoutMs = 15000): Promise<UiNode | null> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const found = find(await dumpUi(id), m)
    if (found) return found
    await sleep(800)
  }
  return null
}

// Libellés de fermeture des popups récurrents (permissions, MAJ, notifs, « pas
// maintenant »…) — FR + EN. Étendable au fil des cas rencontrés.
const DISMISS_LABELS = [
  'plus tard', 'pas maintenant', 'not now', 'ignorer', 'skip', 'passer',
  'autoriser', 'allow', 'while using the app', 'l’application', "l'application",
  'ok', 'continuer', 'continue', 'annuler', 'cancel', 'fermer', 'close',
  'refuser', "don't allow", 'no thanks', 'non merci', 'got it', 'compris',
]

// Ferme les popups connus s'il y en a (jusqu'à `rounds` d'affilée). Renvoie le
// nombre de popups fermés. À appeler entre les étapes d'un flow → anti-blocage.
export async function dismissPopups(id: string, rounds = 3): Promise<number> {
  let dismissed = 0
  for (let r = 0; r < rounds; r++) {
    const nodes = await dumpUi(id)
    const btn = nodes.find(n => n.clickable && DISMISS_LABELS.some(l => norm(n.text) === l || norm(n.desc) === l))
    if (!btn) break
    await cloudPhones.shell(id, `input tap ${btn.cx} ${btn.cy}`)
    dismissed++
    await sleep(700)
  }
  return dismissed
}

// Options d'un tap robuste.
export interface TapOpts { timeoutMs?: number; retries?: number; guardPopups?: boolean; label?: string }

// Tape un élément de façon ROBUSTE : attend qu'il apparaisse, et s'il n'est pas
// là, ferme les popups éventuels puis réessaie. C'est ça qui « ne casse pas » :
// on ne tape jamais une coordonnée en dur, on vise l'élément par son sens, on
// attend l'écran, on gère les popups, on réessaie. Renvoie false si vraiment
// introuvable (le flow peut alors s'arrêter proprement plutôt que continuer à
// l'aveugle).
export async function tap(id: string, m: Matcher, opts: TapOpts = {}): Promise<boolean> {
  const { timeoutMs = 12000, retries = 2, guardPopups = true } = opts
  for (let attempt = 0; attempt <= retries; attempt++) {
    const el = await waitFor(id, m, attempt === 0 ? timeoutMs : 4000)
    if (el) { await cloudPhones.shell(id, `input tap ${el.cx} ${el.cy}`); return true }
    if (guardPopups && await dismissPopups(id) > 0) continue   // un popup gênait → on réessaie
  }
  return false
}

// Fait défiler vers le bas puis cherche l'élément — utile pour les listes/galeries
// (jusqu'à `maxScrolls` défilements). Renvoie le nœud ou null.
export async function scrollToFind(id: string, m: Matcher, maxScrolls = 8): Promise<UiNode | null> {
  for (let i = 0; i <= maxScrolls; i++) {
    const el = find(await dumpUi(id), m)
    if (el) return el
    // swipe vers le haut (défile vers le bas) au centre de l'écran
    await cloudPhones.shell(id, 'input swipe 540 1400 540 500 250')
    await sleep(600)
  }
  return null
}

// Saisit du texte via ADBKeyBoard (base64 → accents/emoji fiables).
export async function typeText(id: string, text: string): Promise<void> {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)))
  await cloudPhones.shell(id, `am broadcast -a ADB_INPUT_B64 --es msg ${b64}`)
}

// Vrai si le package est installé sur le tel.
export async function isInstalled(id: string, pkg: string): Promise<boolean> {
  const r = await cloudPhones.shell(id, `pm list packages ${pkg}`, 10000)
  return !!r.ok && (r.data?.output ?? '').split('\n').some(l => l.trim() === `package:${pkg}`)
}

// Ouvre une app par son package. On résout d'abord l'activité de lancement
// (fiable) puis on la démarre ; repli sur monkey si la résolution échoue.
export async function openApp(id: string, pkg: string): Promise<boolean> {
  const r = await cloudPhones.shell(id, `cmd package resolve-activity --brief ${pkg} | tail -n 1`, 10000)
  const comp = (r.data?.output ?? '').trim()
  if (comp.includes('/') && !/no\s|error|exception/i.test(comp)) {
    await cloudPhones.shell(id, `am start -n ${comp}`)
    return true
  }
  await cloudPhones.shell(id, `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`)
  return false
}

// Touches système utiles.
export const keys = {
  back: (id: string) => cloudPhones.shell(id, 'input keyevent 4'),
  home: (id: string) => cloudPhones.shell(id, 'input keyevent 3'),
  enter: (id: string) => cloudPhones.shell(id, 'input keyevent 66'),
}
