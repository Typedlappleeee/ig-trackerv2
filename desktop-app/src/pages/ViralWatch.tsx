// Veille des Reels viraux (v5) — onglets Tableau de bord · Reels · Feed · Favoris · Mes comptes.
//   • Clic sur un @ (carte, fiche, comptes en ronds, classement) → page profil façon Instagram
//     (photo, bio, abonnés, « à la une », analyse ScaleFlow, grille Reels / Publications).
//   • Sources : « Sélection ScaleFlow » (scope public, gérée par le super-admin) + les comptes
//     de l'agence (scope private), ajoutés SUR DEMANDE (l'agence demande, l'admin accepte).
//   • Relevé quotidien à midi (Paris) côté serveur ; « Actualiser » relève TOUS les comptes
//     (le client relance tant qu'il en reste). Un seul appel HikerAPI par @ (pas de doublon).
//   • Vidéo, légende et durée sont stockées au relevé : la fiche s'ouvre instantanément, la
//     vidéo est lue EN STREAMING via le proxy public ?vid= (plus de téléchargement complet).
//   • Favoris par agence (perso ou organisation), avec un instantané du Reel.
// Tables : supabase/migrations/20261012*_viral*.sql + 20261016_viral_v4.sql + 20261017_viral_profiles.sql. Données : HikerAPI.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { takeOpenArg, openTool } from '@/lib/openTool'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Empty, Icon, PageHead, Panel, PanelHead, Segmented, FIELD, TEXTAREA, toast, useNarrow } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { fmtNumber, compact } from '@/lib/data'
import { StatBar } from '@/components/CineHero'

type Scope = 'public' | 'private'
type Region = 'fr' | 'us'
type Kind = 'reel' | 'feed'
// Drapeaux dessinés (les emoji 🇫🇷 / 🇺🇸 s'affichent en « FR » / « US » sur Windows).
function Flag({ c }: { c: Region }) {
  const S: React.CSSProperties = { display: 'block', borderRadius: 2, boxShadow: '0 0 0 1px rgba(255,255,255,0.15)', flexShrink: 0 }
  if (c === 'fr') return <svg viewBox="0 0 3 2" width="18" height="12" style={S} aria-hidden="true"><rect width="1" height="2" fill="#2B4BA8" /><rect x="1" width="1" height="2" fill="#F4F4F5" /><rect x="2" width="1" height="2" fill="#E1394B" /></svg>
  return (
    <svg viewBox="0 0 19 10" width="18" height="12" style={S} aria-hidden="true" preserveAspectRatio="none">
      {Array.from({ length: 13 }, (_, i) => <rect key={i} y={(i * 10) / 13} width="19" height={10 / 13} fill={i % 2 ? '#F4F4F5' : '#D63A48'} />)}
      <rect width="7.6" height={70 / 13} fill="#2B4BA8" />
    </svg>
  )
}
const REGION_LABEL: Record<Region, string> = { fr: 'France', us: 'USA' }
const REGIONS: { v: Region; l: React.ReactNode }[] = (['fr', 'us'] as Region[]).map(v => ({ v, l: <><Flag c={v} />{REGION_LABEL[v]}</> }))

