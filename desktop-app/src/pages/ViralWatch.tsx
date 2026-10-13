// Veille des Reels viraux — deux sources :
//   • « Sélection ScaleFlow » (scope public) : comptes de référence choisis par le super-admin, visibles par tous ;
//   • « Mes comptes » (scope private) : chaque utilisateur / équipe suit ses propres comptes.
// Les Reels sont classés par score « au-dessus de la normale » (vues / médiane du compte).
// Relevé quotidien côté serveur (edge function run-scheduled-posts, étape 0-viral) ou à la demande.
// Fiche d'un Reel : vidéo jouée / téléchargée via le proxy de la fonction (le CDN Instagram
// bloque le navigateur), légende, stats, liens.
// Tables : supabase/migrations/20261012*_viral*.sql. Données : HikerAPI (secret HIKERAPI_KEY).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { takeOpenArg } from '@/lib/openTool'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { FeatureBanner, CineStat } from '@/components/CineHero'
import { Btn, Empty, Icon, Modal, PageHead, Panel, PanelHead, SkeletonRows, Segmented, FIELD, TEXTAREA, toast, useNarrow } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { fmtNumber } from '@/lib/data'

type Scope = 'public' | 'private'
type Region = 'fr' | 'us'
const REGIONS: { v: Region; l: string }[] = [{ v: 'fr', l: '🇫🇷 FR' }, { v: 'us', l: '🇺🇸 US' }]
interface Watch { id: string; username: string; niche: string; fetched_at: string | null; last_error: string | null; scope?: Scope; region?: Region }
interface Reel { watch_id: string; code: string; username: string; views: number; likes: number; comments: number; taken_at: string | null; thumb: string | null; url: string | null; baseline: number; score: number }
interface Media { videoUrl: string | null; caption: string; duration: number; views: number; likes: number; comments: number; thumb: string | null }
type Range = '1' | '7' | '30'
type Sort = 'score' | 'views' | 'likes' | 'recent'

const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'
const MAX_PRIVATE = 30
// Les images Instagram sont bloquées en affichage direct → proxy d'images de l'edge function.
const img = (u: string) => `${FN_URL}?img=${encodeURIComponent(u)}`

const I = {
  play: 'M6 4l14 8-14 8V4z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  comment: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3',
  link: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6|M15 3h6v6|M10 14L21 3',
  copy: 'M9 9h11v11H9z|M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
}

/** Pur : filtre période / pays / niche / compte puis tri. */
export function filterReels(reels: Reel[], watch: Watch[], o: { range: Range; niche: string; account: string; sort: Sort; region?: Region | '' }, now = Date.now()): Reel[] {
  const nicheOf = new Map(watch.map(w => [w.id, w.niche]))
  const regionOf = new Map(watch.map(w => [w.id, w.region ?? 'fr']))
  const t = (r: Reel) => r.taken_at ? Date.parse(r.taken_at) : 0
  return reels
    .filter(r => r.taken_at && now - Date.parse(r.taken_at) <= Number(o.range) * 86400000)
    .filter(r => !o.region || regionOf.get(r.watch_id) === o.region)
    .filter(r => !o.niche || nicheOf.get(r.watch_id) === o.niche)
    .filter(r => !o.account || r.username === o.account)
    .sort((a, b) => o.sort === 'score' ? b.score - a.score || b.views - a.views
      : o.sort === 'likes' ? b.likes - a.likes
      : o.sort === 'recent' ? t(b) - t(a)
      : b.views - a.views)
}

/** Pur : taux d'engagement (likes + commentaires) / vues, en %. */
export function engagement(r: { views: number; likes: number; comments: number }): number {
  return r.views > 0 ? Math.round(((r.likes + r.comments) / r.views) * 1000) / 10 : 0
}

const fmtDur = (s: number) => s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—'
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'
const reelUrl = (r: Reel) => r.url ?? `https://www.instagram.com/reel/${r.code}/`
const ratio = (s: number) => s >= 10 ? String(Math.round(s)) : s.toFixed(1)

