import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Reusable "save to bank — which folder?" selector.
// Lists existing folders from content_bank + lets the user type a new one.
// value = folder name (string) or null for the bank root.
export function BankFolderSelect({
  value,
  onChange,
  userId,
  orgId,
  label = 'Dossier de destination',
  compact = false,
}: {
  value: string | null
  onChange: (folder: string | null) => void
  userId: string
  orgId?: string | null
  label?: string
  compact?: boolean
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <div className="sf-section-label">{label}</div>}
      {creating ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmNew(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
            placeholder="Nom du nouveau dossier…"
            className="sf-input"
            style={{ flex: 1, fontSize: 12, height: compact ? 32 : 36 }}
          />
          <button onClick={confirmNew} className="sf-btn cursor-pointer"
            style={{ height: compact ? 32 : 36, padding: '0 12px', fontSize: 11, background: 'rgba(99,102,241,0.15)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8 }}>
            OK
          </button>
          <button onClick={() => { setCreating(false); setNewName('') }} className="sf-btn cursor-pointer"
            style={{ height: compact ? 32 : 36, padding: '0 10px', fontSize: 11, background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 8 }}>
            ✕
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={value ?? ''}
            onChange={e => onChange(e.target.value || null)}
            className="sf-input"
            style={{ flex: 1, fontSize: 12, height: compact ? 32 : 36, color: '#e8e8f0', background: '#1a1a2e' }}
          >
            <option value="" style={{ color: '#e8e8f0', background: '#1a1a2e' }}>📁 Racine (aucun dossier)</option>
            {folders.map(f => (
              <option key={f} value={f} style={{ color: '#e8e8f0', background: '#1a1a2e' }}>📂 {f}</option>
            ))}
          </select>
          <button
            onClick={() => setCreating(true)}
            title="Créer un nouveau dossier"
            className="sf-btn cursor-pointer"
            style={{ height: compact ? 32 : 36, padding: '0 11px', fontSize: 16, lineHeight: 1, background: 'rgba(99,102,241,0.1)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, display: 'flex', alignItems: 'center' }}
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}
