// Admin — Automatisation (UI façon GeeLark). Réservé au super-admin. Choisit un
// cloud phone, un flow (officiel pour l'instant ; workshop utilisateur à venir),
// remplit les paramètres, lance, et affiche le journal d'étapes en direct.
import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useOrg } from '@/lib/orgContext'
import { cloudPhones, loadCloudAgentConfig, getCloudAgent, type CpInstance } from '@/lib/cloudPhones'
import { runFlow } from '@/lib/flowRunner'
import { OFFICIAL_FLOWS, findFlow } from '@/lib/officialFlows'

interface Props { user: User }

export function AutomationLab({ user }: Props) {
  const { currentOrg } = useOrg()
  const [conn, setConn] = useState<'checking' | 'ok' | 'unconfigured' | 'error'>('checking')
  const [instances, setInstances] = useState<CpInstance[]>([])
  const [phoneId, setPhoneId] = useState('')
  const [flowId, setFlowId] = useState(OFFICIAL_FLOWS[0]?.id ?? '')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)

  const flow = findFlow(flowId)

  const loadInstances = useCallback(async () => {
    const r = await cloudPhones.list()
    if (r.ok) {
      const list = r.data?.instances ?? []
      setInstances(list)
      setPhoneId(prev => prev || list.find(i => /running|up/i.test(i.state))?.id || '')
    }
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

  const running_ = instances.filter(i => /running|up/i.test(i.state))

  const run = async () => {
    if (!phoneId || !flow) return
    setLog([]); setRunning(true)
    const res = await runFlow(phoneId, flow, { vars: inputs, log: (m) => setLog(l => [...l, m]) })
    setRunning(false)
    if (!res.ok) setLog(l => [...l, `❌ Bloqué à : ${res.failedAt}`, '💡 Ouvre le tel, va sur l’écran bloqué, et fais « Dump UI » pour corriger le flow.'])
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#F0F0F7', margin: '0 0 4px' }}>🤖 Automatisation</h1>
      <p style={{ fontSize: 13, color: '#8a8a9c', margin: '0 0 20px' }}>
        Automatisations UI (façon GeeLark) sur tes cloud phones : vise les éléments par leur sens, attend les écrans, ferme les popups, réessaie.
      </p>

      {conn === 'unconfigured' && <Notice>Agent Cloud Phones non configuré. Va d’abord dans <b>Cloud Phones</b> pour renseigner l’URL + le token.</Notice>}
      {conn === 'error' && <Notice tone="error">Agent injoignable. Vérifie la connexion dans <b>Cloud Phones</b>.</Notice>}
      {conn === 'checking' && <Notice>Connexion à l’agent…</Notice>}

      {conn === 'ok' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Choix du téléphone */}
          <Card title="1 · Téléphone">
            {running_.length === 0
              ? <p style={{ fontSize: 12.5, color: '#FBBF24', margin: 0 }}>Aucun téléphone en ligne. Démarres-en un dans <b>Cloud Phones</b>.</p>
              : (
                <select value={phoneId} onChange={e => setPhoneId(e.target.value)} style={selectStyle}>
                  {running_.map(i => <option key={i.id} value={i.id}>{i.name} · en ligne</option>)}
                </select>
              )}
          </Card>

          {/* Choix du flow */}
          <Card title="2 · Automatisation">
            <select value={flowId} onChange={e => { setFlowId(e.target.value); setInputs({}) }} style={selectStyle}>
              {OFFICIAL_FLOWS.map(f => <option key={f.id} value={f.id}>{f.name}{f.official ? ' · officiel' : ''}</option>)}
            </select>
            {flow?.description && <p style={{ fontSize: 12, color: '#8a8a9c', margin: '8px 0 0' }}>{flow.description}</p>}
            {flow?.inputs?.map(inp => (
              <div key={inp.key} style={{ marginTop: 10 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#c8c8d8', display: 'block', marginBottom: 4 }}>{inp.label}{inp.optional ? ' (optionnel)' : ''}</label>
                <input value={inputs[inp.key] ?? ''} onChange={e => setInputs(s => ({ ...s, [inp.key]: e.target.value }))} placeholder={inp.placeholder} style={inputStyle} />
              </div>
            ))}
          </Card>

          <button onClick={run} disabled={running || !phoneId} style={{ ...runBtn, opacity: (running || !phoneId) ? 0.55 : 1 }}>
            {running ? '⏳ Exécution…' : '▶️ Lancer'}
          </button>

          {log.length > 0 && (
            <Card title="Journal">
              <div style={{ maxHeight: 280, overflowY: 'auto', fontSize: 11.5, lineHeight: 1.6, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' }}>
                {log.map((l, i) => <div key={i} style={{ color: l.startsWith('✅') ? '#34D399' : l.startsWith('❌') ? '#F87171' : l.startsWith('  ✗') ? '#FBBF24' : '#c8c8d8' }}>{l}</div>)}
              </div>
            </Card>
          )}

          <div style={{ fontSize: 12, color: '#6b6b7c', textAlign: 'center', marginTop: 8 }}>
            🛠️ Workshop (créer/éditer ses propres automatisations) — bientôt. Pour l’instant : flows officiels.
          </div>
        </div>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '9px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.35)', color: '#E9E9F2' }
const inputStyle: React.CSSProperties = { ...selectStyle, fontSize: 12.5 }
const runBtn: React.CSSProperties = { width: '100%', fontSize: 14, fontWeight: 800, padding: '12px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#818CF8,#6366F1)', color: '#fff', cursor: 'pointer' }

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#C7D2FE', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}
function Notice({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return <div style={{ padding: 14, borderRadius: 12, fontSize: 13, lineHeight: 1.5, color: tone === 'error' ? '#F87171' : '#c8c8d8', background: tone === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${tone === 'error' ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.08)'}` }}>{children}</div>
}

export default AutomationLab
