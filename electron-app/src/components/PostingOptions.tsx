import { type PostingOpts, type IntervalMode, savePostingOpts } from '@/lib/postingOpts'

interface Props {
  opts: PostingOpts
  onChange: (o: PostingOpts) => void
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
      style={{ background: on ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.08)' }}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export function PostingOptions({ opts, onChange }: Props) {
  function set(patch: Partial<PostingOpts>) {
    const next = { ...opts, ...patch }
    onChange(next)
    savePostingOpts(next)
  }

  const hasInterval = opts.intervalMode !== 'none'

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[12px] font-bold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.5)' }}>Options de posting</p>
      </div>

      {/* Interval toggle */}
      <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: hasInterval ? '1px solid rgba(255,255,255,0.05)' : undefined }}>
        <span className="text-[15px]">⏱</span>
        <span className="flex-1 text-[13px] text-white">Intervalle entre posts</span>
        <Toggle on={hasInterval} onToggle={() => set({ intervalMode: hasInterval ? 'none' : 'fixed' })} />
      </div>

      {hasInterval && (
        <>
          {/* Fixed / Random mode */}
          <div className="px-5 py-3.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-[11px] text-text2 flex-1">Mode</span>
            <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
              {(['fixed', 'random'] as IntervalMode[]).map(m => (
                <button key={m} onClick={() => set({ intervalMode: m })}
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all"
                  style={opts.intervalMode === m
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                    : { color: 'rgba(148,163,184,0.6)' }}>
                  {m === 'fixed' ? 'Fixe' : 'Aléatoire'}
                </button>
              ))}
            </div>
          </div>

          {/* Interval inputs */}
          {opts.intervalMode === 'fixed' ? (
            <div className="px-5 py-3.5 flex items-center gap-3">
              <span className="text-[13px] text-text2 flex-1">Délai fixe</span>
              <input type="number" min={0} max={120} value={opts.intervalMin}
                onChange={e => set({ intervalMin: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-16 rounded-xl px-3 py-2 text-[13px] text-center focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }} />
              <span className="text-[12px] text-text2">min</span>
            </div>
          ) : (
            <div className="px-5 py-3.5 flex items-center gap-3">
              <span className="text-[13px] text-text2 flex-1">Entre</span>
              <input type="number" min={0} max={120} value={opts.intervalMin}
                onChange={e => set({ intervalMin: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-14 rounded-xl px-2 py-2 text-[13px] text-center focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }} />
              <span className="text-[12px] text-text2">et</span>
              <input type="number" min={0} max={120} value={opts.intervalMax}
                onChange={e => set({ intervalMax: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-14 rounded-xl px-2 py-2 text-[13px] text-center focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }} />
              <span className="text-[12px] text-text2">min</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
