// « Cerveau » des automatisations iRemoTech : quand le moteur à règles tombe sur un écran qu'il ne connaît pas,
// on montre la capture + la liste des boutons lus (OCR) à un modèle vision (Groq, clé de l'espace) avec l'objectif.
// Il choisit UN bouton de la liste (pas de coordonnées inventées) ; des garde-fous codés en dur refusent les
// actions dangereuses (Allow contacts/notifs, Follow, Delete, Log out, achat…) quoi que dise le modèle.
import { groqChat } from './ai'
import { claudeChat } from './claude'

let KEY: string | null = null
let CLAUDE = false
/** Clé Groq de l'espace (Réglages › IA). Sans clé : pas de cerveau, le moteur à règles fait seul. */
export function setVisionBrain(key: string | null | undefined): void { KEY = key?.trim() || null }
/** Claude configuré sur le serveur (ANTHROPIC_API_KEY) → c'est LUI le cerveau (capture + boutons lus), Groq en secours. */
export function setVisionBrainClaude(on: boolean): void { CLAUDE = on }
export function hasVisionBrain(): boolean { return !!KEY || CLAUDE }
export function visionBrainName(): string { return CLAUDE ? 'Claude' : KEY ? 'Groq' : '—' }

export interface Btn { id: number; text: string; x: number; y: number }
export type BrainAction =
  | { kind: 'tap'; x: number; y: number; label: string; reason: string }
  | { kind: 'back'; reason: string } | { kind: 'wait'; reason: string } | { kind: 'done'; reason: string } | { kind: 'stop'; reason: string }

// Libellés jamais tapés par le cerveau (normalisés : minuscules, sans espaces ni ponctuation)
const FORBIDDEN = /^(allow|allowall|allowaccess|allowfullaccess|allowaccesstoallphotos|follow|followall|followback|delete|deleteaccount|logout|logoutof.*|buy|purchase|subscribe|pay|turnon|enable|enablenotifications|report|block|unfollow|remove|discardpost|deactivate)$/
const PHOTO_OK = /^(allowfullaccess|allowaccesstoallphotos|continue)$/

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Boutons/mots lisibles de l'écran (dédoublonnés, numérotés), ce que le modèle a le droit de choisir. */
export function buttonsFrom(words: { text: string; cx: number; cy: number }[], H: number): Btn[] {
  const out: Btn[] = []
  for (const w of words) {
    const t = w.text.replace(/\s+/g, ' ').trim()
    if (!/[A-Za-zÀ-ÿ]{2,}/.test(t) || w.cy < H * 0.035) continue // barre d'état exclue
    if (out.some(b => Math.abs(b.y - w.cy) < 10 && Math.abs(b.x - w.cx) < 30)) continue
    out.push({ id: out.length + 1, text: t.slice(0, 40), x: Math.round(w.cx), y: Math.round(w.cy) })
    if (out.length >= 60) break
  }
  return out
}

/** Réponse du modèle → action sûre (pure, testée). null = réponse illisible ou bouton interdit. */
export function parseBrain(text: string | null, btns: Btn[], W: number, H: number, o: { allowPhotos?: boolean } = {}): BrainAction | null {
  if (!text) return null
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  let j: { action?: string; id?: number | string; reason?: string }
  try { j = JSON.parse(m[0]) } catch { return null }
  const reason = String(j.reason ?? '').slice(0, 140)
  const a = String(j.action ?? '').toLowerCase()
  if (a === 'back') return { kind: 'back', reason }
  if (a === 'wait') return { kind: 'wait', reason }
  if (a === 'done') return { kind: 'done', reason }
  if (a === 'stop') return { kind: 'stop', reason }
  if (a !== 'tap') return null
  const b = btns.find(x => x.id === Number(j.id))
  if (!b) return null
  const n = norm(b.text)
  if (FORBIDDEN.test(n) && !(o.allowPhotos && PHOTO_OK.test(n))) return null
  // « OK » d'une alerte de permission iOS (« … Would Like to Access Your Contacts ») = accepter → refusé
  const permission = btns.some(x => /would|access your|notifications|contacts|location|track/i.test(x.text))
  if (n === 'ok' && permission) return null
  if (b.x < 0 || b.y < 0 || b.x > W || b.y > H) return null
  return { kind: 'tap', x: b.x, y: b.y, label: b.text, reason }
}

const MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct']

/** Demande au cerveau la prochaine action pour atteindre `goal`. null = pas de cerveau / pas de décision sûre. */
export async function askBrain(shot: string, words: { text: string; cx: number; cy: number }[], W: number, H: number, goal: string, history: string[] = [], o: { allowPhotos?: boolean } = {}): Promise<BrainAction | null> {
  if (!KEY && !CLAUDE) return null
  const btns = buttonsFrom(words, H)
  const system = [
    'You drive an iPhone running Instagram, one tap at a time. Look at the screenshot and the numbered list of texts read on screen (with their x,y position in pixels).',
    `GOAL: ${goal}`,
    'RULES (never break them): skip every optional step (Skip, Not now, Cancel, Later, No thanks, Next when it only advances). NEVER allow contacts, notifications, location or tracking (choose "Don\'t Allow" / "Not now"). NEVER follow accounts, never delete, never log out, never pay or subscribe, never change settings, never post anything unless the goal says so.',
    'If you see a human verification / captcha / "confirm you\'re human", an account ban/suspension or an error you cannot fix: answer stop.',
    'Reply with ONE JSON object only: {"action":"tap","id":<number from the list>,"reason":"..."} or {"action":"back","reason":"..."} (top-left back arrow / close X) or {"action":"wait","reason":"..."} (loading) or {"action":"done","reason":"..."} (goal reached) or {"action":"stop","reason":"..."}.',
  ].join('\n')
  const list = btns.map(b => `${b.id}. "${b.text}" @ (${b.x},${b.y})`).join('\n') || '(no readable text)'
  const user = [
    { type: 'text', text: `Screen ${W}x${H}. Texts on screen:\n${list}\n\nLast actions: ${history.slice(-5).join(' | ') || 'none'}\nWhat is the next action?` },
    { type: 'image_url', image_url: { url: shot } },
  ]
  // 1. Claude (vision) d'abord : même consigne, même liste de boutons, mêmes garde-fous (parseBrain)
  if (CLAUDE) {
    try {
      const t = await claudeChat(system, (user[0] as { text: string }).text, 600, shot.startsWith('data:') ? shot : undefined)
      const act = parseBrain(t, btns, W, H, o)
      if (act) return act
    } catch { /* Claude indisponible → Groq */ }
  }
  if (!KEY) return null
  for (const model of MODELS) {
    try {
      const t = await groqChat(KEY, model, [{ role: 'system', content: system }, { role: 'user', content: user }], 160, 0)
      const act = parseBrain(t, btns, W, H, o)
      if (act) return act
    } catch { /* modèle indisponible → suivant */ }
  }
  return null
}
