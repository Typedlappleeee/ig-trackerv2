// Veille des Reels viraux : le super-admin choisit les comptes de référence, tous les
// utilisateurs voient le fil (lecture seule, RLS 20261012b_viral_shared.sql). Les derniers Reels des comptes surveillés, classés
// par score « au-dessus de la normale » (vues / médiane du compte). Relevé quotidien
// côté serveur (edge function run-scheduled-posts, étape 0-viral) ou à la demande.
// Tables : supabase/migrations/20261012_viral.sql. Données : HikerAPI (secret HIKERAPI_KEY).
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Empty, Icon, PageHead, Panel, PanelHead, SkeletonRows, Segmented, FIELD, TEXTAREA, toast } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { fmtNumber } from '@/lib/data'

interface Watch { id: string; username: string; niche: string; fetched_at: string | null; last_error: string | null }
interface Reel { watch_id: string; code: string; username: string; views: number; likes: number; comments: number; taken_at: string | null; thumb: string | null; url: string | null; baseline: number; score: number }
type Range = '1' | '7' | '30'
type Sort = 'score' | 'views'

const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'
// Les images Instagram sont bloquées en affichage direct → proxy d'images de l'edge function.
const img = (u: string) => `${FN_URL}?img=${encodeURIComponent(u)}`

/** Pur : filtre période / niche / compte puis tri. */
export function filterReels(reels: Reel[], watch: Watch[], o: { range: Range; niche: string; account: string; sort: Sort }, now = Date.now()): Reel[] {
  const nicheOf = new Map(watch.map(w => [w.id, w.niche]))
  return reels
    .filter(r => r.taken_at && now - Date.parse(r.taken_at) <= Number(o.range) * 86400000)
    .filter(r => !o.niche || nicheOf.get(r.watch_id) === o.niche)
    .filter(r => !o.account || r.username === o.account)
    .sort((a, b) => o.sort === 'score' ? b.score - a.score || b.views - a.views : b.views - a.views)
}

