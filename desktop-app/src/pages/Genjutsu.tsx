// Genjutsu IA (Higgsfield) — « recréer un Reel avec mes images ».
// Source : une vidéo de la Banque ou un Reel de la Veille (mouvements, cadrages, timing gardés).
// Références : 1 à 8 images de la Banque (le casting est reconstruit à partir d'elles).
// L'appel part de l'edge function (clé en secret Supabase), puis on suit l'avancement ;
// la vidéo finie est copiée dans la Banque (dossier « IA »). Super-admin seulement pour l'instant.
// Travaux en cours mémorisés localement (sf-genjutsu-jobs) : un rafraîchissement reprend le suivi.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { compact, useBankThumbs } from '@/lib/data'
import { Btn, Icon, Panel, Segmented, TEXTAREA, toast, useNarrow } from '@/lib/ui'
import BankPicker from '@/components/BankPicker'
import { takeOpenArg, openTool } from '@/lib/openTool'

const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'
const JOBS_KEY = 'sf-genjutsu-jobs'
const img = (u: string) => `${FN_URL}?img=${encodeURIComponent(u)}`
type Res = '480p' | '720p' | '1080p'
interface BankItem { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null }
interface ReelPick { code: string; thumb: string | null; username: string; views: number; score: number }
interface Job {
  request_id: string; status_url: string; status: string; created: number; title: string; org_id: string | null
  thumb: string | null; video_url?: string | null; bank_id?: string | null; error?: string | null
}

