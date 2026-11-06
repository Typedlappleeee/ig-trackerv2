// Pools de légendes ENREGISTRÉS (Auto-contenu, Studio) : un pool = plusieurs légendes (une par ligne)
// gardées sous un nom, partagées dans l'espace. Rangés dans la banque de légendes (caption_bank)
// avec le titre « Pool · <nom> » : visibles aussi dans Banque › Légendes.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { toast, promptDialog, confirmDialog } from '@/lib/ui'

const PREFIX = 'Pool · '
interface Pool { id: string; name: string; content: string }

export default function CaptionPools({ value, onChange, orgId, userId, selStyle, btnStyle }: {
  value: string; onChange: (v: string) => void; orgId: string | null; userId: string; selStyle?: CSSProperties; btnStyle?: CSSProperties
}) {
  const [pools, setPools] = useState<Pool[]>([])
  const [cur, setCur] = useState('')
  const scope = useCallback((q: any) => orgId ? q.eq('org_id', orgId) : q.eq('user_id', userId).is('org_id', null), [orgId, userId])   // eslint-disable-line @typescript-eslint/no-explicit-any
  const load = useCallback(async () => {
    const { data } = await scope(supabase.from('caption_bank').select('id,title,content').like('title', `${PREFIX}%`)).order('title')
    setPools(((data ?? []) as { id: string; title: string; content: string }[]).map(r => ({ id: r.id, name: r.title.slice(PREFIX.length), content: r.content })))
  }, [scope])
  useEffect(() => { void load() }, [load])

  const count = value.split('\n').map(s => s.trim()).filter(Boolean).length
  async function save() {
    if (!count) { toast('Écris au moins une légende (une par ligne) avant d’enregistrer.', 'bad'); return }
    const old = pools.find(p => p.id === cur)
    const name = await promptDialog({ title: 'Enregistrer ce pool de légendes', text: `${count} légende(s). Il sera disponible pour toute l’équipe.`, placeholder: 'Nom du pool (ex. Kenza FR)', value: old?.name ?? '', confirmLabel: 'Enregistrer' })
    if (!name || !name.trim()) return
    const title = PREFIX + name.trim().slice(0, 60)
    const same = pools.find(p => p.name.toLowerCase() === name.trim().toLowerCase())
    const { error } = same
      ? await supabase.from('caption_bank').update({ content: value.trim() }).eq('id', same.id)
      : await supabase.from('caption_bank').insert({ user_id: userId, org_id: orgId, title, content: value.trim(), used_count: 0 })
    if (error) { toast(error.message, 'bad'); return }
    toast(same ? `Pool « ${name.trim()} » mis à jour ✓` : `Pool « ${name.trim()} » enregistré ✓`, 'ok')
    await load()
  }
  async function remove() {
    const p = pools.find(x => x.id === cur); if (!p) return
    if (!await confirmDialog({ title: `Supprimer le pool « ${p.name} » ?`, confirmLabel: 'Supprimer', danger: true })) return
    await supabase.from('caption_bank').delete().eq('id', p.id)
    setCur(''); await load()
  }
  const b: CSSProperties = { height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, ...btnStyle }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={cur} title="Pools de légendes enregistrés" style={{ height: 28, fontSize: 12, ...selStyle }}
        onChange={e => { const id = e.target.value; setCur(id); const p = pools.find(x => x.id === id); if (p) onChange(p.content) }}>
        <option value="">{pools.length ? `📚 Mes pools (${pools.length})…` : '📚 Aucun pool enregistré'}</option>
        {pools.map(p => <option key={p.id} value={p.id} data-no-tr>{`${p.name} · ${p.content.split('\n').filter(s => s.trim()).length}`}</option>)}
      </select>
      <button type="button" onClick={() => void save()} style={b}>💾 Enregistrer le pool</button>
      {cur && <button type="button" onClick={() => void remove()} style={{ ...b, background: 'transparent', border: '1px solid transparent', color: '#A1A1AA' }}>Supprimer</button>}
    </div>
  )
}
