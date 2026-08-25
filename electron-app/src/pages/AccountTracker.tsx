import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { useTr } from '@/lib/i18n'

// ── Suivi des comptes (tableau partagé équipe) ───────────────────────────────
// Table public.account_tracker. Chaque ligne = un compte suivi à la main.
// Édité inline, sauvegardé case par case (1 update de ligne → pas d'écrasement).

interface Row {
  id: string
  name: string | null; model: string | null; market: string | null; folder: string | null
  pseudo: string | null; mail: string | null; password: string | null; comment: string | null
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
  const { role, perms } = useOrg()
  const tr = useTr()
  const [rows, setRows] = useState<Row[]>([])
  const [phoneAccounts, setPhoneAccounts] = useState<{ ig_username: string; phone_name: string | null }[]>([])
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
    // Comptes IG déjà assignés aux téléphones → suggestions + import.
    let pq = supabase.from('phones').select('ig_username, phone_name, group_name').not('ig_username', 'is', null)
    pq = orgId ? pq.eq('org_id', orgId) : pq.eq('user_id', user.id).is('org_id', null)
    const { data: pd } = await pq
    // 🔒 Le membre ne voit que les comptes des groupes autorisés.
    const accessible = ((pd ?? []) as { ig_username: string; phone_name: string | null; group_name: string | null }[])
      .filter(p => !role || canAccessPhoneGroup(role, perms, p.group_name ?? null))
    setPhoneAccounts(accessible)
    setLoading(false)
  }, [orgId, user.id, role, perms])
  useEffect(() => { load() }, [load])

  // Crée une ligne pour chaque compte IG des téléphones pas encore dans le tableau.
  async function importFromPhones() {
    const existing = new Set(rows.map(r => (r.pseudo ?? '').replace(/^@+/, '').toLowerCase()).filter(Boolean))
    const toAdd = phoneAccounts.filter(p => p.ig_username && !existing.has(p.ig_username.replace(/^@+/, '').toLowerCase()))
    if (!toAdd.length) return
    let sort = rows.reduce((m, r) => Math.max(m, r.sort ?? 0), 0)
    const payload = toAdd.map(p => ({ org_id: orgId, user_id: user.id, pseudo: p.ig_username, name: p.phone_name ?? p.ig_username, sort: ++sort }))
    const { data, error } = await supabase.from('account_tracker').insert(payload).select('*')
    if (error) { console.error('[AccountTracker] import', error); return }
    if (data) setRows(prev => [...prev, ...(data as Row[])])
  }

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
  const trackedPseudos = new Set(rows.map(r => (r.pseudo ?? '').replace(/^@+/, '').toLowerCase()).filter(Boolean))
  const importCount = phoneAccounts.filter(p => p.ig_username && !trackedPseudos.has(p.ig_username.replace(/^@+/, '').toLowerCase())).length
  const pseudoSuggestions = [...new Set(phoneAccounts.map(p => p.ig_username).filter(Boolean))].sort()

  // KPIs dérivés (présentation uniquement — aucun impact sur les données).
  const statusesOf = (r: Row) => [r.insta, r.tiktok, r.threads, r.youtube]
  const healthyCount = rows.filter(r => statusesOf(r).includes('Bon')).length
  const warmingCount = rows.filter(r => statusesOf(r).some(s => s === 'Warm-up' || s === 'À chauffer')).length
  const alertCount = rows.filter(r => statusesOf(r).some(s => s === 'Banni' || s === 'Shadowban')).length

  if (needsSetup) {
    return (
      <div className="sf-card sf-elev-1 sf-anim-slide-up" style={{ padding: 'var(--sp-7) var(--sp-6)', maxWidth: 640, margin: '20px auto', textAlign: 'center' }}>
        <div className="sf-empty-icon sf-anim-scale-spring" style={{ margin: '0 auto var(--sp-4)' }}>🗂️</div>
        <p className="sf-empty-title" style={{ margin: '0 0 var(--sp-2)' }}>{tr('Installe le tableau de suivi (une fois)', 'Install the tracking table (one time)')}</p>
        <p className="sf-empty-desc" style={{ margin: '0 auto var(--sp-4)', maxWidth: 420 }}>
          {tr('Le suivi de comptes a besoin d\'une petite table partagée. Colle ce SQL dans', 'Account tracking needs a small shared table. Paste this SQL into')} <b>Supabase → SQL Editor</b> {tr('puis recharge :', 'then reload:')}
        </p>
        <pre className="sf-scroll-x" style={{ textAlign: 'left', fontSize: 11.5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', overflowX: 'auto', color: 'var(--text-2)' }}>{`-- Fichier : supabase/migrations/20260707b_account_tracker.sql
create table if not exists public.account_tracker (
  id uuid primary key default gen_random_uuid(),
  org_id uuid, user_id uuid not null,
  name text, model text, market text, folder text,
  pseudo text, mail text, password text, comment text,
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
        <button onClick={load} className="sf-btn sf-btn-primary sf-btn-sm sf-press cursor-pointer" style={{ marginTop: 'var(--sp-4)' }}>{tr('J\'ai lancé le SQL — Recharger', 'I ran the SQL — Reload')}</button>
      </div>
    )
  }

  return (
    <div className="sf-page anim-page">
      {/* En-tête de page v2 */}
      <div className="sf-page-header">
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring" aria-hidden style={{ ['--icon-grad' as string]: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title">{tr('Suivi des comptes', 'Account tracking')}</h1>
            <p className="sf-page-sub">
              <span className="sf-tabular">{rows.length}</span> {tr(rows.length > 1 ? 'comptes' : 'compte', rows.length > 1 ? 'accounts' : 'account')} · {tr('clique dans une case, ça s\'enregistre tout seul', 'click a cell, it saves automatically')}
            </p>
            <p className="sf-page-sub" style={{ marginTop: 2, color: 'var(--text-4)', fontSize: 11.5 }}>
              {tr('Le carnet de tes comptes : 1 téléphone = 1 compte Instagram. Relie chaque compte à son modèle, son marché et son statut par plateforme.', 'Your accounts logbook: 1 phone = 1 Instagram account. Link each account to its model, market and per-platform status.')}
            </p>
          </div>
        </div>
        <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
          {importCount > 0 && (
            <button onClick={importFromPhones} className="sf-btn sf-btn-secondary sf-btn-sm sf-press cursor-pointer" title={tr('Crée une ligne pour chaque compte Instagram déjà assigné à un téléphone', 'Creates a row for each Instagram account already assigned to a phone')}>
              {tr(`↧ Importer mes comptes (${importCount})`, `↧ Import my accounts (${importCount})`)}
            </button>
          )}
          <button onClick={addRow} className="sf-btn sf-btn-primary sf-btn-sm sf-press cursor-pointer" title={tr('Ajoute une ligne vide à remplir à la main (nom, pseudo, statut…)', 'Adds a blank row to fill in by hand (name, handle, status…)')}>{tr('＋ Ajouter une ligne', '＋ Add a row')}</button>
        </div>
      </div>

      {/* KPI — répartition de la santé des comptes */}
      {!loading && rows.length > 0 && (
        <div className="sf-anim-slide-up sf-d100" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
          <StatCard label={tr('Comptes suivis', 'Tracked accounts')} value={rows.length} accent="linear-gradient(135deg,#818CF8,#8B5CF6)" glyph="◆" tint="rgba(139,92,246,0.14)" fg="#A5B4FC" />
          <StatCard label={tr('En forme', 'Healthy')} value={healthyCount} accent="linear-gradient(135deg,#34d399,#10b981)" glyph="●" tint="rgba(52,211,153,0.14)" fg="var(--ok)" />
          <StatCard label={tr('En chauffe', 'Warming up')} value={warmingCount} accent="linear-gradient(135deg,#60a5fa,#6366F1)" glyph="◐" tint="rgba(96,165,250,0.14)" fg="#60a5fa" />
          <StatCard label={tr('À surveiller', 'Needs attention')} value={alertCount} accent="linear-gradient(135deg,#fbbf24,#ef4444)" glyph="▲" tint="rgba(245,158,11,0.14)" fg="#fbbf24" />
        </div>
      )}

      {/* Barre de filtres */}
      {!loading && rows.length > 0 && (
        <div className="sf-glass sf-anim-slide-up sf-d100" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-2)', padding: '10px 12px', marginBottom: 'var(--sp-4)' }}>
          <span className="sf-section-label" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', marginRight: 4, flex: '0 0 auto' }}>{tr('Filtrer', 'Filter')}</span>
          <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 260, minWidth: 150 }}>
            <span aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', fontSize: 12, pointerEvents: 'none' }}>🔎</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Rechercher un compte…', 'Search an account…')} className="sf-input" style={{ width: '100%', height: 34, fontSize: 12.5, paddingLeft: 30 }} />
          </div>
          <select value={marketFilter} onChange={e => setMarketFilter(e.target.value)} className="sf-input cursor-pointer" style={{ width: 'auto', height: 34, fontSize: 12.5 }}>
            <option value="__all__">{tr('Tous les marchés', 'All markets')}</option>
            {markets.map(m => <option key={m} value={m}>{m}</option>)}
            <option value="__none__">{tr('Non classé', 'Unclassified')}</option>
          </select>
          {folders.length > 0 && (
            <select value={folderFilter} onChange={e => setFolderFilter(e.target.value)} className="sf-input cursor-pointer" style={{ width: 'auto', height: 34, fontSize: 12.5 }}>
              <option value="__all__">{tr('Tous les dossiers', 'All folders')}</option>
              {folders.map(f => <option key={f} value={f}>{f}</option>)}
              <option value="__none__">{tr('Non classé', 'Unclassified')}</option>
            </select>
          )}
          {(search || marketFilter !== '__all__' || folderFilter !== '__all__') && (
            <>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>
                {filtered.length}/{rows.length}
              </span>
              <button onClick={() => { setSearch(''); setMarketFilter('__all__'); setFolderFilter('__all__') }} className="sf-btn sf-btn-ghost sf-btn-sm sf-press cursor-pointer" style={{ height: 30, fontSize: 12 }}>{tr('Effacer', 'Clear')}</button>
            </>
          )}
        </div>
      )}

      {/* Tableau */}
      {loading ? (
        <div className="sf-card sf-elev-1" style={{ padding: 0, overflow: 'hidden' }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="sf-cluster" style={{ gap: 'var(--sp-4)', padding: '12px var(--sp-4)', borderBottom: i < 5 ? '1px solid var(--border)' : 'none' }}>
              <div className="sf-skeleton sf-skeleton-line" style={{ width: '18%' }} />
              <div className="sf-skeleton sf-skeleton-line" style={{ width: '10%' }} />
              <div className="sf-skeleton sf-skeleton-line" style={{ width: '12%' }} />
              <div className="sf-skeleton sf-skeleton-line" style={{ width: '14%' }} />
              <div className="sf-skeleton sf-skeleton-line" style={{ width: '10%' }} />
              <div className="sf-skeleton sf-skeleton-line" style={{ width: '18%' }} />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="sf-empty sf-anim-slide-up" style={{ margin: '10px auto', maxWidth: 560 }}>
          <div className="sf-empty-icon">📋</div>
          <p className="sf-empty-title">{tr('Aucun compte suivi', 'No tracked accounts')}</p>
          <p className="sf-empty-desc">{tr('Rappel : chaque téléphone GeeLark fait tourner 1 compte Instagram. Ce tableau relie chaque compte à son modèle, son marché et son statut, et centralise ses accès (mail, mot de passe).', 'Reminder: each GeeLark phone runs 1 Instagram account. This table links every account to its model, market and status, and stores its logins (email, password).')}</p>
          <div style={{ textAlign: 'left', maxWidth: 420, margin: 'var(--sp-4) auto 0', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.7 }}>
            <div><b style={{ color: 'var(--text-2)' }}>{tr('Deux façons de démarrer :', 'Two ways to get started:')}</b></div>
            <div>{tr('1. Importe en un clic les comptes déjà assignés à tes téléphones.', '1. Import in one click the accounts already assigned to your phones.')}</div>
            <div>{tr('2. Ou ajoute une ligne à la main et remplis chaque case (tout s\'enregistre tout seul).', '2. Or add a row by hand and fill each cell (everything saves automatically).')}</div>
            {importCount === 0 && (
              <div style={{ marginTop: 6, color: 'var(--text-4)' }}>{tr('Astuce : assigne d\'abord un pseudo Instagram à tes téléphones (onglet Téléphones) pour pouvoir les importer ici.', 'Tip: first assign an Instagram handle to your phones (Phones tab) so they can be imported here.')}</div>
            )}
          </div>
          <div className="sf-cluster" style={{ justifyContent: 'center', marginTop: 'var(--sp-4)' }}>
            {importCount > 0 && (
              <button onClick={importFromPhones} className="sf-btn sf-btn-secondary sf-btn-sm sf-press cursor-pointer" title={tr('Crée une ligne pour chaque compte Instagram déjà assigné à un téléphone', 'Creates a row for each Instagram account already assigned to a phone')}>{tr(`↧ Importer mes comptes (${importCount})`, `↧ Import my accounts (${importCount})`)}</button>
            )}
            <button onClick={addRow} className="sf-btn sf-btn-primary sf-btn-sm sf-press cursor-pointer">{tr('＋ Ajouter une ligne vide', '＋ Add a blank row')}</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="sf-empty sf-anim-slide-up" style={{ margin: '10px auto', maxWidth: 480 }}>
          <div className="sf-empty-icon">🔍</div>
          <p className="sf-empty-title">{tr('Aucun résultat', 'No results')}</p>
          <p className="sf-empty-desc">{tr('Aucun compte ne correspond à ces filtres.', 'No account matches these filters.')}</p>
          <button onClick={() => { setSearch(''); setMarketFilter('__all__'); setFolderFilter('__all__') }} className="sf-btn sf-btn-ghost sf-btn-sm sf-press cursor-pointer" style={{ marginTop: 'var(--sp-3)' }}>{tr('Réinitialiser les filtres', 'Reset filters')}</button>
        </div>
      ) : (
        <div className="sf-card sf-elev-1 sf-anim-slide-up sf-d150" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="sf-scroll-x" style={{ overflowX: 'auto' }}>
            <table className="sf-table" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1280, fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(180deg, var(--surface-2), var(--surface))' }}>
                  {[tr('Compte', 'Account'), tr('Marché', 'Market'), tr('Dossier', 'Folder'), tr('Pseudo', 'Handle'), 'Insta', 'TikTok', 'Threads', 'YouTube', tr('Mail', 'Email'), tr('Mot de passe', 'Password'), tr('Commentaire', 'Comment'), ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '11px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', borderBottom: '1px solid var(--border-md)', whiteSpace: 'nowrap', position: 'sticky', top: 0 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    {/* Compte + Modèle */}
                    <td style={{ padding: '8px 10px', minWidth: 190 }}>
                      <div className="sf-cluster" style={{ gap: 10, alignItems: 'center' }}>
                        <Avatar name={r.name} pseudo={r.pseudo} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <TextCell value={r.name} placeholder={tr('Nom du compte', 'Account name')} bold onSave={v => patch(r.id, 'name', v)} />
                          <TextCell value={r.model} placeholder={tr('Modèle', 'Model')} small onSave={v => patch(r.id, 'model', v)} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '6px 8px' }}><SelectCell value={r.market} options={MARKETS} onSave={v => patch(r.id, 'market', v)} /></td>
                    <td style={{ padding: '6px 8px', minWidth: 110 }}><TextCell value={r.folder} placeholder="—" onSave={v => patch(r.id, 'folder', v)} /></td>
                    <td style={{ padding: '6px 8px', minWidth: 120 }}><TextCell value={r.pseudo} placeholder="@pseudo" list={pseudoSuggestions} onSave={v => patch(r.id, 'pseudo', v)} /></td>
                    <td style={{ padding: '6px 8px' }}><StatusCell value={r.insta} onSave={v => patch(r.id, 'insta', v)} /></td>
                    <td style={{ padding: '6px 8px' }}><StatusCell value={r.tiktok} onSave={v => patch(r.id, 'tiktok', v)} /></td>
                    <td style={{ padding: '6px 8px' }}><StatusCell value={r.threads} onSave={v => patch(r.id, 'threads', v)} /></td>
                    <td style={{ padding: '6px 8px' }}><StatusCell value={r.youtube} onSave={v => patch(r.id, 'youtube', v)} /></td>
                    <td style={{ padding: '6px 8px', minWidth: 130 }}><TextCell value={r.mail} placeholder="mail@…" onSave={v => patch(r.id, 'mail', v)} /></td>
                    <td style={{ padding: '6px 8px', minWidth: 120 }}><TextCell value={r.password} placeholder={tr('mot de passe', 'password')} onSave={v => patch(r.id, 'password', v)} /></td>
                    <td style={{ padding: '6px 8px', minWidth: 180 }}><TextCell value={r.comment} placeholder={tr('commentaire…', 'comment…')} onSave={v => patch(r.id, 'comment', v)} /></td>
                    <td style={{ padding: '6px 8px' }}>
                      <button onClick={() => delRow(r.id)} title={tr('Supprimer la ligne', 'Delete row')} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm sf-press cursor-pointer" style={{ color: 'var(--text-4)', fontSize: 13 }}>🗑️</button>
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

// ── KPI stat card (présentation) ──────────────────────────────────────────────
function StatCard({ label, value, accent, glyph, tint, fg }: { label: string; value: number; accent: string; glyph: string; tint: string; fg: string }) {
  return (
    <div className="sf-stat-card sf-card-lift">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)' }}>{label}</span>
        <span aria-hidden style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: tint, color: fg, fontSize: 12, flex: '0 0 auto' }}>{glyph}</span>
      </div>
      <div className="sf-tabular" style={{ fontFamily: "'Space Grotesk', 'Manrope', sans-serif", fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>{value}</div>
      <div aria-hidden style={{ height: 3, borderRadius: 3, background: accent, opacity: 0.85, width: '100%' }} />
    </div>
  )
}

// ── Avatar (initiale, présentation) ───────────────────────────────────────────
function Avatar({ name, pseudo }: { name: string | null; pseudo: string | null }) {
  const src = (name || pseudo || '').replace(/^@+/, '').trim()
  const initial = src ? src[0].toUpperCase() : '·'
  // Dégradé indigo/violet déterministe selon la première lettre.
  const grads = [
    'linear-gradient(135deg,#818CF8,#8B5CF6)',
    'linear-gradient(135deg,#6366F1,#A5B4FC)',
    'linear-gradient(135deg,#8B5CF6,#6366F1)',
    'linear-gradient(135deg,#A5B4FC,#818CF8)',
  ]
  const g = grads[(initial.charCodeAt(0) || 0) % grads.length]
  return (
    <span aria-hidden style={{
      width: 34, height: 34, borderRadius: 10, flex: '0 0 auto', display: 'grid', placeItems: 'center',
      background: g, color: '#fff', fontSize: 14, fontWeight: 800,
      boxShadow: '0 4px 12px -4px rgba(99,102,241,0.6), inset 0 1px 0 rgba(255,255,255,0.3)',
    }}>{initial}</span>
  )
}

// ── Cellules ──────────────────────────────────────────────────────────────────
function TextCell({ value, placeholder, bold, small, list, onSave }: { value: string | null; placeholder?: string; bold?: boolean; small?: boolean; list?: string[]; onSave: (v: string) => void }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  const [listId] = useState(() => `dl-${Math.random().toString(36).slice(2, 9)}`)
  return (
    <>
    {list && list.length > 0 && <datalist id={listId}>{list.map(o => <option key={o} value={o} />)}</datalist>}
    <input
      list={list && list.length > 0 ? listId : undefined}
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
    </>
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
