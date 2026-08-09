// Interpréteur de flows d'automatisation « par donnée ».
//
// Un FLOW n'est plus du code figé : c'est une liste d'étapes (JSON). Ça permet :
//   • des flows OFFICIELS (maintenus par ScaleFlow),
//   • des flows UTILISATEURS créés dans un « workshop » (éditeur), partageables,
//   • le tout stocké en base (Supabase) et exécuté par CE même interpréteur.
//
// L'exécution s'appuie sur le moteur robuste `phoneAutomation` (vise l'élément
// par son sens, attend l'écran, ferme les popups, réessaie). Chaque étape est
// journalisée ; en cas d'échec d'une étape requise, le flow s'arrête en indiquant
// OÙ (on peut alors capturer l'écran et corriger le sélecteur).
import { cloudPhones } from './cloudPhones'
import { dumpUi, tap, typeText, openApp, dismissPopups, keys, type Matcher } from './phoneAutomation'

export type Logger = (m: string) => void

// Champ saisi par l'utilisateur avant de lancer le flow (ex: la légende).
export interface FlowInput { key: string; label: string; placeholder?: string; optional?: boolean }

// Étapes possibles d'un flow (le « vocabulaire » du workshop).
export type Step =
  | { do: 'open'; pkg: string }
  | { do: 'link'; url: string }                        // deep link / URL (am start -d) → saute à un écran
  | { do: 'tap'; any: Matcher[]; label: string; required?: boolean }
  | { do: 'type'; var?: string; text?: string }        // var → valeur saisie par l'utilisateur
  | { do: 'wait'; ms: number }
  | { do: 'popups' }                                    // ferme les popups
  | { do: 'key'; key: 'back' | 'home' | 'enter' }
  | { do: 'pickFirstMedia' }                            // 1re vignette de la galerie
  | { do: 'swipe'; x1: number; y1: number; x2: number; y2: number; ms?: number }

export interface Flow {
  id: string
  name: string
  description?: string
  app?: string
  inputs?: FlowInput[]
  steps: Step[]
  official?: boolean
}
export interface FlowResult { ok: boolean; failedAt?: string }

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
// Remplace les {{clé}} par les valeurs saisies (ex: {{username}} → nike).
const interp = (s: string, vars: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')

// Essaie plusieurs sélecteurs pour une même étape (fallbacks FR/EN/id).
async function tapAny(id: string, matchers: Matcher[], label: string, log: Logger, required = true): Promise<boolean> {
  for (const m of matchers) {
    if (await tap(id, m, { timeoutMs: 6000, retries: 1 })) { log(`  ✓ ${label}`); return true }
  }
  log(`  ${required ? '✗' : '·'} ${label}${required ? ' introuvable' : ' (sauté)'}`)
  return false
}

// Sélectionne la 1re vignette de la galerie (vraie vignette de l'arbre UI).
async function pickFirstMedia(id: string, log: Logger): Promise<boolean> {
  const nodes = await dumpUi(id)
  let cand = nodes.find(n => n.clickable && /gallery.*(thumbnail|item)|media_thumbnail/i.test(n.id))
  if (!cand) cand = nodes.filter(n => n.clickable && /ImageView|Thumbnail/i.test(n.cls) && n.y > 300)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))[0]
  if (!cand) { log('  ✗ aucune vignette trouvée'); return false }
  await cloudPhones.shell(id, `input tap ${cand.cx} ${cand.cy}`)
  log('  ✓ vidéo sélectionnée')
  return true
}

// Exécute un flow (liste d'étapes) sur un téléphone.
export async function runFlow(id: string, flow: Flow, opts: { log?: Logger; vars?: Record<string, string> } = {}): Promise<FlowResult> {
  const log = opts.log ?? (() => {})
  const vars = opts.vars ?? {}
  try {
    for (const s of flow.steps) {
      switch (s.do) {
        case 'open': log('Ouverture de l’app…'); await openApp(id, s.pkg); await wait(5000); await dismissPopups(id); break
        case 'link': { log('Ouvrir un lien'); const u = interp(s.url, vars).replace(/'/g, ''); await cloudPhones.shell(id, `am start -a android.intent.action.VIEW -d '${u}'`); await wait(3500); await dismissPopups(id); break }
        case 'wait': await wait(s.ms); break
        case 'popups': await dismissPopups(id); break
        case 'key': await keys[s.key](id); break
        case 'swipe': await cloudPhones.shell(id, `input swipe ${s.x1} ${s.y1} ${s.x2} ${s.y2} ${s.ms ?? 250}`); break
        case 'pickFirstMedia':
          log('Sélectionner la 1re vidéo')
          if (!await pickFirstMedia(id, log)) throw new Error('sélection de la vidéo')
          break
        case 'tap':
          log(s.label)
          if (!await tapAny(id, s.any, s.label, log, s.required !== false) && s.required !== false) throw new Error(s.label)
          break
        case 'type': {
          const t = s.var ? (vars[s.var] || '') : interp(s.text || '', vars)
          if (t.trim()) { log('Écrire le texte'); await typeText(id, t.trim()); await wait(500) }
          break
        }
      }
    }
    log('✅ Terminé')
    return { ok: true }
  } catch (e) {
    return { ok: false, failedAt: (e as Error).message }
  }
}
