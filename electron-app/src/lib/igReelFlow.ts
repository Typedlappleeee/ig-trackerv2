// Flow « Poster un Reel Instagram » codé en dur, pour les iPhones iRemoTech.
//
// Les points de tap sont exprimés en FRACTIONS de l'écran (0→1), pas en pixels :
// ça s'adapte à tous les modèles d'iPhone. Ils sont AJUSTABLES depuis l'UI
// (localStorage) parce que l'interface d'Instagram bouge — pas besoin de
// redéployer pour recaler un bouton.
import { iremotech, type IrtAction } from './iremotech'

export interface FlowPoint { x: number; y: number }   // fractions 0→1
export interface IgReelCoords {
  plus: FlowPoint        // bouton "+" (créer)
  reel: FlowPoint        // onglet/entrée "Reel"
  firstMedia: FlowPoint  // 1re vignette de la galerie (la vidéo qu'on vient d'envoyer)
  next1: FlowPoint       // "Suivant" après sélection
  next2: FlowPoint       // "Suivant" après édition
  caption: FlowPoint     // champ description
  share: FlowPoint       // "Partager"
}

// Valeurs de départ (à recaler ensemble via l'UI si un bouton tombe à côté).
export const DEFAULT_IG_COORDS: IgReelCoords = {
  plus:       { x: 0.50, y: 0.955 },
  reel:       { x: 0.32, y: 0.93 },
  firstMedia: { x: 0.17, y: 0.42 },
  next1:      { x: 0.92, y: 0.075 },
  next2:      { x: 0.92, y: 0.075 },
  caption:    { x: 0.45, y: 0.22 },
  share:      { x: 0.50, y: 0.92 },
}

const LS = 'sf-ig-reel-coords'
export function getIgCoords(): IgReelCoords {
  try { const r = localStorage.getItem(LS); if (r) return { ...DEFAULT_IG_COORDS, ...JSON.parse(r) } } catch { /* noop */ }
  return DEFAULT_IG_COORDS
}
export function setIgCoords(c: IgReelCoords) {
  try { localStorage.setItem(LS, JSON.stringify(c)) } catch { /* noop */ }
}
export function resetIgCoords() { try { localStorage.removeItem(LS) } catch { /* noop */ } }

// Libellés lisibles pour l'écran de réglage.
export const IG_COORD_LABELS: Record<keyof IgReelCoords, string> = {
  plus: 'Bouton +', reel: 'Onglet Reel', firstMedia: '1re vidéo (galerie)',
  next1: 'Suivant (1)', next2: 'Suivant (2)', caption: 'Champ description', share: 'Partager',
}

export interface FlowHooks {
  onStep?: (label: string, i: number, total: number) => void
  shouldStop?: () => boolean
}

// Poste un Reel sur UN téléphone. `screen` = taille réelle de l'écran en pixels
// (lue sur la dernière capture) pour convertir les fractions en coordonnées.
// `entry` : point d'entrée dans Instagram.
//   'camera' → deep link instagram://camera : ouvre DIRECTEMENT l'écran de
//              création (on saute le tap sur le « + », l'étape la plus fragile).
//   'app'    → ouvre l'app puis tape le « + » (repli si le deep link ne marche pas).
export type IgEntry = 'camera' | 'app'

export async function postIgReel(
  deviceId: string,
  opts: { videoUrl: string; videoName?: string; caption: string; screen: { w: number; h: number }; coords?: IgReelCoords; entry?: IgEntry; waits?: Partial<Record<string, number>> },
  hooks?: FlowHooks,
): Promise<{ ok: boolean; error?: string }> {
  const c = opts.coords ?? getIgCoords()
  const S = opts.screen
  const pt = (p: FlowPoint): IrtAction => ({ type: 'tap', x: Math.round(p.x * S.w), y: Math.round(p.y * S.h) })
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
  const stopped = () => hooks?.shouldStop?.() === true

  const entry: IgEntry = opts.entry ?? 'camera'

  // Chaque étape : libellé, action, puis attente que l'écran suivant charge.
  const steps: { label: string; run: () => Promise<unknown>; wait: number }[] = [
    { label: 'Envoi de la vidéo', run: () => iremotech.uploadMedia(deviceId, opts.videoUrl, opts.videoName || 'video.mp4'), wait: 6000 },
    // Deep link direct vers l'écran de création → évite le tap sur le « + ».
    ...(entry === 'camera'
      ? [{ label: 'Ouvre la création IG', run: () => iremotech.action(deviceId, { type: 'open_url' as const, url: 'instagram://camera' }), wait: 6000 }]
      : [
          { label: 'Ouvre Instagram', run: () => iremotech.action(deviceId, { type: 'open_url' as const, url: 'instagram://app' }), wait: 5000 },
          { label: 'Bouton +',        run: () => iremotech.action(deviceId, pt(c.plus)), wait: 2500 },
        ]),
    { label: 'Onglet Reel',       run: () => iremotech.action(deviceId, pt(c.reel)), wait: 3000 },
    { label: 'Choisit la vidéo',  run: () => iremotech.action(deviceId, pt(c.firstMedia)), wait: 3000 },
    { label: 'Suivant',           run: () => iremotech.action(deviceId, pt(c.next1)), wait: 4000 },
    { label: 'Suivant',           run: () => iremotech.action(deviceId, pt(c.next2)), wait: 4000 },
    { label: 'Champ description', run: () => iremotech.action(deviceId, pt(c.caption)), wait: 2000 },
    { label: 'Écrit la description', run: () => iremotech.action(deviceId, { type: 'text', text: opts.caption }), wait: 1500 },
    { label: 'Publie',            run: () => iremotech.action(deviceId, pt(c.share)), wait: 2000 },
  ]

  for (let i = 0; i < steps.length; i++) {
    if (stopped()) return { ok: false, error: 'arrêté' }
    const s = steps[i]
    hooks?.onStep?.(s.label, i, steps.length)
    try { await s.run() } catch (e) { return { ok: false, error: `${s.label}: ${e instanceof Error ? e.message : String(e)}` } }
    await sleep(opts.waits?.[s.label] ?? s.wait)
  }
  return { ok: true }
}