// ── Appels à l'edge function (JWT de l'utilisateur) ───────────────────────────
async function callFn(body: Record<string, unknown>): Promise<Response> {
  const { data: s } = await supabase.auth.getSession()
  return fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` }, body: JSON.stringify(body) })
}
const mediaCache = new Map<string, Media>()
async function getMedia(code: string): Promise<Media | null> {
  const hit = mediaCache.get(code); if (hit) return hit
  try {
    const j = await (await callFn({ viral: 'media', code })).json() as Media & { ok?: boolean }
    if (!j?.ok) return null
    mediaCache.set(code, j); return j
  } catch { return null }
}
async function getVideoBlob(url: string): Promise<Blob | null> {
  try {
    const r = await callFn({ viral: 'video', url })
    if (!r.ok) return null
    const b = await r.blob()
    return b.size > 1000 ? b : null
  } catch { return null }
}
function saveUrl(href: string, name: string) {
  const a = document.createElement('a'); a.href = href; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
}
async function downloadReel(r: Reel) {
  toast('Préparation du téléchargement…', 'info')
  const m = await getMedia(r.code)
  const b = m?.videoUrl ? await getVideoBlob(m.videoUrl) : null
  if (!b) { toast('Vidéo indisponible (Reel supprimé, compte privé ou crédit HikerAPI épuisé).', 'bad', 7000); return }
  const u = URL.createObjectURL(b); saveUrl(u, `${r.username}_${r.code}.mp4`); setTimeout(() => URL.revokeObjectURL(u), 10_000)
  toast('Vidéo téléchargée.', 'ok')
}
async function copyText(text: string, okMsg: string) {
  try { await navigator.clipboard.writeText(text); toast(okMsg, 'ok') } catch { toast('Copie impossible.', 'bad') }
}

// ── Petits éléments ───────────────────────────────────────────────────────────
function IconBtn({ d, title, onClick }: { d: string; title: string; onClick: () => void }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={e => { e.stopPropagation(); onClick() }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0, borderRadius: 99, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(10,10,11,0.55)', backdropFilter: 'blur(8px)', color: '#fff', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#8B5CF6' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(10,10,11,0.55)' }}>
      <Icon d={d} size={13} />
    </button>
  )
}
function Badge({ score }: { score: number }) {
  if (!(score > 0)) return null
  const hot = score >= 3
  return <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: hot ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'rgba(10,10,11,0.6)', boxShadow: hot ? '0 4px 14px -4px rgba(236,72,153,.7)' : 'none', color: '#fff', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}>×{ratio(score)} la normale</span>
}
function Stat({ d, v }: { d: string; v: number }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={d} size={12} />{fmtNumber(v)}</span>
}

function ReelCard({ r, rank, onOpen }: { r: Reel; rank: number; onOpen: () => void }) {
  const [hover, setHover] = useState(false)
  const touch = useNarrow(760)
  const hot = r.score >= 3
  const podium = rank <= 3
  const showActs = hover || touch
  return (
    <div role="button" tabIndex={0} title="Voir le Reel" onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', aspectRatio: '9 / 16', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', background: '#121214',
        border: `1px solid ${hover ? 'rgba(167,139,250,0.55)' : hot ? 'rgba(236,72,153,0.35)' : 'rgba(255,255,255,0.07)'}`,
        transform: hover ? 'translateY(-4px)' : 'none', boxShadow: hover ? '0 22px 50px -24px rgba(139,92,246,0.7)' : 'none',
        transition: 'transform .25s cubic-bezier(0.16,1,0.3,1), box-shadow .25s ease, border-color .25s ease', animation: `aIn .45s cubic-bezier(0.16,1,0.3,1) ${Math.min(rank, 16) * 25}ms both` }}>
      {r.thumb && <img src={img(r.thumb)} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: hover ? 'scale(1.06)' : 'scale(1)', transition: 'transform .6s cubic-bezier(0.16,1,0.3,1)' }} />}
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.55) 0%, transparent 22%, transparent 48%, rgba(0,0,0,.92) 100%)' }} />

      <span style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: podium ? 26 : 15, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums',
          ...(podium ? { background: 'linear-gradient(135deg,#C4B5FD,#F472B6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.6))' } : { textShadow: '0 1px 6px rgba(0,0,0,.7)' }) }}>#{rank}</span>
        <Badge score={r.score} />
      </span>

      <span style={{ position: 'absolute', top: 44, right: 10, display: 'flex', flexDirection: 'column', gap: 6, opacity: showActs ? 1 : 0, transform: showActs ? 'none' : 'translateX(6px)', transition: 'opacity .2s ease, transform .2s ease', pointerEvents: showActs ? 'auto' : 'none' }}>
        <IconBtn d={I.download} title="Télécharger la vidéo" onClick={() => void downloadReel(r)} />
        <IconBtn d={I.link} title="Copier le lien" onClick={() => void copyText(reelUrl(r), 'Lien copié.')} />
        <IconBtn d={I.external} title="Ouvrir sur Instagram" onClick={() => window.open(reelUrl(r), '_blank', 'noopener')} />
      </span>

      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hover ? 1 : 0, transition: 'opacity .2s ease', pointerEvents: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 99, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.35)', backdropFilter: 'blur(8px)', color: '#fff' }}><Icon d={I.play} size={20} /></span>
      </span>

      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 5, color: '#fff' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(r.views)}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#C4C4CC' }}>vues</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, fontWeight: 600, color: '#D4D4D8' }}>
          <Stat d={I.heart} v={r.likes} /><Stat d={I.comment} v={r.comments} />
          <span style={{ marginLeft: 'auto', color: '#A1A1AA' }}>{engagement(r)} %</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#A1A1AA', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <span data-no-tr style={{ fontWeight: 650, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{r.username}</span>
          <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{fmtDate(r.taken_at)}</span>
        </span>
      </span>
    </div>
  )
}

// ── Fiche d'un Reel : vidéo, stats, légende, actions, navigation ←/→ ──────────
function ReelDetail({ theme, list, index, setIndex, onClose }: { theme: Theme; list: Reel[]; index: number; setIndex: (i: number) => void; onClose: () => void }) {
  const r = list[index]
  const narrow = useNarrow(760)
  const [media, setMedia] = useState<Media | null>(null)
  const [video, setVideo] = useState<string | null>(null)
  const [state, setState] = useState<'load' | 'ok' | 'err'>('load')

  useEffect(() => {
    let alive = true, obj: string | null = null
    setMedia(null); setVideo(null); setState('load')
    void (async () => {
      const m = await getMedia(r.code); if (!alive) return
      setMedia(m)
      const b = m?.videoUrl ? await getVideoBlob(m.videoUrl) : null; if (!alive) return
      if (!b) { setState('err'); return }
      obj = URL.createObjectURL(b); setVideo(obj); setState('ok')
    })()
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj) }
  }, [r.code])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1)
      else if (e.key === 'ArrowRight' && index < list.length - 1) setIndex(index + 1)
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [index, list.length, setIndex, onClose])

  const views = media?.views || r.views, likes = media?.likes || r.likes, comments = media?.comments || r.comments
  const stats: [string, string][] = [
    ['Vues', fmtNumber(views)], ['Likes', fmtNumber(likes)], ['Commentaires', fmtNumber(comments)],
    ['Engagement', `${engagement({ views, likes, comments })} %`], ['Moyenne du compte', fmtNumber(r.baseline)], ['Durée', fmtDur(media?.duration ?? 0)],
  ]
  const download = () => { if (video) { saveUrl(video, `${r.username}_${r.code}.mp4`); toast('Vidéo téléchargée.', 'ok') } else void downloadReel(r) }

  return (
    <Modal theme={theme} width={880} title={`@${r.username}`} sub={`Publié le ${fmtDate(r.taken_at)} · ${index + 1} / ${list.length}`} icon={I.play} onClose={onClose}
      footer={<>
        <Btn theme={theme} sm icon={I.left} label="Précédent" disabled={index === 0} onClick={() => setIndex(index - 1)} />
        <Btn theme={theme} sm icon={I.right} label="Suivant" disabled={index >= list.length - 1} onClick={() => setIndex(index + 1)} />
      </>}>
      <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', gap: 18, alignItems: narrow ? 'stretch' : 'flex-start' }}>
        <div style={{ position: 'relative', width: narrow ? '100%' : 300, maxWidth: narrow ? 240 : 340, alignSelf: 'center', aspectRatio: '9 / 16', borderRadius: 10, overflow: 'hidden', background: '#0A0A0B', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          {video
            ? <video key={video} src={video} poster={r.thumb ? img(r.thumb) : undefined} controls autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <>
              {r.thumb && <img src={img(r.thumb)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.6)' }} />}
              <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#fff', fontSize: 12.5, padding: 20, textAlign: 'center' }}>
                {state === 'load'
                  ? <><span style={{ width: 26, height: 26, borderRadius: 99, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', animation: 'aSpin .8s linear infinite' }} />Chargement de la vidéo…</>
                  : <>Vidéo indisponible ici — ouvre-la sur Instagram.</>}
              </span>
            </>}
          <span style={{ position: 'absolute', top: 10, left: 10 }}><Badge score={r.score} /></span>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {stats.map(([l, v]) => (
              <div key={l} style={{ padding: '10px 12px', borderRadius: 8, background: '#161618', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11.5, color: '#8B8B94' }}>{l}</div>
                <div style={{ marginTop: 4, fontSize: 17, fontWeight: 600, color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>
          {r.score > 0 && (
            <div style={{ fontSize: 12.5, color: '#A1A1AA', lineHeight: 1.5 }}>
              Ce Reel fait <b style={{ color: r.score >= 3 ? '#F472B6' : '#EDEDEF' }}>×{ratio(r.score)}</b> les vues habituelles du compte.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Légende</span>
              {!!media?.caption && <Btn theme={theme} sm icon={I.copy} label="Copier la légende" onClick={() => void copyText(media.caption, 'Légende copiée.')} />}
            </div>
            <div data-no-tr style={{ maxHeight: 160, overflowY: 'auto', padding: '10px 12px', borderRadius: 8, background: '#0E0E10', border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, color: media?.caption ? '#D4D4D8' : '#5A5A63', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {media ? (media.caption || '—') : '…'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn theme={theme} tone="primary" icon={I.download} label="Télécharger la vidéo" disabled={state === 'load' && !video} onClick={download} />
            <Btn theme={theme} icon={I.external} label="Ouvrir sur Instagram" onClick={() => window.open(reelUrl(r), '_blank', 'noopener')} />
            <Btn theme={theme} icon={I.link} label="Copier le lien" onClick={() => void copyText(reelUrl(r), 'Lien copié.')} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Gestion des comptes suivis (sélection publique ou comptes perso) ──────────
function WatchPanel({ theme, title, sub, list, onAdd, onRemove, limit }: {
  theme: Theme; title: string; sub: string; list: Watch[]; limit?: number
  onAdd: (names: string[], niche: string, region: Region) => Promise<boolean>; onRemove: (w: Watch) => void
}) {
  const [adding, setAdding] = useState('')
  const [niche, setNiche] = useState('Modèles FR')
  const [region, setRegion] = useState<Region>('fr')
  const errors = list.filter(w => w.last_error)
  async function add() {
    const names = [...new Set(adding.split(/[\s,;]+/).map(s => s.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').toLowerCase()).filter(s => /^[a-z0-9._]{1,30}$/.test(s)))]
    if (await onAdd(names, niche.trim(), region)) setAdding('')
  }
  return (
    <Panel theme={theme} style={{ marginBottom: 12 }}>
      <PanelHead title={title} sub={`${sub} · ${list.length}${limit ? ` / ${limit}` : ''} compte(s)${errors.length ? ` · ${errors.length} en erreur` : ''}`} />
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea value={adding} onChange={e => setAdding(e.target.value)} rows={3} placeholder={'Colle des @ ou liens Instagram (un par ligne)\n@modele1\nhttps://instagram.com/modele2'} style={TEXTAREA} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Segmented value={region} onChange={setRegion} options={REGIONS} />
            <input value={niche} onChange={e => setNiche(e.target.value)} placeholder="Niche (ex. Modèles FR)" style={FIELD} />
            <Btn theme={theme} label="Ajouter" icon="M12 5v14|M5 12h14" onClick={() => void add()} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start', maxHeight: 150, overflowY: 'auto' }}>
          {list.length === 0 && <span style={{ fontSize: 12.5, color: '#5A5A63' }}>Aucun compte pour l’instant.</span>}
          {list.map(w => (
            <span key={w.id} title={w.last_error ?? (w.fetched_at ? `Relevé le ${new Date(w.fetched_at).toLocaleString('fr-FR')}` : 'Pas encore relevé')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 4px 0 10px', borderRadius: 99, background: '#161618', border: `1px solid ${w.last_error ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.09)'}`, fontSize: 12, color: '#EDEDEF' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#8B8B94' }}>{(w.region ?? 'fr').toUpperCase()}</span>
              <span data-no-tr>@{w.username}</span>
              <button type="button" onClick={() => onRemove(w)} aria-label="Retirer" style={{ display: 'flex', border: 'none', background: 'transparent', color: '#71717A', cursor: 'pointer', padding: 2 }}><Icon d="M18 6L6 18|M6 6l12 12" size={11} /></button>
            </span>
          ))}
        </div>
      </div>
    </Panel>
  )
}

