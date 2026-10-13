// Genjutsu IA (Higgsfield) — « recréer un Reel avec mes images ».
// Sources (file d'attente) : liens Instagram collés, Reels de la Veille, vidéos de la Banque / du PC.
// Mêmes références (1 à 8 images de la Banque) pour toute la file ; génération UNE PAR UNE.
// L'appel part de l'edge function (clé en secret Supabase), puis on suit l'avancement ;
// la vidéo finie est copiée dans la Banque (dossier « IA »). Super-admin seulement pour l'instant.
// Travaux en cours mémorisés localement (sf-genjutsu-jobs) : un rafraîchissement reprend le suivi.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { compact, useBankThumbs } from '@/lib/data'
import { Btn, FIELD, Icon, Panel, Segmented, TEXTAREA, toast, useNarrow } from '@/lib/ui'
import BankPicker from '@/components/BankPicker'
import { takeOpenArg, openTool } from '@/lib/openTool'
import { reelCodeFrom } from '@/lib/genjutsu'

const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'
const JOBS_KEY = 'sf-genjutsu-jobs'
const img = (u: string) => `${FN_URL}?img=${encodeURIComponent(u)}`
type Res = '480p' | '720p' | '1080p'
interface BankItem { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null }
interface ReelPick { code: string; thumb: string | null; username: string; views: number; score: number }
// Une source de la file : un Reel (code Instagram) ou une vidéo de la Banque.
interface Src { key: string; reel_code?: string; bank_id?: string; label: string; thumb: string | null; video?: boolean }
interface Job {
  id: string; request_id: string; status_url: string; status: string; created: number; title: string; org_id: string | null
  thumb: string | null; video_url?: string | null; bank_id?: string | null; error?: string | null
  // En attente (pas encore envoyé) : tout ce qu'il faut pour l'envoyer à son tour.
  src?: { reel_code?: string; bank_id?: string }; image_ids?: string[]; resolution?: Res; prompt?: string
}

async function callFn(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: s } = await supabase.auth.getSession()
  const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` }, body: JSON.stringify(body) })
  return await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })) as Record<string, unknown>
}
function loadJobs(): Job[] { try { const v = JSON.parse(localStorage.getItem(JOBS_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
function saveJobs(j: Job[]) { try { localStorage.setItem(JOBS_KEY, JSON.stringify(j.slice(0, 60))) } catch { /* ignore */ } }
const DONE = (s: string) => s === 'completed' || s === 'failed' || s === 'nsfw' || s === 'cancelled'
const SENT = (s: string) => s === 'queued' || s === 'in_progress'
const STATUS_LABEL: Record<string, string> = { waiting: 'En attente de son tour', queued: 'En file d’attente', in_progress: 'Génération en cours', completed: 'Terminé', failed: 'Échec', nsfw: 'Refusé (contenu)', cancelled: 'Annulé' }

/** Vignette d'un média de la Banque (image ou 1re image de la vidéo). */
function BankThumb({ url, video, style }: { url: string | null; video?: boolean; style?: React.CSSProperties }) {
  const S: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
  return (
    <span style={{ position: 'relative', display: 'block', overflow: 'hidden', background: '#161618', ...style }}>
      {url && (video ? <video src={`${url}#t=0.1`} muted playsInline preload="metadata" style={S} /> : <img src={url} alt="" style={S} />)}
    </span>
  )
}

function Step({ n, title, sub, children, right }: { n: string; title: string; sub: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section style={{ borderRadius: 20, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.07)', padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800, color: '#A78BFA', paddingTop: 3 }}>{n}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 900, letterSpacing: '-0.03em', textTransform: 'uppercase', color: '#F4F4F5' }}>{title}</span>
          <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, color: '#8B8B94' }}>{sub}</span>
        </span>
        {right}
      </div>
      {children}
    </section>
  )
}

