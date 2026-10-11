// Liens suivis (façon GetMySocial) : une page de liens par modèle + un lien court par
// compte Instagram / TikTok, avec le nombre de clics → on sait quel compte envoie du
// trafic. Servi publiquement par api/l.js (/l/<code>). Tables : supabase/migrations/20261011_links.sql.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, Empty, Icon, Kpi, Modal, PageHead, Panel, PanelHead, SkeletonRows, Toggle, FIELD, TEXTAREA, MONO, toast, confirmDialog } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { phoneLabel, fmtNumber } from '@/lib/data'
import { IS_WEB } from '@/lib/platform'

interface LinkPage { id: string; slug: string; title: string; bio: string; avatar_url: string | null; buttons: { label: string; url: string }[]; active: boolean }
interface TLink { id: string; page_id: string | null; phone_id: string | null; code: string; destination: string | null; label: string }
interface Phone { id: string; phone_name: string; ig_username: string | null; geelark_id: string | null }
interface Click { link_id: string | null; page_id: string | null; button: number | null; created_at: string }

export const LINK_BASE = IS_WEB && typeof window !== 'undefined' && /^https?:/.test(window.location.origin) ? `${window.location.origin}/l/` : 'https://scaleflow.company/l/'
export const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
/** Code unique d'un lien de compte : <page>-<compte>, suffixé si déjà pris. */
export function makeCode(pageSlug: string, account: string, taken: Set<string>): string {
  const base = `${pageSlug}-${slugify(account) || 'compte'}`.slice(0, 56)
  let c = base, n = 2
  while (taken.has(c)) c = `${base}-${n++}`
  return c
}

const DAY = 86400000
const EMPTY_PAGE: Omit<LinkPage, 'id'> = { slug: '', title: '', bio: '', avatar_url: '', buttons: [{ label: '', url: '' }], active: true }

