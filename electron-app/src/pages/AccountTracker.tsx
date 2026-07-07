import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// ── Suivi des comptes (tableau partagé équipe) ───────────────────────────────
// Table public.account_tracker. Chaque ligne = un compte suivi à la main.
// Édité inline, sauvegardé case par case (1 update de ligne → pas d'écrasement).

interface Row {
  id: string
  name: string | null; model: string | null; market: string | null; folder: string | null
  pseudo: string | null; mail: string | null
  insta: string | null; tiktok: string | null; threads: string | null; youtube: string | null
  sort: number
}

const STATUS = ['', 'Bon', 'Warm-up', 'Shadowban', 'Banni', 'Créé', 'À chauffer']
const STATUS_COLOR: Record<string, { bg: string; fg: string; bd: string }> = {
  'Bon':        { bg: 'rgba(52,211,153,0.16)', fg: 'var(--ok)',     bd: 'rgba(52,211,153,0.4)' },
  'Warm-up':    { bg: 'rgba(59,130,246,0.16)', fg: '#60a5fa',        bd: 'rgba(59,130,246,0.4)' },
  'À chauffer': { bg: 'rgba(59,130,246,0.12)', fg: '#60a5fa',        bd: 'rgba(59,130,246,0.3)' },
  'Shadowban':  { bg: 'rgba(245,158,11,0.16)', fg: '#fbbf24',        bd: 'rgba(245,158,11,0.4)' },
  'Banni':      { bg: 'rgba(239,68,68,0.16)',  fg: 'var(--danger)',  bd: 'rgba(239,68,68,0.4)' },
  'Créé':       { bg: 'rgba(148,163,184,0.14)', fg: 'var(--text-3)', bd: 'var(--border-md)' },
}
const MARKETS = ['', 'FR', 'US', 'UK', 'ES', 'DE', 'Autre']

