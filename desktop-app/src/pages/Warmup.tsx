import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Empty, StatusDot, Panel, PanelHead, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { scopeInfra } from '@/lib/data'
import { useConnections } from '@/lib/connections'
import { warmupAccountNative } from '@/lib/geelark'

interface Phone { id: string; ig_username: string | null; status: string; geelark_id: string | null }
function dotKind(status: string): string { return status === 'warming' ? 'warmup' : status }

type RunPhase = 'pending' | 'running' | 'done' | 'failed'
interface RunItem { id: string; name: string; phase: RunPhase; detail?: string }
type WTab = 'login' | 'edit' | 'warm'

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
  const conns = useConnections(user, org)
  const bearer = conns.bearer
  const [phones, setPhones] = useState<Phone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [dur, setDur] = useState(30)
  const [acts, setActs] = useState<Set<string>>(new Set(['like', 'reels', 'follow']))

  // État d'exécution réelle du warmup (GeeLark).
  const [running, setRunning] = useState(false)
  const [runItems, setRunItems] = useState<RunItem[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [wtab, setWtab] = useState<WTab>('warm')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let q = supabase.from('phones').select('id,ig_username,status,geelark_id')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q = scopeInfra(q, infra)
    const { data, error: err } = await q
    if (err) { setError('Impossible de charger les téléphones.'); setLoading(false); return }
    setPhones((data ?? []) as Phone[])
    setLoading(false)
  }, [currentOrg?.id, user.id, infra])

  useEffect(() => { load() }, [load])

  // Lancement RÉEL : warmup natif GeeLark, un téléphone après l'autre (les tâches
  // durent longtemps ; le séquentiel évite de saturer le démon shell).
  async function launch() {
    const targets = phones.filter(p => sel.has(p.id) && p.geelark_id)
    if (targets.length === 0 || !bearer || running) return
    setRunning(true)
    setLogs([])
    setRunItems(targets.map(p => ({ id: p.id, name: p.ig_username ?? p.geelark_id ?? p.id, phase: 'pending' as RunPhase })))
    // Nb de vidéos parcourues dérivé de la durée (≈2/min, plafonné à 100).
    const browseVideo = Math.max(1, Math.min(100, Math.round(dur * 2)))
    const pushLog = (m: string) => setLogs(l => [...l.slice(-200), m])

    for (const p of targets) {
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'running' } : it))
      pushLog(`— @${p.ig_username ?? p.geelark_id} —`)
      const r = await warmupAccountNative(bearer, p.geelark_id!, { browseVideo }, pushLog)
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.error } : it))
    }
    pushLog('✔ Warmup terminé.')
    setRunning(false)
  }

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAct = (k: string) => setActs(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const nSel = sel.size
  const durLabel = dur < 60 ? `${dur} min` : `${dur / 60} h`

  const TABS: [WTab, string][] = [['login', 'Connexion'], ['edit', 'Édition en masse'], ['warm', 'Warmup']]
  const subFor: Record<WTab, string> = {
    login: 'Connecte automatiquement tes comptes Instagram sur les appareils (auto-login).',
    edit: 'Édite en masse le profil de tes comptes (nom, bio, lien, photo).',
    warm: "Chauffe tes comptes par sessions de durée fixe. Les appareils s'éteignent à la fin.",
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Automatisations comptes"
        sub={subFor[wtab]}
        actions={wtab === 'warm' ? <Chip text={`${nSel} sélectionnés`} tone="mute" /> : undefined}
      />

      {/* Onglets Connexion / Édition en masse / Warmup */}
      <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, marginBottom: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setWtab(k)} style={{
            height: 28, padding: '0 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
            background: wtab === k ? `rgba(${theme.tone},0.16)` : 'transparent',
            color: wtab === k ? theme.accentText : '#71717A', fontSize: 12, fontWeight: 700, transition: 'all .14s ease',
          }}>{l}</button>
        ))}
      </div>

      {wtab !== 'warm' ? (
        <Panel theme={theme}>
          <Empty
            icon={wtab === 'login' ? 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4|M10 17l5-5-5-5|M15 12H3' : 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z'}
            title={wtab === 'login' ? 'Connexion automatique' : 'Édition de profil en masse'}
            text={wtab === 'login'
              ? "L'auto-login connecte tes comptes IG sur les appareils via le flow RPA GeeLark. Le câblage arrive à la prochaine passe (il réutilise geelarkLoginFlow)."
              : "L'édition en masse met à jour nom, bio, lien et photo de profil sur les comptes sélectionnés (RPA instagramEdit). Câblage à la prochaine passe."}
          />
        </Panel>
      ) : (
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
                {!bearer && !conns.loading ? (
                  <span style={{ color: '#FBBF24' }}>Connecte d'abord ton compte GeeLark (token) dans les Réglages de l'app web, puis reviens ici.</span>
                ) : (
                  <>Session de <span style={{ color: '#FBBF24', fontWeight: 700 }}>{durLabel}</span> sur <span style={{ color: '#E4E4E7', fontWeight: 700 }}>{nSel}</span> téléphone{nSel > 1 ? 's' : ''}. Les appareils s'éteignent à la fin.</>
                )}
              </span>
              <Btn theme={theme} tone="primary" disabled={nSel === 0 || !bearer || running}
                icon="M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z"
                label={running ? 'Warmup en cours…' : nSel === 0 ? 'Sélectionne des comptes' : 'Lancer le warmup'}
                onClick={launch} />
            </div>

            {/* Progression + logs en direct */}
            {runItems.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '11px 15px' }}>
                  {runItems.map(it => {
                    const c = it.phase === 'done' ? 'ok' : it.phase === 'failed' ? 'bad' : it.phase === 'running' ? 'warn' : 'mute'
                    const label = it.phase === 'done' ? '✓' : it.phase === 'failed' ? '✕' : it.phase === 'running' ? '…' : '·'
                    return <Chip key={it.id} text={`${label} @${it.name}`} tone={c as any} />
                  })}
                </div>
                <div style={{
                  margin: '0 15px 13px', padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.28)',
                  border: '1px solid rgba(255,255,255,0.05)', maxHeight: 220, overflowY: 'auto',
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap',
                }}>
                  {logs.length === 0 ? '…' : logs.join('\n')}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
      )}
    </div>
  )
}
