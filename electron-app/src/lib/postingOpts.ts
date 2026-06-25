// Persistent posting options shared between Posting and MassPosting.
// Saved to localStorage so they survive page reloads.

export type IntervalMode = 'none' | 'fixed' | 'random'

export interface PostingOpts {
  intervalMode: IntervalMode
  intervalMin:  number   // minutes
  intervalMax:  number   // minutes (random upper bound)
  reelsTrial:   boolean  // post as Instagram Reels Trial (non-followers only)
}

const KEY = 'sf_posting_opts'

const DEFAULTS: PostingOpts = {
  intervalMode: 'none',
  intervalMin:  1,
  intervalMax:  5,
  reelsTrial:   false,
}

export function loadPostingOpts(): PostingOpts {
  // intervalMode always starts as 'none' (off) — only numeric values are restored
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return {
      ...DEFAULTS,
      intervalMin:  saved.intervalMin  ?? DEFAULTS.intervalMin,
      intervalMax:  saved.intervalMax  ?? DEFAULTS.intervalMax,
      intervalMode: 'none',
    }
  } catch { return { ...DEFAULTS } }
}

export function savePostingOpts(opts: PostingOpts) {
  localStorage.setItem(KEY, JSON.stringify(opts))
}

// Tampon de boot : la tâche RPA ne doit JAMAIS être planifiée à l'instant exact
// où on la crée. Le téléphone vient de booter (~30s) mais Instagram n'est pas
// toujours prêt ; si scheduleAt = maintenant, GeeLark valide la tâche (statut
// « Done ») mais ne poste rien. Un tampon laisse le temps à l'app d'être prête.
const BOOT_BUFFER_SEC = 45

// Returns an array of length `count` with scheduleAt timestamps (Unix seconds).
// Phone[0] posts after a short boot buffer; subsequent phones are staggered.
export function buildScheduleTimes(count: number, opts: PostingOpts): number[] {
  const base = Math.floor(Date.now() / 1000) + BOOT_BUFFER_SEC
  if (opts.intervalMode === 'none' || count <= 1) {
    return Array.from({ length: count }, () => base)
  }
  const times: number[] = [base]
  let t = base
  for (let i = 1; i < count; i++) {
    const delayMin = opts.intervalMode === 'fixed'
      ? opts.intervalMin
      : opts.intervalMin + Math.random() * (Math.max(opts.intervalMin, opts.intervalMax) - opts.intervalMin)
    t += Math.round(delayMin * 60)
    times.push(t)
  }
  return times
}