export default function Links({ theme, user, org }: { theme: Theme; user: User; org: OrgState }) {
  const { currentOrg } = org
  const [pages, setPages] = useState<LinkPage[]>([])
  const [links, setLinks] = useState<TLink[]>([])
  const [phones, setPhones] = useState<Phone[]>([])
  const [clicks, setClicks] = useState<Click[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [edit, setEdit] = useState<(Omit<LinkPage, 'id'> & { id?: string }) | null>(null)
  const [forPage, setForPage] = useState<string>('')
  const scope = useCallback((q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null), [currentOrg?.id, user.id])

  const load = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - 30 * DAY).toISOString()
    const [pg, ln, ph, ck] = await Promise.all([
      scope(supabase.from('link_pages').select('*')).order('created_at'),
      scope(supabase.from('tracked_links').select('id,page_id,phone_id,code,destination,label')),
      scope(supabase.from('phones').select('id,phone_name,ig_username,geelark_id')).order('phone_name'),
      supabase.from('link_clicks').select('link_id,page_id,button,created_at').eq('bot', false).gte('created_at', since).limit(20000),
    ])
    setMissing(!!pg.error && /relation|does not exist|schema cache/i.test(pg.error.message))
    setPages((pg.data ?? []) as LinkPage[]); setLinks((ln.data ?? []) as TLink[]); setPhones((ph.data ?? []) as Phone[]); setClicks((ck.data ?? []) as Click[])
    setForPage(f => f || ((pg.data?.[0] as LinkPage | undefined)?.id ?? ''))
    setLoading(false)
  }, [scope])
  useEffect(() => { void load() }, [load])

  const now = Date.now()
  const count = (pred: (c: Click) => boolean, days: number) => clicks.filter(c => pred(c) && now - Date.parse(c.created_at) < days * DAY).length
  const linkByPhone = useMemo(() => new Map(links.filter(l => l.phone_id).map(l => [l.phone_id!, l])), [links])
  const ranked = useMemo(() => links.filter(l => l.phone_id).map(l => ({ l, n: count(c => c.link_id === l.id, 7) })).sort((a, b) => b.n - a.n), [links, clicks]) // eslint-disable-line react-hooks/exhaustive-deps
  const best = ranked[0]?.n ? phones.find(p => p.id === ranked[0].l.phone_id) : undefined
  const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => toast('Lien copié', 'ok'), () => toast(t, 'info')) }

  async function savePage() {
    if (!edit) return
    const slug = slugify(edit.slug || edit.title)
    if (slug.length < 2) { toast('Choisis une adresse (au moins 2 caractères).', 'bad'); return }
    const row = { slug, title: edit.title.trim(), bio: edit.bio.trim(), avatar_url: edit.avatar_url?.trim() || null, active: edit.active,
      buttons: edit.buttons.filter(b => b.label.trim() && /^https?:\/\//i.test(b.url.trim())).map(b => ({ label: b.label.trim(), url: b.url.trim() })) }
    const { error } = edit.id
      ? await supabase.from('link_pages').update(row).eq('id', edit.id)
      : await supabase.from('link_pages').insert({ ...row, user_id: user.id, org_id: currentOrg?.id ?? null })
    if (error) { toast(/duplicate|unique/i.test(error.message) ? 'Cette adresse est déjà prise — choisis-en une autre.' : `Échec : ${error.message}`, 'bad'); return }
    toast('Page enregistrée', 'ok'); setEdit(null); void load()
  }
  async function deletePage(p: LinkPage) {
    if (!await confirmDialog({ title: `Supprimer la page « ${p.title || p.slug} » ?`, text: 'Ses liens par compte et ses statistiques seront supprimés aussi.', confirmLabel: 'Supprimer', danger: true })) return
    const { error } = await supabase.from('link_pages').delete().eq('id', p.id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else void load()
  }
  async function createLinks(ph: Phone[]) {
    const pg = pages.find(p => p.id === forPage)
    if (!pg) { toast('Crée d’abord une page de liens.', 'bad'); return }
    const taken = new Set(links.map(l => l.code))
    const rows = ph.filter(p => !linkByPhone.has(p.id)).map(p => {
      const code = makeCode(pg.slug, p.ig_username || p.phone_name, taken); taken.add(code)
      return { code, page_id: pg.id, phone_id: p.id, label: phoneLabel(p), destination: null, user_id: user.id, org_id: currentOrg?.id ?? null }
    })
    if (!rows.length) return
    const { error } = await supabase.from('tracked_links').insert(rows)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else { toast(`${rows.length} lien(s) créé(s)`, 'ok'); void load() }
  }
  // Pose chaque lien suivi comme lien de sticker par défaut du compte (onglet Story).
  function useInStories() {
    let n = 0
    for (const p of phones) { const l = linkByPhone.get(p.id); if (!l) continue; try { localStorage.setItem(`sf-story-link-${p.geelark_id ?? p.id}`, LINK_BASE + l.code); n++ } catch { /* ignore */ } }
    toast(n ? `${n} compte(s) : lien suivi posé dans les stories` : 'Aucun lien de compte à poser.', n ? 'ok' : 'info')
  }

  if (missing) return (
    <div><PageHead title="Liens" sub="Pages de liens et liens suivis par compte." />
      <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01" title="Activation requise" text="Les tables des liens n’existent pas encore : colle le fichier supabase/migrations/20261011_links.sql dans Supabase → SQL Editor → Run, puis recharge." /></Panel>
    </div>
  )

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Liens" sub="Une page de liens par modèle et un lien suivi par compte : tu sais quel compte envoie le plus de trafic."
        actions={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Nouvelle page" onClick={() => setEdit({ ...EMPTY_PAGE })} />} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px,100%),1fr))', gap: 12, marginBottom: 12 }}>
        <Kpi theme={theme} label="Clics · 7 jours" value={loading ? '…' : fmtNumber(count(() => true, 7))} />
        <Kpi theme={theme} label="Clics · 30 jours" value={loading ? '…' : fmtNumber(count(() => true, 30))} />
        <Kpi theme={theme} label="Meilleur compte · 7 jours" value={loading ? '…' : best ? phoneLabel(best) : '—'} hint={best ? `${fmtNumber(ranked[0].n)} clic(s)` : undefined} />
      </div>

      <Panel theme={theme} style={{ marginBottom: 12 }}>
        <PanelHead title="Pages de liens" sub="Ta page façon Linktree, une par modèle." />
        {loading ? <SkeletonRows rows={2} avatar /> : pages.length === 0 ? (
          <Empty icon="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" title="Aucune page" text="Crée la page de liens d’une modèle : photo, bio et boutons (OnlyFans, Telegram…)." action={<Btn theme={theme} tone="primary" label="Nouvelle page" onClick={() => setEdit({ ...EMPTY_PAGE })} />} />
        ) : pages.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap' }}>
            <span style={{ width: 34, height: 34, borderRadius: 99, overflow: 'hidden', background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>{p.avatar_url && <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
            <span style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span data-no-tr style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{p.title || p.slug}</span>
              <span data-no-tr style={{ fontFamily: MONO, fontSize: 11.5, color: '#8B8B94' }}>{LINK_BASE}{p.slug}</span>
            </span>
            {!p.active && <Chip text="Désactivée" />}
            <span style={{ fontSize: 12, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(count(c => c.page_id === p.id, 7))} clic(s) · 7 j</span>
            <Btn theme={theme} sm tone="ghost" icon="M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2|M16 4h4v4|M10 14L20 4" label="Copier" onClick={() => copy(LINK_BASE + p.slug)} />
            <Btn theme={theme} sm tone="quiet" label="Modifier" onClick={() => setEdit({ ...p, avatar_url: p.avatar_url ?? '', buttons: p.buttons.length ? p.buttons : [{ label: '', url: '' }] })} />
            <Btn theme={theme} sm tone="quiet" icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" onClick={() => deletePage(p)} />
          </div>
        ))}
      </Panel>

      <Panel theme={theme}>
        <PanelHead title="Liens par compte" sub="Chaque compte a son propre lien vers la page : les clics sont comptés par compte."
          right={pages.length > 0 ? <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={forPage} onChange={e => setForPage(e.target.value)} style={{ ...FIELD, height: 28, width: 'auto', fontSize: 12.5 }}>
              {pages.map(p => <option key={p.id} value={p.id}>{p.title || p.slug}</option>)}
            </select>
            <Btn theme={theme} sm tone="ghost" label="Créer pour tous les comptes" onClick={() => createLinks(phones)} />
            <Btn theme={theme} sm tone="primary" label="Utiliser dans les stories" onClick={useInStories} />
          </span> : undefined} />
        {loading ? <SkeletonRows rows={4} /> : phones.length === 0 ? (
          <Empty icon="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" title="Aucun compte" text="Synchronise tes téléphones pour créer un lien par compte." />
        ) : phones.map((p, i) => {
          const l = linkByPhone.get(p.id)
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', minHeight: 48, borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 140, fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{phoneLabel(p)}</span>
              {l ? <>
                <span data-no-tr style={{ fontFamily: MONO, fontSize: 11.5, color: '#8B8B94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{LINK_BASE}{l.code}</span>
                <span style={{ minWidth: 86, textAlign: 'right', fontSize: 12, color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(count(c => c.link_id === l.id, 7))} clic(s)</span>
                <Btn theme={theme} sm tone="quiet" icon="M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2|M16 4h4v4|M10 14L20 4" onClick={() => copy(LINK_BASE + l.code)} />
              </> : <Btn theme={theme} sm tone="ghost" label="Créer le lien" disabled={!pages.length} onClick={() => createLinks([p])} />}
            </div>
          )
        })}
      </Panel>

      {edit && (
        <Modal theme={theme} title={edit.id ? 'Modifier la page' : 'Nouvelle page de liens'} width={760} onClose={() => setEdit(null)}
          footer={<><Btn theme={theme} tone="ghost" label="Annuler" onClick={() => setEdit(null)} /><Btn theme={theme} tone="primary" label="Enregistrer" onClick={savePage} /></>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([['Nom affiché', 'title', 'Léa'], ['Adresse', 'slug', 'lea'], ['Photo (URL de l’image)', 'avatar_url', 'https://…']] as [string, 'title' | 'slug' | 'avatar_url', string][]).map(([l, k, ph]) => (
                <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{l}</span>
                  <input value={edit[k] ?? ''} placeholder={ph} onChange={e => setEdit(v => v && ({ ...v, [k]: k === 'slug' ? slugify(e.target.value) : e.target.value }))} style={FIELD} />
                  {k === 'slug' && <span data-no-tr style={{ fontFamily: MONO, fontSize: 11, color: '#71717A' }}>{LINK_BASE}{slugify(edit.slug || edit.title) || '…'}</span>}
                </label>
              ))}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Bio</span>
                <textarea value={edit.bio} rows={3} onChange={e => setEdit(v => v && ({ ...v, bio: e.target.value }))} style={TEXTAREA} />
              </label>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Boutons</span>
              {edit.buttons.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input value={b.label} placeholder="Texte (ex. Mon OnlyFans)" onChange={e => setEdit(v => v && ({ ...v, buttons: v.buttons.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))} style={{ ...FIELD, flex: 1 }} />
                  <input value={b.url} placeholder="https://…" onChange={e => setEdit(v => v && ({ ...v, buttons: v.buttons.map((x, j) => j === i ? { ...x, url: e.target.value } : x) }))} style={{ ...FIELD, flex: 1.4 }} />
                  <Btn theme={theme} sm tone="quiet" icon="M18 6L6 18|M6 6l12 12" onClick={() => setEdit(v => v && ({ ...v, buttons: v.buttons.filter((_, j) => j !== i) }))} />
                </div>
              ))}
              <span><Btn theme={theme} sm tone="ghost" icon="M12 5v14|M5 12h14" label="Ajouter un bouton" onClick={() => setEdit(v => v && ({ ...v, buttons: [...v.buttons, { label: '', url: '' }] }))} /></span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#EDEDEF' }}>
                <Toggle on={edit.active} onChange={on => setEdit(v => v && ({ ...v, active: on }))} /> Page en ligne
              </label>
            </div>
            {/* Aperçu mobile */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 260, minHeight: 460, borderRadius: 28, border: '1px solid rgba(255,255,255,0.12)', background: '#0A0A0B', padding: '36px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                <span style={{ width: 72, height: 72, borderRadius: 99, overflow: 'hidden', background: '#161618', border: '1px solid rgba(255,255,255,0.12)' }}>{edit.avatar_url && <img src={edit.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
                <span data-no-tr style={{ fontSize: 16, fontWeight: 600, color: '#EDEDEF' }}>{edit.title || 'Nom affiché'}</span>
                {edit.bio && <span data-no-tr style={{ fontSize: 12, color: '#A1A1AA', whiteSpace: 'pre-line' }}>{edit.bio}</span>}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {edit.buttons.filter(b => b.label.trim()).map((b, i) => (
                    <span key={i} data-no-tr style={{ padding: '11px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: i === 0 ? '#EDEDEF' : '#161618', color: i === 0 ? '#0A0A0B' : '#EDEDEF', border: '1px solid rgba(255,255,255,0.1)' }}>{b.label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#71717A' }}>
            <Icon d="M12 16v-4|M12 8h.01|M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" size={13} />
            Le 1er bouton est mis en avant. Depuis Instagram / TikTok, la page s’ouvre dans le vrai navigateur quand c’est possible.
          </div>
        </Modal>
      )}
    </div>
  )
}
