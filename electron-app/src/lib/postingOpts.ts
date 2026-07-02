// Persistent posting options shared between Posting and MassPosting.
// Saved to localStorage so they survive page reloads.

export type IntervalMode = 'none' | 'fixed' | 'random'

export interface PostingOpts {
  intervalMode: IntervalMode
  intervalMin:  number   // minutes
  intervalMax:  number   // minutes (random upper bound)
  reelsTrial:   boolean  // post as Instagram Reels Trial (non-followers only)
  alsoStory:    boolean  // publie AUSSI la même vidéo en story sur chaque compte
  // ── Concurrence (proxys rotatifs) ──────────────────────────────────────────
  // Sur proxy rotatif, allumer tous les téléphones d'un coup fait tomber les
  // connexions. On limite alors le nombre de téléphones allumés/postant EN MÊME
  // TEMPS, avec un délai optionnel entre chaque lot.
  rotatingProxy: boolean  // raccourci : force 1 téléphone à la fois
  maxConcurrent: number   // nb de téléphones simultanés (0 = tous d'un coup)
  deleteAfterPost: boolean // usage unique : supprime la vidéo de la banque après publication
}

const KEY = 'sf_posting_opts'

const DEFAULTS: PostingOpts = {
  intervalMode: 'none',
  intervalMin:  1,
  intervalMax:  5,
  reelsTrial:   false,
  alsoStory:    false,
  rotatingProxy: false,
  maxConcurrent: 0,
  deleteAfterPost: false,
}

export function loadPostingOpts(): PostingOpts {
  // intervalMode always starts as 'none' (off) — only numeric values are restored
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return {
      ...DEFAULTS,
      intervalMin:   saved.intervalMin   ?? DEFAULTS.intervalMin,
      intervalMax:   saved.intervalMax   ?? DEFAULTS.intervalMax,
      alsoStory:     saved.alsoStory     ?? DEFAULTS.alsoStory,
      rotatingProxy:   saved.rotatingProxy   ?? DEFAULTS.rotatingProxy,
      maxConcurrent:   saved.maxConcurrent   ?? DEFAULTS.maxConcurrent,
      deleteAfterPost: saved.deleteAfterPost ?? DEFAULTS.deleteAfterPost,
      intervalMode:  'none',
    }
  } catch { return { ...DEFAULTS } }
}

// Nombre de téléphones qui postent réellement en même temps.
// rotatingProxy → 1 ; maxConcurrent 0/≥total → tous d'un coup (comportement legacy).
export function effectiveConcurrency(opts: PostingOpts, total: number): number {
  if (total <= 1) return 1
  if (opts.rotatingProxy) return 1
  if (!opts.maxConcurrent || opts.maxConcurrent <= 0) return total
  return Math.min(opts.maxConcurrent, total)
}

export function savePostingOpts(opts: PostingOpts) {
  localStorage.setItem(KEY, JSON.stringify(opts))
}

// Returns an array of length `count` with scheduleAt timestamps (Unix seconds).
// Phone[0] always posts immediately; subsequent phones are staggered.
export function buildScheduleTimes(count: number, opts: PostingOpts): number[] {
  const now = Math.floor(Date.now() / 1000)
  if (opts.intervalMode === 'none' || count <= 1) {
    return Array.from({ length: count }, () => now)
  }
  const times: number[] = [now]
  let t = now
  for (let i = 1; i < count; i++) {
    const delayMin = opts.intervalMode === 'fixed'
      ? opts.intervalMin
      : opts.intervalMin + Math.random() * (Math.max(opts.intervalMin, opts.intervalMax) - opts.intervalMin)
    t += Math.round(delayMin * 60)
    times.push(t)
  }
  return times
}
