import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, StatusDot, Panel, PanelHead, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'

interface Phone { id: string; ig_username: string | null; status: string }
function dotKind(status: string): string { return status === 'warming' ? 'warmup' : status }

const DURATIONS: { v: number; h: string }[] = [
  { v: 15, h: 'échauffement' }, { v: 30, h: 'recommandé' }, { v: 60, h: 'session longue' }, { v: 120, h: 'compte mûr' },
]
const ACTIONS: { k: string; l: string; h: string; rate: number }[] = [
  { k: 'like', l: 'Liker des posts', h: 'espacé sur toute la session', rate: 80 },
  { k: 'reels', l: 'Regarder des Reels', h: 'défilement du feed', rate: 120 },
  { k: 'follow', l: 'Suivre les suggestions', h: 'comptes proposés par Instagram', rate: 50 },
]

export default function Warmup({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const { currentOrg } = org
  const [phones, setPhones] = useState<Phone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [dur, setDur] = useState(30)
  const [acts, setActs] = useState<Set<string>>(new Set(['like', 'reels', 'follow']))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let q = supabase.from('phones').select('id,ig_username,status')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data, error: err } = await q
    if (err) { setError('Impossible de charger les téléphones.'); setLoading(false); return }
    setPhones((data ?? []) as Phone[])
    setLoading(false)
  }, [currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAct = (k: string) => setActs(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const nSel = sel.size
  const durLabel = dur < 60 ? `${dur} min` : `${dur / 60} h`

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Warmup"
        sub="Chauffe tes comptes par sessions de durée fixe. Les appareils s'éteignent à la fin — pas besoin de les laisser tourner."
        actions={<Chip text={`${nSel} sélectionnés`} tone="mute" />}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
        {/* Téléphones */}
        <Panel theme={theme}>
          <PanelHead title="Téléphones" right={<Btn theme={theme} sm tone="quiet" label="Tout" onClick={() => setSel(new Set(phones.map(p => p.id)))} />} />
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div>
          ) : error ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#F87171', fontSize: 12 }}>{error}</div>
          ) : phones.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucun téléphone.</div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {phones.map(p => {
                const on = sel.has(p.id)
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 13px', border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderLeft: '2px solid ' + (on ? '#F59E0B' : 'transparent'),
                    background: on ? 'rgba(245,158,11,0.06)' : 'transparent', transition: 'all .14s ease', boxSizing: 'border-box',
                  }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      background: on ? '#D97706' : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 8.5, fontWeight: 900,
                    }}>{on ? '✓' : ''}</span>
                    <StatusDot kind={dotKind(p.status)} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: on ? '#F4F4F6' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.ig_username ?? '—'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Durée */}
          <Panel theme={theme}>
            <PanelHead title="Durée de la session" sub="Le téléphone démarre, navigue, puis s'éteint" />
            <div style={{ display: 'flex', gap: 8, padding: 13, flexWrap: 'wrap' }}>
              {DURATIONS.map(d => {
                const act = dur === d.v
                return (
                  <button key={d.v} onClick={() => setDur(d.v)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '11px 20px', borderRadius: 9, cursor: 'pointer',
                    background: act ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.015)',
                    border: '1px solid ' + (act ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.06)'), transition: 'all .14s ease',
                  }}>
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, color: act ? '#FBBF24' : '#D4D4D8', letterSpacing: '-0.02em' }}>{d.v < 60 ? `${d.v} min` : `${d.v / 60} h`}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#52525B' }}>{d.h}</span>
                  </button>
                )
              })}
            </div>
          </Panel>

          {/* Actions */}
          <Panel theme={theme}>
            <PanelHead title="Actions pendant la session" sub="Rythme humain, réparti sur la durée" />
            {ACTIONS.map((a, i) => {
              const act = acts.has(a.k)
              const total = Math.round(a.rate * (dur / 60))
              return (
                <div key={a.k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 15px', borderBottom: i < ACTIONS.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none' }}>
                  <span onClick={() => toggleAct(a.k)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: act ? 'flex-end' : 'flex-start', width: 32, height: 18, padding: 2, borderRadius: 99, flexShrink: 0,
                    background: act ? '#D97706' : 'rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'background .2s ease',
                  }}><span style={{ width: 14, height: 14, borderRadius: 99, background: '#fff' }} /></span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: act ? '#F4F4F6' : '#71717A' }}>{a.l}</span>
                    <span style={{ fontSize: 11, color: '#52525B' }}>{a.h}</span>
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 700, color: act ? '#FBBF24' : '#3F3F46', minWidth: 96, textAlign: 'right' }}>{act ? `≈ ${total} au total` : 'désactivé'}</span>
                </div>
              )
            })}
          </Panel>

          {/* Lancement */}
          <Panel theme={theme}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 15px', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 200, fontSize: 12, lineHeight: 1.6, color: '#71717A' }}>
                Session de <span style={{ color: '#FBBF24', fontWeight: 700 }}>{durLabel}</span> sur <span style={{ color: '#E4E4E7', fontWeight: 700 }}>{nSel}</span> téléphone{nSel > 1 ? 's' : ''}. Les appareils s'éteignent à la fin.
              </span>
              <Btn theme={theme} tone="primary" disabled={nSel === 0} icon="M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z" label={nSel === 0 ? 'Sélectionne des comptes' : 'Lancer le warmup'} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
