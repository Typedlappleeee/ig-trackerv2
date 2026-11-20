// Saisie de la clé API iRemoTech : vérifiée auprès d'iRemoTech (iPhones trouvés) avant d'être
// enregistrée pour l'utilisateur ET pour l'agence courante (saveIremotechKey).
import { useState } from 'react'
import { listDevices, saveIremotechKey } from '@/lib/iremotech'

export default function IrtKeyForm({ orgId, userId, current, onSaved, onCancel }: { orgId: string | null; userId: string; current?: string | null; onSaved: () => void; onCancel?: () => void }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function save() {
    const k = key.trim()
    if (!/^irt_/.test(k)) { setMsg({ ok: false, text: 'La clé commence par « irt_live_… » (tableau de bord iRemoTech → API Access).' }); return }
    setBusy(true); setMsg(null)
    try {
      const devs = await listDevices(k)
      const r = await saveIremotechKey(orgId, userId, k)
      if (!r.ok) throw new Error(r.error || 'enregistrement refusé')
      setMsg({ ok: true, text: `Clé enregistrée : ${devs.length} iPhone${devs.length > 1 ? 's' : ''} trouvé${devs.length > 1 ? 's' : ''}.` })
      setKey(''); onSaved()
    } catch (e) {
      setMsg({ ok: false, text: `Clé refusée par iRemoTech : ${e instanceof Error ? e.message : String(e)}` })
    } finally { setBusy(false) }
  }
  const field = { height: 34, padding: '0 10px', borderRadius: 7, background: '#161618', border: '1px solid rgba(255,255,255,0.1)', color: '#EDEDEF', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.5 }}>
        Colle ta clé API iRemoTech (tableau de bord iRemoTech → <b style={{ color: '#EDEDEF' }}>API Access</b>). Elle est vérifiée puis enregistrée pour toi{orgId ? ' et pour toute l’agence' : ''}.
        {current && <> Clé actuelle : <span data-no-tr style={{ fontFamily: "'JetBrains Mono',monospace" }}>…{current.slice(-4)}</span>.</>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save() }} placeholder="irt_live_…" style={{ ...field, flex: '1 1 260px' }} data-no-tr />
        <button disabled={busy || !key.trim()} onClick={() => void save()} style={{ ...field, cursor: 'pointer', padding: '0 16px', background: '#E9C46A', color: '#0A0A0B', border: 'none', fontWeight: 600, opacity: busy || !key.trim() ? 0.5 : 1 }}>{busy ? 'Vérification…' : 'Enregistrer'}</button>
        {onCancel && <button onClick={onCancel} style={{ ...field, cursor: 'pointer' }}>Annuler</button>}
      </div>
      {msg && <div style={{ fontSize: 12.5, color: msg.ok ? '#4ADE80' : '#F87171' }} data-no-tr={!msg.ok || undefined}>{msg.text}</div>}
    </div>
  )
}
