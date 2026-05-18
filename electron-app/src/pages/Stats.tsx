import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { fetchIgStats, invalidateIgCache } from '@/lib/instagram'
import { Spinner } from '@/components/ui/Spinner'
import { Button }  from '@/components/ui/Button'
import { playNav } from '@/lib/sounds'

interface StatsProps { user: User }

interface IgVideo {
  id:        string
  shortcode: string
  url:       string
  video_url: string
  views:     number
  likes:     number
  comments:  number
  thumbnail: string
  timestamp: string
  isVideo:   boolean
}

// Procedural sound for opening a video
function playVideoOpen() {
  try {
    const ac = (window as unknown as { _sfAC?: AudioContext })._sfAC ??
      (() => { const a = new AudioContext(); (window as unknown as { _sfAC?: AudioContext })._sfAC = a; return a })()
    if (ac.state === 'suspended') ac.resume()
    const t = ac.currentTime
    const osc = ac.createOscillator(); const env = ac.createGain()
    osc.type = 'sine'; osc.frequency.setValueAtTime(523, t)
    osc.frequency.exponentialRampToValueAtTime(783, t + 0.14)
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.07, t + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    osc.connect(env); env.connect(ac.destination)
    osc.start(t); osc.stop(t + 0.35)
  } catch { /* */ }
}

async function fetchIgVideos(username: string): Promise<IgVideo[]> {
  if (!window.electronAPI?.geelarkRequest) return []
  const clean = username.replace(/^@/, '')
  const result = await window.electronAPI.geelarkRequest({
    method: 'GET',
    url: `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'X-IG-App-ID': '936619743392459',
      'Accept': '*/*',
    },
  })
  if (!result.ok) return []
  try {
    const data = result.data as Record<string, unknown>
    const user = (data?.['data'] as Record<string, unknown>)?.['user'] as Record<string, unknown>

    function edgeToVideos(edges: unknown[]): IgVideo[] {
      return edges.map((e: unknown) => {
        const node = (e as Record<string, unknown>)['node'] as Record<string, unknown>
        return {
          id:        node['id'] as string,
          shortcode: node['shortcode'] as string,
          url:       `https://www.instagram.com/reel/${node['shortcode']}/`,
          video_url: (node['video_url'] as string) ?? '',
          views:     (node['video_view_count'] as number) ?? (node['play_count'] as number) ?? 0,
          likes:     ((node['edge_liked_by'] as Record<string, number>)?.count) ?? 0,
          comments:  ((node['edge_media_to_comment'] as Record<string, number>)?.count) ?? 0,
          thumbnail: (node['thumbnail_src'] as string) ?? (node['display_url'] as string) ?? '',
          timestamp: node['taken_at_timestamp']
            ? new Date((node['taken_at_timestamp'] as number) * 1000).toISOString()
            : '',
          isVideo: (node['is_video'] as boolean) ?? false,
        }
      }).filter(v => v.isVideo)
    }

    // Merge posts grid + reels feed, deduplicate by id
    const gridEdges  = (user?.['edge_owner_to_timeline_media'] as Record<string, unknown>)?.['edges'] as unknown[] ?? []
    const reelEdges  = (user?.['edge_felix_video_timeline']    as Record<string, unknown>)?.['edges'] as unknown[] ?? []
    const allEdges   = [...reelEdges, ...gridEdges]
    const seen       = new Set<string>()
    const deduped    = allEdges.filter((e: unknown) => {
      const id = ((e as Record<string, unknown>)['node'] as Record<string, unknown>)?.['id'] as string
      if (seen.has(id)) return false
      seen.add(id); return true
    })
    const videos = edgeToVideos(deduped)

    if (window.electronAPI) {
      await Promise.all(videos.map(async v => {
        if (!v.thumbnail) return
        const r = await window.electronAPI!.fetchImage({ url: v.thumbnail })
        if (r.ok && r.dataUrl) v.thumbnail = r.dataUrl
      }))
    }
    return videos
  } catch { return [] }
}

function VideoThumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: 'rgba(139,92,246,0.08)' }}>🎬</div>
  }
  return (
    <img
      src={src} alt=""
      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
      onError={() => setFailed(true)}
    />
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString('fr-FR')
}

type SortKey = 'recent' | 'views' | 'likes'

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedNumber({ value, color }: { value: number; color: string }) {
  const [displayed, setDisplayed] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const start = 0
    const end   = value
    const dur   = 900
    const t0    = performance.now()

    function tick(now: number) {
      const progress = Math.min((now - t0) / dur, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(start + (end - start) * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value])

  return <span style={{ color }}>{fmt(displayed)}</span>
}

export function Stats({ user }: StatsProps) {
  const { currentOrg }          = useOrg()
  const conns                   = useConnections(user)
  const [phones, setPhones]     = useState<Phone[]>([])
  const [selected, setSelected] = useState<Phone | null>(null)
  const [stats, setStats]       = useState<Awaited<ReturnType<typeof fetchIgStats>> | null>(null)
  const [videos, setVideos]     = useState<IgVideo[]>([])
  const [loadingStats, setLS]   = useState(false)
  const [loadingList, setLL]    = useState(false)
  const [loadError, setLoadErr] = useState<string | null>(null)
  const [sort, setSort]         = useState<SortKey>('recent')
  const [playingVideo, setPlayingVideo] = useState<IgVideo | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [searchInput, setSearchInput]   = useState('')
  const [profilePic, setProfilePic]     = useState<string | null>(null)

  useEffect(() => {
    if (!conns.bearer) { setPhones([]); return }
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      const linked = (data ?? []).filter(p => p.ig_username)
      setPhones(linked)
      if (linked.length > 0) selectPhone(linked[0])
    })
  }, [currentOrg?.id, user.id, conns.bearer])

  async function searchByUsername(raw: string) {
    const clean = raw
      .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
      .replace(/^@/, '')
      .replace(/[/?#].*$/, '')
      .trim()
    if (!clean) return
    const virtual = { id: '__search__', ig_username: clean, phone_name: clean, ig_sessionid: null, ig_status: null, status: null, group_name: null } as unknown as Phone
    await selectPhone(virtual)
    setSearchInput('')
  }

  async function selectPhone(phone: Phone, retry = false) {
    playNav()
    setSelected(phone)
    setStats(null); setVideos([]); setLoadErr(null); setProfilePic(null)
    if (!phone.ig_username) return
    if (retry) setRetrying(true)
    else { setLS(true); setLL(true) }

    try {
      if (phone.ig_sessionid && window.electronAPI?.fetchInstagramBySession) {
        const r = await window.electronAPI.fetchInstagramBySession({
          username: phone.ig_username,
          sessionid: phone.ig_sessionid,
        })
        if (r.ok) {
          setStats({
            username:        phone.ig_username,
            followers:       r.followers   ?? 0,
            following:       r.following   ?? 0,
            posts:           r.posts       ?? 0,
            total_views:     r.total_views ?? 0,
            bio:             r.bio         ?? '',
            profile_pic_url: (r as Record<string, unknown>)['profile_pic_url'] as string ?? '',
          })
          setLS(false)
          setVideos((r.videos ?? []).map(v => ({
            id:        v.id,
            shortcode: v.shortcode,
            url:       `https://www.instagram.com/reel/${v.shortcode}/`,
            video_url: v.video_url ?? '',
            views:     v.views,
            likes:     v.likes,
            comments:  v.comments,
            thumbnail: v.thumbnail,
            timestamp: v.timestamp,
            isVideo:   true,
          })))
          setLL(false)
          setRetrying(false)
          return
        }
        console.warn('[Stats] Session fetch failed:', r.error)
      }

      if (retry) invalidateIgCache(phone.ig_username)
      const s = await fetchIgStats(phone.ig_username, { force: retry })
      setStats(s); setLS(false)
      if (s?.profile_pic_url && window.electronAPI?.fetchImage) {
        window.electronAPI.fetchImage({ url: s.profile_pic_url })
          .then(r => { if (r.ok && r.dataUrl) setProfilePic(r.dataUrl) })
          .catch(() => {})
      }
      const v = await fetchIgVideos(phone.ig_username)
      setVideos(v); setLL(false)
      if (!s && v.length === 0)
        setLoadErr('Instagram indisponible ou compte privé. Réessaie dans quelques secondes.')
    } catch {
      setLoadErr('Erreur lors du chargement. Clique sur Réessayer.')
      setLS(false); setLL(false)
    }
    setRetrying(false)
  }

  const sorted = [...videos].sort((a, b) => {
    if (sort === 'recent') return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    if (sort === 'views')  return b.views - a.views
    if (sort === 'likes')  return b.likes - a.likes
    return 0
  })

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div>
          <h1 className="text-[28px] font-black text-white leading-none">Statistiques Instagram</h1>
          <p className="text-[13px] text-text2 mt-0.5">
            {phones.length} compte{phones.length !== 1 ? 's' : ''} liés · Vues, followers, vidéos
          </p>
        </div>
        {selected && (
          <div className="flex gap-2">
            {loadError && (
              <Button variant="secondary" size="sm" onClick={() => selectPhone(selected, true)} loading={retrying}>
                ↺ Réessayer
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => selectPhone(selected)} loading={loadingStats && !retrying}>
              ↺ Rafraîchir
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex">

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside
          className="w-64 flex-shrink-0 flex flex-col overflow-hidden"
          style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Search / title */}
          <div
            className="px-4 py-3 space-y-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[13px] font-bold text-white">Comptes Instagram</p>
            <form onSubmit={e => { e.preventDefault(); searchByUsername(searchInput) }}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="@username ou lien…"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-[12px] pr-8 placeholder:text-text2 focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                />
                <button
                  type="submit"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text2 hover:text-white transition-colors text-[13px]"
                >→</button>
              </div>
            </form>
          </div>

          {/* Account list */}
          <div className="flex-1 overflow-y-auto py-1">
            {phones.length === 0 ? (
              <div className="px-5 py-8 text-center space-y-2">
                <p className="text-3xl">📱</p>
                <p className="text-[13px] text-text2">
                  Aucun compte lié.<br />Va dans Téléphones → colonne Instagram.
                </p>
              </div>
            ) : phones.map(phone => {
              const isSelected = selected?.id === phone.id
              const initial = (phone.ig_username ?? phone.phone_name)[0].toUpperCase()
              return (
                <button
                  key={phone.id}
                  onClick={() => selectPhone(phone)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all duration-150"
                  style={isSelected ? {
                    background: 'rgba(139,92,246,0.1)',
                    boxShadow: 'inset 3px 0 0 #8b5cf6',
                  } : undefined}
                >
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white transition-transform duration-150"
                    style={{
                      background: isSelected
                        ? 'linear-gradient(135deg, #7c3aed, #ec4899)'
                        : 'rgba(139,92,246,0.18)',
                      color: isSelected ? '#fff' : '#a78bfa',
                      transform: isSelected ? 'scale(1.08)' : undefined,
                      boxShadow: isSelected ? '0 2px 12px rgba(124,58,237,0.5)' : undefined,
                    }}
                  >
                    {initial}
                  </div>

                  {/* Labels */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold truncate" style={{ color: isSelected ? '#c4b5fd' : '#d4dcf0' }}>
                      @{phone.ig_username}
                    </p>
                    <p className="text-[11px] text-text2 truncate mt-0.5">{phone.phone_name}</p>
                  </div>

                  {/* Online dot only — no session badge */}
                  {phone.status === 'online' && (
                    <span className="relative flex-shrink-0 w-1.5 h-1.5 rounded-full bg-ok">
                      <span className="absolute inset-0 rounded-full bg-ok animate-ping opacity-60" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </aside>

        {/* ── Main panel ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 pb-10">
          {!selected ? (

            /* Empty state — no account selected */
            <div className="flex items-center justify-center h-full">
              <div
                className="rounded-2xl px-14 py-12 text-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div
                  className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)', boxShadow: '0 4px 24px rgba(124,58,237,0.35)' }}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <p className="text-[15px] font-bold text-white">Recherche un compte</p>
                <p className="text-[13px] text-text2 mt-1.5 max-w-[220px] mx-auto leading-relaxed">
                  Sélectionne un compte dans la liste ou colle un @username dans la barre de recherche.
                </p>
              </div>
            </div>

          ) : (
            <div className="pt-6 space-y-6">

              {/* ── Instagram-style profile header ──────────────────────── */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                {/* Gradient banner */}
                <div
                  className="h-20 w-full"
                  style={{ background: 'linear-gradient(135deg, #3b0764 0%, #6d28d9 45%, #be185d 100%)' }}
                />

                {/* Avatar + username row */}
                <div className="px-6 pb-5">
                  <div className="flex items-end gap-4 -mt-11">
                    {/* Circular avatar overlapping banner */}
                    <div
                      className="w-[88px] h-[88px] rounded-full flex-shrink-0 overflow-hidden"
                      style={{ boxShadow: '0 0 0 4px #111, 0 4px 24px rgba(124,58,237,0.5)' }}
                    >
                      {profilePic ? (
                        <img src={profilePic} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-3xl font-black text-white"
                          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)' }}
                        >
                          {selected.ig_username?.[0].toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Status badge — aligned to bottom of avatar row */}
                    <div className="mb-2 ml-auto flex-shrink-0">
                      {selected.status === 'online' && (
                        <span
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}
                        >
                          En ligne
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Username */}
                  <h2 className="text-[22px] font-black text-white mt-3 leading-none">
                    @{selected.ig_username}
                  </h2>

                  {/* Device / group */}
                  {selected.id !== '__search__' && (
                    <p className="text-[12px] text-text2 mt-1">
                      {selected.phone_name}{selected.group_name ? ` · ${selected.group_name}` : ''}
                    </p>
                  )}

                  {/* Bio */}
                  {stats?.bio && (
                    <p className="text-[13px] text-text2 mt-2.5 max-w-lg line-clamp-2 leading-relaxed">
                      {stats.bio}
                    </p>
                  )}

                  {/* Inline stats: followers · following · posts */}
                  {loadingStats ? (
                    <div className="flex items-center gap-6 mt-4">
                      {[80, 70, 50].map((w, i) => (
                        <div key={i} className="animate-pulse rounded-md h-8" style={{ width: w, background: 'rgba(139,92,246,0.1)' }} />
                      ))}
                    </div>
                  ) : stats ? (
                    <div className="flex items-center gap-6 mt-4">
                      {([
                        { label: 'followers',    value: stats.followers },
                        { label: 'abonnements',  value: stats.following },
                        { label: 'posts',        value: stats.posts     },
                      ] as const).map(({ label, value }, i) => (
                        <div key={label} className="flex items-baseline gap-1.5">
                          {i > 0 && <span className="text-text2 mr-4">·</span>}
                          <span className="text-[18px] font-black text-white">{fmt(value)}</span>
                          <span className="text-[12px] text-text2">{label}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Error banner */}
              {loadError && (
                <div
                  className="px-5 py-3.5 rounded-xl flex items-center gap-2"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}
                >
                  <span>⚠</span>
                  <span className="text-[13px]">{loadError}</span>
                </div>
              )}

              {/* ── Highlight card: total views ──────────────────────────── */}
              {loadingStats ? (
                <div
                  className="rounded-2xl h-24 animate-pulse"
                  style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }}
                />
              ) : stats ? (
                <div
                  className="rounded-2xl p-5 relative overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    boxShadow: '0 4px 24px -8px rgba(245,158,11,0.25)',
                  }}
                >
                  <div
                    className="absolute top-0 left-4 right-4 h-[2px] rounded-b-full"
                    style={{ background: 'linear-gradient(90deg,#78350f,#f59e0b)' }}
                  />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-text2 mb-1 mt-0.5">
                    Vues des 12 derniers posts
                  </p>
                  <p className="text-[32px] font-black leading-none">
                    <AnimatedNumber value={stats.total_views} color="#f59e0b" />
                  </p>
                </div>
              ) : !loadError ? (
                <div
                  className="rounded-2xl p-8 text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <p className="text-[13px] text-text2">Impossible de charger les stats — compte privé ou Instagram indisponible.</p>
                </div>
              ) : null}

              {/* ── Videos section ──────────────────────────────────────── */}
              <div>
                {/* Section header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-bold text-white">Vidéos</h3>
                    {videos.length > 0 && (
                      <span
                        className="text-[12px] font-bold px-2.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}
                      >
                        {videos.length}
                      </span>
                    )}
                  </div>

                  {/* Sort tabs */}
                  <div
                    className="flex items-center gap-1 p-1 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    {([
                      { key: 'recent', label: 'Récent'    },
                      { key: 'views',  label: '+ de vues' },
                      { key: 'likes',  label: '+ likes'   },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => { setSort(key); playNav() }}
                        className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
                        style={sort === key
                          ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                          : { color: 'rgba(196,181,253,0.5)' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video grid */}
                {loadingList ? (
                  <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="rounded-xl overflow-hidden animate-pulse"
                        style={{ aspectRatio: '9/16', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.08)' }}
                      >
                        <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(236,72,153,0.04) 100%)' }} />
                      </div>
                    ))}
                  </div>
                ) : videos.length === 0 ? (
                  <div
                    className="rounded-2xl p-10 text-center"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div className="text-5xl mb-4">🎥</div>
                    <p className="text-base font-bold text-white">Aucune vidéo</p>
                    <p className="text-[13px] text-text2 mt-1">
                      {loadError ? 'Chargement échoué.' : 'Aucune vidéo trouvée.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {(() => {
                      const maxV = Math.max(...sorted.map(v => v.views), 1)
                      return sorted.map((video, idx) => {
                        const tier = video.views >= maxV * 0.7 ? 'high' : video.views >= maxV * 0.3 ? 'mid' : 'low'
                        const tierGrad =
                          tier === 'high' ? 'linear-gradient(135deg,#6d28d9,#db2777)' :
                          tier === 'mid'  ? 'linear-gradient(135deg,#1e40af,#7c3aed)' :
                                            'linear-gradient(135deg,#0f172a,#1e1b4b)'
                        return (
                          <button
                            key={video.id}
                            type="button"
                            onClick={() => { setPlayingVideo(video); playVideoOpen() }}
                            className="text-left rounded-xl overflow-hidden group transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02]"
                            style={{
                              border: tier === 'high'
                                ? '1px solid rgba(139,92,246,0.4)'
                                : '1px solid rgba(139,92,246,0.1)',
                              boxShadow: tier === 'high'
                                ? '0 4px 24px -8px rgba(124,58,237,0.4)'
                                : '0 2px 12px -6px rgba(0,0,0,0.5)',
                              animationDelay: `${Math.min(idx * 0.04, 0.4)}s`,
                            }}
                          >
                            <div className="relative" style={{ aspectRatio: '9/16', background: tierGrad }}>
                              {video.thumbnail && (
                                <div className="absolute inset-0">
                                  <VideoThumbnail src={video.thumbnail} />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/15 to-transparent pointer-events-none" />

                              {/* Play button overlay */}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                                <div
                                  className="w-14 h-14 rounded-full flex items-center justify-center"
                                  style={{ background: 'rgba(139,92,246,0.85)', boxShadow: '0 0 24px rgba(139,92,246,0.6)', backdropFilter: 'blur(8px)' }}
                                >
                                  <span className="text-white text-xl ml-1">▶</span>
                                </div>
                              </div>

                              {/* Top badges */}
                              <div className="absolute top-2 left-2 right-2 flex items-start justify-between pointer-events-none">
                                <span
                                  className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                                  style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', backdropFilter: 'blur(4px)' }}
                                >
                                  REEL
                                </span>
                                {tier === 'high' && (
                                  <span
                                    className="text-[8px] font-black px-1.5 py-0.5 rounded"
                                    style={{ background: 'rgba(139,92,246,0.7)', color: '#fff' }}
                                  >
                                    🔥 TOP
                                  </span>
                                )}
                              </div>

                              {/* Bottom stats */}
                              <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1.5">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-[22px] font-black text-white leading-none">{fmt(video.views)}</span>
                                  <span className="text-[10px] text-white/50">vues</span>
                                </div>
                                <div className="h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                                  <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{ width: `${(video.views / maxV) * 100}%`, background: tier === 'high' ? '#a78bfa' : 'rgba(255,255,255,0.5)' }}
                                  />
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-white/60 font-medium">
                                  {video.likes    > 0 && <span>♥ {fmt(video.likes)}</span>}
                                  {video.comments > 0 && <span>✎ {fmt(video.comments)}</span>}
                                  {video.timestamp && (
                                    <span className="ml-auto">
                                      {new Date(video.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {playingVideo && createPortal(
        <IgVideoPlayerModal video={playingVideo} onClose={() => setPlayingVideo(null)} />,
        document.body
      )}
    </div>
  )
}

// ── IG video player modal ────────────────────────────────────────────────────
function IgVideoPlayerModal({ video, onClose }: { video: IgVideo; onClose: () => void }) {
  const [localPath, setLocalPath] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr(null)
    if (!video.video_url) { setErr('Aucune URL vidéo disponible.'); setLoading(false); return }
    if (!window.electronAPI?.fetchIgVideo) { setErr('IPC indisponible.'); setLoading(false); return }
    window.electronAPI.fetchIgVideo({ url: video.video_url }).then(r => {
      if (cancelled) return
      setLoading(false)
      if (r.ok && r.path) setLocalPath(r.path)
      else setErr(r.error ?? 'Téléchargement échoué')
    })
    return () => { cancelled = true }
  }, [video.video_url])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const localUrl = (() => {
    if (!localPath) return ''
    let n = localPath.replace(/\\/g, '/')
    if (!n.startsWith('/')) n = '/' + n
    return 'localvideo://' + n
  })()

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center anim-page"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)' }}
      onClick={onClose}
    >
      <div className="relative anim-scale-in" onClick={e => e.stopPropagation()}>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 z-20 w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          ✕
        </button>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs mb-2 px-1">
          <span className="font-semibold" style={{ color: '#c4b5fd' }}>
            {video.views.toLocaleString('fr-FR')} vues
          </span>
          {video.likes    > 0 && <span style={{ color: '#f9a8d4' }}>♥ {video.likes.toLocaleString('fr-FR')}</span>}
          {video.comments > 0 && <span style={{ color: 'rgba(196,181,253,0.6)' }}>✎ {video.comments.toLocaleString('fr-FR')}</span>}
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-[11px] font-semibold transition-colors"
            style={{ color: '#a78bfa' }}
          >
            ↗ Voir sur Instagram
          </a>
        </div>

        {/* Video shell */}
        <div
          className="rounded-2xl overflow-hidden flex items-center justify-center"
          style={{
            background: '#000',
            boxShadow: '0 0 60px rgba(139,92,246,0.2), 0 0 0 1px rgba(139,92,246,0.15)',
            maxWidth: 'min(49.5vh, 92vw)',
            minWidth: 200,
          }}
        >
          {err ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}
              >
                <span className="text-2xl">🎥</span>
              </div>
              <p className="text-[13px]" style={{ color: '#f87171' }}>{err}</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center gap-3 p-14">
              <Spinner size="lg" />
              <p className="text-[13px] text-text2">Chargement…</p>
            </div>
          ) : (
            <video
              src={localUrl}
              controls
              autoPlay
              style={{ display: 'block', maxHeight: '88vh', maxWidth: '100%', width: 'auto', height: 'auto' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
