// Banque rangée par MODÈLE : chaque modèle = un dossier principal marqué « model » (tag sur sa ligne sentinelle,
// partagé par l'équipe, aucun SQL), avec les mêmes rubriques (Reels / Feed / Stories / Genjutsu) ; l'espace « Commun »
// sert au contenu réutilisable par toutes les modèles. Les copies spoofées (« kenz 122 · v1 · copie 3 ») sont
// EMPILÉES sous leur original ; les médias déjà publiés peuvent être masqués. Fonctions pures + tests (bankSpaces.test).
// (copie locale des helpers de chemin : bankFolders importe Supabase, inutile ici et bloquant pour les tests)
const segs = (p: string) => p.split('/').map(x => x.trim()).filter(Boolean)
const leafOf = (p: string) => { const s = segs(p); return s[s.length - 1] ?? p }
const isWithin = (p: string, root: string) => { const n = segs(p).join('/'); return n === root || n.startsWith(`${root}/`) }

export const MODEL_TAG = 'model'
export const COMMON_SPACE = 'Commun'
export const MODEL_SUBS = ['Reels', 'Feed', 'Stories', 'Genjutsu'] as const

/** Titre d'origine d'une copie : avant le 1er « · » (« kenz 122 · v1 · copie 3 » → « kenz 122 »). Pure. */
export const baseTitle = (t: string | null | undefined) => (t ?? '').split(' · ')[0].trim().toLowerCase()

/** Empile les copies sous l'original (même dossier, même titre d'origine). L'original (titre exact) représente la
 *  pile, sinon le plus ancien… ici le 1er de la liste (ordre déjà trié). `open` = piles dépliées (clé de pile).
 *  Renvoie la liste à afficher et, pour chaque représentant, la taille de sa pile. Pure. */
export function stackCopies<T extends { id: string; title: string | null; folder: string | null }>(list: T[], open: Set<string>): { list: T[]; size: Map<string, number>; keyOf: Map<string, string> } {
  const groups = new Map<string, T[]>()
  for (const i of list) {
    const k = `${i.folder ?? ''}|${baseTitle(i.title)}`
    const g = groups.get(k); if (g) g.push(i); else groups.set(k, [i])
  }
  const out: T[] = [], size = new Map<string, number>(), keyOf = new Map<string, string>()
  const done = new Set<string>()
  for (const i of list) {
    const k = `${i.folder ?? ''}|${baseTitle(i.title)}`
    if (done.has(k)) continue
    const g = groups.get(k)!
    if (g.length === 1 || !baseTitle(i.title) || open.has(k)) {
      done.add(k)
      for (const x of g) { out.push(x); keyOf.set(x.id, k) }
      if (g.length > 1) size.set(g[0].id, g.length)
      continue
    }
    done.add(k)
    const rep = g.find(x => (x.title ?? '').trim().toLowerCase() === baseTitle(x.title)) ?? g[0]
    out.push(rep); size.set(rep.id, g.length); keyOf.set(rep.id, k)
  }
  return { list: out, size, keyOf }
}

/** Proposition de rangement : chaque dossier principal (hors modèles / Commun) dont le nom commence comme une modèle
 *  (4 premières lettres : « kenz 122 » → Kenza) va dans `<Modèle>/Reels` (surtout des vidéos) ou `<Modèle>/Feed`
 *  (surtout des photos). Un dossier qui ressemble à plusieurs modèles n'est pas proposé. Pure. */
export function proposeModelMoves(topFolders: string[], models: string[], videoShare: (f: string) => number): { src: string; model: string; dest: string }[] {
  const out: { src: string; model: string; dest: string }[] = []
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  for (const f of topFolders) {
    if (segs(f).length !== 1 || models.some(m => isWithin(f, m)) || f === COMMON_SPACE) continue
    const n = norm(leafOf(f))
    const hits = models.filter(m => { const p = norm(m).slice(0, 4); return p.length >= 3 && n.startsWith(p) })
    if (hits.length !== 1) continue
    out.push({ src: f, model: hits[0], dest: `${hits[0]}/${videoShare(f) >= 0.5 ? 'Reels' : 'Feed'}` })
  }
  return out
}

// ── Template de dossiers (modifiable, partagé) et marchés des modèles ──────────────────────────────────────
export type ModelMarket = 'fr' | 'us' | 'de'
export const MODEL_MARKETS: { k: ModelMarket; label: string }[] = [{ k: 'fr', label: '🇫🇷 France' }, { k: 'us', label: '🇺🇸 USA' }, { k: 'de', label: '🇩🇪 Allemagne' }]
export const marketTag = (m: ModelMarket) => `market:${m}`
/** Marchés d'une modèle d'après les tags de sa ligne sentinelle. Pure. */
export const marketsOfTags = (tags: string[] | null | undefined): ModelMarket[] =>
  MODEL_MARKETS.map(m => m.k).filter(k => (tags ?? []).includes(marketTag(k)))
/** Texte du template (un chemin par ligne, « Reels/Originaux ») → chemins propres, sans doublon, parents inclus. Pure. */
export function parseTemplate(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const p = line.split('/').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join('/')
    if (p && !out.includes(p)) out.push(p)
  }
  return out.slice(0, 60)
}
/** Dossiers à créer pour une modèle (template vide → rubriques par défaut). Pure. */
export const templatePaths = (model: string, tpl: string[]) => (tpl.length ? tpl : [...MODEL_SUBS]).map(p => `${model}/${p}`)
/** Modèles regroupées par marché pour le menu déroulant (une modèle sur 2 marchés apparaît dans les 2) ; « Commun » à part. Pure. */
export function groupModelsByMarket(models: string[], marketsOf: (m: string) => ModelMarket[]): { label: string; models: string[] }[] {
  const real = models.filter(m => m !== COMMON_SPACE)
  const groups = MODEL_MARKETS.map(mk => ({ label: mk.label, models: real.filter(m => marketsOf(m).includes(mk.k)) }))
  const none = real.filter(m => !marketsOf(m).length)
  return [...groups, { label: 'Sans marché', models: none }].filter(g => g.models.length)
}

// ── Sélecteur de destination des outils : Banque principale puis chaque modèle ──
const inRoot = (p: string, root: string) => p === root || p.startsWith(`${root}/`)
/** Groupes pour le sélecteur « Enregistrer dans ». Pure. */
export function groupFolders(folders: string[], models: string[]): { label: string; paths: string[] }[] {
  const main = folders.filter(f => !models.some(m => inRoot(f, m)))
  const out = [{ label: 'Banque principale', paths: main }]
  for (const m of models) out.push({ label: `👤 ${m}`, paths: [m, ...folders.filter(f => f !== m && inRoot(f, m))] })
  return out.filter(g => g.paths.length)
}

