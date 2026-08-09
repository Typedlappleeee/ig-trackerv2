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

// Attend puis tape le centre de l'élément. Renvoie false si introuvable.
export async function tap(id: string, m: Matcher, timeoutMs = 15000): Promise<boolean> {
  const el = await waitFor(id, m, timeoutMs)
  if (!el) return false
  await cloudPhones.shell(id, `input tap ${el.cx} ${el.cy}`)
  return true
}

// Saisit du texte via ADBKeyBoard (base64 → accents/emoji fiables).
export async function typeText(id: string, text: string): Promise<void> {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)))
  await cloudPhones.shell(id, `am broadcast -a ADB_INPUT_B64 --es msg ${b64}`)
}

// Ouvre une app par son package.
export async function openApp(id: string, pkg: string): Promise<void> {
  await cloudPhones.shell(id, `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`)
}

// Touches système utiles.
export const keys = {
  back: (id: string) => cloudPhones.shell(id, 'input keyevent 4'),
  home: (id: string) => cloudPhones.shell(id, 'input keyevent 3'),
  enter: (id: string) => cloudPhones.shell(id, 'input keyevent 66'),
}
