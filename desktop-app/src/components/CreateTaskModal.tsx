import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { phoneLabel, phoneSub, scopeInfra } from '@/lib/data'
import type { InfraKey } from '@/lib/theme'
import { Modal, Btn, Chip } from '@/lib/ui'
import BankPicker, { type PickerKind, type PickerResult } from './BankPicker'

// Création d'une automatisation, branchée sur la vraie DB.
//   mode 'recurring' → insert recurring_tasks (tourne côté serveur, PC éteint)
//   mode 'schedule'  → insert scheduled_posts (une fois, à une date précise)
// Le contenu vient de la banque : on stocke des URLs signées Supabase que la
// fonction Edge re-signe et ré-héberge sur GeeLark au moment de l'exécution.
export type TaskMode = 'recurring' | 'schedule'
type PostType = 'publication' | 'story'

interface Phone { id: string; geelark_id: string | null; phone_name: string; ig_username: string | null; group_name: string | null }
interface MediaRec { id: string; title: string; storage_path: string | null; file_url: string | null }

function storyLinkKey(p: Phone): string { return `sf-story-link-${p.geelark_id ?? p.id}` }

export default function CreateTaskModal({ theme, user, org, mode, infra, onClose, onCreated }: {
  theme: Theme; user: User; org: OrgState; mode: TaskMode; infra: InfraKey; onClose: () => void; onCreated: () => void
}) {
  const { currentOrg } = org
  const [name, setName] = useState('')
  const [type, setType] = useState<PostType>('publication')
  const [phones, setPhones] = useState<Phone[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [media, setMedia] = useState<MediaRec[]>([]) // vidéos ou images choisies
  const [caption, setCaption] = useState('')
  const [distMode, setDistMode] = useState<'seq' | 'random'>('seq')
  const [recurHours, setRecurHours] = useState(24)
  const [when, setWhen] = useState<string>(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000); d.setSeconds(0, 0)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const [picker, setPicker] = useState<PickerKind | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    let q = scope(supabase.from('phones').select('id,geelark_id,phone_name,ig_username,group_name'))
    q = scopeInfra(q, infra)
    const { data } = await q.order('phone_name')
    setPhones((data ?? []) as Phone[])
  }, [currentOrg?.id, user.id, infra])
  useEffect(() => { load() }, [load])

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Résout la sélection du picker (ids banque) en objets média réels.
  async function applyPicker(r: PickerResult) {
    if (r.kind === 'captions') { setCaption(r.text); return }
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await scope(supabase.from('content_bank').select('id,title,storage_path,file_url')).in('id', r.ids)
    setMedia((data ?? []) as MediaRec[])
  }

  // Construit les enregistrements média (token = URL signée fraîche).
  async function buildRecs(): Promise<{ token: string; title: string; storage_path: string | null; bank_id: string }[]> {
    const out: { token: string; title: string; storage_path: string | null; bank_id: string }[] = []
    for (const m of media) {
      let token = m.file_url ?? ''
      if (m.storage_path) {
        const { data } = await supabase.storage.from('content').createSignedUrl(m.storage_path, 3600)
        if (data?.signedUrl) token = data.signedUrl
      }
      if (token) out.push({ token, title: m.title, storage_path: m.storage_path, bank_id: m.id })
    }
    return out
  }

  const nSel = sel.size
  const canSave = name.trim().length > 0 && nSel > 0 && media.length > 0 && !saving

  async function save() {
    if (!canSave) return
    setSaving(true); setErr(null)
    try {
      const chosen = phones.filter(p => sel.has(p.id))
      const recs = await buildRecs()
      if (recs.length === 0) { setErr('Aucun média exploitable (URL introuvable).'); setSaving(false); return }
      const isStory = type === 'story'
      const phoneList = chosen.map(p => {
        let link = ''
        if (isStory) { try { link = localStorage.getItem(storyLinkKey(p)) ?? '' } catch { /* ignore */ } }
        return { id: p.id, geelark_id: p.geelark_id, phone_name: p.phone_name, ig_username: p.ig_username ?? null, ...(isStory ? { link } : {}) }
      })

      if (mode === 'recurring') {
        const { error } = await supabase.from('recurring_tasks').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null,
          name: name.trim(), status: 'active', task_type: isStory ? 'story' : 'publication',
          phones: phoneList,
          videos: isStory ? [] : recs, images: isStory ? recs : [],
          caption: caption.trim() || null, story_texts: [], mode: distMode,
          recur_hours: recurHours, next_run_at: new Date(Date.now() + recurHours * 3600 * 1000).toISOString(),
          steps: [],
        })
        if (error) throw error
      } else {
        const { error } = await supabase.from('scheduled_posts').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null,
          created_by_name: name.trim(), type: isStory ? 'story' : 'mass_posting',
          status: 'pending', scheduled_at: new Date(when).toISOString(),
          phones: phoneList,
          videos: isStory ? [] : recs, images: isStory ? recs : [],
          caption: caption.trim() || null, delay_minutes: 0, mode: distMode, bearer_token: '',
        })
        if (error) throw error
      }
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Échec de la création.')
      setSaving(false)
    }
  }

  const groups = useMemo(() => {
    const s = new Set<string>(); phones.forEach(p => { if (p.group_name) s.add(p.group_name) }); return [...s].sort()
  }, [phones])
  const [grpFilter, setGrpFilter] = useState('Tous')
  const shownPhones = phones.filter(p => grpFilter === 'Tous' || p.group_name === grpFilter)

  const lbl: CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#71717A', marginBottom: 7, display: 'block' }
  const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', height: 36, padding: '0 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.09)', color: '#F4F4F6', fontSize: 12.5, outline: 'none' }
  const seg = (on: boolean): CSSProperties => ({ flex: 1, height: 32, border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: on ? theme.accentBtn : 'rgba(255,255,255,0.03)', color: on ? '#fff' : '#A1A1AA' })

  return (
    <Modal theme={theme} width={560}
      title={mode === 'recurring' ? 'Nouvelle tâche automatique' : 'Programmer un post'}
      sub={mode === 'recurring' ? 'Tourne côté serveur, même PC éteint · 50 cr/jour + 2 cr/tél par exécution' : 'Exécuté à la date choisie, côté serveur'}
      icon="M12 5v14|M5 12h14" onClose={onClose}
      footer={<>
        <Btn theme={theme} tone="quiet" label="Annuler" onClick={onClose} />
        <Btn theme={theme} tone="primary" disabled={!canSave} label={saving ? 'Création…' : mode === 'recurring' ? 'Créer la tâche' : 'Programmer'} onClick={save} />
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <div>
          <label style={lbl}>Nom</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ex. Reels quotidiens Luna" style={inp} autoFocus />
        </div>

        <div>
          <label style={lbl}>Type</label>
          <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button style={seg(type === 'publication')} onClick={() => { setType('publication'); setMedia([]) }}>Publication (Reels)</button>
            <button style={seg(type === 'story')} onClick={() => { setType('story'); setMedia([]) }}>Story + lien</button>
          </div>
        </div>

        <div>
          <label style={lbl}>Comptes ({nSel})</label>
          {groups.length > 0 && (
            <select value={grpFilter} onChange={e => setGrpFilter(e.target.value)} style={{ ...inp, height: 30, marginBottom: 8, cursor: 'pointer' }}>
              <option value="Tous" style={{ background: '#16161C' }}>Tous les groupes</option>
              {groups.map(g => <option key={g} value={g} style={{ background: '#16161C' }}>{g}</option>)}
            </select>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {shownPhones.length === 0 ? <span style={{ fontSize: 12, color: '#52525B' }}>{infra === 'cloud' ? 'Aucun appareil ScaleFlow Cloud.' : 'Aucun appareil GeeLark.'}</span> : shownPhones.map(p => {
              const on = sel.has(p.id)
              return (
                <button key={p.id} onClick={() => toggle(p.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
                  background: on ? `rgba(${theme.tone},0.09)` : 'rgba(255,255,255,0.015)', border: '1px solid ' + (on ? theme.selEdge : 'rgba(255,255,255,0.06)'),
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: on ? theme.accentBtn : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 8.5, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: on ? '#F4F4F6' : '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneLabel(p)}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#52525B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneSub(p)}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {type === 'story' && <p style={{ margin: '7px 0 0', fontSize: 10.5, color: '#52525B', lineHeight: 1.5 }}>Le lien du sticker de chaque compte vient de ses Réglages (onglet Téléphones).</p>}
        </div>

        <div>
          <label style={lbl}>{type === 'story' ? 'Images' : 'Vidéos'} ({media.length})</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Btn theme={theme} sm tone="primary" icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z"
              label="Ouvrir la banque" onClick={() => setPicker(type === 'story' ? 'images' : 'videos')} />
            {media.map(m => <Chip key={m.id} text={m.title} tone="violet" />)}
          </div>
        </div>

        {type === 'publication' && (
          <div>
            <label style={lbl}>Légende (facultatif)</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2} placeholder="Légende commune…"
              style={{ ...inp, height: 'auto', minHeight: 54, padding: 10, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            <div style={{ marginTop: 6 }}>
              <Btn theme={theme} sm tone="quiet" icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" label="Depuis la banque" onClick={() => setPicker('captions')} />
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>{mode === 'recurring' ? 'Fréquence' : 'Date & heure'}</label>
            {mode === 'recurring' ? (
              <select value={recurHours} onChange={e => setRecurHours(Number(e.target.value))} style={{ ...inp, cursor: 'pointer' }}>
                {[[6, 'Toutes les 6 h'], [12, 'Toutes les 12 h'], [24, 'Chaque jour'], [48, 'Tous les 2 jours'], [168, 'Chaque semaine']].map(([h, l]) => (
                  <option key={h} value={h} style={{ background: '#16161C' }}>{l}</option>
                ))}
              </select>
            ) : (
              <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} style={inp} />
            )}
          </div>
          <div>
            <label style={lbl}>Répartition</label>
            <select value={distMode} onChange={e => setDistMode(e.target.value as 'seq' | 'random')} style={{ ...inp, cursor: 'pointer' }}>
              <option value="seq" style={{ background: '#16161C' }}>Séquentielle</option>
              <option value="random" style={{ background: '#16161C' }}>Aléatoire</option>
            </select>
          </div>
        </div>

        {err && <p style={{ margin: 0, fontSize: 11.5, color: '#F87171' }}>{err}</p>}
      </div>

      {picker && (
        <BankPicker theme={theme} user={user} org={org} kind={picker} multi={picker !== 'captions'}
          title={picker === 'captions' ? 'Choisir une légende' : picker === 'images' ? 'Choisir des images' : 'Choisir des vidéos'}
          onClose={() => setPicker(null)} onApply={applyPicker} />
      )}
    </Modal>
  )
}