export default function ViralWatch({ theme, user, org, isAdmin }: { theme: Theme; user: User; org: OrgState; isAdmin: boolean }) {
  const { currentOrg } = org
  const [watch, setWatch] = useState<Watch[]>([])
  const [reels, setReels] = useState<Reel[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [noScope, setNoScope] = useState(false)   // SQL 20261012c pas encore passé
  const [noRegion, setNoRegion] = useState(false) // SQL 20261012d pas encore passé
  const [fRegion, setFRegion] = useState<Region | ''>('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'public' | 'mine'>(() => (takeOpenArg<{ tab?: 'public' | 'mine' }>('viral')?.tab) ?? 'public')
  const [userView, setUserView] = useState(false)
  const [range, setRange] = useState<Range>('7')
  const [sort, setSort] = useState<Sort>('views')
  const [fNiche, setFNiche] = useState('')
  const [fAccount, setFAccount] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const admin = isAdmin && !userView

  const load = useCallback(async () => {
    setLoading(true)
    // Colonnes ajoutées par des SQL successifs : on retombe proprement si l'une manque.
    const base = 'id,username,niche,fetched_at,last_error'
    let w: { data: unknown[] | null; error: { message: string } | null } = await supabase.from('viral_watch').select(`${base},scope,region`).order('username')
    const regionMissing = !!w.error && /region/i.test(w.error.message)
    if (regionMissing) w = await supabase.from('viral_watch').select(`${base},scope`).order('username')
    const scopeMissing = !!w.error && /scope/i.test(w.error.message)
    if (scopeMissing) w = await supabase.from('viral_watch').select(base).order('username')
    setNoScope(scopeMissing); setNoRegion(regionMissing || scopeMissing)
    setMissing(!!w.error && /relation|does not exist|schema cache/i.test(w.error.message))
    const list = ((w.data ?? []) as Watch[]).map(x => ({ ...x, scope: x.scope ?? 'public' }))
    setWatch(list)
    if (list.length) {
      const r = await supabase.from('viral_reels').select('*').in('watch_id', list.map(x => x.id)).gte('taken_at', new Date(Date.now() - 31 * 86400000).toISOString()).limit(5000)
      setReels((r.data ?? []) as Reel[])
    } else setReels([])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const scope: Scope = tab === 'public' ? 'public' : 'private'
  const tabWatch = useMemo(() => watch.filter(w => w.scope === scope), [watch, scope])
  const tabReels = useMemo(() => { const ids = new Set(tabWatch.map(w => w.id)); return reels.filter(r => ids.has(r.watch_id)) }, [reels, tabWatch])
  const niches = [...new Set(tabWatch.map(w => w.niche).filter(Boolean))]
  const shown = useMemo(() => filterReels(tabReels, tabWatch, { range, region: fRegion, niche: fNiche, account: fAccount, sort }).slice(0, 120), [tabReels, tabWatch, range, fRegion, fNiche, fAccount, sort])
  const canManage = tab === 'public' ? admin : !noScope
  useEffect(() => { setFNiche(''); setFAccount(''); setOpen(null) }, [tab])

  async function addAccounts(names: string[], niche: string, region: Region): Promise<boolean> {
    const fresh = names.filter(n => !tabWatch.some(w => w.username === n))
    if (!fresh.length) { toast('Aucun nouveau compte valide.', 'info'); return false }
    if (scope === 'private' && tabWatch.length + fresh.length > MAX_PRIVATE) { toast(`Maximum ${MAX_PRIVATE} comptes suivis.`, 'bad'); return false }
    const rows = fresh.map(username => ({ username, niche, user_id: user.id, org_id: scope === 'private' ? currentOrg?.id ?? null : null, ...(noScope ? {} : { scope }), ...(noRegion ? {} : { region }) }))
    const { error } = await supabase.from('viral_watch').insert(rows)
    if (error) { toast(`Échec : ${error.message}`, 'bad'); return false }
    toast(`${fresh.length} compte(s) ajouté(s) — clique « Actualiser » pour relever leurs Reels.`, 'ok'); void load(); return true
  }
  async function removeWatch(w: Watch) {
    const { error } = await supabase.from('viral_watch').delete().eq('id', w.id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else void load()
  }
  async function refresh() {
    setBusy(true)
    try {
      const res = await callFn({ viral: 'refresh' })
      const j = await res.json().catch(() => ({})) as { ok?: boolean; accounts?: number; reels?: number; error?: string }
      // Ancienne version de la fonction (pas encore redéployée) : pas de champ « accounts ».
      if (!res.ok || !j.ok || j.accounts === undefined) toast(`Relevé impossible : redéploie la fonction run-scheduled-posts et vérifie le secret HIKERAPI_KEY. (${j.error ?? (j.accounts === undefined && res.ok ? 'fonction pas à jour' : `HTTP ${res.status}`)})`, 'bad', 10000)
      else if (!j.accounts) toast('Déjà à jour (relevé possible toutes les 15 min).', 'info')
      else toast(`${j.accounts ?? 0} compte(s) relevé(s) · ${j.reels ?? 0} Reel(s)`, 'ok')
    } catch { toast('Relevé impossible (réseau).', 'bad') } finally { setBusy(false); void load() }
  }

  const periodReels = useMemo(() => filterReels(tabReels, tabWatch, { range, region: fRegion, niche: fNiche, account: fAccount, sort: 'views' }), [tabReels, tabWatch, range, fRegion, fNiche, fAccount])
  const totalViews = periodReels.reduce((a, r) => a + r.views, 0)
  const best = periodReels.reduce((a, r) => Math.max(a, r.score), 0)
  const avgEng = periodReels.length ? Math.round(periodReels.reduce((a, r) => a + engagement(r), 0) / periodReels.length * 10) / 10 : 0
  const heroPhotos = useMemo(() => [...periodReels].sort((a, b) => b.views - a.views).filter(r => r.thumb).slice(0, 4).map(r => img(r.thumb as string)), [periodReels])
  const showRefresh = tab === 'mine' ? tabWatch.length > 0 && !noScope : admin

  if (missing) return (
    <div><PageHead title="Veille Reels" sub="Les Reels qui explosent chez tes comptes de référence." />
      <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01" title="Activation requise" text={isAdmin ? 'Colle supabase/migrations/20261012_viral.sql dans Supabase → SQL Editor → Run, puis recharge.' : 'Bientôt disponible.'} /></Panel></div>
  )

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <FeatureBanner kicker={tab === 'public' ? 'Veille Reels · Sélection ScaleFlow' : 'Veille Reels · Mes comptes'}
        line1="Ce qui explose" line2="en ce moment"
        text={tab === 'public' ? 'Les Reels qui cartonnent chez les comptes de référence choisis par ScaleFlow. Regarde, télécharge, inspire-toi.' : 'Suis tes comptes (ou ceux de tes modèles) et vois quelles vidéos marchent le mieux.'}
        photos={heroPhotos} height={240}
        meta={periodReels.length ? `${fmtNumber(periodReels.length)} REELS · ${fmtNumber(totalViews)} VUES` : undefined} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '14px 0 12px' }}>
        <Segmented value={tab} onChange={setTab} options={[
          { v: 'public', l: 'Sélection ScaleFlow', n: watch.filter(w => w.scope === 'public').length },
          { v: 'mine', l: 'Mes comptes', n: watch.filter(w => w.scope === 'private').length },
        ]} />
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && <Segmented value={userView ? 'user' : 'admin'} onChange={v => setUserView(v === 'user')} options={[{ v: 'admin', l: 'Admin' }, { v: 'user', l: 'Vue utilisateur' }]} />}
          {showRefresh && <Btn theme={theme} tone="primary" icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8" label={busy ? 'Relevé en cours…' : 'Actualiser maintenant'} disabled={busy} onClick={refresh} />}
        </span>
      </div>

      {isAdmin && userView && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(139,124,246,0.1)', border: '1px solid rgba(139,124,246,0.3)', fontSize: 12.5, color: '#C4BBFA' }}>
          Aperçu : c’est ce que voient les utilisateurs.
        </div>
      )}
      {isAdmin && noRegion && !noScope && !userView && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', fontSize: 12.5, color: '#FCD34D' }}>
          Pour activer le filtre FR / US, colle supabase/migrations/20261012d_viral_region.sql dans Supabase → SQL Editor → Run.
        </div>
      )}
      {isAdmin && noScope && !userView && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', fontSize: 12.5, color: '#FCD34D' }}>
          Pour activer « Mes comptes », colle supabase/migrations/20261012c_viral_scopes.sql dans Supabase → SQL Editor → Run.
        </div>
      )}

      {canManage && (tab === 'public'
        ? <WatchPanel theme={theme} title="Sélection ScaleFlow" sub="Visible par tous les utilisateurs" list={tabWatch} onAdd={addAccounts} onRemove={removeWatch} />
        : <WatchPanel theme={theme} title="Mes comptes suivis" sub="Visibles par toi et ton équipe" list={tabWatch} limit={MAX_PRIVATE} onAdd={addAccounts} onRemove={removeWatch} />)}

      {tabReels.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(170px,46%),1fr))', gap: 10, marginBottom: 14 }}>
          <CineStat label="Reels sur la période" value={fmtNumber(periodReels.length)} sub={<span style={{ color: '#71717A' }}>{fmtNumber(tabWatch.length)} compte(s) suivi(s)</span>} />
          <CineStat label="Vues cumulées" value={fmtNumber(totalViews)} />
          <CineStat label="Meilleur ratio" value={best > 0 ? `×${ratio(best)}` : '—'} accent={best >= 3 ? '#F472B6' : undefined} sub={<span style={{ color: '#71717A' }}>vs vues habituelles</span>} />
          <CineStat label="Engagement moyen" value={`${avgEng} %`} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {!noRegion && <Segmented value={fRegion || 'all'} onChange={v => setFRegion(v === 'all' ? '' : v)} options={[{ v: 'all' as const, l: 'Tous' }, ...REGIONS]} />}
        <Segmented value={range} onChange={setRange} options={[{ v: '1', l: '24 h' }, { v: '7', l: '7 jours' }, { v: '30', l: '30 jours' }]} />
        <Segmented value={sort} onChange={setSort} options={[{ v: 'views', l: 'Plus de vues' }, { v: 'score', l: 'Au-dessus de la normale' }, { v: 'likes', l: 'Plus de likes' }, { v: 'recent', l: 'Plus récents' }]} />
        {niches.length > 1 && <select value={fNiche} onChange={e => setFNiche(e.target.value)} style={{ ...FIELD, width: 'auto', height: 30 }}><option value="">Toutes les niches</option>{niches.map(n => <option key={n} value={n}>{n}</option>)}</select>}
        {tabWatch.length > 1 && <select value={fAccount} onChange={e => setFAccount(e.target.value)} style={{ ...FIELD, width: 'auto', height: 30 }}><option value="">Tous les comptes</option>{tabWatch.map(w => <option key={w.id} value={w.username}>@{w.username}</option>)}</select>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#71717A' }}>{fmtNumber(shown.length)} Reel(s)</span>
      </div>

      {loading ? <Panel theme={theme}><SkeletonRows rows={4} /></Panel> : shown.length === 0 ? (
        <Panel theme={theme}><Empty icon={I.pulse} title="Aucun Reel pour l’instant" text={
          tab === 'mine'
            ? (noScope ? 'Bientôt disponible.' : tabWatch.length ? 'Clique « Actualiser maintenant » pour relever les derniers Reels de tes comptes suivis.' : 'Ajoute tes comptes (ou ceux de tes modèles) pour voir quelles vidéos marchent le mieux.')
            : admin ? (tabWatch.length ? 'Clique « Actualiser maintenant » pour relever les derniers Reels de tes comptes suivis.' : 'Ajoute des comptes de référence (modèles, concurrents) pour voir leurs Reels qui cartonnent.')
            : 'Les Reels viraux des comptes de référence apparaîtront ici dès le prochain relevé.'} /></Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(190px,46%),1fr))', gap: 14 }}>
          {shown.map((r, i) => <ReelCard key={`${r.watch_id}-${r.code}`} r={r} rank={i + 1} onOpen={() => setOpen(i)} />)}
        </div>
      )}

      {open !== null && shown[open] && <ReelDetail theme={theme} list={shown} index={open} setIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  )
}
