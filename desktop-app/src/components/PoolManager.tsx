// Onglet « Pools » de la Banque : des pools de légendes (autant de textes que voulu, 100+),
// utilisés par Auto-contenu et le Studio (menu « 📚 Mes pools »). Un pool est rangé dans
// caption_bank avec le titre « Pool · <nom> » et une légende par ligne.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { toast, promptDialog, confirmDialog, Icon } from '@/lib/ui'

export const POOL_PREFIX = 'Pool · '
interface Pool { id: string; name: string; lines: string[]; created_at: string }
const toLines = (t: string) => t.split('\n').map(s => s.trim()).filter(Boolean)

const INK = '#EDEDEF', MUTED = '#8B8B94', EDGE = 'rgba(255,255,255,0.08)', FIELD_BG = '#161618'
const card: CSSProperties = { background: '#111113', border: `1px solid ${EDGE}`, borderRadius: 12 }
const btn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${EDGE}`, background: FIELD_BG, color: '#E4E4E7', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
const primary: CSSProperties = { ...btn, background: '#EDEDEF', color: '#0A0A0B', border: '1px solid #EDEDEF' }

export default function PoolManager({ orgId, userId, onChanged }: { orgId: string | null; userId: string; onChanged?: () => void }) {
  const [pools, setPools] = useState<Pool[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [paste, setPaste] = useState('')
  const [q, setQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    let qq = supabase.from('caption_bank').select('id,title,content,created_at').like('title', `${POOL_PREFIX}%`)
    qq = orgId ? qq.eq('org_id', orgId) : qq.eq('user_id', userId).is('org_id', null)
    const { data } = await qq.order('title')
    const l = ((data ?? []) as { id: string; title: string; content: string; created_at: string }[]).map(r => ({ id: r.id, name: r.title.slice(POOL_PREFIX.length), lines: toLines(r.content), created_at: r.created_at }))
    setPools(l)
    return l
  }, [orgId, userId])
  useEffect(() => { void load() }, [load])
  const cur = pools?.find(p => p.id === sel) ?? null
  const open = (p: Pool) => { setSel(p.id); setDraft(p.lines); setDirty(false); setPaste(''); setQ('') }

  async function create() {
    const name = await promptDialog({ title: 'Nouveau pool de légendes', placeholder: 'Nom du pool (ex. Kenza FR)', confirmLabel: 'Créer' })
    if (!name?.trim()) return
    const { data, error } = await supabase.from('caption_bank').insert({ user_id: userId, org_id: orgId, title: POOL_PREFIX + name.trim().slice(0, 60), content: '', used_count: 0 }).select('id').single()
    if (error) { toast(error.message, 'bad'); return }
    const l = await load(); const p = l.find(x => x.id === (data as { id: string }).id); if (p) open(p)
    onChanged?.()
  }
  async function save() {
    if (!cur) return
    const { error } = await supabase.from('caption_bank').update({ content: draft.join('\n') }).eq('id', cur.id)
    if (error) { toast(error.message, 'bad'); return }
    setDirty(false); toast(`Pool « ${cur.name} » enregistré · ${draft.length} texte(s)`, 'ok'); await load(); onChanged?.()
  }
  async function rename() {
    if (!cur) return
    const name = await promptDialog({ title: 'Renommer le pool', value: cur.name, confirmLabel: 'Renommer' })
    if (!name?.trim()) return
    await supabase.from('caption_bank').update({ title: POOL_PREFIX + name.trim().slice(0, 60) }).eq('id', cur.id)
    await load(); onChanged?.()
  }
  async function remove() {
    if (!cur || !await confirmDialog({ title: `Supprimer le pool « ${cur.name} » ?`, text: `${cur.lines.length} texte(s) seront supprimés.`, confirmLabel: 'Supprimer', danger: true })) return
    await supabase.from('caption_bank').delete().eq('id', cur.id)
    setSel(null); await load(); onChanged?.()
  }
  const set = (l: string[]) => { setDraft(l); setDirty(true) }
  function addPasted() {
    const add = toLines(paste); if (!add.length) return
    set([...draft, ...add]); setPaste('')
    toast(`${add.length} texte(s) ajouté(s)`, 'ok')
  }
  async function importTxt(f: File | undefined) {
    if (!f) return
    const add = toLines(await f.text()); if (!add.length) return
    set([...draft, ...add]); toast(`${add.length} texte(s) importé(s) depuis ${f.name}`, 'ok')
  }
  const dupes = draft.length - new Set(draft.map(s => s.toLowerCase())).size
  const shown = useMemo(() => draft.map((t, i) => ({ t, i })).filter(x => !q || x.t.toLowerCase().includes(q.toLowerCase())), [draft, q])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
      {/* liste des pools */}
      <div style={{ ...card, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" onClick={() => void create()} style={{ ...primary, justifyContent: 'center' }}>＋ Nouveau pool</button>
        {pools === null && <span style={{ fontSize: 12.5, color: MUTED, padding: 8 }}>Chargement…</span>}
        {pools?.length === 0 && <span style={{ fontSize: 12.5, color: MUTED, padding: 8, lineHeight: 1.5 }}>Aucun pool. Crée-en un et mets-y autant de textes que tu veux : Auto-contenu et le Studio les utilisent pour varier les légendes.</span>}
        {pools?.map(p => {
          const on = p.id === sel
          return (
            <button key={p.id} type="button" onClick={() => { if (dirty && !window.confirm('Modifications non enregistrées : les abandonner ?')) return; open(p) }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left', background: on ? 'rgba(255,255,255,0.08)' : 'transparent', color: on ? '#F4F4F5' : '#A1A1AA' }}>
              <span style={{ fontSize: 15 }}>📚</span>
              <span data-no-tr style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              <span style={{ fontSize: 11.5, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{p.lines.length}</span>
            </button>
          )
        })}
      </div>

      {/* éditeur */}
      {!cur ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: MUTED, fontSize: 13 }}>Choisis un pool à gauche, ou crée-en un.</div>
      ) : (
        <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span data-no-tr style={{ fontSize: 17, fontWeight: 700, color: INK }}>{cur.name}</span>
            <span style={{ fontSize: 12.5, color: MUTED }}>{`${draft.length} texte(s)`}</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => void rename()} style={btn}>Renommer</button>
            <button type="button" onClick={() => void remove()} style={{ ...btn, color: '#FCA5A5' }}>Supprimer</button>
            <button type="button" onClick={() => void save()} disabled={!dirty} style={{ ...primary, opacity: dirty ? 1 : 0.5 }}>{dirty ? '💾 Enregistrer' : '✓ Enregistré'}</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={4} placeholder={'Colle ici autant de textes que tu veux, un par ligne (100, 500…)\nEx : POV : tu restes jusqu’à la fin 👀'}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addPasted() }}
              style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: FIELD_BG, border: `1px solid ${EDGE}`, color: INK, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={addPasted} disabled={!paste.trim()} style={{ ...primary, opacity: paste.trim() ? 1 : 0.5 }}>{`＋ Ajouter ${toLines(paste).length || ''} texte(s)`}</button>
              <button type="button" onClick={() => fileRef.current?.click()} style={btn}><Icon d="M12 16V4|M7 9l5-5 5 5|M4 20h16" size={12} /> Importer un .txt</button>
              <input ref={fileRef} type="file" accept=".txt,text/plain,.csv" hidden onChange={e => { void importTxt(e.target.files?.[0]); e.target.value = '' }} />
              {dupes > 0 && <button type="button" onClick={() => { const seen = new Set<string>(); set(draft.filter(t => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })) }} style={btn}>{`Retirer ${dupes} doublon(s)`}</button>}
              {draft.length > 0 && <button type="button" onClick={() => set([...draft].sort(() => Math.random() - 0.5))} style={btn}>🔀 Mélanger</button>}
              {draft.length > 0 && <button type="button" onClick={async () => { if (await confirmDialog({ title: `Vider les ${draft.length} textes ?`, confirmLabel: 'Vider', danger: true })) set([]) }} style={{ ...btn, color: MUTED }}>Tout vider</button>}
            </div>
          </div>

          {draft.length > 8 && <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher dans le pool…" style={{ height: 32, padding: '0 10px', borderRadius: 8, background: FIELD_BG, border: `1px solid ${EDGE}`, color: INK, fontSize: 12.5, outline: 'none' }} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 520, overflowY: 'auto' }}>
            {shown.map(({ t, i }) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 8, background: '#0D0D0F', border: `1px solid ${EDGE}` }}>
                <span style={{ width: 34, textAlign: 'right', fontSize: 11, color: '#5A5A63', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{i + 1}</span>
                <input value={t} data-no-tr onChange={e => { const l = [...draft]; l[i] = e.target.value; set(l) }}
                  style={{ flex: 1, minWidth: 0, height: 30, padding: '0 8px', border: 'none', background: 'transparent', color: INK, fontSize: 13, outline: 'none' }} />
                <button type="button" title="Retirer" onClick={() => set(draft.filter((_, k) => k !== i))} style={{ background: 'none', border: 'none', color: '#5A5A63', cursor: 'pointer', padding: 4, display: 'flex' }}><Icon d="M18 6L6 18|M6 6l12 12" size={12} /></button>
              </div>
            ))}
            {draft.length === 0 && <span style={{ fontSize: 12.5, color: MUTED, padding: 6 }}>Pool vide : colle des textes au-dessus.</span>}
          </div>
        </div>
      )}
    </div>
  )
}
