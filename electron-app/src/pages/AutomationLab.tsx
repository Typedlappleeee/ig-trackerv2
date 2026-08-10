// Admin — Automatisation (UI façon GeeLark). Réservé au super-admin.
//   • Onglet « Lancer » : choisir PLUSIEURS téléphones, une automatisation
//     (officielle / communauté / la mienne), remplir les paramètres, lancer en
//     parallèle avec un journal par téléphone.
//   • Onglet « Créer » : le Workshop (sélecteur visuel, recorder intelligent).
//
// Catégories d'automatisations :
//   ⭐ Officielles (maintenues par ScaleFlow)
//   🌍 Communauté (partagées par des utilisateurs) — à venir via Supabase
//   👤 Mes automatisations (créées dans le workshop)
import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useOrg } from '@/lib/orgContext'
import { cloudPhones, loadCloudAgentConfig, getCloudAgent, uploadVideoFile, type CpInstance } from '@/lib/cloudPhones'
import { runFlow, type Flow } from '@/lib/flowRunner'
import { OFFICIAL_FLOWS, findFlow } from '@/lib/officialFlows'
import { listMyFlows, listCommunityFlows, bumpInstalls, type StoredFlow } from '@/lib/flowStore'
import { FlowWorkshop } from '@/components/FlowWorkshop'

interface Props { user: User }
type Conn = 'checking' | 'ok' | 'unconfigured' | 'error'
type RunState = { status: 'run' | 'ok' | 'fail'; log: string[]; failedAt?: string }

