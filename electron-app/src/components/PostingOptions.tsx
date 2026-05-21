import { type PostingOpts, type IntervalMode, savePostingOpts } from '@/lib/postingOpts'

interface Props {
  opts: PostingOpts
  onChange: (o: PostingOpts) => void
}

export function PostingOptions({ opts, onChange }: Props) {
  function set(patch: Partial<PostingOpts>) {
    const next = { ...opts, ...patch }
    onChange(next)
    // Only persist the numeric values, not the toggle state (always starts OFF)
    savePostingOpts({ ...next, intervalMode: 'none' })
  }

  const on = opts.intervalMode !== 'none'

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Header row with toggle */}
      <div className="flex items-center gap-3">
        <span className="text-[13px]" style={{ color: 'rgba(148,163,184,0.4)' }}>⏱</span>
        <span className="flex-1 text-[13px] font-medium" style={{ color: 'rgba(226,232,240,0.7)' }}>
          Intervalle entre posts
        </span>
        <button
          onClick={() => onChange({ ...opts, intervalMode: on ? 'none' : 'fixed' })}
          className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
          style={{ background: on ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.08)' }}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Expanded controls */}
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
                  ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
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