export function AccountTracker({ user, orgId }: { user: User; orgId: string | null }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [marketFilter, setMarketFilter] = useState<string>('__all__')
  const [folderFilter, setFolderFilter] = useState<string>('__all__')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setNeedsSetup(false)
    let q = supabase.from('account_tracker').select('*').order('sort', { ascending: true }).order('created_at', { ascending: true })
    q = orgId ? q.eq('org_id', orgId) : q.eq('user_id', user.id).is('org_id', null)
    const { data, error } = await q
    if (error) {
      // 42P01 = table inexistante → migration pas encore lancée.
      if (error.code === '42P01' || /does not exist|account_tracker/i.test(error.message)) setNeedsSetup(true)
      else console.error('[AccountTracker] load', error)
      setRows([]); setLoading(false); return
    }
    setRows((data ?? []) as Row[])
    setLoading(false)
  }, [orgId, user.id])
  useEffect(() => { load() }, [load])

  async function patch(id: string, col: keyof Row, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [col]: value } : r))
    const { error } = await supabase.from('account_tracker').update({ [col]: value || null, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { console.error('[AccountTracker] patch', error); load() }
  }
  async function addRow() {
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sort ?? 0), 0)
    const { data, error } = await supabase.from('account_tracker')
      .insert({ org_id: orgId, user_id: user.id, sort: maxSort + 1 })
      .select('*').single()
    if (error) { console.error('[AccountTracker] add', error); return }
    if (data) setRows(prev => [...prev, data as Row])
  }
  async function delRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
    await supabase.from('account_tracker').delete().eq('id', id)
  }

  const folders = [...new Set(rows.map(r => r.folder).filter(Boolean) as string[])].sort()
  const markets = [...new Set(rows.map(r => r.market).filter(Boolean) as string[])].sort()
  const filtered = rows.filter(r => {
    if (marketFilter === '__none__' ? !!r.market : marketFilter !== '__all__' && r.market !== marketFilter) return false
    if (folderFilter === '__none__' ? !!r.folder : folderFilter !== '__all__' && r.folder !== folderFilter) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      return [r.name, r.pseudo, r.mail, r.model].some(v => (v ?? '').toLowerCase().includes(q))
    }
    return true
  })

  if (needsSetup) {
    return (
      <div className="sf-card" style={{ padding: '32px 26px', maxWidth: 640, margin: '20px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🗂️</div>
        <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 8px' }}>Installe le tableau de suivi (une fois)</p>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Le suivi de comptes a besoin d'une petite table partagée. Colle ce SQL dans <b>Supabase → SQL Editor</b> puis recharge :
        </p>
        <pre style={{ textAlign: 'left', fontSize: 11.5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, overflowX: 'auto', color: 'var(--text-2)' }}>{`-- Fichier : supabase/migrations/20260707b_account_tracker.sql
create table if not exists public.account_tracker (
  id uuid primary key default gen_random_uuid(),
  org_id uuid, user_id uuid not null,
  name text, model text, market text, folder text,
  pseudo text, mail text,
  insta text, tiktok text, threads text, youtube text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.account_tracker enable row level security;
create policy "at_all" on public.account_tracker for all using (
  auth.uid() = user_id or (org_id is not null and exists (
    select 1 from organization_members m where m.org_id = account_tracker.org_id and m.user_id = auth.uid())))
  with check (
  auth.uid() = user_id or (org_id is not null and exists (
    select 1 from organization_members m where m.org_id = account_tracker.org_id and m.user_id = auth.uid())));
notify pgrst, 'reload schema';`}</pre>
        <button onClick={load} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer" style={{ marginTop: 14 }}>J'ai lancé le SQL — Recharger</button>
      </div>
    )
  }

  return (
    <div>
      {/* Barre : filtres + actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{rows.length} compte{rows.length > 1 ? 's' : ''} · clique dans une case, ça s'enregistre tout seul</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={marketFilter} onChange={e => setMarketFilter(e.target.value)} className="sf-input cursor-pointer" style={{ width: 'auto', height: 32, fontSize: 12.5 }}>
            <option value="__all__">Tous les marchés</option>
            {markets.map(m => <option key={m} value={m}>{m}</option>)}
            <option value="__none__">Non classé</option>
          </select>
          {folders.length > 0 && (
            <select value={folderFilter} onChange={e => setFolderFilter(e.target.value)} className="sf-input cursor-pointer" style={{ width: 'auto', height: 32, fontSize: 12.5 }}>
              <option value="__all__">Tous les dossiers</option>
              {folders.map(f => <option key={f} value={f}>{f}</option>)}
              <option value="__none__">Non classé</option>
            </select>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="sf-input" style={{ width: 160, height: 32, fontSize: 12.5 }} />
          <button onClick={addRow} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer">＋ Ajouter une ligne</button>
        </div>
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{[0, 1, 2, 3].map(i => <div key={i} className="sf-card sf-skeleton" style={{ height: 44 }} />)}</div>
      ) : rows.length === 0 ? (
        <div className="sf-card" style={{ padding: '40px 24px', textAlign: 'center', maxWidth: 520, margin: '10px auto' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px' }}>Aucun compte suivi</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>Ajoute ta première ligne pour commencer ton suivi.</p>
          <button onClick={addRow} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer">＋ Ajouter une ligne</button>
        </div>
      ) : (
        <div className="sf-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980, fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Compte', 'Marché', 'Dossier', 'Pseudo', 'Insta', 'TikTok', 'Threads', 'YouTube', 'Mail', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-4)', borderBottom: '1px solid var(--border-md)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    {/* Compte + Modèle */}
                    <td style={{ padding: '6px 10px', minWidth: 170 }}>
                      <TextCell value={r.name} placeholder="Nom du compte" bold onSave={v => patch(r.id, 'name', v)} />
                      <TextCell value={r.model} placeholder="Modèle" small onSave={v => patch(r.id, 'model', v)} />
                    </td>
                    <td style={{ padding: '6px 8px' }}><SelectCell value={r.market} options={MARKETS} onSave={v => patch(r.id, 'market', v)} /></td>
                    <td style={{ padding: '6px 8px', minWidth: 110 }}><TextCell value={r.folder} placeholder="—" onSave={v => patch(r.id, 'folder', v)} /></td>
                    <td style={{ padding: '6px 8px', minWidth: 120 }}><TextCell value={r.pseudo} placeholder="@pseudo" onSave={v => patch(r.id, 'pseudo', v)} /></td>
                    <td style={{ padding: '6px 8px' }}><StatusCell value={r.insta} onSave={v => patch(r.id, 'insta', v)} /></td>
                    <td style={{ padding: '6px 8px' }}><StatusCell value={r.tiktok} onSave={v => patch(r.id, 'tiktok', v)} /></td>
                    <td style={{ padding: '6px 8px' }}><StatusCell value={r.threads} onSave={v => patch(r.id, 'threads', v)} /></td>
                    <td style={{ padding: '6px 8px' }}><StatusCell value={r.youtube} onSave={v => patch(r.id, 'youtube', v)} /></td>
                    <td style={{ padding: '6px 8px', minWidth: 130 }}><TextCell value={r.mail} placeholder="mail@…" onSave={v => patch(r.id, 'mail', v)} /></td>
                    <td style={{ padding: '6px 8px' }}>
                      <button onClick={() => delRow(r.id)} title="Supprimer la ligne" className="cursor-pointer" style={{ border: 'none', background: 'transparent', color: 'var(--text-4)', fontSize: 13, padding: 4 }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Cellules ──────────────────────────────────────────────────────────────────
function TextCell({ value, placeholder, bold, small, onSave }: { value: string | null; placeholder?: string; bold?: boolean; small?: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  return (
    <input
      value={v} placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if ((v ?? '') !== (value ?? '')) onSave(v) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={{
        width: '100%', border: '1px solid transparent', background: 'transparent', outline: 'none',
        borderRadius: 6, padding: '4px 6px', fontSize: small ? 11 : 12.5, fontWeight: bold ? 700 : 400,
        color: small ? 'var(--text-4)' : 'var(--text-1)', fontFamily: 'inherit',
      }}
      onFocus={e => { e.currentTarget.style.border = '1px solid var(--accent)'; e.currentTarget.style.background = 'var(--surface-2)' }}
      onBlurCapture={e => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = 'transparent' }}
    />
  )
}

function SelectCell({ value, options, onSave }: { value: string | null; options: string[]; onSave: (v: string) => void }) {
  return (
    <select value={value ?? ''} onChange={e => onSave(e.target.value)} className="cursor-pointer"
      style={{ width: '100%', minWidth: 74, height: 30, borderRadius: 8, fontSize: 12, border: '1px solid var(--border-md)', background: 'var(--surface-2)', color: value ? 'var(--text-1)' : 'var(--text-4)', padding: '0 6px' }}>
      {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
    </select>
  )
}

function StatusCell({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const c = value ? STATUS_COLOR[value] : null
  return (
    <select value={value ?? ''} onChange={e => onSave(e.target.value)} className="cursor-pointer"
      style={{
        width: '100%', minWidth: 96, height: 30, borderRadius: 8, fontSize: 12, fontWeight: 600, padding: '0 8px',
        border: `1px solid ${c ? c.bd : 'var(--border-md)'}`,
        background: c ? c.bg : 'var(--surface-2)',
        color: c ? c.fg : 'var(--text-4)',
      }}>
      {STATUS.map(o => <option key={o} value={o} style={{ background: 'var(--surface-1)', color: 'var(--text-1)' }}>{o || '—'}</option>)}
    </select>
  )
}
