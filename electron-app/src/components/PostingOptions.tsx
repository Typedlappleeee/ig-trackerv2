import { type PostingOpts, savePostingOpts } from '@/lib/postingOpts'

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

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Reels Trial toggle */}
      <div className="flex items-center gap-3">
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

    </div>
  )
}
