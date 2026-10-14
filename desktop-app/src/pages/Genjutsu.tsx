// Genjutsu IA (Higgsfield) — « recréer un Reel avec mes images », pour tous.
// • Créer : une file de Reels (liens Instagram, Veille, vidéos Banque/PC) + un Modèle (ou des
//   images ponctuelles) + réglages → envoyés à la file SERVEUR (genjutsu_jobs), traités un par un.
// • Modèles : un nom + 1 à 8 images de référence, réutilisables (plus besoin de rechoisir).
// • Historique : les générations de l'espace (perso / organisation), partagées et persistantes ;
//   la file avance pendant que la page est ouverte (« tick ») et via le cron (app fermée).
// Chaque espace met SA clé Higgsfield (table api_keys, jamais relisible depuis l'app).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { compact, useBankThumbs } from '@/lib/data'
import { Btn, FIELD, Icon, Segmented, TEXTAREA, toast, confirmDialog, useNarrow } from '@/lib/ui'
import BankPicker from '@/components/BankPicker'
import { takeOpenArg, openTool } from '@/lib/openTool'
import { reelCodeFrom } from '@/lib/genjutsu'

const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'
const MODEL_KEY = 'sf-gj-model'
const img = (u: string) => `${FN_URL}?img=${encodeURIComponent(u)}`
type Res = '480p' | '720p' | '1080p'
type Tab = 'create' | 'models' | 'history'
interface BankItem { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url?: string | null; thumbnail_path?: string | null }
interface ReelPick { code: string; thumb: string | null; username: string; views: number; score: number }
interface Src { key: string; reel_code?: string; bank_id?: string; label: string; thumb: string | null }
interface Model { id: string; name: string; image_ids: string[]; created_at: string }
interface Job { id: string; status: string; title: string | null; thumb: string | null; video_url: string | null; bank_id: string | null; error: string | null; created_at: string; model_id: string | null }

const V = '#A78BFA', GRAD = 'linear-gradient(135deg,#8B5CF6,#EC4899)'
const ACTIVE = (s: string) => s === 'waiting' || s === 'queued' || s === 'in_progress'
const STATUS: Record<string, [string, string]> = {
  waiting: ['En attente de son tour', '#A1A1AA'], queued: ['Envoyé · en file Higgsfield', '#C4B5FD'], in_progress: ['Génération en cours', '#C4B5FD'],
  completed: ['Terminé', '#4ADE80'], failed: ['Échec', '#F87171'],
}
const isMissingTable = (m?: string) => !!m && /relation|does not exist|schema cache|function/i.test(m)

async function callFn(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: s } = await supabase.auth.getSession()
  const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` }, body: JSON.stringify(body) })
  return await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })) as Record<string, unknown>
}
// Filtre « espace » (organisation, ou perso sans organisation).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scope = (q: any, userId: string, orgId: string | null) => orgId ? q.eq('org_id', orgId) : q.eq('user_id', userId).is('org_id', null)

function Thumb({ url, video, style }: { url: string | null; video?: boolean; style?: React.CSSProperties }) {
  const S: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
  return (
    <span style={{ position: 'relative', display: 'block', overflow: 'hidden', background: '#161618', ...style }}>
      {url && (video ? <video src={`${url}#t=0.1`} muted playsInline preload="metadata" style={S} /> : <img src={url} alt="" loading="lazy" style={S} />)}
    </span>
  )
}
function Section({ n, title, sub, right, children }: { n?: string; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ borderRadius: 20, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.07)', padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {n && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800, color: V, paddingTop: 3 }}>{n}</span>}
        <span style={{ flex: 1, minWidth: 180 }}>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 900, letterSpacing: '-0.03em', textTransform: 'uppercase', color: '#F4F4F5' }}>{title}</span>
          {sub && <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, color: '#8B8B94' }}>{sub}</span>}
        </span>
        {right}
      </div>
      {children}
    </section>
  )
}

