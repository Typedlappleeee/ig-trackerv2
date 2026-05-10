import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { fetchIgStats, invalidateIgCache } from '@/lib/instagram'
import { Spinner } from '@/components/ui/Spinner'
import { Button }  from '@/components/ui/Button'

interface StatsProps { user: User }

interface IgVideo {
  id:        string
  shortcode: string
  url:       string
  video_url: string         // Direct CDN URL to the .mp4 (only set via session API)
  views:     number
  likes:     number
  comments:  number
  thumbnail: string
  timestamp: string
  isVideo:   boolean
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
    // Pre-fetch thumbnails as data URIs through main process (bypasses CDN Referer/CORS issues)
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

// Thumbnail is either a pre-fetched data URI (from main process) or a CDN URL.
// Both render fine as <img src>; the data URI case never needs a network request.
function VideoThumbnail({ src }: { src: string; sessionid?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <div className="w-full h-full flex items-center justify-center text-3xl bg-surface2">🎬</div>
  }
  return (
    <img
      src={src}
      alt=""
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      onError={() => setFailed(true)}
    />
  )
}

type SortKey = 'recent' | 'oldest' | 'views' | 'likes'

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
    setSelected(phone)
    setStats(null); setVideos([]); setLoadErr(null)
    if (!phone.ig_username) return
    if (retry) setRetrying(true)
    else { setLS(true); setLL(true) }