// Clé API Higgsfield : saisie ici par le super-admin, stockée côté serveur (table sf_secrets,
// illisible depuis le navigateur). On n'affiche jamais la clé, seulement ses 4 derniers caractères.
function KeyPanel({ theme, onSaved, nudge }: { theme: Theme; onSaved: () => void; nudge?: boolean }) {
  const [st, setSt] = useState<{ set: boolean; hint: string | null; at: string | null } | null>(null)
  const [noSql, setNoSql] = useState(false)
  const [open, setOpen] = useState(false)
  const [id, setId] = useState('')
  const [secret, setSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('sf_secret_status', { p_name: 'higgsfield' })
    if (error) { setNoSql(/function|schema cache|does not exist/i.test(error.message)); setSt({ set: false, hint: null, at: null }); return }
    const row = (Array.isArray(data) ? data[0] : data) as { is_set?: boolean; hint?: string; updated_at?: string } | undefined
    setSt({ set: !!row?.is_set, hint: row?.hint ?? null, at: row?.updated_at ?? null })
  }, [])
  useEffect(() => { void load() }, [load])
  // Une génération a buté sur l'absence de clé : on ouvre le formulaire.
  useEffect(() => { if (nudge) setOpen(true) }, [nudge])
  async function save(clear = false) {
    const v = clear ? '' : `${id.trim()}:${secret.trim()}`
    if (!clear && (!id.trim() || !secret.trim() || /[:\s]/.test(id.trim() + secret.trim()))) { toast('Colle le Key ID et le Key Secret (sans espaces).', 'bad'); return }
    setSaving(true)
    const { error } = await supabase.rpc('sf_set_secret', { p_name: 'higgsfield', p_value: v })
    setSaving(false)
    if (error) { toast(/function|schema cache|does not exist/i.test(error.message) ? 'Colle d’abord supabase/migrations/20261014_sf_secrets.sql dans Supabase → SQL Editor → Run.' : `Enregistrement impossible : ${error.message}`, 'bad', 9000); return }
    setId(''); setSecret(''); setOpen(false); toast(clear ? 'Clé Higgsfield retirée.' : 'Clé Higgsfield enregistrée.', 'ok'); void load(); onSaved()
  }
  const ok = !!st?.set
  return (
    <section style={{ borderRadius: 16, background: '#0F0F11', border: `1px solid ${ok ? 'rgba(255,255,255,0.07)' : 'rgba(167,139,250,0.4)'}`, padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: ok ? '#4ADE80' : '#FBBF24', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 200, fontSize: 13.5, color: '#EDEDEF' }}>
          <b>Clé API Higgsfield</b>{' '}
          <span style={{ color: '#8B8B94' }}>{st === null ? '…' : ok ? `· configurée (••••${st.hint ?? ''})` : noSql ? '· colle d’abord le SQL 20261014_sf_secrets.sql dans Supabase' : '· pas encore configurée'}</span>
        </span>
        <Btn theme={theme} sm tone={ok ? 'quiet' : 'primary'} label={ok ? 'Changer la clé' : 'Ajouter ma clé'} onClick={() => setOpen(o => !o)} />
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 12.5, color: '#8B8B94', lineHeight: 1.5 }}>Sur console.higgsfield.ai → API keys : copie le <b>Key ID</b> et le <b>Key Secret</b>. Ils restent sur le serveur, personne ne peut les relire depuis l’app.</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={id} onChange={e => setId(e.target.value)} placeholder="Key ID" autoComplete="off" spellCheck={false} style={{ ...FIELD, flex: '1 1 200px' }} />
            <input value={secret} onChange={e => setSecret(e.target.value)} placeholder="Key Secret" type="password" autoComplete="new-password" spellCheck={false} style={{ ...FIELD, flex: '1 1 200px' }} />
            <Btn theme={theme} tone="primary" label={saving ? 'Enregistrement…' : 'Enregistrer'} disabled={saving} onClick={() => void save()} />
          </div>
          {ok && <span><Btn theme={theme} sm tone="quiet" label="Retirer la clé" onClick={() => void save(true)} /></span>}
        </div>
      )}
    </section>
  )
}