// ── Clé API Higgsfield de l'espace (perso ou organisation) ───────────────────────────
function KeyPanel({ theme, orgId, nudge, onChange }: { theme: Theme; orgId: string | null; nudge: boolean; onChange: (ok: boolean) => void }) {
  const [st, setSt] = useState<{ set: boolean; hint: string | null; canEdit: boolean } | null>(null)
  const [noSql, setNoSql] = useState(false)
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('sf_api_key_status', { p_provider: 'higgsfield', p_org: orgId })
    if (error) { setNoSql(isMissingTable(error.message)); setSt({ set: false, hint: null, canEdit: !orgId }); onChange(false); return }
    const row = (Array.isArray(data) ? data[0] : data) as { is_set?: boolean; hint?: string; can_edit?: boolean } | undefined
    setSt({ set: !!row?.is_set, hint: row?.hint ?? null, canEdit: !!row?.can_edit }); onChange(!!row?.is_set)
  }, [orgId, onChange])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (nudge) setOpen(true) }, [nudge])
  async function save(clear = false) {
    const v = clear ? '' : key.trim()
    if (!clear && !/^[^:\s]+:[^:\s]+$/.test(v)) { toast('Colle la clé complète copiée sur Higgsfield (format ID:SECRET, sans espaces).', 'bad'); return }
    setSaving(true)
    const { error } = await supabase.rpc('sf_set_api_key', { p_provider: 'higgsfield', p_value: v, p_org: orgId })
    setSaving(false)
    if (error) { toast(isMissingTable(error.message) ? 'Colle d’abord supabase/migrations/20261015_genjutsu.sql dans Supabase → SQL Editor → Run.' : `Enregistrement impossible : ${error.message}`, 'bad', 9000); return }
    setKey(''); setOpen(false); toast(clear ? 'Clé Higgsfield retirée.' : 'Clé Higgsfield enregistrée.', 'ok'); void load()
  }
  const ok = !!st?.set
  return (
    <section style={{ borderRadius: 16, background: '#0F0F11', border: `1px solid ${ok ? 'rgba(255,255,255,0.07)' : 'rgba(167,139,250,0.4)'}`, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: ok ? '#4ADE80' : '#FBBF24', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 220, fontSize: 13.5, color: '#EDEDEF' }}>
          <b>Ta clé API Higgsfield</b>{' '}
          <span style={{ color: '#8B8B94' }}>{st === null ? '…' : noSql ? '· colle d’abord le SQL 20261015_genjutsu.sql dans Supabase' : ok ? `· configurée (••••${st.hint ?? ''})${orgId ? ' pour toute l’équipe' : ''}` : '· pas encore configurée — Genjutsu utilise TA clé (facturée par Higgsfield)'}</span>
        </span>
        {st?.canEdit ? <Btn theme={theme} sm tone={ok ? 'quiet' : 'primary'} label={ok ? 'Changer la clé' : 'Ajouter ma clé'} onClick={() => setOpen(o => !o)} />
          : st && <span style={{ fontSize: 12, color: '#71717A' }}>Seuls l’owner et les admins peuvent la changer.</span>}
      </div>
      {open && st?.canEdit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 12.5, color: '#8B8B94', lineHeight: 1.5 }}>Crée un compte sur <b>cloud.higgsfield.ai</b>, recharge-le, puis clique <b>« Copy API key »</b> et colle-la ici telle quelle. Elle reste sur le serveur : personne ne peut la relire depuis l’app.</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={key} onChange={e => setKey(e.target.value)} placeholder="Clé API Higgsfield" type="password" autoComplete="new-password" spellCheck={false} style={{ ...FIELD, flex: '1 1 320px' }} />
            <Btn theme={theme} tone="primary" label={saving ? 'Enregistrement…' : 'Enregistrer'} disabled={saving || !key.trim()} onClick={() => void save()} />
          </div>
          {ok && <span><Btn theme={theme} sm tone="quiet" label="Retirer la clé" onClick={() => void save(true)} /></span>}
        </div>
      )}
    </section>
  )
}

// ── Carte d'un Modèle (couverture = 1re image) ───────────────────────────────────────
function ModelCard({ m, cover, count, on, onClick, actions }: { m: Model; cover: string | null; count: number; on?: boolean; onClick?: () => void; actions?: React.ReactNode }) {
  const [h, setH] = useState(false)
  return (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={e => { if (onClick && e.key === 'Enter') onClick() }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', cursor: onClick ? 'pointer' : 'default', background: '#141416', aspectRatio: '3 / 4',
        border: `1px solid ${on ? V : h ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)'}`, boxShadow: on ? `0 0 0 2px ${V}` : h ? '0 18px 40px -20px rgba(139,92,246,.7)' : 'none',
        transform: h ? 'translateY(-3px)' : 'none', transition: 'transform .2s ease, box-shadow .2s ease, border-color .2s ease' }}>
      <Thumb url={cover} style={{ position: 'absolute', inset: 0 }} />
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,.9))' }} />
      {on && <span style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 99, background: V, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon d="M20 6L9 17l-5-5" size={13} sw={3} /></span>}
      <span style={{ position: 'absolute', left: 12, right: 12, bottom: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span data-no-tr style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
        <span style={{ fontSize: 11.5, color: '#C4C4CC' }}>{count} image(s) de référence</span>
        {actions && <span style={{ display: 'flex', gap: 6, marginTop: 6 }} onClick={e => e.stopPropagation()}>{actions}</span>}
      </span>
    </div>
  )
}

