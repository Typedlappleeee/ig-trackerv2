import { type PostingOpts, type IntervalMode, savePostingOpts } from '@/lib/postingOpts'
import { getProxyRotation } from '@/lib/proxyRotation'
import { ProxyPicker } from '@/components/ProxyPicker'

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

function IconTrash({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
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

      {/* ── Usage unique : supprime la vidéo de la banque après publication ──── */}
      <div className="flex items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
        <span style={{ color: 'rgba(148,163,184,0.4)', display: 'inline-flex' }}>
          <IconTrash size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium" style={{ color: 'rgba(226,232,240,0.7)' }}>Usage unique</span>
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>Supprime la vidéo de la banque une fois publiée</p>
        </div>
        <button
          onClick={() => set({ deleteAfterPost: !opts.deleteAfterPost })}
          className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
          style={{ background: opts.deleteAfterPost ? 'linear-gradient(130deg,#6366F1,#818CF8)' : 'rgba(255,255,255,0.08)' }}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${opts.deleteAfterPost ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* ── Intervalle entre posts — masqué en proxy rotatif (inutile : chaque
           téléphone poste déjà sur une IP fraîche) ──────────────────────────── */}
      {!opts.rotatingProxy && (<>
      <div className="flex items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
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
      {on && (
        <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.45)', margin: 0, paddingLeft: 26 }}>
          1er post immédiat, puis +{intervalLabel} min par téléphone
          {lastPostEstimate ? ` — dernier post vers ~${lastPostEstimate}` : ''}
        </p>
      )}
      {on && (
        <div className="flex items-center gap-2 pt-1">
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
      </>)}

      {/* ── Téléphones simultanés — réglage indépendant (« Tous » par défaut) ── */}
      {!opts.rotatingProxy && (
        <div className="flex items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
          <span style={{ color: 'rgba(148,163,184,0.4)', display: 'inline-flex' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="3" width="10" height="14" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h9"/></svg>
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-[13px] font-medium" style={{ color: 'rgba(226,232,240,0.7)' }}>Téléphones simultanés</span>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>Combien de téléphones postent en même temps · « Tous » par défaut</p>
          </div>
          <input type="number" min={0} max={200} value={opts.maxConcurrent || ''}
            placeholder="Tous"
            onChange={e => set({ maxConcurrent: Math.max(0, parseInt(e.target.value) || 0) })}
            className="w-16 rounded-lg px-2 py-1.5 text-[12px] text-center focus:outline-none flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }} />
        </div>
      )}

      {/* ── Proxy rotatif ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
        <span style={{ color: 'rgba(148,163,184,0.4)', display: 'inline-flex' }}>
          <IconNetwork size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium inline-flex items-center gap-1.5" style={{ color: 'rgba(226,232,240,0.7)' }}>
            Proxy rotatif
            {(() => {
              const rot = getProxyRotation()
              const configured = rot.enabled && rot.urls.some(u => /^https?:\/\//i.test(u.trim()))
              return configured ? null : (
                <span title="Rotation d'IP non configurée — risque de ban. Active-la dans Paramètres → Rotation d'IP proxy." style={{ width: 7, height: 7, borderRadius: '50%', background: '#F87171', boxShadow: '0 0 6px rgba(248,113,113,0.9)', flexShrink: 0, animation: 'pulse 1.6s ease-in-out infinite' }} />
              )
            })()}
          </span>
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>Change l'IP avant chaque téléphone</p>
        </div>
        <button
          onClick={() => set({ rotatingProxy: !opts.rotatingProxy, ...(!opts.rotatingProxy ? { intervalMode: 'none' as IntervalMode } : {}) })}
          className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
          style={{ background: opts.rotatingProxy ? 'linear-gradient(130deg,#6366F1,#818CF8)' : 'rgba(255,255,255,0.08)' }}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${opts.rotatingProxy ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Statut rotation d'IP — visible dès que "Proxy rotatif" est coché */}
      {opts.rotatingProxy && (() => {
        const rot = getProxyRotation()
        const active = rot.enabled && rot.urls.some(u => /^https?:\/\//i.test(u.trim()))
        return active ? (
          <div className="flex items-start gap-2.5 pl-[26px]" style={{
            padding: '9px 12px', borderRadius: 10, marginLeft: 26,
            background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.28)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            <div>
              <p className="text-[12px] font-semibold" style={{ color: '#34D399', margin: 0 }}>Rotation d'IP active</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.65)', margin: '2px 0 0' }}>Une IP fraîche est déclenchée avant chaque post ✓</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5" style={{
            padding: '10px 12px', borderRadius: 10, marginLeft: 26,
            background: 'rgba(248,113,113,0.09)', border: '1px solid rgba(248,113,113,0.35)',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            <div>
              <p className="text-[12px] font-bold" style={{ color: '#F87171', margin: 0 }}>Rotation d'IP non configurée — risque de ban ⚠</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(226,232,240,0.7)', margin: '3px 0 0', lineHeight: 1.5 }}>
                Poster plusieurs comptes sur la même IP fait bannir. Active la rotation dans <strong style={{ color: '#fff' }}>Paramètres → Connexions → Rotation d'IP proxy</strong> et colle ton lien de changement d'IP.
              </p>
            </div>
          </div>
        )
      })()}

      {/* Sélecteur de proxys — sur quel(s) proxy sont les téléphones de ce post.
          Ne s'affiche que s'il y a ≥2 proxys configurés (sinon rien à choisir). */}
      {opts.rotatingProxy && (
        <ProxyPicker selected={opts.rotateProxyUrls} onChange={urls => set({ rotateProxyUrls: urls })} />
      )}


    </div>
  )
}