export default function Genjutsu({ theme, user, org, onNavigate }: { theme: Theme; user: User; org: OrgState; onNavigate: (p: string) => void }) {
  const orgId = org.currentOrg?.id ?? null
  const narrow = useNarrow(900)
  const [openArg] = useState(() => takeOpenArg<{ reel?: ReelPick }>('genjutsu'))
  const [srcKind, setSrcKind] = useState<'links' | 'viral' | 'bank'>(openArg?.reel ? 'viral' : 'links')
  const [queue, setQueue] = useState<Src[]>(() => openArg?.reel ? [{ key: `r:${openArg.reel.code}`, reel_code: openArg.reel.code, label: `@${openArg.reel.username}`, thumb: openArg.reel.thumb ? img(openArg.reel.thumb) : null }] : [])
  const [links, setLinks] = useState('')
  const [reels, setReels] = useState<ReelPick[]>([])
  const [bankSrc, setBankSrc] = useState<BankItem[]>([])
  const [refs, setRefs] = useState<BankItem[]>([])
  const [picker, setPicker] = useState<'videos' | 'images' | null>(null)
  const [res, setRes] = useState<Res>('720p')
  const [prompt, setPrompt] = useState('')
  const [missingKey, setMissingKey] = useState(false)
  const [jobs, setJobs] = useState<Job[]>(() => loadJobs().map(j => ({ ...j, id: j.id ?? j.request_id })))
  const jobsRef = useRef(jobs); jobsRef.current = jobs
  const thumbItems = useMemo(() => [...bankSrc, ...refs], [bankSrc, refs])
  const { thumbFor } = useBankThumbs(thumbItems)
  const addToQueue = (items: Src[]) => setQueue(cur => [...cur, ...items.filter(x => !cur.some(c => c.key === x.key))])

  // Reels de la Veille (les plus vus) pour choisir la source.
  useEffect(() => {
    void supabase.from('viral_reels').select('code, thumb, username, views, score').order('views', { ascending: false }).limit(24)
      .then(({ data }) => {
        const seen = new Set<string>()
        setReels(((data ?? []) as ReelPick[]).filter(r => r.code && !seen.has(r.code) && seen.add(r.code)).slice(0, 18))
      })
  }, [])

  const fetchItems = useCallback(async (ids: string[]): Promise<BankItem[]> => {
    if (!ids.length) return []
    const { data } = await supabase.from('content_bank').select('*').in('id', ids)
    const byId = new Map(((data ?? []) as BankItem[]).map(r => [r.id, r]))
    return ids.map(id => byId.get(id)).filter((x): x is BankItem => !!x)
  }, [])

  const setJobsSaved = useCallback((f: (cur: Job[]) => Job[]) => setJobs(cur => { const n = f(cur); saveJobs(n); return n }), [])
  const updateJob = useCallback((id: string, patch: Partial<Job>) => setJobsSaved(cur => cur.map(j => j.id === id ? { ...j, ...patch } : j)), [setJobsSaved])

  // Moteur de la file (toutes les 6 s) : suit la génération en cours, et quand il n'y en a
  // plus, envoie la suivante « en attente ». Une seule génération à la fois.
  const ticking = useRef(false)
  const tick = useCallback(async () => {
    if (ticking.current) return
    ticking.current = true
    try {
      const all = jobsRef.current
      for (const j of all.filter(x => SENT(x.status))) {
        const r = await callFn({ genjutsu: 'status', request_id: j.request_id, status_url: j.status_url, title: j.title, org_id: j.org_id })
        if (r.error === 'missing_key') { setMissingKey(true); return }
        if (!r.ok && !r.status) continue
        const status = String(r.status ?? j.status)
        updateJob(j.id, { status, video_url: (r.video_url as string) ?? j.video_url, bank_id: (r.bank_id as string) ?? j.bank_id, error: (r.error as string) ?? null })
        if (status === 'completed') toast(r.bank_id ? `${j.title} — ajouté à ta Banque (dossier IA).` : String(r.warn ?? 'Reel recréé.'), r.bank_id ? 'ok' : 'info', 6000)
        if (status === 'failed') toast(`Génération échouée${r.error ? ` : ${r.error}` : ''}`, 'bad', 7000)
      }
      if (jobsRef.current.some(x => SENT(x.status))) return
      const next = [...jobsRef.current].reverse().find(x => x.status === 'waiting')
      if (!next || !next.src) return
      const r = await callFn({ genjutsu: 'submit', org_id: next.org_id, resolution: next.resolution ?? '720p', prompt: next.prompt ?? '', image_ids: next.image_ids ?? [], ...next.src })
      if (r.error === 'missing_key') { setMissingKey(true); return }
      if (!r.ok) { updateJob(next.id, { status: 'failed', error: String(r.error ?? 'Lancement impossible.') }); return }
      updateJob(next.id, { status: String(r.status ?? 'queued'), request_id: String(r.request_id), status_url: String(r.status_url) })
    } finally { ticking.current = false }
  }, [updateJob])
  const active = jobs.some(j => SENT(j.status) || j.status === 'waiting')
  useEffect(() => {
    if (!active) return
    void tick()
    const id = window.setInterval(() => void tick(), 6000)
    return () => window.clearInterval(id)
  }, [active, tick])

  function addLinks() {
    const lines = links.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean)
    const codes = [...new Set(lines.map(reelCodeFrom).filter((x): x is string => !!x))]
    if (!codes.length) { toast('Aucun lien Instagram valide (ex. instagram.com/reel/…).', 'bad'); return }
    addToQueue(codes.map(code => { const v = reels.find(r => r.code === code); return { key: `r:${code}`, reel_code: code, label: v ? `@${v.username}` : code, thumb: v?.thumb ? img(v.thumb) : null } }))
    setLinks('')
    if (codes.length < lines.length) toast(`${lines.length - codes.length} ligne(s) ignorée(s) : pas un lien de Reel.`, 'info')
  }

  const ready = queue.length > 0 && refs.length > 0
  function launch() {
    if (!ready) return
    const now = Date.now()
    const created: Job[] = queue.map((q, i) => ({
      id: crypto.randomUUID(), request_id: '', status_url: '', status: 'waiting', created: now + i, org_id: orgId,
      title: `Genjutsu · ${q.label}`, thumb: q.thumb, src: q.reel_code ? { reel_code: q.reel_code } : { bank_id: q.bank_id },
      image_ids: refs.map(r => r.id), resolution: res, prompt: prompt.trim(),
    }))
    setJobsSaved(cur => [...created.reverse(), ...cur])
    setQueue([])
    toast(`${created.length} Reel(s) en file — générés un par un. Tu peux quitter la page, ça reprend au retour.`, 'ok', 6000)
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ marginBottom: 18 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#A78BFA' }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: '#A78BFA', boxShadow: '0 0 0 4px rgba(167,139,250,.18)' }} />Genjutsu IA · Admin
        </span>
        <h1 style={{ margin: '10px 0 0', fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 0.92, textTransform: 'uppercase', fontSize: 'clamp(32px, 4vw, 56px)', color: '#F4F4F5' }}>
          Recrée un Reel <span style={{ color: '#52525B' }}>avec tes images</span>
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.55, color: '#8B8B94', maxWidth: 640 }}>Les mouvements, le cadrage et le timing du Reel sont gardés ; le personnage et le décor sont reconstruits à partir de tes photos de référence.</p>
      </div>

      <KeyPanel theme={theme} nudge={missingKey} onSaved={() => setMissingKey(false)} />

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <Step n="01" title="Les Reels à recréer" sub="Ajoute autant de Reels que tu veux : ils seront recréés un par un (4 à 30 s chacun)."
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
                      style={{ position: 'relative', aspectRatio: '9 / 16', padding: 0, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: '#161618', border: 'none', boxShadow: on ? '0 0 0 2px #A78BFA' : '0 0 0 1px rgba(255,255,255,0.08)', transform: on ? 'scale(.97)' : 'none', transition: 'transform .15s ease, box-shadow .15s ease' }}>
                      {r.thumb && <img src={img(r.thumb)} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,.85))' }} />
                      {on && <span style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 99, background: '#A78BFA', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon d="M20 6L9 17l-5-5" size={12} sw={3} /></span>}
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
              <button type="button" onClick={() => setPicker('videos')} style={{ width: '100%', padding: '24px 12px', borderRadius: 14, border: '1px dashed rgba(255,255,255,0.14)', background: 'transparent', color: '#A1A1AA', fontSize: 13, cursor: 'pointer' }}>
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
                        <BankThumb url={url} video={!!b && !b.thumbnail_url && !b.thumbnail_path} style={{ aspectRatio: '9 / 16', borderRadius: 10 }} />
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
          </Step>

          <Step n="02" title="Tes images de référence" sub="1 à 8 photos : visage bien net, plusieurs angles, la tenue et le décor voulus."
            right={<Btn theme={theme} sm label={refs.length ? 'Modifier' : 'Choisir'} icon="M12 5v14|M5 12h14" onClick={() => setPicker('images')} />}>
            {refs.length === 0 ? (
              <button type="button" onClick={() => setPicker('images')} style={{ width: '100%', padding: '28px 12px', borderRadius: 14, border: '1px dashed rgba(255,255,255,0.14)', background: 'transparent', color: '#8B8B94', fontSize: 13, cursor: 'pointer' }}>
                + Ajoute les photos de ton modèle depuis la Banque
              </button>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
                {refs.map(r => (
                  <span key={r.id} style={{ position: 'relative' }}>
                    <BankThumb url={thumbFor(r)} style={{ aspectRatio: '4 / 5', borderRadius: 12 }} />
                    <button type="button" aria-label="Retirer" onClick={() => setRefs(cur => cur.filter(x => x.id !== r.id))} style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 99, border: 'none', background: 'rgba(10,10,11,.7)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon d="M18 6L6 18|M6 6l12 12" size={11} /></button>
                  </span>
                ))}
              </div>
            )}
          </Step>

          <Step n="03" title="Réglages" sub="La consigne est facultative (ex. « garde la robe rouge, décor plage »).">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Segmented value={res} onChange={setRes} options={[{ v: '480p', l: '480p' }, { v: '720p', l: '720p' }, { v: '1080p', l: '1080p' }]} />
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} maxLength={2000} placeholder="Consigne (facultatif)" style={TEXTAREA} />
            </div>
          </Step>

          <button type="button" disabled={!ready} onClick={launch}
            style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', fontSize: 15.5, fontWeight: 800, cursor: ready ? 'pointer' : 'not-allowed', color: '#fff', opacity: ready ? 1 : 0.45,
              background: 'linear-gradient(135deg,#8B5CF6,#EC4899)', boxShadow: ready ? '0 4px 0 #6D28D9, 0 16px 34px -14px rgba(236,72,153,.7)' : 'none' }}>
            {queue.length > 1 ? `Recréer les ${queue.length} Reels (un par un) →` : 'Recréer le Reel →'}
          </button>
          <p style={{ margin: '10px 2px 0', fontSize: 12, lineHeight: 1.5, color: '#71717A' }}>Utilise des photos de modèles qui ont donné leur accord. Pense au Reel source comme une inspiration de format.</p>
        </div>

        <Panel theme={theme} style={{ padding: 16, borderRadius: 20, background: '#0F0F11' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#A1A1AA' }}>Mes générations</span>
            {jobs.some(j => DONE(j.status)) && <button type="button" onClick={() => setJobsSaved(cur => cur.filter(j => !DONE(j.status)))} style={{ border: 'none', background: 'transparent', color: '#71717A', fontSize: 12, cursor: 'pointer' }}>Effacer les terminées</button>}
          </div>
          {jobs.length === 0 ? <div style={{ padding: '28px 8px', textAlign: 'center', fontSize: 13, color: '#71717A' }}>Tes Reels recréés apparaîtront ici.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.map(j => {
                const done = j.status === 'completed'
                const failed = DONE(j.status) && !done
                return (
                  <div key={j.id} style={{ display: 'flex', gap: 12, padding: 10, borderRadius: 14, background: '#141416', border: `1px solid ${failed ? 'rgba(248,113,113,.3)' : 'rgba(255,255,255,0.06)'}` }}>
                    <span style={{ position: 'relative', width: 72, flexShrink: 0, aspectRatio: '9 / 16', borderRadius: 10, overflow: 'hidden', background: '#0A0A0B' }}>
                      {done && j.video_url ? <video src={j.video_url} muted loop autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : j.thumb && <img src={j.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.55) saturate(.6)' }} />}
                      {SENT(j.status) && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 22, height: 22, borderRadius: 99, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'aSpin .8s linear infinite' }} /></span>}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span data-no-tr style={{ fontSize: 13, fontWeight: 700, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</span>
                      <span style={{ fontSize: 12, color: done ? '#C4B5FD' : failed ? '#F87171' : '#A1A1AA' }}>{STATUS_LABEL[j.status] ?? j.status}{j.error ? ` · ${j.error}` : ''}</span>
                      <span style={{ fontSize: 11.5, color: '#71717A' }}>{new Date(j.created).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      {j.status === 'waiting' && <span style={{ marginTop: 'auto' }}><Btn theme={theme} sm tone="quiet" label="Retirer de la file" onClick={() => setJobsSaved(cur => cur.filter(x => x.id !== j.id))} /></span>}
                      {done && (
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                          {j.video_url && <Btn theme={theme} sm label="Télécharger" onClick={() => window.open(j.video_url!, '_blank', 'noopener')} />}
                          {j.bank_id && <Btn theme={theme} sm tone="primary" label="Publier" onClick={() => openTool(onNavigate, 'publish', { mode: 'reels' })} />}
                          {j.bank_id && <Btn theme={theme} sm tone="quiet" label="Banque" onClick={() => onNavigate('bank')} />}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      {picker && (
        <BankPicker theme={theme} user={user} org={org} kind={picker} multi
          initialIds={picker === 'images' ? refs.map(r => r.id) : []}
          title={picker === 'images' ? 'Images de référence (1 à 8)' : 'Vidéos à recréer'}
          onClose={() => setPicker(null)}
          onApply={async r => {
            if (r.kind === 'captions') return
            if (picker === 'images') {
              const items = await fetchItems(r.ids.slice(0, 8))
              setRefs(items)
              if (r.ids.length > 8) toast('8 images maximum : les premières ont été gardées.', 'info')
              if (!items.length && r.ids.length) toast('Images introuvables dans la Banque.', 'bad')
            } else {
              const items = await fetchItems(r.ids)
              setBankSrc(cur => [...cur, ...items.filter(x => !cur.some(c => c.id === x.id))])
              addToQueue(items.map(x => ({ key: `b:${x.id}`, bank_id: x.id, label: x.title, thumb: null, video: true })))
            }
            setPicker(null)
          }} />
      )}
    </div>
  )
}
