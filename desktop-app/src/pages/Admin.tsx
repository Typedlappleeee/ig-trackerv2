import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PanelHead, PageHead, Empty, Modal } from '@/lib/ui'

// ── Panel Admin (superadmin) : création + historique des clés de licence et des
//    codes de crédits. Porté de electron-app/src/pages/Licences.tsx. ──────────────
interface LicenseKey {
  id: string; key: string; user_id: string | null; created_at: string
  activated_at: string | null; expires_at: string | null; is_active: boolean
  plan: string; blowsome?: boolean; notes: string | null; user_email?: string
}
interface CreditCode {
  id: string; code: string; amount: number; used_by: string | null
  used_at: string | null; is_active: boolean; notes: string | null; created_at: string
}

const DURATIONS: { l: string; days: number | null }[] = [
  { l: '24h', days: 1 }, { l: '7 jours', days: 7 }, { l: '30 jours', days: 30 },
  { l: '90 jours', days: 90 }, { l: '1 an', days: 365 }, { l: 'À vie', days: null },
]
const PLANS = ['standard', 'pro', 'business']
type Filter = 'all' | 'active' | 'used' | 'expired' | 'revoked'

function hexSeg(): string {
  const b = new Uint8Array(2); crypto.getRandomValues(b)
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}
const genKey = () => `${hexSeg()}-${hexSeg()}-${hexSeg()}-${hexSeg()}`
const genCode = () => `CR-${hexSeg()}-${hexSeg()}`

function keyStatus(k: LicenseKey): Filter {
  if (!k.is_active) return 'revoked'
  if (k.expires_at && new Date(k.expires_at).getTime() < Date.now()) return 'expired'
  if (k.user_id) return 'used'
  return 'active'
}
function daysLeft(exp: string | null): string {
  if (!exp) return '∞ à vie'
  const d = Math.ceil((new Date(exp).getTime() - Date.now()) / 86_400_000)
  return d < 0 ? 'Expiré' : d === 0 ? "Expire aujourd'hui" : `${d}j restants`
}
const STATUS_TONE: Record<Filter, 'ok' | 'info' | 'warn' | 'bad' | 'mute'> = {
  all: 'mute', active: 'ok', used: 'info', expired: 'warn', revoked: 'bad',
}
const STATUS_LABEL: Record<Filter, string> = {
  all: 'Toutes', active: 'Active', used: 'Utilisée', expired: 'Expirée', revoked: 'Révoquée',
}

