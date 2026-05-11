import { useState, useEffect, useRef } from 'react'
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
    const data     = result.data as Record<string, unknown>
    const user     = (data?.['data'] as Record<string, unknown>)?.['user'] as Record<string, unknown>
    const timeline = user?.['edge_owner_to_timeline_media'] as Record<string, unknown>
    const edges    = (timeline?.['edges'] as unknown[]) ?? []
    const videos: IgVideo[] = edges.map((e: unknown) => {
      const node = (e as Record<string, unknown>)['node'] as Record<string, unknown>
      return {
        id:        node['id'] as string,
        shortcode: node['shortcode'] as string,
        url:       `https://www.instagram.com/reel/${node['shortcode']}/`,
        video_url: (node['video_url'] as string) ?? '',
        views:     (node['video_view_count'] as number) ?? 0,
        likes:     ((node['edge_liked_by'] as Record<string, number>)?.count) ?? 0,
        comments:  ((node['edge_media_to_comment'] as Record<string, number>)?.count) ?? 0,
        thumbnail: (node['thumbnail_src'] as string) ?? '',
        timestamp: node['taken_at_timestamp']
          ? new Date((node['taken_at_timestamp'] as number) * 1000).toISOString()
          : '',
        isVideo: (node['is_video'] as boolean) ?? false,
      }
    })
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

  async function selectPhone(phone: Phone, retry = false) {
    playNav()
    setSelected(phone)
    setStats(null); setVideos([]); setLoadErr(null)
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
            username:    phone.ig_username,
            followers:   r.followers   ?? 0,
            following:   r.following   ?? 0,
            posts:       r.posts       ?? 0,
            total_views: r.total_views ?? 0,
            bio:         r.bio         ?? '',
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
    <div className="flex h-full" style={{ background: '#06040f' }}>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col anim-slide-l"
        style={{ borderRight: '1px solid rgba(139,92,246,0.12)', background: '#08050f' }}
      >
        <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(196,181,253,0.4)' }}>
            Comptes Instagram
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(196,181,253,0.3)' }}>
            {phones.length} compte{phones.length !== 1 ? 's' : ''} liés
          </p>
        </div>

        <div className="flex-1 overflow-auto py-2">
          {phones.length === 0 ? (
            <div className="px-4 py-6 text-center space-y-2">
              <p className="text-2xl">📱</p>
              <p className="text-xs" style={{ color: 'rgba(196,181,253,0.35)' }}>
                Aucun compte lié.<br/>Va dans Téléphones → colonne Instagram.
              </p>
            </div>
          ) : phones.map(phone => {
            const isSelected = selected?.id === phone.id
            const initial = (phone.ig_username ?? phone.phone_name)[0].toUpperCase()
            return (
              <button
                key={phone.id}
                onClick={() => selectPhone(phone)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all duration-150 active:scale-[0.98]"
                style={isSelected ? {
                  background: 'rgba(139,92,246,0.12)',
                  boxShadow: 'inset 3px 0 0 #8b5cf6',
                } : undefined}
              >
                {/* Gradient avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 transition-transform duration-150"
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
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[12px] font-semibold truncate"
                    style={{ color: isSelected ? '#c4b5fd' : '#d4dcf0' }}
                  >
                    @{phone.ig_username}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: 'rgba(196,181,253,0.35)' }}>
                    {phone.phone_name}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {phone.status === 'online' && (
                    <span className="relative w-1.5 h-1.5 rounded-full bg-ok">
                      <span className="absolute inset-0 rounded-full bg-ok animate-ping opacity-60" />
                    </span>
                  )}
                  {phone.ig_sessionid && (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                      style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                      🔑
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-text2">
            <div className="text-center space-y-3">
              <div className="text-5xl opacity-40">📈</div>
              <p className="font-medium" style={{ color: 'rgba(196,181,253,0.4)' }}>Sélectionne un compte</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">

            {/* ── Profile header ──────────────────────────────────────── */}
            <div
              className="rounded-2xl p-5 flex items-start gap-5 anim-page"
              style={{
                background: 'rgba(139,92,246,0.05)',
                border: '1px solid rgba(139,92,246,0.15)',
                boxShadow: '0 8px 32px -8px rgba(0,0,0,0.4)',
              }}
            >
              {/* Big gradient avatar */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                  boxShadow: '0 4px 20px rgba(124,58,237,0.5)',
                  letterSpacing: '-0.5px',
                }}
              >
                {selected.ig_username?.[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-white">@{selected.ig_username}</h2>
                  {selected.ig_sessionid && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
                      🔑 Session
                    </span>
                  )}
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={selected.status === 'online'
                      ? { background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.4)' }}
                  >
                    {selected.status}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(196,181,253,0.5)' }}>
                  {selected.phone_name} · {selected.group_name ?? 'Sans groupe'}
                </p>
                {stats?.bio && (
                  <p className="text-xs mt-2 max-w-md line-clamp-2" style={{ color: 'rgba(196,181,253,0.6)' }}>
                    {stats.bio}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {loadError && (
                  <Button variant="secondary" size="sm" onClick={() => selectPhone(selected, true)} loading={retrying}>
                    ↺ Réessayer
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => selectPhone(selected)} loading={loadingStats && !retrying}>
                  ↺ Rafraîchir
                </Button>
              </div>
            </div>

            {/* Error banner */}
            {loadError && (
              <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                <span>⚠</span><span>{loadError}</span>
              </div>
            )}

            {/* ── KPI cards ───────────────────────────────────────────── */}
            {loadingStats ? (
              <div className="grid grid-cols-4 gap-4">
                {[0,1,2,3].map(i => (
                  <div key={i} className="rounded-2xl h-24 animate-pulse"
                    style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }} />
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-4 gap-4 anim-stagger">
                {([
                  { label: 'Followers',    value: stats.followers,   gradient: 'linear-gradient(135deg,#7c3aed,#a78bfa)', glow: '#8b5cf6', icon: '👥' },
                  { label: 'Abonnements',  value: stats.following,   gradient: 'linear-gradient(135deg,#1e3a5f,#3b82f6)', glow: '#3b82f6', icon: '➡' },
                  { label: 'Posts',        value: stats.posts,       gradient: 'linear-gradient(135deg,#065f46,#34d399)', glow: '#34d399', icon: '📸' },
                  { label: 'Vues totales', value: stats.total_views, gradient: 'linear-gradient(135deg,#78350f,#f59e0b)', glow: '#f59e0b', icon: '👁'  },
                ] as const).map(({ label, value, gradient, glow, icon }) => (
                  <div
                    key={label}
                    className="rounded-2xl p-4 relative overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
                    style={{
                      background: 'rgba(8,5,20,0.8)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      boxShadow: `0 4px 24px -8px ${glow}44`,
                    }}
                  >
                    {/* Gradient top bar */}
                    <div className="absolute top-0 left-4 right-4 h-[2px] rounded-b-full" style={{ background: gradient }} />
                    <div className="flex items-center gap-1.5 mb-2 mt-1">
                      <span className="text-sm">{icon}</span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'rgba(196,181,253,0.45)' }}>{label}</span>
                    </div>
                    <p className="text-[26px] font-black leading-none">
                      <AnimatedNumber value={value} color={glow} />
                    </p>
                  </div>
                ))}
              </div>
            ) : !loadError ? (
              <div className="text-center py-8 text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>
                Impossible de charger les stats — compte privé ou Instagram indisponible.
              </div>
            ) : null}

            {/* ── Videos section ──────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>🎬</span>
                  <span>Vidéos</span>
                  {videos.length > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                      {videos.length}
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-1 p-1 rounded-xl"
                  style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }}>
                  {([
                    { key: 'recent', label: 'Récent'    },
                    { key: 'views',  label: '+ de vues' },
                    { key: 'likes',  label: '+ likes'   },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => { setSort(key); playNav() }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                      style={sort === key
                        ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 1px 8px -2px rgba(124,58,237,0.5)' }
                        : { color: 'rgba(196,181,253,0.5)' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {loadingList ? (
                /* Skeleton loader */
                <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="rounded-xl overflow-hidden animate-pulse"
                      style={{ aspectRatio: '9/16', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.08)' }}>
                      <div className="w-full h-full" style={{ background: `linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(236,72,153,0.04) 100%)` }} />
                    </div>
                  ))}
                </div>
              ) : videos.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <div className="text-5xl opacity-30">🎥</div>
                  <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    {loadError ? 'Chargement échoué.' : selected.ig_sessionid
                      ? 'Aucune vidéo trouvée.'
                      : 'Ajoute un Session ID pour charger les vidéos privées.'}
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
                            {/* Dark gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/15 to-transparent pointer-events-none" />

                            {/* Play button on hover */}
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
                              <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', backdropFilter: 'blur(4px)' }}>
                                REEL
                              </span>
                              {tier === 'high' && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded"
                                  style={{ background: 'rgba(139,92,246,0.7)', color: '#fff' }}>
                                  🔥 TOP
                                </span>
                              )}
                            </div>

                            {/* Stats overlay at bottom */}
                            <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1.5">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[22px] font-black text-white leading-none">{fmt(video.views)}</span>
                                <span className="text-[10px] text-white/50">vues</span>
                              </div>
                              <div className="h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                                <div className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${(video.views / maxV) * 100}%`, background: tier === 'high' ? '#a78bfa' : 'rgba(255,255,255,0.5)' }} />
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

      {playingVideo && (
        <IgVideoPlayerModal video={playingVideo} onClose={() => setPlayingVideo(null)} />
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
      {/* Video container — natural size, capped at viewport */}
      <div
        className="relative anim-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Close — absolute top-right corner of video */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 z-20 w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >✕</button>

        {/* Stats bar above video */}
        <div className="flex items-center gap-3 text-white text-xs mb-2 px-1">
          <span className="font-semibold" style={{ color: '#c4b5fd' }}>👁 {video.views.toLocaleString('fr-FR')}</span>
          {video.likes    > 0 && <span style={{ color: '#f9a8d4' }}>♥ {video.likes.toLocaleString('fr-FR')}</span>}
          {video.comments > 0 && <span style={{ color: 'rgba(196,181,253,0.6)' }}>✎ {video.comments.toLocaleString('fr-FR')}</span>}
          <a href={video.url} target="_blank" rel="noreferrer"
            className="ml-auto transition-colors"
            style={{ color: 'rgba(139,92,246,0.7)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(139,92,246,0.7)')}
          >
            ↗ Instagram
          </a>
        </div>

        {/* Video — let the element itself size naturally, capped at viewport */}
        <div
          className="rounded-xl overflow-hidden shadow-2xl flex items-center justify-center"
          style={{
            background: '#000',
            boxShadow: '0 0 60px rgba(139,92,246,0.2)',
            /* Portrait cap: 9/16 * 88vh ≈ 49.5vh wide, or 92vw, whichever is smaller */
            maxWidth: 'min(49.5vh, 92vw)',
            minWidth: 200,
          }}
        >
          {err ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <span className="text-4xl opacity-40">🎥</span>
              <p className="text-sm" style={{ color: '#f87171' }}>{err}</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center gap-3 p-12">
              <Spinner size="lg" />
              <p className="text-xs" style={{ color: 'rgba(196,181,253,0.5)' }}>Téléchargement…</p>
            </div>
          ) : (
            /* video height is unconstrained — browser fits it; maxHeight prevents overflow */
            <video
              src={localUrl}
              controls
              autoPlay
              style={{
                display: 'block',
                maxHeight: '88vh',
                maxWidth: '100%',
                width: 'auto',
                height: 'auto',
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