/** Filtres en pilules (plus lisibles que le segmenté compact) avec un petit intitulé. */
function Pills<T extends string>({ label, value, onChange, options }: { label?: string; value: T; onChange: (v: T) => void; options: { v: T; l: React.ReactNode }[] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 12, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
      {label && <span style={{ padding: '0 8px 0 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5A5A63' }}>{label}</span>}
      {options.map(o => {
        const on = o.v === value
        return (
          <button key={o.v} type="button" aria-pressed={on} onClick={() => onChange(o.v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 12px', borderRadius: 9, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, fontWeight: on ? 750 : 600,
              background: on ? '#F4F4F5' : 'transparent', color: on ? '#0A0A0B' : '#A1A1AA', transition: 'background .15s ease, color .15s ease' }}
            onMouseEnter={e => { if (!on) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#EDEDEF' } }}
            onMouseLeave={e => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1AA' } }}>
            {o.l}
          </button>
        )
      })}
    </span>
  )
}
interface Watch {
  id: string; username: string; niche: string; fetched_at: string | null; last_error: string | null; scope?: Scope; region?: Region; user_id?: string; org_id?: string | null
  // Profil Instagram (SQL 20261017) : rempli au relevé.
  full_name?: string | null; biography?: string | null; profile_pic?: string | null; external_url?: string | null
  followers?: number | null; following?: number | null; media_count?: number | null; is_verified?: boolean; profile_at?: string | null
}
export interface Reel {
  watch_id: string; code: string; username: string; views: number; likes: number; comments: number; taken_at: string | null; thumb: string | null; url: string | null; baseline: number; score: number
  kind?: Kind; video_url?: string | null; caption?: string | null; duration?: number | null; images?: string[] | null; fetched_at?: string
}
interface Fav { id: string; code: string; kind: Kind; watch_id: string | null; username: string | null; thumb: string | null; views: number; likes: number; score: number; url: string | null; created_at: string }
interface Req { id: string; user_id: string; org_id: string | null; requester: string | null; usernames: string[]; region: Region; note: string; status: 'pending' | 'done' | 'refused'; created_at: string }
type Range = '1' | '7' | '30'
type Sort = 'score' | 'views' | 'likes' | 'recent'
type Tab = 'dash' | 'reels' | 'feed' | 'favs' | 'mine'
type Source = 'all' | 'public' | 'private'

const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'
const V = '#A78BFA', GRAD = 'linear-gradient(135deg,#8B5CF6,#EC4899)'
// Images / vidéos Instagram bloquées en affichage direct → proxys publics de l'edge function.
const img = (u: string) => `${FN_URL}?img=${encodeURIComponent(u)}`
const vid = (u: string, dl?: string) => `${FN_URL}?vid=${encodeURIComponent(u)}${dl ? `&dl=1&name=${encodeURIComponent(dl)}` : ''}`

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
  wand: 'M15 4V2|M15 16v-2|M8 9h2|M20 9h2|M17.8 11.8L19 13|M15 9h.01|M17.8 6.2L19 5|M3 21l9-9|M12.2 6.2L11 5',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  refresh: 'M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8',
  grid: 'M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h7v7h-7z',
  dash: 'M3 3v18h18|M7 15l4-6 4 3 5-8',
  image: 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 7a4 4 0 1 0 0 .01|M23 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8',
}

/** Pur : filtre période / pays / niche / compte / type, dédoublonne par code puis trie. */
export function filterReels(reels: Reel[], watch: Watch[], o: { range: Range; niche: string; account: string; sort: Sort; region?: Region | ''; kind?: Kind }, now = Date.now()): Reel[] {
  const nicheOf = new Map(watch.map(w => [w.id, w.niche]))
  const regionOf = new Map(watch.map(w => [w.id, w.region ?? 'fr']))
  const t = (r: Reel) => r.taken_at ? Date.parse(r.taken_at) : 0
  const metric = (r: Reel) => (r.kind ?? 'reel') === 'feed' ? r.likes : r.views
  // Un même Reel peut venir de deux suivis (Sélection + agence) : on n'en garde qu'un.
  const byCode = new Map<string, Reel>()
  for (const r of reels) {
    if (o.kind && (r.kind ?? 'reel') !== o.kind) continue
    if (!r.taken_at || now - Date.parse(r.taken_at) > Number(o.range) * 86400000) continue
    if (o.region && regionOf.get(r.watch_id) !== o.region) continue
    if (o.niche && nicheOf.get(r.watch_id) !== o.niche) continue
    if (o.account && r.username !== o.account) continue
    const c = byCode.get(r.code)
    if (!c || metric(r) > metric(c)) byCode.set(r.code, r)
  }
  return [...byCode.values()].sort((a, b) => o.sort === 'score' ? b.score - a.score || metric(b) - metric(a)
    : o.sort === 'likes' ? b.likes - a.likes
    : o.sort === 'recent' ? t(b) - t(a)
    : metric(b) - metric(a))
}

/** Pur : taux d'engagement (likes + commentaires) / vues, en %. */
export function engagement(r: { views: number; likes: number; comments: number }): number {
  return r.views > 0 ? Math.round(((r.likes + r.comments) / r.views) * 1000) / 10 : 0
}

const pct = (n: number) => `${n.toLocaleString('fr-FR')} %`
const fmtDur = (s: number) => s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—'
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'
const reelUrl = (r: { url: string | null; code: string; kind?: Kind }) => r.url ?? `https://www.instagram.com/${r.kind === 'feed' ? 'p' : 'reel'}/${r.code}/`
const ratio = (s: number) => s >= 10 ? String(Math.round(s)) : s.toFixed(1)
const isMissing = (m?: string) => !!m && /relation|does not exist|schema cache|column/i.test(m)

// ── Appels à l'edge function (JWT de l'utilisateur) ───────────────────────────
async function callFn(body: Record<string, unknown>): Promise<Response> {
  const { data: s } = await supabase.auth.getSession()
  return fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` }, body: JSON.stringify(body) })
}
/** URL vidéo fraîche (HikerAPI) — seulement si celle stockée a expiré ; réenregistrée côté serveur. */
const freshCache = new Map<string, { videoUrl: string | null; caption: string; duration: number; images?: string[] }>()
async function freshMedia(code: string) {
  const hit = freshCache.get(code); if (hit) return hit
  try {
    const j = await (await callFn({ viral: 'media', code })).json() as { ok?: boolean; videoUrl: string | null; caption: string; duration: number; images?: string[] }
    if (!j?.ok) return null
    freshCache.set(code, j); return j
  } catch { return null }
}
function saveUrl(href: string, name: string) {
  const a = document.createElement('a'); a.href = href; a.download = name; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
}
async function downloadReel(r: Reel) {
  let url = r.video_url ?? null
  if (!url) { toast('Préparation du téléchargement…', 'info'); url = (await freshMedia(r.code))?.videoUrl ?? null }
  if (!url) { toast('Vidéo indisponible (Reel supprimé ou compte privé).', 'bad', 7000); return }
  saveUrl(vid(url, `${r.username}_${r.code}`), `${r.username}_${r.code}.mp4`)
}
async function downloadImage(u: string, name: string) {
  try { const b = await (await fetch(img(u))).blob(); const o = URL.createObjectURL(b); saveUrl(o, name); setTimeout(() => URL.revokeObjectURL(o), 10_000) }
  catch { window.open(img(u), '_blank', 'noopener') }
}
async function copyText(text: string, okMsg: string) {
  try { await navigator.clipboard.writeText(text); toast(okMsg, 'ok') } catch { toast('Copie impossible.', 'bad') }
}

// ── Petits éléments ───────────────────────────────────────────────────────────
function IconBtn({ d, title, onClick, on }: { d: string; title: string; onClick: () => void; on?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={e => { e.stopPropagation(); onClick() }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0, borderRadius: 99, border: `1px solid ${on ? '#FBBF24' : 'rgba(255,255,255,0.18)'}`, background: on ? 'rgba(251,191,36,0.25)' : 'rgba(10,10,11,0.55)', backdropFilter: 'blur(8px)', color: on ? '#FBBF24' : '#fff', cursor: 'pointer' }}
      onMouseEnter={e => { if (!on) e.currentTarget.style.background = '#8B5CF6' }}
      onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'rgba(10,10,11,0.55)' }}>
      <Icon d={d} size={13} />
    </button>
  )
}
function Badge({ score, big }: { score: number; big?: boolean }) {
  if (!(score > 0)) return null
  const hot = score >= 3
  return <span title={`×${ratio(score)} la normale du compte`} style={{ display: 'inline-flex', alignItems: 'center', height: big ? 28 : 22, padding: big ? '0 11px' : '0 8px', borderRadius: 99, fontSize: big ? 13.5 : 12, fontWeight: 800, background: hot ? GRAD : 'rgba(10,10,11,0.55)', border: hot ? 'none' : '1px solid rgba(255,255,255,0.16)', boxShadow: hot ? '0 6px 18px -6px rgba(236,72,153,.8)' : 'none', color: '#fff', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{hot ? '🔥 ' : ''}×{ratio(score)}</span>
}
function Stat({ d, v }: { d: string; v: number }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={d} size={12} />{compact(v)}</span>
}
function SectionTitle({ kicker, title, right }: { kicker: string; title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '6px 2px 12px' }}>
      <span>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: V }}>● {kicker}</span>
        <span style={{ display: 'block', marginTop: 6, fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', textTransform: 'uppercase', color: '#F4F4F5' }}>{title}</span>
      </span>
      {right}
    </div>
  )
}

// Ouvrir le profil d'un compte depuis n'importe quelle carte ou fiche (+ sa photo de profil).
const AccountCtx = createContext<{ open: (username: string) => void; pic: (username: string) => string | null } | null>(null)
function AccountLink({ username, size = 12.5, color = '#fff', avatar }: { username: string; size?: number; color?: string; avatar?: number }) {
  const ctx = useContext(AccountCtx)
  const pic = avatar ? ctx?.pic(username) : null
  const face = avatar ? <span style={{ width: avatar, height: avatar, borderRadius: 99, overflow: 'hidden', flexShrink: 0, background: '#1A1A1D', boxShadow: '0 0 0 1.5px rgba(255,255,255,0.5)' }}>{pic && <img src={img(pic)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}</span> : null
  if (!ctx) return <span data-no-tr style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: size, fontWeight: 700, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{face}@{username}</span>
  return (
    <button type="button" data-no-tr title={`Voir le profil de @${username}`} onClick={e => { e.stopPropagation(); ctx.open(username) }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, maxWidth: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: size, fontWeight: 700, color }}
      onMouseEnter={e => { e.currentTarget.style.color = '#C4B5FD' }} onMouseLeave={e => { e.currentTarget.style.color = color }}>
      {face}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{username}</span>
    </button>
  )
}

// ── Carte d'un Reel (9:16) ou d'un post du feed (4:5) ────────────────────────
function MediaCard({ r, rank, big, fav, onOpen, onRecast, onFav }: { r: Reel; rank: number; big?: boolean; fav: boolean; onOpen: () => void; onRecast?: () => void; onFav: () => void }) {
  const [hover, setHover] = useState(false)
  const touch = useNarrow(760)
  const feed = (r.kind ?? 'reel') === 'feed'
  const showActs = big || hover || touch
  const podium = rank <= 3
  const slides = r.images?.length ?? 0
  return (
    <div role="button" tabIndex={0} title={feed ? 'Voir le post' : 'Voir le Reel'} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', aspectRatio: feed ? '4 / 5' : '9 / 16', borderRadius: big ? 22 : 16, overflow: 'hidden', cursor: 'pointer', background: '#121214', outline: 'none',
        gridColumn: big ? 'span 2' : undefined, gridRow: big ? 'span 2' : undefined,
        border: `1px solid ${hover ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.07)'}`,
        transform: hover ? 'translateY(-3px)' : 'none', boxShadow: hover ? '0 24px 50px -26px rgba(139,92,246,0.75)' : 'none',
        transition: 'transform .3s cubic-bezier(0.16,1,0.3,1), box-shadow .3s ease, border-color .3s ease', animation: `aIn .5s cubic-bezier(0.16,1,0.3,1) ${Math.min(rank, 18) * 22}ms both` }}>
      {r.thumb
        ? <img src={img(r.thumb)} alt="" loading={rank <= 8 ? 'eager' : 'lazy'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: hover ? 'scale(1.05)' : 'scale(1)', transition: 'transform .8s cubic-bezier(0.16,1,0.3,1)' }} />
        : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3F3F46' }}><Icon d={feed ? I.image : I.play} size={28} /></span>}
      <span style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,.5) 0%, transparent ${big ? 18 : 24}%, transparent ${big ? 55 : 45}%, rgba(0,0,0,.94) 100%)` }} />
      <span style={{ position: 'absolute', top: big ? 16 : 10, left: big ? 16 : 10, right: big ? 16 : 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: big ? 28 : 22, padding: big ? '0 11px' : '0 8px', borderRadius: 99, fontFamily: "'JetBrains Mono', monospace", fontSize: big ? 13 : 11.5, fontWeight: 800, color: podium ? '#0A0A0B' : '#fff',
            background: podium ? (rank === 1 ? '#F4F4F5' : 'rgba(244,244,245,0.82)') : 'rgba(10,10,11,0.55)', border: podium ? 'none' : '1px solid rgba(255,255,255,0.16)' }}>
            {big ? 'N°1 · TOP' : String(rank).padStart(2, '0')}
          </span>
          {fav && <span style={{ display: 'inline-flex', color: '#FBBF24', filter: 'drop-shadow(0 1px 4px rgba(0,0,0,.7))' }}><Icon d={I.star} size={15} /></span>}
          {feed && (slides > 1 || r.images?.length === 0) && <span title="Carrousel" style={{ height: 22, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 99, background: 'rgba(10,10,11,0.6)', color: '#fff', fontSize: 11, fontWeight: 800 }}><Icon d="M8 8h12v12H8z|M4 16V4h12" size={11} />{slides > 1 ? slides : ''}</span>}
        </span>
        <Badge score={r.score} big={big} />
      </span>
      {!feed && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hover ? 1 : 0, transition: 'opacity .25s ease', pointerEvents: 'none' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: big ? 68 : 52, height: big ? 68 : 52, borderRadius: 99, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.4)', backdropFilter: 'blur(10px)', color: '#fff' }}><Icon d={I.play} size={big ? 24 : 20} /></span>
        </span>
      )}
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: big ? '0 20px 20px' : '0 12px 12px', display: 'flex', flexDirection: 'column', gap: big ? 10 : 6, color: '#fff' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontSize: big ? 'clamp(40px, 4.4vw, 60px)' : 26, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>{compact(feed ? r.likes : r.views)}</span>
          <span style={{ fontSize: big ? 12 : 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#A1A1AA' }}>{feed ? 'likes' : 'vues'}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: big ? 14 : 10, fontSize: big ? 13 : 11.5, fontWeight: 600, color: '#D4D4D8' }}>
          {!feed && <Stat d={I.heart} v={r.likes} />}<Stat d={I.comment} v={r.comments} />
          {!feed && <span style={{ color: '#A1A1AA' }}>{pct(engagement(r))}</span>}
        </span>
        <span style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 30 }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <AccountLink username={r.username} size={big ? 14 : 12.5} avatar={big ? 24 : 20} />
            <span style={{ fontSize: 11.5, color: '#8B8B94' }}>{fmtDate(r.taken_at)}</span>
          </span>
        </span>
      </span>
      {/* Actions en colonne sur le côté (ne masquent plus le pseudo) */}
      <span style={{ position: 'absolute', right: big ? 16 : 10, top: big ? 54 : 42, display: 'flex', flexDirection: 'column', gap: 6, opacity: showActs ? 1 : 0, transform: showActs ? 'none' : 'translateX(6px)', transition: 'opacity .2s ease, transform .2s ease', pointerEvents: showActs ? 'auto' : 'none' }}>
        <IconBtn d={I.star} title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} on={fav} onClick={onFav} />
        {onRecast && !feed && <IconBtn d={I.wand} title="Recréer avec mes images (Genjutsu)" onClick={onRecast} />}
        {!feed && <IconBtn d={I.download} title="Télécharger la vidéo" onClick={() => void downloadReel(r)} />}
        <IconBtn d={I.external} title="Ouvrir sur Instagram" onClick={() => window.open(reelUrl(r), '_blank', 'noopener')} />
      </span>
    </div>
  )
}

// ── Fiche façon Instagram : média à gauche (vidéo en streaming / diaporama), panneau à droite
//    (compte cliquable → profil, légende, analyse ScaleFlow, actions). Rendu en portail. ─────────
const timeAgo = (iso: string | null | undefined) => {
  if (!iso) return ''
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : m < 43200 ? `il y a ${Math.round(m / 1440)} j` : fmtDate(iso)
}
/** Légende avec #hashtags et @mentions mis en valeur. */
function RichCaption({ text }: { text: string }) {
  const parts = text.split(/([#@][\p{L}\p{N}_.]+)/u)
  return <>{parts.map((p, i) => /^[#@][\p{L}\p{N}_.]+$/u.test(p) ? <span key={i} style={{ color: '#C4B5FD' }}>{p}</span> : <span key={i}>{p}</span>)}</>
}
function Verified({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Compte vérifié" style={{ flexShrink: 0 }}><path fill="#3B82F6" d="M12 1l2.6 2.2 3.4-.4.9 3.3 3 1.7-1.2 3.2 1.2 3.2-3 1.7-.9 3.3-3.4-.4L12 23l-2.6-2.2-3.4.4-.9-3.3-3-1.7L3.3 13 2.1 9.8l3-1.7.9-3.3 3.4.4z" /><path d="M8 12.3l2.6 2.6L16.2 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
const IG_RING = 'linear-gradient(45deg,#F59E0B,#EC4899 55%,#8B5CF6)'
function Avatar({ src, size, ring = true, hot = true, letter }: { src: string | null; size: number; ring?: boolean; hot?: boolean; letter?: string }) {
  return (
    <span style={{ padding: ring ? Math.max(2, Math.round(size / 30)) : 0, borderRadius: 99, background: ring ? (hot ? IG_RING : 'rgba(255,255,255,0.2)') : 'transparent', flexShrink: 0, display: 'inline-flex' }}>
      <span style={{ width: size, height: size, borderRadius: 99, overflow: 'hidden', background: '#1A1A1D', border: ring ? `${Math.max(2, Math.round(size / 32))}px solid #0A0A0B` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', fontSize: size * 0.36, fontWeight: 800, boxSizing: 'border-box' }}>
        {src ? <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <span data-no-tr>{(letter ?? '').slice(0, 1).toUpperCase()}</span>}
      </span>
    </span>
  )
}
function ActionBtn({ d, label, onClick, on }: { d: string; label: string; onClick: () => void; on?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={label}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '9px 4px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: on ? 'rgba(251,191,36,0.12)' : '#141416', color: on ? '#FBBF24' : '#EDEDEF', cursor: 'pointer', transition: 'border-color .15s ease' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.5)' }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
      <Icon d={d} size={17} />
      <span style={{ fontSize: 11, fontWeight: 650, color: on ? '#FBBF24' : '#A1A1AA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{label}</span>
    </button>
  )
}

function ReelViewer({ theme, list, index, setIndex, onClose, onRecast, isFav, onFav, onProfile, accountOf, moreOf, onJump }: {
  theme: Theme; list: Reel[]; index: number; setIndex: (i: number) => void; onClose: () => void; onRecast?: (r: Reel) => void
  isFav: (code: string) => boolean; onFav: (r: Reel) => void; onProfile?: (username: string) => void; accountOf: (username: string) => Watch | undefined
  moreOf?: (username: string) => Reel[]; onJump?: (list: Reel[], i: number) => void
}) {
  const r = list[index]
  const feed = (r.kind ?? 'reel') === 'feed'
  const narrow = useNarrow(900)
  const [vh, setVh] = useState(() => window.innerHeight)
  useEffect(() => { const f = () => setVh(window.innerHeight); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  const [src, setSrc] = useState<string | null>(null)
  const [state, setState] = useState<'load' | 'ok' | 'err'>('load')
  const [caption, setCaption] = useState<string>(r.caption ?? '')
  const [duration, setDuration] = useState<number>(r.duration ?? 0)
  const [slide, setSlide] = useState(0)
  const [fetched, setFetched] = useState<string[] | null>(null)
  const [loadingSlides, setLoadingSlides] = useState(false)
  const slides = feed ? (fetched?.length ? fetched : r.images?.length ? r.images : r.thumb ? [r.thumb] : []) : []

  // Carrousel : slides stockées au relevé ; sinon récupérées à l'ouverture (1 fois, puis gardées).
  useEffect(() => {
    setFetched(null)
    if (!feed || (r.images?.length ?? 0) > 1) return
    let alive = true
    setLoadingSlides(true)
    void freshMedia(r.code).then(m => { if (alive && (m?.images?.length ?? 0) > 1) setFetched(m!.images!) }).finally(() => { if (alive) setLoadingSlides(false) })
    return () => { alive = false }
  }, [r.code, r.images, feed])
  // Vidéo : URL stockée au relevé, lue en streaming ; sinon (ancienne ligne) → URL fraîche.
  useEffect(() => {
    let alive = true
    setSlide(0); setCaption(r.caption ?? ''); setDuration(r.duration ?? 0)
    if (feed) { setSrc(null); setState('ok'); return }
    if (r.video_url) { setSrc(vid(r.video_url)); setState('load') }
    else {
      setSrc(null); setState('load')
      void freshMedia(r.code).then(m => {
        if (!alive) return
        if (m?.videoUrl) { setSrc(vid(m.videoUrl)); if (m.caption) setCaption(m.caption); if (m.duration) setDuration(m.duration) } else setState('err')
      })
    }
    return () => { alive = false }
  }, [r.code, r.video_url, r.caption, r.duration, feed])
  // Vidéo stockée expirée → URL fraîche (une seule fois).
  const onVideoError = () => { void freshMedia(r.code).then(m => { const next = m?.videoUrl ? vid(m.videoUrl) : null; if (next && next !== src) setSrc(next); else setState('err') }) }
  // Préchargement de la vidéo suivante.
  useEffect(() => {
    const n = list[index + 1]
    if (!n?.video_url || (n.kind ?? 'reel') === 'feed') return
    const l = document.createElement('link'); l.rel = 'preload'; l.as = 'video'; l.href = vid(n.video_url)
    document.head.appendChild(l); return () => { l.remove() }
  }, [index, list])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1)
      else if (e.key === 'ArrowRight' && index < list.length - 1) setIndex(index + 1)
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [index, list.length, setIndex, onClose])

  const acc = accountOf(r.username)
  const avatar = acc?.profile_pic ? img(acc.profile_pic) : r.thumb ? img(r.thumb) : null
  const fav = isFav(r.code)
  const MH = Math.min(vh * 0.9, 860)
  const aspect = feed ? 4 / 5 : 9 / 16
  const stats: [string, string][] = feed
    ? [['Likes', compact(r.likes)], ['Commentaires', compact(r.comments)], ['Moyenne du compte', compact(r.baseline)], ['Images', String(slides.length || 1)]]
    : [['Vues', compact(r.views)], ['Likes', compact(r.likes)], ['Commentaires', compact(r.comments)], ['Engagement', pct(engagement(r))], ['Moyenne du compte', compact(r.baseline)], ['Durée', fmtDur(duration)]]
  const goProfile = onProfile ? () => onProfile(r.username) : undefined
  // « Plus de @compte » (comme sous un post Instagram) : ses autres Reels / posts les plus vus.
  const moreAll = useMemo(() => moreOf?.(r.username) ?? [], [moreOf, r.username])
  const more = moreAll.filter(x => x.code !== r.code).slice(0, 6)
  const arrow = (dir: -1 | 1) => {
    const ok = dir < 0 ? index > 0 : index < list.length - 1
    return ok && !narrow ? (
      <button type="button" aria-label={dir < 0 ? 'Précédent' : 'Suivant'} onClick={e => { e.stopPropagation(); setIndex(index + dir) }}
        style={{ position: 'fixed', top: '50%', [dir < 0 ? 'left' : 'right']: 18, transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: 99, border: 'none', background: 'rgba(255,255,255,0.92)', color: '#0A0A0B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
        <Icon d={dir < 0 ? I.left : I.right} size={18} sw={2.4} />
      </button>
    ) : null
  }
  const slideBtn = (dir: -1 | 1) => (
    <button type="button" aria-label={dir < 0 ? 'Image précédente' : 'Image suivante'} onClick={() => setSlide(x => x + dir)}
      style={{ position: 'absolute', [dir < 0 ? 'left' : 'right']: 10, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: 99, border: 'none', background: 'rgba(255,255,255,0.85)', color: '#0A0A0B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon d={dir < 0 ? I.left : I.right} size={14} sw={2.4} />
    </button>
  )

  const media = (
    <div style={{ position: 'relative', width: narrow ? '100%' : MH * aspect, height: narrow ? undefined : MH, aspectRatio: narrow ? `${aspect}` : undefined, maxHeight: narrow ? '74vh' : undefined, background: '#000', flexShrink: 0, overflow: 'hidden' }}>
      {feed ? (
        <>
          {slides[slide] && <img key={slides[slide]} src={img(slides[slide])} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', animation: 'aIn .25s ease both' }} />}
          {slides.length > 1 && <>
            {slide > 0 && slideBtn(-1)}
            {slide < slides.length - 1 && slideBtn(1)}
            <span style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>{slides.map((_, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 9, background: i === slide ? '#fff' : 'rgba(255,255,255,.4)' }} />)}</span>
            <span style={{ position: 'absolute', top: 12, right: 12, padding: '3px 9px', borderRadius: 99, background: 'rgba(10,10,11,.65)', color: '#fff', fontSize: 12, fontWeight: 800 }}>{slide + 1}/{slides.length}</span>
          </>}
          {loadingSlides && slides.length <= 1 && <span style={{ position: 'absolute', top: 12, right: 12, padding: '3px 9px', borderRadius: 99, background: 'rgba(10,10,11,.65)', color: '#fff', fontSize: 11.5, fontWeight: 700 }}>Chargement des images…</span>}
        </>
      ) : src ? (
        <video key={src} src={src} poster={r.thumb ? img(r.thumb) : undefined} controls autoPlay loop playsInline preload="auto"
          onCanPlay={() => setState('ok')} onError={onVideoError} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
      ) : (
        <>
          {r.thumb && <img src={img(r.thumb)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.55)' }} />}
          <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#fff', fontSize: 13, padding: 20, textAlign: 'center' }}>
            {state === 'err' ? 'Vidéo indisponible ici — ouvre-la sur Instagram.' : <><span style={{ width: 28, height: 28, borderRadius: 99, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', animation: 'aSpin .8s linear infinite' }} />Chargement…</>}
          </span>
        </>
      )}
      {r.score > 0 && <span style={{ position: 'absolute', top: 12, left: 12 }}><Badge score={r.score} /></span>}
    </div>
  )

  const panel = (
    <div style={{ width: narrow ? '100%' : 390, display: 'flex', flexDirection: 'column', minHeight: narrow ? undefined : 0, flexShrink: narrow ? 0 : undefined, maxHeight: narrow ? undefined : MH, background: '#0C0C0D' }}>
      {/* Compte : clic sur la photo ou le pseudo → profil */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button type="button" onClick={goProfile} disabled={!goProfile} aria-label={`Profil de @${r.username}`} style={{ padding: 0, border: 'none', background: 'transparent', cursor: goProfile ? 'pointer' : 'default', display: 'flex' }}><Avatar src={avatar} size={38} letter={r.username} /></button>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <button type="button" data-no-tr onClick={goProfile} disabled={!goProfile} title={goProfile ? 'Voir le profil' : undefined}
              style={{ padding: 0, border: 'none', background: 'transparent', cursor: goProfile ? 'pointer' : 'default', fontSize: 14.5, fontWeight: 800, color: '#F4F4F5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#C4B5FD' }} onMouseLeave={e => { e.currentTarget.style.color = '#F4F4F5' }}>{r.username}</button>
            {acc?.is_verified && <Verified />}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: '#8B8B94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc?.full_name ? <span data-no-tr>{acc.full_name} · </span> : null}{timeAgo(r.taken_at)}</span>
        </span>
        {goProfile && <button type="button" onClick={goProfile} style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 9, border: 'none', background: '#F4F4F5', color: '#0A0A0B', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Voir le profil</button>}
      </div>
      {/* Légende + analyse */}
      <div style={{ flex: narrow ? 'none' : 1, minHeight: 0, overflowY: narrow ? 'visible' : 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <Avatar src={avatar} size={28} ring={false} letter={r.username} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.55, color: '#E4E4E7', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} data-no-tr>
            <b style={{ color: '#F4F4F5', marginRight: 6 }}>{r.username}</b>
            {caption ? <RichCaption text={caption} /> : <span style={{ color: '#5A5A63' }}>—</span>}
            <span style={{ display: 'block', marginTop: 6, fontSize: 11.5, color: '#71717A' }}>{fmtDate(r.taken_at)}</span>
          </div>
        </div>
        {!!caption && <span><Btn theme={theme} sm icon={I.copy} label="Copier la légende" onClick={() => void copyText(caption, 'Légende copiée.')} /></span>}
        <div style={{ borderRadius: 14, background: '#121214', border: '1px solid rgba(255,255,255,0.07)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: V }}>● Analyse ScaleFlow</span>
            {r.score > 0 && <span style={{ fontSize: 12.5, color: '#A1A1AA' }}><b style={{ color: r.score >= 3 ? '#F472B6' : '#F4F4F5', fontSize: 15 }}>×{ratio(r.score)}</b> {feed ? 'ses likes habituels' : 'ses vues habituelles'}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${feed ? 2 : 3}, minmax(0,1fr))`, gap: 6 }}>
            {stats.map(([l, v]) => (
              <div key={l} style={{ padding: '8px 10px', borderRadius: 10, background: '#0C0C0D' }}>
                <div style={{ fontSize: 10.5, color: '#71717A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</div>
                <div style={{ marginTop: 3, fontSize: 16, fontWeight: 850, letterSpacing: '-0.02em', color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {more.length > 0 && onJump && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#A1A1AA' }}>Plus de <span data-no-tr style={{ color: '#F4F4F5' }}>{r.username}</span></span>
              {goProfile && <button type="button" onClick={goProfile} style={{ padding: 0, border: 'none', background: 'transparent', color: '#C4B5FD', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Tout voir</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 4 }}>
              {more.map(x => (
                <button key={x.code} type="button" onClick={() => onJump(moreAll, moreAll.indexOf(x))} title={(x.kind ?? 'reel') === 'feed' ? 'Voir le post' : 'Voir le Reel'}
                  style={{ position: 'relative', aspectRatio: '3 / 4', padding: 0, border: 'none', borderRadius: 6, overflow: 'hidden', background: '#161618', cursor: 'pointer' }}>
                  {x.thumb && <img src={img(x.thumb)} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <span style={{ position: 'absolute', left: 6, bottom: 5, display: 'inline-flex', alignItems: 'center', gap: 3, color: '#fff', fontSize: 11.5, fontWeight: 800, textShadow: '0 1px 3px rgba(0,0,0,.8)' }}>
                    {(x.kind ?? 'reel') === 'feed' ? <><Filled d={I.heart} size={11} />{compact(x.likes)}</> : <><Icon d={I.play} size={11} sw={2.4} />{compact(x.views)}</>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Actions */}
      <div style={{ padding: '12px 16px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <ActionBtn d={I.star} label={fav ? 'Favori' : 'Favoris'} on={fav} onClick={() => onFav(r)} />
          {feed
            ? <ActionBtn d={I.download} label="Image" onClick={() => { if (slides[slide]) void downloadImage(slides[slide], `${r.username}_${r.code}_${slide + 1}.jpg`) }} />
            : <ActionBtn d={I.download} label="Télécharger" onClick={() => void downloadReel(r)} />}
          <ActionBtn d={I.link} label="Lien" onClick={() => void copyText(reelUrl(r), 'Lien copié.')} />
          <ActionBtn d={I.external} label="Instagram" onClick={() => window.open(reelUrl(r), '_blank', 'noopener')} />
        </div>
        {onRecast && !feed && (
          <button type="button" onClick={() => onRecast(r)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: '#fff', background: GRAD, boxShadow: '0 4px 0 #6D28D9' }}>
            ✦ Recréer avec mes images
          </button>
        )}
        {narrow && list.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Btn theme={theme} sm icon={I.left} label="Précédent" disabled={index === 0} onClick={() => setIndex(index - 1)} />
            <span style={{ fontSize: 12, color: '#71717A' }}>{index + 1} / {list.length}</span>
            <Btn theme={theme} sm icon={I.right} label="Suivant" disabled={index >= list.length - 1} onClick={() => setIndex(index + 1)} />
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,0.86)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: narrow ? 'stretch' : 'center', justifyContent: 'center', padding: narrow ? 0 : '0 76px', animation: 'aIn .18s ease both' }}>
      <button type="button" aria-label="Fermer" onClick={onClose} style={{ position: 'fixed', top: 14, right: 16, width: 38, height: 38, borderRadius: 99, border: 'none', background: 'rgba(20,20,22,0.7)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}><Icon d="M18 6L6 18|M6 6l12 12" size={17} sw={2.2} /></button>
      {!narrow && list.length > 1 && <span style={{ position: 'fixed', top: 22, left: 22, fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{index + 1} / {list.length}</span>}
      {arrow(-1)}{arrow(1)}
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', width: narrow ? '100%' : undefined, height: narrow ? '100%' : undefined, overflowY: narrow ? 'auto' : 'hidden', borderRadius: narrow ? 0 : 16, border: narrow ? 'none' : '1px solid rgba(255,255,255,0.08)', boxShadow: '0 40px 120px -30px rgba(0,0,0,.95)', background: '#0C0C0D', animation: 'aIn .25s cubic-bezier(0.16,1,0.3,1) both' }}>
        {media}{panel}
      </div>
    </div>,
    document.body,
  )
}

// ── Profil d'un compte, façon Instagram ──────────────────────────────────────
type Prof = Pick<Watch, 'full_name' | 'biography' | 'profile_pic' | 'external_url' | 'followers' | 'following' | 'media_count' | 'is_verified' | 'profile_at'>
const median = (xs: number[]) => {
  const s = xs.filter(x => x > 0).sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}
/** Pur : chiffres clés d'un compte à partir de ses Reels relevés. */
export function profileStats(all: Reel[], now = Date.now()) {
  const rs = all.filter(r => (r.kind ?? 'reel') === 'reel')
  const best = rs.reduce<Reel | null>((b, r) => !b || r.views > b.views ? r : b, null)
  const last30 = rs.filter(r => r.taken_at && now - Date.parse(r.taken_at) <= 30 * 86400000).length
  return {
    avg: median(rs.map(r => r.views)),
    best,
    record: rs.reduce((m, r) => Math.max(m, r.score), 0),
    viral: rs.filter(r => r.score >= 3).length,
    eng: rs.length ? Math.round((rs.reduce((s, r) => s + engagement(r), 0) / rs.length) * 10) / 10 : 0,
    perWeek: Math.round((last30 / 30) * 7 * 10) / 10,
  }
}
const cleanUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
function Filled({ d, size = 18 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
}
const CAROUSEL = 'M8 8h12v12H8z|M4 16V4h12'

// Case de la grille (Reels 9:16 avec ▶ vues ; posts 3:4). Survol : ♥ likes · 💬 commentaires.
function GridTile({ r, i, fav, onClick }: { r: Reel; i: number; fav: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  const feed = (r.kind ?? 'reel') === 'feed'
  const multi = feed && ((r.images?.length ?? 0) > 1 || r.images?.length === 0)
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-label={feed ? 'Voir le post' : 'Voir le Reel'}
      style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: feed ? '3 / 4' : '9 / 16', padding: 0, border: 'none', borderRadius: 4, background: '#141416', cursor: 'pointer', overflow: 'hidden', animation: `aIn .4s ease ${Math.min(i, 24) * 14}ms both` }}>
      {r.thumb
        ? <img src={img(r.thumb)} alt="" loading={i < 12 ? 'eager' : 'lazy'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3F3F46' }}><Icon d={feed ? I.image : I.play} size={26} /></span>}
      {!feed && <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '28%', background: 'linear-gradient(180deg,transparent,rgba(0,0,0,.6))' }} />}
      {!feed && <span style={{ position: 'absolute', left: 9, bottom: 8, display: 'inline-flex', alignItems: 'center', gap: 5, color: '#fff', fontSize: 13.5, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}><Icon d={I.play} size={13} sw={2.2} />{compact(r.views)}</span>}
      <span style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span>{r.score >= 2 && <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px', borderRadius: 99, fontSize: 11, fontWeight: 850, color: '#fff', background: r.score >= 3 ? GRAD : 'rgba(10,10,11,0.6)', backdropFilter: 'blur(6px)', fontVariantNumeric: 'tabular-nums' }}>{r.score >= 3 ? '🔥 ' : ''}×{ratio(r.score)}</span>}</span>
        <span style={{ display: 'inline-flex', gap: 6, color: '#fff', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.7))' }}>
          {fav && <span style={{ color: '#FBBF24', display: 'flex' }}><Filled d={I.star} size={15} /></span>}
          {multi && <Icon d={CAROUSEL} size={16} sw={2} />}
        </span>
      </span>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, background: 'rgba(0,0,0,0.42)', color: '#fff', fontSize: 15, fontWeight: 800, opacity: hover ? 1 : 0, transition: 'opacity .15s ease' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Filled d={I.heart} size={19} />{compact(r.likes)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Filled d={I.comment} size={18} />{compact(r.comments)}</span>
      </span>
    </button>
  )
}

function ProfileView({ theme, username, rows, reels, favSet, onBack, onOpen, onLoaded }: {
  theme: Theme; username: string; rows: Watch[]; reels: Reel[]; favSet: Set<string>; onBack: () => void
  onOpen: (list: Reel[], i: number) => void; onLoaded: (username: string, p: Prof) => void
}) {
  const narrow = useNarrow(760)
  const acc = rows.find(w => w.profile_at) ?? rows[0]
  const [prof, setProf] = useState<Prof | null>(acc?.profile_at ? acc : null)
  const [loadingProf, setLoadingProf] = useState(false)
  const [extra, setExtra] = useState<Reel[]>([])
  const [tab, setTab] = useState<Kind>('reel')
  const [sort, setSort] = useState<'recent' | 'views' | 'score'>('recent')
  const ids = rows.map(w => w.id).join(',')

  // Profil (photo, bio, abonnés) : stocké au relevé ; re-demandé s'il a plus de 12 h.
  useEffect(() => {
    let alive = true
    const a = rows.find(w => w.profile_at) ?? rows[0]
    setProf(a?.profile_at ? a : null); setTab('reel'); setExtra([])
    if (a?.profile_at && Date.now() - Date.parse(a.profile_at) < 12 * 3600_000) return
    setLoadingProf(true)
    void callFn({ viral: 'profile', username }).then(res => res.json()).then((j: Prof & { ok?: boolean }) => {
      if (alive && j?.ok) { const p: Prof = { full_name: j.full_name, biography: j.biography, profile_pic: j.profile_pic, external_url: j.external_url, followers: j.followers, following: j.following, media_count: j.media_count, is_verified: j.is_verified, profile_at: j.profile_at }; setProf(p); onLoaded(username, p) }
    }).catch(() => { /* profil facultatif */ }).finally(() => { if (alive) setLoadingProf(false) })
    return () => { alive = false }
  }, [username]) // eslint-disable-line react-hooks/exhaustive-deps
  // Tout l'historique relevé du compte (au-delà des 31 jours chargés par la Veille).
  useEffect(() => {
    if (!ids) return
    let alive = true
    void supabase.from('viral_reels').select('*').in('watch_id', ids.split(',')).order('taken_at', { ascending: false }).limit(400)
      .then(({ data }) => { if (alive && data) setExtra(data as Reel[]) })
    return () => { alive = false }
  }, [ids])

  const all = useMemo(() => {
    const metric = (r: Reel) => (r.kind ?? 'reel') === 'feed' ? r.likes : r.views
    const m = new Map<string, Reel>()
    for (const r of [...reels.filter(x => x.username === username), ...extra]) { const c = m.get(r.code); if (!c || metric(r) > metric(c)) m.set(r.code, r) }
    return [...m.values()]
  }, [reels, extra, username])
  const t = (r: Reel) => r.taken_at ? Date.parse(r.taken_at) : 0
  const listOf = (k: Kind) => all.filter(r => (r.kind ?? 'reel') === k).sort((a, b) =>
    sort === 'recent' ? t(b) - t(a) : sort === 'score' ? b.score - a.score : (k === 'feed' ? b.likes - a.likes : b.views - a.views))
  const rs = useMemo(() => listOf('reel'), [all, sort]) // eslint-disable-line react-hooks/exhaustive-deps
  const fs = useMemo(() => listOf('feed'), [all, sort]) // eslint-disable-line react-hooks/exhaustive-deps
  const effTab: Kind = tab === 'reel' && !rs.length && fs.length ? 'feed' : tab
  const list = effTab === 'feed' ? fs : rs
  const st = useMemo(() => profileStats(all), [all])
  const highlights = useMemo(() => [...all].filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 8), [all])
  const avatar = prof?.profile_pic ? img(prof.profile_pic) : st.best?.thumb ? img(st.best.thumb) : null
  const igUrl = `https://www.instagram.com/${username}/`
  const w0 = rows[0]
  const category = [w0?.niche, w0?.region ? REGION_LABEL[w0.region] : null, w0?.scope === 'private' ? 'Ton compte suivi' : 'Sélection ScaleFlow'].filter(Boolean).join(' · ')
  const oldest = all.reduce<string | null>((o, r) => r.taken_at && (!o || r.taken_at < o) ? r.taken_at : o, null)
  const fetchedAt = rows.reduce<string | null>((a, w) => w.fetched_at && (!a || w.fetched_at > a) ? w.fetched_at : a, null)

  const counts: [string, string][] = prof
    ? [[compact(prof.media_count ?? 0), 'publications'], [compact(prof.followers ?? 0), 'followers'], [compact(prof.following ?? 0), 'suivi(e)s']]
    : [[String(rs.length), 'Reels relevés'], [String(fs.length), 'posts relevés'], [st.avg ? compact(st.avg) : '—', 'vues / Reel']]
  const Count = ({ v, l }: { v: string; l: string }) => narrow
    ? <span style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><b style={{ fontSize: 17, fontWeight: 800, color: '#F5F5F5', fontVariantNumeric: 'tabular-nums' }}>{v}</b><span style={{ fontSize: 12.5, color: '#A8A8A8' }}>{l}</span></span>
    : <span style={{ fontSize: 16, color: '#E4E4E7', whiteSpace: 'nowrap' }}><b style={{ fontWeight: 800, color: '#F5F5F5', fontVariantNumeric: 'tabular-nums' }}>{v}</b> {l}</span>
  const igBtn = (label: string, onClick: () => void, blue?: boolean, d?: string) => (
    <button type="button" onClick={onClick} title={label} style={{ flex: narrow ? 1 : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, padding: '0 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', background: blue ? '#0095F6' : '#262628', color: '#F5F5F5', transition: 'filter .15s ease' }}
      onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.15)' }} onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}>
      {d && <Icon d={d} size={14} sw={2} />}{label}
    </button>
  )
  const buttons = (
    <span style={{ display: 'flex', gap: 8, flexWrap: narrow ? 'nowrap' : 'wrap' }}>
      {igBtn('Ouvrir sur Instagram', () => window.open(igUrl, '_blank', 'noopener'), true)}
      {igBtn('Copier le lien', () => void copyText(igUrl, 'Lien du profil copié.'))}
    </span>
  )
  const bio = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 14, lineHeight: 1.45, color: '#F5F5F5' }}>
      {prof?.full_name && <b data-no-tr style={{ fontWeight: 700 }}>{prof.full_name}</b>}
      {category && <span style={{ fontSize: 13.5, color: '#A8A8A8' }}>{category}</span>}
      {prof?.biography && <span data-no-tr style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><RichCaption text={prof.biography} /></span>}
      {prof?.external_url && (
        <a href={prof.external_url} target="_blank" rel="noopener noreferrer" data-no-tr style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content', maxWidth: '100%', color: '#E0F1FF', fontWeight: 700, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Icon d={I.link} size={13} sw={2} />{cleanUrl(prof.external_url)}
        </a>
      )}
      {!prof && loadingProf && <span style={{ display: 'block', width: 220, height: 12, marginTop: 4, borderRadius: 6, background: 'linear-gradient(110deg,#141416 30%,#1E1E21 50%,#141416 70%)', backgroundSize: '200% 100%', animation: 'aShimmer 1.4s linear infinite' }} />}
    </div>
  )
  const insights: [string, string, string, (() => void)?][] = [
    ['Vues habituelles', st.avg ? compact(st.avg) : '—', 'médiane par Reel'],
    ['Meilleur Reel', st.best ? compact(st.best.views) : '—', st.best?.score ? `×${ratio(st.best.score)} la normale` : '—', st.best ? () => { const i = rs.findIndex(r => r.code === st.best!.code); onOpen(rs, Math.max(0, i)) } : undefined],
    ['Reels viraux', String(st.viral), '≥ ×3 la normale'],
    ['Engagement', pct(st.eng), 'moyen par Reel'],
    ['Rythme', st.perWeek.toLocaleString('fr-FR'), 'Reels / semaine'],
  ]

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* Barre du haut (reste visible au défilement) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 6, display: 'flex', alignItems: 'center', gap: 10, height: 54, margin: narrow ? '-20px -16px 0' : '-28px -32px 0', padding: narrow ? '0 10px' : '0 24px', background: 'rgba(10,10,11,0.86)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 10px', borderRadius: 9, border: 'none', background: 'transparent', color: '#E4E4E7', cursor: 'pointer', fontSize: 13.5, fontWeight: 700 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Icon d={I.left} size={17} sw={2.2} />{narrow ? '' : 'Veille Reels'}
        </button>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <b data-no-tr style={{ fontSize: 16, fontWeight: 800, color: '#F5F5F5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username}</b>
          {prof?.is_verified && <Verified size={15} />}
        </span>
        <button type="button" onClick={() => window.open(igUrl, '_blank', 'noopener')} title="Ouvrir sur Instagram" aria-label="Ouvrir sur Instagram" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, border: 'none', background: 'transparent', color: '#E4E4E7', cursor: 'pointer' }}><Icon d={I.external} size={16} /></button>
      </div>

      <div style={{ maxWidth: 975, margin: '0 auto' }}>
        {/* En-tête du profil */}
        <header style={{ display: 'flex', alignItems: narrow ? 'center' : 'flex-start', gap: narrow ? 20 : 'clamp(28px, 6vw, 84px)', padding: narrow ? '20px 2px 14px' : '38px 24px 28px' }}>
          <span style={{ width: narrow ? undefined : 'clamp(140px, 22%, 210px)', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <Avatar src={avatar} size={narrow ? 82 : 154} hot={st.viral > 0} letter={username} />
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: narrow ? 10 : 18 }}>
            {!narrow && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span data-no-tr style={{ fontSize: 21, fontWeight: 500, color: '#F5F5F5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username}</span>
                  {prof?.is_verified && <Verified size={18} />}
                </span>
                {buttons}
              </span>
            )}
            {narrow && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span data-no-tr style={{ fontSize: 18, fontWeight: 600, color: '#F5F5F5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username}</span>{prof?.is_verified && <Verified size={16} />}</span>}
            <span style={{ display: 'flex', gap: narrow ? 4 : 38, flexWrap: narrow ? 'nowrap' : 'wrap' }}>{counts.map(([v, l]) => <Count key={l} v={v} l={l} />)}</span>
            {!narrow && bio}
          </div>
        </header>
        {narrow && <div style={{ padding: '0 2px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>{bio}{buttons}</div>}

        {/* « À la une » : ses posts qui ont le plus surperformé */}
        {highlights.length > 0 && (
          <div style={{ display: 'flex', gap: narrow ? 14 : 30, overflowX: 'auto', padding: narrow ? '4px 2px 16px' : '4px 40px 26px', scrollbarWidth: 'none' }}>
            {highlights.map((r, i) => (
              <button key={r.code} type="button" onClick={() => onOpen(highlights, i)} title={(r.kind ?? 'reel') === 'feed' ? 'Voir le post' : 'Voir le Reel'}
                style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <span style={{ padding: 2, borderRadius: 99, background: r.score >= 3 ? IG_RING : 'rgba(255,255,255,0.22)' }}>
                  <span style={{ display: 'block', width: narrow ? 60 : 78, height: narrow ? 60 : 78, borderRadius: 99, overflow: 'hidden', border: '3px solid #0A0A0B', background: '#161618' }}>
                    {r.thumb && <img src={img(r.thumb)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.score >= 3 ? '#F9A8D4' : '#E4E4E7', fontVariantNumeric: 'tabular-nums' }}>{r.score >= 3 ? '🔥 ' : ''}×{ratio(r.score)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Analyse ScaleFlow du compte */}
        <section style={{ margin: narrow ? '0 0 18px' : '0 8px 26px', borderRadius: 16, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.07)', padding: narrow ? 12 : '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: V }}>● Analyse ScaleFlow</span>
            <span style={{ fontSize: 11.5, color: '#71717A' }}>{fetchedAt ? `Relevé ${timeAgo(fetchedAt)}` : 'Pas encore relevé'}{oldest ? ` · depuis le ${fmtDate(oldest)}` : ''}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))', gap: 8 }}>
            {insights.map(([l, v, sub, go], k) => (
              <button key={l} type="button" onClick={go} disabled={!go} style={{ gridColumn: narrow && k === insights.length - 1 && insights.length % 2 ? 'span 2' : undefined, textAlign: 'left', padding: '10px 12px', borderRadius: 11, border: '1px solid transparent', background: '#141416', cursor: go ? 'pointer' : 'default', color: 'inherit' }}
                onMouseEnter={e => { if (go) e.currentTarget.style.borderColor = 'rgba(167,139,250,0.45)' }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent' }}>
                <span style={{ display: 'block', fontSize: 11, color: '#8B8B94', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</span>
                <span style={{ display: 'block', marginTop: 3, fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: l === 'Reels viraux' && st.viral > 0 ? '#F472B6' : '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                <span style={{ display: 'block', marginTop: 1, fontSize: 11, color: '#5A5A63', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Onglets façon Instagram */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: narrow ? 0 : 60, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          {([['reel', 'Reels', 'M3 3h18v18H3z|M3 8h18|M8 3l3 5|M14 3l3 5|M10 11.5v6l5-3z', rs.length], ['feed', 'Publications', I.grid, fs.length]] as [Kind, string, string, number][]).map(([k, l, d, n]) => {
            const on = effTab === k
            return (
              <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={on}
                style={{ flex: narrow ? 1 : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 52, marginTop: -1, padding: '0 4px', border: 'none', borderTop: `1px solid ${on ? '#F5F5F5' : 'transparent'}`, background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: narrow ? 11.5 : 12.5, fontWeight: 700, letterSpacing: narrow ? '.04em' : '.08em', textTransform: 'uppercase', color: on ? '#F5F5F5' : '#8B8B94' }}>
                <Icon d={d} size={14} sw={2} />{l}<span style={{ fontWeight: 600, color: '#71717A', letterSpacing: 0 }}>· {n}</span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '2px 0 12px' }}>
          <span style={{ fontSize: 12, color: '#71717A' }}>{!list.length ? '' : effTab === 'feed' ? `${list.length} post(s) relevé(s) par ScaleFlow` : `${list.length} Reel(s) relevé(s) par ScaleFlow`}</span>
          {list.length > 1 && <Pills value={sort} onChange={setSort} options={[{ v: 'recent', l: 'Récents' }, { v: 'views', l: effTab === 'feed' ? 'Plus likés' : 'Plus vus' }, { v: 'score', l: '×Normale' }]} />}
        </div>
        {list.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '56px 16px', textAlign: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 62, height: 62, borderRadius: 99, border: '2px solid #F5F5F5', color: '#F5F5F5' }}><Icon d={effTab === 'feed' ? I.image : I.play} size={26} /></span>
            <b style={{ fontSize: 20, fontWeight: 800, color: '#F5F5F5' }}>{effTab === 'feed' ? 'Aucun post relevé' : 'Aucun Reel relevé'}</b>
            <span style={{ fontSize: 13.5, color: '#8B8B94', maxWidth: 360 }}>Ils apparaîtront ici après le prochain relevé (chaque jour à midi).</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${narrow ? 3 : effTab === 'feed' ? 3 : 4}, minmax(0,1fr))`, gap: narrow ? 2 : 4 }}>
            {list.map((r, i) => <GridTile key={r.code} r={r} i={i} fav={favSet.has(r.code)} onClick={() => onOpen(list, i)} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// Comptes en ronds façon « stories » (photo de profil, anneau dégradé s'il a un Reel viral).
function StoriesTray({ list, reels, picOf, onOpen }: { list: Watch[]; reels: Reel[]; picOf: (u: string) => string | null; onOpen: (u: string) => void }) {
  const top = useMemo(() => {
    const m = new Map<string, { best: Reel; hot: boolean; score: number }>()
    for (const r of reels) {
      const c = m.get(r.username)
      const v = r.views + r.likes
      if (!c) m.set(r.username, { best: r, hot: r.score >= 3, score: v })
      else { if (v > c.score) { c.best = r; c.score = v } if (r.score >= 3) c.hot = true }
    }
    return m
  }, [reels])
  const names = useMemo(() => [...new Set(list.map(w => w.username))].sort((a, b) => (top.get(b)?.score ?? 0) - (top.get(a)?.score ?? 0)), [list, top])
  if (!names.length) return null
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 2px 10px', marginBottom: 12, scrollbarWidth: 'thin' }}>
      {names.map(u => {
        const tp = top.get(u)
        const pic = picOf(u) ?? tp?.best.thumb ?? null
        return (
          <button key={u} type="button" onClick={() => onOpen(u)} title={`Voir le profil de @${u}`}
            style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 76, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <Avatar src={pic ? img(pic) : null} size={62} hot={!!tp?.hot} letter={u} />
            <span data-no-tr style={{ maxWidth: '100%', fontSize: 11.5, fontWeight: 600, color: tp ? '#E4E4E7' : '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u}</span>
          </button>
        )
      })}
    </div>
  )
}

// Mini-courbe (vues par jour sur 7 jours).
function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${30 - (v / max) * 26}`).join(' ')
  return <svg viewBox="0 0 100 32" width="90" height="28" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke={V} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></svg>
}

// ── Gestion de la Sélection ScaleFlow (super-admin) ──────────────────────────
function WatchPanel({ theme, list, onAdd, onRemove }: {
  theme: Theme; list: Watch[]; onAdd: (names: string[], niche: string, region: Region) => Promise<boolean>; onRemove: (w: Watch) => void
}) {
  const [adding, setAdding] = useState('')
  const [niche, setNiche] = useState('Modèles FR')
  const [region, setRegion] = useState<Region>('fr')
  const errors = list.filter(w => w.last_error)
  async function add() {
    if (await onAdd(parseHandles(adding), niche.trim(), region)) setAdding('')
  }
  return (
    <Panel theme={theme} style={{ marginBottom: 14 }}>
      <PanelHead title="Sélection ScaleFlow" sub={`Visible par tous les utilisateurs · ${list.length} compte(s)${errors.length ? ` · ${errors.length} en erreur` : ''}`} />
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea value={adding} onChange={e => setAdding(e.target.value)} rows={3} placeholder={'Colle des @ ou liens Instagram (un par ligne)\n@modele1\nhttps://instagram.com/modele2'} style={TEXTAREA} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Pills value={region} onChange={setRegion} options={REGIONS} />
            <input value={niche} onChange={e => setNiche(e.target.value)} placeholder="Niche (ex. Modèles FR)" style={FIELD} />
            <Btn theme={theme} label="Ajouter" icon="M12 5v14|M5 12h14" onClick={() => void add()} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start', maxHeight: 150, overflowY: 'auto' }}>
          {list.length === 0 && <span style={{ fontSize: 12.5, color: '#5A5A63' }}>Aucun compte pour l’instant.</span>}
          {list.map(w => (
            <span key={w.id} title={w.last_error ?? (w.fetched_at ? `Relevé le ${new Date(w.fetched_at).toLocaleString('fr-FR')}` : 'Pas encore relevé')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 4px 0 10px', borderRadius: 99, background: '#161618', border: `1px solid ${w.last_error ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.09)'}`, fontSize: 12, color: '#EDEDEF' }}>
              <Flag c={w.region ?? 'fr'} />
              <span data-no-tr>@{w.username}</span>
              <button type="button" onClick={() => onRemove(w)} aria-label="Retirer" style={{ display: 'flex', border: 'none', background: 'transparent', color: '#71717A', cursor: 'pointer', padding: 2 }}><Icon d="M18 6L6 18|M6 6l12 12" size={11} /></button>
            </span>
          ))}
        </div>
      </div>
    </Panel>
  )
}
/** @ / liens collés → pseudos propres, sans doublon. */
function parseHandles(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map(s => s.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').replace(/\?.*$/, '').toLowerCase()).filter(s => /^[a-z0-9._]{1,30}$/.test(s)))]
}

export default function ViralWatch({ theme, user, org, isAdmin, onNavigate }: { theme: Theme; user: User; org: OrgState; isAdmin: boolean; onNavigate?: (p: string) => void }) {
  const { currentOrg } = org
  const orgId = currentOrg?.id ?? null
  const narrow = useNarrow(760)
  const [openArg] = useState(() => takeOpenArg<{ tab?: Tab | 'public' }>('viral'))
  const [tab, setTab] = useState<Tab>(() => openArg?.tab === 'mine' ? 'mine' : openArg?.tab && openArg.tab !== 'public' ? openArg.tab : 'dash')
  const [watch, setWatch] = useState<Watch[]>([])
  const [reels, setReels] = useState<Reel[]>([])
  const [favs, setFavs] = useState<Fav[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [noV4, setNoV4] = useState(false)          // SQL 20261016 pas encore passé
  const [noRegion, setNoRegion] = useState(false)
  const [userView, setUserView] = useState(false)
  const [source, setSource] = useState<Source>('all')
  const [fRegion, setFRegion] = useState<Region | ''>('')
  const [range, setRange] = useState<Range>('7')
  const [sort, setSort] = useState<Sort>('views')
  const [fNiche, setFNiche] = useState('')
  const [profile, setProfile] = useState<string | null>(null)   // @ dont on regarde le profil
  const [open, setOpen] = useState<{ list: Reel[]; i: number } | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [reqText, setReqText] = useState('')
  const [reqNote, setReqNote] = useState('')
  const [reqRegion, setReqRegion] = useState<Region>('fr')
  const admin = isAdmin && !userView

  const load = useCallback(async () => {
    setLoading(true)
    // select('*') : les colonnes de profil (SQL 20261017) arrivent quand elles existent, sans casser avant.
    const w = await supabase.from('viral_watch').select('*').order('username')
    const rows0 = (w.data ?? []) as Record<string, unknown>[]
    setNoRegion(rows0.length > 0 && !('region' in rows0[0]))
    setMissing(!!w.error && /relation|does not exist|schema cache/i.test(w.error.message))
    // Visibles : Sélection ScaleFlow + comptes privés de l'espace courant.
    const list = ((w.data ?? []) as Watch[]).map(x => ({ ...x, scope: x.scope ?? 'public' }))
      .filter(x => x.scope === 'public' || (orgId ? x.org_id === orgId : (x.user_id === user.id && !x.org_id)))
    setWatch(list)
    if (list.length) {
      const ids = list.map(x => x.id)
      const out: Reel[] = []
      for (let i = 0; i < ids.length; i += 150) {
        const r = await supabase.from('viral_reels').select('*').in('watch_id', ids.slice(i, i + 150)).gte('taken_at', new Date(Date.now() - 31 * 86400000).toISOString()).limit(5000)
        out.push(...((r.data ?? []) as Reel[]))
      }
      setReels(out)
      setNoV4(out.length > 0 && !('kind' in out[0]))
    } else setReels([])
    const f = await (orgId ? supabase.from('viral_favorites').select('*').eq('org_id', orgId) : supabase.from('viral_favorites').select('*').eq('user_id', user.id).is('org_id', null)).order('created_at', { ascending: false })
    if (f.error && isMissing(f.error.message)) setNoV4(true)
    setFavs((f.data ?? []) as Fav[])
    const rq = await supabase.from('viral_requests').select('*').order('created_at', { ascending: false }).limit(100)
    setReqs((rq.data ?? []) as Req[])
    setLoading(false)
  }, [orgId, user.id])
  useEffect(() => { void load() }, [load])

  const favSet = useMemo(() => new Set(favs.map(f => f.code)), [favs])
  const srcWatch = useMemo(() => watch.filter(w => source === 'all' || w.scope === source), [watch, source])
  const srcReels = useMemo(() => { const ids = new Set(srcWatch.map(w => w.id)); return reels.filter(r => ids.has(r.watch_id)) }, [reels, srcWatch])
  const niches = [...new Set(srcWatch.map(w => w.niche).filter(Boolean))]
  const opts = { range, region: fRegion, niche: fNiche, account: '', sort }
  const shownReels = useMemo(() => filterReels(srcReels, srcWatch, { ...opts, kind: 'reel' }).slice(0, 120), [srcReels, srcWatch, range, fRegion, fNiche, sort]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownFeed = useMemo(() => filterReels(srcReels, srcWatch, { ...opts, kind: 'feed' }).slice(0, 120), [srcReels, srcWatch, range, fRegion, fNiche, sort]) // eslint-disable-line react-hooks/exhaustive-deps
  // Photo de profil par @ (SQL 20261017 + relevé) ; à défaut, les ronds prennent la meilleure vignette.
  const picOf = useMemo(() => { const m = new Map<string, string>(); for (const w of watch) if (w.profile_pic) m.set(w.username, w.profile_pic); return (u: string) => m.get(u) ?? null }, [watch])
  const moreOf = useCallback((u: string) => {
    const m = new Map<string, Reel>()
    for (const r of reels) if (r.username === u && !m.has(r.code)) m.set(r.code, r)
    return [...m.values()].sort((a, b) => (b.views || b.likes * 10) - (a.views || a.likes * 10)).slice(0, 30)
  }, [reels])
  const accountOf = useCallback((u: string) => watch.find(w => w.username === u && w.profile_at) ?? watch.find(w => w.username === u), [watch])
  const mine = watch.filter(w => w.scope === 'private')
  const myReqs = reqs.filter(r => r.user_id === user.id || (orgId && r.org_id === orgId))
  const pending = reqs.filter(r => r.status === 'pending')

  // ── Tableau de bord ──
  const dash = useMemo(() => {
    const now = Date.now()
    const all7 = filterReels(srcReels, srcWatch, { range: '7', region: fRegion, niche: '', account: '', sort: 'views', kind: 'reel' })
    const today = all7.filter(r => r.taken_at && now - Date.parse(r.taken_at) <= 86400000)
    const hot = [...(today.length >= 3 ? today : all7)].sort((a, b) => b.score - a.score || b.views - a.views).slice(0, 5)
    const accounts = new Map<string, { views: number; n: number; best: number; days: number[]; thumb: string | null }>()
    for (const r of all7) {
      const a = accounts.get(r.username) ?? { views: 0, n: 0, best: 0, days: Array(7).fill(0), thumb: r.thumb }
      a.views += r.views; a.n++; a.best = Math.max(a.best, r.score)
      const d = Math.min(6, Math.max(0, 6 - Math.floor((now - Date.parse(r.taken_at as string)) / 86400000))); a.days[d] += r.views
      accounts.set(r.username, a)
    }
    const leaders = [...accounts.entries()].sort((a, b) => b[1].views - a[1].views).slice(0, 8)
    const feedTop = filterReels(srcReels, srcWatch, { range: '7', region: fRegion, niche: '', account: '', sort: 'views', kind: 'feed' }).slice(0, 4)
    return { all7, today, hot, leaders, feedTop, views7: all7.reduce((s, r) => s + r.views, 0), record: all7.reduce((m, r) => Math.max(m, r.score), 0) }
  }, [srcReels, srcWatch, fRegion])

  const lastFetch = srcWatch.reduce<string | null>((a, w) => w.fetched_at && (!a || w.fetched_at > a) ? w.fetched_at : a, null)
  const sinceTxt = lastFetch ? (() => { const m = Math.round((Date.now() - Date.parse(lastFetch)) / 60000); return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j` })() : null

  // ── Actions ──
  // Profil d'un compte (façon Instagram) : remplace la page, retour = là où on était.
  const scrollTop = () => { try { document.querySelector('main')?.scrollTo?.({ top: 0 }) } catch { /* ignore */ } }
  const openAccount = useCallback((u: string) => { setOpen(null); setProfile(u); scrollTop() }, [])
  const closeProfile = () => { setProfile(null); scrollTop() }
  const ctx = useMemo(() => ({ open: openAccount, pic: picOf }), [openAccount, picOf])
  const onProfileLoaded = useCallback((u: string, p: Partial<Watch>) => setWatch(ws => ws.map(w => w.username === u ? { ...w, ...p } : w)), [])
  const setOpenIndex = useCallback((i: number) => setOpen(o => o && { ...o, i }), [])
  const closeViewer = useCallback(() => setOpen(null), [])
  // « Recréer avec mes images » (Genjutsu) : réservé aux admins.
  const canRecast = admin && !!onNavigate
  const recast = (r: Reel) => { if (onNavigate) openTool(onNavigate, 'genjutsu', { reel: { code: r.code, thumb: r.thumb, username: r.username, views: r.views, score: r.score } }) }
  async function toggleFav(r: Reel) {
    if (favSet.has(r.code)) {
      const f = favs.find(x => x.code === r.code)
      setFavs(cur => cur.filter(x => x.code !== r.code))
      if (f) { const { error } = await supabase.from('viral_favorites').delete().eq('id', f.id); if (error) { toast(`Échec : ${error.message}`, 'bad'); void load() } }
      return
    }
    const row = { user_id: user.id, org_id: orgId, code: r.code, kind: r.kind ?? 'reel', watch_id: r.watch_id, username: r.username, thumb: r.thumb, views: r.views, likes: r.likes, score: r.score, url: reelUrl(r) }
    const { data, error } = await supabase.from('viral_favorites').insert(row).select('*').maybeSingle()
    if (error) { toast(isMissing(error.message) ? 'Favoris : colle d’abord supabase/migrations/20261016_viral_v4.sql dans Supabase.' : `Échec : ${error.message}`, 'bad', 7000); return }
    if (data) setFavs(cur => [data as Fav, ...cur])
    toast('Ajouté aux favoris.', 'ok')
  }
  async function addAccounts(names: string[], niche: string, region: Region): Promise<boolean> {
    const fresh = names.filter(n => !watch.some(w => w.scope === 'public' && w.username === n))
    if (!fresh.length) { toast('Aucun nouveau compte (déjà suivis ou invalides).', 'info'); return false }
    const rows = fresh.map(username => ({ username, niche, user_id: user.id, org_id: null, scope: 'public', ...(noRegion ? {} : { region }) }))
    const { error } = await supabase.from('viral_watch').insert(rows)
    if (error) { toast(/duplicate|unique/i.test(error.message) ? 'Un de ces comptes est déjà suivi.' : `Échec : ${error.message}`, 'bad'); return false }
    toast(`${fresh.length} compte(s) ajouté(s) — relevé en cours…`, 'ok'); await load(); void refreshAll(); return true
  }
  async function removeWatch(w: Watch) {
    const { error } = await supabase.from('viral_watch').delete().eq('id', w.id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else void load()
  }
  /** Relevé COMPLET : relance tant qu'il reste des comptes (45 s par appel côté serveur). */
  async function refreshAll() {
    if (refreshing) return
    const since = new Date().toISOString()
    let done = 0, stalls = 0
    setRefreshing('Relevé en cours…')
    try {
      for (let k = 0; k < 40; k++) {
        const res = await callFn({ viral: 'refresh', since, org_id: orgId })
        const j = await res.json().catch(() => ({})) as { ok?: boolean; accounts?: number; reels?: number; remaining?: number; error?: string }
        if (!res.ok || !j.ok) { toast(`Relevé impossible : ${j.error ?? `HTTP ${res.status}`} (vérifie le secret HIKERAPI_KEY).`, 'bad', 9000); break }
        done += j.accounts ?? 0
        const rem = j.remaining ?? 0
        setRefreshing(`${done} compte(s) relevé(s)${rem ? ` · ${rem} restant(s)` : ''}…`)
        if (j.remaining === undefined || rem === 0) break
        stalls = (j.accounts ?? 0) === 0 ? stalls + 1 : 0
        if (stalls >= 2) break
      }
      toast(done ? `${done} compte(s) relevé(s).` : 'Tout est déjà à jour.', done ? 'ok' : 'info')
    } catch { toast('Relevé impossible (réseau).', 'bad') } finally { setRefreshing(null); void load() }
  }
  async function sendRequest() {
    const names = parseHandles(reqText)
    if (!names.length) { toast('Colle au moins un @ ou un lien Instagram valide.', 'bad'); return }
    const { error } = await supabase.from('viral_requests').insert({ user_id: user.id, org_id: orgId, requester: currentOrg?.name ?? user.email ?? null, usernames: names.slice(0, 50), region: reqRegion, note: reqNote.trim().slice(0, 500) })
    if (error) { toast(isMissing(error.message) ? 'Demandes : le SQL 20261016_viral_v4.sql doit d’abord être passé par ScaleFlow.' : `Envoi impossible : ${error.message}`, 'bad', 8000); return }
    setReqText(''); setReqNote(''); toast(`Demande envoyée (${names.length} compte(s)). Tu seras suivi(e) dès validation.`, 'ok', 6000); void load()
  }
  async function handleRequest(q: Req, accept: boolean) {
    if (accept) {
      let added = 0
      for (const username of q.usernames) {
        const { error } = await supabase.from('viral_watch').insert({ username, niche: 'Comptes client', user_id: q.user_id, org_id: q.org_id, scope: 'private', region: q.region ?? 'fr' })
        if (!error) added++
        else if (!/duplicate|unique/i.test(error.message)) { toast(`Ajout de @${username} impossible : ${error.message}`, 'bad', 7000) }
      }
      toast(`${added} compte(s) ajouté(s) pour ${q.requester ?? 'cette agence'}.`, 'ok')
    }
    const { error } = await supabase.from('viral_requests').update({ status: accept ? 'done' : 'refused', handled_at: new Date().toISOString() }).eq('id', q.id)
    if (error) toast(`Échec : ${error.message}`, 'bad')
    await load()
    if (accept) void refreshAll()
  }

  if (missing) return (
    <div><PageHead title="Veille Reels" sub="Les Reels qui explosent chez tes comptes de référence." />
      <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01" title="Activation requise" text={isAdmin ? 'Colle supabase/migrations/20261012_viral.sql dans Supabase → SQL Editor → Run, puis recharge.' : 'Bientôt disponible.'} /></Panel></div>
  )

  const grid = (list: Reel[], feed?: boolean) => list.length === 0
    ? <Panel theme={theme}><Empty icon={feed ? I.image : I.pulse} title={feed ? 'Aucun post pour l’instant' : 'Aucun Reel pour l’instant'} text={feed && noV4 ? 'Le feed arrive avec la mise à jour de la base (SQL 20261016) et le prochain relevé.' : 'Les nouveautés des comptes suivis apparaîtront ici après le prochain relevé (chaque jour à midi).'} /></Panel>
    : (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(min(${feed ? 210 : 180}px,46%),1fr))`, gridAutoFlow: 'dense', gap: 14 }}>
        {list.map((r, i) => <MediaCard key={`${r.watch_id}-${r.code}`} r={r} rank={i + 1} fav={favSet.has(r.code)}
          onOpen={() => setOpen({ list, i })} onRecast={canRecast ? () => recast(r) : undefined} onFav={() => void toggleFav(r)} />)}
      </div>
    )
  const filters = (feed?: boolean) => (
    <>
      <StoriesTray list={srcWatch} reels={srcReels.filter(r => (r.kind ?? 'reel') === (feed ? 'feed' : 'reel'))} picOf={picOf} onOpen={openAccount} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {!noRegion && <Pills label="Pays" value={fRegion || 'all'} onChange={v => setFRegion(v === 'all' ? '' : v)} options={[{ v: 'all' as const, l: 'Tous' }, ...REGIONS]} />}
        <Pills label="Période" value={range} onChange={setRange} options={[{ v: '1', l: '24 h' }, { v: '7', l: '7 jours' }, { v: '30', l: '30 jours' }]} />
        {niches.length > 1 && <select value={fNiche} onChange={e => setFNiche(e.target.value)} style={{ ...FIELD, width: 'auto', height: 30 }}><option value="">Toutes les niches</option>{niches.map(n => <option key={n} value={n}>{n}</option>)}</select>}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Pills label="Trier" value={sort} onChange={setSort} options={feed ? [{ v: 'views', l: 'Likes' }, { v: 'score', l: '×Normale' }, { v: 'recent', l: 'Récents' }] : [{ v: 'views', l: 'Vues' }, { v: 'score', l: '×Normale' }, { v: 'likes', l: 'Likes' }, { v: 'recent', l: 'Récents' }]} />
        </span>
      </div>
    </>
  )

  const TABS: [Tab, string, string][] = [
    ['dash', 'Tableau de bord', I.dash],
    ['reels', 'Reels', I.play],
    ['feed', 'Feed', I.image],
    ['favs', `Favoris${favs.length ? ` · ${favs.length}` : ''}`, I.star],
    ['mine', `Mes comptes${admin && pending.length ? ` · ${pending.length} demande(s)` : ''}`, I.users],
  ]
  const favReels: Reel[] = favs.map(f => reels.find(r => r.code === f.code) ?? ({ watch_id: f.watch_id ?? '', code: f.code, username: f.username ?? '', views: f.views, likes: f.likes, comments: 0, taken_at: f.created_at, thumb: f.thumb, url: f.url, baseline: 0, score: f.score, kind: f.kind } as Reel))

  return (
    <AccountCtx.Provider value={ctx}>
    {profile ? (
      <ProfileView key={profile} theme={theme} username={profile} rows={watch.filter(w => w.username === profile)} reels={reels} favSet={favSet} onBack={closeProfile}
        onOpen={(list, i) => setOpen({ list, i })} onLoaded={onProfileLoaded} />
    ) : (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: V }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: V, boxShadow: '0 0 0 4px rgba(167,139,250,.18)', animation: 'aPulse 1.8s ease-in-out infinite' }} />
            Veille Reels{sinceTxt ? ` · relevé ${sinceTxt}` : ''} · auto chaque jour à midi
          </span>
          <h1 style={{ margin: '10px 0 0', fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 0.92, textTransform: 'uppercase', fontSize: 'clamp(32px, 4vw, 56px)', color: '#F4F4F5' }}>
            Ce qui explose <span style={{ color: '#52525B' }}>en ce moment</span>
          </h1>
        </div>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && <Segmented value={userView ? 'user' : 'admin'} onChange={v => setUserView(v === 'user')} options={[{ v: 'admin', l: 'Admin' }, { v: 'user', l: 'Vue utilisateur' }]} />}
          {(admin || mine.length > 0) && <Btn theme={theme} tone="primary" icon={I.refresh} label={refreshing ?? (admin ? 'Actualiser tout' : 'Actualiser mes comptes')} disabled={!!refreshing} onClick={() => void refreshAll()} />}
        </span>
      </div>

      {isAdmin && noV4 && !userView && (
        <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', fontSize: 12.5, color: '#FCD34D' }}>
          Pour la fiche instantanée, le feed, les favoris et les demandes : colle <b>supabase/migrations/20261016_viral_v4.sql</b> dans Supabase → SQL Editor → Run, puis « Actualiser tout ».
        </div>
      )}

      {/* Onglets + source */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto', flex: '1 1 auto' }}>
          {TABS.map(([k, l, i]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, height: 42, padding: '0 13px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 750, color: tab === k ? '#F4F4F5' : '#71717A' }}>
              <Icon d={i} size={14} />{l}
              <span style={{ position: 'absolute', left: 10, right: 10, bottom: -1, height: 2, borderRadius: 2, background: tab === k ? 'linear-gradient(90deg,#A78BFA,#F472B6)' : 'transparent' }} />
            </button>
          ))}
        </div>
        {(tab === 'dash' || tab === 'reels' || tab === 'feed') && mine.length > 0 && (
          <span style={{ paddingBottom: 6 }}><Segmented value={source} onChange={setSource} options={[{ v: 'all', l: 'Tout' }, { v: 'public', l: 'Sélection ScaleFlow' }, { v: 'private', l: 'Mes comptes' }]} /></span>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(180px,46%),1fr))', gap: 14 }}>
          {Array.from({ length: 10 }, (_, i) => <div key={i} style={{ aspectRatio: '9 / 16', borderRadius: 16, background: 'linear-gradient(110deg,#121214 30%,#1A1A1D 50%,#121214 70%)', backgroundSize: '200% 100%', animation: 'aShimmer 1.4s linear infinite' }} />)}
        </div>
      ) : tab === 'dash' ? (
        <>
          <StoriesTray list={srcWatch} reels={dash.all7} picOf={picOf} onOpen={openAccount} />
          <StatBar items={[
            { l: 'Reels aujourd’hui', v: fmtNumber(dash.today.length), sub: <span style={{ color: '#71717A' }}>{fmtNumber(dash.all7.length)} sur 7 jours</span>, onClick: () => { setRange('1'); setTab('reels') } },
            { l: 'Vues cumulées · 7 j', v: compact(dash.views7) },
            { l: 'Record · 7 j', v: dash.record > 0 ? `×${ratio(dash.record)}` : '—', c: dash.record >= 3 ? '#F472B6' : undefined, sub: <span style={{ color: '#71717A' }}>vs vues habituelles</span>, onClick: () => { setSort('score'); setTab('reels') } },
            { l: 'Comptes suivis', v: fmtNumber(new Set(srcWatch.map(w => w.username)).size), sub: <span style={{ color: '#71717A' }}>{fmtNumber(favs.length)} favori(s)</span>, onClick: () => setTab('mine') },
          ]} />
          {dash.hot.length > 0 && <>
            <SectionTitle kicker={dash.today.length >= 3 ? 'Aujourd’hui' : '7 derniers jours'} title={<>Les plus chauds <span style={{ color: '#52525B' }}>du moment</span></>} right={<Btn theme={theme} sm label="Tous les Reels →" onClick={() => setTab('reels')} />} />
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))', gap: 14, marginBottom: 22 }}>
              {dash.hot.map((r, i) => <MediaCard key={r.code} r={r} rank={i + 1} fav={favSet.has(r.code)} onOpen={() => setOpen({ list: dash.hot, i })} onRecast={canRecast ? () => recast(r) : undefined} onFav={() => void toggleFav(r)} />)}
            </div>
          </>}
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1.2fr) minmax(0,1fr)', gap: 16, marginBottom: 20 }}>
            <section style={{ borderRadius: 20, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.07)', padding: 16 }}>
              <SectionTitle kicker="7 jours" title={<>Comptes <span style={{ color: '#52525B' }}>en forme</span></>} />
              {dash.leaders.length === 0 ? <div style={{ fontSize: 13, color: '#71717A', padding: 8 }}>Pas encore de données.</div> : dash.leaders.map(([u, a], i) => (
                <button key={u} type="button" onClick={() => openAccount(u)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 6px', border: 'none', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
                  <span style={{ width: 22, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800, color: i < 3 ? V : '#52525B' }}>{String(i + 1).padStart(2, '0')}</span>
                  <Avatar src={(picOf(u) ?? a.thumb) ? img((picOf(u) ?? a.thumb) as string) : null} size={32} hot={a.best >= 3} letter={u} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span data-no-tr style={{ display: 'block', fontSize: 13.5, fontWeight: 750, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{u}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#8B8B94' }}>{a.n} Reel(s) · record ×{ratio(a.best)}</span>
                  </span>
                  <Spark values={a.days} />
                  <span style={{ width: 64, textAlign: 'right', fontSize: 15, fontWeight: 900, letterSpacing: '-0.03em', color: '#F4F4F5' }}>{compact(a.views)}</span>
                </button>
              ))}
            </section>
            <section style={{ borderRadius: 20, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.07)', padding: 16 }}>
              <SectionTitle kicker="Feed · 7 jours" title={<>Top posts <span style={{ color: '#52525B' }}>photo</span></>} right={<Btn theme={theme} sm label="Le feed →" onClick={() => setTab('feed')} />} />
              {dash.feedTop.length === 0 ? <div style={{ fontSize: 13, color: '#71717A', padding: 8 }}>{noV4 ? 'Le feed arrive avec la mise à jour de la base et le prochain relevé.' : 'Pas encore de posts sur 7 jours.'}</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
                  {dash.feedTop.map((r, i) => <MediaCard key={r.code} r={r} rank={i + 1} fav={favSet.has(r.code)} onOpen={() => setOpen({ list: dash.feedTop, i })} onFav={() => void toggleFav(r)} />)}
                </div>
              )}
            </section>
          </div>
          {favReels.length > 0 && <>
            <SectionTitle kicker="Favoris" title={<>Tes favoris <span style={{ color: '#52525B' }}>récents</span></>} right={<Btn theme={theme} sm label="Tous les favoris →" onClick={() => setTab('favs')} />} />
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))', gap: 12 }}>
              {favReels.slice(0, 6).map((r, i) => <MediaCard key={r.code} r={r} rank={i + 1} fav onOpen={() => setOpen({ list: favReels.slice(0, 6), i })} onRecast={canRecast ? () => recast(r) : undefined} onFav={() => void toggleFav(r)} />)}
            </div>
          </>}
        </>
      ) : tab === 'reels' ? (
        <>
          {admin && <WatchPanel theme={theme} list={watch.filter(w => w.scope === 'public')} onAdd={addAccounts} onRemove={removeWatch} />}
          {filters(false)}
          {grid(shownReels)}
        </>
      ) : tab === 'feed' ? (
        <>{filters(true)}{grid(shownFeed, true)}</>
      ) : tab === 'favs' ? (
        favReels.length === 0
          ? <Panel theme={theme}><Empty icon={I.star} title="Aucun favori pour l’instant" text="Clique sur l’étoile d’un Reel ou d’un post pour le retrouver ici. Tes favoris sont partagés avec ton équipe." /></Panel>
          : grid(favReels)
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          {admin ? (
            <section style={{ borderRadius: 20, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.07)', padding: 18 }}>
              <SectionTitle kicker="Admin" title={<>Demandes <span style={{ color: '#52525B' }}>en attente</span></>} />
              {pending.length === 0 ? <div style={{ fontSize: 13, color: '#71717A' }}>Aucune demande en attente.</div> : pending.map(q => (
                <div key={q.id} style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <b data-no-tr style={{ fontSize: 14, color: '#EDEDEF' }}>{q.requester ?? 'Agence'}</b>
                    <span style={{ fontSize: 11.5, color: '#71717A' }}>{new Date(q.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {REGION_LABEL[q.region ?? 'fr']}</span>
                  </span>
                  <span data-no-tr style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{q.usernames.map(u => <span key={u} style={{ padding: '2px 8px', borderRadius: 99, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', fontSize: 12, color: '#EDEDEF' }}>@{u}</span>)}</span>
                  {q.note && <span data-no-tr style={{ fontSize: 12.5, color: '#A1A1AA' }}>« {q.note} »</span>}
                  <span style={{ display: 'flex', gap: 8 }}>
                    <Btn theme={theme} sm tone="primary" label={`Accepter (${q.usernames.length})`} onClick={() => void handleRequest(q, true)} />
                    <Btn theme={theme} sm tone="quiet" label="Refuser" onClick={() => void handleRequest(q, false)} />
                  </span>
                </div>
              ))}
            </section>
          ) : (
            <section style={{ borderRadius: 20, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.07)', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionTitle kicker="Sur demande" title={<>Suivre <span style={{ color: '#52525B' }}>tes comptes</span></>} />
              <span style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.55 }}>Envoie les comptes à suivre (les tiens ou ceux de tes modèles). L’équipe ScaleFlow les active pour toi : ils seront relevés chaque jour à midi, visibles par toute ton équipe.</span>
              <textarea value={reqText} onChange={e => setReqText(e.target.value)} rows={4} placeholder={'Colle des @ ou liens Instagram (un par ligne)\n@moncompte\nhttps://instagram.com/monmodele'} style={TEXTAREA} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Pills value={reqRegion} onChange={setReqRegion} options={REGIONS} />
                <input value={reqNote} onChange={e => setReqNote(e.target.value)} placeholder="Note (facultatif)" maxLength={500} style={{ ...FIELD, flex: '1 1 160px' }} />
                <Btn theme={theme} tone="primary" label="Envoyer la demande" disabled={!reqText.trim()} onClick={() => void sendRequest()} />
              </div>
              {myReqs.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {myReqs.slice(0, 8).map(q => (
                    <span key={q.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 10, background: '#141416', fontSize: 12.5 }}>
                      <span data-no-tr style={{ color: '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.usernames.map(u => `@${u}`).join(', ')}</span>
                      <span style={{ flexShrink: 0, fontWeight: 750, color: q.status === 'done' ? '#4ADE80' : q.status === 'refused' ? '#F87171' : '#FBBF24' }}>{q.status === 'done' ? 'Activé' : q.status === 'refused' ? 'Refusé' : 'En attente'}</span>
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}
          <section style={{ borderRadius: 20, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.07)', padding: 18 }}>
            <SectionTitle kicker="Suivis" title={<>{admin ? 'Comptes clients' : 'Tes comptes'} <span style={{ color: '#52525B' }}>· {mine.length}</span></>} />
            {mine.length === 0 ? <div style={{ fontSize: 13, color: '#71717A' }}>{admin ? 'Aucun compte client dans cet espace.' : 'Aucun compte suivi pour l’instant — envoie une demande.'}</div> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {mine.map(w => (
                  <span key={w.id} title={w.last_error ?? (w.fetched_at ? `Relevé le ${new Date(w.fetched_at).toLocaleString('fr-FR')}` : 'Pas encore relevé')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 4px 0 10px', borderRadius: 99, background: '#161618', border: `1px solid ${w.last_error ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.09)'}`, fontSize: 12.5, color: '#EDEDEF' }}>
                    <button type="button" data-no-tr onClick={() => openAccount(w.username)} title="Voir le profil" style={{ padding: 0, border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12.5 }}>@{w.username}</button>
                    <button type="button" onClick={() => void removeWatch(w)} aria-label="Ne plus suivre" title="Ne plus suivre" style={{ display: 'flex', border: 'none', background: 'transparent', color: '#71717A', cursor: 'pointer', padding: 2 }}><Icon d="M18 6L6 18|M6 6l12 12" size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            {mine.length > 0 && <div style={{ marginTop: 14 }}><Btn theme={theme} sm label="Voir leurs Reels →" onClick={() => { setSource('private'); setTab('reels') }} /></div>}
          </section>
        </div>
      )}

    </div>
    )}
    {open && open.list[open.i] && <ReelViewer theme={theme} list={open.list} index={open.i} setIndex={setOpenIndex} onClose={closeViewer}
      onRecast={canRecast ? r => { setOpen(null); recast(r) } : undefined} isFav={c => favSet.has(c)} onFav={r => void toggleFav(r)} onProfile={openAccount} accountOf={accountOf} moreOf={moreOf} onJump={(list, i) => setOpen({ list, i })} />}
    </AccountCtx.Provider>
  )
}
