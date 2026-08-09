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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#F0F0F7', margin: '0 0 4px' }}>🤖 Automatisation</h1>
      <p style={{ fontSize: 13, color: '#8a8a9c', margin: '0 0 18px' }}>Automatisations UI (façon GeeLark) sur tes cloud phones : vise les éléments par leur sens, attend les écrans, ferme les popups, réessaie.</p>

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
              <Card title="1 · Automatisation">
                <FlowGroup title="⭐ Officielles" flows={OFFICIAL_FLOWS} sel={flowId} onPick={id => { setFlowId(id); setInputs({}) }} />
                <FlowGroup title="👤 Mes automatisations" flows={myFlows} sel={flowId} onPick={id => { setFlowId(id); setInputs({}) }} empty="Rien encore — crée-en dans l’onglet « Créer »." />
                <FlowGroup title="🌍 Communauté" flows={communityFlows} sel={flowId} onPick={id => { setFlowId(id); setInputs({}) }} empty="Aucune automatisation communautaire pour l’instant." />
                {flow?.inputs?.map(inp => (
                  <div key={inp.key} style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: '#c8c8d8', display: 'block', marginBottom: 4 }}>{inp.label}{inp.optional ? ' (optionnel)' : ''}</label>
                    <input value={inputs[inp.key] ?? ''} onChange={e => setInputs(s => ({ ...s, [inp.key]: e.target.value }))} placeholder={inp.placeholder} style={inputStyle} />
                  </div>
                ))}
              </Card>
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

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '9px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.35)', color: '#E9E9F2' }
const runBtn: React.CSSProperties = { width: '100%', fontSize: 14, fontWeight: 800, padding: '12px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#818CF8,#6366F1)', color: '#fff', cursor: 'pointer' }

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ fontSize: 12.5, fontWeight: 800, padding: '7px 16px', borderRadius: 8, border: 'none', background: on ? 'rgba(129,140,248,0.2)' : 'transparent', color: on ? '#C7D2FE' : '#8a8a9c', cursor: 'pointer' }}>{children}</button>
}
function PhonePicker({ phones, selected, allSelected, toggleAll, togglePhone }: { phones: CpInstance[]; selected: Set<string>; allSelected: boolean; toggleAll: () => void; togglePhone: (id: string) => void }) {
  return (
    <Card title={`Téléphones (${selected.size} sélectionné${selected.size > 1 ? 's' : ''})`}>
      {phones.length === 0
        ? <p style={{ fontSize: 12.5, color: '#FBBF24', margin: 0 }}>Aucun téléphone en ligne. Démarres-en dans <b>Cloud Phones</b>.</p>
        : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: '#C7D2FE', cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Tout sélectionner
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 6 }}>
              {phones.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', background: selected.has(p.id) ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selected.has(p.id) ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => togglePhone(p.id)} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#E9E9F2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
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
        <div key={id} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>{r.status === 'run' ? '⏳' : r.status === 'ok' ? '✅' : '❌'}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#E9E9F2' }}>{nameOf(id)}</span>
            {r.status === 'fail' && <span style={{ fontSize: 11, color: '#F87171' }}>bloqué : {r.failedAt}</span>}
          </div>
          <div style={{ maxHeight: 130, overflowY: 'auto', fontSize: 11, lineHeight: 1.5, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', color: '#c8c8d8' }}>
            {r.log.map((l, i) => <div key={i} style={{ color: l.startsWith('✅') ? '#34D399' : l.startsWith('❌') ? '#F87171' : l.startsWith('  ✗') ? '#FBBF24' : '#c8c8d8' }}>{l}</div>)}
          </div>
        </div>
      ))}
    </div>
  )
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#C7D2FE', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
function FlowGroup({ title, flows, sel, onPick, empty }: { title: string; flows: Flow[]; sel: string; onPick: (id: string) => void; empty?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#8a8a9c', marginBottom: 6 }}>{title}</div>
      {flows.length === 0
        ? <p style={{ fontSize: 11.5, color: '#6b6b7c', margin: 0 }}>{empty}</p>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flows.map(f => (
              <button key={f.id} onClick={() => onPick(f.id)} style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer', background: sel === f.id ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${sel === f.id ? 'rgba(129,140,248,0.45)' : 'rgba(255,255,255,0.08)'}` }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#E9E9F2' }}>{f.name}</div>
                {f.description && <div style={{ fontSize: 10.5, color: '#8a8a9c', marginTop: 2 }}>{f.description}</div>}
              </button>
            ))}
          </div>
        )}
    </div>
  )
}
function Notice({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return <div style={{ padding: 14, borderRadius: 12, fontSize: 13, lineHeight: 1.5, color: tone === 'error' ? '#F87171' : '#c8c8d8', background: tone === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${tone === 'error' ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.08)'}` }}>{children}</div>
}

export default AutomationLab
