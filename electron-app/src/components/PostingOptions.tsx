import type React from 'react'
import { type PostingOpts, type IntervalMode, savePostingOpts } from '@/lib/postingOpts'
import { getProxyRotation } from '@/lib/proxyRotation'
import { ProxyPicker } from '@/components/ProxyPicker'
import { useTr } from '@/lib/i18n'

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

// ── Toggle row v2 : icône + libellé/sous-titre + switch .sf-toggle-track ──────
function ToggleRow({ icon, title, desc, on, onToggle, topBorder = true, badge }: {
  icon: React.ReactNode
  title: React.ReactNode
  desc?: React.ReactNode
  on: boolean
  onToggle: () => void
  topBorder?: boolean
  badge?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3" style={topBorder ? { borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-3)' } : undefined}>
      <span style={{ color: 'var(--text-4)', display: 'inline-flex' }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-medium inline-flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
          {title}
          {badge}
        </span>
        {desc && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)', margin: '2px 0 0' }}>{desc}</p>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={`sf-toggle-track sf-focus-ring ${on ? 'on' : 'off'}`}
      >
        <span className="sf-toggle-thumb" />
      </button>
    </div>
  )
}

export function PostingOptions({ opts, onChange, phonesCount }: Props) {
  const tr = useTr()
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

  const numInputStyle: React.CSSProperties = { height: 32, width: 56, textAlign: 'center' }

  return (
    <div className="sf-card space-y-3" style={{ padding: 'var(--sp-4)' }}>

      {/* Reels Trial toggle */}
      <ToggleRow
        icon={<IconFlask size={14} />}
        title="Reels Trial"
        desc={tr('Montré uniquement aux non-abonnés', 'Shown only to non-followers')}
        on={opts.reelsTrial}
        onToggle={() => set({ reelsTrial: !opts.reelsTrial })}
        topBorder={false}
      />

      {/* ── Usage unique : supprime la vidéo de la banque après publication ──── */}
      <ToggleRow
        icon={<IconTrash size={14} />}
        title={tr('Usage unique', 'Single use')}
        desc={tr('Supprime la vidéo de la banque une fois publiée', 'Removes the video from the bank once posted')}
        on={opts.deleteAfterPost}
        onToggle={() => set({ deleteAfterPost: !opts.deleteAfterPost })}
      />

      {/* ── Intervalle entre posts — masqué en proxy rotatif (inutile : chaque
           téléphone poste déjà sur une IP fraîche) ──────────────────────────── */}
      {!opts.rotatingProxy && (<>
      <ToggleRow
        icon={<IconTimer size={14} />}
        title={tr('Intervalle entre posts', 'Interval between posts')}
        on={on}
        onToggle={() => onChange({ ...opts, intervalMode: on ? 'none' : 'fixed' })}
      />
      {on && (
        <div className="sf-banner is-accent" style={{ marginLeft: 26, fontSize: 11.5, fontWeight: 500 }}>
          <IconTimer size={13} />
          <span>
            {tr(`1er post immédiat, puis +${intervalLabel} min par téléphone`, `First post immediate, then +${intervalLabel} min per phone`)}
            {lastPostEstimate ? tr(` — dernier post vers ~${lastPostEstimate}`, ` — last post around ~${lastPostEstimate}`) : ''}
          </span>
        </div>
      )}
      {on && (
        <div className="flex items-center gap-2 pt-1" style={{ paddingLeft: 26 }}>
          <div className="sf-segment flex-shrink-0">
            {(['fixed', 'random'] as IntervalMode[]).map(m => (
              <button key={m} type="button"
                onClick={() => set({ intervalMode: m })}
                className={`sf-segment-item ${opts.intervalMode === m ? 'is-active' : ''}`}>
                {m === 'fixed' ? tr('Fixe', 'Fixed') : tr('Aléatoire', 'Random')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-1 justify-end">
            {opts.intervalMode === 'fixed' ? (
              <>
                <input type="number" min={1} max={120} value={opts.intervalMin}
                  onChange={e => set({ intervalMin: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="sf-input sf-tabular" style={numInputStyle} />
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>min</span>
              </>
            ) : (
              <>
                <input type="number" min={1} max={120} value={opts.intervalMin}
                  onChange={e => set({ intervalMin: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="sf-input sf-tabular" style={{ ...numInputStyle, width: 48 }} />
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>→</span>
                <input type="number" min={1} max={120} value={opts.intervalMax}
                  onChange={e => set({ intervalMax: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="sf-input sf-tabular" style={{ ...numInputStyle, width: 48 }} />
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>min</span>
              </>
            )}
          </div>
        </div>
      )}
      </>)}

      {/* ── Téléphones simultanés — réglage indépendant (« Tous » par défaut) ── */}
      {!opts.rotatingProxy && (
        <div className="flex items-center gap-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-3)' }}>
          <span style={{ color: 'var(--text-4)', display: 'inline-flex' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="3" width="10" height="14" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h9"/></svg>
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>{tr('Téléphones simultanés', 'Simultaneous phones')}</span>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)', margin: '2px 0 0' }}>{tr('Combien de téléphones postent en même temps · « Tous » par défaut', 'How many phones post at the same time · "All" by default')}</p>
          </div>
          <input type="number" min={0} max={200} value={opts.maxConcurrent || ''}
            placeholder={tr('Tous', 'All')}
            onChange={e => set({ maxConcurrent: Math.max(0, parseInt(e.target.value) || 0) })}
            className="sf-input sf-tabular flex-shrink-0" style={{ height: 32, width: 64, textAlign: 'center' }} />
        </div>
      )}

      {/* ── Proxy rotatif ───────────────────────────────────────────────────── */}
      {(() => {
        const rot = getProxyRotation()
        const configured = rot.enabled && rot.urls.some(u => /^https?:\/\//i.test(u.trim()))
        return (
          <ToggleRow
            icon={<IconNetwork size={14} />}
            title={tr('Proxy rotatif', 'Rotating proxy')}
            desc={tr("Change l'IP avant chaque téléphone", 'Changes the IP before each phone')}
            on={opts.rotatingProxy}
            onToggle={() => set({ rotatingProxy: !opts.rotatingProxy, ...(!opts.rotatingProxy ? { intervalMode: 'none' as IntervalMode } : {}) })}
            badge={configured ? null : (
              <span
                title={tr("Rotation d'IP non configurée — risque de ban. Active-la dans Paramètres → Rotation d'IP proxy.", 'IP rotation not configured — ban risk. Enable it in Settings → Proxy IP rotation.')}
                className="sf-status-dot"
                style={{ color: 'var(--danger)' }}
              />
            )}
          />
        )
      })()}

      {/* Statut rotation d'IP — visible dès que "Proxy rotatif" est coché */}
      {opts.rotatingProxy && (() => {
        const rot = getProxyRotation()
        const active = rot.enabled && rot.urls.some(u => /^https?:\/\//i.test(u.trim()))
        return active ? (
          <div className="sf-banner is-accent" style={{ marginLeft: 26, alignItems: 'flex-start' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            <div>
              <p className="text-[12px] font-semibold" style={{ margin: 0 }}>{tr("Rotation d'IP active", 'IP rotation active')}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)', margin: '2px 0 0', fontWeight: 400 }}>{tr('Une IP fraîche est déclenchée avant chaque post ✓', 'A fresh IP is triggered before each post ✓')}</p>
            </div>
          </div>
        ) : (
          <div className="sf-banner is-danger" style={{ marginLeft: 26, alignItems: 'flex-start' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            <div>
              <p className="text-[12px] font-bold" style={{ margin: 0 }}>{tr("Rotation d'IP non configurée — risque de ban ⚠", 'IP rotation not configured — ban risk ⚠')}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-2)', margin: '3px 0 0', lineHeight: 1.5, fontWeight: 400 }}>
                {tr('Poster plusieurs comptes sur la même IP fait bannir. Active la rotation dans ', 'Posting several accounts on the same IP gets you banned. Enable rotation in ')}<strong style={{ color: 'var(--text-1)' }}>{tr("Paramètres → Connexions → Rotation d'IP proxy", 'Settings → Connections → Proxy IP rotation')}</strong>{tr(" et colle ton lien de changement d'IP.", ' and paste your IP-change link.')}
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
