import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { BankPicker } from '@/pages/Bank'
import { postInstagramPhoto, stopPhone } from '@/lib/geelark'
import { checkAndDeductCredits, refundCredits, CREDIT_COSTS } from '@/lib/credits'
import { useToast } from '@/components/Toast'
import { ACCENT, TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR, BG_2 as BG2, OK, ERR } from '@/lib/theme'

type Row = { phone: Phone; status: 'idle' | 'posting' | 'done' | 'error'; detail?: string }

export function PhotoPosting({ user }: { user: User }) {
  const { currentOrg } = useOrg()
  const conns = useConnections(user)
  const bearer = conns.bearer ?? ''
  const toast = useToast()

  const [phones, setPhones]     = useState<Phone[]>([])
  const [sel, setSel]           = useState<Set<string>>(new Set())
  const [group, setGroup]       = useState('Tous')
  const [groups, setGroups]     = useState<string[]>(['Tous'])
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageTitle, setImageTitle] = useState('')
  const [caption, setCaption]   = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [running, setRunning]   = useState(false)
  const [rows, setRows]         = useState<Row[]>([])
  const [logs, setLogs]         = useState<string[]>([])

  useEffect(() => {
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      const ps = (data ?? []) as Phone[]
      setPhones(ps)
      const g = [...new Set(ps.map(p => p.group_name).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...g])
    })
  }, [currentOrg?.id, user.id])

  const visible = phones.filter(p => group === 'Tous' || p.group_name === group)
  const log = (m: string) => setLogs(prev => [...prev.slice(-300), m])
  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAllVisible = () => setSel(new Set(visible.map(p => p.id)))

  async function run() {
    const chosen = phones.filter(p => sel.has(p.id))
    if (chosen.length === 0) { toast.show({ title: 'Sélectionne au moins un compte', kind: 'error' }); return }
    if (!imageUrl) { toast.show({ title: 'Choisis une photo', kind: 'error' }); return }
    if (!bearer) { toast.show({ title: 'Token GeeLark manquant', body: 'Ajoute-le dans Paramètres → Connexions', kind: 'error' }); return }

    const cost = chosen.length * CREDIT_COSTS.posting
    const ded = await checkAndDeductCredits(user.id, cost)
    if (!ded.ok) { toast.show({ title: 'Crédits insuffisants', body: ded.error ?? `${cost} crédits requis`, kind: 'error' }); return }

    setRunning(true)
    setLogs([])
    setRows(chosen.map(p => ({ phone: p, status: 'idle' })))
    const setRow = (id: string, patch: Partial<Row>) => setRows(prev => prev.map(r => r.phone.id === id ? { ...r, ...patch } : r))

    let okCount = 0
    for (const p of chosen) {
      const name = p.ig_username ?? p.phone_name
      setRow(p.id, { status: 'posting' })
      log(`▶ ${name}…`)
      try {
        const res = await postInstagramPhoto(bearer, p.geelark_id, { imageUrl, caption: caption || undefined }, m => log(`   ${m}`))
        if (res.ok) { okCount++; setRow(p.id, { status: 'done' }); log(`✅ Publié : ${name}`) }
        else { setRow(p.id, { status: 'error', detail: res.error }); log(`❌ Échec (${name}) : ${res.error ?? 'inconnu'}`) }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setRow(p.id, { status: 'error', detail: msg }); log(`❌ Erreur (${name}) : ${msg}`)
      } finally {
        await stopPhone(bearer, p.geelark_id).catch(() => {})
      }
    }

    const failed = chosen.length - okCount
    if (failed > 0) await refundCredits(user.id, failed * CREDIT_COSTS.posting)
    // Historique (post_runs)
    supabase.from('post_runs').insert({
      user_id: user.id, org_id: currentOrg?.id ?? null, type: 'posting',
      ok_count: okCount, err_count: failed, total: chosen.length,
      phone_results: chosen.map(p => {
        const r = rows.find(x => x.phone.id === p.id)
        const ok = r?.status === 'done'
        return { name: p.ig_username ?? p.phone_name, ok, ...(ok ? {} : { error: r?.detail || 'Échec' }) }
      }),
    }).then(() => {}, () => {})

    setRunning(false)
    toast.show({ title: failed === 0 ? 'Photos publiées ✓' : 'Terminé avec erreurs', body: `${okCount}/${chosen.length} réussi(s)`, kind: failed === 0 ? 'ok' : 'error' })
  }

  const pill = (s: Row['status']) => s === 'done' ? OK : s === 'error' ? ERR : s === 'posting' ? ACCENT : FAINT

  return (
    <div style={{ minHeight: '100%', background: 'var(--base)', padding: '24px 28px 80px', boxSizing: 'border-box', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: IVORY }}>🖼️ Publication photo</h1>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: MUTED }}>Publie une photo dans le feed sur tous les comptes choisis, avec la même légende.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
          {/* Photo + légende */}
          <div style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: IVORY, marginBottom: 10 }}>Photo</div>
            <button onClick={() => setShowPicker(true)} className="sf-btn sf-btn-ghost" style={{ width: '100%', marginBottom: 12 }}>
              {imageUrl ? `📷 ${imageTitle || 'Photo choisie'} — changer` : '＋ Choisir une photo dans la banque'}
            </button>
            {imageUrl && <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 10, background: '#000', marginBottom: 12 }} />}
            <div style={{ fontSize: 12, fontWeight: 700, color: IVORY, marginBottom: 8 }}>Légende</div>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Ta légende…" rows={4}
              style={{ width: '100%', resize: 'vertical', background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, borderRadius: 10, color: IVORY, fontSize: 13, padding: 10, boxSizing: 'border-box' }} />
          </div>

          {/* Comptes */}
          <div style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: IVORY }}>Comptes ({sel.size})</span>
              <button onClick={selectAllVisible} className="sf-btn sf-btn-ghost sf-btn-sm">Tout</button>
            </div>
            <select value={group} onChange={e => setGroup(e.target.value)}
              style={{ width: '100%', marginBottom: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, borderRadius: 8, color: IVORY, fontSize: 12.5, padding: '7px 10px' }}>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {visible.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: sel.has(p.id) ? 'rgba(99,102,241,0.1)' : 'transparent' }}>
                  <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
                  <span style={{ fontSize: 12.5, color: IVORY }}>{p.ig_username ?? p.phone_name}</span>
                  {p.group_name && <span style={{ fontSize: 10.5, color: FAINT, marginLeft: 'auto' }}>{p.group_name}</span>}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <button onClick={run} disabled={running} className="sf-btn sf-btn-primary" style={{ minWidth: 180 }}>
            {running ? 'Publication…' : `Publier (${sel.size * CREDIT_COSTS.posting} cr)`}
          </button>
          <span style={{ fontSize: 11.5, color: FAINT }}>⚠️ Automatisation ADB (bêta) — vérifie le résultat sur quelques comptes d'abord.</span>
        </div>

        {/* Statuts + logs */}
        {rows.length > 0 && (
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 14 }}>
            <div style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 12, padding: 12 }}>
              {rows.map(r => (
                <div key={r.phone.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12.5, color: IVORY }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: pill(r.status) }} />
                  {r.phone.ig_username ?? r.phone.phone_name}
                  {r.detail && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: FAINT }}>{r.detail.slice(0, 30)}</span>}
                </div>
              ))}
            </div>
            <div style={{ background: '#0a0a0f', border: `1px solid ${HAIR}`, borderRadius: 12, padding: 12, fontFamily: 'monospace', fontSize: 11, color: 'rgba(226,232,240,0.75)', maxHeight: 260, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {logs.join('\n') || 'Logs…'}
            </div>
          </div>
        )}
      </div>

      {showPicker && (
        <BankPicker
          user={user}
          mode="single"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            if (paths[0]) { setImageUrl(paths[0]); setImageTitle(titles?.[0] ?? '') }
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