export default function Admin({ theme, user }: { theme: Theme; user: User }) {
  const [keys, setKeys] = useState<LicenseKey[]>([])
  const [codes, setCodes] = useState<CreditCode[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  // Formulaire clé
  const [gk, setGk] = useState(genKey)
  const [duration, setDuration] = useState<number | null>(30)
  const [plan, setPlan] = useState('standard')
  const [blowsome, setBlowsome] = useState(false)
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)
  // Formulaire code
  const [gc, setGc] = useState(genCode)
  const [ccAmount, setCcAmount] = useState(500)
  const [ccNotes, setCcNotes] = useState('')
  const [ccCreating, setCcCreating] = useState(false)
  // Filtres / recherche
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [delTarget, setDelTarget] = useState<LicenseKey | null>(null)
  const [extendFor, setExtendFor] = useState<string | null>(null)

  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(t) } }, [notice])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('license_keys').select('*').order('created_at', { ascending: false })
    if (data) {
      const uids = [...new Set(data.filter((k: LicenseKey) => k.user_id).map((k: LicenseKey) => k.user_id!))]
      const emails: Record<string, string> = {}
      if (uids.length) {
        const { data: profs } = await supabase.from('profiles').select('id,email').in('id', uids)
        ;(profs ?? []).forEach((p: { id: string; email: string }) => { emails[p.id] = p.email })
      }
      setKeys((data as LicenseKey[]).map(k => ({ ...k, user_email: k.user_id ? emails[k.user_id] : undefined })))
    }
    const { data: cc } = await supabase.from('credit_codes').select('*').order('created_at', { ascending: false })
    setCodes((cc ?? []) as CreditCode[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function createKey() {
    setCreating(true)
    const expires_at = duration !== null ? new Date(Date.now() + duration * 86_400_000).toISOString() : null
    const row: Record<string, unknown> = { key: gk, expires_at, plan, notes: notes || null, duration_days: duration, blowsome }
    let error: { message: string } | null = null
    for (let i = 0; i < 3; i++) {
      const res = await supabase.from('license_keys').insert(row); error = res.error
      if (!error) break
      const m = error.message.match(/(duration_days|blowsome)/)
      if (m && m[1] in row) { delete row[m[1]]; continue }
      break
    }
    setCreating(false)
    if (error) { setNotice(`Échec création clé : ${error.message}`); return }
    setNotice(`Clé créée : ${gk}`); setGk(genKey()); setNotes(''); load()
  }
  async function revokeKey(id: string) { const { error } = await supabase.from('license_keys').update({ is_active: false }).eq('id', id); if (error) setNotice(error.message); else load() }
  async function deleteKey() { if (!delTarget) return; const { error } = await supabase.from('license_keys').delete().eq('id', delTarget.id); setDelTarget(null); if (error) setNotice(error.message); else load() }
  async function extendKey(k: LicenseKey, days: number) {
    if (!k.expires_at) { setNotice('Clé à vie — rien à ajouter.'); return }
    const base = Math.max(Date.now(), new Date(k.expires_at).getTime())
    const next = new Date(Math.max(Date.now(), base + days * 86_400_000)).toISOString()
    const { error } = await supabase.from('license_keys').update({ expires_at: next, is_active: true }).eq('id', k.id)
    setExtendFor(null); if (error) setNotice(error.message); else { setNotice(`${days > 0 ? '+' : ''}${days}j — ${daysLeft(next)}`); load() }
  }
  async function toggleBlowsome(k: LicenseKey) {
    const next = !k.blowsome
    const { error } = await supabase.from('license_keys').update({ blowsome: next }).eq('id', k.id)
    if (error) setNotice(/blowsome/.test(error.message) ? 'Migration 20260722_license_blowsome.sql requise.' : error.message)
    else { setKeys(prev => prev.map(x => x.id === k.id ? { ...x, blowsome: next } : x)); setNotice(next ? 'Blowsome activé ✦' : 'Blowsome retiré') }
  }
  async function createCode() {
    setCcCreating(true)
    const { error } = await supabase.from('credit_codes').insert({ code: gc, amount: ccAmount, notes: ccNotes || null, created_by: user.id })
    setCcCreating(false)
    if (error) { setNotice(`Échec code : ${error.message}`); return }
    setNotice(`Code créé : ${gc} (${ccAmount} cr)`); setGc(genCode()); setCcNotes(''); load()
  }
  async function revokeCode(id: string) { const { error } = await supabase.from('credit_codes').update({ is_active: false }).eq('id', id); if (error) setNotice(error.message); else load() }

  function copy(txt: string) { navigator.clipboard?.writeText(txt); setCopied(txt); setNotice('Copié.'); setTimeout(() => setCopied(c => c === txt ? null : c), 1500) }

  const ql = search.trim().toLowerCase()
  const shownKeys = keys.filter(k =>
    (filter === 'all' || keyStatus(k) === filter) &&
    (!ql || k.key.toLowerCase().includes(ql) || (k.user_email ?? '').toLowerCase().includes(ql) || (k.notes ?? '').toLowerCase().includes(ql)))
  const counts: Record<Filter, number> = { all: keys.length, active: 0, used: 0, expired: 0, revoked: 0 }
  keys.forEach(k => { counts[keyStatus(k)]++ })

  const inp: CSSProperties = { height: 32, boxSizing: 'border-box', padding: '0 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#EDEDEF', fontSize: 13, outline: 'none' }
  const sel: CSSProperties = { ...inp, cursor: 'pointer' }
  const opt: CSSProperties = { background: '#161618' }
  const mono: CSSProperties = { fontFamily: "'JetBrains Mono',monospace" }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Admin · Licences" sub="Création et historique des clés de licence et des codes de crédits. Réservé au superadmin." actions={<Chip text="Superadmin" tone="violet" />} />

      {notice && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', color: '#EDEDEF', fontSize: 13 }}>{notice}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        {/* ── Colonne gauche : liste des clés ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel theme={theme}>
            <PanelHead title="Clés de licence" sub={`${keys.length} au total`} right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, boxSizing: 'border-box', padding: '0 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#71717A' }}>
                <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M20 20l-3.5-3.5" size={13} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (clé, email, note)…" style={{ width: 200, maxWidth: '40vw', border: 'none', background: 'transparent', color: '#EDEDEF', fontSize: 13, outline: 'none' }} />
              </div>} />
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'inline-flex', gap: 2, padding: 2, maxWidth: '100%', flexWrap: 'wrap', boxSizing: 'border-box', borderRadius: 7, background: '#111113', border: '1px solid rgba(255,255,255,0.07)' }}>
                {(['all', 'active', 'used', 'expired', 'revoked'] as Filter[]).map(f => (
                  <button type="button" key={f} onClick={() => setFilter(f)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', border: 'none', borderRadius: 5, cursor: 'pointer', background: filter === f ? 'rgba(255,255,255,0.08)' : 'transparent', color: filter === f ? '#EDEDEF' : '#8B8B94', fontSize: 12, fontWeight: 500 }}>
                    {STATUS_LABEL[f]}<span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: filter === f ? '#A1A1AA' : '#71717A' }}>{counts[f]}</span>
                  </button>
                ))}
              </div>
            </div>
            {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#71717A', fontSize: 13 }}>…</div>
              : shownKeys.length === 0 ? <Empty icon="M15 7a2 2 0 0 1 2 2m4-2a6 6 0 0 1-7.7 5.7L10 16H8v2H6v2H2v-4l6.3-6.3A6 6 0 1 1 21 7z" title="Aucune clé" text="Crée ta première clé de licence à droite." />
              : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {shownKeys.map(k => {
                    const st = keyStatus(k)
                    return (
                      <div key={k.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ ...mono, fontSize: 12.5, fontWeight: 500, color: '#EDEDEF' }}>{k.key}</span>
                          <button type="button" onClick={() => copy(k.key)} title="Copier" style={{ display: 'flex', width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(255,255,255,0.09)', background: 'transparent', color: copied === k.key ? '#4ADE80' : '#71717A', cursor: 'pointer' }}><Icon d={copied === k.key ? 'M20 6 9 17l-5-5' : 'M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z|M5 15H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1'} size={12} /></button>
                          <Chip text={STATUS_LABEL[st]} tone={STATUS_TONE[st]} />
                          <Chip text={k.plan} tone="mute" />
                          {k.blowsome && <Chip text="Blowsome ✦" tone="violet" />}
                          <span style={{ marginLeft: 'auto', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: st === 'expired' ? '#FBBF24' : '#8B8B94' }}>{daysLeft(k.expires_at)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8B8B94', flexWrap: 'wrap' }}>
                          <span>{k.user_email ? `👤 ${k.user_email}` : 'Non activée'}</span>
                          <span style={{ color: '#5A5A63' }}>·</span>
                          <span>créée {new Date(k.created_at).toLocaleDateString('fr-FR')}</span>
                          {k.notes && <><span style={{ color: '#5A5A63' }}>·</span><span style={{ color: '#A1A1AA' }}>{k.notes}</span></>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginLeft: -10 }}>
                          <Btn theme={theme} sm tone="quiet" label={k.blowsome ? 'Retirer Blowsome' : 'Ajouter Blowsome'} onClick={() => toggleBlowsome(k)} />
                          {k.expires_at && <Btn theme={theme} sm tone="quiet" label="+ durée" onClick={() => setExtendFor(extendFor === k.id ? null : k.id)} />}
                          {k.is_active && <Btn theme={theme} sm tone="quiet" label="Révoquer" onClick={() => revokeKey(k.id)} />}
                          <Btn theme={theme} sm tone="danger" label="Supprimer" onClick={() => setDelTarget(k)} />
                          {extendFor === k.id && (
                            <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6 }}>
                              {[7, 30, 90, 365].map(d => <button type="button" key={d} onClick={() => extendKey(k, d)} style={{ height: 28, padding: '0 9px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.09)', background: '#161618', color: '#EDEDEF', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}>+{d}j</button>)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
          </Panel>

          {/* ── Codes de crédits ── */}
          <Panel theme={theme}>
            <PanelHead title="Codes de crédits" sub={`${codes.length} au total`} />
            {codes.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#8B8B94', fontSize: 13 }}>Aucun code.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {codes.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, boxSizing: 'border-box', padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
                    <span style={{ ...mono, fontSize: 12.5, fontWeight: 500, color: '#EDEDEF' }}>{c.code}</span>
                    <button type="button" onClick={() => copy(c.code)} title="Copier" style={{ display: 'flex', width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(255,255,255,0.09)', background: 'transparent', color: copied === c.code ? '#4ADE80' : '#71717A', cursor: 'pointer' }}><Icon d="M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z" size={12} /></button>
                    <Chip text={`${c.amount} cr`} tone="ok" />
                    {c.used_by ? <Chip text="Utilisé" tone="info" /> : c.is_active ? <Chip text="Actif" tone="ok" /> : <Chip text="Révoqué" tone="bad" />}
                    {c.notes && <span style={{ fontSize: 12, color: '#8B8B94' }}>{c.notes}</span>}
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      {c.is_active && !c.used_by && <Btn theme={theme} sm tone="quiet" label="Révoquer" onClick={() => revokeCode(c.id)} />}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ── Colonne droite : formulaires de création ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel theme={theme}>
            <PanelHead title="Nouvelle clé" />
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Clé générée</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={gk} onChange={e => setGk(e.target.value.toUpperCase())} style={{ ...inp, ...mono, flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500 }} />
                  <Btn theme={theme} tone="ghost" label="↻" onClick={() => setGk(genKey())} />
                </div>
              </div>
              <div>
                <label style={lbl}>Durée</label>
                <select value={String(duration)} onChange={e => setDuration(e.target.value === 'null' ? null : Number(e.target.value))} style={{ ...sel, width: '100%' }}>
                  {DURATIONS.map(d => <option key={d.l} value={String(d.days)} style={opt}>{d.l}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Plan</label>
                <select value={plan} onChange={e => setPlan(e.target.value)} style={{ ...sel, width: '100%' }}>
                  {PLANS.map(p => <option key={p} value={p} style={opt}>{p}</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#EDEDEF', cursor: 'pointer' }}>
                <span onClick={() => setBlowsome(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: blowsome ? 'flex-end' : 'flex-start', width: 32, height: 18, padding: 2, boxSizing: 'border-box', flexShrink: 0, borderRadius: 99, background: blowsome ? theme.accent : 'rgba(255,255,255,0.12)', transition: 'background .12s ease' }}><span style={{ width: 14, height: 14, borderRadius: 99, background: '#fff' }} /></span>
                Add-on Blowsome ✦ (accès infra VIP)
              </label>
              <div>
                <label style={lbl}>Note (optionnel)</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex. Client Luna" style={{ ...inp, width: '100%' }} />
              </div>
              <Btn theme={theme} tone="primary" label={creating ? 'Création…' : 'Créer la clé'} disabled={creating || !gk.trim()} onClick={createKey} />
            </div>
          </Panel>

          <Panel theme={theme}>
            <PanelHead title="Nouveau code de crédits" />
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Code généré</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={gc} onChange={e => setGc(e.target.value.toUpperCase())} style={{ ...inp, ...mono, flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500 }} />
                  <Btn theme={theme} tone="ghost" label="↻" onClick={() => setGc(genCode())} />
                </div>
              </div>
              <div>
                <label style={lbl}>Montant (crédits)</label>
                <input type="number" min={1} value={ccAmount} onChange={e => setCcAmount(Math.max(1, Number(e.target.value)))} style={{ ...inp, width: '100%' }} />
              </div>
              <div>
                <label style={lbl}>Note (optionnel)</label>
                <input value={ccNotes} onChange={e => setCcNotes(e.target.value)} style={{ ...inp, width: '100%' }} />
              </div>
              <Btn theme={theme} tone="primary" label={ccCreating ? 'Création…' : 'Créer le code'} disabled={ccCreating || !gc.trim()} onClick={createCode} />
            </div>
          </Panel>
        </div>
      </div>

      {delTarget && (
        <Modal theme={theme} title="Supprimer cette clé ?" icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" onClose={() => setDelTarget(null)}
          footer={<><Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setDelTarget(null)} /><Btn theme={theme} tone="danger" label="Supprimer" onClick={deleteKey} /></>}>
          <p style={{ margin: 0, fontSize: 13, color: '#A1A1AA', lineHeight: 1.6 }}>La clé <b style={{ ...mono, fontWeight: 600, color: '#EDEDEF' }}>{delTarget.key}</b> sera définitivement supprimée. Pour juste la désactiver, utilise « Révoquer ».</p>
        </Modal>
      )}
    </div>
  )
}

const lbl: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#8B8B94', marginBottom: 6 }