export function AutomationLab({ user }: Props) {
  const { currentOrg } = useOrg()
  const [conn, setConn] = useState<Conn>('checking')
  const [instances, setInstances] = useState<CpInstance[]>([])
  const [tab, setTab] = useState<'run' | 'post' | 'create'>('run')
  const [postFile, setPostFile] = useState<File | null>(null)
  const [postCaption, setPostCaption] = useState('')
  const [posting, setPosting] = useState(false)

  const [myFlows, setMyFlows] = useState<StoredFlow[]>([])
  const [communityFlows, setCommunityFlows] = useState<StoredFlow[]>([])
  const [flowId, setFlowId] = useState(OFFICIAL_FLOWS[0]?.id ?? '')
  const [flowTab, setFlowTab] = useState<'official' | 'mine' | 'community'>('official')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Record<string, RunState>>({})
  const [running, setRunning] = useState(false)

  const orgId = currentOrg?.id ?? null
  const allFlows: Flow[] = [...OFFICIAL_FLOWS, ...myFlows, ...communityFlows]
  const flow = allFlows.find(f => f.id === flowId)
  const runningPhones = instances.filter(i => /running|up/i.test(i.state))

  const loadFlows = useCallback(async () => {
    const [mine, community] = await Promise.all([listMyFlows(user.id), listCommunityFlows(user.id)])
    setMyFlows(mine); setCommunityFlows(community)
  }, [user.id])
  useEffect(() => { loadFlows() }, [loadFlows])

  const loadInstances = useCallback(async () => {
    const r = await cloudPhones.list()
    if (r.ok) setInstances(r.data?.instances ?? [])
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await loadCloudAgentConfig(currentOrg?.id ?? null, user.id)
      if (!alive) return
      const { url, token } = getCloudAgent()
      if (!url || !token) { setConn('unconfigured'); return }
      const h = await cloudPhones.health()
      if (!alive) return
      if (h.ok) { setConn('ok'); loadInstances() } else setConn('error')
    })()
    return () => { alive = false }
  }, [currentOrg?.id, user.id, loadInstances])

  const togglePhone = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = runningPhones.length > 0 && runningPhones.every(p => selected.has(p.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(runningPhones.map(p => p.id)))

  const run = async () => {
    if (!flow || selected.size === 0) return
    const ids = [...selected]
    if (communityFlows.some(f => f.id === flow.id)) bumpInstalls(flow.id)  // compteur de popularité
    setResults(Object.fromEntries(ids.map(id => [id, { status: 'run', log: [] } as RunState])))
    setRunning(true)
    await Promise.all(ids.map(async id => {
      const res = await runFlow(id, flow, { vars: inputs, log: m => setResults(r => ({ ...r, [id]: { ...r[id], log: [...(r[id]?.log ?? []), m] } })) })
      setResults(r => ({ ...r, [id]: { ...r[id], status: res.ok ? 'ok' : 'fail', failedAt: res.failedAt } }))
    }))
    setRunning(false)
  }

  // TOUT-EN-UN : upload la vidéo sur chaque tel sélectionné puis lance « Poster
  // un Reel » avec la description. En parallèle, journal par tel.
  const postRun = async () => {
    const flow = findFlow('ig-post-reel')
    if (!postFile || !flow || selected.size === 0) return
    const ids = [...selected]
    setResults(Object.fromEntries(ids.map(id => [id, { status: 'run', log: ['⏳ En attente…'] } as RunState])))
    setPosting(true)
    await Promise.all(ids.map(async id => {
      const push = (m: string) => setResults(r => ({ ...r, [id]: { ...r[id], log: [...(r[id]?.log ?? []), m] } }))
      const setOnly = (m: string) => setResults(r => ({ ...r, [id]: { ...r[id], log: [m] } }))
      setOnly('📤 Upload de la vidéo…')
      const up = await uploadVideoFile(id, postFile!, pct => setOnly(`📤 Upload ${pct}%`))
      if (!up.ok) { setResults(r => ({ ...r, [id]: { ...r[id], status: 'fail', failedAt: `upload : ${up.error}` } })); return }
      push('✓ Vidéo envoyée')
      await new Promise(res => setTimeout(res, 1800)) // laisse MediaStore indexer
      const res = await runFlow(id, flow, { vars: { caption: postCaption }, log: push })
      setResults(r => ({ ...r, [id]: { ...r[id], status: res.ok ? 'ok' : 'fail', failedAt: res.failedAt } }))
    }))
    setPosting(false)
  }

  const nameOf = (id: string) => instances.find(i => i.id === id)?.name ?? id

  return (
    <div className="sf-page sf-page-enter">
      <header className="sf-page-header">
        <div className="sf-page-icon">🤖</div>
        <div>
          <h1 className="sf-page-title">Automatisation</h1>
          <p className="sf-page-sub">Automatisations UI (façon GeeLark) sur tes cloud phones : vise les éléments par leur sens, attend les écrans, ferme les popups, réessaie.</p>
        </div>
      </header>

      {conn === 'unconfigured' && <Notice>Agent non configuré — va d’abord dans <b>Cloud Phones</b>.</Notice>}
      {conn === 'error' && <Notice tone="error">Agent injoignable — vérifie <b>Cloud Phones</b>.</Notice>}
      {conn === 'checking' && <Notice>Connexion à l’agent…</Notice>}

      {conn === 'ok' && (
        <>
          {/* Onglets */}
          <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 11, background: 'rgba(0,0,0,0.3)', marginBottom: 18, width: 'fit-content' }}>
            <Tab on={tab === 'run'} onClick={() => setTab('run')}>▶️ Lancer</Tab>
            <Tab on={tab === 'post'} onClick={() => setTab('post')}>📤 Poster</Tab>
            <Tab on={tab === 'create'} onClick={() => setTab('create')}>🛠️ Créer</Tab>
          </div>

          {tab === 'create' && <FlowWorkshop phones={runningPhones} userId={user.id} orgId={orgId} onSaved={loadFlows} />}

          {tab === 'run' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Galerie de flows façon Power Automate : onglets source + cartes à logo */}
              <div className="sf-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: 'rgba(0,0,0,0.28)', width: 'fit-content', marginBottom: 14 }}>
                  <SubTab on={flowTab === 'official'} onClick={() => setFlowTab('official')}>⭐ Officielles · {OFFICIAL_FLOWS.length}</SubTab>
                  <SubTab on={flowTab === 'mine'} onClick={() => setFlowTab('mine')}>👤 Mes automatisations · {myFlows.length}</SubTab>
                  <SubTab on={flowTab === 'community'} onClick={() => setFlowTab('community')}>🌍 Communauté · {communityFlows.length}</SubTab>
                </div>

                {(() => {
                  const list = flowTab === 'official' ? OFFICIAL_FLOWS : flowTab === 'mine' ? myFlows : communityFlows
                  const sourceLabel = flowTab === 'official' ? 'ScaleFlow · Officiel' : flowTab === 'mine' ? 'Créé par moi' : 'Communauté'
                  if (list.length === 0) return <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>{flowTab === 'mine' ? 'Aucune automatisation perso — crée-en dans l’onglet « Créer ».' : 'Rien pour l’instant.'}</div>
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                      {list.map(f => <FlowCard key={f.id} flow={f} source={sourceLabel} selected={flowId === f.id} onPick={() => { setFlowId(f.id); setInputs({}) }} />)}
                    </div>
                  )
                })()}

                {flow?.inputs && flow.inputs.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Paramètres · {flow.name}</div>
                    {flow.inputs.map(inp => (
                      <div key={inp.key} style={{ marginTop: 10 }}>
                        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>{inp.label}{inp.optional ? ' (optionnel)' : ''}</label>
                        <input value={inputs[inp.key] ?? ''} onChange={e => setInputs(s => ({ ...s, [inp.key]: e.target.value }))} placeholder={inp.placeholder} style={inputStyle} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <PhonePicker phones={runningPhones} selected={selected} allSelected={allSelected} toggleAll={toggleAll} togglePhone={togglePhone} />
              <button onClick={run} disabled={running || selected.size === 0 || !flow} style={{ ...runBtn, opacity: (running || selected.size === 0 || !flow) ? 0.55 : 1 }}>
                {running ? '⏳ Exécution…' : `▶️ Lancer sur ${selected.size} téléphone${selected.size > 1 ? 's' : ''}`}
              </button>
              <ResultsList results={results} nameOf={nameOf} />
            </div>
          )}

          {tab === 'post' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card title="1 · Vidéo + description">
                <p style={{ fontSize: 11.5, color: '#8a8a9c', margin: '0 0 10px', lineHeight: 1.5 }}>Choisis une vidéo et une description → elle sera <b>uploadée</b> sur chaque tel sélectionné puis <b>postée en Reel</b> automatiquement.</p>
                <label style={{ display: 'block', marginBottom: 10 }}>
                  <input type="file" accept="video/*" onChange={e => setPostFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} id="post-file" />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1.5px dashed rgba(129,140,248,0.5)', background: 'rgba(129,140,248,0.07)', color: '#C7D2FE', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }} onClick={() => document.getElementById('post-file')?.click()}>
                    🎬 {postFile ? postFile.name : 'Choisir une vidéo'}
                  </span>
                </label>
                <textarea value={postCaption} onChange={e => setPostCaption(e.target.value)} placeholder="Description / légende (emoji ok)" rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              </Card>
              <PhonePicker phones={runningPhones} selected={selected} allSelected={allSelected} toggleAll={toggleAll} togglePhone={togglePhone} />
              <button onClick={postRun} disabled={posting || !postFile || selected.size === 0} style={{ ...runBtn, opacity: (posting || !postFile || selected.size === 0) ? 0.55 : 1 }}>
                {posting ? '⏳ Publication…' : `📤 Poster sur ${selected.size} téléphone${selected.size > 1 ? 's' : ''}`}
              </button>
              <ResultsList results={results} nameOf={nameOf} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border-md)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-1)' }
const runBtn: React.CSSProperties = { width: '100%', fontSize: 14, fontWeight: 800, padding: '12px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ fontSize: 12.5, fontWeight: 800, padding: '7px 16px', borderRadius: 8, border: 'none', background: on ? 'var(--accent-lt)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer' }}>{children}</button>
}
function PhonePicker({ phones, selected, allSelected, toggleAll, togglePhone }: { phones: CpInstance[]; selected: Set<string>; allSelected: boolean; toggleAll: () => void; togglePhone: (id: string) => void }) {
  return (
    <Card title={`Téléphones (${selected.size} sélectionné${selected.size > 1 ? 's' : ''})`}>
      {phones.length === 0
        ? <p style={{ fontSize: 12.5, color: 'var(--warn)', margin: 0 }}>Aucun téléphone en ligne. Démarres-en dans <b>Cloud Phones</b>.</p>
        : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Tout sélectionner
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 6 }}>
              {phones.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', background: selected.has(p.id) ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selected.has(p.id) ? 'var(--accent)' : 'var(--border)'}` }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => togglePhone(p.id)} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
    </Card>
  )
}
function ResultsList({ results, nameOf }: { results: Record<string, RunState>; nameOf: (id: string) => string }) {
  if (Object.keys(results).length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Object.entries(results).map(([id, r]) => (
        <div key={id} className="sf-card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>{r.status === 'run' ? '⏳' : r.status === 'ok' ? '✅' : '❌'}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{nameOf(id)}</span>
            {r.status === 'fail' && <span style={{ fontSize: 11, color: 'var(--danger)' }}>bloqué : {r.failedAt}</span>}
          </div>
          <div style={{ maxHeight: 130, overflowY: 'auto', fontSize: 11, lineHeight: 1.5, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>
            {r.log.map((l, i) => <div key={i} style={{ color: l.startsWith('✅') ? 'var(--ok)' : l.startsWith('❌') ? 'var(--danger)' : l.startsWith('  ✗') ? 'var(--warn)' : 'var(--text-2)' }}>{l}</div>)}
          </div>
        </div>
      ))}
    </div>
  )
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sf-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
// Plateforme d'un flow (logo + couleur) d'après son package Android.
const APP_META: Record<string, { label: string; icon: string; bg: string }> = {
  'com.instagram.android': { label: 'Instagram', icon: '📸', bg: 'linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)' },
  'com.zhiliaoapp.musically': { label: 'TikTok', icon: '🎵', bg: 'linear-gradient(135deg,#25F4EE,#000,#FE2C55)' },
  'com.instagram.barcelona': { label: 'Threads', icon: '🧵', bg: '#101010' },
  'com.snapchat.android': { label: 'Snapchat', icon: '👻', bg: '#FFFC00' },
  'com.facebook.katana': { label: 'Facebook', icon: '📘', bg: '#1877F2' },
  'com.twitter.android': { label: 'X', icon: '𝕏', bg: '#000' },
}
function appOf(f: Flow) { return APP_META[f.app ?? ''] ?? { label: 'App', icon: '📱', bg: 'var(--accent)' } }

function SubTab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ fontSize: 12, fontWeight: 800, padding: '6px 14px', borderRadius: 7, border: 'none', background: on ? 'var(--accent-lt)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-4)', cursor: 'pointer', whiteSpace: 'nowrap' }}>{children}</button>
}

function FlowCard({ flow, source, selected, onPick }: { flow: Flow; source: string; selected: boolean; onPick: () => void }) {
  const app = appOf(flow)
  return (
    <button onClick={onPick} style={{
      textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 12, cursor: 'pointer',
      background: selected ? 'var(--accent-dim)' : 'var(--surface, rgba(255,255,255,0.02))',
      border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, transition: 'all .12s', minHeight: 120,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', fontSize: 17, background: app.bg, flexShrink: 0, boxShadow: '0 2px 8px -2px rgba(0,0,0,0.5)' }}>{app.icon}</span>
        {flow.category && <span className="sf-badge sf-badge-muted" style={{ fontSize: 9.5 }}>{flow.category}</span>}
        <span style={{ flex: 1 }} />
        {selected && <span style={{ color: 'var(--accent)', fontSize: 15 }}>✓</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.25 }}>{flow.name}</div>
      {flow.description && <div style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{flow.description}</div>}
      <span style={{ flex: 1 }} />
      <div style={{ fontSize: 10, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 5 }}>{app.label} · {source}</div>
    </button>
  )
}
function Notice({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return <div className="sf-banner" style={{ color: tone === 'error' ? 'var(--danger)' : 'var(--text-2)' }}>{children}</div>
}

export default AutomationLab
