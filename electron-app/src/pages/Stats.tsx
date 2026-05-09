import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { fetchIgStats } from '@/lib/instagram'
import { Spinner } from '@/components/ui/Spinner'
import { Button }  from '@/components/ui/Button'

interface StatsProps { user: User }

interface IgVideo {
  id:         string
  shortcode:  string
  url:        string
  views:      number
  likes:      number
  comments:   number
  thumbnail:  string
  timestamp:  string
  isVideo:    boolean
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
      'Referer': `https://www.instagram.com/${clean}/`,
      'Origin': 'https://www.instagram.com',
    },
  })
  if (!result.ok) return []
  try {
    const data = result.data as Record<string, unknown>
    const user = (data?.['data'] as Record<string, unknown>)?.['user'] as Record<string, unknown>
    const timeline = user?.['edge_owner_to_timeline_media'] as Record<string, unknown>
    const edges = (timeline?.['edges'] as unknown[]) ?? []
    return edges.map((e: unknown) => {
      const node = (e as Record<string, unknown>)['node'] as Record<string, unknown>
      return {
        id:        node['id'] as string,
        shortcode: node['shortcode'] as string,
        url:       `https://www.instagram.com/reel/${node['shortcode']}/`,
        views:     (node['video_view_count'] as number) ?? 0,
        likes:     ((node['edge_liked_by'] as Record<string, number>)?.count) ?? 0,
        comments:  ((node['edge_media_to_comment'] as Record<string, number>)?.count) ?? 0,
        thumbnail: (node['thumbnail_src'] as string) ?? '',
        timestamp: node['taken_at_timestamp'] ? new Date((node['taken_at_timestamp'] as number) * 1000).toISOString() : '',
        isVideo:   (node['is_video'] as boolean) ?? false,
      }
    })
  } catch { return [] }
}

type SortKey = 'recent' | 'oldest' | 'views' | 'likes'