    try {
      // Session path: private API — proper thumbnails, no rate limit
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

      // Fallback: public API
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
    if (sort === 'oldest') return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    if (sort === 'views')  return b.views - a.views
    if (sort === 'likes')  return b.likes - a.likes
    return 0
  })

  const sessionid = selected?.ig_sessionid ?? undefined

  return (
    <div className="flex h-full min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border bg-surface anim-slide-l">
        <div className="px-4 py-4 border-b border-border">
          <p className="text-xs font-semibold text-text2 uppercase tracking-wider">Comptes liés</p>
          <p className="text-xs text-text2 mt-0.5">{phones.length} compte{phones.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex-1 overflow-auto py-2 anim-stagger">
          {phones.length === 0 ? (
            <p className="px-4 py-4 text-xs text-text2">
              Aucun compte lié.<br />Va dans Téléphones → colonne Instagram.
            </p>
          ) : phones.map(phone => {
            const isSelected = selected?.id === phone.id
            return (
              <button
                key={phone.id}
                onClick={() => selectPhone(phone)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all rounded-lg mx-1 my-0.5 ${
                  isSelected
                    ? 'bg-accent/12 border border-accent/25'
                    : 'hover:bg-surface2 border border-transparent'
                }`}
                style={{ width: 'calc(100% - 8px)' }}
              >
                <div className={`w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0 transition-transform ${isSelected ? 'scale-110' : ''}`}>
                  {phone.ig_username?.[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium truncate ${isSelected ? 'text-accent font-bold' : 'text-text'}`}>@{phone.ig_username}</p>
                  <p className="text-[10px] text-text2 truncate">{phone.phone_name}</p>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  {phone.status === 'online' && (
                    <span className="relative w-1.5 h-1.5 rounded-full bg-ok flex-shrink-0">
                      <span className="absolute inset-0 rounded-full bg-ok animate-ping opacity-60" />
                    </span>
                  )}
                  {phone.ig_sessionid && (
                    <span className="text-[10px] text-accent">🔑</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main panel */}
      <div className="flex-1 overflow-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-text2">
            <div className="text-center space-y-3">
              <p className="text-4xl">📈</p>
              <p className="font-medium">Sélectionne un compte</p>
            </div>
          </div>
        ) : (
          <div className="p-8 space-y-6">
            {/* Profile header */}
            <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-5 anim-page card-lift">
              <div className="w-14 h-14 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xl font-bold flex-shrink-0">
                {selected.ig_username?.[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl font-bold text-text">@{selected.ig_username}</h2>
                  {selected.ig_sessionid && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-ok/20 text-ok">🔑 Session active</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    selected.status === 'online' ? 'bg-ok/20 text-ok' : 'bg-text2/20 text-text2'
                  }`}>{selected.status}</span>
                </div>
                <p className="text-sm text-text2 mt-0.5">{selected.phone_name} · {selected.group_name ?? 'Sans groupe'}</p>
                {stats?.bio && <p className="text-xs text-text2 mt-1.5 max-w-md line-clamp-2">{stats.bio}</p>}
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
              <div className="px-4 py-3 rounded-lg bg-warn/10 border border-warn/20 text-warn text-sm">
                ⚠ {loadError}
              </div>
            )}

            {/* KPI cards */}
            {loadingStats ? (
              <div className="flex justify-center py-8"><Spinner size="lg" /></div>
            ) : stats ? (
              <div className="grid grid-cols-4 gap-4 anim-stagger">
                {([
                  { label: 'FOLLOWERS',  value: stats.followers,   color: '#4f9eff', icon: '👥' },
                  { label: 'FOLLOWING',  value: stats.following,   color: '#5a6882', icon: '➡' },
                  { label: 'POSTS',      value: stats.posts,       color: '#00ccaa', icon: '📸' },
                  { label: 'VUES TOTAL', value: stats.total_views, color: '#ffaa2a', icon: '👁' },
                ] as const).map(({ label, value, color, icon }) => (
                  <div key={label} className="bg-card border border-border rounded-xl p-4 border-t-2 card-lift" style={{ borderTopColor: color }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span>{icon}</span>
                      <span className="text-xs font-semibold text-text2">{label}</span>
                    </div>
                    <p className="text-2xl font-bold anim-number-pop" style={{ color }} key={value}>{value.toLocaleString('fr-FR')}</p>
                  </div>
                ))}
              </div>
            ) : !loadError ? (
              <div className="text-center py-8 text-text2 text-sm">
                Impossible de charger les stats — compte privé ou Instagram indisponible.
              </div>
            ) : null}

            {/* Videos */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text">
                  Vidéos {videos.length > 0 && `(${videos.length})`}
                </h3>
                <div className="flex items-center gap-1 bg-surface2 p-1 rounded-lg">
                  {([
                    { key: 'recent', label: 'Récent'     },
                    { key: 'views',  label: '+ de vues'  },
                    { key: 'likes',  label: '+ de likes' },
                  ] as const).map(({ key, label }) => (
                    <button key={key} onClick={() => setSort(key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        sort === key
                          ? 'bg-accent text-white shadow-[0_1px_6px_-1px_rgba(79,142,247,0.5)]'
                          : 'text-text2 hover:text-text hover:bg-surface3/50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {loadingList ? (
                <div className="flex justify-center py-8"><Spinner size="lg" /></div>
              ) : videos.length === 0 ? (
                <div className="text-center py-12 text-text2 space-y-2">
                  <p className="text-3xl">🎥</p>
                  <p className="text-sm">
                    {loadError ? 'Chargement échoué.' : selected.ig_sessionid
                      ? 'Aucune vidéo trouvée.'
                      : 'Aucune vidéo — ajoute un Session ID pour charger les vidéos privées.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {(() => {
                    const maxV = Math.max(...sorted.map(v => v.views), 1)
                    return sorted.map((video, idx) => {
                      const tier = video.views >= maxV * 0.7 ? 'high' : video.views >= maxV * 0.3 ? 'mid' : 'low'
                      const tierGradient =
                        tier === 'high' ? 'linear-gradient(135deg, #a56ef5 0%, #f03d55 100%)' :
                        tier === 'mid'  ? 'linear-gradient(135deg, #4f8ef7 0%, #a56ef5 100%)' :
                                          'linear-gradient(135deg, #2a3050 0%, #1a2035 100%)'
                      return (
                        <button
                          key={video.id}
                          type="button"
                          onClick={() => setPlayingVideo(video)}
                          className="text-left bg-card border border-border rounded-xl overflow-hidden hover:border-accent/60 transition-all group anim-page card-lift"
                          style={{ animationDelay: `${Math.min(idx * 0.04, 0.4)}s` }}
                        >
                          {/* Portrait thumbnail — 9:16 like the bank */}
                          <div
                            className="relative aspect-[9/16] overflow-hidden"
                            style={{ background: tierGradient }}
                          >
                            {video.thumbnail && (
                              <div className="absolute inset-0">
                                <VideoThumbnail src={video.thumbnail} sessionid={sessionid} />
                              </div>
                            )}
                            {/* Dark gradient overlay at bottom */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent pointer-events-none" />

                            {/* Play button */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <div className="w-12 h-12 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center">
                                <span className="text-white text-xl ml-1">▶</span>
                              </div>
                            </div>

                            {/* REEL chip */}
                            <span className="absolute top-2 left-2 bg-black/60 text-white text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">REEL</span>

                            {/* Tier dot */}
                            <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                              tier === 'high' ? 'bg-[#a56ef5]' : tier === 'mid' ? 'bg-accent' : 'bg-text2/40'
                            }`} />

                            {/* Stats overlay at bottom */}
                            <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1.5">
                              {/* Views — big */}
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-bold text-white leading-none">{video.views.toLocaleString('fr-FR')}</span>
                                <span className="text-[10px] text-white/60">vues</span>
                              </div>
                              {/* Progress bar */}
                              <div className="h-[2px] bg-white/20 rounded-full overflow-hidden">
                                <div className="h-full bg-white/70 rounded-full" style={{ width: `${(video.views / maxV) * 100}%` }} />
                              </div>
                              {/* Likes / comments / date */}
                              <div className="flex items-center gap-2.5 text-[10px] text-white/70 font-medium">
                                {video.likes    > 0 && <span>♥ {video.likes.toLocaleString('fr-FR')}</span>}
                                {video.comments > 0 && <span>✎ {video.comments.toLocaleString('fr-FR')}</span>}
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

      {playingVideo && <IgVideoPlayerModal video={playingVideo} onClose={() => setPlayingVideo(null)} />}
    </div>
  )
}

// ── IG video player modal ────────────────────────────────────────────────────
// Downloads the IG CDN video via IPC (with Referer headers) to a temp file,
// then plays it via the localvideo:// protocol.
function IgVideoPlayerModal({ video, onClose }: { video: IgVideo; onClose: () => void }) {
  const [localPath, setLocalPath] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!video.video_url) { setErr('Aucune URL vidéo disponible.'); return }
    if (!window.electronAPI?.fetchIgVideo) { setErr('IPC indisponible.'); return }
    window.electronAPI.fetchIgVideo({ url: video.video_url }).then(r => {
      if (cancelled) return
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
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md anim-page"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-3 anim-scale-in"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh', maxWidth: '90vw' }}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/60 hover:text-white text-2xl leading-none"
        >✕</button>

        <div className="flex items-center gap-3 text-white text-xs">
          <span>{video.views.toLocaleString('fr-FR')} vues</span>
          {video.likes    > 0 && <span>♥ {video.likes.toLocaleString('fr-FR')}</span>}
          {video.comments > 0 && <span>✎ {video.comments.toLocaleString('fr-FR')}</span>}
          <a href={video.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">↗ Voir sur Instagram</a>
        </div>

        <div
          className="rounded-xl shadow-2xl bg-black flex items-center justify-center"
          style={{ height: '80vh', aspectRatio: '9/16', maxWidth: '80vw' }}
        >
          {err ? (
            <p className="text-danger text-sm px-4 text-center">{err}</p>
          ) : !localUrl ? (
            <p className="text-text2 text-sm">📥 Téléchargement de la vidéo…</p>
          ) : (
            <video
              src={localUrl}
              controls autoPlay
              className="rounded-xl"
              style={{ height: '100%', maxWidth: '100%' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