export default function ViralWatch({ theme, user, canEdit }: { theme: Theme; user: User; org: OrgState; canEdit: boolean }) {
  const [watch, setWatch] = useState<Watch[]>([])
  const [reels, setReels] = useState<Reel[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState('')
  const [niche, setNiche] = useState('Modèles FR')
  const [range, setRange] = useState<Range>('7')
  const [sort, setSort] = useState<Sort>('score')
  const [fNiche, setFNiche] = useState('')
  const [fAccount, setFAccount] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const w = await supabase.from('viral_watch').select('id,username,niche,fetched_at,last_error').order('username')
    setMissing(!!w.error && /relation|does not exist|schema cache/i.test(w.error.message))
    const list = (w.data ?? []) as Watch[]
    setWatch(list)
    if (list.length) {
      const r = await supabase.from('viral_reels').select('*').in('watch_id', list.map(x => x.id)).gte('taken_at', new Date(Date.now() - 31 * 86400000).toISOString()).limit(5000)
      setReels((r.data ?? []) as Reel[])
    } else setReels([])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function addAccounts() {
    const names = [...new Set(adding.split(/[\s,;]+/).map(s => s.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').toLowerCase()).filter(s => /^[a-z0-9._]{1,30}$/.test(s)))]
    const fresh = names.filter(n => !watch.some(w => w.username === n))
    if (!fresh.length) { toast('Aucun nouveau compte valide.', 'info'); return }
    const { error } = await supabase.from('viral_watch').insert(fresh.map(username => ({ username, niche: niche.trim(), user_id: user.id, org_id: null })))
    if (error) { toast(`Échec : ${error.message}`, 'bad'); return }
    toast(`${fresh.length} compte(s) ajouté(s) — clique « Actualiser » pour relever leurs Reels.`, 'ok'); setAdding(''); void load()
  }
  async function removeWatch(w: Watch) {
    const { error } = await supabase.from('viral_watch').delete().eq('id', w.id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else void load()
  }
  async function refresh() {
    setBusy(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` }, body: JSON.stringify({ viral: 'refresh' }) })
      const j = await res.json().catch(() => ({})) as { ok?: boolean; accounts?: number; reels?: number; error?: string }
      // Ancienne version de la fonction (pas encore redéployée) : pas de champ « accounts ».
      if (!res.ok || !j.ok || j.accounts === undefined) toast(`Relevé impossible : redéploie la fonction run-scheduled-posts et vérifie le secret HIKERAPI_KEY. (${j.error ?? (j.accounts === undefined && res.ok ? 'fonction pas à jour' : `HTTP ${res.status}`)})`, 'bad', 10000)
      else toast(`${j.accounts ?? 0} compte(s) relevé(s) · ${j.reels ?? 0} Reel(s)`, 'ok')
    } catch { toast('Relevé impossible (réseau).', 'bad') } finally { setBusy(false); void load() }
  }

  const niches = [...new Set(watch.map(w => w.niche).filter(Boolean))]
  const shown = useMemo(() => filterReels(reels, watch, { range, niche: fNiche, account: fAccount, sort }).slice(0, 120), [reels, watch, range, fNiche, fAccount, sort])
  const errors = watch.filter(w => w.last_error)

  if (missing) return (
    <div><PageHead title="Veille Reels" sub="Les Reels qui explosent chez tes comptes de référence." />
      <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01" title="Activation requise" text={canEdit ? 'Colle supabase/migrations/20261012_viral.sql dans Supabase → SQL Editor → Run, puis recharge.' : 'Bientôt disponible.'} /></Panel></div>
  )

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Veille Reels" sub="Les Reels qui explosent chez tes comptes de référence — classés « au-dessus de la normale » de chaque compte. Relevé automatique chaque jour."
        actions={canEdit && <Btn theme={theme} tone="primary" icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8" label={busy ? 'Relevé en cours…' : 'Actualiser maintenant'} disabled={busy || !watch.length} onClick={refresh} />} />

      {canEdit && <Panel theme={theme} style={{ marginBottom: 12 }}>
        <PanelHead title="Comptes suivis" sub={`${watch.length} compte(s)${errors.length ? ` · ${errors.length} en erreur` : ''}`} />
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea value={adding} onChange={e => setAdding(e.target.value)} rows={3} placeholder={'Colle des @ ou liens Instagram (un par ligne)\n@modele1\nhttps://instagram.com/modele2'} style={TEXTAREA} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={niche} onChange={e => setNiche(e.target.value)} placeholder="Niche (ex. Modèles FR)" style={FIELD} />
              <Btn theme={theme} label="Ajouter" icon="M12 5v14|M5 12h14" onClick={addAccounts} />
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start', maxHeight: 150, overflowY: 'auto' }}>
            {watch.map(w => (
              <span key={w.id} title={w.last_error ?? (w.fetched_at ? `Relevé le ${new Date(w.fetched_at).toLocaleString('fr-FR')}` : 'Pas encore relevé')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 4px 0 10px', borderRadius: 99, background: '#161618', border: `1px solid ${w.last_error ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.09)'}`, fontSize: 12, color: '#EDEDEF' }}>
                <span data-no-tr>@{w.username}</span>
                <button type="button" onClick={() => removeWatch(w)} style={{ display: 'flex', border: 'none', background: 'transparent', color: '#71717A', cursor: 'pointer', padding: 2 }}><Icon d="M18 6L6 18|M6 6l12 12" size={11} /></button>
              </span>
            ))}
          </div>
        </div>
      </Panel>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Segmented value={range} onChange={setRange} options={[{ v: '1', l: '24 h' }, { v: '7', l: '7 jours' }, { v: '30', l: '30 jours' }]} />
        <Segmented value={sort} onChange={setSort} options={[{ v: 'score', l: 'Au-dessus de la normale' }, { v: 'views', l: 'Plus de vues' }]} />
        {niches.length > 1 && <select value={fNiche} onChange={e => setFNiche(e.target.value)} style={{ ...FIELD, width: 'auto', height: 30 }}><option value="">Toutes les niches</option>{niches.map(n => <option key={n} value={n}>{n}</option>)}</select>}
        <select value={fAccount} onChange={e => setFAccount(e.target.value)} style={{ ...FIELD, width: 'auto', height: 30 }}><option value="">Tous les comptes</option>{watch.map(w => <option key={w.id} value={w.username}>@{w.username}</option>)}</select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#71717A' }}>{fmtNumber(shown.length)} Reel(s)</span>
      </div>

      {loading ? <Panel theme={theme}><SkeletonRows rows={4} /></Panel> : shown.length === 0 ? (
        <Panel theme={theme}><Empty icon="M22 12h-4l-3 9L9 3l-3 9H2" title="Aucun Reel pour l’instant" text={!canEdit ? 'Les Reels viraux des comptes de référence apparaîtront ici dès le prochain relevé.' : watch.length ? 'Clique « Actualiser maintenant » pour relever les derniers Reels de tes comptes suivis.' : 'Ajoute des comptes de référence (modèles, concurrents) pour voir leurs Reels qui cartonnent.'} /></Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
          {shown.map(r => {
            const hot = r.score >= 3
            return (
              <a key={`${r.watch_id}-${r.code}`} href={r.url ?? '#'} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden', background: '#111113', border: `1px solid ${hot ? 'rgba(244,114,182,0.45)' : 'rgba(255,255,255,0.07)'}`, textDecoration: 'none', color: 'inherit' }}>
                <span style={{ position: 'relative', aspectRatio: '9 / 14', background: '#161618' }}>
                  {r.thumb && <img src={img(r.thumb)} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {r.score > 0 && <span style={{ position: 'absolute', top: 8, left: 8, padding: '3px 8px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: hot ? '#F472B6' : 'rgba(10,10,11,0.75)', color: '#fff' }}>×{r.score >= 10 ? Math.round(r.score) : r.score.toFixed(1)} la normale</span>}
                  <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 10px 8px', background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 700, color: '#fff' }}>
                    <Icon d="M5 3l14 9-14 9V3z" size={12} />{fmtNumber(r.views)}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px' }}>
                  <span data-no-tr style={{ fontSize: 12.5, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{r.username}</span>
                  <span style={{ fontSize: 11.5, color: '#71717A' }}>{r.taken_at ? new Date(r.taken_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'} · moy. {fmtNumber(r.baseline)}</span>
                </span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
