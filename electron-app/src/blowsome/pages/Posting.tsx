// Blowsome — page Posting. Reprend les postings EN COURS de ScaleFlow (registre
// global activeRuns, partagé via localStorage) — mêmes runs que le widget flottant.
import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { getActiveRuns, subscribeActiveRuns, type ActiveRun } from '@/lib/activeRuns'
import {
  useBlowCSS, Grad, Ico, ICON, GRAD, GOLD, INK, MUTED, FAINT, HAIR,
  BlowCard, BlowPageHeader, BlowBadge, BlowEmpty,
} from '../ui'

const TYPE_LABEL: Record<ActiveRun['type'], string> = {
  mass: 'Mass posting', story: 'Story', warmup: 'Warmup', threads: 'Threads',
}

function since(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export function BlowPosting({ user: _user }: { user: User }) {
  useBlowCSS()
  const [runs, setRuns] = useState<ActiveRun[]>(() => getActiveRuns())
  // Ticker pour rafraîchir les durées + s'abonner au registre global.
  const [, tick] = useState(0)
  useEffect(() => {
    const unsub = subscribeActiveRuns(() => setRuns(getActiveRuns()))
    const id = window.setInterval(() => { setRuns(getActiveRuns()); tick(t => t + 1) }, 3000)
    return () => { unsub(); window.clearInterval(id) }
  }, [])

  const running = runs.filter(r => r.status === 'running')

  return (
    <div>
      <BlowPageHeader
        title="Posting"
        subtitle="Tes publications en cours — synchronisées en direct avec ScaleFlow"
        action={<BlowBadge tone={running.length ? 'ok' : 'muted'}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor', boxShadow: running.length ? '0 0 8px 1px currentColor' : 'none' }} />
          {running.length ? `${running.length} en cours` : 'Aucun en cours'}
        </BlowBadge>}
      />

      {runs.length === 0 ? (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty
            title="Aucun posting en cours"
            hint="Lance une publication depuis ScaleFlow (Mass Posting, Story, Warmup…) — elle apparaîtra ici en temps réel."
            icon={<Ico d={ICON.send} size={22} />}
          />
        </BlowCard>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {runs.map((r, i) => {
            const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0
            const done = r.status === 'done'
            const err = r.status === 'error'
            const tone = err ? 'muted' : done ? 'ok' : 'accent'
            const statusLabel = err ? 'échec' : done ? 'terminé' : 'en cours'
            return (
              <BlowCard key={r.id} hover style={{ padding: 22, position: 'relative', overflow: 'hidden', animation: `blow-rise .5s cubic-bezier(.16,1,.3,1) ${i * 0.05}s both` }}>
                <div aria-hidden style={{ position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: '50%', background: `radial-gradient(circle, ${err ? 'rgba(248,113,113,0.14)' : 'rgba(236,72,153,0.16)'}, transparent 68%)`, opacity: .7 }} />

                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                      <BlowBadge tone="accent">{TYPE_LABEL[r.type]}</BlowBadge>
                      {!err && !done && <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(168,85,247,0.35)', borderTopColor: '#A855F7', animation: 'blow-spin .8s linear infinite', display: 'inline-block' }} />}
                    </div>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>{r.label}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Ico d={ICON.clock} size={13} /> démarré il y a {since(r.startedAt)}
                    </p>
                  </div>
                  <BlowBadge tone={tone}>{statusLabel}</BlowBadge>
                </div>

                {/* Progression */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>
                      {r.done} / {r.total} comptes
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: done ? GOLD : INK, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.06)', border: `1px solid ${HAIR}`, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: err ? 'linear-gradient(90deg,#F87171,#EF4444)' : GRAD, backgroundSize: '160% auto', boxShadow: '0 0 14px -2px rgba(168,85,247,0.8)', transition: 'width .5s cubic-bezier(.16,1,.3,1)' }} />
                  </div>
                </div>

                {/* Détail par téléphone (si dispo) */}
                {r.phones && r.phones.length > 0 && (
                  <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
                    {r.phones.slice(0, 24).map(p => (
                      <span key={p.id} title={p.name} style={{
                        width: 9, height: 9, borderRadius: 99, flexShrink: 0,
                        background: p.status === 'done' ? '#34D399' : p.status === 'error' ? '#F87171' : p.status === 'running' ? '#A855F7' : 'rgba(255,255,255,0.18)',
                        boxShadow: p.status === 'running' ? '0 0 8px 1px rgba(168,85,247,0.8)' : 'none',
                      }} />
                    ))}
                  </div>
                )}
              </BlowCard>
            )
          })}
        </div>
      )}

      <p style={{ margin: '22px 2px 0', fontSize: 12.5, color: FAINT }}>
        Piloté en direct depuis <Grad style={{ fontWeight: 800 }}>ScaleFlow</Grad> · le suivi survit au rafraîchissement.
      </p>
    </div>
  )
}

export default BlowPosting