export function Stats({ user }: StatsProps) {
  const [phones, setPhones]       = useState<Phone[]>([])
  const [selected, setSelected]   = useState<Phone | null>(null)
  const [stats, setStats]         = useState<Awaited<ReturnType<typeof fetchIgStats>> | null>(null)
  const [videos, setVideos]       = useState<IgVideo[]>([])
  const [loadingStats, setLS]     = useState(false)
  const [loadingList, setLL]      = useState(false)
  const [sort, setSort]           = useState<SortKey>('recent')

  useEffect(() => {
    supabase.from('phones').select('*').eq('user_id', user.id).order('phone_name')
      .then(({ data }) => {
        const linked = (data ?? []).filter(p => p.ig_username)
        setPhones(linked)
        if (linked.length > 0 && !selected) selectPhone(linked[0])
      })
  }, [])

  async function selectPhone(phone: Phone) {
    setSelected(phone)
    setStats(null); setVideos([])
    if (!phone.ig_username) return
    setLS(true); setLL(true)
    const [s, v] = await Promise.all([
      fetchIgStats(phone.ig_username),
      fetchIgVideos(phone.ig_username),
    ])
    setStats(s); setLS(false)
    setVideos(v); setLL(false)
  }

  async function refreshSelected() {
    if (selected) selectPhone(selected)
  }

  const sorted = [...videos].sort((a, b) => {
    if (sort === 'recent')  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    if (sort === 'oldest')  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    if (sort === 'views')   return b.views - a.views
    if (sort === 'likes')   return b.likes - a.likes
    return 0
  })

  return (
    <div className="flex h-full min-h-screen">
      {/* Left sidebar: account list */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border bg-surface">
        <div className="px-4 py-4 border-b border-border">
          <p className="text-xs font-semibold text-text2 uppercase tracking-wider">Comptes liés</p>
          <p className="text-xs text-text2 mt-0.5">{phones.length} compte{phones.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex-1 overflow-auto py-2">
          {phones.length === 0 ? (
            <p className="px-4 py-4 text-xs text-text2">
              Aucun compte lié.<br />Va dans Téléphones → colonne Instagram.
            </p>
          ) : (
            phones.map(phone => (
              <button
                key={phone.id}
                onClick={() => selectPhone(phone)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  selected?.id === phone.id ? 'bg-surface2 border-l-2 border-accent pl-[10px]' : 'hover:bg-surface2'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {phone.ig_username?.[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text truncate">@{phone.ig_username}</p>
                  <p className="text-[10px] text-text2 truncate">{phone.phone_name}</p>
                </div>
                {phone.status === 'online' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-ok flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Right: profile + stats */}
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
            <div className="bg-card border border-border rounded-xl p-6 flex items-start gap-6">
              <div className="w-16 h-16 rounded-full bg-accent/20 text-accent flex items-center justify-center text-2xl font-bold flex-shrink-0">
                {selected.ig_username?.[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-text">@{selected.ig_username}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    selected.status === 'online' ? 'bg-ok/20 text-ok' : 'bg-text2/20 text-text2'
                  }`}>
                    {selected.status}
                  </span>
                </div>
                <p className="text-sm text-text2 mt-1">{selected.phone_name} · {selected.group_name ?? 'Sans groupe'}</p>
                {stats?.bio && <p className="text-xs text-text2 mt-2 max-w-md">{stats.bio}</p>}
              </div>
              <Button variant="secondary" size="sm" onClick={refreshSelected} loading={loadingStats}>
                ↺ Rafraîchir
              </Button>
            </div>

            {/* KPI cards */}
            {loadingStats ? (
              <div className="flex justify-center py-8"><Spinner size="lg" /></div>
            ) : stats ? (
              <div className="grid grid-cols-4 gap-4">
                {([
                  { label: 'FOLLOWERS',  value: stats.followers,   color: '#4f9eff', icon: '👥' },
                  { label: 'FOLLOWING',  value: stats.following,   color: '#5a6882', icon: '➡' },
                  { label: 'POSTS',      value: stats.posts,       color: '#00ccaa', icon: '📸' },
                  { label: 'VUES TOTAL', value: stats.total_views, color: '#ffaa2a', icon: '👁' },
                ] as const).map(({ label, value, color, icon }) => (
                  <div key={label} className="bg-card border border-border rounded-xl p-4 border-t-2" style={{ borderTopColor: color }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span>{icon}</span>
                      <span className="text-xs font-semibold text-text2">{label}</span>
                    </div>
                    <p className="text-2xl font-bold" style={{ color }}>
                      {value.toLocaleString('fr-FR')}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-text2 text-sm">
                Impossible de charger les stats — compte privé ou Instagram indisponible.
              </div>
            )}

            {/* Videos section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text">
                  Vidéos récentes {videos.length > 0 && `(${videos.length})`}
                </h3>
                <div className="flex items-center gap-1">
                  {([
                    { key: 'recent', label: 'Récent' },
                    { key: 'views',  label: '+ de vues' },
                    { key: 'likes',  label: '+ de likes' },
                  ] as const).map(({ key, label }) => (
                    <button key={key} onClick={() => setSort(key)}
                      className={`px-3 py-1.5 rounded text-xs transition-all ${
                        sort === key ? 'bg-accent/20 text-accent' : 'text-text2 hover:text-text'
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
                  <p className="text-sm">Aucune vidéo trouvée</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {sorted.map(video => (
                    <a
                      key={video.id}
                      href={video.url}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-card border border-border rounded-xl overflow-hidden hover:border-accent/40 transition-colors group"
                    >
                      {/* Thumbnail */}
                      <div className="aspect-[9/16] bg-surface2 relative overflow-hidden">
                        {video.thumbnail ? (
                          <img src={video.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                        )}
                        {video.isVideo && video.views > 0 && (
                          <div className="absolute bottom-2 left-2 bg-black/70 rounded px-1.5 py-0.5 text-xs text-white flex items-center gap-1">
                            <span>👁</span>
                            <span>{video.views.toLocaleString('fr-FR')}</span>
                          </div>
                        )}
                      </div>
                      {/* Stats row */}
                      <div className="px-3 py-2 flex items-center gap-3 text-xs text-text2">
                        {video.likes > 0 && (
                          <span className="flex items-center gap-1">❤ {video.likes.toLocaleString('fr-FR')}</span>
                        )}
                        {video.comments > 0 && (
                          <span className="flex items-center gap-1">💬 {video.comments.toLocaleString('fr-FR')}</span>
                        )}
                        {video.timestamp && (
                          <span className="ml-auto">
                            {new Date(video.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