async function callFn(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: s } = await supabase.auth.getSession()
  const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` }, body: JSON.stringify(body) })
  return await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })) as Record<string, unknown>
}
function loadJobs(): Job[] { try { const v = JSON.parse(localStorage.getItem(JOBS_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
function saveJobs(j: Job[]) { try { localStorage.setItem(JOBS_KEY, JSON.stringify(j.slice(0, 30))) } catch { /* ignore */ } }
const DONE = (s: string) => s === 'completed' || s === 'failed' || s === 'nsfw' || s === 'cancelled'
const STATUS_LABEL: Record<string, string> = { queued: 'En file d’attente', in_progress: 'Génération en cours', completed: 'Terminé', failed: 'Échec', nsfw: 'Refusé (contenu)', cancelled: 'Annulé' }

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

export default function Genjutsu({ theme, user, org, onNavigate }: { theme: Theme; user: User; org: OrgState; onNavigate: (p: string) => void }) {
  const orgId = org.currentOrg?.id ?? null
  const narrow = useNarrow(900)
  const [openArg] = useState(() => takeOpenArg<{ reel?: ReelPick }>('genjutsu'))
  const [srcKind, setSrcKind] = useState<'viral' | 'bank'>('viral')
  const [reel, setReel] = useState<ReelPick | null>(openArg?.reel ?? null)
  const [reels, setReels] = useState<ReelPick[]>([])
  const [srcVideo, setSrcVideo] = useState<BankItem | null>(null)
  const [refs, setRefs] = useState<BankItem[]>([])
  const [picker, setPicker] = useState<'videos' | 'images' | null>(null)
  const [res, setRes] = useState<Res>('720p')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [missingKey, setMissingKey] = useState(false)
  const [jobs, setJobs] = useState<Job[]>(loadJobs)
  const thumbItems = useMemo(() => [...(srcVideo ? [srcVideo] : []), ...refs], [srcVideo, refs])
  const { thumbFor } = useBankThumbs(thumbItems)

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
    const { data } = await supabase.from('content_bank').select('id, title, storage_path, file_url, thumbnail_url, thumbnail_path').in('id', ids)
    const byId = new Map(((data ?? []) as BankItem[]).map(r => [r.id, r]))
    return ids.map(id => byId.get(id)).filter((x): x is BankItem => !!x)
  }, [])

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs(cur => { const n = cur.map(j => j.request_id === id ? { ...j, ...patch } : j); saveJobs(n); return n })
  }, [])

  // Suivi des générations en cours (toutes les 8 s).
  useEffect(() => {
    const pending = jobs.filter(j => !DONE(j.status))
    if (!pending.length) return
    const id = window.setInterval(() => {
      for (const j of pending) {
        void callFn({ genjutsu: 'status', request_id: j.request_id, status_url: j.status_url, title: j.title, org_id: j.org_id }).then(r => {
          if (r.error === 'missing_key') { setMissingKey(true); return }
          if (!r.ok && !r.status) return
          const status = String(r.status ?? j.status)
          updateJob(j.request_id, { status, video_url: (r.video_url as string) ?? j.video_url, bank_id: (r.bank_id as string) ?? j.bank_id, error: (r.error as string) ?? null })
          if (status === 'completed' && j.status !== 'completed') toast(r.bank_id ? 'Reel recréé — ajouté à ta Banque (dossier IA).' : String(r.warn ?? 'Reel recréé.'), r.bank_id ? 'ok' : 'info', 7000)
          if (status === 'failed') toast(`Génération échouée${r.error ? ` : ${r.error}` : ''}`, 'bad', 7000)
        })
      }
    }, 8000)
    return () => window.clearInterval(id)
  }, [jobs, updateJob])

  const ready = (srcKind === 'viral' ? !!reel : !!srcVideo) && refs.length > 0
  async function launch() {
    if (!ready || busy) return
    setBusy(true)
    try {
      const title = srcKind === 'viral' && reel ? `Genjutsu · @${reel.username}` : `Genjutsu · ${srcVideo?.title ?? 'vidéo'}`
      const r = await callFn({
        genjutsu: 'submit', org_id: orgId, resolution: res, prompt: prompt.trim(), image_ids: refs.map(x => x.id),
        ...(srcKind === 'viral' && reel ? { reel_code: reel.code } : { bank_id: srcVideo?.id }),
      })
      if (r.error === 'missing_key') { setMissingKey(true); toast('Clé Higgsfield pas encore configurée.', 'bad'); return }
      if (!r.ok) { toast(String(r.error ?? 'Lancement impossible.'), 'bad', 8000); return }
      const job: Job = { request_id: String(r.request_id), status_url: String(r.status_url), status: String(r.status ?? 'queued'), created: Date.now(), title, org_id: orgId,
        thumb: srcKind === 'viral' && reel?.thumb ? img(reel.thumb) : (srcVideo ? thumbFor(srcVideo) : null) }
      setJobs(cur => { const n = [job, ...cur]; saveJobs(n); return n })
      toast('Génération lancée — tu peux quitter la page, le suivi reprend au retour.', 'ok')
    } finally { setBusy(false) }
  }

  const selected = srcKind === 'viral' ? reel : null
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

      {missingKey && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', fontSize: 13, color: '#FCD34D', lineHeight: 1.5 }}>
          Clé Higgsfield pas encore configurée : ajoute <b>HIGGSFIELD_KEY_ID</b> et <b>HIGGSFIELD_KEY_SECRET</b> dans Supabase → Edge Functions → Secrets.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <Step n="01" title="Le Reel à recréer" sub="Ses mouvements, son cadrage et son rythme sont gardés (4 à 30 s)."
            right={<Segmented value={srcKind} onChange={setSrcKind} options={[{ v: 'viral', l: 'Veille Reels' }, { v: 'bank', l: 'Ma Banque' }]} />}>
            {srcKind === 'viral' ? (
              reels.length === 0 ? <div style={{ fontSize: 13, color: '#71717A', padding: '8px 2px' }}>Aucun Reel dans la Veille pour l’instant.</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                  {reels.map(r => {
                    const on = selected?.code === r.code
                    return (
                      <button key={r.code} type="button" onClick={() => setReel(r)} style={{ position: 'relative', aspectRatio: '9 / 16', padding: 0, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: '#161618', border: 'none', boxShadow: on ? '0 0 0 2px #A78BFA' : '0 0 0 1px rgba(255,255,255,0.08)', transform: on ? 'scale(.97)' : 'none', transition: 'transform .15s ease, box-shadow .15s ease' }}>
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
              )
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {srcVideo && <BankThumb url={thumbFor(srcVideo)} video={!srcVideo.thumbnail_url && !srcVideo.thumbnail_path} style={{ width: 84, aspectRatio: '9 / 16', borderRadius: 12 }} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: srcVideo ? '#EDEDEF' : '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-no-tr={srcVideo ? true : undefined}>{srcVideo ? srcVideo.title : 'Aucune vidéo choisie.'}</span>
                <Btn theme={theme} label={srcVideo ? 'Changer' : 'Choisir dans la Banque'} icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" onClick={() => setPicker('videos')} />
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

          <button type="button" disabled={!ready || busy} onClick={() => void launch()}
            style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', fontSize: 15.5, fontWeight: 800, cursor: ready && !busy ? 'pointer' : 'not-allowed', color: '#fff', opacity: ready ? 1 : 0.45,
              background: 'linear-gradient(135deg,#8B5CF6,#EC4899)', boxShadow: ready ? '0 4px 0 #6D28D9, 0 16px 34px -14px rgba(236,72,153,.7)' : 'none' }}>
            {busy ? 'Lancement…' : 'Recréer le Reel →'}
          </button>
          <p style={{ margin: '10px 2px 0', fontSize: 12, lineHeight: 1.5, color: '#71717A' }}>Utilise des photos de modèles qui ont donné leur accord. Pense au Reel source comme une inspiration de format.</p>
        </div>

        <Panel theme={theme} style={{ padding: 16, borderRadius: 20, background: '#0F0F11' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#A1A1AA' }}>Mes générations</span>
            {jobs.some(j => DONE(j.status)) && <button type="button" onClick={() => setJobs(cur => { const n = cur.filter(j => !DONE(j.status)); saveJobs(n); return n })} style={{ border: 'none', background: 'transparent', color: '#71717A', fontSize: 12, cursor: 'pointer' }}>Effacer les terminées</button>}
          </div>
          {jobs.length === 0 ? <div style={{ padding: '28px 8px', textAlign: 'center', fontSize: 13, color: '#71717A' }}>Tes Reels recréés apparaîtront ici.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.map(j => {
                const done = j.status === 'completed'
                const failed = DONE(j.status) && !done
                return (
                  <div key={j.request_id} style={{ display: 'flex', gap: 12, padding: 10, borderRadius: 14, background: '#141416', border: `1px solid ${failed ? 'rgba(248,113,113,.3)' : 'rgba(255,255,255,0.06)'}` }}>
                    <span style={{ position: 'relative', width: 72, flexShrink: 0, aspectRatio: '9 / 16', borderRadius: 10, overflow: 'hidden', background: '#0A0A0B' }}>
                      {done && j.video_url ? <video src={j.video_url} muted loop autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : j.thumb && <img src={j.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.55) saturate(.6)' }} />}
                      {!DONE(j.status) && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 22, height: 22, borderRadius: 99, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'aSpin .8s linear infinite' }} /></span>}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span data-no-tr style={{ fontSize: 13, fontWeight: 700, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</span>
                      <span style={{ fontSize: 12, color: done ? '#C4B5FD' : failed ? '#F87171' : '#A1A1AA' }}>{STATUS_LABEL[j.status] ?? j.status}{j.error ? ` · ${j.error}` : ''}</span>
                      <span style={{ fontSize: 11.5, color: '#71717A' }}>{new Date(j.created).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
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
        <BankPicker theme={theme} user={user} org={org} kind={picker} multi={picker === 'images'}
          initialIds={picker === 'images' ? refs.map(r => r.id) : srcVideo ? [srcVideo.id] : []}
          title={picker === 'images' ? 'Images de référence (1 à 8)' : 'Vidéo source'}
          onClose={() => setPicker(null)}
          onApply={async r => {
            if (r.kind === 'captions') return
            const items = await fetchItems(r.ids.slice(0, picker === 'images' ? 8 : 1))
            if (picker === 'images') { setRefs(items); if (r.ids.length > 8) toast('8 images maximum : les premières ont été gardées.', 'info') }
            else setSrcVideo(items[0] ?? null)
            setPicker(null)
          }} />
      )}
    </div>
  )
}
