import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function BankFolderSelect({
  value,
  onChange,
  userId,
  orgId,
  label = 'Dossier de destination',
}: {
  value: string | null
  onChange: (folder: string | null) => void
  userId: string
  orgId?: string | null
  label?: string
}) {
  const [folders, setFolders] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      let q = supabase.from('content_bank').select('folder')
      q = orgId ? q.eq('org_id', orgId) : q.eq('user_id', userId).is('org_id', null)
      const { data } = await q
      if (!alive || !data) return
      const uniq = [...new Set(
        data.map(r => (r as { folder: string | null }).folder).filter((f): f is string => Boolean(f)),
      )].sort((a, b) => a.localeCompare(b))
      setFolders(uniq)
    })()
    return () => { alive = false }
  }, [userId, orgId])

  function confirmNew() {
    const name = newName.trim()
    if (!name) { setCreating(false); return }
    if (!folders.includes(name)) setFolders(prev => [...prev, name].sort((a, b) => a.localeCompare(b)))
    onChange(name)
    setCreating(false)
    setNewName('')
  }

  const SEL_STYLE: React.CSSProperties = {
    flex: 1, height: 34, fontSize: 12, fontWeight: 500,
    borderRadius: 8, border: '1px solid rgba(99,102,241,0.25)',
    background: 'rgba(99,102,241,0.07)', color: '#c7c8f0',
    padding: '0 10px', outline: 'none', cursor: 'pointer',
    appearance: 'auto',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            style={{
              fontSize: 10, fontWeight: 600, color: '#6366F1', background: 'none', border: 'none',
              cursor: 'pointer', padding: '2px 4px', borderRadius: 4, lineHeight: 1,
            }}
          >
            + Nouveau dossier
          </button>
        )}
      </div>
      {creating ? (
        <div style={{ display: 'flex', gap: 5 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmNew(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
            placeholder="Nom du nouveau dossier…"
            style={{ ...SEL_STYLE, flex: 1, padding: '0 10px' }}
          />
          <button onClick={confirmNew} style={{ height: 34, padding: '0 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: 'rgba(99,102,241,0.18)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer' }}>OK</button>
          <button onClick={() => { setCreating(false); setNewName('') }} style={{ height: 34, padding: '0 10px', borderRadius: 8, fontSize: 11, background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', border: '1px solid var(--border)', cursor: 'pointer' }}>✕</button>
        </div>
      ) : (
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          style={SEL_STYLE}
        >
          <option value="" style={{ background: '#12121e', color: '#c7c8f0' }}>Racine (aucun dossier)</option>
          {folders.map(f => (
            <option key={f} value={f} style={{ background: '#12121e', color: '#c7c8f0' }}>📂 {f}</option>
          ))}
        </select>
      )}
    </div>
  )
}
