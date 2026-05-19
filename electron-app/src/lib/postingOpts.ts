// Persistent posting options shared between Posting and MassPosting.
// Saved to localStorage so they survive page reloads.

export type IntervalMode = 'none' | 'fixed' | 'random'

export interface PostingOpts {
  intervalMode: IntervalMode
  intervalMin:  number   // minutes
  intervalMax:  number   // minutes (random upper bound)
}

const KEY = 'sf_posting_opts'

const DEFAULTS: PostingOpts = {
  intervalMode: 'none',
  intervalMin:  1,
  intervalMax:  5,
}

export function loadPostingOpts(): PostingOpts {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } }
  catch { return { ...DEFAULTS } }
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
