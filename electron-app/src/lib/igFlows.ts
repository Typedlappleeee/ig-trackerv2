// Flows d'automatisation Instagram (approche UI, façon GeeLark) construits sur le
// moteur `phoneAutomation` : on vise les éléments par leur sens (texte/id/desc),
// on attend chaque écran, on ferme les popups, on réessaie. Chaque étape est
// journalisée ; si une étape échoue, le flow s'arrête proprement en indiquant OÙ
// (on peut alors capturer l'écran et corriger le sélecteur).
//
// ⚠️ Bêta : les sélecteurs IG varient selon la version/langue de l'app. On les
// affine à partir des vrais dumps d'écran (bouton « Dump UI »). Les matchers
// ci-dessous ont plusieurs fallbacks pour maximiser les chances du 1er coup.
import { cloudPhones } from './cloudPhones'
import { dumpUi, tap, typeText, openApp, dismissPopups, keys, type Matcher } from './phoneAutomation'

const IG = 'com.instagram.android'
export type Logger = (msg: string) => void
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface FlowResult { ok: boolean; failedAt?: string }

// Essaie plusieurs sélecteurs pour une même étape (fallbacks FR/EN/id).
async function tapAny(id: string, matchers: Matcher[], label: string, log: Logger, required = true): Promise<boolean> {
  for (const m of matchers) {
    if (await tap(id, m, { timeoutMs: 6000, retries: 1 })) { log(`  ✓ ${label}`); return true }
  }
  log(`  ${required ? '✗' : '·'} ${label}${required ? ' introuvable' : ' (sauté)'}`)
  return false
}

// Sélectionne la 1re vignette de la galerie (pas de coordonnée en dur : on vise
// une vraie vignette dans l'arbre UI).
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

// Poste un Reel avec la 1re vidéo de la galerie (celle qu'on vient d'uploader) +
// une légende optionnelle.
export async function postReel(id: string, opts: { caption?: string; log?: Logger }): Promise<FlowResult> {
  const log = opts.log ?? (() => {})
  try {
    log('Ouverture d’Instagram…'); await openApp(id, IG); await wait(4500); await dismissPopups(id)

    log('Ouvrir « Créer »')
    if (!await tapAny(id, [{ id: 'creation_tab' }, { desc: 'Créer' }, { desc: 'Create' }, { contains: 'Nouvelle publication' }], 'Créer', log)) throw new Error('bouton « Créer »')
    await wait(1500); await dismissPopups(id)

    log('Choisir « Reel »')
    await tapAny(id, [{ text: 'REEL' }, { contains: 'Reel' }], 'Reel', log, false) // parfois déjà sélectionné → non bloquant
    await wait(1500); await dismissPopups(id)

    log('Sélectionner la 1re vidéo')
    if (!await pickFirstMedia(id, log)) throw new Error('sélection de la vidéo')
    await wait(1500); await dismissPopups(id)

    log('Écran suivant')
    if (!await tapAny(id, [{ id: 'creation_next_button' }, { id: 'next_button_textview' }, { text: 'Suivant' }, { text: 'Next' }], 'Suivant', log)) throw new Error('bouton « Suivant » (1)')
    await wait(2200); await dismissPopups(id)

    // Écran d'édition/filtres → souvent un 2e « Suivant » (non bloquant).
    await tapAny(id, [{ id: 'creation_next_button' }, { text: 'Suivant' }, { text: 'Next' }], 'Suivant (2)', log, false)
    await wait(2200); await dismissPopups(id)

    if (opts.caption?.trim()) {
      log('Écrire la légende')
      if (await tapAny(id, [{ id: 'caption_input_text_view' }, { contains: 'Ajouter une légende' }, { contains: 'légende' }, { contains: 'caption' }], 'champ légende', log, false)) {
        await wait(800); await typeText(id, opts.caption.trim()); await wait(600); await keys.back(id) // referme le clavier
      }
    }

    await wait(800)
    log('Partager')
    if (!await tapAny(id, [{ id: 'share_footer_button' }, { id: 'share_button' }, { text: 'Partager' }, { text: 'Share' }], 'Partager', log)) throw new Error('bouton « Partager »')

    log('✓ Reel envoyé — vérifie sur le profil dans ~1 min')
    return { ok: true }
  } catch (e) {
    return { ok: false, failedAt: (e as Error).message }
  }
}