export default function Genjutsu({ theme, user, org, onNavigate }: { theme: Theme; user: User; org: OrgState; onNavigate: (p: string) => void }) {
  const orgId = org.currentOrg?.id ?? null
  const narrow = useNarrow(980)
  const [openArg] = useState(() => takeOpenArg<{ reel?: ReelPick; tab?: Tab }>('genjutsu'))
  const [tab, setTab] = useState<Tab>(openArg?.tab ?? 'create')
  const [hasKey, setHasKey] = useState(false)
  const [nudge, setNudge] = useState(false)
  const [noSql, setNoSql] = useState(false)

  // ── Sources (file locale avant envoi) ──
  const [srcKind, setSrcKind] = useState<'links' | 'viral' | 'bank'>(openArg?.reel ? 'viral' : 'links')
  const [queue, setQueue] = useState<Src[]>(() => openArg?.reel ? [{ key: `r:${openArg.reel.code}`, reel_code: openArg.reel.code, label: `@${openArg.reel.username}`, thumb: openArg.reel.thumb ? img(openArg.reel.thumb) : null }] : [])
  const [links, setLinks] = useState('')
  const [reels, setReels] = useState<ReelPick[]>([])
  const [bankSrc, setBankSrc] = useState<BankItem[]>([])
  const addToQueue = (items: Src[]) => setQueue(cur => [...cur, ...items.filter(x => !cur.some(c => c.key === x.key))])

  // ── Références : un Modèle, ou des images ponctuelles ──
  const [models, setModels] = useState<Model[]>([])
  const [modelId, setModelId] = useState<string | null>(() => { try { return localStorage.getItem(MODEL_KEY) } catch { return null } })
  const [adhoc, setAdhoc] = useState<BankItem[]>([])
  const [modelImgs, setModelImgs] = useState<Record<string, BankItem>>({})
  const [res, setRes] = useState<Res>('720p')
  const [prompt, setPrompt] = useState('')
  const [sending, setSending] = useState(false)

  // ── Pickers / éditeur de modèle ──
  const [picker, setPicker] = useState<null | { kind: 'videos' | 'images'; for: 'src' | 'adhoc' | 'model' }>(null)
  const [editing, setEditing] = useState<null | { id: string | null; name: string; images: BankItem[] }>(null)

  // ── Historique ──
  const [jobs, setJobs] = useState<Job[]>([])

  const allItems = useMemo(() => [...bankSrc, ...adhoc, ...Object.values(modelImgs), ...(editing?.images ?? [])], [bankSrc, adhoc, modelImgs, editing])
  const { thumbFor } = useBankThumbs(allItems)

  const fetchItems = useCallback(async (ids: string[]): Promise<BankItem[]> => {
    if (!ids.length) return []
    const { data } = await supabase.from('content_bank').select('*').in('id', ids)
    const byId = new Map(((data ?? []) as BankItem[]).map(r => [r.id, r]))
    return ids.map(id => byId.get(id)).filter((x): x is BankItem => !!x)
  }, [])

  useEffect(() => {
    void supabase.from('viral_reels').select('code, thumb, username, views, score').order('views', { ascending: false }).limit(30)
      .then(({ data }) => { const seen = new Set<string>(); setReels(((data ?? []) as ReelPick[]).filter(r => r.code && !seen.has(r.code) && seen.add(r.code)).slice(0, 24)) })
  }, [])

  const loadModels = useCallback(async () => {
    const { data, error } = await scope(supabase.from('genjutsu_models').select('id, name, image_ids, created_at'), user.id, orgId).order('created_at', { ascending: false })
    if (error) { if (isMissingTable(error.message)) setNoSql(true); return }
    const list = ((data ?? []) as Model[]).map(m => ({ ...m, image_ids: (m.image_ids ?? []).map(String) }))
    setModels(list)
    const items = await fetchItems([...new Set(list.flatMap(m => m.image_ids))])
    setModelImgs(Object.fromEntries(items.map(i => [i.id, i])))
  }, [user.id, orgId, fetchItems])
  useEffect(() => { void loadModels() }, [loadModels])
  useEffect(() => { if (modelId && models.length && !models.some(m => m.id === modelId)) setModelId(null) }, [models, modelId])

  const loadJobs = useCallback(async () => {
    const { data, error } = await scope(supabase.from('genjutsu_jobs').select('id, status, title, thumb, video_url, bank_id, error, created_at, model_id'), user.id, orgId).order('created_at', { ascending: false }).limit(60)
    if (error) { if (isMissingTable(error.message)) setNoSql(true); return }
    setJobs((data ?? []) as Job[])
  }, [user.id, orgId])
  useEffect(() => { void loadJobs() }, [loadJobs])
  // File active : on la fait avancer (tick) et on relit toutes les 8 s.
  const active = jobs.some(j => ACTIVE(j.status))
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      void callFn({ genjutsu: 'tick', org_id: orgId }).then(r => { if (r.error === 'missing_key') setNudge(true) }).finally(() => void loadJobs())
    }, 8000)
    return () => window.clearInterval(id)
  }, [active, orgId, loadJobs])

  const coverOf = (m: Model) => { const it = modelImgs[m.image_ids[0]]; return it ? thumbFor(it) : null }
  const chosenModel = models.find(m => m.id === modelId) ?? null
  const refsCount = chosenModel ? chosenModel.image_ids.length : adhoc.length
  const ready = queue.length > 0 && refsCount > 0

  function addLinks() {
    const lines = links.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean)
    const codes = [...new Set(lines.map(reelCodeFrom).filter((x): x is string => !!x))]
    if (!codes.length) { toast('Aucun lien Instagram valide (ex. instagram.com/reel/…).', 'bad'); return }
    addToQueue(codes.map(code => { const v = reels.find(r => r.code === code); return { key: `r:${code}`, reel_code: code, label: v ? `@${v.username}` : code, thumb: v?.thumb ? img(v.thumb) : null } }))
    setLinks('')
    if (codes.length < lines.length) toast(`${lines.length - codes.length} ligne(s) ignorée(s) : pas un lien de Reel.`, 'info')
  }

  async function launch() {
    if (!ready || sending) return
    setSending(true)
    try {
      const r = await callFn({
        genjutsu: 'enqueue', org_id: orgId, resolution: res, prompt: prompt.trim(),
        ...(chosenModel ? { model_id: chosenModel.id } : { image_ids: adhoc.map(a => a.id) }),
        sources: queue.map(q => ({ ...(q.reel_code ? { reel_code: q.reel_code } : { bank_id: q.bank_id }), title: `Genjutsu · ${q.label}`, thumb: q.thumb })),
      })
      if (r.error === 'missing_key') { setNudge(true); toast('Ajoute d’abord ta clé Higgsfield (en haut de la page).', 'bad', 7000); return }
      if (r.error === 'missing_sql') { setNoSql(true); return }
      if (!r.ok) { toast(String(r.error ?? 'Envoi impossible.'), 'bad', 8000); return }
      toast(`${r.count} Reel(s) en file — recréés un par un, même app fermée.`, 'ok', 6000)
      setQueue([]); setTab('history'); void loadJobs()
    } finally { setSending(false) }
  }

  async function saveModel() {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) { toast('Donne un nom au modèle.', 'bad'); return }
    if (!editing.images.length) { toast('Ajoute au moins une image de référence.', 'bad'); return }
    const row = { name, image_ids: editing.images.slice(0, 8).map(i => i.id) }
    const { data, error } = editing.id
      ? await supabase.from('genjutsu_models').update(row).eq('id', editing.id).select('id').maybeSingle()
      : await supabase.from('genjutsu_models').insert({ ...row, user_id: user.id, org_id: orgId }).select('id').maybeSingle()
    if (error) { toast(isMissingTable(error.message) ? 'Colle d’abord supabase/migrations/20261015_genjutsu.sql dans Supabase → SQL Editor → Run.' : `Enregistrement impossible : ${error.message}`, 'bad', 8000); return }
    toast(editing.id ? 'Modèle mis à jour.' : 'Modèle créé.', 'ok')
    if (data?.id) { setModelId(data.id); try { localStorage.setItem(MODEL_KEY, data.id) } catch { /* ignore */ } }
    setEditing(null); void loadModels()
  }
  async function deleteModel(m: Model) {
    if (!await confirmDialog({ title: `Supprimer le modèle « ${m.name} » ?`, text: 'Les images restent dans ta Banque.', confirmLabel: 'Supprimer', danger: true })) return
    const { error } = await supabase.from('genjutsu_models').delete().eq('id', m.id)
    if (error) toast(`Suppression impossible : ${error.message}`, 'bad'); else void loadModels()
  }
  async function retryJob(j: Job) {
    const r = await callFn({ genjutsu: 'retry', job_id: j.id, org_id: orgId })
    if (r.error === 'missing_key') { setNudge(true); return }
    if (!r.ok) toast(String(r.error ?? 'Impossible.'), 'bad'); else { toast('Génération relancée.', 'ok'); void loadJobs() }
  }
  async function removeJob(j: Job) {
    const r = await callFn({ genjutsu: 'remove', job_id: j.id, org_id: orgId })
    if (!r.ok) toast(String(r.error ?? 'Impossible.'), 'bad'); else void loadJobs()
  }
  const pickModel = (id: string | null) => { setModelId(id); try { if (id) localStorage.setItem(MODEL_KEY, id); else localStorage.removeItem(MODEL_KEY) } catch { /* ignore */ } }

  const nActive = jobs.filter(j => ACTIVE(j.status)).length
  const TABS: [Tab, string, string][] = [
    ['create', 'Créer', 'M12 5v14|M5 12h14'],
    ['models', `Modèles${models.length ? ` · ${models.length}` : ''}`, 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    ['history', `Historique${nActive ? ` · ${nActive} en cours` : ''}`, 'M3 12a9 9 0 1 0 9-9|M3 4v5h5|M12 7v5l3 3'],
  ]

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* En-tête */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: V }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: V, boxShadow: '0 0 0 4px rgba(167,139,250,.18)' }} />Genjutsu IA · Higgsfield
        </span>
        <h1 style={{ margin: '10px 0 0', fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 0.92, textTransform: 'uppercase', fontSize: 'clamp(32px, 4vw, 56px)', color: '#F4F4F5' }}>
          Recrée des Reels <span style={{ color: '#52525B' }}>avec ton modèle</span>
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.55, color: '#8B8B94', maxWidth: 680 }}>Les mouvements, le cadrage et le rythme du Reel sont gardés ; le personnage et le décor sont reconstruits à partir des images de ton modèle. Les vidéos arrivent dans ta Banque (dossier IA).</p>
      </div>

      {noSql && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', fontSize: 13, color: '#FCD34D' }}>
          Activation requise : colle <b>supabase/migrations/20261015_genjutsu.sql</b> dans Supabase → SQL Editor → Run, puis recharge.
        </div>
      )}
      <KeyPanel theme={theme} orgId={orgId} nudge={nudge} onChange={setHasKey} />

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)', overflowX: 'auto' }}>
        {TABS.map(([k, l, i]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, height: 42, padding: '0 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 750, color: tab === k ? '#F4F4F5' : '#71717A' }}>
            <Icon d={i} size={14} />{l}
            <span style={{ position: 'absolute', left: 10, right: 10, bottom: -1, height: 2, borderRadius: 2, background: tab === k ? 'linear-gradient(90deg,#A78BFA,#F472B6)' : 'transparent' }} />
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1.55fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div>
            <Section n="01" title="Les Reels à recréer" sub="Autant que tu veux : ils sont recréés un par un (4 à 30 s chacun)."
              right={<Segmented value={srcKind} onChange={setSrcKind} options={[{ v: 'links', l: 'Liens Instagram' }, { v: 'viral', l: 'Veille Reels' }, { v: 'bank', l: 'Vidéos' }]} />}>
              {srcKind === 'links' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea value={links} onChange={e => setLinks(e.target.value)} rows={4} placeholder={'Colle des liens de Reels (un par ligne)\nhttps://www.instagram.com/reel/…\nhttps://www.instagram.com/p/…'} style={TEXTAREA} />
                  <span style={{ display: 'flex', justifyContent: 'flex-end' }}><Btn theme={theme} sm tone="primary" label="Ajouter à la file" icon="M12 5v14|M5 12h14" disabled={!links.trim()} onClick={addLinks} /></span>
                </div>
              )}
              {srcKind === 'viral' && (reels.length === 0 ? <div style={{ fontSize: 13, color: '#71717A', padding: '8px 2px' }}>Aucun Reel dans la Veille pour l’instant.</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                  {reels.map(r => {
                    const on = queue.some(q => q.reel_code === r.code)
                    return (
                      <button key={r.code} type="button" onClick={() => on ? setQueue(cur => cur.filter(q => q.reel_code !== r.code)) : addToQueue([{ key: `r:${r.code}`, reel_code: r.code, label: `@${r.username}`, thumb: r.thumb ? img(r.thumb) : null }])}
                        style={{ position: 'relative', aspectRatio: '9 / 16', padding: 0, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: '#161618', border: 'none', boxShadow: on ? `0 0 0 2px ${V}` : '0 0 0 1px rgba(255,255,255,0.08)', transform: on ? 'scale(.97)' : 'none', transition: 'transform .15s ease, box-shadow .15s ease' }}>
                        {r.thumb && <img src={img(r.thumb)} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                        <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,.85))' }} />
                        {on && <span style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 99, background: V, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon d="M20 6L9 17l-5-5" size={12} sw={3} /></span>}
                        <span style={{ position: 'absolute', left: 6, right: 6, bottom: 6, textAlign: 'left' }}>
                          <b style={{ display: 'block', fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>{compact(r.views)}</b>
                          <span data-no-tr style={{ display: 'block', fontSize: 10.5, color: '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{r.username}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
              {srcKind === 'bank' && (
                <button type="button" onClick={() => setPicker({ kind: 'videos', for: 'src' })} style={{ width: '100%', padding: '24px 12px', borderRadius: 14, border: '1px dashed rgba(255,255,255,0.14)', background: 'transparent', color: '#A1A1AA', fontSize: 13, cursor: 'pointer' }}>
                  + Choisis des vidéos dans ta Banque (ou importe-les depuis ton PC)
                </button>
              )}
              {queue.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#A1A1AA' }}>File · {queue.length} Reel(s)</span>
                    <button type="button" onClick={() => setQueue([])} style={{ border: 'none', background: 'transparent', color: '#71717A', fontSize: 12, cursor: 'pointer' }}>Tout retirer</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                    {queue.map((q, i) => {
                      const b = q.bank_id ? bankSrc.find(x => x.id === q.bank_id) : null
                      const url = b ? thumbFor(b) : q.thumb
                      return (
                        <span key={q.key} style={{ position: 'relative', flexShrink: 0, width: 74 }}>
                          <Thumb url={url} video={!!b && !b.thumbnail_url && !b.thumbnail_path} style={{ aspectRatio: '9 / 16', borderRadius: 10 }} />
                          {!url && <span style={{ position: 'absolute', left: 0, right: 0, top: '38%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#8B8B94', fontSize: 10, fontWeight: 700 }}><Icon d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" size={16} />{q.reel_code ? 'Lien Reel' : 'Vidéo'}</span>}
                          <span style={{ position: 'absolute', top: 5, left: 5, padding: '1px 5px', borderRadius: 99, background: '#F4F4F5', color: '#0A0A0B', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 800 }}>{String(i + 1).padStart(2, '0')}</span>
                          <button type="button" aria-label="Retirer" onClick={() => setQueue(cur => cur.filter(x => x.key !== q.key))} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 99, border: 'none', background: 'rgba(10,10,11,.7)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon d="M18 6L6 18|M6 6l12 12" size={10} /></button>
                          <span data-no-tr style={{ display: 'block', marginTop: 4, fontSize: 10.5, color: '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.label}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </Section>

            <Section n="02" title="Ton modèle" sub="Les images de référence utilisées pour reconstruire le personnage."
              right={<Btn theme={theme} sm label="Nouveau modèle" icon="M12 5v14|M5 12h14" onClick={() => setEditing({ id: null, name: '', images: [] })} />}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                {models.map(m => <ModelCard key={m.id} m={m} cover={coverOf(m)} count={m.image_ids.length} on={modelId === m.id} onClick={() => pickModel(modelId === m.id ? null : m.id)} />)}
                <button type="button" onClick={() => { pickModel(null); setPicker({ kind: 'images', for: 'adhoc' }) }}
                  style={{ aspectRatio: '3 / 4', borderRadius: 16, border: `1px dashed ${!chosenModel && adhoc.length ? V : 'rgba(255,255,255,0.16)'}`, background: 'transparent', color: '#A1A1AA', fontSize: 12.5, fontWeight: 650, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, textAlign: 'center' }}>
                  <Icon d="M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" size={18} />
                  {!chosenModel && adhoc.length ? `${adhoc.length} image(s) ponctuelle(s)` : 'Images ponctuelles'}
                </button>
              </div>
              {!models.length && <p style={{ margin: '12px 2px 0', fontSize: 12.5, color: '#8B8B94' }}>Astuce : crée un <b>modèle</b> (un nom + ses photos) pour ne plus rechoisir les images à chaque fois.</p>}
            </Section>

            <Section n="03" title="Réglages" sub="La consigne est facultative (ex. « garde la robe rouge, décor plage »).">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Segmented value={res} onChange={setRes} options={[{ v: '480p', l: '480p' }, { v: '720p', l: '720p' }, { v: '1080p', l: '1080p' }]} />
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} maxLength={2000} placeholder="Consigne (facultatif)" style={TEXTAREA} />
              </div>
            </Section>
          </div>

          {/* Récap + lancement */}
          <div style={{ position: narrow ? 'static' : 'sticky', top: 12, borderRadius: 20, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.07)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#A1A1AA' }}>Récapitulatif</span>
            {([['Reels à recréer', queue.length ? String(queue.length) : '—'], ['Modèle', chosenModel ? chosenModel.name : adhoc.length ? `${adhoc.length} image(s) ponctuelle(s)` : '—'], ['Résolution', res], ['Clé Higgsfield', hasKey ? 'OK' : 'à ajouter']] as [string, string][]).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5 }}>
                <span style={{ color: '#8B8B94' }}>{l}</span>
                <span data-no-tr={l === 'Modèle' ? true : undefined} style={{ fontWeight: 750, color: l === 'Clé Higgsfield' && !hasKey ? '#FBBF24' : '#EDEDEF', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
            <button type="button" disabled={!ready || sending} onClick={() => void launch()}
              style={{ height: 52, borderRadius: 14, border: 'none', fontSize: 15.5, fontWeight: 800, cursor: ready && !sending ? 'pointer' : 'not-allowed', color: '#fff', opacity: ready ? 1 : 0.45,
                background: GRAD, boxShadow: ready ? '0 4px 0 #6D28D9, 0 16px 34px -14px rgba(236,72,153,.7)' : 'none' }}>
              {sending ? 'Envoi…' : queue.length > 1 ? `Recréer les ${queue.length} Reels →` : 'Recréer le Reel →'}
            </button>
            <span style={{ fontSize: 12, lineHeight: 1.5, color: '#71717A' }}>Un Reel à la fois, dans l’ordre. Tu peux fermer l’app : la file continue. Génération facturée par Higgsfield sur ta clé. Utilise des photos de modèles qui ont donné leur accord.</span>
          </div>
        </div>
      )}

      {tab === 'models' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, color: '#8B8B94' }}>Un modèle = un nom + 1 à 8 photos (visage net, plusieurs angles). Partagé avec ton équipe.</span>
            <Btn theme={theme} tone="primary" label="Nouveau modèle" icon="M12 5v14|M5 12h14" onClick={() => setEditing({ id: null, name: '', images: [] })} />
          </div>
          {models.length === 0 ? (
            <button type="button" onClick={() => setEditing({ id: null, name: '', images: [] })} style={{ width: '100%', padding: '48px 16px', borderRadius: 20, border: '1px dashed rgba(255,255,255,0.14)', background: 'transparent', color: '#A1A1AA', fontSize: 14, cursor: 'pointer' }}>
              + Crée ton premier modèle
            </button>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
              {models.map(m => (
                <ModelCard key={m.id} m={m} cover={coverOf(m)} count={m.image_ids.length} actions={<>
                  <Btn theme={theme} sm label="Modifier" onClick={() => setEditing({ id: m.id, name: m.name, images: m.image_ids.map(id => modelImgs[id]).filter(Boolean) })} />
                  <Btn theme={theme} sm tone="quiet" label="Supprimer" onClick={() => void deleteModel(m)} />
                </>} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        jobs.length === 0 ? <div style={{ padding: '48px 16px', textAlign: 'center', fontSize: 13.5, color: '#71717A', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 20 }}>Tes Reels recréés apparaîtront ici.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px,100%), 1fr))', gap: 10 }}>
            {jobs.map(j => {
              const [label, color] = STATUS[j.status] ?? [j.status, '#A1A1AA']
              const done = j.status === 'completed'
              return (
                <div key={j.id} style={{ display: 'flex', gap: 12, padding: 10, borderRadius: 16, background: '#0F0F11', border: `1px solid ${j.status === 'failed' ? 'rgba(248,113,113,.3)' : 'rgba(255,255,255,0.07)'}` }}>
                  <span style={{ position: 'relative', width: 78, flexShrink: 0, aspectRatio: '9 / 16', borderRadius: 10, overflow: 'hidden', background: '#0A0A0B' }}>
                    {done && j.video_url ? <video src={j.video_url} muted loop autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : j.thumb && <img src={j.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.55) saturate(.6)' }} />}
                    {(j.status === 'queued' || j.status === 'in_progress') && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 22, height: 22, borderRadius: 99, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'aSpin .8s linear infinite' }} /></span>}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span data-no-tr style={{ fontSize: 13.5, fontWeight: 750, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title ?? 'Genjutsu'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
                    {j.error && <span data-no-tr style={{ fontSize: 11.5, color: j.status === 'failed' ? '#F87171' : '#A1A1AA', lineHeight: 1.4 }}>{j.error}</span>}
                    <span style={{ fontSize: 11.5, color: '#71717A' }}>{new Date(j.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                      {done && j.video_url && <Btn theme={theme} sm label="Télécharger" onClick={() => window.open(j.video_url!, '_blank', 'noopener')} />}
                      {done && j.bank_id && <Btn theme={theme} sm tone="primary" label="Publier" onClick={() => openTool(onNavigate, 'publish', { mode: 'reels' })} />}
                      {j.status === 'failed' && <Btn theme={theme} sm label="Relancer" icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8" onClick={() => void retryJob(j)} />}
                      {!(j.status === 'queued' || j.status === 'in_progress') && <Btn theme={theme} sm tone="quiet" label={j.status === 'waiting' ? 'Retirer de la file' : 'Effacer'} onClick={() => void removeJob(j)} />}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Éditeur de modèle (portail : le conteneur de la page est animé, un « fixed » dedans se décalerait) */}
      {editing && createPortal(
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px 16px', boxSizing: 'border-box' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(620px, 100%)', maxHeight: '84vh', overflowY: 'auto', borderRadius: 20, background: '#111113', border: '1px solid rgba(255,255,255,0.1)', padding: 20, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', textTransform: 'uppercase', color: '#F4F4F5' }}>{editing.id ? 'Modifier le modèle' : 'Nouveau modèle'}</span>
            <input value={editing.name} onChange={e => setEditing(x => x && { ...x, name: e.target.value })} placeholder="Nom du modèle (ex. Léa)" maxLength={60} style={FIELD} autoFocus />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
              {editing.images.map(r => (
                <span key={r.id} style={{ position: 'relative' }}>
                  <Thumb url={thumbFor(r)} style={{ aspectRatio: '4 / 5', borderRadius: 12 }} />
                  <button type="button" aria-label="Retirer" onClick={() => setEditing(x => x && { ...x, images: x.images.filter(i => i.id !== r.id) })} style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 99, border: 'none', background: 'rgba(10,10,11,.7)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon d="M18 6L6 18|M6 6l12 12" size={11} /></button>
                </span>
              ))}
              {editing.images.length < 8 && (
                <button type="button" onClick={() => setPicker({ kind: 'images', for: 'model' })} style={{ aspectRatio: '4 / 5', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.16)', background: 'transparent', color: '#A1A1AA', fontSize: 12, cursor: 'pointer' }}>+ Images</button>
              )}
            </div>
            <span style={{ fontSize: 12, color: '#71717A' }}>1 à 8 photos : visage net, plusieurs angles, la tenue et le décor voulus.</span>
            <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setEditing(null)} />
              <Btn theme={theme} tone="primary" label="Enregistrer le modèle" onClick={() => void saveModel()} />
            </span>
          </div>
        </div>,
        document.body,
      )}

      {picker && (
        <BankPicker theme={theme} user={user} org={org} kind={picker.kind} multi
          initialIds={picker.for === 'adhoc' ? adhoc.map(a => a.id) : picker.for === 'model' ? (editing?.images ?? []).map(a => a.id) : []}
          title={picker.kind === 'images' ? 'Images de référence (1 à 8)' : 'Vidéos à recréer'}
          onClose={() => setPicker(null)}
          onApply={async r => {
            if (r.kind === 'captions') return
            const target = picker.for
            if (target === 'src') {
              const items = await fetchItems(r.ids)
              setBankSrc(cur => [...cur, ...items.filter(x => !cur.some(c => c.id === x.id))])
              addToQueue(items.map(x => ({ key: `b:${x.id}`, bank_id: x.id, label: x.title, thumb: null })))
            } else {
              const items = await fetchItems(r.ids.slice(0, 8))
              if (r.ids.length > 8) toast('8 images maximum : les premières ont été gardées.', 'info')
              if (!items.length && r.ids.length) toast('Images introuvables dans la Banque.', 'bad')
              if (target === 'adhoc') setAdhoc(items)
              else setEditing(x => x && { ...x, images: items })
            }
            setPicker(null)
          }} />
      )}
    </div>
  )
}
