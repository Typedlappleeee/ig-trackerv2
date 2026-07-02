import { type PostingOpts, type IntervalMode, savePostingOpts } from '@/lib/postingOpts'

interface Props {
  opts: PostingOpts
  onChange: (o: PostingOpts) => void
  /** Nombre de téléphones sélectionnés — permet d'estimer l'heure du dernier post */
  phonesCount?: number
}

// ── SVG icons (no emoji) ───────────────────────────────────────────────────────

function IconTimer({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 2h4" />
      <circle cx="12" cy="14" r="8" />
      <path d="M12 10v4" />
    </svg>
  )
}

function IconFlask({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 2v6.5L3.7 17a2 2 0 0 0 1.7 3h13.2a2 2 0 0 0 1.7-3L15 8.5V2" />
      <path d="M7.5 2h9" />
      <path d="M6.2 14h11.6" />
    </svg>
  )
}

function IconNetwork({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19" />
    </svg>
  )
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function PostingOptions({ opts, onChange, phonesCount }: Props) {
  function set(patch: Partial<PostingOpts>) {
    const next = { ...opts, ...patch }
    // Clamp croisé : en mode aléatoire, min ne doit jamais dépasser max
    if (next.intervalMin > next.intervalMax) {
      if ('intervalMin' in patch) next.intervalMax = next.intervalMin
      else next.intervalMin = next.intervalMax
    }
    onChange(next)
    // Only persist the numeric values + trial toggle, not intervalMode (always starts OFF)
    savePostingOpts({ ...next, intervalMode: 'none' })
  }

  const on = opts.intervalMode !== 'none'

  // Estimation de l'heure du dernier post (1er immédiat, puis +N min par téléphone)
  const intervalLabel = opts.intervalMode === 'random'
    ? `${opts.intervalMin}–${opts.intervalMax}`
    : String(opts.intervalMin)
  let lastPostEstimate: string | null = null
  if (on && phonesCount && phonesCount > 1) {
    const perPhone = opts.intervalMode === 'random'
      ? Math.max(opts.intervalMin, opts.intervalMax)
      : opts.intervalMin
    const last = new Date(Date.now() + (phonesCount - 1) * perPhone * 60_000)
    lastPostEstimate = `${pad2(last.getHours())}:${pad2(last.getMinutes())}`
  }

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Header row with toggle */}
      <div className="flex items-center gap-3">
        <span style={{ color: 'rgba(148,163,184,0.4)', display: 'inline-flex' }}>
          <IconTimer size={14} />
        </span>
        <span className="flex-1 text-[13px] font-medium" style={{ color: 'rgba(226,232,240,0.7)' }}>
          Intervalle entre posts
        </span>
        <button
          onClick={() => onChange({ ...opts, intervalMode: on ? 'none' : 'fixed' })}
          className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
          style={{ background: on ? 'linear-gradient(130deg,#6366F1,#818CF8)' : 'rgba(255,255,255,0.08)' }}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Help line */}
      {on && (
        <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.45)', margin: 0, paddingLeft: 26 }}>
          1er post immédiat, puis +{intervalLabel} min par téléphone
          {lastPostEstimate ? ` — dernier post vers ~${lastPostEstimate}` : ''}
        </p>
      )}

      {/* Reels Trial toggle */}
      <div className="flex items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
        <span style={{ color: 'rgba(148,163,184,0.4)', display: 'inline-flex' }}>
          <IconFlask size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium" style={{ color: 'rgba(226,232,240,0.7)' }}>Reels Trial</span>
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>Montré uniquement aux non-abonnés</p>
        </div>
        <button
          onClick={() => set({ reelsTrial: !opts.reelsTrial })}
          className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
          style={{ background: opts.reelsTrial ? 'linear-gradient(130deg,#6366F1,#818CF8)' : 'rgba(255,255,255,0.08)' }}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${opts.reelsTrial ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* ── Proxy rotatif / concurrence ─────────────────────────────────────── */}
      <div className="flex items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
        <span style={{ color: 'rgba(148,163,184,0.4)', display: 'inline-flex' }}>
          <IconNetwork size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium" style={{ color: 'rgba(226,232,240,0.7)' }}>Proxy rotatif</span>
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>Poste 1 téléphone à la fois (évite les coupures de co)</p>
        </div>
        <button
          onClick={() => set({ rotatingProxy: !opts.rotatingProxy })}
          className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
          style={{ background: opts.rotatingProxy ? 'linear-gradient(130deg,#6366F1,#818CF8)' : 'rgba(255,255,255,0.08)' }}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${opts.rotatingProxy ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Concurrence (masquée si proxy rotatif = 1 forcé) */}
      {!opts.rotatingProxy && (
        <div className="flex items-center gap-2 pl-[26px]">
          <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>Téléphones simultanés</span>
          <input type="number" min={0} max={200} value={opts.maxConcurrent || ''}
            placeholder="Tous"
            onChange={e => set({ maxConcurrent: Math.max(0, parseInt(e.target.value) || 0) })}
            className="w-16 rounded-lg px-2 py-1.5 text-[12px] text-center focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }} />
        </div>
      )}

      {/* Expanded interval controls */}
      {on && (
        <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Mode pill */}
          <div className="flex rounded-lg overflow-hidden flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {(['fixed', 'random'] as IntervalMode[]).map(m => (
              <button key={m}
                onClick={() => set({ intervalMode: m })}
                className="px-2.5 py-1.5 text-[11px] font-semibold transition-all"
                style={opts.intervalMode === m
                  ? { background: 'linear-gradient(130deg,#6366F1,#818CF8)', color: '#fff' }
                  : { color: 'rgba(148,163,184,0.5)' }}>
                {m === 'fixed' ? 'Fixe' : 'Aléatoire'}
              </button>
            ))}
          </div>

          {/* Inputs */}
          <div className="flex items-center gap-1.5 flex-1 justify-end">
            {opts.intervalMode === 'fixed' ? (
              <>
                <input type="number" min={1} max={120} value={opts.intervalMin}
                  onChange={e => set({ intervalMin: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-14 rounded-lg px-2 py-1.5 text-[12px] text-center focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }} />
                <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>min</span>
              </>
            ) : (
              <>
                <input type="number" min={1} max={120} value={opts.intervalMin}
                  onChange={e => set({ intervalMin: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-12 rounded-lg px-1.5 py-1.5 text-[12px] text-center focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }} />
                <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>→</span>
                <input type="number" min={1} max={120} value={opts.intervalMax}
                  onChange={e => set({ intervalMax: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-12 rounded-lg px-1.5 py-1.5 text-[12px] text-center focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }} />
                <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>min</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
